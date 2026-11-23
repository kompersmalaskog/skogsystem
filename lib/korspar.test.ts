import { describe, expect, it, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import * as spec from '@maplibre/maplibre-gl-style-spec';
import { KORSPAR, rensaHopp, segmentera, jamnaLatt, korsparLinjer, cachadeKorspar, tomKorsparCache, korsparCacheStorlek, langdM, type Koord } from './korspar';
import { hyttsparTillLinjer } from './hyttspar';
import { hyttsparRitadeLinjer } from './sparJamning';
import { kartSpar, meterBredd, meterTillPx, BAND_BREDD_M, BAND_LAT, MITTLINJE_BREDD, MITTLINJE_M } from './sparStil';

// Giants och Elefantens RIKTIGA hyttspår ur prod (fixturerna är deltakodade mikrograder, se _kalla i filerna).
const lasFx = (f: string) => JSON.parse(fs.readFileSync(path.join(process.cwd(), 'lib/__fixtures__', f), 'utf8'));
const dec = (d: any) => { let la = d.la0, lo = d.lo0; return d.deltas.split(' ').map((s: string, i: number) => { const [a, b] = s.split(',').map(Number); la += a; lo += b; return { lat: la / 1e6, lng: lo / 1e6, tid: String(i) }; }); };
const BON = lasFx('korspar_bondeskog_skordare_2026-11-21.json'), EDS = lasFx('korspar_edestad_skordare_2026-11-20.json'), EDK = lasFx('korspar_edestad_skotare_2026-11-19.json'), STG = lasFx('korspar_steglehylte_gallring_skordare_2026-11-04.json');

const M_LAT = 1 / 111_320;
const mLng = (lat: number) => 1 / (111_320 * Math.cos((lat * Math.PI) / 180));
const dist = (a: Koord, b: Koord) => Math.hypot((a[0] - b[0]) / mLng(a[1]), (a[1] - b[1]) / M_LAT);
function narmaste(p: Koord, linjer: Koord[][]): number {
  let best = Infinity; const k = 1 / mLng(p[1]);
  for (const l of linjer) for (let i = 1; i < l.length; i++) {
    const ax = (l[i - 1][0] - p[0]) * k, ay = (l[i - 1][1] - p[1]) / M_LAT, bx = (l[i][0] - p[0]) * k, by = (l[i][1] - p[1]) / M_LAT;
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy; let t = L ? (-ax * dx - ay * dy) / L : 0; t = Math.max(0, Math.min(1, t));
    best = Math.min(best, Math.hypot(ax + dx * t, ay + dy * t));
  }
  return best;
}
/** Andel av råpunkterna som ligger närmare än `m` meter från de ritade linjerna. */
const tackning = (pts: { lat: number; lng: number }[], linjer: Koord[][], m: number) => pts.filter((p) => narmaste([p.lng, p.lat], linjer) <= m).length / pts.length;

describe('rensaHopp — enstaka punkt som hoppar ≥ 10 m och direkt tillbaka tas bort', () => {
  it('ett hopp på 14 m ut och 14 m tillbaka försvinner, en vanlig sväng rörs inte', () => {
    const rak: [number, number][] = [[0, 0], [3, 0], [6, 0], [9, 14], [12, 0], [15, 0], [18, 0]];
    expect(rensaHopp(rak)).toEqual([[0, 0], [3, 0], [6, 0], [12, 0], [15, 0], [18, 0]]);
    const sväng: [number, number][] = [[0, 0], [5, 0], [10, 0], [15, 5], [20, 10], [25, 15]];
    expect(rensaHopp(sväng)).toEqual(sväng);
  });
  it('ett hopp på 300 m och tillbaka tas bort och bryter INTE linjen (oavsett avstånd)', () => {
    const p: [number, number][] = [[0, 0], [3, 0], [6, 300], [9, 0], [12, 0]];
    const ut = rensaHopp(p);
    expect(ut).toEqual([[0, 0], [3, 0], [9, 0], [12, 0]]);
    expect(segmentera(ut)).toHaveLength(1);
  });
  it('ett steg under 10 m räknas inte som hopp (maskinen kan stå och hoppa 7 m mellan två lägen)', () => {
    const p: [number, number][] = [[0, 0], [3, 0], [3, 7], [3, 0], [6, 0]];
    expect(rensaHopp(p)).toEqual(p);
  });
  it('flera hopp längs samma spår försvinner var för sig', () => {
    const p: [number, number][] = [[0, 0], [3, 0], [3, 20], [6, 0], [9, 0], [9, -20], [12, 0], [15, 0]];
    expect(rensaHopp(p)).toEqual([[0, 0], [3, 0], [6, 0], [9, 0], [12, 0], [15, 0]]);
  });
  it('första och sista punkten rörs aldrig, och under tre punkter lämnas oförändrat', () => {
    expect(rensaHopp([[0, 0], [50, 0]])).toEqual([[0, 0], [50, 0]]);
    const p: [number, number][] = [[0, 0], [30, 0], [60, 0]];
    expect(rensaHopp(p)).toEqual(p);
  });
});

describe('segmentera — bryt BARA vid steg > 200 m, aldrig på tid', () => {
  it('201 m delar, 200 m delar inte', () => {
    expect(segmentera([[0, 0], [201, 0], [203, 0]])).toHaveLength(2);
    expect(segmentera([[0, 0], [200, 0], [203, 0]])).toHaveLength(1);
  });
  it('tid ignoreras: en maskin som står still i 40 minuter är samma linje', () => {
    const pts = Array.from({ length: 16 }, (_, i) => ({ lat: 56 + i * 2.5e-5, lng: 15, tid: new Date(Date.UTC(2026, 10, 5, 8, i * 40)).toISOString() }));   // 2,8 m per punkt, 40 min mellan varje
    expect(korsparLinjer(pts)).toHaveLength(1);
  });
});

describe('jamnaLatt — lätt, ändarna kvar och linjen krymper inte', () => {
  it('en rak linje med brus blir rakare, första och sista punkten flyttas aldrig', () => {
    const p: [number, number][] = Array.from({ length: 40 }, (_, i) => [i * 2.5, (i % 2 ? 1.2 : -1.2)]);
    const ut = jamnaLatt(p);
    expect(ut[0]).toEqual(p[0]); expect(ut[ut.length - 1]).toEqual(p[p.length - 1]);
    const maxAvv = Math.max(...ut.slice(2, -2).map((q) => Math.abs(q[1])));
    expect(maxAvv).toBeLessThan(0.7);   // bruset ±1,2 m → under 0,7 m
  });
  it('en rät sträcka ändrar inte längd (speglingen vid ändarna: inget krymper)', () => {
    const p: [number, number][] = Array.from({ length: 30 }, (_, i) => [i * 2.5, 0]);
    const ut = jamnaLatt(p);
    for (let i = 0; i < p.length; i++) { expect(ut[i][0]).toBeCloseTo(p[i][0], 6); expect(ut[i][1]).toBeCloseTo(0, 6); }
  });
});

describe('RIKTIGA spår: Giant på Bondeskog och Edestad, Elefanten på Edestad', () => {
  it.each([
    { namn: 'Bondeskog 5 nov', dag: BON.dagar[0] }, { namn: 'Bondeskog 6 nov', dag: BON.dagar[1] }, { namn: 'Edestad 3 nov', dag: EDS.dagar[1] },
    { namn: 'Edestad 2 nov', dag: EDS.dagar[0] }, { namn: 'Elefanten Edestad 19 nov', dag: EDK.dagar[0] },
  ])('$namn: EN sammanhängande linje, 98 % av råpunkterna inom 2 m, start och slut där maskinen var', ({ dag }) => {
    const pts = dec(dag);
    const linjer = korsparLinjer(pts);
    expect(linjer).toHaveLength(1);   // inga stumpar: stillastående och upparbetning bryter inte
    expect(tackning(pts, linjer, 2)).toBeGreaterThan(0.98);
    expect(linjer[0][0]).toEqual([pts[0].lng, pts[0].lat]);
    expect(linjer[0][linjer[0].length - 1]).toEqual([pts[pts.length - 1].lng, pts[pts.length - 1].lat]);
  });
  it('en GALLRING (Steglehylte, Rottne H8E): samma sak — en sammanhängande linje, nästan alla råpunkter inom 2 m, brytning bara vid verkligt avstånd', () => {
    const pts = dec(STG.dagar[0]);
    const luckor = hyttsparTillLinjer(pts).length;   // rådatans egna brytningar (>200 m) — kedjan får aldrig lägga till fler
    const linjer = korsparLinjer(pts);
    expect(linjer.length).toBeLessThanOrEqual(luckor);
    expect(tackning(pts, linjer, 2)).toBeGreaterThan(0.97);
  });
  it('Bondeskog: dagen är ETT segment i rådatan (ingen tidslucka bryter) — och även efter rensningen', () => {
    for (const d of BON.dagar) { expect(hyttsparTillLinjer(dec(d))).toHaveLength(1); expect(korsparLinjer(dec(d))).toHaveLength(1); }
  });
  it('Edestad 4 nov: Giants flytt hem (en punkt 47 km bort) ritas inte som en egen tråd och förstör inget', () => {
    const pts = dec(EDS.dagar[2]);
    expect(Math.max(...pts.slice(1).map((p: { lat: number; lng: number }, i: number) => dist([p.lng, p.lat], [pts[i].lng, pts[i].lat])))).toBeGreaterThan(40_000);   // hoppet finns i datan
    const linjer = korsparLinjer(pts);
    expect(linjer).toHaveLength(1);   // det korta segmentet efter flytten (2 punkter) är under 8 m... och ritas inte
    expect(tackning(pts.slice(0, -2), linjer, 2)).toBeGreaterThan(0.98);   // allt som kördes på trakten täcks
    expect(langdM(linjer)).toBeLessThan(5_000);
  });
  it('utjämningen är LÄTT: mer än 15 % längre än den gamla kedjan och inte mer än 35 % kortare än rådatans väg (förut −40–47 %)', () => {
    for (const d of [BON.dagar[0], EDS.dagar[1]]) {
      const pts = dec(d);
      const rå = langdM(hyttsparTillLinjer(pts) as Koord[][]), ny = langdM(korsparLinjer(pts)), gammal = langdM(hyttsparRitadeLinjer(pts) as Koord[][]);
      expect(ny / rå).toBeGreaterThan(0.65);
      expect(ny).toBeGreaterThan(gammal * 1.15);
    }
  });
  it('maskindatorn: en hel dag (900 punkter) räknas på under 50 ms — och den andra gången på 0 (cachen)', () => {
    tomKorsparCache();
    const pts = dec(BON.dagar[0]);
    const t0 = performance.now(); cachadeKorspar('t|skordare|2026-11-05', pts); const forsta = performance.now() - t0;
    const t1 = performance.now(); for (let i = 0; i < 1000; i++) cachadeKorspar('t|skordare|2026-11-05', pts); const efter = performance.now() - t1;
    expect(forsta).toBeLessThan(50);
    expect(efter).toBeLessThan(20);   // tusen anrop mot cachen
  });
});

describe('cachadeKorspar — en dag räknas fram EN gång', () => {
  beforeEach(() => tomKorsparCache());
  it('samma nyckel och lika många punkter ger SAMMA linjer (samma identitet), fler punkter räknar om', () => {
    const pts = dec(BON.dagar[0]);
    const a = cachadeKorspar('x|skordare|d', pts), b = cachadeKorspar('x|skordare|d', pts);
    expect(b).toBe(a);
    const c = cachadeKorspar('x|skordare|d', pts.slice(0, -5));
    expect(c).not.toBe(a);
  });
  it('högst 64 dagar sparas', () => {
    const pts = dec(EDS.dagar[0]);
    for (let i = 0; i < 80; i++) cachadeKorspar('n' + i, pts);
    expect(korsparCacheStorlek()).toBe(64);
  });
});

describe('bredd i METER (Martin 2026-11-21): bandet är maskinens bredd inzoomat och smalt utzoomat', () => {
  const utv = (uttryck: any, zoom: number): number => {
    const r = spec.expression.createPropertyExpression(uttryck, { type: 'number', 'property-type': 'data-driven', expression: { interpolated: true, parameters: ['zoom', 'feature'] } } as any);
    if (r.result !== 'success') throw new Error(JSON.stringify((r as any).value));
    return (r.value as any).evaluate({ zoom }, { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] } });
  };
  const metersPerPx = (zoom: number, lat = BAND_LAT) => (78_271.517 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
  it('från zoom 15 följer bandet meter exakt: bredden i px × meter per px = 4 m, vid varje zoom', () => {
    for (const z of [15, 16, 17, 18, 19, 20, 21]) expect(utv(kartSpar('plan').bredd, z) * metersPerPx(z)).toBeCloseTo(BAND_BREDD_M, 1);
  });
  it('bredden fördubblas för varje zoomsteg (verklig skala) och mittlinjen är en femtedel', () => {
    for (const z of [16, 18, 20]) expect(utv(kartSpar('plan').bredd, z + 1) / utv(kartSpar('plan').bredd, z)).toBeCloseTo(2, 2);
    for (const z of [16, 18, 20]) expect(utv(MITTLINJE_BREDD as any, z) * metersPerPx(z)).toBeCloseTo(MITTLINJE_M, 0);   // inom 0,5 m: golvet 0,6 px gäller bara utzoomat, men stoppen avrundar i meter
    expect(MITTLINJE_M / BAND_BREDD_M).toBeCloseTo(0.2, 1);
  });
  it('utzoomat är bandet en smal linje (golv), aldrig noll och aldrig bredare än verkligheten kräver', () => {
    for (const z of [10, 11, 12, 13, 14]) { const px = utv(kartSpar('plan').bredd, z); expect(px).toBeGreaterThanOrEqual(1); expect(px).toBeLessThan(3.1); }
    expect(utv(kartSpar('plan').bredd, 13)).toBeGreaterThan(utv(kartSpar('plan').bredd, 11) - 1e-9);   // växer monotont
  });
  it('meterTillPx stämmer mot MapLibres egen definition (512 px-rutor)', () => {
    expect(meterTillPx(4, 17)).toBeCloseTo(4 / metersPerPx(17), 6);
    expect(meterTillPx(4, 17, 57.5)).toBeGreaterThan(meterTillPx(4, 17, 56));   // längre norrut krymper cos lat → färre meter per px → fler px per meter
  });
  it('kanten är bredare än bandet och mjuk (blur), svagare (opacitet < bandets)', () => {
    const s = kartSpar('plan');
    expect(utv(s.kantBredd, 18)).toBeGreaterThan(utv(s.bredd, 18));
    expect(utv(s.kantSudd, 18)).toBeGreaterThan(0);
    expect(s.kantOpacitet).toBeLessThan(0.9);
  });
});
