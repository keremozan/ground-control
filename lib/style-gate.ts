import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { HOME, CLAUDE_BIN } from './config';
import { registerProcess } from './process-registry';

const TROPES_PATH = path.join(HOME, 'Desktop', 'tropes-fork.md');
const CLAUDE_MD_PATH = path.join(HOME, 'CLAUDE.md');

let cachedRules: string | null = null;

function loadRules(): string {
  if (cachedRules) return cachedRules;

  const parts: string[] = [];

  // Load CLAUDE.md hard output rules
  try {
    const claudeMd = fs.readFileSync(CLAUDE_MD_PATH, 'utf-8');
    const match = claudeMd.match(/## Hard output rules[^\n]*\n([\s\S]*?)(?=\n---|\n## )/);
    if (match) parts.push('## Style Rules\n' + match[1].trim());
  } catch {}

  // Load tropes file (avoid patterns sections only, skip full descriptions)
  try {
    const tropes = fs.readFileSync(TROPES_PATH, 'utf-8');
    const avoidBlocks: string[] = [];
    const lines = tropes.split('\n');
    let currentTrope = '';
    let inAvoid = false;

    for (const line of lines) {
      if (line.startsWith('### ')) {
        currentTrope = line.replace('### ', '').trim();
        inAvoid = false;
      } else if (line.startsWith('**Avoid patterns like:**')) {
        inAvoid = true;
        avoidBlocks.push(`\n[${currentTrope}]`);
      } else if (inAvoid && line.startsWith('- ')) {
        avoidBlocks.push(line);
      } else if (inAvoid && line.trim() === '') {
        inAvoid = false;
      }
    }
    parts.push('## Tropes to Avoid\n' + avoidBlocks.join('\n'));
  } catch {}

  cachedRules = parts.join('\n\n');
  return cachedRules;
}

/**
 * Run text through the style gate.
 * Uses a single-turn Claude pass (haiku) to catch and fix style violations and AI tropes.
 * Fail-open: returns original text if the gate fails.
 */
export async function styleGate(text: string): Promise<string> {
  if (!text.trim()) return text;

  // Skip short text (under 50 chars), JSON, or technical output
  if (text.length < 50) return text;
  if (text.trim().startsWith('{') || text.trim().startsWith('[')) return text;

  const rules = loadRules();
  if (!rules) return text;

  const prompt = `You are a copy editor. Fix the text below so it follows the style rules and avoids the listed tropes. Only change what violates the rules. Preserve all factual content, structure, and meaning. Do not add commentary. Return only the cleaned text.

${rules}

---

TEXT TO EDIT:

${text}`;

  try {
    const result = await gateSpawn(prompt);
    return result || text;
  } catch {
    return text;
  }
}

/** Self-contained single-turn Claude call. Avoids circular import with spawn.ts. */
function gateSpawn(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const env = { ...process.env };
    delete env.CLAUDECODE;

    const proc = spawn(CLAUDE_BIN, [
      '-p', prompt,
      '--output-format', 'stream-json',
      '--verbose',
      '--model', 'sonnet',
      '--max-turns', '1',
      '--dangerously-skip-permissions',
    ], {
      cwd: HOME,
      env: env as NodeJS.ProcessEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    registerProcess(proc, { charName: 'system', label: 'style-gate' });

    let buffer = '';
    const textParts: string[] = [];

    proc.stdout?.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.type === 'assistant') {
            const content = msg.message?.content;
            if (Array.isArray(content)) {
              for (const block of content) {
                if (block.type === 'text') textParts.push(block.text);
              }
            }
          }
        } catch {}
      }
    });

    proc.on('close', () => {
      if (buffer.trim()) {
        try {
          const msg = JSON.parse(buffer);
          if (msg.type === 'assistant') {
            const content = msg.message?.content;
            if (Array.isArray(content)) {
              for (const block of content) {
                if (block.type === 'text') textParts.push(block.text);
              }
            }
          }
        } catch {}
      }
      resolve(textParts.join('\n'));
    });

    proc.on('error', () => resolve(''));

    // 2 minute timeout for the gate
    setTimeout(() => {
      proc.kill();
      resolve('');
    }, 120_000);
  });
}

/** Clear cached rules (call after CLAUDE.md or tropes file changes) */
export function clearStyleGateCache() {
  cachedRules = null;
}
