// Reglagens lagring och klamning (lib/kartReglage). Mönstret: skogsbruksplanen LAGER_OP — 15–100 steg 5, sparat per enhet.
import { describe, expect, it } from 'vitest';
import { KARTBAS_STANDARD_STYRKA } from './kartBas';
import {
  LAGER_OP_MAX, LAGER_OP_MIN, LAGER_OP_NYCKEL, REGLAGE_STEG, STYRKA_NYCKEL, klamLagerOp, klamStyrka, lasLagerOp, lasStyrkor, opacitetTillProcent, skrivLagerOp, skrivStyrkor, styrkaFor,
} from './kartReglage';

const minne = () => { const d = new Map<string, string>(); return { getItem: (k: string) => d.get(k) ?? null, setItem: (k: string, v: string) => { d.set(k, v); }, d }; };

describe('klamning', () => {
  it('överlägg: 15–100 i steg om 5 (som skogsbruksplanen)', () => {
    expect([LAGER_OP_MIN, LAGER_OP_MAX, REGLAGE_STEG]).toEqual([15, 100, 5]);
    expect(klamLagerOp(0)).toBe(15); expect(klamLagerOp(14)).toBe(15); expect(klamLagerOp(22)).toBe(20); expect(klamLagerOp(23)).toBe(25); expect(klamLagerOp(250)).toBe(100);
    expect(klamLagerOp('x')).toBe(100); expect(klamLagerOp(Number.NaN)).toBe(100);
  });
  it('bakgrund: 0–100 i steg om 5, skräp ger standarden 85', () => {
    expect(klamStyrka(-5)).toBe(0); expect(klamStyrka(87)).toBe(85); expect(klamStyrka(500)).toBe(100); expect(klamStyrka(undefined)).toBe(KARTBAS_STANDARD_STYRKA); expect(KARTBAS_STANDARD_STYRKA).toBe(85);
  });
  it('lagrets eget värde (0–1) blir reglagets startvärde i procent, avrundat till steg', () => {
    expect(opacitetTillProcent(0.7)).toBe(70); expect(opacitetTillProcent(0.35)).toBe(35); expect(opacitetTillProcent(0.65)).toBe(65); expect(opacitetTillProcent(1)).toBe(100); expect(opacitetTillProcent(0.8)).toBe(80);
  });
});

describe('sparas per enhet och läses tillbaka (som efter en omladdning)', () => {
  it('bakgrundens styrka sparas per bakgrund; saknad bakgrund = standard', () => {
    const l = minne();
    skrivStyrkor(l, { satellite: 60, osm: 100 });
    const lasta = lasStyrkor(l);
    expect(lasta).toEqual({ satellite: 60, osm: 100 });
    expect(styrkaFor(lasta, 'satellite')).toBe(60);
    expect(styrkaFor(lasta, 'terrain')).toBe(85);
    expect(l.d.has(STYRKA_NYCKEL)).toBe(true); expect(STYRKA_NYCKEL).toBe('kartlager_styrka_v1');
  });
  it('överläggens opacitet sparas per lager', () => {
    const l = minne();
    skrivLagerOp(l, { sks_markfuktighet: 40, fastighetsgrans: 55 });
    expect(lasLagerOp(l)).toEqual({ sks_markfuktighet: 40, fastighetsgrans: 55 });
    expect(l.d.has(LAGER_OP_NYCKEL)).toBe(true);
  });
  it('skräp, trasig JSON, okända bakgrunder och blockerad lagring ger tomt — aldrig ett fel', () => {
    const d = minne();
    d.setItem(STYRKA_NYCKEL, '{"satellite":"hej","finns_inte":50,"osm":42}');
    expect(lasStyrkor(d)).toEqual({ osm: 40 });
    d.setItem(LAGER_OP_NYCKEL, 'inte json'); expect(lasLagerOp(d)).toEqual({});
    d.setItem(LAGER_OP_NYCKEL, '[1,2]'); expect(lasLagerOp(d)).toEqual({});
    expect(lasStyrkor(null)).toEqual({}); expect(lasLagerOp(undefined)).toEqual({});
    const blockerad = { getItem: () => { throw new Error('nej'); }, setItem: () => { throw new Error('nej'); } };
    expect(lasStyrkor(blockerad)).toEqual({});
    expect(() => skrivLagerOp(blockerad, { a: 20 })).not.toThrow();
  });
  it('ett sparat värde utanför 15–100 klamras vid läsning', () => {
    const d = minne(); d.setItem(LAGER_OP_NYCKEL, '{"a":3,"b":999,"c":47}');
    expect(lasLagerOp(d)).toEqual({ a: 15, b: 100, c: 45 });
  });
});
