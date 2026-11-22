export async function forwardToobitRequest({ method, targetPath, queryString, headers, bodyBytes }) {
  if (!targetPath.startsWith('/api/v1/') && !targetPath.startsWith('/quote/v1/')) {
    return {
      status: 403,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: 'Path not allowed by Toobit relay whitelist' }),
    };
  }

  const upstreamUrl = `https://api.toobit.com${targetPath}${queryString ? `?${queryString}` : ''}`;
  const fwdHeaders = new Headers();
  fwdHeaders.set('Accept', 'application/json');
  fwdHeaders.set('User-Agent', 'DollarinoRelay/1.0');

  for (const key of ['x-bb-apikey', 'x-bb-api-platform', 'content-type']) {
    const val = headers[key] ?? headers[key.toUpperCase()];
    if (val) fwdHeaders.set(key, Array.isArray(val) ? val[0] : String(val));
  }

  const res = await fetch(upstreamUrl, {
    method,
    headers: fwdHeaders,
    body: method === 'GET' || method === 'HEAD' ? undefined : bodyBytes,
    signal: AbortSignal.timeout(12_000),
  });

  const respText = await res.text();
  return {
    status: res.status,
    headers: {
      'content-type': res.headers.get('content-type') || 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
    body: respText,
  };
}
