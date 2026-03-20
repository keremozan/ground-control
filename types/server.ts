// types/server.ts
// Server-only type definitions. Do NOT import in client components.

import type { ActionInfo } from './index';

// ── Character ──

export type Character = {
  id: string;
  name: string;
  tier: 'core' | 'meta' | 'stationed';
  color: string;
  domain?: string;
  defaultModel?: string;
  systemPrompt?: string;
  skills?: string[];
  modifiers?: string[];
  sharedKnowledge?: string[];
  knowledgeFile?: string;
  memoryFile?: string;
  memory: string;
  icon?: string;
  actions?: ActionInfo[];
  outputs?: string[];
  gates?: string[];
  seeds?: Record<string, string>;
  suggestions?: string[];
  canSpawn?: string[];
  trackPatterns?: string[];
  routingKeywords?: string[];
  schedules?: {
    id: string;
    displayName: string;
    seedPrompt: string;
    cron: string;
    label: string;
    enabled: boolean;
  }[];
  injectChangelog?: boolean;
  autoReviewConfig?: { skillPatterns: Record<string, string> };
};

// ── Tana ──

export type TanaTask = {
  id: string;
  name: string;
  status: string;
  priority: string;
  track: string;
  trackId: string | null;
  assigned: string | null;
  dueDate: string | null;
  phaseId?: string;
  phaseName?: string;
};

export type TanaPhase = {
  id: string;
  name: string;
  status: string;
  track: string;
  trackId: string | null;
  taskIds: string[];
};

export type TanaProject = {
  id: string;
  name: string;
  trackId: string;
  startDate: string | null;
  deadline: string | null;
  phases: {
    id: string;
    name: string;
    status: 'pending' | 'active' | 'completed';
    taskCount: number;
    doneCount: number;
    startDate: string | null;
    endDate: string | null;
  }[];
  lastActivity: {
    date: string;
    summary: string;
  } | null;
};

// ── Gmail Pipeline ──

export type EmailInput = {
  id: string;
  threadId: string;
  from: string;
  fromRaw: string;
  subject: string;
  snippet: string;
  date: string;
  labels: string[];
  account: string;
};

export type RouteAction = {
  type: 'create_task' | 'create_opportunity' | 'create_event' | 'draft_reply' | 'escalate' | 'archive';
  title?: string;
  character?: string;
  track?: string;
  priority?: string;
  due?: string;
  intent?: string;
  reason?: string;
  date?: string;
  time?: string;
  duration?: number;
};

export type ClassifyResult = { actionable: boolean; reason: string };
export type RouteResult = { actions: RouteAction[] };

// ── Pipeline Log ──

export type StageResult = {
  stage: number;
  name: string;
  result: string;
  reason?: string;
  actions?: string[];
  details?: string[];
  ms: number;
};

export type PipelineEntry = {
  messageId: string;
  threadId: string;
  from: string;
  subject: string;
  account: string;
  receivedAt: string;
  stages: StageResult[];
  totalMs: number;
  finalAction: string;
};
