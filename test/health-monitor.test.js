import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Status } from 'discord.js';
import { createHealthMonitor } from '../src/app/health-monitor.js';

function fakeClient({ ready = true, wsStatus = Status.Ready } = {}) {
  return {
    on() {},
    isReady: () => ready,
    user: ready ? { tag: 'bot#0' } : null,
    ws: { status: wsStatus },
  };
}

// Regression: the module previously destructured a non-existent
// `WebSocketStatus` export from discord.js and crashed at import time.
test('health monitor module loads and reports healthy clients', () => {
  const monitor = createHealthMonitor({
    clients: {
      scout: fakeClient(),
      spark: fakeClient(),
      forge: fakeClient(),
      mirror: fakeClient(),
      coordinator: fakeClient(),
    },
  });

  const health = monitor.evaluateHealth();
  assert.equal(health.ok, true);
  assert.equal(health.reason, null);
  assert.equal(health.discordLoggedIn, true);
  assert.match(health.discordWsStatus, /scout:Ready/);
  assert.equal(health.clients.length, 5);
});

test('health monitor reports disconnected clients', () => {
  const monitor = createHealthMonitor({
    clients: {
      scout: fakeClient({ ready: false, wsStatus: Status.Disconnected }),
      coordinator: fakeClient(),
    },
  });

  const health = monitor.evaluateHealth();
  assert.equal(health.ok, false);
  assert.match(health.reason, /scout/);
  assert.match(health.reason, /Disconnected/);
});

test('getLastEvaluation returns the latest snapshot', () => {
  const monitor = createHealthMonitor({ clients: { coordinator: fakeClient() } });
  const first = monitor.evaluateHealth();
  assert.equal(monitor.getLastEvaluation(), first);
});
