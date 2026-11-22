export interface TelegramWebAppApi {
  initData?: string;
  initDataUnsafe?: {
    user?: { id: number; first_name?: string; last_name?: string; username?: string; language_code?: string };
    start_param?: string;
  };
  colorScheme?: 'light' | 'dark';
  platform?: string;
  isExpanded?: boolean;
  ready?: () => void;
  expand?: () => void;
  close?: () => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  BackButton?: {
    show?: () => void;
    hide?: () => void;
    onClick?: (cb: () => void) => void;
    offClick?: (cb: () => void) => void;
  };
  MainButton?: {
    setText?: (t: string) => void;
    show?: () => void;
    hide?: () => void;
    onClick?: (cb: () => void) => void;
    offClick?: (cb: () => void) => void;
  };
  HapticFeedback?: {
    impactOccurred?: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
    notificationOccurred?: (type: 'error' | 'success' | 'warning') => void;
    selectionChanged?: () => void;
  };
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebAppApi;
    };
  }
}

export function getTelegramWebApp(): TelegramWebAppApi | null {
  if (typeof window === 'undefined') return null;
  return window.Telegram?.WebApp ?? null;
}

export function isInsideTelegramMiniApp(): boolean {
  const wa = getTelegramWebApp();
  return Boolean(wa && wa.initData && wa.initData.length > 10);
}

export function initTelegramMiniApp(bgColor?: string): TelegramWebAppApi | null {
  const wa = getTelegramWebApp();
  if (!wa) return null;
  try {
    wa.ready?.();
    wa.expand?.();
    if (bgColor) {
      wa.setHeaderColor?.(bgColor);
      wa.setBackgroundColor?.(bgColor);
    }
  } catch {
    /* ignore outside Telegram */
  }
  return wa;
}

export function tgHaptic(style: 'light' | 'medium' | 'heavy' = 'light') {
  try {
    getTelegramWebApp()?.HapticFeedback?.impactOccurred?.(style);
  } catch {
    /* ignore */
  }
}

export function tgNotifyHaptic(type: 'success' | 'error' | 'warning') {
  try {
    getTelegramWebApp()?.HapticFeedback?.notificationOccurred?.(type);
  } catch {
    /* ignore */
  }
}
