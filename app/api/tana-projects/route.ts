export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { getTanaProjects } from '@/lib/tana';

export async function GET() {
  try {
    const projects = await getTanaProjects();

    // Sort by deadline: nearest first, no-deadline last
    projects.sort((a, b) => {
      if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline);
      if (a.deadline) return -1;
      if (b.deadline) return 1;
      return a.name.localeCompare(b.name);
    });

    return Response.json({ projects });
  } catch (e) {
    return Response.json({ error: String(e), projects: [] }, { status: 500 });
  }
}
