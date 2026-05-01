import pkg from 'discord.js';
import {
  ALERT_COOLDOWN_MS,
  HEALTHCHECK_INTERVAL_MS,
  HEALTHCHECK_MAX_STALE_MS,
} from './constants.js';

const { WebSocketStatus } = pkg ?? {};
const WS_READY =
  WebSocketStatus?.Ready ??
  WebSocketStatus?.READY ??
  0;

const STATUS_LABELS = WebSocketStatus
  ? Object.fromEntries(
      Object.entries(WebSocketStatus)
        .filter(([, value]) => typeof value === 'number')
        .map(([key, value]) => [value, key])
    )
  : {
      0: 'Ready',
      1: 'Connecting',
      2: 'Reconnecting',
      3: 'Idle',
      4: 'Nearly',
      5: 'Disconnected',
      6: 'WaitingForGuilds',
      7: 'Identifying',
      8: 'Resuming',
    };

function getWsStatusLabel(status) {
  return STATUS_LABELS[status] ?? `Unknown(${status ?? 'n/a'})`;
}

function parsePositiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function formatUptimeSeconds() {
  return Math.floor(process.uptime());
}

const ALERT_COLORS = {
  CRITICAL: 0xe74c3c,
  WARN: 0xe67e22,
  RECOVERY: 0x2ecc71,
  INFO: 0x3498db,
};

const ALERT_ICONS = {
  CRITICAL: '🔴',
  WARN: '🟡',
  RECOVERY: '🟢',
  INFO: 'ℹ️',
};

/**
 * Pure status classifier — exported for tests.
 * clientStates: Array<{ name, loggedIn, ready, wsUsable }>
 * staleMs: milliseconds since last heartbeat
 * maxStaleMs: threshold above which heartbeat is considered stale
 * Returns: 'healthy' | 'degraded' | 'down'
 */
export function classifyHealthStatus(clientStates, staleMs, maxStaleMs) {
  if (staleMs > maxStaleMs) return 'down';
  const disconnected = clientStates.filter(s => !s.loggedIn || !s.ready || !s.wsUsable);
  if (disconnected.length === 0) return 'healthy';
  return disconnected.some(s => s.name === 'coordinator') ? 'down' : 'degraded';
}

const DISCORD_WEBHOOK_RE = /^https:\/\/discord(?:app)?\.com\/api\/webhooks\/\d+\/.+/;

export function createDiscordAlertSender({ serviceName }) {
  const rawWebhookUrl = process.env.DISCORD_ALERT_WEBHOOK_URL;
  const webhookUrl = rawWebhookUrl && DISCORD_WEBHOOK_RE.test(rawWebhookUrl) ? rawWebhookUrl : null;
  if (rawWebhookUrl && !webhookUrl) {
    console.warn('[alert] DISCORD_ALERT_WEBHOOK_URL is set but does not look like a valid Discord webhook URL — alerts disabled.');
  } else if (!rawWebhookUrl) {
    console.warn('[alert] DISCORD_ALERT_WEBHOOK_URL not set — crash / unhealthy / recovery alerts will NOT be sent. Set this to receive operational notifications.');
  }
  const environment = process.env.RENDER_ENVIRONMENT || process.env.NODE_ENV || 'unknown';
  const renderServiceId = process.env.RENDER_SERVICE_ID;
  const dashboardUrl = renderServiceId
    ? `https://dashboard.render.com/web/${renderServiceId}`
    : null;

  async function sendAlert({ level = 'WARN', reason, details = '' }) {
    if (!webhookUrl) return;

    const icon = ALERT_ICONS[level] ?? '⚠️';
    const color = ALERT_COLORS[level] ?? 0x95a5a6;

    const embedFields = [
      { name: 'Environment', value: environment, inline: true },
      { name: 'Uptime', value: `${formatUptimeSeconds()}s`, inline: true },
    ];
    if (details) embedFields.push({ name: 'Details', value: details, inline: false });
    if (dashboardUrl) embedFields.push({ name: 'Dashboard', value: dashboardUrl, inline: false });

    const payload = {
      embeds: [{
        title: `${icon} ${serviceName} — ${level}`,
        description: reason || '(no reason)',
        color,
        fields: embedFields,
        timestamp: new Date().toISOString(),
      }],
    };

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        console.error(`[alert] webhook failed: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error('[alert] webhook request failed:', error?.message ?? error);
    }
  }

  return { sendAlert, environment };
}

export function createHealthMonitor({ clients, checkSupabase, serviceName = 'ai-chat-support-group' }) {
  const maxStaleMs = parsePositiveNumber(process.env.HEALTHCHECK_MAX_STALE_MS, HEALTHCHECK_MAX_STALE_MS);
  const intervalMs = parsePositiveNumber(process.env.HEALTHCHECK_INTERVAL_MS, HEALTHCHECK_INTERVAL_MS);
  const cooldownMs = parsePositiveNumber(process.env.ALERT_COOLDOWN_MS, ALERT_COOLDOWN_MS);
  const version = process.env.RENDER_GIT_COMMIT || process.env.COMMIT_SHA || process.env.npm_package_version || 'unknown';
  const { sendAlert, environment } = createDiscordAlertSender({ serviceName });

  let lastHeartbeatAt = Date.now();
  let intervalHandle = null;
  let unhealthySince = null;
  let currentState = 'healthy';
  let lastCriticalAlertAt = 0;
  let lastRecoveryAlertAt = 0;
  let lastEvaluation = null;
  let supabaseOk = true;      // optimistic until first check
  let supabaseLatencyMs = null;
  let lastSupabaseAlertAt = 0;

  for (const [name, client] of Object.entries(clients)) {
    client.on('clientReady', () => {
      lastHeartbeatAt = Date.now();
      console.log(`[health] ${name} ready`);
    });
    client.on('shardResume', () => {
      lastHeartbeatAt = Date.now();
    });
  }

  // 'down'   — coordinator disconnected or heartbeat stale; ok=false, /health returns 503
  // 'degraded' — only non-coordinator agents disconnected; ok=true, still functional
  // 'healthy' — all clients connected and heartbeat fresh
  function evaluateStatus(clientStates, staleMs) {
    return classifyHealthStatus(clientStates, staleMs, maxStaleMs);
  }

  async function runSupabaseCheck() {
    if (!checkSupabase) return;
    const start = Date.now();
    try {
      const ok = await checkSupabase();
      supabaseOk = ok;
      supabaseLatencyMs = Date.now() - start;
    } catch {
      supabaseOk = false;
      supabaseLatencyMs = null;
    }
  }

  function evaluateHealth() {
    const now = Date.now();
    const clientStates = Object.entries(clients).map(([name, client]) => {
      const wsStatusCode = client.ws?.status;
      const wsStatus = getWsStatusLabel(wsStatusCode);
      const loggedIn = Boolean(client.user);
      const ready = client.isReady();
      const wsUsable = wsStatusCode === WS_READY;
      return { name, loggedIn, ready, wsStatus, wsStatusCode, wsUsable };
    });

    const staleMs = now - lastHeartbeatAt;
    const status = evaluateStatus(clientStates, staleMs);
    const disconnected = clientStates.filter(s => !s.loggedIn || !s.ready || !s.wsUsable);

    let reason = null;
    if (status !== 'healthy') {
      if (staleMs > maxStaleMs) {
        reason = `No heartbeat for ${Math.round(staleMs / 1000)}s (max ${Math.round(maxStaleMs / 1000)}s)`;
      } else {
        reason = `Discord client(s) unavailable: ${disconnected
          .map(s => `${s.name}(ready=${s.ready},ws=${s.wsStatus})`)
          .join(', ')}`;
      }
    }

    const summary = {
      ok: status !== 'down',
      status,
      uptime: formatUptimeSeconds(),
      timestamp: new Date(now).toISOString(),
      discordLoggedIn: clientStates.every(s => s.loggedIn),
      discordWsStatus: clientStates.map(s => `${s.name}:${s.wsStatus}`).join(', '),
      lastHeartbeatAt: new Date(lastHeartbeatAt).toISOString(),
      version,
      environment,
      reason,
      clients: clientStates,
      supabaseOk: checkSupabase ? supabaseOk : null,
      supabaseLatencyMs: checkSupabase ? supabaseLatencyMs : null,
    };
    lastEvaluation = summary;
    return summary;
  }

  async function sendProblemAlert(health) {
    const now = Date.now();
    if (now - lastCriticalAlertAt < cooldownMs) return;
    lastCriticalAlertAt = now;
    const level = health.status === 'degraded' ? 'WARN' : 'CRITICAL';
    await sendAlert({ level, reason: health.reason || 'Health check failed', details: `ws=${health.discordWsStatus}` });
  }

  async function sendRecoveryAlert(health) {
    const now = Date.now();
    if (now - lastRecoveryAlertAt < cooldownMs) return;
    lastRecoveryAlertAt = now;
    await sendAlert({ level: 'RECOVERY', reason: 'Service recovered', details: `ws=${health.discordWsStatus}` });
  }

  async function monitorLoop() {
    await runSupabaseCheck();

    if (checkSupabase && !supabaseOk) {
      console.warn('[health] Supabase connectivity check failed');
      await sendSupabaseAlert();
    }

    const health = evaluateHealth();

    if (health.status === 'healthy') {
      if (currentState !== 'healthy') {
        currentState = 'healthy';
        unhealthySince = null;
        await sendRecoveryAlert(health);
      }
      return;
    }

    if (!unhealthySince) {
      // First detection — alert immediately so the problem is visible without waiting maxStaleMs
      unhealthySince = Date.now();
      currentState = health.status;
      await sendProblemAlert(health);
      return;
    }

    // State may have worsened (degraded → down)
    currentState = health.status;

    // Re-alert once the problem has been sustained for maxStaleMs (escalation / reminder)
    const unhealthyDuration = Date.now() - unhealthySince;
    if (unhealthyDuration >= maxStaleMs) {
      await sendProblemAlert(health);
    }
  }

  async function sendSupabaseAlert() {
    const now = Date.now();
    if (now - lastSupabaseAlertAt < cooldownMs) return;
    lastSupabaseAlertAt = now;
    await sendAlert({
      level: 'WARN',
      reason: 'Supabase connectivity check failed — state persistence may be unavailable',
      details: `latency=${supabaseLatencyMs ?? 'n/a'}ms`,
    });
  }

  function start() {
    if (intervalHandle) return;
    intervalHandle = setInterval(() => {
      void monitorLoop();
    }, intervalMs);
    intervalHandle.unref?.();
    void monitorLoop();
  }

  function stop() {
    if (!intervalHandle) return;
    clearInterval(intervalHandle);
    intervalHandle = null;
  }

  return {
    start,
    stop,
    evaluateHealth,
    getLastEvaluation: () => lastEvaluation || evaluateHealth(),
    sendAlert,
  };
}
