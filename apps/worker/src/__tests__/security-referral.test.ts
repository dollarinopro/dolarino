import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../index.js';
import type { Env } from '../env.js';
import { encryptVaultJson } from '../crypto.js';
import { resolveAIEnsemble, resolvePlatformAIEngines } from '../ai/providers.js';

let mf: Miniflare;
let db: D1Database;
const realFetch = globalThis.fetch;

function makeEnv(): Env {
  return {
    DB: db,
    TRADING_BOT_DO: {
      idFromName: (n: string) => n as unknown as DurableObjectId,
      get: () =>
        ({
          fetch: async () => new Response('{"ok":true}'),
        }) as unknown as DurableObjectStub,
    } as unknown as DurableObjectNamespace,
    SESSION_JWT_SECRET: 'test-jwt-secret-key-dollarino-96',
    MASTER_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    OWNER_TELEGRAM_ID: '944021185',
    DEFAULT_SIGNAL_CHANNEL: '@Dollarino_official',
    ALLOW_LIVE_TRADING: 'true',
    PUBLIC_WEB_URL: 'https://dollarino.pages.dev',
  };
}

function splitSqlStatements(sql: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i]!;
    if (ch === '-' && sql[i + 1] === '-' && !inSingle && !inDouble) {
      while (i < sql.length && sql[i] !== '\n') i++;
      continue;
    }
    if (ch === "'" && !inDouble) {
      if (sql[i + 1] === "'") {
        cur += "''";
        i++;
        continue;
      }
      inSingle = !inSingle;
    } else if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
    }
    if (ch === ';' && !inSingle && !inDouble) {
      const trimmed = cur.trim();
      if (trimmed) out.push(trimmed);
      cur = '';
    } else {
      cur += ch;
    }
  }
  const tail = cur.trim();
  if (tail) out.push(tail);
  return out;
}

describe('Dollarino v9.6 Security, Rate-Limiting, Anti-Fraud Referral & DEX Fallbacks', () => {
  beforeAll(async () => {
    mf = new Miniflare({
      modules: true,
      script: 'export default { fetch() { return new Response("ok"); } }',
      d1Databases: { DB: 'sec-ref-test-db' },
    });
    db = await mf.getD1Database('DB');

    const here = path.dirname(fileURLToPath(import.meta.url));
    const migrationsDir = path.resolve(here, '../../../../migrations');
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      const raw = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      for (const stmt of splitSqlStatements(raw)) {
        await db.prepare(stmt).run();
      }
    }

    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('api.dexscreener.com')) {
        // Simulate upstream 503 outage to verify GeckoTerminal fallback automatically triggers
        return new Response('Service Unavailable', { status: 503 });
      }
      if (url.includes('api.geckoterminal.com')) {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: 'bsc_0xaaaa',
                type: 'pool',
                attributes: {
                  address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                  name: 'PEPE / WBNB',
                  base_token_price_usd: '0.0000142',
                  reserve_in_usd: '450000',
                  volume_usd: { h24: '920000' },
                  price_change_percentage: { h24: '14.2', h1: '2.1', m5: '0.4' },
                  transactions: { m5: { buys: 19, sells: 7 } },
                },
                relationships: {
                  base_token: { data: { id: 'bsc_0x1234' } },
                  quote_token: { data: { id: 'bsc_0xwbnb' } },
                  network: { data: { id: 'bsc' } },
                  dex: { data: { id: 'pancakeswap-v3' } },
                },
              },
            ],
            included: [
              {
                id: 'bsc_0x1234',
                type: 'token',
                attributes: {
                  address: '0x1234567890abcdef1234567890abcdef12345678',
                  name: 'PepeBSC',
                  symbol: 'PEPE',
                  image_url: 'https://assets.geckoterminal.com/pepe.png',
                },
              },
              {
                id: 'bsc_0xwbnb',
                type: 'token',
                attributes: { address: '0xwbnb', name: 'Wrapped BNB', symbol: 'WBNB' },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.includes('api.telegram.org')) {
        return new Response(JSON.stringify({ ok: true, result: { message_id: 99 } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('NONEXISTENT99USDT') || url.includes('NONEXISTENT99')) {
        return new Response('Not Found', { status: 404 });
      }
      if (url.includes('fapi.bitunix.com') && url.includes('BTCUSDT')) {
        return new Response(
          JSON.stringify({ code: 0, data: [{ symbol: 'BTCUSDT', lastPrice: '90000', last: '90000', open: '89500', high: '90500', low: '89000', quoteVol: '500000000' }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return realFetch(input, init);
    });
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await mf.dispose();
  });

  beforeEach(async () => {
    await db.exec("DELETE FROM rate_limits; DELETE FROM referral_withdrawals; DELETE FROM referrals; DELETE FROM user_subscriptions; DELETE FROM gift_redemptions; DELETE FROM gift_codes; DELETE FROM users; INSERT OR REPLACE INTO system_settings (key, value) VALUES ('telegram_only_signup', 'true');");
  });

  it('blocks direct web email signup by default, verifies Telegram Login Widget, and lets user edit profile while locking verified phone', async () => {
    const env = makeEnv();

    // 1. Direct email registration is blocked by default (403 TELEGRAM_SIGNUP_REQUIRED)
    const blockedReg = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'fake@gmail.com', username: 'FakeUser', password: 'password123' }),
      }),
      env
    );
    expect(blockedReg.status).toBe(403);
    const blockedJson = (await blockedReg.json()) as { code: string; botUrl: string };
    expect(blockedJson.code).toBe('TELEGRAM_SIGNUP_REQUIRED');
    expect(blockedJson.botUrl).toContain('t.me/Dollarino_bot');

    // 2. Provision a Telegram-registered & phone-verified user + issue magic login
    await db.prepare(
      `INSERT INTO users (id, email, username, password_hash, role, telegram_id, telegram_username, phone_number, phone_verified, web_magic_token, web_magic_expires_at, has_custom_password)
       VALUES ('usr_tg_prof_1', 'tg_555001@telegram.dollarino.local', 'RezaQuant', 'x', 'user', '555001', 'reza_q', '+989121112233', 1, 'tglm_test_prof_1', datetime('now', '+10 minutes'), 0)`
    ).run();

    const magicRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/auth/telegram-magic-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'tglm_test_prof_1' }),
      }),
      env
    );
    expect(magicRes.status).toBe(200);
    const magicJson = (await magicRes.json()) as { token: string; user: { id: string } };
    expect(magicJson.user.id).toBe('usr_tg_prof_1');

    // 3. Attempting to alter phone_number via PATCH /api/auth/profile must be rejected with 403
    const phoneTamperRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${magicJson.token}` },
        body: JSON.stringify({ phoneNumber: '+989999999999' }),
      }),
      env
    );
    expect(phoneTamperRes.status).toBe(403);

    // 4. Editing username, real email, displayBio & setting first password succeeds
    const editRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${magicJson.token}` },
        body: JSON.stringify({
          username: 'RezaUpdated',
          email: 'reza.real@example.com',
          displayBio: 'Futures & Gold trader',
          newPassword: 'StrongPassword99',
        }),
      }),
      env
    );
    expect(editRes.status).toBe(200);
    const editJson = (await editRes.json()) as {
      ok: boolean;
      user: { username: string; email: string; display_bio: string; phone_number: string; has_custom_password: number };
    };
    expect(editJson.ok).toBe(true);
    expect(editJson.user.username).toBe('RezaUpdated');
    expect(editJson.user.email).toBe('reza.real@example.com');
    expect(editJson.user.display_bio).toBe('Futures & Gold trader');
    expect(editJson.user.phone_number).toBe('+989121112233');
    expect(editJson.user.has_custom_password).toBe(1);

    // 5. User can now sign in with the real email & custom password they set
    const loginRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'reza.real@example.com', password: 'StrongPassword99' }),
      }),
      env
    );
    expect(loginRes.status).toBe(200);

    // 6. Delete Account requires DELETE/حذف + valid password (when custom password exists), then purges user & returns 401 on subsequent /me
    const badDel = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/auth/account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${magicJson.token}` },
        body: JSON.stringify({ confirmText: 'DELETE', password: 'WrongPassword' }),
      }),
      env
    );
    expect(badDel.status).toBe(401);

    const okDel = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/auth/account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${magicJson.token}` },
        body: JSON.stringify({ confirmText: 'DELETE', password: 'StrongPassword99' }),
      }),
      env
    );
    expect(okDel.status).toBe(200);
    const delRow = await db.prepare('SELECT id FROM users WHERE id = ?').bind('usr_tg_prof_1').first();
    expect(delRow).toBeNull();
  });

  it('serves v9.7.0 health with security headers and falls back cleanly to GeckoTerminal when DexScreener fails', async () => {
    const env = makeEnv();
    const healthRes = await worker.fetch(new Request('https://dollarino.pages.dev/api/health'), env);
    expect(healthRes.status).toBe(200);
    expect(healthRes.headers.get('X-Content-Type-Options')).toBe('nosniff');
    const health = (await healthRes.json()) as { version: string; capabilities: Record<string, boolean> };
    expect(health.version).toBe('9.9.2');
    expect(health.capabilities.alwaysOnSignalsAndAiIntel).toBe(true);
    expect(health.capabilities.dedicatedFloatingVisionAI).toBe(true);
    expect(health.capabilities.antiAbuseReferralSystem).toBe(true);

    const creatorRes = await worker.fetch(new Request('https://dollarino.local/api/public/creator'), env);
    expect(creatorRes.status).toBe(200);
    const creatorJson = (await creatorRes.json()) as { creator: { nameFa: string; telegram: string; instagram: string } };
    expect(creatorJson.creator.nameFa).toBe('آوید کیا');
    expect(creatorJson.creator.telegram).toBe('@avidkiya');
    expect(creatorJson.creator.instagram).toBe('@avid_kiya');
    expect(health.capabilities.telegramFirstRegistration).toBe(true);

    const dexRes = await worker.fetch(new Request('https://dollarino.pages.dev/api/dex/trending'), env);
    expect(dexRes.status).toBe(200);
    const dex = (await dexRes.json()) as { trending: Array<{ baseToken: { symbol: string } }>; pairs: unknown[] };
    expect(dex.trending.length).toBeGreaterThan(0);
    expect(dex.pairs.length).toBe(dex.trending.length);
    expect(dex.trending[0]!.baseToken.symbol).toBe('PEPE');
  });

  it('prevents self-referral IP farming, blocks $0 gift commission unlock, and processes legitimate tiered payout + refund', async () => {
    const env = makeEnv();
    // Temporarily disable telegram_only_signup inside this anti-fraud unit test to exercise IP/UA duplicate registration checks directly
    await db.exec(`INSERT OR REPLACE INTO system_settings (key, value) VALUES ('telegram_only_signup', 'false');`);

    // 1. Register Referrer (first user becomes owner/admin automatically)
    const reg1 = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CF-Connecting-IP': '203.0.113.10',
          'User-Agent': 'Mozilla/5.0 ReferrerBrowser',
        },
        body: JSON.stringify({ email: 'alice@dollarino.test', username: 'AliceQuant', password: 'password123' }),
      }),
      env
    );
    expect(reg1.status).toBe(201);
    const u1 = (await reg1.json()) as { token: string; user: { id: string } };
    const refCode = `DLR-${u1.user.id.slice(-6).toUpperCase()}`;

    // 2. Register Duplicate Abuser from SAME IP + SAME User-Agent
    const regAbuse = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CF-Connecting-IP': '203.0.113.10',
          'User-Agent': 'Mozilla/5.0 ReferrerBrowser',
        },
        body: JSON.stringify({
          email: 'alt@dollarino.test',
          username: 'AltAccount',
          password: 'password123',
          referralCode: refCode,
        }),
      }),
      env
    );
    expect(regAbuse.status).toBe(201);
    const uAbuse = (await regAbuse.json()) as { token: string; user: { id: string } };

    const flaggedRow = await db
      .prepare('SELECT status, fraud_flag FROM referrals WHERE referred_user_id = ?')
      .bind(uAbuse.user.id)
      .first<{ status: string; fraud_flag: number }>();
    expect(flaggedRow?.status).toBe('FLAGGED_DUPLICATE');
    expect(flaggedRow?.fraud_flag).toBe(1);

    // 3. Register Legitimate Friend from a DIFFERENT IP + UA
    const regFriend = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CF-Connecting-IP': '198.51.100.42',
          'User-Agent': 'Mozilla/5.0 FriendPhone',
        },
        body: JSON.stringify({
          email: 'bob@dollarino.test',
          username: 'BobTrader',
          password: 'password123',
          referralCode: refCode,
        }),
      }),
      env
    );
    expect(regFriend.status).toBe(201);
    const uFriend = (await regFriend.json()) as { token: string; user: { id: string } };

    // 4. Friend redeems a $0 gift code -> must NOT credit referral USD balance!
    await db
      .prepare(`INSERT INTO gift_codes (code, plan_code, duration_days, max_uses, is_active) VALUES ('FREE30', 'pro_monthly', 30, 5, 1)`)
      .run();
    const giftRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/subscriptions/redeem-gift', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${uFriend.token}` },
        body: JSON.stringify({ code: 'FREE30' }),
      }),
      env
    );
    expect(giftRes.status).toBe(200);

    const refStatsPre = (await (
      await worker.fetch(
        new Request('https://dollarino.pages.dev/api/subscriptions/referrals', {
          headers: { Authorization: `Bearer ${u1.token}` },
        }),
        env
      )
    ).json()) as { balanceUsd: number; referrals: Array<{ username: string }> };
    expect(refStatsPre.balanceUsd).toBe(0);
    // Username privacy masking
    expect(refStatsPre.referrals.some((r) => r.username.includes('***'))).toBe(true);

    // 5. Friend submits a paid $100 plan order and Admin approves it -> unlocks 15% ($15.00) + 7 Pro days
    const chkRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/subscriptions/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${uFriend.token}` },
        body: JSON.stringify({
          planCode: 'pro_semiannual',
          paymentMethod: 'CARD_TO_CARD',
          paymentReference: 'REF-BANK-99887766',
        }),
      }),
      env
    );
    expect(chkRes.status).toBe(201);
    const chkJson = (await chkRes.json()) as { orderId: string };

    const reviewRes = await worker.fetch(
      new Request(`https://dollarino.pages.dev/api/subscriptions/admin/orders/${chkJson.orderId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${u1.token}` },
        body: JSON.stringify({ decision: 'APPROVE', adminNote: 'Paid verified' }),
      }),
      env
    );
    expect(reviewRes.status).toBe(200);

    const refStatsPost = (await (
      await worker.fetch(
        new Request('https://dollarino.pages.dev/api/subscriptions/referrals', {
          headers: { Authorization: `Bearer ${u1.token}` },
        }),
        env
      )
    ).json()) as { balanceUsd: number; qualifiedReferred: number; rewardDaysEarned: number };
    expect(refStatsPost.balanceUsd).toBeGreaterThan(10);
    expect(refStatsPost.qualifiedReferred).toBe(1);
    expect(refStatsPost.rewardDaysEarned).toBe(7);

    // 6. Attempt USDT payout WITHOUT phone KYC -> must fail with 403
    const wdNoKyc = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/subscriptions/referrals/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${u1.token}` },
        body: JSON.stringify({
          amountUsd: 10,
          network: 'BEP20',
          walletAddress: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
        }),
      }),
      env
    );
    expect(wdNoKyc.status).toBe(403);

    // 7. Verify phone KYC -> withdraw $10 -> Admin rejects -> $10 refunded cleanly
    await db.prepare('UPDATE users SET phone_verified = 1 WHERE id = ?').bind(u1.user.id).run();
    const wdOk = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/subscriptions/referrals/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${u1.token}` },
        body: JSON.stringify({
          amountUsd: 10,
          network: 'BEP20',
          walletAddress: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
        }),
      }),
      env
    );
    expect(wdOk.status).toBe(201);
    const { withdrawalId } = (await wdOk.json()) as { withdrawalId: string };

    const adminRef = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/admin/referrals', {
        headers: { Authorization: `Bearer ${u1.token}` },
      }),
      env
    );
    expect(adminRef.status).toBe(200);

    const rejectRes = await worker.fetch(
      new Request(`https://dollarino.pages.dev/api/admin/referrals/withdrawals/${withdrawalId}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${u1.token}` },
        body: JSON.stringify({ decision: 'REJECT', adminNote: 'Test refund' }),
      }),
      env
    );
    expect(rejectRes.status).toBe(200);

    const balAfterRefund = await db
      .prepare('SELECT referral_balance_usd FROM users WHERE id = ?')
      .bind(u1.user.id)
      .first<{ referral_balance_usd: number }>();
    expect(balAfterRefund?.referral_balance_usd).toBe(refStatsPost.balanceUsd);

    // 8. Extension key generation & authentication works end-to-end
    const extGen = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/auth/extension-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${u1.token}` },
        body: JSON.stringify({ rotate: false }),
      }),
      env
    );
    expect(extGen.status).toBe(200);
    const { extensionApiKey } = (await extGen.json()) as { extensionApiKey: string };
    expect(extensionApiKey.startsWith('dlr_ext_')).toBe(true);

    const extSess = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/auth/session', {
        headers: { 'X-Dollarino-Extension-Key': extensionApiKey },
      }),
      env
    );
    expect(extSess.status).toBe(200);
    const extSessJson = (await extSess.json()) as { authenticated: boolean; user: { id: string } | null };
    expect(extSessJson.authenticated).toBe(true);
    expect(extSessJson.user?.id).toBe(u1.user.id);

    const extOv = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trading/overview', {
        headers: { 'X-Dollarino-Extension-Key': extensionApiKey },
      }),
      env
    );
    expect(extOv.status).toBe(200);
    const extOvJson = (await extOv.json()) as { balance: { total: string }; openTrades: unknown[] };
    expect(extOvJson.balance).toBeTruthy();
    expect(Array.isArray(extOvJson.openTrades)).toBe(true);
  });

  it('does not burn calls_today on non-LLM resolution, auto-repairs hilinkup "deep" model, and reports AI_DAILY_CAP_REACHED cleanly', async () => {
    const env = makeEnv();
    const encryptedKey = await encryptVaultJson({ apiKey: 'sk-hilinkup-test-key' }, env.MASTER_ENCRYPTION_KEY);
    const today = new Date().toISOString().slice(0, 10);

    await db.prepare(
      `INSERT INTO users (id, email, username, role, password_hash, referral_code, telegram_id, phone_verified)
       VALUES (?, ?, ?, 'owner', 'hash', 'DLR-AI01', '944021185', 1)`
    ).bind('usr_ai_owner_1', 'aiowner@dollarino.test', 'AiOwner').run();
    await db.prepare(
      `INSERT INTO bot_configs (user_id, trading_mode, market_type, strategy_key, symbol, entry_timeframe, webhook_secret)
       VALUES (?, 'PAPER', 'FUTURES', 'ai_autonomous_agent', 'BTCUSDT', '15m', 'wh_test_1')`
    ).bind('usr_ai_owner_1').run();
    await db.prepare(
      `INSERT INTO platform_ai_engines (id, slot_order, provider, label, model, base_url, weight, is_active, api_key_masked, encrypted_api_key, daily_call_cap, calls_today, calls_reset_date)
       VALUES (?, 1, 'deepseek', 'دیپی', 'deep', 'https://api.hilinkup.com/v1', 100, 1, 'sk-h***key', ?, 50000, 0, ?)`
    ).bind('paie_test_1', encryptedKey, today).run();

    // 1. Multiple resolution checks must NOT increment calls_today and must normalize 'deep' on hilinkup.com
    for (let i = 0; i < 3; i++) {
      const resolved = await resolvePlatformAIEngines(env);
      expect(resolved.engines.length).toBe(1);
      expect(resolved.engines[0]!.model).toBe('baidu/deepseek-v4.1-flash-1017');
      expect(resolved.capExceededCount).toBe(0);
    }
    const afterResolve = await db
      .prepare('SELECT calls_today FROM platform_ai_engines WHERE id = ?')
      .bind('paie_test_1')
      .first<{ calls_today: number }>();
    expect(afterResolve?.calls_today).toBe(0);

    // 2. Starting bot with ai_autonomous_agent succeeds and still keeps calls_today = 0
    const { signJwt } = await import('../crypto.js');
    const ownerJwt = await signJwt({ sub: 'usr_ai_owner_1', role: 'owner', username: 'AiOwner' }, env.SESSION_JWT_SECRET);
    const startOk = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trading/bot/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerJwt}` },
        body: JSON.stringify({ strategyKey: 'ai_autonomous_agent' }),
      }),
      env
    );
    expect(startOk.status).toBe(200);
    const afterStart = await db
      .prepare('SELECT calls_today FROM platform_ai_engines WHERE id = ?')
      .bind('paie_test_1')
      .first<{ calls_today: number }>();
    expect(afterStart?.calls_today).toBe(0);

    // 3. When daily_call_cap is exhausted, resolveAIEnsemble flags capExceeded and bot/start returns AI_DAILY_CAP_REACHED (not NO_ACTIVE_AI_KEY)
    await db
      .prepare('UPDATE platform_ai_engines SET daily_call_cap = 500, calls_today = 500, calls_reset_date = ? WHERE id = ?')
      .bind(today, 'paie_test_1')
      .run();

    const cappedEnsemble = await resolveAIEnsemble(env, 'usr_ai_owner_1');
    expect(cappedEnsemble.engines.length).toBe(0);
    expect(cappedEnsemble.capExceeded).toBe(true);

    const startCapped = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/trading/bot/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerJwt}` },
        body: JSON.stringify({ strategyKey: 'ai_autonomous_agent' }),
      }),
      env
    );
    expect(startCapped.status).toBe(400);
    const startCappedBody = (await startCapped.json()) as { code: string; error: string };
    expect(startCappedBody.code).toBe('AI_DAILY_CAP_REACHED');
  });

  it('never returns fake price 100, isolates PAPER/LIVE daily loss, and activates auto-trading with 1 click in Telegram', async () => {
    const env = makeEnv();
    env.TELEGRAM_BOT_TOKEN = '12345:TEST_BOT_TOKEN';
    env.TELEGRAM_WEBHOOK_SECRET = 'tg_sec_test';

    const { fetchPublicTickerPrice } = await import('../exchanges/paper.js');
    const { executeSignalForUser } = await import('../engine/executor.js');

    // 1. Unknown altcoin must return '0' (never hardcoded 100) when market endpoints lack it
    const unknownPx = await fetchPublicTickerPrice('NONEXISTENT99USDT');
    expect(unknownPx).toBe('0');

    // 2. Setup owner user with LIVE trading mode & an active KCEX connection, PLUS a huge old PAPER loss today
    await db.prepare(
      `INSERT INTO users (id, email, username, role, password_hash, referral_code, telegram_id, phone_verified)
       VALUES (?, ?, ?, 'owner', 'hash', 'DLR-AUTO1', '944021185', 1)`
    ).bind('usr_auto_fix_1', 'autofix@dollarino.test', 'AutoFix').run();
    await db.prepare(
      `INSERT INTO bot_configs (user_id, bot_state, trading_mode, trade_execution_mode, market_type, strategy_key, symbol, entry_timeframe, webhook_secret, paper_balance, daily_max_loss_pct)
       VALUES (?, 'STOPPED', 'LIVE', 'MANUAL_CONFIRM', 'FUTURES', 'dollarino_v01', 'BTCUSDT', '15m', 'wh_auto_1', '10000', 10)`
    ).bind('usr_auto_fix_1').run();
    await db.prepare(
      `INSERT INTO exchange_connections (id, user_id, provider, label, is_testnet, is_active, api_key_masked, encrypted_credentials, last_test_status)
       VALUES ('ex_kcex_fix', 'usr_auto_fix_1', 'kcex', 'KCEX Test', 0, 1, 'kc***12', '{}', 'OK')`
    ).bind().run();

    // Insert a PAPER trade with -$50,000 loss today; must NOT block LIVE execution
    await db.prepare(
      `INSERT INTO trades (id, user_id, mode, market_type, exchange_provider, symbol, strategy_key, direction, status, entry_price, exit_price, initial_quantity, remaining_quantity, leverage, margin_used, current_stop_loss, initial_stop_loss, tp1, realized_pnl, client_id)
       VALUES ('trd_paper_loss_1', 'usr_auto_fix_1', 'PAPER', 'FUTURES', 'paper', 'MEWUSDT', 'dollarino_v01', 'LONG', 'CLOSED', '0.001', '0.0005', '1000', '0', 5, '100', '0.0008', '0.0008', '0.0012', '-50000', 'cli_paper_1')`
    ).run();

    const execLive = await executeSignalForUser(
      env,
      'usr_auto_fix_1',
      {
        symbol: 'BTCUSDT',
        direction: 'LONG',
        timeframe: '15m',
        price: '90000',
        stopLoss: '88000',
        leverage: 5,
        tp1: '92500',
        tp2: '94500',
        tp3: '97000',
      },
      { forceBypassState: true, strategyKey: 'dollarino_v01', marketType: 'FUTURES' }
    );
    expect(execLive).toMatchObject({ ok: true });
    expect(execLive.tradeId).toBeTruthy();

    // 3. Telegram 1-click button ('🟢 شروع خودکار ربات (یک کلیک)') sets trade_execution_mode='AUTO', auto_scan_top=1, bot_state=RUNNING_*
    const tgRes = await worker.fetch(
      new Request('https://dollarino.pages.dev/api/webhook/telegram', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Telegram-Bot-Api-Secret-Token': 'tg_sec_test',
        },
        body: JSON.stringify({
          update_id: 99001,
          message: {
            message_id: 501,
            from: { id: 944021185, first_name: 'Owner', username: 'owner' },
            chat: { id: 944021185, type: 'private' },
            text: '🟢 شروع خودکار ربات (یک کلیک)',
          },
        }),
      }),
      env
    );
    expect(tgRes.status).toBe(200);
    const cfgAfter = await db
      .prepare('SELECT bot_state, trade_execution_mode, auto_scan_top, scan_scope FROM bot_configs WHERE user_id = ?')
      .bind('usr_auto_fix_1')
      .first<{ bot_state: string; trade_execution_mode: string; auto_scan_top: number; scan_scope: string }>();
    expect(cfgAfter?.trade_execution_mode).toBe('AUTO');
    expect(cfgAfter?.auto_scan_top).toBe(1);
    expect(cfgAfter?.scan_scope).toBe('ALL_MARKET');
    expect(cfgAfter?.bot_state).toBe('RUNNING_LIVE');
  });
});
