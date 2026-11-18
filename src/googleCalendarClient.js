const axios = require("axios");
const { getAccessToken } = require("./googleAuth");

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
        params: { timeMin, timeMax, singleEvents: true, orderBy: "startTime", maxResults: 50 },
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
