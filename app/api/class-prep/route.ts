export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { getClassNodes } from '@/lib/tana';

export async function GET() {
  try {
    const classes = await getClassNodes();
    return Response.json({ classes });
  } catch (e) {
    return Response.json({ error: String(e), classes: [] }, { status: 500 });
  }
}
