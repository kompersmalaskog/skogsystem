// @vitest-environment node
// BASVÄGENS SNITSELFÄRG I RIKTIG CHROMIUM + MAPLIBRE (2026-10-21). Buggen: en basväg satt till Blå/gul visade sig som helt gul med ljust sken i maskinläget.
// Två orsaker — (1) körvyns sken (`lines-korvy-mainroad-glow`) var gult och låg OVANPÅ väglagren, så det färgade vägen (blå → grågrön, röd → orange); (2) det gula strecket
// ritades med rundade ändar och åt upp det blå (75 % gult). Här ritas vägarna med lagerspecarna ur lib/kartstil (samma konstanter som planeringsvyn använder; page.tsx är
// källvaktad nedan) och färgen mäts i pixlar: varje val ska ge sin egen färg i både planeringsläget (utan sken) och maskinläget (med sken), och Blå/gul ska vara ~50/50.
// jsdom kan inte rita en karta, därför Chromium. Finns ingen Chromium hoppas mätningen över. BASVAG_SKRIV=<mapp> sparar skärmbilderna.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BASVAG_FARG_UTTRYCK, BASVAG_UTAN_FARG, BASVAG_STRECK_DASH, BASVAG_STRECK_LAYOUT, BASVAG_SKEN_ID, basvagSkenLager, forstaVagLagerId, LEGEND } from './kartstil';

function chromium(): { launch: (o: object) => Promise<any> } | null {
  try {
    const rot = execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    const kor = createRequire(path.join(rot, 'x.js'));
    const pw = kor('playwright');
    const mapp = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
    const ver = fs.readdirSync(mapp).filter((n) => /^chromium-\d+$/.test(n)).sort().pop();
    const exe = ver && path.join(mapp, ver, 'chrome-linux', 'chrome');
    if (!exe || !fs.existsSync(exe)) return null;
    return { launch: (o) => pw.chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'], ...o }) };
  } catch { return null; }
}
const CHROMIUM = chromium();
const MAPLIBRE = path.join(process.cwd(), 'node_modules/maplibre-gl/dist');

// Samma bredder som planeringsvyns väglager (app/planering/page.tsx, linjetyperna).
const LW = ['interpolate', ['linear'], ['zoom'], 5, 2, 8, 2, 11, 3, 13, 4, 15, 6, 17, 7];
const CW = ['interpolate', ['linear'], ['zoom'], 5, 4, 8, 4, 11, 5, 13, 6, 15, 8, 17, 9];

type Matt = { farg: Record<string, string>; blaAndel: number };
const hex = (r: number, g: number, b: number) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');

async function mat(laege: 'plan' | 'maskin', skrivTill?: string, gammal = false): Promise<Matt> {
  const b = await CHROMIUM!.launch({});
  try {
    const pg = await b.newPage({ viewport: { width: 900, height: 640 } });
    await pg.setContent('<!doctype html><html><head><meta charset="utf-8"><style>html,body,#m{margin:0;height:100%}</style></head><body><div id="m"></div></body></html>');
    await pg.addStyleTag({ path: path.join(MAPLIBRE, 'maplibre-gl.css') });
    await pg.addScriptTag({ path: path.join(MAPLIBRE, 'maplibre-gl.js') });
    const svar = await pg.evaluate(async (a: any) => {
      const mk = (lat: number, farg?: string) => ({ type: 'Feature', properties: Object.assign({ lineType: 'mainRoad', nearby: true }, farg ? { farg } : {}), geometry: { type: 'LineString', coordinates: [[15.0, lat], [15.003, lat]] } });
      const feats = [mk(57.0000), mk(57.0004, 'red'), mk(57.0008, 'yellow'), mk(57.0012, 'blue')];
      const el = document.getElementById('m')!; el.innerHTML = '';
      const map = new (window as any).maplibregl.Map({ container: 'm', center: [15.0015, 57.0006], zoom: 16.6, fadeDuration: 0, preserveDrawingBuffer: true, attributionControl: false,
        style: { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#3d4a2c' } }] } });
      await new Promise((r) => map.on('load', r));
      map.addSource('lines-source', { type: 'geojson', data: { type: 'FeatureCollection', features: feats } });
      const mainRoad = ['==', ['get', 'lineType'], 'mainRoad'];
      map.addLayer({ id: 'line-mainRoad-casing', type: 'line', source: 'lines-source', filter: mainRoad, paint: { 'line-color': 'rgba(0,0,0,0.9)', 'line-width': a.cw }, layout: { 'line-cap': 'round', 'line-join': 'miter' } });
      map.addLayer({ id: 'line-mainRoad-base', type: 'line', source: 'lines-source', filter: mainRoad, paint: { 'line-color': a.farg, 'line-width': a.lw }, layout: { 'line-cap': 'round', 'line-join': 'miter' } });
      map.addLayer({ id: 'line-mainRoad-stripe', type: 'line', source: 'lines-source', filter: ['all', mainRoad, a.utanFarg], paint: { 'line-color': a.gul, 'line-width': a.lw, 'line-dasharray': a.dash }, layout: a.streckLayout });
      if (a.laege === 'maskin') {
        const sken = a.sken; sken.layout.visibility = 'visible';
        map.addLayer(sken, a.forstaId);   // beforeId ur forstaVagLagerId (kartstil.ts) — samma val som sidan gör
      }
      await new Promise((r) => { map.once('idle', r); map.triggerRepaint(); });
      const c = document.createElement('canvas'); c.width = map.getCanvas().width; c.height = map.getCanvas().height;
      const ctx = c.getContext('2d')!; ctx.drawImage(map.getCanvas(), 0, 0);
      const dpr = c.width / map.getCanvas().clientWidth;
      const rader: number[][][] = [];
      for (const f of feats) {
        const p0 = map.project(f.geometry.coordinates[0]); const p1 = map.project(f.geometry.coordinates[1]);
        const y = Math.round(p0.y * dpr); const px: number[][] = [];
        for (let x = Math.round((p0.x + 12) * dpr); x < Math.round((p1.x - 12) * dpr); x++) { const d = ctx.getImageData(x, y, 1, 1).data; px.push([d[0], d[1], d[2]]); }
        rader.push(px);
      }
      return { rader, ordning: map.getStyle().layers.map((l: any) => l.id) };
    }, {
      laege, cw: CW, lw: LW, farg: BASVAG_FARG_UTTRYCK, utanFarg: BASVAG_UTAN_FARG, gul: LEGEND.gul, dash: [...BASVAG_STRECK_DASH], streckLayout: gammal ? { 'line-cap': 'round', 'line-join': 'miter' } : { ...BASVAG_STRECK_LAYOUT },
      // gammal = läget FÖRE rättningen (rundade ändar, gult sken #ffd60a 40 % ovanpå vägen) — bara för att bevisa att mätningen fångar buggen.
      sken: gammal ? { ...basvagSkenLager('lines-source'), paint: { ...basvagSkenLager('lines-source').paint, 'line-color': '#ffd60a', 'line-opacity': 0.4 } } : basvagSkenLager('lines-source'),
      forstaId: gammal ? undefined : forstaVagLagerId(['bg', 'line-mainRoad-casing', 'line-mainRoad-base', 'line-mainRoad-stripe']),
    });
    if (skrivTill) { fs.mkdirSync(skrivTill, { recursive: true }); await pg.screenshot({ path: path.join(skrivTill, `${gammal ? 'fore' : 'efter'}-${laege}.png`) }); }
    // Skenet ska ligga UNDER väglagren: första vägen före, sist skenet.
    if (laege === 'maskin' && !gammal) expect(svar.ordning.indexOf(BASVAG_SKEN_ID)).toBeLessThan(svar.ordning.indexOf('line-mainRoad-casing'));
    const median = (px: number[][]) => { const m = [0, 1, 2].map((k) => px.map((p) => p[k]).sort((x, y) => x - y)[Math.floor(px.length / 2)]); return hex(m[0], m[1], m[2]); };
    const [blagul, rod, gul, bla] = svar.rader as number[][][];
    const arBla = (p: number[]) => p[2] > p[0] + 40;
    return { farg: { rod: median(rod), gul: median(gul), bla: median(bla) }, blaAndel: blagul.filter(arBla).length / blagul.length };
  } finally { await b.close(); }
}

const nara = (a: string, b: string, tol = 8) => [1, 3, 5].every((i) => Math.abs(parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16)) <= tol);

describe.skipIf(!CHROMIUM)('Basvägens snitselfärg — riktig Chromium + MapLibre, pixlar', () => {
  for (const laege of ['plan', 'maskin'] as const) {
    it(`${laege === 'plan' ? 'PLANERINGSLÄGET (inget sken)' : 'MASKINLÄGET (skenet aktivt)'}: Blå = blå, Röd = röd, Gul = gul, och Blå/gul ~50/50 blått och gult`, async () => {
      const m = await mat(laege, process.env.BASVAG_SKRIV);
      if (process.env.BASVAG_SKRIV) console.log(laege, JSON.stringify(m));
      expect(nara(m.farg.bla, '#3b82f6'), `Blå blev ${m.farg.bla}`).toBe(true);
      expect(nara(m.farg.rod, '#ff453a'), `Röd blev ${m.farg.rod}`).toBe(true);
      expect(nara(m.farg.gul, '#fbbf24'), `Gul blev ${m.farg.gul}`).toBe(true);
      expect(m.blaAndel, `Blå/gul: ${(m.blaAndel * 100).toFixed(0)} % blått`).toBeGreaterThan(0.44);
      expect(m.blaAndel).toBeLessThan(0.56);
    }, 90000);
  }
});

describe.skipIf(!CHROMIUM)('Mätningen har tänder: den FÖRE-rättningen ger fel färg', () => {
  it('gammalt läge i planeringsläget: blått bara på en bråkdel av Blå/gul (rundade ändar)', async () => {
    const m = await mat('plan', process.env.BASVAG_SKRIV, true);
    if (process.env.BASVAG_SKRIV) console.log('fore plan', JSON.stringify(m));
    expect(m.blaAndel).toBeLessThan(0.36);
  }, 90000);
  it('gammalt läge i maskinläget: skenet färgar vägarna (Blå ≠ blå, Röd ≠ röd)', async () => {
    const m = await mat('maskin', process.env.BASVAG_SKRIV, true);
    if (process.env.BASVAG_SKRIV) console.log('fore maskin', JSON.stringify(m));
    expect(nara(m.farg.bla, '#3b82f6')).toBe(false);
    expect(nara(m.farg.rod, '#ff453a')).toBe(false);
    expect(m.blaAndel).toBeLessThan(0.36);
  }, 90000);
});

// Källvakt: planeringsvyn använder EXAKT de delade specarna (annars mäter testet ovan något sidan inte ritar).
describe('page.tsx ritar basvägen med de delade specarna', () => {
  const sida = fs.readFileSync(path.join(process.cwd(), 'app/planering/page.tsx'), 'utf8');
  it('skenet byggs av basvagSkenLager och läggs UNDER väglagren (beforeId), inte på toppen', () => {
    expect(sida).toMatch(/map\.addLayer\(basvagSkenLager\('lines-source'\),\s*forstaVagLagerId\(/);
    expect(sida).not.toMatch(/'line-color':\s*'#ffd60a'/);
  });
  it('skenet flyttas under väglagren vid varje körvy-växling (ordningen får inte bero på när lagren skapades)', () => {
    expect(sida).toMatch(/map\.moveLayer\(BASVAG_SKEN_ID,\s*forsta\)/);
  });
  it('basvägens gula streck har platta ändar och lika långa streck (BASVAG_STRECK_*)', () => {
    expect(sida).toMatch(/isMainRoad \? \[\.\.\.BASVAG_STRECK_DASH\]/);
    expect(sida).toMatch(/isMainRoad \? \{ \.\.\.BASVAG_STRECK_LAYOUT \}/);
  });
  it('specarna: skenet är vitt och svagt, strecket butt med [2, 2]', () => {
    const s = basvagSkenLager('x');
    expect(s.paint['line-color']).toBe('#ffffff');
    expect(s.paint['line-opacity']).toBeLessThanOrEqual(0.35);
    expect(BASVAG_STRECK_LAYOUT['line-cap']).toBe('butt');
    expect([...BASVAG_STRECK_DASH]).toEqual([2, 2]);
    expect(forstaVagLagerId(['bg', 'zone-fill', 'line-boundary-casing', 'line-mainRoad-base'])).toBe('line-boundary-casing');
    expect(forstaVagLagerId(['bg', 'zone-fill'])).toBeUndefined();
  });
});
