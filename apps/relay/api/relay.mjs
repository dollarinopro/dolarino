import { forwardToobitRequest } from '../lib/forward.mjs';

export default async function handler(req, res) {
  const secret = process.env.EXCHANGE_PROXY_SECRET;
  const reqUrl = new URL(req.url || '/', 'https://relay.local');

  if (reqUrl.searchParams.get('__health') === '1' || reqUrl.pathname === '/health') {
    res.status(200).json({ ok: true, service: 'dollarino-toobit-relay', region: process.env.VERCEL_REGION || 'node' });
    return;
  }

  if (secret && req.headers['x-relay-secret'] !== secret) {
    res.status(401).json({ error: 'Unauthorized relay request' });
    return;
  }

  let targetPath = reqUrl.searchParams.get('__p') || '';
  reqUrl.searchParams.delete('__p');
  if (!targetPath) {
    targetPath = reqUrl.pathname.replace(/^\/(api\/relay|toobit)/, '');
  }
  if (!targetPath.startsWith('/')) targetPath = `/${targetPath}`;

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
    for (const [k, v] of Object.entries(out.headers)) res.setHeader(k, v);
    res.status(out.status).send(out.body);
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'Relay upstream error' });
  }
}
