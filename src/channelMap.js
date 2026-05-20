/**
 * Maps meeting title keywords to Slack channel IDs.
 * Keywords are matched case-insensitively against the meeting title.
 * The first match wins; falls back to SLACK_CHANNEL_ID env var.
 *
 * Edit this list to add your own keyword → channel mappings.
 */
const CHANNEL_MAP = [
  { keyword: "P1 - Brand and Design Systems", channelId: process.env.SLACK_CHANNEL_P1 },
  { keyword: "P2 - Product and Packaging", channelId: process.env.SLACK_CHANNEL_P2 },
  { keyword: "P3 - Digital Store & Tech Stack", channelId: process.env.SLACK_CHANNEL_P3 },
  { keyword: "P4 - Data Analytics", channelId: process.env.SLACK_CHANNEL_P4 },
  { keyword: "P5 - Email communication", channelId: process.env.SLACK_CHANNEL_P5 },
  { keyword: "P6 - Content, Social & Audience", channelId: process.env.SLACK_CHANNEL_P6 },
  { keyword: "P8 - Paid Media", channelId: process.env.SLACK_CHANNEL_P8 },
  { keyword: "P12 - AI Automations", channelId: process.env.SLACK_CHANNEL_P12 },
  { keyword: "End of Week Update", channelId: process.env.SLACK_CHANNEL_EOW },
  { keyword: "Check-In Call", channelId: process.env.SLACK_CHANNEL_CHECK_IN },
  // usw
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
