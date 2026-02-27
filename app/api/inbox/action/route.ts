export const runtime = 'nodejs';
import { archiveEmail, trashEmail, getEmailBody, getEmailImages } from '@/lib/gmail';
import { createTask } from '@/lib/tana';
import { spawnAndCollect } from '@/lib/spawn';

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
    return Response.json({ error: 'action required' }, { status: 400 });
  }

  // Text-only actions (no email context needed)
  if (action === 'summarize-text') {
    if (!text) return Response.json({ error: 'text required' }, { status: 400 });
    try {
      const prompt = `Compress this conversation into a concise summary. Keep key facts, decisions, and context. Be brief.\n\n${text}`;
      const { response } = await spawnAndCollect({ prompt, model: 'haiku', maxTurns: 1, label: 'Compress chat' });
      return Response.json({ ok: true, summary: response });
    } catch (e) {
      return Response.json({ error: String(e) }, { status: 500 });
    }
  }

  if (!emailId || !account) {
    return Response.json({ error: 'emailId and account required' }, { status: 400 });
  }

  try {
    if (action === 'archive') {
      // Use threadId for thread-level archive, fall back to emailId
      await archiveEmail(account, threadId || emailId);
      return Response.json({ ok: true, message: 'Archived' });
    }

    if (action === 'delete') {
      // Use threadId for thread-level trash, fall back to emailId
      await trashEmail(account, threadId || emailId);
      return Response.json({ ok: true, message: 'Deleted' });
    }

    if (action === 'body') {
      const body = await getEmailBody(account, emailId);
      return Response.json({ ok: true, body });
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
        return Response.json({ ok: true, summary: response });
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
        return Response.json({ ok: true, summary: response });
      }

      // 3. No text, no images — last resort: agent with MCP tools
      const mcpTool = account === 'school' ? 'mcp__gmail-school__read_email' : 'mcp__gmail__read_email';
      const dlTool = account === 'school' ? 'mcp__gmail-school__download_attachment' : 'mcp__gmail__download_attachment';
      const prompt = `This email has no readable text or images. Use tools to extract content:\n\n1. Use ${mcpTool} with message_id "${emailId}" to read the full email.\n2. Use ${dlTool} to download any attachments, then Read the files.\n3. If there are URLs, use WebFetch on the main one.\n4. Summarize: key points, deadlines, action items. Brief, direct.\n\nFrom: ${from}\nSubject: ${subject}`;
      const { response } = await spawnAndCollect({
        prompt, model: 'sonnet', maxTurns: 5,
        label: `Summarize: ${subject}`,
      });
      return Response.json({ ok: true, summary: response });
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
      return Response.json({ ok: true, message: 'Task created' });
    }

    return Response.json({ error: `Unknown direct action: ${action}` }, { status: 400 });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
