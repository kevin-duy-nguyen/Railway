const { getBot, getTranscript } = require("./recallClient");
const { formatTranscript } = require("./transcriptFormatter");
const { summarizeTranscript } = require("./claudeClient");
const { postSummary } = require("./slackClient");
const { resolveChannel } = require("./channelMap");

async function handleWebhook(req, res) {
  const event = req.body;
  const eventType = event?.event;

  // Acknowledge immediately — Recall.ai expects a fast 200
  res.status(200).json({ received: true });

  if (eventType !== "bot.done") {
    return;
  }

  const botId = event?.data?.bot_id;
  if (!botId) {
    console.error("[webhook] bot.done event missing data.bot_id");
    return;
  }

  console.log(`[webhook] Processing bot.done for bot ${botId}`);

  try {
    const [bot, transcriptData] = await Promise.all([
      getBot(botId),
      getTranscript(botId),
    ]);

    const meetingTitle = bot?.meeting_url?.title || bot?.metadata?.meeting_name || "";
    const transcriptText = formatTranscript(transcriptData);

    if (!transcriptText) {
      console.warn(`[webhook] Empty transcript for bot ${botId}, skipping.`);
      return;
    }

    console.log(`[webhook] Transcript fetched (${transcriptText.length} chars), sending to Claude...`);
    const summary = await summarizeTranscript(transcriptText, meetingTitle);

    const channelId = resolveChannel(meetingTitle);
    if (!channelId) {
      console.error("[webhook] No Slack channel resolved. Set SLACK_CHANNEL_ID env var.");
      return;
    }

    await postSummary(channelId, meetingTitle, summary);
    console.log(`[webhook] Summary posted to Slack channel ${channelId}`);
  } catch (err) {
    console.error(`[webhook] Error processing bot ${botId}:`, err.message);
    if (err.response?.data) {
      console.error("[webhook] API error detail:", JSON.stringify(err.response.data));
    }
  }
}

module.exports = { handleWebhook };
