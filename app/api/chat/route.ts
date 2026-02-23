export const runtime = 'nodejs';
import { buildCharacterPrompt } from '@/lib/prompt';
import { getCharacters } from '@/lib/characters';
import { spawnSSEStream } from '@/lib/spawn';

export async function POST(req: Request) {
  const { characterId, message } = await req.json() as { characterId: string; message: string };

  const characters = getCharacters();
  const char = characters[characterId];
  if (!char) {
    return new Response('Character not found', { status: 404 });
  }

  const prompt = buildCharacterPrompt(characterId, message);
  const stream = spawnSSEStream({
    prompt,
    model: char.defaultModel || 'sonnet',
    maxTurns: 10,
    label: `Chat: ${char.name}`,
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
