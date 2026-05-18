/**
 * Converts the Recall.ai transcript array into plain text suitable for the Claude prompt.
 * Recall returns an array of speaker segments:
 * [{ speaker: "Alice", words: [{ text: "Hello", start_time: 0, end_time: 0.5 }, ...] }, ...]
 */
function formatTranscript(transcriptData) {
  if (!Array.isArray(transcriptData) || transcriptData.length === 0) {
    return "";
  }

  return transcriptData
    .map((segment) => {
      const speaker = segment.speaker || "Unknown";
      const words = Array.isArray(segment.words)
        ? segment.words.map((w) => w.text).join(" ")
        : "";
      return `${speaker}: ${words}`;
    })
    .join("\n");
}

module.exports = { formatTranscript };
