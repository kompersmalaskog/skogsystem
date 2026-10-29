import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { FARSKHET_GAMMAL_MIN, stampelSyns } from './farskhet';

describe('färskhetsstämpeln', () => {
  it('färsk data utan väntande säger ingenting', () => {
    expect(stampelSyns({ gammal: false, vantar: 0 })).toBe(false);
  });
  it('gammal data syns', () => {
    expect(stampelSyns({ gammal: true, vantar: 0 })).toBe(true);
  });
  it('markeringar som väntar syns', () => {
    expect(stampelSyns({ gammal: false, vantar: 2 })).toBe(true);
  });
  it('sidan använder regeln och hämtar om gammal data själv', () => {
    const src = readFileSync('app/planering/page.tsx', 'utf8');
    expect(src).toContain('if (!stampelSyns({ gammal, vantar: synkVantar })) return null;');
    expect(src).toMatch(/>= FARSKHET_GAMMAL_MIN\) refetchMarkers\(false\)/);
    expect(FARSKHET_GAMMAL_MIN).toBe(10);
  });
});
