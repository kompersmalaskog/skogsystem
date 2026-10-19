import { describe, expect, it } from 'vitest';
import { avstandText, OSAKER_EFTER_MS, posRad, sorteraMaskiner, tidText, valjMaskinPos, type MaskinMedPos, type MaskinPos } from './maskinPos';

const NU = Date.parse('2026-10-19T12:00:00Z');
const timmar = (h: number) => NU - h * 3600 * 1000;
const lbc = { lat: 56.459, lng: 14.702 };

describe('valjMaskinPos — nyast vinner, äldre än 3 dygn är osäker', () => {
  it('färsk GPS: inte osäker', () => {
    const p = valjMaskinPos([{ lat: 56.6, lng: 14.8, tidMs: timmar(2), kalla: 'gps' }], NU)!;
    expect(p).toMatchObject({ lat: 56.6, kalla: 'gps', osaker: false });
  });

  it('exakt 3 dygn är ännu säker, strax över är osäker', () => {
    expect(valjMaskinPos([{ lat: 56.6, lng: 14.8, tidMs: NU - OSAKER_EFTER_MS, kalla: 'gps' }], NU)!.osaker).toBe(false);
    expect(valjMaskinPos([{ lat: 56.6, lng: 14.8, tidMs: NU - OSAKER_EFTER_MS - 1, kalla: 'gps' }], NU)!.osaker).toBe(true);
  });

  it('en maskin som flyttats efter sin sista GPS-punkt står där flytten lämnade den (nyast vinner, inte "GPS före allt")', () => {
    const p = valjMaskinPos([
      { lat: 56.5, lng: 14.7, tidMs: timmar(30), kalla: 'gps' },
      { lat: 56.7, lng: 14.9, tidMs: timmar(5), kalla: 'plats', namn: 'Sandåsen' },
    ], NU)!;
    expect(p).toMatchObject({ kalla: 'plats', namn: 'Sandåsen', osaker: false });
  });

  it('källans egen varning (äldre än 30 dygn) gör positionen osäker även om tiden saknas i klockslag', () => {
    expect(valjMaskinPos([{ lat: 56.6, lng: 14.8, tidMs: timmar(1), kalla: 'plats', osaker: true }], NU)!.osaker).toBe(true);
  });

  it('en punkt utan tid räknas som osäker och förlorar mot en med tid', () => {
    const utanTid = { lat: 56.5, lng: 14.7, tidMs: null, kalla: 'plats' as const };
    expect(valjMaskinPos([utanTid], NU)!.osaker).toBe(true);
    expect(valjMaskinPos([utanTid, { lat: 56.6, lng: 14.8, tidMs: timmar(1), kalla: 'gps' }], NU)!.lat).toBe(56.6);
  });

  it('trasiga punkter (null-ön, utanför Norden) och null räknas aldrig; inget kvar = null', () => {
    expect(valjMaskinPos([{ lat: 0, lng: 0, tidMs: timmar(1), kalla: 'gps' }, null], NU)).toBeNull();
    expect(valjMaskinPos([], NU)).toBeNull();
  });
});

const pos = (lat: number, lng: number, osaker = false): MaskinPos => ({ lat, lng, tidMs: timmar(1), kalla: 'gps', osaker });
const maskin = (id: string, p: MaskinPos | null): MaskinMedPos => ({ maskin_id: id, namn: id, maskin_typ: 'Harvester', slag: 'skordare', pos: p });

describe('sorteraMaskiner — närmast först, ingen gömd', () => {
  it('sorterar på avstånd från utgångspunkten', () => {
    const r = sorteraMaskiner([maskin('Långt', pos(57.5, 14.7)), maskin('Nära', pos(56.5, 14.7)), maskin('Mellan', pos(57.0, 14.7))], lbc);
    expect(r.map(x => x.maskin_id)).toEqual(['Nära', 'Mellan', 'Långt']);
    expect(r[0].km).toBeGreaterThan(0);
  });

  it('maskin utan position hamnar sist men finns kvar (alfabetiskt) — avstånd null', () => {
    const r = sorteraMaskiner([maskin('Ö-saknas', null), maskin('A-saknas', null), maskin('Nära', pos(56.5, 14.7))], lbc);
    expect(r.map(x => x.maskin_id)).toEqual(['Nära', 'A-saknas', 'Ö-saknas']);
    expect(r[1].km).toBeNull();
  });

  it('utan utgångspunkt har ingen avstånd, men alla maskiner är kvar', () => {
    const r = sorteraMaskiner([maskin('B', pos(56.5, 14.7)), maskin('A', pos(57, 14))], null);
    expect(r.map(x => x.maskin_id)).toEqual(['A', 'B']);
    expect(r.every(x => x.km === null)).toBe(true);
  });

  it('lika avstånd: den säkra positionen före den osäkra', () => {
    const r = sorteraMaskiner([maskin('Osäker', pos(56.5, 14.7, true)), maskin('Säker', pos(56.5, 14.7, false))], lbc);
    expect(r.map(x => x.maskin_id)).toEqual(['Säker', 'Osäker']);
  });
});

describe('texter', () => {
  it('avståndet är ett ungefärligt tal: en decimal under 10 km, annars hela', () => {
    expect(avstandText(3.14)).toBe('≈ 3,1 km');
    expect(avstandText(48.4)).toBe('≈ 48 km');
  });

  it('tid: idag/igår med klockslag i svensk tid, annars datum', () => {
    expect(tidText(Date.parse('2026-10-19T09:23:00Z'), NU)).toBe('idag 11:23');
    expect(tidText(Date.parse('2026-10-18T16:02:00Z'), NU)).toBe('igår 18:02');
    expect(tidText(Date.parse('2026-10-07T08:00:00Z'), NU)).toBe('7 okt 10:00');
  });

  it('positionsraden säger källa, tid och "plats osäker"; saknad position ber föraren peka ut den', () => {
    expect(posRad(pos(56.5, 14.7), NU)).toEqual({ text: 'GPS idag 13:00', osaker: false });
    expect(posRad({ ...pos(56.5, 14.7, true), tidMs: Date.parse('2026-10-07T08:00:00Z'), kalla: 'plats' }, NU)).toEqual({ text: 'Senast känd plats 7 okt 10:00 · plats osäker', osaker: true });
    expect(posRad(null, NU).text).toContain('peka ut');
  });
});
