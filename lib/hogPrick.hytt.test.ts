// @vitest-environment node
// HÖGARNA I RIKTIG CHROMIUM + MAPLIBRE (2026-11-06): samma lagerspecar som planeringen (lib/hogPrick), trädslagsfärger och halv–halv för blandat.
// Mäter pixlar: en blandad hög har vänster halva i första trädslagets färg och höger i andra; större volym = större prick. Utan Chromium hoppas den över.
// HOG_SKRIV=<mapp> sparar skärmbilderna.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { it, expect } from 'vitest';
import { hogRadie, hogHalvBild, HOG_HALV_BILD, HOG_HALV_RADIE_PX } from './hogPrick';
import { hogTradslagFarger } from './tradslag';
const rot = execSync('npm root -g').toString().trim();
const pw = createRequire(path.join(rot, 'x.js'))('playwright');
const ML = path.join(process.cwd(), 'node_modules/maplibre-gl/dist');
const OUT = process.env.HOG_SKRIV || '';
it('högarna i trädslagsfärg, blandat halv–halv', async () => {
  const hogar = [
    [0, 0, { GRAN: 10 }, 8], [0.0004, 0, { TALL: 10 }, 8], [0.0008, 0, { 'BJÖRK': 10 }, 8], [0.0012, 0, { GRAN: 5, TALL: 5 }, 8],
    [0, -0.00025, { GRAN: 10 }, 1], [0.0004, -0.00025, { GRAN: 10 }, 4], [0.0008, -0.00025, { GRAN: 10 }, 15], [0.0012, -0.00025, { GRAN: 6, 'BJÖRK': 4 }, 30],
  ];
  const feats = hogar.map(([x, y, ts, v]: any) => { const f = hogTradslagFarger(ts); return { type: 'Feature', geometry: { type: 'Point', coordinates: [15.356 + x, 56.659 + y] }, properties: { v, farg: f.farg, ...(f.farg2 ? { farg2: f.farg2 } : {}), a: 0.95 } }; });
  const b = await pw.chromium.launch({ args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const zoom of [16, 18]) {
    const pg = await b.newPage({ viewport: { width: 700, height: 300 }, deviceScaleFactor: 2 });
    await pg.setContent('<!doctype html><html><head><style>html,body,#m{margin:0;height:100%}</style></head><body><div id="m"></div></body></html>');
    await pg.addScriptTag({ path: path.join(ML, 'maplibre-gl.js') });
    const bild = hogHalvBild();
    await pg.evaluate(async (a: any) => {
      const map = new (window as any).maplibregl.Map({ container: 'm', center: [15.3566, 56.65888], zoom: a.zoom, fadeDuration: 0, preserveDrawingBuffer: true, attributionControl: false,
        style: { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#d6caae' } }] } });
      await new Promise((r) => map.on('load', r));
      map.addImage(a.bildId, { width: a.bild.width, height: a.bild.height, data: new Uint8ClampedArray(a.bild.data) }, { sdf: true });
      map.addSource('s', { type: 'geojson', data: { type: 'FeatureCollection', features: a.feats } });
      map.addLayer({ id: 'dots', type: 'circle', source: 's', paint: { 'circle-color': ['get', 'farg'], 'circle-stroke-color': 'rgba(0,0,0,0.75)', 'circle-stroke-width': 1.5, 'circle-radius': a.r1, 'circle-opacity': ['coalesce', ['get', 'a'], 0.95], 'circle-stroke-opacity': ['coalesce', ['get', 'a'], 0.95] } });
      map.addLayer({ id: 'halv', type: 'symbol', source: 's', filter: ['has', 'farg2'], layout: { 'icon-image': a.bildId, 'icon-size': a.rI, 'icon-allow-overlap': true, 'icon-ignore-placement': true }, paint: { 'icon-color': ['get', 'farg2'], 'icon-opacity': ['coalesce', ['get', 'a'], 0.95] } });
      await new Promise((r) => map.once('idle', r));
      // Pixlarna strax till vänster och höger om mitten på den blandade högen (gran + tall).
      const c = map.getCanvas(); const k = document.createElement('canvas'); k.width = c.width; k.height = c.height;
      const g = k.getContext('2d')!; g.drawImage(c, 0, 0);
      const dpr = c.width / c.clientWidth;
      const px = (x: number, y: number) => Array.from(g.getImageData(Math.round(x * dpr), Math.round(y * dpr), 1, 1).data).slice(0, 3);
      const m = map.project(a.blandad); const r = 3;
      (window as any).__ut = { vanster: px(m.x - r, m.y), hoger: px(m.x + r, m.y) };
    }, { zoom, feats, bild: { width: bild.width, height: bild.height, data: Array.from(bild.data) }, bildId: HOG_HALV_BILD, r1: hogRadie(1), rI: hogRadie(1 / HOG_HALV_RADIE_PX), blandad: [15.356 + 0.0012, 56.659] });
    const ut = await pg.evaluate(() => (window as any).__ut);
    const nara = (a: number[], hex: string) => { const h = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)); return a.every((v, i) => Math.abs(v - h[i]) < 30); };
    const f = hogTradslagFarger({ GRAN: 5, TALL: 5 });
    expect(nara(ut.vanster, f.farg), `vänster ${ut.vanster}`).toBe(true);
    expect(nara(ut.hoger, f.farg2!), `höger ${ut.hoger}`).toBe(true);
    if (OUT) await pg.screenshot({ path: path.join(OUT, `hog_z${zoom}.png`) });
  }
  await b.close();
}, 60000);
