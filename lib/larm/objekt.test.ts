import { describe, expect, it } from 'vitest';
import { arUndantagen, linjeObjekt, symbolObjekt, vidaObjekt, vidaSlag, ytaObjekt } from './objekt';
import { vidaNycklar } from '../vidaNycklar';
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

describe('Högstubbe och Evighetsträd larmar ALDRIG (typen avgör, inte vem som satte dem)', () => {
  it('båda typerna är undantagna, oavsett vem som satte dem', () => {
    expect(arUndantagen('eternitytree', false)).toBe(true);
    expect(arUndantagen('highstump', false)).toBe(true);
  });
  it('planerarens evighetsträd och högstubbe ger varken kort, ring eller Sett-rad', () => {
    for (const typ of ['eternitytree', 'highstump']) {
      const o = symbolObjekt({ id: 1, type: typ, lat: p(0, 20).lat, lon: p(0, 20).lon }, typ, O, false);
      expect(o.undantagen).toBe(true);
      const r = stegaLarm({ objekt: [o], kvitt: new Map(), forareId: 'A', state: TOMT_LARM });
      expect(r.kort).toBeNull(); expect(r.settRad).toBeNull(); expect(r.ljud).toBeNull(); expect(r.ringar).toEqual([]);
    }
  });
  it('Naturhörna larmar som övrig Natur (tills kvitterat)', () => {
    expect(arUndantagen('naturecorner', false)).toBe(false);
    const o = symbolObjekt({ id: 2, type: 'naturecorner', lat: p(0, 20).lat, lon: p(0, 20).lon }, 'Naturhörna', O, false);
    expect(stegaLarm({ objekt: [o], kvitt: new Map(), forareId: 'A', state: TOMT_LARM }).kort).toMatchObject({ grupp: 'natur' });
  });
  it('en symbol föraren själv just satt i sessionen larmar inte, av vilken typ som helst', () => {
    expect(arUndantagen('powerline', true)).toBe(true);
  });
});

describe('linjeObjekt (Stenmur)', () => {
  it('Stenmur: avstånd till närmaste punkt på linjen, grupp Kultur', () => {
    const o = linjeObjekt({ id: 'sm', lineType: 'stonewall', koordinater: [p(-50, 25), p(50, 25)] }, O)!;
    expect(o).toMatchObject({ kalla: 'linje', grupp: 'kultur', namn: 'Stenmur' });
    expect(o.avstandM).toBeCloseTo(25, 0);
  });
  it('El-ledning som LINJE: Röd, avstånd till närmaste punkt på linjen, larmar alltid (även när den kvitterats)', () => {
    const o = linjeObjekt({ id: 'el', lineType: 'powerline', koordinater: [p(-200, 25), p(200, 25)] }, O)!;
    expect(o).toMatchObject({ kalla: 'linje', grupp: 'fara', namn: 'El-ledning', typ: 'powerline' });
    expect(o.avstandM).toBeCloseTo(25, 0);                                    // linjen passerar 25 m bort, ändpunkterna ligger 200 m bort
    const r = stegaLarm({ objekt: [o], kvitt: new Map(), forareId: 'A', state: TOMT_LARM });
    expect(r.kort).toMatchObject({ grupp: 'fara', namn: 'El-ledning' });
    expect(r.ljud).not.toBeNull();
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
      f({ _typ: 'hänsynsyta', _lager: 'L_TILLAGGSYTOR', LOPNR: 6 }, { type: 'Polygon', coordinates: [ruta(50)] }),                              // 0
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
    expect(by(0)).toMatchObject({ kalla: 'yta', grupp: 'natur', forbjuden: true, inne: true, namn: 'Hänsyn 6' });
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
    // Vidas Kraftledning (Röd) ligger inom 15 m här och går före ytan; ytan står i den lilla raden.
    expect(inne.kort).toMatchObject({ grupp: 'fara' });
    expect(inne.fler.some((f) => f.kalla === 'yta' && f.text === 'inne i ytan')).toBe(true);
    expect(inne.ljud).not.toBeNull();
    const ute = stegaLarm({ objekt: vidaObjekt(FC, p(200, 0)), kvitt: new Map(), forareId: 'A', state: TOMT_LARM });
    expect(ute.kort).toBeNull();
  });
  it('vår kommentar på Vidas Kraftledning visas i larmkortet och ändrar hashen (en gammal kvittens gäller inte längre)', () => {
    const utan = vidaObjekt(FC, O).find((o) => o.id.endsWith(':4'))!;
    expect(utan.kommentar).toBeNull();
    const med = vidaObjekt(FC, O, 60, { [vidaNycklar(FC.features)[4]!]: 'Hänger lågt vid vägen' }).find((o) => o.id.endsWith(':4'))!;
    expect(med.kommentar).toBe('Hänger lågt vid vägen');
    expect(med.hash).not.toBe(utan.hash);
    const r = stegaLarm({ objekt: [med], kvitt: new Map(), forareId: 'A', state: TOMT_LARM });
    expect(r.kort).toMatchObject({ namn: 'Kraftledning', grupp: 'fara', text: 'Hänger lågt vid vägen' });
  });
  it('en kommentar på ett annat objekt (annan nyckel) hamnar inte på ledningen', () => {
    const o = vidaObjekt(FC, O, 60, { [vidaNycklar(FC.features)[5]!]: 'annan ledning', 'hansyn:9': 'x' }).find((x) => x.id.endsWith(':4'))!;
    expect(o.kommentar).toBeNull();
  });
  it('tom eller saknad samling ger inga objekt', () => {
    expect(vidaObjekt(null, O)).toEqual([]);
    expect(vidaObjekt({ features: [] }, O)).toEqual([]);
  });
});
