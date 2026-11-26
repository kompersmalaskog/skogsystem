// @vitest-environment node
// KÖRVYNS SKYDDSLAGER I RIKTIG CHROMIUM + MAPLIBRE (2026-11-23). Felet: i körvyn tvingades de sju lagren synliga, så ett vattenskydd som täckte hela kartan gick inte att släcka.
// Här ritas varje lager som ett färgat band (ett WMS-raster hade krävt nätet) med id `wms-layer-<id>` — samma id som sidan har — och funktionerna som körs är de RIKTIGA
// (lib/korvySkyddslager.ts buntad med esbuild, localStorage i en riktig sida). Pixlarna visar om lagret ritas. Alla sju lager: nytt objekt → tänt, släck → släckt kvar
// vid kartflytt och zoom, omladdning (= omstart av körvyn) → fortfarande släckt, annat objekt → tänt, tillbaka → släckt.
// "Före" kör den gamla regeln (tvinga synligt) mot samma karta. Finns ingen Chromium hoppas mätningen över. SKYDD_SKRIV=<mapp> sparar skärmbilderna.
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';
import { hittaChromium, KARTA_ARGS } from './testStod/chromium';

const CHROMIUM = hittaChromium(KARTA_ARGS);
const MAPLIBRE = path.join(process.cwd(), 'node_modules/maplibre-gl/dist');
const SJU = ['nyckelbiotoper', 'biotopskydd', 'vattenskydd', 'naturreservat', 'natura2000', 'sumpskog', 'kraftledningar'];
const ORIGIN = 'https://skyddstest.invalid';
const BG = [61, 74, 44];   // kartans bakgrund (#3d4a2c)

async function buntaLib(): Promise<string> {
  const r = await build({ entryPoints: [path.join(process.cwd(), 'lib/korvySkyddslager.ts')], bundle: true, write: false, format: 'iife', globalName: 'KS', platform: 'browser', logLevel: 'silent' });
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

/** Bygg kartan med sju band (hela området täcks av ett vattenskydd om `helaVattenskydd`) och tillämpa förarens val för maskin + objekt. */
async function byggOchTillampa(pg: any, a: { maskin: string; objekt: string; gammal?: boolean; helaVattenskydd?: boolean }) {
  return pg.evaluate(async (arg: any) => {
    const W = (window as any);
    const el = document.getElementById('m')!; el.innerHTML = '';
    const map = new W.maplibregl.Map({ container: 'm', center: [15.0, 57.0], zoom: 13, fadeDuration: 0, preserveDrawingBuffer: true, attributionControl: false,
      style: { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#3d4a2c' } }] } });
    await new Promise((r) => map.on('load', r));
    const farger = ['#a855f7', '#16a34a', '#0a84ff', '#f59e0b', '#ef4444', '#14b8a6', '#eab308'];
    arg.sju.forEach((id: string, i: number) => {
      const lat0 = 56.99 + i * 0.002857, lat1 = lat0 + 0.002857;
      const full = arg.helaVattenskydd && id === 'vattenskydd';
      const ring = full ? [[14.9, 56.9], [15.1, 56.9], [15.1, 57.1], [14.9, 57.1], [14.9, 56.9]] : [[14.9, lat0], [15.1, lat0], [15.1, lat1], [14.9, lat1], [14.9, lat0]];
      map.addSource('s-' + id, { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } } });
      map.addLayer({ id: 'wms-layer-' + id, type: 'fill', source: 's-' + id, paint: { 'fill-color': full ? '#0a84ff' : farger[i], 'fill-opacity': full ? 0.85 : 1 }, layout: { visibility: 'none' } });
    });
    W.__map = map;
    return null;
  }, { sju: SJU, helaVattenskydd: !!a.helaVattenskydd }).then(() => tillampa(pg, a));
}

async function tillampa(pg: any, a: { maskin: string; objekt: string; gammal?: boolean }) {
  await pg.evaluate(async (arg: any) => {
    const W = (window as any), map = W.__map;
    const slackta = W.KS.hamtaSlackta(arg.maskin, arg.objekt);
    if (arg.gammal) for (const id of W.KS.KORVY_SKYDDSLAGER) map.setLayoutProperty('wms-layer-' + id, 'visibility', 'visible');   // gamla regeln: tvingat synligt
    else W.KS.tillampaSkyddslager(map, slackta);
    // Vänta på en NY ritning efter ändringen (ett 'idle' från förra bilden får inte räknas).
    await new Promise((r) => { map.once('render', () => map.once('idle', r)); map.triggerRepaint(); });
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }, a);
}

/** Vilka lager ritas? Pixeln mitt i varje bands rad är något annat än bakgrunden. */
async function ritas(pg: any): Promise<Record<string, boolean>> {
  return pg.evaluate((arg: any) => {
    const map = (window as any).__map;
    map.redraw();   // WebGL-ytan kan visa förra bilden tills kartan ritats om synkront — utan det mäts en gammal bild
    const c = document.createElement('canvas'); c.width = map.getCanvas().width; c.height = map.getCanvas().height;
    const ctx = c.getContext('2d')!; ctx.drawImage(map.getCanvas(), 0, 0);
    const dpr = c.width / map.getCanvas().clientWidth;
    const ut: Record<string, boolean> = {};
    arg.sju.forEach((id: string, i: number) => {
      const p = map.project([15.0, 56.99 + i * 0.002857 + 0.001428]);
      if (p.x < 0 || p.y < 0 || p.x > map.getCanvas().clientWidth || p.y > map.getCanvas().clientHeight) throw new Error('bandet ' + id + ' ligger utanför kartan — mätningen vore meningslös');
      const d = ctx.getImageData(Math.round(p.x * dpr), Math.round(p.y * dpr), 1, 1).data;
      ut[id] = !(Math.abs(d[0] - arg.bg[0]) < 12 && Math.abs(d[1] - arg.bg[1]) < 12 && Math.abs(d[2] - arg.bg[2]) < 12);
    });
    return ut;
  }, { sju: SJU, bg: BG });
}

const alla = (v: boolean) => Object.fromEntries(SJU.map((id) => [id, v]));

describe.skipIf(!CHROMIUM)('Körvyns skyddslager — riktig Chromium + MapLibre, pixlar', () => {
  it('alla sju: nytt objekt tänt · släck → släckt vid kartflytt och zoom · omstart → släckt · annat objekt tänt · tillbaka släckt', async () => {
    const lib = await buntaLib();
    const b = await CHROMIUM!.launch({});
    try {
      const pg = await oppna(b, lib);
      const M = 'R64428';
      for (const lager of SJU) {
        await pg.evaluate(() => localStorage.clear());
        // 1. nytt objekt → alla tända
        await byggOchTillampa(pg, { maskin: M, objekt: 'obj-1' });
        expect(await ritas(pg), `${lager}: nytt objekt`).toEqual(alla(true));
        // 2. föraren släcker lagret (samma funktioner som sidans knapp): sparas och tillämpas
        await pg.evaluate((arg: any) => { const KS = (window as any).KS; KS.sparaSlackta(arg.m, 'obj-1', KS.vaxlaSlackt(KS.hamtaSlackta(arg.m, 'obj-1'), arg.lager)); }, { m: M, lager });
        await tillampa(pg, { maskin: M, objekt: 'obj-1' });
        expect(await ritas(pg), `${lager}: släckt`).toEqual({ ...alla(true), [lager]: false });
        // 3. släckt kvar vid kartflytt och zoom (ingen ny tillämpning — lagret ska ligga kvar släckt)
        await pg.evaluate(async () => { const m = (window as any).__map; m.jumpTo({ center: [15.0004, 57.0002], zoom: 13.3 }); await new Promise((r) => { m.once('render', () => m.once('idle', r)); m.triggerRepaint(); }); });
        expect((await ritas(pg))[lager], `${lager}: kartflytt/zoom`).toBe(false);
        // 4. omstart av körvyn = sidan laddas om; valet ska finnas kvar i localStorage
        await pg.reload();
        await pg.addStyleTag({ path: path.join(MAPLIBRE, 'maplibre-gl.css') });
        await pg.addScriptTag({ path: path.join(MAPLIBRE, 'maplibre-gl.js') });
        await pg.addScriptTag({ content: lib });
        await byggOchTillampa(pg, { maskin: M, objekt: 'obj-1' });
        expect(await ritas(pg), `${lager}: omstart`).toEqual({ ...alla(true), [lager]: false });
        // 5. annat objekt → tänt
        await byggOchTillampa(pg, { maskin: M, objekt: 'obj-2' });
        expect(await ritas(pg), `${lager}: annat objekt`).toEqual(alla(true));
        // 6. tillbaka till första objektet → släckt
        await byggOchTillampa(pg, { maskin: M, objekt: 'obj-1' });
        expect(await ritas(pg), `${lager}: tillbaka`).toEqual({ ...alla(true), [lager]: false });
        // 7. tänder han det igen → tänt, och det stannar tänt efter omstart
        await pg.evaluate((arg: any) => { const KS = (window as any).KS; KS.sparaSlackta(arg.m, 'obj-1', KS.vaxlaSlackt(KS.hamtaSlackta(arg.m, 'obj-1'), arg.lager)); }, { m: M, lager });
        await tillampa(pg, { maskin: M, objekt: 'obj-1' });
        expect(await ritas(pg), `${lager}: tänt igen`).toEqual(alla(true));
      }
    } finally { await b.close(); }
  }, 240000);

  it('Stefans fall (hela objektet är vattenskydd): FÖRE går det inte att släcka, EFTER försvinner det blå — bilder', async () => {
    const lib = await buntaLib();
    const b = await CHROMIUM!.launch({});
    const skriv = process.env.SKYDD_SKRIV;
    try {
      const pg = await oppna(b, lib);
      const M = 'R64428';
      await pg.evaluate(() => localStorage.clear());
      // Föraren trycker på lagerknappen för vattenskydd (valet sparas), men den gamla regeln tvingar lagret synligt igen.
      await byggOchTillampa(pg, { maskin: M, objekt: 'stefan', helaVattenskydd: true });
      await pg.evaluate((arg: any) => { const KS = (window as any).KS; KS.sparaSlackta(arg.m, 'stefan', KS.vaxlaSlackt(KS.hamtaSlackta(arg.m, 'stefan'), 'vattenskydd')); }, { m: M });
      await tillampa(pg, { maskin: M, objekt: 'stefan', gammal: true });
      const fore = await ritas(pg);
      if (skriv) { fs.mkdirSync(skriv, { recursive: true }); await pg.evaluate(() => (window as any).__map.redraw()); await pg.screenshot({ path: path.join(skriv, 'fore-vattenskydd-gar-inte-att-slacka.png') }); }
      await tillampa(pg, { maskin: M, objekt: 'stefan' });
      const efter = await ritas(pg);
      if (skriv) { await pg.evaluate(() => (window as any).__map.redraw()); await pg.screenshot({ path: path.join(skriv, 'efter-vattenskydd-slackt.png') }); }
      expect(fore.vattenskydd, 'gamla regeln: det blå ligger kvar').toBe(true);
      expect(efter.vattenskydd, 'nya regeln: det blå är borta').toBe(false);
      // Hela kartan är bakgrunden igen (inget blått kvar att se).
      const blaKvar = await pg.evaluate(() => {
        const map = (window as any).__map; map.redraw(); const c = document.createElement('canvas'); c.width = map.getCanvas().width; c.height = map.getCanvas().height;
        const ctx = c.getContext('2d')!; ctx.drawImage(map.getCanvas(), 0, 0); const d = ctx.getImageData(c.width / 2, 5, 1, 1).data; return d[2] > d[0] + 60;
      });
      expect(blaKvar).toBe(false);
    } finally { await b.close(); }
  }, 120000);
});
