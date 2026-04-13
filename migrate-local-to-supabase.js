import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const MIGRATION_FILES = [
  { key: 'task_memory', file: path.join(process.cwd(), 'task_memory.json') },
  { key: 'user_profile', file: path.join(process.cwd(), 'user_profile.json') },
];

async function getExistingKey(key) {
  const { data, error } = await supabase.from('bot_storage').select('key').eq('key', key).maybeSingle();
  if (error) throw new Error(`failed to check existing key (${key}): ${error.message}`);
  return Boolean(data?.key);
}

async function main() {
  const existingFiles = [];

  for (const item of MIGRATION_FILES) {
    if (!fs.existsSync(item.file)) {
      console.warn(`Skip ${item.key}: file not found (${item.file})`);
      continue;
    }

    const raw = fs.readFileSync(item.file, 'utf8');
    if (!raw.trim()) {
      console.warn(`Skip ${item.key}: file is empty (${item.file})`);
      continue;
    }

    let value;
    try {
      value = JSON.parse(raw);
    } catch (error) {
      console.error(`Skip ${item.key}: invalid JSON (${item.file}) -> ${error.message}`);
      continue;
    }

    existingFiles.push({ key: item.key, value });
  }

  if (existingFiles.length === 0) {
    console.log('No migration targets found. Nothing to upsert.');
    return;
  }

  for (const item of existingFiles) {
    const exists = await getExistingKey(item.key);
    if (exists) {
      console.warn(`Warning: bot_storage already has key='${item.key}'. It will be overwritten by upsert.`);
    }
  }

  const payload = existingFiles.map(item => ({
    key: item.key,
    value: item.value,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase.from('bot_storage').upsert(payload);
  if (error) {
    console.error(`Migration failed: ${error.message}`);
    process.exit(1);
  }

  console.log(`Migration completed. Upserted ${payload.length} key(s).`);
  for (const item of payload) {
    console.log(`- ${item.key}`);
  }
}

main().catch(error => {
  console.error('Migration error:', error.message || error);
  process.exit(1);
});
