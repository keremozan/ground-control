# Ground Control — Design Document
Date: 2026-02-23

## Overview

New Next.js dashboard replacing `dashboard-prototype/` and `claude-dashboard/`. Ports the prototype UI and wires it to the real backend (character loading, Claude subprocess dispatch, SSE streaming).

## Stack

- **Framework:** Next.js 15, TypeScript, App Router
- **Runtime:** Node.js (not Edge — required for subprocess spawning)
- **Styling:** Port globals.css from dashboard-prototype (CSS vars, widget system)
- **Backend:** Next.js API routes (no separate Express server)
- **Task dispatch:** `claude --print --mcp-config` subprocess per task
- **Streaming:** ReadableStream / SSE from API routes to frontend EventSource

## Project Structure

```
~/Projects/ground-control/
  app/
    page.tsx                      — home dashboard
    pipeline/page.tsx             — pipeline visualization (phase 2)
    api/
      characters/route.ts         — GET: character roster
      tasks/route.ts              — GET: task definitions by category
      inbox/route.ts              — GET: Gmail via subprocess
      calendar/route.ts           — GET: Google Calendar via subprocess
      task/[taskId]/route.ts      — POST: dispatch task, stream SSE
      chat/route.ts               — POST: dispatch to character, stream SSE
      action/route.ts             — POST: email actions (Reply, Task, Archive), stream SSE
  components/
    home/                         — port from dashboard-prototype unchanged
    pipeline/                     — port from dashboard-prototype (phase 2)
  lib/
    characters.ts                 — singleton loader: reads ~/.claude/characters/ JSON + memory
    skills.ts                     — reads ~/.claude/skills/ SKILL.md files
    prompt.ts                     — buildPrompt, buildCharacterPrompt (port from claude-dashboard/server.js)
    tasks.ts                      — TASKS map (port from claude-dashboard/server.js)
    pipeline-data.ts              — node/edge data (port from dashboard-prototype, phase 2)
    char-icons.ts                 — port from dashboard-prototype
  app/globals.css                 — port from dashboard-prototype
```

## Backend Design

### Character & skill loading
- Module-level singleton in `lib/characters.ts`
- Loaded on first request, cached for process lifetime
- Reads all JSON configs + `.memory.md` from `~/.claude/characters/{core,meta,stationed}/`
- Reads shared knowledge from `~/.claude/shared/*.md`
- No file I/O per request

### Task dispatch (`POST /api/task/[taskId]`)
1. Look up task in `lib/tasks.ts` (label, character, prompt template)
2. Build prompt via `lib/prompt.ts` (character config + memory + skills + context)
3. Spawn `claude --print --mcp-config <path>` subprocess
4. Return `ReadableStream` — pipe subprocess stdout to client as SSE
5. Kill subprocess on client disconnect

### SSE pattern (all streaming routes)
```ts
export const runtime = 'nodejs';

export async function POST(req: Request) {
  // ... build prompt, spawn claude ...
  const stream = new ReadableStream({ start(controller) { /* pipe subprocess */ } });
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' }
  });
}
```

### Static data routes
- `GET /api/characters` — returns character roster from singleton
- `GET /api/tasks` — returns TASKS grouped by category
- `GET /api/inbox` — spawns claude subprocess with postman-scan-mail skill, returns JSON
- `GET /api/calendar` — spawns claude subprocess with calendar skill, returns JSON

## Frontend Design

### Data fetching pattern
- Static widgets (Inbox, Calendar, Crew): `fetch()` in `useEffect`, refresh button re-fetches
- Streaming widgets (Chat, Tasks, action buttons): `EventSource` or `fetch` with `ReadableStream` reader

### Component porting
All components ported from `dashboard-prototype/` with one change: replace `mock-data` imports with real API calls. No visual changes in phase 1.

| Component | Mock replaced with |
|-----------|-------------------|
| `InboxWidget` | `GET /api/inbox` |
| `CalendarWidget` | `GET /api/calendar` |
| `CrewWidget` | `GET /api/characters` |
| `TasksWidget` | `GET /api/tasks` + SSE dispatch |
| `ChatWidget` | `GET /api/characters` (roster) + SSE chat |
| `StatusBar` | `GET /api/characters` (active count) |

### Action buttons (InboxWidget)
Reply, Task, Schedule, Archive, Delete → `POST /api/action` with `{ emailId, action, account }` → SSE stream of Claude output.

## Phase 2 (Pipeline page)
- Port all pipeline components from dashboard-prototype unchanged
- Update `lib/pipeline-data.ts` to pull character roster from `/api/characters` instead of hardcoded mock
- Node/edge positions remain static (manually maintained per dashboard-prototype.md)

## Out of Scope
- Auth / multi-user
- Persistence beyond Tana and Gmail
- Scheduled tasks (can add later via cron in a separate process)

## References
- UI source: `~/Projects/dashboard-prototype/`
- Backend source: `~/Projects/claude-dashboard/server.js`
- Character configs: `~/.claude/characters/`
- Dashboard knowledge: `~/.claude/shared/dashboard-prototype.md`
