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
    ? `:memo: *Meeting Summary: ${meetingTitle}*`
    : `:memo: *Meeting Summary*`;

  await getClient().chat.postMessage({
    channel: channelId,
    text: `${titleLine}\n\n${summary}`,
    mrkdwn: true,
  });
}

module.exports = { postSummary };
