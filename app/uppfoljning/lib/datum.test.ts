import { describe, it, expect } from 'vitest';
import { svenskIdag, dagarFore } from './datum';

describe('svenskIdag', () => {
  it('efter midnatt svensk tid är det redan nästa dag (UTC säger gårdagen)', () => {
    // 00:30 svensk vintertid = 23:30 UTC dagen före
    expect(svenskIdag(new Date('2026-11-23T23:30:00Z'))).toBe('2026-11-24');
    // 01:30 svensk sommartid = 23:30 UTC dagen före
    expect(svenskIdag(new Date('2026-07-14T23:30:00Z'))).toBe('2026-07-15');
  });
  it('mitt på dagen samma dag', () => {
    expect(svenskIdag(new Date('2026-11-23T12:00:00Z'))).toBe('2026-11-23');
  });
});

describe('dagarFore', () => {
  it('räknar kalenderdagar, också över sommartidsskiftet och månadsskiften', () => {
    expect(dagarFore('2026-11-01', 7)).toBe('2026-10-25');
    expect(dagarFore('2026-03-31', 7)).toBe('2026-03-24');
    expect(dagarFore('2026-01-05', 7)).toBe('2025-12-29');
    expect(dagarFore('2026-11-23', 0)).toBe('2026-11-23');
  });
});
