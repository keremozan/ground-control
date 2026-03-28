# Pulse Tab Design

## Goal

A "Pulse" tab in InfoPanel showing time allocation, crew activity, daily status, and pattern alerts. All data derived from existing sources (calendar, crew sessions, Kybernetes, Coach).

## Data Sources

### Calendar Events (primary time data)
- Google Calendar API now returns `colorId` per event
- Color-to-category mapping in `ground-control.config.ts`
- Categories group into spheres

### Color ID Mapping

| colorId | Label | Sphere |
|---|---|---|
| 1 | Academia | Research |
| 10 | Academia | Research |
| 2 | Meeting | Collegium |
| 3 | Free time | Life |
| 4 | Exercise | Life |
| 5 | Social | Life |
| 6 | Chores | Life |
| 8 | Travel | Travel (standalone) |
| 9 | Studio | Practice |
| default | (none) | Unclassified |

### Crew Sessions
- Action log tracks character name + duration_ms per session
- Character-to-sphere mapping: Scholar/Prober/Auditor = Research, Proctor/Clerk/Tutor = Collegium, Curator = Practice, Coach/Doctor = Life, Architect/Engineer/Postman/Kybernetes/Archivist/Scribe = System (excluded from sphere bars)

### Kybernetes Data
- Morning pulse: day plan with blocks
- Evening capture: plan-vs-actual comparison
- Plan completion rate derived from capture data

### Coach Data
- Morning energy check-in (1-10 scale)

## Sections (top to bottom)

### 1. Time by Sphere
Two horizontal stacked bars (Today + Week). Each sphere gets a fixed color segment proportional to hours. Sorted by hours descending.

Sphere colors:
- Practice: #7c3aed (purple)
- Research: #2563eb (blue)
- Collegium: #f97316 (orange)
- Life: #059669 (green)
- Travel: #94a3b8 (gray, shown separately)

Below the bars: breakdown per sphere showing sub-categories (the calendar color labels) with hours, separated by dot dividers.

```
Today  ████████░░░░░░░░░░
Week   ██████████████████████

Research 7h
  academia 4h · study 3h
Collegium 6h
  meeting 4h · teaching 2h
Practice 2h
  studio 2h
Life 3h
  exercise 1h · social 1h · free time 1h
Travel 1.5h
```

### 2. Crew Time This Week
Horizontal bar chart per character, sorted by total active time descending. Shows: color dot, character name (64px), proportional bar, total time, session count (secondary).

Only shows characters with sessions this week. Uses actual `duration_ms` from session logs (Claude processing time, not tab-open time).

### 3. Day Pulse (Kybernetes)
Two metrics side by side:
- Plan completion: "3/5" with a progress bar (from evening capture data)
- Energy: large number "/10" (from Coach morning check-in)

### 4. Calendar Density
Single bar showing booked vs free hours today. "5h booked, 3h free" with green highlight on free hours.

### 5. Pattern Alerts
Text-based alerts with colored severity dots:
- Red: gaps (e.g., "No reading sessions in 9 days")
- Orange: drops (e.g., "Practice dropped 60% vs last week")
- Green: streaks (e.g., "Research streak: 5 consecutive days")

Pattern detection logic:
- Gap alert: if a category that normally appears weekly has 0 hours for 7+ days
- Drop alert: if a sphere's hours this week are 50%+ below the 4-week rolling average
- Streak alert: if a sphere has consecutive days of activity for 4+ days

## API

New endpoint: `GET /api/pulse`

Returns:
```json
{
  "spheres": {
    "today": { "research": 3, "collegium": 2, "practice": 1, "life": 0, "travel": 0.5 },
    "week": { "research": 7, "collegium": 6, "practice": 2, "life": 3, "travel": 1.5 }
  },
  "breakdown": {
    "research": { "academia": 7 },
    "collegium": { "meeting": 4, "teaching": 2 },
    "practice": { "studio": 2 },
    "life": { "exercise": 1, "social": 1, "free time": 1 },
    "travel": { "travel": 1.5 }
  },
  "crew": [
    { "name": "Scholar", "color": "#7c3aed", "totalMs": 2520000, "sessions": 12 }
  ],
  "dayPulse": {
    "planTotal": 5,
    "planDone": 3,
    "energy": 6
  },
  "density": {
    "bookedHours": 5,
    "freeHours": 3
  },
  "alerts": [
    { "level": "red", "text": "No reading sessions in 9 days", "detail": "Last: Mar 19" },
    { "level": "orange", "text": "Practice dropped 60% vs last week", "detail": "This week 2h vs last week 5h" },
    { "level": "green", "text": "Research streak: 5 consecutive days", "detail": "Averaging 1.5h/day since Mar 23" }
  ]
}
```

## Config

In `ground-control.config.ts`, add:
```typescript
calendarSphereMapping: {
  "1": { label: "academia", sphere: "research" },
  "10": { label: "academia", sphere: "research" },
  "2": { label: "meeting", sphere: "collegium" },
  "3": { label: "free time", sphere: "life" },
  "4": { label: "exercise", sphere: "life" },
  "5": { label: "social", sphere: "life" },
  "6": { label: "chores", sphere: "life" },
  "8": { label: "travel", sphere: "travel" },
  "9": { label: "studio", sphere: "practice" },
}
```

## Files to Create/Modify

| File | Action |
|------|--------|
| `app/api/pulse/route.ts` | Create - aggregation endpoint |
| `components/home/info-panel/PulsePanel.tsx` | Create - Pulse tab component |
| `components/home/info-panel/InfoPanel.tsx` | Modify - add Pulse tab |
| `ground-control.config.example.ts` | Modify - add calendarSphereMapping |
| `ground-control.config.ts` | Modify - add calendarSphereMapping (git-ignored) |
| `lib/config.ts` | Modify - expose sphere mapping via SystemConfig |

## Design Notes

- All styling follows existing dashboard design language (bordered pills, monospace labels, subtle backgrounds)
- Section labels use `.section-label` style: monospace 9px uppercase gray
- Bars use existing color tokens where possible
- Demo approved at `demo-pulse.html` (now removed)
