import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bot,
  Check,
  Copy,
  Eye,
  ImagePlus,
  Loader2,
  LogIn,
  Maximize2,
  MessageSquarePlus,
  Minimize2,
  Send,
  Sparkles,
  Trash2,
  TrendingDown,
  TrendingUp,
  UserCheck,
  X,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { Lang } from '../lib/i18n';
import type {
  AiChatMessageItem,
  AiChatSessionItem,
  CreatorInfo,
  ExtractedChartSetup,
  NavTab,
  SelectableAIModel,
} from '../lib/types';

export async function compressChartImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('خطا در خواندن فایل تصویر'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('فرمت تصویر پشتیبانی نمی‌شود'));
      img.onload = () => {
        const maxDim = 1400;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height);
          width = Math.max(1, Math.round(width * ratio));
          height = Math.max(1, Math.round(height * ratio));
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(reader.result));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.86));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function FormattedAiMarkdown({ text }: { text: string }) {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const blocks = text.split(/(```[\s\S]*?```)/g);

  return (
    <div className="space-y-2 text-[12.5px] sm:text-[13px] leading-relaxed break-words">
      {blocks.map((block, idx) => {
        if (block.startsWith('```') && block.endsWith('```')) {
          const inner = block.slice(3, -3).replace(/^[a-zA-Z0-9_-]+\n/, '').trim();
          return (
            <div key={idx} className="relative rounded-xl bg-black/75 text-slate-100 border border-white/10 overflow-hidden my-2">
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(inner);
                  setCopiedIdx(idx);
                  setTimeout(() => setCopiedIdx(null), 1500);
                }}
                className="absolute top-2 end-2 px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[10px] font-bold flex items-center gap-1"
              >
                {copiedIdx === idx ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedIdx === idx ? 'کپی شد' : 'کپی'}</span>
              </button>
              <pre dir="ltr" className="p-3 pt-8 overflow-x-auto text-[11px] font-mono leading-relaxed">
                <code>{inner}</code>
              </pre>
            </div>
          );
        }

        const lines = block.split('\n');
        return (
          <div key={idx} className="space-y-1">
            {lines.map((line, lIdx) => {
              const tokens = line.split(/(\*\*[^*\n]+\*\*|`[^`\n]+`)/g);
              return (
                <p key={lIdx} className={line.trim() === '' ? 'h-1.5' : ''}>
                  {tokens.map((part, pIdx) => {
                    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
                      return (
                        <strong key={pIdx} className="font-black text-main">
                          {part.slice(2, -2)}
                        </strong>
                      );
                    }
                    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
                      return (
                        <code
                          key={pIdx}
                          dir="ltr"
                          className="px-1.5 py-0.5 rounded-md bg-[var(--soft)] border hairline font-mono text-[11px] text-[var(--gold)]"
                        >
                          {part.slice(1, -1)}
                        </code>
                      );
                    }
                    return <span key={pIdx}>{part}</span>;
                  })}
                </p>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function SetupActionCard({
  setup,
  isFa,
  onOpenTerminal,
}: {
  setup: ExtractedChartSetup;
  isFa: boolean;
  onOpenTerminal?: (symbol: string) => void;
}) {
  const isLong = setup.direction === 'LONG';
  return (
    <div
      className={`mt-2.5 rounded-2xl border p-3.5 space-y-2.5 ${
        isLong
          ? 'bg-emerald-500/10 border-emerald-500/35'
          : 'bg-rose-500/10 border-rose-500/35'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {isLong ? (
            <TrendingUp className="w-4 h-4 text-emerald-400" />
          ) : (
            <TrendingDown className="w-4 h-4 text-rose-400" />
          )}
          <span className="font-display font-black text-sm text-main" dir="ltr">
            {setup.symbol} · {setup.direction}
          </span>
          {setup.timeframe && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-black/20 text-dim">
              {setup.timeframe}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-[10px] font-black">
          {setup.leverage && (
            <span className="px-2 py-0.5 rounded-full bg-[var(--soft)] text-main">
              {setup.leverage}x
            </span>
          )}
          {setup.rrRatio && (
            <span className="px-2 py-0.5 rounded-full bg-[var(--gold)]/20 text-[var(--gold)]">
              R:R {setup.rrRatio}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[11px]" dir="ltr">
        <div className="rounded-xl bg-black/15 px-2.5 py-1.5">
          <p className="text-[9px] text-dim uppercase">Entry</p>
          <p className="font-mono font-bold text-main">{setup.entry}</p>
        </div>
        <div className="rounded-xl bg-rose-500/15 px-2.5 py-1.5">
          <p className="text-[9px] text-rose-300 uppercase">Stop Loss</p>
          <p className="font-mono font-bold text-rose-300">{setup.stopLoss}</p>
        </div>
        <div className="rounded-xl bg-emerald-500/15 px-2.5 py-1.5">
          <p className="text-[9px] text-emerald-300 uppercase">TP1</p>
          <p className="font-mono font-bold text-emerald-300">{setup.tp1}</p>
        </div>
        {setup.tp2 && (
          <div className="rounded-xl bg-emerald-500/10 px-2.5 py-1.5">
            <p className="text-[9px] text-emerald-300 uppercase">TP2</p>
            <p className="font-mono font-bold text-emerald-300">{setup.tp2}</p>
          </div>
        )}
        {setup.tp3 && (
          <div className="rounded-xl bg-emerald-500/10 px-2.5 py-1.5">
            <p className="text-[9px] text-emerald-300 uppercase">TP3</p>
            <p className="font-mono font-bold text-emerald-300">{setup.tp3}</p>
          </div>
        )}
      </div>

      {onOpenTerminal && (
        <button
          type="button"
          onClick={() => onOpenTerminal(setup.symbol)}
          className="btn-cobalt w-full sm:w-auto px-3.5 py-2 rounded-xl text-[11px] font-black"
        >
          {isFa ? '📈 باز کردن در ترمینال معاملاتی' : 'Open Symbol in Terminal'}
        </button>
      )}
    </div>
  );
}

const DEFAULT_FALLBACK_MODEL: SelectableAIModel = {
  id: 'dollarino-live-ai',
  label: 'هوش مصنوعی زنده دلارینو',
  provider: 'deepseek',
  model: 'dollarino-live-quant-v1',
  source: 'PLATFORM',
  supportsVision: false,
  isDefault: true,
};

export function DedicatedAiChatSurface({
  lang,
  authenticated = true,
  compact = false,
  onNavigate,
  onSelectSymbolForTerminal,
  onExpandFullScreen,
  onCloseFloating,
  onGoAuth,
}: {
  lang: Lang;
  authenticated?: boolean;
  compact?: boolean;
  onNavigate?: (tab: NavTab) => void;
  onSelectSymbolForTerminal?: (symbol: string) => void;
  onExpandFullScreen?: () => void;
  onCloseFloating?: () => void;
  onGoAuth?: () => void;
}) {
  const isFa = lang === 'fa';
  const [models, setModels] = useState<SelectableAIModel[]>([DEFAULT_FALLBACK_MODEL]);
  const [selectedModelId, setSelectedModelId] = useState<string>('dollarino-live-ai');
  const [creator, setCreator] = useState<CreatorInfo>({
    nameFa: 'آوید کیا',
    nameEn: 'Avid Kiya',
    telegram: '@avidkiya',
    telegramUrl: 'https://t.me/avidkiya',
    instagram: '@avid_kiya',
    instagramUrl: 'https://instagram.com/avid_kiya',
    twitter: '@avid_kiya',
    twitterUrl: 'https://x.com/avid_kiya',
  });

  const [sessions, setSessions] = useState<AiChatSessionItem[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AiChatMessageItem[]>([]);
  const [input, setInput] = useState('');
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  const loadModelsAndSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      if (!authenticated) {
        const mRes = await apiFetch<{
          models: SelectableAIModel[];
          selectedModelId: string;
          creator?: CreatorInfo;
        }>('/api/public/ai-models');
        if (mRes.models?.length) {
          setModels(mRes.models);
          setSelectedModelId(mRes.selectedModelId || mRes.models[0]!.id);
        }
        if (mRes.creator) setCreator(mRes.creator);
        return;
      }

      const [mRes, sRes] = await Promise.all([
        apiFetch<{ models: SelectableAIModel[]; selectedModelId: string; creator?: CreatorInfo }>(
          '/api/ai-assistant/models'
        ),
        apiFetch<{ sessions: AiChatSessionItem[] }>('/api/ai-assistant/sessions'),
      ]);
      if (mRes.models?.length) {
        setModels(mRes.models);
        setSelectedModelId(mRes.selectedModelId || mRes.models[0]!.id);
      }
      if (mRes.creator) setCreator(mRes.creator);
      const list = sRes.sessions || [];
      setSessions(list);
      if (list[0] && !activeSessionId) {
        setActiveSessionId(list[0].id);
        const detail = await apiFetch<{ messages: AiChatMessageItem[] }>(
          `/api/ai-assistant/sessions/${list[0].id}`
        ).catch(() => ({ messages: [] }));
        setMessages(detail.messages || []);
      }
    } catch {
      // Keep built-in fallback model ready
    } finally {
      setLoadingSessions(false);
    }
  }, [activeSessionId, authenticated]);

  useEffect(() => {
    void loadModelsAndSessions();
  }, [loadModelsAndSessions]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, sending]);

  const openSession = async (sid: string) => {
    setActiveSessionId(sid);
    setErrorMsg(null);
    try {
      const res = await apiFetch<{ messages: AiChatMessageItem[] }>(`/api/ai-assistant/sessions/${sid}`);
      setMessages(res.messages || []);
    } catch {
      setMessages([]);
    }
  };

  const startNewChat = async () => {
    setErrorMsg(null);
    setMessages([]);
    setPendingImage(null);
    if (!authenticated) {
      setActiveSessionId(null);
      return;
    }
    try {
      const res = await apiFetch<{ session: AiChatSessionItem }>('/api/ai-assistant/sessions', {
        method: 'POST',
        body: JSON.stringify({ modelId: selectedModelId || undefined }),
      });
      setActiveSessionId(res.session.id);
      setSessions((prev) => [res.session, ...prev]);
    } catch {
      setActiveSessionId(null);
    }
  };

  const deleteSession = async (sid: string) => {
    await apiFetch(`/api/ai-assistant/sessions/${sid}`, { method: 'DELETE' }).catch(() => {});
    setSessions((prev) => prev.filter((s) => s.id !== sid));
    if (activeSessionId === sid) {
      setActiveSessionId(null);
      setMessages([]);
    }
  };

  const handleModelChange = async (newId: string) => {
    setSelectedModelId(newId);
    if (!authenticated) return;
    await apiFetch('/api/ai-assistant/select-model', {
      method: 'POST',
      body: JSON.stringify({ modelId: newId }),
    }).catch(() => {});
  };

  const handleImageFile = async (file?: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setErrorMsg(isFa ? 'لطفاً یک فایل تصویری معتبر (PNG/JPG/WebP) انتخاب کنید.' : 'Please choose a valid image.');
      return;
    }
    setErrorMsg(null);
    try {
      const dataUrl = await compressChartImageFile(file);
      setPendingImage(dataUrl);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Image load error');
    }
  };

  const sendMessage = async (overrideText?: string) => {
    const cleanText = (overrideText ?? input).trim();
    if ((!cleanText && !pendingImage) || sending) return;

    const attachedImg = pendingImage;
    const optimisticText =
      cleanText ||
      (isFa
        ? '📊 لطفاً این تصویر چارت را تحلیل کن و ستاپ معاملاتی بده.'
        : '📊 Please analyze this chart screenshot and suggest a trading setup.');

    const optimisticUserMsg: AiChatMessageItem = {
      id: `tmp-${Date.now()}`,
      role: 'user',
      content: optimisticText,
      hasImage: Boolean(attachedImg),
      previewImageUrl: attachedImg || undefined,
    };

    const historySnapshot = messages
      .slice(-8)
      .map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [...prev, optimisticUserMsg]);
    if (!overrideText) setInput('');
    setPendingImage(null);
    setSending(true);
    setErrorMsg(null);

    try {
      const endpoint = authenticated ? '/api/ai-assistant/chat' : '/api/public/ai-chat';
      const payload = JSON.stringify({
        sessionId: authenticated ? activeSessionId : undefined,
        modelId: selectedModelId || undefined,
        message: cleanText,
        imageDataUrl: attachedImg,
        history: !authenticated ? historySnapshot : undefined,
      });

      let res: {
        sessionId: string;
        reply: string;
        modelId: string;
        modelLabel: string;
        usedVision: boolean;
        visionFallbackNotice?: string;
        setup: ExtractedChartSetup | null;
      };

      try {
        res = await apiFetch(endpoint, { method: 'POST', body: payload });
      } catch (primaryErr) {
        const errStatus = (primaryErr as { status?: number })?.status;
        const errText = primaryErr instanceof Error ? primaryErr.message : '';
        if (errStatus === 404 || /Route not found/i.test(errText)) {
          if (authenticated) {
            try {
              res = await apiFetch('/api/public/ai-chat', {
                method: 'POST',
                body: JSON.stringify({
                  modelId: selectedModelId || undefined,
                  message: cleanText,
                  imageDataUrl: attachedImg,
                  history: historySnapshot,
                }),
              });
            } catch (pubErr) {
              const pStatus = (pubErr as { status?: number })?.status;
              const pText = pubErr instanceof Error ? pubErr.message : '';
              if (pStatus === 404 || /Route not found/i.test(pText)) {
                throw new Error(
                  isFa
                    ? '⚠️ سرور بک‌اند (Cloudflare Worker) هنوز به نسخه جدید v9.9.1 آپدیت نشده است (Route not found). لطفاً دستور npx wrangler deploy را روی سرور اجرا کنید تا مسیر جدید هوش مصنوعی فعال شود.'
                    : '⚠️ Backend Cloudflare Worker is still on an older version (Route not found). Run `npx wrangler deploy` to update the API routes.'
                );
              }
              throw pubErr;
            }
          } else {
            throw new Error(
              isFa
                ? '⚠️ سرور بک‌اند (Cloudflare Worker) هنوز به نسخه جدید v9.9.1 آپدیت نشده است (Route not found). لطفاً دستور npx wrangler deploy را روی سرور اجرا کنید.'
                : '⚠️ Backend Cloudflare Worker is still on an older version (Route not found). Run `npx wrangler deploy`.'
            );
          }
        } else {
          throw primaryErr;
        }
      }

      if (authenticated && (!activeSessionId || activeSessionId !== res.sessionId)) {
        setActiveSessionId(res.sessionId);
        const sRes = await apiFetch<{ sessions: AiChatSessionItem[] }>('/api/ai-assistant/sessions').catch(() => ({
          sessions: [],
        }));
        if (sRes.sessions.length) setSessions(sRes.sessions);
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `ai-${Date.now()}`,
          role: 'assistant',
          content: res.visionFallbackNotice ? `ℹ️ ${res.visionFallbackNotice}\n\n${res.reply}` : res.reply,
          modelId: res.modelId,
          modelLabel: res.modelLabel,
          usedVision: res.usedVision,
          setup: res.setup,
        },
      ]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'خطا در ارتباط با هوش مصنوعی';
      setErrorMsg(msg);
    } finally {
      setSending(false);
    }
  };

  const activeModel = models.find((m) => m.id === selectedModelId) || models[0];
  const quickStarters = isFa
    ? [
        '📊 تحلیل لحظه‌ای بیت‌کوین و ستاپ امروز',
        '🧠 کد Pine Script استراتژی EMA + RSI بنویس',
        '🛡 با سرمایه ۵۰۰ دلار و ریسک ۲٪ چقدر حجم بگیرم؟',
        '👨‍💻 دلارینو و سازنده‌اش آوید کیا را معرفی کن',
      ]
    : [
        '📊 Live BTC analysis & setup',
        '🧠 Write an EMA + RSI Pine Script strategy',
        '🛡 Position sizing for $500 & 2% risk',
        '👨‍💻 Who built Dollarino?',
      ];

  return (
    <div
      className={`flex ${compact ? 'flex-col h-full' : 'flex-col lg:flex-row h-[calc(100vh-11rem)] min-h-[560px]'} gap-3`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) void handleImageFile(f);
      }}
    >
      {/* Sessions Sidebar in full page mode */}
      {!compact && authenticated && (
        <aside className="lg:w-72 shrink-0 panel rounded-[24px] p-3.5 flex flex-col justify-between gap-3">
          <div className="space-y-3 overflow-hidden flex flex-col">
            <button
              type="button"
              onClick={() => void startNewChat()}
              className="btn-cobalt w-full py-2.5 px-3 rounded-2xl text-xs font-black flex items-center justify-center gap-2"
            >
              <MessageSquarePlus className="w-4 h-4" />
              <span>{isFa ? 'گفتگوی جدید با هوش مصنوعی' : 'New AI Chat'}</span>
            </button>

            <div className="flex-1 overflow-y-auto space-y-1.5 max-h-[340px] lg:max-h-none pe-1">
              {loadingSessions && sessions.length === 0 ? (
                <div className="py-6 text-center text-xs text-dim">
                  <Loader2 className="w-4 h-4 animate-spin mx-auto mb-1" />
                  {isFa ? 'در حال بارگذاری...' : 'Loading...'}
                </div>
              ) : sessions.length === 0 ? (
                <p className="text-[11px] text-dim text-center py-6">
                  {isFa ? 'هنوز گفتگویی ثبت نشده — اولین پیام یا عکس چارت را بفرستید!' : 'No conversations yet.'}
                </p>
              ) : (
                sessions.map((s) => (
                  <div
                    key={s.id}
                    className={`group flex items-center gap-2 px-3 py-2 rounded-xl text-xs transition cursor-pointer ${
                      activeSessionId === s.id
                        ? 'bg-[var(--cobalt)]/20 border border-[var(--cobalt)]/40 text-main font-bold'
                        : 'surface-soft text-sub hover:brightness-95'
                    }`}
                    onClick={() => void openSession(s.id)}
                  >
                    <Sparkles className="w-3.5 h-3.5 shrink-0 text-[var(--gold)]" />
                    <span className="truncate flex-1">{s.title}</span>
                    <button
                      type="button"
                      aria-label="Delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        void deleteSession(s.id);
                      }}
                      className="opacity-60 hover:opacity-100 text-rose-400 p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="surface-soft rounded-2xl p-3 space-y-1.5 text-[11px]">
            <div className="flex items-center gap-1.5 font-black text-main">
              <UserCheck className="w-3.5 h-3.5 text-jade shrink-0" />
              <span>{isFa ? `طراح و سازنده: ${creator.nameFa}` : `Creator: ${creator.nameEn}`}</span>
            </div>
            <div className="flex flex-wrap gap-2 text-[10px] text-dim" dir="ltr">
              <a href={creator.telegramUrl} target="_blank" rel="noreferrer" className="hover:text-main underline">
                TG: {creator.telegram}
              </a>
              <a href={creator.instagramUrl} target="_blank" rel="noreferrer" className="hover:text-main underline">
                IG: {creator.instagram}
              </a>
              <a href={creator.twitterUrl} target="_blank" rel="noreferrer" className="hover:text-main underline">
                X: {creator.twitter}
              </a>
            </div>
          </div>
        </aside>
      )}

      {/* Main Chat Container */}
      <div
        className={`flex-1 flex flex-col min-h-0 ${
          compact ? '' : 'panel rounded-[26px]'
        } overflow-hidden relative ${dragOver ? 'ring-2 ring-[var(--gold)]' : ''}`}
      >
        {dragOver && (
          <div className="absolute inset-0 z-30 bg-black/70 backdrop-blur-sm grid place-items-center text-center p-6 pointer-events-none">
            <div className="space-y-2">
              <ImagePlus className="w-10 h-10 text-[var(--gold)] mx-auto" />
              <p className="font-display font-bold text-base text-white">
                {isFa ? 'عکس چارت را همین‌جا رها کنید 📸' : 'Drop chart image here 📸'}
              </p>
            </div>
          </div>
        )}

        {/* Top Header + Model Selector */}
        <div
          className={`px-3.5 pt-2 sm:pt-3 pb-2.5 border-b hairline shrink-0 space-y-2 ${
            compact ? 'bg-[var(--glass-a)] backdrop-blur-md' : 'bg-[var(--panel)]'
          }`}
        >
          {compact && (
            <div className="sm:hidden flex justify-center">
              <span className="w-10 h-1 rounded-full bg-[var(--line-strong)]" aria-hidden="true" />
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <DollarinoRobotLogoIcon size={34} />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h3 className="font-display font-bold text-xs sm:text-sm text-main truncate">
                    {isFa ? 'هوش مصنوعی دلارینو' : 'Dollarino AI'}
                  </h3>
                  <span className="inline-flex items-center gap-1 text-[9px] font-black px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    {isFa ? 'آنلاین' : 'Live'}
                  </span>
                  {activeModel?.supportsVision && (
                    <span className="hidden xs:inline-flex items-center gap-0.5 text-[9px] font-black px-1.5 py-0.5 rounded-full bg-sky-500/15 text-sky-400">
                      <Eye className="w-2.5 h-2.5" />
                      Vision
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-dim truncate">
                  {isFa ? `سازنده: ${creator.nameFa} (${creator.telegram})` : `Creator: ${creator.nameEn}`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {!authenticated && onGoAuth && (
                <button
                  type="button"
                  onClick={() => {
                    onCloseFloating?.();
                    onGoAuth();
                  }}
                  title={isFa ? 'ورود برای ذخیره چت‌ها' : 'Sign in'}
                  className="h-8 px-2.5 rounded-full btn-ghost text-[10px] font-black inline-flex items-center gap-1"
                >
                  <LogIn className="w-3 h-3" />
                  <span className="hidden sm:inline">{isFa ? 'ورود' : 'Login'}</span>
                </button>
              )}

              {compact && (
                <button
                  type="button"
                  onClick={() => void startNewChat()}
                  title={isFa ? 'گفتگوی جدید' : 'New chat'}
                  className="h-8 w-8 rounded-full btn-ghost grid place-items-center"
                >
                  <MessageSquarePlus className="w-3.5 h-3.5" />
                </button>
              )}

              {onExpandFullScreen && (
                <button
                  type="button"
                  onClick={onExpandFullScreen}
                  title={isFa ? 'باز کردن صفحه کامل چت' : 'Open Full AI Page'}
                  className="h-8 w-8 rounded-full btn-ghost grid place-items-center"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
              )}

              {onCloseFloating && (
                <button
                  type="button"
                  onClick={onCloseFloating}
                  title={isFa ? 'جمع کردن به گوی' : 'Minimize to orb'}
                  className="h-8 w-8 rounded-full btn-ghost grid place-items-center"
                >
                  <Minimize2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {models.length > 0 && (
            <div className="flex items-center gap-2">
              <select
                value={selectedModelId}
                onChange={(e) => void handleModelChange(e.target.value)}
                aria-label={isFa ? 'انتخاب مدل هوش مصنوعی' : 'Select AI Model'}
                className="w-full rounded-full bg-[var(--soft)] border hairline py-1.5 px-3 text-[11px] font-bold text-main outline-none focus:border-[var(--gold)] transition"
              >
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.supportsVision ? '👁️ ' : '🤖 '}
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Messages Feed */}
        <div className="flex-1 overflow-y-auto px-3.5 py-3 space-y-3">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-4 px-2 space-y-4">
              <DollarinoRobotLogoIcon size={52} />
              <div className="space-y-1 max-w-md">
                <h4 className="font-display font-bold text-sm sm:text-base text-main">
                  {isFa ? 'ربات هوش مصنوعی دلارینو آماده است' : 'Dollarino AI is Ready'}
                </h4>
                <p className="text-[11px] sm:text-xs text-dim leading-relaxed">
                  {isFa
                    ? 'سوال بپرسید، اسم ارز را برای تحلیل زنده و ستاپ بنویسید، یا عکس چارت بفرستید.'
                    : 'Ask anything, request live coin setups, or drop a chart screenshot.'}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-xl">
                {quickStarters.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => void sendMessage(q)}
                    className="surface-soft hover:brightness-95 active:scale-[0.98] transition text-start px-3 py-2.5 rounded-2xl text-[11px] font-bold text-sub border hairline"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[88%] sm:max-w-[82%] rounded-[20px] px-3.5 py-2.5 shadow-sm ${
                    m.role === 'user'
                      ? 'bg-[#1652f0] text-white rounded-ee-md'
                      : 'surface-soft border hairline text-sub rounded-es-md'
                  }`}
                >
                  {m.previewImageUrl && (
                    <img
                      src={m.previewImageUrl}
                      alt="Uploaded chart"
                      className="max-h-52 rounded-xl mb-2 object-contain border border-white/15"
                    />
                  )}
                  {m.hasImage && !m.previewImageUrl && (
                    <div className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-lg bg-black/20 mb-1.5">
                      <ImagePlus className="w-3 h-3" />
                      <span>{isFa ? 'تصویر چارت پیوست شد' : 'Chart image attached'}</span>
                    </div>
                  )}

                  {m.role === 'assistant' && m.modelLabel && (
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-[var(--gold)] mb-1">
                      <Bot className="w-3 h-3" />
                      <span>{m.modelLabel}</span>
                      {m.usedVision && <span>· 👁️ Vision</span>}
                    </div>
                  )}

                  {m.role === 'assistant' ? (
                    <FormattedAiMarkdown text={m.content} />
                  ) : (
                    <p className="text-xs sm:text-[13px] whitespace-pre-wrap leading-relaxed">{m.content}</p>
                  )}

                  {m.setup && (
                    <SetupActionCard
                      setup={m.setup}
                      isFa={isFa}
                      onOpenTerminal={
                        authenticated && onNavigate
                          ? (sym) => {
                              const clean = sym.endsWith('USDT') ? sym : `${sym}USDT`;
                              onSelectSymbolForTerminal?.(clean);
                              onNavigate('terminal');
                              onCloseFloating?.();
                            }
                          : !authenticated && onGoAuth
                            ? () => {
                                onCloseFloating?.();
                                onGoAuth();
                              }
                            : undefined
                      }
                    />
                  )}
                </div>
              </div>
            ))
          )}

          {sending && (
            <div className="flex justify-start">
              <div className="surface-soft border hairline rounded-[20px] rounded-es-md px-3.5 py-2.5 flex items-center gap-2 text-xs text-dim">
                <Loader2 className="w-4 h-4 animate-spin text-[var(--gold)]" />
                <span>{isFa ? 'در حال تحلیل و نوشتن پاسخ...' : 'Thinking...'}</span>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* Error notice */}
        {errorMsg && (
          <div className="mx-3.5 mb-2 px-3 py-2 rounded-xl bg-rose-500/15 border border-rose-500/35 text-[11px] font-bold text-rose-300 flex items-center justify-between gap-2">
            <span>{errorMsg}</span>
            <button type="button" onClick={() => setErrorMsg(null)}>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Modern Pill Chat Bar Composer + Chart Upload/Paste */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void sendMessage();
          }}
          className={`px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t hairline space-y-2 shrink-0 ${
            compact ? 'bg-[var(--glass-a)] backdrop-blur-md' : 'bg-[var(--panel)]'
          }`}
        >
          {pendingImage && (
            <div className="flex items-center gap-3 p-2 rounded-2xl surface-soft border hairline">
              <img src={pendingImage} alt="Preview" className="h-12 w-16 object-cover rounded-xl border hairline" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold text-main truncate">
                  {isFa ? '📸 عکس چارت آماده ارسال به AI' : '📸 Chart ready for AI'}
                </p>
                <p className="text-[10px] text-dim truncate">
                  {isFa ? 'پیام بنویسید یا دکمه ارسال را بزنید.' : 'Add prompt or send.'}
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
              const file = e.target.files?.[0];
              e.target.value = '';
              void handleImageFile(file);
            }}
          />

          <div className="flex items-end gap-1.5 rounded-[24px] bg-[var(--soft)] border border-[var(--line-strong)] focus-within:border-[var(--gold)] px-2 py-1.5 shadow-sm transition">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title={isFa ? 'ارسال عکس چارت' : 'Attach chart image'}
              className="h-9 w-9 shrink-0 rounded-full hover:bg-[var(--panel)] grid place-items-center text-[var(--gold)] transition"
            >
              <ImagePlus className="w-[18px] h-[18px]" />
            </button>

            <textarea
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onPaste={(e) => {
                const items = Array.from(e.clipboardData?.items || []);
                const imgItem = items.find((it) => it.type.startsWith('image/'));
                const file = imgItem?.getAsFile();
                if (file) {
                  e.preventDefault();
                  void handleImageFile(file);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void sendMessage();
                }
              }}
              placeholder={
                isFa
                  ? 'هر سوالی دارید بپرسید یا عکس چارت بفرستید...'
                  : 'Message Dollarino AI or attach a chart...'
              }
              className="flex-1 bg-transparent border-0 outline-none focus:ring-0 py-1.5 px-1 text-xs sm:text-sm text-main placeholder:text-dim resize-none max-h-28 leading-relaxed"
            />

            <button
              type="submit"
              disabled={sending || (!input.trim() && !pendingImage)}
              aria-label={isFa ? 'ارسال پیام' : 'Send message'}
              className="h-9 w-9 sm:w-auto sm:px-3.5 shrink-0 rounded-full btn-cobalt font-black text-xs inline-flex items-center justify-center gap-1.5 disabled:opacity-35 transition active:scale-95"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {!compact && <span className="hidden sm:inline">{isFa ? 'ارسال' : 'Send'}</span>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* Custom Dollarino Logo-Inspired Robot Avatar SVG (Hexagon Cobalt + Visor + Green Candles) */
export function DollarinoRobotLogoIcon({ size = 34 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className="shrink-0 select-none pointer-events-none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="dlrHexBg" x1="8" y1="6" x2="56" y2="58" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#2563EB" />
          <stop offset="55%" stopColor="#1652F0" />
          <stop offset="100%" stopColor="#092E96" />
        </linearGradient>
        <linearGradient id="dlrHelmet" x1="20" y1="16" x2="44" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#DBEAFE" />
        </linearGradient>
      </defs>
      {/* Dollarino Hexagon Badge */}
      <polygon
        points="32,4 56,18 56,46 32,60 8,46 8,18"
        fill="url(#dlrHexBg)"
        stroke="#00C8FF"
        strokeWidth="2.6"
        strokeLinejoin="round"
      />
      {/* Antenna with Dollarino Emerald Tip */}
      <line x1="32" y1="11" x2="32" y2="17" stroke="#E2E8F0" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="32" cy="9.5" r="2.8" fill="#16E664" />
      {/* Robot Ear Pods (Matching Astronaut Helmet Pods) */}
      <rect x="13.5" y="27" width="4.5" height="11" rx="2.2" fill="#00C8FF" />
      <rect x="46" y="27" width="4.5" height="11" rx="2.2" fill="#00C8FF" />
      {/* Robot White Rounded Head */}
      <rect x="17" y="17" width="30" height="27" rx="11" fill="url(#dlrHelmet)" />
      {/* Dark Glossy Visor */}
      <rect x="20.5" y="22.5" width="23" height="14.5" rx="6.5" fill="#07122D" />
      {/* Glowing Cyan/Emerald Robot Eyes */}
      <circle cx="27" cy="29.5" r="2.7" fill="#00E5FF" />
      <circle cx="37" cy="29.5" r="2.7" fill="#16E664" />
      {/* Subtle Digital Smile */}
      <path d="M29.2 33.6Q32 35.4 34.8 33.6" stroke="#93C5FD" strokeWidth="1.6" strokeLinecap="round" fill="none" />
      {/* 3 Ascending Mini Green Candles (Signature Logo Motif) */}
      <rect x="24" y="48.5" width="3.8" height="4.5" rx="1" fill="#10D856" />
      <rect x="30.1" y="46.5" width="3.8" height="6.5" rx="1" fill="#10D856" />
      <rect x="36.2" y="44.2" width="3.8" height="8.8" rx="1" fill="#16E664" />
    </svg>
  );
}

const ORB_STORAGE_KEY = 'dollarino_ai_orb_pos_v2';
const ORB_SIZE = 60;

interface OrbPos {
  side: 'left' | 'right';
  y: number;
}

function clampOrbY(y: number): number {
  if (typeof window === 'undefined') return 320;
  const min = 76;
  const max = Math.max(min + 40, window.innerHeight - 148);
  return Math.min(max, Math.max(min, y));
}

function loadSavedOrbPos(): OrbPos {
  if (typeof window === 'undefined') return { side: 'right', y: 320 };
  try {
    const raw = localStorage.getItem(ORB_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<OrbPos>;
      const side = parsed.side === 'left' ? 'left' : 'right';
      const y = clampOrbY(typeof parsed.y === 'number' ? parsed.y : window.innerHeight - 170);
      return { side, y };
    }
  } catch {
    // ignore storage limits
  }
  return { side: 'right', y: clampOrbY(window.innerHeight - 170) };
}

export function FloatingAiChat({
  lang,
  authenticated,
  activeTab,
  onNavigate,
  onSelectSymbolForTerminal,
  onGoAuth,
}: {
  lang: Lang;
  authenticated: boolean;
  activeTab?: NavTab;
  onNavigate?: (tab: NavTab) => void;
  onSelectSymbolForTerminal?: (symbol: string) => void;
  onGoAuth?: () => void;
}) {
  const isFa = lang === 'fa';
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<OrbPos>(() => loadSavedOrbPos());
  const [vw, setVw] = useState<number>(() => (typeof window !== 'undefined' ? window.innerWidth : 390));
  const [collapsed, setCollapsed] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [dragCoords, setDragCoords] = useState<{ x: number; y: number } | null>(null);

  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragMetaRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);

  const scheduleCollapse = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      setCollapsed(true);
    }, 2400);
  }, []);

  useEffect(() => {
    const onResize = () => {
      setVw(window.innerWidth);
      setPos((p) => ({ ...p, y: clampOrbY(p.y) }));
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!open && !dragging) {
      scheduleCollapse();
    }
  }, [open, dragging, scheduleCollapse]);

  // Hide floating orb when user is already inside the dedicated full-page AI Chat view
  if (authenticated && activeTab === 'aichat') return null;

  const restX = pos.side === 'right' ? Math.max(8, vw - ORB_SIZE - 8) : 8;

  const activeX = dragCoords ? dragCoords.x : restX;
  const activeY = dragCoords ? dragCoords.y : clampOrbY(pos.y);

  const collapsedShiftX = !dragging && collapsed ? (pos.side === 'right' ? 22 : -22) : 0;

  return (
    <>
      {open && (
        <>
          <div
            className="sm:hidden fixed inset-0 z-[179] bg-black/35 backdrop-blur-[3px]"
            onClick={() => {
              setOpen(false);
              setCollapsed(false);
              scheduleCollapse();
            }}
          />
          <div
            dir={isFa ? 'rtl' : 'ltr'}
            className={`fixed inset-x-0 bottom-0 h-[84dvh] rounded-t-[28px] sm:inset-x-auto sm:bottom-16 ${
              pos.side === 'left' ? 'sm:left-5' : 'sm:right-5'
            } sm:w-[420px] sm:h-[560px] sm:max-h-[80vh] sm:rounded-[28px] z-[180] liquid-ai-sheet overflow-hidden flex flex-col pop-in`}
          >
            <DedicatedAiChatSurface
              lang={lang}
              authenticated={authenticated}
              compact
              onNavigate={onNavigate}
              onSelectSymbolForTerminal={onSelectSymbolForTerminal}
              onGoAuth={onGoAuth}
              onExpandFullScreen={
                authenticated && onNavigate
                  ? () => {
                      setOpen(false);
                      onNavigate('aichat');
                    }
                  : undefined
              }
              onCloseFloating={() => {
                setOpen(false);
                setCollapsed(false);
                scheduleCollapse();
              }}
            />
          </div>
        </>
      )}

      {/* iPhone AssistiveTouch-Style Collapsible Floating Orb with Logo-Inspired Robot */}
      {!open && (
        <button
          type="button"
          aria-label={isFa ? 'ربات هوش مصنوعی دلارینو' : 'Dollarino AI Floating Orb'}
          title={isFa ? 'لمس برای چت AI · کشیدن برای جابجایی' : 'Tap for AI Chat · Drag to move'}
          onPointerDown={(e) => {
            if (e.button !== 0 && e.pointerType === 'mouse') return;
            e.currentTarget.setPointerCapture(e.pointerId);
            if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
            setCollapsed(false);
            dragMetaRef.current = {
              pointerId: e.pointerId,
              startX: e.clientX,
              startY: e.clientY,
              originX: restX,
              originY: activeY,
              moved: false,
            };
          }}
          onPointerMove={(e) => {
            const meta = dragMetaRef.current;
            if (!meta || meta.pointerId !== e.pointerId) return;
            const dx = e.clientX - meta.startX;
            const dy = e.clientY - meta.startY;
            if (!meta.moved && Math.hypot(dx, dy) > 6) {
              meta.moved = true;
              setDragging(true);
            }
            if (meta.moved) {
              const maxX = Math.max(8, window.innerWidth - ORB_SIZE - 8);
              const nextX = Math.min(maxX, Math.max(8, meta.originX + dx));
              const nextY = clampOrbY(meta.originY + dy);
              setDragCoords({ x: nextX, y: nextY });
            }
          }}
          onPointerUp={(e) => {
            const meta = dragMetaRef.current;
            if (!meta || meta.pointerId !== e.pointerId) return;
            dragMetaRef.current = null;
            if (meta.moved && dragCoords) {
              const mid = window.innerWidth / 2;
              const nextSide: 'left' | 'right' = dragCoords.x + ORB_SIZE / 2 < mid ? 'left' : 'right';
              const nextPos: OrbPos = { side: nextSide, y: clampOrbY(dragCoords.y) };
              setPos(nextPos);
              setDragCoords(null);
              setDragging(false);
              try {
                localStorage.setItem(ORB_STORAGE_KEY, JSON.stringify(nextPos));
              } catch {
                // ignore
              }
              scheduleCollapse();
            } else {
              setDragCoords(null);
              setDragging(false);
              setOpen(true);
            }
          }}
          onPointerCancel={() => {
            dragMetaRef.current = null;
            setDragCoords(null);
            setDragging(false);
            scheduleCollapse();
          }}
          style={{
            left: `${activeX}px`,
            top: `${activeY}px`,
            width: `${ORB_SIZE}px`,
            height: `${ORB_SIZE}px`,
            transform: `translate3d(${collapsedShiftX}px, 0, 0)`,
            opacity: dragging ? 0.98 : collapsed ? 0.68 : 0.96,
            transition: dragging
              ? 'none'
              : 'left 0.28s cubic-bezier(0.22, 1, 0.36, 1), top 0.22s ease, transform 0.28s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.25s ease, box-shadow 0.25s ease',
            touchAction: 'none',
          }}
          className="liquid-orb fixed z-[175] rounded-full grid place-items-center cursor-pointer select-none hover:!opacity-100 focus:outline-none"
        >
          <div className="liquid-orb-core relative z-10 drop-shadow-[0_2px_8px_rgba(22,82,240,0.34)]">
            <DollarinoRobotLogoIcon size={32} />
          </div>
          <span
            className="absolute top-1.5 end-1.5 z-20 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-white/80 dark:ring-[var(--panel)] shadow-[0_0_10px_rgba(16,185,129,0.75)] pointer-events-none"
            aria-hidden="true"
          />
        </button>
      )}
    </>
  );
}
