export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { SCHEDULE_JOBS } from '@/lib/scheduler';
import { readJobState } from '@/lib/job-state';

/** Parse a simple cron string like "08:00 daily" or "Monday 08:00" into expected interval in ms */
function expectedIntervalMs(cron: string): number {
  const lower = cron.toLowerCase();
  if (lower.includes('daily')) return 24 * 60 * 60 * 1000;
  if (lower.includes('1st')) return 30 * 24 * 60 * 60 * 1000;
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  if (days.some(d => lower.includes(d))) {
    const count = lower.split(',').length;
    return (7 / count) * 24 * 60 * 60 * 1000;
  }
  return 24 * 60 * 60 * 1000;
}

// Jobs running longer than this are assumed stuck
const MAX_JOB_DURATION_MS = 15 * 60 * 1000;

// Priority order: higher priority jobs run first during catch-up
const PRIORITY: Record<string, number> = {
  'morning-brief': 1,
  'postman-morning': 2,
  'scholar-daily': 3,
  'postman-afternoon': 4,
  'postman-evening': 5,
  'evening-tasks': 6,
  'kybernetes-context': 7,
  'postman-context-questions': 8,
  'archivist-auto-tag': 9,
  'architect-watcher': 10,
};
const DEFAULT_PRIORITY = 50;

function getMissedJobs() {
  const state = readJobState();
  const now = Date.now();
  const missed: { jobId: string; charName: string; label: string; missedSince: string; priority: number }[] = [];

  for (const job of SCHEDULE_JOBS) {
    if (!job.enabled) continue;

    const startedAt = state[job.id]?.startedAt;
    if (startedAt && now - new Date(startedAt).getTime() < MAX_JOB_DURATION_MS) continue;

    const last = state[job.id]?.lastRunAt;
    const interval = expectedIntervalMs(job.cron);
    const threshold = interval + 30 * 60 * 1000;

    if (!last || (now - new Date(last).getTime()) > threshold) {
      missed.push({
        jobId: job.id,
        charName: job.charName,
        label: job.label,
        missedSince: last || 'never',
        priority: PRIORITY[job.id] ?? DEFAULT_PRIORITY,
      });
    }
  }

  return missed.sort((a, b) => a.priority - b.priority);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({})) as { run?: boolean };
  const missed = getMissedJobs();

  if (!body.run) {
    return Response.json({ missed, count: missed.length });
  }

  // Sequential execution: run each missed job one at a time
  const results: { jobId: string; ok: boolean; durationMs: number; error?: string }[] = [];
  const baseUrl = `http://localhost:${process.env.PORT || 3000}`;

  for (const job of missed) {
    const start = Date.now();
    try {
      const res = await fetch(`${baseUrl}/api/schedule/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: job.jobId }),
      });
      const data = await res.json();
      results.push({
        jobId: job.jobId,
        ok: data.ok ?? false,
        durationMs: Date.now() - start,
        error: data.ok ? undefined : (data.error || 'unknown'),
      });
    } catch (err) {
      results.push({
        jobId: job.jobId,
        ok: false,
        durationMs: Date.now() - start,
        error: String(err),
      });
    }
  }

  const succeeded = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;
  const totalMs = results.reduce((sum, r) => sum + r.durationMs, 0);

  return Response.json({
    caught_up: true,
    total: results.length,
    succeeded,
    failed,
    totalMs,
    results,
  });
}

// GET: quick check without running (for dashboard polling)
export async function GET() {
  const missed = getMissedJobs();
  return Response.json({ missed, count: missed.length });
}
