const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are a meeting summarizer. Structure the provided meeting transcript into the following sections using Slack mrkdwn formatting:

*TL;DR*
2-3 sentences capturing the core purpose and outcome of the meeting.

*Key Decisions*
Bullet list of decisions made. If none, write "None recorded."

*Action Items*
Each item on its own line with priority tag and owner if mentioned:
• [HIGH] Description — @owner
• [MEDIUM] Description — @owner
• [LOW] Description — @owner
If none, write "None recorded."

*Open Questions*
Bullet list of unresolved questions or topics needing follow-up. If none, write "None."

Be concise and factual. Do not invent information not present in the transcript.`;

async function summarizeTranscript(transcriptText, meetingTitle) {
  const userMessage = meetingTitle
    ? `Meeting: "${meetingTitle}"\n\nTranscript:\n${transcriptText}`
    : `Transcript:\n${transcriptText}`;

  const message = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  return message.content[0].text;
}

module.exports = { summarizeTranscript };
