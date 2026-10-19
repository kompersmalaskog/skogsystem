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
  it('fyra lager, varje med eget lager-id i kartstilen', () => {
    expect([...KARTLAGER]).toEqual(['satellite', 'lantmateriet', 'terrain', 'osm']);
    expect(KARTLAGER_LAGER_ID).toEqual({ satellite: 'satellite-layer', lantmateriet: 'lm-layer', terrain: 'terrain-layer', osm: 'osm-layer' });
  });
  it('arKartlager släpper bara igenom kända värden', () => {
    expect(['satellite', 'lantmateriet', 'terrain', 'osm'].every(arKartlager)).toBe(true);
    expect([null, undefined, '', 'hybrid', 'lm', 3, {}].some(arKartlager)).toBe(false);
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
