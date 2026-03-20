# Ground Control Modular Refactor -- Design Spec

**Date:** 2026-03-20
**Goal:** Transform the dashboard from a working-but-fragile monolith into a professional-grade modular codebase. Every layer gets addressed: types, hooks, components, lib, API, design system, tests, and documentation.

**Success criteria:**
- A professional developer reviewing the code would find it clean, consistent, and well-organized
- Adding a new widget or feature requires touching only the relevant module, not scattered files
- Changing one thing doesn't break unrelated things
- Every pattern appears once (DRY) and each file does one thing (SRP)
- Test coverage protects against regressions on critical paths
- Architect and Engineer characters have clear procedures for how to update, fix, and test

---

## Phase 1: Foundation Layer

Build the shared infrastructure that every other phase depends on. Nothing breaks during this phase because existing code continues working. New modules are additive.

### 1.1 Shared Types (`types/index.ts`)

Create a single types file that all layers import from. Move every inline type definition here. Also migrate types currently scattered across `lib/shared-data.tsx`, `lib/action-log.ts`, `lib/scheduler.ts`, `components/pipeline/SystemGraph.types.ts`, and inline component definitions.

**Client-safe types (used by components + API contracts):**
```typescript
// types/index.ts

// --- Core domain models ---

export interface Task {
  id: string;
  name: string;
  status: "backlog" | "in-progress" | "done";
  priority: "high" | "medium" | "low";
  track: string;
  trackId: string | null;
  assigned: string | null;
  dueDate: string | null;
  phaseId?: string;
  phaseName?: string;
}

export interface Email {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  snippet: string;
  date: string;
  unread: boolean;
  account: "personal" | "school";
  labels: string[];
  threadCount?: number;
}

export interface CalEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  location?: string;
  allDay: boolean;
  calendarId?: string;
  htmlLink?: string;
}

export interface CharacterInfo {
  id: string;
  name: string;
  tier: "core" | "meta" | "stationed";
  color: string;
  icon?: string;
  domain?: string;
  defaultModel?: string;
  model?: string;
  groups?: string[];
  actions?: ActionInfo[];
  seeds?: Record<string, string>;
  suggestions?: string[];
  skills?: string[];
  routingKeywords?: string[];
  sharedKnowledge?: string[];
  schedules?: ScheduleJob[];
}

export interface ActionInfo {
  label: string;
  icon: string;
  description?: string;
  autonomous?: boolean;
  autonomousInput?: boolean;
  inputPlaceholder?: string;
  endpoint?: string;
}

export interface ScheduleJob {
  id: string;
  displayName?: string;
  charName: string;
  seedPrompt: string;
  cron: string;
  description?: string;
  group?: string;
  mode?: string;
  maxTurns?: number;
  enabled?: boolean;
}

export interface JobResult {
  jobId: string;
  charName: string;
  displayName?: string;
  timestamp: string;
  response: string;
  durationMs: number;
  status?: "ok" | "error";
}

export interface ProcessEntry {
  id: string;
  charName: string;
  label: string;
  startTime: string;
  pid?: number;
}

// --- Project/phase types ---

export interface ProjectPhase {
  id: string;
  name: string;
  status: "pending" | "active" | "completed";
  taskCount: number;
  doneCount: number;
  startDate: string | null;
  endDate: string | null;
}

export interface Project {
  id: string;
  name: string;
  trackId: string;
  startDate: string | null;
  deadline: string | null;
  phases: ProjectPhase[];
  lastActivity: { date: string; summary: string } | null;
}

// --- Chat types ---

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  images?: string[];
  charName?: string;
  duration?: number;
  tokens?: number;
}

export interface ChatTab {
  id: string;
  charId: string;
  messages: ChatMessage[];
  modelOverride?: string;
  label?: string;
}

// --- Action log ---

export interface ActionLogEntry {
  timestamp: string;
  widget: "inbox" | "tasks" | "chat" | "crew" | "calendar" | "scheduler" | "bug";
  action: string;
  target: string;
  character?: string;
  detail?: string;
  jobId?: string;
}

// --- System ---

export interface SystemConfig {
  trackColorPatterns?: Record<string, string>;
  emailColorPatterns?: Record<string, string>;
  emailLabelColors?: Record<string, { color: string; bg: string }>;
  calendarColorPatterns?: Record<string, string>;
}

// --- API response envelope ---

export interface ApiResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}
```

**Server-side types (for lib/ and API routes):**
```typescript
// types/server.ts -- not imported by client code
import type { ActionInfo, ScheduleJob } from "./index";

export interface Character {
  id: string;
  name: string;
  tier: "core" | "meta" | "stationed";
  color: string;
  icon?: string;
  domain?: string;
  defaultModel?: string;
  systemPrompt?: string;
  skills?: string[];
  modifiers?: string[];
  sharedKnowledge?: string[];
  knowledgeFile?: string;
  memory: string;
  memoryFile?: string;
  actions?: ActionInfo[];
  outputs?: string[];
  gates?: string[];
  seeds?: Record<string, string>;
  suggestions?: string[];
  canSpawn?: string[];
  trackPatterns?: string[];
  routingKeywords?: string[];
  schedules?: { id: string; displayName: string; seedPrompt: string; cron: string; label: string; enabled: boolean }[];
  groups?: string[];
  // Config-driven flags (replace hardcoded character name checks)
  injectChangelog?: boolean;
  autoReviewConfig?: { skillPatterns: Record<string, string> };
}

// Server types use string for fields that come raw from Tana before mapping
export interface TanaTask {
  id: string;
  name: string;
  status: string;   // raw from Tana, mapped to union at API boundary
  priority: string;
  track: string;
  trackId: string | null;
  assigned: string | null;
  phaseId?: string;
  phaseName?: string;
  dueDate: string | null;
}

export interface TanaPhase {
  id: string;
  name: string;
  status: string;
  track: string;
  trackId: string;
  taskIds: string[];
}

export interface TanaProject {
  id: string;
  name: string;
  trackId: string;
  startDate: string | null;
  deadline: string | null;
  phases: {
    id: string;
    name: string;
    status: "pending" | "active" | "completed";
    taskCount: number;
    doneCount: number;
    startDate: string | null;
    endDate: string | null;
  }[];
  lastActivity: { date: string; summary: string } | null;
}

export interface EmailInput {
  id: string;
  threadId: string;
  from: string;
  fromRaw: string;
  subject: string;
  snippet: string;
  date: string;
  labels: string[];
  account: string;
}

export interface PipelineEntry {
  timestamp: string;
  messageId: string;
  account: string;
  from: string;
  subject: string;
  stages: Record<string, unknown>;
  result: string;
  actions?: string[];
}
```

**Migration notes:**
- `lib/shared-data.tsx` currently defines `CharacterInfo` and `SystemConfig` inline. After this change, it imports from `types/index.ts`.
- `lib/action-log.ts` currently defines `ActionLogEntry` inline. After this change, it imports from `types/index.ts`.
- `lib/scheduler.ts` currently defines `ScheduleJob` and `JobResult`. After this change, it imports from `types/index.ts`.
- `components/pipeline/SystemGraph.types.ts` merges into `types/index.ts` where applicable, rest stays local to that component.
- `lib/chat-store.tsx` type definitions (`ChatTrigger`, etc.) move to `types/index.ts`.
- The `Character` type now includes `memoryFile` (fixes the `as Record<string, unknown>` cast in `app/api/system/files/route.ts`).
- `TanaTask.status` stays as `string` on the server side because Tana returns raw option IDs. The mapping to the union type happens at the API boundary when serializing to `Task`.

**File structure:**
```
types/
  index.ts        -- client-safe types (used by components + API contracts)
  server.ts       -- server-only types (used by lib/ and API routes)
```

### 1.2 Custom Hooks (`hooks/`)

Extract repeated patterns into reusable hooks. Every widget currently reimplements these.

**`hooks/use-fetch-api.ts`** -- replaces 30+ fetch-then-setState patterns:
```typescript
interface UseFetchOptions<T> {
  /** Transform raw JSON before setting state */
  transform?: (raw: any) => T;
  /** Poll interval in ms (0 = no polling) */
  pollInterval?: number;
  /** Don't fetch on mount */
  manual?: boolean;
  /** Dependencies that trigger refetch */
  deps?: unknown[];
}

interface UseFetchResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

function useFetchAPI<T>(url: string, opts?: UseFetchOptions<T>): UseFetchResult<T>
```

Every widget currently does:
```typescript
const [data, setData] = useState([]);
const [loading, setLoading] = useState(true);
useEffect(() => {
  fetch("/api/...").then(r => r.json()).then(d => {
    setData(d.whatever);
    setLoading(false);
  }).catch(() => setLoading(false));
}, []);
```

This becomes:
```typescript
const { data, loading, refetch } = useFetchAPI<Email[]>("/api/inbox", {
  transform: (r) => r.emails,
  pollInterval: 600_000,
});
```

**`hooks/use-local-storage.ts`** -- replaces 4+ localStorage hydration patterns:
```typescript
function useLocalStorage<T>(key: string, initial: T): [T, (v: T | ((prev: T) => T)) => void]
```

**`hooks/use-busy.ts`** -- replaces busy Set pattern (used in Inbox, Tasks, Crew):
```typescript
function useBusy(): {
  isBusy: (id: string) => boolean;
  markBusy: (id: string) => void;
  clearBusy: (id: string) => void;
  busySet: Set<string>;
}
```

**`hooks/use-interval.ts`** -- clean interval with cleanup on unmount:
```typescript
function useInterval(callback: () => void, delayMs: number | null): void
```

Simple version: `null` delay pauses the interval. No pause/resume API needed.

**`hooks/use-click-outside.ts`** -- replaces manual outside-click handlers (StatusBar, CrewWidget):
```typescript
function useClickOutside(ref: RefObject<HTMLElement>, handler: () => void): void
```

**Deferred: `use-action.ts`** -- The action logging + busy tracking pattern varies too much across widgets (some log before, some after; some need response data). Start with `useBusy` + inline `logAction` calls. Extract `useAction` only if the pattern stabilizes after decomposition.

**File structure:**
```
hooks/
  use-fetch-api.ts
  use-local-storage.ts
  use-busy.ts
  use-interval.ts
  use-click-outside.ts
  index.ts           -- barrel export
```

### 1.3 Color Utility (`lib/colors.ts`)

Three widgets rebuild the same color-matching function. Extract once.

```typescript
/**
 * Compiles a Record<hexColor, regexPattern> into a fast lookup function.
 * Used by Inbox (email classification), Tasks (track colors), Calendar (event colors).
 */
export function buildColorMatcher(
  patterns: Record<string, string>
): (text: string) => string | null
```

Current duplication:
- `InboxWidget.tsx`: `buildEmailColor(patterns)` (lines ~40-55)
- `TasksWidget.tsx`: `buildTrackColor(patterns)` (lines ~30-45)
- `CalendarWidget.tsx`: `buildEventColor(patterns)` (lines ~25-40)

All three do the same thing: compile regex patterns, test against input, return hex color.

### 1.4 Consolidate Tana ID Maps

**Problem:** `gmail-pipeline.ts` has its own `ASSIGNED_MAP` and `PRIORITY_MAP` that duplicate `tana-schema.ts`.

**Fix:** Delete the maps from `gmail-pipeline.ts`, import from `tana-schema.ts`:
```typescript
// gmail-pipeline.ts -- before
const ASSIGNED_MAP: Record<string, string> = { postman: "abc", scholar: "def", ... };

// gmail-pipeline.ts -- after
import { ASSIGNED_BY_NAME, PRIORITY_BY_NAME } from "./tana-schema";
```

### 1.5 Design Tokens

Add a spacing and typography scale to CSS variables. Currently magic numbers are scattered everywhere.

Simplified 6-step spacing scale (follows 4-8-12-16-24-32 pattern):
```css
:root {
  /* Spacing scale */
  --sp-1: 4px;
  --sp-2: 8px;
  --sp-3: 12px;
  --sp-4: 16px;
  --sp-5: 24px;
  --sp-6: 32px;

  /* Typography scale */
  --fs-xs: 10px;    /* meta labels, timestamps */
  --fs-sm: 11px;    /* secondary text, calc buttons */
  --fs-base: 13px;  /* body text (current default) */
  --fs-md: 14px;    /* emphasized body */
  --fs-lg: 16px;    /* section headers */
  --fs-xl: 20px;    /* widget titles */
  --fs-2xl: 24px;   /* LCD values */

  /* Border radius */
  --radius-sm: 3px;
  --radius-md: 5px;
  --radius-lg: 6px;
  --radius-xl: 10px;

  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.04);
  --shadow-md: 0 1px 2px rgba(0,0,0,0.04), 0 2px 8px rgba(0,0,0,0.02);
  --shadow-lg: 0 2px 12px rgba(0,0,0,0.06);
  --shadow-xl: 0 4px 20px rgba(0,0,0,0.1);

  /* Transitions */
  --ease-fast: 0.1s ease;
  --ease-normal: 0.12s ease;
  --ease-slow: 0.15s ease;
  --ease-enter: 0.35s ease-out;
}
```

Update `globals.css` to use these tokens instead of raw values. Odd values that don't fit the scale (6px, 10px, 14px) get mapped to the nearest token. For the few places that genuinely need an in-between value (e.g., 6px gap in char-selector), use the raw value with a comment explaining why.

**Rule going forward:** No raw px values in component code. Use design tokens or Tailwind utilities.

### 1.6 Delete Dead Code

- `lib/useSSE.ts` (67 lines) is not imported anywhere. Delete it.
- If SSE streaming is needed as a shared hook (used by ChatWidget and potentially CrewWidget), build a new `hooks/use-sse.ts` during Phase 2 with a clean API. The existing module's interface does not match current usage patterns.

---

## Phase 2: Component Decomposition

Break mega-components into focused subcomponents. Each widget gets its own directory. Subcomponents are small enough to read in one screen.

### 2.1 Directory Structure

```
components/
  home/
    chat/
      ChatPanel.tsx          -- tab management, character selector, outer shell
      ChatMessage.tsx         -- single message rendering (bubble, tools, actions)
      ChatMarkdown.tsx        -- markdown rendering (tables, forms, quick-reply)
      ChatForm.tsx            -- input area (textarea, model selector, skill picker, send)
      ChatToolOutput.tsx      -- tool invocation display
      helpers.ts              -- splitMessage, processInline, expandEmoji, estimateTokens
      index.tsx               -- re-export ChatPanel as default
    crew/
      CrewPanel.tsx           -- tab container, cycle/dispatch controls
      CharacterGrid.tsx       -- character cards with action tiles
      SchedulesTab.tsx        -- job schedule management + overrides
      ProcessesTab.tsx        -- live process monitor with polling
      LogsTab.tsx             -- action log viewer (replaces pipeline/LogsWidget.tsx)
      ProposalsTab.tsx        -- system proposals (replaces pipeline/ProposalsWidget.tsx)
      CharDetailDrawer.tsx    -- character detail sidebar (moved from home/)
      JobResultModal.tsx      -- job output viewer (moved from pipeline/)
      FileEditorModal.tsx     -- file editor modal (moved from pipeline/)
      index.tsx
    tasks/
      TasksPanel.tsx          -- tab container (tasks, projects, classes)
      TaskList.tsx            -- grouped task list with filters
      ProjectsTimeline.tsx    -- Gantt-like project timeline
      ClassesTab.tsx          -- teaching prep checklist (from ClassesWidget.tsx)
      index.tsx
    calendar/
      CalendarPanel.tsx       -- view switcher (list, week, month)
      ListView.tsx            -- chronological event list
      WeekView.tsx            -- time-grid week layout
      MonthView.tsx           -- month calendar grid
      helpers.ts              -- timeOfDayIcon, layoutDayEvents, formatTime
      index.tsx
    inbox/
      InboxPanel.tsx          -- email list with unread counts
      EmailItem.tsx           -- single email row with actions
      SummaryPanel.tsx        -- expandable AI summary
      ReplyPanel.tsx          -- reply composition
      TaskPanel.tsx           -- task extraction from email
      index.tsx
    status/
      StatusBar.tsx           -- status bar (simplified, delegates to sub-components)
      HealthDropdown.tsx      -- service health indicators
      ChangelogModal.tsx      -- changelog viewer
      BugReportModal.tsx      -- bug report form
      index.tsx
  ui/
    Modal.tsx                 -- shared modal (backdrop, close, focus trap, Escape, aria)
    Spinner.tsx               -- loading indicator (Loader2 wrapper)
    EmptyState.tsx            -- "no items" placeholder
    WidgetErrorBoundary.tsx   -- catches render errors per-widget, shows fallback
    Tooltip.tsx               -- existing tooltip (moved here)
    Badge.tsx                 -- character badge component
    Led.tsx                   -- LED indicator dot
    TanaIcon.tsx              -- custom Tana SVG icon (moved from components/icons/)
```

**Pipeline component migration:**
- `components/pipeline/LogsWidget.tsx` (223 lines) -> absorbed into `crew/LogsTab.tsx`
- `components/pipeline/ProposalsWidget.tsx` (458 lines) -> split: core list logic into `crew/ProposalsTab.tsx` (~200 lines), proposal detail into a sub-section or modal
- `components/pipeline/JobResultModal.tsx` (159 lines) -> moved to `crew/JobResultModal.tsx`
- `components/pipeline/FileEditorModal.tsx` (132 lines) -> moved to `crew/FileEditorModal.tsx`
- `components/pipeline/SystemGraph.types.ts` -> types merge into `types/index.ts`, file deleted
- After migration, `components/pipeline/` directory is deleted

### 2.2 Decomposition Rules

Each subcomponent:
- Has one clear responsibility
- Receives data via props (no direct fetch calls except top-level panels)
- Under 200 lines (hard limit: 300)
- Uses shared hooks from `hooks/`
- Uses types from `types/`
- No inline type definitions
- Apply `React.memo` to list item components (ChatMessage, EmailItem) to prevent re-render cascades during streaming/polling

Each panel (top-level per widget):
- Owns the data fetching (via `useFetchAPI`)
- Manages tab/view state
- Passes data down to subcomponents
- Under 300 lines

### 2.3 Widget Error Boundaries

Wrap each widget in `<WidgetErrorBoundary>` in `app/page.tsx`:
```typescript
<WidgetErrorBoundary name="inbox">
  <InboxWidget />
</WidgetErrorBoundary>
```

One widget crashing (e.g., bad API response shape) should not take down the entire dashboard. The error boundary shows a minimal fallback with the widget name and a retry button.

### 2.4 ChatWidget Decomposition Detail

The largest component (2,007 lines). The key challenge is state management: ChatPanel owns ~15 useState calls with complex interactions (messages, streaming, tabs, model overrides).

**State management strategy:** ChatPanel owns all state and passes down via props. No additional context needed because the subcomponents are direct children, not deeply nested.

| Prop flow | From | To | What |
|-----------|------|----|------|
| messages, streamingText, activeTool | ChatPanel | ChatMessage (mapped) | Display data |
| onSend, input, setInput, isLoading | ChatPanel | ChatForm | Input control |
| accent color, onQuickReply | ChatPanel | ChatMarkdown | Rendering config |
| onCopy, onFlag, onExpand, onDelete | ChatPanel | ChatMessage | Action handlers |

The streaming SSE logic stays in ChatPanel (it is tightly coupled to the message state). ChatPanel calls `fetch("/api/chat")`, reads the stream, and updates `messages` and `streamingText` state. Subcomponents receive these as props.

| New File | Lines (est.) | Responsibility |
|----------|-------------|----------------|
| ChatPanel.tsx | ~300 | Tab management, character selector, message state, sendMessage, streaming. |
| ChatMessage.tsx | ~120 | Single message row: avatar, bubble, copy/flag/expand actions. Wraps content in ChatMarkdown. Wrapped in React.memo. |
| ChatMarkdown.tsx | ~200 | Markdown parser: tables, forms, quick-reply buttons, inline formatting, emoji expansion, link processing. Memoizes parsed output. |
| ChatForm.tsx | ~150 | Input textarea with auto-grow, model selector, skill picker dropdown, image paste, send button. |
| ChatToolOutput.tsx | ~80 | Tool invocation display: tool name badge, input label, result formatting. |
| helpers.ts | ~100 | Pure functions: splitMessage, processInline, expandEmoji, toolInputLabel, estimateTokens, getContextLimit. |

**Total: ~950 lines.** Conservative estimate (the original exploration over-counted reduction from shared hooks).

### 2.5 CrewWidget Decomposition Detail

| New File | Lines (est.) | Responsibility |
|----------|-------------|----------------|
| CrewPanel.tsx | ~200 | Tab container, cycle/dispatch controls, tab state. |
| CharacterGrid.tsx | ~200 | Character cards with action tiles, prompt modal, context toggles. |
| SchedulesTab.tsx | ~200 | Job list with last-run times, override editor, run-now buttons. |
| ProcessesTab.tsx | ~100 | Process list with polling, stop buttons. |
| LogsTab.tsx | ~100 | Action log subscription, entry rendering (absorbs pipeline/LogsWidget). |
| ProposalsTab.tsx | ~200 | Proposal list + detail (absorbs pipeline/ProposalsWidget, refactored under 300-line limit). |
| CharDetailDrawer.tsx | ~250 | Character detail sidebar with skills/memory/knowledge tabs. |
| JobResultModal.tsx | ~160 | Job output viewer (moved from pipeline/). |
| FileEditorModal.tsx | ~130 | File editor (moved from pipeline/). |

**Total: ~1,540 lines** for the crew directory (includes modals previously in pipeline/).

### 2.6 Other Widget Decompositions

**TasksWidget (1,291 lines):**
- TasksPanel.tsx (~200) -- tab container, fetches tasks + projects
- TaskList.tsx (~250) -- grouped task list with priority filters, track colors
- ProjectsTimeline.tsx (~250) -- Gantt timeline with month navigation, phase rows
- ClassesTab.tsx (~200) -- from ClassesWidget.tsx (533 lines, simplified with shared hooks)

**CalendarWidget (1,007 lines):**
- CalendarPanel.tsx (~150) -- view switcher, fetches events
- ListView.tsx (~120) -- chronological list with urgency badges
- WeekView.tsx (~250) -- time grid, column layout, now-line, auto-scroll
- MonthView.tsx (~200) -- calendar grid with day cells
- helpers.ts (~80) -- timeOfDayIcon, layoutDayEvents, formatTime, isPast, isCurrent

**InboxWidget (653 lines):**
- InboxPanel.tsx (~200) -- email list, unread counts, fetches emails
- EmailItem.tsx (~120) -- single email row with action bar
- SummaryPanel.tsx (~80) -- expandable AI summary display
- ReplyPanel.tsx (~80) -- reply textarea with send
- TaskPanel.tsx (~80) -- task extraction with character selector

**StatusBar (557 lines):**
- StatusBar.tsx (~150) -- clock, version, health dot, bug button
- HealthDropdown.tsx (~120) -- service status indicators with retry/restart
- ChangelogModal.tsx (~150) -- changelog parser and viewer
- BugReportModal.tsx (~60) -- bug report form

### 2.7 Shared UI Components

**Modal.tsx** -- replaces ~5 independent modal implementations:
```typescript
interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  width?: number;       // default 480
  children: React.ReactNode;
}
```

Includes: `role="dialog"`, `aria-modal="true"`, focus trap (tab cycling), Escape key handler, click-outside-to-close, enter/exit animation. All modals in the codebase use this as their shell.

**Spinner.tsx:**
```typescript
interface SpinnerProps {
  label?: string;       // e.g. "Loading tasks..."
  size?: number;        // icon size, default 16
  inline?: boolean;     // inline vs centered block
}
```

**EmptyState.tsx:**
```typescript
interface EmptyStateProps {
  icon?: LucideIcon;
  message: string;
}
```

### 2.8 Context Provider Cleanup

After decomposition, update `lib/shared-data.tsx` and `lib/chat-store.tsx`:
- Import types from `types/index.ts` (remove inline definitions)
- Keep the providers themselves (SharedDataProvider, ChatProvider) -- they work well
- The `useChatTrigger` hook stays as the cross-widget communication mechanism

---

## Phase 3: Lib Layer Cleanup

### 3.1 Split `tana.ts` (1,242 lines)

```
lib/
  tana/
    client.ts          -- mcpCall wrapper, connection config (~60 lines)
    queries.ts         -- getTanaTasks, getTanaPhases, getTanaProjects, getClassNodes (~500 lines)
    mutations.ts       -- createTask, markTaskDone, setTaskPriority, archiveTask, trashTask, openNode (~250 lines)
    routing.ts         -- resolveCharacter, characterForTrack, routing overrides (~150 lines)
    cache.ts           -- excludeTask, getExcludedIds, task-exclusions.json management (~80 lines)
    index.ts           -- barrel re-export of all public functions
```

All files import `mcpCall` from `client.ts`. External consumers still do `import { getTanaTasks } from "@/lib/tana"`.

**Dependency note:** `routing.ts` depends on `getCharacters()` from `lib/characters.ts` for dynamic character lookups. This is an intentional cross-module dependency (routing needs character configs to resolve assignments). Document this in the file header.

### 3.2 Extract Auto-Review Logic

`app/api/chat/route.ts` contains a 107-line `wrapWithAutoReview()` function tightly coupled to the Scholar character. Extract to:

```
lib/auto-review.ts    -- wrapWithAutoReview(stream, characterId, config)
```

The character's `autoReviewConfig` field (added to Character type in Phase 1.1) drives behavior:
```json
{
  "autoReviewConfig": {
    "skillPatterns": {
      "thesis|tez": "scholar-thesis",
      "critique|review": "scholar-critique"
    }
  }
}
```

The chat route becomes:
```typescript
import { wrapWithAutoReview } from "@/lib/auto-review";
// ...
if (character.autoReviewConfig) {
  stream = wrapWithAutoReview(stream, character.id, character.autoReviewConfig);
}
```

### 3.3 Clean up `gmail-pipeline.ts` (502 lines)

- Remove duplicated `ASSIGNED_MAP` and `PRIORITY_MAP`. Import from `tana-schema.ts`.
- Remove duplicated `CHARACTER_SUBJECT_PATTERNS`. Derive from character config `routingKeywords`.
- Extract `CHARACTER_LABEL_MAP` to derive from character configs dynamically: `"${charName}-routed"` convention.

The pipeline itself stays as one file (the stages are sequential and tightly coupled), but its hardcoded maps get eliminated.

### 3.4 Fix Character Type

Already addressed in Phase 1.1. `memoryFile` is now in the type. Remove the `as Record<string, unknown>` cast in `app/api/system/files/route.ts`.

### 3.5 Eliminate Hardcoded Character Names

Six locations hardcode character names. For each:

| Location | Current | Fix |
|----------|---------|-----|
| `lib/prompt.ts:88` | `if (characterId === "architect")` | Character config gets `injectChangelog: true` field |
| `gmail-pipeline.ts` subject patterns | Hardcoded regex per character | Derive from character config `routingKeywords` |
| `gmail-pipeline.ts` ASSIGNED_MAP | Hardcoded map | Import from `tana-schema.ts` |
| `gmail-pipeline.ts` CHARACTER_LABEL_MAP | Hardcoded map | Derive: `"${charName}-routed"` convention |
| `api/chat/route.ts` Scholar skill map | Hardcoded skill patterns | Move to `autoReviewConfig` in Scholar character JSON |
| `lib/char-icons.ts` charColor | Hardcoded color map | Derive from loaded character configs at build time |

**Goal:** Adding a new character requires only creating a JSON config file. Zero code changes.

### 3.6 Error Handling Pattern

Currently: silent `catch(() => {})` everywhere.

Create a server-side logger that captures errors without crashing:

```typescript
// lib/errors.ts
export function captureError(context: string, error: unknown): void {
  const msg = error instanceof Error ? error.message : String(error);
  serverLog({ level: "error", context, message: msg });
}
```

API routes use it:
```typescript
catch (err) {
  captureError("tana-tasks/action", err);
  return apiError(500, "Task action failed");
}
```

Client-side: `useFetchAPI` surfaces errors via `error` field. Widgets can show error state instead of silent empty lists.

---

## Phase 4: API Standardization

### 4.1 Response Helpers (`lib/api-helpers.ts`)

```typescript
import { NextResponse } from "next/server";

export function apiOk<T>(data?: T, status = 200) {
  return NextResponse.json({ ok: true, ...(data !== undefined && { data }) }, { status });
}

export function apiError(status: number, message: string) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export function apiStream(stream: ReadableStream) {
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
```

Every route uses these instead of constructing NextResponse.json manually.

### 4.2 Input Validation (`lib/api-helpers.ts`)

```typescript
export function requireFields<T extends Record<string, unknown>>(
  body: T,
  fields: (keyof T)[]
): string | null {
  for (const f of fields) {
    const v = body[f];
    if (v === undefined || v === null || (typeof v === "string" && !v.trim())) {
      return `${String(f)} is required`;
    }
  }
  return null;
}

export const SAFE_NAME = /^[a-z0-9-]+$/;

export function validateName(name: string): string | null {
  if (!name || !SAFE_NAME.test(name)) return "Invalid name";
  return null;
}
```

### 4.3 Route Pattern

Every route follows the same structure:
```typescript
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const err = requireFields(body, ["taskId", "action"]);
    if (err) return apiError(400, err);

    // ... business logic ...

    return apiOk({ message: "Done" });
  } catch (e) {
    captureError("route-name", e);
    return apiError(500, "Internal error");
  }
}
```

---

## Phase 5: Design System Polish

### 5.1 Token Migration

Update all CSS classes in `globals.css` to use the design token variables from Phase 1.5.

Example migration:
```css
/* Before */
.widget-header { padding: 10px 16px; gap: 8px; }
.widget-body { padding: 14px 16px; }

/* After */
.widget-header { padding: var(--sp-3) var(--sp-4); gap: var(--sp-2); }
.widget-body { padding: var(--sp-3) var(--sp-4); }
```

### 5.2 Eliminate Inline Styles

The main page (`app/page.tsx`) uses inline styles for the grid layout. Move to CSS:

```css
.dashboard-grid {
  display: grid;
  grid-template-rows: 44px 1fr 1.4fr;
  grid-template-columns: 1fr 1fr 1fr;
  gap: var(--sp-3);
  height: calc(100vh - 44px);
}
```

Components that use inline `style={}` for layout (borders, colors, spacing) should use:
- CSS classes for structural layout
- CSS variables for dynamic values (character colors via `style={{ "--char-color": color } as React.CSSProperties}`)
- Tailwind utilities only for one-off overrides that don't warrant a class

### 5.3 Typography Consistency

Current font sizes in components: 8px, 10px, 11px, 12px, 12.5px, 13px, 16px, 24px.

Normalize to the scale: 10, 11, 12, 13, 14, 16, 20, 24. Kill 8px (bump to 10px) and 12.5px (use 13px).

### 5.4 Consistent Spacing

Audit all padding/margin/gap values. Map to the 6-step scale (4, 8, 12, 16, 24, 32). Odd values like 6px, 10px, 14px get mapped to the nearest step. Document exceptions where a non-scale value is genuinely needed.

---

## Phase 6: Test Coverage

### 6.1 Test Infrastructure

```bash
npm install -D vitest @testing-library/react@16 @testing-library/jest-dom jsdom
```

Pin `@testing-library/react` to v16+ for React 19 compatibility.

`vitest.config.ts`:
```typescript
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname) },
  },
});
```

Add to `package.json`:
```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

### 6.2 Test Targets (Priority Order)

**Lib unit tests (highest value, lowest effort):**
- `lib/tana/routing.ts` -- character resolution logic (most complex, most fragile)
- `lib/tana/cache.ts` -- exclusion tracking with TTL
- `lib/date-format.ts` -- date formatting and urgency calculation
- `lib/colors.ts` -- color pattern matcher
- `lib/api-helpers.ts` -- response builders, validators

**Hook tests:**
- `hooks/use-fetch-api.ts` -- fetch lifecycle, polling, error states
- `hooks/use-local-storage.ts` -- hydration, serialization

**Component tests (spot checks, not exhaustive):**
- `ChatMarkdown` -- markdown rendering edge cases
- `Modal` -- open/close lifecycle, focus trap, Escape key

**API integration tests:**
- `api/tana-tasks/action` -- task mutation happy path
- `api/inbox/action` -- email action routing

### 6.3 Test File Locations

```
tests/
  setup.ts
  lib/
    tana-routing.test.ts
    tana-cache.test.ts
    date-format.test.ts
    colors.test.ts
    api-helpers.test.ts
  hooks/
    use-fetch-api.test.ts
    use-local-storage.test.ts
  components/
    ChatMarkdown.test.tsx
    Modal.test.tsx
```

---

## Phase 7: Documentation

After the refactor is complete, write documentation for the Architect and Engineer characters. This becomes their operational reference for maintaining Ground Control.

### 7.1 Engineer Operations Guide (`docs/engineer-guide.md`)

- **Directory map:** what lives where and why
- **Adding a widget:** step-by-step (create directory, panel, subcomponents, API route, types)
- **Adding a feature to an existing widget:** which files to touch, how to add state, how to add an action
- **Adding a character:** what the JSON config needs, what Ground Control picks up automatically
- **Adding an API route:** use `apiOk`/`apiError`/`requireFields`, follow the route pattern
- **Running tests:** `npm test`, `npm run test:watch`, how to add a new test
- **Common patterns:** useFetchAPI, useLocalStorage, useBusy, buildColorMatcher, Modal usage
- **Design tokens:** spacing scale, font scale, color variables, when to use CSS classes vs Tailwind

### 7.2 Architect Operations Guide (`docs/architect-guide.md`)

- **System health checks:** what to verify after changes
- **Schema changes:** how Tana IDs flow through the system (tana-schema.ts -> lib/tana/ -> API -> types -> components)
- **Character ecosystem:** how character configs, skills, knowledge, and memory files connect
- **Supporting file consistency:** the single-source-of-truth chain for colors, IDs, routing
- **Refactoring procedures:** how to split a file that has grown too large, how to extract a shared utility
- **Release procedures:** changelog, versioning, feature gate checklist

---

## Phase Ordering and Dependencies

```
Phase 1 (Foundation)
  ├── 1.1 Types           (no deps)
  ├── 1.2 Hooks            (depends on 1.1 for types)
  ├── 1.3 Color utility    (no deps)
  ├── 1.4 Tana ID consolidation (no deps)
  ├── 1.5 Design tokens    (no deps)
  └── 1.6 Dead code cleanup (no deps)
      ↓
Phase 2 (Components)     -- depends on Phase 1
  ├── 2.1-2.6 Widget decomposition (parallel per widget)
  ├── 2.3 Error boundaries
  └── 2.7 Shared UI components (parallel)
      ↓
Phase 3 (Lib cleanup)    -- can start during Phase 2
  ├── 3.1 Split tana.ts
  ├── 3.2 Extract auto-review
  ├── 3.3 Clean pipeline
  ├── 3.4 Fix Character type (already done in 1.1)
  ├── 3.5 Eliminate hardcoded names
  └── 3.6 Error handling
      ↓
Phase 4 (API)            -- depends on Phase 3 for types/helpers
  ├── 4.1-4.3 Standardize routes
      ↓
Phase 5 (Design)         -- depends on Phase 1.5 for tokens
  ├── 5.1-5.4 Token migration + cleanup
      ↓
Phase 6 (Tests)          -- depends on all prior phases
  ├── 6.1-6.3 Test infrastructure + coverage
      ↓
Phase 7 (Documentation)  -- depends on all prior phases
  ├── 7.1 Engineer guide
  └── 7.2 Architect guide
```

**Parallelization opportunities:**
- Phase 1 substeps are all independent (run in parallel)
- Phase 2 widget decompositions are independent per widget (run in parallel)
- Phase 3 can start once Phase 1 types are in place
- Phase 5 can start once Phase 1.5 tokens are defined
- Phase 6 and 7 can overlap

---

## Risk Mitigation

**No tests exist yet.** To avoid breaking things during the refactor:
1. Each phase runs in a git worktree (isolated branch)
2. Manual smoke test after each phase: load dashboard, verify all widgets render and basic actions work
3. Phase 6 (tests) protects against future regressions
4. Each widget decomposition is a separate commit, so any breakage is easy to bisect

**Import path changes.** Moving files changes import paths. Strategy:
- Barrel exports (`index.ts`) in each new directory maintain the same import paths where possible
- For components: old `components/home/ChatWidget` path gets a re-export from new `components/home/chat/index.tsx`

**Supporting file ecosystem.** Character configs, skills, knowledge files are external to Ground Control. This refactor does not change their format. It only changes how Ground Control loads and references them (eliminating hardcoded names, using dynamic lookups).

**Performance during component decomposition.** Splitting mega-components into many subcomponents introduces more React reconciliation work. Mitigations:
- `React.memo` on list item components (ChatMessage, EmailItem)
- Memoize parsed markdown output in ChatMarkdown
- Keep streaming state updates in ChatPanel (don't pass streaming text through unnecessary intermediate components)

---

## Files Changed Summary

**New files (~35):**
- `types/index.ts`, `types/server.ts`
- `hooks/` (6 files + barrel)
- `lib/colors.ts`, `lib/api-helpers.ts`, `lib/errors.ts`, `lib/auto-review.ts`
- `lib/tana/` (6 files replacing 1)
- `components/ui/` (8 shared UI components)
- `tests/` (10+ test files)
- `vitest.config.ts`, `tests/setup.ts`
- `docs/engineer-guide.md`, `docs/architect-guide.md`

**Modified files (~35):**
- All widget components (decomposed into subcomponents in new directories)
- `app/globals.css` (design tokens + token migration)
- `app/page.tsx` (CSS class instead of inline styles, error boundaries)
- `lib/shared-data.tsx` (import types from types/)
- `lib/chat-store.tsx` (import types from types/)
- `lib/action-log.ts` (import types from types/)
- `lib/gmail-pipeline.ts` (remove duplicated maps, derive from config)
- `lib/prompt.ts` (remove hardcoded character name)
- `lib/char-icons.ts` (derive from character configs)
- `lib/characters.ts` (use updated type)
- `lib/tana-schema.ts` (add reverse lookup exports)
- `app/api/chat/route.ts` (extract auto-review, use character config)
- All 42 API routes (use apiOk/apiError/requireFields)
- `package.json` (add vitest + testing deps)

**Deleted files (~8):**
- `lib/tana.ts` (replaced by `lib/tana/` directory)
- `lib/useSSE.ts` (dead code)
- `components/home/ChatWidget.tsx` (replaced by `chat/` directory)
- `components/home/CrewWidget.tsx` (replaced by `crew/` directory)
- `components/home/ClassesWidget.tsx` (moved to `tasks/ClassesTab.tsx`)
- `components/home/CharDetailDrawer.tsx` (moved to `crew/`)
- `components/pipeline/` (entire directory, contents migrated to `crew/`)

**Net line change estimate:**
- Current: ~17,600 lines
- After: ~14,500 lines (17% reduction from deduplication and shared abstractions)
- Plus ~1,500 lines of tests
- Plus ~500 lines of documentation
