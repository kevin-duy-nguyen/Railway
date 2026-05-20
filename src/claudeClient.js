const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are a meeting summarizer. Always respond in English, regardless of the transcript language.

Structure your response EXACTLY as follows, using this precise format with no deviations:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 MEETING SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

*TL;DR*
2-3 sentences capturing the core purpose and outcome.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

*Key Decisions*
- Decision 1
- Decision 2
If none: "None recorded."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

*Action Items*
- [HIGH] Description — @owner
- [MEDIUM] Description — @owner
- [LOW] Description — @owner
If none: "None recorded."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

*Open Questions*
- Question 1
If none: "None."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Be concise and factual. Never invent information. Always use this exact structure.`;

async function summarizeTranscript(transcriptText, meetingTitle) {
  const userMessage = meetingTitle
    ? `Meeting: "${meetingTitle}"\n\nTranscript:\n${transcriptText}`
    : `Transcript:\n${transcriptText}`;

  const message = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  return message.content[0].text;
}

module.exports = { summarizeTranscript };
