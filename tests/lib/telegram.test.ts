import { describe, it, expect } from 'vitest';
import { splitMessage, buildApiUrl, stripMarkdown, markdownToTelegramHTML } from '../../lib/telegram';

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

  describe('markdownToTelegramHTML', () => {
    it('converts bold', () => {
      expect(markdownToTelegramHTML('**bold text**')).toBe('<b>bold text</b>');
    });

    it('converts italic', () => {
      expect(markdownToTelegramHTML('*italic*')).toBe('<i>italic</i>');
    });

    it('converts inline code', () => {
      expect(markdownToTelegramHTML('use `npm install`')).toBe('use <code>npm install</code>');
    });

    it('converts code blocks', () => {
      const input = '```js\nconsole.log("hi")\n```';
      const output = markdownToTelegramHTML(input);
      expect(output).toContain('<pre><code class="language-js">');
      expect(output).toContain('console.log("hi")');
    });

    it('converts links', () => {
      expect(markdownToTelegramHTML('[click](https://example.com)')).toBe('<a href="https://example.com">click</a>');
    });

    it('converts headers to bold', () => {
      expect(markdownToTelegramHTML('## Section Title')).toBe('<b>Section Title</b>');
    });

    it('converts strikethrough', () => {
      expect(markdownToTelegramHTML('~~deleted~~')).toBe('<s>deleted</s>');
    });

    it('escapes HTML in plain text', () => {
      expect(markdownToTelegramHTML('a < b & c > d')).toBe('a &lt; b &amp; c &gt; d');
    });

    it('preserves underscores in identifiers', () => {
      const output = markdownToTelegramHTML('file_name_here');
      expect(output).toBe('file_name_here');
    });

    it('handles mixed formatting', () => {
      const input = '## Report\n\n**Status**: *good*\nSee `config.ts`';
      const output = markdownToTelegramHTML(input);
      expect(output).toContain('<b>Report</b>');
      expect(output).toContain('<b>Status</b>');
      expect(output).toContain('<i>good</i>');
      expect(output).toContain('<code>config.ts</code>');
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
  });
});
