import { readFileSync } from 'fs';
import { join } from 'path';
import { spawnOnce } from '@/lib/spawn';
import { HOME } from '@/lib/config';

const DRAFT_COMPLETE_RE = /\[DRAFT-COMPLETE:\s*([^\]]+)\]/i;
const ALREADY_REVIEWED_RE = /reviewing draft against|auto-review results|\*\*criterion 1/i;

export interface AutoReviewConfig {
  skillPatterns: Record<string, string>; // regex pattern -> skill name
}

export function detectIntent(message: string, config: AutoReviewConfig): string | undefined {
  for (const [pattern, skill] of Object.entries(config.skillPatterns)) {
    if (new RegExp(pattern, 'i').test(message)) return skill;
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

export function wrapWithAutoReview(
  source: ReadableStream<Uint8Array>,
  characterId: string,
  config: AutoReviewConfig,
  revisionBasePrompt: string,
  model: string
): ReadableStream<Uint8Array> {
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
            } else if (/^event: gate/m.test(part)) {
              // Suppress: auto-review output supersedes the style gate pass
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
          } else if (/^event: gate/m.test(rawBuffer)) {
            // Suppress: auto-review output supersedes the style gate pass
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
