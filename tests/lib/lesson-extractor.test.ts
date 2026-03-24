import { describe, it, expect } from 'vitest';
import type { OutcomeEvent } from '@/lib/outcome-tracker';

describe('lesson-extractor', () => {
  it('groups outcomes by character', async () => {
    const { groupByCharacter } = await import('@/lib/lesson-extractor');
    const events: OutcomeEvent[] = [
      { timestamp: '2026-03-20', character: 'scholar', signalType: 'draft-outcome', outcome: 'negative', details: {} },
      { timestamp: '2026-03-21', character: 'scholar', signalType: 'draft-outcome', outcome: 'negative', details: {} },
      { timestamp: '2026-03-22', character: 'clerk', signalType: 'draft-outcome', outcome: 'positive', details: {} },
    ];
    const grouped = groupByCharacter(events);
    expect(grouped.scholar).toHaveLength(2);
    expect(grouped.clerk).toHaveLength(1);
  });

  it('detects repeated negative patterns', async () => {
    const { detectPatterns } = await import('@/lib/lesson-extractor');
    const events: OutcomeEvent[] = [
      { timestamp: '2026-03-20', character: 'curator', signalType: 'draft-outcome', outcome: 'negative', details: { status: 'sent-heavy-edit', recipient: 'gallery@example.com' } },
      { timestamp: '2026-03-21', character: 'curator', signalType: 'draft-outcome', outcome: 'negative', details: { status: 'sent-heavy-edit', recipient: 'gallery@example.com' } },
      { timestamp: '2026-03-22', character: 'curator', signalType: 'draft-outcome', outcome: 'negative', details: { status: 'sent-heavy-edit', recipient: 'other@example.com' } },
    ];
    const patterns = detectPatterns(events);
    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns[0].type).toBe('repeated-negative');
  });

  it('detects recipient-specific divergence', async () => {
    const { detectPatterns } = await import('@/lib/lesson-extractor');
    const events: OutcomeEvent[] = [
      { timestamp: '2026-03-20', character: 'curator', signalType: 'draft-outcome', outcome: 'negative', details: { recipient: 'gallery@art.com' } },
      { timestamp: '2026-03-21', character: 'curator', signalType: 'draft-outcome', outcome: 'strong-negative', details: { recipient: 'gallery@art.com' } },
      { timestamp: '2026-03-22', character: 'curator', signalType: 'draft-outcome', outcome: 'positive', details: { recipient: 'uni@edu.tr' } },
    ];
    const patterns = detectPatterns(events);
    const recipientPattern = patterns.find(p => p.type === 'recipient-divergence');
    expect(recipientPattern).toBeDefined();
  });

  it('formats a lesson prompt correctly', async () => {
    const { buildLessonPrompt } = await import('@/lib/lesson-extractor');
    const patterns = [
      { type: 'repeated-negative' as const, count: 4, summary: '4 of 6 email drafts deleted' },
    ];
    const prompt = buildLessonPrompt('postman', patterns);
    expect(prompt).toContain('postman');
    expect(prompt).toContain('4 of 6');
  });
});
