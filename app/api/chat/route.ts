export const runtime = 'nodejs';
import { buildCharacterPrompt, buildRevisionBasePrompt } from '@/lib/prompt';
import { getCharacters } from '@/lib/characters';
import { spawnSSEStream } from '@/lib/spawn';
import { TANA_INBOX_ID } from '@/lib/config';
import { wrapWithAutoReview, detectIntent, type AutoReviewConfig } from '@/lib/auto-review';

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
  const { characterId, message, context, history, model: modelOverride, images, skill } = await req.json() as {
    characterId: string;
    message: string;
    context?: string;
    history?: Array<{ role: string; content: string; images?: Array<{ mediaType: string; data: string }> }>;
    model?: string;
    images?: Array<{ mediaType: string; data: string }>;
    skill?: string;
  };

  const characters = getCharacters();
  const char = characters[characterId];
  if (!char) {
    return new Response('Character not found', { status: 404 });
  }

  // Build task content: history + message + optional context
  let taskContent = '';
  if (history && history.length > 0) {
    let imageIndex = 0;
    const historyText = history.map(m => {
      let content = m.content;
      if (m.images && m.images.length > 0) {
        const refs = m.images.map(() => `[Image ${++imageIndex}]`).join(', ');
        content = content ? `${content} ${refs}` : refs;
      }
      return `${m.role === 'user' ? 'User' : 'You'}: ${content}`;
    }).join('\n\n');
    taskContent = `## Conversation so far\n${historyText}\n\n## User's latest message\n${message}`;
  } else {
    taskContent = message;
  }

  // Collect images from history + current message so Claude can see all of them
  const historyImages = history ? history.flatMap(m => m.images || []) : [];
  const allImages = [...historyImages, ...(images || [])];
  const effectiveImages = allImages.length > 0 ? allImages : undefined;
  if (context) {
    taskContent = `${taskContent}\n\n---\n\n${context}`;
  }
  taskContent = `${taskContent}\n\n---\n\n${AUTONOMY_RULES}`;

  // Detect active skill for characters with autoReviewConfig on first messages only
  const autoReviewConfig = char.autoReviewConfig as AutoReviewConfig | undefined;
  let activeSkill: string | undefined;
  if (autoReviewConfig && (!history || history.length === 0)) {
    activeSkill = detectIntent(message, autoReviewConfig);
  }

  const prompt = buildCharacterPrompt(characterId, taskContent, { activeSkill, injectSkill: skill });
  const effectiveModel = modelOverride || char.defaultModel || 'sonnet';
  const rawStream = spawnSSEStream({
    prompt,
    model: effectiveModel,
    maxTurns: context ? 75 : 50,
    label: `Chat: ${char.name}`,
    characterId,
    signal: req.signal,
    ...(effectiveImages ? { images: effectiveImages } : {}),
  });

  const revisionBasePrompt = buildRevisionBasePrompt(characterId);
  const stream = autoReviewConfig
    ? wrapWithAutoReview(rawStream, characterId, autoReviewConfig, revisionBasePrompt, effectiveModel)
    : rawStream;

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
