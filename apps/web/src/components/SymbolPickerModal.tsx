import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search, Star, TrendingDown, TrendingUp, X } from 'lucide-react';
import type { Lang } from '../lib/i18n';
import { CoinIcon } from './CoinIcon';

export interface ExchangeMarket {
  symbol: string;
  exchangeSymbol: string;
  base: string;
  quote: string;
  lastPrice: string;
  changePct24h: string;
  high24h: string;
  low24h: string;
  volume24h: number;
  maxLeverage: number;
  basePrecision: number;
  quotePrecision: number;
  marketType?: 'SPOT' | 'FUTURES';
}

const FAV_KEY = 'dollarino_fav_pairs';

function loadFavs(): Set<string> {
  try {
    const raw = localStorage.getItem(FAV_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : ['BTCUSDT', 'ETHUSDT', 'SOLUSDT']);
  } catch {
    return new Set(['BTCUSDT', 'ETHUSDT', 'SOLUSDT']);
  }
}

export function SymbolPicker({
  lang,
  value,
  markets,
  provider,
  marketType = 'FUTURES',
  onChangeMarketType,
  onChange,
  compact = false,
}: {
  lang: Lang;
  value: string;
  markets: ExchangeMarket[];
  provider: string;
  marketType?: 'SPOT' | 'FUTURES';
  onChangeMarketType?: (next: 'SPOT' | 'FUTURES') => void;
  onChange: (symbol: string) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'volume' | 'gainers' | 'losers' | 'favs'>('volume');
  const [visibleLimit, setVisibleLimit] = useState(80);
  const [favs, setFavs] = useState<Set<string>>(loadFavs);

  const current = useMemo(() => markets.find((m) => m.symbol === value), [markets, value]);

  const toggleFav = (sym: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = new Set(favs);
    if (next.has(sym)) next.delete(sym);
    else next.add(sym);
    setFavs(next);
    try {
      localStorage.setItem(FAV_KEY, JSON.stringify(Array.from(next)));
    } catch { /* ignore */ }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    let list = markets;
    if (sort === 'favs') {
      list = list.filter((m) => favs.has(m.symbol));
    }
    if (q) {
      list = list.filter((m) => m.symbol.includes(q) || m.base.includes(q) || m.exchangeSymbol.toUpperCase().includes(q));
    }
    if (sort === 'gainers') {
      list = [...list].sort((a, b) => Number(b.changePct24h) - Number(a.changePct24h));
    } else if (sort === 'losers') {
      list = [...list].sort((a, b) => Number(a.changePct24h) - Number(b.changePct24h));
    }
    return list;
  }, [markets, query, sort, favs]);

  const visibleList = useMemo(() => filtered.slice(0, visibleLimit), [filtered, visibleLimit]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setVisibleLimit(80);
          setOpen(true);
        }}
        className={`inline-flex items-center justify-between gap-2 surface-soft border rounded-xl transition text-start ${
          compact ? 'px-3 py-1.5 text-xs' : 'px-3.5 py-2 text-sm'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <CoinIcon symbol={value} size={20} />
          <span className="font-extrabold text-main whitespace-nowrap">{value}</span>
          {current && current.exchangeSymbol !== value && (
            <span className="hidden sm:inline text-[10px] px-1.5 py-0.5 rounded banner-cobalt-soft text-brand font-mono-num">
              {current.exchangeSymbol}
            </span>
          )}
          <span className="hidden sm:inline whitespace-nowrap text-[10px] px-1.5 py-0.5 rounded badge-signal font-mono-num font-bold">
            {markets.length} {lang === 'fa' ? 'ارز' : 'pairs'}
          </span>
        </div>
        <ChevronDown className="w-4 h-4 text-dim shrink-0" />
      </button>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            dir={lang === 'fa' ? 'rtl' : 'ltr'}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-[200] bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="surface-card rounded-t-3xl sm:rounded-3xl w-full max-w-2xl max-h-[86vh] flex flex-col shadow-2xl overflow-hidden border hairline"
            >
            <div className="p-4 border-b flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-black text-main">
                  {lang === 'fa'
                    ? `تمام ارزهای ${marketType === 'SPOT' ? 'اسپات' : 'فیوچرز'} صرافی ${provider.toUpperCase()} (${markets.length} جفت‌ارز)`
                    : `${provider.toUpperCase()} ${marketType} Markets (${markets.length} pairs)`}
                </h3>
                <p className="text-[11px] text-sub">
                  {lang === 'fa'
                    ? 'جستجو و انتخاب از میان تمامی کوین‌های لیست‌شده در صرافی بدون هیچ‌گونه محدودیت'
                    : 'Search and pick from every coin listed on the exchange without caps'}
                </p>
              </div>
              <button onClick={() => setOpen(false)} className="p-2 rounded-xl surface-soft text-sub">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 border-b space-y-2.5">
              {onChangeMarketType && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => onChangeMarketType('FUTURES')}
                    className={`py-1.5 rounded-xl text-xs font-extrabold transition ${
                      marketType === 'FUTURES' ? 'btn-emerald' : 'surface-soft text-sub'
                    }`}
                  >
                    {lang === 'fa' ? 'بازار فیوچرز (Futures)' : 'Futures Market'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onChangeMarketType('SPOT')}
                    className={`py-1.5 rounded-xl text-xs font-extrabold transition ${
                      marketType === 'SPOT' ? 'btn-emerald' : 'surface-soft text-sub'
                    }`}
                  >
                    {lang === 'fa' ? 'بازار اسپات (Spot)' : 'Spot Market'}
                  </button>
                </div>
              )}

              <div className="relative">
                <Search className="w-4 h-4 text-dim absolute start-3 top-2.5" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setVisibleLimit(100);
                  }}
                  placeholder={lang === 'fa' ? 'جستجو نماد (مثل BTC، PEPE، SUI، TON...)' : 'Search symbol (BTC, PEPE, SUI, TON...)'}
                  className="w-full surface-input rounded-xl ps-9 pe-3 py-2 text-xs outline-none focus:border-brand"
                />
              </div>

              <div className="flex flex-wrap gap-1.5 text-[11px]">
                {[
                  { id: 'volume', label: lang === 'fa' ? 'پرحجم‌ترین' : 'Top Volume' },
                  { id: 'gainers', label: lang === 'fa' ? 'بیشترین رشد' : 'Top Gainers' },
                  { id: 'losers', label: lang === 'fa' ? 'بیشترین افت' : 'Top Losers' },
                  { id: 'favs', label: lang === 'fa' ? 'منتخب‌ها' : 'Favorites', withStar: true },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setSort(tab.id as typeof sort)}
                    className={`px-3 py-1 rounded-xl font-bold inline-flex items-center gap-1 ${
                      sort === tab.id ? 'btn-emerald' : 'surface-soft text-sub hover:text-main'
                    }`}
                  >
                    {tab.withStar && <Star className="w-3 h-3" />}
                    <span>{tab.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y">
              {visibleList.length === 0 ? (
                <div className="py-10 text-center text-xs text-dim">
                  {lang === 'fa' ? 'جفت‌ارزی با این نام پیدا نشد.' : 'No matching pairs found.'}
                </div>
              ) : (
                <>
                  {visibleList.map((m) => {
                    const pct = Number(m.changePct24h);
                    const isFav = favs.has(m.symbol);
                    const selected = m.symbol === value;
                    return (
                      <button
                        key={m.symbol}
                        type="button"
                        onClick={() => {
                          onChange(m.symbol);
                          setOpen(false);
                        }}
                        className={`w-full px-4 py-2.5 flex items-center justify-between gap-3 text-start transition ${
                          selected ? 'banner-cobalt-soft' : 'hover:bg-black/5 dark:hover:bg-white/5'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            onClick={(e) => toggleFav(m.symbol, e)}
                            className={`p-1 rounded ${isFav ? 'text-flame' : 'text-dim'}`}
                          >
                            <Star className="w-3.5 h-3.5" fill={isFav ? 'currentColor' : 'none'} />
                          </span>
                          <CoinIcon symbol={m.symbol} size={22} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-extrabold text-xs text-main">{m.symbol}</span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded surface-soft text-sub font-mono-num">
                                {marketType === 'SPOT' ? '1x' : `${m.maxLeverage}x`}
                              </span>
                            </div>
                            <div className="text-[10px] text-dim font-mono-num truncate">
                              {m.exchangeSymbol} · Vol ${Math.round(m.volume24h).toLocaleString()}
                            </div>
                          </div>
                        </div>

                        <div className="text-end font-mono-num shrink-0">
                          <div className="text-xs font-extrabold text-main">
                            ${Number(m.lastPrice) > 0 ? m.lastPrice : '—'}
                          </div>
                          <div className={`text-[11px] font-bold inline-flex items-center gap-0.5 ${pct >= 0 ? 'text-signal' : 'text-loss'}`}>
                            {pct >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            <span>{pct >= 0 ? '+' : ''}{pct.toFixed(2)}%</span>
                          </div>
                        </div>
                      </button>
                    );
                  })}

                  {filtered.length > visibleList.length && (
                    <div className="p-3 text-center">
                      <button
                        type="button"
                        onClick={() => setVisibleLimit((n) => n + 100)}
                        className="btn-ghost px-4 py-2 rounded-xl text-xs font-bold"
                      >
                        {lang === 'fa'
                          ? `نمایش ۱۰۰ ارز بیشتر (${visibleList.length} از ${filtered.length})`
                          : `Load 100 more (${visibleList.length} of ${filtered.length})`}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
