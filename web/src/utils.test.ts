import { describe, test, expect } from 'bun:test';
import { getInitials } from './utils';

describe('getInitials', () => {
  test('returns "?" for empty string or null/undefined', () => {
    expect(getInitials('')).toBe('?');
    // @ts-expect-error testing invalid inputs for runtime safety
    expect(getInitials(null)).toBe('?');
    // @ts-expect-error testing invalid inputs for runtime safety
    expect(getInitials(undefined)).toBe('?');
  });

  test('returns "?" for whitespace-only strings', () => {
    expect(getInitials(' ')).toBe('?');
    expect(getInitials('   ')).toBe('?');
    expect(getInitials('\t\n')).toBe('?');
  });

  test('handles names with a single character', () => {
    expect(getInitials('A')).toBe('A');
    expect(getInitials('a')).toBe('A');
  });

  test('handles single word names', () => {
    expect(getInitials('John')).toBe('JO');
    expect(getInitials('john')).toBe('JO');
  });

  test('handles two word names', () => {
    expect(getInitials('John Doe')).toBe('JD');
    expect(getInitials('john doe')).toBe('JD');
  });

  test('handles names with more than two words by taking the first two', () => {
    expect(getInitials('John Von Neumann')).toBe('JV');
    expect(getInitials('Mary Jane Watson')).toBe('MJ');
  });

  test('handles multiple spaces between words', () => {
    expect(getInitials('John    Doe')).toBe('JD');
  });

  test('handles leading and trailing spaces', () => {
    expect(getInitials('  John Doe  ')).toBe('JD');
    expect(getInitials('   John   ')).toBe('JO');
  });

  test('handles special characters and numbers if present', () => {
    expect(getInitials('User 123')).toBe('U1');
    expect(getInitials('!@# $%^')).toBe('!$');
  });
});
