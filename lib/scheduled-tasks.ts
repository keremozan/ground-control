import fs from 'fs';
import path from 'path';

const FILE = path.join(process.cwd(), 'data', 'scheduled-tasks.json');

export interface ScheduledTask {
  id: string;
  charName: string;
  seedPrompt: string;
  label: string;
  scheduledAt: string;
  createdAt: string;
}

export function readTasks(): ScheduledTask[] {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf-8'));
  } catch {
    return [];
  }
}

export function writeTasks(tasks: ScheduledTask[]): void {
  const dir = path.dirname(FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(tasks, null, 2));
}

export function createTask(data: Omit<ScheduledTask, 'id' | 'createdAt'>): ScheduledTask {
  const task: ScheduledTask = {
    ...data,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  const tasks = readTasks();
  tasks.push(task);
  writeTasks(tasks);
  return task;
}

export function deleteTask(id: string): boolean {
  const tasks = readTasks();
  const filtered = tasks.filter(t => t.id !== id);
  if (filtered.length === tasks.length) return false;
  writeTasks(filtered);
  return true;
}

export function getOverdueTasks(): ScheduledTask[] {
  const now = Date.now();
  return readTasks().filter(t => new Date(t.scheduledAt).getTime() <= now);
}

/** Atomically claims and removes overdue tasks in one synchronous operation.
 * Safe against concurrent calls within the same Node.js process — the read+write
 * pair runs before any await, so a second concurrent call sees an empty queue. */
export function claimOverdueTasks(): ScheduledTask[] {
  const tasks = readTasks();
  const now = Date.now();
  const overdue = tasks.filter(t => new Date(t.scheduledAt).getTime() <= now);
  if (overdue.length > 0) {
    writeTasks(tasks.filter(t => new Date(t.scheduledAt).getTime() > now));
  }
  return overdue;
}
