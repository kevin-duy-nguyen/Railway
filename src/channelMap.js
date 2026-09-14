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
  // P2 steht im Kalender auf 9:30, das Team startet aber oft direkt nach dem
  // Check-In. Fenster beginnt daher schon 8:57 (nahtlos nach dem Check-In-
  // Fenster), damit ein vorgezogenes join_at weiterhin als P2 erkannt wird.
  { day: 1, startH: 8, startM: 57, endH: 9,  endM: 47, title: "P2 - Product and Packaging" },
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

/**
 * Verkettete Calls: sobald `after` endet, rueckt der Bot von `next` sofort nach,
 * statt auf sein regulaeres join_at (2 Minuten vor Kalenderstart) zu warten.
 *
 * Hintergrund: montags wechselt das Team direkt vom Check-In in den P2-Call, oft
 * deutlich vor 9:30. Der Anfang fehlte dadurch regelmaessig im Transkript.
 *
 * maxAdvanceMin begrenzt, wie weit vorgezogen wird. Endet der Check-In sehr frueh,
 * wuerde der Bot sonst im Google-Meet-Warteraum verfallen (dort gilt ein hartes
 * Limit von 10 Minuten) und der Call waere am Ende gar nicht aufgezeichnet.
 */
const FOLLOW_UP = [
  { after: "Check-In Call", next: "P2 - Product and Packaging", maxAdvanceMin: 30 },
];

function resolveFollowUp(endedTitle = "") {
  if (!endedTitle) return null;
  const lower = endedTitle.toLowerCase();
  return FOLLOW_UP.find((f) => lower.includes(f.after.toLowerCase())) || null;
}

function resolveTitleFromSchedule(joinAt) {
  // joinAt: ISO string z.B. "2026-05-27T06:48:00Z"
  try {
    const date = new Date(joinAt);
    if (Number.isNaN(date.getTime())) return "";

    // Echte Berliner Ortszeit inkl. Sommer-/Winterzeit.
    // (Vorher war UTC+2 fest verdrahtet -> ab Ende Oktober 1h daneben.)
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Berlin",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(date);
    const part = (type) => parts.find((x) => x.type === type)?.value;

    const DAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const day = DAYS[part("weekday")];
    const h = Number(part("hour")) % 24;
    const m = Number(part("minute"));
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

module.exports = { resolveChannel, resolveTitleFromSchedule, resolveFollowUp };
