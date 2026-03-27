# Context Strip Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the top row of full-size Inbox/Calendar/Tasks widgets with a slim 36px Context Strip showing summary counts, with click-to-expand dropdown overlays for each widget. Chat and Crew take the full remaining viewport height.

**Architecture:** A new `ContextStrip` component fetches lightweight summary data from existing API endpoints and renders three clickable segments. Each segment toggles a dropdown overlay that renders the existing widget panel (InboxPanel, CalendarPanel, TasksPanel) unchanged. Widgets stay mounted but hidden via `display: none` to avoid re-fetch flicker. The CSS grid changes from 3-column to 2-column, and from 3-row to 3-row with the middle row shrunk to 36px.

**Tech Stack:** React, Next.js 16, CSS Grid, existing `useFetchAPI` hook, existing widget components, lucide-react icons.

**Spec:** `docs/superpowers/specs/2026-03-27-context-strip-layout-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `components/home/context-strip/ContextStrip.tsx` | Create | Context Strip component with summary data fetching, segment rendering, dropdown overlay logic |
| `components/home/context-strip/index.tsx` | Create | Barrel export |
| `app/page.tsx` | Modify | Remove top-row widget slots, add ContextStrip, update grid-column spans |
| `app/globals.css` | Modify | Update `.dashboard-grid` to 2-column layout with 36px context strip row |

---

### Task 1: Update CSS Grid Layout

**Files:**
- Modify: `app/globals.css:730-736`

- [ ] **Step 1: Update the `.dashboard-grid` rule**

Change the grid template from 3-column/3-row to 2-column/3-row:

```css
.dashboard-grid {
  display: grid;
  grid-template-rows: 44px 36px 1fr;
  grid-template-columns: 2fr 1fr;
  gap: 10px;
  height: calc(100vh - 44px);
}
```

- [ ] **Step 2: Add Context Strip and dropdown CSS below `.dashboard-grid`**

```css
.context-strip {
  display: flex;
  align-items: stretch;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: visible;
  box-shadow: var(--shadow-sm);
  position: relative;
}

.context-strip-segment {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 var(--sp-4);
  font-family: var(--font-display);
  font-size: var(--fs-sm);
  color: var(--text-2);
  cursor: pointer;
  transition: background var(--ease-fast), color var(--ease-fast);
  border-right: 1px solid var(--border);
  user-select: none;
}

.context-strip-segment:last-child {
  border-right: none;
}

.context-strip-segment:hover {
  background: var(--surface-2);
  color: var(--text);
}

.context-strip-segment.active {
  background: var(--surface-2);
  color: var(--text);
  box-shadow: inset 0 -2px 0 var(--text-3);
}

.context-strip-dropdown {
  position: absolute;
  top: 100%;
  left: -1px;
  right: -1px;
  max-height: 50vh;
  background: var(--surface);
  border: 1px solid var(--border);
  border-top: none;
  border-radius: 0 0 var(--radius-lg) var(--radius-lg);
  box-shadow: 0 4px 12px rgba(0,0,0,0.08);
  z-index: 50;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  animation: strip-dropdown-enter 0.15s ease-out both;
}

@keyframes strip-dropdown-enter {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}

.context-strip-backdrop {
  position: fixed;
  inset: 0;
  z-index: 49;
}
```

- [ ] **Step 3: Verify the dashboard still loads (grid will be broken until page.tsx is updated, that's expected)**

Run: `cd ~/Projects/ground-control && npm run build 2>&1 | tail -5`
Expected: Build succeeds (CSS changes don't break compilation).

- [ ] **Step 4: Commit**

```bash
git add app/globals.css
git commit -m "refactor: update dashboard grid to 2-column layout with context strip CSS"
```

---

### Task 2: Create ContextStrip Component

**Files:**
- Create: `components/home/context-strip/ContextStrip.tsx`
- Create: `components/home/context-strip/index.tsx`

- [ ] **Step 1: Create the barrel export**

Create `components/home/context-strip/index.tsx`:
```tsx
export { default } from "./ContextStrip";
```

- [ ] **Step 2: Create the ContextStrip component**

Create `components/home/context-strip/ContextStrip.tsx`:

```tsx
"use client";
import { useState, useEffect, useCallback } from "react";
import { Mail, CalendarDays, ListChecks } from "lucide-react";
import { useFetchAPI } from "@/hooks";
import { WidgetErrorBoundary } from "@/components/ui/WidgetErrorBoundary";
import InboxPanel from "@/components/home/inbox";
import CalendarPanel from "@/components/home/calendar";
import TasksPanel from "@/components/home/tasks";
import type { Email, CalEvent, Task } from "@/types";

// --- Summary data types matching API responses ---

interface InboxSummary {
  emails: Email[];
  unread: { personal: number; school: number };
}

interface CalendarSummary {
  events: CalEvent[];
}

interface TasksSummary {
  tasks: Record<string, Task[]>;
}

type PanelId = "inbox" | "calendar" | "tasks";

// --- Helpers ---

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

function countTodayTasks(grouped: Record<string, Task[]>): number {
  const today = new Date().toISOString().slice(0, 10);
  let count = 0;
  for (const tasks of Object.values(grouped)) {
    for (const t of tasks) {
      if (t.dueDate && t.dueDate.slice(0, 10) <= today) count++;
    }
  }
  return count;
}

// --- Component ---

export default function ContextStrip() {
  const [openPanel, setOpenPanel] = useState<PanelId | null>(null);

  // Fetch summary data
  const { data: inboxData } = useFetchAPI<InboxSummary>("/api/inbox", {
    transform: (raw) => ({ emails: raw.emails || [], unread: raw.unread || { personal: 0, school: 0 } }),
    pollInterval: 10 * 60 * 1000,
  });

  const { data: calData } = useFetchAPI<CalendarSummary>("/api/calendar", {
    transform: (raw) => ({ events: raw.events || [] }),
    pollInterval: 10 * 60 * 1000,
  });

  const { data: taskData } = useFetchAPI<TasksSummary>("/api/tana-tasks", {
    transform: (raw) => ({ tasks: raw.tasks || {} }),
    pollInterval: 10 * 60 * 1000,
  });

  // Derive summary text
  const totalUnread = (inboxData?.unread.personal ?? 0) + (inboxData?.unread.school ?? 0);
  const inboxLabel = `${totalUnread} unread`;

  const nextEvent = calData?.events
    ?.filter((e) => !e.allDay && new Date(e.start) > new Date())
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())[0];
  const calLabel = nextEvent
    ? `${nextEvent.summary.slice(0, 28)} ${formatTime(nextEvent.start)}`
    : `${calData?.events?.length ?? 0} today`;

  const todayCount = taskData ? countTodayTasks(taskData.tasks) : 0;
  const taskLabel = `${todayCount} today`;

  // Toggle panel
  const toggle = useCallback((panel: PanelId) => {
    setOpenPanel((prev) => prev === panel ? null : panel);
  }, []);

  // Escape key closes dropdown
  useEffect(() => {
    if (!openPanel) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenPanel(null);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [openPanel]);

  const segments: { id: PanelId; icon: React.ElementType; label: string }[] = [
    { id: "inbox", icon: Mail, label: inboxLabel },
    { id: "calendar", icon: CalendarDays, label: calLabel },
    { id: "tasks", icon: ListChecks, label: taskLabel },
  ];

  return (
    <div className="context-strip" style={{ gridColumn: "span 2" }}>
      {segments.map(({ id, icon: Icon, label }) => (
        <div
          key={id}
          className={`context-strip-segment${openPanel === id ? " active" : ""}`}
          onClick={() => toggle(id)}
        >
          <Icon size={14} />
          <span>{label}</span>
        </div>
      ))}

      {/* Backdrop for click-outside */}
      {openPanel && (
        <div className="context-strip-backdrop" onClick={() => setOpenPanel(null)} />
      )}

      {/* Dropdown overlay -- always mounted so widgets keep their fetch state */}
      <div
        className="context-strip-dropdown"
        style={openPanel ? undefined : { visibility: "hidden", pointerEvents: "none", maxHeight: 0, overflow: "hidden" }}
      >
        <div style={{ display: openPanel === "inbox" ? "flex" : "none", flexDirection: "column", flex: 1, minHeight: 0 }}>
          <WidgetErrorBoundary name="Inbox">
            <InboxPanel />
          </WidgetErrorBoundary>
        </div>
        <div style={{ display: openPanel === "calendar" ? "flex" : "none", flexDirection: "column", flex: 1, minHeight: 0 }}>
          <WidgetErrorBoundary name="Calendar">
            <CalendarPanel />
          </WidgetErrorBoundary>
        </div>
        <div style={{ display: openPanel === "tasks" ? "flex" : "none", flexDirection: "column", flex: 1, minHeight: 0 }}>
          <WidgetErrorBoundary name="Tasks">
            <TasksPanel />
          </WidgetErrorBoundary>
        </div>
      </div>
    </div>
  );
}
```

The dropdown div is always rendered so InboxPanel, CalendarPanel, and TasksPanel stay mounted and keep their internal fetch state. When closed, `visibility: hidden` + `pointerEvents: none` + `maxHeight: 0` hides it without unmounting. This avoids loading flashes on reopen since the widget panels (which use raw `fetch`, not `useFetchAPI`) retain their data.

- [ ] **Step 3: Verify the component compiles**

Run: `cd ~/Projects/ground-control && npx tsc --noEmit 2>&1 | tail -10`
Expected: No type errors related to ContextStrip.

- [ ] **Step 4: Commit**

```bash
git add components/home/context-strip/
git commit -m "feat: add ContextStrip component with summary data and dropdown overlays"
```

---

### Task 3: Update Page Layout

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Replace the page layout**

Update `app/page.tsx` to the new grid structure:

```tsx
"use client";
import { ChatProvider } from "@/lib/chat-store";
import { SharedDataProvider } from "@/lib/shared-data";
import { WidgetErrorBoundary } from "@/components/ui/WidgetErrorBoundary";
import ContextStrip from "@/components/home/context-strip";
import CrewWidget from "@/components/home/crew";
import ChatWidget from "@/components/home/chat";
import StatusBar from "@/components/home/status";

export default function Home() {
  return (
    <SharedDataProvider>
    <ChatProvider>
      <div className="dashboard-grid">
        <div style={{ gridColumn: "span 2", height: "100%" }}>
          <WidgetErrorBoundary name="Status Bar">
            <StatusBar />
          </WidgetErrorBoundary>
        </div>
        <WidgetErrorBoundary name="Context Strip">
          <ContextStrip />
        </WidgetErrorBoundary>
        <div style={{ minHeight: 0, overflow: "hidden" }}>
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

Key changes:
- Removed `InboxWidget`, `CalendarWidget`, `TasksWidget` imports and grid slots
- Added `ContextStrip` import and slot (it applies `gridColumn: span 2` internally)
- StatusBar wrapper changed from `span 3` to `span 2` (now a 2-column grid)
- Chat wrapper removed `gridColumn: span 2` (it now naturally fills the 2fr first column)

- [ ] **Step 2: Verify the build succeeds**

Run: `cd ~/Projects/ground-control && npm run build 2>&1 | tail -10`
Expected: Build succeeds with no errors.

- [ ] **Step 3: Visual check**

Run: `cd ~/Projects/ground-control && npm run dev &`
Open `http://localhost:3000` in a browser. Verify:
1. StatusBar spans full width at top
2. Context Strip shows below StatusBar with three segments (Inbox count, next calendar event, task count)
3. Chat fills left ~67% of remaining height, Crew fills right ~33%
4. Clicking a Context Strip segment opens the dropdown overlay with the full widget
5. Clicking again or pressing Escape closes it
6. Click outside (on Chat/Crew) closes the dropdown

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx
git commit -m "feat: wire ContextStrip into dashboard, remove top-row widget slots"
```

---

### Task 4: Polish and Edge Cases

**Files:**
- Modify: `components/home/context-strip/ContextStrip.tsx` (if needed)
- Modify: `app/globals.css` (if needed)

- [ ] **Step 1: Test dropdown scroll behavior**

Open each dropdown and verify scrolling works inside the widget panel. The `max-height: 50vh` on `.context-strip-dropdown` with `overflow: hidden` on the container means the widget's internal scroll (each panel uses `overflow-y: auto` on its body) should handle it. If the dropdown clips content without scrolling, add `overflow-y: auto` to `.context-strip-dropdown`.

- [ ] **Step 2: Test Chat widget interaction**

Verify that ChatTrigger still works. Open the Inbox dropdown, click an action that triggers a chat (e.g., Task or Reply on an email). The dropdown should close and the chat tab should open. If ChatTrigger does not propagate because the dropdown backdrop intercepts clicks, the backdrop `z-index` may need adjustment.

- [ ] **Step 3: Test Crew widget interaction**

Click a character action in Crew that opens a chat tab. Verify the trigger still works with the new layout.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: context strip dropdown polish and edge case fixes"
```

Only commit if there were changes. If everything works, skip this step.
