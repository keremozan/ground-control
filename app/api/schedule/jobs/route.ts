export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import fs from 'fs';
import path from 'path';
import { SCHEDULE_JOBS } from '@/lib/scheduler';
import { apiOk, apiError, requireFields } from '@/lib/api-helpers';
import { captureError } from '@/lib/errors';

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
  return apiOk({ jobs });
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json() as { jobId: string; seedPrompt: string };
    const missing = requireFields(body, ['jobId', 'seedPrompt']);
    if (missing) return apiError(400, missing);

    if (typeof body.seedPrompt !== 'string') {
      return apiError(400, 'seedPrompt must be a string');
    }

    const job = SCHEDULE_JOBS.find(j => j.id === body.jobId);
    if (!job) return apiError(404, 'Job not found');

    const overrides = readOverrides();
    // If resetting to default, remove the override
    if (body.seedPrompt.trim() === job.seedPrompt.trim()) {
      delete overrides[body.jobId];
    } else {
      overrides[body.jobId] = body.seedPrompt;
    }
    writeOverrides(overrides);
    return apiOk();
  } catch (e) {
    captureError('schedule/jobs/PATCH', e);
    return apiError(500, String(e));
  }
}
