/**
 * Telegram message router.
 * Maps group chat IDs to characters, queues messages, spawns sessions.
 */

import path from 'path';
import fs from 'fs';
import { TELEGRAM_GROUPS, TELEGRAM_USER_ID } from './config';
import { TelegramUpdate, TelegramMessage, sendMessage, downloadFile } from './telegram';
import { spawnAndCollect } from './spawn';
import { getCharacters } from './characters';
import { logTelegramEntry } from './telegram-log';

const MEDIA_DIR = '/tmp/telegram-media';

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
  const startTime = Date.now();
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

  // Build seed prompt
  const characters = getCharacters();
  const char = characters[charName];
  const model = char?.defaultModel || 'sonnet';
  const maxTurns = 20;

  let prompt = userText;
  if (mediaPath) {
    prompt += `\n\n[Attached ${mediaType}: ${mediaPath}]`;
  }

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

    // Send response back to group
    if (response.trim()) {
      await sendMessage(groupId, response);
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

    // Post error to group
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
