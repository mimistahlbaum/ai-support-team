import { REQUEST_TIMEOUT_MS, API_RETRIES, MIGRATION_FALLBACK_PROFILE_FILE } from '../../app/constants.js';
import { nowIso } from '../../utils/time.js';
import { formatError } from '../../utils/errors.js';
import { withTimeout } from '../../utils/timeout.js';
import { retryAsync } from '../../utils/retry.js';
import { supabase } from './supabase-client.js';
import { getUserProfile, setUserProfile } from '../../state/runtime-state.js';
import { loadFallbackJson } from './migration-fallback.js';

export async function loadUserProfile() {
  try {
    const { data, error } = await retryAsync(
      () => withTimeout(
        () => supabase.from('bot_storage').select('value').eq('key', 'user_profile').maybeSingle(),
        REQUEST_TIMEOUT_MS,
        'supabase load user_profile'
      ),
      { retries: API_RETRIES, label: 'load user profile from supabase' }
    );

    if (!error && data?.value) {
      setUserProfile(data.value);
      console.log('Loaded user profile from Supabase.');
      return;
    }

    if (error) {
      console.warn(`Supabase user_profile load failed; using migration fallback if available: ${error.message}`);
    } else {
      console.warn('Supabase user_profile not found; using migration fallback if available.');
    }

    const parsed = loadFallbackJson(MIGRATION_FALLBACK_PROFILE_FILE);
    setUserProfile(parsed || {});
    if (parsed) {
      console.log('Loaded user profile from migration fallback JSON.');
    }
  } catch (error) {
    console.error('Failed to load user profile:', formatError(error));
    setUserProfile({});
  }
}

export async function saveUserProfile() {
  try {
    const { error } = await retryAsync(
      () => withTimeout(
        () => supabase.from('bot_storage').upsert({ key: 'user_profile', value: getUserProfile(), updated_at: nowIso() }),
        REQUEST_TIMEOUT_MS,
        'save user profile'
      ),
      { retries: API_RETRIES, label: 'save user profile to supabase' }
    );

    if (error) {
      console.error('Failed to save user profile to Supabase:', error.message);
    }
  } catch (error) {
    console.error('Failed to save user profile:', formatError(error));
  }
}
