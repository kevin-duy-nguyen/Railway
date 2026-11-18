const { WebClient } = require("@slack/web-api");

let _client = null;

function getClient() {
  if (!_client) {
    _client = new WebClient(process.env.SLACK_BOT_TOKEN);
  }
  return _client;
}

async function postSummary(channelId, meetingTitle, summary, transcriptUrl = null) {
  const now = new Date();
  const date = now.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });

  const titleLine = meetingTitle
    ? `📋 *MEETING NOTES* — 🗓 ${meetingTitle} — 📅 ${date}`
    : `📋 *MEETING NOTES* — 📅 ${date}`;

  // Der Link zum abgelegten Transkript haengt unten an. Recalls eigener
  // Download-Link waere am naechsten Morgen schon abgelaufen.
  const footer = transcriptUrl
    ? `\n\n\u{1F4C4} <${transcriptUrl}|Vollstaendiges Transkript>`
    : "";

  const res = await getClient().chat.postMessage({
    channel: channelId,
    text: `${titleLine}\n\n${summary}${footer}`,
    mrkdwn: true,
  });

  // Permalink dient den PM-Tasks als Quelle. Schlaegt er fehl, ist das kein
  // Grund den bereits erfolgreichen Post als Fehler zu behandeln.
  try {
    const link = await getClient().chat.getPermalink({
      channel: res.channel,
      message_ts: res.ts,
    });
    return link.permalink || null;
  } catch (err) {
    console.warn("[slack] Permalink nicht ermittelbar:", err.message);
    return null;
  }
}

module.exports = { postSummary };
