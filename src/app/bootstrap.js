import { COORDINATOR_BOT_TOKEN } from './env.js';
import { API_RETRIES, LOGIN_TIMEOUT_MS } from './constants.js';
import { retryAsync } from '../utils/retry.js';
import { withTimeout } from '../utils/timeout.js';
import { formatError } from '../utils/errors.js';
import { loadTaskMemory, flushTaskMemory, scheduleTaskMemorySave } from '../services/storage/task-repository.js';
import { loadSupportCases, flushSupportCases } from '../support/case-memory.js';
import { loadDynamicKbEntries } from '../support/knowledge-store.js';
import { refreshDynamicPool } from '../support/knowledge.js';
import { backfillTaskDeliverableLinks } from '../orchestration/deliverable-registry.js';
import { resetStaleRunningTasks } from '../domain/task-model.js';
import { stopProactiveScheduler } from '../orchestration/proactive-scheduler.js';
import { stopWeeklyScout } from '../orchestration/weekly-scout.js';
import { loadUserProfile, saveUserProfile } from '../services/storage/user-profile-repository.js';
import { saveState, getIsShuttingDown, setIsShuttingDown } from '../state/runtime-state.js';

async function checkDiscordReachable() {
  try {
    const res = await fetch('https://discord.com/api/v10/gateway', {
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function loginBot(client, token, name) {
  await retryAsync(
    () => withTimeout(() => client.login(token), LOGIN_TIMEOUT_MS, `${name} login`),
    { retries: API_RETRIES, label: `${name} login` }
  );
}

export function registerGracefulShutdown({ clients, healthServer, healthMonitor }) {
  async function gracefulShutdown(signal) {
    if (getIsShuttingDown()) return;
    setIsShuttingDown(true);
    console.log(`[shutdown] ${signal} received. Flushing state...`);
    await healthMonitor.sendAlert({
      level: 'INFO',
      reason: `Process shutting down (${signal})`,
      details: `ws=${healthMonitor.getLastEvaluation().discordWsStatus}`,
    });
    healthMonitor.stop();
    stopProactiveScheduler();
    stopWeeklyScout();

    if (saveState.supabaseTimer) {
      clearTimeout(saveState.supabaseTimer);
      saveState.supabaseTimer = null;
    }

    await flushTaskMemory({ local: true, supabase: true });
    await saveUserProfile();
    await flushSupportCases();

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

const CRASH_CLEANUP_TIMEOUT_MS = 5_000;

export function registerCrashHandlers({ healthMonitor }) {
  async function handleFatalError(type, error) {
    const formattedError = formatError(error);
    console.error(`[fatal] ${type}:`, formattedError);

    // Best-effort state persistence before exit; bounded so crashes don't hang
    try {
      await Promise.race([
        (async () => {
          stopProactiveScheduler();
          stopWeeklyScout();
          await flushTaskMemory({ local: true, supabase: true });
          await saveUserProfile();
          await flushSupportCases();
        })(),
        new Promise(resolve => setTimeout(resolve, CRASH_CLEANUP_TIMEOUT_MS)),
      ]);
    } catch { /* ignore cleanup errors */ }

    await healthMonitor.sendAlert({
      level: 'CRITICAL',
      reason: `${type}: ${formattedError}`,
      details: `ws=${healthMonitor.getLastEvaluation().discordWsStatus}`,
    });
    process.exit(1);
  }

  process.on('uncaughtException', error => {
    void handleFatalError('uncaughtException', error);
  });

  process.on('unhandledRejection', reason => {
    void handleFatalError('unhandledRejection', reason);
  });
}

export async function bootstrapDiscordClients({ coordinator }) {
  try {
    console.log('[startup] Loading persisted state from Supabase (fallback JSON only if needed)...');
    await loadTaskMemory();
    await loadUserProfile();
    await loadSupportCases();
    await loadDynamicKbEntries();
    refreshDynamicPool();

    // Reset tasks left in 'running' state by a previous crash
    const staleCount = resetStaleRunningTasks();
    if (staleCount > 0) {
      console.warn(`[startup] Reset ${staleCount} stale 'running' task(s) to 'error'.`);
      scheduleTaskMemorySave({ immediate: true });
    }

    // Backfill producedDeliverableIds for pre-existing task↔deliverable links (idempotent)
    backfillTaskDeliverableLinks().catch(e =>
      console.warn('[startup] deliverable backfill failed:', e?.message)
    );

    console.log('[startup] Checking Discord API reachability...');
    const discordReachable = await checkDiscordReachable();
    if (!discordReachable) {
      console.error('[startup] WARNING: Discord API (discord.com/api/v10/gateway) is not reachable.');
      console.error('[startup] Possible causes: firewall blocking outbound HTTPS, DNS failure, or Discord outage.');
      console.error('[startup] Check https://discordstatus.com/ and verify outbound port 443 is open.');
    } else {
      console.log('[startup] Discord API reachable. Logging in...');
    }

    await loginBot(coordinator, COORDINATOR_BOT_TOKEN, 'Coordinator');
    console.log('[startup] Coordinator login initiated.');
  } catch (error) {
    console.error('[startup] fatal error:', formatError(error));
    process.exit(1);
  }
}
