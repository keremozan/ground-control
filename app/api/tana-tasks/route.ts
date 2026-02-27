export const runtime = 'nodejs';
import { getTanaTasks, getTanaPhases, resolveCharacter, type TanaPhase } from '@/lib/tana';

export async function GET() {
  try {
    const [raw, phases] = await Promise.all([getTanaTasks(), getTanaPhases()]);

    // Build phase lookup: taskId → phase info (including track for inheritance)
    const taskPhaseMap = new Map<string, { phaseId: string; phaseName: string; phaseTrack: string; phaseTrackId: string | null }>();
    for (const phase of phases) {
      for (const tid of phase.taskIds) {
        taskPhaseMap.set(tid, { phaseId: phase.id, phaseName: phase.name, phaseTrack: phase.track, phaseTrackId: phase.trackId });
      }
    }

    // Fill in assigned + phase info; inherit track from phase if task has none
    const tasks = raw.map(t => {
      const phaseInfo = taskPhaseMap.get(t.id);
      const track = (t.track === 'Uncategorized' && phaseInfo?.phaseTrack) ? phaseInfo.phaseTrack : t.track;
      const trackId = (t.track === 'Uncategorized' && phaseInfo?.phaseTrackId) ? phaseInfo.phaseTrackId : t.trackId;
      return {
        ...t,
        track,
        trackId,
        assigned: resolveCharacter(t.assigned, track, t.name),
        ...(phaseInfo ? { phaseId: phaseInfo.phaseId, phaseName: phaseInfo.phaseName } : {}),
      };
    });

    // Filter: show tasks from active/pending phases, hide completed phases
    const visiblePhaseIds = new Set(phases.filter(p => p.status !== 'completed').map(p => p.id));
    const filtered = tasks.filter(t => {
      if (!t.phaseId) return true; // standalone task — always show
      return visiblePhaseIds.has(t.phaseId); // phase task — hide only if phase is completed
    });

    // Group by track
    const grouped: Record<string, typeof filtered> = {};
    for (const task of filtered) {
      (grouped[task.track] ||= []).push(task);
    }

    // Sort: in-progress first, then by phase name within each track
    for (const track of Object.keys(grouped)) {
      grouped[track].sort((a, b) => {
        if (a.status === 'in-progress' && b.status !== 'in-progress') return -1;
        if (b.status === 'in-progress' && a.status !== 'in-progress') return 1;
        // Group by phase name
        const pa = a.phaseName || '';
        const pb = b.phaseName || '';
        if (pa !== pb) return pa.localeCompare(pb);
        return 0;
      });
    }

    // Return phases for UI display
    const phasesByTrack: Record<string, TanaPhase[]> = {};
    for (const phase of phases) {
      (phasesByTrack[phase.track] ||= []).push(phase);
    }

    return Response.json({ tasks: grouped, phases: phasesByTrack });
  } catch (e) {
    return Response.json({ error: String(e), tasks: {}, phases: {} }, { status: 500 });
  }
}
