import { NextRequest, NextResponse } from 'next/server';
import { TELEGRAM_GROUPS, TELEGRAM_BOT_TOKEN } from '@/lib/config';
import { sendMessage, markdownToTelegramHTML, InlineKeyboardMarkup } from '@/lib/telegram';
import { logTelegramEntry, TelegramLogEntry } from '@/lib/telegram-log';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  if (!TELEGRAM_BOT_TOKEN) {
    return NextResponse.json({ error: 'Telegram not configured' }, { status: 503 });
  }

  const body = await req.json();
  const { charName, message, parseMode, replyMarkup } = body as {
    charName?: string;
    message?: string;
    parseMode?: string;
    replyMarkup?: InlineKeyboardMarkup;
  };

  if (!charName || !message) {
    return NextResponse.json({ error: 'charName and message required' }, { status: 400 });
  }

  const groupId = TELEGRAM_GROUPS[charName];
  if (!groupId) {
    return NextResponse.json({ error: `No Telegram group for "${charName}"` }, { status: 404 });
  }

  try {
    const formattedMessage = parseMode ? message : markdownToTelegramHTML(message);
    const effectiveParseMode = parseMode || 'HTML';
    const result = await sendMessage(groupId, formattedMessage, effectiveParseMode, replyMarkup);

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
