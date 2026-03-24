import { NextResponse } from 'next/server';
import { getPollingStatus } from '@/lib/telegram-poller';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json(getPollingStatus());
}
