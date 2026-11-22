// Cloudflare Pages Function proxy -> forwards `/api/*` to the Worker Service Binding (`WORKER_API`) or `WORKER_URL`
interface PagesEnv {
  WORKER_API?: { fetch(request: Request): Promise<Response> };
  WORKER_URL?: string;
}

export async function onRequest(context: { request: Request; env: PagesEnv }): Promise<Response> {
  if (context.env.WORKER_API) {
    return context.env.WORKER_API.fetch(context.request);
  }
  if (context.env.WORKER_URL) {
    const incomingUrl = new URL(context.request.url);
    const base = context.env.WORKER_URL.replace(/\/+$/, '');
    const targetUrl = `${base}${incomingUrl.pathname}${incomingUrl.search}`;
    const headers = new Headers(context.request.headers);
    headers.set('X-Forwarded-Host', incomingUrl.host);
    const hasBody = context.request.method !== 'GET' && context.request.method !== 'HEAD';
    const proxiedReq = new Request(targetUrl, {
      method: context.request.method,
      headers,
      body: hasBody ? context.request.body : undefined,
      redirect: 'manual',
    });
    return fetch(proxiedReq);
  }
  return new Response(
    JSON.stringify({
      error: 'اتصال Cloudflare Pages به سرور API (WORKER_API یا WORKER_URL) هنوز تنظیم نشده است. برای استقرار یکپارچه بدون نیاز به Pages Function، از دستور npx wrangler deploy استفاده کنید.',
      code: 'WORKER_BINDING_MISSING',
    }),
    {
      status: 502,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    }
  );
}
