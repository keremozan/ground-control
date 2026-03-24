/**
 * Telegram message log.
 * Separate from pipeline-log.json (different schema).
 */

import fs from 'fs';
import path from 'path';

const LOG_PATH = path.join(process.cwd(), 'data', 'telegram-log.json');
const MAX_ENTRIES = 500;

export type TelegramLogEntry = {
  id: string;
  direction: 'inbound' | 'outbound';
  charName: string;
  groupId: number;
  messageId: number;
  text: string;
  mediaType?: 'photo' | 'voice' | 'document';
  timestamp: string;
  durationMs?: number;
};

function readLog(): TelegramLogEntry[] {
  try {
    const raw = fs.readFileSync(LOG_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writeLog(entries: TelegramLogEntry[]): void {
  const dir = path.dirname(LOG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(LOG_PATH, JSON.stringify(entries, null, 2));
}

export function logTelegramEntry(entry: TelegramLogEntry): void {
  const log = readLog();
  log.unshift(entry);
  writeLog(log.slice(0, MAX_ENTRIES));
}

export function getTelegramLog(limit = 50): TelegramLogEntry[] {
  return readLog().slice(0, limit);
}
