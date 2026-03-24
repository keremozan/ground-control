# Telegram Crew Channels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Telegram as the primary crew-to-Kerem communication channel, with per-character groups for two-way interaction.

**Architecture:** One Telegram bot with long polling in GC. Inbound messages resolve to a character via group ID, spawn a Claude session, post the response back. Outbound via a simple POST endpoint that characters call with curl. Separate telegram log file.

**Tech Stack:** Next.js 16 API routes, Telegram Bot API (raw fetch, no library), existing spawnAndCollect infrastructure.

**Spec:** `docs/superpowers/specs/2026-03-24-telegram-crew-channels-design.md`

---

## File Structure

| File | Purpose |
|------|---------|
| Create: `lib/telegram.ts` | Telegram Bot API client (getUpdates, sendMessage, downloadFile, splitMessage) |
| Create: `lib/telegram-log.ts` | Telegram log read/write (data/telegram-log.json) |
| Create: `lib/telegram-router.ts` | Group-to-character resolution, message processing, per-character queue |
| Create: `lib/telegram-poller.ts` | Polling controller singleton (start/stop/status) |
| Create: `app/api/telegram/send/route.ts` | POST endpoint for outbound messages |
| Create: `app/api/telegram/poll/start/route.ts` | GET endpoint to start polling |
| Create: `app/api/telegram/poll/stop/route.ts` | GET endpoint to stop polling |
| Create: `app/api/telegram/poll/status/route.ts` | GET endpoint for polling status |
| Create: `app/api/telegram/log/route.ts` | GET endpoint for telegram log |
| Create: `tests/lib/telegram.test.ts` | Tests for Bot API client |
| Create: `tests/lib/telegram-log.test.ts` | Tests for log functions |
| Create: `tests/lib/telegram-router.test.ts` | Tests for router logic |
| Modify: `lib/config.ts` | Add TELEGRAM_BOT_TOKEN, TELEGRAM_USER_ID, TELEGRAM_GROUPS exports |
| Modify: `ground-control.config.ts` | Add telegram config block (user does this manually, git-ignored) |
| Modify: `~/CLAUDE.md` | Update SELF-MESSAGE EXCEPTION and REPORT EMAIL RULE |
| Modify: `~/.claude/skills/coach-checkin/SKILL.md` | Replace WhatsApp send with Telegram |
| Modify: `~/.claude/skills/tutor-lesson/SKILL.md` | Replace WhatsApp/email send with Telegram |

---

### Task 1: Config Exports

**Files:**
- Modify: `lib/config.ts`

- [ ] **Step 1: Add Telegram config exports to lib/config.ts**

Add after the Gemini section (line ~81):

```typescript
// ── Telegram ─────────────────────────────────────

const telegramConfig = (userConfig as Record<string, unknown>).telegram as {
  botToken?: string;
  userId?: number;
  groups?: Record<string, number>;
} | undefined;

export const TELEGRAM_BOT_TOKEN = telegramConfig?.botToken || '';
export const TELEGRAM_USER_ID = telegramConfig?.userId || 0;
export const TELEGRAM_GROUPS: Record<string, number> = telegramConfig?.groups || {};
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd ~/Projects/ground-control && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors related to telegram config

- [ ] **Step 3: Commit**

```bash
git add lib/config.ts
git commit -m "feat: add Telegram config exports"
```

---

### Task 2: Telegram Bot API Client

**Files:**
- Create: `lib/telegram.ts`
- Create: `tests/lib/telegram.test.ts`

- [ ] **Step 1: Write tests for the API client**

Create `tests/lib/telegram.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { splitMessage, buildApiUrl } from '../../lib/telegram';

describe('telegram', () => {
  describe('buildApiUrl', () => {
    it('builds correct URL for method', () => {
      const url = buildApiUrl('TOKEN123', 'getUpdates');
      expect(url).toBe('https://api.telegram.org/botTOKEN123/getUpdates');
    });
  });

  describe('splitMessage', () => {
    it('returns single chunk for short message', () => {
      const chunks = splitMessage('Hello world');
      expect(chunks).toEqual(['Hello world']);
    });

    it('splits at paragraph boundary when over 4096 chars', () => {
      const para1 = 'A'.repeat(3000);
      const para2 = 'B'.repeat(3000);
      const text = `${para1}\n\n${para2}`;
      const chunks = splitMessage(text);
      expect(chunks.length).toBe(2);
      expect(chunks[0]).toBe(para1);
      expect(chunks[1]).toBe(para2);
    });

    it('splits at newline if no paragraph break', () => {
      const line1 = 'A'.repeat(3000);
      const line2 = 'B'.repeat(3000);
      const text = `${line1}\n${line2}`;
      const chunks = splitMessage(text);
      expect(chunks.length).toBe(2);
    });

    it('hard splits if no newline at all', () => {
      const text = 'A'.repeat(5000);
      const chunks = splitMessage(text);
      expect(chunks.length).toBe(2);
      expect(chunks[0].length).toBe(4096);
      expect(chunks[1].length).toBe(904);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/Projects/ground-control && npx vitest run tests/lib/telegram.test.ts 2>&1`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement lib/telegram.ts**

Create `lib/telegram.ts`:

```typescript
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

export async function downloadFile(fileId: string, destPath: string): Promise<string> {
  // Step 1: get file path from Telegram
  const res = await fetch(buildApiUrl(TELEGRAM_BOT_TOKEN, 'getFile'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_id: fileId }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`getFile failed: ${data.description}`);
  const filePath = (data.result as TelegramFile).file_path;
  if (!filePath) throw new Error('No file_path returned');

  // Step 2: download the file
  const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${filePath}`;
  const fileRes = await fetch(fileUrl);
  const buffer = Buffer.from(await fileRes.arrayBuffer());

  // Step 3: write to dest
  const fs = await import('fs/promises');
  const path = await import('path');
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  await fs.writeFile(destPath, buffer);
  return destPath;
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

    chunks.push(remaining.slice(0, splitIdx).trimEnd());
    remaining = remaining.slice(splitIdx).trimStart();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ~/Projects/ground-control && npx vitest run tests/lib/telegram.test.ts 2>&1`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add lib/telegram.ts tests/lib/telegram.test.ts
git commit -m "feat: add Telegram Bot API client with message splitting"
```

---

### Task 3: Telegram Log

**Files:**
- Create: `lib/telegram-log.ts`
- Create: `tests/lib/telegram-log.test.ts`

- [ ] **Step 1: Write tests for telegram log**

Create `tests/lib/telegram-log.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

// Mock the LOG_PATH to use a test file
const TEST_LOG_PATH = path.join(process.cwd(), 'data', 'telegram-log.test.json');
vi.mock('../../lib/telegram-log', async () => {
  // Re-implement with test path to avoid polluting real log
  const MAX_ENTRIES = 500;
  type TelegramLogEntry = {
    id: string; direction: 'inbound' | 'outbound'; charName: string;
    groupId: number; messageId: number; text: string;
    mediaType?: string; timestamp: string; durationMs?: number;
  };
  function readLog(): TelegramLogEntry[] {
    try { return JSON.parse(fs.readFileSync(TEST_LOG_PATH, 'utf-8')); }
    catch { return []; }
  }
  function writeLog(entries: TelegramLogEntry[]): void {
    const dir = path.dirname(TEST_LOG_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(TEST_LOG_PATH, JSON.stringify(entries, null, 2));
  }
  return {
    logTelegramEntry: (entry: TelegramLogEntry) => { const log = readLog(); log.unshift(entry); writeLog(log.slice(0, MAX_ENTRIES)); },
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
      id: 'test-1', direction: 'inbound', charName: 'coach',
      groupId: -100123, messageId: 1, text: 'Hello',
      timestamp: new Date().toISOString(),
    });
    const log = getTelegramLog();
    expect(log.length).toBe(1);
    expect(log[0].charName).toBe('coach');
  });

  it('caps at 500 entries', () => {
    for (let i = 0; i < 510; i++) {
      logTelegramEntry({
        id: `test-${i}`, direction: 'outbound', charName: 'postman',
        groupId: -100456, messageId: i, text: `msg ${i}`,
        timestamp: new Date().toISOString(),
      });
    }
    const log = getTelegramLog(600);
    expect(log.length).toBeLessThanOrEqual(500);
  });

  it('returns newest first', () => {
    logTelegramEntry({
      id: 'old', direction: 'inbound', charName: 'coach',
      groupId: -100123, messageId: 1, text: 'old',
      timestamp: '2026-01-01T00:00:00Z',
    });
    logTelegramEntry({
      id: 'new', direction: 'outbound', charName: 'coach',
      groupId: -100123, messageId: 2, text: 'new',
      timestamp: '2026-03-24T00:00:00Z',
    });
    const log = getTelegramLog(2);
    expect(log[0].id).toBe('new');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/Projects/ground-control && npx vitest run tests/lib/telegram-log.test.ts 2>&1`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement lib/telegram-log.ts**

Create `lib/telegram-log.ts`:

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ~/Projects/ground-control && npx vitest run tests/lib/telegram-log.test.ts 2>&1`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add lib/telegram-log.ts tests/lib/telegram-log.test.ts
git commit -m "feat: add Telegram message log"
```

---

### Task 4: Send Endpoint

**Files:**
- Create: `app/api/telegram/send/route.ts`

- [ ] **Step 1: Create the send route**

Create `app/api/telegram/send/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { TELEGRAM_GROUPS, TELEGRAM_BOT_TOKEN } from '@/lib/config';
import { sendMessage } from '@/lib/telegram';
import { logTelegramEntry, TelegramLogEntry } from '@/lib/telegram-log';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  if (!TELEGRAM_BOT_TOKEN) {
    return NextResponse.json({ error: 'Telegram not configured' }, { status: 503 });
  }

  const body = await req.json();
  const { charName, message, parseMode } = body as {
    charName?: string;
    message?: string;
    parseMode?: string;
  };

  if (!charName || !message) {
    return NextResponse.json({ error: 'charName and message required' }, { status: 400 });
  }

  const groupId = TELEGRAM_GROUPS[charName];
  if (!groupId) {
    return NextResponse.json({ error: `No Telegram group for "${charName}"` }, { status: 404 });
  }

  try {
    const result = await sendMessage(groupId, message, parseMode);

    const logEntry: TelegramLogEntry = {
      id: `out-${Date.now()}`,
      direction: 'outbound',
      charName,
      groupId,
      messageId: result.message_id,
      text: message.slice(0, 500),
      timestamp: new Date().toISOString(),
    };
    logTelegramEntry(logEntry);

    return NextResponse.json({ ok: true, messageId: result.message_id });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);

    // Log failed message for later recovery
    const fs = await import('fs/promises');
    const path = await import('path');
    const errPath = path.join(process.cwd(), 'data', 'telegram-errors.json');
    try {
      const existing = JSON.parse(await fs.readFile(errPath, 'utf-8').catch(() => '[]'));
      existing.push({ charName, message: message.slice(0, 500), error: errorMsg, timestamp: new Date().toISOString() });
      await fs.writeFile(errPath, JSON.stringify(existing.slice(-100), null, 2));
    } catch { /* best effort */ }

    return NextResponse.json({ error: errorMsg }, { status: 502 });
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd ~/Projects/ground-control && npx tsc --noEmit 2>&1 | head -20`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add app/api/telegram/send/route.ts
git commit -m "feat: add Telegram send endpoint"
```

---

### Task 5: Telegram Router

**Files:**
- Create: `lib/telegram-router.ts`
- Create: `tests/lib/telegram-router.test.ts`

- [ ] **Step 1: Write tests for router**

Create `tests/lib/telegram-router.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { resolveCharacter } from '../../lib/telegram-router';

// Mock groups for testing
const testGroups: Record<string, number> = {
  coach: -100111,
  scholar: -100222,
  postman: -100333,
};

describe('telegram-router', () => {
  describe('resolveCharacter', () => {
    it('returns character name for known group', () => {
      expect(resolveCharacter(-100111, testGroups)).toBe('coach');
      expect(resolveCharacter(-100222, testGroups)).toBe('scholar');
    });

    it('returns null for unknown group', () => {
      expect(resolveCharacter(-100999, testGroups)).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/Projects/ground-control && npx vitest run tests/lib/telegram-router.test.ts 2>&1`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement lib/telegram-router.ts**

Create `lib/telegram-router.ts`:

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ~/Projects/ground-control && npx vitest run tests/lib/telegram-router.test.ts 2>&1`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add lib/telegram-router.ts tests/lib/telegram-router.test.ts
git commit -m "feat: add Telegram message router with per-character queue"
```

---

### Task 6: Polling Routes

**Files:**
- Create: `app/api/telegram/poll/start/route.ts`
- Create: `app/api/telegram/poll/stop/route.ts`
- Create: `app/api/telegram/poll/status/route.ts`

- [ ] **Step 1: Create shared polling controller**

Create `lib/telegram-poller.ts` (polling state must live in a shared lib module, not in individual route files, because Next.js route files are separate modules and can't share module-scoped state):

```typescript
/**
 * Telegram polling controller.
 * Singleton: one polling loop per GC process.
 */

import { TELEGRAM_BOT_TOKEN } from './config';
import { getUpdates, getMe, TelegramUser } from './telegram';
import { processUpdate, cleanupOldMedia } from './telegram-router';

let interval: ReturnType<typeof setInterval> | null = null;
let offset = 0;
let botInfo: TelegramUser | null = null;

async function pollOnce(): Promise<void> {
  try {
    const updates = await getUpdates(offset, 2);
    for (const update of updates) {
      offset = update.update_id + 1;
      processUpdate(update).catch(err =>
        console.error('[telegram] processUpdate error:', err),
      );
    }
  } catch (err) {
    console.error('[telegram] Poll error, retrying in 5s:', err);
    await new Promise(r => setTimeout(r, 5000));
  }
}

export async function startPolling(): Promise<{ status: string; botUsername?: string }> {
  if (!TELEGRAM_BOT_TOKEN) {
    throw new Error('Telegram not configured (no botToken)');
  }

  if (interval) {
    return { status: 'already running', botUsername: botInfo?.username };
  }

  // Verify bot token
  botInfo = await getMe();
  console.log(`[telegram] Bot connected: @${botInfo.username}`);

  // Clean old media
  cleanupOldMedia();

  // Start
  interval = setInterval(pollOnce, 2000);
  return { status: 'started', botUsername: botInfo.username };
}

export function stopPolling(): { status: string } {
  if (interval) {
    clearInterval(interval);
    interval = null;
    return { status: 'stopped' };
  }
  return { status: 'not running' };
}

export function getPollingStatus(): { running: boolean; botUsername?: string } {
  return { running: !!interval, botUsername: botInfo?.username };
}
```

- [ ] **Step 2: Create thin route handlers**

Create `app/api/telegram/poll/start/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { startPolling } from '@/lib/telegram-poller';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const result = await startPolling();
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
```

Create `app/api/telegram/poll/stop/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { stopPolling } from '@/lib/telegram-poller';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json(stopPolling());
}
```

Create `app/api/telegram/poll/status/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { getPollingStatus } from '@/lib/telegram-poller';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json(getPollingStatus());
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd ~/Projects/ground-control && npx tsc --noEmit 2>&1 | head -20`
Expected: No new errors

- [ ] **Step 4: Commit**

```bash
git add lib/telegram-poller.ts app/api/telegram/poll/
git commit -m "feat: add Telegram polling controller and routes"
```

---

### Task 7: Log Endpoint

**Files:**
- Create: `app/api/telegram/log/route.ts`

- [ ] **Step 1: Create the log route**

Create `app/api/telegram/log/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getTelegramLog } from '@/lib/telegram-log';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const limit = Number(req.nextUrl.searchParams.get('limit') || '50');
  const log = getTelegramLog(limit);
  return NextResponse.json(log);
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd ~/Projects/ground-control && npx tsc --noEmit 2>&1 | head -20`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add app/api/telegram/log/route.ts
git commit -m "feat: add Telegram log endpoint"
```

---

### Task 8: Config Template Update

**Files:**
- Modify: `ground-control.config.example.ts`

- [ ] **Step 1: Add telegram section to example config**

Add after the `gemini` block in `ground-control.config.example.ts`:

```typescript
  telegram: {
    botToken: "",           // Get from @BotFather on Telegram
    userId: 0,              // Your Telegram user ID (security filter)
    groups: {               // charName -> Telegram group chat ID
      // postman: -1001234567001,
      // scholar: -1001234567002,
      // coach:   -1001234567003,
    },
  },
```

- [ ] **Step 2: Commit**

```bash
git add ground-control.config.example.ts
git commit -m "feat: add Telegram config to example config"
```

---

### Task 9: Scheduled Jobs Migration

**Files:**
- Modify: `ground-control.config.ts` (12 job seed prompts)

This task updates all scheduled jobs that currently email or WhatsApp Kerem to use the Telegram send endpoint instead.

- [ ] **Step 1: Update coach-morning seed prompt**

In `ground-control.config.ts`, find the `coach-morning` job and replace the WhatsApp send instructions in its `seedPrompt` with:

```
After composing the nudge, post it to your Telegram group:
curl -sf -X POST http://localhost:3000/api/telegram/send -H "Content-Type: application/json" -d "$(jq -n --arg msg "Coach: [your nudge text here]" '{"charName":"coach","message":$msg}')"
```

Remove any references to `mcp__whatsapp__send_message` or `905307704531@s.whatsapp.net`.

- [ ] **Step 2: Update tutor-daily seed prompt**

Replace email and WhatsApp instructions with Telegram send. The tutor posts lessons and prompts to the tutor group instead.

- [ ] **Step 3: Update tutor-writing-afternoon seed prompt**

Replace WhatsApp prompt/feedback sending with Telegram.

- [ ] **Step 4: Update postman-context-questions seed prompt**

Replace WhatsApp send with Telegram post to postman group.

- [ ] **Step 5: Update morning-brief seed prompt**

Replace `mcp__gmail__send_email` with Telegram send to postman group.

- [ ] **Step 6: Update scholar-daily seed prompt**

Replace "email the report to kerem.ozan@gmail.com" with Telegram send to scholar group.

- [ ] **Step 7: Update scholar-tend seed prompt**

Same pattern: email report -> Telegram scholar group.

- [ ] **Step 8: Update coach-weekly seed prompt**

Email report -> Telegram coach group.

- [ ] **Step 9: Update kybernetes-weekly seed prompt**

Email report -> Telegram kybernetes group.

- [ ] **Step 10: Update curator-weekly seed prompt**

Email report -> Telegram curator group.

- [ ] **Step 11: Update oracle-weekly seed prompt**

Email report -> Telegram oracle group.

- [ ] **Step 12: Update oracle-monthly seed prompt**

Add Telegram post to oracle group (was Tana-only before).

- [ ] **Step 13: Verify changes**

Run: `cd ~/Projects/ground-control && npm run dev`
Start the dev server to verify config loads without errors. Note: `ground-control.config.ts` is git-ignored, so no commit needed for this task.

---

### Task 10: CLAUDE.md and Skill Updates

**Files:**
- Modify: `~/CLAUDE.md`
- Modify: `~/.claude/skills/coach-checkin/SKILL.md`
- Modify: `~/.claude/skills/tutor-lesson/SKILL.md`

Note: files under `~/.claude/` must be written via `Bash(python3 ...)` per the FILE WRITE RULE.

- [ ] **Step 1: Update CLAUDE.md SELF-MESSAGE EXCEPTION**

Find the SELF-MESSAGE EXCEPTION section and replace it with:
```
- SELF-MESSAGE EXCEPTION: Characters MAY auto-post to their Telegram group via POST http://localhost:3000/api/telegram/send. This is the primary channel for all crew-to-Kerem communication (reports, nudges, prompts, questions). Auto-send to kerem.ozan@gmail.com is no longer used for reports.
```

- [ ] **Step 2: Update CLAUDE.md REPORT EMAIL RULE**

Find the REPORT EMAIL RULE section and replace it with:
```
- REPORT RULE: When any character produces a report, review, or analysis (scheduled or on demand), ALWAYS post it to your Telegram group via POST http://localhost:3000/api/telegram/send with your charName and the report as a text message. Also write to Tana as before. No asking, no offering, just post it. Subject format for the message: "[Character] [Report Type] -- [date]".
```

- [ ] **Step 3: Update coach-checkin skill**

In `~/.claude/skills/coach-checkin/SKILL.md`, replace all WhatsApp send instructions (`mcp__whatsapp__send_message`, `905307704531@s.whatsapp.net`) with:
```
Post the morning nudge to your Telegram group:
curl -sf -X POST http://localhost:3000/api/telegram/send \
  -H "Content-Type: application/json" \
  -d '{"charName":"coach","message":"Coach: [your nudge text]"}'
```

- [ ] **Step 4: Update tutor-lesson skill**

In `~/.claude/skills/tutor-lesson/SKILL.md`, replace all WhatsApp send instructions and email lesson delivery with Telegram posts to the tutor group. Same curl pattern with `charName: "tutor"`.

- [ ] **Step 5: Commit CLAUDE.md**

```bash
git add ~/CLAUDE.md
git commit -m "feat: update CLAUDE.md rules for Telegram crew channels"
```

---

### Task 11: Integration Test

**Files:** None (manual testing)

This task verifies end-to-end. Requires the bot to be set up first (BotFather, groups created, config populated).

- [ ] **Step 1: Start GC dev server**

Run: `cd ~/Projects/ground-control && npm run dev`

- [ ] **Step 2: Start Telegram polling**

Run: `curl -s http://localhost:3000/api/telegram/poll/start | jq`
Expected: `{ "status": "started", "botUsername": "YourBotName" }`

- [ ] **Step 3: Test outbound (send endpoint)**

Run: `curl -sf -X POST http://localhost:3000/api/telegram/send -H "Content-Type: application/json" -d '{"charName":"coach","message":"Test message from GC"}' | jq`
Expected: `{ "ok": true, "messageId": <number> }`
Verify: message appears in the Coach Telegram group.

- [ ] **Step 4: Test inbound (send a message in a character group)**

In Telegram, go to the Coach group and type "What's on my calendar today?"
Expected: bot posts a response from Coach (may take 10-30s for spawnAndCollect).

- [ ] **Step 5: Check polling status**

Run: `curl -s http://localhost:3000/api/telegram/poll/status | jq`
Expected: `{ "running": true, "botUsername": "YourBotName" }`

- [ ] **Step 6: Check telegram log**

Run: `curl -s http://localhost:3000/api/telegram/log | jq`
Expected: log entries for both the outbound test and inbound test.

- [ ] **Step 7: Stop polling**

Run: `curl -s http://localhost:3000/api/telegram/poll/stop | jq`
Expected: `{ "status": "stopped" }`

---

### Task 12: Run All Tests

- [ ] **Step 1: Run full test suite**

Run: `cd ~/Projects/ground-control && npx vitest run 2>&1`
Expected: All tests pass, including the new telegram tests.

- [ ] **Step 2: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: resolve test issues from Telegram integration"
```
