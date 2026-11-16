import { describe, it, expect } from 'vitest';
import {
  MAX_ALDER_MS, attHamta, geoVersion, lasGeometriMedCache, lasGeometrierMedCache, lasSparadGeometri, minnesLager, sparatGaller, versionerPerObjekt,
} from './geometriCache';

// En låtsasdatabas som räknar vad som hämtas: poängen med hela filen är att geometrin INTE hämtas i onödan.
type Rad = { id: string; objekt_id: string; skapad: string; geometri: any };
function db(rader: Rad[], val: { fel?: 'version' | 'geometri' | 'kast'; tomt?: boolean } = {}) {
  const logg: string[] = [];
  const api = {
    logg,
    rader,
    val,
    from: (_t: string) => ({
      select: (kol: string) => {
        const geo = kol.includes('geometri');
        const svara = (r: Rad[], en = false) => {
          logg.push(`${kol}${en ? ':en' : ''}:${r.map((x) => x.objekt_id).join(',')}`);
          if (api.val.fel === 'kast') throw new Error('Failed to fetch');
          if (api.val.fel === (geo ? 'geometri' : 'version')) return { data: null, error: { message: 'timeout' } };
          const ut = api.val.tomt ? [] : r;
          const form = (x: Rad) => (geo ? (kol.includes('objekt_id') ? { objekt_id: x.objekt_id, geometri: x.geometri } : { geometri: x.geometri }) : { objekt_id: x.objekt_id, id: x.id, skapad: x.skapad });
          return en ? { data: ut[0] ? form(ut[0]) : null, error: null } : { data: ut.map(form), error: null };
        };
        const kedja = (r: Rad[]) => ({
          eq: (_k: string, v: string) => kedja(r.filter((x) => x.objekt_id === v)),
          in: (_k: string, v: string[]) => Promise.resolve().then(() => svara(r.filter((x) => v.includes(x.objekt_id)))),
          maybeSingle: () => Promise.resolve().then(() => svara(r, true)),
          then: (f: any, g: any) => Promise.resolve().then(() => svara(r)).then(f, g),
        });
        return kedja(api.rader);
      },
    }),
  };
  return api;
}
const fc = (n: string) => ({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { n }, geometry: null }] });
const A: Rad = { id: '1', objekt_id: 'a', skapad: '2026-11-01T10:00:00Z', geometri: fc('a1') };
const B: Rad = { id: '2', objekt_id: 'b', skapad: '2026-11-02T10:00:00Z', geometri: fc('b1') };
const hamtadGeometri = (logg: string[]) => logg.filter((l) => l.includes('geometri'));

describe('versionen: radens id + skapad', () => {
  it('samma rader i annan ordning är samma version; nytt id eller ny tid är en ny', () => {
    const r1 = { objekt_id: 'a', id: 1, skapad: 'x' }, r2 = { objekt_id: 'a', id: 2, skapad: 'y' };
    expect(geoVersion([r1, r2])).toBe(geoVersion([r2, r1]));
    expect(geoVersion([r1])).not.toBe(geoVersion([{ ...r1, id: 9 }]));
    expect(geoVersion([r1])).not.toBe(geoVersion([{ ...r1, skapad: 'z' }]));
    expect(versionerPerObjekt([r1, { objekt_id: 'b', id: 3, skapad: 'q' }]).size).toBe(2);
  });
  it('det sparade gäller bara med samma version och inom skyddsnätet', () => {
    const p = { objektId: 'a', version: 'v', geometri: {}, sparad: 1000 };
    expect(sparatGaller(p, 'v', 2000)).toBe(true);
    expect(sparatGaller(p, 'annan', 2000)).toBe(false);
    expect(sparatGaller(p, 'v', 1000 + MAX_ALDER_MS)).toBe(false);
    expect(sparatGaller(null, 'v', 2000)).toBe(false);
  });
  it('attHamta: bara de önskade som finns på servern och saknar ett gällande sparat', () => {
    const v = new Map([['a', 'v1'], ['b', 'v2'], ['c', 'v3']]);
    const s = new Map([['a', { objektId: 'a', version: 'v1', geometri: {}, sparad: 0 }], ['b', { objektId: 'b', version: 'gammal', geometri: {}, sparad: 0 }]]);
    expect(attHamta(v, s, ['a', 'b', 'finns-inte'], 10)).toEqual(['b']);
    expect(attHamta(v, s, null, 10)).toEqual(['b', 'c']);
  });
});

describe('ett objekt: hämtas en gång, sedan bara när versionen ändrats', () => {
  it('första gången hämtas geometrin och sparas; andra gången räcker versionsfrågan', async () => {
    const d = db([A, B]); const lager = minnesLager();
    const r1 = await lasGeometriMedCache(d, 'a', lager);
    expect(r1.data?.geometri).toEqual(A.geometri);
    expect(hamtadGeometri(d.logg)).toHaveLength(1);
    const r2 = await lasGeometriMedCache(d, 'a', lager);
    expect(r2.data?.geometri).toEqual(A.geometri);
    expect(r2.version).toBe(r1.version);
    expect(hamtadGeometri(d.logg)).toHaveLength(1);          // ingen ny hämtning av geometrin
    expect((await lasSparadGeometri('a', lager))?.version).toBe(r1.version);
  });
  it('Vida levererar om trakten (nytt id och ny tid): det sparade byts ut', async () => {
    const d = db([A]); const lager = minnesLager();
    const r1 = await lasGeometriMedCache(d, 'a', lager);
    d.rader = [{ ...A, id: '77', skapad: '2026-11-16T08:00:00Z', geometri: fc('a2') }];
    const r2 = await lasGeometriMedCache(d, 'a', lager);
    expect(r2.data?.geometri).toEqual(fc('a2'));
    expect(r2.version).not.toBe(r1.version);
    expect((await lasSparadGeometri('a', lager))?.geometri).toEqual(fc('a2'));
  });
  it('skyddsnätet: äldre sparat än en vecka hämtas om även när versionen stämmer', async () => {
    const d = db([A]); const lager = minnesLager(); let t = 1_000_000;
    await lasGeometriMedCache(d, 'a', lager, () => t);
    t += MAX_ALDER_MS + 1;
    await lasGeometriMedCache(d, 'a', lager, () => t);
    expect(hamtadGeometri(d.logg)).toHaveLength(2);
  });
  it('servern svarar inte: det sparade gäller och märks gammal — fel i svar och kast', async () => {
    const d = db([A]); const lager = minnesLager();
    await lasGeometriMedCache(d, 'a', lager);
    for (const fel of ['version', 'kast'] as const) {
      d.val.fel = fel;
      const r = await lasGeometriMedCache(d, 'a', lager);
      expect(r.error).toBeNull();
      expect(r.gammal).toBe(true);
      expect(r.data?.geometri).toEqual(A.geometri);
    }
  });
  it('servern svarar inte och inget är sparat: felet går vidare (aldrig ett tyst tomt svar)', async () => {
    const d = db([A], { fel: 'version' });
    const r = await lasGeometriMedCache(d, 'a', minnesLager());
    expect(r.data).toBeNull();
    expect(r.error).toEqual({ message: 'timeout' });
  });
  it('versionen ändrad men geometrin går inte att hämta: det sparade gäller som gammal, och skrivs inte över', async () => {
    const d = db([A]); const lager = minnesLager();
    const r1 = await lasGeometriMedCache(d, 'a', lager);
    d.rader = [{ ...A, id: '9' }]; d.val.fel = 'geometri';
    const r2 = await lasGeometriMedCache(d, 'a', lager);
    expect(r2.gammal).toBe(true);
    expect((await lasSparadGeometri('a', lager))?.version).toBe(r1.version);
  });
  it('TOMT svar utan fel (utgången session, RLS): tomt svar som förut och det sparade rörs inte', async () => {
    const d = db([A]); const lager = minnesLager();
    await lasGeometriMedCache(d, 'a', lager);
    d.val.tomt = true;
    const r = await lasGeometriMedCache(d, 'a', lager);
    expect(r).toEqual({ data: null, error: null });
    expect(await lasSparadGeometri('a', lager)).not.toBeNull();
  });
  it('ett trasigt lager fäller aldrig läsningen: servern gäller', async () => {
    const trasigt = { las: async () => { throw new Error('x'); }, lasFlera: async () => { throw new Error('x'); }, skriv: async () => { throw new Error('x'); } };
    const r = await lasGeometriMedCache(db([A]), 'a', trasigt as any);
    expect(r.data?.geometri).toEqual(A.geometri);
    const f = await lasGeometrierMedCache(db([A, B]), null, trasigt as any);
    expect(f.data).toHaveLength(2);
  });
});

describe('flera objekt (maskinens positionsval): hela tabellen hämtas aldrig i onödan', () => {
  it('första varvet hämtar bara de önskade; andra varvet hämtar ingen geometri alls', async () => {
    const C: Rad = { id: '3', objekt_id: 'c', skapad: 'x', geometri: fc('c') };
    const d = db([A, B, C]); const lager = minnesLager();
    const r1 = await lasGeometrierMedCache(d, ['a', 'b', 'utan-geometri'], lager);
    expect(r1.error).toBeNull();
    expect(r1.paServern).toBe(3);
    expect(r1.data?.map((x) => x.objekt_id)).toEqual(['a', 'b']);
    expect(hamtadGeometri(d.logg)).toEqual(['objekt_id,geometri:a,b']);     // inte c
    const r2 = await lasGeometrierMedCache(d, ['a', 'b'], lager);
    expect(r2.data).toEqual(r1.data);
    expect(hamtadGeometri(d.logg)).toHaveLength(1);
  });
  it('en trakt levereras om: bara den hämtas', async () => {
    const d = db([A, B]); const lager = minnesLager();
    await lasGeometrierMedCache(d, ['a', 'b'], lager);
    d.rader = [A, { ...B, id: '22', geometri: fc('b2') }];
    const r = await lasGeometrierMedCache(d, ['a', 'b'], lager);
    expect(hamtadGeometri(d.logg)[1]).toBe('objekt_id,geometri:b');
    expect(r.data?.find((x) => x.objekt_id === 'b')?.geometri).toEqual(fc('b2'));
  });
  it('fel är fel — här används aldrig gammalt sparat i stället (positionsvalet bygger på servern)', async () => {
    const d = db([A, B]); const lager = minnesLager();
    await lasGeometrierMedCache(d, ['a', 'b'], lager);
    d.val.fel = 'version';
    expect((await lasGeometrierMedCache(d, ['a', 'b'], lager)).error).toEqual({ message: 'timeout' });
    d.val.fel = 'geometri'; d.rader = [{ ...A, id: 'ny' }, B];
    const r = await lasGeometrierMedCache(d, ['a', 'b'], lager);
    expect(r.data).toBeNull();
    expect(r.error).toEqual({ message: 'timeout' });
  });
  it('tomt svar utan fel: inga rader och paServern 0 (anroparen räknar det som utgången session)', async () => {
    const r = await lasGeometrierMedCache(db([A], { tomt: true }), ['a'], minnesLager());
    expect(r).toEqual({ data: [], error: null, paServern: 0 });
  });
});
