import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

const tmpDir = path.join(os.tmpdir(), `gc-test-drafts-${Date.now()}`);

describe('draft-checker', () => {
  beforeEach(() => {
    process.env.__TEST_DATA_DIR = tmpDir;
    fs.mkdirSync(tmpDir, { recursive: true });
    const draftsPath = path.join(tmpDir, 'draft-outcomes.json');
    if (fs.existsSync(draftsPath)) fs.unlinkSync(draftsPath);
    vi.resetModules();
  });

  it('computes edit distance ratio correctly', async () => {
    const { editDistanceRatio } = await import('@/lib/draft-checker');
    expect(editDistanceRatio('hello world', 'hello world')).toBe(0);
    expect(editDistanceRatio('abc', 'xyz')).toBeGreaterThan(0.9);
    expect(editDistanceRatio('hello world', 'hello World')).toBeLessThan(0.2);
  });

  it('classifies outcomes from edit distance', async () => {
    const { classifyDraftOutcome } = await import('@/lib/draft-checker');
    expect(classifyDraftOutcome(0)).toBe('sent-clean');
    expect(classifyDraftOutcome(0.1)).toBe('sent-light-edit');
    expect(classifyDraftOutcome(0.6)).toBe('sent-heavy-edit');
  });

  it('reads and writes draft tracking entries', async () => {
    const { trackDraft, getPendingDrafts } = await import('@/lib/draft-checker');
    trackDraft({
      draftId: 'test-draft-1',
      account: 'personal',
      character: 'postman',
      recipient: 'someone@example.com',
      threadId: 'thread-123',
      subject: 'Test',
      originalBody: 'Hello this is a test email body',
      bodyHash: 'abc123',
    });
    const pending = getPendingDrafts();
    expect(pending.some(d => d.draftId === 'test-draft-1')).toBe(true);
  });

  it('does not double-track the same draft', async () => {
    const { trackDraft, getPendingDrafts } = await import('@/lib/draft-checker');
    const opts = {
      draftId: 'test-draft-dup',
      account: 'personal',
      character: 'postman',
      recipient: 'someone@example.com',
      threadId: 'thread-456',
      subject: 'Test',
      originalBody: 'body',
      bodyHash: 'def456',
    };
    trackDraft(opts);
    trackDraft(opts);
    const pending = getPendingDrafts().filter(d => d.draftId === 'test-draft-dup');
    expect(pending).toHaveLength(1);
  });
});
