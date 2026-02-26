import type { LucideIcon } from "lucide-react";

// ── API response types (same as current SystemGraph) ──

export type ApiCharacter = {
  id: string;
  name: string;
  tier: string;
  icon: string;
  color: string;
  domain: string;
  model: string;
  skills: string[];
  routingKeywords: string[];
  sharedKnowledge: string[];
  actions: { label: string; icon: string; description: string }[];
  outputs: string[];
  gates: string[];
  seeds: Record<string, string>;
};

export type ApiSource = { label: string; icon: string; color: string; description?: string };
export type ApiOutput = { label: string; icon: string; color: string; description?: string };

export type ApiConfig = {
  paths: { label: string; value: string }[];
  tana: { url: string; workspace: string; connected: boolean };
  gmail: { personal: boolean; school: boolean };
  calendar: boolean;
  characters: { name: string; tier: string }[];
  skills: string[];
  knowledge: string[];
  sources: ApiSource[];
  outputs: ApiOutput[];
};

// ── Node data payloads ──

export type SourceNodeData = {
  label: string;
  icon: LucideIcon;
  color: string;
  description?: string;
};

export type PostmanNodeData = {
  id: string;
  name: string;
  icon: LucideIcon;
  color: string;
  model: string;
  actions: { label: string; icon: LucideIcon; description: string }[];
};

export type ScheduleNodeData = {
  jobId: string;
  displayName: string;
  charName: string;
  charColor: string;
  cron: string;
  description: string;
  enabled: boolean;
};

export type TanaTagNodeData = {
  tag: string;
  fields: string;
  description: string;
};

export type CharacterNodeData = {
  id: string;
  name: string;
  icon: LucideIcon;
  color: string;
  model: string;
  domain: string;
  actions: { label: string; icon: LucideIcon; description: string }[];
  outputs: string[];
  routing: string[];
  gates?: string[];
  skills: string[];
  sharedKnowledge: string[];
  onOpenEditor: (title: string, fetchUrl: string, saveUrl: string, lineLimit?: number) => void;
};

export type OutputNodeData = {
  label: string;
  icon: LucideIcon;
  color: string;
};

export type GroupNodeData = {
  label: string;
  note?: string;
};

// ── Tag info (static, architectural) ──

export const tagInfo: Record<string, string> = {
  "#post": "Intake node created by Postman. Fields: From context, Source (mail/whatsapp/tana/manual), Receiver (character), Type (task/question/fyi/deadline), Status, Priority. Email body added as children.",
  "#task": "Work unit processed by characters. Fields: Status (backlog/in-progress/done), Priority (high/medium/low), Track, Assigned (character), Due date. Created from #post or directly.",
  "#log": "Completion record. Fields: Track, Date. Created when a task is archived — summary child added, original task trashed.",
};
