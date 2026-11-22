// Dynamic Open Graph origin rewriter for Cloudflare Pages (ensures Telegram/WhatsApp/Instagram
// previews always point to the exact live domain, preview subdomain, or custom domain).
export async function onRequest(context: {
  request: Request;
  next: () => Promise<Response>;
}): Promise<Response> {
  const url = new URL(context.request.url);
  if (url.pathname.startsWith('/api/')) {
    return context.next();
  }

  const res = await context.next();
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) {
    return res;
  }

  if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') {
    return res;
  }

  const origin = url.origin.replace(/\/+$/, '');
  const html = await res.text();
  const rewritten = html
    .replaceAll('https://dolarino.pages.dev/dollarino-preview.jpg', `${origin}/dollarino-preview.jpg`)
    .replaceAll('https://dollarino.pages.dev/dollarino-preview.jpg', `${origin}/dollarino-preview.jpg`)
    .replaceAll('https://dolarino.pages.dev/images/dollarino-og-brand.jpg', `${origin}/images/dollarino-og-brand.jpg`)
    .replaceAll('https://dollarino.pages.dev/images/dollarino-og-brand.jpg', `${origin}/images/dollarino-og-brand.jpg`)
    .replaceAll('content="https://dolarino.pages.dev/"', `content="${origin}/"`)
    .replaceAll('content="https://dollarino.pages.dev/"', `content="${origin}/"`)
    .replaceAll('href="https://dolarino.pages.dev/"', `href="${origin}/"`)
    .replaceAll('href="https://dollarino.pages.dev/"', `href="${origin}/"`);

  const headers = new Headers(res.headers);
  headers.delete('content-length');
  headers.set('Content-Type', 'text/html; charset=utf-8');
  headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
  return new Response(rewritten, { status: res.status, statusText: res.statusText, headers });
}
