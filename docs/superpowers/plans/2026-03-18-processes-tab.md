# Processes Tab + Design Plans Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (1) Add a "Processes" tab to CrewWidget showing active Claude CLI processes with stop buttons. (2) Add a "Design Plans" section to ProposalsWidget listing spec/plan files from `docs/superpowers/` for easy access and copy-paste.

**Architecture:** A module-level process registry in `lib/process-registry.ts` tracks all spawned child processes. All three spawn functions register/unregister processes. A file-based backup survives hot reloads. Two API routes expose list/kill. CrewWidget gets a new "Processes" tab. ProposalsWidget gets a "Plans" section powered by a `GET /api/system/plans` endpoint that reads markdown files from `docs/superpowers/plans/` and `docs/superpowers/specs/`.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Lucide icons, inline styles (matching existing patterns).

---

### Task 1: Process Registry

**Files:**
- Create: `lib/process-registry.ts`

The registry is the core. It holds an in-memory Map of active processes with metadata, backed by a JSON file for hot-reload survival.

- [ ] **Step 1: Create the registry module**

```typescript
// lib/process-registry.ts
import { ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';

const PERSISTENCE_PATH = path.join(process.cwd(), 'data', 'active-processes.json');

export type ProcessEntry = {
  id: string;
  pid: number;
  charName: string;
  label: string;
  jobId?: string;
  startedAt: string;
};

type InternalEntry = ProcessEntry & { proc: ChildProcess };

// Module-level map — persists across requests within same Node.js process
const registry = new Map<string, InternalEntry>();

// --- Persistence (survives hot reloads) ---

type PersistedEntry = Omit<ProcessEntry, 'pid'> & { pid: number };

function persist() {
  const entries: PersistedEntry[] = [];
  for (const e of registry.values()) {
    entries.push({ id: e.id, pid: e.pid, charName: e.charName, label: e.label, jobId: e.jobId, startedAt: e.startedAt });
  }
  try {
    fs.mkdirSync(path.dirname(PERSISTENCE_PATH), { recursive: true });
    fs.writeFileSync(PERSISTENCE_PATH, JSON.stringify(entries, null, 2));
  } catch {}
}

function loadPersistedOrphans(): PersistedEntry[] {
  try {
    const entries: PersistedEntry[] = JSON.parse(fs.readFileSync(PERSISTENCE_PATH, 'utf-8'));
    // Filter to PIDs that are still alive but not in our in-memory registry
    return entries.filter(e => {
      if (registry.has(e.id)) return false;
      try { process.kill(e.pid, 0); return true; } catch { return false; }
    });
  } catch { return []; }
}

// --- Public API ---

let counter = 0;

export function registerProcess(proc: ChildProcess, meta: {
  charName: string;
  label: string;
  jobId?: string;
}): string {
  const id = `proc-${Date.now()}-${++counter}`;
  const pid = proc.pid!;
  const entry: InternalEntry = {
    id, pid,
    charName: meta.charName,
    label: meta.label,
    jobId: meta.jobId,
    startedAt: new Date().toISOString(),
    proc,
  };
  registry.set(id, entry);
  persist();

  // Auto-unregister when process exits
  const cleanup = () => {
    registry.delete(id);
    persist();
  };
  proc.on('close', cleanup);
  proc.on('error', cleanup);

  return id;
}

export function listProcesses(): ProcessEntry[] {
  // Merge in-memory + any orphaned PIDs from file (post hot-reload)
  const result: ProcessEntry[] = [];
  for (const e of registry.values()) {
    result.push({ id: e.id, pid: e.pid, charName: e.charName, label: e.label, jobId: e.jobId, startedAt: e.startedAt });
  }
  // Add orphans (processes from before a hot reload that are still running)
  for (const orphan of loadPersistedOrphans()) {
    result.push(orphan);
  }
  return result;
}

export function killProcess(id: string): boolean {
  const entry = registry.get(id);
  if (entry) {
    try { entry.proc.kill('SIGTERM'); } catch {}
    // Force kill after 5 seconds if still alive
    setTimeout(() => {
      try { entry.proc.kill('SIGKILL'); } catch {}
    }, 5000);
    registry.delete(id);
    persist();
    return true;
  }

  // Check orphaned processes from file
  const orphans = loadPersistedOrphans();
  const orphan = orphans.find(o => o.id === id);
  if (orphan) {
    try { process.kill(orphan.pid, 'SIGTERM'); } catch {}
    setTimeout(() => {
      try { process.kill(orphan.pid, 'SIGKILL'); } catch {}
    }, 5000);
    // Remove from persisted file
    try {
      const all: PersistedEntry[] = JSON.parse(fs.readFileSync(PERSISTENCE_PATH, 'utf-8'));
      fs.writeFileSync(PERSISTENCE_PATH, JSON.stringify(all.filter(e => e.id !== id), null, 2));
    } catch {}
    return true;
  }

  return false;
}
```

- [ ] **Step 2: Verify build**

Run: `cd ~/Projects/ground-control && npx next build 2>&1 | tail -5`
Expected: Build succeeds (new file has no consumers yet, just needs to compile)

- [ ] **Step 3: Commit**

```bash
cd ~/Projects/ground-control
git add lib/process-registry.ts
git commit -m "feat: add process registry for tracking spawned Claude CLI processes"
```

---

### Task 2: Integrate Registry into Spawn Functions

**Files:**
- Modify: `lib/spawn.ts`

All three spawn functions need to register the child process after creation.

- [ ] **Step 1: Add import at top of `lib/spawn.ts`**

After line 2, add:
```typescript
import { registerProcess } from './process-registry';
```

- [ ] **Step 2: Register in `spawnAndCollect`**

In the `spawnAndCollect` function, after line 72 (`const proc = spawn(CLAUDE_BIN, args, { ... });`), add:
```typescript
    registerProcess(proc, { charName: opts.characterId || 'unknown', label: opts.label });
```

- [ ] **Step 3: Register in `spawnOnce`**

In the `spawnOnce` function, after line 140 (`const proc = spawn(CLAUDE_BIN, args, { ... });`), add:
```typescript
    registerProcess(proc, { charName: 'system', label: 'one-shot' });
```

- [ ] **Step 4: Register in `spawnSSEStream`**

In the `spawnSSEStream` function, after line 232 (`proc = spawn(CLAUDE_BIN, args, { ... });`), add:
```typescript
      registerProcess(proc, { charName: characterId || 'chat', label });
```

- [ ] **Step 5: Verify build**

Run: `cd ~/Projects/ground-control && npx next build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 6: Commit**

```bash
cd ~/Projects/ground-control
git add lib/spawn.ts
git commit -m "feat: register all spawned processes in process registry"
```

---

### Task 3: API Routes for Process List and Kill

**Files:**
- Create: `app/api/processes/route.ts`
- Create: `app/api/processes/[id]/route.ts`

- [ ] **Step 1: Create GET endpoint for listing processes**

```typescript
// app/api/processes/route.ts
export const runtime = 'nodejs';
import { listProcesses } from '@/lib/process-registry';

export async function GET() {
  return Response.json({ processes: listProcesses() });
}
```

- [ ] **Step 2: Create DELETE endpoint for killing a process**

```typescript
// app/api/processes/[id]/route.ts
export const runtime = 'nodejs';
import { killProcess } from '@/lib/process-registry';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const killed = killProcess(id);
  if (!killed) {
    return Response.json({ ok: false, error: 'Process not found' }, { status: 404 });
  }
  return Response.json({ ok: true });
}
```

- [ ] **Step 3: Verify build**

Run: `cd ~/Projects/ground-control && npx next build 2>&1 | tail -5`
Expected: Build succeeds, new routes appear in output

- [ ] **Step 4: Commit**

```bash
cd ~/Projects/ground-control
git add app/api/processes/
git commit -m "feat: add API routes for listing and killing processes"
```

---

### Task 4: Add Processes Tab to CrewWidget

**Files:**
- Modify: `components/home/CrewWidget.tsx`

This task adds the "Processes" tab with live-updating elapsed times and stop buttons, matching existing widget styling patterns.

- [ ] **Step 1: Add `Zap` and `Square` icons to the import**

At line 8, add `Zap` and `Square` to the lucide-react import (alongside existing icons).

- [ ] **Step 2: Extend the `activeTab` type union**

Change line 78 from:
```typescript
const [activeTab, setActiveTab] = useState<"crew" | "schedules" | "logs" | "proposals">("crew");
```
to:
```typescript
const [activeTab, setActiveTab] = useState<"crew" | "schedules" | "processes" | "logs" | "proposals">("crew");
```

- [ ] **Step 3: Add processes state and polling**

After the `recentLogs` state (around line 87), add:

```typescript
  const [processes, setProcesses] = useState<Array<{ id: string; pid: number; charName: string; label: string; jobId?: string; startedAt: string }>>([]);
  const [stoppingProcess, setStoppingProcess] = useState<string | null>(null);

  // Poll processes every 3 seconds
  const fetchProcesses = useCallback(() => {
    fetch("/api/processes")
      .then(r => r.json())
      .then(d => setProcesses(d.processes || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchProcesses();
    const interval = setInterval(fetchProcesses, 3000);
    return () => clearInterval(interval);
  }, [fetchProcesses]);

  const handleStopProcess = useCallback(async (id: string) => {
    setStoppingProcess(id);
    try {
      await fetch(`/api/processes/${id}`, { method: "DELETE" });
      fetchProcesses();
    } catch {}
    setTimeout(() => setStoppingProcess(null), 1000);
  }, [fetchProcesses]);
```

- [ ] **Step 4: Add the Processes tab button in the header**

After the Schedules tab button (line 560), add the Processes tab:

```typescript
          <CrewTabBtn label="Processes" icon={<Zap size={13} strokeWidth={1.5} />} active={activeTab === "processes"} badge={processes.length > 0 ? processes.length : undefined} onClick={() => setActiveTab("processes")} />
```

- [ ] **Step 5: Add the Processes tab content**

Before `{activeTab === "logs" && (` (around line 1210), add the processes tab panel:

```tsx
        {activeTab === "processes" && (
          <div style={{ padding: "6px 10px 8px" }}>
            {processes.length === 0 ? (
              <div style={{
                fontFamily: "var(--font-mono)", fontSize: 11,
                color: "var(--text-3)", textAlign: "center",
                padding: "24px 0",
              }}>
                No active processes
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {processes.map((proc, i) => {
                  const color = charColor[proc.charName] || "#94a3b8";
                  const Icon = charIcon[proc.charName.charAt(0).toUpperCase() + proc.charName.slice(1)] || Bot;
                  const isStopping = stoppingProcess === proc.id;
                  return (
                    <div key={proc.id} style={{
                      display: "flex", alignItems: "center", gap: 6,
                      padding: "5px 4px",
                      borderRadius: 5,
                      background: i % 2 === 0 ? "transparent" : "var(--surface-2)",
                    }}>
                      <div style={{
                        width: 20, height: 20, borderRadius: 4, flexShrink: 0,
                        background: color + "16", border: `1px solid ${color}28`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        <Icon size={10} strokeWidth={1.5} style={{ color }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontFamily: "var(--font-mono)", fontSize: 10,
                          color: "var(--text)",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {proc.label}
                        </div>
                        <div style={{
                          fontFamily: "var(--font-mono)", fontSize: 9,
                          color: "var(--text-3)", marginTop: 1,
                          display: "flex", gap: 5,
                        }}>
                          <span>{proc.charName}</span>
                          <span>PID {proc.pid}</span>
                          <ProcessElapsed startedAt={proc.startedAt} />
                        </div>
                      </div>
                      <button
                        onClick={() => handleStopProcess(proc.id)}
                        disabled={isStopping}
                        data-tip="Stop process"
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "center",
                          width: 20, height: 20, flexShrink: 0,
                          background: "transparent",
                          border: `1px solid ${isStopping ? "var(--border)" : "var(--red)"}40`,
                          borderRadius: 4,
                          cursor: isStopping ? "default" : "pointer",
                          color: isStopping ? "var(--text-3)" : "var(--red)",
                          transition: "all 0.15s ease",
                        }}
                      >
                        {isStopping
                          ? <Loader2 size={9} strokeWidth={2} style={{ animation: "spin 1s linear infinite" }} />
                          : <Square size={8} strokeWidth={2.5} fill="currentColor" />}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
```

- [ ] **Step 6: Add the `ProcessElapsed` helper component**

After the `CrewTabBtn` component (after line 1289, at the end of the file), add:

```tsx
function ProcessElapsed({ startedAt }: { startedAt: string }) {
  const [elapsed, setElapsed] = useState("");

  useEffect(() => {
    const update = () => {
      const seconds = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
      if (seconds < 60) setElapsed(`${seconds}s`);
      else if (seconds < 3600) setElapsed(`${Math.floor(seconds / 60)}m ${seconds % 60}s`);
      else setElapsed(`${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  return <span>{elapsed}</span>;
}
```

- [ ] **Step 7: Verify build**

Run: `cd ~/Projects/ground-control && npx next build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 8: Manual test**

1. Start dev server: `cd ~/Projects/ground-control && npm run dev`
2. Open http://localhost:3000
3. In CrewWidget, verify "Processes" tab appears between "Schedules" and "Logs"
4. When no processes running: shows "No active processes"
5. Trigger a character action (e.g., click a Crew action button)
6. Verify process appears in the Processes tab with character icon, label, elapsed time
7. Click the stop button (red square icon) and verify the process disappears

- [ ] **Step 9: Commit**

```bash
cd ~/Projects/ground-control
git add components/home/CrewWidget.tsx
git commit -m "feat: add Processes tab to CrewWidget with live status and stop buttons"
```

---

### Task 5: Design Plans API + ProposalsWidget Section

**Files:**
- Create: `app/api/system/plans/route.ts`
- Modify: `components/pipeline/ProposalsWidget.tsx`

Adds a `GET /api/system/plans` endpoint that reads markdown files from `docs/superpowers/plans/` and `docs/superpowers/specs/`, extracts the title (first `#` line) and goal line. ProposalsWidget gets a "Design Plans" section showing these files with expandable content and a copy-path button.

- [ ] **Step 1: Create the plans API endpoint**

```typescript
// app/api/system/plans/route.ts
export const runtime = 'nodejs';
import fs from 'fs';
import path from 'path';

type PlanFile = {
  name: string;
  path: string;
  type: 'plan' | 'spec';
  title: string;
  goal: string;
  modifiedAt: string;
};

const DOCS_DIR = path.join(process.cwd(), 'docs', 'superpowers');

function readPlans(subdir: string, type: 'plan' | 'spec'): PlanFile[] {
  const dir = path.join(DOCS_DIR, subdir);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.md'))
    .map(f => {
      const filePath = path.join(dir, f);
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      const titleLine = lines.find(l => l.startsWith('# '));
      const goalLine = lines.find(l => l.startsWith('**Goal:**'));
      const stat = fs.statSync(filePath);
      return {
        name: f,
        path: filePath,
        type,
        title: titleLine?.replace(/^#\s*/, '') || f.replace('.md', ''),
        goal: goalLine?.replace(/^\*\*Goal:\*\*\s*/, '') || '',
        modifiedAt: stat.mtime.toISOString(),
      };
    })
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
}

export async function GET(req: Request) {
  const withContent = new URL(req.url).searchParams.get('content');
  const plans = [...readPlans('plans', 'plan'), ...readPlans('specs', 'spec')];

  if (withContent) {
    const file = plans.find(p => p.name === withContent);
    if (!file) return Response.json({ error: 'Not found' }, { status: 404 });
    const content = fs.readFileSync(file.path, 'utf-8');
    return Response.json({ file, content });
  }

  return Response.json({ plans });
}
```

- [ ] **Step 2: Add plans section to ProposalsWidget**

At the top of `ProposalsWidget.tsx`, add to imports:
```typescript
import { FileText, Copy, ClipboardCheck } from "lucide-react";
```

Add a plan type:
```typescript
type PlanFile = {
  name: string;
  path: string;
  type: 'plan' | 'spec';
  title: string;
  goal: string;
  modifiedAt: string;
};
```

Inside the `ProposalsWidget` component, after the existing `fetch_` callback and its `useEffect`, add:

```typescript
  const [plans, setPlans] = useState<PlanFile[]>([]);
  const [expandedPlan, setExpandedPlan] = useState<string | null>(null);
  const [planContent, setPlanContent] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/system/plans")
      .then(r => r.json())
      .then(d => setPlans(d.plans || []))
      .catch(() => {});
  }, []);

  const handleExpandPlan = async (name: string) => {
    if (expandedPlan === name) {
      setExpandedPlan(null);
      setPlanContent(null);
      return;
    }
    setExpandedPlan(name);
    setPlanContent(null);
    try {
      const res = await fetch(`/api/system/plans?content=${encodeURIComponent(name)}`);
      const data = await res.json();
      setPlanContent(data.content || null);
    } catch {}
  };

  const handleCopyPath = (filePath: string, name: string) => {
    navigator.clipboard.writeText(filePath);
    setCopied(name);
    setTimeout(() => setCopied(null), 2000);
  };
```

- [ ] **Step 3: Render plans section in the widget body**

Before the closing `</div>` of `widget-body` (just before line 308's `</div>`), add:

```tsx
        {plans.length > 0 && (
          <div>
            <div style={{
              padding: "6px 14px 4px",
              fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 600,
              color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em",
              borderBottom: "1px solid var(--border)",
              borderTop: "1px solid var(--border)",
              background: "var(--bg-2, transparent)",
            }}>
              Design Plans
              <span style={{ marginLeft: 6, opacity: 0.5 }}>{plans.length}</span>
            </div>

            {plans.map((plan) => {
              const isExpanded = expandedPlan === plan.name;
              return (
                <div key={plan.name} style={{ borderBottom: "1px solid var(--border)" }}>
                  <div
                    onClick={() => handleExpandPlan(plan.name)}
                    style={{
                      padding: "8px 14px",
                      cursor: "pointer",
                      display: "flex", alignItems: "flex-start", gap: 8,
                    }}
                  >
                    {isExpanded
                      ? <ChevronDown size={12} strokeWidth={1.5} style={{ color: "var(--text-3)", marginTop: 2, flexShrink: 0 }} />
                      : <ChevronRight size={12} strokeWidth={1.5} style={{ color: "var(--text-3)", marginTop: 2, flexShrink: 0 }} />
                    }
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <FileText size={12} strokeWidth={1.5} style={{ color: plan.type === "plan" ? "var(--blue)" : "var(--green)", flexShrink: 0 }} />
                        <span style={{
                          fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600,
                          color: "var(--text)",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {plan.title}
                        </span>
                        <span style={{
                          fontFamily: "var(--font-mono)", fontSize: 8,
                          color: plan.type === "plan" ? "var(--blue)" : "var(--green)",
                          background: plan.type === "plan" ? "var(--blue-bg)" : "var(--green-bg)",
                          padding: "0 4px", borderRadius: 3, flexShrink: 0,
                        }}>
                          {plan.type}
                        </span>
                      </div>
                      {plan.goal && (
                        <div style={{
                          fontFamily: "var(--font-mono)", fontSize: 9,
                          color: "var(--text-3)", marginTop: 2,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {plan.goal}
                        </div>
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div style={{ padding: "0 14px 10px 34px" }}>
                      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                        <button
                          className="item-action-btn"
                          onClick={() => handleCopyPath(plan.path, plan.name)}
                          style={{
                            cursor: "pointer", display: "flex", alignItems: "center", gap: 3,
                            color: "var(--blue)", padding: "3px 8px", fontSize: 10,
                            fontFamily: "var(--font-mono)", border: "1px solid var(--blue)30",
                            borderRadius: 4, background: "var(--blue-bg)",
                          }}
                        >
                          {copied === plan.name
                            ? <><ClipboardCheck size={10} strokeWidth={2} /> Copied</>
                            : <><Copy size={10} strokeWidth={2} /> Copy Path</>
                          }
                        </button>
                      </div>
                      {planContent ? (
                        <pre style={{
                          fontFamily: "var(--font-mono)", fontSize: 9,
                          color: "var(--text-2)", lineHeight: 1.6,
                          whiteSpace: "pre-wrap", wordBreak: "break-word",
                          maxHeight: 300, overflow: "auto",
                          background: "var(--surface-2)", borderRadius: 4,
                          padding: "8px 10px",
                          border: "1px solid var(--border)",
                        }}>
                          {planContent}
                        </pre>
                      ) : (
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-3)" }}>
                          Loading...
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
```

- [ ] **Step 4: Verify build**

Run: `cd ~/Projects/ground-control && npx next build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
cd ~/Projects/ground-control
git add app/api/system/plans/route.ts components/pipeline/ProposalsWidget.tsx
git commit -m "feat: add Design Plans section to ProposalsWidget with file browser and copy path"
```
