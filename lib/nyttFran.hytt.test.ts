// @vitest-environment node
// "NYTT FRÅN …" I RIKTIG CHROMIUM + MAPLIBRE, MED RIKTIG TOUCH (2026-11-24). Riktiga delar: kartan (MapLibre), raden (NyttFranRad), hooken (useNyttFranPlaneraren), larmens pulslager
// (lib/larm/pulsKarta) och reglerna (lib/nyttFranPlaneraren), buntade med esbuild. Det som är EN kopia av sidans limkod är `nyttVisa` + pulsen i `App` nedan (sidans egna rader vaktas
// i lib/nyttFranPlaneraren.vakter.test.ts). Scenarierna: en ändring från en annan → rad → tryck → kartan flyger dit och pulserar 5 s · tre ändringar → "3 nya", i tur och ordning ·
// egen ändring → ingen rad · fara → röd, Viktigt-kommentar → gul, annars neutral. NYTT_SKRIV=<mapp> sparar skärmbilderna (neutral, gul, röd).
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';
import { hittaChromium, KARTA_ARGS } from './testStod/chromium';

const CHROMIUM = hittaChromium(KARTA_ARGS);
const MAPLIBRE = path.join(process.cwd(), 'node_modules/maplibre-gl/dist');
const ORIGIN = 'https://nyttfran.invalid';

const HARNESS = `
import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { NyttFranRad, NYTT_RAD_HOJD_PX } from '@/components/planering/NyttFranRad';
import { useNyttFranPlaneraren } from '@/lib/hooks/useNyttFranPlaneraren';
import { markeringPlats, NYTT_PULS_MS } from '@/lib/nyttFranPlaneraren';
import { PULS_KALLA, pulsData, pulsLagerSpecar, pulsPaint } from '@/lib/larm/pulsKarta';
import { FARG } from '@/lib/design/tokens';
declare const maplibregl: any;
const W = window as any;
const svg = (x: number, y: number) => ({ lat: 57 + y / 1e5, lon: 15 + x / 1e5 });
const YTA_MAX_ZOOM = 18;

function App() {
  const behallare = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const timer = useRef<any>(null);
  const [ytaPuls, setYtaPuls] = useState<any>(null);
  const [komm, setKomm] = useState<any[]>([]);
  const [pausad, setPausad] = useState(false);
  W.__setKomm = setKomm;

  useEffect(() => {
    const map = new maplibregl.Map({ container: behallare.current, center: [15, 57], zoom: 15, fadeDuration: 0, attributionControl: false,
      style: { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#3d4a2c' } }] } });
    mapRef.current = map; W.__map = map;
    map.on('load', () => {
      map.addSource(PULS_KALLA, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      for (const l of pulsLagerSpecar()) map.addLayer(l);
      W.__klar = true;
    });
    return () => map.remove();
  }, []);

  // sidans nyttVisa
  const nyttVisa = (post: any) => {
    const map = mapRef.current; const plats = post.plats;
    if (!map || !plats) return;
    setPausad(true);
    const padding = { top: 170, bottom: 130, left: 60, right: 60 };
    const punkt = plats.bounds[0][0] === plats.bounds[1][0] && plats.bounds[0][1] === plats.bounds[1][1];
    if (punkt) map.easeTo({ center: [plats.lng, plats.lat], zoom: Math.max(map.getZoom(), 17.5), padding, duration: 800 });
    else map.fitBounds(plats.bounds, { padding, maxZoom: YTA_MAX_ZOOM, duration: 800 });
    if (timer.current) clearTimeout(timer.current);
    setYtaPuls({ id: 'nytt:' + post.nyckel, farg: post.ton === 'fara' ? FARG.rod : post.ton === 'viktigt' ? FARG.gul : FARG.text, geometri: plats.geometri });
    timer.current = setTimeout(() => setYtaPuls(null), NYTT_PULS_MS);
  };
  const nytt = useNyttFranPlaneraren({
    objektId: 'o1', aktiv: true, minId: 'jag', kommentarer: komm, kommentarerLaddad: true,
    markeringPlats: (m) => markeringPlats(m, svg),
    nyckelPlats: (nyckel) => (nyckel === 'marker:77' ? markeringPlats({ id: 77, isMarker: true, x: 0, y: 300 }, svg) : null),
    pos: { lat: 57, lon: 15 }, onVisa: nyttVisa,
  });
  W.__hamta = nytt.hamtadMarkeringar;

  useEffect(() => {
    const map = mapRef.current; if (!map || !W.__klar) return;
    const src = map.getSource(PULS_KALLA); if (!src) return;
    src.setData(pulsData(ytaPuls, { lat: 57, lon: 15 }));
    if (!ytaPuls) return;
    const t = setInterval(() => { for (const [l, e] of Object.entries(pulsPaint(0.5)) as any) for (const [k, v] of Object.entries(e) as any) map.setPaintProperty(l, k, v); }, 100);
    return () => clearInterval(t);
  }, [ytaPuls]);

  return (
    <>
      <div ref={behallare} style={{ position: 'fixed', inset: 0 }} />
      <div style={{ position: 'fixed', left: 16, top: 12, height: 56, right: 16, background: '#1c1c1e', color: '#fff', borderRadius: 12, display: 'flex', alignItems: 'center', padding: '0 16px', font: '600 17px system-ui' }}>Brokamåla · objektpillen</div>
      {nytt.rad && (
        <NyttFranRad text={nytt.rad.text} ton={nytt.rad.ton} antal={nytt.rad.antal} onTryck={nytt.tryck} top={'calc(env(safe-area-inset-top, 0px) + 12px + 56px + 8px)'} />
      )}
    </>
  );
}
createRoot(document.getElementById('app')!).render(<App />);
`;

async function bunta(): Promise<string> {
  const r = await build({
    stdin: { contents: HARNESS, resolveDir: process.cwd(), loader: 'tsx', sourcefile: 'nyttFranHarness.tsx' },
    bundle: true, write: false, format: 'iife', platform: 'browser', alias: { '@': process.cwd() }, jsx: 'automatic', logLevel: 'silent',
    define: { 'process.env.NODE_ENV': '"production"' },
  });
  return r.outputFiles[0].text;
}

async function oppna(b: any, kod: string) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const pg = await ctx.newPage();
  await pg.route(`${ORIGIN}/**`, (rt: any) => rt.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#000;font-family:-apple-system,BlinkMacSystemFont,Inter,system-ui,sans-serif"><div id="app"></div></body></html>' }));
  await pg.goto(`${ORIGIN}/`);
  await pg.addStyleTag({ path: path.join(MAPLIBRE, 'maplibre-gl.css') });
  await pg.addScriptTag({ path: path.join(MAPLIBRE, 'maplibre-gl.js') });
  await pg.addScriptTag({ content: kod });
  await pg.waitForFunction(() => !!(window as any).__klar);
  return { ctx, pg };
}

const sym = (id: number, type: string, x: number, y: number, extra: any = {}) => ({ id, isMarker: true, type, x, y, andradTs: 100, andradAv: 'martin-id', andradAvNamn: 'Martin', ...extra });
const hamta = (pg: any, ms: any[]) => pg.evaluate((m: any[]) => (window as any).__hamta(m, true), ms);
const rad = (pg: any) => pg.evaluate(() => { const e = document.querySelector('[data-testid="nytt-fran-rad"]') as HTMLElement | null; return e ? { text: (e.querySelector('[data-testid="nytt-fran-text"]') as HTMLElement).textContent, ton: e.getAttribute('data-ton'), antal: e.getAttribute('data-antal'), bg: getComputedStyle(e).backgroundColor, h: e.getBoundingClientRect().height, top: e.getBoundingClientRect().top } : null; });
const mittM = (pg: any, x: number, y: number) => pg.evaluate(({ x, y }: any) => { const c = (window as any).__map.getCenter(); return Math.hypot((c.lng - (15 + x / 1e5)) * 111320 * Math.cos(57 * Math.PI / 180), (c.lat - (57 + y / 1e5)) * 111320); }, { x, y });
const pulsAntal = (pg: any) => pg.evaluate(() => (window as any).__map.querySourceFeatures('larm-puls-source').length > 0 ? 1 : 0);
const vanta = (pg: any, ms: number) => pg.waitForTimeout(ms);
async function tryckRad(pg: any) {
  const p = await pg.evaluate(() => { const b = (document.querySelector('[data-testid="nytt-fran-rad"]') as HTMLElement).getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; });
  await pg.touchscreen.tap(p.x, p.y);
  await vanta(pg, 1200);   // flygningen tar 800 ms
}

describe.skipIf(!CHROMIUM)('Nytt från … — riktig Chromium + MapLibre + touch', () => {
  it('Martins scenarier: andras ändring → rad → tryck → flyger dit och pulserar 5 s · tre → "3 nya" i tur och ordning · egen ändring → ingen rad · tonerna', async () => {
    const kod = await bunta();
    const b = await CHROMIUM!.launch({});
    const skriv = process.env.NYTT_SKRIV;
    const spara = async (pg: any, namn: string) => { if (skriv) { fs.mkdirSync(skriv, { recursive: true }); await pg.screenshot({ path: path.join(skriv, namn) }); } };
    try {
      const { pg } = await oppna(b, kod);
      const bas = sym(1, 'wet', 40, 40, { andradAv: 'x' });
      await hamta(pg, [bas]);   // första färska bilden = baslinjen: ingen rad vid start
      expect(await rad(pg)).toBeNull();

      // 1. EGEN ÄNDRING → ingen rad
      await hamta(pg, [bas, sym(2, 'wet', 60, 60, { andradAv: 'jag', andradAvNamn: 'Stefan' })]);
      await vanta(pg, 100);
      expect(await rad(pg)).toBeNull();

      // 2. NEUTRAL: en annan lägger till "Fuktig mark" (ca 1,2 km bort, utanför bild) → rad överst under pillen, 64 px hög; tryck → kartan flyger dit och pulserar
      const bas2 = [bas, sym(2, 'wet', 60, 60, { andradAv: 'jag', andradAvNamn: 'Stefan' })];
      await hamta(pg, [...bas2, sym(3, 'wet', 900, 700, { andradAvNamn: 'Martin', andradTs: 200 })]);
      await vanta(pg, 150);
      let r = await rad(pg);
      expect(r).toMatchObject({ text: 'Nytt från Martin: Fuktig mark, 1,0 km', ton: 'neutral', antal: '1', bg: 'rgb(28, 28, 30)', h: 64 });
      expect(r!.top).toBeGreaterThanOrEqual(68);   // under objektpillen (12 + 56)
      await spara(pg, 'neutral.png');
      expect(await mittM(pg, 900, 700)).toBeGreaterThan(900);   // kartan står kvar
      await tryckRad(pg);
      expect(await rad(pg)).toBeNull();                         // raden försvinner vid tryck
      expect(await mittM(pg, 900, 700)).toBeLessThan(25);      // kartan visar ändringen …
      expect(await pg.evaluate(() => (window as any).__map.getZoom())).toBeGreaterThanOrEqual(17.4);
      expect(await pulsAntal(pg)).toBe(1);                      // … och den pulserar
      expect(await pg.evaluate(() => (window as any).__map.queryRenderedFeatures({ layers: ['larm-puls-punkt'] }).length)).toBeGreaterThan(0);
      await vanta(pg, 4300);
      expect(await pulsAntal(pg)).toBe(0);                      // 5 s sedan trycket: slut

      // 3. FARA (röd): Varning med kommentar, 120 m bort
      const alla = [...bas2, sym(3, 'wet', 900, 700, { andradAvNamn: 'Martin', andradTs: 200 })];
      await hamta(pg, [...alla, sym(4, 'warning', 0, 108, { andradAvNamn: 'Martin', andradTs: 300, comment: 'Torrträd' })]);
      await vanta(pg, 150);
      r = await rad(pg);
      expect(r).toMatchObject({ text: 'Nytt från Martin: Varning – Torrträd, 120 m', ton: 'fara', bg: 'rgb(255, 69, 58)' });
      await spara(pg, 'rod-fara.png');
      await tryckRad(pg);
      expect(await mittM(pg, 0, 108)).toBeLessThan(25);

      // 4. VIKTIGT (gul): ny kommentar med Viktigt-rad från en annan
      await pg.evaluate(() => (window as any).__setKomm([{ id: 'k1', skapad_av: 'martin-id', namn: 'Martin Hjert', text: '', viktigt: 'Kör inte in i hänsynen', yta_nyckel: 'marker:77', skapad_at: '2026-11-24T10:00:00Z', andrad_at: null }]));
      await vanta(pg, 200);
      // första kommentarerna efter baslinjen (tom lista vid start) → ny
      r = await rad(pg);
      expect(r).toMatchObject({ text: 'Nytt från Martin: Viktigt – Kör inte in i hänsynen, 330 m', ton: 'viktigt', bg: 'rgb(255, 214, 10)' });
      expect(await pg.evaluate(() => { const t = document.querySelector('[data-testid="nytt-fran-text"]') as HTMLElement; return t.scrollHeight <= t.clientHeight + 1; })).toBe(true);   // hela texten ryms (två rader), inget kapas
      await spara(pg, 'gul-viktigt.png');
      await tryckRad(pg);
      expect(await mittM(pg, 0, 300)).toBeLessThan(25);

      // 5. TRE ÄNDRINGAR → "3 nya från Jocke"; ett tryck per ändring, i tur och ordning, raden försvinner efter den sista
      const baslinje = [...alla, sym(4, 'warning', 0, 108, { andradAvNamn: 'Martin', andradTs: 300, comment: 'Torrträd' })];
      const j = (id: number, x: number, y: number, ts: number) => sym(id, 'wet', x, y, { andradAv: 'j', andradAvNamn: 'Jocke', andradTs: ts });
      await hamta(pg, [...baslinje, j(10, -600, 100, 400)]); await vanta(pg, 80);
      await hamta(pg, [...baslinje, j(10, -600, 100, 400), j(11, -600, -500, 401)]); await vanta(pg, 80);
      await hamta(pg, [...baslinje, j(10, -600, 100, 400), j(11, -600, -500, 401), j(12, 700, -600, 402)]); await vanta(pg, 150);
      r = await rad(pg);
      expect(r).toMatchObject({ text: '3 nya från Jocke', antal: '3' });
      await tryckRad(pg); expect(await mittM(pg, -600, 100)).toBeLessThan(25); expect(await rad(pg)).toMatchObject({ text: '2 nya från Jocke' });
      await tryckRad(pg); expect(await mittM(pg, -600, -500)).toBeLessThan(25); expect((await rad(pg)).text).toMatch(/^Nytt från Jocke: Fuktig mark, \d+ m$/);
      await tryckRad(pg); expect(await mittM(pg, 700, -600)).toBeLessThan(25);
      expect(await rad(pg)).toBeNull();

      // 6. raden försvinner av sig själv efter 30 s
      await hamta(pg, [...baslinje, j(10, -600, 100, 400), j(11, -600, -500, 401), j(12, 700, -600, 402), sym(20, 'note', 10, 10, { andradAvNamn: 'Martin', andradTs: 500 })]);
      await vanta(pg, 150);
      expect(await rad(pg)).not.toBeNull();
      await vanta(pg, 30500);
      expect(await rad(pg)).toBeNull();
    } finally { await b.close(); }
  }, 240000);
});
