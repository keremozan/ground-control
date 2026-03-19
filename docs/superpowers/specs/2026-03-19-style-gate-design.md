# Style Gate: Post-Processing Filter for Character Output

## Problem

Character sessions drift from Kerem's writing style as conversations grow longer. By turn 15+, communication-style rules are forgotten and outputs revert to AI-default patterns (em dashes, colon reveals, negation framing, sycophantic openers, filler transitions). No amount of prompt engineering fixes this because it's a context window attention problem, not an instruction problem.

## Goal

A fast, cheap post-processing step that runs on every character output before it reaches the user or gets written to Tana/email. Catches and fixes style violations regardless of session length.

## Approach

After `spawnAndCollect` returns a character's response, pass it through a Gemini Flash-Lite call (free, ~200ms) that applies style rules. The gate only modifies text, never logic or content.

## The Gate

Input: character output text + style rules
Output: cleaned text with violations fixed

Style rules (from CLAUDE.md + communication-style skill):
- No em dashes. Use a period or parentheses.
- No colon as dramatic reveal ("The answer: X"). Use a period.
- No negation framing ("not X but Y"). Say the positive.
- No AI probe phrases: "what emerges", "at the threshold of", "what's at stake"
- No sycophantic openers: "Great!", "Absolutely!", "Of course!"
- No closing offers: "Let me know if you need anything else"
- No preamble: "I'll now...", "Let me first...", "To address this..."
- No transition filler: "With that in mind", "Moving forward", "Building on that"
- No meta-commentary: "That's a good point", "Great question"
- Lead with the answer. No wind-up.

## Integration Points

### 1. spawnAndCollect output (scheduled jobs, task processing)
In `lib/spawn.ts`, after collecting the response text, run it through the gate before returning.

### 2. spawnSSEStream (chat, dashboard actions)
Harder. SSE streams text in chunks. Gate would need to run on the final assembled text, or as a post-stream cleanup step shown to the user.

### 3. Pipeline draft_reply (Gmail pipeline)
The `spawnOnce` call for email drafts already produces a single text block. Gate runs before `createDraft`.

### 4. Tana node content
Character outputs written to Tana (reports, literature notes, brainstorm directions) go through the gate before `import_tana_paste`.

## Implementation

### lib/style-gate.ts
```
export async function styleGate(text: string): Promise<string>
```
- Calls Gemini Flash-Lite with the text + rules
- Returns cleaned text
- If Gemini is unavailable, returns original text unchanged (fail-open)
- Caches rules string (loaded once from CLAUDE.md hard output rules)

### Where to call it
- `spawnAndCollect`: wrap the return value
- `gmail-pipeline.ts` draft_reply: before createDraft
- Character report emails: before send_email
- Tana writes from characters: before import_tana_paste

### Where NOT to call it
- Chat streaming (latency-sensitive, user sees text as it arrives)
- Raw data outputs (JSON, node IDs, technical output)
- Commands and tool calls

## Cost

Gemini Flash-Lite: free tier 1000/day, paid tier unlimited. Each gate call processes ~500-2000 tokens. At 20-30 character outputs per day, this is negligible.

## Files

- Create: `lib/style-gate.ts`
- Modify: `lib/spawn.ts` (wrap spawnAndCollect return)
- Modify: `lib/gmail-pipeline.ts` (gate draft_reply output)
