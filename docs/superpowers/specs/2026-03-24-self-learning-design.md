# Self-Learning System: Outcome Tracking and Behavioral Adaptation

## Problem

The agent system produces outputs that Kerem frequently edits, ignores, or discards. Characters repeat the same mistakes across sessions because there is no feedback loop. Corrections given in chat are lost when the session ends. The system has no way to distinguish a useful output from a useless one.

## Goal

Build a feedback loop where the system observes what happens after it produces output, extracts behavioral lessons, and writes them to character memory so future sessions improve.

## Four Signal Sources

### 1. Chat Corrections

The highest-value signal. When Kerem corrects a character mid-conversation, the correction contains an explicit behavioral lesson.

**How to capture:**
- After each chat session ends (Stop hook or session close), scan the conversation for correction patterns:
  - User message immediately after assistant message that contains: negation ("no", "wrong", "not that"), redirection ("make it", "change to", "instead"), frustration indicators ("I said", "I already told you")
  - User message that substantially rewrites or replaces what the assistant just said
- Extract the correction as a before/after pair: what the character did vs. what Kerem wanted

**Where the data lives:**
- Claude Code session transcripts (if logging is enabled)
- SSE stream text captured in dashboard chat
- The /log skill already writes session logs to ~/Desktop/Claude Logs/

**Output:** Behavioral lesson written to character memory. Example:
"When writing exhibition texts, Kerem wants under 150 words. I wrote 400 words and was told to cut it."

### 2. Email Draft Outcomes

Kerem's actual behavior with drafts provides clear quality signals.

**Five outcome states (strongest to weakest signal):**

| Outcome | Signal | Meaning |
|---------|--------|---------|
| Draft deleted | Strong negative | System should not have drafted this reply at all. Wrong judgment about what needs a response. |
| Draft edited heavily (>50% edit distance) then sent | Negative | Right to reply, wrong content. Character missed the tone, language, or intent. |
| Draft edited lightly (<20% edit distance) then sent | Positive | Close enough. Minor adjustments. |
| Draft sent as-is | Strong positive | Character nailed it. |
| Draft sitting untouched >48 hours | Weak negative | Low priority email that didn't need a draft, or draft was wrong and Kerem is ignoring it rather than fixing it. |

**How to capture:**
- Track every draft the system creates (already logged in pipeline-log.json with draft ID and original body)
- Cron job `check-draft-outcomes` runs every 2 hours
- For each tracked draft: query Gmail API for current status
  - Draft gone + message in sent folder with same thread_id = sent. Compare bodies for edit distance.
  - Draft gone + no sent message = deleted.
  - Draft still exists + created >48h ago = stale/ignored.
- Store outcome with: draft ID, character that created it, recipient, thread context, original body hash, outcome, edit distance if sent

**Implementation:**
- `data/draft-outcomes.json` stores outcomes (rolling 90 days)
- The pipeline already logs draft creation with `draftId` and `threadId`. Extend to also store original body text (or hash + first 200 chars for comparison).
- Gmail API: `gmail.users.drafts.list()` to check if draft still exists, `gmail.users.messages.list(q: "in:sent")` with thread_id to find sent version.

**Stateful tracking (no redundant checks):**
- Each tracked draft has a status: `pending` | `sent-clean` | `sent-edited` | `deleted` | `stale`
- Cron only queries Gmail for drafts with `status: "pending"`
- Once resolved to any final state, the entry is never checked again. Zero tokens, zero API calls.
- No LLM calls in the collector at all. Pure Gmail API (free) + local string comparison for edit distance.

**Output examples for character memory:**
- "Kerem deleted 4 of my last 6 email drafts. I'm drafting replies to emails that don't need responses. Be more selective about what warrants a reply."
- "Kerem heavily edited my last 3 drafts to the same recipient. I'm using the wrong tone/language for this contact."
- "My drafts to university admin emails get sent as-is. My drafts to gallery contacts get edited. Adjust formality by recipient type."

### 3. Tana Outcomes

Tasks and nodes created by characters get completed, modified, or deleted.

**How to capture:**
- Track task nodes created by each character (already logged via pipeline)
- Periodically check Tana: is the task done, reassigned, or deleted?
- For outbox items: was the email delivered and sent, or was the outbox item deleted?

**Implementation:**
- Extend Archivist's nightly task-archive job to also record outcomes
- Compare assigned character vs. who actually completed it (reassignment = misrouting signal)
- Track time-to-completion (tasks that sit for weeks = low priority or wrong routing)

**Output:** Routing quality signal. "Tasks I create for Proctor get completed within 2 days. Tasks I create for Clerk sit for a week." Feed into routing confidence.

### 4. System Usage Patterns

Which characters Kerem actively engages with vs. ignores.

**How to capture:**
- Dashboard analytics: which character panels are opened, which actions are clicked
- Chat frequency: who does Kerem talk to manually vs. who only runs on schedule
- Job results: which scheduled outputs does Kerem view (track via API read events)
- Session duration: long sessions = engaged, short sessions = quick task or frustration

**Implementation:**
- Add lightweight analytics to dashboard API calls (log character + timestamp when a panel is opened or action is triggered)
- Store in `data/usage-analytics.json` (rolling 30 days)
- Weekly summary: character engagement scores

**Output:** Attention signal. Characters Kerem never engages with may be producing useless output. Characters he engages with frequently are high value.

## Feedback-to-Memory Pipeline

All four signals feed into character memory through a single pipeline:

```
Signal Sources → Outcome Collector → Lesson Extractor → Memory Writer
```

### Outcome Collector
- Aggregates signals from all four sources
- Stores raw outcomes in `data/outcomes.json` (rolling 90 days)
- Schema: { timestamp, character, signalType, outcome, details }

### Lesson Extractor
- Runs weekly (or on-demand via Watcher)
- Groups outcomes by character
- Identifies patterns: repeated corrections, consistent edit patterns, engagement trends
- Generates behavioral lessons in natural language
- Uses Sonnet to synthesize multiple outcomes into a single concise lesson

### Memory Writer
- Writes lessons to character memory files
- Checks for duplicates (don't write "keep reports short" if it's already there)
- Respects the 100-line cap with confidence-weighted pruning
- Logs what was written for auditability

## Architecture

### New files:
- `lib/outcome-tracker.ts` - Core outcome collection and storage
- `lib/lesson-extractor.ts` - Pattern detection and lesson generation
- `lib/usage-analytics.ts` - Dashboard usage tracking

### Modified files:
- `lib/gmail-pipeline.ts` - Tag drafts with metadata for outcome tracking
- `app/api/chat/route.ts` - Log correction patterns from chat sessions
- `app/api/schedule/run/route.ts` - Track which job results get viewed
- Watcher skill - Add weekly "learning review" step

### Data files:
- `data/outcomes.json` - Raw outcome events (rolling 90 days)
- `data/draft-outcomes.json` - Email draft fates
- `data/usage-analytics.json` - Dashboard engagement (rolling 30 days)

## What This Does NOT Do

- Does not modify character configs (only memory files)
- Does not change routing rules automatically (surfaces recommendations for Architect)
- Does not retrain any model (behavioral adaptation through prompt context only)
- Does not require external services (all local, no vector DB, no embeddings)

## Rollout

Phase 1: Chat correction capture + memory writing (highest value, lowest effort)
Phase 2: Email draft outcome tracking
Phase 3: Dashboard usage analytics
Phase 4: Tana outcome tracking
Phase 5: Weekly automated learning review via Watcher

## Cost

- Lesson extraction uses one Sonnet call per character per week (~17 calls/week)
- Chat correction scanning is local text analysis (no LLM needed for detection, Sonnet for lesson synthesis)
- Gmail API polling is negligible (already polling every 5 minutes)
- Storage: ~1MB/month for outcome data
