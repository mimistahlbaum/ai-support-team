import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('[migrate] Missing SUPABASE_URL or SUPABASE_ANON_KEY.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const MIGRATION_FILES = [
  { key: 'task_memory', file: path.join(process.cwd(), 'task_memory.json') },
  { key: 'user_profile', file: path.join(process.cwd(), 'user_profile.json') },
];

function objectCount(value) {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === 'object') return Object.keys(value).length;
  return 0;
}

async function getExistingKeys() {
  const keys = MIGRATION_FILES.map(item => item.key);
  const { data, error } = await supabase.from('bot_storage').select('key').in('key', keys);
  if (error) throw new Error(`failed to check existing keys: ${error.message}`);
  return new Set((data || []).map(row => row.key));
}

async function main() {
  console.log('[migrate] Start local JSON -> Supabase migration.');
  const payload = [];

  for (const item of MIGRATION_FILES) {
    if (!fs.existsSync(item.file)) {
      console.log(`[migrate] ${item.key}: local file not found, skip (${item.file})`);
      continue;
    }

    const raw = fs.readFileSync(item.file, 'utf8');
    if (!raw.trim()) {
      console.log(`[migrate] ${item.key}: file is empty, skip (${item.file})`);
      continue;
    }

    try {
      const value = JSON.parse(raw);
      payload.push({
        key: item.key,
        value,
        updated_at: new Date().toISOString(),
      });
      console.log(`[migrate] ${item.key}: loaded (${objectCount(value)} top-level entries).`);
    } catch (error) {
      console.error(`[migrate] ${item.key}: invalid JSON, skip (${item.file}) -> ${error.message}`);
    }
  }

  if (payload.length === 0) {
    console.log('[migrate] No migration targets found. Nothing to upsert.');
    return;
  }

  const existingKeys = await getExistingKeys();
  for (const item of payload) {
    if (existingKeys.has(item.key)) {
      console.warn(`[migrate] WARNING: key='${item.key}' already exists in bot_storage. It will be overwritten.`);
    }
  }

  const { error } = await supabase.from('bot_storage').upsert(payload);
  if (error) {
    console.error(`[migrate] Migration failed: ${error.message}`);
    process.exit(1);
  }

  console.log(`[migrate] Done. Upserted ${payload.length} key(s): ${payload.map(item => item.key).join(', ')}`);
}

main().catch(error => {
  console.error('[migrate] Unexpected error:', error?.message || error);
  process.exit(1);
});
