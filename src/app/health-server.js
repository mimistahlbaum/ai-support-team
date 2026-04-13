import http from 'http';
import { PORT } from './constants.js';

export function createAndStartHealthServer() {
  const healthServer = http.createServer((req, res) => {
    if (req.method === 'GET' && (req.url === '/' || req.url === '/health')) {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('ok');
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
