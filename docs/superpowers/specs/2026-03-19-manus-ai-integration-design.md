# Manus AI Integration

## Problem

Some tasks require autonomous web browsing: SUFORM form filling, SUCourse operations, web-based research with multi-page navigation. Playwright is unreliable for these. Manus AI specializes in browser-based autonomous workflows.

## Goal

Integrate Manus AI as an execution backend for browser-heavy tasks that Claude characters can't handle via MCP tools alone.

## Use Cases

- SUFORM form filling (KAF, travel forms) -- Clerk's most blocked task type
- SUCourse operations (posting announcements, uploading files, checking submissions)
- Web research requiring multi-page navigation and file downloads
- Any task currently attempted via Playwright that fails on auth/SSO

## Research Needed

- Manus API endpoint format and authentication
- Whether school subscription includes API access
- MCP connector availability for direct integration
- Sandbox capabilities (can it use Sabanci SSO?)
- Cost per task execution

## Architecture (proposed)

Pipeline escalation -> if task needs browser -> dispatch to Manus API instead of Claude character session. Results returned to GC, logged to pipeline log.

## Files

- Create: `lib/manus.ts` (API client)
- Modify: `lib/gmail-pipeline.ts` (escalate to Manus for browser tasks)
- Config: add `manus.apiKey` to ground-control.config.ts
