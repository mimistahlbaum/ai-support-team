// Provides dummy values for required env vars so modules that import
// src/app/env.js can load under test without a real .env.
// Import this before any module that touches env.js.
const stubValues = {
  DISCORD_GUILD_ID: '100000000000000001',
  SCOUT_BOT_TOKEN: 'test-scout-token',
  SCOUT_CLIENT_ID: '100000000000000002',
  SPARK_BOT_TOKEN: 'test-spark-token',
  SPARK_CLIENT_ID: '100000000000000003',
  FORGE_BOT_TOKEN: 'test-forge-token',
  FORGE_CLIENT_ID: '100000000000000004',
  MIRROR_BOT_TOKEN: 'test-mirror-token',
  MIRROR_CLIENT_ID: '100000000000000005',
  COORDINATOR_BOT_TOKEN: 'test-coordinator-token',
  COORDINATOR_CLIENT_ID: '100000000000000006',
  GROQ_API_KEY: 'test-groq-key',
  TAVILY_API_KEY: 'test-tavily-key',
  NOTION_KEY: 'test-notion-key',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'test-supabase-key',
};

for (const [key, value] of Object.entries(stubValues)) {
  if (!process.env[key]) process.env[key] = value;
}
