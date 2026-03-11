# Changelog

## v1.1.15 — 2026-03-11

### Chat
- [new] Slash command skill picker. Type `/` in chat input to search and select from all 53 skills. Skills load dynamically from skill files.
- [new] Injected skills work with any character. Select `/scholar-write` in Architect and it loads the full skill into the prompt context.
- [fix] Textarea drag resize now works. Custom upward drag handle above the input area (34px to 240px range).

### Proposals
- [fix] Approve now applies the diff to the skill file (was only removing from list).
- [new] Auto-apply. Proposals without `needsReview: true` are applied automatically on load. Only flagged proposals surface in the widget.
- [new] Toast notifications for auto-applied and manually approved proposals.

### Classes
- [fix] Class date display uses dot indicator + formatted date instead of "TODAY"/"3d" badges
- [fix] Date parsing uses local timezone instead of UTC (no more off-by-one day shifts)
- [fix] Checklist parser skips template container nodes (e.g. "prep tasks" wrapper)
- [fix] Auto-attach checklist guards against supertag-created containers

## v1.1.14 — 2026-03-08

### Chat
- [fix] Concurrent chat limit raised from 2 to 4, tooltips updated
- [fix] Tab count limit removed from Plus button. Open as many tabs as you want, only concurrent runs are capped at 4.
- [new] Architect send-to button now opens a context input. Add optional notes before forwarding a conversation.
- [new] Message queue. Type while AI works, messages auto-fire in order. Dismissible pills show queued messages. Stop button clears the queue.

## v1.1.13 — 2026-03-08

### Chat
- [fix] Typing in one chat tab and switching to another no longer clears unsubmitted input — tabs stay mounted, input state preserved

### Changelog
- [new] `CHANGELOG.private.md` (git-ignored) for personal system entries (skills, characters, Tana schema) — use `[sys]` label
- [new] Dashboard changelog merges public + private entries; `[sys]` items shown with purple dot
- [new] `release.sh` also prepends next version header to private changelog

## v1.1.12 — 2026-03-08

### Scholar
- [fix] PROSE GATE changed from declaration ("Gate cleared") to enumeration — model must quote each found instance per pattern before outputting
- [new] Intent-based skill routing for Scholar — first message detected via keyword map, only matching skill loaded (drops ~80% of prompt on focused sessions)
- [new] Multi-shot revision loop — Scholar drafts silently revised up to ×3 before reaching the user; only final version shown with "(auto-revised ×N)" note
- [new] `buildRevisionBasePrompt()` in `lib/prompt.ts` — minimal Scholar context (system prompt + modifiers) for revision passes without MCP or full skill set

## v1.1.11 — 2026-03-07

### Scholar
- [new] Auto-critic: Scholar's chat stream is now wrapped with auto-review — detects `[DRAFT-COMPLETE: type]` marker, fires a second `spawnOnce` call against binary criteria in `scholar-text-types.md`, injects verdict before the `done` event
- [new] `spawnOnce` in `lib/spawn.ts` — minimal single-turn spawn without MCP, used for critic calls (fast, no tool access)
- [new] Three verdict paths: PASS (0–1 failures, output as-is), REVISE (2–3 failures, targeted fixes), REWRITE (4+ or Criterion 1 fail, suppress draft, new angle, re-evaluate)

## v1.1.10 — 2026-03-07

### Architect
- [new] `scripts/release.sh` — tags current CHANGELOG version, syncs package.json, commits, prepares next version header
- [new] `npm run release [patch|minor]` script added to package.json
- [new] Architect "Release" action button — autonomous, runs release script from Crew widget
- [new] "release patch" suggestion chip added to Architect

## v1.1.9 — 2026-03-07

### Schedules
- [new] Pencil button on each recurring job row — click to view and edit the job's seed prompt
- [new] Edits persist in `data/job-overrides.json` and are used on next run
- [new] `GET/PATCH /api/schedule/jobs` endpoint for reading and saving job command overrides
- [new] Edited job button shown with character color tint to indicate an active override

## v1.1.8 — 2026-03-07

### Scholar
- [new] "Concept Scan" autonomous action — links recent day-page notes to matching concept nodes in knowledge base

## v1.1.7 — 2026-03-06

### Chat
- [fix] Form blocks now render free-text textarea for questions without `:: options` syntax, instead of silently dropping them and showing only Submit

## v1.1.6 — 2026-03-05

### Scholar
- [new] "Add Publication" pill — type a title, Scholar web-searches, formats APA citation, auto-detects book vs article, fills all fields (author, year, concept, track, status) and creates node in Tana Library

### Chat
- [new] Italic (`_text_`), strikethrough (`~~text~~`), blockquote callout (`> text`) rendering
- [fix] Font loading via `next/font` only — removed duplicate Google Fonts import that broke Bricolage Grotesque
- [fix] Architect "send to" button uses Wrench icon (not Bug)
- [new] Resizable textarea in chat input — drag corner to expand, works in all context inputs

### Tasks
- [fix] Task dates updated in Tana now reflect immediately — removed stale search-index date filter

### Logs
- [new] Scheduled job runs (cron) now appear in the Logs tab — injected from job results file

### Watcher
- [fix] Log truncation now explicit — watcher clears tiny-log.jsonl after each run so entries aren't re-processed

## v1.1.5 — 2026-03-04

### Scheduler
- [new] macOS crontab installed for all 11 recurring jobs + 15-min one-off task checker
- [fix] Scheduled jobs now actually fire automatically (previously required manual trigger)

## v1.1.4 — 2026-03-04

### Tasks
- [fix] Trashed Tana nodes no longer appear in task list — `getTanaTasks()` and `getTanaPhases()` now filter `inTrash: true` nodes

### Postman
- [fix] WhatsApp scan dedup now ignores trashed nodes — a task in trash no longer blocks creation of a new task for the same item

## v1.1.3 — 2026-03-04

### Dashboard
- [new] Character-switching quick-replies — clicking a quick-reply that mentions a character opens a new tab with that character and passes conversation context
- [new] Renameable chat tabs — double-click a tab name to edit inline, persists in localStorage
- [new] Version badge now reads from CHANGELOG.md dynamically (no more package.json mismatch)
- [fix] Removed unused Home nav button from status bar
- [fix] Status bar spacing after Home button removal

## v1.1.2 — 2026-03-04

### Dashboard
- [new] Knowledge files in character drawer are now clickable — fetches content and opens in editor modal
- [new] Skills tab in character drawer — each skill is clickable, opens editor with Save button
- [fix] Knowledge/skill file editor now delays mounting until content is fetched (was showing empty on click)
- [new] Character drawer opens inside widget area (contained mode) instead of full-page overlay
- [fix] Chat messages with `##` or `---` markers no longer misclassified as "thinking" if content is real prose

## v1.1.1 — 2026-03-04

### Dashboard
- [new] "Lesson done →" button appears on today's class card in Classes tab
- [new] Clicking it checks all remaining prep items in Tana, then opens Proctor in chat with "lesson done, [class name]" pre-filled
- [new] `/api/class-prep/lesson-done` POST endpoint — reads class node, checks unchecked prep items
- [new] `checkRemainingPrepItems()` in lib/tana.ts — bulk-checks prep group todos

## v1.1.0 — 2026-03-04

### Dashboard
- [new] Classes widget — shows upcoming #class nodes (next 14 days) with interactive prep checklists
- [new] Interactive checkboxes toggle Tana todo nodes via check_node/uncheck_node
- [new] Progress bar per class session, course pill (VA 204 / VA 315), day-until badge
- [new] Prep and post-lesson groups collapsible independently
- [new] Layout: Chat moved from span-2 to single column to make room for Classes

### API
- [new] `GET /api/class-prep` — fetch upcoming #class nodes with checklists from Tana
- [new] `POST /api/class-prep/toggle` — toggle a class checklist todo node

### Tana lib
- [new] `getClassNodes()` — search #class nodes, parse markdown, extract checklist items
- [new] `toggleClassItem()` — wrap check_node / uncheck_node for class prep todos
- [new] `classTags` and `classFields` added to tana-schema.ts

## v1.0.11 — 2026-03-03

### Dashboard
- [new] character detail drawer — skills, keywords, knowledge, memory accessible from crew cards
- [new] detail button on crew cards opens character detail drawer
- [new] schedules tab in crew widget — recurring jobs, pending tasks, run full cycle
- [new] logs and proposals tabs in crew widget (embedded, no double headers)
- [new] today/week filter chips in tasks widget alongside priority filters
- [new] image paste support in chat — paste images, preview thumbnails, send to characters
- [new] icons on all widget headers (Tasks, Chat, Calendar, Inbox, Crew)
- [new] scheduled tasks — one-time tasks with datetime, auto-run on mount + every 15min
- [improved] crew widget header uses tab navigation only, no redundant title

### Scheduled Tasks
- [new] `POST /api/schedule/tasks` — create a one-time scheduled task
- [new] `GET /api/schedule/tasks` — list pending tasks
- [new] `DELETE /api/schedule/tasks?id=` — remove a task
- [new] `POST /api/schedule/tasks/check` — find and run overdue tasks
- [new] `lib/scheduled-tasks.ts` — type definitions and file I/O

### Pipeline
- [removed] pipeline page — all functionality moved to dashboard

## v1.0.10 — 2026-03-03

### Dashboard
- [improved] move schedules from pipeline sidebar to dashboard page, below crew grid

## v1.0.9 — 2026-03-03

### Chat
- [new] suggestion chips in empty chat state — character-specific tasks shown as clickable pills
- [new] first-message logging to tiny-log for watcher-driven suggestion mining

### Characters
- [new] suggestions field added to all 8 character configs (clerk, proctor, scholar, curator, coach, postman, architect, oracle)

## v1.0.8 — 2026-03-02

### Tasks
- [fix] stop showing in-progress tasks in all priority tabs

### General
- [fix] sync package.json version from git tag in changelog script
- [fix] server-side exclusion tracking for deleted/done tasks

## v1.0.7 — 2026-03-02

### Sync
- [fix] prevent done/deleted tasks from reappearing

## v1.0.6 — 2026-03-02

### Sync
- [fix] cross-platform task sync reliability

### General
- [fix] changelog script compat with macOS zsh

## v1.0.5 — 2026-03-01

### General
- [new] add Google Tasks sync for Tana tasks

## v1.0.4 — 2026-03-01

### General
- [new] context-aware action buttons with toggle dot
- [fix] Miro health check, bug button prompt, chat max-turns, and Miro icon
- [new] add Miro MCP to service health bar
- [fix] update dashboard changelog parser for badge format

## v1.0.3 — 2026-02-28

### General
- [new] use colored badge labels in changelog
- [fix] add emoji labels to changelog and skip empty unreleased section

## v1.0.2 — 2026-02-28

### General
- [fix] increase schedule widget text size and raise chat max turns to 50
- [fix] show date in schedule last-run when not today
- [new] auto-generate changelog from git tags and commits

## v1.0.1 — 2026-02-28

### General
- [improved] use hex colors as keys in all pattern configs
- [fix] restore proctor/curator colors for config-driven patterns
- [new] config-driven calendar event colors
- [fix] update clone URL to actual repo

## v1.0.0 — 2026-02-28

### Chat
- [new] pulsing avatar indicator while character is thinking

### Pipeline
- [new] switch to orthogonal step edges with offset separation
- [new] rework layout to structured spatial grid matching wireframe
- [new] rewrite SystemGraph as ReactFlow canvas with spatial layout
- [new] add SystemConfigDrawer slide-out panel
- [new] add CharacterNode with full expand/edit functionality
- [new] add PostmanNode and ScheduleNode components
- [new] add leaf node components — Source, Output, TanaTag, Group
- [new] add custom FlowEdge component with character color
- [new] add dagre layout builder with localStorage position persistence
- [new] install reactflow + dagre, add shared types

### General
- v1.0.0 — Initial public release
- [fix] chat loading indicator not showing on triggered messages
- [fix] clean up SystemGraph layout + fix ghost chat stopped message
- [fix] use unique key for schedule items in CharacterNode
- [fix] restore original TasksWidget with personal tasks
- [fix] add character colors, rename status bar brand
- [new] home page assembled with real backend
- CrewWidget, ChatWidget, TasksWidget, InboxWidget to real APIs
- home components, chat-store, mock-data, useSSE hook from prototype
- [new] API routes (characters, tasks, task dispatch, chat, action)
- [new] task definitions + SSE spawn helper
- [new] skills reader, shared knowledge loader, prompt builder
- [new] character singleton loader
- css, layout, char-icons from prototype
- next.js 15 project
- ground-control implementation plan (21 tasks)
- Add ground-control design doc

