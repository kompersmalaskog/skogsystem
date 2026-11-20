import { describe, expect, it } from 'vitest';
import {
  andradeNycklar, doljMer, doltSpoken, klippVidaGeometri, lasDolt, narmasteSpoke, narmasteSynligaVidaLinje, rensaDolt, skrivDolt,
  synligaDelar, vidaLinjer, visaOriginal, visaStracka,
} from './vidaDolt';
import { langdM, type LngLat } from './linjeRedigering';

const REF: LngLat = [15, 56];
const KX = 111320 * Math.cos((56 * Math.PI) / 180);
const ll = (x: number, y: number): LngLat => [REF[0] + x / KX, REF[1] + y / 111320];
const feat = (nyckel: string, pts: Array<[number, number]>, props: Record<string, unknown> = {}) => ({
  type: 'Feature', properties: { _typ: 'linje', _nyckel: nyckel, FLBESKR: 'Basväg', ...props }, geometry: { type: 'LineString', coordinates: pts.map(([x, y]) => ll(x, y)) },
});
const fc = (...features: any[]) => ({ type: 'FeatureCollection', features });

describe('Vidas linjer — dolt', () => {
  const basvag = feat('linje:a', [[0, 0], [100, 0]]);
  const kraft = feat('linje:k', [[0, 20], [100, 20]], { FLBESKR: 'Kraftledning' });
  const yta = { type: 'Feature', properties: { _typ: 'hänsynsyta' }, geometry: { type: 'Polygon', coordinates: [] } };
  const data = fc(basvag, kraft, yta);
  const linjer = vidaLinjer(data);

  it('hittar redigerbara linjer och märker kraftledningen som skyddad', () => {
    expect(linjer.map((l) => [l.nyckel, l.skyddad])).toEqual([['linje:a', false], ['linje:k', true]]);
  });
  it('kraftledningen går aldrig att dölja', () => {
    expect(doljMer({}, linjer, 'linje:k', [[10, 50]])).toEqual({});
  });
  it('okänd nyckel och tom lista ändrar ingenting', () => {
    expect(doljMer({}, linjer, 'linje:x', [[10, 50]])).toEqual({});
    expect(doljMer({}, linjer, 'linje:a', [])).toEqual({});
  });
  it('doljMer slår ihop och klämmer till linjens längd', () => {
    const d1 = doljMer({}, linjer, 'linje:a', [[10, 30]]);
    const d2 = doljMer(d1, linjer, 'linje:a', [[25, 60], [95, 500]]);
    expect(d2['linje:a']).toEqual([[10, 60], [95, expect.closeTo(100, 0)]]);
  });
  it('klippVidaGeometri ersätter linjen med sina synliga delar och rör inget annat', () => {
    const ut = klippVidaGeometri(data, { 'linje:a': [[40, 60]] })!;
    const bitar = ut.features!.filter((f: any) => f.properties._nyckel === 'linje:a');
    expect(bitar).toHaveLength(2);
    expect(bitar.every((f: any) => f.properties.FLBESKR === 'Basväg')).toBe(true);
    expect(ut.features!.find((f: any) => f.properties._nyckel === 'linje:k')).toBe(kraft);
    expect(ut.features!.find((f: any) => f.properties._typ === 'hänsynsyta')).toBe(yta);
    expect(data.features![0]).toBe(basvag);   // indatan rörs aldrig
  });
  it('klippVidaGeometri hoppar över skyddad linje även om något felaktigt skulle stå som dolt', () => {
    const ut = klippVidaGeometri(data, { 'linje:k': [[10, 50]] })!;
    expect(ut).toBe(data);
  });
  it('utan dolt returneras samma objekt', () => {
    expect(klippVidaGeometri(data, {})).toBe(data);
  });
  it('allt dolt → linjen försvinner ur kartan men finns kvar som spöke', () => {
    const d = { 'linje:a': [[0, 100]] as [number, number][] };
    const ut = klippVidaGeometri(data, d)!;
    expect(ut.features!.some((f: any) => f.properties._nyckel === 'linje:a')).toBe(false);
    expect(doltSpoken(data, d).features).toHaveLength(1);
  });
  it('spökena är exakt det dolda', () => {
    const sp = doltSpoken(data, { 'linje:a': [[40, 60]] }).features;
    expect(sp).toHaveLength(1);
    expect(langdM(sp[0].geometry.coordinates)).toBeCloseTo(20, 1);
  });
  it('synligaDelar: dolt mitt på → två delar', () => {
    expect(synligaDelar(linjer[0], { 'linje:a': [[40, 60]] })).toHaveLength(2);
  });
  it('visa original och visa en sträcka', () => {
    const d = { 'linje:a': [[10, 20], [50, 60]] as [number, number][] };
    expect(visaStracka(d, 'linje:a', 0)['linje:a']).toEqual([[50, 60]]);
    expect(visaStracka({ 'linje:a': [[10, 20]] }, 'linje:a', 0)).toEqual({});
    expect(visaOriginal(d, 'linje:a')).toEqual({});
  });
  it('narmasteSpoke hittar den dolda sträckan man trycker på', () => {
    const d = { 'linje:a': [[40, 60]] as [number, number][] };
    expect(narmasteSpoke(data, d, ll(50, 2), 6)).toMatchObject({ nyckel: 'linje:a', index: 0 });
    expect(narmasteSpoke(data, d, ll(10, 2), 6)).toBeNull();
  });
  it('narmasteSynligaVidaLinje räknar bara det som syns och aldrig kraftledningen', () => {
    const d = { 'linje:a': [[40, 60]] as [number, number][] };
    expect(narmasteSynligaVidaLinje(linjer, d, ll(50, 1), 5)).toBeNull();              // mitt i det dolda
    expect(narmasteSynligaVidaLinje(linjer, d, ll(20, 1), 5)).toMatchObject({ nyckel: 'linje:a' });
    expect(narmasteSynligaVidaLinje(linjer, {}, ll(50, 19), 5)).toBeNull();            // kraftledningen
  });
  it('andradeNycklar', () => {
    expect(andradeNycklar({ a: [[1, 2]] }, { a: [[1, 2]], b: [[3, 4]] })).toEqual(['b']);
  });
  it('rensaDolt släpper bara välformade intervall', () => {
    expect(rensaDolt({ a: [[5, 1], [1, 2], 'x', [-3, 4], [1, NaN]], b: 'fel', c: [] })).toEqual({ a: [[1, 2]] });
  });
});

describe('lagring', () => {
  const lagring: Record<string, string> = {};
  (globalThis as any).localStorage = { getItem: (k: string) => lagring[k] ?? null, setItem: (k: string, v: string) => { lagring[k] = v; }, removeItem: (k: string) => { delete lagring[k]; } };
  const db = (rader: any[] | null, fel = false) => {
    const anrop: any[] = [];
    return {
      anrop,
      from: () => ({
        select: () => ({ eq: async () => (fel ? { data: null, error: { code: 'PGRST205' } } : { data: rader, error: null }) }),
        upsert: async (r: any) => { anrop.push(['upsert', r]); return { error: fel ? { code: 'x' } : null }; },
        delete: () => ({ eq: () => ({ eq: async () => { anrop.push(['delete']); return { error: fel ? { code: 'x' } : null }; } }) }),
      }),
    };
  };
  it('läser från servern och speglar till enheten', async () => {
    const r = await lasDolt(db([{ nyckel: 'linje:a', intervall: [[1, 5]] }]), 'o1');
    expect(r).toEqual({ dolt: { 'linje:a': [[1, 5]] }, kalla: 'server' });
    expect(JSON.parse(lagring['linje_dolt_v1:o1'])).toEqual({ 'linje:a': [[1, 5]] });
  });
  it('saknas tabellen gäller enhetens kopia (aldrig ett tomt svar)', async () => {
    const r = await lasDolt(db(null, true), 'o1');
    expect(r.kalla).toBe('enhet');
    expect(r.dolt).toEqual({ 'linje:a': [[1, 5]] });
  });
  it('skrivDolt skriver bara det som ändrats; tomt = delete; fel → false men enhetens kopia finns', async () => {
    const d = db([]);
    expect(await skrivDolt(d, 'o2', { a: [[1, 2]], b: [[1, 2]] }, { a: [[1, 2]], b: [[3, 4]], c: [[1, 2]] })).toBe(true);
    expect(d.anrop.map((x) => x[0])).toEqual(['upsert', 'upsert']);
    const d2 = db([]);
    await skrivDolt(d2, 'o2', { a: [[1, 2]] }, {});
    expect(d2.anrop.map((x) => x[0])).toEqual(['delete']);
    expect(await skrivDolt(db([], true), 'o3', {}, { a: [[1, 2]] })).toBe(false);
    expect(JSON.parse(lagring['linje_dolt_v1:o3'])).toEqual({ a: [[1, 2]] });
  });
});
