const enc = new TextEncoder();
const dec = new TextDecoder();

function toBase64(bytes: Uint8Array): string {
  let str = '';
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]!);
  return btoa(str);
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export function randomId(prefix = ''): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return prefix ? `${prefix}_${toHex(bytes)}` : toHex(bytes);
}

export function maskSecret(value: string): string {
  const clean = value.trim();
  if (clean.length <= 8) return '****';
  return `${clean.slice(0, 4)}****${clean.slice(-4)}`;
}

export function redactSecretsFromText(text: string): string {
  return text
    .replace(/\b\d{8,11}:[A-Za-z0-9_-]{30,}\b/g, '[REDACTED_BOT_TOKEN]')
    .replace(/\b(sk-[A-Za-z0-9_-]{12,}|AIza[A-Za-z0-9_-]{20,})\b/g, '[REDACTED_API_KEY]');
}

async function getAesKey(masterKeyB64?: string): Promise<CryptoKey> {
  const fallback = 'dollarino-dev-local-master-key-change-me-32b';
  const rawBytes = masterKeyB64
    ? await crypto.subtle.digest('SHA-256', enc.encode(masterKeyB64))
    : await crypto.subtle.digest('SHA-256', enc.encode(fallback));
  return crypto.subtle.importKey('raw', rawBytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encryptVaultJson(payload: unknown, masterKey?: string): Promise<string> {
  const key = await getAesKey(masterKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = enc.encode(JSON.stringify(payload));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: toArrayBuffer(iv) }, key, data));
  return JSON.stringify({
    v: 1,
    iv: toBase64(iv),
    ct: toBase64(cipher),
  });
}

export async function decryptVaultJson<T = Record<string, string>>(stored: string, masterKey?: string): Promise<T> {
  const parsed = JSON.parse(stored) as { v: number; iv: string; ct: string };
  const key = await getAesKey(masterKey);
  const iv = fromBase64(parsed.iv);
  const ct = fromBase64(parsed.ct);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: toArrayBuffer(iv) }, key, toArrayBuffer(ct));
  return JSON.parse(dec.decode(plain)) as T;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMat = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: toArrayBuffer(salt), iterations: 100_000, hash: 'SHA-256' },
    keyMat,
    256
  );
  return `pbkdf2$${toBase64(salt)}$${toBase64(new Uint8Array(derived))}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'pbkdf2') return false;
  const salt = fromBase64(parts[1]!);
  const expected = parts[2]!;
  const keyMat = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: toArrayBuffer(salt), iterations: 100_000, hash: 'SHA-256' },
    keyMat,
    256
  );
  const actual = toBase64(new Uint8Array(derived));
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export async function signJwt(payload: Record<string, unknown>, secret?: string): Promise<string> {
  const jwtSecret = secret || 'dollarino-dev-jwt-secret-change-in-production';
  const headerB64 = toBase64(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const body = { ...payload, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7 };
  const payloadB64 = toBase64(enc.encode(JSON.stringify(body)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const data = `${headerB64}.${payloadB64}`;
  const key = await crypto.subtle.importKey('raw', enc.encode(jwtSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
  const sigB64 = toBase64(sig).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${data}.${sigB64}`;
}

export async function verifyJwt(token: string, secret?: string): Promise<Record<string, unknown> | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const jwtSecret = secret || 'dollarino-dev-jwt-secret-change-in-production';
  const key = await crypto.subtle.importKey('raw', enc.encode(jwtSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const data = `${parts[0]}.${parts[1]}`;
  const sigB64 = parts[2]!.replace(/-/g, '+').replace(/_/g, '/');
  const paddedSig = sigB64 + '='.repeat((4 - (sigB64.length % 4)) % 4);
  const sigBytes = fromBase64(paddedSig);
  const ok = await crypto.subtle.verify('HMAC', key, toArrayBuffer(sigBytes), enc.encode(data));
  if (!ok) return null;
  const payloadB64 = parts[1]!.replace(/-/g, '+').replace(/_/g, '/');
  const paddedPayload = payloadB64 + '='.repeat((4 - (payloadB64.length % 4)) % 4);
  const parsed = JSON.parse(dec.decode(fromBase64(paddedPayload))) as Record<string, unknown>;
  if (typeof parsed.exp === 'number' && parsed.exp < Math.floor(Date.now() / 1000)) return null;
  return parsed;
}

export async function hmacSha256Hex(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
  return toHex(sig);
}

export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(input));
  return toHex(new Uint8Array(buf));
}

export async function verifyTelegramWebAppInitData(
  initDataRaw: string,
  botToken: string,
  maxAgeSeconds = 86_400
): Promise<{
  valid: boolean;
  user?: { id: number; first_name?: string; last_name?: string; username?: string; language_code?: string; photo_url?: string };
  startParam?: string;
  error?: string;
}> {
  if (!initDataRaw || !botToken) return { valid: false, error: 'Missing initData or botToken' };
  const params = new URLSearchParams(initDataRaw);
  const hash = params.get('hash');
  if (!hash || !/^[0-9a-f]{64}$/i.test(hash)) {
    return { valid: false, error: 'Missing or invalid initData hash' };
  }

  const authDate = Number(params.get('auth_date') || 0);
  if (!Number.isFinite(authDate) || Math.floor(Date.now() / 1000) - authDate > maxAgeSeconds) {
    return { valid: false, error: 'Telegram initData has expired' };
  }

  params.delete('hash');
  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const webAppKey = await crypto.subtle.importKey('raw', enc.encode('WebAppData'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const secretRaw = await crypto.subtle.sign('HMAC', webAppKey, enc.encode(botToken));
  const dataKey = await crypto.subtle.importKey('raw', secretRaw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sigHex = toHex(new Uint8Array(await crypto.subtle.sign('HMAC', dataKey, enc.encode(dataCheckString))));

  const expected = hash.toLowerCase();
  if (sigHex.length !== expected.length) return { valid: false, error: 'Hash length mismatch' };
  let diff = 0;
  for (let i = 0; i < sigHex.length; i++) diff |= sigHex.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return { valid: false, error: 'Invalid Telegram signature' };

  const userJson = params.get('user');
  if (!userJson) return { valid: false, error: 'Missing user payload in initData' };
  const tgUser = JSON.parse(userJson) as {
    id: number;
    first_name?: string;
    last_name?: string;
    username?: string;
    language_code?: string;
  };
  return { valid: true, user: tgUser, startParam: params.get('start_param') ?? undefined };
}

export async function verifyTelegramLoginWidget(
  payload: Record<string, string | number | undefined>,
  botToken: string,
  maxAgeSeconds = 86_400
): Promise<{
  valid: boolean;
  user?: { id: number; first_name?: string; last_name?: string; username?: string; photo_url?: string };
  error?: string;
}> {
  const hash = String(payload.hash || '').trim().toLowerCase();
  if (!hash || !/^[0-9a-f]{64}$/.test(hash) || !botToken) {
    return { valid: false, error: 'Missing or invalid Login Widget hash' };
  }
  const authDate = Number(payload.auth_date || 0);
  if (!Number.isFinite(authDate) || Math.floor(Date.now() / 1000) - authDate > maxAgeSeconds) {
    return { valid: false, error: 'Telegram Login Widget auth_date expired' };
  }
  const pairs: Array<[string, string]> = [];
  for (const [k, v] of Object.entries(payload)) {
    if (k === 'hash' || v === undefined || v === null || v === '') continue;
    pairs.push([k, String(v)]);
  }
  pairs.sort(([a], [b]) => a.localeCompare(b));
  const dataCheckString = pairs.map(([k, v]) => `${k}=${v}`).join('\n');

  const secretDigest = await crypto.subtle.digest('SHA-256', enc.encode(botToken));
  const key = await crypto.subtle.importKey('raw', secretDigest, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sigHex = toHex(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(dataCheckString))));

  if (sigHex.length !== hash.length) return { valid: false, error: 'Hash length mismatch' };
  let diff = 0;
  for (let i = 0; i < sigHex.length; i++) diff |= sigHex.charCodeAt(i) ^ hash.charCodeAt(i);
  if (diff !== 0) return { valid: false, error: 'Invalid Telegram Login Widget signature' };

  const idNum = Number(payload.id);
  if (!Number.isFinite(idNum) || idNum <= 0) return { valid: false, error: 'Invalid Telegram user id' };
  return {
    valid: true,
    user: {
      id: idNum,
      first_name: payload.first_name ? String(payload.first_name) : undefined,
      last_name: payload.last_name ? String(payload.last_name) : undefined,
      username: payload.username ? String(payload.username) : undefined,
      photo_url: payload.photo_url ? String(payload.photo_url) : undefined,
    },
  };
}


