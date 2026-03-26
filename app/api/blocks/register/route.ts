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

export type BlocksState = {
  date: string;         // "YYYY-MM-DD"
  blocks: BlockEntry[];
  crashDetected: boolean;
};

/** POST: Register today's blocks (called by kybernetes-pulse after morning plan) */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { date, blocks } = body as {
    date?: string;
    blocks?: Array<{ end: string; description: string }>;
  };

  if (!date || !blocks || !Array.isArray(blocks)) {
    return NextResponse.json({ error: 'date and blocks[] required' }, { status: 400 });
  }

  const state: BlocksState = {
    date,
    blocks: blocks.map(b => ({
      end: b.end,
      description: b.description,
      status: 'planned',
      nudgeSent: false,
    })),
    crashDetected: false,
  };

  fs.writeFileSync(BLOCKS_FILE, JSON.stringify(state, null, 2));
  return NextResponse.json({ ok: true, blockCount: state.blocks.length });
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
