import { describe, expect, it } from 'vitest';
import { KARTLAGER, KARTLAGER_LAGER_ID, KARTLAGER_NAMN, LOKAL_NYCKEL, STANDARD_KARTLAGER, arKartlager, avstam, lasLokal, skrivLokal, startLager, type LokalKopia } from './kartlager';

const lager = (initial: Record<string, string> = {}) => {
  const m = new Map(Object.entries(initial));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, m };
};
const kopia = (val: LokalKopia['val'], osynkad: boolean, anvandarId: string | null = 'jag'): LokalKopia => ({ val, osynkad, anvandarId });

describe('kartlager: standard och namn', () => {
  it('standard är Flygfoto (internt id satellite)', () => {
    expect(STANDARD_KARTLAGER).toBe('satellite');
    expect(KARTLAGER_NAMN.satellite).toBe('Flygfoto');
  });
  it('sex lager, varje med eget lager-id i kartstilen (Ritad och Mörk = skogsbilden ur laserdatan)', () => {
    expect([...KARTLAGER]).toEqual(['satellite', 'lantmateriet', 'terrain', 'osm', 'ritad', 'mork']);
    expect(KARTLAGER_LAGER_ID).toEqual({ satellite: 'satellite-layer', lantmateriet: 'lm-layer', terrain: 'terrain-layer', osm: 'osm-layer', ritad: 'ritad-skog', mork: 'ritad-skog' });
    expect(KARTLAGER_NAMN.mork).toBe('Mörk');
    expect(KARTLAGER_NAMN.ritad).toBe('Ritad');
  });
  it('arKartlager släpper bara igenom kända värden', () => {
    expect(['satellite', 'lantmateriet', 'terrain', 'osm', 'ritad'].every(arKartlager)).toBe(true);
    expect([null, undefined, '', 'hybrid', 'lm', 3, {}].some(arKartlager)).toBe(false);
  });
});

describe('IR är inget bakgrundsval (Martin 2026-11-21) — ett gammalt värde tolkas som Flygfoto', () => {
  it("'ir' är inget kartlager, varken i listan, namnen eller lager-id:na", () => {
    expect(arKartlager('ir')).toBe(false);
    expect([...KARTLAGER]).not.toContain('ir');
    expect(Object.keys(KARTLAGER_NAMN)).not.toContain('ir');
    expect(Object.keys(KARTLAGER_LAGER_ID)).not.toContain('ir');
  });
  it("ett sparat 'ir' på enheten ger Flygfoto, och ett 'ir' från kontot räknas som inget val (Flygfoto)", () => {
    expect(startLager(lasLokal(lager({ [LOKAL_NYCKEL]: JSON.stringify({ val: 'ir', osynkad: true, anvandarId: 'jag' }) })))).toBe('satellite');
    expect(avstam(null, 'jag', arKartlager('ir') ? ('ir' as never) : null)).toEqual({ gallande: 'satellite', skickaTillKontot: false });
  });
});

describe('lokal kopia', () => {
  it('skriv och läs', () => {
    const l = lager();
    skrivLokal(l, kopia('terrain', true));
    expect(lasLokal(l)).toEqual(kopia('terrain', true));
  });
  it('trasig eller okänd lagring ger null, aldrig ett kast', () => {
    expect(lasLokal(lager({ [LOKAL_NYCKEL]: '{inte json' }))).toBeNull();
    expect(lasLokal(lager({ [LOKAL_NYCKEL]: JSON.stringify({ val: 'hybrid' }) }))).toBeNull();
    expect(lasLokal(null)).toBeNull();
    expect(lasLokal({ getItem: () => { throw new Error('blockerad'); } })).toBeNull();
    expect(() => skrivLokal({ setItem: () => { throw new Error('full'); } }, kopia('osm', false))).not.toThrow();
  });
  it('startLager: enhetens senaste val, annars Flygfoto', () => {
    expect(startLager(null)).toBe('satellite');
    expect(startLager(kopia('lantmateriet', false))).toBe('lantmateriet');
  });
});

describe('avstam: vad gäller när vi vet vem som är inloggad', () => {
  it('ny användare som aldrig valt (kontot tomt): Flygfoto, inget att skicka', () => {
    expect(avstam(null, 'jag', null)).toEqual({ gallande: 'satellite', skickaTillKontot: false });
  });
  it('kontot har ett val: det gäller — också om enheten minns något annat (byte på en annan enhet slår igenom)', () => {
    expect(avstam(kopia('lantmateriet', false), 'jag', 'terrain')).toEqual({ gallande: 'terrain', skickaTillKontot: false });
  });
  it('val gjort utan nät på den här enheten vinner och skickas', () => {
    expect(avstam(kopia('osm', true), 'jag', 'terrain')).toEqual({ gallande: 'osm', skickaTillKontot: true });
    expect(avstam(kopia('osm', true), 'jag', null)).toEqual({ gallande: 'osm', skickaTillKontot: true });
  });
  it('kontot kan inte läsas (inget nät): enhetens senaste val, annars Flygfoto', () => {
    expect(avstam(kopia('terrain', false), 'jag', undefined)).toEqual({ gallande: 'terrain', skickaTillKontot: false });
    expect(avstam(null, 'jag', undefined)).toEqual({ gallande: 'satellite', skickaTillKontot: false });
  });
  it('delad enhet: en annan användares lokala val följer inte med — varken som val eller som osynkat att skicka', () => {
    expect(avstam(kopia('terrain', true, 'nagon-annan'), 'jag', null)).toEqual({ gallande: 'satellite', skickaTillKontot: false });
    expect(avstam(kopia('terrain', true, 'nagon-annan'), 'jag', 'lantmateriet')).toEqual({ gallande: 'lantmateriet', skickaTillKontot: false });
  });
});
