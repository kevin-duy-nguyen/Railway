const axios = require("axios");

const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;

async function getAccessToken() {
  const res = await axios.post("https://oauth2.googleapis.com/token", {
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    refresh_token: REFRESH_TOKEN,
    grant_type: "refresh_token",
  });
  return res.data.access_token;
}

async function getMeetingTitleFromGoogle(meetingUrl) {
  try {
    const accessToken = await getAccessToken();
    const now = new Date();
    const timeMin = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const timeMax = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

    const res = await axios.get(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: {
          timeMin,
          timeMax,
          singleEvents: true,
          orderBy: "startTime",
          maxResults: 50,
        },
      }
    );

    const events = res.data.items || [];
    const match = events.find((e) => {
      const link = e.hangoutLink || e.location || JSON.stringify(e.conferenceData || {});
      return link && meetingUrl && link.includes(meetingUrl);
    });

    return match?.summary || "";
  } catch (err) {
    console.error("[googleCalendar] Error fetching title:", err.message);
    return "";
  }
}

module.exports = { getMeetingTitleFromGoogle };
