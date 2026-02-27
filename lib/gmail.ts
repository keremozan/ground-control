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
