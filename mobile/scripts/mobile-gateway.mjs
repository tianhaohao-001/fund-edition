import http from 'node:http';
import { pathToFileURL } from 'node:url';

const routes = new Map([
  ['/api/mobile/pair', 'POST'], ['/api/mobile/state', 'GET'],
  ['/api/mobile/action', 'POST'], ['/api/mobile/disconnect', 'POST'],
  ['/api/mobile/voice/transcribe', 'POST'],
]);

/** Bind only to loopback. A separately authorized private HTTPS proxy is required for phones. */
export function createMobileGateway({ backendPort = 3318 } = {}) {
  if (!Number.isInteger(backendPort) || backendPort < 1024 || backendPort > 65535) throw new Error('Invalid local backend port.');
  return http.createServer({ maxHeaderSize: 8192 }, (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const reject = (status, error) => { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ error })); };
    let url;
    try { url = new URL(request.url, 'http://localhost'); } catch { reject(400, 'Invalid request.'); return; }
    if (!routes.has(url.pathname) || routes.get(url.pathname) !== request.method || request.headers.origin) {
      reject(403, 'This private gateway only accepts native mobile API requests.');
      return;
    }
    const headers = {};
    for (const name of ['authorization', 'content-type', 'content-length', 'x-voice-language']) {
      if (request.headers[name] !== undefined) headers[name] = request.headers[name];
    }
    // Never forward cookies, forwarded-host, arbitrary destination hosts, or website routes.
    const upstream = http.request({ hostname: '127.0.0.1', port: backendPort, method: request.method, path: `${url.pathname}${url.search}`, headers }, incoming => {
      response.writeHead(incoming.statusCode ?? 502, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      incoming.pipe(response);
      incoming.on('error', () => response.destroy());
    });
    upstream.setTimeout(105_000, () => upstream.destroy(new Error('Local backend timed out.')));
    upstream.on('error', () => {
      if (!response.headersSent) reject(502, 'The local mobile backend is unavailable.');
      else response.destroy();
    });
    request.on('aborted', () => upstream.destroy());
    response.on('close', () => { if (!response.writableFinished) upstream.destroy(); });
    request.pipe(upstream);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.MORROWFOLIO_GATEWAY_PORT ?? 3320);
  const backendPort = Number(process.env.FUNDROOM_PORT ?? 3318);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid gateway port.');
  const gateway = createMobileGateway({ backendPort });
  gateway.requestTimeout = 110_000;
  gateway.headersTimeout = 10_000;
  gateway.maxConnections = 12;
  gateway.listen(port, '127.0.0.1', () => console.log(`Mobile-only gateway listening on http://127.0.0.1:${port}; no external listener or HTTPS route has been enabled.`));
}
