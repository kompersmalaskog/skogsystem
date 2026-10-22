import { describe, expect, it } from 'vitest';
import { inrePunkt, vidaEtikettPunkter, zonEtikettPunkter, delar } from './ytaEtikett';

const kvadrat = (x: number, y: number, s: number): number[][] => [[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y]];
const nb = (beteckn: string, geometry: any) => ({ type: 'Feature', properties: { _lager: 'SV_SKS_NYCKELBIOTOP_101', _typ: 'nyckelbiotop', Beteckn: beteckn }, geometry });
const iRuta = (p: number[], r: number[][]) => p[0] > r[0][0] && p[0] < r[1][0] && p[1] > r[0][1] && p[1] < r[2][1];

describe('en etikett per yta (Nyckelbiotop-dubbletten)', () => {
  it('en MultiPolygon med tre delar får EN punkt, i den STÖRSTA delen', () => {
    const liten1 = kvadrat(15.0, 57.0, 0.0002), liten2 = kvadrat(15.01, 57.0, 0.0003), stor = kvadrat(15.02, 57.0, 0.002);
    const fc = { features: [nb('NB1', { type: 'MultiPolygon', coordinates: [[liten1], [stor], [liten2]] })] };
    const ut = vidaEtikettPunkter(fc);
    expect(ut.features).toHaveLength(1);
    expect(iRuta(ut.features[0].geometry.coordinates, stor)).toBe(true);
    expect(ut.features[0].properties._lager).toBe('SV_SKS_NYCKELBIOTOP_101');
  });
  it('samma yta levererad som två features (samma nyckel) → en punkt', () => {
    const a = kvadrat(15.0, 57.0, 0.001), b = kvadrat(15.003, 57.0, 0.002);
    const ut = vidaEtikettPunkter({ features: [nb('NB7', { type: 'Polygon', coordinates: [a] }), nb('NB7', { type: 'Polygon', coordinates: [b] })] });
    expect(ut.features).toHaveLength(1);
    expect(iRuta(ut.features[0].geometry.coordinates, b)).toBe(true);
  });
  it('två olika ytor får varsin punkt; feature utan nyckel slås aldrig ihop med en annan', () => {
    const f = (b: string | undefined, x: number) => nb(b as any, { type: 'Polygon', coordinates: [kvadrat(x, 57.0, 0.001)] });
    expect(vidaEtikettPunkter({ features: [f('A', 15.0), f('B', 15.01)] }).features).toHaveLength(2);
    expect(vidaEtikettPunkter({ features: [f(undefined, 15.0), f(undefined, 15.01)] }).features).toHaveLength(2);
  });
  it('hänsynsyta (LOPNR) och fornlämningsyta får också en punkt; andra lager och punkter/linjer ingen', () => {
    const poly = { type: 'Polygon', coordinates: [kvadrat(15.0, 57.0, 0.001)] };
    const hansyn = { type: 'Feature', properties: { _lager: 'L_TILLAGGSYTOR', _typ: 'hänsynsyta', LOPNR: '3' }, geometry: poly };
    const raa = { type: 'Feature', properties: { _lager: 'L_RAA_POLY_101', _typ: 'fornlämning', lamningsnu: 'L1' }, geometry: poly };
    const traktdel = { type: 'Feature', properties: { _lager: 'L_TRAKTDEL', _typ: 'traktgräns' }, geometry: poly };
    const linje = { type: 'Feature', properties: { _lager: 'L_TILLAGGSLINJER', _typ: 'linje' }, geometry: { type: 'LineString', coordinates: [[15, 57], [15.1, 57]] } };
    const ut = vidaEtikettPunkter({ features: [hansyn, raa, traktdel, linje] });
    expect(ut.features.map((f: any) => f.properties._lager).sort()).toEqual(['L_RAA_POLY_101', 'L_TILLAGGSYTOR']);
  });
  it('egna zoner: en punkt per zon med zonens egenskaper', () => {
    const z = (id: string, x: number) => ({ type: 'Feature', properties: { id, zoneType: 'wet' }, geometry: { type: 'Polygon', coordinates: [kvadrat(x, 57.0, 0.001)] } });
    const ut = zonEtikettPunkter([z('a', 15.0), z('b', 15.01)]);
    expect(ut.features.map((f: any) => f.properties.id)).toEqual(['a', 'b']);
    expect(ut.features.every((f: any) => f.properties.zoneType === 'wet' && f.geometry.type === 'Point')).toBe(true);
  });
});

describe('inrePunkt', () => {
  it('punkten ligger INNE i ytan även när tyngdpunkten ligger utanför (C-formad yta)', () => {
    // C: stor ruta med en skåra från höger. Tyngdpunkten hamnar nära skåran, mittpunkten av bboxen i skåran.
    const c = [[0, 0], [10, 0], [10, 3], [3, 3], [3, 7], [10, 7], [10, 10], [0, 10], [0, 0]].map(([x, y]) => [15 + x * 0.0002, 57 + y * 0.0001]);
    const [x, y] = inrePunkt([c as any]);
    const lx = (x - 15) / 0.0002, ly = (y - 57) / 0.0001;
    const iSkaran = lx > 3 && ly > 3 && ly < 7;
    expect(iSkaran).toBe(false);
    expect(lx).toBeGreaterThan(0); expect(lx).toBeLessThan(10); expect(ly).toBeGreaterThan(0); expect(ly).toBeLessThan(10);
  });
  it('en kvadrat (i METER, inte i grader): punkten är mitt i', () => {
    // 0,002° lat = 222 m men 0,002° lon = 121 m på lat 57 — en "kvadrat" i grader är en rektangel med ett streck av lika bra punkter. Gör den kvadratisk i meter.
    const dLat = 0.002, dLon = dLat / Math.cos((57 * Math.PI) / 180);
    const ruta = [[15, 57], [15 + dLon, 57], [15 + dLon, 57 + dLat], [15, 57 + dLat], [15, 57]];
    const [x, y] = inrePunkt([ruta as any]);
    expect(Math.abs(x - (15 + dLon / 2))).toBeLessThan(dLon * 0.05);
    expect(Math.abs(y - (57 + dLat / 2))).toBeLessThan(dLat * 0.05);
  });
  it('hål undviks: punkten ligger inte i hålet', () => {
    const yttre = kvadrat(15, 57, 0.002), hal = kvadrat(15.0007, 57.0007, 0.0006);
    const [x, y] = inrePunkt([yttre as any, hal as any]);
    const iHalet = x > 15.0007 && x < 15.0013 && y > 57.0007 && y < 57.0013;
    expect(iHalet).toBe(false);
  });
  it('delar() tål trasig geometri', () => {
    expect(delar(null)).toEqual([]);
    expect(delar({ type: 'Polygon', coordinates: [[[1, 2]]] })).toEqual([]);
  });
});
