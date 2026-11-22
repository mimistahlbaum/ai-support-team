import http from 'http';
import { PORT } from './constants.js';

export function createAndStartHealthServer({ getHealthSnapshot }) {
  const healthServer = http.createServer((req, res) => {
    const isHealthRequest = req.method === 'GET' && (req.url === '/health' || req.url === '/ready');
    const isRootRequest = req.method === 'GET' && req.url === '/';

    if (isHealthRequest || isRootRequest) {
      const health = getHealthSnapshot();
      const statusCode = req.url === '/health' ? (health.ok ? 200 : 503) : 200;
      res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(health));
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
