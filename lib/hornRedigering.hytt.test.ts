// @vitest-environment node
// REDIGERA HÖRN I RIKTIG CHROMIUM + MAPLIBRE, med riktigt finger (CDP-touch) och riktig mus (2026-11-25). jsdom kan varken rita en karta eller skicka ett finger — och felet var just
// pekhändelserna: ett finger skickar touchstart OCH (efteråt) en emulerad mus för samma tryck. Här mäts att
//   • ett tryck på en kantmittpunkt INTE lägger till något hörn (förut: ett eller två),
//   • ett drag i en mittpunkt lägger till EXAKT ett hörn och är ETT ångra-steg,
//   • ett drag som börjar nära gränsen men utanför handtagen panorerar kartan utan att röra ringen,
//   • ett tryck på ett hörn markerar det, ett nytt tryck avmarkerar,
//   • på touch ritas det dragna hörnet 40 px ovanför fingret, med mus ligger det under pekaren,
//   • ångra går tillbaka ett steg i taget.
// Själva koden (lib/hornRedigering + lib/ringEdit) buntas med esbuild och körs i webbläsaren — inga kopior. HORN_SKRIV=<mapp> sparar skärmbilden. Finns ingen Chromium hoppas mätningen över.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { hittaChromium, KARTA_ARGS } from './testStod/chromium';

const CHROMIUM = hittaChromium(KARTA_ARGS);
const MAPLIBRE = path.join(process.cwd(), 'node_modules/maplibre-gl/dist');

function buntaLib(): string {
  const mapp = fs.mkdtempSync(path.join(os.tmpdir(), 'horn-'));
  const ingang = path.join(mapp, 'entry.ts');
  fs.writeFileSync(ingang, ['hornRedigering', 'ringEdit'].map((f) => `export * from ${JSON.stringify(path.join(process.cwd(), 'lib', f))};`).join('\n'));
  const ut = path.join(mapp, 'lib.js');
  createRequire(import.meta.url)('esbuild').buildSync({ entryPoints: [ingang], bundle: true, format: 'iife', globalName: 'lib', outfile: ut, logLevel: 'error' });
  return ut;
}

async function oppna(touch: boolean, fn: (pg: any, cdp: any) => Promise<void>): Promise<void> {
  const b = await CHROMIUM!.launch({});
  try {
    const ctx = await b.newContext({ viewport: { width: 900, height: 640 }, hasTouch: touch, isMobile: false });
    const pg = await ctx.newPage();
    await pg.setContent('<!doctype html><html><head><meta charset="utf-8"><style>html,body,#m{margin:0;height:100%}</style></head><body><div id="m"></div></body></html>');
    await pg.addStyleTag({ path: path.join(MAPLIBRE, 'maplibre-gl.css') });
    await pg.addScriptTag({ path: path.join(MAPLIBRE, 'maplibre-gl.js') });
    await pg.addScriptTag({ path: buntaLib() });
    await pg.evaluate(async () => {
      const L = (window as any).lib; const ml = (window as any).maplibregl; const w = window as any;
      const map = new ml.Map({ container: 'm', center: [15.0, 57.0], zoom: 17, fadeDuration: 0, canvasContextAttributes: { preserveDrawingBuffer: true }, attributionControl: false,
        style: { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#3d4a2c' } }] } });
      await new Promise((r) => map.on('load', r));
      const kx = 111320 * Math.cos((57 * Math.PI) / 180), ky = 111000;
      const m = (x: number, y: number) => [15.0 + x / kx, 57.0 + y / ky];
      w.START = [m(-40, -30), m(0, -30), m(40, -30), m(40, 30), m(0, 30), m(-40, 30)];
      w.map = map; w.L = L;
      map.addSource('ring', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addSource('pts', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'ring-fill', type: 'fill', source: 'ring', paint: { 'fill-color': '#ff453a', 'fill-opacity': 0.12 } });
      map.addLayer({ id: 'ring-line', type: 'line', source: 'ring', paint: { 'line-color': '#ff453a', 'line-width': 3 } });
      map.addLayer({ id: 'mid', type: 'circle', source: 'pts', filter: ['==', ['get', 'kind'], 'mid'], paint: { 'circle-radius': 3.5, 'circle-color': 'rgba(255,255,255,0.35)', 'circle-stroke-color': 'rgba(0,0,0,0.35)', 'circle-stroke-width': 1 } });
      map.addLayer({ id: 'vertex', type: 'circle', source: 'pts', filter: ['==', ['get', 'kind'], 'vertex'], paint: { 'circle-radius': ['case', ['==', ['get', 'sel'], true], 10, 7], 'circle-color': '#fff', 'circle-stroke-color': ['case', ['==', ['get', 'sel'], true], '#000', '#ff453a'], 'circle-stroke-width': 2.5 } });
      w.ring = w.START.map((p: number[]) => [p[0], p[1]]); w.steg = []; w.valt = null; w.dragLogg = []; w.foreAnrop = 0;
      w.rita = () => {
        const sl = L.slutRing(w.ring);
        map.getSource('ring').setData({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [sl] } }] });
        const f: any[] = [];
        w.ring.forEach((p: number[], i: number) => f.push({ type: 'Feature', properties: { kind: 'vertex', sel: w.valt === i }, geometry: { type: 'Point', coordinates: p } }));
        for (const k of L.kantMittpunkter(w.ring)) f.push({ type: 'Feature', properties: { kind: 'mid' }, geometry: { type: 'Point', coordinates: k.pt } });
        map.getSource('pts').setData({ type: 'FeatureCollection', features: f });
      };
      w.rita();
      w.kopplad = L.kopplaHornRedigering(map, {
        hamtaRing: () => w.ring,
        sattRing: (r: number[][]) => { w.ring = r; w.rita(); },
        fore: () => { w.foreAnrop++; w.steg = L.skjutInSteg(w.steg, w.ring); },
        valj: (i: number | null) => { w.valt = i; w.rita(); },
        hamtaValt: () => w.valt,
        drag: (d: any) => { w.dragLogg.push(d); },
      });
      // allt pekar-/musflöde på canvas loggas, så testet kan visa vad ETT tryck faktiskt skickar
      w.handelser = [];
      for (const t of ['pointerdown', 'touchstart', 'touchend', 'mousedown', 'mouseup']) document.addEventListener(t, () => w.handelser.push(t), true);
    });
    await new Promise((r) => setTimeout(r, 500));
    const cdp = await ctx.newCDPSession(pg);
    await fn(pg, cdp);
  } finally { await b.close(); }
}

const px = (pg: any, c: number[]) => pg.evaluate((q: number[]) => (window as any).map.project(q), c);
const antal = (pg: any): Promise<number> => pg.evaluate(() => (window as any).ring.length);
const mittpunkt = (pg: any, kant: number): Promise<number[]> => pg.evaluate((k: number) => { const r = (window as any).ring; const a = r[k], b = r[(k + 1) % r.length]; return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; }, kant);
const vanta = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function dra(pg: any, cdp: any, touch: boolean, x0: number, y0: number, x1: number, y1: number, steg = 8) {
  if (touch) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0, id: 1 }] });
    for (let i = 1; i <= steg; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + ((x1 - x0) * i) / steg, y: y0 + ((y1 - y0) * i) / steg, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await pg.mouse.move(x0, y0); await pg.mouse.down(); await pg.mouse.move(x1, y1, { steps: steg }); await pg.mouse.up();
  }
  await vanta(200);
}
async function tryck(pg: any, touch: boolean, x: number, y: number) {
  if (touch) await pg.touchscreen.tap(x, y); else await pg.mouse.click(x, y);
  await vanta(450);   // den emulerade musen efter ett fingertryck kommer ~300 ms senare — vänta ut den
}

describe.skipIf(!CHROMIUM)('Redigera hörn i riktig Chromium', () => {
  for (const touch of [true, false]) {
    const namn = touch ? 'finger (touch)' : 'mus';
    it(`${namn}: ETT tryck på en mittpunkt lägger inte till något hörn`, async () => {
      await oppna(touch, async (pg) => {
        const n0 = await antal(pg);
        const p = await px(pg, await mittpunkt(pg, 0));
        await pg.evaluate(() => { (window as any).handelser = []; });
        await tryck(pg, touch, p.x, p.y);
        expect(await antal(pg)).toBe(n0);
        expect(await pg.evaluate(() => (window as any).steg.length)).toBe(0);   // inte ens ett ångra-steg
        // Fingret skickar pekhändelser OCH touch-händelser för samma tryck (förut lyssnade koden på touchstart + mousedown och räknade tryck två gånger). Nu räknas bara pointerdown,
        // och e.preventDefault() på ett handtag hindrar webbläsaren från att skicka den emulerade musen efteråt.
        const h = await pg.evaluate(() => (window as any).handelser);
        expect(h).toContain('pointerdown');
        if (touch) { expect(h).toContain('touchstart'); expect(h).not.toContain('mousedown'); }
      });
    });

    it(`${namn}: ett drag i en mittpunkt lägger till exakt ETT hörn, och det är ETT ångra-steg`, async () => {
      await oppna(touch, async (pg, cdp) => {
        const n0 = await antal(pg);
        const p = await px(pg, await mittpunkt(pg, 0));
        const start = await pg.evaluate(() => JSON.stringify((window as any).START));
        await dra(pg, cdp, touch, p.x, p.y, p.x + 10, p.y - 45);
        expect(await antal(pg)).toBe(n0 + 1);
        // det NYA hörnet (direkt efter kant 0) är det som dras — hörnen på båda sidor ligger kvar där de var
        const ring = await pg.evaluate(() => (window as any).ring);
        const orig = JSON.parse(start);
        expect(ring[0]).toEqual(orig[0]); expect(ring[2]).toEqual(orig[1]);
        const nytt = await px(pg, ring[1]);
        expect(Math.abs(nytt.x - (p.x + 10))).toBeLessThan(2);
        expect(Math.abs(nytt.y - (p.y - 45 - (touch ? 40 : 0)))).toBeLessThan(2);
        expect(await pg.evaluate(() => (window as any).steg.length)).toBe(1);
        expect(await pg.evaluate(() => (window as any).foreAnrop)).toBe(1);
      });
    });

    it(`${namn}: ett drag som börjar nära gränsen men utanför handtagen panorerar kartan och rör inte ringen`, async () => {
      await oppna(touch, async (pg, cdp) => {
        const n0 = await antal(pg);
        const ring0 = await pg.evaluate(() => JSON.stringify((window as any).ring));
        const p = await px(pg, await mittpunkt(pg, 0));
        const c0 = await pg.evaluate(() => (window as any).map.getCenter().lng);
        await dra(pg, cdp, touch, p.x, p.y + 38, p.x, p.y + 140, 10);   // 38 px från mittpunkten = utanför träffytan (16 px touch / 11 px mus)
        expect(await antal(pg)).toBe(n0);
        expect(await pg.evaluate(() => JSON.stringify((window as any).ring))).toBe(ring0);
        const c1 = await pg.evaluate(() => (window as any).map.getCenter());
        expect(Math.abs(c1.lng - c0) + Math.abs(c1.lat - 57.0)).toBeGreaterThan(0);   // kartan flyttades
      });
    });

    it(`${namn}: dra ett hörn flyttar det (touch: 40 px ovanför fingret), tryck markerar och avmarkerar`, async () => {
      await oppna(touch, async (pg, cdp) => {
        const n0 = await antal(pg);
        const v = await px(pg, (await pg.evaluate(() => (window as any).ring[0])) as number[]);
        await dra(pg, cdp, touch, v.x, v.y, v.x - 30, v.y + 60);
        expect(await antal(pg)).toBe(n0);
        const nytt = await px(pg, (await pg.evaluate(() => (window as any).ring[0])) as number[]);
        expect(Math.abs(nytt.x - (v.x - 30))).toBeLessThan(2);
        expect(Math.abs(nytt.y - (v.y + 60 - (touch ? 40 : 0)))).toBeLessThan(2);   // touch: hörnet ritas 40 px ovanför fingret
        if (touch) {
          const logg = await pg.evaluate(() => (window as any).dragLogg.filter(Boolean));
          expect(logg.length).toBeGreaterThan(0);
          expect(logg[logg.length - 1].finger).not.toBeNull();   // sidan får veta var fingret är (ritar en tunn linje dit)
        }
        // tryck på ett hörn markerar det, tryck igen avmarkerar, tryck på tom yta avmarkerar
        const v2 = await px(pg, (await pg.evaluate(() => (window as any).ring[2])) as number[]);
        await tryck(pg, touch, v2.x, v2.y);
        expect(await pg.evaluate(() => (window as any).valt)).toBe(2);
        await tryck(pg, touch, v2.x, v2.y);
        expect(await pg.evaluate(() => (window as any).valt)).toBeNull();
        await tryck(pg, touch, v2.x, v2.y);
        expect(await pg.evaluate(() => (window as any).valt)).toBe(2);
        await tryck(pg, touch, 450, 560);   // tom yta
        expect(await pg.evaluate(() => (window as any).valt)).toBeNull();
        expect(await antal(pg)).toBe(n0);
      });
    });

    it(`${namn}: ångra går tillbaka ett steg i taget`, async () => {
      await oppna(touch, async (pg, cdp) => {
        const start = await pg.evaluate(() => JSON.stringify((window as any).ring));
        const tillstand: string[] = [start];
        for (const kant of [0, 3, 4]) {
          const p = await px(pg, await mittpunkt(pg, kant));
          await dra(pg, cdp, touch, p.x, p.y, p.x + 6, p.y + 36);
          tillstand.push(await pg.evaluate(() => JSON.stringify((window as any).ring)));
        }
        expect(await pg.evaluate(() => (window as any).steg.length)).toBe(3);
        expect((await antal(pg))).toBe(9);
        for (let i = 2; i >= 0; i--) {
          await pg.evaluate(() => { const w = window as any; const r = w.L.angraSteg(w.steg); w.steg = r.steg; w.ring = r.ring; w.rita(); });
          expect(await pg.evaluate(() => JSON.stringify((window as any).ring))).toBe(tillstand[i]);
        }
        expect(await pg.evaluate(() => (window as any).steg.length)).toBe(0);
      });
    });
  }

  it('skärmbilden: hörn, svaga mittpunkter, markerat hörn', async () => {
    await oppna(true, async (pg) => {
      await pg.evaluate(() => { const w = (window as any); w.valt = 2; w.rita(); });
      await vanta(300);
      const mapp = process.env.HORN_SKRIV;
      if (mapp) { fs.mkdirSync(mapp, { recursive: true }); await pg.screenshot({ path: path.join(mapp, 'hornredigering-hytt.png') }); }
      expect(await antal(pg)).toBe(6);
    });
  });
});
