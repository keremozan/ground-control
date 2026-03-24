/**
 * Telegram Bot API client.
 * Thin wrapper around fetch. No external library needed.
 */

import { TELEGRAM_BOT_TOKEN } from './config';

const MAX_MESSAGE_LENGTH = 4096;

// ── Types ────────────────────────────────────────

export type TelegramUser = {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
};

export type TelegramChat = {
  id: number;
  type: string;
  title?: string;
};

export type TelegramMessage = {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  photo?: Array<{ file_id: string; file_unique_id: string; width: number; height: number }>;
  voice?: { file_id: string; duration: number };
  document?: { file_id: string; file_name?: string; mime_type?: string };
  caption?: string;
};

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
};

type TelegramFile = {
  file_id: string;
  file_path?: string;
};

// ── Helpers ──────────────────────────────────────

export function buildApiUrl(token: string, method: string): string {
  return `https://api.telegram.org/bot${token}/${method}`;
}

// ── API Methods ──────────────────────────────────

export async function getMe(): Promise<TelegramUser> {
  const res = await fetch(buildApiUrl(TELEGRAM_BOT_TOKEN, 'getMe'));
  const data = await res.json();
  if (!data.ok) throw new Error(`getMe failed: ${data.description}`);
  return data.result;
}

export async function getUpdates(offset: number, timeout = 2): Promise<TelegramUpdate[]> {
  const res = await fetch(buildApiUrl(TELEGRAM_BOT_TOKEN, 'getUpdates'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ offset, timeout }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`getUpdates failed: ${data.description}`);
  return data.result;
}

export async function sendMessage(
  chatId: number,
  text: string,
  parseMode?: string,
): Promise<TelegramMessage> {
  const chunks = splitMessage(text);
  let lastMessage: TelegramMessage | null = null;

  for (const chunk of chunks) {
    const res = await fetch(buildApiUrl(TELEGRAM_BOT_TOKEN, 'sendMessage'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: chunk,
        ...(parseMode ? { parse_mode: parseMode } : {}),
      }),
    });
    const data = await res.json();
    if (!data.ok) {
      // Retry once after 1 second
      await new Promise(r => setTimeout(r, 1000));
      const retry = await fetch(buildApiUrl(TELEGRAM_BOT_TOKEN, 'sendMessage'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: chunk,
          ...(parseMode ? { parse_mode: parseMode } : {}),
        }),
      });
      const retryData = await retry.json();
      if (!retryData.ok) throw new Error(`sendMessage failed: ${retryData.description}`);
      lastMessage = retryData.result;
    } else {
      lastMessage = data.result;
    }
  }

  return lastMessage!;
}

export async function sendChatAction(chatId: number, action = 'typing'): Promise<void> {
  await fetch(buildApiUrl(TELEGRAM_BOT_TOKEN, 'sendChatAction'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, action }),
  });
}

export async function downloadFile(fileId: string, destPath: string): Promise<string> {
  const res = await fetch(buildApiUrl(TELEGRAM_BOT_TOKEN, 'getFile'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_id: fileId }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`getFile failed: ${data.description}`);
  const filePath = (data.result as TelegramFile).file_path;
  if (!filePath) throw new Error('No file_path returned');

  const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${filePath}`;
  const fileRes = await fetch(fileUrl);
  const buffer = Buffer.from(await fileRes.arrayBuffer());

  const fs = await import('fs/promises');
  const path = await import('path');
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  await fs.writeFile(destPath, buffer);
  return destPath;
}

// ── Formatting ───────────────────────────────────

/** Escape HTML special characters for Telegram HTML parse mode */
function escapeHTML(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Convert markdown to Telegram HTML.
 * Handles: bold, italic, strikethrough, code, code blocks, links, headers.
 * Falls back gracefully (unrecognized markdown passes through as plain text).
 */
export function markdownToTelegramHTML(text: string): string {
  // First, extract code blocks to protect them from other transformations
  const codeBlocks: string[] = [];
  let result = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_match, lang, code) => {
    const idx = codeBlocks.length;
    const langAttr = lang ? ` class="language-${escapeHTML(lang)}"` : '';
    codeBlocks.push(`<pre><code${langAttr}>${escapeHTML(code.trimEnd())}</code></pre>`);
    return `\x00CODEBLOCK${idx}\x00`;
  });

  // Extract inline code
  const inlineCodes: string[] = [];
  result = result.replace(/`([^`]+)`/g, (_match, code) => {
    const idx = inlineCodes.length;
    inlineCodes.push(`<code>${escapeHTML(code)}</code>`);
    return `\x00INLINE${idx}\x00`;
  });

  // Now escape HTML in the remaining text
  result = escapeHTML(result);

  // Bold: **text** or __text__
  result = result.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  result = result.replace(/__(.+?)__/g, '<b>$1</b>');

  // Italic: *text* or _text_ (not inside words)
  result = result.replace(/(?<!\w)\*(.+?)\*(?!\w)/g, '<i>$1</i>');
  result = result.replace(/(?<!\w)_(.+?)_(?!\w)/g, '<i>$1</i>');

  // Strikethrough: ~~text~~
  result = result.replace(/~~(.+?)~~/g, '<s>$1</s>');

  // Links: [text](url)
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Headers: ## text -> bold
  result = result.replace(/^#{1,6}\s+(.+)$/gm, '<b>$1</b>');

  // Restore code blocks and inline code
  result = result.replace(/\x00CODEBLOCK(\d+)\x00/g, (_m, idx) => codeBlocks[Number(idx)]);
  result = result.replace(/\x00INLINE(\d+)\x00/g, (_m, idx) => inlineCodes[Number(idx)]);

  return result;
}

/** Strip markdown formatting (legacy, use markdownToTelegramHTML instead) */
export function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/(?<!\w)\*(.+?)\*(?!\w)/g, '$1')
    .replace(/(?<!\w)_(.+?)_(?!\w)/g, '$1')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)');
}

// ── Message Splitting ────────────────────────────

export function splitMessage(text: string): string[] {
  if (text.length <= MAX_MESSAGE_LENGTH) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > MAX_MESSAGE_LENGTH) {
    const slice = remaining.slice(0, MAX_MESSAGE_LENGTH);

    // Try paragraph break
    let splitIdx = slice.lastIndexOf('\n\n');
    // Try newline
    if (splitIdx === -1) splitIdx = slice.lastIndexOf('\n');
    // Hard split
    if (splitIdx === -1) splitIdx = MAX_MESSAGE_LENGTH;

    const chunk = remaining.slice(0, splitIdx).trimEnd();
    if (chunk) chunks.push(chunk);
    remaining = remaining.slice(splitIdx).trimStart();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}
