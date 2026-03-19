export const runtime = 'nodejs';
import { getHistoryChanges, getMessage, getProfile } from '@/lib/gmail';
import { readHistoryState, writeHistoryId } from '@/lib/job-state';
import { processEmail } from '@/lib/gmail-pipeline';
import { GMAIL_ACCOUNTS } from '@/lib/config';

// Debounce: collect notifications for 2 seconds before processing
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
const pendingAccounts = new Set<string>();
let processing = false;

async function processPendingAccounts() {
  if (processing) return;
  processing = true;
  const accounts = [...pendingAccounts];
  pendingAccounts.clear();

  for (const account of accounts) {
    await processAccount(account);
  }
  processing = false;
}

async function processAccount(account: string): Promise<{ processed: number; found?: number; historyId?: string; error?: string }> {
  try {
    const historyState = readHistoryState();
    const startHistoryId = historyState[account];

    // First run: set checkpoint, nothing to process
    if (!startHistoryId) {
      const profile = await getProfile(account);
      writeHistoryId(account, profile.historyId);
      return { processed: 0, historyId: profile.historyId };
    }

    const { messageIds, newHistoryId } = await getHistoryChanges(account, startHistoryId);
    writeHistoryId(account, newHistoryId);

    let processed = 0;
    for (const msgId of messageIds) {
      try {
        const email = await getMessage(account, msgId);
        // Skip sent messages (unless also in inbox, e.g. send-to-self)
        if (email.labels.includes('SENT') && !email.labels.includes('INBOX')) continue;
        await processEmail({ ...email, account });
        processed++;
      } catch {}
    }
    return { processed, found: messageIds.length, historyId: newHistoryId };
  } catch (err) {
    console.error(`Pipeline error for ${account}:`, err);
    return { processed: 0, error: String(err) };
  }
}

// POST: Gmail push notification from Pub/Sub
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const encoded = body.message?.data || '';
    const data = JSON.parse(Buffer.from(encoded, 'base64url').toString());
    const emailAddress: string = data.emailAddress || '';

    // Find matching account (process all accounts if we can't match)
    const matchedAccount = GMAIL_ACCOUNTS.find(() => true); // simplified; refined when email->account mapping exists
    if (matchedAccount) {
      pendingAccounts.add(matchedAccount);
    } else {
      for (const a of GMAIL_ACCOUNTS) pendingAccounts.add(a);
    }

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(processPendingAccounts, 2000);
  } catch {}

  // Always 200 to prevent Pub/Sub retries
  return Response.json({ ok: true });
}

// GET: Manual catch-up (startup, dashboard button)
export async function GET() {
  const results: { account: string; processed: number; error?: string }[] = [];

  for (const account of GMAIL_ACCOUNTS) {
    const result = await processAccount(account);
    results.push({ account, ...result });
  }

  return Response.json({ ok: true, results });
}
