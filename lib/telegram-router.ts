/**
 * Telegram message router.
 * Maps group chat IDs to characters, queues messages, spawns sessions.
 * Maintains per-character conversation history with 10-minute idle timeout.
 */

import path from 'path';
import fs from 'fs';
import { TELEGRAM_GROUPS, TELEGRAM_USER_ID } from './config';
import { TelegramUpdate, TelegramMessage, sendMessage, sendChatAction, downloadFile, stripMarkdown } from './telegram';
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

    // Add to conversation history
    session.history.push({ role: 'user', content: currentMessage });
    session.history.push({ role: 'assistant', content: response });

    // Send response back to group (strip markdown for clean plain text)
    if (response.trim()) {
      await sendMessage(groupId, stripMarkdown(response));
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
