# Dollarino Toobit Relay (`apps/relay`)

Why this relay exists:
Toobit (`https://api.toobit.com`) runs behind Cloudflare and blocks outbound `fetch()` requests from Cloudflare Workers because Cloudflare stamps cross-zone Worker requests with the shared IPv6 egress address `2a06:98c0:3600::103` (`loc=US`), returning `HTTP 403 Service Unavailable`.

This ultra-minimal relay:
- **Never handles your `apiSecret`** — HMAC-SHA256 signing happens inside `dollarino-worker` before forwarding.
- **Only allows official Toobit paths** (`/api/v1/*` and `/quote/v1/*`).
- Supports optional `EXCHANGE_PROXY_SECRET` (`X-Relay-Secret` header).

## Option A — Deploy Free on Vercel (Frankfurt `fra1`)

```bash
cd apps/relay
npx vercel --prod
```
`vercel.json` pins deployment to `fra1` (Frankfurt, Germany — outside Toobit's restricted US/UK/SG/CN regions).

Optional secret:
```bash
npx vercel env add EXCHANGE_PROXY_SECRET production
```

## Option B — Run via Node / Docker on any EU/Asia VPS (Hetzner, Contabo, Render, Railway, Fly.io)

```bash
cd apps/relay
EXCHANGE_PROXY_SECRET=your-secret PORT=8787 node server.mjs
```
Or Docker:
```bash
docker build -t dollarino-relay ./apps/relay
docker run -d -p 8787:8787 -e EXCHANGE_PROXY_SECRET=your-secret dollarino-relay
```

## Connect to Dollarino

1. **Per-connection in the Web App**: Open **Connections -> Toobit**, paste your relay URL (`https://your-relay.vercel.app`) into **Relay URL**, and click **Save Relay** (or enter it when adding a new Toobit key).
2. **Global default on Cloudflare Worker**:
   ```bash
   npx wrangler secret put TOOBIT_PROXY_URL
   npx wrangler secret put EXCHANGE_PROXY_SECRET
   ```
