import { describe, it, expect, beforeAll } from 'bun:test';

const AVATAR_COLORS = [
  '#0ea5e9', '#8b5cf6', '#f43f5e', '#f59e0b',
  '#06b6d4', '#a855f7', '#ec4899', '#10b981',
  '#6366f1', '#14b8a6', '#f97316', '#84cc16',
];

describe('avatarColor', () => {
  let avatarColor: (name: string) => string;

  beforeAll(async () => {
    // To test ESM modules that initialize constants from environment variables
    // at the top level (like BASE_URL = import.meta.env.BASE_URL),
    // use dynamic import() after setting the environment variable in the test setup.
    // In Bun, process.env is mapped to import.meta.env.
    process.env.BASE_URL = '/';
    const utils = await import('./utils');
    avatarColor = utils.avatarColor;
  });

  it('should return a color from the predefined list', () => {
    const color = avatarColor('Alice');
    expect(AVATAR_COLORS).toContain(color);
  });

  it('should be deterministic for the same input', () => {
    const name = 'John Doe';
    const color1 = avatarColor(name);
    const color2 = avatarColor(name);
    const color3 = avatarColor(name);

    expect(color1).toBe(color2);
    expect(color1).toBe(color3);
  });

  it('should handle empty strings', () => {
    const color = avatarColor('');
    expect(AVATAR_COLORS).toContain(color);
    // When name is empty, hash is 0, so it should return AVATAR_COLORS[0]
    expect(color).toBe(AVATAR_COLORS[0]);
  });

  it('should handle very long strings', () => {
    const longName = 'A'.repeat(1000);
    const color = avatarColor(longName);
    expect(AVATAR_COLORS).toContain(color);
  });

  it('should handle strings with non-ASCII characters and emojis', () => {
    const names = ['María', 'José', 'こんにちは', '안녕하세요', '🌍🚀', 'user_123!@#'];

    names.forEach(name => {
      const color = avatarColor(name);
      expect(AVATAR_COLORS).toContain(color);
    });
  });

  it('should distribute colors across different names', () => {
    // We expect multiple colors to be returned from a large enough set of varied names
    const names = ['Alice', 'Bob', 'Charlie', 'David', 'Eve', 'Frank', 'Grace', 'Heidi', 'Ivan', 'Judy'];
    const generatedColors = new Set(names.map(avatarColor));

    // There are 12 colors, we expect at least a few unique ones from 10 different names
    expect(generatedColors.size).toBeGreaterThan(1);
  });
});
