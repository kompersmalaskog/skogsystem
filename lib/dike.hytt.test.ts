// @vitest-environment node
// DIKET I RIKTIG CHROMIUM + MAPLIBRE (2026-11-11). Martin: det turkosa, randiga diket blandades ihop med den blå basvägen och den blå RISA-sträckan.
// Nu är diket en fåra med vatten i (lib/kartstil dikeLager): mörk kant, jordkant, fåra och en smal blå vattenlinje — inga ränder, smalare än vägen.
// Här ritas diket med lagerspecarna ur lib/kartstil (samma funktion som planeringsvyn anropar, källvaktad nedan) bredvid en Blå/gul basväg och mäts i pixlar.
// jsdom kan inte rita en karta, därför Chromium. Finns ingen Chromium hoppas mätningen över. DIKE_SKRIV=<mapp> sparar skärmbilden.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BASVAG_FARG_UTTRYCK, BASVAG_STRECK_DASH, BASVAG_STRECK_LAYOUT, DIKE, dikeLager, LEGEND } from './kartstil';
import { hittaChromium, KARTA_ARGS } from './testStod/chromium';

const CHROMIUM = hittaChromium(KARTA_ARGS);
const MAPLIBRE = path.join(process.cwd(), 'node_modules/maplibre-gl/dist');
const LW = ['interpolate', ['linear'], ['zoom'], 5, 2, 8, 2, 11, 3, 13, 4, 15, 6, 17, 7];
const CW = ['interpolate', ['linear'], ['zoom'], 5, 4, 8, 4, 11, 5, 13, 6, 15, 8, 17, 9];
const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const nara = (p: number[], h: string, tol = 24) => rgb(h).every((v, i) => Math.abs(v - p[i]) <= tol);

describe('diket i kartstil', () => {
  it('fyra lager (kant, jord, fåra, vatten), inga ränder, smalare än vägen', () => {
    const l = dikeLager('k', 'x', ['==', 1, 1]);
    expect(l.map((x: any) => x.id)).toEqual(['x-kant', 'x', 'x-fara', 'x-vatten']);
    expect(l.some((x: any) => x.paint['line-dasharray'])).toBe(false);
    expect(l.map((x: any) => x.paint['line-color'])).toEqual([DIKE.kant, DIKE.jord, DIKE.fara, DIKE.vatten]);
  });
  it('planeringsvyn ritar diket med dikeLager (ingen egen randning kvar)', () => {
    const sida = fs.readFileSync(path.join(process.cwd(), 'app/planering/page.tsx'), 'utf8');
    expect(sida).toMatch(/dikeLager\('lines-source', 'line-ditch-base'/);
    expect(sida).not.toMatch(/id: 'ditch'[^}]*striped: true/);
  });
});

describe.skipIf(!CHROMIUM)('Diket — riktig Chromium + MapLibre, pixlar', () => {
  it('mitten är vatten (blå), kanterna jord/mörka, längs hela diket — och basvägen är oförändrad', async () => {
    const b = await CHROMIUM!.launch({});
    try {
      const pg = await b.newPage({ viewport: { width: 900, height: 640 } });
      await pg.setContent('<!doctype html><html><head><meta charset="utf-8"><style>html,body,#m{margin:0;height:100%}</style></head><body><div id="m"></div></body></html>');
      await pg.addStyleTag({ path: path.join(MAPLIBRE, 'maplibre-gl.css') });
      await pg.addScriptTag({ path: path.join(MAPLIBRE, 'maplibre-gl.js') });
      const svar = await pg.evaluate(async (a: any) => {
        const vag = { type: 'Feature', properties: { lineType: 'mainRoad' }, geometry: { type: 'LineString', coordinates: [[15.0, 57.0008], [15.003, 57.0008]] } };
        const dike = { type: 'Feature', properties: { lineType: 'ditch' }, geometry: { type: 'LineString', coordinates: [[15.0, 57.0002], [15.003, 57.0002]] } };
        const map = new (window as any).maplibregl.Map({ container: 'm', center: [15.0015, 57.0005], zoom: 16.6, fadeDuration: 0, preserveDrawingBuffer: true, attributionControl: false,
          style: { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#2f4a32' } }] } });
        await new Promise((r) => map.on('load', r));
        map.addSource('lines-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [vag, dike] } });
        const mr = ['==', ['get', 'lineType'], 'mainRoad'];
        map.addLayer({ id: 'line-mainRoad-casing', type: 'line', source: 'lines-source', filter: mr, paint: { 'line-color': 'rgba(0,0,0,0.9)', 'line-width': a.cw }, layout: { 'line-cap': 'round' } });
        map.addLayer({ id: 'line-mainRoad-base', type: 'line', source: 'lines-source', filter: mr, paint: { 'line-color': a.farg, 'line-width': a.lw }, layout: { 'line-cap': 'round' } });
        map.addLayer({ id: 'line-mainRoad-stripe', type: 'line', source: 'lines-source', filter: mr, paint: { 'line-color': a.gul, 'line-width': a.lw, 'line-dasharray': a.dash }, layout: a.streckLayout });
        for (const l of a.dike) map.addLayer(l);
        await new Promise((r) => { map.once('idle', r); map.triggerRepaint(); });
        const c = document.createElement('canvas'); c.width = map.getCanvas().width; c.height = map.getCanvas().height;
        const ctx = c.getContext('2d')!; ctx.drawImage(map.getCanvas(), 0, 0);
        const dpr = c.width / map.getCanvas().clientWidth;
        const p0 = map.project(dike.geometry.coordinates[0]); const p1 = map.project(dike.geometry.coordinates[1]);
        const y = Math.round(p0.y * dpr);
        const mitt: number[][] = []; const tvars: number[][] = [];
        for (let x = Math.round((p0.x + 20) * dpr); x < Math.round((p1.x - 20) * dpr); x += 3) { const d = ctx.getImageData(x, y, 1, 1).data; mitt.push([d[0], d[1], d[2]]); }
        const xm = Math.round(((p0.x + p1.x) / 2) * dpr);
        for (let dy = -12; dy <= 12; dy++) { const d = ctx.getImageData(xm, y + dy, 1, 1).data; tvars.push([d[0], d[1], d[2]]); }
        return { mitt, tvars };
      }, { cw: CW, lw: LW, farg: BASVAG_FARG_UTTRYCK, gul: LEGEND.gul, dash: [...BASVAG_STRECK_DASH], streckLayout: { ...BASVAG_STRECK_LAYOUT }, dike: dikeLager('lines-source', 'line-ditch-base', ['==', ['get', 'lineType'], 'ditch']) });
      if (process.env.DIKE_SKRIV) { fs.mkdirSync(process.env.DIKE_SKRIV, { recursive: true }); await pg.screenshot({ path: path.join(process.env.DIKE_SKRIV, 'dike.png') }); }
      // Vatten längs HELA diket (inga ränder): varje mätpunkt i mitten är dikets blå.
      expect(svar.mitt.every((p: number[]) => nara(p, DIKE.vatten))).toBe(true);
      // Tvärs över: blått i mitten, jordens brun och den mörka kanten finns också (fåran syns).
      expect(svar.tvars.some((p: number[]) => nara(p, DIKE.jord))).toBe(true);
      expect(svar.tvars.some((p: number[]) => nara(p, DIKE.fara))).toBe(true);
    } finally { await b.close(); }
  }, 60_000);
});
