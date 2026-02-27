export const runtime = 'nodejs';
import { getCharacterList } from '@/lib/characters';
import { SCHEDULE_JOBS } from '@/lib/scheduler';

export function GET() {
  // Build config-level schedule map (charName → jobs)
  const configSchedules: Record<string, typeof SCHEDULE_JOBS> = {};
  for (const job of SCHEDULE_JOBS) {
    (configSchedules[job.charName] ||= []).push(job);
  }

  const characters = getCharacterList().map(c => {
    // Merge: character JSON schedules take priority, config jobs fill in
    const charScheds = c.schedules || [];
    const charSchedIds = new Set(charScheds.map(s => s.id));
    const configJobs = (configSchedules[c.id] || [])
      .filter(j => !charSchedIds.has(j.id))
      .map(j => ({ id: j.id, displayName: j.displayName, seedPrompt: j.seedPrompt, cron: j.cron, label: j.label, enabled: j.enabled }));

    return {
      id: c.id,
      name: c.name,
      tier: c.tier,
      icon: c.icon || 'Mail',
      color: c.color,
      domain: c.domain || '',
      model: c.defaultModel || 'sonnet',
      skills: c.skills || [],
      routingKeywords: c.routingKeywords || [],
      sharedKnowledge: c.sharedKnowledge || [],
      schedules: [...charScheds, ...configJobs],
      actions: c.actions || [],
      outputs: c.outputs || [],
      gates: c.gates || [],
      seeds: c.seeds || {},
    };
  });
  return Response.json({ characters });
}
