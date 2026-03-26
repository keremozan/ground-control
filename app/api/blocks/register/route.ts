import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';

const BLOCKS_FILE = path.join(process.cwd(), 'data', 'today-blocks.json');

export type BlockEntry = {
  end: string;          // "HH:MM"
  description: string;
  status: 'planned' | 'done' | 'partial' | 'skipped' | 'stuck' | 'extended';
  nudgeSent: boolean;
};

export type MeetingPrepEntry = {
  time: string;         // "HH:MM" — meeting start time
  prepTime: string;     // "HH:MM" — when to send prep (10 min before)
  person: string;       // Name of the person
  title: string;        // Calendar event title
  sent: boolean;
};

export type BlocksState = {
  date: string;         // "YYYY-MM-DD"
  blocks: BlockEntry[];
  meetingPreps: MeetingPrepEntry[];
  crashDetected: boolean;
};

/** POST: Register today's blocks and meeting preps */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { date, blocks, meetingPreps } = body as {
    date?: string;
    blocks?: Array<{ end: string; description: string }>;
    meetingPreps?: Array<{ time: string; person: string; title: string }>;
  };

  if (!date) {
    return NextResponse.json({ error: 'date required' }, { status: 400 });
  }

  // Read existing state to allow incremental updates (blocks and preps can be registered separately)
  let existing: BlocksState | null = null;
  try {
    if (fs.existsSync(BLOCKS_FILE)) {
      existing = JSON.parse(fs.readFileSync(BLOCKS_FILE, 'utf-8'));
      if (existing && existing.date !== date) existing = null; // different day, start fresh
    }
  } catch { /* start fresh */ }

  const state: BlocksState = {
    date,
    blocks: blocks
      ? blocks.map(b => ({ end: b.end, description: b.description, status: 'planned' as const, nudgeSent: false }))
      : (existing?.blocks || []),
    meetingPreps: meetingPreps
      ? meetingPreps.map(m => {
          // Calculate prep time: 10 minutes before meeting
          const [h, min] = m.time.split(':').map(Number);
          const totalMin = h * 60 + min - 10;
          const prepH = String(Math.floor(totalMin / 60)).padStart(2, '0');
          const prepM = String(totalMin % 60).padStart(2, '0');
          return { time: m.time, prepTime: `${prepH}:${prepM}`, person: m.person, title: m.title, sent: false };
        })
      : (existing?.meetingPreps || []),
    crashDetected: existing?.crashDetected || false,
  };

  fs.writeFileSync(BLOCKS_FILE, JSON.stringify(state, null, 2));
  return NextResponse.json({ ok: true, blockCount: state.blocks.length, prepCount: state.meetingPreps.length });
}

/** GET: Read current blocks state */
export async function GET() {
  try {
    if (!fs.existsSync(BLOCKS_FILE)) {
      return NextResponse.json({ ok: true, data: null });
    }
    const raw = fs.readFileSync(BLOCKS_FILE, 'utf-8');
    const state: BlocksState = JSON.parse(raw);
    return NextResponse.json({ ok: true, data: state });
  } catch {
    return NextResponse.json({ ok: true, data: null });
  }
}
