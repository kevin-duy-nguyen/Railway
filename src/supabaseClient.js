const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function saveMeetingTitle(botId, title) {
  const { error } = await supabase
    .from("meeting_titles")
    .upsert({ bot_id: botId, title });
  if (error) console.error("[supabase] saveMeetingTitle error:", error.message);
}

async function getMeetingTitle(botId) {
  const { data, error } = await supabase
    .from("meeting_titles")
    .select("title")
    .eq("bot_id", botId)
    .single();
  if (error) return null;
  return data?.title || null;
}

module.exports = { saveMeetingTitle, getMeetingTitle };
