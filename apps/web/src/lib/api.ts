const TOKEN_KEY = 'dollarino_token';
const API_BASE = ((import.meta as unknown as { env?: { VITE_API_BASE?: string } }).env?.VITE_API_BASE || '').replace(/\/+$/, '');
let memoryToken: string | null = null;

export function getStoredToken(): string | null {
  if (memoryToken) return memoryToken;
  try {
    const saved = localStorage.getItem(TOKEN_KEY);
    if (saved) memoryToken = saved;
    return saved;
  } catch {
    return memoryToken;
  }
}

export function setStoredToken(token: string | null) {
  memoryToken = token;
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Restricted iframe storage fallback uses memoryToken
  }
}

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function apiFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (token) {
    if (!headers.Authorization) headers.Authorization = `Bearer ${token}`;
    headers['X-Dollarino-Token'] = token;
  }

  const targetUrl = path.startsWith('http') ? path : `${API_BASE}${path}`;
  const res = await fetch(targetUrl, {
    ...init,
    credentials: 'include',
    headers,
  });

  const text = await res.text();
  let json: unknown = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    if (res.status === 404) {
      throw new ApiError(
        'سرویس API متصل نیست (404). لطفاً صفحه را رفرش کنید یا مطمئن شوید Worker دلارینو متصل است.',
        404,
        'API_UNREACHABLE'
      );
    }
    throw new ApiError(`Server error (${res.status}): ${text.slice(0, 120)}`, res.status);
  }

  if (!res.ok) {
    const errObj = json as { error?: string; code?: string };
    throw new ApiError(errObj.error || `HTTP ${res.status}`, res.status, errObj.code);
  }
  return json as T;
}
