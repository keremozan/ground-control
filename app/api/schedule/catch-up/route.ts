export const runtime = 'nodejs';
import { SCHEDULE_JOBS } from '@/lib/scheduler';
import { readJobState } from '@/lib/job-state';

/** Parse a simple cron string like "08:00 daily" or "Monday 08:00" into expected interval in ms */
function expectedIntervalMs(cron: string): number {
  const lower = cron.toLowerCase();
  if (lower.includes('daily')) return 24 * 60 * 60 * 1000;
  // Weekly jobs (day name present)
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  if (days.some(d => lower.includes(d))) {
    // Count how many days mentioned (e.g. "Tue,Fri 14:00" = 2 per week)
    const count = lower.split(',').length;
    return (7 / count) * 24 * 60 * 60 * 1000;
  }
  return 24 * 60 * 60 * 1000; // default daily
}

// Jobs running longer than this are assumed stuck, not in-progress
const MAX_JOB_DURATION_MS = 15 * 60 * 1000; // 15 minutes

export async function POST() {
  const state = readJobState();
  const now = Date.now();
  const missed: { jobId: string; charName: string; label: string; missedSince: string }[] = [];

  for (const job of SCHEDULE_JOBS) {
    if (!job.enabled) continue;

    // Skip jobs that started recently (in-progress protection)
    const startedAt = state[job.id]?.startedAt;
    if (startedAt && now - new Date(startedAt).getTime() < MAX_JOB_DURATION_MS) continue;

    const last = state[job.id]?.lastRunAt;
    const interval = expectedIntervalMs(job.cron);
    // Add 30min grace period
    const threshold = interval + 30 * 60 * 1000;

    if (!last || (now - new Date(last).getTime()) > threshold) {
      missed.push({
        jobId: job.id,
        charName: job.charName,
        label: job.label,
        missedSince: last || 'never',
      });
    }
  }

  return Response.json({ missed });
}
