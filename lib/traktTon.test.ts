import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FARG } from './design/tokens';
import { NARA_TRAKT_M } from './traktNara';
import { lagerRang } from './lagerOrdning';
import { INGEN_TON, UTANFOR_TON_AVSTAND_M, UTANFOR_TON_FARG, UTANFOR_TON_OPACITET, arNedtonad, byggTonYta, traktPolygoner, tonPolygonerMedEgna, type TonPolygon } from './traktTon';

const fx = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'lib/__fixtures__/skalviken_2026-10-27.json'), 'utf8'));
const SKALVIKEN: TonPolygon = [fx.trakt];

// exakt avstånd (meter) från en punkt till trakten: 0 inne i polygonen (utanför hålen), annars kortaste avståndet till någon kant
const LAT0 = 56.2845, KX = 111320 * Math.cos((LAT0 * Math.PI) / 180), KY = 111320;
const m = (p: number[]): [number, number] => [p[0] * KX, p[1] * KY];
function iRing(p: [number, number], r: number[][]): boolean {
  let inne = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = m(r[i]), b = m(r[j]); if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inne = !inne; }
  return inne;
}
function avstand(p: number[], polys: TonPolygon[]): number {
  const q = m(p); let best = Infinity;
  for (const poly of polys) {
    if (iRing(q, poly[0]) && !poly.slice(1).some((h) => iRing(q, h))) return 0;
    for (const r of poly) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const a = m(r[j]), b = m(r[i]); const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
      const t = l2 ? Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / l2)) : 0;
      best = Math.min(best, Math.hypot(q[0] - (a[0] + t * dx), q[1] - (a[1] + t * dy)));
    }
  }
  return best;
}
const slump = (frö: number) => { let s = frö; return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; };

function kontrollera(polys: TonPolygon[], marg = 5, antal = 4000): { fel: string[]; nedtonade: number } {
  const yta = byggTonYta(polys);
  const alla = polys.flatMap((p) => p.flat());
  const lo = alla.map((p) => p[0]), la = alla.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...lo) - 0.004, Math.max(...lo) + 0.004, Math.min(...la) - 0.003, Math.max(...la) + 0.003];
  const r = slump(7); const fel: string[] = []; let ned = 0;
  for (let i = 0; i < antal; i++) {
    const p = [x0 + r() * (x1 - x0), y0 + r() * (y1 - y0)];
    const d = avstand(p, polys), t = arNedtonad(yta, p[0], p[1]);
    if (t) ned++;
    if (d <= UTANFOR_TON_AVSTAND_M - marg && t) fel.push(`${p} d=${d.toFixed(1)} borde vara orörd`);
    if (d >= UTANFOR_TON_AVSTAND_M + marg && !t) fel.push(`${p} d=${d.toFixed(1)} borde vara nedtonad`);
  }
  return { fel, nedtonade: ned };
}

describe('nedtoningens konstanter', () => {
  it('25 % svart, 50 m från traktgränsen (samma som Fokus på trakten)', () => {
    expect(UTANFOR_TON_OPACITET).toBe(0.25);
    expect(UTANFOR_TON_FARG).toBe(FARG.bg);
    expect(UTANFOR_TON_AVSTAND_M).toBe(NARA_TRAKT_M);
    expect(NARA_TRAKT_M).toBe(50);
  });
});

describe('traktPolygoner', () => {
  it('tar bara Vidas traktdelar (L_TRAKTDEL), Polygon och MultiPolygon', () => {
    const ring = [[15, 56], [15.001, 56], [15.001, 56.001], [15, 56.001], [15, 56]];
    const r = traktPolygoner({ features: [
      { properties: { _lager: 'L_TRAKTDEL' }, geometry: { type: 'Polygon', coordinates: [ring] } },
      { properties: { _lager: 'L_TRAKTDEL' }, geometry: { type: 'MultiPolygon', coordinates: [[ring], [ring]] } },
      { properties: { _lager: 'L_TILLAGGSYTOR' }, geometry: { type: 'Polygon', coordinates: [ring] } },
      { properties: { _lager: 'L_TRAKTDEL' }, geometry: { type: 'LineString', coordinates: ring } },
    ] });
    expect(r).toHaveLength(3);
  });
  it('utan traktgräns: inga polygoner och INGEN nedtoning', () => {
    expect(traktPolygoner(null)).toEqual([]);
    expect(traktPolygoner({ features: [] })).toEqual([]);
    expect(byggTonYta([])).toEqual(INGEN_TON);
    expect(byggTonYta(traktPolygoner({ features: [{ properties: { _lager: 'L_TILLAGGSYTOR' }, geometry: { type: 'Polygon', coordinates: [[[1, 1], [1, 2], [2, 2], [1, 1]]] } }] }))).toEqual(INGEN_TON);
  });
});

describe('tonPolygonerMedEgna — egen traktgräns när Vida saknas', () => {
  const vida: TonPolygon[] = [[[[15, 56], [15.001, 56], [15.001, 56.001], [15, 56]]]];
  const egen = [[15.1, 56.1], [15.101, 56.1], [15.101, 56.101]];
  it('Vidas gräns går före den egna', () => { expect(tonPolygonerMedEgna(vida, [egen])).toBe(vida); });
  it('utan Vida används den egna, och ringen sluts', () => {
    const r = tonPolygonerMedEgna([], [egen]);
    expect(r).toHaveLength(1);
    expect(r[0][0]).toEqual([...egen, egen[0]]);
    expect(byggTonYta(r).features.length).toBe(1);
  });
  it('för korta eller trasiga ringar och ingen gräns alls ger ingen nedtoning', () => {
    expect(tonPolygonerMedEgna([], [[[1, 1], [2, 2]], [[NaN, 1], [1, 1]]])).toEqual([]);
    expect(tonPolygonerMedEgna([], null)).toEqual([]);
  });
});

describe('byggTonYta — Skälviken (riktig traktgräns ur prod)', () => {
  const yta = byggTonYta([SKALVIKEN]);
  it('ett MultiPolygon-lager med slutna ringar', () => {
    expect(yta.features).toHaveLength(1);
    expect(yta.features[0].geometry.type).toBe('MultiPolygon');
    for (const poly of yta.features[0].geometry.coordinates) for (const ring of poly) {
      expect(ring.length).toBeGreaterThanOrEqual(4);
      expect(ring[0]).toEqual(ring[ring.length - 1]);
    }
  });
  it('inne i trakten tonas ingenting ned — och hänsynsytorna (som ligger i/vid trakten) är aldrig nedtonade', () => {
    for (const p of [[15.3775, 56.2844], [15.3795, 56.2838]]) { expect(avstand(p, [SKALVIKEN]), String(p)).toBe(0); expect(arNedtonad(yta, p[0], p[1]), String(p)).toBe(false); }
    for (const h of fx.hansyn as number[][][]) for (const p of h) expect(avstand(p, [SKALVIKEN]) < 45 ? arNedtonad(yta, p[0], p[1]) : false, String(p)).toBe(false);
  });
  it('vid traktgränsen (0, 20, 40 m) är det orörda; från 60 m utåt tonas det ned', () => {
    // utgå från en kant och gå rakt ut ur trakten (västra gränsen)
    const a = fx.trakt[43], b = fx.trakt[44];    // 15.37367,56.2856 → 15.37324,56.2858 (västsidan)
    const mitt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const nx = -(m(b)[1] - m(a)[1]), ny = m(b)[0] - m(a)[0], l = Math.hypot(nx, ny);   // normal i meter
    const ut = (d: number) => { for (const s of [1, -1]) { const p = [mitt[0] + (s * nx / l * d) / KX, mitt[1] + (s * ny / l * d) / KY]; if (avstand(p, [SKALVIKEN]) > 0) return p; } throw new Error('ingen utsida'); };
    for (const d of [2, 20, 40]) { const p = ut(d); expect(arNedtonad(yta, p[0], p[1]), `${d} m`).toBe(false); }
    for (const d of [60, 100, 300]) { const p = ut(d); expect(arNedtonad(yta, p[0], p[1]), `${d} m`).toBe(true); }
  });
  it('långt bort tonas det ned', () => {
    expect(arNedtonad(yta, 15.45, 56.3)).toBe(true);
    expect(arNedtonad(yta, 15.3, 56.25)).toBe(true);
  });
  it('4 000 slumpade punkter: alla som är ≥ 5 m längre än 50 m från trakten är nedtonade, alla som är ≥ 5 m närmare är orörda', () => {
    const r = kontrollera([SKALVIKEN]);
    expect(r.fel.slice(0, 5)).toEqual([]);
    expect(r.nedtonade).toBeGreaterThan(500);   // provet har tänder: det finns mycket utanför
  });
});

describe('byggTonYta — andra former', () => {
  const kv = (lo: number, la: number, b: number, h: number): number[][] => [[lo, la], [lo + b, la], [lo + b, la + h], [lo, la + h], [lo, la]];
  it('flera traktdelar: kanten mellan dem är orörd när de ligger inom 100 m, nedtonad när de ligger längre isär', () => {
    const nara: TonPolygon[] = [[kv(15.37, 56.28, 0.002, 0.001)], [kv(15.3735, 56.28, 0.002, 0.001)]];   // ~25 m glapp
    const r = byggTonYta(nara);
    expect(arNedtonad(r, 15.3721, 56.2805)).toBe(false);   // i glappet
    const langt: TonPolygon[] = [[kv(15.37, 56.28, 0.002, 0.001)], [kv(15.38, 56.28, 0.002, 0.001)]];   // ~450 m glapp
    expect(arNedtonad(byggTonYta(langt), 15.3772, 56.2805)).toBe(true);
    expect(kontrollera(nara, 5, 1500).fel.slice(0, 3)).toEqual([]);
    expect(kontrollera(langt, 5, 1500).fel.slice(0, 3)).toEqual([]);
  });
  it('en trakt med ett stort hål (enklav > 100 m): mitt i hålet tonas ned, vid hålets kant inte', () => {
    const yttre = kv(15.37, 56.28, 0.01, 0.006), hal = kv(15.3735, 56.2825, 0.0035, 0.0012).reverse();   // hål ≈ 215 × 130 m
    const poly: TonPolygon[] = [[yttre, hal]];
    const r = byggTonYta(poly);
    expect(arNedtonad(r, 15.3752, 56.2831)).toBe(true);
    expect(arNedtonad(r, 15.3736, 56.2831)).toBe(false);   // nära hålets kant: inom 50 m
    expect(arNedtonad(r, 15.375, 56.2805)).toBe(false);    // inne i trakten
    expect(kontrollera(poly, 5, 2500).fel.slice(0, 3)).toEqual([]);
  });
  it('en mycket stor trakt (5 km) ger ändå en hanterbar yta', () => {
    const r = byggTonYta([[kv(15.3, 56.2, 0.08, 0.04)]]);
    const punkter = r.features[0].geometry.coordinates.reduce((s, p) => s + p.reduce((q, ring) => q + ring.length, 0), 0);
    expect(punkter).toBeLessThan(5000);
    expect(arNedtonad(r, 15.34, 56.22)).toBe(false);
  });
});

const sida = fs.readFileSync(path.join(process.cwd(), 'app/planering/page.tsx'), 'utf8');
describe('page.tsx — kopplingen', () => {
  it('lagret har nedtoningens färg och opacitet ur lib/traktTon och börjar dolt', () => {
    expect(sida).toMatch(/id: UTANFOR_TON_LAGER, type: 'fill', source: UTANFOR_TON_KALLA, paint: \{ 'fill-color': UTANFOR_TON_FARG, 'fill-opacity': UTANFOR_TON_OPACITET/);
    expect(sida).toMatch(/UTANFOR_TON_LAGER[^\n]*layout: \{ visibility: 'none' \}/);
  });
  it('ytan räknas ur Vidas traktgräns (eller egen gräns) när objektets geometri är läst — annars ingen nedtoning', () => {
    expect(sida).toContain('byggTonYta(tonPolygonerMedEgna(traktPolygoner(traktGeo), egna))');
    expect(sida).toMatch(/traktGeoHamtadFor === valtObjekt\.id\)\) return INGEN_TON/);
  });
  it('lagret syns bara när det finns en yta och Vidas egen fastighetsnedtoning inte redan tonar ned det som ligger utanför (ingen dubbel nedtoning)', () => {
    expect(sida).toMatch(/tonYta\.features\.length > 0 && !fastighetsSyn\.vida \? 'visible' : 'none'/);
  });
  it('står i körvyns KEEP_PREFIX (trakt-) så nedtoningen följer med in i körvyn, skotarläget och maskinläget', () => {
    expect(sida).toMatch(/KEEP_PREFIX = \[[^\]]*'trakt-'/);
    expect('trakt-utanfor-ton').toMatch(/^trakt-/);
  });
  it('ligger precis över bakgrunden och WMS-underlagen och under ALLA ytor, vägar och symboler (lib/lagerOrdning)', () => {
    const ton = lagerRang({ id: 'trakt-utanfor-ton', type: 'fill' });
    expect(ton).toBeGreaterThan(lagerRang({ id: 'satellite-layer', type: 'raster' }));
    expect(ton).toBeGreaterThan(lagerRang({ id: 'wms-layer-sks_markfuktighet', type: 'raster' }));
    for (const id of ['zone-fill', 'trakt-hansyn-fill', 'klart-yta-line', 'trakt-ragang-yta-utanfor']) expect(ton, id).toBeLessThan(lagerRang({ id, type: id.endsWith('line') ? 'line' : 'fill' }));
    for (const id of ['line-mainRoad-base', 'planspar-skordare-line', 'markers-layer']) expect(ton, id).toBeLessThan(lagerRang({ id, type: id === 'markers-layer' ? 'symbol' : 'line' }));
  });
});
