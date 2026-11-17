const { createTranscript, getTranscriptDownloadUrl, downloadTranscript, getCalendarEventByBotId, getBot, listCalendarEvents, updateBotJoinAt } = require("./recallClient");
const { formatTranscript } = require("./transcriptFormatter");
const { summarizeTranscript } = require("./claudeClient");
const { postSummary } = require("./slackClient");
const { resolveChannel, resolveTitleFromSchedule, scheduleSlotIsAmbiguous, resolveFollowUp, resolvePipeline, createsTasks } = require("./channelMap");
const { parseActionItems } = require("./actionItems");
const { createTask, isConfigured: pmConfigured } = require("./drifftPmClient");
const { classifyActionItems } = require("./pipelineClassifier");
const { saveMeetingTitle, getMeetingTitle } = require("./supabaseClient");
const { getMeetingTitleFromGoogle } = require("./googleCalendarClient");

const processedRecordings = new Set();
const advancedBots = new Set();

/**
 * Tritt der Bot dem Folge-Call frueher bei, muss er laenger auf das Team warten:
 * - waiting_room_timeout: Google Meet deckelt hart bei 600s, hoehere Werte verpuffen.
 * - everyone_left_timeout: Default sind 2 Sekunden. Laesst die erste Person den Bot
 *   rein und geht nochmal kurz raus, waere er sofort wieder draussen.
 */
const FOLLOW_UP_AUTOMATIC_LEAVE = {
  waiting_room_timeout: 600,
  everyone_left_timeout: { timeout: 300 },
};

function berlinDay(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function eventTitle(e) {
  return e?.raw?.summary || e?.title || "";
}

function eventStart(e) {
  return e?.start_time || e?.raw?.start?.dateTime || e?.raw?.start?.date || "";
}

/**
 * Liefert { title, guessed }. `guessed` ist nur true, wenn der Titel aus einem
 * mehrdeutigen Zeitplan-Fenster stammt - also montags 8:57-9:47, wo P2 und der
 * Marketing-Kick-Off parallel laufen. Sonst ist der Zeitplan verlaesslich.
 */
async function resolveMeetingTitle(botId, metadataName = "", prefetchedBot) {
  let title = metadataName || "";
  if (!title && botId) {
    title = (await getMeetingTitle(botId)) || "";
  }
  if (!title && botId) {
    const bot = prefetchedBot !== undefined ? prefetchedBot : await getBot(botId).catch(() => null);
    const joinAt = bot?.join_at || "";
    if (joinAt) {
      title = resolveTitleFromSchedule(joinAt);
      console.log(`[webhook] Schedule title: "${title}"`);
      if (title) return { title, guessed: scheduleSlotIsAmbiguous(joinAt) };
    }
  }
  return { title, guessed: false };
}

/**
 * Zieht den Bot des Folge-Calls vor, sobald der vorherige Call endet.
 * Best-effort: schlaegt irgendetwas fehl, bleibt der Bot auf seinem regulaeren
 * join_at stehen und es aendert sich gegenueber vorher nichts.
 */
async function advanceFollowUpBot(endedBotId) {
  const endedBot = await getBot(endedBotId).catch(() => null);
  const { title: endedTitle } = await resolveMeetingTitle(endedBotId, "", endedBot);
  const followUp = resolveFollowUp(endedTitle);
  if (!followUp) return;

  console.log(`[followUp] "${endedTitle}" ended - looking for today's "${followUp.next}".`);

  const calendarUserId = endedBot?.calendar_meetings?.[0]?.calendar_user?.id;
  if (!calendarUserId) {
    console.warn(`[followUp] No calendar user on bot ${endedBotId}, skipping.`);
    return;
  }

  const today = berlinDay(new Date());
  const wanted = followUp.next.toLowerCase();
  const events = await listCalendarEvents(calendarUserId);
  const target = events.find((e) => {
    if (!eventTitle(e).toLowerCase().includes(wanted)) return false;
    const start = Date.parse(eventStart(e));
    return !Number.isNaN(start) && berlinDay(new Date(start)) === today;
  });

  if (!target) {
    console.log(`[followUp] No "${followUp.next}" event today, nothing to advance.`);
    return;
  }

  const targetBotId = target.bot_id;
  if (!targetBotId) {
    console.warn(`[followUp] "${followUp.next}" today has no scheduled bot.`);
    return;
  }
  if (advancedBots.has(targetBotId)) {
    console.log(`[followUp] Bot ${targetBotId} already advanced, skipping.`);
    return;
  }

  const startMs = Date.parse(eventStart(target));
  if (Number.isNaN(startMs)) {
    console.warn(`[followUp] Unreadable start time on "${followUp.next}", skipping.`);
    return;
  }

  // Der Bot betritt den Call regulaer ~2 Minuten vor Start. Ab dann laesst er
  // sich nicht mehr umterminieren, also gar nicht erst versuchen.
  const now = Date.now();
  if (now >= startMs - 3 * 60 * 1000) {
    console.log(`[followUp] "${followUp.next}" starts too soon - leaving schedule untouched.`);
    return;
  }

  const earliest = startMs - followUp.maxAdvanceMin * 60 * 1000;
  const joinAt = new Date(Math.max(now + 60 * 1000, earliest));

  await updateBotJoinAt(targetBotId, joinAt.toISOString(), FOLLOW_UP_AUTOMATIC_LEAVE);
  advancedBots.add(targetBotId);
  console.log(`[followUp] Advanced "${followUp.next}" bot ${targetBotId} to ${joinAt.toISOString()}`);
}

/**
 * Legt die Action Items einer Summary als Tasks in drifft PM an.
 *
 * Rein additiv: der Slack-Post ist zu diesem Zeitpunkt schon raus, und jeder
 * Fehler hier bleibt folgenlos fuer ihn. Ohne API-Key passiert gar nichts,
 * damit sich gefahrlos deployen laesst, bevor der Key existiert.
 */
async function createTasksFromSummary({ summary, meetingTitle, recordingId, sourceUrl, titleGuessed }) {
  if (!pmConfigured()) {
    console.log("[pm] Kein DRIFFT_PM_API_KEY gesetzt - Task-Anlage uebersprungen.");
    return;
  }
  if (!createsTasks(meetingTitle)) {
    console.log(`[pm] "${meetingTitle}" erzeugt bewusst keine Tasks.`);
    return;
  }

  const items = parseActionItems(summary);
  if (items.length === 0) {
    console.log(`[pm] Keine Action Items in "${meetingTitle}".`);
    return;
  }

  // Claude waehlt die Pipeline pro Item. Ein Thema aus dem P1-Call kann in ein
  // ganz anderes Projekt gehoeren - der Task soll dort landen, wo er hingehoert,
  // nicht pauschal im Projekt des Calls.
  //
  // Die Pipeline des Calls ist der Rueckfall, wenn die Klassifizierung nichts
  // liefert: ein Task im Projekt des Calls ist besser als gar keiner. Am 17.11.
  // kam auf den P3-Call Prosa statt JSON zurueck und alle sieben Items fielen
  // weg - genau das faengt der Rueckfall ab.
  //
  // Bei mehrdeutigem Titel (montags 8:57-9:47, P2 und Marketing-Kick-Off
  // parallel) gibt es keinen Rueckfall: die Pipeline des Calls waere dann
  // selbst geraten.
  const fallback = titleGuessed ? null : resolvePipeline(meetingTitle);
  if (titleGuessed) {
    console.log(`[pm] Titel "${meetingTitle}" ist mehrdeutig - kein Rueckfall auf die Call-Pipeline.`);
  }
  const classified = await classifyActionItems(items, meetingTitle);
  const projects = items.map((_, i) => classified[i] || fallback);
  const fellBack = projects.filter((p, i) => p && !classified[i]).length;
  if (fellBack) console.log(`[pm] ${fellBack} Item(s) ohne Klassifizierung -> Pipeline des Calls.`);

  let created = 0;
  let skipped = 0;
  for (const [i, item] of items.entries()) {
    const project = projects[i];
    if (!project) {
      skipped++;
      console.log(`[pm] Keine Pipeline fuer "${item.title}" - uebersprungen.`);
      continue;
    }
    try {
      await createTask({
        project,
        title: item.title,
        assignee: item.assignee || undefined,
        priority: item.priority,
        source_url: sourceUrl || undefined,
        // Stabil pro Aufnahme und Position: erneutes Verarbeiten desselben
        // Transkripts erzeugt keine Duplikate.
        external_ref: `summy:${recordingId}:${i}`,
      });
      created++;
    } catch (err) {
      console.error(`[pm] Task "${item.title}" fehlgeschlagen:`, err.message);
      if (err.response?.data) console.error(JSON.stringify(err.response.data));
    }
  }
  console.log(`[pm] ${created}/${items.length} Tasks angelegt` + (skipped ? `, ${skipped} ohne Pipeline` : "") + ".");
}
async function handleWebhook(req, res) {
  const event = req.body;
  const eventType = event?.event;

  res.status(200).json({ received: true });

  if (eventType === "calendar.sync_events") {
    console.log("[webhook] calendar.sync_events received");
    try {
      const calendarUserId = event?.data?.calendar_user?.id;
      if (!calendarUserId) return;

      const events = await listCalendarEvents(calendarUserId);
      for (const calEvent of events) {
        const botId = calEvent?.bot_id;
        const title = calEvent?.raw?.summary || calEvent?.title || "";
        if (botId && title) {
          await saveMeetingTitle(botId, title);
          console.log(`[webhook] Saved title "${title}" for bot ${botId}`);
        }
      }
    } catch (err) {
      console.error("[webhook] calendar.sync_events error:", err.message);
    }
    return;
  }

  if (eventType === "recording.done") {
    const recordingId = event?.data?.recording?.id;
    if (!recordingId) {
      console.error("[webhook] recording.done missing data.recording.id");
      return;
    }
    console.log(`[webhook] recording.done for recording ${recordingId}, triggering transcript...`);
    try {
      await createTranscript(recordingId);
      console.log(`[webhook] Transcript job created for recording ${recordingId}`);
    } catch (err) {
      console.error(`[webhook] Failed to create transcript job:`, err.message);
      if (err.response?.data) console.error(JSON.stringify(err.response.data));
    }

    const endedBotId = event?.data?.bot?.id;
    if (endedBotId) {
      try {
        await advanceFollowUpBot(endedBotId);
      } catch (err) {
        console.error("[followUp] Error:", err.message);
        if (err.response?.data) console.error(JSON.stringify(err.response.data));
      }
    } else {
      console.warn("[followUp] recording.done without data.bot.id - cannot check follow-up.");
    }
    return;
  }

  if (eventType === "meeting_metadata.done") {
    console.log("[webhook] meeting_metadata.done:", JSON.stringify(event?.data));
    return;
  }

  if (eventType === "transcript.done") {
    const transcriptId = event?.data?.transcript?.id;
    const recordingId = event?.data?.recording?.id;

    if (!transcriptId) {
      console.error("[webhook] transcript.done missing data.transcript.id");
      return;
    }

    if (recordingId && processedRecordings.has(recordingId)) {
      console.log(`[webhook] Already processed recording ${recordingId}, skipping.`);
      return;
    }
    if (recordingId) processedRecordings.add(recordingId);

    const botId = event?.data?.bot?.id;
    const { title: meetingTitle, guessed: titleGuessed } = await resolveMeetingTitle(botId, event?.data?.bot?.metadata?.meeting_name);

    try {
      const downloadUrl = await getTranscriptDownloadUrl(transcriptId);
      if (!downloadUrl) {
        console.error("[webhook] No download URL in transcript response");
        return;
      }
      const transcriptData = await downloadTranscript(downloadUrl);
      const transcriptText = formatTranscript(transcriptData);
      if (!transcriptText) {
        console.warn(`[webhook] Empty transcript, skipping.`);
        return;
      }

      console.log(`[webhook] Transcript fetched (${transcriptText.length} chars), sending to Claude...`);
      const summary = await summarizeTranscript(transcriptText, meetingTitle);

      const channelId = resolveChannel(meetingTitle);
      if (!channelId) {
        console.error("[webhook] No Slack channel resolved.");
        return;
      }

      const permalink = await postSummary(channelId, meetingTitle, summary);
      console.log(`[webhook] Summary posted to Slack channel ${channelId}`);

      await createTasksFromSummary({ summary, meetingTitle, recordingId, sourceUrl: permalink, titleGuessed });
    } catch (err) {
      console.error(`[webhook] Error processing transcript ${transcriptId}:`, err.message);
      if (err.response?.data) console.error(JSON.stringify(err.response.data));
    }
    return;
  }
}

module.exports = { handleWebhook };
