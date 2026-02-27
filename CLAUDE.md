# Ground Control

Agent system dashboard. Next.js 15, localhost:3000.

## Setup

New users: `npm install && npm run setup` — interactive wizard generates your config.

## Architecture

- **Characters** drive everything: `~/.claude/characters/{core,meta}/` JSON configs
- **Config**: `ground-control.config.ts` (git-ignored) holds secrets, scheduler jobs, pipeline sources/outputs
- **Dashboard** reads all data dynamically from APIs — no hardcoded character data in source
- **Pipeline**: Sources → Postman → #post → Route → #task → Characters → Output → #log
- **Tana** is required (PKM layer). Other MCP servers (Gmail, Calendar, WhatsApp) are optional.

## Key paths

- API routes: `app/api/`
- Lib layer: `lib/` (characters, config, prompt, tana, spawn, scheduler)
- UI components: `components/home/`, `components/pipeline/`
- Examples: `examples/characters/` (sanitized templates)
- Config template: `ground-control.config.example.ts`

## Adding a character

1. Create JSON config in `~/.claude/characters/{tier}/`
2. Follow schema from `examples/characters/` — needs name, tier, icon, color, actions, seeds
3. Dashboard picks it up automatically — no code changes needed

## Adding a task

1. Add entry to `lib/tasks.ts` TASKS map
2. It appears in TasksWidget automatically

## Config file

`ground-control.config.ts` is the single source of truth for:
- User identity (userName)
- Tana connection (workspace ID, MCP URL, token)
- Gmail/Calendar credentials paths
- Scheduler jobs
- Pipeline sources and outputs
