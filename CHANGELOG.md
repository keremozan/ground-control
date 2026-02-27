# Changelog

## v1.0.1 — 2026-02-28

### [new] Config-driven calendar event colors
- CalendarWidget now reads color patterns from `calendarColorPatterns` in config
- Same pattern as TasksWidget and InboxWidget — hex color key, regex value

### [refactor] Hex colors as keys in all pattern configs
- `trackColorPatterns`, `calendarColorPatterns`, and `emailColorPatterns` all use the same format: hex color → regex pattern
- Removes dependency on charColor map — any hex color works without a matching character entry

## v1.0.0 — 2026-02-28

Initial public release.

### Dashboard
- 6-widget home page: Inbox, Calendar, Tasks, Chat, Crew, Quick Actions
- Real-time SSE streaming chat with multi-tab support
- Tool activity visibility (shows commands, files, patterns being processed)
- Context compression for long conversations
- Config-driven color coding for tasks and email classification

### Pipeline
- Visual flow graph: Sources -> Postman -> Characters -> Outputs
- Expandable character cards with routing keywords, skills, gates, memory
- Editable schedule pills on character cards
- Logs widget with clickable job results
- Run Full Cycle toolbar (3-phase: scan, check tasks, spawn characters)

### Characters
- JSON-driven character configs (no code changes needed)
- 6 example characters: Postman, Scholar, Clerk, Coach, Architect, Oracle
- Tiered system: core, meta, stationed
- Per-character memory, skills, knowledge, routing
- Model escalation (Haiku -> Sonnet -> Opus)

### Automation
- Scheduled jobs via macOS launchd
- 10 example jobs: email scans, task processing, reviews, maintenance, self-learning
- Self-evolving: nightly watcher reviews logs, fixes errors, writes memory lessons
- System maintenance: memory hygiene, skill verification, routing consistency

### Infrastructure
- 26 API routes
- Interactive setup wizard (`npm run setup`)
- Git-ignored config file with full schema template
- MCP server integration (Tana required, Gmail/Calendar/WhatsApp optional)
- Health monitoring for all connected services
