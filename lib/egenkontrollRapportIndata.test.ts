import { describe, expect, it } from 'vitest';
import type { Egenkontroll, EgenkontrollPunkt } from './egenkontroll';
import { byggRapportIndata } from './egenkontrollRapportIndata';
import { svgToLatLon } from './kartkoordinater';

const ORIGO = { lat: 56.1, lng: 15.1, zoom: 16 };
const RUNDA = { id: 'e1', objekt_typ: 'slutavverkning', status: 'klar' } as unknown as Egenkontroll;

const punkt = (id: string, geometri: unknown, over: Partial<EgenkontrollPunkt> = {}) =>
  ({ id, geometri_snapshot: geometri, lat: null, lng: null, ...over }) as unknown as EgenkontrollPunkt;

const bas = (origo: typeof ORIGO | null) => byggRapportIndata({
  objektNamn: 'Aramo', voNummer: '1', runda: RUNDA,
  punkter: [punkt('sym', { x: 10, y: -20 }), punkt('lin', { path: [{ x: 0, y: 0 }, { x: 40, y: 0 }] }), punkt('ingen', null)],
  observationer: [punkt('obs', null, { lat: 56.2, lng: 15.2 })],
  foton: [], provytor: [], origo,
  granserXy: [[{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]],
});

describe('byggRapportIndata', () => {
  it('med ett betrott origo: plats ur geometrin (linjens mitt = medelvardet av brytpunkterna), traktgransen i lat/lng', () => {
    const i = bas(ORIGO);
    expect(i.platser.sym).toEqual(svgToLatLon(10, -20, ORIGO));
    const a = svgToLatLon(0, 0, ORIGO), b = svgToLatLon(40, 0, ORIGO);
    expect(i.platser.lin!.lat).toBeCloseTo((a.lat + b.lat) / 2, 9);
    expect(i.platser.lin!.lng).toBeCloseTo((a.lng + b.lng) / 2, 9);
    expect(i.platser.ingen).toBeNull();
    expect(i.traktgrans).toEqual([[svgToLatLon(0, 0, ORIGO), svgToLatLon(100, 0, ORIGO), svgToLatLon(100, 100, ORIGO)]]);
  });

  it('UTAN betrott origo far ingen planpunkt en plats och ingen traktgrans ritas - hellre farre pinnar an en punkt pa fel plats', () => {
    const i = bas(null);
    expect(Object.values(i.platser).every((v) => v === null)).toBe(true);
    expect(i.traktgrans).toEqual([]);
  });

  it('observationens egen position finns kvar i punkten (modellen laser den ur lat/lng), aven utan origo', () => {
    const i = bas(null);
    expect(i.observationer[0]).toMatchObject({ lat: 56.2, lng: 15.2 });
  });
});
