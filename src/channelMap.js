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
  // Alle drei Marketing-Calls teilen sich #digital-marketing. Der Kanal ist
  // privat - ohne Einladung des Bots schlaegt der Post fehl.
  // "Marketing Week Kick-Off" enthaelt nicht "marketing weekly", die beiden
  // Keywords greifen also nicht ineinander.
  { keyword: "Marketing Week Kick-Off", channelId: process.env.SLACK_CHANNEL_MARKETING },
  { keyword: "Marketing weekly", channelId: process.env.SLACK_CHANNEL_MARKETING },
  // usw
];

// Schedule: { day (0=Sun,1=Mon,...), startH, startM, endH, endM, title }
const SCHEDULE = [
  { day: 1, startH: 8, startM: 28, endH: 8,  endM: 57, title: "Check-In Call" },
  // P2 steht im Kalender auf 9:30, das Team startet aber oft direkt nach dem
  // Check-In. Fenster beginnt daher schon 8:57 (nahtlos nach dem Check-In-
  // Fenster), damit ein vorgezogenes join_at weiterhin als P2 erkannt wird.
  // ambiguous: "Marketing Week Kick-Off" (Mo 9:00) laeuft parallel und steht
  // deshalb nicht im Zeitplan. In diesem einen Fenster kann die Uhrzeit die
  // beiden Calls nicht auseinanderhalten - nur hier ist der Titel unsicher.
  { day: 1, startH: 8, startM: 57, endH: 9,  endM: 47, title: "P2 - Product and Packaging", ambiguous: true },
  { day: 2, startH: 8, startM: 28, endH: 8,  endM: 47, title: "P1 - Brand and Design Systems" },
  { day: 2, startH: 8, startM: 48, endH: 9,  endM: 7,  title: "P3 - Digital Store & Tech Stack" },
  { day: 3, startH: 8, startM: 28, endH: 8,  endM: 47, title: "P4 - Data Analytics" },
  { day: 3, startH: 8, startM: 48, endH: 9,  endM: 7,  title: "P6 - Content, Social & Audience" },
  { day: 3, startH: 9, startM: 8,  endH: 9,  endM: 27, title: "P8 - Paid Media" },
  { day: 3, startH: 11, startM: 58, endH: 12, endM: 17, title: "Marketing weekly" },
  { day: 4, startH: 8, startM: 28, endH: 8,  endM: 47, title: "P5 - Email communication" },
  { day: 4, startH: 8, startM: 48, endH: 9,  endM: 7,  title: "P12 - AI Automations" },
  { day: 4, startH: 9, startM: 8,  endH: 9,  endM: 27, title: "Dejan Garz | PM Weekly" },
  { day: 4, startH: 11, startM: 28, endH: 11, endM: 47, title: "Marketing weekly" },
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

function findScheduleSlot(joinAt) {
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

    return SCHEDULE.find(s => {
      if (s.day !== day) return false;
      const start = s.startH * 60 + s.startM;
      const end = s.endH * 60 + s.endM; 
      return totalMin >= start && totalMin < end;
    }) || null;
  } catch {
    return null;
  }
}

function resolveTitleFromSchedule(joinAt) {
  return findScheduleSlot(joinAt)?.title || "";
}

/**
 * Ist der aus dem Zeitplan abgeleitete Titel unsicher?
 *
 * Der Zeitplan ist der Normalfall, nicht die Ausnahme: Recall liefert in den
 * Bot-Metadaten nichts, also kommt der Titel fast immer von hier. Ihm pauschal
 * zu misstrauen hat am 17.11. dazu gefuehrt, dass P1 und P3 durch die
 * Klassifizierung liefen statt in ihre feste Pipeline - P3 ganz ohne Tasks.
 * Unsicher ist nur ein Fenster, in dem zwei Calls gleichzeitig laufen.
 */
function scheduleSlotIsAmbiguous(joinAt) {
  return Boolean(findScheduleSlot(joinAt)?.ambiguous);
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

/**
 * Meeting-Titel -> Pipeline in drifft PM, adressiert ueber die Pipeline-ID.
 * IDs statt Namen, weil die Namen Geviertstriche enthalten und umbenannt
 * werden koennen - beides waere eine stille Fehlerquelle.
 *
 * Die Marketing-Calls stehen bewusst nicht hier: sie sind uebergreifend,
 * dort waehlt Claude die Pipeline pro Action Item.
 */
const PIPELINE_MAP = [
  { keyword: "P12 - AI Automations",           project: "b4fdc545-a054-41ad-9f36-556144ba3df8" }, // 12 AI Automation
  { keyword: "P1 - Brand and Design Systems",  project: "cdbe0024-fe76-40dd-976c-30c91d815a7f" }, // 01 Brand & Design System
  { keyword: "P2 - Product and Packaging",     project: "318299e2-0239-446a-a2cf-6fb7d64ebe43" }, // 02 Product & Packaging
  { keyword: "P3 - Digital Store & Tech Stack",project: "b1181911-3da6-4887-8be6-9a8f0454896a" }, // 03 Digital Store & Tech Stack
  { keyword: "P4 - Data Analytics",            project: "8d528710-4c2c-471e-94c0-31d7977c7a58" }, // 04 Data, Analytics & Measurement
  { keyword: "P5 - Email communication",       project: "1e9582e3-04b9-4778-ae03-d7978d3cbe1d" }, // 05 Shop - Email & Customer Communication
  { keyword: "P6 - Content, Social & Audience",project: "7677d5d8-ef1b-4cff-83df-412f4866c51d" }, // Shop - Content & social
  { keyword: "P8 - Paid Media",                project: "5c11d5db-2339-4925-bada-58763ee3ae21" }, // Shop - Paid media
  { keyword: "Dejan Garz",                     project: "a07e0635-b741-4b5d-92b2-18674ecfa69d" }, // Dejan Garz (clients)
];

function resolvePipeline(meetingTitle = "") {
  const lower = meetingTitle.toLowerCase();
  for (const { keyword, project } of PIPELINE_MAP) {
    if (lower.includes(keyword.toLowerCase())) return project;
  }
  return null;
}
/**
 * Uebergreifende Runden, aus denen bewusst keine Tasks entstehen. Dort wird
 * quer durchs Team berichtet statt verteilt; was daraus wirklich ein Task
 * wird, traegt jemand selbst ein. Die Zusammenfassung laeuft unveraendert.
 */
const NO_TASKS = ["Check-In Call", "End of Week Update"];

function createsTasks(meetingTitle = "") {
  const lower = meetingTitle.toLowerCase();
  return !NO_TASKS.some((t) => lower.includes(t.toLowerCase()));
}

module.exports = { resolveChannel, resolveTitleFromSchedule, scheduleSlotIsAmbiguous, resolveFollowUp, resolvePipeline, createsTasks };
