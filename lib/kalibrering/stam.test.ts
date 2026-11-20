import { describe, it, expect } from 'vitest';
import type { StockRow } from '@/app/api/kalibrering/kontroll/route';
import fs from 'node:fs';
import path from 'node:path';
import { avvikelseTon } from './bedomning';
import { findGreppSlapp } from './grepp';
import { stockRadVarde } from './kontroll';
import {
  gavFel, greppRad, greppRubrik, greppStockText, klavePunkter, stamGeometri, stamPlats, stamPrickar, stamSkala, stamStockRader, stamSvar, stamTon,
} from './stam';
import { SKALVIKEN, stock } from './stam.fixtur';
import skalvikenProfil from './__fixtures__/skalviken_stam1_profil.json';

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

describe('stamSkala', () => {
  it('symmetrisk skala: största avvikelsen uppåt till jämnt tal, minst 1,5 × toleransen', () => {
    expect(stamSkala(stamPrickar(stamGeometri(SKALVIKEN), 4), 4)).toBe(12); // +11 → 12
    expect(stamSkala([], 4)).toBe(6);
    expect(stamSkala([], 1)).toBe(4);
  });
});

describe('där greppet släppte, i vardagsord', () => {
  const grepp = (startCm: number, endCm: number, felMm: number | null = 5) => ({ startCm, endCm, lengthCm: endCm - startCm, felMm, glipa: [] });
  it('rubriken räknar alla ställen och hur många som gav fel över toleransen', () => {
    expect(greppRubrik([grepp(0, 40, 5), grepp(100, 140, 2), grepp(300, 340, -6)], true, 4)).toBe('Greppet släppte på 3 ställen, 2 gav fel över 4 mm.');
    expect(greppRubrik([grepp(0, 40, 1), grepp(100, 140, -3)], true, 4)).toBe('Greppet släppte på 2 ställen, inget gav fel över 4 mm.');
  });
  it('ett enda ställe', () => {
    expect(greppRubrik([grepp(1900, 1940, 7)], true, 4)).toBe('Greppet släppte på ett ställe, det gav fel över 4 mm.');
    expect(greppRubrik([grepp(1900, 1940, 1)], true, 4)).toBe('Greppet släppte på ett ställe, inget gav fel över 4 mm.');
  });
  it('felet räknas avrundat, som det visas: 4,4 visas +4 och är inte över 4', () => {
    expect(gavFel(4.4, 4)).toBe(false);
    expect(gavFel(4.6, 4)).toBe(true);
    expect(gavFel(-4.6, 4)).toBe(true);
    expect(gavFel(null, 4)).toBe(false);
  });
  it('ingen klave att mäta felet mot: räknar ställena men påstår inget om felet', () => {
    expect(greppRubrik([grepp(0, 40, null), grepp(100, 140, null)], true, 4)).toBe('Greppet släppte på 2 ställen.');
  });
  it('inga ställen men en profil: säger det. Ingen profil: tiger.', () => {
    expect(greppRubrik([], true, 4)).toBe('Greppet släppte ingenstans.');
    expect(greppRubrik([], false, 4)).toBeNull();
  });
  it('stamPlats delar stammen i tredjedelar', () => {
    expect(stamPlats(0, 900)).toBe('rot');
    expect(stamPlats(450, 900)).toBe('mitt');
    expect(stamPlats(899, 900)).toBe('topp');
  });
  it('vilka stockar ett ställe ligger på', () => {
    const g = stamGeometri(SKALVIKEN);
    expect(greppStockText(grepp(100, 160), g)).toBe('stock 1');
    expect(greppStockText(grepp(580, 700), g)).toBe('stock 1–2');
    expect(greppStockText(grepp(1230, 1300), g)).toBe('stock 3');
  });
  it('Skälviken: "Greppet släppte på 8 ställen, 3 gav fel över 4 mm" och raderna bakom', () => {
    const g = stamGeometri(SKALVIKEN);
    const stallen = findGreppSlapp(skalvikenProfil.stem_diameter_profile, klavePunkter(g));
    expect(greppRubrik(stallen, true, 4)).toBe('Greppet släppte på 8 ställen, 3 gav fel över 4 mm.');
    const rader = stallen.map(p => greppRad(p, g));
    // var på stammen och hur mycket fel det gav — längden bara när den är längre än minsta som räknas (30 cm)
    expect(rader[0]).toEqual({ titel: '2,5–2,8 m · stock 1', langd: null, fel: '+5 mm', ton: 'hi' });
    expect(rader[1]).toEqual({ titel: '4,8–5,3 m · stock 1', langd: '50 cm lång', fel: '+8 mm', ton: 'hot' });
    expect(rader[2]).toMatchObject({ titel: '5,6–5,9 m · stock 1', fel: '+2 mm', ton: 'ok' });
    expect(rader[3]).toMatchObject({ titel: '9,2–9,5 m · stock 2', fel: '-2 mm', ton: 'ok' });
    expect(rader.filter(r => r.langd).length).toBe(1);
  });
  it('felet har kontrollarkets färg: orange över +4, röd över +6, blå under −4, annars ingen', () => {
    const g = stamGeometri(SKALVIKEN);
    const ton = (felMm: number) => greppRad(grepp(100, 160, felMm), g).ton;
    expect(ton(4.4)).toBe('ok'); // visas som +4: inom ±4
    expect(ton(5)).toBe('hi');
    expect(ton(7)).toBe('hot');
    expect(ton(-5)).toBe('cold');
    expect(ton(-3)).toBe('ok');
  });
  it('utan klave: ingen färg och inget tal ("ej klavad")', () => {
    expect(greppRad(grepp(100, 160, null), stamGeometri(SKALVIKEN))).toMatchObject({ fel: null, ton: 'ok' });
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
