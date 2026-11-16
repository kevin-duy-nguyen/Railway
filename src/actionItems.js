/**
 * Zerlegt den Action-Items-Block einer Claude-Summary in strukturierte Eintraege.
 *
 * Bewusst ein Parser und keine Structured Outputs: der Slack-Pfad laeuft stabil,
 * und ein zweites Antwortformat waere ein Risiko fuer die Summaries selbst.
 * Schlaegt das Parsen fehl, entstehen keine Tasks - die Summary bleibt unberuehrt.
 *
 * Erwartetes Format (siehe SYSTEM_PROMPT in claudeClient.js):
 *   [rot] [HIGH] Beschreibung - <@U01FWNF6N1H>
 */

// Slack-User-ID -> Name, wie er in drifft PM heisst.
const PM_NAME_BY_SLACK_ID = {
  U01FWNF6N1H: "Kevin",
  U022HUWEQ9W: "George",
  U039D3U193J: "Pilar",
  U07B4L3M1S4: "Javier",
  U07FL9H6057: "Antoaneta",
  U013L09D89X: "Felix",
  U0137HK464B: "Lukas",
  U0130K9CBPY: "Nils",
};

const PM_PRIORITY_BY_LABEL = { HIGH: "P1", MEDIUM: "P2", LOW: "P3" };

const ITEM_RE = /^\s*[\u{1F534}\u{1F7E1}\u{1F7E2}]\s*\[(HIGH|MEDIUM|LOW)\]\s*(.+)$/u;
const EM_DASH = "—";

/** Schneidet den Abschnitt zwischen "Action Items" und der naechsten Ueberschrift heraus. */
function actionItemSection(summary) {
  const lines = summary.split(/\r?\n/);
  const start = lines.findIndex((l) => /Action Items/i.test(l));
  if (start === -1) return [];
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /Open Questions|Key Decisions|TL;DR/i.test(l));
  return end === -1 ? rest : rest.slice(0, end);
}

function parseActionItems(summary = "") {
  const items = [];
  for (const line of actionItemSection(summary)) {
    const m = line.match(ITEM_RE);
    if (!m) continue;

    const [, label, rest] = m;
    // Owner steht hinter dem letzten Gedankenstrich - die Beschreibung selbst
    // darf dadurch Gedankenstriche enthalten.
    const cut = rest.lastIndexOf(EM_DASH);
    const title = (cut === -1 ? rest : rest.slice(0, cut)).trim();
    const ownerRaw = cut === -1 ? "" : rest.slice(cut + 1).trim();
    if (!title) continue;

    const slackId = (ownerRaw.match(/<@([A-Z0-9]+)>/) || [])[1] || null;

    items.push({
      title,
      priority: PM_PRIORITY_BY_LABEL[label],
      assignee: slackId ? PM_NAME_BY_SLACK_ID[slackId] || null : null,
      ownerRaw,
    });
  }
  return items;
}

module.exports = { parseActionItems, PM_NAME_BY_SLACK_ID, PM_PRIORITY_BY_LABEL };
