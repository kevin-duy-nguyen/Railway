const Anthropic = require("@anthropic-ai/sdk");
const { getMe } = require("./drifftPmClient");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

let pipelineCache = null;

/**
 * Bringt die Antwort von /api/ext/me auf [{ id, name }].
 *
 * Die genaue Form ist noch unbestaetigt - Gyuri hat den Endpunkt genannt, nicht
 * sein Schema. Daher mehrere plausible Varianten, und wenn keine passt, werden
 * die Top-Level-Keys geloggt. Der erste echte Aufruf sagt uns damit selbst,
 * wie die Antwort aussieht.
 */
function normalizePipelines(payload) {
  const raw =
    (Array.isArray(payload) && payload) ||
    payload?.pipelines ||
    payload?.projects ||
    payload?.data?.pipelines ||
    null;

  if (!Array.isArray(raw)) {
    console.warn("[pm] Pipelines nicht lesbar. Top-Level-Keys:", Object.keys(payload || {}).join(", "));
    return [];
  }

  return raw
    .map((p) => ({
      id: p.id || p.pipeline_id || p.project_id || null,
      name: p.name || p.title || p.pipeline_name || p.project_name || "",
    }))
    .filter((p) => p.id);
}

async function loadPipelines() {
  if (pipelineCache) return pipelineCache;
  pipelineCache = normalizePipelines(await getMe());
  console.log("[pm] " + pipelineCache.length + " Pipelines geladen.");
  return pipelineCache;
}

function buildSystemPrompt(pipelines) {
  const list = pipelines.map((p) => p.id + " — " + p.name).join("\n");
  return [
    "You route action items from a company meeting to the right project pipeline.",
    "",
    "Available pipelines (id — name):",
    list,
    "",
    "Rules:",
    "- Return ONLY a JSON array of strings, one entry per action item, in the same order.",
    "- Each entry is a pipeline id from the list above, or null if none fits.",
    "- Pick the project the item belongs to, which is often NOT the meeting's own project.",
    "- Prefer null over a bad guess. A wrong project is worse than no task.",
    "- No prose, no explanation, no code fences.",
  ].join("\n");
}

/**
 * Waehlt pro Action Item eine Pipeline. Rueckgabe hat immer dieselbe Laenge wie
 * `items`; Eintraege koennen null sein. Bei jedem Fehler kommt ein Array aus
 * lauter null zurueck - dann entstehen schlicht keine Tasks.
 */
async function classifyActionItems(items, meetingTitle = "") {
  const none = items.map(() => null);
  if (items.length === 0) return none;

  let pipelines;
  try {
    pipelines = await loadPipelines();
  } catch (err) {
    console.error("[pm] Pipelines konnten nicht geladen werden:", err.message);
    return none;
  }
  if (pipelines.length === 0) return none;

  const userMessage = [
    'Meeting: "' + meetingTitle + '"',
    "",
    "Action items:",
    ...items.map((it, i) => i + 1 + ". " + it.title + (it.assignee ? " (owner: " + it.assignee + ")" : "")),
  ].join("\n");

  let text;
  try {
    const message = await client.messages.create({
      model: "claude-sonnet-5-5",
      max_tokens: 2000,
      output_config: { effort: "low" },
      system: buildSystemPrompt(pipelines),
      messages: [{ role: "user", content: userMessage }],
    });
    // Wie in claudeClient: mit Thinking kann der erste Block ein thinking-Block sein.
    text = message.content.find((b) => b.type === "text")?.text;
  } catch (err) {
    console.error("[pm] Pipeline-Klassifizierung fehlgeschlagen:", err.message);
    return none;
  }
  if (!text) return none;

  const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  let parsed = null;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Kommt die Antwort in Prosa verpackt, das erste Array herausschneiden.
    const open = cleaned.indexOf("[");
    const close = cleaned.lastIndexOf("]");
    if (open !== -1 && close > open) {
      try { parsed = JSON.parse(cleaned.slice(open, close + 1)); } catch { /* bleibt null */ }
    }
  }
  if (!Array.isArray(parsed)) {
    console.error("[pm] Antwort der Klassifizierung ist kein JSON:", text.slice(0, 200));
    return none;
  }

  const valid = new Set(pipelines.map((p) => p.id));
  return items.map((_, i) => (valid.has(parsed[i]) ? parsed[i] : null));
}

module.exports = { classifyActionItems, normalizePipelines, _resetCache: () => { pipelineCache = null; } };
