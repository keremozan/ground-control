export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import fs from 'fs';
import path from 'path';
import { CHARACTERS_DIR, SKILLS_DIR, SHARED_DIR, PIPELINE_SOURCES } from '@/lib/config';
import { getCharacters, type Character } from '@/lib/characters';
import { SCHEDULE_JOBS } from '@/lib/scheduler';
import { apiOk } from '@/lib/api-helpers';

// ── Types ───────────────────────────────────────────

type NodeMeta = Record<string, unknown>;

type GraphNode = {
  id: string;
  type: 'character' | 'skill' | 'knowledge' | 'schedule' | 'source';
  label: string;
  metadata: NodeMeta;
};

type GraphEdge = {
  source: string;
  target: string;
  type: 'owns' | 'declares' | 'reads' | 'triggers' | 'feeds';
  status: 'ok' | 'broken' | 'unused';
};

// ── Helpers ─────────────────────────────────────────

/** Parse YAML-ish frontmatter between --- markers */
function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return {};
  const result: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim();
    if (key && val) result[key] = val;
  }
  return result;
}

/** Scan skill body for references to shared knowledge files */
function scanFileReferences(body: string, knowledgeFiles: Set<string>): string[] {
  const refs = new Set<string>();

  // Match patterns: Read `~/.claude/shared/X.md`, Load `~/.claude/shared/X.md`, shared/X.md
  // Skip template variables like {id}-practices.md, {charId}-practices.md
  const pathPattern = /(?:Read|Load)\s+`?~?\/?\.claude\/shared\/([^`\s]+\.md)`?/gi;
  let m: RegExpExecArray | null;
  while ((m = pathPattern.exec(body)) !== null) {
    if (m[1].includes('{')) continue;
    refs.add(m[1]);
  }

  // Match shared/something.md without Read/Load prefix
  const sharedPattern = /shared\/([a-zA-Z0-9_-]+\.md)/g;
  while ((m = sharedPattern.exec(body)) !== null) {
    refs.add(m[1]);
  }

  // Match bare .md filenames that exist in SHARED_DIR
  // Skip template variables like {id}-practices.md
  const barePattern = /([a-zA-Z0-9_-]+\.md)/g;
  while ((m = barePattern.exec(body)) !== null) {
    if (m[1].includes('{') || m[1].includes('}')) continue;
    if (knowledgeFiles.has(m[1])) {
      refs.add(m[1]);
    }
  }

  return [...refs];
}

// ── Main ────────────────────────────────────────────

export async function GET() {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  // ── 1. Knowledge files (md + json) ─────────────────
  const knowledgeFiles = new Set<string>();
  const allSharedFiles = new Set<string>();
  try {
    for (const f of fs.readdirSync(SHARED_DIR)) {
      if (f.endsWith('.md') || f.endsWith('.json')) {
        knowledgeFiles.add(f);
        // Also index without extension for matching sharedKnowledge entries
        allSharedFiles.add(f.replace(/\.(md|json)$/, ''));
      }
    }
  } catch {}

  // System-context files loaded implicitly by all characters. Not a problem if no skill reads them explicitly.
  const SYSTEM_CONTEXT_FILES = new Set([
    'identity.md', 'writing-voice.md', 'daily-context.md', 'mind-patterns.md',
    'contacts.md', 'tana-ids.md', 'routing-table.md', 'routing-overrides.md',
    'tools.md', 'comms-ledger.json', 'work-patterns.md', 'health-knowledge.md', 'ground-control.md',
  ]);

  const knowledgeDeclaredBy: Record<string, string[]> = {};
  const knowledgeReadBy: Record<string, string[]> = {};

  for (const f of knowledgeFiles) {
    knowledgeDeclaredBy[f] = [];
    knowledgeReadBy[f] = [];
  }

  // ── 2. Characters ────────────────────────────────
  const characters = getCharacters();

  for (const [id, char] of Object.entries(characters)) {
    nodes.push({
      id: `char:${id}`,
      type: 'character',
      label: char.name,
      metadata: {
        tier: char.tier,
        domain: char.domain || '',
        color: char.color,
        icon: char.icon || '',
        skills: char.skills || [],
        sharedKnowledge: char.sharedKnowledge || [],
      },
    });

    // "declares" edges: character -> knowledge
    for (const kName of char.sharedKnowledge || []) {
      // Resolve filename: try .md first, then .json
      const baseName = kName.replace(/\.(md|json)$/, '');
      const kFile = knowledgeFiles.has(`${baseName}.md`) ? `${baseName}.md`
        : knowledgeFiles.has(`${baseName}.json`) ? `${baseName}.json`
        : `${baseName}.md`; // fallback
      const exists = knowledgeFiles.has(kFile);
      edges.push({
        source: `char:${id}`,
        target: `knowledge:${kFile}`,
        type: 'declares',
        status: exists ? 'ok' : 'broken',
      });
      if (exists) {
        if (!knowledgeDeclaredBy[kFile]) knowledgeDeclaredBy[kFile] = [];
        knowledgeDeclaredBy[kFile].push(id);
      }
    }
  }

  // ── 3. Skills ─────────────────────────────────────
  const skillSet = new Set<string>();
  try {
    for (const d of fs.readdirSync(SKILLS_DIR)) {
      const skillMdPath = path.join(SKILLS_DIR, d, 'SKILL.md');
      try {
        if (!fs.statSync(skillMdPath).isFile()) continue;
      } catch {
        continue;
      }
      skillSet.add(d);

      const content = fs.readFileSync(skillMdPath, 'utf-8');
      const fm = parseFrontmatter(content);
      const body = content.replace(/^---[\s\S]*?---/, '');
      const refsFound = scanFileReferences(body, knowledgeFiles);

      // Check for missing deps
      const missingDeps: string[] = [];
      for (const ref of refsFound) {
        if (!knowledgeFiles.has(ref)) {
          missingDeps.push(ref);
        }
      }

      nodes.push({
        id: `skill:${d}`,
        type: 'skill',
        label: fm.name || d,
        metadata: {
          character: fm.character || '',
          readsFiles: refsFound,
          ...(missingDeps.length > 0 ? { missingDeps } : {}),
        },
      });

      // "reads" edges: skill -> knowledge
      for (const ref of refsFound) {
        const exists = knowledgeFiles.has(ref);
        edges.push({
          source: `skill:${d}`,
          target: `knowledge:${ref}`,
          type: 'reads',
          status: exists ? 'ok' : 'broken',
        });
        if (exists) {
          knowledgeReadBy[ref].push(d);
        }
      }
    }
  } catch {}

  // ── 4. "owns" edges: character -> skill ───────────
  for (const [id, char] of Object.entries(characters)) {
    for (const skillName of char.skills || []) {
      const exists = skillSet.has(skillName);
      edges.push({
        source: `char:${id}`,
        target: `skill:${skillName}`,
        type: 'owns',
        status: exists ? 'ok' : 'broken',
      });
    }
  }

  // ── 5. Knowledge nodes (with diagnostic metadata) ─
  for (const f of knowledgeFiles) {
    const declared = knowledgeDeclaredBy[f] || [];
    const readBy = knowledgeReadBy[f] || [];
    // "partial" if declared by characters but no skill actually reads it
    const diagnostic = declared.length > 0 && readBy.length === 0 ? 'partial' : undefined;
    nodes.push({
      id: `knowledge:${f}`,
      type: 'knowledge',
      label: f.replace('.md', ''),
      metadata: {
        declaredBy: declared,
        readBy: readBy,
        ...(diagnostic ? { diagnostic } : {}),
      },
    });
  }

  // ── 6. Scheduler jobs ─────────────────────────────
  for (const job of SCHEDULE_JOBS) {
    if (!job.enabled) continue;
    nodes.push({
      id: `schedule:${job.id}`,
      type: 'schedule',
      label: job.label || job.displayName,
      metadata: {
        cron: job.cron,
        charName: job.charName,
        jobId: job.id,
      },
    });

    // "triggers" edge: schedule -> character
    const charExists = !!characters[job.charName];
    edges.push({
      source: `schedule:${job.id}`,
      target: `char:${job.charName}`,
      type: 'triggers',
      status: charExists ? 'ok' : (job.charName === 'system' ? 'ok' : 'broken'),
    });
  }

  // ── 7. Pipeline sources ───────────────────────────
  for (const src of PIPELINE_SOURCES) {
    nodes.push({
      id: `source:${src.label.toLowerCase().replace(/\s+/g, '-')}`,
      type: 'source',
      label: src.label,
      metadata: { icon: src.icon, color: src.color },
    });

    // "feeds" edge: source -> postman (primary input character)
    const postmanExists = !!characters['postman'];
    edges.push({
      source: `source:${src.label.toLowerCase().replace(/\s+/g, '-')}`,
      target: 'char:postman',
      type: 'feeds',
      status: postmanExists ? 'ok' : 'broken',
    });
  }

  // ── 8. Mark unused knowledge edges ────────────────
  // A "declares" edge is "unused" if the knowledge file has no skill reading it
  // Exception: system-context files (identity, writing-voice, etc.) are loaded implicitly
  for (const edge of edges) {
    if (edge.type === 'declares' && edge.status === 'ok') {
      const kFile = edge.target.replace('knowledge:', '');
      if (SYSTEM_CONTEXT_FILES.has(kFile)) continue; // skip system context
      const readBy = knowledgeReadBy[kFile] || [];
      if (readBy.length === 0) {
        edge.status = 'unused';
      }
    }
  }

  // ── 9. Diagnostics summary ────────────────────────
  const brokenEdges = edges.filter(e => e.status === 'broken').length;
  const unusedKnowledge = [...knowledgeFiles].filter(
    f => !SYSTEM_CONTEXT_FILES.has(f) && (knowledgeDeclaredBy[f]?.length || 0) > 0 && (knowledgeReadBy[f]?.length || 0) === 0
  ).length;
  const missingFiles = nodes
    .filter(n => n.type === 'skill' && Array.isArray(n.metadata.missingDeps) && (n.metadata.missingDeps as string[]).length > 0)
    .reduce((sum, n) => sum + (n.metadata.missingDeps as string[]).length, 0);

  return apiOk({
    nodes,
    edges,
    diagnostics: {
      totalNodes: nodes.length,
      totalEdges: edges.length,
      brokenEdges,
      unusedKnowledge,
      missingFiles,
    },
  });
}
