# Context Strip Layout Redesign

## Problem

The current dashboard splits vertical space equally across five widgets: Inbox, Calendar, Tasks (top row) and Chat, Crew (bottom row). Chat and Crew are the primary interaction surfaces. The top row consumes ~40% of viewport height for information that only needs a glance.

## Solution

Replace the top row with a 36px Context Strip showing summary counts. Full widgets appear as dropdown overlays on click. Chat and Crew take the full remaining height.

## Layout

```
┌─────────────────────────────────────────────────────┐
│ StatusBar                                     44px  │
├─────────────────────────────────────────────────────┤
│ ✉ 2 unread  │  ◎ Erasmus prep 20:00  │  ● 2 today  │  36px Context Strip
├────────────────────────────────┬────────────────────┤
│                                │                    │
│         Chat (span 2)          │       Crew         │
│         full height            │       full height  │
│                                │                    │
└────────────────────────────────┴────────────────────┘
```

## Components

### ContextStrip (`components/home/context-strip/ContextStrip.tsx`)

A single row with three equal-width segments. Each segment:
- Displays an icon + one-line summary
- Clickable to toggle a dropdown overlay
- Only one dropdown open at a time (clicking another closes the current)
- Click outside or press Escape closes the dropdown

Summary data per segment:
- **Inbox**: Fetch `/api/inbox`, count emails, display `"N unread"`. Show per-account icons (personal/school) if both have unread.
- **Calendar**: Fetch `/api/calendar`, find next event, display `"EventTitle HH:MM"` or `"No events today"`. Show total count.
- **Tasks**: Fetch `/api/tana-tasks`, count today-priority tasks, display `"N today"`.

Poll intervals match existing widgets: 10 minutes for inbox/tasks, 10 minutes for calendar.

### Dropdown Overlay

When a segment is clicked:
- A container (max-height ~50vh, full dashboard width) appears below the strip
- Contains the existing widget component (`InboxPanel`, `CalendarPanel`, `TasksPanel`) rendered unchanged, each wrapped in `WidgetErrorBoundary`
- ContextStrip container has `position: relative`; dropdown is `position: absolute`, `z-index: 50`, anchored to top-left of the strip
- Light shadow + border for separation
- Transition: fade + slide-down using `--ease-enter` (150ms), matching existing dashboard animation tokens
- Widgets stay mounted but hidden (`display: none`) while dropdown is closed, avoiding re-fetch/loading flash on reopen. All three mount on first ContextStrip render.

Click-outside detection via a backdrop div. Escape key closes via `useEffect` keydown listener.

### CSS Grid Change (`app/globals.css`)

```css
/* before */
grid-template-rows: 44px 1fr 1.4fr;
grid-template-columns: 1fr 1fr 1fr;

/* after */
grid-template-rows: 44px 36px 1fr;
grid-template-columns: 2fr 1fr;
```

The `height: calc(100vh - 44px)` rule on `.dashboard-grid` stays unchanged.

Chat gets `grid-column: 1` (2fr), Crew gets `grid-column: 2` (1fr). StatusBar and ContextStrip both use `grid-column: span 2` to fill the full width. No responsive breakpoints (desktop-only dashboard, same as current).

### Page Layout Change (`app/page.tsx`)

Before:
```tsx
<StatusBar />          // span 3
<InboxWidget />        // col 1
<CalendarWidget />     // col 2
<TasksWidget />        // col 3
<ChatWidget />         // span 2
<CrewWidget />         // col 3
```

After:
```tsx
<StatusBar />          // span 2
<ContextStrip />       // span 2 (new, wraps WidgetErrorBoundary for each dropdown panel)
<ChatWidget />         // col 1
<CrewWidget />         // col 2
```

## Styling

The Context Strip follows existing dashboard style:
- Background: `var(--surface)` with `var(--border)` bottom border
- Font: `var(--font-display)`, 12px, `var(--text-3)` for labels
- Icons: 14px, same color as text
- Hover: segment background shifts to `var(--surface-2)`
- Active (dropdown open): segment gets `var(--surface-2)` background + bottom accent border
- Dropdown: `var(--surface)` background, `var(--border)` border, `box-shadow: 0 4px 12px rgba(0,0,0,0.08)`

## Files to Create/Modify

| File | Action |
|------|--------|
| `components/home/context-strip/ContextStrip.tsx` | Create |
| `components/home/context-strip/index.tsx` | Create (barrel export) |
| `app/page.tsx` | Modify grid children |
| `app/globals.css` | Modify grid template |

## No Changes To

- InboxPanel, CalendarPanel, TasksPanel (rendered as-is inside dropdowns)
- ChatWidget, CrewWidget (just get more vertical space)
- StatusBar (unchanged)
- Any API endpoints
- SharedDataProvider, ChatProvider
