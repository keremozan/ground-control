import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

const tmpDir = path.join(os.tmpdir(), `gc-test-outcomes-${Date.now()}`);

describe('outcome-tracker', () => {
  beforeEach(() => {
    process.env.__TEST_DATA_DIR = tmpDir;
    fs.mkdirSync(tmpDir, { recursive: true });
    const outcomesPath = path.join(tmpDir, 'outcomes.json');
    if (fs.existsSync(outcomesPath)) fs.unlinkSync(outcomesPath);
    // Clear module cache to pick up new env
    vi.resetModules();
  });

  it('records an outcome event and reads it back', async () => {
    const { recordOutcome, getOutcomes } = await import('@/lib/outcome-tracker');
    recordOutcome({
      character: 'scholar',
      signalType: 'chat-correction',
      outcome: 'negative',
      details: { before: 'wrote 400 words', after: 'user wanted 150' },
    });
    const events = getOutcomes();
    expect(events.length).toBeGreaterThanOrEqual(1);
    const last = events[0];
    expect(last.character).toBe('scholar');
    expect(last.signalType).toBe('chat-correction');
  });

  it('filters by character and signal type', async () => {
    const { recordOutcome, getOutcomes } = await import('@/lib/outcome-tracker');
    recordOutcome({ character: 'scholar', signalType: 'chat-correction', outcome: 'negative', details: {} });
    recordOutcome({ character: 'clerk', signalType: 'draft-outcome', outcome: 'positive', details: {} });
    expect(getOutcomes({ character: 'scholar' }).every(e => e.character === 'scholar')).toBe(true);
    expect(getOutcomes({ signalType: 'draft-outcome' }).every(e => e.signalType === 'draft-outcome')).toBe(true);
  });

  it('enforces 90-day rolling retention', async () => {
    const { pruneOutcomes, getOutcomes } = await import('@/lib/outcome-tracker');
    const outcomesPath = path.join(tmpDir, 'outcomes.json');
    const old = {
      timestamp: new Date(Date.now() - 91 * 24 * 60 * 60 * 1000).toISOString(),
      character: 'clerk',
      signalType: 'draft-outcome',
      outcome: 'deleted',
      details: {},
    };
    const recent = {
      timestamp: new Date().toISOString(),
      character: 'clerk',
      signalType: 'draft-outcome',
      outcome: 'positive',
      details: {},
    };
    fs.writeFileSync(outcomesPath, JSON.stringify([recent, old], null, 2));
    pruneOutcomes();
    const after = getOutcomes();
    expect(after.find(e => e.timestamp === old.timestamp)).toBeUndefined();
    expect(after.find(e => e.timestamp === recent.timestamp)).toBeDefined();
  });
});
