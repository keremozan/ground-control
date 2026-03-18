# Pre-flight Checks for Scheduled Jobs

## Problem

Scheduled jobs spawn Claude CLI processes even when there's nothing to do. Postman email scans run 3x/day, delivery jobs run 3x/day. On a quiet day with no new emails and an empty outbox, that's 6 wasted Claude sessions (~3-5 min each, significant token cost).

## Solution

A `lib/preflight.ts` module with lightweight check functions that run before spawning. If a check determines there's no work, the job is logged as "skipped" and no Claude process starts.

## Check Types

### Email Scan (`postman-morning`, `postman-afternoon`, `postman-evening`)

Uses the existing `getRecentThreads()` from `lib/gmail.ts` to check both accounts (personal + school). Compares thread dates against `lastRunAt` from job-state.json. If zero threads are newer than last run, skip.

Edge case: first run (no lastRunAt) always proceeds.

### Delivery (`postman-deliver-morning`, `postman-deliver-afternoon`, `postman-deliver-evening`)

Uses Tana MCP (`get_children` on outbox container `LjnnUuoC8UT3`) to check for pending outbox items. If container has zero children or all children are already delivered, skip.

### Not checked (always run)

- WhatsApp scans (no direct API from GC)
- Morning brief (always needed for daily email)
- Context, research, review, watcher jobs (always produce output)
- process-tasks (already has its own empty-task early return)

## Integration Point

In `app/api/schedule/run/route.ts`, after resolving the job but before spawning:

```
const check = await preflight(jobId, lastRunAt);
if (check.skip) {
  // Write lightweight skip result to job-results.json
  // Mark job as skipped in job-state.json
  // Return early
}
```

## Job State Extension

Add `'skipped'` to the `lastResult` type in `lib/job-state.ts`. Skipped jobs update `lastRunAt` so catch-up doesn't re-fire them.

## Job Result for Skips

Skipped jobs write a minimal result to `job-results.json` so they appear in the Logs tab:
```json
{
  "jobId": "postman-morning",
  "charName": "postman",
  "displayName": "Postman",
  "timestamp": "...",
  "response": "Skipped: no new emails since last run (12:45)",
  "durationMs": 150,
  "skipped": true
}
```

## Mapping

Job-to-check mapping lives in `lib/preflight.ts` as a simple Record keyed by job ID prefix:

```typescript
const PREFLIGHT_MAP: Record<string, PreflightFn> = {
  'postman-morning': checkNewEmails,
  'postman-afternoon': checkNewEmails,
  'postman-evening': checkNewEmails,
  'postman-deliver-morning': checkOutbox,
  'postman-deliver-afternoon': checkOutbox,
  'postman-deliver-evening': checkOutbox,
};
```

No config changes needed. Adding a new check = add an entry to the map.

## Files

- Create: `lib/preflight.ts`
- Modify: `app/api/schedule/run/route.ts` (add preflight call)
- Modify: `lib/job-state.ts` (add 'skipped' result type)
