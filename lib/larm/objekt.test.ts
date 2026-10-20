import { describe, expect, it } from 'vitest';
import { arForarsEgen, linjeObjekt, symbolObjekt, vidaObjekt, vidaSlag, ytaObjekt } from './objekt';
import { stegaLarm, TOMT_LARM } from './larm';

const O = { lat: 56.5, lon: 14.7 };
const M_LAT = 1 / 111320;
const M_LON = 1 / (111320 * Math.cos(56.5 * Math.PI / 180));
const p = (ost: number, nord: number) => ({ lat: O.lat + nord * M_LAT, lon: O.lon + ost * M_LON });
const c = (ost: number, nord: number): [number, number] => [O.lon + ost * M_LON, O.lat + nord * M_LAT];
const ruta = (r: number): [number, number][] => [c(-r, -r), c(r, -r), c(r, r), c(-r, r), c(-r, -r)];

describe('symbolObjekt', () => {
  it('avstånd, riktning och grupp ur typen', () => {
    const o = symbolObjekt({ id: 7, type: 'powerline', lat: p(0, 30).lat, lon: p(0, 30).lon }, 'El-ledning', O, false);
    expect(o).toMatchObject({ id: '7', kalla: 'symbol', grupp: 'fara', namn: 'El-ledning', undantagen: false });
    expect(o.avstandM).toBeCloseTo(30, 0);
    expect(o.bearing).toBeCloseTo(0, 0);
  });
  it('Manuell fällning är Lila (aldrig larm), Avlägg är Info', () => {
    expect(symbolObjekt({ id: 1, type: 'manualfelling', lat: O.lat, lon: O.lon }, 'Manuell fällning', O, false).grupp).toBe('att_gora');
    expect(symbolObjekt({ id: 2, type: 'landing', lat: O.lat, lon: O.lon }, 'Avlägg', O, false).grupp).toBe('info');
  });
});

describe('förarens egna prickar är undantagna, planerarens larmar', () => {
  it('prick satt av föraren (pillräknaren): undantagen', () => {
    expect(arForarsEgen({ type: 'eternitytree', sattAv: 'forare' }, false)).toBe(true);
    expect(arForarsEgen({ type: 'highstump', sattAv: 'forare' }, false)).toBe(true);
  });
  it('samma symboler satta av planeraren (inget sattAv): larmar som övrig Natur', () => {
    expect(arForarsEgen({ type: 'eternitytree' }, false)).toBe(false);
    expect(arForarsEgen({ type: 'highstump' }, false)).toBe(false);
    const o = symbolObjekt({ id: 1, type: 'eternitytree', lat: p(0, 20).lat, lon: p(0, 20).lon }, 'Evighetsträd', O, false);
    expect(stegaLarm({ objekt: [o], kvitt: new Map(), forareId: 'A', state: TOMT_LARM }).kort).not.toBeNull();
  });
  it('naturhörna satt av planeraren larmar; naturhörna med sattAv "forare" är INTE undantagen (bara prickarna)', () => {
    expect(arForarsEgen({ type: 'naturecorner', sattAv: 'forare' }, false)).toBe(false);
  });
  it('en symbol föraren själv just satt (denna session) är undantagen, av vilken typ som helst', () => {
    expect(arForarsEgen({ type: 'powerline' }, true)).toBe(true);
  });
});

describe('linjeObjekt (Stenmur)', () => {
  it('Stenmur: avstånd till närmaste punkt på linjen, grupp Natur', () => {
    const o = linjeObjekt({ id: 'sm', lineType: 'stonewall', koordinater: [p(-50, 25), p(50, 25)] }, O)!;
    expect(o).toMatchObject({ kalla: 'linje', grupp: 'natur', namn: 'Stenmur' });
    expect(o.avstandM).toBeCloseTo(25, 0);
  });
  it('övriga linjer larmar inte (basväg, stickväg, traktgräns)', () => {
    for (const t of ['mainRoad', 'sideRoadRed', 'boundary', 'ditch', 'trail', 'nature']) expect(linjeObjekt({ id: 'x', lineType: t, koordinater: [p(0, 0), p(1, 1)] }, O), t).toBeNull();
  });
});

describe('ytaObjekt', () => {
  const ring = [p(-50, -50), p(50, -50), p(50, 50), p(-50, 50)];
  it('Fornlämning: förbjuden, Brun, inne', () => {
    expect(ytaObjekt({ id: 'y', zoneType: 'fornlamning', ring }, O)).toMatchObject({ kalla: 'yta', grupp: 'kultur', forbjuden: true, inne: true, namn: 'Fornlämning' });
  });
  it('utanför ytan: inne false', () => {
    expect(ytaObjekt({ id: 'y', zoneType: 'protected', ring }, p(200, 0))).toMatchObject({ inne: false, forbjuden: true, grupp: 'natur' });
  });
  it('gallringszonen och okända typer är ingen varningsyta', () => {
    expect(ytaObjekt({ id: 'y', zoneType: 'gallring', ring }, O)).toBeNull();
    expect(ytaObjekt({ id: 'y', zoneType: 'nagot', ring }, O)).toBeNull();
  });
  it('RISA längs basvägen kan ge "inne" utan polygon', () => {
    expect(ytaObjekt({ id: 'risa-1', zoneType: 'wet', ring: [] }, O, true)).toMatchObject({ inne: true, grupp: 'blott' });
  });
});

describe('Vidas lager', () => {
  const f = (props: any, geometry: any) => ({ type: 'Feature', properties: props, geometry });
  const FC = {
    features: [
      f({ _typ: 'hänsynsyta', _lager: 'L_TILLAGGSYTOR' }, { type: 'Polygon', coordinates: [ruta(50)] }),                              // 0
      f({ _typ: 'nyckelbiotop', _lager: 'SV_SKS_NYCKELBIOTOP_101' }, { type: 'Polygon', coordinates: [ruta(50)] }),                  // 1
      f({ _typ: 'fornlämning', _lager: 'L_RAA_POLY_101' }, { type: 'Polygon', coordinates: [ruta(50)] }),                            // 2
      f({ _typ: 'fornlämning', _lager: 'L_RAA_POINT_101' }, { type: 'Point', coordinates: c(0, 30) }),                               // 3
      f({ _typ: 'linje', _lager: 'L_TILLAGGSLINJER', FLBESKR: 'Kraftledning 12 kV' }, { type: 'LineString', coordinates: [c(-80, 20), c(80, 20)] }), // 4
      f({ _typ: 'linje', _lager: 'L_TILLAGGSLINJER', FLBESKR: 'Basväg' }, { type: 'LineString', coordinates: [c(-80, 10), c(80, 10)] }),           // 5
      f({ _typ: 'traktgräns', _lager: 'L_TRAKTDEL' }, { type: 'Polygon', coordinates: [ruta(50)] }),                                  // 6
      f({ _typ: 'punkt', _lager: 'L_TILLAGGSPUNKTER', FLBESKR: 'Avlägg' }, { type: 'Point', coordinates: c(0, 5) }),                  // 7
    ],
  };
  it('vidaSlag: bara det som larmar', () => {
    const slag = FC.features.map((x) => vidaSlag(x.properties, x.geometry.type));
    expect(slag).toEqual(['hansynsyta', 'nyckelbiotop', 'raa_yta', 'raa_punkt', 'kraftledning', null, null, null]);
  });
  it('Hänsyn och Nyckelbiotop är förbjudna ytor (Natur); RAÄ-yta är Fornlämning (Brun, förbjuden)', () => {
    const u = vidaObjekt(FC, O);
    const by = (i: number) => u.find((o) => o.id.endsWith(`:${i}`))!;
    expect(by(0)).toMatchObject({ kalla: 'yta', grupp: 'natur', forbjuden: true, inne: true, namn: 'Hänsyn' });
    expect(by(1)).toMatchObject({ kalla: 'yta', grupp: 'natur', forbjuden: true, inne: true, namn: 'Nyckelbiotop' });
    expect(by(2)).toMatchObject({ kalla: 'yta', grupp: 'kultur', forbjuden: true, inne: true, namn: 'Fornlämning' });
  });
  it('RAÄ-punkt är Kultur (tills kvitterat, ingen förbjuden yta); Kraftledning är Röd linje', () => {
    const u = vidaObjekt(FC, O);
    const punkt = u.find((o) => o.id.endsWith(':3'))!;
    expect(punkt).toMatchObject({ kalla: 'symbol', grupp: 'kultur' });
    expect(punkt.forbjuden).toBeFalsy();
    expect(punkt.avstandM).toBeCloseTo(30, 0);
    const kraft = u.find((o) => o.id.endsWith(':4'))!;
    expect(kraft).toMatchObject({ kalla: 'linje', grupp: 'fara', namn: 'Kraftledning' });
    expect(kraft.avstandM).toBeCloseTo(20, 0);
  });
  it('traktgräns, avlägg och vanlig basväg larmar inte', () => {
    const ider = vidaObjekt(FC, O).map((o) => o.id);
    for (const i of [5, 6, 7]) expect(ider.some((x) => x.endsWith(`:${i}`))).toBe(false);
  });
  it('stabilt id per feature, så en kvittens hittar tillbaka', () => {
    expect(vidaObjekt(FC, O).map((o) => o.id)).toEqual(vidaObjekt(FC, O).map((o) => o.id));
    expect(vidaObjekt(FC, O)[0].id).toBe('vida:L_TILLAGGSYTOR:0');
  });
  it('långt bort: ytan är inte "inne", linjen har oändligt avstånd', () => {
    const u = vidaObjekt(FC, p(5000, 5000));
    expect(u.find((o) => o.id.endsWith(':0'))?.inne).toBe(false);
    expect(u.find((o) => o.id.endsWith(':4'))?.avstandM).toBe(Infinity);
  });
  it('inkörning i en Vida-yta ger larm; utanför ytan inte', () => {
    const inne = stegaLarm({ objekt: vidaObjekt(FC, O), kvitt: new Map(), forareId: 'A', state: TOMT_LARM });
    expect(inne.kort).toMatchObject({ forbjuden: true });
    expect(inne.ljud).not.toBeNull();
    const ute = stegaLarm({ objekt: vidaObjekt(FC, p(200, 0)), kvitt: new Map(), forareId: 'A', state: TOMT_LARM });
    expect(ute.kort).toBeNull();
  });
  it('tom eller saknad samling ger inga objekt', () => {
    expect(vidaObjekt(null, O)).toEqual([]);
    expect(vidaObjekt({ features: [] }, O)).toEqual([]);
  });
});
