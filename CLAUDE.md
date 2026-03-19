# Ground Control

Agent system dashboard. Next.js 16, localhost:3000.

## Setup

New users: `npm install && npm run setup` — interactive wizard generates your config.

## Architecture

- **Characters** drive everything: `~/.claude/characters/{core,meta}/` JSON configs
- **Config**: `ground-control.config.ts` (git-ignored) holds secrets, scheduler jobs, Gemini API key
- **Dashboard** reads all data dynamically from APIs — no hardcoded character data in source
- **SharedDataProvider** fetches characters + config once, shared across all widgets
- **Gmail Pipeline**: event-driven email processing (Gemini classification, 5-min cron polling)
  - Stages: filter -> character reply detection -> classify (Flash-Lite) -> route (Flash) -> execute
  - Replaces Postman email scanning. Postman still handles WhatsApp, iCloud, Tana inbox.
- **Deep Research**: async Gemini research tasks, results saved to ~/Desktop/Scholar/deep-research/
- **Tana** is required (PKM layer). Other MCP servers (Gmail, Calendar, WhatsApp) are optional.
- **Semantic search**: supertag CLI with mxbai-embed-large embeddings. Re-export Tana monthly.

## Key paths

- API routes: `app/api/`
- Lib layer: `lib/` (characters, config, prompt, tana, spawn, scheduler, gmail-pipeline, gemini, semantic-search, deep-research)
- UI components: `components/home/`, `components/pipeline/`
- Examples: `examples/characters/` (sanitized templates)
- Config template: `ground-control.config.example.ts`
- Pipeline log: `data/pipeline-log.json` (500 entries, per-stage tracking)
- Deep Research state: `data/deep-research-state.json`

## Gmail Pipeline

Emails processed every 5 minutes via `/api/webhooks/gmail` (cron GET catch-up).

1. **Stage 0.5**: Skip self-sent system emails (Morning Brief, Tutor lessons) unless replies
2. **Stage 1**: Deterministic filter (newsletters, promos, categories) — no LLM, 0ms
3. **Stage 1.5**: Character reply detection (`Re: [Tutor Test]...` routes directly) — no LLM
4. **Stage 2**: Gemini Flash-Lite classification (actionable yes/no) — ~700ms
5. **Stage 3**: Gemini Flash routing (multi-action: task, opportunity, reply, event, escalate) — ~4s
6. **Stage 4**: Execute actions with dedup (thread check + semantic search via supertag CLI)

Pipeline does NOT archive filtered emails. Only explicit `archive` action from router removes emails.

## Adding a character

1. Create JSON config in `~/.claude/characters/{tier}/`
2. Follow schema from `examples/characters/` — needs name, tier, icon, color, actions, seeds
3. Dashboard picks it up automatically — no code changes needed
4. Add character to Tana assigned field options (for task assignment)
5. Add Tana option ID to `lib/tana-schema.ts` assignedOptions and `lib/gmail-pipeline.ts` ASSIGNED_MAP

## Adding an action with direct API call

Use `endpoint` + `autonomousInput` on an action in character JSON config:
```json
{ "label": "Action", "icon": "Globe", "endpoint": "/api/your-endpoint", "autonomousInput": true, "inputPlaceholder": "..." }
```
This opens an input field, then POSTs user input directly to the endpoint. No Claude session spawned.

## Config file

`ground-control.config.ts` is the single source of truth for:
- User identity (userName)
- Tana connection (workspace ID, MCP URL, token)
- Gmail/Calendar credentials paths
- Gemini API key
- Scheduler jobs
- UI color patterns (tracks, email, calendar) — all use hex color -> regex format

## Color patterns

All three widget color configs use the same format: `{ "#hexcolor": "regex pattern" }`

- `trackColorPatterns` — TasksWidget track left borders
- `emailColorPatterns` — InboxWidget email classification
- `calendarColorPatterns` — CalendarWidget event left borders

Patterns are served via `/api/system/config` and shared via SharedDataProvider.

## Character colors

Colors are defined in character JSON configs (`color` field). Three files must stay in sync:
- `lib/char-icons.ts` (client-side charColor map)
- `lib/characters.ts` (server-side CHARACTER_COLORS fallback)
- `app/globals.css` (@theme CSS variables)

JSON configs are the source of truth. If colors diverge, update all three files.

## Versioning

Semver with these thresholds:
- **Patch (1.1.x)**: fixes, refactors, UI tweaks
- **Minor (1.x.0)**: new widget, new character, new pipeline stage, new autonomous capability, any user-visible new feature
- **Major (x.0.0)**: architecture overhaul, breaking config changes

Do NOT manually edit the version in package.json. The release script handles it.

## Changelog rules

Two changelog files, one version number shared between them:

- **CHANGELOG.md** (public, committed to GitHub): Dashboard UI, chat, widgets, user-facing features only. What someone using Ground Control would care about.
- **CHANGELOG.private.md** (git-ignored): Agent system changes (skills, memory, routing, Tana schema, character configs, watcher fixes). Use `[sys]` label.

**Who writes:** Only the Architect "Release" action writes changelog entries. It reads `git diff` and categorizes entries into the correct file. Scheduled jobs (watcher, maintenance) must NEVER write to either changelog file. They log to `tiny-log.jsonl` and the Architect summarizes at release time.

**When to release:** After a working session that produced commits, click the Architect "Release" button. It will: read the diff since last release, write changelog entries, commit, and optionally tag+push.

## Git workflow

- GitHub: https://github.com/keremozan/ground-control
- `ground-control.config.ts`, `mcp-tasks.json`, `docs/plans/`, `data/`, `CHANGELOG.private.md` are git-ignored
- Use conventional commits: `feat:`, `fix:`, `refactor:`
- Release: Architect "Release" button, or manually `zsh scripts/release.sh [patch|minor]`

## Semantic search

Embeddings powered by supertag CLI (`~/Tools/supertag-cli/supertag`) with mxbai-embed-large model via Ollama.
- Sync daemon runs as launchd job (`com.supertag.sync`), checks for new Tana exports every 5 min
- Export Tana monthly (Settings > Export > JSON) to `~/Documents/Tana-Export/personal/`
- `lib/semantic-search.ts` calls supertag CLI for server-side dedup in the pipeline
- Characters access semantic search through the supertag MCP server in their MCP config
