export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import fs from 'fs';
import { JOB_RESULTS_PATH } from '@/lib/config';
import type { JobResult } from '@/lib/scheduler';
import { apiOk } from '@/lib/api-helpers';

const RESULTS_FILE = JOB_RESULTS_PATH;

export async function GET() {
  let results: JobResult[] = [];
  try {
    results = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf-8'));
  } catch {
    // No results yet
  }
  return apiOk({ results });
}
