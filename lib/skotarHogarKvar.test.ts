import { describe, expect, it } from 'vitest';
import { hogarKvar, hogGrupp, hogPrickar, hogSortimentNyckel, kvarFor, stoppILass, HOG_PRICK_FARG, KRAN_M, FULL_STYRKA, REST_STYRKA } from './skotarHogarKvar';
import type { Lass, SparPunkt } from './skotarLass/typer';

// Ett lokalt plan runt Skälviken: meter → lat/lng.
const LAT0 = 56.62, LNG0 = 15.48;
const KX = 111_320 * Math.cos((LAT0 * Math.PI) / 180);
const P = (x: number, y: number) => ({ lat: LAT0 + y / 111_320, lng: LNG0 + x / KX });
const T0 = Date.parse('2026-10-26T08:00:00Z');
/** Spår: [x, y, sekunder efter T0]. */
const spar = (pkt: [number, number, number][]): SparPunkt[] => pkt.map(([x, y, s]) => ({ ...P(x, y), tid: new Date(T0 + s * 1000).toISOString() }));

const lass = (o: Partial<Lass> & { rader: [string, number][]; sparPunkter: SparPunkt[]; loss?: [number, number]; lossS?: number }): Lass => {
  const lp = P(...(o.loss ?? [400, 0]));
  return {
    id: Math.random().toString(36), objektId: 'o', voNummer: null, maskinId: 'A130743', medarbetareId: null, lassNummer: 1, datum: '2026-10-26',
    status: 'bekraftat', bekraftadAv: 'forare', bekraftadTid: null, vagar: [], skapad: '', andrad: '',
    ...o,
    delar: [{ delNr: 1, avlaggId: 'vida:1', avlaggNummer: '1', lossadTid: new Date(T0 + (o.lossS ?? 3600) * 1000).toISOString(), lat: lp.lat, lng: lp.lng,
      rader: o.rader.map(([namn, m3]) => ({ nyckel: hogSortimentNyckel(namn), namn, m3 })) }],
  } as Lass;
};

const TIMMER = 'Gran Timmer: Vislanda_195_1-2_V3';
const ENERGI = 'Gran Energi: Engved3mGran_V3';
const MASSA = 'Gran Massa: BmavFall_V3';

describe('sortiment', () => {
  it('trädslaget före sortimentet tas bort så nyckeln blir lassets', () => {
    expect(hogSortimentNyckel(TIMMER)).toBe('timmer: vislanda_195_1-2_v3');
    expect(hogSortimentNyckel('Timmer: Vislanda_195_1-2_V3')).toBe('timmer: vislanda_195_1-2_v3');
    expect(hogSortimentNyckel('Övr_löv Massa: HemvedFall_V3')).toBe('ved_markagare');
  });
  it('gruppen ur namnet', () => {
    expect(hogGrupp(TIMMER)).toBe('timmer');
    expect(hogGrupp(ENERGI)).toBe('energi');
    expect(hogGrupp(MASSA)).toBe('massa');
    expect(hogGrupp('Tall Kubb: Alvesta_305')).toBe('kubb');
    expect(hogGrupp('Avkap Gran/Tall V3')).toBe('energi');
  });
});

describe('stopp i spåret', () => {
  it('räknar bara stopp: inte körning, inte rast, inte vid avlägget', () => {
    const l = lass({ rader: [], sparPunkter: spar([
      [0, 0, 0], [1, 0, 60],        // stopp 60 s
      [100, 0, 90],                 // körning 99 m på 30 s
      [100, 0, 1000],               // rast 910 s
      [390, 0, 1100], [390, 0, 1200], // vid avlägget (400, 0)
      [0, 0, 1210],
    ]) });
    const s = stoppILass(l);
    expect(s).toHaveLength(1);
    expect(s[0].vikt).toBe(60);
  });
});

describe('hogarKvar', () => {
  const hogA = { ...P(5, 0), sortimentVolym: { [TIMMER]: 4, [ENERGI]: 3 } };
  const hogB = { ...P(12, 0), sortimentVolym: { [TIMMER]: 3 } };
  const hogC = { ...P(80, 0), sortimentVolym: { [TIMMER]: 6 } };
  const stoppVidNoll = spar([[0, 0, 0], [0.5, 0, 100], [200, 0, 160]]);

  it('lasset tar sitt sortiment ur närmaste högarna där maskinen stod; energi ligger kvar', () => {
    const k = hogarKvar([hogA, hogB, hogC], [lass({ rader: [['Timmer: Vislanda_195_1-2_V3', 5]], sparPunkter: stoppVidNoll })]);
    expect(k[0].kvar[TIMMER]).toBe(0);
    expect(k[0].kvar[ENERGI]).toBe(3);
    expect(k[1].kvar[TIMMER]).toBe(2);
    expect(k[2].kvar[TIMMER]).toBe(6); // 80 m bort: kranen når inte
    expect(k[0].andel).toBeCloseTo(3 / 7);
  });

  it('samma grupp när namnet inte stämmer exakt', () => {
    const k = hogarKvar([hogA], [lass({ rader: [['Timmer: Urshult 1-2_V3', 2]], sparPunkter: stoppVidNoll })]);
    expect(k[0].kvar[TIMMER]).toBe(2);
  });

  it('tar aldrig mer än som ligger där, och aldrig annat sortiment', () => {
    const k = hogarKvar([hogA], [lass({ rader: [['Massa: BmavFall_V3', 20]], sparPunkter: stoppVidNoll })]);
    expect(k[0].kvar).toEqual(hogA.sortimentVolym);
  });

  it('bara lass som räknas: struket, obesvarat och automatiskt rör inget', () => {
    const r: [string, number][] = [['Timmer: Vislanda_195_1-2_V3', 5]];
    const k = hogarKvar([hogA], [
      lass({ rader: r, sparPunkter: stoppVidNoll, status: 'struket' }),
      lass({ rader: r, sparPunkter: stoppVidNoll, status: 'vantar_forare' }),
      lass({ rader: r, sparPunkter: stoppVidNoll, bekraftadAv: 'auto' }),
    ]);
    expect(k[0].kvar[TIMMER]).toBe(4);
  });

  it('lass utan spår placeras inte', () => {
    const k = hogarKvar([hogA], [lass({ rader: [['Timmer: Vislanda_195_1-2_V3', 5]], sparPunkter: [] })]);
    expect(k[0].kvar[TIMMER]).toBe(4);
  });

  it('kranens räckvidd är gränsen', () => {
    const utanfor = { ...P(KRAN_M + 1, 0), sortimentVolym: { [TIMMER]: 4 } };
    const k = hogarKvar([utanfor], [lass({ rader: [['Timmer: Vislanda_195_1-2_V3', 5]], sparPunkter: stoppVidNoll })]);
    expect(k[0].kvar[TIMMER]).toBe(4);
  });

  it('högen där maskinen stod längst töms först', () => {
    const vanster = { ...P(-10, 0), sortimentVolym: { [TIMMER]: 4 } };
    const hoger = { ...P(110, 0), sortimentVolym: { [TIMMER]: 4 } };
    const l = lass({ rader: [['Timmer: Vislanda_195_1-2_V3', 4]], sparPunkter: spar([[0, 0, 0], [0, 0, 30], [100, 0, 90], [100, 0, 200], [250, 0, 260]]) });
    const k = hogarKvar([vanster, hoger], [l]);
    expect(k[1].kvar[TIMMER]).toBe(0);
    expect(k[0].kvar[TIMMER]).toBe(4);
  });
});

describe('prickarna', () => {
  const f = (x: number, sv: Record<string, number>) => ({ geometry: { coordinates: [P(x, 0).lng, P(x, 0).lat] }, properties: { sortimentVolymJson: JSON.stringify(sv) } });
  const feats = [f(5, { [TIMMER]: 4, [ENERGI]: 3 }), f(80, { [MASSA]: 6 })];
  const l = lass({ rader: [['Timmer: Vislanda_195_1-2_V3', 4]], sparPunkter: spar([[0, 0, 0], [0.5, 0, 100], [200, 0, 160]]) });

  it('alla: det som ligger kvar, neutral färg', () => {
    const p = hogPrickar(feats, [l], 'alla');
    expect(p.map((x) => x.v)).toEqual([3, 6]);
    expect(p.every((x) => x.farg === HOG_PRICK_FARG.alla)).toBe(true);
  });
  it('bara timmer: den tömda högen försvinner', () => {
    expect(hogPrickar(feats, [l], 'timmer')).toEqual([]);
    expect(hogPrickar(feats, [], 'timmer').map((x) => x.v)).toEqual([4]);
  });
  it('bara energi och massa ger egen färg', () => {
    expect(hogPrickar(feats, [l], 'energi').map((x) => [x.v, x.farg])).toEqual([[3, HOG_PRICK_FARG.energi]]);
    expect(hogPrickar(feats, [l], 'massa').map((x) => x.v)).toEqual([6]);
  });
  it('trasig JSON ger ingen hög, inget fel', () => {
    expect(hogPrickar([{ geometry: { coordinates: [1, 2] }, properties: { sortimentVolymJson: '{' } }], [], 'alla')).toEqual([]);
  });
  it('kvarFor alla = totalt', () => {
    expect(kvarFor({ kvar: { [TIMMER]: 1, [ENERGI]: 2 }, totalt: 3, andel: 1 }, 'alla')).toBe(3);
  });
  it('ingen orange (orange betyder tall)', () => {
    for (const c of Object.values(HOG_PRICK_FARG)) expect(c.toLowerCase()).not.toMatch(/^#ff9f0a|^#ff9500/);
  });
  it('en hög där lassen tog huvuddelen är en rest och ritas svagt; orörda högar är fulla, hur små de än är', () => {
    const rester = [f(5, { [TIMMER]: 10, [ENERGI]: 1 }), f(80, { [ENERGI]: 0.3 })];
    const lt = lass({ rader: [['Timmer: Vislanda_195_1-2_V3', 10]], sparPunkter: spar([[0, 0, 0], [0.5, 0, 100], [200, 0, 160]]) });
    const p = hogPrickar(rester, [lt], 'alla');
    expect(p.map((x) => [x.v, x.a])).toEqual([[1, REST_STYRKA], [0.3, FULL_STYRKA]]);
    // Väljer man energi är resten energins hela hög — full styrka, egen färg
    expect(hogPrickar(rester, [lt], 'energi').map((x) => x.a)).toEqual([FULL_STYRKA, FULL_STYRKA]);
  });
  it('lite taget ur en stor hög är ingen rest', () => {
    const lt = lass({ rader: [['Timmer: Vislanda_195_1-2_V3', 2]], sparPunkter: spar([[0, 0, 0], [0.5, 0, 100], [200, 0, 160]]) });
    expect(hogPrickar([f(5, { [TIMMER]: 10 })], [lt], 'alla')[0].a).toBe(FULL_STYRKA);
  });
});
