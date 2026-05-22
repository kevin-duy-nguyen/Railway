require("dotenv").config();

const express = require("express");
const { handleWebhook } = require("./webhookHandler");

const REQUIRED_ENV = ["RECALL_API_KEY", "ANTHROPIC_API_KEY", "SLACK_BOT_TOKEN", "SLACK_CHANNEL_ID"];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error(`Missing required environment variables: ${missing.join(", ")}`);
  console.error("Copy .env.example to .env and fill in the values.");
  process.exit(1);
}

const app = express();
app.use(express.json());

app.post("/webhook", handleWebhook);

app.get("/health", (_req, res) => res.json({ status: "ok" }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhook`);
});

app.get("/oauth/callback", (req, res) => {
  res.send("OAuth callback received: " + JSON.stringify(req.query));
});
