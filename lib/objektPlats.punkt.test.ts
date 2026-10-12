import { describe, it, expect } from 'vitest';
import {
  PUNKT_TRAFF_M, harTraktgrans, objektTraffPunkt, valjObjektForPosition, objektHuvudtyp, maskinKlararObjekt, avstandTillObjektPunkt,
  type ObjektForVal,
} from './objektPlats';
import { kvadrat } from './testStod/geometri';

// OBJEKT UTAN TRAKTGRÄNS (ett jobb från Starta jobb som Vida inte levererat) räknas som träff när maskinen står inom 300 m från dess punkt.
// Ett objekt MED traktgräns räknas som förut: bara inne i gränsen — punkten är då bara en markör.

const LAT = 56.40, LNG = 14.90;
// 1 grad lat ≈ 111 195 m (R = 6 371 000).
const NORR = (m: number) => LAT + m / 111195;

describe('objektTraffPunkt — gräns eller 300 m', () => {
  it('bara en punkt: 200 m bort = träff, 400 m bort = ingen träff, exakt på punkten = träff', () => {
    const o = { lat: LAT, lng: LNG, geometri: null };
    expect(objektTraffPunkt(o, LAT, LNG)).toBe(true);
    expect(objektTraffPunkt(o, NORR(200), LNG)).toBe(true);
    expect(objektTraffPunkt(o, NORR(400), LNG)).toBe(false);
    expect(PUNKT_TRAFF_M).toBe(300);
  });
  it('gränsfallet: strax innanför 300 m = träff, strax utanför = inte', () => {
    const o = { lat: LAT, lng: LNG };
    expect(objektTraffPunkt(o, NORR(295), LNG)).toBe(true);
    expect(objektTraffPunkt(o, NORR(305), LNG)).toBe(false);
  });
  it('har objektet en traktgräns räknas BARA gränsen — punkten 100 m bort hjälper inte om man står utanför gränsen', () => {
    const g = kvadrat(LAT + 0.01, LNG, 0.001);          // gränsen ligger ~1,1 km norr om punkten
    const o = { lat: LAT, lng: LNG, geometri: g };
    expect(harTraktgrans(g)).toBe(true);
    expect(objektTraffPunkt(o, NORR(100), LNG)).toBe(false);   // nära punkten men utanför gränsen
    expect(objektTraffPunkt(o, LAT + 0.01, LNG)).toBe(true);   // inne i gränsen
  });
  it('geometri UTAN traktdel (bara fastighet) räknas inte som gräns → punktregeln gäller', () => {
    const fc = { type: 'FeatureCollection', features: [{ properties: { _lager: 'SV_FASTIGHET' }, geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] } }] };
    expect(harTraktgrans(fc)).toBe(false);
    expect(objektTraffPunkt({ lat: LAT, lng: LNG, geometri: fc }, NORR(50), LNG)).toBe(true);
  });
  it('objekt utan gräns OCH utan punkt, och null → aldrig träff', () => {
    expect(objektTraffPunkt({ geometri: null }, LAT, LNG)).toBe(false);
    expect(objektTraffPunkt({ lat: null, lng: null }, LAT, LNG)).toBe(false);
    expect(objektTraffPunkt(null, LAT, LNG)).toBe(false);
    expect(avstandTillObjektPunkt({ lat: 'x', lng: 1 }, LAT, LNG)).toBeNull();
  });
  it('lat/lng som text ("56.4") tolkas (PostgREST kan skicka numeric som sträng)', () => {
    expect(objektTraffPunkt({ lat: '56.4' as any, lng: '14.9' as any }, LAT, LNG)).toBe(true);
  });
});

describe('valjObjektForPosition — bara-punkt-objekt som kandidat', () => {
  const jobb: ObjektForVal = { id: 'p1', typ: 'slutavverkning', status: 'pagaende', lat: LAT, lng: LNG, geometri: null };

  it('maskinen 150 m från ett jobb utan gräns → jobbet är träffen', () => {
    expect(valjObjektForPosition({ lat: NORR(150), lng: LNG, objekt: [jobb] }).traff?.id).toBe('p1');
  });
  it('400 m bort → ingen träff', () => {
    expect(valjObjektForPosition({ lat: NORR(400), lng: LNG, objekt: [jobb] }).traff).toBeNull();
  });
  it('står maskinen INNE i en riktig traktgräns slår den ett bara-punkt-objekt i närheten (även om punkt-objektet är pågående)', () => {
    const riktig: ObjektForVal = { id: 'v1', typ: 'gallring', status: 'planerad', geometri: kvadrat(LAT, LNG, 0.002), lat: LAT + 0.5, lng: LNG };
    const r = valjObjektForPosition({ lat: LAT, lng: LNG, objekt: [jobb, riktig] });
    expect(r.traff?.id).toBe('v1');
    expect(r.flera).toBe(true);
    expect(r.kandidater.map((o) => o.id)).toEqual(['v1', 'p1']);
  });
  it('men tilldelat denna maskin slår fortfarande allt (planerarens instruktion)', () => {
    const riktig: ObjektForVal = { id: 'v1', typ: 'gallring', status: 'planerad', geometri: kvadrat(LAT, LNG, 0.002) };
    const mitt: ObjektForVal = { ...jobb, skordare_maskin_id: 'R64428' };
    expect(valjObjektForPosition({ lat: LAT, lng: LNG, maskinId: 'R64428', objekt: [riktig, mitt] }).traff?.id).toBe('p1');
  });
  it('två bara-punkt-objekt: det NÄRMASTE vinner (annars samma rang)', () => {
    const a: ObjektForVal = { id: 'a', status: 'planerad', lat: NORR(250), lng: LNG };
    const b: ObjektForVal = { id: 'b', status: 'planerad', lat: NORR(60), lng: LNG };
    expect(valjObjektForPosition({ lat: LAT, lng: LNG, objekt: [a, b] }).traff?.id).toBe('b');
  });
  it('två riktiga gränser med samma rang avgörs som förut (areal, sedan id) — avståndet till deras punkt spelar ingen roll', () => {
    const a: ObjektForVal = { id: 'a', status: 'planerad', geometri: kvadrat(LAT, LNG, 0.002), areal: 5, lat: LAT + 0.0005, lng: LNG };
    const b: ObjektForVal = { id: 'b', status: 'planerad', geometri: kvadrat(LAT, LNG, 0.002), areal: 9, lat: LAT, lng: LNG };
    expect(valjObjektForPosition({ lat: LAT, lng: LNG, objekt: [b, a] }).traff?.id).toBe('a');
    const c: ObjektForVal = { id: 'c', status: 'planerad', geometri: kvadrat(LAT, LNG, 0.002), lat: LAT, lng: LNG };
    const d: ObjektForVal = { id: 'd', status: 'planerad', geometri: kvadrat(LAT, LNG, 0.002), lat: LAT + 0.0005, lng: LNG };
    expect(valjObjektForPosition({ lat: LAT, lng: LNG, objekt: [d, c] }).traff?.id).toBe('c');   // lika areal → id
  });
});

describe('objektHuvudtyp — GROT och energiklippning är TYPER (inte grot-flaggan)', () => {
  it("typ 'grot' → grot, typ 'energiklippning' → energiklippning", () => {
    expect(objektHuvudtyp({ typ: 'grot' })).toBe('grot');
    expect(objektHuvudtyp({ typ: 'energiklippning' })).toBe('energiklippning');
    expect(objektHuvudtyp({ typ: 'Energiklippning' })).toBe('energiklippning');
  });
  it('grot-FLAGGAN gör ingenting: en slutavverkning med grot=true är en slutavverkning (15 st i prod)', () => {
    expect(objektHuvudtyp({ typ: 'slutavverkning', grot: true })).toBe('slutavverkning');
    expect(objektHuvudtyp({ typ: 'gallring', grot: true })).toBe('gallring');
  });
  it('en typ-lös rad med grot=true blir inte grot heller', () => {
    expect(objektHuvudtyp({ typ: null, grot: true })).toBeNull();
  });
  it('de gamla vägarna oförändrade: Biobränsle → grot, slutavverkning/gallring ur typ', () => {
    expect(objektHuvudtyp({ typ: 'slutavverkning', avverkningsform: 'Biobränsle' })).toBe('grot');
    expect(objektHuvudtyp({ typ: 'gallring' })).toBe('gallring');
    expect(objektHuvudtyp({ typ: 'slutavverkning' })).toBe('slutavverkning');
  });
  it('maskinKlararObjekt: en GROT-maskin klarar energiklippning; en slutavverkningsmaskin klarar den inte; bada klarar allt', () => {
    expect(maskinKlararObjekt('grot', { typ: 'energiklippning' })).toBe(true);
    expect(maskinKlararObjekt('slutavverkning', { typ: 'energiklippning' })).toBe(false);
    expect(maskinKlararObjekt('bada', { typ: 'energiklippning' })).toBe(true);
    expect(maskinKlararObjekt('energiklippning', { typ: 'energiklippning' })).toBe(true);
  });
});
