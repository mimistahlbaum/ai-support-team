import 'dotenv/config';

const {
  DISCORD_GUILD_ID,
  COORDINATOR_BOT_TOKEN,
  COORDINATOR_CLIENT_ID,
  GROQ_API_KEY,
  TAVILY_API_KEY,
  NOTION_KEY,
  SUPABASE_SERVICE_ROLE_KEY,
  TASK_ADMIN_ROLE_ID,
  OPENAI_API_KEY,
} = process.env;

// Sanitise SUPABASE_URL: strip surrounding whitespace and quotes (common
// copy-paste artefacts from Railway/Render variable forms).
const SUPABASE_URL = (process.env.SUPABASE_URL || '')
  .trim()
  .replace(/^["']|["']$/g, '')
  .replace(/\/+$/, '');

const REQUIRED_VARS = {
  DISCORD_GUILD_ID,
  COORDINATOR_BOT_TOKEN,
  COORDINATOR_CLIENT_ID,
  GROQ_API_KEY,
  TAVILY_API_KEY,
  NOTION_KEY,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
};

const missingVars = Object.entries(REQUIRED_VARS)
  .filter(([, v]) => !v)
  .map(([k]) => k);

if (missingVars.length > 0) {
  console.error(`Missing required environment variables: ${missingVars.join(', ')}`);
  process.exit(1);
}

if (!/^https:\/\/[^/]+\.supabase\.co$/i.test(SUPABASE_URL)) {
  console.error(
    `Invalid SUPABASE_URL: "${SUPABASE_URL}"\n` +
    '  Expected format: https://<project-ref>.supabase.co\n' +
    '  Copy the Project URL from Supabase Dashboard → Settings → API.'
  );
  process.exit(1);
}

export {
  DISCORD_GUILD_ID,
  COORDINATOR_BOT_TOKEN,
  COORDINATOR_CLIENT_ID,
  GROQ_API_KEY,
  TAVILY_API_KEY,
  NOTION_KEY,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  TASK_ADMIN_ROLE_ID,
  OPENAI_API_KEY,
};
