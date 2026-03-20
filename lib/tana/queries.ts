import { mcpCall } from './client';
import { getExcludedIds } from './cache';
import { TANA } from '../tana-schema';

// Local aliases
const TASK_TAG_ID = TANA.tags.task;
const WS_TAG_ID = TANA.tags.workstream;
const STATUS_FIELD_ID = TANA.fields.status;
const STATUS_OPTIONS = TANA.statusOptions;
const PRIORITY_OPTIONS = TANA.priorityOptions;
const ASSIGNED_OPTIONS = TANA.assignedOptions;
const WS_STATUS_FIELD_ID = TANA.fields.wsStatus;
const WS_STATUS_OPTIONS = TANA.wsStatusOptions;
const STATUS_OPTION_IDS = TANA.statusByName;

const PROJECT_TAG_ID = TANA.tags.project;
const PROJECT_STATUS_FIELD_ID = TANA.projectFields.status;
const LOG_TAG_ID = TANA.tags.log;
const TRACK_FIELD_ID = TANA.fields.track;
const CLASS_TAG_ID = TANA.classTags.class;

// ── Types ────────────────────────────────────────────────────────────────────

export type TanaTask = {
  id: string;
  name: string;
  status: string;
  priority: string;
  track: string;
  trackId: string | null;
  assigned: string | null;
  dueDate: string | null;
  phaseId?: string;
  phaseName?: string;
};

export type TanaPhase = {
  id: string;
  name: string;
  status: string;
  track: string;
  trackId: string | null;
  taskIds: string[];
};

export type TanaProject = {
  id: string;
  name: string;
  trackId: string;
  startDate: string | null;
  deadline: string | null;
  phases: {
    id: string;
    name: string;
    status: 'pending' | 'active' | 'completed';
    taskCount: number;
    doneCount: number;
    startDate: string | null;
    endDate: string | null;
  }[];
  lastActivity: {
    date: string;
    summary: string;
  } | null;
};

export type ChecklistItem = {
  id: string;
  text: string;
  checked: boolean;
  group: 'prep' | 'post-lesson' | null;
};

export type ClassPrepNode = {
  id: string;
  name: string;
  course: string;
  courseId: string | null;
  date: string | null;
  number: number | null;
  checklist: ChecklistItem[];
  totalItems: number;
  checkedItems: number;
};

// ── Field parsers ────────────────────────────────────────────────────────────

function parseFields(markdown: string): { status: string; priority: string; track: string; trackId: string | null; assigned: string | null; dueDate: string | null } {
  let status = 'backlog';
  let priority = 'medium';
  let track = 'Uncategorized';
  let trackId: string | null = null;
  let assigned: string | null = null;
  let dueDate: string | null = null;

  const statusMatch = markdown.match(/\*\*task status\*\*:\s*\[([^\]]+)\]\(tana:([\w-]+)\)/);
  if (statusMatch) {
    status = STATUS_OPTIONS[statusMatch[2]] || statusMatch[1].toLowerCase();
  }

  const priorityMatch = markdown.match(/\*\*priority\*\*:\s*\[([^\]]+)\]\(tana:([\w-]+)\)/);
  if (priorityMatch) {
    priority = PRIORITY_OPTIONS[priorityMatch[2]] || priorityMatch[1].toLowerCase();
  }

  const trackMatch = markdown.match(/\*\*track\*\*:\s*\[([^\]]+?)(?:\s*#\w+)?\]\(tana:([\w-]+)\)/);
  if (trackMatch) {
    track = trackMatch[1].trim();
    trackId = trackMatch[2];
  }

  const assignedMatch = markdown.match(/\*\*assigned\*\*:\s*\[([^\]]+)\]\(tana:([\w-]+)\)/);
  if (assignedMatch) {
    assigned = ASSIGNED_OPTIONS[assignedMatch[2]] || assignedMatch[1].toLowerCase();
  }

  // Due date: matches "**due date**: Thu, Mar 15", "**due date**: 2026-03-15", or relative like "Today", "Tomorrow", "Yesterday"
  const dueDateMatch = markdown.match(/\*\*due date\*\*:\s*(?:\w+, )?(\w+ \d+(?:, \d+)?|\d{4}-\d{2}-\d{2}|Today|Tomorrow|Yesterday)/i);
  if (dueDateMatch) {
    const raw = dueDateMatch[1];
    const localDate = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      dueDate = raw;
    } else if (/^today$/i.test(raw)) {
      dueDate = localDate(new Date());
    } else if (/^tomorrow$/i.test(raw)) {
      const d = new Date(); d.setDate(d.getDate() + 1);
      dueDate = localDate(d);
    } else if (/^yesterday$/i.test(raw)) {
      const d = new Date(); d.setDate(d.getDate() - 1);
      dueDate = localDate(d);
    } else {
      // "Mar 1" or "Mar 1, 2026" — if no year, append current year
      const withYear = /,\s*\d{4}$/.test(raw) ? raw : `${raw}, ${new Date().getFullYear()}`;
      const parsed = new Date(withYear);
      if (!isNaN(parsed.getTime())) {
        dueDate = localDate(parsed);
      }
    }
  }

  return { status, priority, track, trackId, assigned, dueDate };
}

function parseWorkstreamFields(markdown: string): { status: string; track: string; trackId: string | null } {
  let status = 'pending';
  let track = 'Uncategorized';
  let trackId: string | null = null;

  const statusMatch = markdown.match(/\*\*status\*\*:\s*\[([^\]]+)\]\(tana:([\w-]+)\)/);
  if (statusMatch) {
    status = WS_STATUS_OPTIONS[statusMatch[2]] || statusMatch[1].toLowerCase();
  }

  const trackMatch = markdown.match(/\*\*track\*\*:\s*\[([^\]]+?)(?:\s*#\w+)?\]\(tana:([\w-]+)\)/);
  if (trackMatch) {
    track = trackMatch[1].trim();
    trackId = trackMatch[2];
  }

  return { status, track, trackId };
}

// ── Query functions ──────────────────────────────────────────────────────────

export async function getTanaTasks(): Promise<TanaTask[]> {
  const nodes = await mcpCall('tools/call', {
    name: 'search_nodes',
    arguments: {
      query: {
        and: [
          { hasType: TASK_TAG_ID },
          { not: { is: 'done' } },
          { not: { field: { fieldId: STATUS_FIELD_ID, nodeId: STATUS_OPTION_IDS.done } } },
        ],
      },
      limit: 100,
    },
  });

  if (!Array.isArray(nodes)) return [];

  // Filter out tasks recently trashed/done via dashboard (Tana search index lags)
  const excluded = getExcludedIds();

  // Deduplicate by node ID — Tana can return the same node multiple times
  // when a task is tagged with both #task and a child supertag (both match hasType)
  const seen = new Set<string>();
  const uniqueNodes = nodes.filter((n: { id: string; inTrash?: boolean }) => {
    if (n.inTrash) return false;
    if (excluded.has(n.id)) return false;
    if (seen.has(n.id)) return false;
    seen.add(n.id);
    return true;
  });

  // Sequential — Tana MCP server doesn't support concurrent requests
  const tasks: TanaTask[] = [];

  for (const node of uniqueNodes) {
    try {
      const md = await mcpCall('tools/call', {
        name: 'read_node',
        arguments: { nodeId: (node as { id: string }).id },
      });
      if (typeof md !== 'string') continue;
      const fields = parseFields(md);
      let cleanName = (node as { id: string; name: string }).name
        .replace(/<span[^>]*>[^<]*<\/span>/g, '')
        .replace(/\s*—\s*$/, '')
        .trim();
      // Strip Tana "show field in name" suffixes — Tana appends field labels and/or values to node names
      cleanName = cleanName.replace(/(?:assigned|status|priority|due date|track)\s*$/i, '').trim();
      if (fields.assigned) cleanName = cleanName.replace(new RegExp(fields.assigned.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$', 'i'), '').trim();
      if (fields.status) cleanName = cleanName.replace(new RegExp(fields.status.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$', 'i'), '').trim();
      if (fields.priority) cleanName = cleanName.replace(new RegExp(fields.priority.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$', 'i'), '').trim();
      tasks.push({ id: (node as { id: string }).id, name: cleanName, ...fields });
    } catch {
      const n = node as { id: string; name: string };
      tasks.push({ id: n.id, name: n.name, status: 'backlog', priority: 'medium', track: 'Uncategorized', trackId: null, assigned: null, dueDate: null });
    }
  }

  return tasks;
}

// --- #workstream fetching ---

export async function getTanaPhases(): Promise<TanaPhase[]> {
  // Search for #workstream parent tag + legacy #phase tag
  const LEGACY_PHASE_TAG = TANA.tags.phaseLegacy;
  // Sequential — Tana MCP server doesn't support concurrent requests
  const wsNodes = await mcpCall('tools/call', {
    name: 'search_nodes',
    arguments: {
      query: {
        and: [
          { hasType: WS_TAG_ID },
          { not: { field: { fieldId: WS_STATUS_FIELD_ID, nodeId: TANA.wsStatusByName.completed } } },
        ],
      },
      limit: 50,
    },
  });
  const legacyNodes = await mcpCall('tools/call', {
    name: 'search_nodes',
    arguments: {
      query: { hasType: LEGACY_PHASE_TAG },
      limit: 50,
    },
  });

  const seen = new Set<string>();
  const nodes: { id: string; name: string }[] = [];
  for (const n of (Array.isArray(wsNodes) ? wsNodes : [])) {
    if (n.docType === 'tagDef') continue; // skip schema tag definitions
    if (n.inTrash) continue;
    if (!seen.has(n.id)) { seen.add(n.id); nodes.push(n); }
  }
  for (const n of (Array.isArray(legacyNodes) ? legacyNodes : [])) {
    if (n.docType === 'tagDef') continue;
    if (n.inTrash) continue;
    if (!seen.has(n.id)) { seen.add(n.id); nodes.push(n); }
  }

  const phases: TanaPhase[] = [];

  for (const node of nodes) {
    try {
      const md = await mcpCall('tools/call', {
        name: 'read_node',
        arguments: { nodeId: node.id, maxDepth: 1 },
      });
      if (typeof md !== 'string') continue;
      const fields = parseWorkstreamFields(md);
      const cleanName = node.name
        .replace(/<span[^>]*>[^<]*<\/span>/g, '')
        .replace(/\s*—\s*$/, '')
        .trim();

      // Extract child task IDs from markdown
      const taskIds: string[] = [];
      const childMatches = md.matchAll(/<!-- node-id: ([\w-]+) -->/g);
      // First match is the workstream node itself, skip it
      let first = true;
      for (const m of childMatches) {
        if (first) { first = false; continue; }
        taskIds.push(m[1]);
      }

      // Skip completed phases (legacy phases not filtered by query)
      if (fields.status === 'completed') continue;
      phases.push({ id: node.id, name: cleanName, ...fields, taskIds });
    } catch {
      // Skip unreadable workstreams
    }
  }

  return phases;
}

// --- #project fetching ---

export async function getTanaProjects(): Promise<TanaProject[]> {
  // Search for active #project nodes
  const nodes = await mcpCall('tools/call', {
    name: 'search_nodes',
    arguments: {
      query: {
        and: [
          { hasType: PROJECT_TAG_ID },
          { field: { fieldId: PROJECT_STATUS_FIELD_ID, nodeId: TANA.projectStatusByName.active } },
        ],
      },
      limit: 50,
    },
  });

  if (!Array.isArray(nodes)) return [];

  const projects: TanaProject[] = [];

  for (const node of nodes) {
    if (node.docType === 'tagDef') continue;
    if (node.inTrash) continue;

    try {
      const md = await mcpCall('tools/call', {
        name: 'read_node',
        arguments: { nodeId: node.id, maxDepth: 2 },
      });
      if (typeof md !== 'string') continue;

      const cleanName = (node.name as string)
        .replace(/<span[^>]*>[^<]*<\/span>/g, '')
        .replace(/\s*—\s*$/, '')
        .trim();

      // Parse start/end dates from timeline (field "**timeline**: X → Y" or plain "Timeline: X → Y")
      let startDate: string | null = null;
      let deadline: string | null = null;

      function parseNaturalDate(raw: string): string | null {
        const trimmed = raw.trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
        const withYear = /,\s*\d{4}$/.test(trimmed) ? trimmed : `${trimmed}, ${new Date().getFullYear()}`;
        const parsed = new Date(withYear);
        if (isNaN(parsed.getTime())) return null;
        const y = parsed.getFullYear();
        const m = String(parsed.getMonth() + 1).padStart(2, '0');
        const d = String(parsed.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
      }

      const timelineMatch = md.match(/\*\*timeline\*\*:\s*(.+?)(?:\s*<!--)/i)
        || md.match(/Timeline:\s*(.+?)(?:\s*<!--)/i);
      if (timelineMatch) {
        const raw = timelineMatch[1].trim();
        const parts = raw.split(/\s*[→\-—]\s*/);
        if (parts.length >= 2) {
          startDate = parseNaturalDate(parts[0]);
          deadline = parseNaturalDate(parts[parts.length - 1]);
        } else if (parts.length === 1) {
          deadline = parseNaturalDate(parts[0]);
        }
      }

      // Extract workstream children (any tag, not just #phase)
      // They appear after **workstream**: at deeper indentation than project-level fields
      const phaseIds: { id: string; name: string }[] = [];
      const wsStart = md.indexOf('**workstream**:');
      if (wsStart !== -1) {
        const wsLines = md.substring(wsStart).split('\n').slice(1);
        for (const line of wsLines) {
          // Stop at project-level siblings (indent <= 2 spaces)
          if (/^\s{0,2}-\s/.test(line)) break;
          // Skip truncation messages and empty lines
          if (/\*\[\.\.\./.test(line) || !line.trim()) continue;
          // Match child: plain "Name #tag <!-- node-id: ID -->" or reference "[Name #tag](tana:ID)"
          const pm = line.match(/- (?:\[[ x]\]\s+)?(.+?)\s+#\w+\s*<!--\s*node-id:\s*([\w-]+)\s*-->/)
            || line.match(/\[(.+?)\s+#\w+\]\(tana:([\w-]+)\)/);
          if (pm) {
            phaseIds.push({ id: pm[2], name: pm[1].replace(/<span[^>]*>[^<]*<\/span>/g, '').trim() });
          }
        }
      }

      // Read each phase node to get status and task counts
      const phases: TanaProject['phases'] = [];
      for (const { id: phaseId, name: pName } of phaseIds) {
        try {
          const phaseMd = await mcpCall('tools/call', {
            name: 'read_node',
            arguments: { nodeId: phaseId, maxDepth: 1 },
          }) as string;
          if (typeof phaseMd !== 'string') continue;

          // Parse status: "**status**: [active](tana:_WTVDkF_TAvO)"
          const statusMatch = phaseMd.match(/\*\*status\*\*:\s*\[([^\]]+)\]\(tana:([\w-]+)\)/);
          let status: 'pending' | 'active' | 'completed' = 'pending';
          if (statusMatch) {
            status = (WS_STATUS_OPTIONS[statusMatch[2]] || 'pending') as 'pending' | 'active' | 'completed';
          }

          // Parse phase dates from **Date**, **timeline**, or plain Timeline fields
          let phaseStart: string | null = null;
          let phaseEnd: string | null = null;

          // Helper: convert "Week N" to ISO date (Monday of that week in current year)
          function weekToDate(weekStr: string, endOfWeek = false): string | null {
            const wm = weekStr.trim().match(/^[Ww]eek\s+(\d+)$/);
            if (!wm) return null;
            const weekNum = parseInt(wm[1], 10);
            if (weekNum < 1 || weekNum > 53) return null;
            // ISO week: Jan 4 is always in week 1
            const year = new Date().getFullYear();
            const jan4 = new Date(year, 0, 4);
            const dayOfWeek = jan4.getDay() || 7; // Mon=1..Sun=7
            const week1Monday = new Date(jan4);
            week1Monday.setDate(jan4.getDate() - dayOfWeek + 1);
            const target = new Date(week1Monday);
            target.setDate(week1Monday.getDate() + (weekNum - 1) * 7 + (endOfWeek ? 6 : 0));
            const y = target.getFullYear();
            const m = String(target.getMonth() + 1).padStart(2, '0');
            const d = String(target.getDate()).padStart(2, '0');
            return `${y}-${m}-${d}`;
          }

          const phaseDateMatch = phaseMd.match(/\*\*(?:Date|timeline)\*\*:\s*(.+?)(?:\s*<!--)/i)
            || phaseMd.match(/(?:Date|Timeline):\s*(.+?)(?:\s*<!--)/i);
          if (phaseDateMatch) {
            const rawTl = phaseDateMatch[1].trim();
            const tlParts = rawTl.split(/\s*[→\-—]\s*/);
            if (tlParts.length >= 2) {
              phaseStart = weekToDate(tlParts[0]) || parseNaturalDate(tlParts[0]);
              phaseEnd = weekToDate(tlParts[tlParts.length - 1], true) || parseNaturalDate(tlParts[tlParts.length - 1]);
            } else if (tlParts.length === 1) {
              // Single value: if it's a week, span the full week
              const ws = weekToDate(tlParts[0]);
              const we = weekToDate(tlParts[0], true);
              if (ws && we) {
                phaseStart = ws;
                phaseEnd = we;
              } else {
                phaseEnd = parseNaturalDate(tlParts[0]);
              }
            }
          }

          // Count task checkboxes (exclude the phase's own checkbox)
          const doneMatches = phaseMd.match(/- \[x\].*#task/g);
          const todoMatches = phaseMd.match(/- \[ \].*#task/g);
          const doneCount = doneMatches ? doneMatches.length : 0;
          const taskCount = doneCount + (todoMatches ? todoMatches.length : 0);

          phases.push({ id: phaseId, name: pName, status, taskCount, doneCount, startDate: phaseStart, endDate: phaseEnd });
        } catch {
          phases.push({ id: phaseId, name: pName, status: 'pending', taskCount: 0, doneCount: 0, startDate: null, endDate: null });
        }
      }

      // Find most recent #log entry for this project's track (skip old "Log" titled nodes)
      let lastActivity: TanaProject['lastActivity'] = null;
      try {
        const logNodes = await mcpCall('tools/call', {
          name: 'search_nodes',
          arguments: {
            query: {
              and: [
                { hasType: LOG_TAG_ID },
                { field: { fieldId: TRACK_FIELD_ID, nodeId: node.id } },
              ],
            },
            limit: 5,
          },
        });
        if (Array.isArray(logNodes)) {
          for (const logNode of logNodes) {
            const logName = (logNode.name as string)
              .replace(/<span[^>]*>[^<]*<\/span>/g, '')
              .replace(/\s*—\s*$/, '')
              .trim();
            // Skip old "Log" titled nodes (generic wrapper pattern)
            if (logName === 'Log' || logName === '') continue;
            const logDateMatch = logName.match(/^(\w+ \d+)/);
            const logDate = logDateMatch ? logDateMatch[1] : '';
            lastActivity = { date: logDate, summary: logName };
            break;
          }
        }
      } catch {
        // Log lookup failed, skip
      }

      projects.push({
        id: node.id,
        name: cleanName,
        trackId: node.id,
        startDate,
        deadline,
        phases,
        lastActivity,
      });
    } catch {
      // Skip unreadable project nodes
    }
  }

  return projects;
}

// ── Class prep ───────────────────────────────────────────────────────────────

function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseClassDate(raw: string): string | null {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Handle relative words from Tana: "Today", "Tomorrow", "Yesterday"
  const lower = raw.toLowerCase().trim();
  if (lower === 'today') return localDateStr(today);
  if (lower === 'tomorrow') {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return localDateStr(d);
  }
  if (lower === 'yesterday') {
    const d = new Date(today);
    d.setDate(d.getDate() - 1);
    return localDateStr(d);
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const withYear = /,\s*\d{4}$/.test(raw) ? raw : `${raw}, ${today.getFullYear()}`;
  const parsed = new Date(withYear);
  if (!isNaN(parsed.getTime())) return localDateStr(parsed);
  return null;
}

function parseClassFields(markdown: string): {
  course: string; courseId: string | null; date: string | null; number: number | null;
} {
  let course = '';
  let courseId: string | null = null;
  let date: string | null = null;
  let number: number | null = null;

  const courseMatch = markdown.match(/\*\*course\*\*:\s*\[([^\]]+?)(?:\s*#[^\]]+)?\]\(tana:([\w-]+)\)/);
  if (courseMatch) { course = courseMatch[1].trim(); courseId = courseMatch[2]; }

  // Full date field content (everything after "Date**: " up to next newline or <!-- )
  const dateLineMatch = markdown.match(/\*\*Date\*\*:\s*([^\n<]+)/i);
  if (dateLineMatch) {
    const dateLine = dateLineMatch[1].trim();
    // Strip time portion: "Tomorrow, 14:40 → 16:30" -> "Tomorrow"
    // "Mon, Mar 5, 14:40 → 16:30" -> "Mon, Mar 5"
    // "Mar 5, 2026, 14:40" -> "Mar 5, 2026"
    const withoutTime = dateLine.replace(/,?\s*\d{1,2}:\d{2}.*$/, '').trim();
    // Strip leading weekday if followed by month name: "Mon, Mar 5" -> "Mar 5"
    const stripped = withoutTime.replace(/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s*/i, '').trim();
    date = parseClassDate(stripped);
  }

  const numMatch = markdown.match(/\*\*number\*\*:\s*(\d+)/i);
  if (numMatch) number = parseInt(numMatch[1], 10);

  return { course, courseId, date, number };
}

function parseChecklist(markdown: string): ChecklistItem[] {
  // Each <!-- node-id: X --> comment appears inline at the end of its own line.
  // Parse line-by-line and associate the ID with the todo on that same line.
  const lines = markdown.split('\n');
  const allItems: { id: string; text: string; checked: boolean; indentLevel: number }[] = [];

  for (const line of lines) {
    const nodeIdMatch = line.match(/<!-- node-id: ([\w-]+) -->/);
    if (!nodeIdMatch) continue;
    const nodeId = nodeIdMatch[1];
    const cleanLine = line.replace(/\s*<!-- node-id: [\w-]+ -->/, '').trimEnd();
    const m = cleanLine.match(/^(\s*)- \[( |x)\] (.+)$/);
    if (m) allItems.push({ id: nodeId, text: m[3].trim(), checked: m[2] === 'x', indentLevel: m[1].length });
  }

  if (allItems.length === 0) return [];

  // Known group headers by text pattern — skip them and use as group transitions.
  // Children (deeper indent) inherit the current group.
  // "prep tasks" covers the supertag-template container structure; "prep lesson" covers the attached checklist structure.
  const GROUP_HEADERS: { pattern: RegExp; group: 'prep' | 'post-lesson' }[] = [
    { pattern: /prep lesson/i, group: 'prep' },
    { pattern: /prep tasks?/i, group: 'prep' },
    { pattern: /post.?lesson/i, group: 'post-lesson' },
  ];

  // Find the indent level of group headers (the level below the class node itself)
  const groupHeaderLevel = allItems
    .filter(i => GROUP_HEADERS.some(g => g.pattern.test(i.text)))
    .reduce((min, i) => Math.min(min, i.indentLevel), Infinity);

  let currentGroup: 'prep' | 'post-lesson' | null = null;
  let inTemplateContainer = false; // true when inside a non-group-header node at groupHeaderLevel (e.g. "prep tasks")
  const result: ChecklistItem[] = [];

  for (const item of allItems) {
    // Skip the class node itself
    if (item.indentLevel < groupHeaderLevel) continue;

    const headerMatch = GROUP_HEADERS.find(g => g.pattern.test(item.text));

    if (item.indentLevel === groupHeaderLevel) {
      if (headerMatch) {
        // Real group header — update group, exit any template container
        currentGroup = headerMatch.group;
        inTemplateContainer = false;
      } else {
        // Non-group-header at this level (e.g. "prep tasks") — treat as template container, skip it and its subtree
        inTemplateContainer = true;
      }
      continue;
    }

    // Skip anything inside a template container
    if (inTemplateContainer) continue;

    result.push({ id: item.id, text: item.text, checked: item.checked, group: currentGroup });
  }

  return result;
}

const STANDARD_CLASS_CHECKLIST = `- [ ] prep lesson
  - [ ] send readings + SUCourse announcement
  - [ ] prep content
  - [ ] prep slides
  - [ ] prep activities
  - [ ] create SUCourse hidden folder + pending tasks
  - [ ] rehearse
- [ ] post-lesson review
  - [ ] upload slides
  - [ ] update activity report
  - [ ] review workshop node
  - [ ] check submissions`;

async function attachChecklistToClass(nodeId: string): Promise<string> {
  await mcpCall('tools/call', {
    name: 'import_tana_paste',
    arguments: { parentNodeId: nodeId, content: STANDARD_CLASS_CHECKLIST },
  });
  const md = await mcpCall('tools/call', {
    name: 'read_node',
    arguments: { nodeId, maxDepth: 3 },
  });
  return typeof md === 'string' ? md : '';
}

export async function getClassNodes(): Promise<ClassPrepNode[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() + 90); // show up to ~3 months ahead

  const nodes = await mcpCall('tools/call', {
    name: 'search_nodes',
    arguments: { query: { hasType: CLASS_TAG_ID }, limit: 100 },
  });

  if (!Array.isArray(nodes)) return [];

  const classes: ClassPrepNode[] = [];

  for (const node of nodes) {
    if (node.docType === 'tagDef') continue;
    try {
      const md = await mcpCall('tools/call', {
        name: 'read_node',
        arguments: { nodeId: node.id, maxDepth: 3 },
      });
      if (typeof md !== 'string') continue;

      const fields = parseClassFields(md);

      // Filter: only upcoming classes within 90 days
      if (!fields.date) continue;
      const classDate = new Date(fields.date + 'T00:00:00');
      if (classDate < today || classDate > cutoff) continue;

      const rawNodeName = (node.name as string);
      // Extract lesson number from name pattern if not in number field
      const lessonNumFromName = rawNodeName.match(/(\d+)\.lesson/i);
      const lessonNumber = fields.number ?? (lessonNumFromName ? parseInt(lessonNumFromName[1]) : null);

      const cleanName = rawNodeName
        .replace(/<span[^>]*>[^<]*<\/span>/g, '')
        // Strip ALL lesson suffix patterns (handles duplicates like "4.lesson 4.lesson",
        // unresolved templates like "number.lesson", "__number__.lesson")
        .replace(/(\s+(?:\d+|number|__number__)\.lesson)+$/gi, '')
        // Strip leading course-code prefix like "VA 315/515 — " or "VAVCD — "
        .replace(/^[A-Z][A-Z0-9/\s]*\s*—\s*/, '')
        .replace(/\s*—\s*$/, '')
        .trim() || rawNodeName.trim();

      let checklist = parseChecklist(md);

      // Auto-attach standard checklist if missing (handles calendar-synced nodes).
      // Guard: check actual direct children to see if prep/post-lesson nodes already exist.
      // Both "prep tasks" (supertag template container) and "prep lesson" (attached checklist header)
      // count as valid checklist roots.
      if (checklist.length === 0) {
        const childrenResult = await mcpCall('tools/call', {
          name: 'get_children',
          arguments: { nodeId: node.id, limit: 50 },
        });
        const childList: { name: string; docType: string }[] = Array.isArray(childrenResult?.children) ? childrenResult.children : [];
        const hasDirectChecklist = childList.some(
          c => c.docType === 'content' && (/prep tasks?/i.test(c.name) || /prep lesson/i.test(c.name) || /post[\s-]?lesson/i.test(c.name))
        );
        if (!hasDirectChecklist) {
          const freshMd = await attachChecklistToClass(node.id);
          if (freshMd) checklist = parseChecklist(freshMd);
        }
      }

      classes.push({
        id: node.id,
        name: cleanName,
        ...fields,
        number: lessonNumber,
        checklist,
        totalItems: checklist.length,
        checkedItems: checklist.filter(i => i.checked).length,
      });
    } catch {
      // Skip unreadable class nodes
    }
  }

  // Sort by date ascending
  classes.sort((a, b) => {
    if (!a.date) return 1;
    if (!b.date) return -1;
    return a.date.localeCompare(b.date);
  });

  return classes;
}

/** Toggle a class checklist item (plain todo node, not #task) */
export async function toggleClassItem(nodeId: string, checked: boolean): Promise<void> {
  const tool = checked ? 'check_node' : 'uncheck_node';
  await mcpCall('tools/call', { name: tool, arguments: { nodeId } });
}

/** Check all remaining unchecked checklist items for a class node. Returns count checked. */
export async function checkRemainingPrepItems(classNodeId: string): Promise<number> {
  const md = await mcpCall('tools/call', {
    name: 'read_node',
    arguments: { nodeId: classNodeId, maxDepth: 3 },
  });
  if (typeof md !== 'string') return 0;
  const checklist = parseChecklist(md);
  const toCheck = checklist.filter(i => !i.checked);
  for (const item of toCheck) {
    await mcpCall('tools/call', { name: 'check_node', arguments: { nodeId: item.id } });
  }
  return toCheck.length;
}
