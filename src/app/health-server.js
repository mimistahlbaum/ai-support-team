import http from 'http';
import { PORT } from './constants.js';

// Grace period before /health can return 503. Gives Discord time to connect on
// cold starts before Railway/Render marks the deployment as unhealthy.
const STARTUP_GRACE_MS = Number(process.env.STARTUP_GRACE_MS || 90_000);

export function createAndStartHealthServer({ getHealthSnapshot }) {
  const startedAt = Date.now();

  const healthServer = http.createServer((req, res) => {
    const isHealthRequest = req.method === 'GET' && (req.url === '/health' || req.url === '/ready');
    const isRootRequest = req.method === 'GET' && req.url === '/';

    if (isHealthRequest || isRootRequest) {
      const health = getHealthSnapshot();
      const inGracePeriod = Date.now() - startedAt < STARTUP_GRACE_MS;
      // During the startup grace period, /health returns 200 so the platform
      // doesn't kill the process before Discord has had time to connect.
      const statusCode = isRootRequest ? 200 : (health.ok || inGracePeriod ? 200 : 503);
      res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ...health, inGracePeriod }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('not found');
  });

  healthServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Health server listening on ${PORT}`);
  });

  return healthServer;
}
