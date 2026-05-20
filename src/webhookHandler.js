const { getBot, createTranscript, getTranscriptDownloadUrl, downloadTranscript } = require("./recallClient");
const { formatTranscript } = require("./transcriptFormatter");
const { summarizeTranscript } = require("./claudeClient");
const { postSummary } = require("./slackClient");
const { resolveChannel } = require("./channelMap");

async function handleWebhook(req, res) {
  const event = req.body;
  const eventType = event?.event;

  res.status(200).json({ received: true });

  // Step 1: recording.done → trigger async transcript job
  if (eventType === "recording.done") {
    const recordingId = event?.data?.recording?.id;
    const botId = event?.data?.bot?.id;
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

  // Step 2: transcript.done → fetch, summarize, post to Slack
  if (eventType === "transcript.done") {
    const transcriptId = event?.data?.transcript?.id;
    const botId = event?.data?.bot?.id;
    const meetingTitle = event?.data?.bot?.metadata?.meeting_name || "";
    // rest bleibt gleich, getBot() call für Titel nicht mehr nötig
    if (!transcriptId) {
      console.error("[webhook] transcript.done missing data.transcript.id");
      return;
    }
    console.log(`[webhook] transcript.done for transcript ${transcriptId}`);
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

      let meetingTitle = "";
      if (botId) {
        try {
          const bot = await getBot(botId);
          meetingTitle = bot?.meeting_metadata?.title || bot?.meeting_name || bot?.metadata?.title || "";
        } catch (e) {
          console.warn("[webhook] Could not fetch bot for title:", e.message);
        }
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
