# Changelog

## v1.0.4 — 2026-03-01

### Crew
- [new] Context-aware action buttons with toggle dot
- [fix] Bug button prompt behavior

### Status Bar
- [new] Miro MCP service health indicator
- [fix] Miro health check and icon

### Chat
- [fix] Max-turns limit raised

### Changelog
- [fix] Badge format parser update

## v1.0.3 — 2026-02-28

### Changelog
- [new] Colored badge labels in changelog
- [fix] Emoji labels and skip empty unreleased section

## v1.0.2 — 2026-02-28

### Changelog
- [new] Auto-generate changelog from git tags and commits

### Schedule
- [fix] Increase widget text size
- [fix] Show date in last-run when not today

### Chat
- [fix] Raise max turns to 50

## v1.0.1 — 2026-02-28

### Calendar
- [new] Config-driven event colors
- [fix] Restore proctor/curator colors for config-driven patterns

### Config
- [improved] Use hex colors as keys in all pattern configs
- [fix] Update clone URL to actual repo

## v1.0.0 — 2026-02-28

### Crew
- [new] Pulsing avatar indicator while character is thinking

### Pipeline
- [new] Orthogonal step edges with offset separation
- [new] Structured spatial grid layout matching wireframe
- [new] ReactFlow canvas with spatial layout
- [new] SystemConfigDrawer slide-out panel
- [new] CharacterNode with expand/edit functionality
- [new] PostmanNode and ScheduleNode components
- [new] Leaf node components (Source, Output, TanaTag, Group)
- [new] Custom FlowEdge with character color
- [new] Dagre layout with localStorage persistence
- [fix] SystemGraph layout and ghost chat stopped message
- [fix] Unique key for schedule items in CharacterNode

### Chat
- [fix] Loading indicator not showing on triggered messages

### Tasks
- [fix] Restore original TasksWidget with personal tasks

### Status Bar
- [fix] Character colors and brand rename

### Core
- [new] Home page assembled with real backend
- [new] API routes (characters, tasks, dispatch, chat, action)
- [new] Task definitions and SSE spawn helper
- [new] Skills reader, knowledge loader, prompt builder
- [new] Character singleton loader
- Wire all widgets to real APIs
- Port home components, chat-store, useSSE hook
- Port CSS, layout, char-icons
- Scaffold Next.js 15 project
