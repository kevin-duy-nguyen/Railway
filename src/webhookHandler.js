const { getBot, createTranscript, getTranscriptDownloadUrl, downloadTranscript } = require("./recallClient");
const { formatTranscript } = require("./transcriptFormatter");
const { summarizeTranscript } = require("./claudeClient");
const { postSummary } = require("./slackClient");
const { resolveChannel } = require("./channelMap");

async function handleWebhook(req, res) {
  const event = req.body;
  const eventType = event?.event;

  res.status(200).json({ received: true });

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
    const provider = event?.data?.transcript?.provider;
    if (provider && JSON.stringify(provider).includes("meeting_captions")) {
      console.log("[webhook] Skipping meeting_captions transcript");
      return;
    }

    const transcriptId = event?.data?.transcript?.id;
    if (!transcriptId) {
      console.error("[webhook] transcript.done missing data.transcript.id");
      return;
    }

    const botId = event?.data?.bot?.id;
    let meetingTitle = event?.data?.bot?.metadata?.meeting_name || "";

    if (!meetingTitle && botId) {
      try {
        const bot = await getBot(botId);
        console.log("[webhook] bot object:", JSON.stringify(bot));
        meetingTitle = bot?.meeting_metadata?.title || bot?.meeting_name || bot?.metadata?.meeting_name || "";
      } catch (e) {
        console.warn("[webhook] Could not fetch bot:", e.message);
      }
    }

    console.log(`[webhook] transcript.done for transcript ${transcriptId}, meeting: "${meetingTitle}"`);

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
