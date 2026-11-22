import { atr, ema, rsi, type AIProviderId, type Timeframe } from '@dollarino/core';
import { decryptVaultJson, randomId } from '../crypto.js';
import type { Env } from '../env.js';
import { fetchPublicKlines, fetchPublicMarket24h } from '../exchanges/paper.js';
import { resolveAIEnsemble, type AIRecord } from './providers.js';

export const DOLLARINO_CREATOR_INFO = {
  nameFa: 'آوید کیا',
  nameEn: 'Avid Kiya',
  telegram: '@avidkiya',
  telegramUrl: 'https://t.me/avidkiya',
  instagram: '@avid_kiya',
  instagramUrl: 'https://instagram.com/avid_kiya',
  twitter: '@avid_kiya',
  twitterUrl: 'https://x.com/avid_kiya',
};

export interface SelectableAIModel {
  id: string;
  label: string;
  provider: AIProviderId;
  model: string;
  source: 'PLATFORM' | 'USER';
  supportsVision: boolean;
  isDefault: boolean;
}

export interface ExtractedChartSetup {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  timeframe?: string;
  entry: string;
  stopLoss: string;
  tp1: string;
  tp2?: string;
  tp3?: string;
  leverage?: number;
  rrRatio?: string;
  confidence?: number;
  note?: string;
}

export interface AssistantChatResult {
  reply: string;
  modelId: string;
  modelLabel: string;
  provider: AIProviderId;
  modelName: string;
  usedVision: boolean;
  visionFallbackNotice?: string;
  setup: ExtractedChartSetup | null;
}

export function detectVisionSupport(provider: AIProviderId | string, model: string, label?: string): boolean {
  const m = `${model} ${label || ''}`.toLowerCase();
  if (provider === 'gemini') return true;
  if (provider === 'anthropic') {
    return /claude-(?:3|4|sonnet|opus|haiku)/.test(m);
  }
  if (
    /vision|\bvl\b|gpt-4o|gpt-4\.1|gpt-4\.5|gpt-4-turbo|gpt-5|\bo1\b|\bo3\b|\bo4\b|pixtral|llava|grok-2-vision|grok-4|gemini|claude-3|claude-4|sonnet|qwen[\d.]*-vl|qwen3-vl|kimi-vl/.test(
      m
    )
  ) {
    return true;
  }
  return false;
}

export async function listSelectableAIModels(
  env: Env,
  userId?: string
): Promise<{
  models: SelectableAIModel[];
  selectedModelId: string;
}> {
  const models: SelectableAIModel[] = [];
  const seenIds = new Set<string>();

  // 1) Platform engines configured in Admin Panel
  const platformRows = await env.DB.prepare(
    `SELECT id, slot_order, provider, label, model, base_url
     FROM platform_ai_engines
     WHERE is_active = 1
     ORDER BY slot_order ASC, updated_at DESC`
  )
    .all<{
      id: string;
      slot_order: number;
      provider: AIProviderId;
      label: string;
      model: string;
      base_url: string | null;
    }>()
    .catch(() => ({ results: [] }));

  for (const r of platformRows.results ?? []) {
    if (seenIds.has(r.id)) continue;
    seenIds.add(r.id);
    let modelName = (r.model || '').trim();
    const lowerM = modelName.toLowerCase();
    const isHilinkup = (r.base_url || '').includes('hilinkup.com');
    if (
      isHilinkup &&
      (!modelName || lowerM === 'deep' || lowerM === 'deepseek' || lowerM === 'دیپی' || lowerM === 'deepseek-v4' || lowerM === 'deepseek-chat')
    ) {
      modelName = env.HILINKUP_MODEL?.trim() || 'baidu/deepseek-v4.1-flash-1017';
    } else if (r.provider === 'deepseek' && (!modelName || lowerM === 'deep' || lowerM === 'دیپی')) {
      modelName = isHilinkup ? (env.HILINKUP_MODEL?.trim() || 'baidu/deepseek-v4.1-flash-1017') : 'deepseek-chat';
    }
    models.push({
      id: r.id,
      label: r.label || modelName,
      provider: r.provider,
      model: modelName,
      source: 'PLATFORM',
      supportsVision: detectVisionSupport(r.provider, modelName, r.label),
      isDefault: models.length === 0,
    });
  }

  // 2) Built-in Hilinkup Gateway model (kept available both as primary and failover)
  if (env.HILINKUP_API_KEY?.trim() && !seenIds.has('env-hilinkup-default')) {
    seenIds.add('env-hilinkup-default');
    const defModel = env.HILINKUP_MODEL?.trim() || 'baidu/deepseek-v4.1-flash-1017';
    models.push({
      id: 'env-hilinkup-default',
      label: 'هوش مصنوعی مرکزی دلارینو (DeepSeek v4.1)',
      provider: 'openai_compatible',
      model: defModel,
      source: 'PLATFORM',
      supportsVision: detectVisionSupport('openai_compatible', defModel),
      isDefault: models.length === 0,
    });
  }

  // 3) Optional Cloudflare Workers AI binding if present
  if (env.AI && !seenIds.has('cf-workers-ai')) {
    seenIds.add('cf-workers-ai');
    models.push({
      id: 'cf-workers-ai',
      label: 'Cloudflare Workers AI (Llama 3.1)',
      provider: 'openai_compatible',
      model: '@cf/meta/llama-3.1-8b-instruct',
      source: 'PLATFORM',
      supportsVision: false,
      isDefault: models.length === 0,
    });
  }

  // 4) User's own connected AI models (from Connections / BYOAI)
  if (userId) {
    const userRows = await env.DB.prepare(
      `SELECT id, provider, label, model, is_active
       FROM ai_connections
       WHERE user_id = ?
       ORDER BY is_active DESC, updated_at DESC`
    )
      .bind(userId)
      .all<{
        id: string;
        provider: AIProviderId;
        label: string;
        model: string;
        is_active: number;
      }>()
      .catch(() => ({ results: [] }));

    for (const r of userRows.results ?? []) {
      const uid = `user:${r.id}`;
      if (seenIds.has(uid)) continue;
      seenIds.add(uid);
      models.push({
        id: uid,
        label: `${r.label || r.model} (مدل شخصی)`,
        provider: r.provider,
        model: r.model,
        source: 'USER',
        supportsVision: detectVisionSupport(r.provider, r.model, r.label),
        isDefault: models.length === 0,
      });
    }
  }

  // 5) Always-On Live Quant & Chat Engine (zero-downtime built-in Dollarino AI)
  if (!seenIds.has('dollarino-live-ai')) {
    seenIds.add('dollarino-live-ai');
    models.push({
      id: 'dollarino-live-ai',
      label: 'هوش مصنوعی زنده دلارینو (Quant + Live Market)',
      provider: 'deepseek',
      model: 'dollarino-live-quant-v1',
      source: 'PLATFORM',
      supportsVision: false,
      isDefault: models.length === 0,
    });
  }

  let selectedModelId = models[0]?.id || 'dollarino-live-ai';
  if (userId) {
    const pref = await env.DB.prepare(`SELECT preferred_ai_model_id FROM users WHERE id = ? LIMIT 1`)
      .bind(userId)
      .first<{ preferred_ai_model_id: string | null }>()
      .catch(() => null);
    if (pref?.preferred_ai_model_id && models.some((m) => m.id === pref.preferred_ai_model_id)) {
      selectedModelId = pref.preferred_ai_model_id;
    }
  }

  return { models, selectedModelId };
}

export async function resolveModelRecordById(
  env: Env,
  userId?: string,
  requestedModelId?: string | null
): Promise<{
  record: AIRecord;
  meta: SelectableAIModel;
} | null> {
  const { models, selectedModelId } = await listSelectableAIModels(env, userId);
  const targetId = requestedModelId?.trim() || selectedModelId;
  const targetMeta = models.find((m) => m.id === targetId) || models[0];
  if (!targetMeta) return null;

  if (targetMeta.id === 'dollarino-live-ai' || targetMeta.id === 'cf-workers-ai') {
    return null;
  }

  if (targetMeta.id === 'env-hilinkup-default' && env.HILINKUP_API_KEY?.trim()) {
    const defModel = env.HILINKUP_MODEL?.trim() || 'baidu/deepseek-v4.1-flash-1017';
    return {
      meta: targetMeta,
      record: {
        id: 'env-hilinkup-default',
        label: targetMeta.label,
        provider: 'openai_compatible',
        model: defModel,
        baseUrl: env.HILINKUP_BASE_URL?.trim() || 'https://api.hilinkup.com/v1',
        apiKey: env.HILINKUP_API_KEY.trim(),
        temperature: 0.35,
        maxTokens: 2400,
      },
    };
  }

  if (userId && targetMeta.id.startsWith('user:')) {
    const rawId = targetMeta.id.slice(5);
    const row = await env.DB.prepare(
      `SELECT id, provider, label, model, base_url, encrypted_api_key, temperature, max_tokens
       FROM ai_connections WHERE id = ? AND user_id = ? LIMIT 1`
    )
      .bind(rawId, userId)
      .first<{
        id: string;
        provider: AIProviderId;
        label: string;
        model: string;
        base_url: string | null;
        encrypted_api_key: string;
        temperature: number;
        max_tokens: number;
      }>()
      .catch(() => null);

    if (row) {
      const creds = await decryptVaultJson<{ apiKey?: string }>(row.encrypted_api_key, env.MASTER_ENCRYPTION_KEY).catch(() => ({
        apiKey: undefined,
      }));
      if (creds.apiKey) {
        return {
          meta: targetMeta,
          record: {
            id: targetMeta.id,
            label: targetMeta.label,
            provider: row.provider,
            model: row.model,
            baseUrl: row.base_url,
            apiKey: creds.apiKey,
            temperature: row.temperature ?? 0.35,
            maxTokens: Math.max(row.max_tokens || 2048, 2048),
          },
        };
      }
    }
  }

  const platRow = await env.DB.prepare(
    `SELECT id, provider, label, model, base_url, encrypted_api_key, temperature, max_tokens
     FROM platform_ai_engines WHERE id = ? AND is_active = 1 LIMIT 1`
  )
    .bind(targetMeta.id)
    .first<{
      id: string;
      provider: AIProviderId;
      label: string;
      model: string;
      base_url: string | null;
      encrypted_api_key: string;
      temperature: number;
      max_tokens: number;
    }>()
    .catch(() => null);

  if (platRow) {
    const creds = await decryptVaultJson<{ apiKey?: string }>(platRow.encrypted_api_key, env.MASTER_ENCRYPTION_KEY).catch(() => ({
      apiKey: undefined,
    }));
    if (creds.apiKey) {
      let modelName = (platRow.model || '').trim();
      const lowerM = modelName.toLowerCase();
      const isHilinkup = (platRow.base_url || '').includes('hilinkup.com');
      if (
        isHilinkup &&
        (!modelName || lowerM === 'deep' || lowerM === 'deepseek' || lowerM === 'دیپی' || lowerM === 'deepseek-v4' || lowerM === 'deepseek-chat')
      ) {
        modelName = env.HILINKUP_MODEL?.trim() || 'baidu/deepseek-v4.1-flash-1017';
      } else if (platRow.provider === 'deepseek' && (!modelName || lowerM === 'deep' || lowerM === 'دیپی')) {
        modelName = isHilinkup ? (env.HILINKUP_MODEL?.trim() || 'baidu/deepseek-v4.1-flash-1017') : 'deepseek-chat';
      }
      return {
        meta: targetMeta,
        record: {
          id: platRow.id,
          label: platRow.label || modelName,
          provider: platRow.provider,
          model: modelName,
          baseUrl: platRow.base_url,
          apiKey: creds.apiKey,
          temperature: platRow.temperature ?? 0.35,
          maxTokens: Math.max(platRow.max_tokens || 2048, 2048),
        },
      };
    }
  }

  const ensemble = await resolveAIEnsemble(env, userId).catch(() => null);
  const first = ensemble?.engines?.[0];
  if (!first) return null;
  return {
    meta: {
      id: first.id || 'default',
      label: first.label || first.model,
      provider: first.provider,
      model: first.model,
      source: ensemble?.source || 'PLATFORM',
      supportsVision: detectVisionSupport(first.provider, first.model, first.label),
      isDefault: true,
    },
    record: first,
  };
}

function parseDataUrl(dataUrl: string): { mimeType: string; base64: string } | null {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s);
  if (!match) return null;
  return { mimeType: match[1]!.toLowerCase(), base64: match[2]!.replace(/\s+/g, '') };
}

export async function callMultimodalChatAI(
  ai: AIRecord,
  systemPrompt: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  currentText: string,
  imageDataUrl?: string | null
): Promise<string> {
  const img = imageDataUrl ? parseDataUrl(imageDataUrl) : null;
  const trimmedHistory = history.slice(-10);

  if (ai.provider === 'anthropic') {
    const msgs: Array<{ role: 'user' | 'assistant'; content: unknown }> = trimmedHistory.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    if (img) {
      msgs.push({
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: img.mimeType === 'image/jpg' ? 'image/jpeg' : img.mimeType,
              data: img.base64,
            },
          },
          { type: 'text', text: currentText },
        ],
      });
    } else {
      msgs.push({ role: 'user', content: currentText });
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ai.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: ai.model || 'claude-3-5-sonnet-20241022',
        max_tokens: Math.max(ai.maxTokens || 2048, 2048),
        temperature: ai.temperature ?? 0.35,
        system: systemPrompt,
        messages: msgs,
      }),
      signal: AbortSignal.timeout(40_000),
    });
    const json = (await res.json()) as { content?: Array<{ text?: string }>; error?: { message?: string } };
    if (!res.ok) throw new Error(json.error?.message ?? `Anthropic HTTP ${res.status}`);
    return json.content?.[0]?.text ?? '';
  }

  if (ai.provider === 'gemini') {
    const model = ai.model || 'gemini-2.0-flash';
    const contents: Array<{ role: string; parts: Array<Record<string, unknown>> }> = trimmedHistory.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
    const currentParts: Array<Record<string, unknown>> = [{ text: currentText }];
    if (img) {
      currentParts.unshift({
        inlineData: {
          mimeType: img.mimeType,
          data: img.base64,
        },
      });
    }
    contents.push({ role: 'user', parts: currentParts });

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(ai.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents,
          generationConfig: {
            temperature: ai.temperature ?? 0.35,
            maxOutputTokens: Math.max(ai.maxTokens || 2048, 2048),
          },
        }),
        signal: AbortSignal.timeout(40_000),
      }
    );
    const json = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      error?: { message?: string };
    };
    if (!res.ok) throw new Error(json.error?.message ?? `Gemini HTTP ${res.status}`);
    return json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  }

  // OpenAI / DeepSeek / OpenAI-Compatible Gateway (including Hilinkup)
  const defaultBase = ai.provider === 'deepseek' ? 'https://api.deepseek.com' : 'https://api.openai.com/v1';
  const rawBase = (ai.baseUrl || defaultBase).replace(/\/+$/, '');
  const endpoint = rawBase.endsWith('/chat/completions') ? rawBase : `${rawBase}/chat/completions`;
  const primaryModel = ai.model || (ai.provider === 'deepseek' ? 'deepseek-chat' : 'gpt-4o-mini');
  const candidateModels = rawBase.includes('hilinkup.com')
    ? Array.from(new Set([primaryModel, 'baidu/deepseek-v4.1-flash-1017', 'deepseek/deepseek-v4.1-flash-1017', 'doubao/deepseek-v4.1-flash-1017']))
    : ai.provider === 'deepseek'
      ? Array.from(new Set([primaryModel, 'deepseek-chat']))
      : [primaryModel];

  const messages: Array<{ role: string; content: unknown }> = [
    { role: 'system', content: systemPrompt },
    ...trimmedHistory.map((m) => ({ role: m.role, content: m.content })),
  ];

  if (img) {
    messages.push({
      role: 'user',
      content: [
        { type: 'text', text: currentText },
        { type: 'image_url', image_url: { url: imageDataUrl!, detail: 'high' } },
      ],
    });
  } else {
    messages.push({ role: 'user', content: currentText });
  }

  let lastGatewayErr = '';
  for (const model of candidateModels) {
    const isReasoningModel =
      model.includes('deepseek-v4') ||
      model.includes('reasoner') ||
      model.includes('flash-1017') ||
      /\bo1\b|\bo3\b|\br1\b/i.test(model);

    const payload: Record<string, unknown> = {
      model,
      max_tokens: isReasoningModel ? Math.max(ai.maxTokens || 2600, 2600) : Math.max(ai.maxTokens || 2048, 2048),
      messages,
    };
    if (rawBase.includes('hilinkup.com') && (model.includes('flash-1017') || model.includes('deepseek-v4'))) {
      payload.thinking = { type: 'disabled' };
    }
    if (!isReasoningModel) {
      payload.temperature = ai.temperature ?? 0.35;
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ai.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(40_000),
    });
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string; reasoning_content?: string } }>;
      error?: { message?: string };
    };
    if (res.ok) {
      return json.choices?.[0]?.message?.content || json.choices?.[0]?.message?.reasoning_content || '';
    }
    lastGatewayErr = json.error?.message ?? `AI Gateway HTTP ${res.status}`;
    if (!/model|not found|unsupported/i.test(lastGatewayErr)) {
      throw new Error(lastGatewayErr);
    }
  }
  throw new Error(lastGatewayErr || 'AI Gateway error');
}

function buildDedicatedSystemPrompt(hasImage: boolean, langHint: 'fa' | 'en'): string {
  const creatorBlock =
    `سازنده و بنیان‌گذار پلتفرم دلارینو (Dollarino): **آوید کیا (Avid Kiya)**\n` +
    `• تلگرام سازنده: @avidkiya (https://t.me/avidkiya)\n` +
    `• اینستاگرام سازنده: @avid_kiya (https://instagram.com/avid_kiya)\n` +
    `• توییتر (X) سازنده: @avid_kiya (https://x.com/avid_kiya)\n` +
    `هر زمان کاربر درباره سازنده، مالک، طراح یا توسعه‌دهنده پروژه سوال کرد، با افتخار نام آوید کیا و آیدی‌های @avidkiya (تلگرام) و @avid_kiya (اینستاگرام و توییتر) را ذکر کن.`;

  if (langHint === 'en') {
    return (
      `You are **Dollarino Dedicated AI**, an advanced, versatile, human-friendly AI assistant inside the Dollarino Quant & Web3 Trading Platform.\n` +
      `Creator & Founder of Dollarino: **Avid Kiya (آوید کیا)** — Telegram: @avidkiya | Instagram & X (Twitter): @avid_kiya.\n\n` +
      `Capabilities & Behavior:\n` +
      `- Act just like a flagship general-purpose AI assistant (ChatGPT / Claude / Gemini): answer general questions, coding (Pine Script, Python, TypeScript), market analysis, risk management, Web3/DEX insights, and Dollarino guidance clearly and naturally.\n` +
      (hasImage
        ? `- The user attached a chart or screenshot! Carefully inspect all visible candles, timeframe, price levels, indicators, market structure (BOS/CHoCH), liquidity sweeps, order blocks, support/resistance, and trend.\n` +
          `- Provide a structured, actionable technical breakdown plus a clear **Trading Setup** (Direction: LONG or SHORT, Entry Zone, Stop Loss, TP1, TP2, TP3, Leverage suggestion, Risk:Reward, and Invalidation).\n` +
          `- Whenever you propose a concrete trade setup, append at the very end a machine-readable block wrapped strictly like:\n` +
          `<<<SETUP_JSON>>>{"symbol":"BTCUSDT","direction":"LONG","timeframe":"15m","entry":"92000","stopLoss":"90500","tp1":"93500","tp2":"95000","tp3":"96800","leverage":8,"rrRatio":"1:2.2","confidence":80,"note":"Support bounce"}<<<END_SETUP_JSON>>>\n`
        : `- If the user asks for a trading setup on a symbol, provide Entry, Stop Loss, TP1/TP2/TP3, Risk:Reward, and optionally append <<<SETUP_JSON>>>...<<<END_SETUP_JSON>>>.\n`) +
      `- Never invent exact chart prices you cannot see or claim a trade is guaranteed.`
    );
  }

  return (
    `شما **هوش مصنوعی اختصاصی دلارینو (Dollarino Dedicated AI)** هستید؛ یک دستیار هوشمند همه‌فن‌حریف، دقیق، صمیمی و حرفه‌ای در قلب پلتفرم معاملاتی دلارینو.\n` +
    `${creatorBlock}\n\n` +
    `رفتار و وظایف شما:\n` +
    `۱. دقیقاً مثل پیشرفته‌ترین هوش‌های مصنوعی دنیا (مانند ChatGPT، Claude و Gemini) با کاربر رفتار کن: در هر موضوعی از تحلیل بازار کریپتو و فارکس گرفته تا نوشتن استراتژی Pine Script / پایتون، مدیریت ریسک، اقتصاد، برنامه‌نویسی، سوال‌های روزمره و راهنمای امکانات دلارینو (Toobit، Bitunix، KCEX، Trust Wallet، رادار DEX و کپی‌ترید) کامل، منظم و روان به فارسی پاسخ بده.\n` +
    (hasImage
      ? `۲. کاربر **تصویر چارت / اسکرین‌شات** فرستاده است! تمام جزئیات قابل مشاهده در عکس شامل تایم‌فریم، روند غالب، ساختار بازار (BOS/CHoCH)، سطوح کلیدی حمایت و مقاومت، نقدینگی و اردربلاک، الگوی کندل‌ها و اندیکاتورها را با دقت بالا تحلیل کن.\n` +
        `۳. در ادامه حتماً یک **ستاپ معاملاتی شفاف و حرفه‌ای** بده شامل:\n` +
        `   • جهت معامله (LONG / SHORT یا صبر برای تایید)\n` +
        `   • محدوده ورود (Entry)\n` +
        `   • حد ضرر قطعی (Stop Loss)\n` +
        `   • سه تارگت مرحله‌ای سود (TP1 / TP2 / TP3)\n` +
        `   • نسبت ریسک به ریوارد (R:R)، اهرم پیشنهادی منطقی و شرط ابطال سناریو.\n` +
        `۴. هر زمان ستاپ معاملاتی مشخصی پیشنهاد دادی، در انتهای پیام دقیقاً یک بلوک JSON ماشین‌خوان با این قالب بگذار (بدون هیچ متن اضافه بعد از تگ پایانی):\n` +
        `<<<SETUP_JSON>>>{"symbol":"BTCUSDT","direction":"LONG","timeframe":"15m","entry":"92000","stopLoss":"90500","tp1":"93500","tp2":"95000","tp3":"96800","leverage":8,"rrRatio":"1:2.2","confidence":80,"note":"خلاصه کوتاه"}<<<END_SETUP_JSON>>>\n`
      : `۲. اگر کاربر درباره تحلیل ارز یا ستاپ معاملاتی سوال کرد، می‌توانید تحلیل ساختار و نقاط ورود، SL و ۳ تارگت TP پیشنهاد دهید و در صورت دادن ستاپ عددی مشخص، بلوک <<<SETUP_JSON>>>{"symbol":"...","direction":"LONG","timeframe":"15m","entry":"...","stopLoss":"...","tp1":"...","tp2":"...","tp3":"...","leverage":5,"rrRatio":"1:2"}<<<END_SETUP_JSON>>> را در انتها بگذارید.\n`) +
    `۳. شفاف و صادق باش؛ ریسک بازار را همیشه یادآوری کن و هرگز وعده سود تضمینی نده.`
  );
}

export function extractChartSetupFromReply(rawReply: string): {
  cleanReply: string;
  setup: ExtractedChartSetup | null;
} {
  const match = rawReply.match(/<<<SETUP_JSON>>>([\s\S]*?)<<<END_SETUP_JSON>>>/);
  if (!match) {
    return { cleanReply: rawReply.trim(), setup: null };
  }
  const cleanReply = rawReply.replace(/<<<SETUP_JSON>>>[\s\S]*?<<<END_SETUP_JSON>>>/g, '').trim();
  try {
    const parsed = JSON.parse(match[1]!.trim()) as Partial<ExtractedChartSetup>;
    const dir = String(parsed.direction || '').toUpperCase();
    if ((dir === 'LONG' || dir === 'SHORT') && parsed.entry && parsed.stopLoss && parsed.tp1) {
      return {
        cleanReply,
        setup: {
          symbol: String(parsed.symbol || 'CHART').toUpperCase(),
          direction: dir,
          timeframe: parsed.timeframe ? String(parsed.timeframe) : undefined,
          entry: String(parsed.entry),
          stopLoss: String(parsed.stopLoss),
          tp1: String(parsed.tp1),
          tp2: parsed.tp2 ? String(parsed.tp2) : undefined,
          tp3: parsed.tp3 ? String(parsed.tp3) : undefined,
          leverage: parsed.leverage ? Number(parsed.leverage) : undefined,
          rrRatio: parsed.rrRatio ? String(parsed.rrRatio) : undefined,
          confidence: parsed.confidence ? Number(parsed.confidence) : undefined,
          note: parsed.note ? String(parsed.note) : undefined,
        },
      };
    }
  } catch {
    // Ignore malformed JSON tag, keep cleaned text
  }
  return { cleanReply, setup: null };
}

function detectSymbolFromQuery(text: string): string | null {
  const lower = text.toLowerCase();
  const aliasMap: Array<[RegExp, string]> = [
    [/\bbtc\b|بیت\s*کوین|بیتکوین|bitcoin/i, 'BTCUSDT'],
    [/\beth\b|اتریوم|ethereum/i, 'ETHUSDT'],
    [/\bsol\b|سولانا|solana/i, 'SOLUSDT'],
    [/\bton\b|تون\s*کوین|تونکوین|toncoin/i, 'TONUSDT'],
    [/\bbnb\b|بایننس\s*کوین/i, 'BNBUSDT'],
    [/\bxrp\b|ریپل|ripple/i, 'XRPUSDT'],
    [/\bdoge\b|دوج\s*کوین|دوجکوین/i, 'DOGEUSDT'],
    [/\bada\b|کاردانو|cardano/i, 'ADAUSDT'],
    [/\bavax\b|آوالانچ/i, 'AVAXUSDT'],
    [/\bsui\b|سویی/i, 'SUIUSDT'],
    [/\btrx\b|ترون|tron/i, 'TRXUSDT'],
    [/\blink\b|چین\s*لینک/i, 'LINKUSDT'],
    [/\bpepe\b|پپه/i, 'PEPEUSDT'],
    [/\bshib\b|شیبا/i, 'SHIBUSDT'],
    [/\bdot\b|پولکادات/i, 'DOTUSDT'],
    [/\bltc\b|لایت\s*کوین/i, 'LTCUSDT'],
    [/\barb\b|آربیتروم/i, 'ARBUSDT'],
    [/\bop\b|اپتیمیسم/i, 'OPUSDT'],
  ];
  for (const [re, sym] of aliasMap) {
    if (re.test(lower)) return sym;
  }
  const explicitUsdt = text.match(/\b([A-Za-z]{2,8})USDT\b/i);
  if (explicitUsdt?.[1]) return `${explicitUsdt[1].toUpperCase()}USDT`;
  return null;
}

function detectTimeframeFromQuery(text: string): Timeframe {
  if (/\b1m\b|۱\s*دقیق|یک\s*دقیق/i.test(text)) return '1m';
  if (/\b5m\b|۵\s*دقیق|پنج\s*دقیق/i.test(text)) return '5m';
  if (/\b30m\b|۳۰\s*دقیق|نیم\s*ساعت/i.test(text)) return '30m';
  if (/\b1h\b|۱\s*ساعت|یک\s*ساعت/i.test(text)) return '1h';
  if (/\b4h\b|۴\s*ساعت|چهار\s*ساعت/i.test(text)) return '4h';
  if (/\b1d\b|روزانه/i.test(text)) return '1d';
  return '15m';
}

function fmtPriceSmart(v: number): string {
  if (!Number.isFinite(v) || v <= 0) return '0';
  if (v >= 1000) return v.toFixed(2);
  if (v >= 1) return v.toFixed(4);
  if (v >= 0.01) return v.toFixed(5);
  return v.toFixed(7);
}

function toEnglishDigits(input: string): string {
  return input
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

async function buildBuiltInLiveAIResponse(
  env: Env,
  userText: string,
  opts: { hasImage: boolean; isEn: boolean }
): Promise<string> {
  const { hasImage, isEn } = opts;
  const normalized = toEnglishDigits(userText);
  const lower = normalized.toLowerCase();

  // 1) Creator / Designer Inquiry
  if (/سازند|طراح|توسعه\s*دهنده|مالک|کی\s*ساخته|آوید|avid|creator|founder|who\s*built|developer/i.test(lower)) {
    return isEn
      ? `👨‍💻 **Creator & Lead Architect of Dollarino:** **${DOLLARINO_CREATOR_INFO.nameEn} (${DOLLARINO_CREATOR_INFO.nameFa})**\n\n` +
          `• Telegram: ${DOLLARINO_CREATOR_INFO.telegram} (${DOLLARINO_CREATOR_INFO.telegramUrl})\n` +
          `• Instagram: ${DOLLARINO_CREATOR_INFO.instagram} (${DOLLARINO_CREATOR_INFO.instagramUrl})\n` +
          `• X (Twitter): ${DOLLARINO_CREATOR_INFO.twitter} (${DOLLARINO_CREATOR_INFO.twitterUrl})\n\n` +
          `Dollarino combines multi-LLM AI consensus, non-repainting Dorna V1 / KBOS quant strategies, verified copy trading, and multi-chain Trust Wallet DEX execution inside both Web and Telegram.`
      : `👨‍💻 پلتفرم **دلارینو (Dollarino)** توسط **${DOLLARINO_CREATOR_INFO.nameFa} (${DOLLARINO_CREATOR_INFO.nameEn})** طراحی و توسعه داده شده است.\n\n` +
          `📱 **راه‌های ارتباطی رسمی سازنده:**\n` +
          `• **تلگرام:** ${DOLLARINO_CREATOR_INFO.telegram} (${DOLLARINO_CREATOR_INFO.telegramUrl})\n` +
          `• **اینستاگرام:** ${DOLLARINO_CREATOR_INFO.instagram} (${DOLLARINO_CREATOR_INFO.instagramUrl})\n` +
          `• **توییتر (X):** ${DOLLARINO_CREATOR_INFO.twitter} (${DOLLARINO_CREATOR_INFO.twitterUrl})\n\n` +
          `دلارینو شامل موتور ترید هوشمند ۲۴/۷، هوش مصنوعی تحلیل چارت، استراتژی شکار دُرنا V1، کپی‌ترید تاییدشده و رادار DEX متصل به Toobit، Bitunix، KCEX و Trust Wallet است.`;
  }

  // 2) Pine Script / Strategy Code request
  if (/pine\s*script|پاین\s*اسکریپت|کد\s*استراتژ|tradingview\s*code|نوشتن\s*استراتژ/i.test(lower)) {
    return isEn
      ? `Here is a clean, non-repainting **Pine Script v5** strategy (EMA 9/21 + RSI 14 + ATR Stop/TP) ready to paste into TradingView or Dollarino Strategy Lab:\n\n` +
          `\`\`\`pinescript\n//@version=5\nstrategy("Dollarino EMA+RSI Quant", overlay=true, default_qty_type=strategy.percent_of_equity, default_qty_value=10)\nfastEma = ta.ema(close, 9)\nslowEma = ta.ema(close, 21)\nrsiVal  = ta.rsi(close, 14)\natrVal  = ta.atr(14)\n\nlongCond  = ta.crossover(fastEma, slowEma) and rsiVal > 50 and rsiVal < 70\nshortCond = ta.crossunder(fastEma, slowEma) and rsiVal < 50 and rsiVal > 30\n\nif (longCond)\n    strategy.entry("LONG", strategy.long)\n    strategy.exit("L-Exit", "LONG", stop=close - atrVal * 1.8, limit=close + atrVal * 3.6)\n\nif (shortCond)\n    strategy.entry("SHORT", strategy.short)\n    strategy.exit("S-Exit", "SHORT", stop=close + atrVal * 1.8, limit=close - atrVal * 3.6)\n\`\`\`\n\nYou can also paste or customize this directly in the **Radar & Custom IDE** tab and backtest 900 live candles!`
      : `🧠 این یک استراتژی غیرریپینت و آماده به نام **EMA 9/21 + RSI + حد ضرر ATR** به زبان **Pine Script v5** است که می‌توانید در TradingView یا در بخش **«رادار و استراتژی شخصی»** دلارینو اجرا و بک‌تست بگیرید:\n\n` +
          `\`\`\`pinescript\n//@version=5\nstrategy("Dollarino EMA+RSI Quant", overlay=true, default_qty_type=strategy.percent_of_equity, default_qty_value=10)\nfastEma = ta.ema(close, 9)\nslowEma = ta.ema(close, 21)\nrsiVal  = ta.rsi(close, 14)\natrVal  = ta.atr(14)\n\nlongCond  = ta.crossover(fastEma, slowEma) and rsiVal > 50 and rsiVal < 70\nshortCond = ta.crossunder(fastEma, slowEma) and rsiVal < 50 and rsiVal > 30\n\nif (longCond)\n    strategy.entry("LONG", strategy.long)\n    strategy.exit("L-Exit", "LONG", stop=close - atrVal * 1.8, limit=close + atrVal * 3.6)\n\nif (shortCond)\n    strategy.entry("SHORT", strategy.short)\n    strategy.exit("S-Exit", "SHORT", stop=close + atrVal * 1.8, limit=close - atrVal * 3.6)\n\`\`\`\n\n💡 در تب **رادار و استراتژی شخصی** (یا بخش **هوش مصنوعی من** با گفتگو) می‌توانید پارامترهای این استراتژی را تغییر دهید و روی ۹۰۰ کندل زنده بک‌تست فوری بگیرید.`;
  }

  // 3) Risk & Position Sizing Calculator
  if (/ریسک|حجم|مدیریت\s*سرمایه|چقدر\s*بخر|position\s*siz|risk\s*manage|capital|سرمایه/i.test(lower)) {
    const nums = (normalized.match(/\d+(?:\.\d+)?/g) || []).map(Number).filter((n) => n > 0);
    const capital = nums.find((n) => n >= 20) || 500;
    const riskPct = nums.find((n) => n > 0 && n <= 15 && n !== capital) || 2;
    const stopPct = 2.0;
    const riskUsd = (capital * riskPct) / 100;
    const notional = riskUsd / (stopPct / 100);
    return isEn
      ? `🛡 **Smart Position Sizing Calculation** (Capital: **$${capital}** · Risk: **${riskPct}%** · Assumed SL: **${stopPct}%**):\n\n` +
          `• **Max Risk per Trade:** \`$${riskUsd.toFixed(2)}\`\n` +
          `• **Total Position Size (Notional):** \`$${notional.toFixed(0)}\`\n` +
          `• **Suggested Margin & Leverage:** \`$${(notional / 5).toFixed(0)}\` at **5x** (or \`$${(notional / 10).toFixed(0)}\` at **10x**)\n\n` +
          `📌 **Golden Rule:** Never risk more than 1–2% per trade and keep auto-breakeven enabled at TP1.`
      : `🛡 **محاسبه هوشمند حجم و مدیریت ریسک** (بر اساس سرمایه **$${capital}** و ریسک **${riskPct}%** با حد ضرر فرضی **${stopPct}%**):\n\n` +
          `• **حداکثر ریسک مجاز در هر معامله:** \`$${riskUsd.toFixed(2)}\`\n` +
          `• **ارزش کل پوزیشن (Notional Size):** \`$${notional.toFixed(0)}\`\n` +
          `• **پیشنهاد مارجین و اهرم:** با اهرم **5x** حدود \`$${(notional / 5).toFixed(0)}\` مارجین (یا با اهرم **10x** حدود \`$${(notional / 10).toFixed(0)}\` مارجین)\n\n` +
          `✅ اگر فاصله حد ضررتان بیشتر یا کمتر از ${stopPct}٪ است، فقط درصد حد ضرر را بگویید تا حجم دقیق همان معامله را محاسبه کنم.`;
  }

  // 4) Live Market Analysis & Setup Generator (when symbol or market analysis/signal is requested)
  const detectedSymbol = detectSymbolFromQuery(normalized);
  const asksAnalysis =
    Boolean(detectedSymbol) ||
    /تحلیل|روند|سیگنال|ستاپ|بازار|قیمت|پوزیشن|لانگ|شورت|چارت|analy|trend|signal|setup|market|price|long|short|chart/i.test(
      lower
    );

  if (asksAnalysis) {
    const symbol = detectedSymbol || 'BTCUSDT';
    const tf = detectTimeframeFromQuery(normalized);
    const proxyCfg = env.TOOBIT_PROXY_URL
      ? { proxyUrl: env.TOOBIT_PROXY_URL, proxySecret: env.EXCHANGE_PROXY_SECRET }
      : undefined;

    const [ticker, candles] = await Promise.all([
      fetchPublicMarket24h(symbol, proxyCfg).catch(() => null),
      fetchPublicKlines(symbol, tf, 90, proxyCfg).catch(() => []),
    ]);

    const lastClose = candles.length ? candles[candles.length - 1]!.close : 0;
    const price = Number(ticker?.lastPrice || lastClose || 0);
    const change24 = Number(ticker?.changePct24h || 0);

    if (price > 0) {
      const closes = candles.map((c) => c.close);
      const e20Arr = closes.length >= 22 ? ema(closes, 20) : [];
      const e50Arr = closes.length >= 52 ? ema(closes, 50) : [];
      const r14Arr = closes.length >= 16 ? rsi(closes, 14) : [];
      const a14Arr = candles.length >= 16 ? atr(candles, 14) : [];

      const e20 = e20Arr[e20Arr.length - 1] || price;
      const e50 = e50Arr[e50Arr.length - 1] || price;
      const rsi14 = r14Arr[r14Arr.length - 1] || (change24 >= 0 ? 56 : 44);
      const atr14 = a14Arr[a14Arr.length - 1] || price * 0.012;

      const isBullish = (e20 >= e50 && rsi14 >= 48) || (change24 > 0.8 && rsi14 < 72);
      const dir: 'LONG' | 'SHORT' = isBullish ? 'LONG' : 'SHORT';
      const riskDist = Math.max(atr14 * 1.65, price * 0.008);

      const entry = fmtPriceSmart(price);
      const sl = fmtPriceSmart(dir === 'LONG' ? price - riskDist : price + riskDist);
      const tp1 = fmtPriceSmart(dir === 'LONG' ? price + riskDist * 1.2 : price - riskDist * 1.2);
      const tp2 = fmtPriceSmart(dir === 'LONG' ? price + riskDist * 2.2 : price - riskDist * 2.2);
      const tp3 = fmtPriceSmart(dir === 'LONG' ? price + riskDist * 3.4 : price - riskDist * 3.4);

      const supports = candles.length >= 20 ? Math.min(...candles.slice(-24).map((c) => c.low)) : price * 0.98;
      const resistances = candles.length >= 20 ? Math.max(...candles.slice(-24).map((c) => c.high)) : price * 1.02;
      const conf = Math.min(86, Math.max(58, Math.round(62 + Math.abs(rsi14 - 50) * 0.6)));
      const lev = price >= 1000 ? 8 : 5;

      const imageNoteFa = hasImage
        ? `\n> 👁️ **نکته تصویر:** تصویر چارت شما دریافت شد؛ برای اسکن خودکار خطوط و الگوهای روی تصویر توسط مدل بینایی، می‌توانید یک مدل Vision (مثل **GPT-4o** یا **Gemini 2.0 Flash**) در اتصالات اضافه کنید. بر اساس نماد **${symbol}** تحلیل لحظه‌ای زیر آماده شد:\n`
        : '';

      const replyBody = isEn
        ? `📊 **Live Market Analysis — ${symbol} (${tf})**\n` +
          `• **Current Price:** \`$${entry}\` (**24h:** ${change24 >= 0 ? '+' : ''}${change24.toFixed(2)}%)\n` +
          `• **Trend & Momentum:** EMA20 \`${fmtPriceSmart(e20)}\` vs EMA50 \`${fmtPriceSmart(e50)}\` · **RSI(14):** \`${rsi14.toFixed(1)}\`\n` +
          `• **Key Levels:** Support \`${fmtPriceSmart(supports)}\` · Resistance \`${fmtPriceSmart(resistances)}\`\n\n` +
          `🎯 **${dir} Setup:** Entry \`${entry}\` | SL \`${sl}\` | TP1 \`${tp1}\` | TP2 \`${tp2}\` | TP3 \`${tp3}\` (R:R 1:2.2)`
        : `📊 **تحلیل لحظه‌ای زنده — ${symbol} (تایم‌فریم ${tf})**${imageNoteFa}\n` +
          `• **قیمت فعلی:** \`$${entry}\` (**تغییر ۲۴ ساعته:** ${change24 >= 0 ? `+${change24.toFixed(2)}%` : `${change24.toFixed(2)}%`})\n` +
          `• **روند و مومنتوم:** EMA20 (\`${fmtPriceSmart(e20)}\`) نسبت به EMA50 (\`${fmtPriceSmart(e50)}\`) ${e20 >= e50 ? 'صعودی' : 'نزولی'} · **RSI(14):** \`${rsi14.toFixed(1)}\`\n` +
          `• **حمایت و مقاومت نزدیک:** حمایت \`$${fmtPriceSmart(supports)}\` · مقاومت \`$${fmtPriceSmart(resistances)}\`\n\n` +
          `🎯 **ستاپ معاملاتی پیشنهادی (${dir}):**\n` +
          `ورود: \`${entry}\` | حد ضرر: \`${sl}\` | تارگت‌ها: \`${tp1}\` / \`${tp2}\` / \`${tp3}\`\n` +
          `⚠️ مدیریت ریسک را رعایت کنید و پس از تارگت اول حد ضرر را روی نقطه ورود (Risk-Free) قرار دهید.`;

      const setupObj: ExtractedChartSetup = {
        symbol,
        direction: dir,
        timeframe: tf,
        entry,
        stopLoss: sl,
        tp1,
        tp2,
        tp3,
        leverage: lev,
        rrRatio: '1:2.2',
        confidence: conf,
        note: `تحلیل زنده ${symbol} (${tf})`,
      };

      return `${replyBody}\n<<<SETUP_JSON>>>${JSON.stringify(setupObj)}<<<END_SETUP_JSON>>>`;
    }
  }

  // 5) Image uploaded without external Vision model & without explicit coin name
  if (hasImage) {
    return isEn
      ? `📸 I received your chart screenshot! Currently no external Vision LLM key (such as **GPT-4o**, **Gemini 2.0 Flash**, or **Claude 3.5 Sonnet**) is active.\n\n` +
          `✅ **Quick Options:**\n` +
          `1. Add a Vision model API key in **Connections / Admin Panel** to enable pixel-level screenshot inspection.\n` +
          `2. Or simply type the coin & timeframe (e.g., **"Analyze BTC 15m"** or **"SOL 1h setup"**) and I will compute real-time live candles + Entry/SL/TP1-3 right now!`
      : `📸 **تصویر چارت شما با موفقیت دریافت شد!**\n` +
          `در حال حاضر فقط مدل زنده متنی فعال است و هیچ مدل دارای قابلیت بینایی تصویر (**Vision** مثل **GPT-4o**، **Gemini 2.0 Flash** یا **Claude 3.5 Sonnet**) در پنل ادمین یا اتصالات شخصی متصل نشده است.\n\n` +
          `✅ **همین الان دو راه سریع دارید:**\n` +
          `• **روش ۱ (فوری همین‌جا):** نام ارز و تایم‌فریم چارت را بنویسید (مثلاً **«تحلیل BTC 15m»** یا **«ستاپ SOL 1h»**) تا همین لحظه از کندل‌های زنده بازار برایتان تحلیل کامل و ستاپ عددی **Entry / SL / TP1-3** بسازم!\n` +
          `• **روش ۲:** یک کلید API دارای Vision در بخش اتصالات یا پنل مدیریت ثبت کنید تا مستقیم خطوط روی عکس اسکرین‌شات خوانده شوند.`;
  }

  // 6) Exchange / Wallet / Platform guidance
  if (/toobit|bitunix|kcex|trust|wallet|dex|صرافی|کیف\s*پول|تراست|کپی\s*ترید|اشتراک|ربات|تلگرام/i.test(lower)) {
    return isEn
      ? `🤖 **Dollarino Platform Guide:**\n` +
          `• **Exchanges:** Connect **Toobit**, **Bitunix**, or **KCEX** with Trade-only API keys (keep Withdraw OFF) or start risk-free in **Paper Mode**.\n` +
          `• **Trust Wallet & DEX:** Add your public wallet address (EVM / Solana / TRON) in **Trust Wallet & DEX** and scan trending tokens via **DexScreener Radar**.\n` +
          `• **4 Trading Engines:** Central Multi-AI, My Personal AI, Hunting Strategy (Dorna V1 / Pine Script), and Verified Copy Trade.\n` +
          `• **Telegram Bot:** \`@Dollarino_bot\` & Official Channel \`@Dollarino_official\`.\n` +
          `• **Creator:** ${DOLLARINO_CREATOR_INFO.nameEn} (${DOLLARINO_CREATOR_INFO.telegram})`
      : `🤖 **راهنمای کامل امکانات دلارینو:**\n\n` +
          `• **اتصال صرافی‌ها:** پشتیبانی از **Toobit**، **Bitunix** و **KCEX** با کلید API فقط با دسترسی معامله (بدون دسترسی برداشت) + حالت آزمایشی **Paper Mode** با قیمت لحظه‌ای.\n` +
          `• **کیف‌پول Trust Wallet و رادار DEX:** ثبت آدرس عمومی (EVM / Solana / TRON) بدون نیاز به ۱۲ کلمه و اسکن توکن‌های داغ در DexScreener.\n` +
          `• **۴ موتور معاملاتی هوشمند:** هوش مصنوعی مرکزی، هوش مصنوعی شخصی خام، استراتژی شکار دُرنا V1 / کدنویسی شخصی و کپی‌ترید تاییدشده.\n` +
          `• **چت و تحلیل بازار زنده:** اسم هر ارزی مثل **«تحلیل BTC»** یا **«ستاپ SOL 1h»** را همین‌جا بفرستید تا قیمت لحظه‌ای و Entry/SL/TP به شما بدهم!\n\n` +
          `👨‍💻 سازنده پروژه: **${DOLLARINO_CREATOR_INFO.nameFa}** (${DOLLARINO_CREATOR_INFO.telegram})`;
  }

  // 7) Natural conversational welcome & general assistant response
  return isEn
    ? `👋 Hello! I am **Dollarino Live AI**, ready to help you right now.\n\n` +
        `Try asking me:\n` +
        `• **"Analyze BTC 15m"** or **"SOL 1h setup"** for live market price & Entry/SL/TP1-3\n` +
        `• **"Calculate position size for $500 with 2% risk"**\n` +
        `• **"Write an EMA + RSI Pine Script strategy"**\n` +
        `• Or ask anything about Dollarino, Toobit/Bitunix/KCEX, Trust Wallet DEX, or creator **${DOLLARINO_CREATOR_INFO.nameEn}**!`
    : `👋 سلام! **هوش مصنوعی دلارینو** کاملاً فعال و آماده پاسخ‌گویی به شماست.\n\n` +
        `همین الان می‌توانید هر کدام از این موارد را از من بخواهید:\n` +
        `• 📊 **تحلیل لحظه‌ای و ستاپ معاملاتی هر ارز:** مثلاً بنویسید *«تحلیل بیت‌کوین»* یا *«ستاپ SOL 15m»*\n` +
        `• 🛡 **محاسبه حجم و مدیریت ریسک:** مثلاً *«با ۵۰۰ دلار و ۲٪ ریسک چقدر حجم بگیرم؟»*\n` +
        `• 🧠 **نوشتن کد استراتژی:** مثلاً *«کد Pine Script استراتژی EMA و RSI بنویس»*\n` +
        `• ⚙️ **راهنمای اتصال صرافی، Trust Wallet DEX، ربات تلگرام و آشنایی با سازنده (${DOLLARINO_CREATOR_INFO.nameFa})**`;
}

async function executeAIWithFailover(
  env: Env,
  params: {
    userId?: string;
    requestedModelId?: string | null;
    systemPrompt: string;
    history: Array<{ role: 'user' | 'assistant'; content: string }>;
    userText: string;
    imageDataUrl?: string | null;
    hasImage: boolean;
    isEn: boolean;
  }
): Promise<{
  rawReply: string;
  modelId: string;
  modelLabel: string;
  provider: AIProviderId;
  modelName: string;
  usedVision: boolean;
  visionFallbackNotice?: string;
}> {
  const { models } = await listSelectableAIModels(env, params.userId);
  const requestedId = params.requestedModelId?.trim();
  const orderedIds: string[] = [];

  if (requestedId && models.some((m) => m.id === requestedId)) {
    orderedIds.push(requestedId);
  }
  if (params.hasImage) {
    for (const m of models) {
      if (m.supportsVision && !orderedIds.includes(m.id)) orderedIds.push(m.id);
    }
  }
  for (const m of models) {
    if (!orderedIds.includes(m.id)) orderedIds.push(m.id);
  }

  let visionFallbackNotice: string | undefined;
  const requestedMeta = requestedId ? models.find((m) => m.id === requestedId) : undefined;

  if (requestedId !== 'dollarino-live-ai') {
    for (const candId of orderedIds) {
      if (candId === 'dollarino-live-ai') continue;

      if (candId === 'cf-workers-ai' && env.AI) {
        try {
          const cfRes = (await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
            messages: [
              { role: 'system', content: params.systemPrompt },
              ...params.history.slice(-8),
              { role: 'user', content: params.userText },
            ],
          })) as { response?: string };
          const text = String(cfRes?.response || '').trim();
          if (text) {
            return {
              rawReply: text,
              modelId: 'cf-workers-ai',
              modelLabel: 'Cloudflare Workers AI',
              provider: 'openai_compatible',
              modelName: '@cf/meta/llama-3.1-8b-instruct',
              usedVision: false,
            };
          }
        } catch {
          continue;
        }
      }

      const resolved = await resolveModelRecordById(env, params.userId, candId).catch((err) => {
        console.warn('[AI resolve error]', candId, err instanceof Error ? err.message : String(err));
        return null;
      });
      if (!resolved) {
        console.warn('[AI resolve null]', candId);
        continue;
      }

      // Avoid calling non-vision external APIs with image payload if a vision model might still be tested
      if (params.hasImage && !resolved.meta.supportsVision) {
        continue;
      }

      try {
        const reply = await callMultimodalChatAI(
          resolved.record,
          params.systemPrompt,
          params.history,
          params.userText,
          params.hasImage ? params.imageDataUrl : null
        );
        if (reply && reply.trim()) {
          if (params.hasImage && requestedMeta && !requestedMeta.supportsVision && resolved.meta.id !== requestedMeta.id) {
            visionFallbackNotice = `مدل ${requestedMeta.label} فقط متنی بود؛ برای تحلیل تصویر چارت از مدل ویژن **${resolved.meta.label}** استفاده شد.`;
          }
          return {
            rawReply: reply,
            modelId: resolved.meta.id,
            modelLabel: resolved.meta.label,
            provider: resolved.meta.provider,
            modelName: resolved.meta.model,
            usedVision: Boolean(params.hasImage),
            visionFallbackNotice,
          };
        }
        console.warn('[AI empty reply]', candId, resolved.record.model);
      } catch (err) {
        console.warn('[AI gateway failover]', candId, resolved.record.model, err instanceof Error ? err.message : String(err));
      }
    }

    // If image was sent and all vision-capable models failed/absent, try text-only external model if user asked a text question alongside
    if (!params.hasImage) {
      // already tried all external models above
    }
  }

  // Always-On Live Built-in Fallback (Zero-Downtime Guarantee)
  const fallbackReply = await buildBuiltInLiveAIResponse(env, params.userText, {
    hasImage: params.hasImage,
    isEn: params.isEn,
  });

  return {
    rawReply: fallbackReply,
    modelId: 'dollarino-live-ai',
    modelLabel: 'هوش مصنوعی زنده دلارینو',
    provider: 'deepseek',
    modelName: 'dollarino-live-quant-v1',
    usedVision: false,
    visionFallbackNotice,
  };
}

export async function runDedicatedAIChat(
  env: Env,
  params: {
    userId: string;
    sessionId?: string | null;
    modelId?: string | null;
    message: string;
    imageDataUrl?: string | null;
    history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  }
): Promise<AssistantChatResult & { sessionId: string }> {
  const rawMessage = (params.message || '').trim();
  const hasImage = Boolean(params.imageDataUrl && params.imageDataUrl.startsWith('data:image/'));
  const userText =
    rawMessage ||
    (hasImage
      ? 'لطفاً این تصویر چارت را به‌صورت کامل و حرفه‌ای تحلیل کن؛ روند، سطوح حمایت و مقاومت، ساختار بازار و یک ستاپ معاملاتی دقیق با نقطه ورود، حد ضرر، TP1/TP2/TP3 و نسبت ریسک به ریوارد پیشنهاد بده.'
      : 'سلام!');

  const isEn = !/[\u0600-\u06FF]/.test(userText) && /[a-zA-Z]{4,}/.test(userText) && !hasImage;

  let sessionId = (params.sessionId || '').trim();
  if (sessionId) {
    const own = await env.DB.prepare(`SELECT id FROM ai_chat_sessions WHERE id = ? AND user_id = ? LIMIT 1`)
      .bind(sessionId, params.userId)
      .first<{ id: string }>()
      .catch(() => null);
    if (!own) sessionId = '';
  }
  if (!sessionId) {
    sessionId = randomId('aichat');
    const title = (hasImage ? `📊 ${userText}` : userText).slice(0, 48) || 'گفتگوی هوش مصنوعی';
    await env.DB.prepare(`INSERT INTO ai_chat_sessions (id, user_id, title, model_id) VALUES (?, ?, ?, ?)`)
      .bind(sessionId, params.userId, title, params.modelId || null)
      .run()
      .catch(() => {});
  }

  let history = params.history ?? [];
  if (!history.length) {
    const rows = await env.DB.prepare(
      `SELECT role, content FROM ai_chat_messages WHERE session_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 10`
    )
      .bind(sessionId, params.userId)
      .all<{ role: 'user' | 'assistant'; content: string }>()
      .catch(() => ({ results: [] }));
    history = [...(rows.results ?? [])].reverse();
  }

  const systemPrompt = buildDedicatedSystemPrompt(hasImage, isEn ? 'en' : 'fa');
  const outcome = await executeAIWithFailover(env, {
    userId: params.userId,
    requestedModelId: params.modelId,
    systemPrompt,
    history,
    userText,
    imageDataUrl: params.imageDataUrl,
    hasImage,
    isEn,
  });

  const { cleanReply, setup } = extractChartSetupFromReply(outcome.rawReply);

  const userMsgId = randomId('aim');
  const botMsgId = randomId('aim');
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO ai_chat_messages (id, session_id, user_id, role, content, has_image, model_id, model_label)
       VALUES (?, ?, ?, 'user', ?, ?, ?, ?)`
    ).bind(
      userMsgId,
      sessionId,
      params.userId,
      userText.slice(0, 8000),
      hasImage ? 1 : 0,
      outcome.modelId,
      outcome.modelLabel
    ),
    env.DB.prepare(
      `INSERT INTO ai_chat_messages (id, session_id, user_id, role, content, has_image, model_id, model_label, setup_json)
       VALUES (?, ?, ?, 'assistant', ?, 0, ?, ?, ?)`
    ).bind(
      botMsgId,
      sessionId,
      params.userId,
      cleanReply.slice(0, 14000),
      outcome.modelId,
      outcome.modelLabel,
      setup ? JSON.stringify(setup) : null
    ),
    env.DB.prepare(`UPDATE ai_chat_sessions SET model_id = ?, updated_at = datetime('now') WHERE id = ?`).bind(
      outcome.modelId,
      sessionId
    ),
  ]).catch(() => {});

  return {
    sessionId,
    reply: cleanReply,
    modelId: outcome.modelId,
    modelLabel: outcome.modelLabel,
    provider: outcome.provider,
    modelName: outcome.modelName,
    usedVision: outcome.usedVision,
    visionFallbackNotice: outcome.visionFallbackNotice,
    setup,
  };
}

export async function runPublicGuestAIChat(
  env: Env,
  params: {
    modelId?: string | null;
    message: string;
    imageDataUrl?: string | null;
    history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  }
): Promise<AssistantChatResult & { sessionId: string }> {
  const rawMessage = (params.message || '').trim();
  const hasImage = Boolean(params.imageDataUrl && params.imageDataUrl.startsWith('data:image/'));
  const userText =
    rawMessage ||
    (hasImage
      ? 'لطفاً این تصویر چارت را به‌صورت کامل و حرفه‌ای تحلیل کن؛ روند، سطوح حمایت و مقاومت و یک ستاپ معاملاتی دقیق پیشنهاد بده.'
      : 'سلام!');
  const isEn = !/[\u0600-\u06FF]/.test(userText) && /[a-zA-Z]{4,}/.test(userText) && !hasImage;

  const systemPrompt = buildDedicatedSystemPrompt(hasImage, isEn ? 'en' : 'fa');
  const outcome = await executeAIWithFailover(env, {
    requestedModelId: params.modelId,
    systemPrompt,
    history: (params.history ?? []).slice(-8),
    userText,
    imageDataUrl: params.imageDataUrl,
    hasImage,
    isEn,
  });

  const { cleanReply, setup } = extractChartSetupFromReply(outcome.rawReply);
  return {
    sessionId: 'public-guest',
    reply: cleanReply,
    modelId: outcome.modelId,
    modelLabel: outcome.modelLabel,
    provider: outcome.provider,
    modelName: outcome.modelName,
    usedVision: outcome.usedVision,
    visionFallbackNotice: outcome.visionFallbackNotice,
    setup,
  };
}
