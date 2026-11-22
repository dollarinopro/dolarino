export interface ToobitProxyConfig {
  proxyUrl?: string;
  proxySecret?: string;
}

export function normalizeProxyBaseUrl(raw?: string | null): string | undefined {
  const trimmed = (raw ?? '').trim().replace(/\/+$/, '');
  if (!trimmed) return undefined;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return undefined;
    return trimmed;
  } catch {
    return undefined;
  }
}

export function buildToobitRequest(
  pathAndQuery: string,
  proxyConfig?: ToobitProxyConfig,
  extraHeaders: Record<string, string> = {}
): { url: string; headers: Record<string, string>; proxied: boolean } {
  const base = normalizeProxyBaseUrl(proxyConfig?.proxyUrl);
  const cleanPath = pathAndQuery.startsWith('/') ? pathAndQuery : `/${pathAndQuery}`;
  const url = base
    ? (base.endsWith('/toobit') ? `${base}${cleanPath}` : `${base}/toobit${cleanPath}`)
    : `https://api.toobit.com${cleanPath}`;

  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...extraHeaders,
  };
  if (base && proxyConfig?.proxySecret) {
    headers['X-Relay-Secret'] = proxyConfig.proxySecret;
  }
  return { url, headers, proxied: Boolean(base) };
}

export function formatToobitHttpError(status: number, rawBody: string, proxied: boolean): string {
  const trimmed = rawBody.trim();
  if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html') || trimmed.includes('<html')) {
    if (
      status === 403 &&
      (trimmed.includes('Service Unavailable') ||
        trimmed.includes('network location') ||
        trimmed.includes('2a06:98c0:3600::103') ||
        trimmed.includes('Toobit'))
    ) {
      return proxied
        ? 'Toobit Geo-Block (HTTP 403): Your Relay Proxy IP is also in a Toobit-restricted region (e.g. US/UK/SG/CN). Deploy apps/relay to Frankfurt (fra1) or Tokyo/non-restricted VPS.'
        : 'Toobit Geo-Block (HTTP 403): Toobit blocks Cloudflare Workers egress IP. Add a non-US Toobit Relay URL (apps/relay on Vercel fra1 or VPS) in Connections, or switch to KCEX Futures.';
    }
    const stripped = trimmed
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 180);
    return `Toobit HTTP ${status}: ${stripped || 'Non-JSON HTML response'}`;
  }
  return `Toobit HTTP ${status}: ${trimmed.slice(0, 200)}`;
}
