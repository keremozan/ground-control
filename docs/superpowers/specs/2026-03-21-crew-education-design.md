# Crew Education -- Design Spec

**Date:** 2026-03-21
**Goal:** Scholar systematically improves every character by researching practical techniques in their domain and embedding the knowledge into their operational files.

---

## Overview

Once a week, Scholar picks the next character from a rotation, studies their role and current knowledge, decides what practical skill or technique would level them up most, runs a Gemini Deep Research query, filters the output aggressively, and writes distilled practical knowledge into the character's memory or a dedicated practices knowledge file.

This is not about fixing failures. It's about continuous professional improvement. A character working fine can still get better.

---

## Schedule

Two scheduled jobs per week, split to avoid the Deep Research async wait:

| Job | When | Character | Duration | What |
|-----|------|-----------|----------|------|
| Educate: Submit | Sunday 21:00 | Scholar | ~2 min | Pick character, decide topic, submit Deep Research query |
| Educate: Collect | Monday 07:00 | Scholar | ~5 min | Fetch results, filter, write to character files, email report |

If the collect job finds Deep Research still running, it exits cleanly. The next morning brief cycle or manual trigger picks it up.

---

## How Scholar Decides What to Teach

Scholar reads four inputs for the target character:

1. **Character config** (`~/.claude/characters/{tier}/{id}.json`) -- domain, system prompt, skills, actions. Understand what this character does.
2. **Practices file** (`~/.claude/shared/{id}-practices.md`) -- what has already been taught. Avoid repetition.
3. **Memory file** (`~/.claude/characters/{tier}/{id}.memory.md`) -- recent behavioral lessons, patterns. What has Architect flagged?
4. **Education history** (`rotation.json` history array) -- past topics and dates. What was covered before?

Scholar then asks: "Given what this character does and what they already know, what practical technique from the professional state of the art would have the most impact on their work quality?"

Scholar formulates a Deep Research query that is:
- Domain-specific (not generic "how to be better")
- Practical (not theoretical)
- Targeted at a specific skill or technique (not broad)
- Different from past education topics for this character

Example queries:
- For Postman: "Best practices for triaging multilingual message inboxes in professional assistant workflows. Practical techniques for detecting implicit action items in casual conversation."
- For Scribe: "Professional copywriting techniques for institutional academic emails. How to write concise, warm, authoritative emails in under 5 sentences."
- For Curator: "Exhibition project management best practices. Timeline management techniques used by independent curators for group shows with international artists."
- For Proctor: "Active learning techniques for university-level studio art courses. How to design workshop activities that balance instruction with creative exploration."

---

## Rotation

Simple ordered list of characters. Scholar cycles through one per week. Characters without meaningful domains (Architect, Engineer, Watcher, Kybernetes, Prober, Auditor) are excluded -- they are meta/system characters, not domain workers.

**File:** `~/.claude/skills/scholar-educate/rotation.json`

```json
{
  "currentIndex": 0,
  "order": [
    "postman",
    "scribe",
    "proctor",
    "clerk",
    "coach",
    "curator",
    "doctor",
    "steward",
    "tutor",
    "scholar",
    "archivist"
  ],
  "pendingResearch": null,
  "history": []
}
```

- `order`: 11 domain characters. Each gets educated roughly every 11 weeks.
- `pendingResearch`: set by submit job, cleared by collect job. Shape: `{ charId, topic, interactionId, submittedAt }`
- `history`: append-only log. Shape: `{ charId, topic, date, outputType, file }[]`. Scholar reads this to avoid repeating topics.

---

## Submit Job (Sunday 21:00)

Skill mode: `scholar-educate submit`

1. Read `rotation.json`
2. If `pendingResearch` is not null, skip (previous research still pending). Log and exit.
3. Get the character at `order[currentIndex]`
4. Read the character's config, practices file, memory file, and history entries for this character
5. Decide the topic (see "How Scholar Decides" above)
6. Submit Deep Research query via Gemini API (`lib/deep-research.ts` -- `startResearch(query)`)
7. Save to `pendingResearch`: `{ charId, topic, interactionId, submittedAt }`
8. Log to tiny-log.jsonl: `{ action: "educate-submit", character: charId, detail: topic }`

---

## Collect Job (Monday 07:00)

Skill mode: `scholar-educate collect`

1. Read `rotation.json`
2. If `pendingResearch` is null, skip. Nothing pending.
3. Poll Deep Research status. If still running, log and exit.
4. Fetch the full research result
5. **Filter aggressively:**
   - Strip all AI filler ("In conclusion", "It's worth noting", "Research shows")
   - Strip theoretical background (keep only practical techniques)
   - Strip generic advice ("communicate clearly", "be organized")
   - Extract only specific, actionable techniques with concrete steps
   - Rewrite in direct, imperative voice (match Kerem's writing style)
   - Target: 3-7 distilled findings from a 10+ page Deep Research output
6. **For each finding, decide output format:**
   - One-line actionable rule -> append to character's memory file with `[edu] YYYY-MM-DD:` prefix
   - Multi-step framework or checklist -> append to `~/.claude/shared/{charId}-practices.md`
   - If practices file doesn't exist, create it and add to the character's `sharedKnowledge` array in their JSON config
7. **Update rotation.json:**
   - Clear `pendingResearch`
   - Append to `history`: `{ charId, topic, date, outputType: "memory"|"knowledge"|"both", file }`
   - Increment `currentIndex` (wrap around at `order.length`)
8. **Email report** to kerem.ozan@gmail.com:
   - Subject: "[Scholar] Crew Education -- {CharacterName} -- {date}"
   - What character, what topic was researched
   - What was written and where (with exact file paths)
   - The distilled findings (so you can review without opening files)
9. Log to tiny-log.jsonl: `{ action: "educate-collect", character: charId, detail: topic }`

---

## Output Format

**Memory entries** (short rules):
```
[edu] 2026-03-21: When triaging messages, scan for temporal language ("tomorrow", "by Friday", "I'll send") as implicit commitments that need tasks.
```

**Practices file** (frameworks):
```markdown
# Postman Practices

## Message Triage (2026-03-21)
- Scan for three signal types: explicit requests ("please do X"), implicit commitments ("I'll send tomorrow"), and deadline mentions
- For group chats, only the latest message per sender matters unless a thread develops
- Turkish casual markers for urgency: "acil", "hemen", "bugun icinde"
```

The practices file grows over time as Scholar adds new sections per education cycle. Each section is dated. If the file exceeds 200 lines, Scholar consolidates older entries.

---

## Filtering Rules (Critical)

Deep Research output is verbose. Scholar must be ruthless:

- If a finding is something any competent professional already knows, skip it
- If a finding is theoretical without a concrete "do this" action, skip it
- If a finding repeats what's already in the character's practices file, skip it
- If a finding uses AI-speak language, rewrite it in plain direct language
- If fewer than 3 findings survive filtering, that's fine. Quality over quantity.
- If zero findings survive, log "no actionable findings" and move to next character. Don't force output.

---

## Files

**New:**
- `~/.claude/skills/scholar-educate/SKILL.md` -- skill with two modes (submit/collect)
- `~/.claude/skills/scholar-educate/rotation.json` -- rotation state
- `~/.claude/shared/{charId}-practices.md` -- created per character as needed

**Modified:**
- Character JSON configs -- add `{charId}-practices` to `sharedKnowledge` array when a practices file is created
- `ground-control.config.ts` -- add two scheduled jobs (educate-submit Sunday 21:00, educate-collect Monday 07:00)
- Scholar's skills array -- add `scholar-educate`

**Existing (read only):**
- `lib/deep-research.ts` -- Gemini Deep Research API (already exists, used by Scholar's research action)
- Character configs, memory files, practices files

---

## Constraints

- Scholar never edits skills (that's Architect/Engineer territory)
- Scholar writes to memory files (with `[edu]` prefix to distinguish from Architect's `[!]` lessons) and knowledge files only
- Maximum 5 memory lines per education cycle (don't bloat memory)
- Practices files stay under 200 lines (consolidate when exceeded)
- One character per week, no parallelism
- If Deep Research API fails or times out, skip gracefully and try again next week with the same character
