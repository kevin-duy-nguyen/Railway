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

const FOLDER_MIME = "application/vnd.google-apps.folder";
let cachedFolderId = null;

/**
 * Liefert den Ordner, in dem die Transkripte liegen.
 *
 * Ist GOOGLE_DRIVE_FOLDER_ID gesetzt, gilt die. Sonst legt Summy den Ordner
 * selbst an - und das ist kein Komfort, sondern noetig: mit dem Scope
 * drive.file sieht die App ausschliesslich Dateien, die sie selbst erzeugt
 * hat. Ein von Hand angelegter Ordner waere fuer sie nicht auffindbar und
 * Drive wuerde das parents-Feld mit "File not found" ablehnen.
 *
 * Nach einem Neustart findet die Suche den eigenen Ordner wieder, weil der
 * Zugriff auf selbst angelegte Dateien bestehen bleibt.
 */
async function ensureFolderId(accessToken) {
  const explicit = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (explicit) return explicit;
  if (cachedFolderId) return cachedFolderId;

  const name = process.env.GOOGLE_DRIVE_FOLDER_NAME || "Summy Transkripte";
  const auth = { Authorization: "Bearer " + accessToken };

  const list = await axios.get("https://www.googleapis.com/drive/v3/files", {
    headers: auth,
    params: {
      q: `mimeType='${FOLDER_MIME}' and name='${name.replace(/'/g, "\\'")}' and trashed=false`,
      fields: "files(id,name)",
      pageSize: 1,
    },
  });
  const found = list.data?.files?.[0];
  if (found) {
    cachedFolderId = found.id;
    return cachedFolderId;
  }

  const created = await axios.post(
    "https://www.googleapis.com/drive/v3/files?fields=id,webViewLink",
    { name, mimeType: FOLDER_MIME },
    { headers: { ...auth, "Content-Type": "application/json" } }
  );
  cachedFolderId = created.data.id;
  console.log(
    `[docs] Ordner "${name}" neu angelegt (${cachedFolderId}). Einmal fuer das Team freigeben: ${created.data.webViewLink || "-"}`
  );
  return cachedFolderId;
}
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
    // Der Ordner regelt die Leserechte. Laesst er sich nicht ermitteln, wird
    // das Doc trotzdem angelegt - lieber in "Meine Ablage" als gar nicht.
    let folderId = null;
    try {
      folderId = await ensureFolderId(accessToken);
    } catch (err) {
      console.warn("[docs] Ordner nicht ermittelbar, lege ohne ab:", err.message);
    }
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

module.exports = {
  createTranscriptDoc,
  docName,
  _resetFolderCache: () => {
    cachedFolderId = null;
  },
};
