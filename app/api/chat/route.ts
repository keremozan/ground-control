export const runtime = 'nodejs';
import { buildCharacterPrompt } from '@/lib/prompt';
import { getCharacters } from '@/lib/characters';
import { spawnSSEStream } from '@/lib/spawn';
import { TANA_INBOX_ID } from '@/lib/config';

const AUTONOMY_RULES = `
CRITICAL AUTONOMY RULES \u2014 follow these without exception:
- NEVER ask for confirmation, permission, or "OK?" before executing actions.
- Execute ALL actions immediately: Tana operations, searches, file reads, draft creation.
- Only pause for: sending emails (create drafts instead), sending WhatsApp messages, or destructive deletes.
- When you have a plan, execute it completely in one go. Don't stop halfway and wait for the user.
- Don't narrate each step ("Let me search...", "Now I'll read..."). Just do it silently, then report results at the end.
- If a tool call fails, try an alternative approach. Don't ask the user what to do.
- You have plenty of tool-use turns. Use them all to finish the task completely before responding.
- When creating Gmail drafts as replies, MUST set both threadId AND inReplyTo.
- Tana Paste: NEVER use !! heading syntax in node names. Just plain nodes and children. No bold in node names either.

CREATING TASKS IN TANA — when asked to create/add a task:
- Use import_tana_paste with the #task tag (ID: tuoCgN5Y6sn9), NOT plain inbox nodes.
- Always set: status field (wRd8g4jr7Nqr) to Backlog (TQt9EnvCFbPW), track field (ssCxaiZRXz9F) to the relevant track node ID, assigned field (kOYlKvF3ddrT) to the character who should handle it.
- Format: \`- Task name #[[^tuoCgN5Y6sn9]]\n  - status:: [[Backlog^TQt9EnvCFbPW]]\n  - track->:: [[Track Name^TRACK_ID]]\n  - assigned:: [[Character^CHAR_ID]]\`
- Before creating, use tana_semantic_search to check for duplicates (minSimilarity: 0.4).
- Target node: use the workspace Inbox (${TANA_INBOX_ID}) unless told otherwise.
`.trim();

export async function POST(req: Request) {
  const { characterId, message, context, history, model: modelOverride } = await req.json() as {
    characterId: string;
    message: string;
    context?: string;
    history?: Array<{ role: string; content: string }>;
    model?: string;
  };

  const characters = getCharacters();
  const char = characters[characterId];
  if (!char) {
    return new Response('Character not found', { status: 404 });
  }

  // Build task content: history + message + optional context
  let taskContent = '';
  if (history && history.length > 0) {
    const historyText = history.map(m =>
      `${m.role === 'user' ? 'User' : 'You'}: ${m.content}`
    ).join('\n\n');
    taskContent = `## Conversation so far\n${historyText}\n\n## User's latest message\n${message}`;
  } else {
    taskContent = message;
  }
  if (context) {
    taskContent = `${taskContent}\n\n---\n\n${context}`;
  }
  taskContent = `${taskContent}\n\n---\n\n${AUTONOMY_RULES}`;

  const prompt = buildCharacterPrompt(characterId, taskContent);
  const stream = spawnSSEStream({
    prompt,
    model: modelOverride || char.defaultModel || 'sonnet',
    maxTurns: context ? 30 : 25,
    label: `Chat: ${char.name}`,
    characterId,
    signal: req.signal,
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
