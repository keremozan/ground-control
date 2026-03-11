export const runtime = 'nodejs';
import { readFileSync } from 'fs';
import { join } from 'path';
import { buildCharacterPrompt, buildRevisionBasePrompt } from '@/lib/prompt';
import { getCharacters } from '@/lib/characters';
import { spawnSSEStream, spawnOnce } from '@/lib/spawn';
import { TANA_INBOX_ID, HOME } from '@/lib/config';

const DRAFT_COMPLETE_RE = /\[DRAFT-COMPLETE:\s*([^\]]+)\]/i;
const ALREADY_REVIEWED_RE = /reviewing draft against|auto-review results|\*\*criterion 1/i;

const SCHOLAR_SKILL_MAP: Array<[RegExp, string]> = [
  [/\bthesis\b|\bjury\b|\btez\b/i, 'scholar-thesis'],
  [/\bcritique\b|\bfeedback on\b|\breview this writing\b/i, 'scholar-critique'],
  [/\banalyze call\b|\bopen call\b|\bshould i apply\b|\bcall for\b/i, 'scholar-call-analysis'],
  [/\bnotebooklm\b|\bsearch notebooks\b/i, 'scholar-notebooklm'],
  [/\bconcept scan\b|\bscan concepts\b/i, 'scholar-concept-scan'],
  [/\bactivity report\b/i, 'scholar-activity-report'],
  [/\bbrainstorm\b|\bi have an idea\b|\bhelp me think\b|\bthinking about\b/i, 'scholar-brainstorm'],
  [/\bresearch\b|\bfind sources\b|\bliterature\b/i, 'scholar-research'],
  [/\bwrite\b|\babstract\b|\bproposal\b|\barticle\b|\bpaper\b|\bdraft\b|\bresidency\b/i, 'scholar-write'],
];

function detectScholarIntent(message: string): string | undefined {
  for (const [pattern, skill] of SCHOLAR_SKILL_MAP) {
    if (pattern.test(message)) return skill;
  }
  return undefined;
}

async function runAutoReview(draftText: string, textType: string): Promise<string> {
  const typesPath = join(HOME, '.claude/shared/scholar-text-types.md');
  let criteria = '';
  try {
    criteria = readFileSync(typesPath, 'utf-8');
  } catch {
    return '[Auto-review unavailable: could not load scholar-text-types.md]';
  }

  const cleanDraft = draftText.replace(DRAFT_COMPLETE_RE, '').trim();

  const criticPrompt = `You are the auto-review system for Scholar's writing output. Evaluate this draft against the binary criteria for "${textType}".

## Criteria Reference
${criteria}

## Draft to evaluate
${cleanDraft}

## Instructions
1. Find the "${textType}" section in the Criteria Reference above (match the section heading).
2. Evaluate each criterion adversarially — assume the draft has problems, find them.
3. For each criterion: quote the specific passage (max 30 words) being evaluated (or state "not present"), then state PASS or FAIL with a one-sentence reason. In case of doubt: FAIL.
4. Count total failures. Apply verdict:
   - PASS (0–1 failures): state "Verdict: PASS" and briefly note any single failure
   - REVISE (2–3 failures): state "Verdict: REVISE", list all failures with quoted evidence, then output the full revised draft with targeted fixes applied
   - REWRITE (4+ failures OR Criterion 1 fails): state "Verdict: REWRITE — [key failure reason]", do NOT show the failed draft, write a new draft with a different opening sentence strategy, then re-evaluate against the same criteria
5. Maximum 2 rewrite cycles. If second draft also fails, output it with failures flagged.

Output format: Start directly with "**Criterion 1 —**". No preamble.`;

  return await spawnOnce({ prompt: criticPrompt, model: 'sonnet' });
}

async function runRevisionPass(
  draft: string,
  critique: string,
  textType: string,
  revisionBasePrompt: string,
  model: string
): Promise<string> {
  const prompt = `${revisionBasePrompt}

## Task: Targeted revision

The draft below failed auto-review. Fix ONLY the passages cited in the critique. Keep all passing passages verbatim. Append \`[DRAFT-COMPLETE: ${textType}]\` on its own line at the end.

## Failed draft

${draft}

## Auto-review critique (failures to fix)

${critique}

Output only the complete revised draft.`;
  return spawnOnce({ prompt, model });
}

async function runRevisionLoop(
  draft: string,
  textType: string,
  revisionBasePrompt: string,
  model: string,
  characterId: string
): Promise<{ finalDraft: string; reviewSummary: string; revisedCount: number }> {
  let currentDraft = draft;
  let revisedCount = 0;
  let lastCritique = '';

  for (let i = 0; i < 3; i++) {
    const critique = await runAutoReview(
      currentDraft + `\n\n[DRAFT-COMPLETE: ${textType}]`,
      textType
    );

    const verdictMatch = critique.match(/Verdict:\s*(PASS|REVISE|REWRITE)/i);
    const verdict = verdictMatch?.[1]?.toUpperCase() ?? 'PASS';

    if (verdict === 'PASS' || i === 2) {
      return { finalDraft: currentDraft, reviewSummary: critique, revisedCount };
    }

    lastCritique = critique;
    const revised = await runRevisionPass(currentDraft, critique, textType, revisionBasePrompt, model);
    currentDraft = revised.replace(DRAFT_COMPLETE_RE, '').trim();
    revisedCount++;
  }

  return { finalDraft: currentDraft, reviewSummary: lastCritique, revisedCount };
}

function wrapWithAutoReview(
  source: ReadableStream<Uint8Array>,
  characterId: string,
  revisionBasePrompt: string,
  model: string
): ReadableStream<Uint8Array> {
  if (characterId !== 'scholar') return source;

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = source.getReader();
      const enqueue = (text: string) => {
        try { controller.enqueue(encoder.encode(text)); } catch {}
      };

      let textBuffer = '';
      let rawBuffer = '';
      let doneEvent = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          rawBuffer += decoder.decode(value, { stream: true });
          const parts = rawBuffer.split('\n\n');
          rawBuffer = parts.pop() ?? '';

          for (const part of parts) {
            if (!part.trim()) continue;

            if (/^event: done/m.test(part)) {
              doneEvent = part;
            } else if (/^event: text/m.test(part)) {
              // Buffer text — don't emit yet
              const dataMatch = part.match(/^data: (.+)$/m);
              if (dataMatch) {
                try {
                  const data = JSON.parse(dataMatch[1]);
                  if (typeof data.text === 'string') textBuffer += data.text;
                } catch {}
              }
            } else {
              // status, tool_call, tool_result — emit immediately
              enqueue(part + '\n\n');
            }
          }
        }

        // Handle any remaining buffer
        if (rawBuffer.trim()) {
          if (/^event: done/m.test(rawBuffer)) {
            doneEvent = rawBuffer;
          } else if (/^event: text/m.test(rawBuffer)) {
            const dataMatch = rawBuffer.match(/^data: (.+)$/m);
            if (dataMatch) {
              try {
                const data = JSON.parse(dataMatch[1]);
                if (typeof data.text === 'string') textBuffer += data.text;
              } catch {}
            }
          } else {
            enqueue(rawBuffer + '\n\n');
          }
        }
      } catch {}

      const markerMatch = textBuffer.match(DRAFT_COMPLETE_RE);
      const alreadyReviewed = ALREADY_REVIEWED_RE.test(textBuffer);

      if (markerMatch && !alreadyReviewed) {
        const textType = markerMatch[1].trim();
        const cleanDraft = textBuffer.replace(DRAFT_COMPLETE_RE, '').trim();

        enqueue(`event: status\ndata: ${JSON.stringify({ state: 'thinking', label: `Auto-review: ${textType}`, character: characterId })}\n\n`);

        try {
          const { finalDraft, reviewSummary, revisedCount } = await runRevisionLoop(
            cleanDraft, textType, revisionBasePrompt, model, characterId
          );

          const prefix = revisedCount > 0 ? `*(auto-revised ×${revisedCount})*\n\n` : '';
          enqueue(`event: text\ndata: ${JSON.stringify({ text: prefix + finalDraft })}\n\n`);

          if (reviewSummary) {
            enqueue(`event: text\ndata: ${JSON.stringify({ text: '\n\n---\n\n**Auto-Review**\n\n' + reviewSummary })}\n\n`);
          }
        } catch {
          // Fallback: emit original buffered text if revision loop fails
          enqueue(`event: text\ndata: ${JSON.stringify({ text: textBuffer })}\n\n`);
        }
      } else {
        // No draft marker — emit buffered text as-is
        if (textBuffer) {
          enqueue(`event: text\ndata: ${JSON.stringify({ text: textBuffer })}\n\n`);
        }
      }

      if (doneEvent) enqueue(doneEvent + '\n\n');
      try { controller.close(); } catch {}
    },
    cancel() {},
  });
}

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
    history?: Array<{ role: string; content: string }>;
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

  // Detect active skill for Scholar first messages only
  let activeSkill: string | undefined;
  if (characterId === 'scholar' && (!history || history.length === 0)) {
    activeSkill = detectScholarIntent(message);
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
    ...(images && images.length > 0 ? { images } : {}),
  });

  const revisionBasePrompt = buildRevisionBasePrompt(characterId);
  const stream = wrapWithAutoReview(rawStream, characterId, revisionBasePrompt, effectiveModel);

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
