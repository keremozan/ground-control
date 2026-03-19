# Tutor Email Mobile Fix

## Problem

The shared email template (`~/.claude/shared/email-template.md`) is not mobile-friendly. Fixed pixel paddings (28px), no `@media` queries, no viewport meta tag. Content overflows on small screens.

## Scope

This is a shared template used by all characters. The fix applies system-wide.

## Fix

- Add `<meta name="viewport" content="width=device-width, initial-scale=1">`
- Add `@media (max-width: 480px)` reducing padding from 28px to 16px (Gmail app on iOS respects embedded `<style>` in `<head>`)
- Add `min-width: 0` and `word-break: break-word` to content cells to prevent horizontal overflow
- Cap `.email-outer` at `width: 100% !important` on small screens
- Test by forwarding a lesson email and checking rendering on phone

## Files

- Modify: `~/.claude/shared/email-template.md`
