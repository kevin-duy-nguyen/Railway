const axios = require("axios");

const BASE_URL = `https://${process.env.RECALL_REGION || "us-west-2"}.recall.ai/api/v1`;

function headers() {
  return {
    Authorization: `Token ${process.env.RECALL_API_KEY}`,
    "Content-Type": "application/json",
  };
}

async function getBot(botId) {
  const res = await axios.get(`${BASE_URL}/bot/${botId}/`, { headers: headers() });
  return res.data;
}

async function getTranscript(botId) {
  const res = await axios.get(`${BASE_URL}/bot/${botId}/transcript/`, { headers: headers() });
  return res.data;
}

async function createTranscript(recordingId) {
  const res = await axios.post(
    `${BASE_URL}/recording/${recordingId}/create_transcript/`,
    { provider: { recallai_async: {} } },
    { headers: headers() }
  );
  return res.data;
}

async function getTranscriptDownloadUrl(transcriptId) {
  const res = await axios.get(`${BASE_URL}/transcript/${transcriptId}/`, { headers: headers() });
  return res.data?.download_url || res.data?.data?.download_url || null;
}

async function downloadTranscript(downloadUrl) {
  const res = await axios.get(downloadUrl);
  return res.data;
}

async function getCalendarEventByBotId(botId) {
  const bot = await getBot(botId);
  const calMeetingId = bot?.calendar_meetings?.[0]?.id;
  if (!calMeetingId) return null;
  const calUserId = bot?.calendar_meetings?.[0]?.calendar_user?.id;
  if (!calUserId) return null;
  const res = await axios.get(
    `https://${process.env.RECALL_REGION || "us-west-2"}.recall.ai/api/v1/calendar/v1/${calUserId}/events/${calMeetingId}/`,
    { headers: headers() }
  );
  return res.data;
}

module.exports = { getBot, getTranscript, createTranscript, getTranscriptDownloadUrl, downloadTranscript, getCalendarEventByBotId };
