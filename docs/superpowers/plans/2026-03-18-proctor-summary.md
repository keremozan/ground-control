# Proctor Course Summary Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a skill that generates cumulative PDF course summaries from cached per-week fragments, posted as SUCourse announcements.

**Architecture:** Incremental fragment system. Each week's content is generated once and stored in a JSON file. On demand, Proctor generates only missing fragments, stitches all together into an HTML document, converts to PDF, and posts to SUCourse. Two course templates (theory for VA315, studio for VA204).

**Tech Stack:** SKILL.md (skill instructions), JSON (fragment storage), HTML (templates), WeasyPrint (PDF), Playwright (SUCourse posting)

---

### Task 1: Create fragment storage files

**Files:**
- Create: `~/.claude/shared/va315-summary-fragments.json`
- Create: `~/.claude/shared/va204-summary-fragments.json`

- [ ] **Step 1: Create VA315 fragments file**

```json
{
  "course": "va315",
  "semester": "spring-2026",
  "accentColor": "#c026d3",
  "activityRecordUrl": "https://drive.google.com/drive/folders/1wMf0l2L_VHW0p5nGiBN0F6wZSclqyRlK?usp=sharing",
  "fragments": {}
}
```

Write to `~/.claude/shared/va315-summary-fragments.json`.

- [ ] **Step 2: Create VA204 fragments file**

```json
{
  "course": "va204",
  "semester": "spring-2026",
  "accentColor": "#2563eb",
  "activityRecordUrl": "",
  "fragments": {}
}
```

Write to `~/.claude/shared/va204-summary-fragments.json`.

- [ ] **Step 3: Commit**

No git commit needed (these are outside the repo).

---

### Task 2: Create the HTML summary template

**Files:**
- Create: `~/.claude/skills/proctor-summary/summary-template.html`

- [ ] **Step 1: Create the skill directory**

```bash
mkdir -p ~/.claude/skills/proctor-summary
```

- [ ] **Step 2: Write the HTML template**

Create `~/.claude/skills/proctor-summary/summary-template.html` with:

- A4 portrait layout, 20mm margins
- system-ui font family
- Header block: course code (accent color), title "Course Summary . Weeks 1-N", semester, instructor
- Week block template: left border (accent color), week number badge, topic title, date, summary text, quote callout, image (max 300px width), key points list, readings list
- VA315 variant: includes quote callout
- VA204 variant: includes exercise description block instead of quote
- "What's Next" section at bottom
- Footer: "Full course activity record" link + "Kerem Ozan Bayraktar . [Semester]"
- Page break between every 1 week (CSS `page-break-after: always` on week blocks, last one excluded)
- Print-friendly (no background colors that won't print, border-based accents)

The template uses `{{ACCENT_COLOR}}`, `{{COURSE_CODE}}`, `{{COURSE_TITLE}}`, `{{WEEK_RANGE}}`, `{{SEMESTER}}`, `{{WEEK_BLOCKS}}`, `{{NEXT_SECTION}}`, `{{FOOTER_LINK}}` placeholders.

Style must match the editorial/magazine direction from brainstorming:
- White background
- Accent color for left borders, labels, bullet pips
- Quote in a callout box (light tinted background, accent left border)
- Image floated or centered, max 300px, subtle border-radius
- Clean typography: 16px body, 20px topic titles, 10px labels
- One page per week max

- [ ] **Step 3: Verify template renders**

```bash
# Quick test: create a test HTML with one week block, convert to PDF
/opt/homebrew/bin/python3.13 -m weasyprint "test-summary.html" "test-summary.pdf" --media-type print
open test-summary.pdf
```

---

### Task 3: Write the proctor-summary skill

**Files:**
- Create: `~/.claude/skills/proctor-summary/SKILL.md`

- [ ] **Step 1: Write the skill file**

Create `~/.claude/skills/proctor-summary/SKILL.md` with frontmatter:

```yaml
---
name: proctor-summary
description: Generate cumulative course summary PDF from cached fragments. Posts to SUCourse as announcement. On demand only.
character: proctor
argument-hint: "[course code, e.g. VA315 or VA204]"
---
```

Skill body covers these steps:

**Step 0: Parse input**
- Extract course code from input (VA315 or VA204)
- Load the matching fragments file (`~/.claude/shared/{course}-summary-fragments.json`)
- Load the course state file (va315-spring-2026-state.md or equivalent)
- Determine current week range from state file

**Step 1: Identify missing fragments**
- Read fragments file, get list of weeks that have cached fragments
- Read state file Sessions table for all logged weeks
- Missing = logged weeks not in fragments

**Step 2: Generate missing fragments (for each missing week)**
1. Find the presentation HTML in GDrive: `{gdrive}/{semesterFolder}/Week-{NN}/` (look for files matching `*presentation*.html` or the main slides file)
2. Read the presentation HTML. Parse content:
   - For VA315 (theory): extract key arguments, important quotes, discussion points, reading references
   - For VA204 (studio): extract technique focus, exercise instructions, materials mentioned
3. Search Tana for the class node for this week: search_nodes with tag #class (9PaZ1ZDaJssP) and filter by date/week number. Read any children for session notes.
4. Read the course activity record HTML for this week's row (topics, activities, readings)
5. Select one representative image from the presentation:
   - Parse all `<img>` tags and `<image>` elements
   - Skip images smaller than 100px in either dimension (icons/logos)
   - Skip images in header/footer areas
   - Prefer images near the main topic discussion (middle slides)
   - Convert selected image to base64 (read file, encode)
   - Log selection: `{ "src": "base64:...", "alt": "description", "source": "filename" }`
6. Synthesize content into the course template format:
   - VA315: topic title, 3-5 sentence summary, one quote with attribution, 4-5 key points, readings
   - VA204: topic title, technique/concept (2-3 sentences), exercise description, materials, 3-4 key observations
7. Generate the HTML fragment (a single week-block div)
8. Save to fragments file under the week key

**Step 3: Assemble full document**
1. Read the summary template HTML
2. Read all fragments in week order (01, 02, 03...)
3. Replace template placeholders:
   - `{{ACCENT_COLOR}}` with the course accent color from fragments file
   - `{{COURSE_CODE}}` and `{{COURSE_TITLE}}` from teaching.md
   - `{{WEEK_RANGE}}` e.g. "Weeks 1-5"
   - `{{SEMESTER}}` e.g. "Spring 2026"
   - `{{WEEK_BLOCKS}}` with all fragment HTML concatenated
   - `{{NEXT_SECTION}}` with next week's topic and readings from state file
   - `{{FOOTER_LINK}}` with the activity record URL from fragments file
4. Save assembled HTML to Desktop: `{course}-summary-weeks-1-{N}.html`

**Step 4: Export to PDF**
```bash
/opt/homebrew/bin/python3.13 -m weasyprint "{html_path}" "{pdf_path}" --media-type print
```
Copy both HTML and PDF to GDrive semester folder.

**Step 5: Post to SUCourse**
1. Navigate to the course's announcement forum (teaching.md has forum IDs: VA204=351494, VA315=351986)
2. Click "Add discussion topic"
3. Fill in:
   - Subject: "Course Summary: Weeks 1-{N}"
   - Body: "Here is the cumulative course summary through Week {N}. If you missed a session, this covers the key topics, readings, and takeaways."
4. Attach the PDF
5. STOP. Do not click submit. Wait for user confirmation.

**Step 6: Handle special commands**
- "swap week N image": list all images from that week's presentation, let user pick, update fragment
- "regenerate week N": delete that week's fragment, re-run Step 2 for that week only

- [ ] **Step 2: Verify skill loads**

Check that the skill appears in Proctor's skill list by reading proctor.json.

---

### Task 4: Update Proctor character config

**Files:**
- Modify: `~/.claude/characters/core/proctor.json`

- [ ] **Step 1: Add skill to Proctor's skills array**

Add `"proctor-summary"` to the `skills` array in proctor.json.

- [ ] **Step 2: Add Summary action to Proctor's actions array**

Add to the `actions` array:
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

- [ ] **Step 3: Add seed prompt**

Add to `seeds`:
```json
"Summary": "Run proctor-summary skill. Follow all steps exactly as written."
```

- [ ] **Step 4: Add summary-related fragment files to shared knowledge**

No change needed. Proctor already has `teaching` and `va315-spring-2026-state` in sharedKnowledge. The skill reads fragment files directly by path.

- [ ] **Step 5: Commit**

No git commit needed (character configs are outside the repo).

---

### Task 5: Add VA204 accent color to teaching.md

**Files:**
- Modify: `~/.claude/shared/teaching.md`

- [ ] **Step 1: Add color reference**

Add a "Course Colors" section to teaching.md:

```markdown
## Course Colors
- VA 315/515: #c026d3 (fuchsia)
- VA 203/204: #2563eb (blue)
```

---

### Task 6: End-to-end test with VA315

- [ ] **Step 1: Run Proctor Summary for VA315**

From the dashboard, click Proctor > Summary, input "VA315". Or trigger via chat.

- [ ] **Step 2: Verify fragment generation**

Read `~/.claude/shared/va315-summary-fragments.json` and confirm:
- Fragments exist for weeks 01-05
- Each has html, image, and generatedAt fields
- Image base64 is present and reasonable size

- [ ] **Step 3: Verify PDF output**

Check Desktop for `va315-summary-weeks-1-5.html` and `.pdf`. Open the PDF:
- One page per week
- Correct course header
- Quotes rendered in callout boxes
- Images visible and sized correctly
- What's Next section at the end
- Footer link present

- [ ] **Step 4: Verify SUCourse posting pauses**

Confirm Proctor stops before submitting the SUCourse announcement and waits for user confirmation.

- [ ] **Step 5: Test incremental generation**

Run Summary again. Verify it skips weeks 01-05 (already cached) and only generates any new week if one was added to the state file.
