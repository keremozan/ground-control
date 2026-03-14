# Changelog

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
