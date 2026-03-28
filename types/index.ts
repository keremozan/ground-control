// types/index.ts
// Single source of truth for all client-safe type definitions.

// --- Character & config ---

export interface CharacterInfo {
  id: string;
  name: string;
  tier: string;
  icon: string;
  color: string;
  domain?: string;
  groups?: string[];
  actions?: Array<{
    label: string;
    icon: string;
    description: string;
    autonomous?: boolean;
    autonomousInput?: boolean;
    inputPlaceholder?: string;
    endpoint?: string;
    model?: string;
  }>;
  seeds?: Record<string, string>;
  skills?: string[];
  routingKeywords?: string[];
  sharedKnowledge?: string[];
  internal?: boolean;
  parentChar?: string;
}

export interface SystemConfig {
  trackColorPatterns?: Record<string, string>;
  emailColorPatterns?: Record<string, string>;
  emailLabelColors?: Record<string, { color: string; bg: string }>;
  calendarColorPatterns?: Record<string, string>;
}

// --- Action log ---

export interface ActionLogEntry {
  timestamp: string;
  widget: "inbox" | "tasks" | "chat" | "crew" | "calendar" | "scheduler" | "bug";
  action: string;
  target: string;
  character?: string;
  detail?: string;
  jobId?: string;
}

// --- Chat ---

export interface ChatTrigger {
  charName: string;
  seedPrompt: string;
  action: string;
  context?: string;
  openOnly?: boolean;
  model?: string;
}

export interface ChatContextValue {
  trigger: ChatTrigger | null;
  setTrigger: (t: ChatTrigger | null) => void;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  images?: string[]; // base64 data URLs, for user messages with pasted images
  charName?: string;
  duration?: number;
  tokens?: number;
}

export interface ChatTab {
  id: string;
  charId: string;
  messages: ChatMessage[];
  modelOverride?: string;
  label?: string;
}

// --- Core domain models ---

export interface Email {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  snippet: string;
  date: string;
  unread: boolean;
  account: "personal" | "school";
  labels: string[];
  threadCount?: number;
  accounts?: string[];
}

export type EffectivePriority = "urgent" | "high" | "medium" | "low";

export interface Task {
  id: string;
  name: string;
  status: string;
  priority: "high" | "medium" | "low";
  effectivePriority?: EffectivePriority;
  overdue?: boolean;
  track: string;
  trackId: string | null;
  assigned: string | null;
  dueDate: string | null;
  phaseId?: string;
  phaseName?: string;
}

export interface ProjectPhase {
  id: string;
  name: string;
  status: "pending" | "active" | "completed";
  taskCount: number;
  doneCount: number;
  startDate: string | null;
  endDate: string | null;
}

export interface Project {
  id: string;
  name: string;
  trackId: string;
  startDate: string | null;
  deadline: string | null;
  phases: ProjectPhase[];
  lastActivity: { date: string; summary: string } | null;
}

export interface CalEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  location?: string;
  allDay: boolean;
  calendarId: string;
  htmlLink?: string;
  colorId?: string;
}

export interface ActionInfo {
  label: string;
  icon: string;
  description: string;
  autonomous?: boolean;
  autonomousInput?: boolean;
  inputPlaceholder?: string;
  endpoint?: string;
  model?: string;
}

// --- Scheduler & process registry ---

export interface ScheduleJob {
  id: string;
  charName: string;
  displayName: string;
  seedPrompt: string;
  description: string;
  cron: string;
  label: string;
  group?: string;
  mode?: string;
  type?: "single" | "process-tasks" | "api-call";
  endpoint?: string;
  maxTurns?: number;
  enabled: boolean;
}

export interface JobResult {
  jobId: string;
  charName: string;
  displayName: string;
  timestamp: string;
  response: string;
  durationMs: number;
}

export interface ProcessEntry {
  id: string;
  pid: number;
  charName: string;
  label: string;
  jobId?: string;
  startedAt: string;
}

// --- Generic API envelope ---

export interface ApiResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}
