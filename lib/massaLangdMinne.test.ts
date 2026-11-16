// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { HEL_MS, MASSA_MINNE_NYCKEL, lasMassaMinne, planeraLasning, slaIhopMassa, sparaMassaMinne, type MassaMinne } from './massaLangdMinne';
import type { MassaRad } from './massaLangd';

const rad = (dag: string, antal = 1): MassaRad => ({ maskin_id: 'R64428', operator_id: 'o', operator_namn: 'Oskar', medarbetare_id: 'm', dag, tradslag: 'GRAN', langd_dm: 45, antal, summa_cm: 450 * antal });
const NU = 1_800_000_000_000;
const minne = (o: Partial<MassaMinne> = {}): MassaMinne => ({ nyckel: 'R64428', fran: '2026-10-18', till: '2026-11-16', helTid: NU - 60_000, rader: [], ...o });

describe('planeraLasning: hela fönstret sällan, de senaste dagarna ofta', () => {
  it('inget sparat, annan maskinlista eller för gammalt: hela fönstret', () => {
    expect(planeraLasning(null, 'R64428', '2026-10-18', '2026-11-16', NU)).toEqual({ hel: true, fran: '2026-10-18' });
    expect(planeraLasning(minne({ nyckel: 'X' }), 'R64428', '2026-10-18', '2026-11-16', NU).hel).toBe(true);
    expect(planeraLasning(minne({ helTid: NU - HEL_MS }), 'R64428', '2026-10-18', '2026-11-16', NU).hel).toBe(true);
    expect(planeraLasning(minne({ helTid: NU + 5000 }), 'R64428', '2026-10-18', '2026-11-16', NU).hel).toBe(true);
  });
  it('färskt sparat: bara från dagen före den senast lästa dagen', () => {
    expect(planeraLasning(minne(), 'R64428', '2026-10-18', '2026-11-16', NU)).toEqual({ hel: false, fran: '2026-11-15' });
  });
  it('enheten har varit av några dagar: läser från dagen före den senast lästa, inte bara igår', () => {
    expect(planeraLasning(minne({ till: '2026-11-12' }), 'R64428', '2026-10-18', '2026-11-16', NU)).toEqual({ hel: false, fran: '2026-11-11' });
  });
  it('det sparade börjar för sent eller ligger i framtiden: hela fönstret', () => {
    expect(planeraLasning(minne({ fran: '2026-10-25' }), 'R64428', '2026-10-18', '2026-11-16', NU).hel).toBe(true);
    expect(planeraLasning(minne({ till: '2026-11-20' }), 'R64428', '2026-10-18', '2026-11-16', NU).hel).toBe(true);
  });
});

describe('slaIhopMassa: de lästa dagarna ersätter, resten ligger kvar', () => {
  it('idag och igår byts ut, äldre dagar rörs inte, och inget räknas dubbelt', () => {
    const gamla = [rad('2026-11-13', 5), rad('2026-11-15', 7), rad('2026-11-16', 2)];
    const ut = slaIhopMassa(gamla, [rad('2026-11-15', 8), rad('2026-11-16', 30)], '2026-11-15', '2026-10-18');
    expect(ut.map((r) => [r.dag, r.antal])).toEqual([['2026-11-13', 5], ['2026-11-15', 8], ['2026-11-16', 30]]);
  });
  it('en dag som inte längre har rader blir tom — aldrig kvar med gamla tal', () => {
    const ut = slaIhopMassa([rad('2026-11-15', 7), rad('2026-11-16', 2)], [], '2026-11-15', '2026-10-18');
    expect(ut).toEqual([]);
  });
  it('dagar som fallit ur fönstret släpps', () => {
    const ut = slaIhopMassa([rad('2026-10-17'), rad('2026-10-18')], [rad('2026-11-16')], '2026-11-15', '2026-10-18');
    expect(ut.map((r) => r.dag)).toEqual(['2026-10-18', '2026-11-16']);
  });
});

describe('minnet på enheten', () => {
  beforeEach(() => localStorage.clear());
  it('sparas och läses tillbaka; en annan maskinlista eller trasigt innehåll ger null', () => {
    sparaMassaMinne(minne({ rader: [rad('2026-11-16')] }));
    expect(lasMassaMinne('R64428')?.rader).toHaveLength(1);
    expect(lasMassaMinne('ANNAN')).toBeNull();
    localStorage.setItem(MASSA_MINNE_NYCKEL, '{trasigt');
    expect(lasMassaMinne('R64428')).toBeNull();
    localStorage.setItem(MASSA_MINNE_NYCKEL, JSON.stringify({ nyckel: 'R64428', rader: 'x' }));
    expect(lasMassaMinne('R64428')).toBeNull();
  });
});
