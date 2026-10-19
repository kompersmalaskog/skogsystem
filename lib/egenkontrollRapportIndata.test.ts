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
  kontext: [], stammar: [], antalStammar: null, hyttspar: [], areal: null,
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

describe('byggRapportIndata: kartlagren', () => {
  const kontext = [
    { data: { path: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 40 }], lineType: 'mainRoad' } },
    { data: { path: [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 30 }, { x: 0, y: 30 }], zoneType: 'protected' } },
    { data: { x: 12, y: -8, type: 'eternitytree' } },
    { data: { x: 3, y: 3, arrowType: 'fellingdirection' } },   // pil: ritas inte
    { data: { nonsens: true } },                                   // gar inte att placera: hoppas over
  ];
  const med = (origo: typeof ORIGO | null, k: { data?: unknown }[] | null) => byggRapportIndata({
    objektNamn: 'A', voNummer: '1', runda: RUNDA, punkter: [], observationer: [], foton: [], provytor: [], origo, granserXy: [],
    kontext: k, stammar: null, antalStammar: null, hyttspar: [], areal: 4.8,
  });

  it('med betrott origo blir linjer, ytor och symboler lat/lng; pilar och oplacerbara hoppas over', () => {
    const i = med(ORIGO, kontext);
    expect(i.markeringar!.map((m) => `${m.slag}:${m.typ}`)).toEqual(['linje:mainRoad', 'zon:protected', 'symbol:eternitytree']);
    const sym = i.markeringar!.find((m) => m.slag === 'symbol') as { plats: { lat: number; lng: number } };
    expect(sym.plats).toEqual(svgToLatLon(12, -8, ORIGO));
    expect(i.areal).toBe(4.8);
  });

  it('UTAN betrott origo ritas inga markeringar och det SAGS - men ett tomt kontext ar ingen anmarkning', () => {
    const i = med(null, kontext);
    expect(i.markeringar).toEqual([]);
    expect(i.extraAnmarkningar![0]).toContain('markeringar ritas inte');
    expect(med(null, []).extraAnmarkningar).toEqual([]);
  });

  it('markeringar som inte gick att lasa blir null (ett FEL), aldrig en tom lista', () => {
    expect(med(ORIGO, null).markeringar).toBeNull();
  });
});
