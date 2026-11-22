import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bot,
  CheckCircle2,
  ExternalLink,
  Headphones,
  ImagePlus,
  Loader2,
  Send,
  ShieldAlert,
  Sparkles,
  UserCheck,
  X,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { compressChartImageFile } from './FloatingAiChat';

interface SupportTicket {
  id: string;
  subject: string;
  status: string;
  channel: string;
  support_mode?: 'AI_ASSISTANT' | 'HUMAN_ADMIN';
  last_message_at: string;
}

interface SupportMsg {
  id: string;
  ticket_id: string;
  sender_role: 'user' | 'admin' | 'ai' | 'system';
  sender_name: string | null;
  message: string;
  image_data_url?: string | null;
  created_at: string;
}

function renderFormattedSupportText(raw: string) {
  const normalized = raw.replace(/\\n/g, '\n');
  const tokens = normalized.split(/(\*\*[^*\n]+\*\*|`[^`\n]+`)/g);
  return tokens.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={idx} className="font-black text-main">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code
          key={idx}
          dir="ltr"
          className="px-1.5 py-0.5 rounded-md bg-[var(--soft)] border hairline font-mono text-[11px] text-[var(--gold)]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={idx}>{part}</span>;
  });
}

interface Props {
  open: boolean;
  onClose: () => void;
  lang: 'fa' | 'en';
  authenticated?: boolean;
  onGoToAuth?: () => void;
}

export function SupportModal({ open, onClose, lang, authenticated = true, onGoToAuth }: Props) {
  const isFa = lang === 'fa';
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [escalating, setEscalating] = useState(false);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [messages, setMessages] = useState<SupportMsg[]>([]);
  const [text, setText] = useState('');
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [telegramSupport, setTelegramSupport] = useState('@Dollarino_bot');
  const [antiScam, setAntiScam] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [supportMode, setSupportMode] = useState<'AI_ASSISTANT' | 'HUMAN_ADMIN'>('AI_ASSISTANT');
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    if (!open || !authenticated) return;
    setLoading(true);
    try {
      const res = await apiFetch<{
        tickets: SupportTicket[];
        messages: SupportMsg[];
        telegramSupport: string;
        antiScamNotice: string;
      }>('/api/support/tickets');
      const tks = res.tickets || [];
      setTickets(tks);
      setMessages(res.messages || []);
      if (tks[0]?.support_mode === 'HUMAN_ADMIN') {
        setSupportMode('HUMAN_ADMIN');
      } else {
        setSupportMode('AI_ASSISTANT');
      }
      if (res.telegramSupport) setTelegramSupport(res.telegramSupport);
      if (res.antiScamNotice) setAntiScam(res.antiScamNotice);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [open, authenticated]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!open || !authenticated) return;
    const t = setInterval(() => void load(), 12_000);
    return () => clearInterval(t);
  }, [open, authenticated, load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, sending]);

  if (!open) return null;

  const activeTicket = tickets.find((t) => t.status !== 'CLOSED') || tickets[0];
  const tgHandleClean = telegramSupport.replace(/^@/, '');

  const handleAttachFile = async (file?: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setStatusMsg(isFa ? 'فقط فایل تصویری (PNG/JPG/WebP) مجاز است.' : 'Only image files are supported.');
      return;
    }
    try {
      const compressed = await compressChartImageFile(file);
      setPendingImage(compressed);
      setStatusMsg('');
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Image upload error');
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = text.trim();
    if ((!clean && !pendingImage) || sending || !authenticated) return;
    setSending(true);
    setStatusMsg('');
    try {
      const res = await apiFetch<{
        ok: boolean;
        ticketId: string;
        supportMode: 'AI_ASSISTANT' | 'HUMAN_ADMIN';
        aiReply?: { id: string; sender_role: string; sender_name: string; message: string } | null;
      }>('/api/support/message', {
        method: 'POST',
        body: JSON.stringify({
          ticketId: activeTicket?.id,
          subject: isFa ? 'پشتیبانی آنلاین دلارینو' : 'Dollarino Online Support',
          message: clean,
          imageDataUrl: pendingImage,
          mode: supportMode === 'HUMAN_ADMIN' ? 'HUMAN' : 'AI',
        }),
      });
      setText('');
      setPendingImage(null);
      if (res.supportMode) setSupportMode(res.supportMode);
      setStatusMsg(
        res.supportMode === 'HUMAN_ADMIN'
          ? isFa
            ? 'پیام شما مستقیماً برای مدیران پشتیبانی ارسال شد.'
            : 'Sent directly to human support admins.'
          : isFa
            ? 'پاسخ هوش مصنوعی آماده شد.'
            : 'AI assistant replied.'
      );
      await load();
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Error');
    } finally {
      setSending(false);
    }
  };

  const escalateToHumans = async () => {
    if (escalating || !authenticated) return;
    setEscalating(true);
    setStatusMsg('');
    try {
      const res = await apiFetch<{ ok: boolean; ticketId: string; supportMode: 'HUMAN_ADMIN' }>('/api/support/escalate', {
        method: 'POST',
        body: JSON.stringify({ ticketId: activeTicket?.id }),
      });
      setSupportMode(res.supportMode || 'HUMAN_ADMIN');
      setStatusMsg(
        isFa
          ? 'تیکت شما به مدیران انسانی ارجاع شد. می‌توانید مستقیم پیام بنویسید.'
          : 'Escalated to human managers. Your messages now go directly to admins.'
      );
      await load();
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Escalation error');
    } finally {
      setEscalating(false);
    }
  };

  const switchToAi = async () => {
    if (escalating || !authenticated) return;
    setSupportMode('AI_ASSISTANT');
    try {
      await apiFetch('/api/support/switch-ai', {
        method: 'POST',
        body: JSON.stringify({ ticketId: activeTicket?.id }),
      });
      setStatusMsg(isFa ? 'دستیار هوشمند پشتیبانی فعال شد.' : 'Switched back to AI assistant.');
    } catch {
      setSupportMode('AI_ASSISTANT');
    }
  };

  const quickPrompts = isFa
    ? [
        'چطور صرافی Toobit یا KCEX را وصل کنم؟',
        'نحوه اتصال Trust Wallet و خرید توکن DEX چیست؟',
        'چطور ربات هوش مصنوعی را برای ترید خودکار روشن کنم؟',
      ]
    : [
        'How do I connect Toobit or KCEX safely?',
        'How does Trust Wallet & DexScreener swap work?',
        'How do I start AI auto-trading?',
      ];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 transition-opacity duration-300"
      onClick={onClose}
    >
      <div
        className="pop-in panel !bg-[var(--panel)] rounded-[28px] w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden border hairline shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with Generated Concierge Banner */}
        <div className="relative border-b hairline bg-[var(--panel-translucent)] backdrop-blur-xl overflow-hidden">
          <div className="px-5 py-4 space-y-3 relative z-10">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="relative h-12 w-12 rounded-2xl overflow-hidden shrink-0 border hairline shadow-lg">
                  <img
                    src="/images/support-concierge.png"
                    alt="Dollarino Support"
                    className="h-full w-full object-cover"
                  />
                  <span
                    className={`absolute -bottom-0.5 -end-0.5 h-3.5 w-3.5 rounded-full border-2 border-[var(--panel)] ${
                      supportMode === 'HUMAN_ADMIN' ? 'bg-emerald-500 animate-pulse' : 'bg-[var(--gold)] animate-pulse'
                    }`}
                  />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-display font-bold text-sm sm:text-base text-main truncate">
                      {isFa ? 'پشتیبانی هوشمند و VIP دلارینو' : 'Dollarino VIP & AI Support'}
                    </h3>
                    <span
                      className={`hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black ${
                        supportMode === 'HUMAN_ADMIN'
                          ? 'bg-emerald-500/15 text-jade'
                          : 'bg-blue-500/15 text-blue-400'
                      }`}
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-current animate-ping" />
                      <span>{supportMode === 'HUMAN_ADMIN' ? (isFa ? 'آنلاین مستقیم' : 'Direct Live') : isFa ? 'پاسخ فوری AI' : 'Instant AI'}</span>
                    </span>
                  </div>
                  <p className="text-[11px] text-dim truncate transition-all duration-300 mt-0.5">
                    {supportMode === 'HUMAN_ADMIN'
                      ? isFa
                        ? 'گفتگوی مستقیم و فوری با مدیران پشتیبانی دلارینو'
                        : 'Direct conversation with Dollarino human managers'
                      : isFa
                        ? 'پاسخگویی ۲۴ ساعته دستیار هوشمند متصل به کل امکانات پلتفرم'
                        : '24/7 instant AI concierge'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={`https://t.me/${tgHandleClean}`}
                  target="_blank"
                  rel="noreferrer"
                  className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--solid)] border hairline text-[11px] font-bold text-main transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:-translate-y-0.5 hover:border-[var(--line-strong)] active:scale-95"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-[var(--gold)]" />
                  <span dir="ltr">{telegramSupport}</span>
                </a>
                <button
                  type="button"
                  onClick={onClose}
                  className="h-9 w-9 rounded-full bg-[var(--solid)] border hairline text-dim hover:text-main grid place-items-center transition-all duration-200 hover:scale-105 active:scale-90"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Apple-style Smooth Sliding Segmented Switch (AI <-> Human Managers) */}
            {authenticated && (
              <div className="flex items-center justify-between gap-3">
                <div
                  className="relative grid grid-cols-2 p-1 rounded-full border hairline bg-[var(--solid)] shadow-inner w-full"
                  role="tablist"
                  aria-label={isFa ? 'انتخاب نوع پشتیبانی' : 'Support Mode'}
                >
                  <span
                    aria-hidden
                    className="absolute top-1 bottom-1 rounded-full pointer-events-none"
                    style={{
                      width: 'calc(50% - 4px)',
                      insetInlineStart: supportMode === 'HUMAN_ADMIN' ? '50%' : '4px',
                      background:
                        supportMode === 'HUMAN_ADMIN'
                          ? 'linear-gradient(135deg, #059669 0%, #10b981 100%)'
                          : 'linear-gradient(135deg, var(--gold-a), var(--gold-b) 55%, var(--gold-c))',
                      boxShadow:
                        supportMode === 'HUMAN_ADMIN'
                          ? '0 6px 18px -5px rgba(16, 185, 129, 0.55)'
                          : '0 6px 18px -5px rgba(22, 82, 240, 0.52)',
                      transition:
                        'inset-inline-start 420ms cubic-bezier(0.34, 1.56, 0.64, 1), background 320ms ease, box-shadow 320ms ease',
                    }}
                  />
                  <button
                    type="button"
                    role="tab"
                    aria-selected={supportMode === 'AI_ASSISTANT'}
                    onClick={() => void switchToAi()}
                    className={`relative z-10 py-2 px-3 rounded-full text-xs font-extrabold inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors duration-300 active:scale-[0.97] ${
                      supportMode === 'AI_ASSISTANT' ? 'text-white' : 'text-dim hover:text-main'
                    }`}
                  >
                    <Bot className="w-3.5 h-3.5 shrink-0" />
                    <span>{isFa ? 'دستیار هوشمند AI' : 'AI Assistant'}</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={supportMode === 'HUMAN_ADMIN'}
                    onClick={() => void escalateToHumans()}
                    disabled={escalating}
                    className={`relative z-10 py-2 px-3 rounded-full text-xs font-extrabold inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors duration-300 active:scale-[0.97] disabled:opacity-70 ${
                      supportMode === 'HUMAN_ADMIN' ? 'text-white' : 'text-dim hover:text-main'
                    }`}
                  >
                    {escalating ? (
                      <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />
                    ) : (
                      <UserCheck className="w-3.5 h-3.5 shrink-0" />
                    )}
                    <span>{isFa ? 'ارتباط با مدیران' : 'Human Managers'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Anti-scam warning */}
        <div
          className="mx-5 mt-3.5 rounded-2xl px-4 py-2.5 flex items-start gap-2.5 text-[11px] leading-relaxed border"
          style={{
            background: 'color-mix(in srgb, var(--amber) 11%, transparent)',
            borderColor: 'color-mix(in srgb, var(--amber) 28%, transparent)',
            color: 'var(--text)',
          }}
        >
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--amber)' }} />
          <span>
            {antiScam ||
              (isFa
                ? 'هشدار امنیتی: دلارینو هیچ‌گونه اکانت شخصی برای پشتیبانی یا دریافت وجه ندارد. تمام ارتباطات رسمی فقط از طریق همین پنجره آنلاین و ربات رسمی @Dollarino_bot انجام می‌شود.'
                : 'Security notice: Dollarino has NO personal DM support account. Only use this online window or the official bot @Dollarino_bot.')}
          </span>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3 min-h-[260px]">
          {!authenticated ? (
            <div className="py-8 space-y-4 text-center">
              <div className="inline-flex h-12 w-12 rounded-2xl bg-blue-500/10 text-blue-400 items-center justify-center mx-auto">
                <Headphones className="w-6 h-6" />
              </div>
              <div className="space-y-1.5 max-w-md mx-auto">
                <p className="text-sm font-black text-main">
                  {isFa ? 'برای گفتگوی آنلاین با دستیار AI و مدیران، وارد حساب شوید' : 'Sign in for Live AI & Human Support'}
                </p>
                <p className="text-xs text-dim leading-relaxed">
                  {isFa
                    ? 'پس از ورود می‌توانید به صورت ۲۴ ساعته با هوش مصنوعی پشتیبانی گفتگو کنید یا تیکت خود را مستقیم به مدیران دلارینو ارجاع دهید.'
                    : 'Sign in to chat 24/7 with our AI Support Assistant or escalate directly to human support managers.'}
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2 pt-1">
                {onGoToAuth && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onGoToAuth();
                    }}
                    className="btn-gold px-5 py-2.5 rounded-xl text-xs font-black"
                  >
                    {isFa ? 'ورود / ثبت‌نام در دلارینو' : 'Sign In / Register'}
                  </button>
                )}
                <a
                  href={`https://t.me/${tgHandleClean}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-cobalt px-5 py-2.5 rounded-xl text-xs font-black inline-flex items-center gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span dir="ltr">@{tgHandleClean}</span>
                </a>
              </div>
            </div>
          ) : loading && messages.length === 0 ? (
            <div className="py-12 grid place-items-center text-dim text-xs">
              <Loader2 className="w-5 h-5 animate-spin mb-2" />
              <span>{isFa ? 'در حال بارگذاری گفتگو...' : 'Loading conversation...'}</span>
            </div>
          ) : messages.length === 0 ? (
            <div className="py-4 space-y-4">
              <div className="surface-soft rounded-3xl p-4 border hairline flex flex-col sm:flex-row items-center gap-4 text-center sm:text-start">
                <img
                  src="/images/support-concierge.png"
                  alt="Dollarino AI Concierge"
                  className="w-28 h-20 rounded-2xl object-cover border hairline shadow-md shrink-0"
                />
                <div className="space-y-1">
                  <p className="text-sm font-black text-main flex items-center justify-center sm:justify-start gap-1.5">
                    <Sparkles className="w-4 h-4 text-[var(--gold)]" />
                    <span>
                      {isFa
                        ? 'هر سوالی دارید بپرسید — پاسخ آنی یا ارجاع مستقیم به مدیران'
                        : 'Ask anything — Instant AI or Direct Human Support'}
                    </span>
                  </p>
                  <p className="text-[11px] text-dim leading-relaxed">
                    {isFa
                      ? 'درباره اتصال Toobit / Bitunix / KCEX، کیف‌پول چندزنجیره‌ای Trust Wallet، ربات AI، اشتراک یا اکستنشن سوال بپرسید.'
                      : 'Ask about Toobit/Bitunix/KCEX, multi-chain Trust Wallet, AI bots, or plans.'}
                  </p>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-2.5">
                {[
                  {
                    badge: isFa ? 'صرافی‌ها' : 'Exchanges',
                    title: isFa ? 'اتصال Toobit، Bitunix یا KCEX' : 'Connect Toobit, Bitunix or KCEX',
                    prompt: isFa ? 'چطور صرافی Toobit یا Bitunix یا KCEX را وصل کنم؟' : 'How do I connect Toobit, Bitunix or KCEX safely?',
                  },
                  {
                    badge: isFa ? 'کیف‌پول و DEX' : 'Wallet & DEX',
                    title: isFa ? 'اتصال Trust Wallet همه شبکه‌ها' : 'Connect Multi-Chain Trust Wallet',
                    prompt: isFa ? 'نحوه اتصال Trust Wallet در شبکه‌های BSC، Solana و TON و خرید توکن DEX چیست؟' : 'How does multi-chain Trust Wallet & DexScreener swap work?',
                  },
                  {
                    badge: isFa ? 'ربات هوشمند' : 'AI Trading',
                    title: isFa ? 'شروع ترید خودکار ۲۴ ساعته' : 'Start 24/7 AI Auto-Trading',
                    prompt: isFa ? 'چطور ربات هوش مصنوعی را برای ترید خودکار روشن کنم؟' : 'How do I start AI auto-trading?',
                  },
                  {
                    badge: isFa ? 'اپلیکیشن و افزونه' : 'PWA & Extension',
                    title: isFa ? 'نصب اپلیکیشن و اکستنشن کروم' : 'Install App & Chrome Extension',
                    prompt: isFa ? 'چطور اپلیکیشن دلارینو و افزونه مرورگر را نصب کنم؟' : 'How do I install the Dollarino app and Chrome extension?',
                  },
                ].map((card) => (
                  <button
                    key={card.title}
                    type="button"
                    onClick={() => setText(card.prompt)}
                    className="surface-soft rounded-2xl p-3 border hairline text-start hover:border-[var(--gold)]/55 transition-all duration-200 hover:-translate-y-0.5 space-y-1"
                  >
                    <span className="inline-block text-[10px] font-black px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400">
                      {card.badge}
                    </span>
                    <p className="text-xs font-bold text-main">{card.title}</p>
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap justify-center gap-1.5 pt-1">
                {quickPrompts.map((qp) => (
                  <button
                    key={qp}
                    type="button"
                    onClick={() => setText(qp)}
                    className="px-3 py-1 rounded-full bg-[var(--soft)] border hairline hover:border-blue-500/40 text-[10px] font-medium text-sub hover:text-main transition"
                  >
                    {qp}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
            {messages.map((m) => {
              const isUser = m.sender_role === 'user';
              const isAi = m.sender_role === 'ai';
              const isSystem = m.sender_role === 'system';

              if (isSystem) {
                return (
                  <div key={m.id} className="flex justify-center">
                    <div
                      className="rounded-full px-4 py-1.5 text-[11px] font-medium max-w-[90%] text-center border"
                      style={{
                        background: 'color-mix(in srgb, var(--jade) 10%, transparent)',
                        borderColor: 'color-mix(in srgb, var(--jade) 28%, transparent)',
                        color: 'var(--text)',
                      }}
                    >
                      {m.message}
                    </div>
                  </div>
                );
              }

              return (
                <div key={m.id} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed whitespace-pre-wrap shadow-sm transition-all duration-300 ${
                      isUser
                        ? 'bg-gradient-to-br from-[#0A4DFF] to-[#2563EB] text-white'
                        : isAi
                          ? 'bg-[var(--solid)] border hairline text-main'
                          : 'bg-[var(--solid)] border text-main'
                    }`}
                    style={
                      !isUser && !isAi
                        ? { borderColor: 'color-mix(in srgb, var(--jade) 35%, transparent)' }
                        : undefined
                    }
                  >
                    <div className="text-[10px] opacity-85 font-bold mb-1 flex items-center gap-1.5">
                      {isAi && <Bot className="w-3.5 h-3.5 text-[var(--gold)]" />}
                      {!isUser && !isAi && <UserCheck className="w-3.5 h-3.5" style={{ color: 'var(--jade)' }} />}
                      <span>
                        {isUser
                          ? isFa
                            ? 'شما'
                            : 'You'
                          : m.sender_name || (isAi ? (isFa ? 'دستیار هوشمند دلارینو' : 'Dollarino AI') : isFa ? 'مدیر پشتیبانی' : 'Support Admin')}
                      </span>
                      <span dir="ltr" className="opacity-65">
                        · {m.created_at.slice(11, 16)}
                      </span>
                    </div>
                    {m.image_data_url && (
                      <button
                        type="button"
                        onClick={() => setLightboxImage(m.image_data_url || null)}
                        className="block mb-2 rounded-xl overflow-hidden border border-white/20 hover:opacity-90 transition"
                      >
                        <img
                          src={m.image_data_url}
                          alt="Support attachment"
                          className="max-h-48 w-auto object-contain rounded-xl"
                        />
                      </button>
                    )}
                    <div>{renderFormattedSupportText(m.message)}</div>
                  </div>
                  {isAi && supportMode === 'AI_ASSISTANT' && (
                    <button
                      type="button"
                      onClick={() => void escalateToHumans()}
                      className="mt-1.5 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold border hairline bg-[var(--solid)] text-main transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:-translate-y-0.5 hover:border-emerald-500/40 active:scale-95"
                    >
                      <UserCheck className="w-3 h-3" style={{ color: 'var(--jade)' }} />
                      <span>{isFa ? 'سوال من حل نشد · گفتگو با مدیران' : 'Escalate to Human Managers'}</span>
                    </button>
                  )}
                </div>
              );
            })}
            {sending && (
              <div className="flex items-start">
                <div className="rounded-2xl px-4 py-2.5 bg-[var(--solid)] border hairline text-xs text-dim inline-flex items-center gap-2">
                  <Bot className="w-3.5 h-3.5 text-[var(--gold)]" />
                  <span>{supportMode === 'HUMAN_ADMIN' ? (isFa ? 'در حال ارسال به مدیران...' : 'Sending...') : (isFa ? 'دستیار هوشمند در حال نوشتن...' : 'AI typing...')}</span>
                  <span className="inline-flex gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce" />
                    <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce [animation-delay:120ms]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce [animation-delay:240ms]" />
                  </span>
                </div>
              </div>
            )}
            </>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input with Image Upload + Modern Pill Composer */}
        {authenticated && (
        <form onSubmit={sendMessage} className="px-3 sm:px-4 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t hairline space-y-2 bg-[var(--panel)]">
          {statusMsg && (
            <div className="text-[11px] font-bold text-jade inline-flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{statusMsg}</span>
            </div>
          )}
          {pendingImage && (
            <div className="flex items-center gap-3 p-2 rounded-2xl surface-soft border hairline">
              <img src={pendingImage} alt="Preview" className="h-12 w-16 object-cover rounded-xl border hairline" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold text-main truncate">
                  {isFa ? '📸 عکس پیوست آماده ارسال به پشتیبانی' : '📸 Image ready to send'}
                </p>
                <p className="text-[10px] text-dim truncate">
                  {isFa ? 'توضیح اضافه بنویسید یا دکمه ارسال را بزنید.' : 'Add note or send.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPendingImage(null)}
                className="h-7 w-7 rounded-full btn-ghost grid place-items-center text-rose-400 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              void handleAttachFile(f);
            }}
          />
          <div className="flex items-center gap-1.5 rounded-[24px] bg-[var(--soft)] border border-[var(--line-strong)] focus-within:border-[var(--gold)] px-2 py-1.5 shadow-sm transition">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title={isFa ? 'ارسال عکس / اسکرین‌شات' : 'Attach screenshot'}
              className="h-9 w-9 shrink-0 rounded-full hover:bg-[var(--panel)] grid place-items-center text-[var(--gold)] transition"
            >
              <ImagePlus className="w-[18px] h-[18px]" />
            </button>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onPaste={(e) => {
                const items = Array.from(e.clipboardData?.items || []);
                const imgItem = items.find((it) => it.type.startsWith('image/'));
                const f = imgItem?.getAsFile();
                if (f) {
                  e.preventDefault();
                  void handleAttachFile(f);
                }
              }}
              placeholder={
                supportMode === 'HUMAN_ADMIN'
                  ? isFa
                    ? 'پیام یا عکس اسکرین‌شات به مدیران...'
                    : 'Message or screenshot to admins...'
                  : isFa
                    ? 'سوال یا تصویر خطا را اینجا بفرستید...'
                    : 'Ask AI or attach a screenshot...'
              }
              className="flex-1 bg-transparent border-0 outline-none focus:ring-0 py-1.5 px-1 text-xs sm:text-sm text-main placeholder:text-dim"
            />
            <button
              type="submit"
              disabled={sending || (!text.trim() && !pendingImage)}
              className="h-9 px-3.5 sm:px-4 shrink-0 rounded-full btn-gold text-xs font-black flex items-center gap-1.5 disabled:opacity-40 transition active:scale-95"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              <span className="hidden sm:inline">{isFa ? 'ارسال' : 'Send'}</span>
            </button>
          </div>
        </form>
        )}
      </div>

      {lightboxImage && (
        <div
          className="fixed inset-0 z-[70] bg-black/85 flex items-center justify-center p-4"
          onClick={(e) => {
            e.stopPropagation();
            setLightboxImage(null);
          }}
        >
          <button
            type="button"
            onClick={() => setLightboxImage(null)}
            className="absolute top-4 end-4 h-10 w-10 rounded-full bg-white/15 text-white grid place-items-center"
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={lightboxImage}
            alt="Full screenshot"
            className="max-w-full max-h-[88vh] rounded-2xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
