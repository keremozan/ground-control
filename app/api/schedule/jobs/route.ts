export const runtime = 'nodejs';
import fs from 'fs';
import path from 'path';
import { SCHEDULE_JOBS } from '@/lib/scheduler';

const OVERRIDES_PATH = path.join(process.cwd(), 'data', 'job-overrides.json');

function readOverrides(): Record<string, string> {
  try {
    return JSON.parse(fs.readFileSync(OVERRIDES_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

function writeOverrides(overrides: Record<string, string>) {
  const dir = path.dirname(OVERRIDES_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(OVERRIDES_PATH, JSON.stringify(overrides, null, 2));
}

export async function GET() {
  const overrides = readOverrides();
  const jobs = SCHEDULE_JOBS.map(j => ({
    id: j.id,
    label: j.label,
    seedPrompt: overrides[j.id] ?? j.seedPrompt,
    defaultSeedPrompt: j.seedPrompt,
    hasOverride: !!overrides[j.id],
  }));
  return Response.json({ jobs });
}

export async function PATCH(req: Request) {
  const { jobId, seedPrompt } = await req.json() as { jobId: string; seedPrompt: string };
  if (!jobId || typeof seedPrompt !== 'string') {
    return Response.json({ error: 'jobId and seedPrompt required' }, { status: 400 });
  }
  const job = SCHEDULE_JOBS.find(j => j.id === jobId);
  if (!job) return Response.json({ error: 'Job not found' }, { status: 404 });

  const overrides = readOverrides();
  // If resetting to default, remove the override
  if (seedPrompt.trim() === job.seedPrompt.trim()) {
    delete overrides[jobId];
  } else {
    overrides[jobId] = seedPrompt;
  }
  writeOverrides(overrides);
  return Response.json({ ok: true });
}
