# Changelog

## v1.0.11 — 2026-03-03

### Dashboard
- [new] character detail drawer — skills, keywords, knowledge, memory accessible from crew cards
- [new] detail button on crew cards opens character detail drawer
- [new] run full cycle button in crew widget footer
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

### System
- [new] watcher skill: suggestion mining section — auto-proposes chips from repeated first messages

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

