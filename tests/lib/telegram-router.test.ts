import { describe, it, expect } from 'vitest';
import { resolveCharacter } from '../../lib/telegram-router';

const testGroups: Record<string, number> = {
  coach: -100111,
  scholar: -100222,
  postman: -100333,
};

describe('telegram-router', () => {
  describe('resolveCharacter', () => {
    it('returns character name for known group', () => {
      expect(resolveCharacter(-100111, testGroups)).toBe('coach');
      expect(resolveCharacter(-100222, testGroups)).toBe('scholar');
    });

    it('returns null for unknown group', () => {
      expect(resolveCharacter(-100999, testGroups)).toBeNull();
    });
  });
});
