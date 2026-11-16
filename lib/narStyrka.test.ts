import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { NARA_FULL_M, NARA_GOLV, NARA_LANGT_M, narStyrka } from './narStyrka';

describe('narStyrka — allt syns, det nära starkast', () => {
  it('inom 80 m full styrka, gränsen räknas in', () => {
    expect(narStyrka(0)).toBe(1);
    expect(narStyrka(NARA_FULL_M)).toBe(1);
  });
  it('sjunker jämnt mellan 80 och 400 m och stannar på golvet — aldrig osynligt', () => {
    expect(narStyrka(81)).toBeLessThan(1);
    expect(narStyrka(240)).toBeCloseTo(0.7, 2);
    expect(narStyrka(NARA_LANGT_M)).toBe(NARA_GOLV);
    expect(narStyrka(5000)).toBe(NARA_GOLV);
    for (let d = 0; d < 2000; d += 7) expect(narStyrka(d)).toBeGreaterThanOrEqual(NARA_GOLV);
    for (let d = 80; d < 500; d += 10) expect(narStyrka(d + 10)).toBeLessThanOrEqual(narStyrka(d));
  });
  it('fara är alltid full styrka; okänt avstånd (ingen GPS) är full styrka', () => {
    expect(narStyrka(3000, true)).toBe(1);
    expect(narStyrka(null)).toBe(1);
    expect(narStyrka(undefined)).toBe(1);
    expect(narStyrka(Number.NaN)).toBe(1);
  });
  it('sidan gömmer ingen symbol för att den ligger långt bort och använder regeln för styrkan', () => {
    const sida = readFileSync('app/planering/page.tsx', 'utf8');
    expect(sida).not.toMatch(/KORVY_SIGHT_M/);
    expect(sida).toContain('opacity = narStyrka(dist, KORVY_FARO_TYPER.has(String(m.type)));');
    // högstubbe/evighetsträd ritas som små symboler i körvyn, inte som prickar
    expect(sida).toContain('const prick = arAlltidPrick(m.type);');
    expect(sida).toContain("['==', ['get', 'liten'], true], base * 0.6");
  });
});
