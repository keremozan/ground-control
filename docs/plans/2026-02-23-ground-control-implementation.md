# Ground Control Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Next.js dashboard (ground-control) that replaces the prototype and old Express dashboard, wiring real character dispatch, SSE streaming, and live data.

**Architecture:** Next.js 15 App Router with Node.js API routes. Character configs loaded from `~/.claude/characters/` as a singleton. Tasks dispatch `claude` CLI subprocesses, streaming output back as SSE. UI ported from `dashboard-prototype/` with mock-data replaced by real API calls.

**Tech Stack:** Next.js 15, TypeScript, React 19, Lucide icons, IBM Plex Mono / Bricolage Grotesque fonts

**Source references:**
- UI to port: `~/Projects/dashboard-prototype/`
- Backend logic to port: `~/Projects/claude-dashboard/server.js` (lines 1-160 for loaders, 1037-1106 for SSE spawn, 1513-1580 for message parsing)
- Character configs: `~/.claude/characters/{core,meta,stationed}/*.json`
- Skills: `~/.claude/skills/`
- Shared knowledge: `~/.claude/shared/`
- Claude binary: `~/.local/bin/claude`

---

## Task 1: Scaffold Next.js project

**Files:**
- Create: everything under `~/Projects/ground-control/`

**Step 1: Scaffold inside existing repo**

```bash
cd ~/Projects/ground-control
npx create-next-app@latest . --typescript --no-tailwind --app --no-src-dir --import-alias="@/*" --no-eslint
```

When asked about existing files, choose to merge/continue.

**Step 2: Verify it runs**

```bash
cd ~/Projects/ground-control
npm run dev
```

Expected: Next.js dev server at localhost:3000

**Step 3: Commit**

```bash
git add -A
git commit -m "scaffold: next.js 15 project"
```

---

## Task 2: Port CSS and layout from prototype

**Files:**
- Replace: `app/globals.css` (copy from dashboard-prototype)
- Replace: `app/layout.tsx` (copy from dashboard-prototype)
- Create: `lib/char-icons.ts` (copy from dashboard-prototype)

**Step 1: Copy globals.css**

Copy `~/Projects/dashboard-prototype/app/globals.css` to `app/globals.css` verbatim.

**Step 2: Copy layout.tsx**

Copy `~/Projects/dashboard-prototype/app/layout.tsx` to `app/layout.tsx` verbatim.

**Step 3: Copy char-icons.ts**

```bash
cp ~/Projects/dashboard-prototype/lib/char-icons.ts lib/char-icons.ts
```

**Step 4: Replace app/page.tsx with placeholder**

```tsx
export default function Home() {
  return <div style={{ padding: 20, fontFamily: "var(--font-mono)" }}>Ground Control</div>;
}
```

**Step 5: Verify styles load**

```bash
npm run dev
```

Open localhost:3000 — should show "Ground Control" in IBM Plex Mono on the correct background color (`#f4f3ef`).

**Step 6: Commit**

```bash
git add -A
git commit -m "port: css, layout, char-icons from prototype"
```

---

## Task 3: Implement lib/characters.ts

**Files:**
- Create: `lib/characters.ts`

This is the singleton loader. Reads all JSON configs + memory files from `~/.claude/characters/`.

**Step 1: Create lib/characters.ts**

```ts
import fs from 'fs';
import path from 'path';

export type Character = {
  id: string;
  name: string;
  tier: 'core' | 'meta' | 'stationed';
  color: string;
  defaultModel?: string;
  systemPrompt?: string;
  skills?: string[];
  modifiers?: string[];
  sharedKnowledge?: string[];
  knowledgeFile?: string;
  memory: string;
};

const HOME = process.env.HOME || '/Users/keremozanbayraktar';
const CHARACTERS_DIR = path.join(HOME, '.claude', 'characters');

let _cache: Record<string, Character> | null = null;

export function getCharacters(): Record<string, Character> {
  if (_cache) return _cache;

  const result: Record<string, Character> = {};

  for (const tier of ['core', 'meta', 'stationed'] as const) {
    const dir = path.join(CHARACTERS_DIR, tier);
    try {
      for (const f of fs.readdirSync(dir)) {
        if (!f.endsWith('.json')) continue;
        const id = f.replace(/\.json$/, '');
        if (id === 'TEMPLATE') continue;
        try {
          const config = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'));
          if (!config.name) continue;
          const memPath = path.join(dir, config.memoryFile || `${id}.memory.md`);
          let memory = '';
          try { memory = fs.readFileSync(memPath, 'utf-8'); } catch {}
          result[id] = { ...config, id, tier, memory };
        } catch {}
      }
    } catch {}
  }

  _cache = result;
  return result;
}

export function getCharacterList(): Character[] {
  return Object.values(getCharacters());
}
```

**Step 2: Verify it works (quick Node test)**

```bash
node -e "const {getCharacterList} = require('./lib/characters.ts'); console.log(getCharacterList().map(c=>c.name))"
```

Note: if TypeScript compilation needed, just verify it compiles cleanly with `npx tsc --noEmit` instead.

**Step 3: Commit**

```bash
git add lib/characters.ts
git commit -m "feat: character singleton loader"
```

---

## Task 4: Implement lib/skills.ts

**Files:**
- Create: `lib/skills.ts`

**Step 1: Create lib/skills.ts**

```ts
import fs from 'fs';
import path from 'path';

const HOME = process.env.HOME || '/Users/keremozanbayraktar';
const SKILLS_DIR = path.join(HOME, '.claude', 'skills');

export function readSkill(name: string): string | null {
  const p = path.join(SKILLS_DIR, name, 'SKILL.md');
  try { return fs.readFileSync(p, 'utf-8'); } catch { return null; }
}
```

**Step 2: Commit**

```bash
git add lib/skills.ts
git commit -m "feat: skill reader"
```

---

## Task 5: Implement lib/shared.ts

**Files:**
- Create: `lib/shared.ts`

**Step 1: Create lib/shared.ts**

```ts
import fs from 'fs';
import path from 'path';

const HOME = process.env.HOME || '/Users/keremozanbayraktar';
const SHARED_DIR = path.join(HOME, '.claude', 'shared');

let _cache: Record<string, string> | null = null;

export function getSharedKnowledge(): Record<string, string> {
  if (_cache) return _cache;
  const result: Record<string, string> = {};
  try {
    for (const f of fs.readdirSync(SHARED_DIR)) {
      if (!f.endsWith('.md')) continue;
      const key = f.replace(/\.md$/, '');
      try { result[key] = fs.readFileSync(path.join(SHARED_DIR, f), 'utf-8'); } catch {}
    }
  } catch {}
  _cache = result;
  return result;
}
```

**Step 2: Commit**

```bash
git add lib/shared.ts
git commit -m "feat: shared knowledge loader"
```

---

## Task 6: Implement lib/prompt.ts

**Files:**
- Create: `lib/prompt.ts`

Port `buildPrompt` and `buildCharacterPrompt` from `~/Projects/claude-dashboard/server.js` lines 70-137.

**Step 1: Create lib/prompt.ts**

```ts
import path from 'path';
import fs from 'fs';
import { getCharacters } from './characters';
import { readSkill } from './skills';
import { getSharedKnowledge } from './shared';

const HOME = process.env.HOME || '/Users/keremozanbayraktar';
const CHARACTERS_DIR = path.join(HOME, '.claude', 'characters');

export function buildPrompt(skillName: string | null, extra?: string): string {
  const sharedKnowledge = getSharedKnowledge();
  const tanaIds = sharedKnowledge['tana-ids'] || '';

  if (!skillName) return extra || '';
  const skill = readSkill(skillName);
  if (!skill) return extra || '';

  const needsTana = skill.includes('tana-ids.md') || skill.includes('Tana');
  let prompt = `You are Kerem's personal assistant. Execute the following task fully and autonomously. Do not ask for confirmation — just do it and report results.\n\n${skill}`;
  if (needsTana && tanaIds) prompt += `\n\n---\n\n${tanaIds}`;
  if (extra) prompt += `\n\n---\n\nAdditional context: ${extra}`;
  return prompt;
}

export function buildCharacterPrompt(characterId: string, taskContext?: string): string {
  const characters = getCharacters();
  const sharedKnowledge = getSharedKnowledge();
  const char = characters[characterId];
  if (!char) return buildPrompt(null, taskContext);

  let prompt = (char.systemPrompt || '') + '\n';

  if (char.sharedKnowledge?.length) {
    for (const key of char.sharedKnowledge) {
      if (sharedKnowledge[key]) prompt += `\n---\n\n${sharedKnowledge[key]}`;
    }
  }

  if (char.memory?.trim()) {
    prompt += `\n\n---\n\n## Memory\n${char.memory}`;
  }

  if (char.knowledgeFile) {
    const knowledgePath = path.join(CHARACTERS_DIR, char.tier, char.knowledgeFile);
    try {
      const knowledge = fs.readFileSync(knowledgePath, 'utf-8');
      if (knowledge.trim()) prompt += `\n\n---\n\n## Domain Knowledge\n${knowledge}`;
    } catch {}
  }

  if (char.skills?.length) {
    for (const skillName of char.skills) {
      const skill = readSkill(skillName);
      if (skill) prompt += `\n\n---\n\n${skill}`;
    }
  }

  if (char.modifiers?.length) {
    for (const mod of char.modifiers) {
      const skill = readSkill(mod);
      if (skill) prompt += `\n\n---\n\n${skill}`;
    }
  }

  const needsTana = prompt.includes('tana-ids.md') || prompt.includes('Tana');
  if (needsTana && sharedKnowledge['tana-ids']) {
    prompt += `\n\n---\n\n${sharedKnowledge['tana-ids']}`;
  }

  if (taskContext) {
    prompt += `\n\n---\n\n## Task\n${taskContext}`;
  }

  return prompt;
}
```

**Step 2: Commit**

```bash
git add lib/prompt.ts
git commit -m "feat: prompt builder (port from claude-dashboard)"
```

---

## Task 7: Implement lib/tasks.ts

**Files:**
- Create: `lib/tasks.ts`

Port the TASKS map from `~/Projects/claude-dashboard/server.js` lines 156+, but remap character IDs to the current roster (check `~/.claude/characters/core/` for actual filenames — use the JSON filename without extension as the ID).

**Step 1: Check current character IDs**

```bash
ls ~/.claude/characters/core/ ~/.claude/characters/meta/
```

Note the JSON filenames — those are the character IDs to use.

**Step 2: Create lib/tasks.ts**

```ts
import { buildCharacterPrompt } from './prompt';

export type Task = {
  label: string;
  description: string;
  category: 'email' | 'tana' | 'calendar' | 'research' | 'admin';
  character: string;
  model: string;
  maxTurns: number;
  prompt: () => string;
};

export const TASKS: Record<string, Task> = {
  'scan-inbox': {
    label: 'Scan Inbox',
    description: 'Scan both Gmail accounts for actionable emails',
    category: 'email',
    character: 'postman',
    model: 'haiku',
    maxTurns: 20,
    prompt: () => buildCharacterPrompt('postman', 'Run postman-scan-mail skill. Push all detected tasks automatically without asking.'),
  },
  'process-day': {
    label: 'Process Day',
    description: "Tag untagged nodes on today's Tana day page",
    category: 'tana',
    character: 'postman',
    model: 'haiku',
    maxTurns: 15,
    prompt: () => buildCharacterPrompt('postman', 'Run postman-scan-tana skill. Apply all classifications automatically.'),
  },
  'calendar-prep': {
    label: 'Calendar Prep',
    description: "Check calendar for the week ahead",
    category: 'calendar',
    character: 'scholar',
    model: 'sonnet',
    maxTurns: 10,
    prompt: () => buildCharacterPrompt('scholar', 'Run calendar skill. Check Google Calendar for events from today through end of week. Group by day, highlight conflicts or prep needed.'),
  },
  'scan-whatsapp': {
    label: 'Scan WhatsApp',
    description: 'Scan monitored WhatsApp chats for actionable messages',
    category: 'email',
    character: 'postman',
    model: 'haiku',
    maxTurns: 15,
    prompt: () => buildCharacterPrompt('postman', 'Run postman-scan-whatsapp skill.'),
  },
  'ta-briefing': {
    label: 'TA Briefing',
    description: 'Draft briefing emails for teaching assistants',
    category: 'email',
    character: 'proctor',
    model: 'sonnet',
    maxTurns: 15,
    prompt: () => buildCharacterPrompt('proctor', 'Run proctor-ta-ops skill. Draft briefing emails for teaching assistants.'),
  },
  'oracle-review': {
    label: 'Oracle Review',
    description: 'Strategic review of recent activity',
    category: 'research',
    character: 'oracle',
    model: 'opus',
    maxTurns: 20,
    prompt: () => buildCharacterPrompt('oracle', 'Do a comprehensive review of recent activity across Tana, email, and calendar. Surface patterns, risks, and recommendations.'),
  },
};

// Maps frontend action names to character IDs
export const ACTION_CHARACTERS: Record<string, string> = {
  'reply': 'postman',
  'task': 'postman',
  'schedule': 'scholar',
  'archive': 'postman',
  'summarize': 'postman',
};
```

**Note:** Character IDs must match the actual JSON filenames in `~/.claude/characters/`. Update the task character fields if they don't match.

**Step 3: Commit**

```bash
git add lib/tasks.ts
git commit -m "feat: task definitions (port + remap to current character roster)"
```

---

## Task 8: Implement lib/spawn.ts

**Files:**
- Create: `lib/spawn.ts`

The SSE spawn helper. Port from `~/Projects/claude-dashboard/server.js` lines 1037-1106 and 1513-1580, adapted for Next.js `ReadableStream`.

**Step 1: Create lib/spawn.ts**

```ts
import { spawn } from 'child_process';
import path from 'path';

const HOME = process.env.HOME || '/Users/keremozanbayraktar';
const CLAUDE_BIN = path.join(HOME, '.local', 'bin', 'claude');
const MCP_CONFIG = path.join(HOME, 'Projects', 'ground-control', 'mcp-tasks.json');

export type SSEEvent =
  | { event: 'status'; data: { state: string; label: string; character?: string } }
  | { event: 'text'; data: { text: string } }
  | { event: 'tool_call'; data: { tool: string; input: string } }
  | { event: 'tool_result'; data: { id: string; preview: string } }
  | { event: 'done'; data: { code: number | null } };

function handleMessage(msg: Record<string, unknown>, enqueue: (e: SSEEvent) => void) {
  switch (msg.type) {
    case 'assistant': {
      const content = (msg.message as { content?: unknown[] })?.content;
      if (!Array.isArray(content)) break;
      for (const block of content) {
        const b = block as Record<string, unknown>;
        if (b.type === 'text') {
          enqueue({ event: 'text', data: { text: b.text as string } });
        } else if (b.type === 'tool_use') {
          enqueue({ event: 'tool_call', data: { tool: b.name as string, input: String(b.input).slice(0, 200) } });
        }
      }
      break;
    }
    case 'user': {
      const content = (msg.message as { content?: unknown[] })?.content;
      if (!Array.isArray(content)) break;
      for (const block of content) {
        const b = block as Record<string, unknown>;
        if (b.type === 'tool_result') {
          const preview = typeof b.content === 'string'
            ? (b.content as string).slice(0, 200)
            : JSON.stringify(b.content).slice(0, 200);
          enqueue({ event: 'tool_result', data: { id: b.tool_use_id as string, preview } });
        }
      }
      break;
    }
  }
}

export function spawnSSEStream(opts: {
  prompt: string;
  model: string;
  maxTurns: number;
  label: string;
  characterId?: string;
}): ReadableStream<Uint8Array> {
  const { prompt, model, maxTurns, label, characterId } = opts;
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    start(controller) {
      const enqueue = (e: SSEEvent) => {
        const line = `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`;
        try { controller.enqueue(encoder.encode(line)); } catch {}
      };

      enqueue({ event: 'status', data: { state: 'starting', label, character: characterId } });

      const env = { ...process.env };
      delete env.CLAUDECODE;

      const args = [
        '-p', prompt,
        '--output-format', 'stream-json',
        '--verbose',
        '--model', model,
        '--max-turns', String(maxTurns),
        '--dangerously-skip-permissions',
        '--mcp-config', MCP_CONFIG,
      ];

      const proc = spawn(CLAUDE_BIN, args, { cwd: HOME, env: env as NodeJS.ProcessEnv, stdio: ['ignore', 'pipe', 'pipe'] });
      let buffer = '';

      proc.stdout?.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try { handleMessage(JSON.parse(line), enqueue); } catch {}
        }
      });

      proc.on('close', (code) => {
        if (buffer.trim()) {
          try { handleMessage(JSON.parse(buffer), enqueue); } catch {}
        }
        enqueue({ event: 'done', data: { code } });
        try { controller.close(); } catch {}
      });
    },
  });
}
```

**Step 2: Create mcp-tasks.json at project root**

```json
{
  "mcpServers": {}
}
```

This is intentionally empty — the `claude` CLI will use its own MCP config (from `~/.claude/`) for Tana, Gmail, Calendar etc. This file is only needed if you want to add extra MCP servers specifically for task dispatch.

**Step 3: Commit**

```bash
git add lib/spawn.ts mcp-tasks.json
git commit -m "feat: SSE spawn helper (port from claude-dashboard)"
```

---

## Task 9: API route — GET /api/characters

**Files:**
- Create: `app/api/characters/route.ts`

**Step 1: Create route**

```ts
export const runtime = 'nodejs';
import { getCharacterList } from '@/lib/characters';

export function GET() {
  const characters = getCharacterList().map(c => ({
    id: c.id,
    name: c.name,
    tier: c.tier,
    color: c.color,
    defaultModel: c.defaultModel,
  }));
  return Response.json({ characters });
}
```

**Step 2: Test**

```bash
curl http://localhost:3000/api/characters
```

Expected: JSON with array of character objects, each with id, name, tier, color.

**Step 3: Commit**

```bash
git add app/api/characters/route.ts
git commit -m "feat: GET /api/characters"
```

---

## Task 10: API route — GET /api/tasks

**Files:**
- Create: `app/api/tasks/route.ts`

**Step 1: Create route**

```ts
export const runtime = 'nodejs';
import { TASKS } from '@/lib/tasks';

export function GET() {
  const tasks = Object.entries(TASKS).map(([id, t]) => ({
    id,
    label: t.label,
    description: t.description,
    category: t.category,
    character: t.character,
    model: t.model,
  }));
  return Response.json({ tasks });
}
```

**Step 2: Test**

```bash
curl http://localhost:3000/api/tasks
```

Expected: JSON with array of task objects grouped (or flat — frontend groups by category).

**Step 3: Commit**

```bash
git add app/api/tasks/route.ts
git commit -m "feat: GET /api/tasks"
```

---

## Task 11: API route — POST /api/task/[taskId] (SSE)

**Files:**
- Create: `app/api/task/[taskId]/route.ts`

**Step 1: Create route**

```ts
export const runtime = 'nodejs';
import { TASKS } from '@/lib/tasks';
import { spawnSSEStream } from '@/lib/spawn';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  const task = TASKS[taskId];
  if (!task) {
    return new Response('Task not found', { status: 404 });
  }

  const stream = spawnSSEStream({
    prompt: task.prompt(),
    model: task.model,
    maxTurns: task.maxTurns,
    label: task.label,
    characterId: task.character,
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
```

**Step 2: Test SSE dispatch**

```bash
curl -X POST http://localhost:3000/api/task/scan-inbox -N
```

Expected: SSE stream starting with `event: status\ndata: {"state":"starting",...}` then text/tool events, ending with `event: done`.

Note: This will actually spawn Claude and run the task. Use a cheap/fast task for testing.

**Step 3: Commit**

```bash
git add app/api/task/
git commit -m "feat: POST /api/task/[taskId] SSE dispatch"
```

---

## Task 12: API route — POST /api/chat (SSE)

**Files:**
- Create: `app/api/chat/route.ts`

**Step 1: Create route**

```ts
export const runtime = 'nodejs';
import { buildCharacterPrompt } from '@/lib/prompt';
import { getCharacters } from '@/lib/characters';
import { spawnSSEStream } from '@/lib/spawn';

export async function POST(req: Request) {
  const { characterId, message } = await req.json() as { characterId: string; message: string };

  const characters = getCharacters();
  const char = characters[characterId];
  if (!char) {
    return new Response('Character not found', { status: 404 });
  }

  const prompt = buildCharacterPrompt(characterId, message);
  const stream = spawnSSEStream({
    prompt,
    model: char.defaultModel || 'sonnet',
    maxTurns: 10,
    label: `Chat: ${char.name}`,
    characterId,
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
```

**Step 2: Test**

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"characterId":"scholar","message":"Say hello in one sentence."}' \
  -N
```

Expected: SSE stream with text from Scholar character.

**Step 3: Commit**

```bash
git add app/api/chat/route.ts
git commit -m "feat: POST /api/chat SSE"
```

---

## Task 13: API route — POST /api/action (SSE)

**Files:**
- Create: `app/api/action/route.ts`

For email item actions (Reply, Task, Schedule, Archive, Summarize).

**Step 1: Create route**

```ts
export const runtime = 'nodejs';
import { ACTION_CHARACTERS } from '@/lib/tasks';
import { buildCharacterPrompt } from '@/lib/prompt';
import { getCharacters } from '@/lib/characters';
import { spawnSSEStream } from '@/lib/spawn';

const ACTION_PROMPTS: Record<string, (email: { from: string; subject: string }) => string> = {
  'reply': (e) => `Draft a reply to this email.\n\nFrom: ${e.from}\nSubject: ${e.subject}`,
  'task': (e) => `Extract actionable tasks from this email and push them to Tana.\n\nFrom: ${e.from}\nSubject: ${e.subject}`,
  'schedule': (e) => `Create a calendar event or reminder from this email.\n\nFrom: ${e.from}\nSubject: ${e.subject}`,
  'archive': (e) => `Archive this email.\n\nFrom: ${e.from}\nSubject: ${e.subject}`,
  'summarize': (e) => `Summarize this email in 2-3 sentences.\n\nFrom: ${e.from}\nSubject: ${e.subject}`,
};

export async function POST(req: Request) {
  const { action, email } = await req.json() as {
    action: string;
    email: { from: string; subject: string; account: string };
  };

  const characterId = ACTION_CHARACTERS[action] || 'postman';
  const characters = getCharacters();
  const char = characters[characterId];
  const promptFn = ACTION_PROMPTS[action];

  if (!promptFn) {
    return new Response('Unknown action', { status: 400 });
  }

  const taskContext = promptFn(email);
  const prompt = buildCharacterPrompt(characterId, taskContext);

  const stream = spawnSSEStream({
    prompt,
    model: char?.defaultModel || 'sonnet',
    maxTurns: 10,
    label: `${action}: ${email.from}`,
    characterId,
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
```

**Step 2: Commit**

```bash
git add app/api/action/route.ts
git commit -m "feat: POST /api/action SSE (email actions)"
```

---

## Task 14: Create lib/useSSE.ts hook

**Files:**
- Create: `lib/useSSE.ts`

Shared React hook for consuming SSE streams in components.

**Step 1: Create hook**

```ts
import { useState, useCallback, useRef } from 'react';

export type SSEMessage =
  | { event: 'status'; data: { state: string; label: string; character?: string } }
  | { event: 'text'; data: { text: string } }
  | { event: 'tool_call'; data: { tool: string; input: string } }
  | { event: 'tool_result'; data: { id: string; preview: string } }
  | { event: 'done'; data: { code: number | null } };

export function useSSE() {
  const [messages, setMessages] = useState<SSEMessage[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const readerRef = useRef<ReadableStreamDefaultReader | null>(null);

  const dispatch = useCallback(async (url: string, body: unknown) => {
    if (isRunning) return;
    setIsRunning(true);
    setMessages([]);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.body) throw new Error('No response body');
      const reader = res.body.getReader();
      readerRef.current = reader;
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events from buffer
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';

        for (const part of parts) {
          const eventMatch = part.match(/^event: (\w+)/m);
          const dataMatch = part.match(/^data: (.+)/m);
          if (!eventMatch || !dataMatch) continue;
          try {
            const msg = { event: eventMatch[1], data: JSON.parse(dataMatch[1]) } as SSEMessage;
            setMessages(prev => [...prev, msg]);
            if (msg.event === 'done') setIsRunning(false);
          } catch {}
        }
      }
    } catch {
      setIsRunning(false);
    }
  }, [isRunning]);

  const cancel = useCallback(() => {
    readerRef.current?.cancel();
    setIsRunning(false);
  }, []);

  return { messages, isRunning, dispatch, cancel };
}
```

**Step 2: Commit**

```bash
git add lib/useSSE.ts
git commit -m "feat: useSSE hook for streaming API responses"
```

---

## Task 15: Port home components from prototype

**Files:**
- Copy entire `components/home/` from dashboard-prototype
- Copy `components/pipeline/` from dashboard-prototype
- Copy `lib/chat-store.ts` from dashboard-prototype

**Step 1: Copy components**

```bash
cp -r ~/Projects/dashboard-prototype/components ~/Projects/ground-control/
cp ~/Projects/dashboard-prototype/lib/chat-store.ts lib/chat-store.ts
```

**Step 2: Remove mock-data dependency from components**

Check what `mock-data` exports are used:

```bash
grep -r "mock-data" components/
```

For now, replace the `mock-data` import in each component with an empty stub so the app compiles:

Create `lib/mock-data.ts`:
```ts
// Temporary stubs — will be replaced by real API calls task by task
export const mockInbox = { personal: { unread: 0 }, school: { unread: 0 }, recent: [] };
export const mockCalendar = { today: [], upcoming: [] };
export const mockTasks = [];
export const characters = [];
```

**Step 3: Verify it compiles**

```bash
npm run build
```

Fix any TypeScript errors that arise.

**Step 4: Commit**

```bash
git add -A
git commit -m "port: home and pipeline components from prototype"
```

---

## Task 16: Wire CrewWidget to real characters

**Files:**
- Modify: `components/home/CrewWidget.tsx`

**Step 1: Read current CrewWidget**

Read `components/home/CrewWidget.tsx` to understand its data shape.

**Step 2: Replace mock-data with API fetch**

Replace `import { characters } from "@/lib/mock-data"` with a `useEffect` fetch from `/api/characters`. Map the response to the shape CrewWidget expects.

The component needs: `id`, `name`, `color`, `tier`. These all come from `/api/characters`.

**Step 3: Verify**

Open localhost:3000 — CrewWidget should show real characters loaded from `~/.claude/characters/`.

**Step 4: Commit**

```bash
git add components/home/CrewWidget.tsx
git commit -m "wire: CrewWidget to real /api/characters"
```

---

## Task 17: Wire ChatWidget to real API

**Files:**
- Modify: `components/home/ChatWidget.tsx`

**Step 1: Read current ChatWidget**

Read `components/home/ChatWidget.tsx` lines 1-60 to understand state structure.

**Step 2: Replace character list with API fetch**

Replace `import { characters } from "@/lib/mock-data"` with a fetch from `/api/characters`.

**Step 3: Wire handleSend to POST /api/chat SSE**

The current `handleSend` only appends the user message — it has no real send. Replace the body with:

```ts
const handleSend = async () => {
  if (!input.trim() || isLoading) return;
  const msg = input.trim();
  setMessages(prev => [...prev, { role: 'user', content: msg }]);
  setInput('');
  setIsLoading(true);

  let fullText = '';
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ characterId: activeChar.id, message: msg }),
    });
    if (!res.body) throw new Error('no body');
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop() || '';
      for (const part of parts) {
        const eventMatch = part.match(/^event: (\w+)/m);
        const dataMatch = part.match(/^data: (.+)/m);
        if (!eventMatch || !dataMatch) continue;
        try {
          const parsed = JSON.parse(dataMatch[1]);
          if (eventMatch[1] === 'text') fullText += parsed.text;
          if (eventMatch[1] === 'done') {
            setMessages(prev => [...prev, { role: 'assistant', charName: activeChar.name, content: fullText }]);
            setIsLoading(false);
          }
        } catch {}
      }
    }
  } catch {
    setIsLoading(false);
  }
};
```

Also remove the Crew trigger timeout mock (replace with real dispatch if needed later).

**Step 4: Test**

Open localhost:3000, select a character, send a message. Should see real streaming response appear after ~2s.

**Step 5: Commit**

```bash
git add components/home/ChatWidget.tsx
git commit -m "wire: ChatWidget to real /api/chat SSE"
```

---

## Task 18: Wire TasksWidget to real tasks + dispatch

**Files:**
- Modify: `components/home/TasksWidget.tsx`

**Step 1: Read current TasksWidget**

Read `components/home/TasksWidget.tsx` to understand data shape.

**Step 2: Replace mockTasks with fetch from /api/tasks**

Fetch task list on mount. Group by category client-side.

**Step 3: Wire task buttons to dispatch**

When a task button is clicked, `POST /api/task/{taskId}` and stream the output. Display it in an output panel (can be a modal or inline below the widget for now).

For a simple first pass: on click, open a `<pre>` overlay that streams SSE text events.

**Step 4: Test**

Click a task in TasksWidget. Should spawn Claude and stream output.

**Step 5: Commit**

```bash
git add components/home/TasksWidget.tsx
git commit -m "wire: TasksWidget to real task list + dispatch"
```

---

## Task 19: Wire InboxWidget action buttons

**Files:**
- Modify: `components/home/InboxWidget.tsx`

Currently action buttons (Reply, Task, Schedule, Archive) are display-only. Wire them to `POST /api/action`.

**Step 1: Add onClick to action buttons**

For each action button in `itemActions`, add an `onClick` that calls:
```ts
fetch('/api/action', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: label.toLowerCase(), email: { from: email.from, subject: email.subject, account: email.account } }),
})
```

Display the SSE stream in an output panel (shared component — create `components/OutputPanel.tsx` that takes a `ReadableStream`).

**Step 2: InboxWidget still uses mockInbox for display** — that's fine for now. The inbox data fetch can come later when we have a stable prompt for it.

**Step 3: Commit**

```bash
git add components/home/InboxWidget.tsx components/OutputPanel.tsx
git commit -m "wire: InboxWidget action buttons to /api/action"
```

---

## Task 20: Assemble home page

**Files:**
- Replace: `app/page.tsx`

**Step 1: Port home page from prototype**

Copy `~/Projects/dashboard-prototype/app/page.tsx` verbatim. Fix any import paths if needed.

**Step 2: Test full home page**

```bash
npm run dev
```

Open localhost:3000. Verify:
- StatusBar renders
- CrewWidget shows real characters
- ChatWidget shows real character picker, sends real messages
- TasksWidget shows real task list, dispatches tasks
- InboxWidget renders (with mock data for now)
- CalendarWidget renders (with mock data for now)

**Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "feat: home page assembled with real backend"
```

---

## Task 21: Update CLAUDE.md for new project

**Files:**
- Create: `CLAUDE.md`

**Step 1: Create CLAUDE.md**

```markdown
# Ground Control

Real dashboard for Kerem's agent system. Next.js 15, localhost:3000.

## Key paths
- API routes: `app/api/`
- Lib layer: `lib/` (characters, skills, prompt, tasks, spawn)
- UI components: `components/home/`, `components/pipeline/`
- Design doc: `docs/plans/2026-02-23-ground-control-design.md`

## Adding a task
1. Add entry to `lib/tasks.ts` TASKS map
2. That's it — it appears in TasksWidget automatically

## Adding a character
Character configs live in `~/.claude/characters/`. The dashboard reads them at runtime — no code change needed.

## Pipeline page (phase 2)
See `docs/plans/` for pipeline design. Wire `lib/pipeline-data.ts` to real character roster from `/api/characters`.
```

**Step 2: Update `~/.claude/shared/dashboard-prototype.md`**

Update the root path from `~/Projects/dashboard-prototype/` to `~/Projects/ground-control/`. The file map and component structure remain the same.

**Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md for ground-control"
```

---

## Phase 2: Pipeline page (separate session)

After home page is working:
1. Port `app/pipeline/page.tsx` and all pipeline components from `dashboard-prototype/`
2. Port `lib/pipeline-data.ts`
3. Update `pipeline-data.ts` to load character colors/names from `/api/characters` at build time instead of hardcoded mock
4. Verify pipeline page renders with real character roster

---

## Deferred: Live inbox and calendar data

Getting real inbox/calendar data requires:
- A stable output format from the postman/calendar Claude subprocess
- Parsing that output in the API route and returning JSON
- This is separate work — for now, InboxWidget and CalendarWidget use mock data or a loading state

When ready:
- `app/api/inbox/route.ts` — spawn postman scan, parse JSON output
- `app/api/calendar/route.ts` — spawn calendar skill, parse output
- Wire `InboxWidget` and `CalendarWidget` to those routes
