export const runtime = 'nodejs';
import { getHistoryChanges, getMessage, getProfile } from '@/lib/gmail';
import { readHistoryState, writeHistoryId } from '@/lib/job-state';
import { processEmail } from '@/lib/gmail-pipeline';
import { GMAIL_ACCOUNTS } from '@/lib/config';

// Debounce: collect notifications for 2 seconds before processing
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
const pendingAccounts = new Set<string>();
let processing = false;

// Map email addresses to account names (populated on first profile fetch)
const emailToAccount = new Map<string, string>();

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

// Labels that indicate non-inbox messages we should skip
const SKIP_LABELS = new Set(['DRAFT', 'TRASH', 'SPAM']);

async function processAccount(account: string): Promise<{ processed: number; found?: number; historyId?: string; errors?: string[] }> {
  const errors: string[] = [];
  try {
    const historyState = readHistoryState();
    const startHistoryId = historyState[account];

    // First run: set checkpoint and populate email->account mapping
    if (!startHistoryId) {
      const profile = await getProfile(account);
      writeHistoryId(account, profile.historyId);
      emailToAccount.set(profile.emailAddress, account);
      return { processed: 0, historyId: profile.historyId };
    }

    const { messageIds, newHistoryId } = await getHistoryChanges(account, startHistoryId);
    writeHistoryId(account, newHistoryId);

    let processed = 0;
    for (const msgId of messageIds) {
      try {
        const email = await getMessage(account, msgId);
        // Skip non-inbox messages (drafts, trash, spam, sent-only)
        if (email.labels.some(l => SKIP_LABELS.has(l))) continue;
        if (email.labels.includes('SENT') && !email.labels.includes('INBOX')) continue;
        await processEmail({ ...email, account });
        processed++;
      } catch (err) {
        errors.push(`${msgId}: ${err}`);
      }
    }
    return { processed, found: messageIds.length, historyId: newHistoryId, errors: errors.length > 0 ? errors : undefined };
  } catch (err) {
    console.error(`Pipeline error for ${account}:`, err);
    return { processed: 0, errors: [String(err)] };
  }
}

// POST: Gmail push notification from Pub/Sub
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const encoded = body.message?.data || '';
    const data = JSON.parse(Buffer.from(encoded, 'base64url').toString());
    const emailAddress: string = data.emailAddress || '';

    // Match notification to account by email address
    const matchedAccount = emailToAccount.get(emailAddress);
    if (matchedAccount) {
      pendingAccounts.add(matchedAccount);
    } else {
      // Can't match -- process all accounts
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
  const results: { account: string; processed: number; errors?: string[] }[] = [];

  for (const account of GMAIL_ACCOUNTS) {
    // Populate email->account mapping on catch-up
    if (emailToAccount.size < GMAIL_ACCOUNTS.length) {
      try {
        const profile = await getProfile(account);
        emailToAccount.set(profile.emailAddress, account);
      } catch {}
    }
    const result = await processAccount(account);
    results.push({ account, ...result });
  }

  return Response.json({ ok: true, results });
}
