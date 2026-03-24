import { NextResponse } from 'next/server';
import { stopPolling } from '@/lib/telegram-poller';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json(stopPolling());
}
