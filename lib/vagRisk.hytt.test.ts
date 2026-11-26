// @vitest-environment node
// VÄGVARNINGENS BAND I RIKTIG CHROMIUM + MAPLIBRE (Martin 2026-11-25): vägen markeras med ett BRETT, halvgenomskinligt band — orange före riskbedömning, rött vid hög risk, inget vid låg risk.
// Lagrets målning är den RIKTIGA lib/vagRisk.vagBandPaint (samma som planeringsvyn och maskinvyn lägger på kartan), vägarna är Brokamåla 1:5 väg 538 (OSM ur objekt_vagdata, prod 2026-11-25).
// Pixlarna mäts mot bakgrunden: bandet blandar sin färg med marken (opacitet), är minst ~20 m brett och blir aldrig smalare än 10 px utzoomat — så det aldrig kan förväxlas med traktgränsen.
// Finns ingen Chromium hoppas testet över (utom med KRAV_CHROMIUM=1).
import path from 'node:path';
import { build } from 'esbuild';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { hittaChromium, KARTA_ARGS } from './testStod/chromium';
import vagFixtur from './__fixtures__/brokamala_vag538_2026-11-25.json';

const CHROMIUM = hittaChromium(KARTA_ARGS);
const MAPLIBRE = path.join(process.cwd(), 'node_modules/maplibre-gl/dist');
const ORIGIN = 'https://vagband.invalid';
const BG: [number, number, number] = [61, 74, 44];   // #3d4a2c
const ORANGE: [number, number, number] = [255, 159, 10];
const ROD: [number, number, number] = [255, 69, 58];
const blanda = (f: number[], o: number) => f.map((c, i) => c * o + BG[i] * (1 - o));

async function bunta(): Promise<string> {
  const r = await build({ stdin: { contents: `import * as V from './lib/vagRisk'; window.VAG = V;`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, format: 'iife', platform: 'browser', logLevel: 'silent' });
  return r.outputFiles[0].text;
}
async function oppna(b: any, lib: string) {
  const ctx = await b.newContext({ viewport: { width: 700, height: 700 } });
  const pg = await ctx.newPage();
  await pg.route(`${ORIGIN}/**`, (rt: any) => rt.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><head><meta charset="utf-8"><style>html,body,#m{margin:0;height:100%}</style></head><body><div id="m"></div></body></html>' }));
  await pg.goto(`${ORIGIN}/`);
  await pg.addStyleTag({ path: path.join(MAPLIBRE, 'maplibre-gl.css') });
  await pg.addScriptTag({ path: path.join(MAPLIBRE, 'maplibre-gl.js') });
  await pg.addScriptTag({ content: lib });
  return pg;
}
/** Kartan med bandet för vägen i ett visst läge. `lage` = 'obedomd' | 'hog' | 'lag' (lag ger inga band-features alls). Returnerar vägens mittpunkt i pixlar. */
async function bygg(pg: any, lage: string, zoom: number) {
  return pg.evaluate(async (arg: any) => {
    const W = window as any; const V = W.VAG;
    const el = document.getElementById('m')!; el.innerHTML = '';
    const v0 = arg.vagar[0].geometri; const mid = v0[Math.floor(v0.length / 2)];
    const map = new W.maplibregl.Map({ container: 'm', center: [mid.lon, mid.lat], zoom: arg.zoom, fadeDuration: 0, preserveDrawingBuffer: true, attributionControl: false,
      style: { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#3d4a2c' } }] } });
    await new Promise((r) => map.on('load', r));
    const features = arg.lage === 'lag' ? [] : arg.vagar.map((vg: any) => ({ type: 'Feature', properties: { risk: arg.lage }, geometry: { type: 'LineString', coordinates: vg.geometri.map((p: any) => [p.lon, p.lat]) } }));
    map.addSource(V.VAG_BAND_KALLA, { type: 'geojson', data: { type: 'FeatureCollection', features } });
    map.addLayer({ id: V.VAG_BAND_LAGER, type: 'line', source: V.VAG_BAND_KALLA, paint: V.vagBandPaint(), layout: { 'line-cap': 'round', 'line-join': 'round' } });
    await new Promise((r) => { map.once('idle', r); map.triggerRepaint(); });
    const p = map.project([mid.lon, mid.lat]);
    // vägens riktning i pixlar vid mittpunkten (till nästa nod) → normalen
    const i = Math.floor(v0.length / 2); const a = map.project([v0[i - 1].lon, v0[i - 1].lat]); const b = map.project([v0[i + 1].lon, v0[i + 1].lat]);
    const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy);
    return { x: p.x, y: p.y, nx: -dy / l, ny: dx / l, mPerPx: 78271.517 * Math.cos((mid.lat * Math.PI) / 180) / Math.pow(2, arg.zoom) };
  }, { vagar: (vagFixtur as any).vagar, lage, zoom });
}
async function pixlar(pg: any) {
  const { data, info } = await sharp(await pg.screenshot()).raw().toBuffer({ resolveWithObject: true });
  return (x: number, y: number) => { const i = (info.width * Math.round(y) + Math.round(x)) * info.channels; return [data[i], data[i + 1], data[i + 2]]; };
}
const nara = (a: number[], b: number[], tol: number) => a.every((c, i) => Math.abs(c - b[i]) <= tol);
/** Bandets bredd i px: antal steg längs normalen från mitten (1 px steg) där pixeln inte längre är bakgrund. */
function bredd(px: (x: number, y: number) => number[], g: { x: number; y: number; nx: number; ny: number }): number {
  let n = 0;
  for (let s = -80; s <= 80; s++) { if (!nara(px(g.x + g.nx * s, g.y + g.ny * s), BG, 6)) n++; }
  return n;
}

describe.skipIf(!CHROMIUM)('Vägvarningens band — riktig Chromium + MapLibre', () => {
  it('orange före riskbedömning, rött vid hög risk, inget band vid låg risk — halvgenomskinligt (marken syns igenom)', async () => {
    const lib = await bunta();
    const b = await CHROMIUM!.launch({});
    try {
      const pg = await oppna(b, lib);
      const g1 = await bygg(pg, 'obedomd', 16.5); const p1 = await pixlar(pg);
      expect(nara(p1(g1.x, g1.y), blanda(ORANGE, 0.5), 14), `orange band: ${p1(g1.x, g1.y)}`).toBe(true);
      const g2 = await bygg(pg, 'hog', 16.5); const p2 = await pixlar(pg);
      expect(nara(p2(g2.x, g2.y), blanda(ROD, 0.5), 14), `rött band: ${p2(g2.x, g2.y)}`).toBe(true);
      const g3 = await bygg(pg, 'lag', 16.5); const p3 = await pixlar(pg);
      expect(nara(p3(g3.x, g3.y), BG, 3), `inget band vid låg risk: ${p3(g3.x, g3.y)}`).toBe(true);
      // halvgenomskinligt: pixeln är en BLANDNING (inte ren färg) — bakgrunden bidrar
      expect(p1(g1.x, g1.y)[1]).toBeLessThan(ORANGE[1] - 20);
    } finally { await b.close(); }
  }, 120000);

  it('bandet är brett (ca 20 m) och aldrig smalare än 10 px utzoomat — aldrig en tunn linje som kan förväxlas med traktgränsen', async () => {
    const lib = await bunta();
    const b = await CHROMIUM!.launch({});
    try {
      const pg = await oppna(b, lib);
      for (const zoom of [17.5, 16.5, 15.5]) {
        const g = await bygg(pg, 'obedomd', zoom); const px = await pixlar(pg);
        const forvantat = 20 / g.mPerPx;
        const mat = bredd(px, g);
        expect(mat, `zoom ${zoom}: ${mat} px (förväntat ~${forvantat.toFixed(0)})`).toBeGreaterThan(forvantat * 0.8);
        expect(mat).toBeLessThan(forvantat * 1.25 + 4);
        expect(mat).toBeGreaterThan(10);   // traktgränsen är några pixlar — bandet är mångfalt bredare
      }
      const z12 = await bygg(pg, 'obedomd', 13); const px12 = await pixlar(pg);
      expect(bredd(px12, z12), 'utzoomat: golvet 10 px').toBeGreaterThanOrEqual(9);
    } finally { await b.close(); }
  }, 180000);
});
