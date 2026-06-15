/**
 * Maps meeting title keywords to Slack channel IDs.
 * Keywords are matched case-insensitively against the meeting title.
 * The first match wins; falls back to SLACK_CHANNEL_ID env var.
 *
 * Edit this list to add your own keyword + channel mappings.
 */
const CHANNEL_MAP = [
  { keyword: "P12 - AI Automations", channelId: process.env.SLACK_CHANNEL_P12 },
  { keyword: "P1 - Brand and Design Systems", channelId: process.env.SLACK_CHANNEL_P1 },
  { keyword: "P2 - Product and Packaging", channelId: process.env.SLACK_CHANNEL_P2 },
  { keyword: "P3 - Digital Store & Tech Stack", channelId: process.env.SLACK_CHANNEL_P3 },
  { keyword: "P4 - Data Analytics", channelId: process.env.SLACK_CHANNEL_P4 },
  { keyword: "P5 - Email communication", channelId: process.env.SLACK_CHANNEL_P5 },
  { keyword: "P6 - Content, Social & Audience", channelId: process.env.SLACK_CHANNEL_P6 },
  { keyword: "P8 - Paid Media", channelId: process.env.SLACK_CHANNEL_P8 },
  { keyword: "End of Week Update", channelId: process.env.SLACK_CHANNEL_EOW },
  { keyword: "Check-In Call", channelId: process.env.SLACK_CHANNEL_CHECK_IN },
  // usw
];

// Schedule: { day (0=Sun,1=Mon,...), startH, startM, endH, endM, title }
const SCHEDULE = [
  { day: 1, startH: 8, startM: 28, endH: 8,  endM: 57, title: "Check-In Call" },
  { day: 1, startH: 9, startM: 28, endH: 9,  endM: 47, title: "P2 - Product and Packaging" },
  { day: 2, startH: 8, startM: 28, endH: 8,  endM: 47, title: "P1 - Brand and Design Systems" },
  { day: 2, startH: 8, startM: 48, endH: 9,  endM: 7,  title: "P3 - Digital Store & Tech Stack" },
  { day: 3, startH: 8, startM: 28, endH: 8,  endM: 47, title: "P4 - Data Analytics" },
  { day: 3, startH: 8, startM: 48, endH: 9,  endM: 7,  title: "P6 - Content, Social & Audience" },
  { day: 3, startH: 9, startM: 8,  endH: 9,  endM: 27, title: "P8 - Paid Media" },
  { day: 4, startH: 8, startM: 28, endH: 8,  endM: 47, title: "P5 - Email communication" },
  { day: 4, startH: 8, startM: 48, endH: 9,  endM: 7,  title: "P12 - AI Automations" },
  { day: 4, startH: 9, startM: 8,  endH: 9,  endM: 27, title: "Dejan Garz | PM Weekly" },
  { day: 5, startH: 9, startM: 28, endH: 10, endM: 27, title: "End of Week Update" },
];

function resolveTitleFromSchedule(joinAt) {
  // joinAt: ISO string z.B. "2026-05-27T06:48:00Z"
  try {
    const date = new Date(joinAt);
    // Berlin ist UTC+2 im Sommer
    const berlinOffset = 2;
    const local = new Date(date.getTime() + berlinOffset * 60 * 60 * 1000);
    const day = local.getUTCDay();
    const h = local.getUTCHours();
    const m = local.getUTCMinutes();
    const totalMin = h * 60 + m;

    const match = SCHEDULE.find(s => {
      if (s.day !== day) return false;
      const start = s.startH * 60 + s.startM;
      const end = s.endH * 60 + s.endM; 
      return totalMin >= start && totalMin < end;
    });

    return match?.title || "";
  } catch {
    return "";
  }
}

function resolveChannel(meetingTitle = "") {
  const lower = meetingTitle.toLowerCase();
  for (const { keyword, channelId } of CHANNEL_MAP) {
    if (lower.includes(keyword.toLowerCase()) && channelId) {
      return channelId;
    }
  }
  return process.env.SLACK_CHANNEL_ID;
}

module.exports = { resolveChannel, resolveTitleFromSchedule };
