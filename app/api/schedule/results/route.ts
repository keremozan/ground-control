export const runtime = 'nodejs';
import fs from 'fs';
import path from 'path';
import type { JobResult } from '@/lib/scheduler';

const RESULTS_FILE = path.join(process.cwd(), 'data', 'job-results.json');

export async function GET() {
  let results: JobResult[] = [];
  try {
    results = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf-8'));
  } catch {
    // No results yet
  }
  return Response.json({ results });
}
