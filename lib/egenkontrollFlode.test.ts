import { describe, expect, it } from 'vitest';
import type { EgenkontrollPunkt } from './egenkontroll';
import {
  FIX_GAMMAL_MS,
  POSITION_MAX_NOGGRANNHET_M,
  avstandPerPunkt,
  bedomPosition,
  positionSkalText,
  type Fix,
} from './egenkontrollFlode';

// Origo i mitten av en tankt trakt. x/y ar SVG-rymd: okande x = ost, okande y = syd.
const ORIGO = { lat: 56.5, lng: 14.9, zoom: 14 };

function punkt(id: string, over: Partial<EgenkontrollPunkt> = {}): EgenkontrollPunkt {
  return {
    id, egenkontroll_id: 'e1', ordning: 1, del: 'plan', grupp: 'Naturvård', kalla: 'markering',
    markering_id: null, markering_marker_id: null, punkt_typ: 'eternitytree', rubrik: id,
    antal_planerat: null, geometri_snapshot: { x: 0, y: 0 }, status: null, avvikelse_typ: null,
    varde_foreslaget: null, varde_bekraftat: null, kommentar: null, lat: null, lng: null,
    besvarad: null, plan_kommentar: null,
    ...over,
  } as unknown as EgenkontrollPunkt;
}

const fix = (over: Partial<Fix> = {}): Fix => ({ lat: 56.5, lng: 14.9, noggrannhet: 10, t: 1_000_000, ...over });
const NU = 1_000_000;

describe('bedomPosition - en funktion som avgor om positionen duger', () => {
  it('ingen fix an och tiden inte ute: soker', () => {
    expect(bedomPosition(null, null, false, NU)).toEqual({ status: 'soker', position: null, skal: null });
  });
  it('ingen fix och 10 s ute: saknas, med skal', () => {
    expect(bedomPosition(null, null, true, NU)).toMatchObject({ status: 'saknas', position: null, skal: 'tidsgrans' });
  });
  it('en bra fix: ok, och positionen ar med', () => {
    const r = bedomPosition(fix(), null, false, NU);
    expect(r.status).toBe('ok');
    expect(r.position).toEqual({ lat: 56.5, lng: 14.9, noggrannhet: 10 });
  });
  it(`${POSITION_MAX_NOGGRANNHET_M} m exakt duger, strax over gor det inte`, () => {
    expect(bedomPosition(fix({ noggrannhet: 100 }), null, false, NU).status).toBe('ok');
    const r = bedomPosition(fix({ noggrannhet: 100.5 }), null, false, NU);
    expect(r).toMatchObject({ status: 'saknas', position: null, skal: 'otillracklig' });
  });
  it('okand noggrannhet (null) far galla - den gar inte att doma', () => {
    expect(bedomPosition(fix({ noggrannhet: null }), null, false, NU).status).toBe('ok');
  });
  it('en fix aldre an gransen ar inte langre var man ar', () => {
    expect(bedomPosition(fix({ t: NU - FIX_GAMMAL_MS }), null, false, NU).status).toBe('ok');
    expect(bedomPosition(fix({ t: NU - FIX_GAMMAL_MS - 1 }), null, false, NU))
      .toMatchObject({ status: 'saknas', skal: 'gammal' });
  });
  it('nekad plats slar en i och for sig bra fix', () => {
    expect(bedomPosition(fix(), 'nekad', false, NU)).toMatchObject({ status: 'saknas', skal: 'nekad' });
    expect(bedomPosition(null, 'ej_stod', false, NU)).toMatchObject({ status: 'saknas', skal: 'ej_stod' });
  });
  it('varje skal har en egen text - tomt far aldrig betyda tva saker', () => {
    const skal = ['nekad', 'ej_stod', 'tidsgrans', 'otillracklig', 'gammal'] as const;
    const texter = skal.map((s) => positionSkalText(s, 230));
    expect(new Set(texter).size).toBe(skal.length);
    expect(texter.every((t) => t.length > 0)).toBe(true);
    expect(positionSkalText('otillracklig', 230)).toContain('±230 m');
    expect(positionSkalText(null)).toBe('');
  });
});

describe('avstandPerPunkt', () => {
  it('utan origo eller position: tom karta, aldrig en gissning', () => {
    const p = [punkt('a')];
    expect(avstandPerPunkt(p, null, { lat: 56.5, lng: 14.9 }).size).toBe(0);
    expect(avstandPerPunkt(p, ORIGO, null).size).toBe(0);
  });
  it('en punkt utan geometri far ingen post', () => {
    const m = avstandPerPunkt([punkt('a', { geometri_snapshot: null })], ORIGO, { lat: 56.5, lng: 14.9 });
    expect(m.has('a')).toBe(false);
  });
  it('en linje matas till sin NARMASTE brytpunkt', () => {
    const linje = punkt('l', { geometri_snapshot: { path: [{ x: 500, y: 0 }, { x: 5, y: 0 }, { x: 900, y: 0 }] } });
    const punktNara = punkt('p', { geometri_snapshot: { x: 5, y: 0 } });
    const pos = { lat: 56.5, lng: 14.9 };
    const m = avstandPerPunkt([linje, punktNara], ORIGO, pos);
    expect(m.get('l')!.m).toBeCloseTo(m.get('p')!.m, 6);
  });
});
