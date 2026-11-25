// @vitest-environment node
// REDIGERA HÖRN I RIKTIG CHROMIUM + MAPLIBRE, med riktigt finger (CDP-touch) och riktig mus (2026-11-25, omgjort 2026-11-25 för flera delar som sitter ihop). jsdom kan varken rita en karta eller skicka ett finger.
// Två traktdelar delar en kant (tre gemensamma hörn). Mäts att
//   • ett TRYCK på gränslinjen lägger ett nytt hörn där man tryckte (på linjen), markerat direkt, i alla delar som har kanten, som ETT ångra-steg,
//   • fem tryck längs en lång kant ger fem hörn som går att dra och ångra ett i taget; ett tryck långt från linjen lägger inget,
//   • ett drag i en GEMENSAM mittpunkt lägger till exakt ETT hörn — i båda delarna — och är ETT ångra-steg,
//   • ett drag i ett GEMENSAMT hörn flyttar det i båda delarna (och ritar det EN gång),
//   • ett drag som börjar nära gränsen men utanför handtagen panorerar kartan utan att röra något,
//   • ett tryck på ett hörn markerar det, ett nytt tryck avmarkerar,
//   • på touch ritas det dragna hörnet 40 px ovanför fingret, med mus ligger det under pekaren,
//   • ångra går tillbaka ett steg i taget.
// Själva koden (lib/hornRedigering + lib/traktTopologi) buntas med esbuild och körs i webbläsaren — inga kopior. HORN_SKRIV=<mapp> sparar skärmbilden. Finns ingen Chromium hoppas mätningen över.
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
  fs.writeFileSync(ingang, ['hornRedigering', 'traktTopologi'].map((f) => `export * from ${JSON.stringify(path.join(process.cwd(), 'lib', f))};`).join('\n'));
  const ut = path.join(mapp, 'lib.js');
  createRequire(import.meta.url)('esbuild').buildSync({ entryPoints: [ingang], bundle: true, format: 'iife', globalName: 'lib', outfile: ut, logLevel: 'error' });
  return ut;
}

async function oppna(touch: boolean, fn: (pg: any, cdp: any) => Promise<void>, brok?: { id: string; ring: number[][] }[]): Promise<void> {
  const b = await CHROMIUM!.launch({});
  try {
    const ctx = await b.newContext({ viewport: { width: 900, height: 640 }, hasTouch: touch, isMobile: false });
    const pg = await ctx.newPage();
    await pg.setContent('<!doctype html><html><head><meta charset="utf-8"><style>html,body,#m{margin:0;height:100%}</style></head><body><div id="m"></div></body></html>');
    await pg.addStyleTag({ path: path.join(MAPLIBRE, 'maplibre-gl.css') });
    await pg.addScriptTag({ path: path.join(MAPLIBRE, 'maplibre-gl.js') });
    await pg.addScriptTag({ path: buntaLib() });
    await pg.evaluate(async (brokDelar: { id: string; ring: number[][] }[] | undefined) => {
      const L = (window as any).lib; const ml = (window as any).maplibregl; const w = window as any;
      const map = new ml.Map({ container: 'm', center: [15.0, 57.0], zoom: 17, fadeDuration: 0, canvasContextAttributes: { preserveDrawingBuffer: true }, attributionControl: false,
        style: { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#3d4a2c' } }] } });
      await new Promise((r) => map.on('load', r));
      const kx = 111320 * Math.cos((57 * Math.PI) / 180), ky = 111000;
      const m = (x: number, y: number) => [15.0 + x / kx, 57.0 + y / ky];
      // Två delar som delar en kant: A till vänster, B till höger; kanten x=0 har tre gemensamma hörn (A har ett extra hörn på kanten som B får av topologin).
      const A = [m(-80, -40), m(0, -40), m(0, 0), m(0, 40), m(-80, 40)];
      const B = [m(0, -40), m(80, -40), m(80, 40), m(0, 40)];
      w.map = map; w.L = L;
      w.topo = brokDelar ? L.justeraDelar(brokDelar).t : L.byggTopologi([{ id: 'A', ring: A }, { id: 'B', ring: B }]);
      if (brokDelar) {   // Brokamåla 1:5 (riktig geometri): kameran på den längsta kanten på västra sidan — den ska fylla ~60 % av höjden
        const ks = L.unikaKanter(w.topo).map((k: any) => ({ k, a: w.topo.horn[k.a], b: w.topo.horn[k.b] }));
        const lng = ks.map((q: any) => q.k.pt[0]); const medel = lng.reduce((x: number, y: number) => x + y, 0) / lng.length;
        const langd = (q: any) => Math.hypot((q.a[0] - q.b[0]) * kx, (q.a[1] - q.b[1]) * ky);
        const vast = ks.filter((q: any) => q.k.pt[0] < medel).sort((x: any, y: any) => langd(y) - langd(x))[0];
        w.vast = { id: vast.k.id, a: vast.a, b: vast.b, meter: langd(vast) };
        map.jumpTo({ center: vast.k.pt, zoom: 17 });
        const s = Math.max(Math.abs(vast.a[0] - vast.b[0]) * kx, Math.abs(vast.a[1] - vast.b[1]) * ky);
        map.jumpTo({ center: vast.k.pt, zoom: 17 + Math.log2((640 * 0.6 * 0.64) / Math.max(s, 1)) });   // 0,64 m/px vid zoom 17 på 57° N
      }
      w.steg = []; w.valt = null; w.dragLogg = []; w.foreAnrop = 0;
      map.addSource('ring', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addSource('pts', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'ring-fill', type: 'fill', source: 'ring', paint: { 'fill-color': '#ff453a', 'fill-opacity': 0.12 } });
      map.addLayer({ id: 'ring-line', type: 'line', source: 'ring', paint: { 'line-color': '#ff453a', 'line-width': 3 } });
      map.addLayer({ id: 'mid', type: 'circle', source: 'pts', filter: ['==', ['get', 'kind'], 'mid'], paint: { 'circle-radius': 6, 'circle-color': 'rgba(255,255,255,0.85)', 'circle-stroke-color': 'rgba(0,0,0,0.75)', 'circle-stroke-width': 1.5 } });
      map.addLayer({ id: 'vertex', type: 'circle', source: 'pts', filter: ['==', ['get', 'kind'], 'vertex'], paint: { 'circle-radius': ['case', ['==', ['get', 'sel'], true], 10, 7], 'circle-color': '#fff', 'circle-stroke-color': ['case', ['==', ['get', 'sel'], true], '#000', '#ff453a'], 'circle-stroke-width': 2.5 } });
      w.rita = () => {
        map.getSource('ring').setData({ type: 'FeatureCollection', features: L.ringar(w.topo).map((r: any) => ({ type: 'Feature', properties: { id: r.id }, geometry: { type: 'Polygon', coordinates: [[...r.ring, r.ring[0]]] } })) });
        const f: any[] = [];
        for (const h of L.unikaHorn(w.topo)) f.push({ type: 'Feature', properties: { kind: 'vertex', sel: w.valt === h.id }, geometry: { type: 'Point', coordinates: h.pt } });
        for (const k of L.unikaKanter(w.topo)) f.push({ type: 'Feature', properties: { kind: 'mid' }, geometry: { type: 'Point', coordinates: k.pt } });
        map.getSource('pts').setData({ type: 'FeatureCollection', features: f });
      };
      w.rita();
      w.kopplad = L.kopplaHornRedigering(map, {
        horn: () => L.unikaHorn(w.topo),
        mitt: () => L.unikaKanter(w.topo).map((k: any) => ({ id: k.id, pt: k.pt })),
        flytta: (id: number, pt: number[]) => { w.topo = L.flyttaHorn(w.topo, id, pt); w.rita(); },
        kanter: () => L.unikaKanter(w.topo).map((q: any) => ({ id: q.id, a: w.topo.horn[q.a], b: w.topo.horn[q.b] })),
        laggTill: (kantId: string, pt?: number[]) => { const r = L.laggTillHorn(w.topo, kantId, pt); if (!r) return null; w.topo = r.t; w.rita(); return r.id; },
        fore: () => { w.foreAnrop++; w.steg = L.skjutInSteg(w.steg, w.topo); },
        valj: (i: number | null) => { w.valt = i; w.rita(); },
        hamtaValt: () => w.valt,
        drag: (d: any) => { w.dragLogg.push(d); },
      });
      // allt pekar-/musflöde på canvas loggas, så testet kan visa vad ETT tryck faktiskt skickar
      w.handelser = [];
      for (const t of ['pointerdown', 'touchstart', 'touchend', 'mousedown', 'mouseup']) document.addEventListener(t, () => w.handelser.push(t), true);
    }, brok);
    await new Promise((r) => setTimeout(r, 500));
    const cdp = await ctx.newCDPSession(pg);
    await fn(pg, cdp);
  } finally { await b.close(); }
}

const px = (pg: any, c: number[]) => pg.evaluate((q: number[]) => (window as any).map.project(q), c);
const antal = (pg: any): Promise<number> => pg.evaluate(() => (window as any).L.antalHorn((window as any).topo));
const ringLangder = (pg: any): Promise<number[]> => pg.evaluate(() => (window as any).topo.delar.map((d: any) => d.ring.length));
const horn = (pg: any, namn: string): Promise<{ id: number; pt: number[] }> => pg.evaluate((n: string) => {
  const w = window as any; const kx = 111320 * Math.cos((57 * Math.PI) / 180);
  const [x, y] = n.split(',').map(Number);
  return w.L.unikaHorn(w.topo).find((h: any) => Math.abs((h.pt[0] - 15) * kx - x) < 0.5 && Math.abs((h.pt[1] - 57) * 111000 - y) < 0.5);
}, namn);
const kantMitt = (pg: any, a: string, b: string): Promise<number[]> => pg.evaluate(([na, nb]: string[]) => {
  const w = window as any; const kx = 111320 * Math.cos((57 * Math.PI) / 180);
  const hitta = (n: string) => { const [x, y] = n.split(',').map(Number); return w.L.unikaHorn(w.topo).find((h: any) => Math.abs((h.pt[0] - 15) * kx - x) < 0.5 && Math.abs((h.pt[1] - 57) * 111000 - y) < 0.5); };
  const ha = hitta(na), hb = hitta(nb);
  const id = ha.id < hb.id ? `${ha.id}-${hb.id}` : `${hb.id}-${ha.id}`;
  return w.L.unikaKanter(w.topo).find((k: any) => k.id === id).pt;
}, [a, b]);
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

describe.skipIf(!CHROMIUM)('Redigera hörn i riktig Chromium — två delar som sitter ihop', () => {
  for (const touch of [true, false]) {
    const namn = touch ? 'finger (touch)' : 'mus';
    it(`${namn}: utgångsläget — tre gemensamma hörn ritas EN gång (7 unika hörn, delarna har 5 + 5)`, async () => {
      await oppna(touch, async (pg) => {
        expect(await antal(pg)).toBe(7);
        expect(await ringLangder(pg)).toEqual([5, 5]);
      });
    });

    it(`${namn}: ETT tryck på en mittpunkt lägger ETT hörn där man tryckte, i båda delarna, markerat, ETT ångra-steg — inga dubbla händelser`, async () => {
      await oppna(touch, async (pg) => {
        const n0 = await antal(pg); const l0 = await ringLangder(pg);
        const p = await px(pg, await kantMitt(pg, '0,-40', '0,0'));
        await pg.evaluate(() => { (window as any).handelser = []; });
        await tryck(pg, touch, p.x + 1, p.y + 2);   // några px bredvid mittpunkten
        expect(await antal(pg)).toBe(n0 + 1);
        expect(await ringLangder(pg)).toEqual(l0.map((n) => n + 1));
        expect(await pg.evaluate(() => (window as any).steg.length)).toBe(1);
        const valt = await pg.evaluate(() => (window as any).valt);
        expect(valt).not.toBeNull();
        const nytt = await px(pg, await pg.evaluate((id: number) => (window as any).topo.horn[id], valt));
        expect(Math.abs(nytt.x - p.x)).toBeLessThan(1.5);   // hörnet ligger PÅ linjen (x = kantens x), på det tryckta stället längs den
        expect(Math.abs(nytt.y - (p.y + 2))).toBeLessThan(1.5);
        const h = await pg.evaluate(() => (window as any).handelser);
        expect(h).toContain('pointerdown');
        if (touch) { expect(h).toContain('touchstart'); expect(h).not.toContain('mousedown'); }
      });
    });

    it(`${namn}: ETT tryck på linjen mellan två hörn (inte vid mittpunkten) lägger hörnet exakt där — i båda delarna om kanten är gemensam`, async () => {
      await oppna(touch, async (pg) => {
        const n0 = await antal(pg); const l0 = await ringLangder(pg);
        const a = await px(pg, (await horn(pg, '0,0')).pt), b = await px(pg, (await horn(pg, '0,40')).pt);
        const y = a.y + (b.y - a.y) * 0.8;   // 80 % av vägen mot nästa hörn, långt från mittpunkten
        await tryck(pg, touch, a.x + 3, y);
        expect(await antal(pg)).toBe(n0 + 1);
        expect(await ringLangder(pg)).toEqual(l0.map((n) => n + 1));
        const nytt = await px(pg, await pg.evaluate(() => { const w = window as any; return w.topo.horn[w.valt]; }));
        expect(Math.abs(nytt.x - a.x)).toBeLessThan(1.5);
        expect(Math.abs(nytt.y - y)).toBeLessThan(1.5);
      });
    });

    it(`${namn}: ett tryck långt från linjen och handtagen lägger inget hörn (och avmarkerar)`, async () => {
      await oppna(touch, async (pg) => {
        const p = await px(pg, await kantMitt(pg, '0,-40', '0,0'));
        await tryck(pg, touch, p.x + 45, p.y);
        expect(await antal(pg)).toBe(7);
        expect(await pg.evaluate(() => (window as any).steg.length)).toBe(0);
      });
    });

    it(`${namn}: fem tryck längs den långa västra kanten ger fem hörn — alla på linjen, dras och ångras ett steg i taget`, async () => {
      await oppna(touch, async (pg, cdp) => {
        const a = await px(pg, (await horn(pg, '-80,40')).pt), b = await px(pg, (await horn(pg, '-80,-40')).pt);
        const tillstand: string[] = [await pg.evaluate(() => JSON.stringify((window as any).topo))];
        const lagda: { x: number; y: number }[] = [];
        for (const f of [0.17, 0.35, 0.52, 0.7, 0.88]) {
          const y = a.y + (b.y - a.y) * f;
          await tryck(pg, touch, a.x + (touch ? 5 : 2), y);   // en liten bit bredvid linjen, som ett finger
          lagda.push({ x: a.x, y });
          tillstand.push(await pg.evaluate(() => JSON.stringify((window as any).topo)));
        }
        expect(await antal(pg)).toBe(12);
        expect(await ringLangder(pg)).toEqual([10, 5]);   // bara A har västra kanten
        expect(await pg.evaluate(() => (window as any).steg.length)).toBe(5);
        const nya: number[][] = await pg.evaluate(() => { const w = window as any; return w.topo.delar[0].ring.filter((h: number) => w.steg[0].horn[h] === undefined).map((h: number) => w.topo.horn[h]); });
        expect(nya.length).toBe(5);
        for (const n of nya) { const q = await px(pg, n); expect(Math.abs(q.x - a.x)).toBeLessThan(1.5); expect(lagda.some((l) => Math.abs(l.y - q.y) < 1.5)).toBe(true); }
        // det sist lagda hörnet är markerat och går att dra direkt
        const valt = await pg.evaluate(() => (window as any).valt);
        const v = await px(pg, await pg.evaluate((id: number) => (window as any).topo.horn[id], valt));
        await dra(pg, cdp, touch, v.x, v.y, v.x - 30, v.y);
        const flyttat = await px(pg, await pg.evaluate((id: number) => (window as any).topo.horn[id], valt));
        expect(Math.abs(flyttat.x - (v.x - 30))).toBeLessThan(2);
        expect(await pg.evaluate(() => (window as any).steg.length)).toBe(6);
        // ångra ett steg i taget: dragningen, sedan de fem hörnen
        for (let i = 5; i >= 0; i--) {
          await pg.evaluate(() => { const w = window as any; const r = w.L.angraSteg(w.steg); w.steg = r.steg; w.topo = r.t; w.rita(); });
          expect(await pg.evaluate(() => JSON.stringify((window as any).topo))).toBe(tillstand[i]);
        }
        expect(await pg.evaluate(() => JSON.stringify((window as any).topo))).toBe(tillstand[0]);
        expect(await antal(pg)).toBe(7);
      });
    });

    it(`${namn}: ett drag i en GEMENSAM mittpunkt lägger till exakt ETT hörn — i båda delarna — och det är ETT ångra-steg`, async () => {
      await oppna(touch, async (pg, cdp) => {
        const n0 = await antal(pg);
        const l0 = await ringLangder(pg);
        const p = await px(pg, await kantMitt(pg, '0,-40', '0,0'));
        await dra(pg, cdp, touch, p.x, p.y, p.x + 10, p.y - 45);
        expect(await antal(pg)).toBe(n0 + 1);
        expect(await ringLangder(pg)).toEqual(l0.map((n) => n + 1));   // hörnet kom in i BÅDA delarna
        const nyttId = await pg.evaluate(() => { const w = (window as any); const a = new Set(w.topo.delar[0].ring), b = new Set(w.topo.delar[1].ring); return [...a].find((h: any) => b.has(h) && w.steg[0].horn[h] === undefined); });
        expect(nyttId).toBeTruthy();
        const nytt = await px(pg, await pg.evaluate((id: number) => (window as any).topo.horn[id], nyttId));
        expect(Math.abs(nytt.x - (p.x + 10))).toBeLessThan(2);
        expect(Math.abs(nytt.y - (p.y - 45 - (touch ? 40 : 0)))).toBeLessThan(2);
        expect(await pg.evaluate(() => (window as any).steg.length)).toBe(1);
        expect(await pg.evaluate(() => (window as any).foreAnrop)).toBe(1);
      });
    });

    it(`${namn}: ett drag i en mittpunkt på en kant som bara EN del har lägger till hörnet i den delen`, async () => {
      await oppna(touch, async (pg, cdp) => {
        const l0 = await ringLangder(pg);
        const p = await px(pg, await kantMitt(pg, '-80,-40', '0,-40'));   // A:s överkant — B har ingen del i den
        await dra(pg, cdp, touch, p.x, p.y, p.x, p.y - 50);
        expect(await ringLangder(pg)).toEqual([l0[0] + 1, l0[1]]);
      });
    });

    it(`${namn}: ett drag i ett GEMENSAMT hörn flyttar det i båda delarna`, async () => {
      await oppna(touch, async (pg, cdp) => {
        const n0 = await antal(pg);
        const gem = await horn(pg, '0,0');
        const v = await px(pg, gem.pt);
        await dra(pg, cdp, touch, v.x, v.y, v.x + 25, v.y + 40);
        expect(await antal(pg)).toBe(n0);
        const r = await pg.evaluate((id: number) => { const w = (window as any); return { hornet: w.topo.horn[id], iA: w.topo.delar[0].ring.includes(id), iB: w.topo.delar[1].ring.includes(id) }; }, gem.id);
        expect(r.iA && r.iB).toBe(true);
        const nytt = await px(pg, r.hornet);
        expect(Math.abs(nytt.x - (v.x + 25))).toBeLessThan(2);
        expect(Math.abs(nytt.y - (v.y + 40 - (touch ? 40 : 0)))).toBeLessThan(2);   // touch: hörnet ritas 40 px ovanför fingret
        // ritningen följer: båda polygonerna har hörnet på samma plats (ingen dubbel linje)
        const ritade = await pg.evaluate((id: number) => { const w = (window as any); const h = w.topo.horn[id]; return w.L.ringar(w.topo).map((r: any) => r.ring.some((q: number[]) => q[0] === h[0] && q[1] === h[1])); }, gem.id);
        expect(ritade).toEqual([true, true]);
        if (touch) {
          const logg = await pg.evaluate(() => (window as any).dragLogg.filter(Boolean));
          expect(logg.length).toBeGreaterThan(0);
          expect(logg[logg.length - 1].finger).not.toBeNull();
        }
      });
    });

    it(`${namn}: ett drag som börjar nära gränsen men utanför handtagen panorerar kartan och rör inget`, async () => {
      await oppna(touch, async (pg, cdp) => {
        const n0 = await antal(pg);
        const top0 = await pg.evaluate(() => JSON.stringify((window as any).topo));
        const p = await px(pg, await kantMitt(pg, '0,-40', '0,0'));
        const c0 = await pg.evaluate(() => (window as any).map.getCenter().lng);
        await dra(pg, cdp, touch, p.x + 38, p.y, p.x + 140, p.y, 10);   // 38 px från mittpunkten = utanför träffytan (16 px touch / 11 px mus)
        expect(await antal(pg)).toBe(n0);
        expect(await pg.evaluate(() => JSON.stringify((window as any).topo))).toBe(top0);
        const c1 = await pg.evaluate(() => (window as any).map.getCenter());
        expect(Math.abs(c1.lng - c0) + Math.abs(c1.lat - 57.0)).toBeGreaterThan(0);   // kartan flyttades
      });
    });

    it(`${namn}: efter ett drag i ett hörn panorerar kartan igen (draget släpper greppet)`, async () => {
      await oppna(touch, async (pg, cdp) => {
        const v = await px(pg, (await horn(pg, '0,0')).pt);
        await dra(pg, cdp, touch, v.x, v.y, v.x + 20, v.y + 20);
        const c0 = await pg.evaluate(() => (window as any).map.getCenter().lng);
        await dra(pg, cdp, touch, 100, 500, 300, 500, 10);   // tom yta, långt från handtagen
        const c1 = await pg.evaluate(() => (window as any).map.getCenter().lng);
        expect(Math.abs(c1 - c0)).toBeGreaterThan(0);
      });
    });

    it(`${namn}: tryck markerar ett hörn, nytt tryck avmarkerar, tryck på tom yta avmarkerar`, async () => {
      await oppna(touch, async (pg) => {
        const gem = await horn(pg, '0,40');
        const v = await px(pg, gem.pt);
        await tryck(pg, touch, v.x, v.y);
        expect(await pg.evaluate(() => (window as any).valt)).toBe(gem.id);
        await tryck(pg, touch, v.x, v.y);
        expect(await pg.evaluate(() => (window as any).valt)).toBeNull();
        await tryck(pg, touch, v.x, v.y);
        expect(await pg.evaluate(() => (window as any).valt)).toBe(gem.id);
        await tryck(pg, touch, 150, 560);   // tom yta (långt från alla linjer; den gemensamma kanten går genom x = 450)
        expect(await pg.evaluate(() => (window as any).valt)).toBeNull();
        expect(await antal(pg)).toBe(7);
      });
    });

    it(`${namn}: ångra går tillbaka ett steg i taget`, async () => {
      await oppna(touch, async (pg, cdp) => {
        const tillstand: string[] = [await pg.evaluate(() => JSON.stringify((window as any).topo))];
        for (const [a, b] of [['0,-40', '0,0'], ['80,-40', '80,40'], ['-80,40', '0,40']]) {
          const p = await px(pg, await kantMitt(pg, a, b));
          await dra(pg, cdp, touch, p.x, p.y, p.x + 6, p.y + 36);
          tillstand.push(await pg.evaluate(() => JSON.stringify((window as any).topo)));
        }
        expect(await pg.evaluate(() => (window as any).steg.length)).toBe(3);
        expect(await antal(pg)).toBe(10);
        for (let i = 2; i >= 0; i--) {
          await pg.evaluate(() => { const w = window as any; const r = w.L.angraSteg(w.steg); w.steg = r.steg; w.topo = r.t; w.rita(); });
          expect(await pg.evaluate(() => JSON.stringify((window as any).topo))).toBe(tillstand[i]);
        }
        expect(await pg.evaluate(() => (window as any).steg.length)).toBe(0);
      });
    });
  }

  for (const touch of [true, false]) {
    it(`Brokamåla 1:5 (riktig geometri, ${touch ? 'finger' : 'mus'}): fem tryck längs den längsta västra kanten → fem hörn på linjen, dra ett, spara-läge, ångra ett steg i taget`, async () => {
      const delar = ((await import('./__fixtures__/brokamala_traktdelar_2026-11-25.json')) as any).default.traktdelar.map((t: any) => ({ id: String(t.trdel), ring: t.ring }));
      await oppna(touch, async (pg, cdp) => {
        const kant = await pg.evaluate(() => (window as any).vast);
        expect(kant.meter).toBeGreaterThan(60);   // en lång sträcka
        const n0 = await antal(pg);
        const pa = await px(pg, kant.a), pb = await px(pg, kant.b);
        expect(Math.hypot(pa.x - pb.x, pa.y - pb.y)).toBeGreaterThan(150);
        const tillstand: string[] = [await pg.evaluate(() => JSON.stringify((window as any).topo))];
        for (const f of [0.15, 0.32, 0.5, 0.68, 0.85]) {
          const x = pa.x + (pb.x - pa.x) * f, y = pa.y + (pb.y - pa.y) * f;
          const n = Math.hypot(pb.y - pa.y, pb.x - pa.x);
          await tryck(pg, touch, x + (-(pb.y - pa.y) / n) * 4, y + ((pb.x - pa.x) / n) * 4);   // 4 px vinkelrätt bredvid linjen
          const valt = await pg.evaluate(() => { const w = (window as any); return w.valt; });
          expect(valt).not.toBeNull();
          const q = await px(pg, await pg.evaluate((id: number) => (window as any).topo.horn[id], valt));
          expect(Math.hypot(q.x - x, q.y - y)).toBeLessThan(1.5);   // hörnet ligger på linjen där man tryckte
          tillstand.push(await pg.evaluate(() => JSON.stringify((window as any).topo)));
        }
        expect(await antal(pg)).toBe(n0 + 5);
        expect(await pg.evaluate(() => (window as any).steg.length)).toBe(5);
        // spara-läget: det sist lagda hörnet är markerat och går att dra
        const valt = await pg.evaluate(() => (window as any).valt);
        const v = await px(pg, await pg.evaluate((id: number) => (window as any).topo.horn[id], valt));
        await dra(pg, cdp, touch, v.x, v.y, v.x - 30, v.y + 10);
        expect(await pg.evaluate(() => (window as any).steg.length)).toBe(6);
        for (let i = 5; i >= 0; i--) {
          await pg.evaluate(() => { const w = window as any; const r = w.L.angraSteg(w.steg); w.steg = r.steg; w.topo = r.t; w.rita(); });
          expect(await pg.evaluate(() => JSON.stringify((window as any).topo))).toBe(tillstand[i]);
        }
        expect(await antal(pg)).toBe(n0);
      }, delar);
    });
  }

  it('skärmbilden: två delar, gemensamma hörn ritade en gång, svaga mittpunkter, markerat hörn', async () => {
    await oppna(true, async (pg) => {
      const gem = await horn(pg, '0,0');
      await pg.evaluate((id: number) => { const w = (window as any); w.valt = id; w.rita(); }, gem.id);
      await vanta(300);
      const mapp = process.env.HORN_SKRIV;
      if (mapp) { fs.mkdirSync(mapp, { recursive: true }); await pg.screenshot({ path: path.join(mapp, 'hornredigering-hytt.png') }); }
      expect(await antal(pg)).toBe(7);
    });
  });
});
