/**
 * Maps meeting title keywords to Slack channel IDs.
 * Keywords are matched case-insensitively against the meeting title.
 * The first match wins; falls back to SLACK_CHANNEL_ID env var.
 *
 * Edit this list to add your own keyword → channel mappings.
 */
const CHANNEL_MAP = [
  { keyword: "standup",   channelId: process.env.SLACK_CHANNEL_STANDUP   || process.env.SLACK_CHANNEL_ID },
  { keyword: "sprint",    channelId: process.env.SLACK_CHANNEL_SPRINT     || process.env.SLACK_CHANNEL_ID },
  { keyword: "design",    channelId: process.env.SLACK_CHANNEL_DESIGN     || process.env.SLACK_CHANNEL_ID },
  { keyword: "sales",     channelId: process.env.SLACK_CHANNEL_SALES      || process.env.SLACK_CHANNEL_ID },
  { keyword: "marketing", channelId: process.env.SLACK_CHANNEL_MARKETING  || process.env.SLACK_CHANNEL_ID },
  { keyword: "eng",       channelId: process.env.SLACK_CHANNEL_ENG        || process.env.SLACK_CHANNEL_ID },
  { keyword: "product",   channelId: process.env.SLACK_CHANNEL_PRODUCT    || process.env.SLACK_CHANNEL_ID },
  { keyword: "onboarding",channelId: process.env.SLACK_CHANNEL_ONBOARDING || process.env.SLACK_CHANNEL_ID },
];

function resolveChannel(meetingTitle = "") {
  const lower = meetingTitle.toLowerCase();
  for (const { keyword, channelId } of CHANNEL_MAP) {
    if (lower.includes(keyword.toLowerCase()) && channelId) {
      return channelId;
    }
  }
  return process.env.SLACK_CHANNEL_ID;
}

module.exports = { resolveChannel };
