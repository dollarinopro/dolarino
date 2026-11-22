export const COIN_FA_NAMES: Record<string, string> = {
  BTC: 'بیت‌کوین',
  ETH: 'اتریوم',
  USDT: 'تتر',
  XRP: 'ریپل',
  SOL: 'سولانا',
  BNB: 'بایننس کوین',
  BCH: 'بیت‌کوین کش',
  LTC: 'لایت‌کوین',
  LINK: 'چین لینک',
  ADA: 'کاردانو',
  DOGE: 'دوج‌کوین',
  TON: 'تون‌کوین',
  AVAX: 'آوالانچ',
  DOT: 'پولکادات',
  TRX: 'ترون',
  SUI: 'سویی',
  SHIB: 'شیبا',
  PEPE: 'پپه',
  ARB: 'آربیتروم',
  OP: 'آپتیمیزم',
  NEAR: 'نیر',
  ATOM: 'کازماس',
  UNI: 'یونی‌سواپ',
  PAXG: 'پکس گلد',
};

export function coinDisplayName(symbolOrBase: string, isFa: boolean): string {
  const base = symbolOrBase.toUpperCase().replace(/USDT$/, '').replace(/USD$/, '');
  if (!isFa) return base;
  return COIN_FA_NAMES[base] ?? base;
}

export function formatUsdPrice(px: number): string {
  if (!Number.isFinite(px) || px <= 0) return '0';
  if (px >= 1000) return px.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (px >= 1) return px.toFixed(2);
  return px.toFixed(4);
}

export function formatTomanEq(usd: number, rate = 70000): string {
  if (!Number.isFinite(usd)) return '0';
  return Math.round(usd * rate).toLocaleString('fa-IR');
}

export function getPersianToday(): string {
  try {
    return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
      timeZone: 'Asia/Tehran',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}
