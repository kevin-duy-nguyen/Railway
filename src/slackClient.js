const { WebClient } = require("@slack/web-api");

let _client = null;

function getClient() {
  if (!_client) {
    _client = new WebClient(process.env.SLACK_BOT_TOKEN);
  }
  return _client;
}

async function postSummary(channelId, meetingTitle, summary) {
  const titleLine = meetingTitle
  ? `*${meetingTitle}*`
  : "";

await getClient().chat.postMessage({
  channel: channelId,
  text: meetingTitle ? `${titleLine}\n\n${summary}` : summary,
  mrkdwn: true,
});
}

module.exports = { postSummary };
