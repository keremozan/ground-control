export const runtime = 'nodejs';
import { validateSpawn, getCharacters } from '@/lib/characters';
import { buildCharacterPrompt } from '@/lib/prompt';
import { spawnAndCollect } from '@/lib/spawn';
import { serverLog } from '@/lib/server-log';
import { apiOk, apiError, requireFields } from '@/lib/api-helpers';
import { captureError } from '@/lib/errors';

export async function POST(req: Request) {
  const body = await req.json() as {
    characterId: string;
    task: string;
    callerCharacterId?: string;
    model?: string;
    maxTurns?: number;
    depth?: number;
  };

  const { characterId, task, callerCharacterId, model, maxTurns = 15, depth = 0 } = body;

  const missing = requireFields(body, ['characterId', 'task']);
  if (missing) return apiError(400, missing);

  const validation = validateSpawn(callerCharacterId, characterId, depth);
  if (!validation.ok) {
    return apiError(403, validation.error!);
  }

  const characters = getCharacters();
  const target = characters[characterId];
  const resolvedModel = model || target.defaultModel || 'sonnet';

  const taskWithDepth = `SPAWN_DEPTH=${depth + 1}\n\n${task}`;
  const prompt = buildCharacterPrompt(characterId, taskWithDepth);

  await serverLog({
    char: 'system',
    action: 'spawn',
    detail: `${callerCharacterId || 'direct'} -> ${characterId}`,
    depth,
    model: resolvedModel,
    maxTurns,
  });

  try {
    const { response, durationMs } = await spawnAndCollect({
      prompt,
      model: resolvedModel,
      maxTurns,
      label: `spawn: ${characterId}`,
      characterId,
    });

    await serverLog({
      char: 'system',
      action: 'spawn-done',
      detail: characterId,
      durationMs,
      outputLength: response.length,
    });

    return apiOk({
      output: response,
      character: characterId,
      durationMs,
    });
  } catch (err) {
    captureError('spawn', err);
    const message = err instanceof Error ? err.message : String(err);
    return apiError(500, message);
  }
}
