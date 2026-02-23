import path from 'path';
import fs from 'fs';
import { getCharacters } from './characters';
import { readSkill } from './skills';
import { getSharedKnowledge } from './shared';

const HOME = process.env.HOME || '/Users/keremozanbayraktar';
const CHARACTERS_DIR = path.join(HOME, '.claude', 'characters');

export function buildPrompt(skillName: string | null, extra?: string): string {
  const sharedKnowledge = getSharedKnowledge();
  const tanaIds = sharedKnowledge['tana-ids'] || '';

  if (!skillName) return extra || '';
  const skill = readSkill(skillName);
  if (!skill) return extra || '';

  const needsTana = skill.includes('tana-ids.md') || skill.includes('Tana');
  let prompt = `You are Kerem's personal assistant. Execute the following task fully and autonomously. Do not ask for confirmation — just do it and report results.\n\n${skill}`;
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
      if (skill) prompt += `\n\n---\n\n${skill}`;
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

  if (taskContext) {
    prompt += `\n\n---\n\n## Task\n${taskContext}`;
  }

  return prompt;
}
