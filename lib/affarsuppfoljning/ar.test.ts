import { describe, it, expect } from 'vitest';
import {
  byggAr, arLista, senastAvslutadManad, massavedLangd, arAtgard, arBolag, grupperingsnyckel, manadsnyckel, manadsNamn,
  type ManadRad, type ObjektInfo,
} from './ar';

const obj = (id: string, huvudtyp: string | null, bolag: string | null, vo: string | null = null): ObjektInfo =>
  ({ objekt_id: id, namn: 'Objekt ' + id, vo_nummer: vo, huvudtyp, bolag });
const rad = (objekt_id: string, manad: string, volym: number, o: Partial<ManadRad> = {}): ManadRad =>
  ({ objekt_id, manad, volym, timmer: volym * 0.4, kubb: volym * 0.2, massa: volym * 0.3, barr: 0, barrLm: 0, ...o });
const karta = (...os: ObjektInfo[]) => new Map(os.map(o => [o.objekt_id, o]));
const IDAG = new Date(2026, 9, 4);   // 4 oktober 2026 — oktober är pågående

const A = obj('a', 'Slutavverkning', 'Vida'), B = obj('b', 'Gallring', 'Vida'), C = obj('c', 'Slutavverkning', 'Karl Hedin'),
      D = obj('d', 'Grot', 'Vida'), E = obj('e', null, 'Vida'), F = obj('f', 'Slutavverkning', null);
const OBJ = karta(A, B, C, D, E, F);

describe('åtgärd och bolag följer månadssidans RPC', () => {
  it('Allt = slutavverkning + gallring + utan angiven åtgärd, aldrig Grot', () => {
    expect([A, B, C, D, E, F].map(o => arAtgard(o, 'Allt'))).toEqual([true, true, true, false, true, true]);
    expect(arAtgard(A, 'Gallring')).toBe(false); expect(arAtgard(B, 'Gallring')).toBe(true); expect(arAtgard(D, 'Grot')).toBe(true);
  });
  it('Alla bolag tar med objekt utan bolag; Vida bara Vidas', () => {
    expect([A, C, F].map(o => arBolag(o, 'Alla'))).toEqual([true, true, true]);
    expect([A, C, F].map(o => arBolag(o, 'Vida'))).toEqual([true, false, false]);
  });
  it('okänt objekt räknas aldrig med', () => {
    expect(arAtgard(undefined, 'Allt')).toBe(false); expect(arBolag(undefined, 'Alla')).toBe(false);
  });
  it('grupperingsnyckel: numeriskt vo slår ihop skördare och skotare, annars objekt_id', () => {
    expect(grupperingsnyckel(obj('11217392', 'Slutavverkning', 'Vida', '11217392'))).toBe('11217392');
    expect(grupperingsnyckel(obj('A130743_7', 'Slutavverkning', 'Vida', '11217392'))).toBe('11217392');
    expect(grupperingsnyckel(obj('PONS_76', 'Slutavverkning', 'Privat', 'O41F97_76'))).toBe('PONS_76');
  });
});

describe('byggAr', () => {
  const rader = [
    rad('a', '2026-01', 1000), rad('a', '2026-02', 800), rad('b', '2026-02', 200), rad('c', '2026-03', 500),
    rad('a', '2026-09', 600), rad('a', '2026-10', 100), rad('d', '2026-09', 50), rad('a', '2025-12', 300),
  ];
  it('årssumman och tolv månader, pågående månad märkt och framtiden tom', () => {
    const s = byggAr(rader, OBJ, { ar: 2026, atgard: 'Allt', bolag: 'Alla', idag: IDAG });
    expect(s.manader).toHaveLength(12);
    expect(s.total).toBe(1000 + 800 + 200 + 500 + 600 + 100);              // Grot (d) och 2025 räknas inte
    expect(s.manader[9]).toMatchObject({ manad: '2026-10', volym: 100, pagaende: true, framtid: false });
    expect(s.manader[10]).toMatchObject({ manad: '2026-11', volym: 0, pagaende: false, framtid: true });
    expect(s.manader[8]).toMatchObject({ manad: '2026-09', pagaende: false, framtid: false });
  });
  it('Vida-filtret tar bort andra bolag; summan av månaderna är årssumman', () => {
    const alla = byggAr(rader, OBJ, { ar: 2026, atgard: 'Allt', bolag: 'Alla', idag: IDAG });
    const vida = byggAr(rader, OBJ, { ar: 2026, atgard: 'Allt', bolag: 'Vida', idag: IDAG });
    expect(alla.total - vida.total).toBe(500);                                 // objekt c (Karl Hedin) i mars
    expect(vida.manader.reduce((s, m) => s + m.volym, 0)).toBe(vida.total);
  });
  it('åtgärdsfiltret: bara gallring', () => {
    const s = byggAr(rader, OBJ, { ar: 2026, atgard: 'Gallring', bolag: 'Alla', idag: IDAG });
    expect(s.total).toBe(200); expect(s.antalObjekt).toBe(1);
  });
  it('snitt per HEL månad: januari–september från första med volym, pågående oktober utanför', () => {
    const s = byggAr(rader, OBJ, { ar: 2026, atgard: 'Allt', bolag: 'Alla', idag: IDAG });
    expect(s.antalHelaManader).toBe(9);                                        // jan..sep
    expect(s.snittPerHelManad).toBeCloseTo((1000 + 1000 + 500 + 600) / 9, 8);  // feb = 800 + 200
  });
  it('en avslutad månad utan volym efter den första räknas som noll', () => {
    const s = byggAr([rad('a', '2026-01', 900), rad('a', '2026-03', 900)], OBJ, { ar: 2026, atgard: 'Allt', bolag: 'Alla', idag: IDAG });
    expect(s.snittPerHelManad).toBeCloseTo(1800 / 9, 8);
  });
  it('början av året: ingen avslutad månad ännu → inget snitt, inte noll', () => {
    const s = byggAr([rad('a', '2026-01', 400)], OBJ, { ar: 2026, atgard: 'Allt', bolag: 'Alla', idag: new Date(2026, 0, 15) });
    expect(s.snittPerHelManad).toBeNull(); expect(s.antalHelaManader).toBe(0);
  });
  it('ett avslutat år har tolv hela månader och ingen pågående', () => {
    const s = byggAr(rader, OBJ, { ar: 2025, atgard: 'Allt', bolag: 'Alla', idag: IDAG });
    expect(s.manader.some(m => m.pagaende || m.framtid)).toBe(false);
    expect(s.total).toBe(300); expect(s.antalHelaManader).toBe(1);             // från december
  });
  it('antal objekt: skördare och skotare med samma numeriska VO är EN trakt', () => {
    const o2 = karta(obj('1', 'Slutavverkning', 'Vida', '555'), obj('X_9', 'Slutavverkning', 'Vida', '555'), obj('2', 'Slutavverkning', 'Vida', '777'));
    const s = byggAr([rad('1', '2026-02', 10), rad('X_9', '2026-02', 10), rad('2', '2026-02', 10), rad('2', '2026-03', 0)], o2, { ar: 2026, atgard: 'Allt', bolag: 'Alla', idag: IDAG });
    expect(s.antalObjekt).toBe(2);
  });
  it('fördelningen summerar till totalen — övrigt är resten', () => {
    const s = byggAr(rader, OBJ, { ar: 2026, atgard: 'Allt', bolag: 'Alla', idag: IDAG });
    const f = s.fordelning;
    expect(f.timmer + f.kubb + f.massa + f.ovrigt).toBeCloseTo(s.total, 8);
    expect(f.timmer).toBeCloseTo(s.total * 0.4, 8); expect(f.ovrigt).toBeCloseTo(s.total * 0.1, 8);
  });
});

describe('årslistan', () => {
  it('bara år med minst 100 m³, nyaste först, och innevarande år finns alltid', () => {
    expect(arLista([rad('a', '2023-03', 1), rad('a', '2025-12', 300), rad('a', '2026-01', 900)], IDAG)).toEqual([2026, 2025]);
    expect(arLista([rad('a', '2025-12', 300)], IDAG)).toEqual([2026, 2025]);
    expect(arLista([], IDAG)).toEqual([2026]);
  });
});

describe('senast avslutade månad', () => {
  const rader = [rad('a', '2026-08', 700), rad('a', '2026-09', 600), rad('a', '2026-10', 100), rad('c', '2026-09', 50)];
  it('är senaste månad före innevarande som har volym — över alla år', () => {
    expect(senastAvslutadManad(rader, OBJ, 'Allt', 'Alla', IDAG)).toEqual({ manad: '2026-09', volym: 650 });
    expect(senastAvslutadManad(rader, OBJ, 'Allt', 'Vida', IDAG)).toEqual({ manad: '2026-09', volym: 600 });
  });
  it('hoppar över månader utan volym i urvalet', () => {
    expect(senastAvslutadManad([rad('a', '2026-08', 700), rad('c', '2026-09', 50)], OBJ, 'Allt', 'Vida', IDAG)).toEqual({ manad: '2026-08', volym: 700 });
    expect(senastAvslutadManad([], OBJ, 'Allt', 'Alla', IDAG)).toBeNull();
  });
});

describe('massavedens medellängd', () => {
  const m = (id: string, manad: string, barr: number, snitt: number) => rad(id, manad, barr * 3, { barr, barrLm: barr * snitt * 100 });
  it('viktad över objekten, bara Vidas, innevarande månad', () => {
    const v = massavedLangd([m('a', '2026-10', 100, 4.4), m('b', '2026-10', 300, 4.8), m('c', '2026-10', 999, 3.0)], OBJ, IDAG);
    expect(v).toMatchObject({ manad: '2026-10', aktuell: true, volym: 400 });
    expect(v!.medellangd).toBeCloseTo((100 * 4.4 + 300 * 4.8) / 400, 8);       // c är Karl Hedin, räknas inte
  });
  it('ingen barrmassaved den här månaden än → senaste månad som har, märkt som inte aktuell', () => {
    const v = massavedLangd([m('a', '2026-09', 200, 4.52), rad('a', '2026-10', 50)], OBJ, IDAG);
    expect(v).toMatchObject({ manad: '2026-09', aktuell: false });
    expect(v!.medellangd).toBeCloseTo(4.52, 8);
  });
  it('inget alls → null, inte noll meter', () => {
    expect(massavedLangd([rad('a', '2026-10', 50)], OBJ, IDAG)).toBeNull();
  });
});

describe('format', () => {
  it('månadsnyckel och namn', () => {
    expect(manadsnyckel(new Date(2026, 0, 31))).toBe('2026-01'); expect(manadsNamn('2026-09')).toBe('september');
  });
});
