# Telegram Crew Channels

## Problem

Characters communicate with Kerem through scattered channels: WhatsApp self-messages for nudges and prompts, email for reports, and the dashboard for interactive sessions. This fragments the conversation history and mixes crew output with human messages.

## Goal

Each character gets a dedicated Telegram group. All crew-to-Kerem communication (reports, nudges, prompts, questions) posts there. Kerem writes in a character's group to give instructions, and the character responds in the same group. Telegram is exclusively for crew-Kerem interaction. No external communications through Telegram.

## Decisions

- One Telegram bot, one group per character
- Inbound: Kerem writes in a group, GC spawns that character's Claude session, response posts back
- Outbound: all crew-to-Kerem output (reports, nudges, prompts) posts to the character's group
- Replaces: WhatsApp self-messages and email reports to kerem.ozan@gmail.com
- Stays unchanged: WhatsApp scanning (Postman reads human chats), outbox pipeline (Gmail drafts for external people), Gmail pipeline

## Config

Add to `ground-control.config.ts`:

```ts
telegram: {
  botToken: string,        // from BotFather
  userId: number,          // Kerem's Telegram user ID (security filter)
  groups: Record<string, number>,  // charName -> group chat ID
}
```

Example:

```ts
telegram: {
  botToken: "7000000000:AAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  userId: 123456789,
  groups: {
    postman:    -1001234567001,
    scholar:    -1001234567002,
    coach:      -1001234567003,
    tutor:      -1001234567004,
    proctor:    -1001234567005,
    clerk:      -1001234567006,
    curator:    -1001234567007,
    archivist:  -1001234567008,
    kybernetes: -1001234567009,
    architect:  -1001234567010,
    oracle:     -1001234567011,
  }
}
```

## Architecture

```
Telegram Bot API (one bot, multiple groups)
  │ inbound                    ▲ outbound
  ▼                            │
/api/telegram/poll          /api/telegram/send
  - getUpdates (2s interval)   - accepts { charName, message }
  - filter by userId           - looks up group ID from config
  - resolve group -> character - sends to Telegram
  - spawn Claude session       - splits messages >4096 chars
  - post response to group
  │                            ▲
  ▼                            │
Existing GC infrastructure
  - spawnAndCollect (multi-turn, MCP tools)
  - character configs + MCP tools
  - scheduler (jobs call /send)
  - pipeline log
```

## New Files

### `lib/telegram.ts`

Telegram Bot API client. Thin wrapper around HTTP calls.

```ts
// Core functions:
getUpdates(offset: number): Promise<Update[]>
sendMessage(chatId: number, text: string, parseMode?: 'HTML'): Promise<Message>
downloadFile(fileId: string): Promise<Buffer>
getMe(): Promise<User>  // verify bot token on startup
```

Uses `fetch` directly. No external Telegram library needed. The Bot API is simple REST.

Messages over 4096 characters get split at paragraph boundaries. Each chunk sent as a separate message.

Parse mode: use `HTML` (not Markdown or MarkdownV2). HTML is the most forgiving format and avoids escaping issues with special characters in character output. Characters write plain text; the send endpoint wraps code blocks in `<pre>` tags if needed.

### `lib/telegram-router.ts`

Maps incoming messages to characters and handles the spawn cycle.

```ts
// Core logic:
resolveCharacter(chatId: number): string | null  // group -> charName lookup
processMessage(update: Update): Promise<void>
  // 1. Security: reject if update.message.from.id !== config.telegram.userId
  // 2. Resolve character from chat ID
  // 3. Check process registry - if character already has an active session, queue the message
  // 4. Download media if present (photos, voice, documents)
  // 5. Build seed prompt: character context + user message + media paths
  // 6. Spawn Claude session via spawnAndCollect (full MCP tools, multi-turn)
  // 7. Send response to Telegram group
  // 8. Log to telegram log
```

Messages for the same character are processed sequentially (queued if a session is already running). Messages for different characters process concurrently.

### `app/api/telegram/poll/route.ts`

Controls the polling loop.

```ts
// GET /api/telegram/poll/start - begins polling
// GET /api/telegram/poll/stop - stops polling
// GET /api/telegram/poll/status - returns running/stopped
// Polling state managed in module scope (singleton interval)
// Requires: export const runtime = 'nodejs'
```

The poll loop calls `getUpdates` with a rolling offset, processes each update through the router.

**Initialization:** GC's existing startup sequence (or a `layout.tsx` server-side call) hits `/api/telegram/poll/start` on boot. The endpoint is idempotent (calling start when already running is a no-op). During dev hot-reload, the module-scoped state resets, so the dashboard should re-call start on reconnect.

### `app/api/telegram/send/route.ts`

Outbound endpoint. Characters (via scheduled jobs or spawned sessions) call this to post to their group.

```ts
// POST /api/telegram/send
// Body: { charName: string, message: string, parseMode?: string }
// Returns: { ok: true, messageId: number }
```

Looks up `config.telegram.groups[charName]`, calls `sendMessage`. Returns error if charName not in config.

## Security

- Only messages from `config.telegram.userId` are processed. All others silently dropped.
- Bot token stored in `ground-control.config.ts` (git-ignored).
- `/api/telegram/send` is localhost-only (same as all GC endpoints).
- No sensitive data in Telegram messages beyond what characters already send via email/WhatsApp.

## Media Handling

When Kerem sends a photo, voice note, or document in a group:

1. Polling loop detects the media attachment
2. Downloads via `downloadFile` to `/tmp/telegram-media/`
3. Includes file path in the spawn prompt
4. Character processes it (OCR, transcription, etc.) using existing capabilities

Cleanup: `/tmp/telegram-media/` files older than 24 hours are deleted on each poll cycle start.

## Scheduled Jobs Migration

Jobs that currently instruct characters to send WhatsApp or email reports change their seed prompts.

### Pattern

Current:
```
"...email the report to kerem.ozan@gmail.com using mcp__gmail__send_email..."
"...send WhatsApp message to Kerem (905307704531@s.whatsapp.net)..."
```

New:
```
"...post the report to your Telegram group via POST http://localhost:3000/api/telegram/send with your charName and the report as message..."
```

### Jobs to update

| Job | Character | Current output | New output |
|-----|-----------|---------------|------------|
| coach-morning | Coach | WhatsApp nudge | Telegram Coach group |
| tutor-daily | Tutor | Email lesson + WhatsApp prompts | Telegram Tutor group |
| tutor-writing-afternoon | Tutor | WhatsApp prompt + feedback | Telegram Tutor group |
| postman-context-questions | Postman | WhatsApp questions | Telegram Postman group |
| morning-brief | Postman (charName stays postman) | Email | Telegram Postman group |
| scholar-daily | Scholar | Email report | Telegram Scholar group |
| scholar-tend | Scholar | Email report | Telegram Scholar group |
| coach-weekly | Coach | Email report | Telegram Coach group |
| kybernetes-weekly | Kybernetes | Email report | Telegram Kybernetes group |
| curator-weekly | Curator | Email report | Telegram Curator group |
| oracle-weekly | Oracle | Email report | Telegram Oracle group |
| oracle-monthly | Oracle | Tana only | Telegram Oracle group |

### Jobs unchanged

| Job | Reason |
|-----|--------|
| postman-morning/afternoon/evening | Scans Gmail, routes to Tana. No Kerem output. |
| postman-whatsapp / postman-whatsapp-evening | Scans WhatsApp chats. No Kerem output. |
| postman-deliver-* | Creates Gmail drafts for external people. Stays email. |
| evening-tasks | Spawns characters with pending tasks. Internal. |
| archivist-* | File/Tana operations. No Kerem output. |
| architect-* | System maintenance. Logs only. |
| scholar-educate-* | Deep Research submit/collect. Internal. |
| scholar-concept-scan | Links concepts. Internal. |
| check-draft-outcomes | API call. Internal. |
| weekly-lesson-extraction | API call. Internal. |

## CLAUDE.md Changes

### SELF-MESSAGE EXCEPTION

Current:
> Characters MAY auto-send emails and WhatsApp messages ONLY to Kerem himself.

New:
> Characters MAY auto-post to their Telegram group. This is the primary channel for all crew-to-Kerem communication (reports, nudges, prompts, questions). Auto-send to kerem.ozan@gmail.com is no longer used for reports.

### REPORT EMAIL RULE

Current:
> When any character produces a report, ALWAYS email it to kerem.ozan@gmail.com...

New:
> When any character produces a report, ALWAYS post it to your Telegram group via POST http://localhost:3000/api/telegram/send with your charName and the report as markdown message.

## Skill Changes

### coach-checkin

Replace WhatsApp send instructions with:
```
Post the morning nudge to your Telegram group via POST http://localhost:3000/api/telegram/send
{ "charName": "coach", "message": "Coach: [nudge text]" }
```

### tutor-lesson

Replace WhatsApp prompt sending with Telegram group posts. Email lesson delivery also moves to Telegram.

### postman-context-questions (in scheduler seed prompt)

Replace WhatsApp send with Telegram post to Postman group.

## Telegram Logging

Telegram messages get their own log file `data/telegram-log.json` (separate from the Gmail pipeline log, which has an incompatible schema).

```ts
type TelegramLogEntry = {
  id: string,
  direction: 'inbound' | 'outbound',
  charName: string,
  groupId: number,
  messageId: number,
  text: string,          // truncated to 500 chars
  mediaType?: string,    // 'photo' | 'voice' | 'document'
  timestamp: string,     // ISO
  durationMs?: number,   // for inbound: time from receive to response posted
}
```

Capped at 500 entries (same as pipeline log). Functions: `logTelegramEntry()`, `getTelegramLog(limit)`.

## Bot Setup Steps

1. Message @BotFather on Telegram: `/newbot`
2. Name it (e.g., "Ground Control")
3. Get the bot token, add to config
4. Create one Telegram group per character
5. Add the bot to each group as admin
6. Get each group's chat ID (send a message, call `getUpdates`, read `chat.id`)
7. Add group IDs to config
8. Start GC, polling begins automatically

## How Characters Call the Send Endpoint

Characters in spawned Claude sessions use `curl` via Bash to post to their Telegram group. The seed prompt pattern:

```
Post the report to your Telegram group:
curl -sf -X POST http://localhost:3000/api/telegram/send \
  -H "Content-Type: application/json" \
  -d '{"charName":"coach","message":"..."}'
```

This is the same pattern characters already use for other localhost API calls. No new MCP tool needed.

## Outbox Interaction

Telegram is crew-to-Kerem only. The outbox pipeline is unchanged. The outbox `channel` field keeps `email-personal`, `email-school`, and `whatsapp` as options. No `telegram` channel is added to the outbox because Telegram never sends to external people.

## Character Groups

Only characters that actively communicate with Kerem get a Telegram group. Characters that are purely internal (no Kerem-facing output) are omitted.

**Get groups:** postman, scholar, coach, tutor, proctor, clerk, curator, archivist, kybernetes, architect, oracle

**No group needed:** engineer (code-only, no reports), watcher (reports to architect, not Kerem), auditor (internal validation), scribe (produces prose within other workflows), prober (decomposition tool), steward (calendar intel writes to files, no Kerem output), doctor (reports through coach or directly if health reports move here later, can add group then)

Groups can be added to config at any time without code changes.

## Error Handling

- `sendMessage` failures: retry once after 1 second. If still failing, log the error and the unsent message to `data/telegram-errors.json`. Do not crash the polling loop.
- Claude session crash: post a short error message to the group ("Session failed. Try again."). Log the error.
- Bot kicked from group: `sendMessage` returns 403. Log it, skip that group until config is updated.
- Network errors during polling: log, wait 5 seconds, resume polling. Do not crash.

## Dashboard Integration

Telegram log is available via `/api/telegram/log`. No new dashboard widgets for v1. Can be added to the Logs tab later as a separate section.

## What This Does NOT Include

- No Telegram-to-external-people messaging (outbox stays email-only)
- No command syntax (no `/tasks`, `/calendar`). Just natural language in character groups.
- No inline keyboards or Telegram-specific UI. Plain text/markdown messages.
- No webhook mode. Long polling only (no public URL needed).
- No changes to Gmail pipeline, WhatsApp scanning, or outbox pipeline.
