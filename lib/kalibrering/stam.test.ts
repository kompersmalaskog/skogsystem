import { describe, it, expect } from 'vitest';
import type { StockRow } from '@/app/api/kalibrering/kontroll/route';
import { findPlanomraden } from './kontroll';
import {
  klaveBitar, planSammanfattning, planStockText, stamEtiketter, stamFalt, stamGeometri, stamPlats, stamStockRader, stamSvar, stamTon,
  type StamPunkt,
} from './stam';

type Mp = [number, number | null, number | null];
const stock = (nr: number, langd: number, topp: [number | null, number | null], mp: Mp[], o: Partial<StockRow> = {}): StockRow => ({
  id: 100 + nr, stam_nummer: 1, stock_nummer: nr, sortiment_namn: 'Vislanda_195_1-2_V3', sortiment_grupp: 'Timmer', sortiment_kod: null,
  maskin_langd_cm: langd, operator_langd_cm: langd, langd_avvikelse_cm: 0, maskin_toppdia_mm: topp[0], operator_toppdia_mm: topp[1],
  dia_avvikelse_mm: topp[0] != null && topp[1] ? topp[0] - topp[1] : null,
  matpunkter: mp.map(([p, m, op]) => ({ position_cm: p, diameter_maskin_mm: m, diameter_operator_mm: op, klave_first_mm: null, klave_second_mm: null })),
  ...o,
} as unknown as StockRow);

// Skälviken RP J-Hus, Giant 2026-10-21, stam 1: fem stockar, 21,8 m (riktig kontroll ur prod).
const SKALVIKEN: StockRow[] = [
  stock(1, 610, [296, 294], [[200, 331, 321], [300, 319, 315], [400, 311, 304], [500, 302, 294]]),
  stock(2, 610, [237, 234], [[100, 283, 285], [200, 279, 279], [300, 268, 272], [400, 260, 261], [500, 247, 252]]),
  stock(3, 308, [203, 203], [[100, 227, 223], [200, 218, 212]], { sortiment_grupp: 'Kubb', sortiment_namn: 'Alvesta305_V3' }),
  stock(4, 310, [153, 142], [[100, 184, 182], [200, 173, 169]], { sortiment_grupp: 'Kubb', sortiment_namn: 'Alvesta305_V3' }),
  stock(5, 341, [79, 77], [[100, 126, 128], [200, 106, 108], [300, 86, 78]], { sortiment_grupp: 'Massa', sortiment_namn: 'BmavFall_V3' }),
];

describe('stamGeometri', () => {
  it('lägger stockarna rot → topp och mätpunkterna på stammen', () => {
    const g = stamGeometri(SKALVIKEN);
    expect(g.totalCm).toBe(2179);
    expect(g.granserCm).toEqual([0, 610, 1220, 1528, 1838, 2179]);
    expect(g.stockNr).toEqual([1, 2, 3, 4, 5]);
    // stock 2:s första mätpunkt (100 cm in) ligger 610 + 100 på stammen
    expect(g.punkter.find(p => p.posCm === 710)).toMatchObject({ maskin: 283, klave: 285, avvik: -2 });
    // toppen vid kapsnittet är med, en per stock
    expect(g.punkter.find(p => p.posCm === 610)).toMatchObject({ maskin: 296, klave: 294, avvik: 2 });
    expect(g.punkter.map(p => p.posCm)).toEqual([...g.punkter.map(p => p.posCm)].sort((a, b) => a - b));
    expect(g.punkter).toHaveLength(21);
  });
  it('sorterar stockarna på nummer även om de kommer i fel ordning', () => {
    const g = stamGeometri([...SKALVIKEN].reverse());
    expect(g.granserCm).toEqual([0, 610, 1220, 1528, 1838, 2179]);
  });
  it('oklavat (NULL/0) har ingen avvikelse — inte noll', () => {
    const g = stamGeometri([stock(1, 500, [200, 0], [[100, 250, null], [200, 240, 0], [300, 230, 228]])]);
    expect(g.punkter.map(p => p.avvik)).toEqual([null, null, 2, null]);
    expect(g.punkter.map(p => p.klave)).toEqual([null, null, 228, null]);
  });
});

describe('stamTon', () => {
  it('färg bara utanför toleransen, och bara riktningen: orange = grövre, blå = klentare', () => {
    expect(stamTon(4, 4)).toBe('ok');
    expect(stamTon(-4, 4)).toBe('ok');
    expect(stamTon(5, 4)).toBe('hi');
    expect(stamTon(11, 4)).toBe('hi'); // aldrig röd här — talet säger hur mycket
    expect(stamTon(-5, 4)).toBe('cold');
    expect(stamTon(3, 2)).toBe('hi'); // tolerans ur kravprofilen, inte hårdkodad 4
  });
});

describe('stamSvar', () => {
  const punkter = (avvik: (number | null)[]): ReturnType<typeof stamGeometri> => ({
    punkter: avvik.map((a, i) => ({ posCm: (i + 1) * 100, maskin: 300 + (a ?? 0), klave: a == null ? null : 300, avvik: a })),
    granserCm: [0, avvik.length * 100], stockNr: [1], totalCm: avvik.length * 100,
  });
  it('Skälviken: grovt på en del av stammen, med talen bakom', () => {
    const s = stamSvar(stamGeometri(SKALVIKEN), 4);
    expect(s).toMatchObject({ n: 21, ut: 7, grova: 6, klena: 1 });
    expect(s.rubrik).toBe('Maskinen mäter grovt på en del av stammen');
    expect(s.tal).toBe('7 av 21 mätpunkter ligger utanför ±4 mm (6 för grovt, 1 för klent).');
  });
  it('nästan hela stammen när minst tre av fyra punkter är för grova', () => {
    expect(stamSvar(punkter([6, 7, 8, 9, 5, 6, 7, 2]), 4).rubrik).toBe('Maskinen mäter grovt längs nästan hela stammen');
    expect(stamSvar(punkter([-6, -7, -8, -9, -5, -6, -7, -2]), 4).rubrik).toBe('Maskinen mäter klent längs nästan hela stammen');
  });
  it('en stor del vid 40–74 %', () => {
    expect(stamSvar(punkter([6, 7, 8, 0, 1, 0]), 4).rubrik).toBe('Maskinen mäter grovt på en stor del av stammen');
  });
  it('en enda punkt säger var den ligger', () => {
    expect(stamSvar(punkter([0, 0, 0, 0, 0, 0, 0, 0, 0, 9]), 4).rubrik).toBe('Maskinen mäter grovt i en enda mätpunkt, i toppen');
    expect(stamSvar(punkter([9, 0, 0, 0, 0, 0, 0, 0, 0, 0]), 4).rubrik).toBe('Maskinen mäter grovt i en enda mätpunkt, i rotändan');
  });
  it('åt båda hållen med mer än en enstaka punkt: ojämnt', () => {
    expect(stamSvar(punkter([6, 7, -6, -7, 0, 0]), 4).rubrik).toBe('Maskinen mäter ojämnt — än grovt, än klent');
    expect(stamSvar(punkter([6, -6, 0, 0, 0, 0]), 4).rubrik).toBe('Maskinen mäter ojämnt — än grovt, än klent');
  });
  it('inom toleransen hela vägen', () => {
    const s = stamSvar(punkter([1, -2, 0, 3, -4, 4]), 4);
    expect(s.rubrik).toBe('Maskinen mäter rätt längs hela stammen');
    expect(s.tal).toBe('Alla 6 mätpunkter ligger inom ±4 mm.');
  });
  it('utan klavmått säger den det — ingen "rätt"', () => {
    const s = stamSvar(punkter([null, null, null]), 4);
    expect(s.rubrik).toBe('Klaven mätte inte den här stammen');
    expect(s.tal).toBeNull();
    expect(stamSvar(punkter([]), 4).n).toBe(0);
  });
  it('toleransen kommer ur kravprofilen', () => {
    expect(stamSvar(punkter([3, 3, 3, 3]), 2).rubrik).toBe('Maskinen mäter grovt längs nästan hela stammen');
    expect(stamSvar(punkter([3, 3, 3, 3]), 4).rubrik).toBe('Maskinen mäter rätt längs hela stammen');
  });
});

describe('stamFalt', () => {
  const p = (posCm: number, maskin: number, klave: number | null): StamPunkt => ({ posCm, maskin, klave, avvik: klave == null ? null : maskin - klave });
  it('en bit med en ton när skillnaden håller sig på samma sida', () => {
    const f = stamFalt([p(0, 310, 300), p(100, 309, 300)], 4);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ x0: 0, x1: 100, ton: 'hi' });
  });
  it('delas där skillnaden går över toleransen och över noll, och bitarna sluter tätt', () => {
    // skillnad 0 → +8 → −8 över tre punkter, tol 4
    const f = stamFalt([p(0, 300, 300), p(100, 308, 300), p(200, 292, 300)], 4);
    expect(f.map(b => b.ton)).toEqual(['ok', 'hi', 'hi', 'ok', 'ok', 'cold']);
    for (let i = 0; i + 1 < f.length; i++) expect(f[i].x1).toBeCloseTo(f[i + 1].x0, 9);
    expect(f[0].x0).toBe(0);
    expect(f[f.length - 1].x1).toBe(200);
    // alla bitar ligger på ena sidan av klavens linje
    for (const b of f) expect((b.m0 - b.k0) * (b.m1 - b.k1)).toBeGreaterThanOrEqual(-1e-9);
  });
  it('inom toleransen är fältet neutralt (ok)', () => {
    expect(stamFalt([p(0, 302, 300), p(100, 298, 300)], 4).every(b => b.ton === 'ok')).toBe(true);
  });
  it('ritar inget över en lucka i klavens mått', () => {
    expect(stamFalt([p(0, 310, 300), p(100, 305, null), p(200, 300, 295)], 4)).toEqual([]);
  });
});

describe('klaveBitar', () => {
  it('bryter klavens linje vid en lucka', () => {
    const g = stamGeometri([stock(1, 500, [200, 198], [[100, 250, 249], [200, 240, null], [300, 230, 228]])]);
    const bitar = klaveBitar(g.punkter);
    expect(bitar.map(b => b.map(x => x.posCm))).toEqual([[100], [300, 500]]);
  });
});

describe('stamEtiketter', () => {
  it('ett tal per sammanhängande stycke utanför toleransen — det största', () => {
    const e = stamEtiketter(stamGeometri(SKALVIKEN).punkter, 4);
    // stycket 200–500 på stock 1 (+10, +7, +8) ger ETT tal, +10
    expect(e[0]).toMatchObject({ posCm: 200, avvik: 10, ton: 'hi' });
    expect(e.filter(x => x.ton === 'cold')).toHaveLength(1);
    expect(e.every(x => Math.abs(x.avvik) > 4)).toBe(true);
  });
  it('högst `max` tal, de största behålls', () => {
    const g = stamGeometri(SKALVIKEN);
    const e = stamEtiketter(g.punkter, 4, 2);
    expect(e).toHaveLength(2);
    expect(Math.min(...e.map(x => Math.abs(x.avvik)))).toBeGreaterThanOrEqual(10);
  });
});

describe('planområden i vardagsord', () => {
  const plan = (startCm: number, endCm: number) => ({ startCm, endCm, lengthCm: endCm - startCm, diameterMm: 300 });
  it('mest i rotändan när hälften eller fler ligger där', () => {
    expect(planSammanfattning([plan(0, 40), plan(100, 140), plan(300, 340), plan(1000, 1040), plan(2000, 2040)], true, 2100)).toBe('Fastnade på 5 ställen, mest i rotändan.');
  });
  it('mest i toppen och mest mitt på stammen', () => {
    expect(planSammanfattning([plan(1900, 1940), plan(2000, 2040), plan(100, 140)], true, 2100)).toBe('Fastnade på 3 ställen, mest i toppen.');
    expect(planSammanfattning([plan(800, 840), plan(1000, 1040), plan(100, 140)], true, 2100)).toBe('Fastnade på 3 ställen, mest mitt på stammen.');
  });
  it('jämnt fördelat sägs som det är', () => {
    expect(planSammanfattning([plan(0, 40), plan(1000, 1040), plan(2000, 2040)], true, 2100)).toBe('Fastnade på 3 ställen, utspridda längs stammen.');
    expect(planSammanfattning([plan(0, 40), plan(100, 140), plan(1000, 1040), plan(1100, 1140)], true, 2100)).toBe('Fastnade på 4 ställen, utspridda längs stammen.');
  });
  it('ett enda ställe', () => {
    expect(planSammanfattning([plan(1900, 1940)], true, 2100)).toBe('Fastnade på ett ställe, i toppen.');
  });
  it('inga planområden men en profil: säger det. Ingen profil: tiger.', () => {
    expect(planSammanfattning([], true, 2100)).toBe('Mätningen fastnade ingenstans.');
    expect(planSammanfattning([], false, 2100)).toBeNull();
  });
  it('stamPlats delar stammen i tredjedelar', () => {
    expect(stamPlats(0, 900)).toBe('rot');
    expect(stamPlats(450, 900)).toBe('mitt');
    expect(stamPlats(899, 900)).toBe('topp');
  });
  it('stamPlats och sammanfattning på Skälvikens riktiga profil räknar samma planområden som tabellen', () => {
    const prof = [{ position_cm: 0, diameter_mm: 400 }, { position_cm: 10, diameter_mm: 390 }, { position_cm: 20, diameter_mm: 392 }, { position_cm: 30, diameter_mm: 392 }, { position_cm: 40, diameter_mm: 395 }, { position_cm: 50, diameter_mm: 380 }];
    const planer = findPlanomraden(prof);
    expect(planer).toEqual([{ startCm: 10, endCm: 40, lengthCm: 30, diameterMm: 390 }]);
    expect(planSammanfattning(planer, true, 2179)).toBe('Fastnade på ett ställe, i rotändan.');
  });
  it('vilka stockar ett planområde ligger på', () => {
    const g = stamGeometri(SKALVIKEN);
    expect(planStockText(plan(100, 160), g)).toBe('Stock 1');
    expect(planStockText(plan(580, 700), g)).toBe('Stock 1–2');
    expect(planStockText(plan(1230, 1300), g)).toBe('Stock 3');
  });
});

describe('stamStockRader', () => {
  it('sortimentgruppen och längden i klartext — aldrig maskinkoden', () => {
    const rader = stamStockRader(SKALVIKEN, 4);
    expect(rader.map(r => r.titel)).toEqual(['Timmer 6,1 m', 'Timmer 6,1 m', 'Kubb 3,1 m', 'Kubb 3,1 m', 'Massa 3,4 m']);
    expect(rader.some(r => /Vislanda|_V3|Alvesta/.test(r.titel + r.under))).toBe(false);
    expect(rader.map(r => r.under)).toEqual(['Stock 1 · 0,0–6,1 m', 'Stock 2 · 6,1–12,2 m', 'Stock 3 · 12,2–15,3 m', 'Stock 4 · 15,3–18,4 m', 'Stock 5 · 18,4–21,8 m']);
  });
  it('avvikelsen är den största över mätpunkter och topp, med tecken, och tonen följer toleransen', () => {
    const rader = stamStockRader(SKALVIKEN, 4);
    expect(rader.map(r => r.avvikText)).toEqual(['+10', '-5', '+6', '+11', '+8']);
    expect(rader.map(r => r.ton)).toEqual(['hi', 'cold', 'hi', 'hi', 'hi']);
  });
  it('saknat sortiment och oklavad stock', () => {
    const [r] = stamStockRader([stock(1, 500, [200, null], [[100, 250, null]], { sortiment_grupp: null, operator_toppdia_mm: null, dia_avvikelse_mm: null })], 4);
    expect(r.titel).toBe('Okänt sortiment 5,0 m');
    expect(r).toMatchObject({ diaKl: false, avvikText: null, ton: 'ok' });
  });
});
