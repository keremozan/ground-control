import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { HOME, CLAUDE_BIN } from './config';
import { registerProcess } from './process-registry';

const TROPES_PATH = path.join(HOME, 'Desktop', 'tropes-fork.md');
const CLAUDE_MD_PATH = path.join(HOME, 'CLAUDE.md');

let cachedSyntaxRules: string | null = null;
let cachedSemanticRules: string | null = null;

/** Pass 1 rules: mechanical pattern fixes (Haiku) */
function loadSyntaxRules(): string {
  if (cachedSyntaxRules) return cachedSyntaxRules;

  const rules: string[] = [];

  // CLAUDE.md hard output rules
  try {
    const claudeMd = fs.readFileSync(CLAUDE_MD_PATH, 'utf-8');
    const match = claudeMd.match(/## Hard output rules[^\n]*\n([\s\S]*?)(?=\n---|\n## )/);
    if (match) rules.push(match[1].trim());
  } catch {}

  // Hard connection rules
  try {
    const claudeMd = fs.readFileSync(CLAUDE_MD_PATH, 'utf-8');
    const match = claudeMd.match(/## Hard connection rules[^\n]*\n([\s\S]*?)(?=\n---|\n## )/);
    if (match) rules.push(match[1].trim());
  } catch {}

  cachedSyntaxRules = rules.join('\n\n');
  return cachedSyntaxRules;
}

/** Pass 2 rules: AI tropes and semantic issues (Sonnet) */
function loadSemanticRules(): string {
  if (cachedSemanticRules) return cachedSemanticRules;

  const blocks: string[] = [];

  try {
    const tropes = fs.readFileSync(TROPES_PATH, 'utf-8');
    const lines = tropes.split('\n');
    let currentTrope = '';
    let inAvoid = false;

    for (const line of lines) {
      if (line.startsWith('### ')) {
        currentTrope = line.replace('### ', '').trim();
        inAvoid = false;
      } else if (line.startsWith('**Avoid patterns like:**')) {
        inAvoid = true;
        blocks.push(`\n[${currentTrope}]`);
      } else if (inAvoid && line.startsWith('- ')) {
        blocks.push(line);
      } else if (inAvoid && line.trim() === '') {
        inAvoid = false;
      }
    }
  } catch {}

  cachedSemanticRules = blocks.join('\n');
  return cachedSemanticRules;
}

/**
 * Run text through the two-pass style gate.
 * Pass 1 (Haiku): mechanical syntax fixes (em dashes, colons, negation framing, filler)
 * Pass 2 (Sonnet): semantic trope detection (magic adverbs, inflated language, AI patterns)
 * Fail-open: returns original text if either pass fails.
 */
export async function styleGate(text: string): Promise<string> {
  if (!text.trim()) return text;

  // Skip short text (under 50 chars), JSON, or technical output
  if (text.length < 50) return text;
  if (text.trim().startsWith('{') || text.trim().startsWith('[')) return text;

  // Pass 1: Haiku for mechanical fixes
  const syntaxRules = loadSyntaxRules();
  let cleaned = text;

  if (syntaxRules) {
    const pass1Prompt = `You are a mechanical copy editor. Apply these rules strictly to the text below. This is pattern matching, not creative editing. Fix every violation. Do not change meaning, tone, or structure. Do not add commentary. Return only the fixed text.

RULES:
${syntaxRules}

TEXT:
${text}`;

    try {
      const result = await gateSpawn(pass1Prompt, 'haiku', 'style-gate-syntax');
      if (result) cleaned = result;
    } catch {}
  }

  // Pass 2: Sonnet for semantic trope detection
  const semanticRules = loadSemanticRules();

  if (semanticRules) {
    const pass2Prompt = `You are a style editor removing AI writing patterns. The text below may contain AI tropes: inflated language, magic adverbs, false profundity, unnecessary emphasis, patronizing analogies. Fix them. Keep the meaning. Make it sound like a confident human wrote it. Do not add commentary. Return only the cleaned text.

TROPES TO CATCH AND FIX:
${semanticRules}

TEXT:
${cleaned}`;

    try {
      const result = await gateSpawn(pass2Prompt, 'sonnet', 'style-gate-tropes');
      if (result) cleaned = result;
    } catch {}
  }

  return cleaned;
}

/** Self-contained single-turn Claude call. */
function gateSpawn(prompt: string, model: string, label: string): Promise<string> {
  return new Promise((resolve) => {
    const env = { ...process.env };
    delete env.CLAUDECODE;

    const proc = spawn(CLAUDE_BIN, [
      '-p', prompt,
      '--output-format', 'stream-json',
      '--verbose',
      '--model', model,
      '--max-turns', '1',
      '--dangerously-skip-permissions',
    ], {
      cwd: HOME,
      env: env as NodeJS.ProcessEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    registerProcess(proc, { charName: 'system', label });

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

    // 2 minute timeout per pass
    setTimeout(() => {
      proc.kill();
      resolve('');
    }, 120_000);
  });
}

/** Clear cached rules (call after CLAUDE.md or tropes file changes) */
export function clearStyleGateCache() {
  cachedSyntaxRules = null;
  cachedSemanticRules = null;
}
