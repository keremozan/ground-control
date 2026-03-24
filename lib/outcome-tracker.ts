import fs from 'fs';
import path from 'path';

const DATA_DIR = process.env.__TEST_DATA_DIR || path.join(process.cwd(), 'data');
const OUTCOMES_PATH = path.join(DATA_DIR, 'outcomes.json');
const MAX_AGE_DAYS = 90;

export type SignalType = 'chat-correction' | 'draft-outcome' | 'tana-outcome' | 'usage';

export type OutcomeEvent = {
  timestamp: string;
  character: string;
  signalType: SignalType;
  outcome: string;
  details: Record<string, unknown>;
};

function readOutcomes(): OutcomeEvent[] {
  try { return JSON.parse(fs.readFileSync(OUTCOMES_PATH, 'utf-8')); }
  catch { return []; }
}

function writeOutcomes(events: OutcomeEvent[]) {
  fs.mkdirSync(path.dirname(OUTCOMES_PATH), { recursive: true });
  fs.writeFileSync(OUTCOMES_PATH, JSON.stringify(events, null, 2));
}

export function recordOutcome(event: Omit<OutcomeEvent, 'timestamp'>) {
  const existing = readOutcomes();
  const entry: OutcomeEvent = { timestamp: new Date().toISOString(), ...event };
  writeOutcomes([entry, ...existing]);
}

export function getOutcomes(opts?: { character?: string; signalType?: SignalType; limit?: number }): OutcomeEvent[] {
  let events = readOutcomes();
  if (opts?.character) events = events.filter(e => e.character === opts.character);
  if (opts?.signalType) events = events.filter(e => e.signalType === opts.signalType);
  if (opts?.limit) events = events.slice(0, opts.limit);
  return events;
}

export function pruneOutcomes() {
  const cutoff = new Date(Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const events = readOutcomes().filter(e => e.timestamp > cutoff);
  writeOutcomes(events);
}
