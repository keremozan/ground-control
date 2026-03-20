# Architect Operations Guide

Operational reference for system-level maintenance. All changes go through Architect. Run the feature-integration gate before any structural change.

---

## 1. System Health Checks

After any non-trivial change, verify in this order:

```
1. tsc --noEmit              # type errors
2. npm run build             # full Next.js build
3. npm test                  # vitest suite
4. localhost:3000            # smoke test: dashboard loads, characters appear
5. localhost:3000 chat       # spawn a character, confirm response
6. /api/system/config        # returns trackColorPatterns, emailColorPatterns
7. /api/characters           # returns all character configs
8. /api/tasks                # Tana query succeeds (or expected error if Tana offline)
```

If tsc passes but build fails, check for Next.js-specific issues (server/client boundary, dynamic imports). If characters don't appear, check `~/.claude/characters/` JSON parse errors — `getCharacters()` silently skips malformed files.

---

## 2. Schema Changes — Tana ID Flow

`lib/tana-schema.ts` is the single source of truth for all Tana field and option IDs.

```
lib/tana-schema.ts  (TANA object + ASSIGNED_BY_NAME, PRIORITY_BY_NAME exports)
    │
    ├── lib/gmail-pipeline.ts      (imports ASSIGNED_BY_NAME, PRIORITY_BY_NAME)
    ├── lib/tana/queries.ts        (uses TANA fields for task queries)
    ├── lib/tana/mutations.ts      (uses TANA fields for task creation/update)
    └── lib/tana/routing.ts        (character resolution, reads assigned field)
         └── API routes            (app/api/ — use tana/* modules, never raw IDs)
              └── components/      (display only — consume types, not IDs)
```

Types live in two files:
- `types/index.ts` — client-safe. Import in components and hooks.
- `types/server.ts` — server-only. Import in lib/ and API routes.

### Adding a new Tana field

1. Add the field ID to `TANA.fields` (or the relevant sub-object) in `lib/tana-schema.ts`.
2. Add option IDs to the matching `*Options` and `*ByName` maps if it's an options field.
3. Update `types/server.ts` if the `Character` type or query result types need the new field.
4. Update `types/index.ts` if client components will display it.
5. Update query/mutation functions in `lib/tana/` to include the field.
6. Update `tana-ids.md` in `~/.claude/skills/assistant/knowledge-base/` so characters know the new ID.

### Adding a new assigned character option

1. Add to `TANA.assignedOptions` in `tana-schema.ts` (ID → name).
2. `ASSIGNED_BY_NAME` re-export updates automatically (it's derived).
3. Update Tana workspace: add the option to the assigned field on the #task supertag.
4. No changes needed in `gmail-pipeline.ts` — it calls `getCharacterList()` dynamically.

---

## 3. Character Ecosystem

Characters are JSON files. The dashboard picks them up automatically. No code changes needed for new characters — except two static maps.

```
~/.claude/characters/{core,meta,stationed}/{name}.json
    │
    ├── lib/characters.ts          (getCharacters() — loads all JSONs, caches in prod)
    │    └── CHARACTER_COLORS map  (fallback — must match JSON color fields)
    │
    ├── lib/prompt.ts              (buildCharacterPrompt — assembles from skills,
    │                               knowledge, memory, modifiers)
    │
    ├── lib/tana/routing.ts        (reads routingKeywords + trackPatterns from JSON)
    │
    ├── lib/gmail-pipeline.ts      (CHARACTER_SUBJECT_PATTERNS for reply detection;
    │                               getCharacterList() for dynamic label map)
    │
    └── lib/auto-review.ts         (reads autoReviewConfig.skillPatterns from JSON)
```

### Adding a character

1. Create `~/.claude/characters/{tier}/{name}.json` (use `stationed/TEMPLATE.json` as base).
2. Required fields: `name`, `tier`, `icon`, `color`, `actions`, `seeds`.
3. Update `lib/char-icons.ts` — add entry to `charColor` and `charIcon` maps.
4. Update `lib/characters.ts` — add entry to `CHARACTER_COLORS` fallback map.
5. Update `app/globals.css` — add `@theme` CSS variable for the character color.
6. Add to Tana workspace: new option in the assigned field, update `tana-schema.ts`.
7. If the character handles email replies, add a pattern to `CHARACTER_SUBJECT_PATTERNS` in `gmail-pipeline.ts`.

### Color consistency rule

Three files must stay in sync. The JSON config is source of truth.

```
{name}.json  →  char-icons.ts (charColor)
             →  characters.ts (CHARACTER_COLORS)
             →  globals.css   (@theme --color-{name})
```

---

## 4. Supporting File Consistency

Single-source-of-truth chains:

| Concern | Source | Consumers |
|---------|--------|-----------|
| Tana field/option IDs | `lib/tana-schema.ts` | `lib/tana/*`, `lib/gmail-pipeline.ts` |
| Character colors | JSON `color` field | `char-icons.ts`, `characters.ts`, `globals.css` |
| Routing keywords | JSON `routingKeywords` | `lib/tana/routing.ts` (built dynamically) |
| Track patterns | JSON `trackPatterns` | `lib/tana/routing.ts` (built dynamically) |
| Routing overrides | `~/.claude/shared/routing-overrides.md` | `lib/tana/routing.ts` |
| Client types | `types/index.ts` | All components, hooks |
| Server types | `types/server.ts` | `lib/`, API routes |
| Config secrets | `ground-control.config.ts` | `lib/config.ts` (re-exports) |

Never duplicate IDs. If you need a Tana ID in a new file, import from `tana-schema.ts`.

---

## 5. Refactoring Procedures

For a file that has grown too large (rule of thumb: over 300 lines with distinct logical sections):

```
1. Create directory:  lib/{name}/
2. Extract sections:  lib/{name}/{section}.ts
3. Create barrel:     lib/{name}/index.ts  — re-exports everything from section files
4. Update imports:    find all import { X } from '@/lib/{name}' — should resolve via barrel
5. Delete original:   lib/{name}.ts
6. Verify:            tsc --noEmit && npm run build
```

The barrel makes the refactor transparent to consumers. No import paths change.

Example: `lib/tana.ts` was split into `lib/tana/client.ts`, `queries.ts`, `mutations.ts`, `routing.ts`, `cache.ts`, with `lib/tana/index.ts` re-exporting the public surface.

---

## 6. Release Procedures

Use the Architect "Release" button in the dashboard (preferred), or manually:

```bash
zsh scripts/release.sh [patch|minor]
```

Versioning thresholds:
- `patch`: fixes, refactors, UI tweaks, documentation
- `minor`: new widget, new character, new pipeline stage, new autonomous capability
- `major`: architecture overhaul, breaking config changes

Changelog split:
- `CHANGELOG.md` — public, committed. User-visible changes only.
- `CHANGELOG.private.md` — git-ignored. System changes: skills, routing, schema, memory.

Only Architect writes changelog entries. Watcher and scheduled jobs log to `logs/tiny-log.jsonl` only.

Feature-integration gate (run before any structural change):
1. YAGNI — is there a real, present need?
2. KISS — simplest approach?
3. DRY — already exists somewhere?
4. SOLID — respects single responsibility, doesn't break existing behavior?
5. Safe implementation — worktree, dry-run, checkpoint per change.
6. Verify — end-to-end test, update knowledge files, log the change.
