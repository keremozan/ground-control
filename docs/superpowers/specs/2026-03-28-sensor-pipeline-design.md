# iPhone Sensor Pipeline

## Goal

Ingest iPhone/Apple Watch data (workouts, sleep, location, screen time) into Ground Control as a shared data source. Any character can read it. Kybernetes uses sleep data to adjust the morning plan.

## Architecture

```
iPhone/Watch → Apple Shortcuts automation → POST /api/sensors → data/sensor-log.json
                                                                     ↑
                                              Characters read via lib/sensors.ts
```

Hybrid approach: Apple Shortcuts push event-driven data (workout ends, location change) in real-time. Daily summaries (sleep, screen time) pushed via morning/evening automations.

## Data Types

### Workout
Trigger: Apple Shortcuts "When workout ends"

```json
{
  "type": "workout",
  "timestamp": "2026-03-28T17:30:00+03:00",
  "data": {
    "activity": "running",
    "durationMin": 45,
    "calories": 380
  }
}
```

### Sleep
Trigger: Morning automation (e.g., 07:00 daily)

```json
{
  "type": "sleep",
  "timestamp": "2026-03-28T07:15:00+03:00",
  "data": {
    "bedtime": "23:30",
    "wakeup": "07:15",
    "totalMin": 465,
    "deepMin": 120,
    "remMin": 90,
    "coreMin": 255,
    "awakenings": 3,
    "heartRateAvg": 52
  }
}
```

### Location
Trigger: Apple Shortcuts "When I arrive/leave [place]"

```json
{
  "type": "location",
  "timestamp": "2026-03-28T08:50:00+03:00",
  "data": {
    "place": "home | work",
    "event": "arrive | leave"
  }
}
```

### Screen Time
Trigger: Evening automation (e.g., 21:00 daily)

```json
{
  "type": "screentime",
  "timestamp": "2026-03-28T21:00:00+03:00",
  "data": {
    "totalMin": 180,
    "pickups": 45
  }
}
```

## API

### POST /api/sensors

Accepts a single sensor event. Validates type and required fields, appends to `data/sensor-log.json`. Prunes entries older than 90 days on write.

Request body: `{ type, timestamp, data }` as shown above.

Response: `{ ok: true }` or `{ ok: false, error: "..." }`

No authentication (localhost only, same as all other GC endpoints).

## Storage

`data/sensor-log.json` -- JSON array of sensor entries. Append-only. Git-ignored. 90-day retention (pruned on each write).

Each entry stored as received plus an `id` field (nanoid) for dedup:

```json
{
  "id": "abc123",
  "type": "sleep",
  "timestamp": "2026-03-28T07:15:00+03:00",
  "receivedAt": "2026-03-28T07:15:02.000Z",
  "data": { ... }
}
```

## Reader Library

`lib/sensors.ts` exports:

```typescript
// Get all events of a type since a date
getSensorEvents(type: string, since?: Date): SensorEvent[]

// Get the most recent event of a type
getLatestSensor(type: string): SensorEvent | null

// Get last night's sleep data (convenience for Kybernetes/Coach)
getLastSleep(): SleepData | null
```

## Sleep-Aware Morning Plan

Kybernetes morning pulse already reads calendar and tasks. It will also call `getLastSleep()` from `lib/sensors.ts`.

If sleep data exists from the previous night:
- totalMin < 360 (6h): flag as poor sleep, suggest lighter schedule
- deepMin < 60: flag low deep sleep, suggest avoiding complex tasks early
- awakenings > 5: flag fragmented sleep

This is advisory context injected into the Kybernetes prompt, not hard logic. Kybernetes decides how to adapt the plan.

## Config

In `ground-control.config.ts`, add:

```typescript
sensorLocations: ["home", "work"] as string[],
```

Used for validation in the API endpoint (reject unknown places).

## Files to Create/Modify

| File | Action |
|------|--------|
| `app/api/sensors/route.ts` | Create - ingestion endpoint |
| `lib/sensors.ts` | Create - reader library |
| `ground-control.config.example.ts` | Modify - add sensorLocations |
| `ground-control.config.ts` | Modify - add sensorLocations (git-ignored) |
| `lib/config.ts` | Modify - export sensorLocations |
| `.gitignore` | Modify - add data/sensor-log.json |

## What This Does NOT Include

- No Pulse tab changes (future: Pulse reads sensor data for exercise category)
- No character skill updates (Coach, Doctor etc. integrate in their own sessions)
- No Tana sync (characters push summaries to Tana if they want)
- No correlation engine (characters cross-reference ad hoc)
- Exception: Kybernetes morning pulse reads sleep data directly

## Apple Shortcuts Setup (Manual)

User creates these automations on iPhone:

1. **Workout ends** → Run Shortcut → "Get Contents of URL" POST to `http://<mac-ip>:3000/api/sensors`
2. **Arrive home/work** → POST location event
3. **Leave home/work** → POST location event
4. **07:00 daily** → Read sleep data from Health → POST sleep summary
5. **21:00 daily** → Read Screen Time → POST screentime summary

Requires Mac reachable from iPhone (same WiFi or Tailscale).
