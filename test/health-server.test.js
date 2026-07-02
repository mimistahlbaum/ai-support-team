process.env.PORT = '0'; // ephemeral port; must be set before constants.js loads

const { test } = await import('node:test');
const { default: assert } = await import('node:assert/strict');
const { createAndStartHealthServer } = await import('../src/app/health-server.js');

function getJson(port, path) {
  return fetch(`http://127.0.0.1:${port}${path}`).then(async res => ({
    status: res.status,
    body: res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text(),
  }));
}

test('health server serves /, /health and /ready and 404s the rest', async () => {
  let healthy = true;
  const server = createAndStartHealthServer({
    getHealthSnapshot: () => ({ ok: healthy, reason: healthy ? null : 'down' }),
  });
  await new Promise(resolve => server.once('listening', resolve));
  const { port } = server.address();

  try {
    const root = await getJson(port, '/');
    assert.equal(root.status, 200);
    assert.equal(root.body.ok, true);

    const health = await getJson(port, '/health');
    assert.equal(health.status, 200);

    healthy = false;
    const unhealthy = await getJson(port, '/health');
    assert.equal(unhealthy.status, 503);
    assert.equal(unhealthy.body.reason, 'down');

    // readiness stays 200 so orchestrators do not kill a degraded-but-alive process
    const ready = await getJson(port, '/ready');
    assert.equal(ready.status, 200);

    const missing = await getJson(port, '/nope');
    assert.equal(missing.status, 404);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
