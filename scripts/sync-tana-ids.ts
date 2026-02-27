#!/usr/bin/env npx tsx
/**
 * sync-tana-ids — Generate tana-ids.md from tana-schema.ts + config.ts
 *
 * Sections above the <!-- MANUAL --> marker are auto-generated.
 * Sections below it are preserved as-is on each run.
 *
 * Usage: npx tsx scripts/sync-tana-ids.ts
 */

import fs from 'fs';
import path from 'path';
import { TANA, ASSIGNED_BY_NAME } from '../lib/tana-schema';
import { TANA_WORKSPACE_ID, TANA_INBOX_ID, HOME } from '../lib/config';

const MARKER = '<!-- MANUAL SECTIONS BELOW — do not move this line -->';
const OUT = path.join(HOME, '.claude', 'shared', 'tana-ids.md');

// ── Read existing manual sections ──

let manualSections = '';
try {
  const existing = fs.readFileSync(OUT, 'utf-8');
  const idx = existing.indexOf(MARKER);
  if (idx !== -1) {
    manualSections = existing.slice(idx + MARKER.length);
  } else {
    // First run — everything after "## Project/Track Status" is manual
    const manualStart = existing.indexOf('## Project/Track Status');
    if (manualStart !== -1) {
      manualSections = '\n\n' + existing.slice(manualStart);
    }
  }
} catch {
  // File doesn't exist yet
}

// ── Helper: flip Record<id,name> to markdown table rows ──

function optionRows(opts: Record<string, string>): string {
  return Object.entries(opts).map(([id, name]) => `| ${name} | ${id} |`).join('\n');
}

// ── Generate auto sections ──

const auto = `# Tana Reference IDs

Single source of truth for all Tana workspace IDs. Auto-generated from \`lib/tana-schema.ts\` and \`lib/config.ts\`. Run \`npx tsx scripts/sync-tana-ids.ts\` after schema changes.

## Workspace

| Item | ID |
|------|-----|
| Workspace | ${TANA_WORKSPACE_ID} |
| Inbox | ${TANA_INBOX_ID} |
| Library | ${TANA_WORKSPACE_ID}_STASH |

## Task Management

| Field | ID |
|-------|-----|
| #task tag | ${TANA.tags.task} |
| task status field | ${TANA.fields.status} |
${optionRows(TANA.statusOptions)}
| due date field | ${TANA.fields.dueDate} |
| priority field | ${TANA.fields.priority} |
${optionRows(TANA.priorityOptions)}
| track field | ${TANA.fields.track} |
| assigned field | ${TANA.fields.assigned} |
${optionRows(TANA.assignedOptions)}

## Logging

| Item | ID | Notes |
|------|-----|-------|
| #log tag | ${TANA.tags.log} | Activity record under tracks. One #log node per track. |
| track field | ${TANA.fields.track} | Same track field used by #task. |
| Date field | SYS_A90 | Date of the log. |

### How to archive a task to #log

1. Search for an existing \`#log\` node with the task's track (\`field: { attributeId: ${TANA.fields.track}, nodeId: <trackId> }\`)
2. If found, use that node. If not, create a new \`#log\` node with the track set.
3. Add a plain child node (no tag) with a short summary: \`<date>: <task description>\`
4. Delete the original task node.

**Tana paste to create a #log node:**
\`\`\`
- Log #[[^${TANA.tags.log}]]
  - [[^${TANA.fields.track}]]:: [[^<trackId>]]
  - [[^SYS_A90]]:: [[date:YYYY-MM-DD]]
\`\`\`

**Tana paste for log entry (child of #log node):**
\`\`\`
- Feb 23: Completed the visa application
\`\`\`

## Pipeline Supertags

| Tag | Tag ID | Notes |
|-----|--------|-------|
| #post | ${TANA.tags.post} | Routed input item. Created by Postman. |

### #post Fields

| Field | ID |
|-------|----|
| From context | ${TANA.postFields.context} |
| Source | ${TANA.postFields.source} |
| Receiver | ${TANA.postFields.receiver} |
| Type | ${TANA.postFields.type} |
| Status | ${TANA.postFields.status} |
| Priority | ${TANA.postFields.priority} |

## Tana Paste Templates

### Task
\`\`\`
- [ ] Task description #[[^${TANA.tags.task}]]
  - [[^${TANA.fields.status}]]:: [[^STATUS_ID]]
  - [[^${TANA.fields.priority}]]:: [[^PRIORITY_ID]]
  - [[^${TANA.fields.dueDate}]]:: [[date:YYYY-MM-DD]]
  - [[^${TANA.fields.track}]]:: [[^trackId]]
  - Context description (untagged paragraph)
\`\`\`

${MARKER}`;

// ── Write ──

fs.writeFileSync(OUT, auto + manualSections, 'utf-8');
const lines = (auto + manualSections).split('\n').length;
console.log(`Wrote ${lines} lines to ${OUT}`);
