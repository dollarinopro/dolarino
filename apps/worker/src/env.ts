export interface Env {
  DB: D1Database;
  TRADING_BOT_DO: DurableObjectNamespace;
  ASSETS?: { fetch(request: Request): Promise<Response> };
  SESSION_JWT_SECRET?: string;
  MASTER_ENCRYPTION_KEY?: string;
  OWNER_TELEGRAM_ID?: string;
  DEFAULT_SIGNAL_CHANNEL?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  PUBLIC_WEB_URL?: string;
  ALLOW_LIVE_TRADING?: string;
  TOOBIT_PROXY_URL?: string;
  EXCHANGE_PROXY_SECRET?: string;
  HILINKUP_API_KEY?: string;
  HILINKUP_BASE_URL?: string;
  HILINKUP_MODEL?: string;
  AI?: { run(model: string, input: Record<string, unknown>): Promise<unknown> };
}

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  role: 'owner' | 'admin' | 'user';
  telegramId: string | null;
}
