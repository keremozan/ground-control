# Proctor Course Summary Skill

Date: 2026-03-18

## Overview

On-demand skill that generates a cumulative PDF summary of all course sessions, posted as a SUCourse announcement with PDF attachment. Uses incremental fragment-based generation (only the latest week is generated each run, previous weeks are cached).

## Per-Course Templates

### VA 315/515 Visual Culture (theory course)
Each week block contains:
- Week number, topic title, date
- Summary (3-5 sentences synthesized from slides and session notes)
- One key quote with attribution
- One representative image from the presentation (auto-selected, logged for override)
- 4-5 key points as bullet list
- Readings referenced that week

### VA 203/204 Language of Drawing (studio course)
Each week block contains:
- Week number, topic/focus, date
- Technique or concept covered (2-3 sentences)
- Exercise description (what students did)
- Materials and references discussed
- One representative image from the presentation
- Key observations or takeaways (3-4 bullets)

### Shared sections (both courses)
- Header: course code, title, week range, semester, instructor
- What's Next: next week's topic + required readings/prep
- Footer: link to full course activity record

## Visual Style

Editorial/magazine (white background). Course accent color for section borders and labels. system-ui font. Each week bordered on the left with the accent color. Quote in callout box. One page per week maximum. Clean and printable.

Accent colors: VA 315 uses Proctor fuchsia (#c026d3). VA 204 uses a distinct color (to be set in teaching.md).

## Data Sources

1. Presentation HTML files from GDrive (`{gdrive}/Presentations/{semester}/Week-##/`)
2. Course activity record HTML (topics, activities, readings per week)
3. Tana class nodes (session notes, discussion points if logged)
4. Course state file (va315-spring-2026-state.md or equivalent)
5. Cached fragments from previous runs

## Fragment Storage

File: `~/.claude/shared/{course}-summary-fragments.json`

```json
{
  "course": "va315",
  "semester": "spring-2026",
  "fragments": {
    "01": {
      "html": "<div class='week-block'>...</div>",
      "image": { "src": "base64 or file path", "alt": "description", "source": "Week-01/slides.html" },
      "generatedAt": "2026-03-18T10:00:00Z"
    },
    "02": { ... }
  }
}
```

Each fragment is a self-contained HTML snippet for one week. Images stored as base64 (for PDF portability). The `image` field logs Proctor's selection so it can be reviewed or overridden without regenerating the whole fragment.

## Generation Flow

### Step 1: Read state
- Read the fragments file. Determine which weeks already have cached fragments.
- Read course activity record for the full week list.
- Identify which weeks need generation (new or explicitly requested for regeneration).

### Step 2: Generate missing fragments
For each missing week:
1. Read the presentation HTML from GDrive for that week
2. Read Tana class node for that week (if exists) for session notes
3. Read course activity record for that week's readings and activities
4. Synthesize the week's content per the course template
5. Select the most representative image from the presentation:
   - Parse all img tags from the presentation HTML
   - Prefer images in the main content area (skip logos, icons, decorative elements)
   - Prefer images near the topic's key discussion points
   - Convert to base64 for embedding
   - Log the selection in the fragment
6. Generate the HTML fragment
7. Save to fragments file

### Step 3: Assemble full document
1. Read all fragments in week order
2. Wrap in the full HTML template (header, styles, page breaks)
3. Append "What's Next" section using next week's data from activity record
4. Append footer with course activity record link

### Step 4: Export
1. Save HTML to Desktop: `{course}-summary-weeks-1-{N}.html`
2. Convert to PDF via WeasyPrint
3. Copy both to GDrive under course semester folder

### Step 5: Post to SUCourse
1. Navigate to course forum (announcement area)
2. Create new discussion topic
3. Title: "Course Summary: Weeks 1-{N}"
4. Body: "Here is the cumulative course summary through Week {N}. If you missed a session, this covers the key topics, readings, and takeaways. See the attached PDF."
5. Attach the PDF
6. STOP before submitting. Wait for user confirmation.

## Image Override

If Proctor picked the wrong image for a week, user can say "swap week 3 image" in chat. Proctor:
1. Lists all images from that week's presentation
2. User picks the right one
3. Fragment is updated with the new image, no content regeneration needed

## Regeneration

User can request "regenerate week 3" to re-extract content from sources. Only that week's fragment is rebuilt. The rest stay cached.

## Dashboard Integration

New Proctor action:
```json
{
  "label": "Summary",
  "icon": "FileText",
  "description": "Generate cumulative course summary PDF and post to SUCourse",
  "autonomous": true,
  "autonomousInput": true,
  "inputPlaceholder": "Course code (e.g., VA315 or VA204)"
}
```

Seed: "Run proctor-summary skill. Follow all steps exactly as written."

## Verbal Content Gap

Proctor can only synthesize from slides and activity record. Session notes in Tana class nodes improve summary quality. If a week has no slides and no notes, Proctor generates a minimal fragment (topic + readings only) and flags it for manual enrichment.

## Constraints

- One page per week maximum in the PDF
- Max image size: 300px width in the PDF layout
- Fragment file kept under 500KB per course (base64 images add up)
- Proctor never submits to SUCourse without user confirmation
