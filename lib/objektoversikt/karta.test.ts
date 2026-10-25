import { describe, expect, it } from 'vitest';
import { hogFeatures, vidaLinjeFeatures, inneIRing, markeringKort, medOptiSpar, raknadeSkotarLass, skotatIOmradet, skotatRader, traktSiffror, type SkotarLass, iOmradet, inomRuta, maskinRad, omradeSvar, omradeUnder, rundaM3, rutaRunt, senastText, sistaPunkt, type KartStam, type LngLat } from './karta';
import { klustraStammar } from '@/lib/produktionshogar';

// En kvadrat ~111 m × ~62 m vid 56° N.
const RUTA: LngLat[] = [[15, 56], [15.001, 56], [15.001, 56.001], [15, 56.001]];

describe('inneIRing', () => {
  it('inne och ute', () => {
    expect(inneIRing(15.0005, 56.0005, RUTA)).toBe(true);
    expect(inneIRing(15.002, 56.0005, RUTA)).toBe(false);
    expect(inneIRing(15.0005, 55.9999, RUTA)).toBe(false);
  });
});

describe('iOmradet — hur mycket avverkades här?', () => {
  const stammar: KartStam[] = [
    { lat: 56.0002, lng: 15.0002, volym: 0.6, tradslag: 'Gran' },
    { lat: 56.0004, lng: 15.0004, volym: 0.5, tradslag: 'Gran' },
    { lat: 56.0006, lng: 15.0006, volym: 0.9, tradslag: 'Tall' },
    { lat: 56.0005, lng: 15.005, volym: 9, tradslag: 'Gran' }, // utanför
  ];
  it('under tre hörn finns inget område', () => {
    expect(iOmradet(stammar, RUTA.slice(0, 2))).toBeNull();
  });
  it('räknar bara stammarna inne i området', () => {
    const o = iOmradet(stammar, RUTA)!;
    expect(o.trad).toBe(3);
    expect(o.m3).toBe(2); // 1,1 gran + 0,9 tall, en decimal under 10 m³
    expect(o.tradslag.map(t => t.namn)).toEqual(['Gran', 'Tall']);
  });
  it('summan är summan av de avrundade trädslagen', () => {
    const många: KartStam[] = [];
    for (let i = 0; i < 40; i++) många.push({ lat: 56.0001 + i * 0.00002, lng: 15.0001 + i * 0.00002, volym: 0.333, tradslag: i % 2 ? 'Gran' : 'Tall' });
    const o = iOmradet(många, RUTA)!;
    expect(o.m3).toBe(o.tradslag.reduce((s, t) => s + t.m3, 0));
  });
  it('arean i ha med en decimal', () => {
    const o = iOmradet([], RUTA)!;
    expect(o.ha).toBe(0.7); // ~111 × 62 m = 0,69 ha
    expect(o.m3).toBe(0);
    expect(o.trad).toBe(0);
  });
  it('orden', () => {
    const o = { m3: 312, trad: 1240, ha: 2.1, tradslag: [] };
    expect(omradeSvar(o)).toBe('312 m³fub');
    expect(omradeUnder(o).replace(/ /g, ' ')).toBe('1 240 träd · 2,1 ha');
  });
  it('avrundning: hela m³ från 10', () => {
    expect(rundaM3(12.4, 12.4)).toBe(12);
    expect(rundaM3(4.26, 4.26)).toBe(4.3);
  });
});

describe('högarna', () => {
  it('samma klustring som planeringsvyn: stammar inom ~10 m blir en hög', () => {
    const st = [
      { lat: 56.0001, lng: 15.0001, total_volym: 0.5, tradslag: 'Gran' },
      { lat: 56.00012, lng: 15.00011, total_volym: 0.4, tradslag: 'Gran' },
      { lat: 56.002, lng: 15.002, total_volym: 0.3, tradslag: 'Tall' },
    ];
    const k = klustraStammar(st);
    expect(k).toHaveLength(2);
    expect(k[0].n).toBe(2);
    expect(k[0].volym).toBeCloseTo(0.9);
  });
  it('features: det vanligaste trädslaget färgar högen', () => {
    const f = hogFeatures([
      { lat: 56.0001, lng: 15.0001, volym: 0.5, tradslag: 'Gran' },
      { lat: 56.00011, lng: 15.00011, volym: 0.4, tradslag: 'Gran' },
      { lat: 56.00012, lng: 15.00012, volym: 0.4, tradslag: 'Tall' },
    ]);
    expect(f).toHaveLength(1);
    expect(f[0].properties.tradslag).toBe('Gran');
    expect(f[0].properties.trad).toBe(3);
  });
});

describe('maskinerna', () => {
  it('sista punkten med position', () => {
    expect(sistaPunkt([{ lat: 56, lng: 15, tid: 'a' }, { lat: 57, lng: 16 }, { foo: 1 }])).toEqual({ lat: 57, lng: 16, tid: null });
    expect(sistaPunkt(null)).toBeNull();
    expect(sistaPunkt([])).toBeNull();
  });
  it('tiden i ord', () => {
    const nu = new Date('2026-10-24T12:00:00Z'); // 14:00 svensk tid
    expect(senastText('2026-10-24T11:50:00Z', null, nu)).toBe('nu');
    expect(senastText('2026-10-24T08:32:00Z', null, nu)).toBe('kl 10:32');
    expect(senastText('2026-10-23T14:10:00Z', null, nu)).toBe('igår 16:10');
    expect(senastText('2026-10-21T08:00:00Z', null, nu)).toBe('21 okt');
    expect(senastText(null, '2026-10-24', nu)).toBe('idag');
    expect(senastText(null, null, nu)).toBe('tid okänd');
  });
  it('här eller på annan plats', () => {
    const r = rutaRunt(RUTA)!;
    expect(inomRuta(15.0005, 56.0005, r)).toBe(true);
    expect(inomRuta(15.004, 56.0005, r)).toBe(true); // ~180 m utanför: inom 300 m
    expect(inomRuta(15.02, 56.0005, r)).toBe(false);
    const m = { maskin_id: 'x', namn: 'Giant', roll: 'skordare' as const, lat: 0, lng: 0, nar: 'nu', har: true };
    expect(maskinRad(m)).toEqual({ titel: 'Giant', under: 'Här nu' });
    expect(maskinRad({ ...m, nar: 'kl 14:32', har: false }).under).toBe('På annan plats · senast kl 14:32');
  });
});

describe('skotat i området', () => {
  // Två ytor i trakten: väster (i området) och öster (utanför). Avlägget ligger söder om trakten.
  const TRAKT: LngLat[][] = [[[15, 56], [15.002, 56], [15.002, 56.001], [15, 56.001]]];
  const VASTER: LngLat[] = [[15, 56], [15.001, 56], [15.001, 56.001], [15, 56.001]];
  const avlagg: LngLat = [15.001, 55.998];
  const vag = (x: number): LngLat[] => [[x, 56.0005], [x, 56.0004], [x, 56.0006], [15.001, 55.9985], avlagg];
  const app = (m3: number, x: number, tidMs = 1000): SkotarLass => ({ maskin: 'S', tidMs, datum: '2026-10-20', m3, app: true, spar: vag(x) });

  it('ett lass lastat helt i området räknas helt, ett utanför inte alls', () => {
    const s = skotatIOmradet([app(20, 15.0005), app(18, 15.0015)], VASTER, TRAKT)!;
    expect(s.m3).toBe(20);
    expect(s.ejPlacerade).toBe(0);
  });
  it('punkterna vid avlägget räknas inte', () => {
    // Avlägget i området: utan regeln skulle lasset från öster delvis räknas hit.
    const s = skotatIOmradet([{ ...app(18, 15.0015), spar: [[15.0015, 56.0005], [15.0015, 56.0006], [15.0005, 56.0005]] }], VASTER, TRAKT)!;
    expect(s.m3).toBe(0);
  });
  it('ett lass utan spår kan inte placeras — då sägs inget om kvar', () => {
    const s = skotatIOmradet([app(20, 15.0005), { ...app(15, 0), spar: null }], VASTER, TRAKT)!;
    expect(s).toEqual({ m3: 20, ejPlacerade: 1, ejPlaceradM3: 15 });
    const r = skotatRader(312, s)!;
    expect(r.kvar).toBeNull();
    expect(r.not).toMatch(/1 lass \(15 m³fub\) saknar körspår/);
  });
  it('kvar = skördat − skotat, aldrig under noll', () => {
    expect(skotatRader(312, { m3: 280, ejPlacerade: 0, ejPlaceradM3: 0 })).toEqual({ skotat: 'ca 280 m³fub', kvar: 'ca 32 m³fub', not: null });
    expect(skotatRader(12, { m3: 20, ejPlacerade: 0, ejPlaceradM3: 0 })!.kvar).toBe('ca 0 m³fub');
    expect(skotatRader(12, { m3: 0, ejPlacerade: 2, ejPlaceradM3: 30 })!.skotat).toBe('går inte att räkna');
  });
  it('inga lass → ingen rad', () => {
    expect(skotatIOmradet([], VASTER, TRAKT)).toBeNull();
    expect(skotatRader(10, null)).toBeNull();
  });
  it('Opti-lass räknas bara före maskinens första app-lass (ingen dubbelräkning)', () => {
    const opti = (tidMs: number | null, datum = '2026-10-19'): SkotarLass => ({ maskin: 'S', tidMs, datum, m3: 10, app: false, spar: null });
    const appStart = Date.parse('2026-10-20T06:00:00Z');
    const r = raknadeSkotarLass([app(20, 15.0005, appStart), opti(appStart - 1), opti(appStart + 1), opti(null, '2026-10-19'), opti(null, '2026-10-20'), { ...opti(appStart + 1), maskin: 'ANNAN' }]);
    expect(r.map(l => `${l.maskin}:${l.app}:${l.tidMs}:${l.datum}`)).toEqual([
      `S:true:${appStart}:2026-10-20`, `S:false:${appStart - 1}:2026-10-19`, 'S:false:null:2026-10-19', `ANNAN:false:${appStart + 1}:2026-10-19`,
    ]);
  });
  it('Opti-lassets väg = skotarens spår mellan förra lossningen och den här', () => {
    const t0 = Date.parse('2026-10-12T08:00:00Z');
    const lass: SkotarLass[] = [
      { maskin: 'S', tidMs: t0, datum: '2026-10-12', m3: 10, app: false, spar: null },
      { maskin: 'S', tidMs: t0 + 3600_000, datum: '2026-10-12', m3: 12, app: false, spar: null },
    ];
    const punkter = [-30, 10, 20, 50, 70].map((min, i) => ({ lng: 15 + i * 0.0001, lat: 56.0005, ms: t0 + min * 60_000 }));
    const [forsta, andra] = medOptiSpar(lass, [{ maskin: 'S', punkter }]);
    expect(forsta.spar).toEqual([[15, 56.0005]]); // inom 3 h före första lasset
    expect(andra.spar).toEqual([[15.0001, 56.0005], [15.0002, 56.0005], [15.0003, 56.0005]]);
    expect(medOptiSpar(lass, [])[0].spar).toBeNull();
  });
});

describe('tryck på en markering', () => {
  const nu = new Date('2026-10-24T12:00:00Z');
  it('namn, betydelse, den gamla kommentaren och kommentarerna i ordning, fotot', () => {
    const k = markeringKort({ id: 17, type: 'culturemonument', comment: 'Röse vid stenen', photoPath: 'a/b.jpg' }, [
      { yta_nyckel: 'marker:17', text: 'Stolpe lutar', namn: 'Daniel Ek', skapad_at: '2026-10-23T14:20:00Z' },
      { yta_nyckel: 'marker:17', text: 'Kör runt', namn: 'Martin', skapad_at: '2026-10-22T08:00:00Z' },
      { yta_nyckel: 'marker:99', text: 'annan', namn: 'X', skapad_at: '2026-10-22T08:00:00Z' },
    ], nu);
    expect(k.namn).toBe('Kulturlämning');
    expect(k.forklaring.length).toBeGreaterThan(0);
    expect(k.kommentarer.map(c => c.text)).toEqual(['Röse vid stenen', 'Kör runt', 'Stolpe lutar']);
    expect(k.kommentarer[0].forfattare).toBeNull();
    expect(k.kommentarer[2].forfattare).toMatch(/^Daniel/);
    expect(k.foto).toEqual({ photoPath: 'a/b.jpg', photoData: null, photoTs: null });
  });
  it('utan text och foto', () => {
    const k = markeringKort({ id: 1, lineType: 'stonewall' }, [], nu);
    expect(k.namn).toBe('Stenmur');
    expect(k.kommentarer).toEqual([]);
    expect(k.foto).toBeNull();
  });
});

describe('hela trakten under kartan', () => {
  const st: KartStam[] = [{ lat: 56, lng: 15, volym: 700.4, tradslag: 'Gran' }, { lat: 56, lng: 15, volym: 700.5, tradslag: 'Tall' }];
  const l = (m3: number): SkotarLass => ({ maskin: 'S', tidMs: 1, datum: '2026-10-20', m3, app: false, spar: null });
  it('skördat, skotat och kvar', () => {
    expect(traktSiffror(st, [l(650), l(640)])).toEqual({ skordat: '1 401 m³fub'.replace(' ', '\u00a0'), skotat: '1 290 m³fub'.replace(' ', '\u00a0'), kvar: 'ca 111 m³fub' });
  });
  it('inga lass och läsfel', () => {
    expect(traktSiffror(st, []).skotat).toBe('inga lass än');
    expect(traktSiffror(st, null)).toEqual({ skordat: expect.any(String), skotat: null, kvar: null });
  });
});

describe('vidaLinjeFeatures — Vidas kraftledning och basväg', () => {
  it('kraftledning märks kraft, annan linje är basväg; ytor och punkter kommer inte med', () => {
    const ut = vidaLinjeFeatures([
      { type: 'Feature', properties: { _typ: 'linje', FLBESKR: 'Kraftledning 40 kV' }, geometry: { type: 'LineString', coordinates: [[14, 56], [14.1, 56.1]] } },
      { type: 'Feature', properties: { _typ: 'linje', FLBESKR: 'Basväg', _farg: 'rgb(1,2,3)' }, geometry: { type: 'LineString', coordinates: [[14, 56], [14.2, 56.2]] } },
      { type: 'Feature', properties: { _typ: 'linje' }, geometry: { type: 'Polygon', coordinates: [] } },
      { type: 'Feature', properties: { _typ: 'linje' }, geometry: null },
    ]);
    expect(ut.map(f => f.properties)).toEqual([{ kraft: true, farg: null }, { kraft: false, farg: 'rgb(1,2,3)' }]);
  });
});
