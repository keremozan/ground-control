import { buildCharacterPrompt } from './prompt';

export type Task = {
  label: string;
  description: string;
  category: 'email' | 'tana' | 'calendar' | 'research' | 'admin';
  character: string;
  model: string;
  maxTurns: number;
  prompt: () => string;
};

export const TASKS: Record<string, Task> = {
  'scan-inbox': {
    label: 'Scan Inbox',
    description: 'Scan both Gmail accounts for actionable emails',
    category: 'email',
    character: 'postman',
    model: 'haiku',
    maxTurns: 20,
    prompt: () => buildCharacterPrompt('postman', 'Run postman-scan-mail skill. Push all detected tasks automatically without asking.'),
  },
  'process-day': {
    label: 'Process Day',
    description: "Tag untagged nodes on today's Tana day page",
    category: 'tana',
    character: 'postman',
    model: 'haiku',
    maxTurns: 15,
    prompt: () => buildCharacterPrompt('postman', 'Run postman-scan-tana skill. Apply all classifications automatically.'),
  },
  'calendar-prep': {
    label: 'Calendar Prep',
    description: "Check calendar for the week ahead",
    category: 'calendar',
    character: 'scholar',
    model: 'sonnet',
    maxTurns: 10,
    prompt: () => buildCharacterPrompt('scholar', 'Run calendar skill. Check Google Calendar for events from today through end of week. Group by day, highlight conflicts or prep needed.'),
  },
  'scan-whatsapp': {
    label: 'Scan WhatsApp',
    description: 'Scan monitored WhatsApp chats for actionable messages',
    category: 'email',
    character: 'postman',
    model: 'haiku',
    maxTurns: 15,
    prompt: () => buildCharacterPrompt('postman', 'Run postman-scan-whatsapp skill.'),
  },
  'ta-briefing': {
    label: 'TA Briefing',
    description: 'Draft briefing emails for teaching assistants',
    category: 'email',
    character: 'proctor',
    model: 'sonnet',
    maxTurns: 15,
    prompt: () => buildCharacterPrompt('proctor', 'Run proctor-ta-ops skill. Draft briefing emails for teaching assistants.'),
  },
  'oracle-review': {
    label: 'Oracle Review',
    description: 'Strategic review of recent activity',
    category: 'research',
    character: 'oracle',
    model: 'opus',
    maxTurns: 20,
    prompt: () => buildCharacterPrompt('oracle', 'Do a comprehensive review of recent activity across Tana, email, and calendar. Surface patterns, risks, and recommendations.'),
  },
};

// Maps frontend action names to character IDs
export const ACTION_CHARACTERS: Record<string, string> = {
  'reply': 'postman',
  'task': 'postman',
  'schedule': 'scholar',
  'archive': 'postman',
  'summarize': 'postman',
};
