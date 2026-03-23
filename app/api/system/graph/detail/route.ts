export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import fs from 'fs';
import path from 'path';
import { NextRequest } from 'next/server';
import { SKILLS_DIR, SHARED_DIR, JOB_RESULTS_PATH } from '@/lib/config';
import { getCharacters } from '@/lib/characters';
import { apiOk, apiError } from '@/lib/api-helpers';

// ── Helpers ─────────────────────────────────────

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

/** Extract numbered steps from Procedure/Steps section */
function parseSteps(content: string): { step: string; title: string; content: string }[] {
  // Match a section headed by "Procedure" or "Steps"
  const sectionMatch = content.match(/^#{1,3}\s+(?:Procedure|Steps)\s*\n([\s\S]*?)(?=\n#{1,3}\s|\n---|\Z)/im);
  if (!sectionMatch) return [];

  const section = sectionMatch[1];
  const steps: { step: string; title: string; content: string }[] = [];

  // Match numbered steps like "1. Title" or "1) Title"
  const stepPattern = /^(\d+)[.)]\s+(.+)/gm;
  let m: RegExpExecArray | null;
  const matches: { index: number; step: string; title: string }[] = [];

  while ((m = stepPattern.exec(section)) !== null) {
    matches.push({ index: m.index, step: m[1], title: m[2].trim() });
  }

  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index + matches[i].step.length + 2 + matches[i].title.length;
    const end = i + 1 < matches.length ? matches[i + 1].index : section.length;
    const body = section.slice(start, end).trim();
    steps.push({ step: matches[i].step, title: matches[i].title, content: body });
  }

  return steps;
}

/** Extract Boundaries section as a string */
function parseBoundaries(content: string): string {
  const match = content.match(/^#{1,3}\s+Boundaries\s*\n([\s\S]*?)(?=\n#{1,3}\s|\n---|\Z)/im);
  return match ? match[1].trim() : '';
}

// ── Route ───────────────────────────────────────

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id');
  if (!id) return apiError(400, 'Missing "id" query parameter');

  const colonIdx = id.indexOf(':');
  if (colonIdx < 0) return apiError(400, 'Invalid id format. Expected prefix:value');

  const prefix = id.slice(0, colonIdx);
  const value = id.slice(colonIdx + 1);

  switch (prefix) {
    // ── skill ─────────────────────────────────
    case 'skill': {
      const skillPath = path.join(SKILLS_DIR, value, 'SKILL.md');
      let content: string;
      try {
        content = fs.readFileSync(skillPath, 'utf-8');
      } catch {
        return apiError(404, `Skill "${value}" not found`);
      }

      const fm = parseFrontmatter(content);
      const steps = parseSteps(content);
      const boundaries = parseBoundaries(content);

      return apiOk({
        type: 'skill',
        name: fm.name || value,
        description: fm.description || '',
        character: fm.character || '',
        steps,
        boundaries,
        rawContent: content.slice(0, 3000),
      });
    }

    // ── character ─────────────────────────────
    case 'char': {
      const characters = getCharacters();
      const char = characters[value];
      if (!char) return apiError(404, `Character "${value}" not found`);

      return apiOk({
        type: 'character',
        ...char,
      });
    }

    // ── knowledge ─────────────────────────────
    case 'knowledge': {
      const filePath = path.join(SHARED_DIR, value);
      let content: string;
      try {
        content = fs.readFileSync(filePath, 'utf-8');
      } catch {
        return apiError(404, `Knowledge file "${value}" not found`);
      }

      const lines = content.split('\n');
      return apiOk({
        type: 'knowledge',
        filename: value,
        preview: content.slice(0, 500),
        lineCount: lines.length,
      });
    }

    // ── schedule ──────────────────────────────
    case 'schedule': {
      let results: { jobId: string; timestamp: string; response: string; durationMs: number }[] = [];
      try {
        const raw = fs.readFileSync(JOB_RESULTS_PATH, 'utf-8');
        results = JSON.parse(raw);
      } catch {
        // No results file or parse error
      }

      const entry = results.find((r) => r.jobId === value);
      return apiOk({
        type: 'schedule',
        jobId: value,
        lastRun: entry
          ? {
              timestamp: entry.timestamp,
              response: (entry.response || '').slice(0, 500),
              durationMs: entry.durationMs,
            }
          : null,
      });
    }

    default:
      return apiError(400, `Unknown id prefix "${prefix}"`);
  }
}
