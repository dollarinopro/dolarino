import { decryptVaultJson } from '../crypto.js';
import type { Env } from '../env.js';
import type { IExchangeAdapter } from './base.js';
import { BitunixFuturesAdapter } from './bitunix.js';
import { KcexFuturesAdapter } from './kcex.js';
import { PaperExchangeAdapter } from './paper.js';
import { ToobitFuturesAdapter } from './toobit.js';

export async function resolveUserExchangeAdapter(
  env: Env,
  userId: string,
  forceProvider?: 'paper' | 'toobit' | 'bitunix' | 'kcex'
): Promise<{ adapter: IExchangeAdapter; provider: string; label: string }> {
  const globalProxy = env.TOOBIT_PROXY_URL
    ? { proxyUrl: env.TOOBIT_PROXY_URL, proxySecret: env.EXCHANGE_PROXY_SECRET }
    : undefined;

  if (forceProvider === 'paper') {
    return { adapter: new PaperExchangeAdapter(env.DB, userId, globalProxy), provider: 'paper', label: 'Paper Simulator' };
  }

  const row = forceProvider
    ? await env.DB.prepare(
        `SELECT provider, label, encrypted_credentials FROM exchange_connections WHERE user_id = ? AND provider = ? ORDER BY updated_at DESC LIMIT 1`
      ).bind(userId, forceProvider).first<{ provider: string; label: string; encrypted_credentials: string }>()
    : await env.DB.prepare(
        `SELECT provider, label, encrypted_credentials FROM exchange_connections WHERE user_id = ? AND is_active = 1 ORDER BY updated_at DESC LIMIT 1`
      ).bind(userId).first<{ provider: string; label: string; encrypted_credentials: string }>();

  if (forceProvider === 'kcex' && !row) {
    return { adapter: new KcexFuturesAdapter(env.DB, userId), provider: 'kcex', label: 'KCEX Mirror (0% Maker / 0.01% Taker)' };
  }

  if (!row || row.provider === 'paper') {
    return { adapter: new PaperExchangeAdapter(env.DB, userId, globalProxy), provider: 'paper', label: 'Paper Simulator' };
  }

  const creds = await decryptVaultJson<{
    apiKey?: string;
    apiSecret?: string;
    webSessionToken?: string;
    proxyUrl?: string;
    proxySecret?: string;
  }>(
    row.encrypted_credentials,
    env.MASTER_ENCRYPTION_KEY
  ).catch(() => ({ apiKey: '', apiSecret: '', webSessionToken: '', proxyUrl: undefined, proxySecret: undefined }));

  if (row.provider === 'toobit' && creds.apiKey && creds.apiSecret) {
    return {
      adapter: new ToobitFuturesAdapter({
        apiKey: creds.apiKey,
        apiSecret: creds.apiSecret,
        proxyUrl: creds.proxyUrl || env.TOOBIT_PROXY_URL,
        proxySecret: creds.proxySecret || env.EXCHANGE_PROXY_SECRET,
      }),
      provider: 'toobit',
      label: row.label,
    };
  }
  if (row.provider === 'bitunix' && creds.apiKey && creds.apiSecret) {
    return {
      adapter: new BitunixFuturesAdapter({ apiKey: creds.apiKey, apiSecret: creds.apiSecret }),
      provider: 'bitunix',
      label: row.label,
    };
  }
  if (row.provider === 'kcex') {
    return {
      adapter: new KcexFuturesAdapter(env.DB, userId, creds.webSessionToken),
      provider: 'kcex',
      label: row.label || 'KCEX Signal-Mirror',
    };
  }

  return { adapter: new PaperExchangeAdapter(env.DB, userId, globalProxy), provider: 'paper', label: 'Paper Simulator' };
}
