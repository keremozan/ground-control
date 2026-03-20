# Engineer Guide — Ground Control

Operational reference for maintaining and extending the dashboard.

---

## 1. Directory Map

| Path | Purpose |
|------|---------|
| `app/page.tsx` | Dashboard grid. Wraps widgets in `SharedDataProvider`, `ChatProvider`, and `WidgetErrorBoundary`. |
| `app/api/` | 42 API routes. One directory per route, each with a `route.ts`. |
| `app/globals.css` | Design tokens (CSS custom properties) + component utility classes. No Tailwind utility classes in here. |
| `types/index.ts` | Client-safe type definitions shared across components and API responses. |
| `types/server.ts` | Server-only types (never imported by client components). |
| `hooks/` | Shared React hooks. Import via barrel: `import { useFetchAPI } from "@/hooks"`. |
| `lib/` | Server-side utilities. Never import into client components unless the file has no Node dependencies. |
| `lib/tana/` | Tana MCP integration split into `client`, `queries`, `mutations`, `routing`, `cache`. Import via `@/lib/tana`. |
| `lib/api-helpers.ts` | `apiOk`, `apiError`, `apiStream`, `requireFields`, `validateName`. Use in every route. |
| `lib/errors.ts` | `captureError(context, error)` — logs to `tiny-log.jsonl`. Use in every catch block. |
| `lib/colors.ts` | `buildColorMatcher` — compiles `{hex: regex}` patterns into a fast lookup function. |
| `components/home/` | One subdirectory per widget: `chat/`, `crew/`, `tasks/`, `calendar/`, `inbox/`, `status/`. |
| `components/ui/` | Shared primitives: `Modal`, `Spinner`, `EmptyState`, `WidgetErrorBoundary`, `Led`. |
| `tests/` | Vitest tests mirroring `components/`, `hooks/`, `lib/` structure. |
| `examples/characters/` | Sanitized character JSON templates. Read these before writing a new config. |

---

## 2. Adding a New Widget

**Step 1 — Create the component directory**

```
components/home/{widget}/
  index.tsx          -- re-export: export { default } from "./WidgetPanel"
  WidgetPanel.tsx    -- main panel component ("use client")
  SubComponent.tsx   -- optional subcomponents
```

**Step 2 — Write the panel**

```tsx
"use client";
import { useFetchAPI } from "@/hooks";
import type { YourType } from "@/types";

export default function WidgetPanel() {
  const { data, loading, error, refetch } = useFetchAPI<YourType[]>("/api/your-route");
  if (loading) return <Spinner />;
  if (error) return <EmptyState message={error} />;
  return <div>...</div>;
}
```

**Step 3 — Add the API route**

```
app/api/your-route/route.ts
```

See section 5 for the route template.

**Step 4 — Add types**

Add interfaces to `types/index.ts` (client-safe) or `types/server.ts` (server-only).

**Step 5 — Wire into `app/page.tsx`**

```tsx
import WidgetPanel from "@/components/home/widget";

// Inside the dashboard grid:
<WidgetErrorBoundary name="Widget">
  <WidgetPanel />
</WidgetErrorBoundary>
```

Assign a grid position with `style={{ gridColumn: "span N" }}` as needed.

---

## 3. Adding a Feature to an Existing Widget

Identify the panel file (`{Widget}Panel.tsx`). Typical touch points:

| What you need | Where it lives |
|---------------|---------------|
| New server data | Add API route, call with `useFetchAPI` |
| New UI state | `useState` in the panel, or `useLocalStorage` if it should persist across reloads |
| New async action | `useBusy` to track loading state per item |
| New type | `types/index.ts` |
| Shared color logic | `buildColorMatcher` from `lib/colors.ts` |
| New Tana read | `lib/tana/queries.ts` |
| New Tana write | `lib/tana/mutations.ts` |

Pattern for an action button:

```tsx
const { isBusy, markBusy, clearBusy } = useBusy();

async function handleAction(id: string) {
  markBusy(id);
  try {
    await fetch("/api/your-action", { method: "POST", body: JSON.stringify({ id }) });
    refetch();
  } finally {
    clearBusy(id);
  }
}

// In JSX:
<button disabled={isBusy(item.id)} onClick={() => handleAction(item.id)}>
  {isBusy(item.id) ? <Spinner /> : "Do it"}
</button>
```

---

## 4. Adding a Character

Zero code changes needed. The dashboard reads all character data from the filesystem at runtime.

1. Create `~/.claude/characters/{tier}/{name}.json`.
2. Follow the schema in `examples/characters/clerk.json`. Required fields:

| Field | Notes |
|-------|-------|
| `name` | Display name, sentence case |
| `tier` | `core` or `meta` |
| `icon` | Lucide icon name (PascalCase) |
| `color` | Hex color — used for chat headers, LED indicators |
| `actions` | Array of `{ label, icon, description }`. Add `endpoint` + `autonomousInput: true` for direct API calls without a chat session. |
| `seeds` | Map of `label -> seed prompt`. Keys must match `actions[].label`. |
| `systemPrompt` | Character instruction passed to Claude. |

3. If the character is assigned tasks in Tana, add their option ID to `lib/tana-schema.ts` (`assignedOptions`) and to `lib/gmail-pipeline.ts` (`ASSIGNED_MAP`).
4. If the character has a custom color, add the CSS variable to `app/globals.css` under `@theme`:

```css
@theme {
  --c-{name}: #hexcolor;
}
```

And add entries to `lib/char-icons.ts` and `lib/characters.ts` to keep the three color sources in sync.

---

## 5. Adding an API Route

Create `app/api/{route}/route.ts` and follow this template:

```ts
import { NextRequest } from "next/server";
import { apiOk, apiError, requireFields } from "@/lib/api-helpers";
import { captureError } from "@/lib/errors";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const missing = requireFields(body, ["fieldA", "fieldB"]);
    if (missing) return apiError(400, missing);

    // ... do work ...

    return apiOk({ result: "done" });
  } catch (e) {
    captureError("your-route", e);
    return apiError(500, "Internal error");
  }
}

export async function GET() {
  try {
    const data = await getSomething();
    return apiOk(data);
  } catch (e) {
    captureError("your-route GET", e);
    return apiError(500, "Internal error");
  }
}
```

For streaming responses (chat/research), use `apiStream(stream)` instead of `apiOk`.

All responses follow `{ ok: boolean, data?: T, error?: string }` — matches the `ApiResponse<T>` type in `types/index.ts`.

---

## 6. Running Tests

```bash
npm test           # run all tests once
npm run test:watch # watch mode
```

Tests use Vitest + jsdom + Testing Library. Config is in `vitest.config.ts`. The `@` alias resolves to the project root.

**Adding a test file**

Mirror the source path under `tests/`:

- `lib/colors.ts` -> `tests/lib/colors.test.ts`
- `hooks/use-busy.ts` -> `tests/hooks/use-busy.test.ts`
- `components/ui/Modal.tsx` -> `tests/components/Modal.test.tsx`

Minimum structure:

```ts
import { describe, it, expect } from "vitest";
import { yourFunction } from "@/lib/your-module";

describe("yourFunction", () => {
  it("does what it should", () => {
    expect(yourFunction("input")).toBe("expected");
  });
});
```

---

## 7. Common Patterns

### useFetchAPI

```tsx
const { data, loading, error, refetch } = useFetchAPI<Email[]>("/api/inbox", {
  pollInterval: 60_000,          // re-fetch every 60s (0 = off)
  transform: (json) => json.data, // unwrap envelope
  manual: false,                  // fetch on mount (default)
});
```

### useLocalStorage

```tsx
const [tab, setTab] = useLocalStorage<string>("inbox-tab", "personal");
// tab persists across reloads. Works as a drop-in for useState.
```

### useBusy

```tsx
const { isBusy, markBusy, clearBusy } = useBusy();
// isBusy(id) returns true while id is in the busy set.
// Use item IDs as keys so multiple items can be independently busy.
```

### buildColorMatcher

```tsx
import { buildColorMatcher } from "@/lib/colors";

// Compiled once, called many times:
const matchColor = buildColorMatcher(config.trackColorPatterns ?? {});
const color = matchColor(track.name) ?? "#94a3b8"; // fallback
```

Config supplies patterns from `ground-control.config.ts` via `/api/system/config`. The pattern format is `{ "#hexcolor": "regex string" }`.

### Modal

```tsx
import { Modal } from "@/components/ui/Modal";

const [open, setOpen] = useState(false);

<Modal open={open} onClose={() => setOpen(false)} title="Confirm" width={400}>
  <div style={{ padding: "var(--sp-4)" }}>
    <p>Are you sure?</p>
    <button onClick={() => setOpen(false)}>Cancel</button>
  </div>
</Modal>
```

Modal handles Escape key, focus trap, and backdrop click automatically.

---

## 8. Design Tokens

All tokens are CSS custom properties defined in `app/globals.css` under `:root`.

**Spacing** (`--sp-1` through `--sp-6`)

| Token | Value |
|-------|-------|
| `--sp-1` | 4px |
| `--sp-2` | 8px |
| `--sp-3` | 12px |
| `--sp-4` | 16px |
| `--sp-5` | 24px |
| `--sp-6` | 32px |

**Font sizes** (`--fs-xs` through `--fs-2xl`)

| Token | Value |
|-------|-------|
| `--fs-xs` | 10px |
| `--fs-sm` | 11px |
| `--fs-base` | 13px (body default) |
| `--fs-md` | 14px |
| `--fs-lg` | 16px |
| `--fs-xl` | 20px |

**Radius:** `--radius-sm` (3px) / `--radius-md` (5px) / `--radius-lg` (6px) / `--radius-xl` (10px)

**Shadows:** `--shadow-sm` through `--shadow-xl` (increasing elevation)

**Transitions:** `--ease-fast` (0.1s) / `--ease-normal` (0.12s) / `--ease-slow` (0.15s) / `--ease-enter` (0.35s, mount animations)

**When to use what:**

- CSS custom properties via `style={{}}`: always. This is the primary styling method.
- Tailwind utility classes: avoid. The project uses `@import "tailwindcss"` only for the `@theme` block to expose character color variables. Do not add Tailwind utility classes to components.
- `app/globals.css` component classes: for repeated structural patterns (e.g., `.dashboard-grid`). Do not add component styles here for one-off layouts.
