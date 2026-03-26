/**
 * Telegram message router.
 * Maps group chat IDs to characters, queues messages, spawns sessions.
 * Maintains per-character conversation history with 10-minute idle timeout.
 */

import path from 'path';
import fs from 'fs';
import { TELEGRAM_GROUPS, TELEGRAM_USER_ID } from './config';
import { TelegramUpdate, TelegramMessage, TelegramCallbackQuery, InlineKeyboardMarkup, sendMessage, sendChatAction, downloadFile, markdownToTelegramHTML } from './telegram';
import { spawnAndCollect } from './spawn';
import { getCharacters } from './characters';
import { buildCharacterPrompt } from './prompt';
import { logTelegramEntry } from './telegram-log';

const MEDIA_DIR = '/tmp/telegram-media';
const SESSION_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

// ── Conversation History ─────────────────────────

type HistoryEntry = { role: 'user' | 'assistant'; content: string };

type CharSession = {
  history: HistoryEntry[];
  lastActivity: number;
  timer: ReturnType<typeof setTimeout>;
};

const sessions = new Map<string, CharSession>();

function getSession(charName: string): CharSession {
  const existing = sessions.get(charName);
  if (existing && Date.now() - existing.lastActivity < SESSION_TIMEOUT_MS) {
    clearTimeout(existing.timer);
    existing.lastActivity = Date.now();
    existing.timer = setTimeout(() => sessions.delete(charName), SESSION_TIMEOUT_MS);
    return existing;
  }
  // New session or expired
  if (existing) clearTimeout(existing.timer);
  const session: CharSession = {
    history: [],
    lastActivity: Date.now(),
    timer: setTimeout(() => sessions.delete(charName), SESSION_TIMEOUT_MS),
  };
  sessions.set(charName, session);
  return session;
}

export function clearSession(charName: string): void {
  const session = sessions.get(charName);
  if (session) {
    clearTimeout(session.timer);
    sessions.delete(charName);
  }
}

// Per-character message queue to prevent concurrent sessions
const queues = new Map<string, Array<() => Promise<void>>>();
const processing = new Set<string>();

// ── Public ───────────────────────────────────────

export function resolveCharacter(
  chatId: number,
  groups: Record<string, number> = TELEGRAM_GROUPS,
): string | null {
  for (const [charName, groupId] of Object.entries(groups)) {
    if (groupId === chatId) return charName;
  }
  return null;
}

export async function processUpdate(update: TelegramUpdate): Promise<void> {
  const msg = update.message;
  if (!msg) return;

  // Security: only process messages from Kerem
  if (msg.from?.id !== TELEGRAM_USER_ID) return;

  const charName = resolveCharacter(msg.chat.id);
  if (!charName) return;

  // Handle /new command to reset session
  if (msg.text?.trim().toLowerCase() === '/new') {
    clearSession(charName);
    await sendMessage(msg.chat.id, 'Session cleared.');
    return;
  }

  // Queue the message for sequential processing per character
  enqueue(charName, () => handleMessage(charName, msg));
}

// ── Queue Management ─────────────────────────────

function enqueue(charName: string, task: () => Promise<void>): void {
  if (!queues.has(charName)) queues.set(charName, []);
  queues.get(charName)!.push(task);

  if (!processing.has(charName)) {
    processQueue(charName);
  }
}

async function processQueue(charName: string): Promise<void> {
  processing.add(charName);
  const queue = queues.get(charName);

  while (queue && queue.length > 0) {
    const task = queue.shift()!;
    try {
      await task();
    } catch (err) {
      console.error(`[telegram] Error processing message for ${charName}:`, err);
    }
  }

  processing.delete(charName);
}

// ── Message Handling ─────────────────────────────

async function handleMessage(charName: string, msg: TelegramMessage): Promise<void> {
  const groupId = msg.chat.id;

  // Build the user's message text
  let userText = msg.text || msg.caption || '';
  let mediaType: 'photo' | 'voice' | 'document' | undefined;
  let mediaPath: string | undefined;

  // Handle media
  try {
    if (msg.photo && msg.photo.length > 0) {
      const largest = msg.photo[msg.photo.length - 1];
      mediaPath = await downloadFile(
        largest.file_id,
        path.join(MEDIA_DIR, `${Date.now()}-photo.jpg`),
      );
      mediaType = 'photo';
    } else if (msg.voice) {
      mediaPath = await downloadFile(
        msg.voice.file_id,
        path.join(MEDIA_DIR, `${Date.now()}-voice.ogg`),
      );
      mediaType = 'voice';
    } else if (msg.document) {
      const ext = msg.document.file_name?.split('.').pop() || 'bin';
      mediaPath = await downloadFile(
        msg.document.file_id,
        path.join(MEDIA_DIR, `${Date.now()}-doc.${ext}`),
      );
      mediaType = 'document';
    }
  } catch (err) {
    console.error(`[telegram] Media download failed:`, err);
  }

  // Get or create conversation session
  const session = getSession(charName);
  const characters = getCharacters();
  const char = characters[charName];
  const model = char?.defaultModel || 'sonnet';
  const maxTurns = 20;

  let currentMessage = userText;
  if (mediaPath) {
    currentMessage += `\n\n[Attached ${mediaType}: ${mediaPath}]`;
  }

  // Build prompt with history (same pattern as dashboard /api/chat)
  let taskContent = '';
  if (session.history.length > 0) {
    const historyText = session.history
      .map(m => `${m.role === 'user' ? 'User' : 'You'}: ${m.content}`)
      .join('\n\n');
    taskContent = `## Conversation so far\n${historyText}\n\n## User's latest message\n${currentMessage}`;
  } else {
    taskContent = currentMessage;
  }

  const prompt = buildCharacterPrompt(charName, taskContent);

  // Show typing indicator
  sendChatAction(groupId).catch(() => {});

  // Log inbound
  logTelegramEntry({
    id: `in-${Date.now()}`,
    direction: 'inbound',
    charName,
    groupId,
    messageId: msg.message_id,
    text: (userText || '').slice(0, 500),
    mediaType,
    timestamp: new Date().toISOString(),
  });

  try {
    const { response, durationMs } = await spawnAndCollect({
      prompt,
      model,
      maxTurns,
      label: `telegram-${charName}`,
      characterId: charName,
      allowedTools: char?.allowedTools,
    });

    // Add to conversation history and persist
    session.history.push({ role: 'user', content: currentMessage });
    session.history.push({ role: 'assistant', content: response });
    persistSessions();

    // Send response back to group with rich formatting
    if (response.trim()) {
      const { text: cleanText, replyMarkup } = extractQuickReplies(response);
      await sendMessage(groupId, markdownToTelegramHTML(cleanText), 'HTML', replyMarkup || undefined);
    }

    // Log outbound
    logTelegramEntry({
      id: `out-${Date.now()}`,
      direction: 'outbound',
      charName,
      groupId,
      messageId: msg.message_id,
      text: response.slice(0, 500),
      timestamp: new Date().toISOString(),
      durationMs,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[telegram] Spawn failed for ${charName}:`, errorMsg);

    try {
      await sendMessage(groupId, `Session failed: ${errorMsg.slice(0, 200)}. Try again.`);
    } catch { /* best effort */ }
  }
}

// ── Quick-Reply Extraction ──────────────────────

/**
 * Extract [quick-reply: "Option A" | "Option B" | ...] patterns from character output
 * and convert them to Telegram InlineKeyboardMarkup buttons.
 */
function extractQuickReplies(text: string): { text: string; replyMarkup: InlineKeyboardMarkup | null } {
  // Match patterns like: [quick-reply: "Option A" | "Option B" | "Option C"]
  const pattern = /\[quick-reply:\s*([^\]]+)\]/gi;
  const matches = [...text.matchAll(pattern)];

  if (matches.length === 0) return { text, replyMarkup: null };

  // Use the last match (most relevant)
  const lastMatch = matches[matches.length - 1];
  const optionsStr = lastMatch[1];

  // Parse options: split by | and strip quotes
  const options = optionsStr
    .split('|')
    .map(o => o.trim().replace(/^["']|["']$/g, '').trim())
    .filter(o => o.length > 0);

  if (options.length === 0) return { text, replyMarkup: null };

  // Build inline keyboard (max 3 per row)
  const rows: Array<Array<{ text: string; callback_data: string }>> = [];
  for (let i = 0; i < options.length; i += 3) {
    rows.push(
      options.slice(i, i + 3).map(opt => ({
        text: opt,
        callback_data: opt.slice(0, 64), // Telegram callback_data limit is 64 bytes
      }))
    );
  }

  // Remove all [quick-reply: ...] patterns from the text
  const cleanText = text.replace(pattern, '').trim();

  return { text: cleanText, replyMarkup: { inline_keyboard: rows } };
}

// ── Callback Query Handling ──────────────────────

export async function processCallbackQuery(query: TelegramCallbackQuery): Promise<void> {
  if (!query.message || !query.data) return;

  // Security: only process callbacks from Kerem
  if (query.from.id !== TELEGRAM_USER_ID) return;

  const chatId = query.message.chat.id;
  const charName = resolveCharacter(chatId);
  if (!charName) return;

  // Route callback data as a regular message to the character
  // The callback data text (e.g., "Done", "Stuck", "Looks good") is sent as user text
  const syntheticMsg: TelegramMessage = {
    message_id: query.message.message_id,
    from: { id: query.from.id, is_bot: false, first_name: query.from.first_name, username: query.from.username },
    chat: query.message.chat,
    date: Math.floor(Date.now() / 1000),
    text: query.data,
  };

  enqueue(charName, () => handleMessage(charName, syntheticMsg));
}

// ── Session Persistence ─────────────────────────

const SESSION_FILE = path.join(process.cwd(), 'data', 'telegram-sessions.json');

type PersistedSession = {
  charName: string;
  history: HistoryEntry[];
  lastActivity: number;
};

function persistSessions(): void {
  try {
    const data: PersistedSession[] = [];
    for (const [charName, session] of sessions.entries()) {
      data.push({
        charName,
        history: session.history,
        lastActivity: session.lastActivity,
      });
    }
    fs.writeFileSync(SESSION_FILE, JSON.stringify(data, null, 2));
  } catch { /* best effort */ }
}

export function loadPersistedSessions(): void {
  try {
    if (!fs.existsSync(SESSION_FILE)) return;
    const raw = fs.readFileSync(SESSION_FILE, 'utf-8');
    const data: PersistedSession[] = JSON.parse(raw);
    const now = Date.now();
    const ONE_DAY = 24 * 60 * 60 * 1000;

    for (const entry of data) {
      // Prune sessions older than 24 hours
      if (now - entry.lastActivity > ONE_DAY) continue;

      const session: CharSession = {
        history: entry.history,
        lastActivity: entry.lastActivity,
        timer: setTimeout(() => sessions.delete(entry.charName), SESSION_TIMEOUT_MS),
      };
      sessions.set(entry.charName, session);
    }
  } catch { /* best effort */ }
}

// ── Media Cleanup ────────────────────────────────

export async function cleanupOldMedia(): Promise<void> {
  try {
    const entries = await fs.promises.readdir(MEDIA_DIR).catch(() => []);
    const now = Date.now();
    const ONE_DAY = 24 * 60 * 60 * 1000;

    for (const entry of entries) {
      const filePath = path.join(MEDIA_DIR, entry);
      const stat = await fs.promises.stat(filePath);
      if (now - stat.mtimeMs > ONE_DAY) {
        await fs.promises.unlink(filePath);
      }
    }
  } catch { /* best effort */ }
}
