// Scheduled job definitions — client-safe (no fs/spawn deps)
import userConfig from '../ground-control.config';

export type ScheduleJob = {
  id: string;
  charName: string;     // lowercase character ID (or 'system' for multi-char jobs)
  displayName: string;  // capitalized for UI
  seedPrompt: string;   // sent to AI (ignored for process-tasks type)
  description: string;  // shown in UI
  cron: string;         // human-readable schedule
  label: string;
  mode?: string;
  type?: 'single' | 'process-tasks';  // default: 'single'
  enabled: boolean;
};

export type JobResult = {
  jobId: string;
  charName: string;
  displayName: string;
  timestamp: string;
  response: string;
  durationMs: number;
};

export const SCHEDULE_JOBS: ScheduleJob[] = (userConfig.scheduler.jobs || []) as ScheduleJob[];
