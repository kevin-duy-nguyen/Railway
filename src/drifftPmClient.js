const axios = require("axios");

const BASE_URL = process.env.DRIFFT_PM_BASE_URL || "https://drifft-pm.drifft-pm.workers.dev";

function headers() {
  // ACHTUNG: Das Auth-Schema ist noch unbestaetigt. Gyuri hat die Endpunkte
  // genannt, aber nicht den Header. Erwartet PM stattdessen z.B. X-API-Key,
  // ist das hier die einzige Stelle, die sich aendert.
  return {
    Authorization: "Bearer " + process.env.DRIFFT_PM_API_KEY,
    "Content-Type": "application/json",
  };
}

/** Ohne Key passiert nichts - so laesst sich gefahrlos deployen, bevor er da ist. */
function isConfigured() {
  return Boolean(process.env.DRIFFT_PM_API_KEY);
}

/** Pipelines und Personen - zum Verifizieren von Key und Mapping. */
async function getMe() {
  const res = await axios.get(BASE_URL + "/api/ext/me", { headers: headers() });
  return res.data;
}

/**
 * Legt einen Task an. external_ref macht den Aufruf idempotent: wird dasselbe
 * Transkript erneut verarbeitet, entsteht kein Duplikat.
 */
async function createTask({ project, title, assignee, due_date, priority, source_url, external_ref }) {
  const body = { project, title };
  if (assignee) body.assignee = assignee;
  if (due_date) body.due_date = due_date;
  if (priority) body.priority = priority;
  if (source_url) body.source_url = source_url;
  if (external_ref) body.external_ref = external_ref;

  const res = await axios.post(BASE_URL + "/api/ext/tasks", body, { headers: headers() });
  return res.data;
}

module.exports = { getMe, createTask, isConfigured };
