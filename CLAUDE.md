# Ground Control

Real dashboard for Kerem's agent system. Next.js 15, localhost:3000.

## Key paths
- API routes: `app/api/`
- Lib layer: `lib/` (characters, skills, prompt, tasks, spawn)
- UI components: `components/home/`, `components/pipeline/`
- Design doc: `docs/plans/2026-02-23-ground-control-design.md`

## Adding a task
1. Add entry to `lib/tasks.ts` TASKS map
2. That's it — it appears in TasksWidget automatically

## Adding a character
Character configs live in `~/.claude/characters/`. The dashboard reads them at runtime — no code change needed.

## Pipeline page (phase 2)
See `docs/plans/` for pipeline design. Wire `lib/pipeline-data.ts` to real character roster from `/api/characters`.
