# Ground Control Reference

## System Overview

Ground Control is a modular agent system dashboard. It shows email, calendar, tasks, and a chat interface to talk to AI characters. Each character has a domain (research, teaching, admin, etc.) and can perform actions via MCP tools. The dashboard reads all data dynamically from character JSON configs and a user config file — no hardcoded character data in source code.

### Setup

New users: `npm install && npm run setup` — interactive wizard generates `ground-control.config.ts` (secrets, scheduler, pipeline) and installs character configs to `~/.claude/characters/`.

### Key Config Files

| File | Purpose | Git |
|------|---------|-----|
| `ground-control.config.ts` | User-specific: name, Tana, Gmail, scheduler jobs, sources/outputs | Ignored |
| `ground-control.config.example.ts` | Template with placeholder values | Committed |
| `mcp-tasks.json` | MCP server config for spawned characters | Ignored |
| `mcp-tasks.template.json` | MCP template with `$TANA_MCP_URL` placeholders | Committed |
| `~/.claude/characters/{tier}/*.json` | Character configs (drive everything) | External |

## Characters

| Character | Domain | Model | Role |
|-----------|--------|-------|------|
| Postman | Communications | haiku | Scans inputs (email, WhatsApp, Tana), creates #post nodes, routes to characters |
| Scholar | Intellectual | sonnet | Research, writing, brainstorming |
| Clerk | Admin | haiku | Admin tasks, scheduling, forms |
| Coach | Personal | sonnet | Wellbeing check-ins, weekly reviews |
| Architect | Systems | sonnet | System maintenance, code, Tana schema, dashboard |
| Oracle | Strategic | opus | Big-picture advice, cross-domain pattern recognition |

Stationed characters are project-specific and don't appear in the Crew widget.

Characters are defined in JSON configs at `~/.claude/characters/{core,meta,stationed}/`. The dashboard reads them at runtime — no code changes needed to add or modify characters. Each JSON config includes: name, tier, icon, color, domain, model, actions (with icons + descriptions + autonomous flags), skills, routingKeywords, trackPatterns, seeds, outputs, gates.

## Data Flow

```
Input Sources                    Tana                     Output
--------------                  ------                   ------
Gmail (personal)  ──┐
Gmail (school)    ──┤  Postman   ┌─── #post ──→ Character ──→ #task
WhatsApp          ──┼──scans──→  │       (routed input)         │
Tana inbox        ──┤            │                              ↓
Manual            ──┘            │                         Execution
                                 │                              │
                                 │                              ↓
                                 └───────────────────── #log (archived)
```

### The Post-Task Pipeline

1. **#post** (tag: `9v5SaKFBsNWR`) — Routed input item. Created by Postman.
   - Fields: From context (single-line metadata), Source (mail/whatsapp/tana/manual), Receiver (character), Type (task/question/fyi/deadline), Status, Priority
   - Email body added as child nodes under the #post (not in a field, to avoid Tana paste format issues)
   - Created when: Postman scans inputs, or user clicks "Send to Postman" button

2. **#task** (tag: `tuoCgN5Y6sn9`) — Work item on a track.
   - Fields: Status (backlog/in-progress/done), Priority (high/medium/low), Track, Assigned (character), Due date
   - Created when: Character processes a #post, or user clicks "Task" button on an email

3. **#log** (tag: `z_H8Mci5LUzW`) — Archived activity record per track.
   - Fields: Track, Date
   - Created when: A task is archived (summary child added, original task trashed)

### Three Paths from Email to Task

| Path | Button | Intelligence | UI | What it does |
|------|--------|-------------|-----|-------------|
| **AI Extract** | "Task" on email | Smart | Black bar under inbox (SSE from `/api/action`) | AI reads the email, understands it, may create multiple specific tasks from one email |
| **Direct Save** | "Postman" on email | None | Instant, no UI | Creates ONE #task with raw email content as child notes. "Save this, deal with it later." |
| **Batch Cycle** | Crew → Postman → Cycle | Smart, batch | Chat window | Scans all sources, classifies, routes via #posts, then converts to #tasks |

**Key difference**: "Task" uses AI to understand and extract (e.g., one email → 3 tasks). "Postman" just saves the email as-is into one task. Cycle processes everything in bulk.

### Post Processing Flow

Dashboard buttons (Postman on email, Task on calendar) create #tasks directly — no #post intermediary.

The #post → #task pipeline is batch-only:
1. Scan skills create #post nodes from inputs
2. `scan-tana` routes AND converts #posts to #tasks in one pass
3. `postman-cycle` runs all scans then converts remaining #posts

## Widgets

### StatusBar
- Brand, version pill (clickable → changelog modal), nav links (Home / Pipeline) with active pill indicator
- Date + live clock (updates every 60s)
- Real last cycle time from `/api/status` (reads `data/job-results.json`)
- Multi-service health indicators (refreshes every 60s):
  - Tana MCP (Tana icon + dot) — pings `list_workspaces`
  - Gmail (Mail icon + dot) — pings profile API for both accounts. Green = both OK, amber = one down, red = both down
  - Google Calendar (CalendarDays icon + dot) — pings calendarList API
  - Playwright (Monitor icon + dot) — checks if Chromium browsers installed at `~/Library/Caches/ms-playwright/`
- Click service indicators → detail dropdown with per-service status (OK/DOWN) + "Retry all" button
- Bug report button → modal textarea, logs to tiny-log.jsonl (Architect watcher picks it up)

### InboxWidget
- **Data source**: Gmail API (Threads endpoint) for both personal + school accounts
- **Filtering**: Excludes `category:promotions`, `category:social`, and `category:forums` via Gmail search query. Only Primary and Updates emails appear.
- **Labels**: Read from Gmail's native labels (user-managed in Gmail). Chips have colored backgrounds — known labels get config-driven colors, unknown labels get hash-based hue.
- **Threads**: Collapsed by threadId across accounts, shows message count badge
- **Unread counts**: From Gmail `/labels/INBOX` endpoint per account
- **Account accent**: 3px left border — indigo for personal, pink for school
- **Open button**: Opens email in Gmail browser (`mail.google.com/mail/u/{0|1}/#inbox/{threadId}`)

### CalendarWidget
- **Data source**: Google Calendar API (all calendars)
- **Sections**: Earlier (past, compact, greyed out) → Today's active events (detailed) → Upcoming week (compact)
- **Past events**: Events whose end time < now shown at top in compact row (opacity 0.45), labeled "Earlier". All-day events never count as past.
- **Event colors**: 3px left border from `charColor` via title keywords — scholar purple (research), coach emerald (wellbeing), clerk amber (admin). Neutral slate for uncategorized.
- **Open button**: Opens event in Google Calendar (uses `htmlLink` from Calendar API)

### TasksWidget
- **Data source**: Tana MCP (`search_nodes` for #task, `read_node` for fields)
- **Grouping**: By track, collapsible with chevron
- **Filtering**: Priority chips (High / All)
- **Assignment**: Shows character icon; derived from track if not set in Tana
- **Status badges**: ACTIVE (blue pill), BACKLOG (gray pill)
- **Open button**: Opens node in desktop Tana app via `open_node` MCP tool

### ChatWidget
- **Multi-tab architecture**: Each tab is a separate `ChatPanel` component instance with fully independent state (messages, streaming, abort controller). Wrapper (`ChatWidget`) manages tab lifecycle, persistence, and trigger routing.
- **Tab bar**: Between header and body. Shows character icon + name per tab, spinner for loading tabs, close "x" (if >1 tab), "+" button to create new tab via character picker dropdown.
- **Default character**: Postman. User can switch via tab picker.
- **Concurrency**: Max 2 parallel streams. 3rd tab disables send with "2 chats running" placeholder. Triggers bypass the limit.
- **Tab visibility**: Active tab rendered normally (`display: contents`). Loading inactive tabs hidden (`display: none`) but stay mounted so fetch continues. Idle tabs unmounted — messages preserved in wrapper state.
- **Messaging**: SSE stream from `/api/chat` → spawns Claude subprocess
- **Streaming text**: Response renders incrementally as SSE text events arrive. Thinking dots shown only until first text chunk, then live text replaces them.
- **Tool activity log**: During streaming, shows accumulated list of tool calls the character is making. Completed tools show with checkmark at reduced opacity, active tool shows with spinner. Falls back to thinking dots when no tool activity yet.
- **Self-talk separation**: Initial preamble text ("I'll use...", "Let me...") shown as small gray text above the bubble. Structured output (headings, bullets, results) shown inside the bubble.
- **Bubble style**: User = monogram icon + left border accent, left-aligned, full width. Assistant = character icon + left accent border (character color), smaller text (11.5px).
- **Markdown rendering**: Headers (##/###) in character accent color, **bold** in accent color with subtle accent-colored underline, `code` (accent-tinted), bullets, numbered lists, horizontal rules, `==highlight==` syntax renders with yellow marker underline (transparent top, #fde68a bottom)
- **Stats**: Duration (seconds), token estimate, and model name (haiku/sonnet/opus) shown below each response
- **Context compression**: Estimates token usage per conversation based on `content.length / 3.5`. Shows a progress bar above input when context reaches 70% (yellow) or 85% (red). Auto-compresses at 85%: haiku summarizes older messages, keeps last exchange intact. Compressed messages show as "Context compressed (N messages)" with summary. Uses `/api/inbox/action?action=summarize-text` for compression.
- **Stop button**: Red square replaces send button during loading. Aborts the fetch via AbortController. Partial streamed text is preserved.
- **Persistence**: All tabs saved to localStorage (`gc-chat`) as `{ tabs: [{id, charId, messages}], activeTabId }`. Migrates from old single-chat format. Empty tabs auto-removed on refresh.
- **Copy message**: Only copies the structured output, not the self-talk preamble
- **Copy all**: Header button copies entire conversation as markdown with bold sender names and `---` separators
- **Send to Tana**: Header button sends entire conversation to today's day page in Tana. Per-message upload button (Tana icon) sends individual messages. Uses `/api/tana-send` endpoint.
- **Integration**: CrewWidget/InboxWidget triggers create a NEW tab (don't overwrite existing). Trigger forwarded to specific tab via `pendingTrigger` state.

### CrewWidget
- **Data source**: `/api/characters` (filtered to core + meta tiers). Full character data including icon, actions, seeds, autonomous flags.
- **Icons**: Character and action icons resolved via `resolveIcon()` from `lib/icon-map.ts` — icon names stored as strings in JSON configs.
- **Action buttons**: Labeled buttons (icon + text) per action, colored by character color. Tooltips show description from character JSON `actions[].description`. Clicking triggers ChatWidget with seed prompt from `seeds` field.
- **Autonomous actions**: Actions with `autonomous: true` in character JSON run via `POST /api/schedule/run` (background job) instead of opening chat.
- **Pulse animation**: Character icon box pulses (scale + opacity via `pulse-crew` keyframe, 1.5s ease-in-out infinite) when any of its actions are running.
- **Model badges**: haiku (gray), sonnet (blue), opus (purple)

## Button Reference

### Inbox Actions

| Button | Action | Flow | Method |
|--------|--------|------|--------|
| Summarize | AI summarizes email — key points + action items | Fetch body → inline panel via `/api/inbox/action?action=summarize` (haiku, non-streaming) | Direct, inline |
| Reply | Opens inline textarea prompt → user writes notes → Postman drafts reply with communication-style skill → saves Gmail draft | User submits notes → fetch body → trigger Chat as Postman | Inline prompt → SSE stream |
| Task | AI extracts tasks → creates #task in Tana | Fetch body → trigger Chat as Postman → `/api/chat` | SSE stream |
| Schedule | AI creates calendar event | Fetch body → trigger Chat as Clerk → `/api/chat` | SSE stream |
| Archive | Remove thread from INBOX (thread-level) | `POST /api/inbox/action` | Direct, instant |
| Delete | Trash thread via Gmail API (thread-level) | `POST /api/inbox/action` | Direct, instant |
| Postman | Create #task directly in Tana | `POST /api/inbox/action` | Direct, instant |

AI actions (Task, Schedule) fetch the email body, then open Chat with a seed prompt via React context (`setTrigger`). Summarize uses a direct haiku call (non-streaming, inline result). Reply opens an inline textarea prompt — user writes notes, then Postman drafts via Chat with communication-style modifier.

### Calendar Actions

| Button | Action | API | Method |
|--------|--------|-----|--------|
| Task | Create #task directly in Tana | `POST /api/calendar/action` | Direct, instant |
| Delete | Delete event via Google Calendar API | `POST /api/calendar/action` | Direct, instant |

### Task Actions

| Button | Action | API | Method |
|--------|--------|-----|--------|
| Start | Shows prompt input → submit with context or skip → spawn AI | `POST /api/tana-tasks/action` | SSE stream |
| Done | Set status → done, check off node | `POST /api/tana-tasks/action` | Direct |
| Archive | Find/create #log, add summary, trash task | `POST /api/tana-tasks/action` | Direct |
| Delete | Trash node in Tana | `POST /api/tana-tasks/action` | Direct |

### Chat Actions

| Button | Action | Method |
|--------|--------|--------|
| Copy | Copy message text to clipboard | `navigator.clipboard` |
| Postman | Create #post from chat message | `POST /api/inbox/action` |
| Clear | Clear all messages | Local state reset |

### Crew Actions

Each character has icon-only action buttons (always visible). Most buttons open Chat with a seed prompt. Some run **autonomously** — same as scheduled jobs (no chat, stores result, appears in logs).

Actions are defined in each character's JSON config `actions` array. Each action has `label`, `icon`, `description`, and optional `autonomous: true`.

Actions with `autonomous: true` run via `POST /api/schedule/run` (ad-hoc mode) instead of opening chat. Currently: Architect's **System** and **Watch** actions.

| Action | What it does |
|--------|-------------|
| **System** | Check memory files for size/staleness, verify skill references exist, check knowledge file links, review routing table, check dashboard pipeline sync. Fix-or-escalate: fix issues directly (edit files, update configs) or create Tana #task if needs human decision. Updates CHANGELOG.md and REFERENCE.md after changes. |
| **Watch** | Read `tiny-log.jsonl` for errors since last review, check for failed routes/missing rules/inactive characters/memory overflow. Fix root causes (edit skills, update memory, fix routing, make code changes). If a pattern repeats 2+ times, fix the root cause, don't just log it. Create Tana #task for items needing human input. Truncate processed log entries. Updates CHANGELOG.md and REFERENCE.md after changes. |

Results are stored in `data/job-results.json` and appear as clickable entries in LogsWidget (same as scheduled job results).

## API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/inbox` | GET | Gmail threads (collapsed) + unread counts |
| `/api/inbox/action` | POST | Email actions: archive, delete, body, postman, summarize (haiku), summarize-text (haiku, for context compression) |
| `/api/calendar` | GET | Calendar events (today or week) |
| `/api/calendar/action` | POST | Direct calendar actions: task, delete |
| `/api/tana-tasks` | GET | Tana tasks grouped by track |
| `/api/tana-tasks/action` | POST | Task mutations: prepare, start, done, archive, delete |
| `/api/chat` | POST | Chat with character (SSE stream) |
| `/api/characters` | GET | Character roster |
| `/api/tasks` | GET | Task definitions (scan-inbox, etc.) |
| `/api/task/[taskId]` | POST | Dispatch named task (SSE stream) |
| `/api/schedule/run` | POST | Execute a job (scheduled or ad-hoc), store result |
| `/api/schedule/results` | GET | Return stored job results |
| `/api/changelog` | GET | Serve CHANGELOG.md content for version modal |
| `/api/status` | GET | Service health: Tana MCP, Gmail (personal+school), Calendar, Playwright browser, last cycle time |
| `/api/tana-send` | POST | Send content to today's Tana day page (title + content → `import_tana_paste` on calendar node) |
| `/api/log` | POST | Persist action log entry (server-side) |

## File Structure

```
app/
  page.tsx                    — Home page layout (grid: 3 cols, 3 rows)
  pipeline/page.tsx           — Pipeline page layout (graph, logs, schedules)
  globals.css                 — All styles, CSS variables, widget system
  api/
    inbox/route.ts            — Gmail threads API
    inbox/action/route.ts     — Email actions (archive, delete, body, postman, summarize, summarize-text)
    calendar/route.ts         — Google Calendar API
    calendar/action/route.ts  — Direct calendar actions (task, delete)
    tana-tasks/route.ts       — Tana tasks API
    tana-tasks/action/route.ts — Task mutations (prepare, start, done, archive, delete)
    chat/route.ts             — Chat with character (SSE)
    characters/route.ts       — Character roster
    tasks/route.ts            — Task definitions
    task/[taskId]/route.ts    — Named task dispatch (SSE)
    schedule/run/route.ts     — Execute scheduled job, store result
    schedule/results/route.ts — Return stored job results
    tana-send/route.ts        — Send content to today's Tana day page
    changelog/route.ts        — Serve CHANGELOG.md for version modal
    log/route.ts              — Persist action log entry

components/home/
  StatusBar.tsx               — Top bar (brand, nav, date, health)
  InboxWidget.tsx             — Gmail inbox with actions
  CalendarWidget.tsx          — Calendar events (task, delete)
  TasksWidget.tsx             — Tana tasks with filtering
  ChatWidget.tsx              — Multi-tab chat (ChatWidget wrapper + ChatPanel per tab)
  CrewWidget.tsx              — Character roster with seeds (chat + autonomous actions)

components/icons/
  TanaIcon.tsx                — Custom SVG Tana icon (circle + dot), matches Lucide icon props. Used in StatusBar, ChatWidget, SystemGraph, PipelineNode.

components/pipeline/
  SystemGraph.tsx             — Full system flow: Intake pipeline, expandable character cards (click to show routing keywords, gates, skills), output targets, shortcuts, automation schedules
  LogsWidget.tsx              — Real-time action log (clickable scheduler entries)
  SchedulesWidget.tsx         — Scheduled jobs with "Do Now" buttons
  CycleToolbar.tsx            — "Run Full Cycle" 3-phase button (scan → check tasks → spawn characters)
  JobResultModal.tsx          — Full response viewer for completed jobs
  PipelineNode.tsx            — Pipeline node rendering
  PipelineEdge.tsx            — Pipeline edge rendering

lib/
  gmail.ts                    — Gmail API client (threads, labels, archive, trash)
  google-calendar.ts          — Calendar API client (events, delete)
  google-auth.ts              — OAuth token management (auto-refresh)
  tana.ts                     — Tana MCP client (tasks, posts, logs, sendToTanaToday)
  characters.ts               — Character loader (reads JSON configs)
  char-icons.ts               — Character colors and icons (charColor, charIcon) — gutted; action data now in character JSON configs
  icon-map.ts                 — String-to-LucideIcon resolver (resolveIcon) — 46 icons + TanaIcon
  config.ts                   — Reads ground-control.config.ts, exports all paths/tokens/settings
  chat-store.tsx              — React context for Crew→Chat trigger
  tasks.ts                    — Named task definitions + action→character map
  scheduler.ts                — Scheduled job definitions (reads from ground-control.config.ts)
  action-log.ts               — Client-side action log buffer + pub/sub + localStorage persistence
  prompt.ts                   — Prompt builder (assembles character + skills + knowledge + CHANGELOG for Architect). Uses USER_NAME from config.
  spawn.ts                    — Claude subprocess spawner (SSE + collect modes)
  pipeline-data.ts            — Static pipeline graph nodes, edges, details
  mock-data.ts                — Mock data (used by StatusBar + LogsWidget character lookup)

scripts/
  install-schedules.sh        — Generate + load launchd plists

data/
  job-results.json            — Server-side job result storage (gitignored)

docs/
  REFERENCE.md                — This file
```

## Auth & Tokens

| Service | Token location | Refresh |
|---------|---------------|---------|
| Gmail (personal) | `~/.gmail-mcp/credentials.json` | Auto via OAuth |
| Gmail (school) | `~/.gmail-mcp-school/credentials.json` | Auto via OAuth |
| Google Calendar | `~/.config/google-calendar-mcp/tokens.json` | Auto via OAuth |
| Tana MCP | Hardcoded token in `lib/tana.ts` | Static |

## Tana IDs

Tana IDs are workspace-specific. After setup, store your IDs in `~/.claude/skills/assistant/knowledge-base/tana-ids.md`. The system uses these tags and fields:

| Item | Purpose |
|------|---------|
| #task | Work items on tracks (status, priority, assigned, due) |
| #post | Routed input items created by Postman |
| #log | Archived activity records per track |
| Status field | backlog / in-progress / done |
| Priority field | high / medium / low |
| Track field | Workstream grouping |
| Assigned field | Character assignment |

IDs are referenced in `lib/tana-schema.ts`. Update this file with your workspace's actual IDs after creating the Tana schema.

## Chat Multi-Turn Memory

Each chat message spawns a fresh Claude Code subprocess (`lib/spawn.ts`). To maintain conversation context, the `ChatWidget` passes the full message history to `/api/chat` as a `history` array. The API route formats history into the prompt:

```
## Conversation so far
User: [first message]
You: [first response]
...

## User's latest message
[current message]
```

- **Trigger messages** (from action buttons) start fresh — no history sent
- **Follow-up messages** (typed in the input) include all prior messages as history
- **Context** (email body, task markdown) is embedded in the first message only
- **Autonomy rules** are always appended to every chat message (not just context messages), preventing characters from asking "OK?" or requesting confirmation before acting

### sendMessage signature
```typescript
sendMessage(msg, charId?, context?, history?)
```
- `handleSend` (user typing) passes `messages` state as history
- Trigger effect passes no history (fresh conversation)

## Pipeline Page

### SystemGraph — Fully Dynamic

All data fetched from APIs on mount — zero hardcoded character data in source code.

**Data sources**:
- `GET /api/characters` — character flows (icons, actions, routing, skills, seeds, gates)
- `GET /api/system/config` — pipeline sources, outputs, connections, paths, skills, knowledge

**Flow diagram**: Sources → Postman → #post → Route → #task → Outputs → #log. Sources and outputs from config.

**Character cards** in a grid. Each card clickable — expands to show:
- **Routing keywords**: Editable colored pills (add/remove persists to character JSON)
- **Gates**: Amber-dot conditions
- **Skills**: Clickable pills that open SKILL.md editor, with file existence indicators (red warning if missing)
- **Knowledge**: Clickable pills that open knowledge file editor, with existence indicators
- **Memory**: Clickable button to open memory file editor (100-line limit warning)

**System Config panel**: Connections (Tana, Gmail, Calendar status dots), paths, expandable skill/knowledge/character lists.

**Icons**: All resolved at render time via `resolveIcon()` from `lib/icon-map.ts`. Character JSON stores icon names as strings (e.g., `"BookOpen"`, `"PenLine"`).

### CycleToolbar — Run Full Cycle

Three-phase cycle with per-character progress.

**Phase 1: Postman Scan** — fires `postman-morning` job via `POST /api/schedule/run`. Button shows: "postman scan..."

**Phase 2: Check Tasks** — fetches pending #tasks from Tana, groups by character, applies `resolveCharacter()` routing, filters to task worker characters.

**Phase 3: Spawn Characters** — sequential, per-character. Button shows: "Scholar (1/3) task names...". Each character gets task list + Tana node IDs + step-by-step instructions.

- Error tracking: red AlertCircle on failure
- Summary: "scan, 2 chars" or "scan, 1 err" or "no work"
- Ref guard prevents double-clicks
- `evening-tasks` job runs Phase 2+3 only (19:00 daily, also via "Do Now")

## Scheduler System

Background task execution using macOS launchd + dashboard API. Runs even when browser tab is closed, survives computer restarts.

### How It Works

```
launchd (macOS)                  Dashboard API               Claude CLI
─────────────                    ─────────────               ──────────
StartCalendarInterval fires  →   POST /api/schedule/run  →   spawnAndCollect()
(curl to localhost:3000)         looks up job + character     spawns claude CLI
                                 builds prompt                collects all text output
                                 stores result to             returns response string
                                 data/job-results.json
                                 returns { ok, result }
```

**Prerequisite**: The Next.js dev server must be running on port 3000. If it's not, curl fails silently and retries at the next scheduled time.

### Persistence & Reliability

- **Survives restarts**: Plists in `~/Library/LaunchAgents/` are loaded automatically on login
- **Fires on wake**: `StartCalendarInterval` fires missed jobs when Mac wakes from sleep
- **No browser needed**: launchd runs curl directly — no browser tab required
- **10-minute timeout**: `spawnAndCollect` kills the subprocess after 10 minutes if it hangs
- **Results stored server-side**: `data/job-results.json` (last 100 entries, gitignored)

### Schedule Jobs

Defined in `lib/scheduler.ts`. Each job has: id, charName, seedPrompt, cron, label, mode, enabled.

| ID | Time | Character | Task |
|----|------|-----------|------|
| postman-morning | 08:00 daily | Postman | Full scan-process-deliver cycle |
| postman-afternoon | 13:00 daily | Postman | Light scan (mail + tana only) |
| postman-evening | 18:00 daily | Postman | Full scan-process-deliver cycle |
| evening-tasks | 19:00 daily | Crew (multi) | Spawn characters with pending tasks (process-tasks type) |
| architect-watcher | 22:00 daily | Architect | Review tiny-log for errors, fix root causes (edit skills/config/code), create Tana #task for items needing human input, truncate processed entries. Always updates CHANGELOG.md and REFERENCE.md. |
| architect-maintenance | Tue,Fri 14:00 | Architect | System maintenance — memory hygiene, skill verification, routing consistency, type checking (`tsc --noEmit`), update SystemGraph if pipeline changed. Fix-or-escalate protocol: fix issues directly or create Tana #task if needs human decision. Always updates CHANGELOG.md and REFERENCE.md. |
| coach-weekly | Friday 16:00 | Coach | Weekly review |
| oracle-weekly | Sunday 20:00 | Oracle | Weekly strategic advisory |

### Components

| File | What |
|------|------|
| `lib/scheduler.ts` | Job definitions (client-safe, no fs deps) |
| `lib/spawn.ts` → `spawnAndCollect()` | Non-streaming Claude CLI runner, collects full response |
| `app/api/schedule/run/route.ts` | POST: execute job — single-char (by `jobId` or ad-hoc `charName+seedPrompt`) or multi-char (`process-tasks` type) |
| `app/api/schedule/results/route.ts` | GET: return stored job results from `data/job-results.json` |
| `components/pipeline/SchedulesWidget.tsx` | Live job list, "Do Now" buttons, last run times |
| `components/pipeline/JobResultModal.tsx` | Full response modal with markdown rendering, copy button |
| `components/pipeline/LogsWidget.tsx` | Action log with clickable scheduler entries → opens JobResultModal |
| `scripts/install-schedules.sh` | Generates + loads launchd plists into `~/Library/LaunchAgents/` |
| `data/job-results.json` | Server-side result storage (gitignored) |

### Installing / Updating Schedules

```bash
bash scripts/install-schedules.sh
```

This generates one plist per job in `~/Library/LaunchAgents/com.ground-control.*.plist` and loads them. To verify: `launchctl list | grep ground-control`.

### Autonomy Rules for Scheduled Jobs

All scheduled jobs run unattended. The `schedule/run` API appends strict autonomy rules to every job prompt:

- **Never ask questions** — there is no human to answer. Just do everything.
- **Create tasks for ALL actionable items** — user can delete unwanted tasks later.
- **Never send emails or messages directly** — only create drafts.
- **Skip expired deadlines** — don't create tasks for things that already passed.
- **Duplicate prevention (mandatory)** — before creating ANY task, use `tana_semantic_search` with the task name (limit: 10, minSimilarity: 0.4). If any existing task covers the same intent (not exact wording), skip it. Report skipped duplicates. When in doubt, don't create.
- **Produce a summary report** at the end of every run.

These rules also apply to "Do Now", "Run Full Cycle", and autonomous Crew buttons (Architect System/Watch) since they all use the same API.

### UI Flow

1. **SchedulesWidget** shows all enabled jobs with character icon, cron time, last run time (plain text)
2. **"Do Now" button** (play icon) calls `POST /api/schedule/run` — shows loading spinner while running
3. On completion, result is stored and a log entry (with `jobId`) appears in LogsWidget
4. **Clicking a scheduler log entry** in LogsWidget opens **JobResultModal** with the full Claude response
5. **CycleToolbar "Run Full Cycle"** runs 3-phase cycle: Postman scan → check pending tasks → spawn characters with work
6. **Clear button** (trash icon) in LogsWidget header clears the client-side log buffer (not the system log file)

### Run Full Cycle vs Do Now

| Action | What it does |
|--------|-------------|
| **Do Now** (per job) | Runs one specific job (e.g., Postman morning scan) |
| **Run Full Cycle** | 3-phase: (1) Postman full scan, (2) check who has pending tasks, (3) spawn only characters with work. Skips Coach/Oracle. |

### Log System (two separate things)

| Log | Where | Purpose | Cleanup |
|-----|-------|---------|---------|
| **Action log** (client-side) | `lib/action-log.ts` buffer + localStorage (`gc-action-log`) | UI log entries in LogsWidget, persists across refresh | Clear button in LogsWidget header |
| **System log** (tiny-log) | `~/.claude/logs/tiny-log.jsonl` | Persistent system-level audit trail | Architect watcher should truncate after processing to avoid re-reading old entries |

The action log is ephemeral (client-side, resets on page reload). The system log is persistent and used by Architect's watcher to detect errors and auto-fix issues.

## Named Tasks

Defined in `lib/tasks.ts`. Dispatched via `POST /api/task/[taskId]`.

| Task ID | Character | Model | Purpose |
|---------|-----------|-------|---------|
| scan-inbox | Postman | haiku | Scan both Gmail accounts |
| process-day | Postman | haiku | Tag untagged Tana day page nodes |
| calendar-prep | Scholar | sonnet | Check calendar for the week ahead |
| scan-whatsapp | Postman | haiku | Scan monitored WhatsApp chats |
| oracle-review | Oracle | opus | Strategic review of recent activity |
| postman-cycle | Postman | haiku | Full scan-process-deliver cycle |

## Known Fixes & Rules

### Gmail Draft Threading
When creating Gmail drafts as replies via MCP, you MUST set both `threadId` AND `inReplyTo`. Without `inReplyTo`, Gmail creates a "ghost draft" that appears in the drafts list but cannot be opened or edited. Both action routes (`/api/action` and `/api/tana-tasks/action`) include this instruction in the AI prompt.

### Email Sending — Strict Rule
The system NEVER sends emails directly. All outbound email actions create drafts only. The user reviews and sends manually.

### Archive Task Fix
The `archiveTask` function wraps #log creation in try/catch so that `trash_node` always executes even if logging fails. Original bug: `search_nodes` query used `attributeId` instead of `fieldId`, causing the search to throw and abort before trashing.

When creating a NEW `#log` node (no existing log for that track), the task summary is included in the same `import_tana_paste` call. Previous bug: the summary was only added in a second call that required a `logNodeId` — but the creation call didn't return the ID, so the summary was never added.

### Double-Click Guard
`TasksWidget.doSimpleAction` uses both React state (`busy` Set) and a synchronous ref (`busyRef`) to prevent double-clicks. React state alone is insufficient because multiple clicks can arrive before the next render.

### MCP Tool Error Detection
`mcpCall` in `lib/tana.ts` checks both `data.error` (JSON-RPC level) and `data.result.isError` (tool-level). Without the `isError` check, MCP tool failures (like `trash_node` on an already-trashed node) silently pass as success.

### Tana Search Index Lag
After trashing a node, `search_nodes` may still return it for a few seconds. `TasksWidget` handles this with optimistic removal — the task is removed from React state immediately, and a delayed refetch (3s) syncs with the actual Tana state.

### Project Directory
The dashboard runs on port 3000. The CLAUDE.md at project root is the source of truth for project-level instructions.

### Gmail Delete/Archive Uses Thread Endpoints
`archiveEmail` and `trashEmail` in `lib/gmail.ts` use Gmail's **thread** endpoints (`/threads/{id}/modify` and `/threads/{id}/trash`), not message endpoints. The inbox displays threads — trashing a single message doesn't remove the thread from inbox if it has other messages. The InboxWidget passes `threadId` alongside `emailId` to the API route.

### Smart Task Routing (resolveCharacter)
`lib/tana.ts` exports `resolveCharacter(assigned, track, taskName)` which checks name-based regex overrides BEFORE falling back to track-based assignment. This catches misroutes where a task is assigned to the wrong character based on its track. Override patterns are defined per-character for domain-specific keywords.

### Tana MCP: tana_create vs import_tana_paste
The `supertag` server's `tana_create` tool uses a cached schema registry built from Tana exports. New tags created via `tana-local` won't be recognized until a fresh export + reindex. Always use `import_tana_paste` with tag IDs (`#[[^tagId]]`) for new tags — this bypasses the cache entirely. Skills should include tag IDs and field IDs for reliability.

### Spawn Architecture
All AI actions spawn `claude` CLI (`~/.local/bin/claude`) as a subprocess via `lib/spawn.ts`. No Anthropic API key needed — Claude Code handles auth. The subprocess runs with `--dangerously-skip-permissions` and an MCP config at `ground-control/mcp-tasks.json`.

MCP servers available to spawned characters:
- **tana-local** — Tana workspace access (HTTP, token auth)
- **supertag** — Semantic search, node operations
- **playwright** — Browser automation with persistent profile (`~/.playwright-profile`), no timeouts
- **web-traversal** — Authenticated web content via headless Chromium

Architect also receives `CHANGELOG.md` in its prompt context (injected by `buildCharacterPrompt` in `lib/prompt.ts`) to prevent suggesting features that already exist.

### Restart Server
The health dropdown has a "Restart server" button. It touches `lib/restart-trigger.ts` to trigger Next.js hot reload — does not kill the process.
