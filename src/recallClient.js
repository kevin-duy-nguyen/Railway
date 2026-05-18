const axios = require("axios");

const BASE_URL = "https://us-west-2.recall.ai/api/v1";

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

module.exports = { getBot, getTranscript };
