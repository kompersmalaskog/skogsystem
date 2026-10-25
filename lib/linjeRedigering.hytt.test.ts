// @vitest-environment node
// REDIGERA LINJER I RIKTIG CHROMIUM + MAPLIBRE (2026-10-25). jsdom kan varken rita en karta eller skicka ett riktigt finger — därför körs pekaren (lib/linjeRedigeringKarta, buntad med esbuild,
// ingen kopia) mot en riktig MapLibre-karta med riktiga mus- och pekhändelser (CDP): ett drag som börjar PÅ en linje suddar/förlänger/kopplar utan att kartan flyttas, ett drag på tom mark
// panorerar som vanligt, förhandsvisningen (prickig sträcka, grön ring) finns medan man drar, och en korsande linje rörs aldrig. LINJERED_SKRIV=<mapp> sparar skärmbilderna.
// Finns ingen Chromium hoppas mätningen över.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function chromium(): { launch: (o: object) => Promise<any> } | null {
  try {
    const rot = execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    const pw = createRequire(path.join(rot, 'x.js'))('playwright');
    const mapp = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
    const ver = fs.readdirSync(mapp).filter((n) => /^chromium-\d+$/.test(n)).sort().pop();
    const exe = ver && path.join(mapp, ver, 'chrome-linux', 'chrome');
    if (!exe || !fs.existsSync(exe)) return null;
    return { launch: (o) => pw.chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'], ...o }) };
  } catch { return null; }
}
const CHROMIUM = chromium();
const MAPLIBRE = path.join(process.cwd(), 'node_modules/maplibre-gl/dist');

function buntaLib(): string {
  const mapp = fs.mkdtempSync(path.join(os.tmpdir(), 'linjered-'));
  const ingang = path.join(mapp, 'entry.ts');
  fs.writeFileSync(ingang, ['linjeRedigering', 'linjeRedigeringKarta', 'vidaDolt'].map((f) => `export * from ${JSON.stringify(path.join(process.cwd(), 'lib', f))};`).join('\n'));
  const ut = path.join(mapp, 'lib.js');
  const esbuild = createRequire(import.meta.url)('esbuild');
  esbuild.buildSync({ entryPoints: [ingang], bundle: true, format: 'iife', globalName: 'lib', outfile: ut, logLevel: 'error' });
  return ut;
}

/** A: väg genom mitten · B: korsar A i mitten · C: börjar nära A:s östra ände. */
const A: [number, number][] = [[14.9990, 57.0], [15.0010, 57.0]];
const B: [number, number][] = [[15.0, 56.9992], [15.0, 57.0008]];
const C: [number, number][] = [[15.0014, 57.0002], [15.0030, 57.0002]];

async function oppna(touch: boolean, fn: (pg: any, ctx: any) => Promise<void>): Promise<void> {
  const b = await CHROMIUM!.launch({});
  try {
    const ctx = await b.newContext({ viewport: { width: 900, height: 640 }, hasTouch: touch, isMobile: false });
    const pg = await ctx.newPage();
    await pg.setContent('<!doctype html><html><head><meta charset="utf-8"><style>html,body,#m{margin:0;height:100%}</style></head><body><div id="m"></div></body></html>');
    await pg.addStyleTag({ path: path.join(MAPLIBRE, 'maplibre-gl.css') });
    await pg.addScriptTag({ path: path.join(MAPLIBRE, 'maplibre-gl.js') });
    await pg.addScriptTag({ path: buntaLib() });
    await pg.evaluate(async (data: { A: number[][]; B: number[][]; C: number[][] }) => {
      const L = (window as any).lib; const ml = (window as any).maplibregl; const w = window as any;
      const map = new ml.Map({ container: 'm', center: [15.0, 57.0], zoom: 17, fadeDuration: 0, canvasContextAttributes: { preserveDrawingBuffer: true }, attributionControl: false,
        style: { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#3d4a2c' } }] } });
      await new Promise((r) => map.on('load', r));
      const linje = (id: string, c: number[][]) => ({ type: 'Feature', properties: { id }, geometry: { type: 'LineString', coordinates: c } });
      map.addSource('linjer', { type: 'geojson', data: { type: 'FeatureCollection', features: [linje('A', data.A), linje('B', data.B), linje('C', data.C)] } });
      map.addLayer({ id: 'vag', type: 'line', source: 'linjer', paint: { 'line-color': '#ff453a', 'line-width': 5 } });
      for (const k of [L.LINJERED_KALLA, L.LINJERED_FORHAND_KALLA]) map.addSource(k, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      // källans data går inte att läsa tillbaka: lyssnaren loggar senaste setData
      w.forhandData = { type: 'FeatureCollection', features: [] };
      const fkalla = map.getSource(L.LINJERED_FORHAND_KALLA); const sd = fkalla.setData.bind(fkalla);
      fkalla.setData = (d: any) => { w.forhandData = d; return sd(d); };
      for (const l of L.linjeRedigeringLager()) map.addLayer(l);
      w.map = map; w.L = L; w.ev = [];
      const linjerRed = [{ id: 'A', egen: true, coords: data.A, delar: [data.A] }, { id: 'B', egen: true, coords: data.B, delar: [data.B] }, { id: 'C', egen: true, coords: data.C, delar: [data.C] }];
      w.kopplaRed = (lage: string) => {
        if (w.stang) w.stang();
        w.ev = [];
        w.stang = L.kopplaLinjeRedigering(map, () => ({
          lage, linjer: () => linjerRed,
          onSudda: (id: string, iv: number[][]) => w.ev.push({ typ: 'sudda', id, iv }),
          onForlang: (id: string, ande: string, till: number[]) => w.ev.push({ typ: 'forlang', id, ande, till }),
          onKoppla: (id: string, ande: string, faste: any) => w.ev.push({ typ: 'koppla', id, ande, faste }),
          onTryck: (p: number[]) => w.ev.push({ typ: 'tryck', p }),
        }));
        const k = map.getSource(L.LINJERED_KALLA);
        if (lage === 'forlang' || lage === 'koppla') k.setData(L.andeHandtag(linjerRed, lage)); else k.setData({ type: 'FeatureCollection', features: [] });
      };
      await new Promise((r) => { map.once('idle', r); map.triggerRepaint(); });
    }, { A, B, C });
    await fn(pg, ctx);
  } finally { await b.close(); }
}

const skarm = (pg: any, lon: number, lat: number) => pg.evaluate(([x, y]: number[]) => { const p = (window as any).map.project([x, y]); return { x: p.x, y: p.y }; }, [lon, lat]);
const centrum = (pg: any) => pg.evaluate(() => (window as any).map.getCenter());
const handelser = (pg: any) => pg.evaluate(() => (window as any).ev);
const forhand = (pg: any) => pg.evaluate(() => (window as any).forhandData?.features ?? []);
const skriv = (pg: any, namn: string) => process.env.LINJERED_SKRIV ? (fs.mkdirSync(process.env.LINJERED_SKRIV, { recursive: true }), pg.screenshot({ path: path.join(process.env.LINJERED_SKRIV, `${namn}.png`) })) : Promise.resolve();
const flyttat = (a: any, b: any) => Math.abs(a.lng - b.lng) + Math.abs(a.lat - b.lat) > 1e-5;

/** Ett drag med mus eller finger i flera steg; `mitt` körs medan pekaren är nere (förhandsvisningen mäts där). */
async function dra(pg: any, ctx: any, finger: boolean, fran: { x: number; y: number }, till: { x: number; y: number }, mitt?: () => Promise<void>): Promise<void> {
  const steg = 10;
  if (finger) {
    const cdp = await ctx.newCDPSession(pg);
    const p = (x: number, y: number) => [{ x, y, id: 1 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: p(fran.x, fran.y) });
    for (let i = 1; i <= steg; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: p(fran.x + ((till.x - fran.x) * i) / steg, fran.y + ((till.y - fran.y) * i) / steg) });
    if (mitt) await mitt();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await pg.mouse.move(fran.x, fran.y); await pg.mouse.down();
    await pg.mouse.move(till.x, till.y, { steps: steg });
    if (mitt) await mitt();
    await pg.mouse.up();
  }
}

describe.skipIf(!CHROMIUM)('Redigera linjer i riktig webbläsare', () => {
  for (const finger of [false, true]) {
    const vem = finger ? 'finger' : 'mus';

    it(`SUDDA (${vem}): drag längs A suddar bara A — den korsande B rörs aldrig, kartan flyttas inte, delen är prickig medan man drar`, async () => {
      await oppna(finger, async (pg, ctx) => {
        await pg.evaluate(() => (window as any).kopplaRed('sudda'));
        const a1 = await skarm(pg, 14.9996, 57.0); const a2 = await skarm(pg, 15.0004, 57.0);   // över B (som korsar vid 15.0)
        const fore = await centrum(pg);
        let mitt: any[] = [];
        await dra(pg, ctx, finger, a1, a2, async () => { mitt = await forhand(pg); await skriv(pg, `sudda-${vem}-mitt`); });
        expect(mitt.some((f: any) => f.properties.slag === 'sudda')).toBe(true);        // prickig förhandsvisning medan man drar
        expect(flyttat(fore, await centrum(pg))).toBe(false);                            // kartan stod still
        const ev = await handelser(pg);
        expect(ev).toHaveLength(1);
        expect(ev[0]).toMatchObject({ typ: 'sudda', id: 'A' });                           // bara A
        const iv = ev[0].iv as number[][];
        expect(iv).toHaveLength(1);
        const langd = await pg.evaluate(([lng0, lng1]: number[]) => (window as any).L.avstandM([lng0, 57.0], [lng1, 57.0]), [14.9996, 15.0004]);
        expect(iv[0][1] - iv[0][0]).toBeGreaterThan(langd * 0.9);                         // hela draget (+ lite pensel åt sidorna)
        expect(iv[0][1] - iv[0][0]).toBeLessThan(langd + 12);
        expect(await forhand(pg)).toHaveLength(0);                                        // förhandsvisningen är borta efteråt
      });
    }, 120000);

    it(`SUDDA (${vem}): ett drag som börjar på TOM mark panorerar kartan och suddar ingenting, även om det korsar en linje`, async () => {
      await oppna(finger, async (pg, ctx) => {
        await pg.evaluate(() => (window as any).kopplaRed('sudda'));
        const fore = await centrum(pg);
        const a = await skarm(pg, 14.9996, 57.0);
        await dra(pg, ctx, finger, { x: a.x, y: a.y - 150 }, { x: a.x + 200, y: a.y + 60 });   // börjar 150 px norr om A, korsar den
        expect(flyttat(fore, await centrum(pg))).toBe(true);
        expect(await handelser(pg)).toHaveLength(0);
      });
    }, 120000);

    it(`FÖRLÄNG (${vem}): drag i A:s östra ände ger en förlängning dit pekaren släpptes, utan att kartan flyttas`, async () => {
      await oppna(finger, async (pg, ctx) => {
        await pg.evaluate(() => (window as any).kopplaRed('forlang'));
        const slut = await skarm(pg, 15.0010, 57.0);
        const fore = await centrum(pg);
        const dit = { x: slut.x + 60, y: slut.y - 70 };
        await dra(pg, ctx, finger, { x: slut.x + 4, y: slut.y + 3 }, dit, async () => { expect((await forhand(pg)).some((f: any) => f.properties.slag === 'forlang')).toBe(true); });
        expect(flyttat(fore, await centrum(pg))).toBe(false);
        const ev = await handelser(pg);
        expect(ev).toHaveLength(1);
        expect(ev[0]).toMatchObject({ typ: 'forlang', id: 'A', ande: 'slut' });
        const p = await skarm(pg, ev[0].till[0], ev[0].till[1]);
        expect(Math.hypot(p.x - dit.x, p.y - dit.y)).toBeLessThan(3);
      });
    }, 120000);

    it(`KOPPLA IHOP (${vem}): en ände nära en annan linjes ände tänder en grön ring och fäster när man släpper`, async () => {
      await oppna(finger, async (pg, ctx) => {
        await pg.evaluate(() => (window as any).kopplaRed('koppla'));
        const aSlut = await skarm(pg, 15.0010, 57.0);
        const cStart = await skarm(pg, 15.0014, 57.0002);
        let mitt: any[] = [];
        await dra(pg, ctx, finger, aSlut, { x: cStart.x - 6, y: cStart.y + 5 }, async () => { mitt = await forhand(pg); await skriv(pg, `koppla-${vem}-mitt`); });
        expect(mitt.some((f: any) => f.properties.slag === 'ring')).toBe(true);
        const ev = await handelser(pg);
        expect(ev).toHaveLength(1);
        expect(ev[0]).toMatchObject({ typ: 'koppla', id: 'A', ande: 'slut', faste: { typ: 'ande', id: 'C', ande: 'start' } });
      });
    }, 120000);

    it(`KOPPLA IHOP (${vem}): släpps änden långt från alla linjer händer ingenting och ingen ring syns`, async () => {
      await oppna(finger, async (pg, ctx) => {
        await pg.evaluate(() => (window as any).kopplaRed('koppla'));
        const aSlut = await skarm(pg, 15.0010, 57.0);
        let mitt: any[] = [];
        await dra(pg, ctx, finger, aSlut, { x: aSlut.x + 40, y: aSlut.y + 150 }, async () => { mitt = await forhand(pg); });
        expect(mitt.some((f: any) => f.properties.slag === 'ring')).toBe(false);
        expect(await handelser(pg)).toHaveLength(0);
      });
    }, 120000);
  }

  it('ett kort tryck på tom mark rapporteras som tryck (för att ta tillbaka en dold sträcka); ett drag gör det inte', async () => {
    await oppna(false, async (pg, ctx) => {
      await pg.evaluate(() => (window as any).kopplaRed('sudda'));
      await pg.mouse.move(150, 120); await pg.mouse.down(); await pg.mouse.up();
      expect((await handelser(pg)).filter((e: any) => e.typ === 'tryck')).toHaveLength(1);
      await pg.evaluate(() => { (window as any).ev = []; });
      await dra(pg, ctx, false, { x: 150, y: 120 }, { x: 250, y: 160 });
      expect((await handelser(pg)).filter((e: any) => e.typ === 'tryck')).toHaveLength(0);
    });
  }, 120000);

  it('avkopplas läget släpps panoreringen och inga fler drag fångas', async () => {
    await oppna(false, async (pg, ctx) => {
      await pg.evaluate(() => (window as any).kopplaRed('sudda'));
      await pg.evaluate(() => { const w = window as any; w.stang(); w.stang = null; });
      const a1 = await skarm(pg, 14.9996, 57.0); const a2 = await skarm(pg, 15.0004, 57.0);
      const fore = await centrum(pg);
      await dra(pg, ctx, false, a1, a2);
      expect(flyttat(fore, await centrum(pg))).toBe(true);     // panorerar igen
      expect(await handelser(pg)).toHaveLength(0);
      expect(await pg.evaluate(() => (window as any).map.dragPan.isEnabled())).toBe(true);
    });
  }, 120000);

  it('panoreringen är på igen efter ett sudda-drag', async () => {
    await oppna(false, async (pg, ctx) => {
      await pg.evaluate(() => (window as any).kopplaRed('sudda'));
      const a1 = await skarm(pg, 14.9996, 57.0); const a2 = await skarm(pg, 15.0004, 57.0);
      await dra(pg, ctx, false, a1, a2);
      expect(await pg.evaluate(() => (window as any).map.dragPan.isEnabled())).toBe(true);
    });
  }, 120000);

  it('ARVIDSTORP (riktiga vägar ur prod, läst 2026-10-25): ett drag mitt över den längsta vägen delar den i två, med mus och med finger och körordningen följer med', async () => {
    const fx = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'lib/__fixtures__/korordning_arvidstorp_2026-10-25.json'), 'utf8'));
    const vagar: Array<{ id: string; coords: number[][]; nummer: number; farg: string }> = fx.vagar;
    for (const finger of [false, true]) {
      await oppna(finger, async (pg, ctx) => {
        await pg.evaluate(({ vagar, mitt }: any) => {
          const w = window as any; const map = w.map; const L = w.L;
          map.jumpTo({ center: mitt, zoom: 17 });
          const linjerRed = vagar.map((v: any) => ({ id: v.id, egen: true, coords: v.coords, delar: [v.coords] }));
          if (w.stang) w.stang();
          w.ev = [];
          w.stang = L.kopplaLinjeRedigering(map, () => ({ lage: 'sudda', linjer: () => linjerRed,
            onSudda: (id: string, iv: number[][]) => w.ev.push({ typ: 'sudda', id, iv }), onForlang: () => {}, onKoppla: () => {}, onTryck: () => {} }));
        }, { vagar, mitt: (() => { const l = [...vagar].sort((a, b) => b.coords.length - a.coords.length)[0]; return l.coords[Math.floor(l.coords.length / 2)]; })() });
        await pg.evaluate(() => new Promise((r) => { const m = (window as any).map; m.once('idle', r); m.triggerRepaint(); }));
        // den vägen som ligger mitt i bild: dra längs dess mittbit
        const langsta = [...vagar].sort((a, b) => b.coords.length - a.coords.length)[0];
        const i = Math.floor(langsta.coords.length / 2);
        const p0 = await skarm(pg, langsta.coords[i - 2][0], langsta.coords[i - 2][1]);
        const p1 = await skarm(pg, langsta.coords[i + 2][0], langsta.coords[i + 2][1]);
        await dra(pg, ctx, finger, p0, p1, async () => { await skriv(pg, `arvidstorp-${finger ? 'finger' : 'mus'}-mitt`); });
        const ev = await handelser(pg);
        expect(ev.length).toBe(1);
        expect(ev[0].id).toBe(langsta.id);
        // den rena logiken på samma indata: två bitar, samma färg, körordningen följer med
        const ut = await pg.evaluate(({ langsta, iv }: any) => {
          const L = (window as any).L;
          const markers = [{ id: langsta.id, lineType: 'mainRoad', farg: langsta.farg, isLine: true, nummer: langsta.nummer, ordning: 1, path: langsta.coords.map((c: number[]) => ({ x: c[0], y: c[1] })) }];
          let n = 9000;
          const r = L.suddaMarkor(markers, langsta.id, iv, { tillLngLat: (p: any) => [p.x, p.y], tillSvg: (c: number[]) => ({ x: c[0], y: c[1] }), nyttId: () => n++ });
          return { antal: r.markers.length, farger: r.markers.map((m: any) => m.farg), ordning: r.markers.map((m: any) => m.ordning), nummer: r.markers.map((m: any) => m.nummer ?? null) };
        }, { langsta, iv: ev[0].iv });
        expect(ut.antal).toBe(2);
        expect(ut.farger).toEqual([langsta.farg, langsta.farg]);
        expect(ut.ordning).toEqual([1, 2]);
        expect(ut.nummer).toEqual([langsta.nummer, null]);
      });
    }
  }, 180000);

  it('LISTEN på 390 px (telefon): alla knappar ≥ 44 px, inget går utanför skärmen, fyra lägen på en rad', async () => {
    // Listen renderas till HTML med react-dom/server (samma komponent och samma tokens) och mäts i Chromium.
    const esbuild = createRequire(import.meta.url)('esbuild');
    const mapp = fs.mkdtempSync(path.join(os.tmpdir(), 'linjered-list-'));
    const ingang = path.join(mapp, 'entry.tsx');
    fs.writeFileSync(ingang, `import React from 'react'; import { renderToStaticMarkup } from 'react-dom/server'; import { LinjeRedList } from ${JSON.stringify(path.join(process.cwd(), 'components/planering/LinjeRedList'))};
      (window as any).html = (smal: boolean) => renderToStaticMarkup(<LinjeRedList lage="koppla" smal={smal} kanAngra={true} onVal={() => {}} onAngra={() => {}} onKlar={() => {}} />);`);
    const ut = path.join(mapp, 'l.js');
    esbuild.buildSync({ entryPoints: [ingang], bundle: true, format: 'iife', outfile: ut, logLevel: 'error', jsx: 'automatic', nodePaths: [path.join(process.cwd(), 'node_modules')], alias: { '@': process.cwd() }, define: { 'process.env.NODE_ENV': '"production"' } });
    const b = await CHROMIUM!.launch({});
    try {
      for (const bredd of [390, 360, 820]) {
        const pg = await (await b.newContext({ viewport: { width: bredd, height: 760 } })).newPage();
        await pg.setContent('<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#000}</style></head><body></body></html>');
        await pg.addScriptTag({ path: ut });
        await pg.evaluate((smal: boolean) => { document.body.innerHTML = (window as any).html(smal); }, bredd < 700);
        const m = await pg.evaluate(() => {
          const knappar = [...document.querySelectorAll('button')].map((k) => { const r = k.getBoundingClientRect(); return { t: k.textContent, w: r.width, h: r.height, l: r.left, r: r.right, ok: k.scrollWidth <= k.clientWidth + 1 }; });
          const lista = document.querySelector('[data-testid="linjered-list"] > div')!.getBoundingClientRect();
          return { knappar, lista: { l: lista.left, r: lista.right, t: lista.top, b: lista.bottom }, bredd: document.documentElement.scrollWidth };
        });
        for (const k of m.knappar) { expect(k.h, `${bredd}: ${k.t}`).toBeGreaterThanOrEqual(44); expect(k.w, `${bredd}: ${k.t}`).toBeGreaterThanOrEqual(44); expect(k.ok, `${bredd}: ${k.t} ryms`).toBe(true); }
        expect(m.lista.l).toBeGreaterThanOrEqual(0); expect(m.lista.r).toBeLessThanOrEqual(bredd); expect(m.lista.b).toBeLessThanOrEqual(760);
        expect(m.bredd).toBeLessThanOrEqual(bredd);
        await skriv(pg, `lista-${bredd}`);
      }
    } finally { await b.close(); }
  }, 120000);
});
