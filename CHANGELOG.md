# Changelog

## v1.0.2 — 2026-02-28

### New
-  auto-generate changelog from git tags and commits

### Fixed
-  increase schedule widget text size and raise chat max turns to 50
-  show date in schedule last-run when not today

## v1.0.1 — 2026-02-28

### New
-  config-driven calendar event colors

### Fixed
-  restore proctor/curator colors for config-driven patterns
-  update clone URL to actual repo

### Changed
-  use hex colors as keys in all pattern configs

## v1.0.0 — 2026-02-28

### New
-  pulsing avatar indicator while character is thinking
-  switch to orthogonal step edges with offset separation
-  rework layout to structured spatial grid matching wireframe
-  rewrite SystemGraph as ReactFlow canvas with spatial layout
-  add SystemConfigDrawer slide-out panel
-  add CharacterNode with full expand/edit functionality
-  add PostmanNode and ScheduleNode components
-  add leaf node components — Source, Output, TanaTag, Group
-  add custom FlowEdge component with character color
-  add dagre layout builder with localStorage position persistence
-  install reactflow + dagre, add shared types
-  home page assembled with real backend
-  API routes (characters, tasks, task dispatch, chat, action)
-  task definitions + SSE spawn helper
-  skills reader, shared knowledge loader, prompt builder
-  character singleton loader

### Fixed
-  chat loading indicator not showing on triggered messages
-  clean up SystemGraph layout + fix ghost chat stopped message
-  use unique key for schedule items in CharacterNode
-  restore original TasksWidget with personal tasks
-  add character colors, rename status bar brand

### Other
- v1.0.0 — Initial public release
- wire: CrewWidget, ChatWidget, TasksWidget, InboxWidget to real APIs
- port: home components, chat-store, mock-data, useSSE hook from prototype
- port: css, layout, char-icons from prototype
- scaffold: next.js 15 project
- plan: ground-control implementation plan (21 tasks)
- Add ground-control design doc

