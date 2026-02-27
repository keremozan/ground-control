export const runtime = 'nodejs';
import { ACTION_CHARACTERS } from '@/lib/tasks';
import { buildCharacterPrompt } from '@/lib/prompt';
import { getCharacters } from '@/lib/characters';
import { spawnSSEStream } from '@/lib/spawn';
import { getEmailBody } from '@/lib/gmail';

const ACTION_PROMPTS: Record<string, (email: { from: string; subject: string }, body?: string) => string> = {
  'reply': (e, body) => `Draft a reply to this email. Save it as a Gmail draft using draft_email. IMPORTANT: When creating a threaded draft, you MUST set BOTH threadId AND inReplyTo — Gmail will not display the draft without inReplyTo. Never send emails directly — only create drafts.\n\nFrom: ${e.from}\nSubject: ${e.subject}\n\nEmail body:\n${body || '(could not fetch body)'}`,
  'task': (e, body) => `Extract actionable tasks from this email and push them to Tana.\n\nFrom: ${e.from}\nSubject: ${e.subject}\n\nEmail body:\n${body || '(could not fetch body)'}`,
  'schedule': (e, body) => `Create a calendar event or reminder from this email.\n\nFrom: ${e.from}\nSubject: ${e.subject}\n\nEmail body:\n${body || '(could not fetch body)'}`,
  'archive': (e) => `Archive this email.\n\nFrom: ${e.from}\nSubject: ${e.subject}`,
  'summarize': (e, body) => `Summarize this email in 2-3 sentences.\n\nFrom: ${e.from}\nSubject: ${e.subject}\n\nEmail body:\n${body || '(could not fetch body)'}`,
};

export async function POST(req: Request) {
  const { action, email } = await req.json() as {
    action: string;
    email: { from: string; subject: string; account: string; emailId?: string };
  };

  const characterId = ACTION_CHARACTERS[action] || 'postman';
  const characters = getCharacters();
  const char = characters[characterId];
  const promptFn = ACTION_PROMPTS[action];

  if (!promptFn) {
    return new Response('Unknown action', { status: 400 });
  }

  let body: string | undefined;
  if (email.emailId && action !== 'archive') {
    try {
      body = await getEmailBody(email.account, email.emailId);
    } catch {}
  }
  const taskContext = promptFn(email, body);
  const prompt = buildCharacterPrompt(characterId, taskContext);

  const stream = spawnSSEStream({
    prompt,
    model: char?.defaultModel || 'sonnet',
    maxTurns: 10,
    label: `${action}: ${email.from}`,
    characterId,
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
