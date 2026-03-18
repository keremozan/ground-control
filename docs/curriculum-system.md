# Agent Curriculum System — Design Document

**Author:** Architect
**Date:** 2026-03-18
**Status:** Draft v2 — revised after self-analysis

---

## Problem

Characters currently learn only reactively: Watcher spots a failure, writes a memory lesson, character gets updated. This works for catching individual errors but misses:

- No way for domain expertise to flow in from external sources (books, articles, PDFs)
- No mechanism for Scholar to translate research into character capability
- Memory files are for incidents, not knowledge
- No proactive quality baseline beyond CLAUDE.md (which covers writing voice and Tana discipline but not tool-verification habits and completion-claim discipline)

---

## What We Are NOT Solving

**Operational behavior:** Already covered by CLAUDE.md (outbox discipline, URL rules, tool sequence, communication patterns, Tana paste rules). A `baseline-operational.md` would duplicate this — dropped.

**Writing voice and Tana data discipline:** Already in CLAUDE.md. Any curriculum file that restates these is dead weight.

---

## Decision

**Start minimal, gate expansion on evidence.**

Phase 1 is three files and one config change. No new Tana schema, no delivery job, no infrastructure. Only after Phase 1 proves value do we build the pipeline.

File delivery via `sharedKnowledge` remains the mechanism. Files live flat in `~/.claude/shared/` — the loader (`lib/shared.ts`) does a flat `readdirSync` with no subdirectory support. A `teaching/` subdirectory would silently fail. No code change needed if we use a `curriculum-` prefix convention instead.

---

## Architecture

### Two Types of Curriculum Files

| File type | What it covers | Who loads it |
|-----------|---------------|--------------|
| `curriculum-quality.md` | Tool-verification habits, completion-claim discipline, pre-flight checks — what CLAUDE.md does NOT cover | Prose-producing characters only (see below) |
| `curriculum-{character}.md` | Domain methods specific to that character | That character only |

**No `baseline-operational.md`** — CLAUDE.md already owns this space.

### Who Loads `curriculum-quality.md`

Only characters that produce prose outputs for humans. Not operational/system characters.

**Load it:** Scholar, Scribe, Proctor, Curator, Clerk, Coach, Doctor, Oracle (8 characters)

**Do not load it:** Postman, Steward, Engineer, Watcher, Archivist, Architect, Kybernetes, Prober, Auditor (9 characters — operational, meta, or routing roles where quality prose standards add no value)

### File Naming Convention

```
~/.claude/shared/
  curriculum-quality.md          -- cross-cutting quality baseline (non-CLAUDE.md content only)
  curriculum-proctor.md          -- Proctor domain methods
  curriculum-scholar.md          -- Scholar domain/research methods
  curriculum-curator.md          -- Curator exhibition/art practice methods
  curriculum-clerk.md            -- Clerk admin methods
  curriculum-coach.md            -- Coach wellbeing methods
  ...                            -- one file per character with domain content
```

---

## `curriculum-quality.md` — What Goes In It

**Only content not already in CLAUDE.md.** Three categories:

1. **Tool-verification discipline** — a task is complete when the tool returns success confirmation, not when the text is written. Never describe a completed operation unless a tool call returned success. "I downloaded X to ~/Downloads" without a preceding tool call is a fabrication.

2. **Pre-completion self-assessment** — before reporting completion, verify the deliverable exists: check the file was written, the node was created, the draft was saved. One verification tool call is mandatory.

3. **Pre-flight discipline** — ALL checks (existence, duplicate search, current state) must complete before any action phase begins. Parallel within phases, sequential across phases. Never check after acting.

These are the error classes Watcher has flagged repeatedly (Mar 17 memory). They belong in curriculum, not just memory, because memory fires reactively per character — this is a proactive pattern to prevent the class from recurring.

---

## Scholar's Role: Curriculum Ingest

Scholar gets a new skill: `scholar-curriculum-ingest`.

**Input:** URL or local filesystem path to a PDF (Drive PDFs are accessible via Read tool at `~/Library/CloudStorage/GoogleDrive-*/My Drive/`).

**Output:** Lessons written directly to a curriculum file (Phase 1: no Tana tracking yet).

**What Scholar does:**
1. Reads or fetches the source
2. Extracts 3–7 actionable lessons — behavioral prescriptions ("When X, do Y"), not summaries
3. Groups by character target
4. Appends to the relevant `curriculum-{character}.md` file with a source header
5. Reports to Architect which lessons were added

**Lesson quality criteria:**
- Behavioral prescriptions, not descriptions ("do X" not "X exists")
- Specific, not vague ("open each session with a 5-minute provocation" not "be engaging")
- Grounded in the source — cite the author/section
- Actionable within the character's actual scope

**Lesson format in delivery files:**

```markdown
### From: Why Art Cannot Be Taught (Elkins, 2001)
- Studio critique works best when the instructor withholds judgment for the first exchange. Ask what the student intended before evaluating what they made. (Elkins ch. 4)
  Implication for Proctor: open critique rounds with "what were you trying to do?" — never lead with assessment.
- [additional lessons...]
```

**PDF reading note:** Read tool handles PDFs (up to 20 pages per call). Drive PDFs are at `~/Library/CloudStorage/GoogleDrive-kerem.ozan@gmail.com/My Drive/`. For long PDFs, Scholar should page through in chunks. Verify with Elkins (short) before scaling to longer books.

---

## Continuous Ingest: Tana Pipeline (Phase 2+)

Deferred until Phase 1 proves value. Do not build until:
- At least 2 characters have loaded curriculum files
- At least one has demonstrably changed behavior (Watcher reports cleaner outputs)

When Phase 2 is warranted, the pipeline is:

```
Source (URL / PDF / book)
    ↓
Scholar (scholar-curriculum-ingest --track)
    ↓
#lesson nodes created in Tana (status: draft)
    ↓
Architect reviews → approves (status: approved)
    ↓
Archivist curriculum-delivery job (weekly, Monday 06:00)
    ↓
Lessons appended to curriculum-{character}.md files
    ↓
Lesson status → active
```

**Archivist owns the delivery job** — data maintenance is Archivist's domain. The job: query Tana for `status=approved` lessons, group by target character, append to files, update statuses to active.

### Tana Schema for Phase 2: `#lesson` supertag

| Field | Type | Notes |
|-------|------|-------|
| title | plain | Short descriptive title |
| source_url | url | Original source |
| layer | options | domain, quality |
| target_characters | plain | Comma-separated character names |
| status | options | draft, approved, active, retired |
| lesson_date | date | When created |
| created_by | plain | "scholar" by default |
| delivery_file | plain | Which file it was written into |

Children = the actual lesson content (plain nodes).

---

## Implementation Plan

### Phase 1: Minimal viable (Architect + Scholar, now)

1. Write `curriculum-quality.md` (Architect writes directly — content is known, no source processing needed)
2. Scholar processes **Elkins** from Drive — produces `curriculum-proctor.md` with initial lessons
3. Add `curriculum-quality` to Proctor's `sharedKnowledge` in `~/.claude/characters/core/proctor.json`
4. Add `curriculum-proctor` to Proctor's `sharedKnowledge`
5. Validate: spawn Proctor, check prompt includes curriculum content
6. Gate check: does Proctor's behavior change? Watcher assesses after 2 weeks.

**Phase 1 does NOT include:** Tana schema, delivery job, any other characters, `scholar-curriculum-ingest` skill (Scholar processes sources ad-hoc in Phase 1).

### Phase 2: Domain expansion (Scholar, after Phase 1 validates)

Gated on Phase 1 showing measurable improvement.

1. Scholar processes remaining Drive sources:
   - Proctor: Hickman, Mateus-Berr
   - Scholar: Hickman (research methodology sections)
   - Curator: exhibition/gallery sources
2. Add `curriculum-quality` to remaining 7 prose-producing characters
3. Add per-character files as they're written

### Phase 3: Tana pipeline (Engineer, after Phase 2 validates)

Gated on recurring need for new sources (more than one per month).

1. Create `#lesson` supertag in Tana, record IDs in `tana-ids.md`
2. Write `scholar-curriculum-ingest` skill with `--track` flag (creates Tana nodes instead of writing directly)
3. Write Archivist `curriculum-delivery` job
4. Add to crontab: Monday 06:00

---

## Character Config Changes

Phase 1 — Proctor only:

```json
"sharedKnowledge": [
  "identity",
  "tana-ids",
  "curriculum-quality",
  "curriculum-proctor"
]
```

Phase 2 — adds `curriculum-quality` to 7 more prose-producing characters (Scholar, Scribe, Curator, Clerk, Coach, Doctor, Oracle). Per-character domain files added as written.

**No changes to:** Postman, Steward, Engineer, Watcher, Archivist, Architect, Kybernetes, Prober, Auditor.

---

## Loader Constraint

`lib/shared.ts` reads `SHARED_DIR` with `fs.readdirSync` (flat, no recursion). Files in subdirectories are invisible to it. All curriculum files MUST live flat in `~/.claude/shared/` with the `curriculum-` prefix. If subdirectory support is ever needed, Engineer updates `shared.ts` to recurse and use the path as the key (e.g., `teaching/baseline-quality` → key `teaching/baseline-quality`). Not needed for Phase 1-2.

---

## Gate Check (YAGNI / KISS / DRY / SOLID)

**YAGNI (Phase 1):** Directly addresses identified domain knowledge gaps in Proctor, Scholar, Curator. curriculum-quality addresses a repeated error class (fabricated completions, flagged Mar 17). Phase 2-3 infrastructure is explicitly deferred — not built until Phase 1 validates.

**KISS:** Phase 1 is 3 files + 1 config change. No new code, no new schema, no new jobs.

**DRY:** Memory files = behavioral incidents. Curriculum files = methodological knowledge. CLAUDE.md = operational rules + writing voice. No overlap. Tana IDs in `tana-ids.md` as always.

**SOLID:**
- Single Responsibility: Scholar ingests domain sources, Archivist delivers (Phase 3), Architect approves. CLAUDE.md owns operational rules.
- Open/Closed: Adding new characters to curriculum doesn't change existing character files.
- Interface Segregation: System/operational characters don't load curriculum that doesn't apply to them.

---

## Open Questions

1. **Approval in Phase 1:** Since there's no Tana tracking, Architect reviews Scholar's output directly from the file before it's added to any character config. This is the approval step for Phase 1.
2. **Lesson granularity:** 3-7 per source is a starting estimate. For long PDFs, Scholar pages through in chunks (Read tool, 20-page limit per call).
3. **Retirement:** When a lesson is superseded, Architect manually removes it from the delivery file. No automation needed until volume justifies it.
4. **Coverage visibility:** Dashboard `curriculum` tab deferred to Phase 3. Phase 1-2 tracked informally by Architect.
