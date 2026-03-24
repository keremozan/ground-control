# Changelog

## v3.3.0 — 2026-03-25

### New
- [new] Telegram crew channels: per-character Telegram groups for two-way communication. Bot polls for inbound messages, spawns character sessions, posts responses back. One bot, 11 groups.
- [new] Conversation history in Telegram: follow-up messages retain context within a 10-minute idle window. `/new` command to reset.
- [new] Typing indicator: bot shows "typing..." while character is processing.
- [new] Telegram send endpoint (`POST /api/telegram/send`): characters post to their group via curl.
- [new] Telegram polling control: start/stop/status endpoints under `/api/telegram/poll/`.
- [new] Telegram log endpoint (`GET /api/telegram/log`): separate log from Gmail pipeline.
- [new] Self-learning system: outcome tracking for draft edits, job completions, and chat corrections. Rolling 90-day retention.
- [new] Draft outcome checker: classifies Kerem's edits to character drafts (accepted, light edit, heavy rewrite, discarded) using edit distance.
- [new] Lesson extractor: detects behavioral patterns from outcomes and writes to character memory.
- [new] Usage analytics and outcomes API.

### Improvements
- [improved] Style gate upgraded to two-pass (Haiku syntax + Sonnet tropes).
- [improved] Style gate is now conditional per character (opt-in via `styleGate: true` in config).
- [improved] Instinct system: learned behaviors loaded into character prompts automatically.
- [improved] Spawn supports `allowedTools` and `extendedThinking` options.
- [improved] API-call job type for lightweight cron tasks (no Claude session needed).

### Fixes
- [fix] Reduced false positives in chat correction detection.
- [fix] Outcomes path resolved at call time, limit:0 edge case fixed.

## v3.2.0 — 2026-03-23

### New
- [new] Health badges on crew character cards (red dot for broken links, amber for unused knowledge). Real-time from `/api/system/health` endpoint.
- [new] Graph tab in CharDetailDrawer: per-character ReactFlow diagram showing skills, knowledge files, and schedules with orthogonal edges and diagnostic coloring.
- [new] `/api/system/health`: lightweight per-character health summary (broken, unused, skill/knowledge/schedule counts).
- [new] `/api/system/graph/detail`: detailed node info (skill procedure steps, character config, knowledge preview, last run data).

### Fixes
- [fix] LogsTab timestamps now show dates: "yesterday 19:03" or "22 Mar 19:03" for older entries.
- [fix] Evening-tasks summary shows first meaningful line of each character's response instead of just task counts.
- [fix] System health scanner aligned with graph API (same regex patterns, same exclusion list).
- [fix] Gemini spend cap: daily Deep Research curiosity scan disabled. Weekly scholar-educate only.

### Pipeline
- [improved] Playwright replaced with Chrome DevTools MCP connecting to Dia browser on port 9222. No more zombie Chromium processes.
- [improved] WhatsApp context captures grouped under one parent node per scan instead of separate day-page nodes.

## v3.1.0 — 2026-03-23

### New
- [new] Style gate: post-processing filter on all scheduled job outputs catches AI writing tropes before they reach the user. Uses Sonnet single-turn pass with rules from CLAUDE.md + tropes reference file. Fail-open design.
- [new] Internal agent badges in crew FocusPanel (Prober, Auditor, Engineer, Watcher shown as mini-pills)
- [new] Internal agents filtered from chat tab picker and character grid

### Fixes
- [fix] LogsTab dedup bug: scheduler job results now use jobId:timestamp key instead of jobId alone, so repeated runs of the same job appear correctly
- [fix] Morning brief email disabled (redundant with Coach morning WhatsApp)

### Pipeline
- [improved] Morning pipeline reordered: Kybernetes context (07:12) runs before Coach morning (07:18), so Coach reads fresh verified data
- [improved] Style gate integrated into spawnAndCollect (all scheduled jobs) and Gmail pipeline draft replies

## v3.0.1 — 2026-03-22

### Fixes
- [fix] API envelope unwrap in all component fetch calls (rawResult.ok check before unwrap)
- [fix] Task names stripped of Tana "show field in name" suffixes (assigned, status, priority labels)
- [fix] Task counter moved inline with filter chips (no wasted row)
- [fix] Inbox archive and delete buttons restored
- [fix] Project-level permissions for spawned character sessions

### System
- [new] Triple backup system for agent files (git hook + daily cron + iCloud sync)
- [new] Recovery script on Desktop for ~/.claude/ wipe recovery
- [new] Gmail labels and filter XML for AI character emails (AI/Coach, AI/Curator, AI/Kybernetes, AI/Oracle, AI/Doctor, AI/Architect, AI/Watcher)

## v3.0.0 — 2026-03-20

### Architecture
- [new] Shared type system: `types/index.ts` (client) and `types/server.ts` (server) replace 50+ inline definitions
- [new] Custom hooks library: `useFetchAPI`, `useLocalStorage`, `useBusy`, `useInterval`, `useClickOutside`
- [new] Shared UI components: Modal (accessible, focus trap), Spinner, EmptyState, Led, WidgetErrorBoundary
- [new] API helpers: `apiOk`, `apiError`, `apiStream`, `requireFields`, `captureError` standardize all 42 routes
- [new] Design token system: spacing (6-step), typography (7-step), radius, shadow, transition variables
- [new] Error boundaries wrap every widget. One crash no longer takes down the dashboard.

### Component Decomposition
- [improved] ChatWidget (2007 lines) split into ChatPanel, ChatMessage, ChatMarkdown, ChatForm, ChatToolOutput, helpers
- [improved] CrewWidget (1415 lines) split into CrewPanel, CharacterGrid, SchedulesTab, ProcessesTab, LogsTab, ProposalsTab
- [improved] TasksWidget (1291 lines) split into TasksPanel, TaskList, ProjectsTimeline, ClassesTab
- [improved] CalendarWidget (1007 lines) split into CalendarPanel, ListView, WeekView, MonthView, helpers
- [improved] InboxWidget (653 lines) split into InboxPanel, EmailItem, SummaryPanel, ReplyPanel, TaskPanel
- [improved] StatusBar (557 lines) split into StatusBar, HealthDropdown, ChangelogModal, BugReportModal
- [improved] Pipeline components absorbed into crew/ directory

### Lib
- [improved] `lib/tana.ts` (1242 lines) split into `lib/tana/` with client, queries, mutations, routing, cache modules
- [improved] `buildColorMatcher` replaces 3 duplicated color-pattern functions
- [improved] Tana ID maps consolidated to single source of truth (tana-schema.ts)
- [fix] Task names stripped of Tana "show field in name" suffixes (assigned, status, priority)

### Design
- [improved] All CSS classes migrated to design token variables
- [improved] Inline styles replaced with utility CSS classes across all components
- [fix] Task counter moved inline with filter chips (no wasted row)

### Tests
- [new] Vitest test infrastructure with 55 tests across 5 files
- [new] Unit tests: buildColorMatcher, requireFields, validateName, date formatting, urgency
- [new] Hook tests: useLocalStorage
- [new] Component tests: Modal (open/close, Escape, backdrop click, aria)

### Documentation
- [new] Engineer operations guide: directory map, patterns, procedures
- [new] Architect operations guide: schema flow, character ecosystem, consistency rules

## v2.0.0 — 2026-03-19

### Gmail Pipeline (new architecture)
- [new] Event-driven email processing replaces 3x daily Postman scans
- [new] 5-stage pipeline: filter -> character reply -> classify (Gemini Flash-Lite) -> route (Gemini Flash) -> execute
- [new] Character reply detection: replies to [Tutor], [Coach], etc. route directly without classification
- [new] Tana task creation with semantic search dedup (supertag CLI, 28K embeddings)
- [new] Thread-aware dedup prevents duplicate tasks from email follow-ups
- [new] Pipeline log API (/api/pipeline/log) with per-stage timing and decisions
- [new] 5-minute cron polling replaces crontab scan jobs
- [retired] 3 postman-deliver cron jobs (pipeline handles drafts directly)

### Gemini Integration
- [new] Gemini API client (Flash-Lite, Flash, Pro models)
- [new] Deep Research integration for Scholar (async, 5-20 min reports with citations)
- [new] Deep Research action button on Scholar card (direct API call, no Claude session)
- [new] Results saved as markdown to ~/Desktop/Scholar/deep-research/

### Dashboard
- [new] Process monitor tab (appears when processes running, stop buttons, live elapsed time)
- [new] Design Plans browser in Proposals tab (expand, preview, copy path)
- [new] SharedDataProvider eliminates 7 redundant API calls per page load
- [new] endpoint + autonomousInput action type for direct API calls with user input
- [fix] Stale unread counts update immediately on archive/delete
- [fix] Character colors consolidated across 3 source files
- [fix] force-dynamic on all 28 GET routes (prevents cached responses in production)
- [fix] Removed dead /api/action route and Google Tasks health stub

### Scheduler
- [fix] handleProcessTasks now calls markJobRun (stopped evening-tasks from re-firing 10x/day)
- [fix] Task dedup blocklist injected into all scheduled job prompts
- [fix] markJobRun preserves startedAt field instead of discarding

### System
- [new] Semantic search via supertag CLI for server-side dedup (lib/semantic-search.ts)
- [new] Tana re-indexed from fresh export (188K nodes, 28K embeddings)
- [fix] Doctor skill reconciled with REPORT EMAIL RULE
- [fix] Doctor and Tutor Tana IDs added to schema and pipeline

## v1.9.0 — 2026-03-18

### Crew
- [new] "Processes" tab shows all active Claude CLI processes with character icon, elapsed time, and stop button
- [new] Live polling (3s) with badge count when processes are running

### Proposals
- [new] "Design Plans" section lists spec and plan files from docs/superpowers/
- [new] Expand to preview content, copy file path for use in Claude Code sessions

### Scheduler
- [fix] process-tasks jobs (evening-tasks) now correctly mark completion, preventing catch-up from re-firing them repeatedly

## v1.8.1 — 2026-03-18

### Crew
- [new] Proctor "Summary" action generates cumulative course PDF summaries with incremental fragment caching

### System
- [new] Crontab sync script (scripts/sync-crontab.py)
- [fix] .superpowers/ added to .gitignore

## v1.8.0 — 2026-03-18

### Proposals
- [new] System-wide proposal engine with 7 types (strategic, pattern, rebalance, schedule, skill-edit, cleanup, automation)
- [new] Proposals grouped by type with section headers, priority badges (red/amber dots), source character icons
- [improved] Approve creates a Tana task for Engineer instead of auto-applying edits
- [new] Dismiss memory prevents re-proposals for 30 days

### Crew
- [new] Per-character Tasks button fetches assigned tasks and runs character autonomously (100 max turns)
- [new] Tutor character added (Sprout icon, lime color, Personal group)
- [new] "Personal" group in schedule tab for Tutor jobs
- [improved] Task completion uses checkbox (check_node) instead of status field
- [improved] Ad-hoc spawns accept maxTurns override from client

### Scheduler
- [new] sync-crontab.py script generates crontab from config
- [fix] Installed all 28 scheduled jobs (only 4 were in crontab previously)

### Widgets
- [improved] Auto-refresh every 10 minutes for Tasks, Inbox, and Classes widgets

## v1.6.3 — 2026-03-15

## v1.6.2 — 2026-03-15

### Dashboard
- [fix] Action buttons now align with text content in Inbox, Calendar, and Tasks widgets
- [fix] Standardized row padding (8px 14px) and gap (8px) across all list widgets
- [fix] Removed fixed-width date columns for consistent spacing
- [fix] Minimum font size raised to 8px across Calendar week/month views
- [new] Design direction mockups added to docs/mockups/ (warm control, dense colorful, refined, clean)

## v1.6.1 — 2026-03-15

### Crew
- [new] Filter labels on crew widget: All, Research, Teaching, Admin, Personal, System
- [improved] Characters can appear in multiple filters (e.g. Scribe in Research + Teaching)
- [improved] Crew order by interaction frequency (work characters first)
- [new] Scholar "Solve" action: run solvers + Auditor on existing routes/questions
- [new] LCoT pipeline supports step-by-step mode (decompose, solve, synthesize independently)

### Dashboard
- [improved] Updated screenshots

## v1.6.0 — 2026-03-14

### Crew
- [new] 2 new characters: Prober (question decomposition, Crosshair icon, cyan) and Auditor (validation, Scale icon, emerald)
- [new] Scholar gains "Investigate" action for running the LCoT reasoning pipeline
- [new] Curator gains "Investigate" action for art practice reasoning chains

### Examples
- [new] Prober and Auditor example character configs in `examples/characters/`
- [improved] Scholar example updated with LCoT pipeline integration (canSpawn, Investigate action, lcot-orchestrate skill)

### Dashboard
- [new] Icons registered: Crosshair, Scale, FlaskConical, BarChart
- [new] Prober and Auditor in char-icons registry and tana-schema character map

## v1.5.2 — 2026-03-14

## v1.5.1 — 2026-03-14

### Scheduler
- [fix] Catch-up skips in-progress jobs: `startedAt` persisted to job-state.json on run start, catch-up ignores jobs started within last 15 minutes (survives process restarts unlike in-memory dedup)

## v1.5.0 — 2026-03-14

### Scheduler
- [fix] Backend dedup guard in `/api/schedule/run`: same jobId rejected with 409 within 10s window, prevents double-spawn from rapid crontab firing

### Crew
- [new] Kybernetes added to crew widget order, char-icons registry (Compass icon, indigo), and tana-schema

### Dashboard
- [fix] Added `Pen` and `RotateCcw` to icon-map for character action icons

## v1.4.0 — 2026-03-14

### Crew
- [new] 5 new characters: Scribe (writing), Archivist (data maintenance), Steward (time management), Watcher (monitoring), Engineer (implementation)
- [new] Inter-character spawning via `/api/spawn` endpoint. Characters can delegate tasks to each other mid-session.
- [change] Skills migrated to new owners: calendar/scheduling to Steward, CV/exhibition/cleanup/concept-scan to Archivist, batch-ops to Archivist, watcher to Watcher, build to Engineer
- [change] Scholar quality and style enforcement moved to Scribe (spawned on demand)

### Dashboard
- [new] Icons and colors for all 5 new characters in crew widget
- [change] CrewWidget ordering updated for expanded 14-character roster
- [change] Schedule/calendar task assignments routed to Steward
- [change] Inbox schedule action defaults to Steward

### Chat
- [fix] Removed dead changelog button (endpoint was deleted)

### API
- [new] `POST /api/spawn` for inter-character task delegation with depth limits and permission checks
- [remove] `POST /api/release` (unused since changelog button removal)

## v1.3.1 — 2026-03-14

## v1.3.0 — 2026-03-14

### Projects Tab
- [new] Phase dates parsed from Tana (supports "Week N" and "Week N to Week M" formats)
- [new] Timeline bars use actual phase dates instead of status-based grouping
- [fix] Phases without dates show in the list but render no bar

### Dashboard
- [fix] StatusBar hydration mismatch (server vs client Date)
- [change] Relative date labels now three letters (Tod, Tom, Yes)
- [change] Changelog modal filters out internal system sections
- [change] Changelog cleaned up (public entries only, system entries moved to private file)

### Chat
- [fix] Queue messages no longer duplicate when sent
- [fix] Icon and date spacing in inbox widget

## v1.2.0 — 2026-03-13

### Projects Tab
- [new] Projects tab in TasksWidget showing all active projects with phase pipeline bars, health indicators, and last activity
- [new] Projects grouped by deadline month with "Ongoing" for no-deadline projects
- [new] Health dots: green (active), amber (approaching deadline or stalling), red (overdue or stalled 14+ days)

## v1.1.23 — 2026-03-13

### Dashboard
- [fix] Widget buttons ("Prep done", "Lesson done") now only check boxes instead of opening chat

### Chat
- [fix] Chat now scrolls to the end when opened or switched to
- [fix] Flag button now shows confirmation feedback with check icon after successful flag

### Inbox
- [fix] Go button now works the email directly instead of extracting tasks

## v1.1.22 — 2026-03-12

### Scheduler
- [new] Missed-job catch-up: persists lastRunAt per job, dashboard checks on mount and runs overdue jobs automatically

### Classes
- [fix] "Check all" now checks all items (prep + post-lesson), not just prep items

### Chat
- [fix] Bold text no longer gets underlined
- [new] Flag button in chat header toolbar

## v1.1.21 — 2026-03-12

### Chat
- [fix] Auto-scroll no longer drags you back to input while reading
- [fix] Images from previous messages are now included when sending history to Claude
- [fix] Quick-reply character-switching now requires explicit navigation prefix
- [fix] StrictMode abort race: delayed unmount abort by 50ms

## v1.1.20 — 2026-03-12

### Dashboard
- [new] Gmail-style right-aligned dates across all widgets
- [new] Time-of-day icons in Calendar with colored indicators
- [fix] Priority dropdown moved from task row to action bar
- [fix] Task filter chip borders softened
- [fix] Chat input bar vertical alignment fixed
- [fix] Priority dropdown overflow fixed

## v1.1.19 — 2026-03-12

### Dashboard
- [new] Relative dates in temporal column (Today/Tomw/Yest labels)
- [new] Character Keywords tab is now interactive (add/remove from drawer)
- [fix] Reschedule button moved from task row inline to action bar
- [fix] Crew icon routing fixes

## v1.1.17 — 2026-03-11

### Dashboard
- [new] Fixed-width left temporal column across all panels
- [new] Priority dropdown hidden by default, appears on task row hover
- [new] 30-day cutoff filter for tasks
- [fix] Chat tab sizing increased
- [fix] Curator color changed from red to rose
- [fix] Added curator and proctor to char-icons registry

## v1.1.16 — 2026-03-11

### Dashboard
- [fix] Unified date format across all panels
- [fix] Inbox date format simplified to "Mar 10"
- [fix] Calendar month added for clarity at month boundaries
- [fix] Tasks: pill badges replaced with colored dot + text system
- [fix] Classes: weekday dropped, dot system uses shared urgency utility

## v1.1.15 — 2026-03-11

### Chat
- [new] Slash command skill picker (type `/` to search 53 skills)
- [new] Injected skills work with any character
- [fix] Textarea drag resize now works

### Proposals
- [fix] Approve now applies the diff to the skill file
- [new] Auto-apply for proposals without `needsReview: true`
- [new] Toast notifications for auto-applied and manually approved proposals

### Classes
- [fix] Class date display uses dot indicator
- [fix] Date parsing uses local timezone instead of UTC
- [fix] Checklist parser skips template container nodes

## v1.1.14 — 2026-03-08

### Chat
- [fix] Concurrent chat limit raised from 2 to 4
- [fix] Tab count limit removed from Plus button
- [new] Architect send-to button now opens a context input
- [new] Message queue (type while AI works, messages auto-fire in order)

## v1.1.13 — 2026-03-08

### Chat
- [fix] Typing in one chat tab and switching to another no longer clears unsubmitted input

## v1.1.12 — 2026-03-08

### Scholar
- [new] Intent-based skill routing (keyword map, only matching skill loaded)
- [new] Multi-shot revision loop (up to 3x auto-revision before user sees output)

## v1.1.11 — 2026-03-07

### Scholar
- [new] Auto-critic: detects `[DRAFT-COMPLETE]` marker, fires review against binary criteria
- [new] Three verdict paths: PASS, REVISE, REWRITE

## v1.1.10 — 2026-03-07

### Architect
- [new] Release action button and release script
- [new] "release patch" suggestion chip

## v1.1.9 — 2026-03-07

### Schedules
- [new] Pencil button on job rows to view and edit seed prompts
- [new] Edits persist in `data/job-overrides.json`

## v1.1.8 — 2026-03-07

### Scholar
- [new] "Concept Scan" autonomous action

## v1.1.7 — 2026-03-06

### Chat
- [fix] Form blocks now render free-text textarea for questions without options

## v1.1.6 — 2026-03-05

### Scholar
- [new] "Add Publication" pill with auto-citation formatting

### Chat
- [new] Italic, strikethrough, blockquote rendering
- [fix] Font loading fixed
- [new] Resizable textarea in chat input

### Tasks
- [fix] Task dates updated in Tana now reflect immediately

### Logs
- [new] Scheduled job runs now appear in the Logs tab

## v1.1.5 — 2026-03-04

### Scheduler
- [new] macOS crontab installed for all 11 recurring jobs

## v1.1.4 — 2026-03-04

### Tasks
- [fix] Trashed Tana nodes no longer appear in task list

## v1.1.3 — 2026-03-04

### Dashboard
- [new] Character-switching quick-replies
- [new] Renameable chat tabs
- [new] Version badge reads from CHANGELOG.md dynamically

## v1.1.2 — 2026-03-04

### Dashboard
- [new] Knowledge files in character drawer are now clickable
- [new] Skills tab in character drawer
- [new] Character drawer opens inside widget area (contained mode)
- [fix] Chat messages with `##` or `---` no longer misclassified as "thinking"

## v1.1.1 — 2026-03-04

### Dashboard
- [new] "Lesson done" button on today's class card
- [new] Clicking it checks all remaining prep items and opens Proctor

## v1.1.0 — 2026-03-04

### Dashboard
- [new] Classes widget with interactive prep checklists
- [new] Interactive checkboxes toggle Tana todo nodes
- [new] Progress bar per class session, course pill, day-until badge
- [new] Layout: Chat moved to single column to make room for Classes

## v1.0.11 — 2026-03-03

### Dashboard
- [new] Character detail drawer (skills, keywords, knowledge, memory)
- [new] Schedules tab in crew widget
- [new] Logs and proposals tabs in crew widget
- [new] Today/week filter chips in tasks widget
- [new] Image paste support in chat
- [new] Icons on all widget headers
- [new] Scheduled tasks with datetime, auto-run on mount

## v1.0.10 — 2026-03-03

### Dashboard
- [improved] Schedules moved from pipeline sidebar to dashboard

## v1.0.9 — 2026-03-03

### Chat
- [new] Suggestion chips in empty chat state

## v1.0.8 — 2026-03-02

### Tasks
- [fix] In-progress tasks no longer show in all priority tabs

## v1.0.7 — 2026-03-02

### Tasks
- [fix] Prevent done/deleted tasks from reappearing

## v1.0.5 — 2026-03-01

### Dashboard
- [new] Context-aware action buttons with toggle dot
- [new] Miro MCP added to service health bar

## v1.0.0 — 2026-02-28

### Chat
- [new] Pulsing avatar indicator while character is thinking

### Dashboard
- [new] Home page with CrewWidget, ChatWidget, TasksWidget, InboxWidget
- [new] API routes for characters, tasks, dispatch, chat
- [new] Skills reader, shared knowledge loader, prompt builder

### Pipeline
- [new] SystemGraph as ReactFlow canvas with spatial layout
- [new] Character, Postman, and Schedule node components
