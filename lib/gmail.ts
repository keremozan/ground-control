import { getGmailToken } from './google-auth';

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';

export type EmailSummary = {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  snippet: string;
  date: string;
  unread: boolean;
  account: string;
  labels: string[];
  threadCount: number;
};

const SYSTEM_LABELS = new Set([
  'INBOX', 'SENT', 'DRAFT', 'TRASH', 'SPAM', 'UNREAD', 'STARRED',
  'IMPORTANT', 'CATEGORY_PERSONAL', 'CATEGORY_SOCIAL', 'CATEGORY_PROMOTIONS',
  'CATEGORY_UPDATES', 'CATEGORY_FORUMS', 'CHAT',
]);

async function gmailFetch(path: string, account: string, opts?: RequestInit) {
  const token = await getGmailToken(account);
  const res = await fetch(`${GMAIL_API}${path}`, {
    ...opts,
    cache: 'no-store',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...opts?.headers },
  });
  if (!res.ok) throw new Error(`Gmail API ${res.status}: ${await res.text()}`);
  return res.json();
}

function parseHeader(headers: { name: string; value: string }[], name: string): string {
  return headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';
}

function parseFrom(raw: string): string {
  const match = raw.match(/^"?([^"<]+)"?\s*</);
  return match ? match[1].trim() : raw.split('@')[0];
}

/** Fetch user-created label ID→name map */
async function getLabelMap(account: string): Promise<Map<string, string>> {
  const data = await gmailFetch('/labels', account);
  const map = new Map<string, string>();
  for (const label of data.labels || []) {
    if (!SYSTEM_LABELS.has(label.id)) {
      // Use the last segment for nested labels (e.g. "Work/Projects" → "Projects")
      const name: string = label.name || '';
      const short = name.includes('/') ? name.split('/').pop()! : name;
      map.set(label.id, short.toLowerCase());
    }
  }
  return map;
}

/** Fetch email body as plain text */
export async function getEmailBody(account: string, messageId: string): Promise<string> {
  const msg = await gmailFetch(`/messages/${messageId}?format=full`, account);
  const payload = msg.payload;
  if (!payload) return msg.snippet || '';

  function findPart(part: Record<string, unknown>, mime: string): string | null {
    if (part.mimeType === mime && part.body) {
      const data = (part.body as Record<string, unknown>).data as string | undefined;
      if (data) return Buffer.from(data, 'base64url').toString('utf-8');
    }
    const parts = part.parts as Record<string, unknown>[] | undefined;
    if (parts) {
      for (const p of parts) {
        const found = findPart(p, mime);
        if (found) return found;
      }
    }
    return null;
  }

  // Prefer plain text, fall back to HTML with tags stripped
  const plain = findPart(payload, 'text/plain');
  if (plain) return plain;

  const html = findPart(payload, 'text/html');
  if (html) {
    return html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#?\w+;/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  return msg.snippet || '';
}

/** Extract images from an email (attachments, inline, and HTML img URLs). Returns saved file paths. */
export async function getEmailImages(account: string, messageId: string): Promise<string[]> {
  const { writeFile, mkdir } = await import('fs/promises');
  const pathMod = await import('path');
  const os = await import('os');

  const msg = await gmailFetch(`/messages/${messageId}?format=full`, account);
  const payload = msg.payload;
  if (!payload) return [];

  const dir = pathMod.join(os.tmpdir(), `gc-email-${messageId}`);
  await mkdir(dir, { recursive: true });
  const paths: string[] = [];
  let imgIdx = 0;

  // 1. Find image MIME parts (attachments + inline with attachmentId)
  const attachments: { attachmentId: string; filename: string }[] = [];
  const inlineData: { data: string; filename: string }[] = [];

  function findImages(part: Record<string, unknown>) {
    const mime = part.mimeType as string || '';
    if (mime.startsWith('image/') && part.body) {
      const body = part.body as Record<string, unknown>;
      const ext = mime.split('/')[1]?.replace(/\+.*/, '') || 'png';
      const filename = (part.filename as string) || `image-${imgIdx++}.${ext}`;
      const attachmentId = body.attachmentId as string | undefined;
      const data = body.data as string | undefined;
      if (attachmentId) {
        attachments.push({ attachmentId, filename });
      } else if (data) {
        inlineData.push({ data, filename });
      }
    }
    const parts = part.parts as Record<string, unknown>[] | undefined;
    if (parts) parts.forEach(findImages);
  }
  findImages(payload);

  // Download attachments via Gmail API
  for (const img of attachments.slice(0, 3)) {
    try {
      const att = await gmailFetch(`/messages/${messageId}/attachments/${img.attachmentId}`, account);
      const buf = Buffer.from(att.data, 'base64url');
      const filePath = pathMod.join(dir, img.filename);
      await writeFile(filePath, buf);
      paths.push(filePath);
    } catch {}
  }

  // Save inline images (data directly in body)
  for (const img of inlineData.slice(0, 3 - paths.length)) {
    try {
      const buf = Buffer.from(img.data, 'base64url');
      const filePath = pathMod.join(dir, img.filename);
      await writeFile(filePath, buf);
      paths.push(filePath);
    } catch {}
  }

  // 2. Extract image URLs from HTML body and download
  if (paths.length === 0) {
    function findHtml(part: Record<string, unknown>): string | null {
      if (part.mimeType === 'text/html' && part.body) {
        const data = (part.body as Record<string, unknown>).data as string | undefined;
        if (data) return Buffer.from(data, 'base64url').toString('utf-8');
      }
      const parts = part.parts as Record<string, unknown>[] | undefined;
      if (parts) {
        for (const p of parts) { const r = findHtml(p); if (r) return r; }
      }
      return null;
    }

    const html = findHtml(payload);
    if (html) {
      const urlRegex = /<img[^>]+src=["']([^"']+)["']/gi;
      const urls: string[] = [];
      let m;
      while ((m = urlRegex.exec(html)) !== null) {
        const src = m[1];
        if (src.startsWith('http') && !src.includes('tracking') && !src.includes('1x1') && !src.includes('pixel')) {
          urls.push(src);
        }
      }
      // Download up to 3 external images
      for (const url of urls.slice(0, 3)) {
        try {
          const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
          if (!res.ok) continue;
          const ct = res.headers.get('content-type') || '';
          if (!ct.startsWith('image/')) continue;
          const ext = ct.split('/')[1]?.split(';')[0] || 'png';
          const buf = Buffer.from(await res.arrayBuffer());
          if (buf.length < 500) continue; // skip tiny tracking pixels
          const filePath = pathMod.join(dir, `web-image-${imgIdx++}.${ext}`);
          await writeFile(filePath, buf);
          paths.push(filePath);
        } catch {}
      }
    }
  }

  return paths;
}

/** Archive a thread (remove INBOX label from all messages) */
export async function archiveEmail(account: string, threadId: string) {
  await gmailFetch(`/threads/${threadId}/modify`, account, {
    method: 'POST',
    body: JSON.stringify({ removeLabelIds: ['INBOX'] }),
  });
}

/** Trash a thread */
export async function trashEmail(account: string, threadId: string) {
  await gmailFetch(`/threads/${threadId}/trash`, account, { method: 'POST' });
}

/** Get unread count for INBOX */
export async function getUnreadCount(account: string): Promise<number> {
  const label = await gmailFetch('/labels/INBOX', account);
  return label.messagesUnread || 0;
}

/** Get recent inbox threads with real message counts and Gmail labels */
export async function getRecentThreads(account: string, maxResults = 8): Promise<EmailSummary[]> {
  const [list, labelMap] = await Promise.all([
    gmailFetch(`/threads?maxResults=${maxResults}&labelIds=INBOX&q=${encodeURIComponent('-category:promotions -category:social -category:forums')}`, account),
    getLabelMap(account),
  ]);

  if (!list.threads?.length) return [];

  const threads = await Promise.all(
    list.threads.map(async (t: { id: string }) => {
      try {
        const thread = await gmailFetch(
          `/threads/${t.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
          account,
        );
        const messages: unknown[] = thread.messages || [];
        const latest = messages[messages.length - 1] as Record<string, unknown>;
        const payload = latest?.payload as Record<string, unknown> | undefined;
        const headers = (payload?.headers || []) as { name: string; value: string }[];
        const from = parseFrom(parseHeader(headers, 'From'));
        const subject = parseHeader(headers, 'Subject') || '(no subject)';

        // Collect user labels across all messages in thread
        const labels = new Set<string>();
        for (const msg of messages) {
          const m = msg as Record<string, unknown>;
          for (const lid of (m.labelIds || []) as string[]) {
            const name = labelMap.get(lid);
            if (name) labels.add(name);
          }
        }

        return {
          id: (latest.id as string),
          threadId: t.id,
          from,
          subject,
          snippet: (latest.snippet as string) || '',
          date: parseHeader(headers, 'Date'),
          unread: ((latest.labelIds || []) as string[]).includes('UNREAD'),
          account,
          labels: [...labels].slice(0, 3),
          threadCount: messages.length,
        };
      } catch {
        return null;
      }
    })
  );

  return threads.filter((t): t is EmailSummary => t !== null);
}

// ── Pipeline functions ──────────────────────────

/** Get changes since a historyId. Returns new message IDs. */
export async function getHistoryChanges(account: string, startHistoryId: string): Promise<{
  messageIds: string[];
  newHistoryId: string;
}> {
  const messageIds: string[] = [];
  let pageToken: string | undefined;
  let latestHistoryId = startHistoryId;

  do {
    const params = new URLSearchParams({
      startHistoryId,
      historyTypes: 'messageAdded',
      labelId: 'INBOX',
    });
    if (pageToken) params.set('pageToken', pageToken);

    const data = await gmailFetch(`/history?${params}`, account);
    latestHistoryId = data.historyId || latestHistoryId;

    for (const record of data.history || []) {
      for (const added of record.messagesAdded || []) {
        const msg = added.message;
        if (msg?.id && msg.labelIds?.includes('INBOX')) {
          messageIds.push(msg.id);
        }
      }
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  return { messageIds: [...new Set(messageIds)], newHistoryId: latestHistoryId };
}

/** Get a single message with full metadata + snippet */
export async function getMessage(account: string, messageId: string): Promise<{
  id: string;
  threadId: string;
  from: string;
  fromRaw: string;
  subject: string;
  snippet: string;
  date: string;
  labels: string[];
}> {
  const msg = await gmailFetch(`/messages/${messageId}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`, account);
  const headers = (msg.payload?.headers || []) as { name: string; value: string }[];
  const fromRaw = parseHeader(headers, 'From');
  return {
    id: msg.id,
    threadId: msg.threadId,
    from: parseFrom(fromRaw),
    fromRaw,
    subject: parseHeader(headers, 'Subject') || '(no subject)',
    snippet: msg.snippet || '',
    date: parseHeader(headers, 'Date'),
    labels: (msg.labelIds || []) as string[],
  };
}

/** Set up Gmail push notifications. Returns expiration timestamp. */
export async function watchInbox(account: string, topicName: string): Promise<number> {
  const data = await gmailFetch('/watch', account, {
    method: 'POST',
    body: JSON.stringify({
      topicName,
      labelIds: ['INBOX'],
      labelFilterBehavior: 'include',
    }),
  });
  return Number(data.expiration);
}

/** Get current historyId for an account */
export async function getProfile(account: string): Promise<{ historyId: string; emailAddress: string }> {
  const data = await gmailFetch('/profile', account);
  return { historyId: data.historyId, emailAddress: data.emailAddress };
}

/** Search sent mail for recent replies to a specific email address */
export async function searchSentTo(account: string, toEmail: string, maxResults = 5): Promise<{ id: string; threadId: string; subject: string }[]> {
  const q = `in:sent to:${toEmail} newer_than:7d`;
  const data = await gmailFetch(`/messages?maxResults=${maxResults}&q=${encodeURIComponent(q)}`, account);
  if (!data.messages?.length) return [];
  const results = [];
  for (const m of data.messages.slice(0, maxResults)) {
    try {
      const msg = await gmailFetch(`/messages/${m.id}?format=metadata&metadataHeaders=Subject`, account);
      const headers = (msg.payload?.headers || []) as { name: string; value: string }[];
      results.push({ id: m.id, threadId: msg.threadId, subject: parseHeader(headers, 'Subject') });
    } catch {}
  }
  return results;
}

/** Search existing drafts for a recipient */
export async function searchDrafts(account: string, toEmail: string): Promise<{ id: string; subject: string }[]> {
  const data = await gmailFetch('/drafts?maxResults=10', account);
  if (!data.drafts?.length) return [];
  const results = [];
  for (const d of data.drafts.slice(0, 10)) {
    try {
      const draft = await gmailFetch(`/drafts/${d.id}`, account);
      const headers = (draft.message?.payload?.headers || []) as { name: string; value: string }[];
      const to = parseHeader(headers, 'To');
      if (to.toLowerCase().includes(toEmail.toLowerCase())) {
        results.push({ id: d.id, subject: parseHeader(headers, 'Subject') });
      }
    } catch {}
  }
  return results;
}

/** Create a Gmail draft */
export async function createDraft(account: string, opts: {
  to: string;
  subject: string;
  body: string;
  threadId?: string;
  inReplyTo?: string;
}): Promise<string> {
  const { to, subject, body, threadId, inReplyTo } = opts;
  const headers = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset=utf-8',
  ];
  if (inReplyTo) headers.push(`In-Reply-To: ${inReplyTo}`, `References: ${inReplyTo}`);
  const raw = Buffer.from(`${headers.join('\r\n')}\r\n\r\n${body}`).toString('base64url');

  const reqBody: Record<string, unknown> = { message: { raw } };
  if (threadId) reqBody.message = { ...reqBody.message as object, threadId };

  const data = await gmailFetch('/drafts', account, {
    method: 'POST',
    body: JSON.stringify(reqBody),
  });
  return data.id;
}
