export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { getPipelineLog } from '@/lib/pipeline-log';
import { apiOk } from '@/lib/api-helpers';

export async function GET(req: Request) {
  const limit = Number(new URL(req.url).searchParams.get('limit') || '50');
  return apiOk({ entries: getPipelineLog(limit) });
}
