import { describe, expect, it } from 'vitest';
import { NARA_TRAKT_M, avstandTillTrakt, narTrakten, traktModell } from './traktNara';

// Ett lokalt rutnät i meter runt (56,0 N, 15,0 E) → grader, så testerna kan tänka i meter.
const LAT = 56, LNG = 15;
const kx = 111320 * Math.cos(LAT * Math.PI / 180), ky = 111320;
const p = (xM: number, yM: number): [number, number] => [LNG + xM / kx, LAT + yM / ky];
const ring = (...pts: [number, number][]) => [...pts, pts[0]].map(([x, y]) => p(x, y));
const traktFeat = (r: [number, number][][], typ: 'Polygon' | 'MultiPolygon' = 'Polygon') => ({
  type: 'Feature', properties: { _lager: 'L_TRAKTDEL' }, geometry: { type: typ, coordinates: r } as any,
});
// Trakten: en ruta 0..100 m i x och y.
const RUTA = ring([0, 0], [100, 0], [100, 100], [0, 100]);
const fcRuta = { features: [traktFeat([RUTA])] };
const modell = traktModell(fcRuta)!;
const punkt = (x: number, y: number) => ({ type: 'Point', coordinates: p(x, y) });
const linje = (...pts: [number, number][]) => ({ type: 'LineString', coordinates: pts.map(([x, y]) => p(x, y)) });
const yta = (...pts: [number, number][]) => ({ type: 'Polygon', coordinates: [ring(...pts)] });

describe('traktModell', () => {
  it('är null utan traktgräns (inget att mäta mot) eller utan L_TRAKTDEL', () => {
    expect(traktModell(null)).toBeNull();
    expect(traktModell({ features: [] })).toBeNull();
    expect(traktModell({ features: [{ properties: { _lager: 'SV_FASTIGHET' }, geometry: { type: 'Polygon', coordinates: [RUTA] } }] })).toBeNull();
  });
  it('NARA_TRAKT_M är 50 m (samma siffra som fastighetsgränsen)', () => { expect(NARA_TRAKT_M).toBe(50); });
});

describe('avstandTillTrakt — punkter', () => {
  it('inne i trakten = 0', () => { expect(avstandTillTrakt(punkt(50, 50), modell)).toBe(0); });
  it('utanför: avståndet i meter till närmaste kant (±1 m)', () => {
    expect(avstandTillTrakt(punkt(130, 50), modell, 1000)).toBeCloseTo(30, 0);
    expect(avstandTillTrakt(punkt(-20, -20), modell, 1000)).toBeCloseTo(Math.hypot(20, 20), 0);   // snett mot hörnet
  });
  it('gränsen går vid 50 m: 49 m är nära, 51 m inte', () => {
    expect(narTrakten(punkt(149, 50), modell)).toBe(true);
    expect(narTrakten(punkt(151, 50), modell)).toBe(false);
    expect(avstandTillTrakt(punkt(151, 50), modell)).toBe(Infinity);   // längre än taket
    // Snett mot hörnet: rutan runt punkten ligger inom 50 m men avståndet (57 m) är längre → Infinity, aldrig ett tal över taket.
    expect(avstandTillTrakt(punkt(140, 140), modell)).toBe(Infinity);
    expect(narTrakten(punkt(140, 140), modell)).toBe(false);
    expect(narTrakten(punkt(135, 135), modell)).toBe(true);            // 49,5 m
  });
  it('ett hål i trakten är utanför: punkten mäts mot hålets kant', () => {
    const med = traktModell({ features: [traktFeat([RUTA, ring([40, 40], [60, 40], [60, 60], [40, 60]).reverse()])] })!;
    expect(avstandTillTrakt(punkt(50, 50), med, 1000)).toBeCloseTo(10, 0);
  });
});

describe('avstandTillTrakt — linjer och ytor', () => {
  it('en linje som korsar trakten utan en enda vertex inne = 0', () => {
    expect(avstandTillTrakt(linje([-50, 50], [150, 50]), modell)).toBe(0);
  });
  it('en linje vid sidan: kortaste avståndet mellan kanterna', () => {
    expect(avstandTillTrakt(linje([140, -20], [140, 120]), modell, 1000)).toBeCloseTo(40, 0);
    expect(narTrakten(linje([160, -20], [160, 120]), modell)).toBe(false);
  });
  it('en yta som är DELVIS inne (en vertex inne) = 0, ytan delas inte', () => {
    expect(avstandTillTrakt(yta([80, 40], [300, 40], [300, 60], [80, 60]), modell)).toBe(0);
  });
  it('en yta som korsar kanten utan vertex inne = 0', () => {
    expect(avstandTillTrakt(yta([-50, 40], [150, 40], [150, 60], [-50, 60]), modell)).toBe(0);
  });
  it('en yta som OMSLUTER trakten (ingen vertex inne) = 0', () => {
    expect(avstandTillTrakt(yta([-500, -500], [600, -500], [600, 600], [-500, 600]), modell)).toBe(0);
  });
  it('en yta utanför: gränsen vid 50 m', () => {
    expect(narTrakten(yta([140, 20], [200, 20], [200, 80], [140, 80]), modell)).toBe(true);    // 40 m
    expect(narTrakten(yta([155, 20], [200, 20], [200, 80], [155, 80]), modell)).toBe(false);   // 55 m
  });
  it('MultiPolygon och flera traktdelar: närmaste delen avgör', () => {
    const tva = traktModell({ features: [traktFeat([RUTA]), traktFeat([[ring([300, 0], [400, 0], [400, 100], [300, 100])]] as any, 'MultiPolygon')] })!;
    expect(tva).not.toBeNull();
    expect(narTrakten(punkt(330, 50), tva)).toBe(true);       // inne i den andra delen
    expect(narTrakten(punkt(200, 50), tva)).toBe(false);      // 100 m från båda
  });
  it('ogiltig/tom geometri ger Infinity (aldrig 0)', () => {
    expect(avstandTillTrakt(null, modell)).toBe(Infinity);
    expect(avstandTillTrakt({ type: 'Point', coordinates: [] }, modell)).toBe(Infinity);
    expect(avstandTillTrakt({ type: 'Polygon', coordinates: [] }, modell)).toBe(Infinity);
  });
});
