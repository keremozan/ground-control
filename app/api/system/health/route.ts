export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import fs from 'fs';
import path from 'path';
import { SKILLS_DIR, SHARED_DIR } from '@/lib/config';
import { getCharacters } from '@/lib/characters';
import { SCHEDULE_JOBS } from '@/lib/scheduler';
import { apiOk } from '@/lib/api-helpers';

// System-context files loaded implicitly by all characters. Not counted as unused.
// Files loaded implicitly via sharedKnowledge. Not a problem if no skill explicitly references them.
const SYSTEM_CONTEXT_FILES = new Set([
  'identity.md',
  'writing-voice.md',
  'daily-context.md',
  'mind-patterns.md',
  'contacts.md',
  'tana-ids.md',
  'routing-table.md',
  'routing-overrides.md',
  'tools.md',
  'comms-ledger.json',
  'work-patterns.md',
  'health-knowledge.md',
  'ground-control.md',
]);

export async function GET() {
  // ── 1. Index knowledge files on disk ──────────────
  const knowledgeFiles = new Set<string>();
  try {
    for (const f of fs.readdirSync(SHARED_DIR)) {
      if (f.endsWith('.md') || f.endsWith('.json')) {
        knowledgeFiles.add(f);
      }
    }
  } catch {}

  // ── 2. Index skill files and their knowledge references ──
  const skillKnowledgeRefs: Record<string, Set<string>> = {};
  try {
    for (const d of fs.readdirSync(SKILLS_DIR)) {
      const skillMdPath = path.join(SKILLS_DIR, d, 'SKILL.md');
      try {
        if (!fs.statSync(skillMdPath).isFile()) continue;
      } catch {
        continue;
      }
      const content = fs.readFileSync(skillMdPath, 'utf-8');
      const refs = new Set<string>();

      // Match shared/something.md or bare filenames that exist
      const sharedPattern = /shared\/([a-zA-Z0-9_-]+\.(?:md|json))/g;
      let m: RegExpExecArray | null;
      while ((m = sharedPattern.exec(content)) !== null) {
        refs.add(m[1]);
      }
      const barePattern = /([a-zA-Z0-9_-]+\.md)/g;
      while ((m = barePattern.exec(content)) !== null) {
        if (m[1].includes('{') || m[1].includes('}')) continue;
        if (knowledgeFiles.has(m[1])) refs.add(m[1]);
      }

      skillKnowledgeRefs[d] = refs;
    }
  } catch {}

  // ── 3. Characters ─────────────────────────────────
  const characters = getCharacters();
  const charHealth: Record<string, { broken: number; unused: number; skills: number; knowledge: number; schedules: number }> = {};
  let totalBroken = 0;
  let totalUnused = 0;

  for (const [id, char] of Object.entries(characters)) {
    let broken = 0;
    let unused = 0;
    const skillCount = (char.skills || []).length;
    const knowledgeCount = (char.sharedKnowledge || []).length;
    const scheduleCount = SCHEDULE_JOBS.filter(j => j.enabled && j.charName === id).length;

    // Collect skill refs for this character's skills
    const charSkillRefs = new Set<string>();
    for (const skillName of char.skills || []) {
      const refs = skillKnowledgeRefs[skillName];
      if (refs) {
        for (const r of refs) charSkillRefs.add(r);
      }
    }

    // Check each declared knowledge file
    for (const kName of char.sharedKnowledge || []) {
      const baseName = kName.replace(/\.(md|json)$/, '');
      // Skip template patterns
      if (baseName.includes('{')) continue;

      const kFile = knowledgeFiles.has(`${baseName}.md`)
        ? `${baseName}.md`
        : knowledgeFiles.has(`${baseName}.json`)
          ? `${baseName}.json`
          : `${baseName}.md`;

      const exists = knowledgeFiles.has(kFile);
      if (!exists) {
        broken++;
        continue;
      }

      // Check unused (skip system context files)
      if (!SYSTEM_CONTEXT_FILES.has(kFile) && !charSkillRefs.has(kFile)) {
        unused++;
      }
    }

    totalBroken += broken;
    totalUnused += unused;

    charHealth[id] = {
      broken,
      unused,
      skills: skillCount,
      knowledge: knowledgeCount,
      schedules: scheduleCount,
    };
  }

  return apiOk({
    characters: charHealth,
    totals: { broken: totalBroken, unused: totalUnused },
  });
}
