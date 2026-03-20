export const runtime = 'nodejs';
import { archiveEmail, trashEmail, getEmailBody, getEmailImages } from '@/lib/gmail';
import { createTask } from '@/lib/tana';
import { spawnAndCollect } from '@/lib/spawn';
import { apiOk, apiError } from '@/lib/api-helpers';
import { captureError } from '@/lib/errors';

export async function POST(req: Request) {
  const body = await req.json() as {
    action: string;
    emailId?: string;
    threadId?: string;
    account?: string;
    from?: string;
    subject?: string;
    text?: string;
  };
  const { action, emailId, threadId, account, from, subject, text } = body;

  if (!action) {
    return apiError(400, 'action required');
  }

  // Text-only actions (no email context needed)
  if (action === 'summarize-text') {
    if (!text) return apiError(400, 'text required');
    try {
      const prompt = `Compress this conversation into a concise summary. Keep key facts, decisions, and context. Be brief.\n\n${text}`;
      const { response } = await spawnAndCollect({ prompt, model: 'haiku', maxTurns: 1, label: 'Compress chat' });
      return apiOk({ summary: response });
    } catch (e) {
      captureError('inbox/action/summarize-text', e);
      return apiError(500, String(e));
    }
  }

  if (!emailId || !account) {
    return apiError(400, 'emailId and account required');
  }

  try {
    if (action === 'archive') {
      // Use threadId for thread-level archive, fall back to emailId
      await archiveEmail(account, threadId || emailId);
      return apiOk({ message: 'Archived' });
    }

    if (action === 'delete') {
      // Use threadId for thread-level trash, fall back to emailId
      await trashEmail(account, threadId || emailId);
      return apiOk({ message: 'Deleted' });
    }

    if (action === 'body') {
      const body = await getEmailBody(account, emailId);
      return apiOk({ body });
    }

    if (action === 'summarize') {
      const emailBody = await getEmailBody(account, emailId);

      // 1. Text first — if enough text, summarize directly (fast, haiku)
      if (emailBody.trim().length > 200) {
        const prompt = `Summarize this email concisely. Key points and any action items. Be brief, direct, no fluff.\n\nFrom: ${from}\nSubject: ${subject}\n\n${emailBody}`;
        const { response } = await spawnAndCollect({
          prompt, model: 'haiku', maxTurns: 1,
          label: `Summarize: ${subject}`,
        });
        return apiOk({ summary: response });
      }

      // 2. Not enough text — try extracting images (attachments, inline, HTML URLs)
      let imagePaths: string[] = [];
      try { imagePaths = await getEmailImages(account, emailId); } catch {}

      if (imagePaths.length > 0) {
        const prompt = `Read the image(s) below and summarize the email content. Key points, deadlines, action items. Be brief, direct. Do NOT describe what the images look like or mention file formats — just extract and summarize the actual information.\n\nFrom: ${from}\nSubject: ${subject}\n${emailBody ? `\nText from email:\n${emailBody}\n` : ''}\nImage files to read (use the Read tool on each):\n${imagePaths.map(p => `- ${p}`).join('\n')}`;
        const { response } = await spawnAndCollect({
          prompt, model: 'sonnet', maxTurns: 3,
          label: `Summarize: ${subject}`,
        });
        return apiOk({ summary: response });
      }

      // 3. No text, no images — last resort: agent with MCP tools
      const mcpTool = account === 'school' ? 'mcp__gmail-school__read_email' : 'mcp__gmail__read_email';
      const dlTool = account === 'school' ? 'mcp__gmail-school__download_attachment' : 'mcp__gmail__download_attachment';
      const prompt = `This email has no readable text or images. Use tools to extract content:\n\n1. Use ${mcpTool} with message_id "${emailId}" to read the full email.\n2. Use ${dlTool} to download any attachments, then Read the files.\n3. If there are URLs, use WebFetch on the main one.\n4. Summarize: key points, deadlines, action items. Brief, direct.\n\nFrom: ${from}\nSubject: ${subject}`;
      const { response } = await spawnAndCollect({
        prompt, model: 'sonnet', maxTurns: 5,
        label: `Summarize: ${subject}`,
      });
      return apiOk({ summary: response });
    }

    if (action === 'postman') {
      const body = await getEmailBody(account, emailId);
      await createTask({
        title: subject || 'Email from ' + (from || 'unknown'),
        context: `From: ${from} | Subject: ${subject} | Account: ${account}`,
        body,
        assigned: 'postman',
        priority: 'medium',
      });
      return apiOk({ message: 'Task created' });
    }

    return apiError(400, `Unknown direct action: ${action}`);
  } catch (e) {
    captureError('inbox/action', e);
    return apiError(500, String(e));
  }
}
