const axios = require("axios");
const { getAccessToken, isConfigured } = require("./googleAuth");

/**
 * Legt das Volltext-Transkript als Google Doc ab und liefert dessen Link.
 *
 * Warum ueberhaupt: Recalls eigener Download-Link ist eine signierte S3-URL,
 * die nach wenigen Stunden tot ist. In Slack gepostet waere sie genau dann
 * kaputt, wenn am naechsten Morgen jemand draufklickt. Ein Doc-Link bleibt.
 *
 * Komplett best-effort: ohne Konfiguration oder bei jedem Fehler kommt null
 * zurueck, die Zusammenfassung geht dann ohne Link raus wie bisher.
 */

const UPLOAD_URL =
  "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink";

function docName(meetingTitle, date) {
  // Datum zuerst, damit der Ordner sich von selbst chronologisch sortiert.
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  return meetingTitle ? `${iso} — ${meetingTitle}` : `${iso} — Meeting`;
}

function docBody(meetingTitle, transcriptText, date) {
  const stamp = new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    dateStyle: "full",
    timeStyle: "short",
  }).format(date);
  return [
    meetingTitle || "Meeting",
    stamp,
    "",
    "Vollstaendiges Transkript, automatisch abgelegt von Summy.",
    "",
    "----------------------------------------",
    "",
    transcriptText,
  ].join("\n");
}

/**
 * @returns {Promise<string|null>} webViewLink des Docs oder null
 */
async function createTranscriptDoc({ meetingTitle = "", transcriptText = "", date = new Date() } = {}) {
  if (!isConfigured()) {
    console.log("[docs] Keine Google-Zugangsdaten - Transkript-Doc uebersprungen.");
    return null;
  }
  if (!transcriptText) {
    console.log("[docs] Leeres Transkript - nichts abzulegen.");
    return null;
  }

  try {
    const accessToken = await getAccessToken();

    const metadata = {
      name: docName(meetingTitle, date),
      // Diese mimeType-Angabe ist der ganze Trick: Drive wandelt den
      // hochgeladenen Text beim Anlegen in ein echtes Google Doc um.
      mimeType: "application/vnd.google-apps.document",
    };
    // Ohne Ordner landet das Doc in "Meine Ablage" des autorisierten Kontos und
    // sieht erstmal niemand sonst. Der Ordner regelt die Leserechte.
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    if (folderId) metadata.parents = [folderId];

    const boundary = "summy-" + Date.now();
    const body =
      `--${boundary}\r\n` +
      "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
      JSON.stringify(metadata) +
      `\r\n--${boundary}\r\n` +
      "Content-Type: text/plain; charset=UTF-8\r\n\r\n" +
      docBody(meetingTitle, transcriptText, date) +
      `\r\n--${boundary}--\r\n`;

    const res = await axios.post(UPLOAD_URL, body, {
      headers: {
        Authorization: "Bearer " + accessToken,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });

    const url = res.data?.webViewLink || null;
    if (url) console.log(`[docs] Transkript abgelegt: ${res.data.id}`);
    else console.warn("[docs] Doc angelegt, aber kein webViewLink in der Antwort.");
    return url;
  } catch (err) {
    console.error("[docs] Transkript-Doc fehlgeschlagen:", err.message);
    const detail = err.response?.data;
    if (detail) console.error("[docs]", JSON.stringify(detail).slice(0, 500));
    return null;
  }
}

module.exports = { createTranscriptDoc, docName };
