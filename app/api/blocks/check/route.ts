import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { TELEGRAM_GROUPS, TELEGRAM_BOT_TOKEN } from '@/lib/config';
import { sendMessage, InlineKeyboardMarkup } from '@/lib/telegram';
import { logTelegramEntry } from '@/lib/telegram-log';

export const runtime = 'nodejs';

const BLOCKS_FILE = path.join(process.cwd(), 'data', 'today-blocks.json');

type BlockEntry = {
  end: string;
  description: string;
  status: 'planned' | 'done' | 'partial' | 'skipped' | 'stuck' | 'extended';
  nudgeSent: boolean;
};

type BlocksState = {
  date: string;
  blocks: BlockEntry[];
  crashDetected: boolean;
};

function readBlocks(): BlocksState | null {
  try {
    if (!fs.existsSync(BLOCKS_FILE)) return null;
    return JSON.parse(fs.readFileSync(BLOCKS_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

function writeBlocks(state: BlocksState): void {
  fs.writeFileSync(BLOCKS_FILE, JSON.stringify(state, null, 2));
}

function isBlockOverdue(endTime: string, date: string): boolean {
  const now = new Date();
  const [hours, minutes] = endTime.split(':').map(Number);
  const blockEnd = new Date(`${date}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00+03:00`);
  return now.getTime() > blockEnd.getTime();
}

function checkCrashCondition(blocks: BlockEntry[]): boolean {
  // Check for 2 consecutive stuck/skipped in original block order
  // "extended" resets the consecutive count (user was still working)
  let consecutive = 0;
  for (const block of blocks) {
    if (block.status === 'stuck' || block.status === 'skipped') {
      consecutive++;
      if (consecutive >= 2) return true;
    } else if (block.status === 'done' || block.status === 'partial' || block.status === 'extended') {
      consecutive = 0; // Reset on any non-failure status
    }
    // 'planned' blocks don't affect the count (not yet reached)
  }
  return false;
}

/**
 * GET: Check blocks and send nudges for overdue ones.
 * Called every 15 minutes by the scheduler.
 */
export async function GET() {
  if (!TELEGRAM_BOT_TOKEN) {
    return NextResponse.json({ ok: true, skipped: 'no telegram' });
  }

  const state = readBlocks();
  if (!state) {
    return NextResponse.json({ ok: true, skipped: 'no blocks registered' });
  }

  // Check if blocks are for today
  const today = new Date().toISOString().split('T')[0];
  if (state.date !== today) {
    return NextResponse.json({ ok: true, skipped: 'blocks not for today' });
  }

  const groupId = TELEGRAM_GROUPS['kybernetes'];
  if (!groupId) {
    return NextResponse.json({ ok: true, skipped: 'no kybernetes telegram group' });
  }

  const nudgesSent: string[] = [];

  for (let i = 0; i < state.blocks.length; i++) {
    const block = state.blocks[i];
    if (block.nudgeSent) continue;
    if (block.status !== 'planned' && block.status !== 'extended') continue;
    if (!isBlockOverdue(block.end, state.date)) continue;

    // Send nudge with inline keyboard
    const replyMarkup: InlineKeyboardMarkup = {
      inline_keyboard: [[
        { text: 'Done', callback_data: `block:${i}:done` },
        { text: 'Still going', callback_data: `block:${i}:extended` },
        { text: 'Stuck', callback_data: `block:${i}:stuck` },
        { text: 'Skipped', callback_data: `block:${i}:skipped` },
      ]],
    };

    const text = `Block done: ${block.description}?`;

    try {
      const result = await sendMessage(groupId, text, undefined, replyMarkup);
      block.nudgeSent = true;
      nudgesSent.push(block.description);

      logTelegramEntry({
        id: `nudge-${Date.now()}`,
        direction: 'outbound',
        charName: 'kybernetes',
        groupId,
        messageId: result.message_id,
        text: text.slice(0, 500),
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error(`[blocks] Failed to send nudge for block ${i}:`, err);
    }
  }

  writeBlocks(state);

  return NextResponse.json({
    ok: true,
    nudgesSent,
    crashDetected: state.crashDetected,
  });
}

/**
 * POST: Update a block's status.
 * Called by Telegram callback handler or Kybernetes.
 * Body: { blockIndex: number, status: string, note?: string }
 */
export async function POST(req: Request) {
  const body = await req.json();
  const { blockIndex, status, note } = body as {
    blockIndex?: number;
    status?: string;
    note?: string;
  };

  if (blockIndex === undefined || !status) {
    return NextResponse.json({ error: 'blockIndex and status required' }, { status: 400 });
  }

  const state = readBlocks();
  if (!state) {
    return NextResponse.json({ error: 'no blocks registered' }, { status: 404 });
  }

  if (blockIndex < 0 || blockIndex >= state.blocks.length) {
    return NextResponse.json({ error: 'invalid block index' }, { status: 400 });
  }

  state.blocks[blockIndex].status = status as BlockEntry['status'];

  // Check crash condition after status update
  if (!state.crashDetected && checkCrashCondition(state.blocks)) {
    state.crashDetected = true;

    // Spawn Coach with crash response prompt
    try {
      const scheduleUrl = new URL('/api/schedule/run', 'http://localhost:3000');
      await fetch(scheduleUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          charName: 'coach',
          seedPrompt: `Crash detected. Kybernetes reports two consecutive stuck/skipped blocks today. Send ONE supportive Telegram message to the Coach group. Reference a specific pattern from mind-patterns.md if applicable (e.g., free-day morning crash, glycemic dip). Do not ask follow-up questions. One message only.`,
        }),
      });
    } catch (err) {
      console.error('[blocks] Failed to spawn Coach crash response:', err);
    }

    // Switch remaining planned blocks to low-energy mode marker
    for (const block of state.blocks) {
      if (block.status === 'planned') {
        block.description = `[low-energy] ${block.description}`;
      }
    }
  }

  writeBlocks(state);

  return NextResponse.json({
    ok: true,
    block: state.blocks[blockIndex],
    crashDetected: state.crashDetected,
    blocks: state.blocks,
  });
}
