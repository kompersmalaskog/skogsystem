import { describe, it, expect } from 'vitest';
import type { StockRow } from '@/app/api/kalibrering/kontroll/route';
import fs from 'node:fs';
import path from 'node:path';
import { avvikelseTon } from './bedomning';
import { findPlanomraden, stockRadVarde } from './kontroll';
import {
  planPlatser, planSammanfattning, planStockText, stamGeometri, stamPlats, stamPrickar, stamSkala, stamStockRader, stamSvar, stamTon,
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

describe('stamTon — kontrollarkets färg, ingen egen skala', () => {
  it('är avvikelseTon(…, "dia") för varje heltal och halvtal −12…+12', () => {
    for (let v = -12; v <= 12; v += 0.5) expect(stamTon(v)).toBe(avvikelseTon(v, 'dia'));
  });
  it('orange över 4, RÖD över 6, blå under −4, inom ±4 ingen färg', () => {
    expect(stamTon(4)).toBe('ok');
    expect(stamTon(-4)).toBe('ok');
    expect(stamTon(5)).toBe('hi');
    expect(stamTon(6)).toBe('hi');
    expect(stamTon(7)).toBe('hot');
    expect(stamTon(11)).toBe('hot');
    expect(stamTon(-5)).toBe('cold');
    expect(stamTon(-12)).toBe('cold');
  });
  it('källvakt: stam.ts bygger ingen egen tröskel (tol + 2, ±6 …) och hämtar färgen ur bedomning', () => {
    const kalla = fs.readFileSync(path.join(__dirname, 'stam.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(kalla).toMatch(/avvikelseTon\(avvik, 'dia'\)/);
    expect(kalla).not.toMatch(/tol\s*\+\s*\d/);
    expect(kalla).not.toMatch(/'hot'/);
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

describe('stamPrickar', () => {
  const g = stamGeometri(SKALVIKEN);
  it('en prick per mätpunkt där klaven mätt, rot → topp', () => {
    const p = stamPrickar(g, 4);
    expect(p).toHaveLength(21);
    expect(p.map(x => x.posCm)).toEqual([...p.map(x => x.posCm)].sort((a, b) => a - b));
    expect(p.find(x => x.posCm === 200)).toMatchObject({ avvik: 10, ton: 'hot', utanfor: true });
    expect(p.find(x => x.posCm === 300)).toMatchObject({ avvik: 4, ton: 'ok', utanfor: false }); // exakt på bandkanten = inom
  });
  it('utanför bandet: orange, röd och blå efter kontrollarkets regel, inom bandet grå', () => {
    const p = stamPrickar(g, 4);
    expect(p.filter(x => x.utanfor).map(x => x.ton).sort()).toEqual(['cold', 'hi', 'hot', 'hot', 'hot', 'hot', 'hot']);
    expect(p.filter(x => !x.utanfor).every(x => x.ton === 'ok')).toBe(true);
    expect(p.find(x => x.avvik === 6)?.ton).toBe('hi'); // +6 är orange, +7 är röd — som i Kontroll
  });
  it('oklavat ger ingen prick', () => {
    const gg = stamGeometri([stock(1, 500, [200, 0], [[100, 250, null], [200, 240, 0], [300, 230, 228]])]);
    expect(stamPrickar(gg, 4).map(x => x.avvik)).toEqual([2]);
  });
  it('tal bara vid prickar utanför bandet, och inte två ovanpå varandra på samma sida (det största behålls)', () => {
    const rader = (avvik: number[], posCm: number[]) => stamPrickar({
      punkter: avvik.map((a, i) => ({ posCm: posCm[i], maskin: 300 + a, klave: 300, avvik: a })), granserCm: [0, 2000], stockNr: [1], totalCm: 2000,
    }, 4);
    // 0,03 × 2000 = 60 cm: 700 och 740 ligger för nära, 900 går bra
    const p = rader([8, 9, 7, 2], [700, 740, 900, 1200]);
    expect(p.map(x => x.etikett)).toEqual([false, true, true, false]);
    // olika sidor krockar inte
    expect(rader([8, -8], [700, 720]).map(x => x.etikett)).toEqual([true, true]);
  });
});

describe('stamPrickar: tal som ligger nära varandra skjuts isär i sidled', () => {
  const rader = (avvik: number[], posCm: number[]) => stamPrickar({
    punkter: avvik.map((a, i) => ({ posCm: posCm[i], maskin: 300 + a, klave: 300, avvik: a })), granserCm: [0, 2000], stockNr: [1], totalCm: 2000,
  }, 4);
  it('vänstra åt vänster, högra åt höger när två tal på samma sida är närmare än 9 % av stammen', () => {
    // 100 cm = 5 % → nära; 300 cm = 15 % → inte
    expect(rader([8, 7], [700, 800]).map(x => x.ankare)).toEqual(['end', 'start']);
    expect(rader([8, 7], [700, 1000]).map(x => x.ankare)).toEqual(['middle', 'middle']);
  });
  it('tre i rad: mittersta ankras åt höger (och är därmed vänster om nästa)', () => {
    expect(rader([8, 7, 9], [700, 800, 900]).map(x => x.ankare)).toEqual(['end', 'start', 'start']);
  });
  it('olika sidor skjuts inte isär', () => {
    expect(rader([8, -8], [700, 720]).map(x => x.ankare)).toEqual(['middle', 'middle']);
  });
});

describe('stamSkala och planPlatser', () => {
  it('symmetrisk skala: största avvikelsen uppåt till jämnt tal, minst 1,5 × toleransen', () => {
    expect(stamSkala(stamPrickar(stamGeometri(SKALVIKEN), 4), 4)).toBe(12); // +11 → 12
    expect(stamSkala([], 4)).toBe(6);
    expect(stamSkala([], 1)).toBe(4);
  });
  it('planområdenas platser är mitten av varje område', () => {
    expect(planPlatser([{ startCm: 100, endCm: 140, lengthCm: 40, diameterMm: 300 }, { startCm: 250, endCm: 280, lengthCm: 30, diameterMm: 290 }])).toEqual([120, 265]);
    expect(planPlatser([])).toEqual([]);
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
    const rader = stamStockRader(SKALVIKEN);
    expect(rader.map(r => r.titel)).toEqual(['Timmer 6,1 m', 'Timmer 6,1 m', 'Kubb 3,1 m', 'Kubb 3,1 m', 'Massa 3,4 m']);
    expect(rader.some(r => /Vislanda|_V3|Alvesta/.test(r.titel + r.under))).toBe(false);
    expect(rader.map(r => r.under)).toEqual(['Stock 1 · 0,0–6,1 m', 'Stock 2 · 6,1–12,2 m', 'Stock 3 · 12,2–15,3 m', 'Stock 4 · 15,3–18,4 m', 'Stock 5 · 18,4–21,8 m']);
  });
  it('avvikelsen är den största över mätpunkter och topp, med tecken, och tonen är kontrollarkets (röd över 6)', () => {
    const rader = stamStockRader(SKALVIKEN);
    expect(rader.map(r => r.avvikText)).toEqual(['+10', '-5', '+6', '+11', '+8']);
    expect(rader.map(r => r.ton)).toEqual(['hot', 'cold', 'hi', 'hot', 'hot']);
    // exakt samma värde som Kontroll visar för stocken
    expect(rader.map(r => r.ton)).toEqual(SKALVIKEN.map(s => stockRadVarde(s).sDiaTon));
  });
  it('saknat sortiment och oklavad stock', () => {
    const [r] = stamStockRader([stock(1, 500, [200, null], [[100, 250, null]], { sortiment_grupp: null, operator_toppdia_mm: null, dia_avvikelse_mm: null })]);
    expect(r.titel).toBe('Okänt sortiment 5,0 m');
    expect(r).toMatchObject({ diaKl: false, avvikText: null, ton: 'ok' });
  });
});
