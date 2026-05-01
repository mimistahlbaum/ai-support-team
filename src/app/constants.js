import path from 'path';

const PORT = process.env.PORT || 10000;
const DISCORD_SAFE_LIMIT = 1900;  // safe margin below Discord's 2000-char message/reply limit
const NOTION_BLOCK_LIMIT = 1900;  // safe margin below Notion API's 2000-char rich_text block limit
const MAX_DYNAMIC_TURNS = 6;
const MAX_QUEUE_SIZE = 5;
const TEXT_MODEL = 'llama-3.1-8b-instant';
const JSON_MODEL = 'llama-3.1-8b-instant';
const OPENAI_FALLBACK_MODEL = 'gpt-4o-mini';
const AUTO_RETRY_DELAY_MS = 30000; // 30秒後に自動リトライ
const MAX_AUTO_RETRIES = 3;        // この回数を超えたらエスカレーション

const MIGRATION_FALLBACK_TASK_MEMORY_FILE = path.join(process.cwd(), 'task_memory.json');
const MIGRATION_FALLBACK_PROFILE_FILE = path.join(process.cwd(), 'user_profile.json');
const MANUAL_BACKUP_TASK_MEMORY_FILE = path.join(process.cwd(), 'task_memory.backup.json');
const MANUAL_BACKUP_PROFILE_FILE = path.join(process.cwd(), 'user_profile.backup.json');

const ONE_DAY_MS  = 24 * 60 * 60 * 1000;
const ONE_WEEK_MS = 7 * ONE_DAY_MS;

const REQUEST_TIMEOUT_MS = 25000;
const LOGIN_TIMEOUT_MS = 60000;        // Discord login can be slow on cold starts
const SEND_TIMEOUT_MS = 8000;
const API_RETRIES = 2;
const SEND_RETRIES = 2;
const SAVE_DEBOUNCE_SUPABASE_MS = 5000;
const HEALTHCHECK_MAX_STALE_MS = Number(process.env.HEALTHCHECK_MAX_STALE_MS || 180000);
const HEALTHCHECK_INTERVAL_MS = Number(process.env.HEALTHCHECK_INTERVAL_MS || 60000);
const ALERT_COOLDOWN_MS = Number(process.env.ALERT_COOLDOWN_MS || 300000);
// Upper bound for fire-and-forget background tasks that must not hang indefinitely
const PROACTIVE_RUN_TIMEOUT_MS = 5 * 60 * 1000;   // 5 min
const SCOUT_RUN_TIMEOUT_MS     = 10 * 60 * 1000;   // 10 min (up to 20 events × 90s reaction window)

// Rate-limit guards between Discord API calls
const CHANNEL_ORGANIZER_RATE_LIMIT_SHORT_MS  = 300;   // between archive moves
const CHANNEL_ORGANIZER_RATE_LIMIT_LONG_MS   = 500;   // between channel deletions
const CALENDAR_SCOUT_PROPOSAL_PAUSE_MS       = 2000;  // between task proposals

export {
  PORT,
  DISCORD_SAFE_LIMIT,
  NOTION_BLOCK_LIMIT,
  MAX_DYNAMIC_TURNS,
  MAX_QUEUE_SIZE,
  TEXT_MODEL,
  JSON_MODEL,
  OPENAI_FALLBACK_MODEL,
  AUTO_RETRY_DELAY_MS,
  MAX_AUTO_RETRIES,
  LOGIN_TIMEOUT_MS,
  MIGRATION_FALLBACK_TASK_MEMORY_FILE,
  MIGRATION_FALLBACK_PROFILE_FILE,
  MANUAL_BACKUP_TASK_MEMORY_FILE,
  MANUAL_BACKUP_PROFILE_FILE,
  REQUEST_TIMEOUT_MS,
  SEND_TIMEOUT_MS,
  API_RETRIES,
  SEND_RETRIES,
  SAVE_DEBOUNCE_SUPABASE_MS,
  HEALTHCHECK_MAX_STALE_MS,
  HEALTHCHECK_INTERVAL_MS,
  ALERT_COOLDOWN_MS,
  PROACTIVE_RUN_TIMEOUT_MS,
  SCOUT_RUN_TIMEOUT_MS,
  CHANNEL_ORGANIZER_RATE_LIMIT_SHORT_MS,
  CHANNEL_ORGANIZER_RATE_LIMIT_LONG_MS,
  CALENDAR_SCOUT_PROPOSAL_PAUSE_MS,
  ONE_DAY_MS,
  ONE_WEEK_MS,
};
