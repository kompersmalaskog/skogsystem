// @vitest-environment node
// KÖRVYNS EGEN ZOOM I RIKTIG CHROMIUM + MAPLIBRE, MED RIKTIG TOUCH (2026-11-23). Riktiga delar: kartan (MapLibre, riktiga hjul-, drag- och nyp-gester), komponenterna
// (CentreraKnapp, CentreraZoomVal, KorvyKvitto), hooken (useKorvyGrundzoom) och lib/korvyZoom, buntade med esbuild. Det som är EN KOPIA av sidans limkod är de
// femton raderna i `App` nedan (följ-tick, Centrera, Spara) — sidans egen inkoppling vaktas ordagrant i `korvyZoom.vakter.test.ts`. Scenarierna är Martins:
// zooma ut → Centrera → sparad nivå · håll in → Spara → "Zoomen sparad" → centreras på den nya nivån · dra och zooma in → Centrera → sparad nivå ·
// närhet inom 100 m → relativt den sparade nivån → tillbaka · omstart → samma nivå · håll in → tryck utanför → ingenting sparas.
// Finns ingen Chromium hoppas mätningen över. ZOOM_SKRIV=<mapp> sparar skärmbilderna av valet och bekräftelsen.
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';
import { hittaChromium, KARTA_ARGS } from './testStod/chromium';

const CHROMIUM = hittaChromium(KARTA_ARGS);
const MAPLIBRE = path.join(process.cwd(), 'node_modules/maplibre-gl/dist');
const ORIGIN = 'https://zoomtest.invalid';
const BAS = 17.5;

const HARNESS = `
import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CentreraKnapp, CentreraZoomVal } from '@/components/planering/CentreraKnapp';
import { KorvyKvitto } from '@/components/planering/KorvyKvitto';
import { useKorvyGrundzoom } from '@/lib/hooks/useKorvyGrundzoom';
import { narhetsZoom, ZOOM_KVITTO_MS } from '@/lib/korvyZoom';
declare const maplibregl: any;
const W = window as any;
const FALLNING_M = 40;

function App() {
  const { grundzoomRef, spara } = useKorvyGrundzoom(W.__maskin);
  const behallare = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const zoomRef = useRef<number>(grundzoomRef.current);
  const pausRef = useRef(false);
  const distRef = useRef<number | null>(null);
  const [pausad, setPausad] = useState(false);
  const [val, setVal] = useState(false);
  const [kvitto, setKvitto] = useState(false);
  pausRef.current = pausad;

  useEffect(() => {
    const map = new maplibregl.Map({ container: behallare.current, center: [15, 57], zoom: grundzoomRef.current, fadeDuration: 0, attributionControl: false,
      style: { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#3d4a2c' } }] } });
    mapRef.current = map;
    // sidans: nyp, hjul och drag (äkta gest = originalEvent) pausar följet
    const paus = (e: any) => { if (e && e.originalEvent) setPausad(true); };
    map.on('dragstart', paus);
    map.on('zoomstart', paus);   // nyp har originalEvent redan här
    map.on('zoom', paus);        // hjulet först på zoom-bilderna (uppmätt: zoomstart saknar originalEvent vid hjul)
    W.__map = map;
    // sidans följ-tick: lerp mot närhets-zoomen räknad från förarens grundzoom
    W.__tick = (dist: number | null) => {
      distRef.current = dist;
      if (pausRef.current) return;
      const raw = narhetsZoom(dist, grundzoomRef.current, FALLNING_M);
      zoomRef.current += (raw - zoomRef.current) * 0.35;
      map.jumpTo({ center: [15, 57], zoom: zoomRef.current });
    };
    return () => map.remove();
  }, []);

  useEffect(() => { if (!pausad) setVal(false); }, [pausad]);
  useEffect(() => { if (!kvitto) return; const t = setTimeout(() => setKvitto(false), ZOOM_KVITTO_MS); return () => clearTimeout(t); }, [kvitto]);

  // sidans centreraTryck (körvyn)
  const centrera = () => {
    setPausad(false);
    const zoom = narhetsZoom(distRef.current, grundzoomRef.current, FALLNING_M);
    zoomRef.current = zoom;
    mapRef.current.jumpTo({ center: [15, 57], zoom });
  };
  // sidans sparaZoomNu
  const sparaNu = () => {
    setVal(false);
    const z = spara(mapRef.current.getZoom());
    if (z == null) return;
    zoomRef.current = z;
    setPausad(false);
    mapRef.current.jumpTo({ center: [15, 57], zoom: z });
    setKvitto(true);
  };

  return (
    <>
      <div ref={behallare} style={{ position: 'fixed', inset: 0 }} />
      <CentreraKnapp synlig={pausad} onTryck={centrera} onHall={() => setVal(true)} />
      {val && pausad && <CentreraZoomVal onSpara={sparaNu} onStang={() => setVal(false)} />}
      {kvitto && <KorvyKvitto text="Zoomen sparad" ton="ok" smal={true} />}
    </>
  );
}

createRoot(document.getElementById('app')!).render(<App />);
`;

async function bunta(): Promise<string> {
  const r = await build({
    stdin: { contents: HARNESS, resolveDir: process.cwd(), loader: 'tsx', sourcefile: 'korvyZoomHarness.tsx' },
    bundle: true, write: false, format: 'iife', platform: 'browser', alias: { '@': process.cwd() }, jsx: 'automatic', logLevel: 'silent',
    define: { 'process.env.NODE_ENV': '"production"' },
  });
  return r.outputFiles[0].text;
}

async function oppna(b: any, kod: string, maskin: string) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const pg = await ctx.newPage();
  await pg.route(`${ORIGIN}/**`, (rt: any) => rt.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%;background:#000;font-family:-apple-system,system-ui,sans-serif}</style></head><body><div id="app"></div></body></html>' }));
  await pg.goto(`${ORIGIN}/`);
  await pg.addStyleTag({ path: path.join(MAPLIBRE, 'maplibre-gl.css') });
  await pg.addScriptTag({ path: path.join(MAPLIBRE, 'maplibre-gl.js') });
  await pg.evaluate((m: string) => { (window as any).__maskin = m; }, maskin);
  await pg.addScriptTag({ content: kod });
  await pg.waitForFunction(() => !!(window as any).__map && (window as any).__map.loaded());
  const cdp = await ctx.newCDPSession(pg);
  return { ctx, pg, cdp };
}

const zoom = (pg: any): Promise<number> => pg.evaluate(() => (window as any).__map.getZoom());
const tick = (pg: any, dist: number | null, n = 1) => pg.evaluate(({ d, n }: any) => { for (let i = 0; i < n; i++) (window as any).__tick(d); }, { d: dist, n });
const sparad = (pg: any, maskin: string): Promise<string | null> => pg.evaluate((m: string) => localStorage.getItem('korvy_grundzoom_v1:' + m), maskin);
const centreraSynlig = (pg: any): Promise<boolean> => pg.evaluate(() => { const k = document.querySelector('[data-testid="centrera-knapp"]') as HTMLElement; return k.getAttribute('aria-hidden') === 'false' && getComputedStyle(k).opacity === '1'; });
const finns = (pg: any, id: string): Promise<boolean> => pg.evaluate((i: string) => !!document.querySelector(`[data-testid="${i}"]`), id);
const mitt = async (pg: any, id: string) => { const r = await pg.evaluate((i: string) => { const b = (document.querySelector(`[data-testid="${i}"]`) as HTMLElement).getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }, id); return r as { x: number; y: number }; };
const vanta = (pg: any, ms: number) => pg.waitForTimeout(ms);

/** Zooma ut med hjulet (riktiga wheel-händelser på kartan). */
async function hjul(pg: any, delta: number) {
  await pg.mouse.move(195, 300);
  for (let i = 0; i < 4; i++) { await pg.mouse.wheel(0, delta); await vanta(pg, 60); }
  await vanta(pg, 800);   // scrollZoom animerar ut; vänta tills kartan stannat
}
const hjulUt = (pg: any, delta = 500) => hjul(pg, delta);
const hjulIn = (pg: any, delta = -500) => hjul(pg, delta);

/** Riktigt nyp med två fingrar (CDP-touch): från `fran` till `till` px mellan fingrarna. */
async function nyp(cdp: any, cx: number, cy: number, fran: number, till: number) {
  const pkt = (d: number) => [{ x: cx - d / 2, y: cy, id: 1 }, { x: cx + d / 2, y: cy, id: 2 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pkt(fran) });
  const steg = 12;
  for (let i = 1; i <= steg; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pkt(fran + ((till - fran) * i) / steg) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/** Håll fingret på en punkt i `ms` (CDP-touch) och släpp. */
async function hall(pg: any, cdp: any, x: number, y: number, ms: number) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  await vanta(pg, ms);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await vanta(pg, 100);
}

describe.skipIf(!CHROMIUM)('Körvyns egen zoom — riktig Chromium + MapLibre + touch', () => {
  it('Martins scenarier: zooma ut → Centrera · håll in → utanför · håll in → Spara → centreras · dra + zooma → Centrera · närhet · omstart', async () => {
    const kod = await bunta();
    const b = await CHROMIUM!.launch({});
    const M = 'R64428';
    const skriv = process.env.ZOOM_SKRIV;
    try {
      const { pg, cdp } = await oppna(b, kod, M);
      await pg.evaluate(() => localStorage.clear());

      // 0. utan sparad zoom: standard, och Centrera är dold medan kartan följer
      await tick(pg, null, 20);
      expect(await zoom(pg)).toBeCloseTo(BAS, 1);
      expect(await centreraSynlig(pg)).toBe(false);

      // 1. ZOOMA UT (hjul) → följet pausar, Centrera syns, och en GPS-tick rör inte zoomen
      await hjulUt(pg);
      const utzoomad = await zoom(pg);
      expect(utzoomad).toBeLessThan(BAS - 0.5);
      expect(await centreraSynlig(pg)).toBe(true);
      await tick(pg, null, 10);
      expect(await zoom(pg)).toBeCloseTo(utzoomad, 5);

      // 2. CENTRERA (kort tryck) → standardzoomen, inte den utzoomade; knappen försvinner
      let p = await mitt(pg, 'centrera-knapp');
      await pg.touchscreen.tap(p.x, p.y);
      await vanta(pg, 200);
      expect(await zoom(pg)).toBeCloseTo(BAS, 5);
      expect(await centreraSynlig(pg)).toBe(false);

      // 3. NYP ut (riktigt tvåfingersnyp) pausar på samma sätt som drag och hjul
      await nyp(cdp, 195, 300, 220, 80);
      await vanta(pg, 400);
      const nypt = await zoom(pg);
      expect(nypt).toBeLessThan(BAS - 0.3);
      expect(await centreraSynlig(pg)).toBe(true);

      // 4. HÅLL IN Centrera (0,7 s) → valet; ett tryck utanför stänger det och INGENTING sparas (kartan står kvar utzoomad)
      p = await mitt(pg, 'centrera-knapp');
      await hall(pg, cdp, p.x, p.y, 700);
      expect(await finns(pg, 'centrera-zoomval')).toBe(true);
      expect((await pg.evaluate(() => document.querySelector('[data-testid="centrera-zoomval"]')!.textContent))).toBe('Spara den här zoomen');
      if (skriv) { fs.mkdirSync(skriv, { recursive: true }); await pg.screenshot({ path: path.join(skriv, 'valet-spara-den-har-zoomen.png') }); }
      await pg.touchscreen.tap(60, 200);   // utanför
      await vanta(pg, 200);
      expect(await finns(pg, 'centrera-zoomval')).toBe(false);
      expect(await sparad(pg, M)).toBeNull();
      expect(await zoom(pg)).toBeCloseTo(nypt, 3);
      expect(await centreraSynlig(pg)).toBe(true);   // följet är fortfarande pausat: valet ändrade inget

      // 5. HÅLL IN → "Spara den här zoomen": aktuell zoom blir grundzoomen, kartan centreras på den nivån, "Zoomen sparad" syns ~1,5 s
      p = await mitt(pg, 'centrera-knapp');
      await hall(pg, cdp, p.x, p.y, 700);
      expect(await finns(pg, 'centrera-zoomval')).toBe(true);
      const spara = await mitt(pg, 'centrera-zoomval-spara');
      await pg.touchscreen.tap(spara.x, spara.y);
      await vanta(pg, 200);
      const grund = Number(await sparad(pg, M));
      expect(grund).toBeCloseTo(nypt, 2);
      expect(await zoom(pg)).toBeCloseTo(grund, 2);
      expect(await centreraSynlig(pg)).toBe(false);
      expect(await finns(pg, 'korvy-kvitto')).toBe(true);
      expect(await pg.evaluate(() => document.querySelector('[data-testid="korvy-kvitto"]')!.textContent)).toBe('Zoomen sparad');
      if (skriv) await pg.screenshot({ path: path.join(skriv, 'bekraftelsen-zoomen-sparad.png') });
      await vanta(pg, 1700);
      expect(await finns(pg, 'korvy-kvitto')).toBe(false);

      // 6. DRA kartan och zooma IN → Centrera → den SPARADE nivån (inte standard, inte den inzoomade)
      await pg.mouse.move(195, 400); await pg.mouse.down(); await pg.mouse.move(120, 300, { steps: 6 }); await pg.mouse.up();
      await hjulIn(pg, -500);
      expect(await zoom(pg)).toBeGreaterThan(grund + 0.3);
      expect(await centreraSynlig(pg)).toBe(true);
      p = await mitt(pg, 'centrera-knapp');
      await pg.touchscreen.tap(p.x, p.y);
      await vanta(pg, 200);
      expect(await zoom(pg)).toBeCloseTo(grund, 2);

      // 7. NÄRHET inom 100 m: zoomar in relativt den sparade nivån (halvvägs i rampen = +0,25), full inom 40 m (+0,5), och tillbaka när det är passerat
      await tick(pg, 70, 60);
      expect(await zoom(pg)).toBeCloseTo(grund + 0.25, 2);
      await tick(pg, 30, 60);
      expect(await zoom(pg)).toBeCloseTo(grund + 0.5, 2);
      await tick(pg, null, 80);
      expect(await zoom(pg)).toBeCloseTo(grund, 2);

      // 8. OMSTART av körvyn (sidan laddas om): samma sparade nivå från start
      await pg.reload();
      await pg.addStyleTag({ path: path.join(MAPLIBRE, 'maplibre-gl.css') });
      await pg.addScriptTag({ path: path.join(MAPLIBRE, 'maplibre-gl.js') });
      await pg.evaluate((m: string) => { (window as any).__maskin = m; }, M);
      await pg.addScriptTag({ content: kod });
      await pg.waitForFunction(() => !!(window as any).__map && (window as any).__map.loaded());
      expect(await zoom(pg)).toBeCloseTo(grund, 2);
      await tick(pg, null, 20);
      expect(await zoom(pg)).toBeCloseTo(grund, 2);
    } finally { await b.close(); }
  }, 240000);

  it('en annan maskin har standardzoomen — valet är per maskin', async () => {
    const kod = await bunta();
    const b = await CHROMIUM!.launch({});
    try {
      const { pg } = await oppna(b, kod, 'PONS20SDJAA270231');
      await pg.evaluate(() => { localStorage.clear(); localStorage.setItem('korvy_grundzoom_v1:R64428', '16.3'); });
      await pg.reload();
      await pg.addStyleTag({ path: path.join(MAPLIBRE, 'maplibre-gl.css') });
      await pg.addScriptTag({ path: path.join(MAPLIBRE, 'maplibre-gl.js') });
      await pg.evaluate(() => { (window as any).__maskin = 'PONS20SDJAA270231'; });
      await pg.addScriptTag({ content: kod });
      await pg.waitForFunction(() => !!(window as any).__map && (window as any).__map.loaded());
      expect(await zoom(pg)).toBeCloseTo(BAS, 2);
    } finally { await b.close(); }
  }, 120000);
});
