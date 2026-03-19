# Tutor TTS Pronunciation

## Problem

Tutor daily lessons teach vocabulary and grammar but can't demonstrate pronunciation. Text-only lessons miss a critical language learning dimension.

## Goal

Generate audio pronunciations for vocabulary words using Gemini 2.5 Flash TTS API. Include audio links in lesson emails so Kerem can listen on mobile.

## Approach

1. Tutor lesson generates vocabulary words (already exists in lesson flow)
2. For each word/phrase, call Gemini TTS API to generate audio
3. Save audio files to Google Drive (synced locally, accessible via link)
4. Include "Listen" links in the lesson email body

## TTS API

Gemini 2.5 Flash TTS is available on paid tier (10 RPM, 100 RPD). Endpoint:
```
POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-tts:generateContent
```

## Audio Delivery

Gmail doesn't support inline audio players. Options:
- Save MP3 to Google Drive, include Drive link in email
- Save to a local path, serve via GC endpoint (`/api/audio/[id]`) if Cloudflare Tunnel is active
- Attach MP3 files to the email directly (Gmail supports audio attachments)

Simplest: attach MP3 files to the lesson email. Kerem taps to play on mobile.

## Files

- Create: `lib/tts.ts` (Gemini TTS API client)
- Modify: `~/.claude/skills/tutor-lesson/SKILL.md` (add pronunciation step)
- Modify: `~/.claude/characters/core/tutor.json` (if new action needed)

## Scope

Start with vocabulary words only (3-5 per lesson). Each word gets one audio clip. No sentence-level TTS yet.
