const { createTranscript, getTranscriptDownloadUrl, downloadTranscript, getCalendarEventByBotId } = require("./recallClient");
const { formatTranscript } = require("./transcriptFormatter");
const { summarizeTranscript } = require("./claudeClient");
const { postSummary } = require("./slackClient");
const { resolveChannel } = require("./channelMap");
const { saveMeetingTitle, getMeetingTitle } = require("./supabaseClient");
const { getMeetingTitleFromGoogle } = require("./googleCalendarClient");

const processedRecordings = new Set();

async function handleWebhook(req, res) {
  const event = req.body;
  const eventType = event?.event;

  res.status(200).json({ received: true });

  if (eventType === "calendar.sync_events") {
    console.log("[webhook] calendar.sync_events received");
    try {
      const calendarUserId = event?.data?.calendar_user?.id;
      if (!calendarUserId) return;

      const axios = require("axios");
      const BASE_URL = `https://${process.env.RECALL_REGION || "us-west-2"}.recall.ai/api/v1`;
      const res2 = await axios.get(
        `${BASE_URL}/calendar/v1/${calendarUserId}/events/`,
        {
          headers: {
            Authorization: `Token ${process.env.RECALL_API_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );

      const events = res2.data?.results || [];
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
    let meetingTitle = event?.data?.bot?.metadata?.meeting_name || "";

    if (!meetingTitle && botId) {
      meetingTitle = await getMeetingTitle(botId) || "";
    }
    
    // NEU: Google Calendar Fallback
    if (!meetingTitle) {
      const bot = await getBot(botId).catch(() => null);
      const meetingUrl = bot?.meeting_url?.meeting_id || "";
      if (meetingUrl) {
        meetingTitle = await getMeetingTitleFromGoogle(meetingUrl);
        console.log(`[webhook] Google Calendar title: "${meetingTitle}"`);
      }
    }

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

      await postSummary(channelId, meetingTitle, summary);
      console.log(`[webhook] Summary posted to Slack channel ${channelId}`);
    } catch (err) {
      console.error(`[webhook] Error processing transcript ${transcriptId}:`, err.message);
      if (err.response?.data) console.error(JSON.stringify(err.response.data));
    }
    return;
  }
}

module.exports = { handleWebhook };
