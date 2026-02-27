import path from 'path';
import fs from 'fs';
import { getCharacters } from './characters';
import { readSkill } from './skills';
import { getSharedKnowledge } from './shared';
import { CHARACTERS_DIR, USER_NAME } from './config';
import { serverLog } from './server-log';

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

export function buildCharacterPrompt(characterId: string, taskContext?: string): string {
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

  if (char.knowledgeFile) {
    const knowledgePath = path.join(CHARACTERS_DIR, char.tier, char.knowledgeFile);
    try {
      const knowledge = fs.readFileSync(knowledgePath, 'utf-8');
      if (knowledge.trim()) prompt += `\n\n---\n\n## Domain Knowledge\n${knowledge}`;
    } catch {}
  }

  if (char.skills?.length) {
    for (const skillName of char.skills) {
      const skill = readSkill(skillName);
      if (skill) {
        prompt += `\n\n---\n\n${skill}`;
        serverLog({ char: 'system', action: 'skill-invoked', detail: skillName, target: characterId }).catch(() => {});
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

  // Architect gets CHANGELOG so it knows what's already built
  if (characterId === 'architect') {
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
- [quick-reply: "Option A" | "Option B" | "Option C"] → clickable buttons the user can tap
Use ==highlights== when presenting key data, summaries, or things the user should notice.`;

  if (taskContext) {
    prompt += `\n\n---\n\n## Task\n${taskContext}`;
  }

  return prompt;
}
