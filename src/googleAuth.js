const axios = require("axios");

/**
 * Google-Zugriffstoken aus dem Refresh-Token.
 *
 * Eine Stelle fuer alle Google-Aufrufe. Die Scopes haengen am Refresh-Token und
 * werden einmal bei der Zustimmung festgelegt - ein Token mit Kalender-Scope
 * kann keine Docs anlegen, egal was der Code aufruft.
 */

let cached = { token: null, expiresAt: 0 };

function isConfigured() {
  return Boolean(
    process.env.GOOGLE_OAUTH_CLIENT_ID &&
      process.env.GOOGLE_OAUTH_CLIENT_SECRET &&
      process.env.GOOGLE_OAUTH_REFRESH_TOKEN
  );
}

async function getAccessToken() {
  // Das Token gilt rund eine Stunde. Eine Minute Sicherheitsabstand, damit es
  // nicht mitten in einem Aufruf ablaeuft.
  if (cached.token && Date.now() < cached.expiresAt) return cached.token;

  const res = await axios.post("https://oauth2.googleapis.com/token", {
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID,
    client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN,
    grant_type: "refresh_token",
  });

  const token = res.data?.access_token;
  if (!token) throw new Error("Kein access_token in der Google-Antwort");

  const ttlSec = Number(res.data.expires_in) || 3600;
  cached = { token, expiresAt: Date.now() + (ttlSec - 60) * 1000 };
  return token;
}

/** Nur fuer Tests. */
function _resetCache() {
  cached = { token: null, expiresAt: 0 };
}

module.exports = { getAccessToken, isConfigured, _resetCache };
