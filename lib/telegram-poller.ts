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

  botInfo = await getMe();
  console.log(`[telegram] Bot connected: @${botInfo.username}`);

  cleanupOldMedia();

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
