import { describe, it, expect, vi, beforeEach } from 'vitest';
import { splitMessage, buildApiUrl, stripMarkdown } from '../../lib/telegram';

describe('telegram', () => {
  describe('buildApiUrl', () => {
    it('builds correct URL for method', () => {
      const url = buildApiUrl('TOKEN123', 'getUpdates');
      expect(url).toBe('https://api.telegram.org/botTOKEN123/getUpdates');
    });
  });

  describe('splitMessage', () => {
    it('returns single chunk for short message', () => {
      const chunks = splitMessage('Hello world');
      expect(chunks).toEqual(['Hello world']);
    });

    it('splits at paragraph boundary when over 4096 chars', () => {
      const para1 = 'A'.repeat(3000);
      const para2 = 'B'.repeat(3000);
      const text = `${para1}\n\n${para2}`;
      const chunks = splitMessage(text);
      expect(chunks.length).toBe(2);
      expect(chunks[0]).toBe(para1);
      expect(chunks[1]).toBe(para2);
    });

    it('splits at newline if no paragraph break', () => {
      const line1 = 'A'.repeat(3000);
      const line2 = 'B'.repeat(3000);
      const text = `${line1}\n${line2}`;
      const chunks = splitMessage(text);
      expect(chunks.length).toBe(2);
    });

    it('hard splits if no newline at all', () => {
      const text = 'A'.repeat(5000);
      const chunks = splitMessage(text);
      expect(chunks.length).toBe(2);
      expect(chunks[0].length).toBe(4096);
      expect(chunks[1].length).toBe(904);
    });
  });

  describe('stripMarkdown', () => {
    it('strips bold markers', () => {
      expect(stripMarkdown('**bold text**')).toBe('bold text');
    });

    it('strips italic markers', () => {
      expect(stripMarkdown('*italic*')).toBe('italic');
    });

    it('preserves underscores in identifiers', () => {
      expect(stripMarkdown('file_name_here')).toBe('file_name_here');
    });

    it('strips headers', () => {
      expect(stripMarkdown('## Section Title')).toBe('Section Title');
    });

    it('strips inline code', () => {
      expect(stripMarkdown('use `npm install`')).toBe('use npm install');
    });

    it('converts links', () => {
      expect(stripMarkdown('[click here](https://example.com)')).toBe('click here (https://example.com)');
    });

    it('handles mixed formatting', () => {
      const input = '## Report\n\n**Status**: *good*\nSee `config.ts`';
      const output = stripMarkdown(input);
      expect(output).not.toContain('**');
      expect(output).not.toContain('##');
      expect(output).not.toContain('`');
      expect(output).toContain('Status');
      expect(output).toContain('good');
    });
  });
});
