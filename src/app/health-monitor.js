import pkg from 'discord.js';
import {
  ALERT_COOLDOWN_MS,
  HEALTHCHECK_INTERVAL_MS,
  HEALTHCHECK_MAX_STALE_MS,
} from './constants.js';

const { WebSocketStatus } = pkg;
const WS_READY =
  WebSocketStatus?.Ready ??
  WebSocketStatus?.READY ??
  0;

const STATUS_LABELS = Object.fromEntries(
  Object.entries(WebSocketStatus)
    .filter(([, value]) => typeof value === 'number')
    .map(([key, value]) => [value, key])
);

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

export function createDiscordAlertSender({ serviceName }) {
  const webhookUrl = process.env.DISCORD_ALERT_WEBHOOK_URL;
  const environment = process.env.RENDER_ENVIRONMENT || process.env.NODE_ENV || 'unknown';

  async function sendAlert({ level = 'WARN', reason, details = '' }) {
    if (!webhookUrl) return;

    const timestamp = new Date().toISOString();
    const payload = {
      content: [
        `**[${level}] ${serviceName}**`,
        `env=${environment}`,
        `reason=${reason}`,
        `time=${timestamp}`,
        `uptime=${formatUptimeSeconds()}s`,
        details,
      ]
        .filter(Boolean)
        .join(' | '),
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

export function createHealthMonitor({ clients, serviceName = 'ai-support-team' }) {
  const maxStaleMs = parsePositiveNumber(process.env.HEALTHCHECK_MAX_STALE_MS, HEALTHCHECK_MAX_STALE_MS);
  const intervalMs = parsePositiveNumber(process.env.HEALTHCHECK_INTERVAL_MS, HEALTHCHECK_INTERVAL_MS);
  const cooldownMs = parsePositiveNumber(process.env.ALERT_COOLDOWN_MS, ALERT_COOLDOWN_MS);
  const version = process.env.RENDER_GIT_COMMIT || process.env.COMMIT_SHA || process.env.npm_package_version || 'unknown';
  const { sendAlert, environment } = createDiscordAlertSender({ serviceName });

  let lastHeartbeatAt = Date.now();
  let intervalHandle = null;
  let unhealthySince = null;
  let currentState = 'healthy';
  let lastAlertAt = 0;
  let lastEvaluation = null;

  for (const [name, client] of Object.entries(clients)) {
    client.on('clientReady', () => {
      lastHeartbeatAt = Date.now();
      console.log(`[health] ${name} ready`);
    });
    client.on('shardResume', () => {
      lastHeartbeatAt = Date.now();
    });
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

    const disconnected = clientStates.filter(state => !state.loggedIn || !state.ready || !state.wsUsable);
    const staleMs = now - lastHeartbeatAt;

    let reason = null;
    if (disconnected.length > 0) {
      reason = `Discord client unavailable: ${disconnected
        .map(state => `${state.name}(ready=${state.ready}, ws=${state.wsStatus})`)
        .join(', ')}`;
    } else if (staleMs > maxStaleMs) {
      reason = `No healthy heartbeat for ${staleMs}ms (max ${maxStaleMs}ms)`;
    }

    if (!reason) {
      lastHeartbeatAt = now;
    }

    const summary = {
      ok: !reason,
      uptime: formatUptimeSeconds(),
      timestamp: new Date(now).toISOString(),
      discordLoggedIn: clientStates.every(state => state.loggedIn),
      discordWsStatus: clientStates.map(state => `${state.name}:${state.wsStatus}`).join(', '),
      lastHeartbeatAt: new Date(lastHeartbeatAt).toISOString(),
      version,
      environment,
      reason,
      clients: clientStates,
    };
    lastEvaluation = summary;
    return summary;
  }

  async function sendAlertWithCooldown(payload) {
    const now = Date.now();
    if (now - lastAlertAt < cooldownMs) return;
    lastAlertAt = now;
    await sendAlert(payload);
  }

  async function monitorLoop() {
    const health = evaluateHealth();

    if (health.ok) {
      if (currentState === 'unhealthy') {
        currentState = 'healthy';
        unhealthySince = null;
        await sendAlertWithCooldown({
          level: 'RECOVERY',
          reason: 'Service recovered',
          details: `ws=${health.discordWsStatus}`,
        });
      }
      return;
    }

    if (!unhealthySince) {
      unhealthySince = Date.now();
      currentState = 'unhealthy';
      return;
    }

    const unhealthyDuration = Date.now() - unhealthySince;
    if (unhealthyDuration >= maxStaleMs) {
      await sendAlertWithCooldown({
        level: 'CRITICAL',
        reason: health.reason || 'Health check failed',
        details: `ws=${health.discordWsStatus}`,
      });
    }
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
