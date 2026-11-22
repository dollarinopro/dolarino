import http from 'node:http';
import { forwardToobitRequest } from './lib/forward.mjs';

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '0.0.0.0';
const SECRET = process.env.EXCHANGE_PROXY_SECRET || '';

const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url || '/', 'http://relay.local');

  if (reqUrl.pathname === '/health' || reqUrl.pathname === '/') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, service: 'dollarino-toobit-relay', runtime: 'node' }));
    return;
  }

  if (SECRET && req.headers['x-relay-secret'] !== SECRET) {
    res.writeHead(401, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized relay request' }));
    return;
  }

  const targetPath = reqUrl.pathname.startsWith('/toobit/')
    ? reqUrl.pathname.slice('/toobit'.length)
    : reqUrl.pathname;

  const chunks = [];
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    for await (const chunk of req) chunks.push(chunk);
  }
  const bodyBytes = chunks.length ? Buffer.concat(chunks) : undefined;
  const qs = reqUrl.searchParams.toString();

  try {
    const out = await forwardToobitRequest({
      method: req.method || 'GET',
      targetPath,
      queryString: qs,
      headers: req.headers,
      bodyBytes,
    });
    res.writeHead(out.status, out.headers);
    res.end(out.body);
  } catch (err) {
    res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Relay upstream error' }));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[dollarino-relay] listening on http://${HOST}:${PORT}`);
});
