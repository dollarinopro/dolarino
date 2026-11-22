export type ReplyKeyboardButton = {
  text: string;
  web_app?: { url: string };
  request_contact?: boolean;
};
export type InlineKeyboardButton = {
  text: string;
  callback_data?: string;
  url?: string;
  web_app?: { url: string };
  style?: 'primary' | 'success' | 'danger';
};

export function stripButtonStyles(markup: unknown): unknown {
  if (!markup || typeof markup !== 'object') return markup;
  const obj = markup as Record<string, unknown>;
  if (!Array.isArray(obj.inline_keyboard)) return markup;
  return {
    ...obj,
    inline_keyboard: obj.inline_keyboard.map((row) =>
      Array.isArray(row)
        ? row.map((btn) => {
            if (!btn || typeof btn !== 'object') return btn;
            const { style: _style, ...rest } = btn as Record<string, unknown>;
            return rest;
          })
        : row
    ),
  };
}

export function escapeTelegramHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function formatTelegramHtml(raw: string): string {
  const normalized = raw.replace(/\\n/g, '\n');
  const escaped = escapeTelegramHtml(normalized);
  return escaped
    .replace(/\*\*([^\n*]+?)\*\*/g, '<b>$1</b>')
    .replace(/`([^\n`]+?)`/g, '<code>$1</code>');
}

export function stripMarkdownSyntax(raw: string): string {
  return raw
    .replace(/\\n/g, '\n')
    .replace(/\*\*([^\n*]+?)\*\*/g, '$1')
    .replace(/`([^\n`]+?)`/g, '$1');
}

export function stripTelegramHtmlTags(html: string): string {
  return html
    .replace(/<\/?(b|code|i|u|s|pre)>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

export class TelegramBotClient {
  constructor(private token: string) {}

  private async call<T = unknown>(method: string, body: Record<string, unknown>): Promise<T> {
    const res = await fetch(`https://api.telegram.org/bot${this.token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12_000),
    });
    const json = await res.json() as { ok: boolean; result?: T; description?: string };
    if (!json.ok && body.parse_mode && /parse|entit|tag/i.test(json.description ?? '')) {
      const cleanBody: Record<string, unknown> = { ...body };
      delete cleanBody.parse_mode;
      if (typeof cleanBody.text === 'string') cleanBody.text = stripTelegramHtmlTags(cleanBody.text);
      if (typeof cleanBody.caption === 'string') cleanBody.caption = stripTelegramHtmlTags(cleanBody.caption);
      const retryPlain = await fetch(`https://api.telegram.org/bot${this.token}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cleanBody),
        signal: AbortSignal.timeout(12_000),
      });
      const retryJson = await retryPlain.json() as { ok: boolean; result?: T; description?: string };
      if (!retryJson.ok) {
        throw new Error(`Telegram ${method} failed: ${retryJson.description ?? retryPlain.status}`);
      }
      return retryJson.result as T;
    }
    if (!json.ok && body.reply_markup && /style|button|markup|field/i.test(json.description ?? '')) {
      const retryRes = await fetch(`https://api.telegram.org/bot${this.token}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, reply_markup: stripButtonStyles(body.reply_markup) }),
        signal: AbortSignal.timeout(12_000),
      });
      const retryJson = await retryRes.json() as { ok: boolean; result?: T; description?: string };
      if (!retryJson.ok) {
        throw new Error(`Telegram ${method} failed: ${retryJson.description ?? retryRes.status}`);
      }
      return retryJson.result as T;
    }
    if (!json.ok) {
      throw new Error(`Telegram ${method} failed: ${json.description ?? res.status}`);
    }
    return json.result as T;
  }

  getMe() {
    return this.call<{ id: number; username: string; first_name: string }>('getMe', {});
  }

  getUserProfilePhotos(userId: string | number, limit = 1) {
    return this.call<{
      total_count: number;
      photos: Array<Array<{ file_id: string; file_unique_id: string; width: number; height: number }>>;
    }>('getUserProfilePhotos', {
      user_id: Number(userId),
      limit,
    });
  }

  getFile(fileId: string) {
    return this.call<{ file_id: string; file_unique_id: string; file_size?: number; file_path?: string }>('getFile', {
      file_id: fileId,
    });
  }

  async downloadFileAsDataUrl(fileId: string, maxBytes = 4_500_000): Promise<{ dataUrl: string; mimeType: string }> {
    const file = await this.getFile(fileId);
    if (!file.file_path) {
      throw new Error('Telegram file_path unavailable');
    }
    if (file.file_size && file.file_size > maxBytes) {
      throw new Error('حجم تصویر ارسالی بیش از ۴.۵ مگابایت است. لطفاً عکس سبک‌تری بفرستید.');
    }
    const url = `https://api.telegram.org/file/bot${this.token}/${file.file_path}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) {
      throw new Error(`Telegram file download failed: HTTP ${res.status}`);
    }
    const buf = await res.arrayBuffer();
    if (buf.byteLength > maxBytes) {
      throw new Error('حجم تصویر بیش از حد مجاز است.');
    }
    const bytes = new Uint8Array(buf);
    const lowerPath = file.file_path.toLowerCase();
    const mimeType = lowerPath.endsWith('.png')
      ? 'image/png'
      : lowerPath.endsWith('.webp')
        ? 'image/webp'
        : 'image/jpeg';

    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const slice = bytes.subarray(i, i + chunkSize);
      let chunkStr = '';
      for (let j = 0; j < slice.length; j++) {
        chunkStr += String.fromCharCode(slice[j]!);
      }
      binary += chunkStr;
    }
    const b64 = btoa(binary);
    return {
      dataUrl: `data:${mimeType};base64,${b64}`,
      mimeType,
    };
  }

  getChat(chatId: string | number) {
    return this.call<{ id: number; title?: string; username?: string; type: string }>('getChat', {
      chat_id: chatId,
    });
  }

  getChatMember(chatId: string | number, userId: number) {
    return this.call<{
      status: 'creator' | 'administrator' | 'member' | 'restricted' | 'left' | 'kicked';
      can_post_messages?: boolean;
      can_edit_messages?: boolean;
    }>('getChatMember', {
      chat_id: chatId,
      user_id: userId,
    });
  }

  async checkChannelAdminReadiness(channelHandle: string): Promise<{
    ok: boolean;
    botUsername?: string;
    channelTitle?: string;
    status?: string;
    canPostMessages?: boolean;
    error?: string;
  }> {
    try {
      const me = await this.getMe();
      const chat = await this.getChat(channelHandle);
      const member = await this.getChatMember(channelHandle, me.id);
      const isAdmin = member.status === 'creator' || member.status === 'administrator';
      const canPost = member.status === 'creator' || member.can_post_messages !== false;
      return {
        ok: isAdmin && canPost,
        botUsername: me.username,
        channelTitle: chat.title || channelHandle,
        status: member.status,
        canPostMessages: canPost,
        error: isAdmin
          ? canPost
            ? undefined
            : 'ربات ادمین کانال هست ولی دسترسی ارسال پیام (Post Messages) ندارد.'
          : `ربات @${me.username} هنوز در کانال ${channelHandle} ادمین نشده است (وضعیت: ${member.status}).`,
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  setWebhook(url: string, secretToken?: string) {
    return this.call('setWebhook', {
      url,
      secret_token: secretToken,
      allowed_updates: ['message', 'callback_query', 'channel_post'],
    });
  }

  getWebhookInfo() {
    return this.call<{ url: string; pending_update_count: number; last_error_message?: string }>('getWebhookInfo', {});
  }

  setMyCommands(commands: Array<{ command: string; description: string }>) {
    return this.call('setMyCommands', { commands });
  }

  setChatMenuButton(webAppUrl: string, text = 'پنل دلارینو') {
    return this.call('setChatMenuButton', {
      menu_button: {
        type: 'web_app',
        text,
        web_app: { url: webAppUrl },
      },
    });
  }

  private buildMarkup(options?: {
    replyKeyboard?: ReplyKeyboardButton[][];
    inlineKeyboard?: InlineKeyboardButton[][];
    removeKeyboard?: boolean;
  }) {
    return options?.inlineKeyboard
      ? { inline_keyboard: options.inlineKeyboard }
      : options?.replyKeyboard
        ? { keyboard: options.replyKeyboard, resize_keyboard: true }
        : options?.removeKeyboard
          ? { remove_keyboard: true }
          : undefined;
  }

  sendMessage(
    chatId: string | number,
    text: string,
    options?: {
      replyKeyboard?: ReplyKeyboardButton[][];
      inlineKeyboard?: InlineKeyboardButton[][];
      removeKeyboard?: boolean;
      replyToMessageId?: number;
    }
  ) {
    return this.call<{ message_id: number }>('sendMessage', {
      chat_id: chatId,
      text: formatTelegramHtml(text),
      parse_mode: 'HTML',
      reply_markup: this.buildMarkup(options),
      reply_to_message_id: options?.replyToMessageId,
      disable_web_page_preview: true,
    });
  }

  sendPhoto(
    chatId: string | number,
    photoUrl: string,
    caption?: string,
    options?: {
      replyKeyboard?: ReplyKeyboardButton[][];
      inlineKeyboard?: InlineKeyboardButton[][];
      replyToMessageId?: number;
    }
  ) {
    return this.call<{ message_id: number }>('sendPhoto', {
      chat_id: chatId,
      photo: photoUrl,
      caption: caption ? formatTelegramHtml(caption) : undefined,
      parse_mode: caption ? 'HTML' : undefined,
      reply_markup: this.buildMarkup(options),
      reply_to_message_id: options?.replyToMessageId,
    });
  }

  async sendPhotoBuffer(
    chatId: string | number,
    pngBytes: Uint8Array,
    filename: string,
    caption?: string,
    options?: {
      replyKeyboard?: ReplyKeyboardButton[][];
      inlineKeyboard?: InlineKeyboardButton[][];
      replyToMessageId?: number;
      mimeType?: string;
    }
  ): Promise<{ message_id: number }> {
    const sendAttempt = async (withStyles: boolean, plainCaption = false) => {
      const fd = new FormData();
      fd.append('chat_id', String(chatId));
      if (caption) {
        if (plainCaption) {
          fd.append('caption', caption.slice(0, 1020));
        } else {
          fd.append('caption', formatTelegramHtml(caption).slice(0, 1020));
          fd.append('parse_mode', 'HTML');
        }
      }
      if (options?.replyToMessageId) fd.append('reply_to_message_id', String(options.replyToMessageId));
      const markup = this.buildMarkup(options);
      if (markup) {
        fd.append('reply_markup', JSON.stringify(withStyles ? markup : stripButtonStyles(markup)));
      }
      const mime = options?.mimeType || 'image/png';
      fd.append('photo', new Blob([pngBytes as unknown as BlobPart], { type: mime }), filename);

      const res = await fetch(`https://api.telegram.org/bot${this.token}/sendPhoto`, {
        method: 'POST',
        body: fd,
        signal: AbortSignal.timeout(18_000),
      });
      const json = await res.json() as { ok: boolean; result?: { message_id: number }; description?: string };
      return { res, json };
    };

    const first = await sendAttempt(true, false);
    if (!first.json.ok && caption && /parse|entit|tag/i.test(first.json.description ?? '')) {
      const plainRetry = await sendAttempt(true, true);
      if (plainRetry.json.ok) return plainRetry.json.result!;
    }
    if (!first.json.ok && options?.inlineKeyboard && /style|button|markup|field/i.test(first.json.description ?? '')) {
      const second = await sendAttempt(false, false);
      if (!second.json.ok) {
        throw new Error(`Telegram sendPhotoBuffer failed: ${second.json.description ?? second.res.status}`);
      }
      return second.json.result!;
    }
    if (!first.json.ok) {
      throw new Error(`Telegram sendPhotoBuffer failed: ${first.json.description ?? first.res.status}`);
    }
    return first.json.result!;
  }

  async sendDataUrlPhoto(
    chatId: string | number,
    dataUrl: string,
    caption?: string,
    options?: {
      replyKeyboard?: ReplyKeyboardButton[][];
      inlineKeyboard?: InlineKeyboardButton[][];
      replyToMessageId?: number;
    }
  ): Promise<{ message_id: number }> {
    const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s);
    if (!match) {
      throw new Error('Invalid image data URL');
    }
    const mimeType = match[1]!.toLowerCase();
    const binStr = atob(match[2]!.replace(/\s+/g, ''));
    const bytes = new Uint8Array(binStr.length);
    for (let i = 0; i < binStr.length; i++) {
      bytes[i] = binStr.charCodeAt(i);
    }
    const ext = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
    return this.sendPhotoBuffer(chatId, bytes, `attachment.${ext}`, caption, {
      ...options,
      mimeType: mimeType === 'image/jpg' ? 'image/jpeg' : mimeType,
    });
  }

  sendVideo(
    chatId: string | number,
    videoUrl: string,
    caption?: string,
    options?: {
      replyKeyboard?: ReplyKeyboardButton[][];
      inlineKeyboard?: InlineKeyboardButton[][];
    }
  ) {
    return this.call<{ message_id: number }>('sendVideo', {
      chat_id: chatId,
      video: videoUrl,
      caption,
      reply_markup: this.buildMarkup(options),
    });
  }

  async sendDocument(
    chatId: string | number,
    filename: string,
    content: string,
    mimeType: string,
    caption?: string
  ) {
    const fd = new FormData();
    fd.append('chat_id', String(chatId));
    if (caption) fd.append('caption', caption);
    fd.append('document', new Blob([content], { type: mimeType }), filename);

    const res = await fetch(`https://api.telegram.org/bot${this.token}/sendDocument`, {
      method: 'POST',
      body: fd,
      signal: AbortSignal.timeout(15_000),
    });
    const json = await res.json() as { ok: boolean; result?: { message_id: number }; description?: string };
    if (!json.ok) {
      throw new Error(`Telegram sendDocument failed: ${json.description ?? res.status}`);
    }
    return json.result;
  }

  editMessageText(
    chatId: string | number,
    messageId: number,
    text: string,
    inlineKeyboard?: InlineKeyboardButton[][]
  ) {
    return this.call('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text: formatTelegramHtml(text),
      parse_mode: 'HTML',
      reply_markup: inlineKeyboard ? { inline_keyboard: inlineKeyboard } : undefined,
      disable_web_page_preview: true,
    });
  }

  answerCallbackQuery(callbackQueryId: string, text?: string, showAlert = false) {
    return this.call('answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      text,
      show_alert: showAlert,
    });
  }
}
