import { describe, expect, it } from 'vitest';
import { createExpression, featureFilter } from '@maplibre/maplibre-gl-style-spec';
import hålabäck from './__fixtures__/halaback_au2025_vida_lager.json';
import {
  FOKUS_EGENSKAP, FOKUS_HATCH_OPACITET, FOKUS_NARA_M, FOKUS_UTE_ANDEL, fokusEtikettFilter, fokusOpacitet, medFokus, medFokusStyrka,
} from './fokusTrakt';

const LAT = 56, LNG = 15;
const kx = 111320 * Math.cos(LAT * Math.PI / 180), ky = 111320;
const p = (xM: number, yM: number): [number, number] => [LNG + xM / kx, LAT + yM / ky];
const ring = (...pts: [number, number][]) => [...pts, pts[0]].map(([x, y]) => p(x, y));
const TRAKT = { type: 'Feature', properties: { _lager: 'L_TRAKTDEL', _typ: 'traktgräns' }, geometry: { type: 'Polygon', coordinates: [ring([0, 0], [100, 0], [100, 100], [0, 100])] } };
const nb = (x0: number, x1: number) => ({ type: 'Feature', properties: { _lager: 'SV_SKS_NYCKELBIOTOP_101', Beteckn: `N ${x0}` }, geometry: { type: 'Polygon', coordinates: [ring([x0, 20], [x1, 20], [x1, 80], [x0, 80])] } });
const fokusAv = (fc: any, i: number) => fc.features[i].properties[FOKUS_EGENSKAP];

describe('medFokus — vilka som blir svaga', () => {
  it('inom 50 m från traktgränsen = inne, längre bort = ute (49 och 51 m)', () => {
    const fc = medFokus({ features: [TRAKT, nb(149, 200), nb(151, 200)] });
    expect(fokusAv(fc, 1)).toBe('inne');
    expect(fokusAv(fc, 2)).toBe('ute');
  });
  it('en yta som är DELVIS inne är hel och hållet inne (ytor delas inte)', () => {
    const fc = medFokus({ features: [TRAKT, nb(80, 400)] });
    expect(fokusAv(fc, 1)).toBe('inne');
    expect(fc.features[1].geometry).toEqual(nb(80, 400).geometry);   // geometrin orörd
  });
  it('utan traktgräns sätts inget alls — allt är i full styrka som förut (samma objekt tillbaka)', () => {
    const fc = { features: [nb(500, 600)] };
    expect(medFokus(fc)).toBe(fc);
    expect(JSON.stringify(medFokus(fc))).not.toContain(FOKUS_EGENSKAP);
  });
  it('traktgränsen själv, fastighet och skogsbruksplan (ritas inte) får ingen egenskap', () => {
    const fast = { type: 'Feature', properties: { _lager: 'SV_FASTIGHET' }, geometry: nb(500, 600).geometry };
    const plan = { type: 'Feature', properties: { _lager: 'SV_BESKRIVNINGSENHET_FL' }, geometry: nb(500, 600).geometry };
    const fc = medFokus({ features: [TRAKT, fast, plan] });
    for (const f of fc.features) expect(f.properties).not.toHaveProperty(FOKUS_EGENSKAP);
  });
  it('Vidas linjer (basväg, kraftledning) och punkter (avlägg) räknas också', () => {
    const lin = { type: 'Feature', properties: { _lager: 'L_TILLAGGSLINJER', _typ: 'linje' }, geometry: { type: 'LineString', coordinates: [p(400, 0), p(400, 100)] } };
    const avl = { type: 'Feature', properties: { _lager: 'L_TILLAGGSPUNKTER', _typ: 'punkt', EXTRA_LABE: '01-1' }, geometry: { type: 'Point', coordinates: p(50, 120) } };
    const fc = medFokus({ features: [TRAKT, lin, avl] });
    expect(fokusAv(fc, 1)).toBe('ute');
    expect(fokusAv(fc, 2)).toBe('inne');      // 20 m från kanten
  });
  it('ändrar inte indata (nya objekt, ingen mutation)', () => {
    const fc = { features: [TRAKT, nb(500, 600)] };
    const fore = JSON.stringify(fc);
    medFokus(fc);
    expect(JSON.stringify(fc)).toBe(fore);
  });
});

describe('Hålabäck au 2025 (Vidas leverans ur prod) — Martins fall', () => {
  const fc: any = medFokus(hålabäck as any);
  const per = (lager: string) => fc.features.filter((f: any) => f.properties._lager === lager).map((f: any) => f.properties[FOKUS_EGENSKAP]);
  const rad = (lager: string, nyckel: string, v: string) => fc.features.find((f: any) => f.properties._lager === lager && f.properties[nyckel] === v);

  it('tre av fyra nyckelbiotoper och sex av sju fornlämningspunkter/-ytor ligger utanför trakten → svaga', () => {
    expect(per('SV_SKS_NYCKELBIOTOP_101').filter((x: string) => x === 'ute')).toHaveLength(3);
    expect(per('SV_SKS_NYCKELBIOTOP_101').filter((x: string) => x === 'inne')).toHaveLength(1);
    expect(per('L_RAA_POINT_101').filter((x: string) => x === 'ute')).toHaveLength(6);
    expect(per('L_RAA_POLY_101').every((x: string) => x === 'ute')).toBe(true);
    expect(per('L_RAA_LINE_101')).toEqual(['ute']);
  });
  it('nyckelbiotopen intill trakten (3 m) och fornlämningen 7 m från den är kvar i full styrka', () => {
    expect(rad('SV_SKS_NYCKELBIOTOP_101', 'Beteckn', 'N 2515-2003').properties[FOKUS_EGENSKAP]).toBe('inne');
    expect(rad('L_RAA_POINT_101', 'lamningsnu', 'L1979:9503').properties[FOKUS_EGENSKAP]).toBe('inne');
  });
  it('hänsynsytorna 1–3 och Övrigt 4 inne i/vid trakten är i full styrka; Övrigt 5 (157 m bort) är svag', () => {
    const yta = (nr: number) => fc.features.find((f: any) => f.properties._lager === 'L_TILLAGGSYTOR' && Number(f.properties.LOPNR) === nr).properties[FOKUS_EGENSKAP];
    expect([1, 2, 3, 4].map(yta)).toEqual(['inne', 'inne', 'inne', 'inne']);
    expect(yta(5)).toBe('ute');
  });
  it('avläggen och traktdelarna är orörda', () => {
    expect(per('L_TILLAGGSPUNKTER').every((x: string) => x === 'inne')).toBe(true);
    for (const f of fc.features.filter((x: any) => x.properties._lager === 'L_TRAKTDEL')) expect(f.properties).not.toHaveProperty(FOKUS_EGENSKAP);
  });
});

describe('uttrycken i MapLibres egen uttrycksmotor', () => {
  const ut = (egenskap: unknown) => ({ type: 'Polygon', properties: egenskap === undefined ? {} : { [FOKUS_EGENSKAP]: egenskap } } as any);
  const varde = (uttryck: any, f: any) => {
    const r: any = createExpression(uttryck, { type: 'number', 'property-type': 'data-driven', expression: { interpolated: false, parameters: ['zoom', 'feature'] } } as any);
    expect(r.result, JSON.stringify(r.value)).toBe('success');
    return r.value.evaluate({ zoom: 15 }, f);
  };
  it('styrkan är en tredjedel utanför trakten och full inne — och full när egenskapen saknas (traktgräns saknas)', () => {
    expect(varde(fokusOpacitet(0.18), ut('ute'))).toBeCloseTo(0.18 * FOKUS_UTE_ANDEL, 3);
    expect(varde(fokusOpacitet(0.18), ut('inne'))).toBe(0.18);
    expect(varde(fokusOpacitet(0.18), ut(undefined))).toBe(0.18);
    expect(varde(fokusOpacitet(1), ut('ute'))).toBeCloseTo(1 / 3, 3);
  });
  it('snedstreckningen är borta utanför trakten och kvar annars', () => {
    expect(varde(FOKUS_HATCH_OPACITET, ut('ute'))).toBe(0);
    expect(varde(FOKUS_HATCH_OPACITET, ut('inne'))).toBe(1);
    expect(varde(FOKUS_HATCH_OPACITET, ut(undefined))).toBe(1);
  });
  it('etiketter filtreras bort utanför trakten (och behåller det ursprungliga filtret)', () => {
    const f = featureFilter(fokusEtikettFilter(['==', ['get', '_lager'], 'X']) as any);
    const med = (lager: string, fokus?: string) => f.filter({ zoom: 15 } as any, { type: 2, properties: { _lager: lager, ...(fokus ? { [FOKUS_EGENSKAP]: fokus } : {}) } } as any);
    expect(med('X', 'inne')).toBe(true);
    expect(med('X')).toBe(true);
    expect(med('X', 'ute')).toBe(false);
    expect(med('Y', 'inne')).toBe(false);
  });
  it('medFokusStyrka: linje → line-opacity, symbol → icon-opacity, behåller en dimning som redan fanns', () => {
    const spec = (type: string, paint?: Record<string, any>) => medFokusStyrka({ type, paint });
    expect(spec('line', { 'line-width': 3 }).paint!['line-opacity']).toEqual(fokusOpacitet(1));
    expect(spec('symbol').paint!['icon-opacity']).toEqual(fokusOpacitet(1));
    expect(spec('line', { 'line-opacity': 0.6 }).paint!['line-opacity']).toEqual(fokusOpacitet(0.6));
    expect(medFokusStyrka({ type: 'fill' } as any)).toEqual({ type: 'fill' });
  });
  it('50 m och en tredjedel är siffrorna (regeln står i en konstant, inte i spridda tal)', () => {
    expect(FOKUS_NARA_M).toBe(50);
    expect(FOKUS_UTE_ANDEL).toBeCloseTo(1 / 3, 6);
  });
});
