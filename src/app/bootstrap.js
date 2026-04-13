import {
  SCOUT_BOT_TOKEN,
  SPARK_BOT_TOKEN,
  FORGE_BOT_TOKEN,
  MIRROR_BOT_TOKEN,
  COORDINATOR_BOT_TOKEN,
} from './env.js';
import { API_RETRIES, REQUEST_TIMEOUT_MS } from './constants.js';
import { retryAsync } from '../utils/retry.js';
import { withTimeout } from '../utils/timeout.js';
import { formatError } from '../utils/errors.js';
import { loadTaskMemory, flushTaskMemory } from '../services/storage/task-repository.js';
import { loadUserProfile, saveUserProfile } from '../services/storage/user-profile-repository.js';
import { saveState, getIsShuttingDown, setIsShuttingDown } from '../state/runtime-state.js';

export async function loginBot(client, token, name) {
  await retryAsync(
    () => withTimeout(() => client.login(token), REQUEST_TIMEOUT_MS, `${name} login`),
    { retries: API_RETRIES, label: `${name} login` }
  );
}

export function registerGracefulShutdown({ clients, healthServer }) {
  async function gracefulShutdown(signal) {
    if (getIsShuttingDown()) return;
    setIsShuttingDown(true);
    console.log(`[shutdown] ${signal} received. Flushing state...`);

    if (saveState.supabaseTimer) {
      clearTimeout(saveState.supabaseTimer);
      saveState.supabaseTimer = null;
    }

    await flushTaskMemory({ local: true, supabase: true });
    await saveUserProfile();

    await Promise.allSettled(clients.map(client => client.destroy()));

    await new Promise(resolve => {
      healthServer.close(() => {
        console.log('[shutdown] health server closed.');
        resolve();
      });
    });
    process.exit(0);
  }

  process.on('SIGTERM', () => {
    void gracefulShutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    void gracefulShutdown('SIGINT');
  });
}

export async function bootstrapDiscordClients({ scout, spark, forge, mirror, coordinator }) {
  try {
    console.log('[startup] Loading persisted state from Supabase (fallback JSON only if needed)...');
    await loadTaskMemory();
    await loadUserProfile();

    console.log('[startup] Logging in Discord clients...');
    await Promise.all([
      loginBot(scout, SCOUT_BOT_TOKEN, 'Scout'),
      loginBot(spark, SPARK_BOT_TOKEN, 'Spark'),
      loginBot(forge, FORGE_BOT_TOKEN, 'Forge'),
      loginBot(mirror, MIRROR_BOT_TOKEN, 'Mirror'),
      loginBot(coordinator, COORDINATOR_BOT_TOKEN, 'Coordinator'),
    ]);
    console.log('[startup] All Discord clients login initiated.');
  } catch (error) {
    console.error('[startup] fatal error:', formatError(error));
    process.exit(1);
  }
}
