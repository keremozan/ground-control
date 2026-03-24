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
