import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Layers,
  Lock,
  Monitor,
  QrCode,
  Send,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Target,
  TrendingUp,
} from 'lucide-react';
import { DollarinoBrandMark } from '../components/BrandGraphics';
import { apiFetch, getStoredToken } from '../lib/api';
import type { Lang } from '../lib/i18n';
import type { DashboardPayload, VerifiedProfitCard } from '../lib/types';

const THEMES = [
  { id: 'dark', labelFa: 'کبالت رسمی', labelEn: 'Cobalt Official', from: '#0b183d', to: '#040917', accent: '#38e1ff', text: '#eef2ff' },
  { id: 'gold', labelFa: 'طلایی لوکس', labelEn: 'Obsidian Gold', from: '#2d2007', to: '#0c0d07', accent: '#f0b90b', text: '#f5e8bd' },
  { id: 'emerald', labelFa: 'سبز سیگنال', labelEn: 'Emerald Mint', from: '#05281e', to: '#04120e', accent: '#10d9a3', text: '#d9fff0' },
] as const;

type StyleId = (typeof THEMES)[number]['id'];
type CardLayout = 'horizontal' | 'vertical';

function fmtUsdSigned(val: number): string {
  const abs = Math.abs(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return val >= 0 ? `+$${abs}` : `-$${abs}`;
}

function fmtPctSigned(val: number): string {
  const abs = Math.abs(val).toFixed(2);
  return val >= 0 ? `+${abs}%` : `-${abs}%`;
}

function periodTitle(p: VerifiedProfitCard['period'], isFa: boolean): string {
  switch (p) {
    case '24H':
      return isFa ? '۲۴ ساعته' : '24 Hours';
    case '7D':
      return isFa ? 'هفتگی' : 'Weekly (7D)';
    case '30D':
      return isFa ? 'ماهانه' : 'Monthly (30D)';
    case '1Y':
      return isFa ? 'سالانه' : 'Yearly (1Y)';
    case 'ALL':
      return isFa ? 'کل دوره' : 'All Time';
    case 'TRADE':
      return isFa ? 'تک‌معامله' : 'Single Trade';
  }
}

export function WeeklyCardPage({
  lang,
  username,
  data,
}: {
  lang: Lang;
  username: string;
  data: DashboardPayload;
}) {
  const isFa = lang === 'fa';
  const [mode, setMode] = useState<'LIVE' | 'PAPER'>(data.config.trading_mode === 'LIVE' ? 'LIVE' : 'PAPER');
  const [period, setPeriod] = useState<'24H' | '7D' | '30D' | '1Y' | 'ALL' | 'TRADE'>('7D');
  const [layout, setLayout] = useState<CardLayout>('horizontal');
  const [selectedTradeId, setSelectedTradeId] = useState<string>('');
  const [cardStyle, setCardStyle] = useState<StyleId>('dark');
  const [issuedCard, setIssuedCard] = useState<VerifiedProfitCard | null>(null);
  const [archive, setArchive] = useState<VerifiedProfitCard[]>([]);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [sendingTg, setSendingTg] = useState(false);
  const [notice, setNotice] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const theme = THEMES.find((x) => x.id === cardStyle) ?? THEMES[0]!;
  const closedList = data.closedTrades ?? [];

  const loadArchive = useCallback(async () => {
    try {
      const res = await apiFetch<{ cards: Array<Record<string, unknown>> }>('/api/trading/cards');
      const mapped: VerifiedProfitCard[] = (res.cards || []).map((r) => {
        let p: { cardStyle?: string; symbol?: string; direction?: string; isVerifiedReal?: boolean } = {};
        try {
          p = JSON.parse(String(r.payload_json || '{}'));
        } catch {
          p = {};
        }
        const m = String(r.mode || 'LIVE') === 'PAPER' ? 'PAPER' : 'LIVE';
        return {
          id: String(r.id),
          userId: String(r.user_id),
          displayName: username,
          mode: m,
          isVerifiedReal: m === 'LIVE',
          period: String(r.period || '7D') as VerifiedProfitCard['period'],
          startDate: String(r.start_date),
          endDate: String(r.end_date),
          tradesCount: Number(r.trades_count || 0),
          winRate: Number(r.win_rate || 0),
          netPnlUsd: Number(r.net_pnl_usd || 0),
          roiPct: Number(r.roi_pct || 0),
          profitFactor: Number(r.profit_factor || 0),
          exchangeProvider: String(r.exchange_provider || 'TOOBIT'),
          strategyName: String(r.strategy_name || 'dollarino_v01'),
          cardStyle: p.cardStyle || 'dark',
          symbol: p.symbol,
          direction: p.direction,
          signaturePrefix: String(r.hmac_signature || '').slice(0, 16),
          verifyPath: `/verify-card/${r.id}`,
          issuedAt: String(r.issued_at),
        };
      });
      setArchive(mapped);
      if (!issuedCard && mapped.length > 0) {
        setIssuedCard(mapped[0]!);
      }
    } catch {
      /* ignore */
    }
  }, [username, issuedCard]);

  useEffect(() => {
    void loadArchive();
  }, [loadArchive]);

  useEffect(() => {
    if (!issuedCard) {
      setQrDataUrl('');
      return;
    }
    const verifyUrl = `${window.location.origin}/verify-card/${issuedCard.id}`;
    QRCode.toDataURL(verifyUrl, { width: 160, margin: 1, color: { dark: '#0b1120', light: '#ffffff' } })
      .then((url) => setQrDataUrl(url))
      .catch(() => setQrDataUrl(''));
  }, [issuedCard]);

  const handleIssueCard = async () => {
    setBusy(true);
    setErrorMsg('');
    setNotice('');
    try {
      const res = await apiFetch<{ ok: boolean; card: VerifiedProfitCard }>('/api/trading/cards/issue', {
        method: 'POST',
        body: JSON.stringify({
          mode,
          period,
          tradeId: period === 'TRADE' ? selectedTradeId : undefined,
          cardStyle,
        }),
      });
      setIssuedCard(res.card);
      setNotice(
        res.card.isVerifiedReal
          ? isFa
            ? `کارت سود واقعی تاییدشده دلارینو صادر شد (${res.card.id})`
            : `Verified Real Profit Card issued (${res.card.id})`
          : isFa
            ? `کارت سود آزمایشی (دمو) صادر شد (${res.card.id})`
            : `Demo Profit Card issued (${res.card.id})`
      );
      await loadArchive();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to issue verified profit card');
    } finally {
      setBusy(false);
    }
  };

  const downloadServerPng = async () => {
    if (!issuedCard) return;
    setExporting(true);
    setErrorMsg('');
    try {
      const token = getStoredToken();
      const url = `/api/trading/cards/${encodeURIComponent(issuedCard.id)}/image?layout=${layout}`;
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const contentType = res.headers.get('content-type') || '';
      if (!res.ok || !contentType.includes('image/png')) {
        throw new Error('Server PNG fallback');
      }
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.download = `dollarino-profit-card-${issuedCard.id}-${layout}.png`;
      a.href = objUrl;
      a.click();
      setTimeout(() => URL.revokeObjectURL(objUrl), 4000);
      setNotice(
        isFa
          ? `تصویر کارت سود دلارینو (${layout === 'horizontal' ? 'افقی 16:9' : 'عمودی 3:4'}) دانلود شد`
          : `Downloaded ${layout} Profit Card PNG`
      );
    } catch {
      // Fallback high-res client Canvas render with watermark + fixed LTR signs
      await downloadCanvasFallbackPng();
    } finally {
      setExporting(false);
    }
  };

  const downloadCanvasFallbackPng = async () => {
    if (!issuedCard) return;
    await document.fonts.ready;
    const isHoriz = layout === 'horizontal';
    const W = isHoriz ? 1200 : 1080;
    const H = isHoriz ? 675 : 1440;
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const ctx = cv.getContext('2d')!;

    const cardTheme = THEMES.find((x) => x.id === (issuedCard.cardStyle || cardStyle)) ?? theme;
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, cardTheme.from);
    g.addColorStop(1, cardTheme.to);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Center faint Dollarino watermark logo
    try {
      const logoImg = await new Promise<HTMLImageElement>((resolve, reject) => {
        const im = new Image();
        im.crossOrigin = 'anonymous';
        im.onload = () => resolve(im);
        im.onerror = reject;
        im.src = '/logo.png';
      });
      ctx.save();
      ctx.globalAlpha = 0.12;
      const wmSize = isHoriz ? 340 : 420;
      ctx.drawImage(logoImg, (W - wmSize) / 2, (H - wmSize) / 2, wmSize, wmSize);
      ctx.restore();
      ctx.drawImage(logoImg, W - 128, 44, 72, 72);
    } catch {
      /* ignore */
    }

    // Tilted Account Stamp
    ctx.save();
    ctx.translate(W * 0.62, H * 0.44);
    ctx.rotate(-0.24);
    ctx.textAlign = 'center';
    ctx.font = '900 42px Manrope, sans-serif';
    ctx.fillStyle = issuedCard.isVerifiedReal ? 'rgba(16, 217, 163, 0.22)' : 'rgba(245, 158, 11, 0.25)';
    ctx.strokeStyle = issuedCard.isVerifiedReal ? 'rgba(16, 217, 163, 0.4)' : 'rgba(245, 158, 11, 0.45)';
    ctx.lineWidth = 3;
    ctx.strokeRect(-230, -38, 460, 68);
    ctx.fillText(issuedCard.isVerifiedReal ? 'LIVE REAL VERIFIED' : 'DEMO / PAPER ACCOUNT', 0, 8);
    ctx.restore();

    ctx.strokeStyle = cardTheme.accent + '88';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(24, 24, W - 48, H - 48, 32);
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.fillStyle = cardTheme.accent;
    ctx.font = '800 22px Manrope, sans-serif';
    ctx.fillText(`DOLLARINO PROFIT CARD · ${issuedCard.period} (${issuedCard.exchangeProvider})`, 64, 86);

    ctx.fillStyle = '#f5f2e8';
    ctx.font = '800 46px Manrope, sans-serif';
    ctx.fillText(issuedCard.displayName || username || 'Trader', 64, 150);

    ctx.fillStyle = issuedCard.netPnlUsd >= 0 ? '#10d9a3' : '#ff4d6d';
    ctx.font = '900 108px Manrope, sans-serif';
    ctx.fillText(fmtPctSigned(issuedCard.roiPct), 64, isHoriz ? 305 : 420);

    ctx.font = '800 38px Manrope, sans-serif';
    ctx.fillText(`${fmtUsdSigned(issuedCard.netPnlUsd)} USDT`, 64, isHoriz ? 365 : 490);

    const statsY = isHoriz ? 430 : 620;
    const boxW = isHoriz ? 260 : 290;
    [
      { label: 'TRADES', val: String(issuedCard.tradesCount) },
      { label: 'WIN RATE', val: `${issuedCard.winRate.toFixed(1)}%` },
      { label: 'PROFIT FACTOR', val: issuedCard.profitFactor.toFixed(2) },
    ].forEach((s, i) => {
      const bx = 64 + i * (boxW + 24);
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.strokeStyle = 'rgba(255,255,255,0.16)';
      ctx.beginPath();
      ctx.roundRect(bx, statsY, boxW, 130, 20);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#f5f2e8';
      ctx.font = '800 42px Manrope, sans-serif';
      ctx.fillText(s.val, bx + 22, statsY + 68);
      ctx.fillStyle = 'rgba(245,242,232,0.6)';
      ctx.font = '700 15px Manrope, sans-serif';
      ctx.fillText(s.label, bx + 22, statsY + 106);
    });

    if (qrDataUrl) {
      const qrImg = await new Promise<HTMLImageElement>((resolve, reject) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = reject;
        im.src = qrDataUrl;
      });
      const qSize = 110;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.roundRect(W - 170, H - 170, qSize + 12, qSize + 12, 16);
      ctx.fill();
      ctx.drawImage(qrImg, W - 164, H - 164, qSize, qSize);
    }

    ctx.fillStyle = 'rgba(245,242,232,0.72)';
    ctx.font = '700 18px Manrope, sans-serif';
    ctx.fillText(`@Dollarino_official · @Dollarino_bot · ID: ${issuedCard.id}`, 64, H - 56);

    const a = document.createElement('a');
    a.download = `dollarino-profit-card-${issuedCard.id}-${layout}.png`;
    a.href = cv.toDataURL('image/png');
    a.click();
    setNotice(isFa ? 'تصویر کارت سود با مهر اصالت دانلود شد' : 'Profit Card PNG downloaded');
  };

  const sendCardToTelegram = async () => {
    if (!issuedCard) return;
    setSendingTg(true);
    setErrorMsg('');
    try {
      await apiFetch(`/api/trading/cards/${encodeURIComponent(issuedCard.id)}/send-telegram`, {
        method: 'POST',
        body: JSON.stringify({ layout }),
      });
      setNotice(
        isFa
          ? `تصویر ${layout === 'horizontal' ? 'افقی' : 'عمودی'} کارت سود مستقیم به تلگرام شما (@Dollarino_bot) ارسال شد.`
          : `Profit Card PNG sent to your Telegram (@Dollarino_bot).`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Telegram dispatch failed');
    } finally {
      setSendingTg(false);
    }
  };

  const activeTheme = THEMES.find((t) => t.id === (issuedCard?.cardStyle || cardStyle)) ?? theme;

  return (
    <div className="space-y-8">
      <div className="text-center max-w-2xl mx-auto">
        <p className="text-[10px] font-black tracking-[0.2em] uppercase mb-2 flex items-center justify-center gap-2" style={{ color: 'var(--gold)' }}>
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>DOLLARINO VERIFIED PROFIT CARD</span>
        </p>
        <h2 className="font-display font-bold text-3xl sm:text-4xl text-main">
          {isFa ? 'کارت سود دلارینو' : 'Dollarino Profit Card'}
        </h2>
        <p className="text-xs sm:text-sm text-dim mt-2">
          {isFa
            ? 'تمام آمارها مستقیماً از دفتر کل سرور محاسبه شده و با امضای رمزنگاری HMAC-SHA256، لوگوی کم‌رنگ دلارینو و مهر حساب واقعی یا دمو صادر می‌شوند.'
            : 'Tamper-proof Profit Cards computed on the server with HMAC-SHA256 verification, watermarked logo, and Real vs Demo seal.'}
        </p>
      </div>

      <div className="grid lg:grid-cols-12 gap-8 items-start">
        {/* Controls Column */}
        <div className="lg:col-span-5 panel rounded-[26px] p-6 space-y-5">
          <div className="rounded-2xl border p-3.5 banner-cobalt-soft flex items-start gap-2.5 text-xs">
            <Lock className="w-4 h-4 text-brand shrink-0 mt-0.5" />
            <div className="text-sub leading-relaxed">
              {isFa
                ? 'اعداد این کارت غیرقابل دستکاری هستند؛ حساب واقعی و حساب دمو با مهر مشخص و متمایز درج می‌شوند.'
                : 'Stats are cryptographically signed and stamped clearly as LIVE VERIFIED or DEMO ACCOUNT.'}
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black text-dim uppercase block mb-2">
              {isFa ? '۱. نوع حساب مبنای کارت' : '1. ACCOUNT SOURCE'}
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setMode('LIVE')}
                className={`p-3 rounded-2xl border text-start transition ${
                  mode === 'LIVE' ? 'border-emerald-500/60 bg-emerald-500/10' : 'surface-soft'
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs font-black text-main">
                  <ShieldCheck className="w-4 h-4 text-jade" />
                  <span>{isFa ? 'حساب واقعی (Live)' : 'Live Real Account'}</span>
                </div>
                <p className="text-[10px] text-dim mt-1">{isFa ? 'مهر تاییدشده LIVE VERIFIED' : 'Official Verified Stamp'}</p>
              </button>
              <button
                type="button"
                onClick={() => setMode('PAPER')}
                className={`p-3 rounded-2xl border text-start transition ${
                  mode === 'PAPER' ? 'border-amber-500/60 bg-amber-500/10' : 'surface-soft'
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs font-black text-main">
                  <AlertTriangle className="w-4 h-4 text-goldsoft" />
                  <span>{isFa ? 'حساب دمو (شبیه‌ساز)' : 'Demo / Paper Account'}</span>
                </div>
                <p className="text-[10px] text-dim mt-1">{isFa ? 'مهر شفاف DEMO / PAPER' : 'Demo Stamp Included'}</p>
              </button>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black text-dim uppercase block mb-2">
              {isFa ? '۲. بازه زمانی محاسبه' : '2. SETTLED PERIOD'}
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
              {([
                ['24H', isFa ? '۲۴ ساعت' : '24H'],
                ['7D', isFa ? 'هفتگی' : '7D'],
                ['30D', isFa ? 'ماهانه' : '30D'],
                ['1Y', isFa ? 'سالانه' : '1Y'],
                ['ALL', isFa ? 'کل دوره' : 'ALL'],
                ['TRADE', isFa ? 'تک‌معامله' : '1 Trade'],
              ] as const).map(([p, lbl]) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  className={`py-2 rounded-xl text-[11px] font-extrabold transition ${
                    period === p ? 'btn-gold' : 'surface-soft text-sub hover:text-main'
                  }`}
                >
                  {lbl}
                </button>
              ))}
            </div>
          </div>

          {period === 'TRADE' && (
            <div>
              <label className="text-[10px] font-black text-dim uppercase block mb-2">
                {isFa ? 'انتخاب معامله تسویه‌شده' : 'SELECT SETTLED TRADE'}
              </label>
              <select value={selectedTradeId} onChange={(e) => setSelectedTradeId(e.target.value)} className="field text-xs">
                <option value="">{isFa ? 'یک معامله بسته شده انتخاب کنید...' : 'Select closed trade...'}</option>
                {closedList
                  .filter((t) => ((t as { mode?: string }).mode || 'PAPER') === mode)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.symbol} ({t.direction}) · {fmtUsdSigned(Number(t.realized_pnl))}
                    </option>
                  ))}
              </select>
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-black text-dim uppercase block mb-2">
                {isFa ? '۳. قالب خروجی کارت' : '3. CARD LAYOUT'}
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setLayout('horizontal')}
                  className={`py-2 px-2.5 rounded-xl text-[11px] font-black flex items-center justify-center gap-1.5 border ${
                    layout === 'horizontal' ? 'border-[#1652f0] bg-[#1652f0]/15 text-main' : 'surface-soft text-dim'
                  }`}
                >
                  <Monitor className="w-3.5 h-3.5" />
                  <span>{isFa ? 'افقی (۱۶:۹)' : 'Horizontal'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setLayout('vertical')}
                  className={`py-2 px-2.5 rounded-xl text-[11px] font-black flex items-center justify-center gap-1.5 border ${
                    layout === 'vertical' ? 'border-[#1652f0] bg-[#1652f0]/15 text-main' : 'surface-soft text-dim'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>{isFa ? 'عمودی (استوری)' : 'Vertical'}</span>
                </button>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-black text-dim uppercase block mb-2">{isFa ? '۴. تم رنگی' : '4. THEME'}</label>
              <div className="flex items-center gap-2.5">
                {THEMES.map((th) => (
                  <button
                    key={th.id}
                    type="button"
                    onClick={() => setCardStyle(th.id)}
                    title={isFa ? th.labelFa : th.labelEn}
                    className={`h-9 w-9 rounded-full transition ${
                      cardStyle === th.id ? 'ring-2 ring-[var(--gold)] ring-offset-2 ring-offset-[var(--bg)] scale-110' : 'opacity-75 hover:opacity-100'
                    }`}
                    style={{ background: `linear-gradient(135deg,${th.from},${th.to})`, border: `1px solid ${th.accent}77` }}
                  />
                ))}
              </div>
            </div>
          </div>

          {errorMsg && (
            <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs font-bold text-loss flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}
          {notice && (
            <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs font-bold text-jade flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{notice}</span>
            </div>
          )}

          <div className="space-y-2.5">
            <button
              type="button"
              onClick={() => void handleIssueCard()}
              disabled={busy}
              className="btn-gold w-full py-3.5 rounded-2xl text-xs sm:text-sm inline-flex items-center justify-center gap-2"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>{busy ? '...' : isFa ? 'صدور کارت سود تاییدشده دلارینو' : 'Issue Verified Profit Card'}</span>
            </button>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => void downloadServerPng()}
                disabled={!issuedCard || exporting}
                className="btn-ghost py-3 rounded-2xl text-xs font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-40"
              >
                <Download className="w-4 h-4" />
                <span>{exporting ? '...' : isFa ? 'دانلود PNG اصلی' : 'Download PNG'}</span>
              </button>
              <button
                type="button"
                onClick={() => void sendCardToTelegram()}
                disabled={!issuedCard || sendingTg}
                className="btn-cobalt py-3 rounded-2xl text-xs font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-40"
              >
                <Send className="w-4 h-4" />
                <span>{sendingTg ? '...' : isFa ? 'ارسال به تلگرام من' : 'Send to Telegram'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Live Card Preview (Horizontal 16:9 or Vertical 3:4) */}
        <div className="lg:col-span-7 flex flex-col items-center gap-4">
          {issuedCard ? (
            <>
              <div
                className={`w-full rounded-[28px] overflow-hidden border p-6 sm:p-7 flex flex-col justify-between shadow-2xl relative transition-all ${
                  layout === 'horizontal' ? 'max-w-[660px] aspect-[16/9]' : 'max-w-[390px] aspect-[3/4]'
                }`}
                style={{
                  background: `linear-gradient(145deg,${activeTheme.from},${activeTheme.to})`,
                  borderColor: `${activeTheme.accent}66`,
                  color: activeTheme.text,
                }}
              >
                {/* Faint Center Dollarino Logo Watermark */}
                <img
                  src="/logo.png"
                  alt=""
                  aria-hidden="true"
                  className="pointer-events-none select-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-56 h-56 sm:w-64 sm:h-64 object-contain opacity-[0.11]"
                />

                {/* Tilted Real / Demo Account Stamp */}
                <div className="pointer-events-none select-none absolute inset-0 flex items-center justify-center -rotate-12">
                  <div
                    className={`px-5 py-2 rounded-2xl border-2 font-black tracking-[0.16em] text-sm sm:text-base ${
                      issuedCard.isVerifiedReal
                        ? 'border-emerald-400/35 text-emerald-300/25 bg-emerald-500/5'
                        : 'border-amber-400/40 text-amber-300/30 bg-amber-500/5'
                    }`}
                  >
                    {issuedCard.isVerifiedReal
                      ? isFa
                        ? 'حساب واقعی · LIVE VERIFIED'
                        : 'LIVE VERIFIED REAL'
                      : isFa
                        ? 'حساب دمو · DEMO / PAPER'
                        : 'DEMO / PAPER SIMULATION'}
                  </div>
                </div>

                {/* Top Header */}
                <div className="relative flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-black tracking-[0.14em]" style={{ color: activeTheme.accent }}>
                        {isFa ? 'کارت سود دلارینو' : 'DOLLARINO PROFIT CARD'} · {periodTitle(issuedCard.period, isFa)}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black ${
                          issuedCard.isVerifiedReal
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                            : 'bg-amber-500/20 text-amber-300 border border-amber-400/40'
                        }`}
                      >
                        {issuedCard.isVerifiedReal ? <ShieldCheck className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                        <span>{issuedCard.isVerifiedReal ? (isFa ? 'حساب واقعی' : 'LIVE') : isFa ? 'حساب دمو' : 'DEMO'}</span>
                      </span>
                    </div>
                    <p className="text-xs opacity-75 font-semibold mt-1">
                      {issuedCard.displayName || username} · {issuedCard.exchangeProvider}
                      {issuedCard.symbol ? ` · ${issuedCard.symbol} (${issuedCard.direction})` : ''}
                    </p>
                  </div>
                  <DollarinoBrandMark size={40} glow />
                </div>

                {/* Center Profit & ROI Numbers (Strict LTR sign placement) */}
                <div className="relative my-auto py-3">
                  <p className="text-[11px] opacity-70 font-bold mb-1">
                    {isFa ? 'بازده واقعی و سود/زیان خالص تسویه‌شده' : 'Settled ROI & Net PnL'}
                  </p>
                  <div className={`flex flex-wrap items-baseline gap-x-4 gap-y-1 ${layout === 'vertical' ? 'flex-col' : ''}`}>
                    <span
                      dir="ltr"
                      className={`font-display font-bold tabular leading-none ${
                        layout === 'horizontal' ? 'text-4xl sm:text-5xl' : 'text-5xl'
                      } ${issuedCard.netPnlUsd >= 0 ? 'text-jade' : 'text-loss'}`}
                    >
                      {fmtPctSigned(issuedCard.roiPct)}
                    </span>
                    <span
                      dir="ltr"
                      className={`text-base sm:text-lg font-mono-num font-black ${
                        issuedCard.netPnlUsd >= 0 ? 'text-emerald-300' : 'text-rose-300'
                      }`}
                    >
                      {fmtUsdSigned(issuedCard.netPnlUsd)} USDT
                    </span>
                  </div>
                </div>

                {/* Bottom Metrics + Verification QR */}
                <div className="relative space-y-3">
                  <div className="grid grid-cols-3 gap-2.5">
                    {[
                      { icon: Layers, label: isFa ? 'تعداد معاملات' : 'TRADES', val: String(issuedCard.tradesCount) },
                      { icon: Target, label: isFa ? 'نرخ برد' : 'WIN RATE', val: `${issuedCard.winRate.toFixed(1)}%` },
                      { icon: TrendingUp, label: 'PROFIT FACTOR', val: issuedCard.profitFactor.toFixed(2) },
                    ].map((s) => {
                      const Icon = s.icon;
                      return (
                        <div key={s.label} className="rounded-2xl p-2.5 border bg-white/5 border-white/15">
                          <div className="flex items-center justify-between opacity-75">
                            <span className="text-[9px] font-bold">{s.label}</span>
                            <Icon className="w-3 h-3" />
                          </div>
                          <p dir="ltr" className="font-display font-bold text-sm sm:text-base tabular mt-1">
                            {s.val}
                          </p>
                        </div>
                      );
                    })}
                  </div>

                  <div className="pt-2.5 border-t border-white/15 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p dir="ltr" className="text-[10px] font-mono-num font-bold truncate">
                        {issuedCard.id} · @Dollarino_official · @Dollarino_bot
                      </p>
                      <p dir="ltr" className="text-[9px] font-mono-num opacity-65 truncate">
                        HMAC-SHA256: {(issuedCard.hmacSignature || issuedCard.signaturePrefix || '').slice(0, 16)}...
                      </p>
                    </div>
                    {qrDataUrl && (
                      <img src={qrDataUrl} alt="Verify QR" className="w-11 h-11 rounded-lg bg-white p-0.5 shrink-0" />
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
                <a
                  href={`/verify-card/${issuedCard.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-ghost px-3.5 py-2 rounded-xl font-bold inline-flex items-center gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>{isFa ? 'صفحه استعلام عمومی' : 'Public Verify Link'}</span>
                </a>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(`${window.location.origin}/verify-card/${issuedCard.id}`);
                    setNotice(isFa ? 'لینک استعلام اصالت کارت کپی شد' : 'Verification link copied');
                  }}
                  className="btn-ghost px-3.5 py-2 rounded-xl font-bold inline-flex items-center gap-1.5"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{isFa ? 'کپی لینک استعلام' : 'Copy Link'}</span>
                </button>
              </div>
            </>
          ) : (
            <div className="w-full max-w-[520px] aspect-[16/10] rounded-[26px] border border-dashed border-white/20 p-7 flex flex-col items-center justify-center text-center gap-3 surface-soft">
              <QrCode className="w-10 h-10 text-dim" />
              <p className="text-sm font-black text-main">
                {isFa ? 'هنوز کارت سودی صادر نشده است' : 'No Profit Card Issued Yet'}
              </p>
              <p className="text-xs text-dim leading-relaxed">
                {isFa
                  ? 'حساب (واقعی یا دمو) و بازه زمانی (۲۴ساعته، هفتگی، ماهانه، سالانه یا کل دوره) را انتخاب کرده و روی دکمه صدور کلیک کنید.'
                  : 'Choose account mode and period, then click Issue Verified Profit Card.'}
              </p>
            </div>
          )}
        </div>
      </div>

      {archive.length > 0 && (
        <div className="panel rounded-3xl p-5 space-y-3">
          <h3 className="text-sm font-black text-main flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-jade" />
            <span>{isFa ? 'آرشیو کارت‌های سود صادرشده شما' : 'Your Issued Profit Cards'}</span>
          </h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {archive.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setIssuedCard(c)}
                className={`p-3.5 rounded-2xl border text-start transition ${
                  issuedCard?.id === c.id ? 'border-[var(--gold)] bg-white/5' : 'surface-soft hover:border-white/25'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span dir="ltr" className="text-xs font-mono-num font-black text-main">{c.id}</span>
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${c.isVerifiedReal ? 'badge-signal' : 'badge-warn'}`}>
                    {c.isVerifiedReal ? (isFa ? 'حساب واقعی' : 'LIVE') : isFa ? 'حساب دمو' : 'DEMO'} · {c.period}
                  </span>
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <span dir="ltr" className={`font-display font-bold text-lg ${c.netPnlUsd >= 0 ? 'text-jade' : 'text-loss'}`}>
                    {fmtPctSigned(c.roiPct)}
                  </span>
                  <span dir="ltr" className="text-[11px] text-dim font-mono-num">
                    {fmtUsdSigned(c.netPnlUsd)} · {c.winRate.toFixed(0)}% WR
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
