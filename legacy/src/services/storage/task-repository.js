import { REQUEST_TIMEOUT_MS, API_RETRIES, SAVE_DEBOUNCE_SUPABASE_MS, MIGRATION_FALLBACK_TASK_MEMORY_FILE } from '../../app/constants.js';
import { nowIso } from '../../utils/time.js';
import { formatError } from '../../utils/errors.js';
import { withTimeout } from '../../utils/timeout.js';
import { retryAsync } from '../../utils/retry.js';
import { supabase } from './supabase-client.js';
import { taskMemory, saveState } from '../../state/runtime-state.js';
import { normalizeTask } from '../../domain/task-model.js';
import { writeManualBackups } from './backup-files.js';
import { loadFallbackJson } from './migration-fallback.js';

export function serializeTaskMemory() {
  return Object.fromEntries(taskMemory);
}

export async function saveTaskMemorySupabase() {
  const data = serializeTaskMemory();
  const { error } = await retryAsync(
    () => withTimeout(
      () => supabase.from('bot_storage').upsert({
        key: 'task_memory',
        value: data,
        updated_at: nowIso(),
      }),
      REQUEST_TIMEOUT_MS,
      'supabase upsert task_memory'
    ),
    { retries: API_RETRIES, label: 'save task memory to supabase' }
  );

  if (error) {
    throw new Error(error.message || 'unknown supabase error');
  }
}

export async function flushTaskMemory({ local = false, supabase: remote = true } = {}) {
  try {
    if (local) writeManualBackups();
    if (remote) await saveTaskMemorySupabase();
  } catch (error) {
    console.error('flushTaskMemory failed:', formatError(error));
  }
}

export function scheduleTaskMemorySave({ local = false, supabase: remote = true, immediate = false } = {}) {
  if (immediate) {
    if (saveState.supabaseTimer) clearTimeout(saveState.supabaseTimer);
    saveState.supabaseTimer = null;
    saveState.pendingSupabase = false;
    void flushTaskMemory({ local, supabase: remote });
    return;
  }

  if (local) {
    console.warn('local task memory save requested explicitly (migration/manual backup mode).');
    void flushTaskMemory({ local: true, supabase: false });
  }

  if (remote) {
    saveState.pendingSupabase = true;
    if (saveState.supabaseTimer) clearTimeout(saveState.supabaseTimer);
    saveState.supabaseTimer = setTimeout(() => {
      saveState.supabaseTimer = null;
      if (!saveState.pendingSupabase) return;
      saveState.pendingSupabase = false;
      void saveTaskMemorySupabase().catch(error => {
        console.error('supabase task memory save failed:', formatError(error));
      });
    }, SAVE_DEBOUNCE_SUPABASE_MS);
  }
}

export async function loadTaskMemory() {
  try {
    const { data, error } = await retryAsync(
      () => withTimeout(
        () => supabase.from('bot_storage').select('value').eq('key', 'task_memory').maybeSingle(),
        REQUEST_TIMEOUT_MS,
        'supabase load task_memory'
      ),
      { retries: API_RETRIES, label: 'load task memory from supabase' }
    );

    if (!error && data?.value) {
      taskMemory.clear();
      for (const [key, value] of Object.entries(data.value)) {
        taskMemory.set(key, normalizeTask(value));
      }
      console.log(`Loaded ${taskMemory.size} task memories from Supabase.`);
      return;
    }

    if (error) {
      console.warn(`Supabase task_memory load failed; using migration fallback if available: ${error.message}`);
    } else {
      console.warn('Supabase task_memory not found; using migration fallback if available.');
    }

    const parsed = loadFallbackJson(MIGRATION_FALLBACK_TASK_MEMORY_FILE);
    if (!parsed) return;

    taskMemory.clear();
    for (const [key, value] of Object.entries(parsed)) {
      taskMemory.set(key, normalizeTask(value));
    }
    console.log(`Loaded ${taskMemory.size} task memories from migration fallback JSON.`);
  } catch (error) {
    console.error('Failed to load task memory:', formatError(error));
  }
}
