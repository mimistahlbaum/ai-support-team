import path from 'path';

const PORT = process.env.PORT || 10000;
const DISCORD_SAFE_LIMIT = 1800;
const MAX_DYNAMIC_TURNS = 6;
const TEXT_MODEL = 'llama-3.1-8b-instant';
const JSON_MODEL = 'llama-3.1-8b-instant';

const MIGRATION_FALLBACK_TASK_MEMORY_FILE = path.join(process.cwd(), 'task_memory.json');
const MIGRATION_FALLBACK_PROFILE_FILE = path.join(process.cwd(), 'user_profile.json');
const MANUAL_BACKUP_TASK_MEMORY_FILE = path.join(process.cwd(), 'task_memory.backup.json');
const MANUAL_BACKUP_PROFILE_FILE = path.join(process.cwd(), 'user_profile.backup.json');

const REQUEST_TIMEOUT_MS = 25000;
const SAFE_JSON_REQUEST_TIMEOUT_MS = 30000;
const SEND_TIMEOUT_MS = 8000;
const API_RETRIES = 2;
const SEND_RETRIES = 2;
const SAVE_DEBOUNCE_SUPABASE_MS = 5000;

export {
  PORT,
  DISCORD_SAFE_LIMIT,
  MAX_DYNAMIC_TURNS,
  TEXT_MODEL,
  JSON_MODEL,
  MIGRATION_FALLBACK_TASK_MEMORY_FILE,
  MIGRATION_FALLBACK_PROFILE_FILE,
  MANUAL_BACKUP_TASK_MEMORY_FILE,
  MANUAL_BACKUP_PROFILE_FILE,
  REQUEST_TIMEOUT_MS,
  SAFE_JSON_REQUEST_TIMEOUT_MS,
  SEND_TIMEOUT_MS,
  API_RETRIES,
  SEND_RETRIES,
  SAVE_DEBOUNCE_SUPABASE_MS,
};
