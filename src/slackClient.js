const { WebClient } = require("@slack/web-api");

let _client = null;

function getClient() {
  if (!_client) {
    _client = new WebClient(process.env.SLACK_BOT_TOKEN);
  }
  return _client;
}

async function postSummary(channelId, meetingTitle, summary) {
  const now = new Date();
  const date = now.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });

  const titleLine = meetingTitle
    ? `📋 *MEETING NOTES* — 🗓 ${meetingTitle} — 📅 ${date}`
    : `📋 *MEETING NOTES* — 📅 ${date}`;

  await getClient().chat.postMessage({
    channel: channelId,
    text: `${titleLine}\n\n${summary}`,
    mrkdwn: true,
  });
}

module.exports = { postSummary };
