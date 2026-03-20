# Ground Control Modular Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the Ground Control dashboard into a professional-grade modular codebase across 7 phases: types, hooks, components, lib, API, design, tests, docs.

**Architecture:** Additive-first approach. Phase 1 creates new shared infrastructure without modifying existing code. Phase 2 decomposes mega-components onto that foundation. Phases 3-7 clean up the lib layer, standardize APIs, polish design tokens, add tests, and write documentation.

**Tech Stack:** Next.js 16.1.6, React 19.2.3, TypeScript 5 (strict), Tailwind CSS 4.2.1, Vitest, Testing Library

**Spec:** `docs/superpowers/specs/2026-03-20-modular-refactor-design.md`

---

## Phase 1: Foundation Layer

All tasks in this phase are additive. Existing code keeps working. No modifications to existing files except where noted.

---

### Task 1: Shared Types — Client

**Files:**
- Create: `types/index.ts`

- [ ] **Step 1: Create the types directory and client types file**

Create `types/index.ts` with all client-safe type definitions. These are extracted from inline definitions scattered across:
- `lib/shared-data.tsx` lines 6-41 (CharacterInfo, SystemConfig, SharedDataValue)
- `lib/action-log.ts` lines 1-9 (ActionLogEntry)
- `lib/chat-store.tsx` lines 4-16 (ChatTrigger, ChatContextValue)
- `components/home/ChatWidget.tsx` lines 17-41 (CharacterInfo, Message, TabMeta)
- `components/home/InboxWidget.tsx` lines 10-22 (Email)
- `components/home/TasksWidget.tsx` lines 14-25, 75-93 (Task, ProjectPhase, Project)
- `components/home/CalendarWidget.tsx` lines 24-33 (CalEvent)
- `components/home/CrewWidget.tsx` lines 16-39 (ActionInfo, CharacterInfo)

Write the complete file as specified in the design spec section 1.1. Include all interfaces: Task, Email, CalEvent, CharacterInfo, ActionInfo, ScheduleJob, JobResult, ProcessEntry, ProjectPhase, Project, ChatMessage, ChatTab, ActionLogEntry, SystemConfig, ApiResponse, ChatTrigger, ChatContextValue.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd ~/Projects/ground-control && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors from types/index.ts (existing code may have errors, that's fine)

- [ ] **Step 3: Commit**

```bash
git add types/index.ts
git commit -m "feat: add shared client types (types/index.ts)"
```

---

### Task 2: Shared Types — Server

**Files:**
- Create: `types/server.ts`

- [ ] **Step 1: Create server-only types file**

Create `types/server.ts` with server-side types. These are extracted from:
- `lib/characters.ts` lines 5-28 (Character type)
- `lib/tana.ts` lines 87-128 (TanaTask, TanaPhase, TanaProject)
- `lib/gmail-pipeline.ts` lines 13-40 (EmailInput, RouteAction, ClassifyResult, RouteResult, PipelineEntry)

Import shared sub-types from `./index` (ActionInfo). Add `memoryFile?: string` to Character. Add `injectChangelog?: boolean` and `autoReviewConfig?: { skillPatterns: Record<string, string> }` to Character. Do NOT include `delegatesTo` or `escalateModel` (YAGNI).

**Critical type accuracy notes (match actual source exactly):**
- `TanaTask.priority` is `string` (not `string | null`). `TanaTask.trackId` is `string | null`.
- `TanaProject.lastActivity` is `{ date: string; summary: string } | null` (compound object, not string)
- `TanaProject.phases` is an inline array type with `status: "pending" | "active" | "completed"`, `taskCount`, `doneCount`, `startDate: string | null`, `endDate: string | null`
- `Character.schedules` uses an inline type `{ id: string; displayName: string; seedPrompt: string; cron: string; label: string; enabled: boolean }[]` (NOT the full ScheduleJob type which has extra fields like charName, description, group, mode, maxTurns)
- `SystemConfig.emailLabelColors` is `Record<string, { color: string; bg: string }>` (compound value, not flat string)
- All `SystemConfig` fields are optional (`?`)

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd ~/Projects/ground-control && npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add types/server.ts
git commit -m "feat: add shared server types (types/server.ts)"
```

---

### Task 3: Custom Hooks — useFetchAPI

**Files:**
- Create: `hooks/use-fetch-api.ts`

- [ ] **Step 1: Create the hooks directory and useFetchAPI hook**

```typescript
"use client";
import { useState, useEffect, useCallback, useRef } from "react";

interface UseFetchOptions<T> {
  transform?: (raw: any) => T;
  pollInterval?: number;
  manual?: boolean;
  deps?: unknown[];
}

interface UseFetchResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useFetchAPI<T>(
  url: string,
  opts: UseFetchOptions<T> = {}
): UseFetchResult<T> {
  const { transform, pollInterval = 0, manual = false, deps = [] } = opts;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(!manual);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const transformRef = useRef(transform);
  transformRef.current = transform;

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const json = await res.json();
      if (!mountedRef.current) return;
      setData(transformRef.current ? transformRef.current(json) : json);
    } catch (e) {
      if (!mountedRef.current) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [url, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    mountedRef.current = true;
    if (!manual) fetchData();
    return () => { mountedRef.current = false; };
  }, [fetchData, manual]);

  useEffect(() => {
    if (!pollInterval || pollInterval <= 0) return;
    const id = setInterval(fetchData, pollInterval);
    return () => clearInterval(id);
  }, [fetchData, pollInterval]);

  return { data, loading, error, refetch: fetchData };
}
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `cd ~/Projects/ground-control && npx tsc --noEmit hooks/use-fetch-api.ts 2>&1 | head -10`

- [ ] **Step 3: Commit**

```bash
git add hooks/use-fetch-api.ts
git commit -m "feat: add useFetchAPI hook"
```

---

### Task 4: Custom Hooks — useLocalStorage, useBusy, useInterval, useClickOutside

**Files:**
- Create: `hooks/use-local-storage.ts`
- Create: `hooks/use-busy.ts`
- Create: `hooks/use-interval.ts`
- Create: `hooks/use-click-outside.ts`
- Create: `hooks/index.ts`

- [ ] **Step 1: Create useLocalStorage**

```typescript
"use client";
import { useState, useEffect, useCallback } from "react";

export function useLocalStorage<T>(
  key: string,
  initial: T
): [T, (v: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return initial;
    try {
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch { /* quota exceeded or private browsing */ }
  }, [key, value]);

  return [value, setValue];
}
```

- [ ] **Step 2: Create useBusy**

```typescript
"use client";
import { useState, useCallback } from "react";

export function useBusy() {
  const [busySet, setBusySet] = useState<Set<string>>(new Set());

  const isBusy = useCallback((id: string) => busySet.has(id), [busySet]);

  const markBusy = useCallback((id: string) => {
    setBusySet((prev) => new Set(prev).add(id));
  }, []);

  const clearBusy = useCallback((id: string) => {
    setBusySet((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  return { isBusy, markBusy, clearBusy, busySet };
}
```

- [ ] **Step 3: Create useInterval**

```typescript
"use client";
import { useEffect, useRef } from "react";

export function useInterval(callback: () => void, delayMs: number | null) {
  const savedCallback = useRef(callback);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (delayMs === null || delayMs <= 0) return;
    const id = setInterval(() => savedCallback.current(), delayMs);
    return () => clearInterval(id);
  }, [delayMs]);
}
```

- [ ] **Step 4: Create useClickOutside**

```typescript
"use client";
import { useEffect, type RefObject } from "react";

export function useClickOutside(
  ref: RefObject<HTMLElement | null>,
  handler: () => void
) {
  useEffect(() => {
    const listener = (e: MouseEvent | TouchEvent) => {
      if (!ref.current || ref.current.contains(e.target as Node)) return;
      handler();
    };
    document.addEventListener("mousedown", listener);
    document.addEventListener("touchstart", listener);
    return () => {
      document.removeEventListener("mousedown", listener);
      document.removeEventListener("touchstart", listener);
    };
  }, [ref, handler]);
}
```

- [ ] **Step 5: Create barrel export**

```typescript
// hooks/index.ts
export { useFetchAPI } from "./use-fetch-api";
export { useLocalStorage } from "./use-local-storage";
export { useBusy } from "./use-busy";
export { useInterval } from "./use-interval";
export { useClickOutside } from "./use-click-outside";
```

- [ ] **Step 6: Verify TypeScript compiles**

Run: `cd ~/Projects/ground-control && npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 7: Commit**

```bash
git add hooks/
git commit -m "feat: add shared hooks (useLocalStorage, useBusy, useInterval, useClickOutside)"
```

---

### Task 5: Color Utility

**Files:**
- Create: `lib/colors.ts`

- [ ] **Step 1: Create buildColorMatcher**

Extract the duplicated pattern from:
- `components/home/InboxWidget.tsx` lines 29-41 (`buildEmailColor`)
- `components/home/TasksWidget.tsx` lines 34-45 (`buildTrackColor`)
- `components/home/CalendarWidget.tsx` lines 35-46 (`buildEventColor`)

All three compile `Record<hexColor, regexPattern>` into a lookup function. Write the unified version:

```typescript
/**
 * Compiles a Record<hexColor, regexPattern> into a fast color lookup.
 * Returns null if no pattern matches.
 */
export function buildColorMatcher(
  patterns: Record<string, string>
): (text: string) => string | null {
  const compiled = Object.entries(patterns).map(([color, pattern]) => ({
    color,
    re: new RegExp(pattern, "i"),
  }));
  return (text: string) => {
    for (const { color, re } of compiled) {
      if (re.test(text)) return color;
    }
    return null;
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/colors.ts
git commit -m "feat: add shared buildColorMatcher utility"
```

---

### Task 6: API Helpers

**Files:**
- Create: `lib/api-helpers.ts`
- Create: `lib/errors.ts`

- [ ] **Step 1: Create API response helpers**

```typescript
// lib/api-helpers.ts
import { NextResponse } from "next/server";

export function apiOk<T>(data?: T, status = 200) {
  return NextResponse.json(
    { ok: true, ...(data !== undefined && { data }) },
    { status }
  );
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

- [ ] **Step 2: Create error capture utility**

```typescript
// lib/errors.ts
import { serverLog } from "./server-log";

export function captureError(context: string, error: unknown): void {
  const msg = error instanceof Error ? error.message : String(error);
  serverLog({ level: "error", context, message: msg });
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/api-helpers.ts lib/errors.ts
git commit -m "feat: add API helpers and error capture utility"
```

---

### Task 7: Design Tokens

**Files:**
- Modify: `app/globals.css` (add tokens to `:root`, do NOT migrate existing values yet)

- [ ] **Step 1: Add design token variables to globals.css**

Insert the following block AFTER the existing `:root` variables (after line 47, before the `* { box-sizing }` rule at line 50). Add them inside the existing `:root` block:

```css
  /* --- Design Tokens --- */
  --sp-1: 4px;
  --sp-2: 8px;
  --sp-3: 12px;
  --sp-4: 16px;
  --sp-5: 24px;
  --sp-6: 32px;

  --fs-xs: 10px;
  --fs-sm: 11px;
  --fs-base: 13px;
  --fs-md: 14px;
  --fs-lg: 16px;
  --fs-xl: 20px;
  --fs-2xl: 24px;

  --radius-sm: 3px;
  --radius-md: 5px;
  --radius-lg: 6px;
  --radius-xl: 10px;

  --shadow-sm: 0 1px 2px rgba(0,0,0,0.04);
  --shadow-md: 0 1px 2px rgba(0,0,0,0.04), 0 2px 8px rgba(0,0,0,0.02);
  --shadow-lg: 0 2px 12px rgba(0,0,0,0.06);
  --shadow-xl: 0 4px 20px rgba(0,0,0,0.1);

  --ease-fast: 0.1s ease;
  --ease-normal: 0.12s ease;
  --ease-slow: 0.15s ease;
  --ease-enter: 0.35s ease-out;
```

- [ ] **Step 2: Commit**

```bash
git add app/globals.css
git commit -m "feat: add design tokens to CSS variables"
```

---

### Task 8: Consolidate Tana ID Maps

**Files:**
- Modify: `lib/gmail-pipeline.ts` (lines 153-164)
- Verify: `lib/tana-schema.ts` has matching exports

- [ ] **Step 1: Verify tana-schema.ts has ASSIGNED_BY_NAME and PRIORITY_BY_NAME exports**

Read `lib/tana-schema.ts` and confirm these reverse-lookup maps exist. If not, add them.

- [ ] **Step 2: Replace ASSIGNED_MAP and PRIORITY_MAP in gmail-pipeline.ts**

In `lib/gmail-pipeline.ts`, delete the `ASSIGNED_MAP` (lines 153-160) and `PRIORITY_MAP` (lines 162-164) declarations. Replace with imports:

```typescript
import { ASSIGNED_BY_NAME, PRIORITY_BY_NAME } from "./tana-schema";
```

Then find-and-replace all references in the file:
- `ASSIGNED_MAP[` -> `ASSIGNED_BY_NAME[`
- `PRIORITY_MAP[` -> `PRIORITY_BY_NAME[`

- [ ] **Step 3: Verify the app builds**

Run: `cd ~/Projects/ground-control && npm run build 2>&1 | tail -20`

- [ ] **Step 4: Commit**

```bash
git add lib/gmail-pipeline.ts lib/tana-schema.ts
git commit -m "refactor: consolidate Tana ID maps to single source of truth"
```

---

### Task 9: Delete Dead Code

**Files:**
- Delete: `lib/useSSE.ts`

- [ ] **Step 1: Confirm useSSE.ts is not imported anywhere**

Run: `grep -r "useSSE\|use-sse\|from.*useSSE" ~/Projects/ground-control/lib/ ~/Projects/ground-control/components/ ~/Projects/ground-control/app/ --include="*.ts" --include="*.tsx" -l`

Expected: No results (or only `lib/useSSE.ts` itself)

- [ ] **Step 2: Delete the file**

```bash
rm ~/Projects/ground-control/lib/useSSE.ts
```

- [ ] **Step 3: Commit**

```bash
git add -u lib/useSSE.ts
git commit -m "chore: remove dead useSSE module"
```

---

### Task 10: Shared UI Components

**Files:**
- Create: `components/ui/Modal.tsx`
- Create: `components/ui/Spinner.tsx`
- Create: `components/ui/EmptyState.tsx`
- Create: `components/ui/WidgetErrorBoundary.tsx`
- Create: `components/ui/Led.tsx`

- [ ] **Step 1: Create Modal component**

```typescript
"use client";
import { useEffect, useRef, type ReactNode } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  width?: number;
  children: ReactNode;
}

export function Modal({ open, onClose, title, width = 480, children }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !dialogRef.current) return;
    const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length) focusable[0].focus();
  }, [open]);

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 300,
        background: "rgba(0,0,0,0.4)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-xl)",
          width, maxWidth: "90vw", maxHeight: "80vh",
          display: "flex", flexDirection: "column",
          overflow: "hidden",
          animation: "enter 0.2s ease-out",
        }}
      >
        {title && (
          <div style={{
            padding: "var(--sp-3) var(--sp-4)",
            borderBottom: "1px solid var(--border)",
            fontWeight: 600, fontSize: "var(--fs-base)",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <span>{title}</span>
            <button
              onClick={onClose}
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: "var(--text-3)", fontSize: "var(--fs-lg)",
                padding: 0, lineHeight: 1,
              }}
            >
              x
            </button>
          </div>
        )}
        <div style={{ overflow: "auto", flex: 1 }}>
          {children}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create Spinner component**

```typescript
"use client";
import { Loader2 } from "lucide-react";

interface SpinnerProps {
  label?: string;
  size?: number;
  inline?: boolean;
}

export function Spinner({ label, size = 16, inline = false }: SpinnerProps) {
  const content = (
    <>
      <Loader2 size={size} style={{ animation: "spin 1s linear infinite" }} />
      {label && <span style={{ fontSize: "var(--fs-sm)", color: "var(--text-3)", marginLeft: 6 }}>{label}</span>}
    </>
  );

  if (inline) {
    return <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--text-3)" }}>{content}</span>;
  }

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "var(--sp-4)", color: "var(--text-3)" }}>
      {content}
    </div>
  );
}
```

- [ ] **Step 3: Create EmptyState component**

```typescript
"use client";
import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";

interface EmptyStateProps {
  icon?: LucideIcon;
  message: string;
}

export function EmptyState({ icon: Icon = Inbox, message }: EmptyStateProps) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", gap: 8, padding: "var(--sp-5)",
      color: "var(--text-3)", fontSize: "var(--fs-sm)",
    }}>
      <Icon size={20} />
      <span>{message}</span>
    </div>
  );
}
```

- [ ] **Step 4: Create WidgetErrorBoundary**

```typescript
"use client";
import { Component, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

interface Props {
  name: string;
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class WidgetErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="widget" style={{
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          gap: 8, padding: "var(--sp-4)", color: "var(--text-3)",
        }}>
          <AlertTriangle size={20} />
          <span style={{ fontSize: "var(--fs-sm)" }}>
            {this.props.name} failed to render
          </span>
          <button
            className="calc-btn calc-btn-sm"
            onClick={() => this.setState({ hasError: false, error: undefined })}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
```

- [ ] **Step 5: Create Led component**

```typescript
"use client";

interface LedProps {
  status: "on" | "off" | "error" | "warn" | "pulse";
}

export function Led({ status }: LedProps) {
  const cls = status === "pulse" ? "led led-on led-pulse"
    : status === "on" ? "led led-on"
    : status === "error" ? "led led-error"
    : status === "warn" ? "led led-warn"
    : "led led-off";
  return <span className={cls} />;
}
```

- [ ] **Step 6: Commit**

```bash
git add components/ui/
git commit -m "feat: add shared UI components (Modal, Spinner, EmptyState, WidgetErrorBoundary, Led)"
```

---

### Task 11: Wire Error Boundaries into Page

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Import WidgetErrorBoundary and wrap each widget**

Update `app/page.tsx` to import `WidgetErrorBoundary` from `@/components/ui/WidgetErrorBoundary` and wrap each widget. Also move inline grid styles to a CSS class.

Add to `app/globals.css`:
```css
.dashboard-grid {
  display: grid;
  grid-template-rows: 44px 1fr 1.4fr;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 10px; /* intentional: matches original, between --sp-2 (8px) and --sp-3 (12px) */
  height: calc(100vh - 44px);
}
```

Update `app/page.tsx`:
```typescript
"use client";
import { ChatProvider } from "@/lib/chat-store";
import { SharedDataProvider } from "@/lib/shared-data";
import { WidgetErrorBoundary } from "@/components/ui/WidgetErrorBoundary";
import InboxWidget from "@/components/home/InboxWidget";
import CalendarWidget from "@/components/home/CalendarWidget";
import TasksWidget from "@/components/home/TasksWidget";
import CrewWidget from "@/components/home/CrewWidget";
import ChatWidget from "@/components/home/ChatWidget";
import StatusBar from "@/components/home/StatusBar";

export default function Home() {
  return (
    <SharedDataProvider>
    <ChatProvider>
      <div className="dashboard-grid">
        <div style={{ gridColumn: "span 3", height: "100%" }}>
          <WidgetErrorBoundary name="Status Bar">
            <StatusBar />
          </WidgetErrorBoundary>
        </div>
        <WidgetErrorBoundary name="Inbox">
          <InboxWidget />
        </WidgetErrorBoundary>
        <WidgetErrorBoundary name="Calendar">
          <CalendarWidget />
        </WidgetErrorBoundary>
        <WidgetErrorBoundary name="Tasks">
          <TasksWidget />
        </WidgetErrorBoundary>
        <div style={{ gridColumn: "span 2", height: "100%", minHeight: 0, overflow: "hidden" }}>
          <WidgetErrorBoundary name="Chat">
            <ChatWidget />
          </WidgetErrorBoundary>
        </div>
        <WidgetErrorBoundary name="Crew">
          <CrewWidget />
        </WidgetErrorBoundary>
      </div>
    </ChatProvider>
    </SharedDataProvider>
  );
}
```

- [ ] **Step 2: Verify the dashboard loads**

Run: `cd ~/Projects/ground-control && npm run dev` and open http://localhost:3000. All widgets should render as before.

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx app/globals.css
git commit -m "feat: add error boundaries to all widgets, move grid to CSS class"
```

---

**Phase 1 Smoke Test:** Load the dashboard. All widgets should render and function identically to before. The new files (types/, hooks/, lib/colors.ts, lib/api-helpers.ts, components/ui/) exist but are not yet consumed by existing code.

---

## Phase 2: Component Decomposition

Each widget gets its own directory. The old monolithic file is replaced by a directory with focused subcomponents. These tasks are independent per widget and can run in parallel.

**Important:** For each widget decomposition task, the approach is:
1. Create the new directory and subcomponents
2. Create the barrel export (`index.tsx`) that exports the panel as default
3. Update `app/page.tsx` import path if needed
4. Delete the old monolithic file
5. Smoke test

---

### Task 12: Decompose StatusBar

**Files:**
- Create: `components/home/status/StatusBar.tsx`
- Create: `components/home/status/HealthDropdown.tsx`
- Create: `components/home/status/ChangelogModal.tsx`
- Create: `components/home/status/BugReportModal.tsx`
- Create: `components/home/status/index.tsx`
- Delete: `components/home/StatusBar.tsx`

- [ ] **Step 1: Read the existing StatusBar.tsx completely**

Read `components/home/StatusBar.tsx` (557 lines). Identify the 4 logical sections:
- Main status bar (~150 lines): clock, version, health dot, buttons
- Health dropdown (~120 lines): service status grid with retry/restart
- Changelog modal (~150 lines): parseChangelog, version list, type badges
- Bug report modal (~60 lines): textarea, submit handler

- [ ] **Step 2: Create the status directory and extract ChangelogModal**

Extract the `parseChangelog` function (and its helper types CLItem, CLSection, CLVersion, TYPE_MAP, TYPE_DOT, INTERNAL_SECTIONS) and the changelog modal JSX into `ChangelogModal.tsx`. It receives props: `open`, `onClose`, `changelog` data.

- [ ] **Step 3: Extract HealthDropdown**

Extract the health dropdown JSX (ServiceDot sub-component, status grid, retry/restart buttons) into `HealthDropdown.tsx`. It receives props: `open`, `onClose`, `anchorRef` (for positioning).

- [ ] **Step 4: Extract BugReportModal**

Extract the bug report modal JSX into `BugReportModal.tsx`. Uses the shared `Modal` component from `components/ui/Modal.tsx`. Receives props: `open`, `onClose`.

- [ ] **Step 5: Write the slim StatusBar.tsx**

The main StatusBar orchestrates: fetches status, version, manages modal visibility state. Uses `useFetchAPI` for status polling, `useInterval` for the clock, `useClickOutside` for the health dropdown.

- [ ] **Step 6: Create barrel export**

```typescript
// components/home/status/index.tsx
export { default } from "./StatusBar";
```

Wait, StatusBar is a named export. Check the current export style and match it.

- [ ] **Step 7: Update import in app/page.tsx**

Change: `import StatusBar from "@/components/home/StatusBar"`
To: `import StatusBar from "@/components/home/status"`

- [ ] **Step 8: Delete the old file**

```bash
rm components/home/StatusBar.tsx
```

- [ ] **Step 9: Smoke test**

Run dev server, verify status bar renders: clock, version number, health indicators, changelog opens, bug report opens.

- [ ] **Step 10: Commit**

```bash
git add components/home/status/ app/page.tsx
git rm components/home/StatusBar.tsx
git commit -m "refactor: decompose StatusBar into focused subcomponents"
```

---

### Task 13: Decompose InboxWidget

**Files:**
- Create: `components/home/inbox/InboxPanel.tsx`
- Create: `components/home/inbox/EmailItem.tsx`
- Create: `components/home/inbox/SummaryPanel.tsx`
- Create: `components/home/inbox/ReplyPanel.tsx`
- Create: `components/home/inbox/TaskPanel.tsx`
- Create: `components/home/inbox/index.tsx`
- Delete: `components/home/InboxWidget.tsx`

- [ ] **Step 1: Read InboxWidget.tsx completely**

Read `components/home/InboxWidget.tsx` (653 lines). Note the sections:
- Email type + helpers (lines 10-94)
- Main component with useState hooks (lines 97+)
- Email list rendering with action bars
- Summary panel (expandable section)
- Reply panel (textarea + send)
- Task panel (character selector + prompt)

- [ ] **Step 2: Create EmailItem component**

Extract the per-email row rendering into `EmailItem.tsx`. It receives an `Email` object and action callbacks as props. Uses `React.memo` for performance. Renders: sender, subject, time, labels, unread indicator, action bar on hover.

- [ ] **Step 3: Create SummaryPanel, ReplyPanel, TaskPanel**

Each is a small component (~80 lines) that receives the relevant state and callbacks as props. SummaryPanel shows AI summary text. ReplyPanel has a textarea. TaskPanel has character selector and prompt override.

- [ ] **Step 4: Write InboxPanel**

The main panel fetches emails via `useFetchAPI`, manages action state via `useBusy`, stores summary/reply/task state. Replaces `buildEmailColor` with `buildColorMatcher` from `lib/colors.ts`. Maps emails to `<EmailItem>` components.

- [ ] **Step 5: Create barrel export, update page import, delete old file**

- [ ] **Step 6: Smoke test**

Verify: email list loads, action buttons work (archive, summarize, reply, task), unread counts show.

- [ ] **Step 7: Commit**

```bash
git add components/home/inbox/ app/page.tsx
git rm components/home/InboxWidget.tsx
git commit -m "refactor: decompose InboxWidget into focused subcomponents"
```

---

### Task 14: Decompose CalendarWidget

**Files:**
- Create: `components/home/calendar/CalendarPanel.tsx`
- Create: `components/home/calendar/ListView.tsx`
- Create: `components/home/calendar/WeekView.tsx`
- Create: `components/home/calendar/MonthView.tsx`
- Create: `components/home/calendar/helpers.ts`
- Create: `components/home/calendar/index.tsx`
- Delete: `components/home/CalendarWidget.tsx`

- [ ] **Step 1: Read CalendarWidget.tsx completely**

Read `components/home/CalendarWidget.tsx` (1007 lines). Identify:
- Helper functions: timeOfDayIcon, buildEventColor, formatTime, formatDate, isPast, isCurrent, sameDay, layoutDayEvents
- Three views: list, week, month (each is a distinct rendering section)
- Constants: HOUR_HEIGHT, DAY_LABELS, MONTH_NAMES

- [ ] **Step 2: Create helpers.ts**

Move pure functions to `calendar/helpers.ts`: timeOfDayIcon, formatTime, formatDate, isPast, isCurrent, sameDay, layoutDayEvents, and constants HOUR_HEIGHT, DAY_LABELS, MONTH_NAMES.

- [ ] **Step 3: Create ListView, WeekView, MonthView**

Each receives `events: CalEvent[]`, `eventColor` function, and action handlers as props. WeekView gets `weekOffset` and navigation callbacks. MonthView gets `monthOffset` and navigation callbacks.

- [ ] **Step 4: Write CalendarPanel**

Fetches events, manages view state (list/week/month) via `useLocalStorage`, builds color matcher. Renders the active view component.

- [ ] **Step 5: Wire up, smoke test, commit**

```bash
git add components/home/calendar/ app/page.tsx
git rm components/home/CalendarWidget.tsx
git commit -m "refactor: decompose CalendarWidget into ListView, WeekView, MonthView"
```

---

### Task 15: Decompose TasksWidget

**Files:**
- Create: `components/home/tasks/TasksPanel.tsx`
- Create: `components/home/tasks/TaskList.tsx`
- Create: `components/home/tasks/ProjectsTimeline.tsx`
- Create: `components/home/tasks/ClassesTab.tsx`
- Create: `components/home/tasks/index.tsx`
- Delete: `components/home/TasksWidget.tsx`
- Delete: `components/home/ClassesWidget.tsx`

- [ ] **Step 1: Read TasksWidget.tsx and ClassesWidget.tsx completely**

TasksWidget (1291 lines): tasks tab, projects tab (ProjectsTabContent), classes tab (imports ClassesWidget).
ClassesWidget (533 lines): class prep checklist with toggle functionality.

- [ ] **Step 2: Create TaskList component**

Extract the tasks tab rendering: filter bar, grouped task list by track, priority indicators, action buttons. Uses `buildColorMatcher` for track colors.

- [ ] **Step 3: Create ProjectsTimeline component**

Extract `ProjectsTabContent` (lines 99-250+) into standalone component. Receives projects data and track color function as props. Contains the Gantt-like timeline with month navigation.

- [ ] **Step 4: Create ClassesTab component**

Adapt ClassesWidget into `ClassesTab.tsx`. Simplify with `useFetchAPI` and `useBusy` hooks.

- [ ] **Step 5: Write TasksPanel**

Tab container that fetches tasks and projects, manages tab state via `useLocalStorage`. Renders TaskList, ProjectsTimeline, or ClassesTab based on active tab.

- [ ] **Step 6: Wire up, smoke test, commit**

```bash
git add components/home/tasks/ app/page.tsx
git rm components/home/TasksWidget.tsx components/home/ClassesWidget.tsx
git commit -m "refactor: decompose TasksWidget into TaskList, ProjectsTimeline, ClassesTab"
```

---

### Task 16: Decompose CrewWidget

The second-largest component. Also absorbs pipeline components.

**Files:**
- Create: `components/home/crew/CrewPanel.tsx`
- Create: `components/home/crew/CharacterGrid.tsx`
- Create: `components/home/crew/SchedulesTab.tsx`
- Create: `components/home/crew/ProcessesTab.tsx`
- Create: `components/home/crew/LogsTab.tsx`
- Create: `components/home/crew/ProposalsTab.tsx`
- Create: `components/home/crew/CharDetailDrawer.tsx`
- Create: `components/home/crew/JobResultModal.tsx`
- Create: `components/home/crew/FileEditorModal.tsx`
- Create: `components/home/crew/index.tsx`
- Delete: `components/home/CrewWidget.tsx`
- Delete: `components/home/CharDetailDrawer.tsx`
- Delete: `components/pipeline/LogsWidget.tsx`
- Delete: `components/pipeline/ProposalsWidget.tsx`
- Delete: `components/pipeline/JobResultModal.tsx`
- Delete: `components/pipeline/FileEditorModal.tsx`
- Delete: `components/pipeline/` directory (if empty after)

- [ ] **Step 1: Read all source files completely**

Read CrewWidget.tsx (1415 lines), CharDetailDrawer.tsx (450 lines), and all pipeline components.

- [ ] **Step 2: Migrate pipeline components first**

Move `pipeline/JobResultModal.tsx` and `pipeline/FileEditorModal.tsx` to `crew/` with minimal changes. Refactor to use shared `Modal` component.

- [ ] **Step 3: Create LogsTab**

Absorb `pipeline/LogsWidget.tsx` (223 lines) content. Uses `subscribeLog` from `lib/action-log.ts`.

- [ ] **Step 4: Create ProposalsTab**

Absorb `pipeline/ProposalsWidget.tsx` (458 lines). This exceeds the 300-line limit, so split: list rendering vs proposal detail. The detail section can be a collapsible section within ProposalsTab.

- [ ] **Step 5: Create CharacterGrid**

Extract character card rendering from CrewWidget crew tab section. Cards with action tiles, context toggles, prompt modal.

- [ ] **Step 6: Create SchedulesTab**

Extract schedules tab: job list with last-run times, override editor, run-now buttons, catch-up controls.

- [ ] **Step 7: Create ProcessesTab**

Extract processes tab: process list with polling via `useInterval`, stop buttons via `useBusy`.

- [ ] **Step 8: Move CharDetailDrawer**

Move from `components/home/CharDetailDrawer.tsx` to `crew/CharDetailDrawer.tsx`. Refactor to use shared `Modal` component.

- [ ] **Step 9: Write CrewPanel**

Tab container with cycle/dispatch controls. Manages active tab, character data from `useSharedData`, delegates to tab components.

- [ ] **Step 10: Wire up, delete old files, smoke test, commit**

```bash
git add components/home/crew/ app/page.tsx
git rm components/home/CrewWidget.tsx components/home/CharDetailDrawer.tsx
git rm -r components/pipeline/
git commit -m "refactor: decompose CrewWidget, absorb pipeline components into crew/"
```

---

### Task 17: Decompose ChatWidget

The largest and most complex component. Handle carefully.

**Files:**
- Create: `components/home/chat/ChatPanel.tsx`
- Create: `components/home/chat/ChatMessage.tsx`
- Create: `components/home/chat/ChatMarkdown.tsx`
- Create: `components/home/chat/ChatForm.tsx`
- Create: `components/home/chat/ChatToolOutput.tsx`
- Create: `components/home/chat/helpers.ts`
- Create: `components/home/chat/index.tsx`
- Delete: `components/home/ChatWidget.tsx`

- [ ] **Step 1: Read ChatWidget.tsx completely**

Read all 2007 lines. Key sections:
- Helper functions (lines 44-173): toolInputLabel, openTanaNode, openGmail, processLinks, splitMessage, expandEmoji
- FormBlock component (lines 175-267)
- ChatMarkdown component (lines 269-486)
- ThinkingAvatar/ThinkingBubble (lines 488-520)
- Utility functions (lines 530-540): estimateTokens, getContextLimit, genTabId
- ChatPanel component (lines 558-1440): message state, sendMessage, streaming, rendering
- ChatWidget (tab manager) component (lines 1443-2007): tab state, fullscreen, character routing

- [ ] **Step 2: Create helpers.ts**

Extract pure functions: `toolInputLabel`, `openTanaNode`, `openGmail`, `processLinks`, `splitMessage`, `expandEmoji`, `renderEmoji`, `estimateTokens`, `getContextLimit`, `genTabId`.

- [ ] **Step 3: Create ChatMarkdown component**

Extract lines 269-486 (ChatMarkdown) and lines 175-267 (FormBlock). FormBlock becomes a private sub-component within ChatMarkdown.tsx. The component receives `text`, `accent`, `onQuickReply` props. Wrap expensive rendering in `useMemo`.

- [ ] **Step 4: Create ChatToolOutput component**

Extract tool invocation rendering (tool name badge, input label, result). Small component (~80 lines).

- [ ] **Step 5: Create ChatMessage component**

Single message row: avatar, bubble, copy/flag/expand/delete actions. Delegates content to `ChatMarkdown` and `ChatToolOutput`. Wrap in `React.memo`.

- [ ] **Step 6: Create ChatForm component**

Extract the input area: textarea with auto-grow, model selector dropdown, skill picker, image paste handler, send button. Receives `onSend`, `input`, `setInput`, `isLoading`, `modelOverride`, `setModelOverride` as props.

- [ ] **Step 7: Write ChatPanel (the inner conversation panel)**

This is the core: owns messages state, sendMessage handler, streaming logic, compression, tool log. Passes data down to ChatMessage (mapped), ChatForm, and action handlers.

**State that stays in ChatPanel:** messages, input, pastedImages, isLoading, streamingText, activeTool, activeToolInput, toolLog, elapsed, pendingContext, compressing, messageQueue, inputHeight, skillPicker, skillList, skillFilter, modelOverride.

- [ ] **Step 8: Write the outer tab manager**

The outer component (currently ChatWidget, lines 1443-2007) manages tabs, fullscreen state, character routing, localStorage persistence. Renders ChatPanel for the active tab. Keep this as the default export in `index.tsx`.

- [ ] **Step 9: Wire up, delete old file, smoke test**

Test: send a message, verify streaming works, switch tabs, verify tool output renders, test markdown rendering (tables, forms, quick-reply), test image paste.

- [ ] **Step 10: Commit**

```bash
git add components/home/chat/ app/page.tsx
git rm components/home/ChatWidget.tsx
git commit -m "refactor: decompose ChatWidget into ChatPanel, ChatMessage, ChatMarkdown, ChatForm"
```

---

### Task 18: Migrate Context Providers to Shared Types

**Files:**
- Modify: `lib/shared-data.tsx`
- Modify: `lib/chat-store.tsx`
- Modify: `lib/action-log.ts`

- [ ] **Step 1: Update shared-data.tsx**

Replace inline type definitions (lines 6-41) with imports from `@/types`:
```typescript
import type { CharacterInfo, SystemConfig } from "@/types";
```
Keep the `SharedDataValue` interface local (it's provider-specific).

- [ ] **Step 2: Update chat-store.tsx**

Replace inline type definitions (lines 4-16) with imports from `@/types`:
```typescript
import type { ChatTrigger, ChatContextValue } from "@/types";
```

- [ ] **Step 3: Update action-log.ts**

Replace inline `ActionLogEntry` type (lines 1-9) with import:
```typescript
import type { ActionLogEntry } from "@/types";
```

- [ ] **Step 4: Verify build**

Run: `cd ~/Projects/ground-control && npm run build 2>&1 | tail -20`

- [ ] **Step 5: Commit**

```bash
git add lib/shared-data.tsx lib/chat-store.tsx lib/action-log.ts
git commit -m "refactor: migrate context providers to shared types"
```

---

**Phase 2 Smoke Test:** Load dashboard. Every widget renders. Chat streaming works. Crew actions work. Calendar views switch. Task actions work. Inbox actions work. Status bar health/changelog/bug report work.

---

## Phase 3: Lib Layer Cleanup

---

### Task 19: Split tana.ts

**Files:**
- Create: `lib/tana/client.ts`
- Create: `lib/tana/queries.ts`
- Create: `lib/tana/mutations.ts`
- Create: `lib/tana/routing.ts`
- Create: `lib/tana/cache.ts`
- Create: `lib/tana/index.ts`
- Delete: `lib/tana.ts`

- [ ] **Step 1: Read lib/tana.ts completely**

Read all 1242 lines. Map the sections:
- Imports + config (lines 1-15)
- Cache/exclusion (lines 16-47)
- mcpCall (lines 61-85)
- Type definitions (lines 87-128)
- Field parsers (lines 130-191)
- getTanaTasks (lines 194-248)
- Phase/workstream parsers + getTanaPhases (lines 252-342)
- getTanaProjects (lines 350-560)
- Create functions (lines 561-712)
- Routing (lines 722-817)
- Read/open helpers (lines 820-823)
- Class prep (lines 938-1201)

- [ ] **Step 2: Create client.ts**

Extract: imports, config constants, `mcpCall` function (lines 61-85). This is the MCP connection layer.

- [ ] **Step 3: Create cache.ts**

Extract: `ExclusionEntry`, `ExclusionMap`, `excludeTask`, `getExcludedIds` (lines 16-47), and the exclusion file path constant.

- [ ] **Step 4: Create queries.ts**

Extract: `parseFields`, `parseWorkstreamFields`, `getTanaTasks`, `getTanaPhases`, `getTanaProjects`, `getClassNodes`, `toggleClassItem`, `checkRemainingPrepItems`, `readTanaNode`, `sendToTanaToday`, and all associated helper functions and type definitions.

Import `mcpCall` from `./client`, `getExcludedIds` from `./cache`, types from `@/types/server`.

- [ ] **Step 5: Create mutations.ts**

Extract: `createWorkstream`, `createTaskInWorkstream`, `createPost`, `createTask`, `setTaskPriority`, `setTaskInProgress`, `markTaskDone`, `openNode`, `trashTask`, `archiveTask`.

Import `mcpCall` from `./client`.

- [ ] **Step 6: Create routing.ts**

Extract: `buildTrackPatterns`, `buildKeywordPatterns`, `getRoutingOverrides`, `characterForTrack`, `resolveCharacter`, `clearRoutingCache`.

Import `getCharacters` from `../characters`. Add header comment documenting the dependency.

- [ ] **Step 7: Create barrel index.ts**

Re-export all public functions from all submodules. External code still imports from `@/lib/tana`.

- [ ] **Step 8: Update all imports across the codebase**

Search for `from.*lib/tana` and verify they still resolve through the barrel export. Should work automatically.

- [ ] **Step 9: Verify build, smoke test**

Run: `cd ~/Projects/ground-control && npm run build 2>&1 | tail -30`

- [ ] **Step 10: Commit**

```bash
git add lib/tana/
git rm lib/tana.ts
git commit -m "refactor: split tana.ts into client, queries, mutations, routing, cache modules"
```

---

### Task 20: Extract Auto-Review Logic

**Files:**
- Create: `lib/auto-review.ts`
- Modify: `app/api/chat/route.ts`

- [ ] **Step 1: Read app/api/chat/route.ts completely**

Identify: SCHOLAR_SKILL_MAP (lines 12-22), detectScholarIntent (lines 24-29), runAutoReview/runRevisionPass/runRevisionLoop (lines 31-121), wrapWithAutoReview (lines 123-200+).

- [ ] **Step 2: Create lib/auto-review.ts**

Move all auto-review functions to this file. Make `wrapWithAutoReview` accept a config parameter instead of being Scholar-specific:

```typescript
interface AutoReviewConfig {
  skillPatterns: Record<string, string>; // regex -> skill name
}

export function wrapWithAutoReview(
  source: ReadableStream,
  characterId: string,
  config: AutoReviewConfig,
  revisionBasePrompt: string,
  model: string
): ReadableStream
```

- [ ] **Step 3: Update Scholar character JSON**

Add `autoReviewConfig` to `~/.claude/characters/core/scholar.json`:
```json
"autoReviewConfig": {
  "skillPatterns": {
    "thesis|tez": "scholar-thesis",
    "critique|review|analiz": "scholar-critique",
    "call|opportunity|residency": "scholar-call-analysis"
  }
}
```

- [ ] **Step 4: Update chat route to import from lib/auto-review**

Remove the extracted functions. Import `wrapWithAutoReview` and `AutoReviewConfig`. Use `character.autoReviewConfig` from the character config (if present). Remove the `characterId !== 'scholar'` check.

- [ ] **Step 5: Verify chat still works**

Test: send a message to Scholar, verify streaming works. The auto-review behavior should be unchanged.

- [ ] **Step 6: Commit**

```bash
git add lib/auto-review.ts app/api/chat/route.ts
git commit -m "refactor: extract auto-review logic from chat route to lib/auto-review.ts"
```

---

### Task 21: Eliminate Hardcoded Character Names

**Files:**
- Modify: `lib/prompt.ts` (line 87-97, architect hardcode)
- Modify: `lib/gmail-pipeline.ts` (CHARACTER_SUBJECT_PATTERNS, CHARACTER_LABEL_MAP)
- Modify: `lib/char-icons.ts` (charColor map)

- [ ] **Step 1: Fix prompt.ts architect hardcode**

Replace `if (characterId === 'architect')` (line 87) with `if (char.injectChangelog)`. Load the `injectChangelog` field from character config.

Add `"injectChangelog": true` to `~/.claude/characters/meta/architect.json`.

- [ ] **Step 2: Make CHARACTER_LABEL_MAP dynamic in gmail-pipeline.ts**

Replace the hardcoded map (lines 469-474) with dynamic generation:
```typescript
function getCharacterLabelMap(): Record<string, string> {
  const chars = getCharacterList();
  const map: Record<string, string> = {};
  for (const c of chars) map[c.id] = `${c.id}-routed`;
  return map;
}
```

- [ ] **Step 3: Remove memoryFile cast in system/files/route.ts**

In `app/api/system/files/route.ts` line 33, replace:
```typescript
const memoryFile = (char as Record<string, unknown>).memoryFile as string || `${charName}.memory.md`;
```
with:
```typescript
const memoryFile = char.memoryFile || `${charName}.memory.md`;
```

This works because `memoryFile` is now in the `Character` type (added in Task 2).

- [ ] **Step 4: Make charColor dynamic in char-icons.ts**

Instead of a hardcoded map (lines 12-32), derive from character configs at import time. Since char-icons.ts is client-side and can't read files, keep the static map but add a comment noting it must match character JSON configs. (Full dynamic derivation requires an API call, which is over-engineering for a color map that changes rarely.)

- [ ] **Step 5: Verify build and smoke test**

- [ ] **Step 6: Commit**

```bash
git add lib/prompt.ts lib/gmail-pipeline.ts lib/char-icons.ts app/api/system/files/route.ts
git commit -m "refactor: eliminate hardcoded character names, fix memoryFile type cast"
```

---

## Phase 4: API Standardization

---

### Task 22: Migrate API Routes to Shared Helpers

**Files:**
- Modify: All route files under `app/api/`

This task covers all 42 API routes. Process them in batches.

- [ ] **Step 1: Migrate schedule routes (5 files)**

For each route in `app/api/schedule/`:
- Import `apiOk`, `apiError`, `requireFields` from `@/lib/api-helpers`
- Import `captureError` from `@/lib/errors`
- Replace `NextResponse.json({ ok: true, ... })` with `apiOk(...)`
- Replace `NextResponse.json({ error: ... }, { status: N })` with `apiError(N, ...)`
- Wrap handler body in try/catch with `captureError`
- Replace inline field checks with `requireFields`

- [ ] **Step 2: Migrate tana-tasks routes (3 files)**

Same pattern for `app/api/tana-tasks/` and `app/api/tana-tasks/action/`.

- [ ] **Step 3: Migrate inbox routes (2 files)**

Same pattern for `app/api/inbox/` and `app/api/inbox/action/`.

- [ ] **Step 4: Migrate system routes (6+ files)**

Same pattern for `app/api/system/config`, `system/character`, `system/memory`, `system/skill`, `system/knowledge`, `system/files`, `system/proposals`, `system/plans`, `system/skills`.

- [ ] **Step 5: Migrate remaining routes**

Same pattern for: calendar, chat, spawn, characters, processes, webhooks/gmail, research, class-prep, log, status, restart, changelog, stats, flag-conversation, and any others.

- [ ] **Step 6: Replace SSE response construction with apiStream**

In routes that return SSE streams (chat, tana-tasks/action start, spawn), replace the manual `new Response(stream, { headers: { ... } })` with `apiStream(stream)`.

- [ ] **Step 7: Verify build**

Run: `cd ~/Projects/ground-control && npm run build 2>&1 | tail -30`

- [ ] **Step 8: Smoke test key flows**

Test: create a task, mark task done, send chat message, run a scheduled job, archive an email.

- [ ] **Step 9: Commit**

```bash
git add app/api/ lib/api-helpers.ts lib/errors.ts
git commit -m "refactor: standardize all API routes with shared helpers"
```

---

## Phase 5: Design System Polish

---

### Task 23: Migrate globals.css to Design Tokens

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Migrate widget system classes**

Replace raw px values in widget classes with token variables:
- `.widget` shadow: `var(--shadow-md)`, border-radius: `var(--radius-lg)`
- `.widget-header` padding: `var(--sp-3) var(--sp-4)`, gap: `var(--sp-2)`
- `.widget-body` padding: `var(--sp-3) var(--sp-4)`
- `.widget-footer` padding: `var(--sp-2) var(--sp-4)`, gap: `6px` (keep, specific spacing)
- `.widget-toolbar-btn` border-radius: `var(--radius-sm)`, transition: `var(--ease-normal)`

- [ ] **Step 2: Migrate button classes**

- `.calc-btn` font-size: `var(--fs-sm)`, border-radius: `var(--radius-md)`, padding: `5px var(--sp-3)`, transition: `var(--ease-fast)`
- `.calc-btn-sm` font-size: `var(--fs-xs)`, padding: `3px var(--sp-2)`
- `.item-action-btn` border-radius: `var(--radius-sm)`, transition: `color var(--ease-fast), background var(--ease-fast)`

- [ ] **Step 3: Migrate character and chat classes**

- `.char-badge` border-radius: `var(--radius-md)`, font-size: `var(--fs-base)`, transition: `transform var(--ease-fast), box-shadow var(--ease-slow)`
- `.char-card` border-radius: `var(--radius-lg)`, shadow on hover: `var(--shadow-lg)`
- `.chat-bubble` font-size: `var(--fs-base)`, padding: `7px var(--sp-3)`
- `.chat-bubble-assistant` font-size: `var(--fs-sm)`

- [ ] **Step 4: Normalize off-scale font sizes**

Search all component files for `font-size: 8px` -> change to `var(--fs-xs)` (10px).
Search for `font-size: 12.5px` -> change to `var(--fs-base)` (13px).

- [ ] **Step 5: Visual diff check**

Load dashboard, compare against current look. Changes should be imperceptible (token values match existing values within 1-2px).

- [ ] **Step 6: Commit**

```bash
git add app/globals.css
git commit -m "refactor: migrate globals.css to design token variables"
```

---

### Task 24: Eliminate Inline Styles in Components

**Files:**
- Modify: All decomposed component files that use inline `style={}`

- [ ] **Step 1: Audit inline styles across all new component files**

Search for `style={{` in all files under `components/home/`. For each occurrence, decide:
- Structural layout (padding, display, flex) -> move to CSS class
- Dynamic value (character color) -> use CSS variable: `style={{ "--char-color": color } as React.CSSProperties}`
- One-off override -> keep inline but use token variable

- [ ] **Step 2: Add necessary CSS classes to globals.css**

Add utility classes for common patterns found in the audit.

- [ ] **Step 3: Replace inline styles in components**

Go file by file, replacing structural inline styles with CSS classes.

- [ ] **Step 4: Smoke test**

- [ ] **Step 5: Commit**

```bash
git add app/globals.css components/
git commit -m "refactor: replace inline styles with CSS classes and design tokens"
```

---

## Phase 6: Test Coverage

---

### Task 25: Test Infrastructure Setup

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `tests/setup.ts`

- [ ] **Step 1: Install test dependencies**

```bash
cd ~/Projects/ground-control && npm install -D vitest @testing-library/react@16 @testing-library/jest-dom @testing-library/user-event jsdom
```

- [ ] **Step 2: Create vitest config**

```typescript
// vitest.config.ts
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

- [ ] **Step 3: Create test setup**

```typescript
// tests/setup.ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 4: Add test scripts to package.json**

Add to scripts: `"test": "vitest run"`, `"test:watch": "vitest"`

- [ ] **Step 5: Verify vitest runs**

```bash
cd ~/Projects/ground-control && npx vitest run 2>&1
```

Expected: "No test files found" (clean run, no errors)

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts tests/setup.ts package.json package-lock.json
git commit -m "feat: add Vitest test infrastructure"
```

---

### Task 26: Lib Unit Tests

**Files:**
- Create: `tests/lib/colors.test.ts`
- Create: `tests/lib/api-helpers.test.ts`
- Create: `tests/lib/date-format.test.ts`

- [ ] **Step 1: Write color matcher tests**

```typescript
// tests/lib/colors.test.ts
import { describe, it, expect } from "vitest";
import { buildColorMatcher } from "@/lib/colors";

describe("buildColorMatcher", () => {
  it("returns matching color for pattern", () => {
    const match = buildColorMatcher({ "#ff0000": "urgent|critical", "#00ff00": "low" });
    expect(match("This is urgent")).toBe("#ff0000");
    expect(match("low priority")).toBe("#00ff00");
  });

  it("returns null for no match", () => {
    const match = buildColorMatcher({ "#ff0000": "urgent" });
    expect(match("normal task")).toBeNull();
  });

  it("is case insensitive", () => {
    const match = buildColorMatcher({ "#ff0000": "URGENT" });
    expect(match("urgent task")).toBe("#ff0000");
  });

  it("returns first match when multiple patterns apply", () => {
    const match = buildColorMatcher({ "#ff0000": "task", "#00ff00": "task" });
    expect(match("task")).toBe("#ff0000");
  });

  it("handles empty patterns", () => {
    const match = buildColorMatcher({});
    expect(match("anything")).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd ~/Projects/ground-control && npx vitest run tests/lib/colors.test.ts
```

Expected: All pass

- [ ] **Step 3: Write API helpers tests**

```typescript
// tests/lib/api-helpers.test.ts
import { describe, it, expect } from "vitest";
import { requireFields, validateName } from "@/lib/api-helpers";

describe("requireFields", () => {
  it("returns null when all fields present", () => {
    expect(requireFields({ a: "hello", b: 42 }, ["a", "b"])).toBeNull();
  });

  it("returns error for missing field", () => {
    expect(requireFields({ a: "hello" } as any, ["a", "b"])).toBe("b is required");
  });

  it("returns error for empty string field", () => {
    expect(requireFields({ a: "  " }, ["a"])).toBe("a is required");
  });

  it("returns error for null field", () => {
    expect(requireFields({ a: null }, ["a"])).toBe("a is required");
  });
});

describe("validateName", () => {
  it("accepts valid names", () => {
    expect(validateName("postman")).toBeNull();
    expect(validateName("scholar-write")).toBeNull();
    expect(validateName("task-123")).toBeNull();
  });

  it("rejects invalid names", () => {
    expect(validateName("")).toBe("Invalid name");
    expect(validateName("has spaces")).toBe("Invalid name");
    expect(validateName("../traversal")).toBe("Invalid name");
    expect(validateName("UPPERCASE")).toBe("Invalid name");
  });
});
```

- [ ] **Step 4: Write date-format tests**

Test `formatDisplayDate`, `formatWhen`, `getDateUrgency` from `lib/date-format.ts`. Use fixed dates to avoid timezone flakiness.

- [ ] **Step 5: Run all tests**

```bash
cd ~/Projects/ground-control && npx vitest run
```

Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add tests/lib/
git commit -m "test: add unit tests for colors, api-helpers, date-format"
```

---

### Task 27: Hook Tests

**Files:**
- Create: `tests/hooks/use-local-storage.test.ts`

- [ ] **Step 1: Write useLocalStorage tests**

```typescript
// tests/hooks/use-local-storage.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useLocalStorage } from "@/hooks/use-local-storage";

describe("useLocalStorage", () => {
  beforeEach(() => localStorage.clear());

  it("returns initial value when nothing stored", () => {
    const { result } = renderHook(() => useLocalStorage("key", "default"));
    expect(result.current[0]).toBe("default");
  });

  it("persists value to localStorage", () => {
    const { result } = renderHook(() => useLocalStorage("key", "default"));
    act(() => result.current[1]("updated"));
    expect(result.current[0]).toBe("updated");
    expect(JSON.parse(localStorage.getItem("key")!)).toBe("updated");
  });

  it("reads existing value from localStorage", () => {
    localStorage.setItem("key", JSON.stringify("existing"));
    const { result } = renderHook(() => useLocalStorage("key", "default"));
    expect(result.current[0]).toBe("existing");
  });

  it("handles objects", () => {
    const { result } = renderHook(() => useLocalStorage("key", { a: 1 }));
    act(() => result.current[1]({ a: 2 }));
    expect(result.current[0]).toEqual({ a: 2 });
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd ~/Projects/ground-control && npx vitest run tests/hooks/
```

- [ ] **Step 3: Commit**

```bash
git add tests/hooks/
git commit -m "test: add useLocalStorage hook tests"
```

---

### Task 28: Component Tests

**Files:**
- Create: `tests/components/Modal.test.tsx`

- [ ] **Step 1: Write Modal tests**

```typescript
// tests/components/Modal.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Modal } from "@/components/ui/Modal";

describe("Modal", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <Modal open={false} onClose={() => {}}>Content</Modal>
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders children when open", () => {
    render(
      <Modal open={true} onClose={() => {}}>
        <p>Modal content</p>
      </Modal>
    );
    expect(screen.getByText("Modal content")).toBeInTheDocument();
  });

  it("renders title when provided", () => {
    render(
      <Modal open={true} onClose={() => {}} title="Test Title">
        Content
      </Modal>
    );
    expect(screen.getByText("Test Title")).toBeInTheDocument();
  });

  it("calls onClose when backdrop clicked", () => {
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose}>Content</Modal>
    );
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose on Escape key", () => {
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose}>Content</Modal>
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("does not call onClose when content clicked", () => {
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose}>
        <button>Click me</button>
      </Modal>
    );
    fireEvent.click(screen.getByText("Click me"));
    expect(onClose).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run all tests**

```bash
cd ~/Projects/ground-control && npx vitest run
```

- [ ] **Step 3: Commit**

```bash
git add tests/components/
git commit -m "test: add Modal component tests"
```

---

## Phase 7: Documentation

---

### Task 29: Engineer Operations Guide

**Files:**
- Create: `docs/engineer-guide.md`

- [ ] **Step 1: Write the guide**

Cover these sections based on the refactored codebase:
- Directory map (what lives where)
- Adding a new widget (step-by-step)
- Adding a feature to an existing widget
- Adding a character (JSON config only, zero code)
- Adding an API route (pattern with apiOk/apiError/requireFields)
- Running tests (npm test, adding new tests)
- Common patterns (useFetchAPI, useLocalStorage, useBusy, buildColorMatcher, Modal)
- Design tokens reference (spacing, fonts, radius, shadows)

- [ ] **Step 2: Commit**

```bash
git add docs/engineer-guide.md
git commit -m "docs: add Engineer operations guide"
```

---

### Task 30: Architect Operations Guide

**Files:**
- Create: `docs/architect-guide.md`

- [ ] **Step 1: Write the guide**

Cover:
- System health checks
- Schema changes (Tana ID flow: tana-schema.ts -> lib/tana/ -> API -> types -> components)
- Character ecosystem (configs, skills, knowledge, memory connections)
- Supporting file consistency (single-source-of-truth chain)
- Refactoring procedures (splitting large files, extracting utilities)
- Release procedures (changelog, versioning, feature gate)

- [ ] **Step 2: Commit**

```bash
git add docs/architect-guide.md
git commit -m "docs: add Architect operations guide"
```

---

## Summary

| Phase | Tasks | Est. Commits | What Changes |
|-------|-------|-------------|--------------|
| 1. Foundation | 1-11 | 11 | New types, hooks, utilities, UI components, design tokens |
| 2. Components | 12-18 | 7 | 6 widgets decomposed, pipeline absorbed, providers updated |
| 3. Lib Cleanup | 19-21 | 3 | tana.ts split, auto-review extracted, hardcodes eliminated |
| 4. API | 22 | 1 | All 42 routes standardized |
| 5. Design | 23-24 | 2 | Token migration, inline style cleanup |
| 6. Tests | 25-28 | 4 | Vitest setup, lib tests, hook tests, component tests |
| 7. Docs | 29-30 | 2 | Engineer + Architect guides |
| **Total** | **30 tasks** | **~30 commits** | |

**Execution order:** Tasks 1-11 (Phase 1) first. Then Tasks 12-17 can run in parallel (one per widget). Tasks 18-30 are sequential.
