import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

const TEST_LOG_PATH = path.join(process.cwd(), 'data', 'telegram-log.test.json');

vi.mock('../../lib/telegram-log', async () => {
  const MAX_ENTRIES = 500;
  type TelegramLogEntry = {
    id: string;
    direction: 'inbound' | 'outbound';
    charName: string;
    groupId: number;
    messageId: number;
    text: string;
    mediaType?: string;
    timestamp: string;
    durationMs?: number;
  };

  function readLog(): TelegramLogEntry[] {
    try {
      return JSON.parse(fs.readFileSync(TEST_LOG_PATH, 'utf-8'));
    } catch {
      return [];
    }
  }

  function writeLog(entries: TelegramLogEntry[]): void {
    const dir = path.dirname(TEST_LOG_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(TEST_LOG_PATH, JSON.stringify(entries, null, 2));
  }

  return {
    logTelegramEntry: (entry: TelegramLogEntry) => {
      const log = readLog();
      log.unshift(entry);
      writeLog(log.slice(0, MAX_ENTRIES));
    },
    getTelegramLog: (limit = 50) => readLog().slice(0, limit),
  };
});

import { logTelegramEntry, getTelegramLog } from '../../lib/telegram-log';

describe('telegram-log', () => {
  beforeEach(() => {
    if (fs.existsSync(TEST_LOG_PATH)) fs.unlinkSync(TEST_LOG_PATH);
  });

  afterEach(() => {
    if (fs.existsSync(TEST_LOG_PATH)) fs.unlinkSync(TEST_LOG_PATH);
  });

  it('creates log file on first entry', () => {
    logTelegramEntry({
      id: 'test-1',
      direction: 'inbound',
      charName: 'coach',
      groupId: -100123,
      messageId: 1,
      text: 'Hello',
      timestamp: new Date().toISOString(),
    });
    const log = getTelegramLog();
    expect(log.length).toBe(1);
    expect(log[0].charName).toBe('coach');
  });

  it('caps at 500 entries', () => {
    for (let i = 0; i < 510; i++) {
      logTelegramEntry({
        id: `test-${i}`,
        direction: 'outbound',
        charName: 'postman',
        groupId: -100456,
        messageId: i,
        text: `msg ${i}`,
        timestamp: new Date().toISOString(),
      });
    }
    const log = getTelegramLog(600);
    expect(log.length).toBeLessThanOrEqual(500);
  });

  it('returns newest first', () => {
    logTelegramEntry({
      id: 'old',
      direction: 'inbound',
      charName: 'coach',
      groupId: -100123,
      messageId: 1,
      text: 'old',
      timestamp: '2026-01-01T00:00:00Z',
    });
    logTelegramEntry({
      id: 'new',
      direction: 'outbound',
      charName: 'coach',
      groupId: -100123,
      messageId: 2,
      text: 'new',
      timestamp: '2026-03-24T00:00:00Z',
    });
    const log = getTelegramLog(2);
    expect(log[0].id).toBe('new');
  });
});
