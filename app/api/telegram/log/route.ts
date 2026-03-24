import { NextRequest, NextResponse } from 'next/server';
import { getTelegramLog } from '@/lib/telegram-log';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const limit = Number(req.nextUrl.searchParams.get('limit') || '50');
  const log = getTelegramLog(limit);
  return NextResponse.json(log);
}
