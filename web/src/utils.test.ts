import { describe, it, expect, beforeAll } from 'bun:test';

describe('escapeHtml', () => {
  let escapeHtml: (str: string) => string;

  beforeAll(async () => {
    // Mock import.meta.env for Vite before importing module
    if (!process.env.BASE_URL) {
      process.env.BASE_URL = '/';
    }
    const utils = await import('./utils');
    escapeHtml = utils.escapeHtml;
  });

  it('should return an empty string if input is falsy', () => {
    expect(escapeHtml('')).toBe('');
    expect(escapeHtml(null as unknown as string)).toBe('');
    expect(escapeHtml(undefined as unknown as string)).toBe('');
  });

  it('should return the original string if there are no special characters', () => {
    const str = 'hello world';
    expect(escapeHtml(str)).toBe(str);
  });

  it('should escape & correctly', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
    expect(escapeHtml('&&&')).toBe('&amp;&amp;&amp;');
  });

  it('should escape < correctly', () => {
    expect(escapeHtml('a < b')).toBe('a &lt; b');
    expect(escapeHtml('<<<')).toBe('&lt;&lt;&lt;');
  });

  it('should escape > correctly', () => {
    expect(escapeHtml('a > b')).toBe('a &gt; b');
    expect(escapeHtml('>>>')).toBe('&gt;&gt;&gt;');
  });

  it('should escape a combination of special characters correctly', () => {
    expect(escapeHtml('<div>& "hello"</div>')).toBe('&lt;div&gt;&amp; "hello"&lt;/div&gt;');
    expect(escapeHtml('if (a < b && b > c)')).toBe('if (a &lt; b &amp;&amp; b &gt; c)');
  });
});
