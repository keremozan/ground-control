import path from 'path';
import fs from 'fs';
import { getCharacters } from './characters';
import { readSkill } from './skills';
import { getSharedKnowledge } from './shared';
import { CHARACTERS_DIR, USER_NAME, HOME } from './config';
import { serverLog } from './server-log';

const INSTINCTS_DIR = path.join(HOME, '.claude', 'instincts');
const MAX_INSTINCTS_PER_CHAR = 10;
const MIN_CONFIDENCE = 0.5;

/** Load instincts above confidence threshold for a character */
function loadInstincts(characterId: string): string[] {
  const lines: string[] = [];

  const dirs = [
    path.join(INSTINCTS_DIR, 'global'),
    path.join(INSTINCTS_DIR, 'characters'),
  ];

  for (const dir of dirs) {
    try {
      if (!fs.existsSync(dir)) continue;
      for (const file of fs.readdirSync(dir)) {
        if (!file.endsWith('.yaml')) continue;
        try {
          const content = fs.readFileSync(path.join(dir, file), 'utf-8');
          const parts = content.split('---');
          if (parts.length < 3) continue;

          // Parse frontmatter manually (avoid yaml dependency in lib)
          const fm = parts[1];
          const confMatch = fm.match(/confidence:\s*([\d.]+)/);
          const confidence = confMatch ? parseFloat(confMatch[1]) : 0;
          if (confidence < MIN_CONFIDENCE) continue;

          // Check character scope
          const charMatch = fm.match(/character:\s*(\S+)/);
          const instinctChar = charMatch ? charMatch[1] : null;
          if (instinctChar && instinctChar !== characterId) continue;

          // Extract action
          const body = parts.slice(2).join('---');
          const actionMatch = body.match(/## Action\s*\n([^\n#]+)/);
          const action = actionMatch ? actionMatch[1].trim() : null;
          if (action) {
            lines.push(`- [${confidence}] ${action}`);
          }
        } catch {}
      }
    } catch {}
  }

  // Sort by confidence descending, cap at max
  lines.sort((a, b) => {
    const ca = parseFloat(a.match(/\[([\d.]+)\]/)?.[1] || '0');
    const cb = parseFloat(b.match(/\[([\d.]+)\]/)?.[1] || '0');
    return cb - ca;
  });

  return lines.slice(0, MAX_INSTINCTS_PER_CHAR);
}

export function buildPrompt(skillName: string | null, extra?: string): string {
  const sharedKnowledge = getSharedKnowledge();
  const tanaIds = sharedKnowledge['tana-ids'] || '';

  if (!skillName) return extra || '';
  const skill = readSkill(skillName);
  if (!skill) return extra || '';

  const needsTana = skill.includes('tana-ids.md') || skill.includes('Tana');
  let prompt = `You are ${USER_NAME}'s personal assistant. Execute the following task fully and autonomously. Do not ask for confirmation — just do it and report results.\n\n${skill}`;
  if (needsTana && tanaIds) prompt += `\n\n---\n\n${tanaIds}`;
  if (extra) prompt += `\n\n---\n\nAdditional context: ${extra}`;
  return prompt;
}

export function buildCharacterPrompt(characterId: string, taskContext?: string, opts?: { activeSkill?: string; injectSkill?: string }): string {
  const characters = getCharacters();
  const sharedKnowledge = getSharedKnowledge();
  const char = characters[characterId];
  if (!char) return buildPrompt(null, taskContext);

  let prompt = (char.systemPrompt || '') + '\n';

  if (char.sharedKnowledge?.length) {
    for (const key of char.sharedKnowledge) {
      if (sharedKnowledge[key]) prompt += `\n---\n\n${sharedKnowledge[key]}`;
    }
  }

  if (char.memory?.trim()) {
    prompt += `\n\n---\n\n## Memory\n${char.memory}`;
  }

  // Load instincts (learned behaviors from user corrections)
  const instinctLines = loadInstincts(characterId);
  if (instinctLines.length > 0) {
    prompt += `\n\n---\n\n## Learned Behaviors\nThese patterns were learned from your corrections. Follow them.\n${instinctLines.join('\n')}`;
  }

  if (char.knowledgeFile) {
    const knowledgePath = path.join(CHARACTERS_DIR, char.tier, char.knowledgeFile);
    try {
      const knowledge = fs.readFileSync(knowledgePath, 'utf-8');
      if (knowledge.trim()) prompt += `\n\n---\n\n## Domain Knowledge\n${knowledge}`;
    } catch {}
  }

  if (char.skills?.length) {
    const skillsToLoad = opts?.activeSkill
      ? char.skills.filter(s => s === opts.activeSkill)
      : char.skills;
    for (const skillName of skillsToLoad) {
      const skill = readSkill(skillName);
      if (skill) {
        prompt += `\n\n---\n\n${skill}`;
        serverLog({ char: 'system', action: 'skill-invoked', detail: skillName, target: characterId }).catch(() => {});
      }
    }
  }

  // Inject a skill from slash command (any skill, regardless of character config)
  if (opts?.injectSkill) {
    const alreadyLoaded = char.skills?.includes(opts.injectSkill);
    if (!alreadyLoaded) {
      const skill = readSkill(opts.injectSkill);
      if (skill) {
        prompt += `\n\n---\n\n${skill}`;
        serverLog({ char: 'system', action: 'skill-injected', detail: opts.injectSkill, target: characterId }).catch(() => {});
      }
    }
  }

  if (char.modifiers?.length) {
    for (const mod of char.modifiers) {
      const skill = readSkill(mod);
      if (skill) prompt += `\n\n---\n\n${skill}`;
    }
  }

  const needsTana = prompt.includes('tana-ids.md') || prompt.includes('Tana');
  if (needsTana && sharedKnowledge['tana-ids']) {
    prompt += `\n\n---\n\n${sharedKnowledge['tana-ids']}`;
  }

  // Inject CHANGELOG for characters that request it (e.g. architect)
  if (char.injectChangelog) {
    try {
      const changelog = fs.readFileSync(
        path.join(process.cwd(), 'CHANGELOG.md'), 'utf-8'
      );
      if (changelog.trim()) {
        prompt += `\n\n---\n\n## Changelog (what's already built)\n${changelog}`;
      }
    } catch {}
  }

  // Chat formatting guide — all characters get this
  prompt += `\n\n---\n\n## Chat Formatting
You are running inside a web chat UI. These markdown extensions are rendered specially:
- ==highlighted text== → yellow highlight (use for key findings, important numbers, emphasis)
- [Node name](tana:nodeId) → clickable Tana link
- [Thread](gmail:threadId:account) → clickable Gmail link
- [quick-reply: "Option A" | "Option B" | "Option C"] → clickable buttons the user can tap (one click = submit)
- Multi-question form (user answers all, then clicks Submit):
  [form: "Submit label"]
  Question one? :: opt1 | opt2 | opt3
  Question two? :: optA | optB | optC
  [/form]
  When Coach (or any character) needs to ask multiple questions at once, use the form syntax — never quick-reply blocks stacked on top of each other.
Use ==highlights== when presenting key data, summaries, or things the user should notice.`;

  // Inject current date in Istanbul timezone — overrides UTC default from Claude Code's CLAUDE.md injection
  const istanbulDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date());
  prompt += `\n\n# currentDate\nToday's date is ${istanbulDate}.`;

  if (taskContext) {
    prompt += `\n\n---\n\n## Task\n${taskContext}`;
  }

  return prompt;
}

/** Minimal prompt for revision passes: system prompt + modifiers only, no skills or shared knowledge. */
export function buildRevisionBasePrompt(characterId: string): string {
  const characters = getCharacters();
  const char = characters[characterId];
  if (!char) return '';
  let prompt = char.systemPrompt || '';
  for (const mod of (char.modifiers || [])) {
    const skill = readSkill(mod);
    if (skill) prompt += `\n\n---\n\n${skill}`;
  }
  return prompt;
}
