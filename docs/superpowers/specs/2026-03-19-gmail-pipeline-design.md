# Gmail Pipeline: Event-Driven Email Processing

## Problem

Email processing runs as 3 opaque Postman scan sessions per day (08:00, 13:00, 18:00). Each spawns a full Claude character that reads the entire inbox, classifies everything, and produces a summary. 85% of compute time is wasted. Duplicate drafts are created because delivery runs 6 times/day through two overlapping job types. When something goes wrong, the failure is buried inside a character session log.

## Goal

Replace batch scanning with an event-driven pipeline of discrete, visible stages. Each email flows through explicit steps with clear if/then logic. Every stage is observable in the dashboard. Errors are visible at the exact stage where they occur.

## Architecture

```
Gmail Push (Google Pub/Sub)
  → /api/webhooks/gmail (receives notification)
  → Debounce (batch notifications for 2 min)
  → Fetch new messages (Gmail history API)
  → For each message: run pipeline stages 1-4
  → Log each stage to pipeline timeline
```

Cloudflare Tunnel exposes localhost:3000 to a public HTTPS URL for Google Pub/Sub.

On Mac wake/startup: one-time catch-up sync fetches everything since last known historyId.

## Pipeline Stages

### Stage 0: Fetch

**Input:** Gmail push notification (emailAddress + historyId)
**Logic:**
- Call `history.list` with `startHistoryId` from last checkpoint
- For each new message: call `messages.get` to fetch sender, subject, snippet, labels
- Filter out: sent by Kerem, already in trash, already processed (tracked by messageId in local log)
- Store new historyId checkpoint

**Output:** List of new email objects `{ messageId, threadId, from, subject, snippet, labels, account }`
**Error handling:** If Gmail API fails, retry once. If still fails, log error and fall back to a lightweight scan on next cron cycle.

### Stage 1: Quick Filter (deterministic, no LLM)

**Input:** Email object from Stage 0
**Logic:**
- IF `from` matches known newsletter patterns (Substack, Mailchimp, marketing list) → ARCHIVE
- IF `from` matches notification patterns (noreply@, notification@, automated@) → ARCHIVE
- IF label is PROMOTIONS or SOCIAL or UPDATES → ARCHIVE
- IF `from` is in contacts list AND email is a direct message → PASS to Stage 2
- IF `from` is unknown → PASS to Stage 2 with flag `new_contact: true`

**Output:** `{ action: "archive" }` or `{ action: "classify", email, flags }`
**Data:** Newsletter/notification patterns stored in `data/email-filters.json`. Editable from dashboard (future). Starts with a seed list, grows as you archive things.

### Stage 2: Classify (Gemini 2.5 Flash-Lite, free, 1000/day)

**Input:** Email object that passed Stage 1
**Logic:**
- Send to Gemini Flash-Lite with prompt: "Is this email actionable? Return JSON: { actionable: boolean, reason: string }"
- IF `actionable: false` → ARCHIVE
- IF `actionable: true` → PASS to Stage 3

**Output:** `{ action: "archive", reason }` or `{ action: "route", email }`
**Cost:** Free tier. ~30-40 emails/day, well within 1000/day limit.

### Stage 3: Route (Gemini 2.5 Pro, free, 100/day)

**Input:** Actionable email from Stage 2
**Logic:**
- Send to Gemini Pro with routing prompt containing:
  - Email content (from, subject, body truncated to 2000 chars)
  - Routing table from `~/.claude/shared/routing-table.md`
  - Contact list with known character assignments
  - Current date for deadline extraction
- Gemini returns structured JSON:
```json
{
  "actions": [
    { "type": "create_task", "title": "...", "character": "clerk", "track": "...", "priority": "high", "due": "2026-03-31" },
    { "type": "create_event", "title": "...", "date": "2026-03-25", "time": "14:00", "duration": 60 },
    { "type": "draft_reply", "intent": "confirm attendance, mention arriving 5 min late" }
  ]
}
```
- Multiple actions per email are supported (reply + task + event)

**Output:** Action list for Stage 4
**Cost:** Free tier. ~10-20 actionable emails/day, well within 100/day limit.

### Stage 4: Execute Actions

For each action in the list from Stage 3:

**create_task:**
- Check Tana for duplicates (semantic search, same as current CLAUDE.md rule)
- IF duplicate found → skip, log "duplicate skipped"
- IF no duplicate → create task via Tana MCP `import_tana_paste` with character, track, priority, due date
- Log: task created with node ID

**create_event:**
- Check Google Calendar for conflicts at that time
- IF conflict → log warning, create task instead ("schedule conflict: [event] vs [existing]")
- IF clear → create calendar event via Google Calendar API
- Log: event created

**draft_reply:**
- Check 1: search Gmail sent folder for recent replies to this thread → IF found, skip
- Check 2: search Gmail drafts for existing draft to same recipient + topic → IF found, skip
- IF both checks pass → call Claude API (single turn, `spawnOnce`) with email thread + reply intent
- Create Gmail draft with the response
- Log: draft created with draft ID
- Write to comms ledger

**escalate:**
- Route to Ground Control character session via existing `/api/schedule/run`
- Log: escalated to [character] with reason

**archive:**
- Archive in Gmail via API
- Log: archived

### Stage 5: Log

Every email that enters the pipeline gets a log entry:

```json
{
  "messageId": "...",
  "threadId": "...",
  "from": "ayse@sabanciuniv.edu",
  "subject": "KAF plotter form",
  "account": "school",
  "receivedAt": "2026-03-19T14:32:00Z",
  "stages": [
    { "stage": 0, "result": "fetched", "ms": 120 },
    { "stage": 1, "result": "passed", "reason": "known contact", "ms": 1 },
    { "stage": 2, "result": "actionable", "reason": "admin request with deadline", "ms": 450 },
    { "stage": 3, "result": "routed", "actions": ["create_task", "draft_reply"], "ms": 820 },
    { "stage": 4, "result": "executed", "details": ["task aB3x created", "draft 4f2k created"], "ms": 1200 }
  ],
  "totalMs": 2591
}
```

Stored in `data/pipeline-log.json` (last 500 entries). Served via `GET /api/pipeline/log`. Displayed in the pipeline timeline widget and the flow diagram.

## What Gets Retired

- `postman-morning` cron job (email scan portion)
- `postman-afternoon` cron job (email scan portion)
- `postman-evening` cron job (email scan portion)
- `postman-deliver-morning` cron job
- `postman-deliver-afternoon` cron job
- `postman-deliver-evening` cron job

Postman keeps: WhatsApp scans, iCloud scans, Tana inbox scans, context questions. These are separate pipelines for later.

## What Gets Fixed

**Duplicate drafts:** Eliminated by design. Each email enters the pipeline exactly once (tracked by messageId). Draft creation has explicit dedup checks (sent folder + existing drafts) before creating. No overlapping job types. No race conditions between cycle and standalone deliver.

**Wasted compute:** Stage 1 (deterministic filter) and Stage 2 (Flash-Lite) eliminate 60-70% of emails before any significant processing. Stage 3 (Pro) handles routing without a full character session. Claude is only called for draft text generation and escalation.

**Opacity:** Every stage logs its result. The dashboard shows exactly where each email is in the pipeline, what happened, and why. Errors point to the exact stage.

## Infrastructure Requirements

- **Cloudflare Tunnel:** Free tier. `cloudflared` daemon running on Mac. Exposes localhost:3000 to a public URL.
- **Google Cloud Pub/Sub:** Free tier (first 10GB/month). One topic, one push subscription pointing to the tunnel URL.
- **Gmail Watch:** Call `users.watch` on startup and renew daily (watches expire after 7 days).
- **Gemini API key:** Free tier via Google AI Studio. Store in `ground-control.config.ts`.

## Files

- Create: `lib/gemini.ts` (Gemini API client)
- Create: `lib/gmail-pipeline.ts` (stages 0-4 logic)
- Create: `lib/email-filters.ts` (stage 1 pattern matching)
- Create: `app/api/webhooks/gmail/route.ts` (webhook receiver)
- Create: `app/api/pipeline/log/route.ts` (pipeline log API)
- Modify: `lib/gmail.ts` (add history.list, watch, draft creation functions)
- Modify: `lib/job-state.ts` (add historyId tracking per account)
- Create: `data/email-filters.json` (newsletter/notification patterns)
- Create: `data/pipeline-log.json` (pipeline execution log)

## Dashboard Integration

- Pipeline timeline in Logs tab or new Pipeline tab: shows recent emails with stage-by-stage breakdown
- Flow diagram widget (separate spec): shows the pipeline structure with live counters
- Stage 1 filter management: view/edit newsletter patterns (future, can start as JSON file)

## Startup / Wake Catch-Up

When GC starts (Mac wake, server restart):
1. Read last known historyId per account from job-state.json
2. Call `history.list` to get all changes since then
3. Run each new message through the full pipeline
4. Resume live webhook listening

This replaces the catch-up mechanism for email jobs entirely.
