export const runtime = 'nodejs';
import { ACTION_CHARACTERS } from '@/lib/tasks';
import { buildCharacterPrompt } from '@/lib/prompt';
import { getCharacters } from '@/lib/characters';
import { spawnSSEStream } from '@/lib/spawn';

const ACTION_PROMPTS: Record<string, (email: { from: string; subject: string }) => string> = {
  'reply': (e) => `Draft a reply to this email.\n\nFrom: ${e.from}\nSubject: ${e.subject}`,
  'task': (e) => `Extract actionable tasks from this email and push them to Tana.\n\nFrom: ${e.from}\nSubject: ${e.subject}`,
  'schedule': (e) => `Create a calendar event or reminder from this email.\n\nFrom: ${e.from}\nSubject: ${e.subject}`,
  'archive': (e) => `Archive this email.\n\nFrom: ${e.from}\nSubject: ${e.subject}`,
  'summarize': (e) => `Summarize this email in 2-3 sentences.\n\nFrom: ${e.from}\nSubject: ${e.subject}`,
};

export async function POST(req: Request) {
  const { action, email } = await req.json() as {
    action: string;
    email: { from: string; subject: string; account: string };
  };

  const characterId = ACTION_CHARACTERS[action] || 'postman';
  const characters = getCharacters();
  const char = characters[characterId];
  const promptFn = ACTION_PROMPTS[action];

  if (!promptFn) {
    return new Response('Unknown action', { status: 400 });
  }

  const taskContext = promptFn(email);
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
