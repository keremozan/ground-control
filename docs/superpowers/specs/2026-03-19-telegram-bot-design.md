# Telegram Bot: Mobile Ground Control Interface

## Problem

Ground Control runs on localhost. When away from the Mac, there's no way to interact with the system. Ideas, commands, photos, and voice notes pile up until you're back at the desk.

## Goal

A Telegram bot that acts as a mobile interface to the entire system. Not a simple command bot, a full interaction layer.

## Message Types and Routing

### Text Messages

Classification pipeline (same pattern as Gmail):

```
Message arrives
  -> IF starts with / -> command handler
  -> IF starts with @character -> route to character
  -> ELSE -> Gemini Flash classifies:
     -> idea/thought -> capture to Tana day page
     -> system command -> execute (calendar, tasks, etc.)
     -> question -> route to appropriate character
     -> art/research note -> route to Scholar or Curator
```

### Commands (/ prefix)

| Command | Action | LLM needed? |
|---------|--------|------------|
| `/tasks` | List today's tasks from Tana | No |
| `/inbox` | Unread email summary | No |
| `/calendar` | Today's events | No |
| `/delete [event]` | Delete calendar event | Gemini (find event) |
| `/move [event] to [date]` | Reschedule event | Gemini (parse) |
| `/research [query]` | Fire Deep Research | No (direct API) |
| `/status` | System health (services, processes) | No |
| `/scan` | Trigger Gmail pipeline catch-up | No |

### Character Routing (@mention)

`@scholar I'm thinking about the relationship between walking and data collection` -> spawns Scholar chat session, returns response in Telegram.

`@clerk can you check if SUFORM deadline passed?` -> spawns Clerk.

### Photos

Photo received -> save to temp -> Gemini Flash vision classifies:
- Screenshot -> OCR, push to Tana (like iCloud scan)
- Artwork/reference -> push to Tana with tags
- Document -> OCR, create task or note
- Whiteboard -> OCR, capture text

### Voice Notes

Voice received -> Gemini audio transcription -> classify text -> same pipeline as text messages.
Tutor: could also use voice notes for pronunciation practice (student sends recording, Tutor evaluates).

### Audio/Recordings

Lesson recordings, meeting recordings -> Gemini transcription -> save to Tana with transcript.

## Architecture

```
Telegram Bot API (long polling, no webhook needed)
  -> /api/telegram/poll (new GC endpoint, runs in background)
  -> Message classifier (Gemini Flash)
  -> Route to handler:
     -> Command handler (direct API calls)
     -> Character handler (spawnOnce or spawnAndCollect)
     -> Capture handler (Tana import)
     -> Media handler (vision/audio processing)
  -> Response sent back to Telegram
  -> Log to pipeline log
```

## Implementation

### Files to create
- `lib/telegram.ts` -- Telegram Bot API client (send, receive, media download)
- `lib/telegram-router.ts` -- message classification and routing
- `app/api/telegram/poll/route.ts` -- long polling endpoint
- Config: add `telegram.botToken` to ground-control.config.ts

### Bot Setup
1. Message @BotFather on Telegram, create bot, get token
2. Add token to config
3. GC starts polling on server start

### Polling vs Webhook
Long polling (getUpdates API). No public URL needed. GC polls Telegram every 2 seconds for new messages. Stops when GC stops. Simple.

## Security

- Bot only responds to Kerem's Telegram user ID (hardcoded in config)
- All other messages ignored
- No sensitive data in responses (task names and summaries only, no full email bodies)

## Dashboard Integration

- Telegram messages logged to pipeline log (same format as Gmail pipeline)
- "Telegram" source type in pipeline entries
- Visible in Logs tab
