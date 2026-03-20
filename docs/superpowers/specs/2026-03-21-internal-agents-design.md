# Internal Agents in Crew Grid -- Design Spec

**Date:** 2026-03-21
**Goal:** Hide internal-only characters (Prober, Auditor, Engineer, Watcher) from the main crew grid and show them as mini-badges inside their parent character's pill. Change grid from 5 columns to 4 for better readability.

---

## What Changes

### 1. Grid layout: 5 columns -> 4 columns

**File:** `components/home/crew/CharacterGrid.tsx` line 85

```css
/* Before */
gridTemplateColumns: "repeat(5, 1fr)"

/* After */
gridTemplateColumns: "repeat(4, 1fr)"
```

This makes each pill wider. The font sizes stay the same (they're already using var tokens) but the extra width means text is less cramped and truncation happens less often. Icon size can bump from 9px to 11px, text from 9px to 10px.

### 2. Internal agent flag on character configs

**Files:** 4 character JSON configs

Add `"internal": true` and `"parentChar": "scholar"` (or `"architect"`) to:

- `~/.claude/characters/core/prober.json` -> `"internal": true, "parentChar": "scholar"`
- `~/.claude/characters/meta/auditor.json` -> `"internal": true, "parentChar": "scholar"`
- `~/.claude/characters/meta/engineer.json` -> `"internal": true, "parentChar": "architect"`
- `~/.claude/characters/meta/watcher.json` -> `"internal": true, "parentChar": "architect"`

### 3. Filter internal characters from the grid

**File:** `components/home/crew/CharacterGrid.tsx` line 58

```typescript
// Before
const filtered = activeFilter ? characters.filter(c => activeFilter.ids.includes(c.id)) : characters;

// After
const mainChars = characters.filter(c => !c.internal);
const filtered = activeFilter ? mainChars.filter(c => activeFilter.ids.includes(c.id)) : mainChars;
```

### 4. Show internal agents as mini-badges inside parent pills

**File:** `components/home/crew/CharacterGrid.tsx` lines 92-107

For each character pill, check if it has internal children. If so, render small colored badge icons after the name.

```typescript
// Get internal children for this character
const internalChildren = characters.filter(c => c.internal && c.parentChar === char.id);

// In the button JSX, after the name span:
{internalChildren.length > 0 && (
  <span style={{ display: "inline-flex", gap: 2, marginLeft: "auto", flexShrink: 0 }}>
    {internalChildren.map(child => {
      const ChildIcon = resolveIcon(child.icon);
      return (
        <span
          key={child.id}
          title={child.name}
          style={{
            width: 14, height: 14, borderRadius: 2,
            background: child.color,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <ChildIcon size={8} strokeWidth={1.5} style={{ color: "white" }} />
        </span>
      );
    })}
  </span>
)}
```

### 5. Clicking internal badges

Clicking a mini-badge should select that internal character and show its detail in the FocusPanel. The internal character has no action buttons (since it's never used directly), but its skills, memory, and knowledge are visible.

**Implementation:** The mini-badge's `onClick` calls `selectChar(child.id)` with `e.stopPropagation()` to prevent selecting the parent.

### 6. Update CREW_FILTERS

**File:** `components/home/crew/CharacterGrid.tsx` lines 22-28

Remove internal agent IDs from filter lists:

```typescript
const CREW_FILTERS = [
  { label: "Research", ids: ["scholar", "scribe", "curator"] },  // removed prober, auditor
  { label: "Teaching", ids: ["proctor", "scribe"] },
  { label: "Admin", ids: ["clerk", "steward", "archivist", "postman"] },
  { label: "Personal", ids: ["coach", "doctor", "tutor"] },
  { label: "System", ids: ["architect", "kybernetes", "oracle"] },  // removed engineer, watcher
];
```

### 7. Update CharacterInfo type

**File:** `components/home/crew/CharacterGrid.tsx` line 15-20 (local type) and `types/index.ts`

Add to `CharacterInfo`:
```typescript
internal?: boolean;
parentChar?: string;
```

### 8. API: pass internal/parentChar fields through

**File:** `app/api/characters/route.ts`

The character loading code (`lib/characters.ts`) already reads all fields from JSON configs. Just ensure `internal` and `parentChar` are included in the API response. Since the loader does `{ ...config }`, new fields pass through automatically. No code change needed if the type allows it.

### 9. Update Character type in types/server.ts

Add to the `Character` interface:
```typescript
internal?: boolean;
parentChar?: string;
```

---

## Visual Result

**Before (5 columns, 18 pills):**
```
Scholar   Curator   Proctor   Coach    Tutor
Postman   Clerk     Steward   Archvst  Scribe
Doctor    Prober    Auditor   Archit.  Engineer
Watcher   Kybrnts   Oracle
```

**After (4 columns, 14 pills, badges on Scholar + Architect):**
```
Scholar [P][A]   Curator       Proctor      Coach
Tutor            Postman       Clerk        Steward
Archivist        Scribe        Doctor       Architect [E][W]
Kybernetes       Oracle
```

4 fewer pills. 2 rows less dense. Wider pills with more readable text. Internal agents visible as colored mini-icons inside their parent's pill.

---

## Files Changed

| File | Change |
|------|--------|
| `components/home/crew/CharacterGrid.tsx` | 4-col grid, filter internals, render badges, update CREW_FILTERS |
| `types/index.ts` | Add `internal?`, `parentChar?` to CharacterInfo |
| `types/server.ts` | Add `internal?`, `parentChar?` to Character |
| `~/.claude/characters/core/prober.json` | Add `internal: true`, `parentChar: "scholar"` |
| `~/.claude/characters/meta/auditor.json` | Add `internal: true`, `parentChar: "scholar"` |
| `~/.claude/characters/meta/engineer.json` | Add `internal: true`, `parentChar: "architect"` |
| `~/.claude/characters/meta/watcher.json` | Add `internal: true`, `parentChar: "architect"` |

No API route changes. No lib changes. No CSS file changes.
