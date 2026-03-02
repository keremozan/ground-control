# Changelog

## v1.0.8 — 2026-03-02

### General
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

