import { execSync } from 'child_process';
import path from 'path';

const SUPERTAG_CLI = path.join(process.env.HOME || '', 'Tools', 'supertag-cli', 'supertag');

export type SemanticResult = {
  name: string;
  id: string;
  similarity: number;
  tags: string[];
};

/**
 * Run semantic search against Tana embeddings via supertag CLI.
 * Returns nodes ranked by similarity (0-1).
 */
export function semanticSearch(query: string, opts?: {
  limit?: number;
  minSimilarity?: number;
}): SemanticResult[] {
  const limit = opts?.limit || 5;
  const minSim = opts?.minSimilarity || 0.3;

  try {
    const output = execSync(
      `${SUPERTAG_CLI} search --semantic "${query.replace(/"/g, '\\"')}" --limit ${limit} --json`,
      { timeout: 10_000, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }
    );
    const results = JSON.parse(output);
    if (!Array.isArray(results)) return [];

    return results
      .map((r: { name?: string; id?: string; similarity?: string | number; tags?: string | string[] }) => ({
        name: r.name || '',
        id: r.id || '',
        similarity: typeof r.similarity === 'string' ? parseFloat(r.similarity) : (r.similarity || 0),
        tags: typeof r.tags === 'string' ? r.tags.split(',').map(t => t.trim()).filter(Boolean) : (r.tags || []),
      }))
      .filter(r => r.similarity >= minSim);
  } catch {
    return []; // CLI not available or search failed
  }
}
