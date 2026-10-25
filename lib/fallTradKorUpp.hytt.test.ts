// @vitest-environment node
// FÄLLTRÄD OCH KÖR UPP OCH BACKA I RIKTIG CHROMIUM + MAPLIBRE (2026-10-25). jsdom kan varken rita en karta eller skicka ett riktigt finger — därför mäts det här i pixlar och med riktiga mus-
// och pekhändelser mot kartans canvas (CDP för pek): trädet har FAST storlek på skärmen (lika vid varje zoom, ca två symboler), en hel enfärgad grön krona som pekar åt vinkeln, ingen vit ring
// annat än när trädet är valt, och ingen gest på kartan (ett drag på trädet panorerar); kör upp-pilen har lika tjock linje vid varje zoom och draget från vägen blir en pil som börjar PÅ vägen. Själva lib-koden buntas med esbuild och körs i webbläsaren (inga kopior).
// FALLTRAD_SKRIV=<mapp> sparar skärmbilderna. Finns ingen Chromium hoppas mätningen över.
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
  const mapp = fs.mkdtempSync(path.join(os.tmpdir(), 'falltrad-'));
  const ingang = path.join(mapp, 'entry.ts');
  fs.writeFileSync(ingang, ['fallTrad', 'korUpp', 'fallTradGester'].map((f) => `export * from ${JSON.stringify(path.join(process.cwd(), 'lib', f))};`).join('\n'));
  const ut = path.join(mapp, 'lib.js');
  const esbuild = createRequire(import.meta.url)('esbuild');
  esbuild.buildSync({ entryPoints: [ingang], bundle: true, format: 'iife', globalName: 'lib', outfile: ut, logLevel: 'error' });
  return ut;
}

type Param = { zoom: number; pitch: number; bearing: number; touch?: boolean };

/** Startar en karta med tre träd (och två kör upp-pilar + två vägar), kopplar gesterna och ger sidan tillbaka. */
async function oppna(param: Param, fn: (pg: any, b: any) => Promise<void>): Promise<void> {
  const b = await CHROMIUM!.launch({});
  try {
    const ctx = await b.newContext({ viewport: { width: 900, height: 640 }, hasTouch: !!param.touch, isMobile: false });
    const pg = await ctx.newPage();
    await pg.setContent('<!doctype html><html><head><meta charset="utf-8"><style>html,body,#m{margin:0;height:100%}</style></head><body><div id="m"></div></body></html>');
    await pg.addStyleTag({ path: path.join(MAPLIBRE, 'maplibre-gl.css') });
    await pg.addScriptTag({ path: path.join(MAPLIBRE, 'maplibre-gl.js') });
    await pg.addScriptTag({ path: buntaLib() });
    await pg.evaluate(async (p: Param) => {
      const L = (window as any).lib; const ml = (window as any).maplibregl;
      const map = new ml.Map({ container: 'm', center: [15.0, 57.0], zoom: p.zoom, pitch: p.pitch, bearing: p.bearing, fadeDuration: 0, canvasContextAttributes: { preserveDrawingBuffer: true }, attributionControl: false,
        style: { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#3d4a2c' } }] } });
      await new Promise((r) => map.on('load', r));
      const add = (name: string, c: HTMLCanvasElement, pr: number) => { const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height); map.addImage(name, { width: c.width, height: c.height, data: new Uint8Array(d.data.buffer) }, { pixelRatio: pr }); };
      add(L.TRAD_BILD, L.ritaTradBild(false), 2); add(L.TRAD_BILD_VALD, L.ritaTradBild(true), 2); add(L.KORUPP_SPETS_BILD, L.ritaSpetsBild(), 2);
      map.addSource(L.TRAD_KALLA, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addSource(L.KORUPP_KALLA, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addSource('vagar', { type: 'geojson', data: { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[14.9985, 57.0004], [15.0015, 57.0004]] } }, { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[15.0, 57.0004], [15.0, 56.9992]] } }] } });
      map.addLayer({ id: 'vag', type: 'line', source: 'vagar', paint: { 'line-color': '#ff453a', 'line-width': 5 } });
      for (const l of [...L.korUppLager(), ...L.tradLager()]) map.addLayer(l);
      const ll = (lon: number, lat: number) => ({ lon, lat });
      const w = window as any;
      w.map = map; w.L = L;
      w.trad = [{ id: 'a', stubbe: ll(14.9992, 56.9996), vinkel: 40 }, { id: 'b', stubbe: ll(15.0004, 56.9996), vinkel: 135 }, { id: 'c', stubbe: ll(15.0014, 56.9996), vinkel: 300 }];
      w.pilar = [{ id: 'k1', start: ll(14.9990, 57.0004), slut: ll(14.9990, 57.0012), skal: 'brant', vagId: 'v1' }, { id: 'k2', start: ll(15.0010, 57.0004), slut: ll(15.0010, 57.0011), skal: 'inget', vagId: 'v1' }];
      w.vald = null;
      w.ritaOm = () => { map.getSource(L.TRAD_KALLA).setData(L.tradData(w.trad, { valdId: w.vald })); map.getSource(L.KORUPP_KALLA).setData(L.korUppData(w.pilar)); };
      w.ritaOm();
      w.handelser = [];
      w.lage = { korUppRita: false };
      w.stang = L.kopplaFallOchKorUppGester(map, () => ({
        map, klar: true, korUppRita: w.lage.korUppRita,
        vagarRef: { current: [{ id: 'v1', coords: [[14.9985, 57.0004], [15.0015, 57.0004]] }, { id: 'v2', coords: [[15.0, 57.0004], [15.0, 56.9992]] }] },
        onForhandsvisning: (pil: any) => { w.handelser.push({ typ: 'forhands', pil }); },
        onKorUpp: (pil: any) => { w.handelser.push({ typ: 'korupp', pil }); },
      }));
      await new Promise((r) => { map.once('idle', r); map.triggerRepaint(); });
    }, param);
    await fn(pg, ctx);
  } finally { await b.close(); }
}

const skriv = (pg: any, namn: string) => process.env.FALLTRAD_SKRIV ? (fs.mkdirSync(process.env.FALLTRAD_SKRIV, { recursive: true }), pg.screenshot({ path: path.join(process.env.FALLTRAD_SKRIV, `${namn}.png`) })) : Promise.resolve();
const vantaIdle = (pg: any) => pg.evaluate(() => new Promise((r) => { const m = (window as any).map; m.once('idle', r); m.triggerRepaint(); }));
const skarm = (pg: any, lon: number, lat: number) => pg.evaluate(([x, y]: number[]) => { const p = (window as any).map.project([x, y]); return { x: p.x, y: p.y }; }, [lon, lat]);

/** Pixlarna på kartan, kopierade i samma uppgift som ritningen (annars är WebGL-bufferten tömd). */
const PIXLAR = `async () => {
  const map = window.map;
  await new Promise((r) => { map.once('idle', r); map.triggerRepaint(); });
  const cv = document.createElement('canvas'); cv.width = map.getCanvas().width; cv.height = map.getCanvas().height;
  const ctx = cv.getContext('2d'); ctx.drawImage(map.getCanvas(), 0, 0);
  window.__px = { cv, data: ctx.getImageData(0, 0, cv.width, cv.height).data, dpr: cv.width / map.getCanvas().clientWidth };
}`;
const taPixlar = (pg: any) => pg.evaluate(`(${PIXLAR})()`);

/** Mått på ETT träd ur pixlarna: stubbens plats, kronans farligaste avstånd från stubben (trädets längd på skärmen), kronans färger och vita pixlar runt trädet. */
const matTrad = (pg: any, id: string) => pg.evaluate((tid: string) => {
  const w = window as any; const map = w.map; const { cv, data, dpr } = w.__px;
  const t = w.trad.find((x: any) => x.id === tid); const s = map.project([t.stubbe.lon, t.stubbe.lat]);
  let langst = 0, vita = 0, grona = 0; const farger = new Map<string, number>();
  const rad = 110;
  for (let y = Math.max(0, Math.round((s.y - rad) * dpr)); y < Math.min(cv.height, Math.round((s.y + rad) * dpr)); y++) for (let x = Math.max(0, Math.round((s.x - rad) * dpr)); x < Math.min(cv.width, Math.round((s.x + rad) * dpr)); x++) {
    const i = (y * cv.width + x) * 4; const r = data[i], g = data[i + 1], b = data[i + 2];
    if (r > 245 && g > 245 && b > 245) vita++;
    if (g > r + 40 && g > b + 25 && g > 100) { grona++; langst = Math.max(langst, Math.hypot(x / dpr - s.x, y / dpr - s.y)); const k = [r, g, b].map((v) => Math.round(v / 24)).join(','); farger.set(k, (farger.get(k) ?? 0) + 1); }
  }
  const dom = [...farger.values()].sort((a, b) => b - a);
  return { s: { x: s.x, y: s.y }, langst, vita, grona, domAndel: grona ? dom[0] / grona : 0 };
}, id);

describe.skipIf(!CHROMIUM)('Fällträd — riktig Chromium + MapLibre', () => {
  it('FAST STORLEK: trädet är lika stort på skärmen vid zoom 14, 16 och 18 (och med lutad karta) — ca 76 px stubbe → topp, ungefär två symboler', async () => {
    const langder: number[] = [];
    for (const p of [{ zoom: 14, pitch: 0, bearing: 0 }, { zoom: 16, pitch: 0, bearing: 0 }, { zoom: 18, pitch: 0, bearing: 0 }, { zoom: 16.5, pitch: 50, bearing: 30 }]) {
      await oppna(p, async (pg) => {
        await pg.evaluate(() => { const w = (window as any); w.trad = [w.trad[1]]; w.ritaOm(); });   // ett träd: stubben ovanför hamnar inte i varandra vid låg zoom
        await taPixlar(pg);
        const m = await matTrad(pg, 'b');
        langder.push(m.langst);
        await skriv(pg, `trad_storlek_z${p.zoom}_p${p.pitch}`);
      });
    }
    // kronans spets är en enda punkt och ritas med halvtäckande pixlar: den mätta längden varierar några px med vinkel och zoom — ett zoomberoende träd skulle skilja sig 16 gånger mellan zoom 14 och 18
    for (const l of langder) { expect(l, JSON.stringify(langder)).toBeGreaterThan(62); expect(l, JSON.stringify(langder)).toBeLessThan(86); }
    expect(Math.max(...langder) - Math.min(...langder), JSON.stringify(langder)).toBeLessThan(10);
  }, 240000);

  for (const p of [{ zoom: 17, pitch: 0, bearing: 0 }, { zoom: 16.5, pitch: 50, bearing: 30 }]) {
    it(`stubben ligger på trädets plats och kronan pekar åt vinkeln (zoom ${p.zoom}, lutning ${p.pitch}°, riktning ${p.bearing}°)`, async () => {
      await oppna(p, async (pg) => {
        await skriv(pg, `trad_z${p.zoom}_p${p.pitch}`);
        await taPixlar(pg);
        const m = await pg.evaluate(() => {
          const w = window as any; const map = w.map; const { cv, data, dpr } = w.__px;
          return w.trad.map((t: any) => {
            const s = map.project([t.stubbe.lon, t.stubbe.lat]);
            const framLl = w.L.fram(t.stubbe, t.vinkel, 12); const f = map.project([framLl.lon, framLl.lat]);   // en punkt 12 m bort åt vinkeln: dit ska kronan peka
            const hitta = (cx: number, cy: number, rad: number, test: (r: number, g: number, b: number) => boolean) => {
              let sx = 0, sy = 0, n = 0;
              for (let y = Math.max(0, Math.round((cy - rad) * dpr)); y < Math.min(cv.height, Math.round((cy + rad) * dpr)); y++) for (let x = Math.max(0, Math.round((cx - rad) * dpr)); x < Math.min(cv.width, Math.round((cx + rad) * dpr)); x++) {
                const i = (y * cv.width + x) * 4; if (test(data[i], data[i + 1], data[i + 2])) { sx += x / dpr; sy += y / dpr; n++; }
              }
              return n ? { x: sx / n, y: sy / n, n } : null;
            };
            const stubbe = hitta(s.x, s.y, 12, (r, g, b) => r > 215 && g > 200 && b > 160 && b < 205);
            const krona = hitta(s.x, s.y, 60, (r, g, b) => g > r + 40 && g > b + 25 && g > 100);
            return { id: t.id, s: { x: s.x, y: s.y }, f: { x: f.x, y: f.y }, stubbe, krona };
          });
        });
        for (const t of m) {
          expect(t.stubbe, `stubben saknas för ${t.id}`).not.toBeNull();
          expect(Math.hypot(t.stubbe.x - t.s.x, t.stubbe.y - t.s.y), `stubben ska ligga på trädets plats (${t.id})`).toBeLessThan(9);
          expect(t.krona, `kronan saknas för ${t.id}`).not.toBeNull();
          const dx = t.f.x - t.s.x, dy = t.f.y - t.s.y;
          expect((t.krona.x - t.s.x) * dx + (t.krona.y - t.s.y) * dy, `kronan ska peka åt vinkeln (${t.id})`).toBeGreaterThan(0);
        }
      });
    }, 120000);
  }

  it('KRONAN ÄR HEL OCH GRÖN: en enda grön färg (inte randig) — över 90 % av kronans pixlar har samma färg', async () => {
    await oppna({ zoom: 17, pitch: 0, bearing: 0 }, async (pg) => {
      await pg.evaluate(() => { const w = (window as any); w.trad = [{ ...w.trad[1], vinkel: 0 }]; w.ritaOm(); });
      await taPixlar(pg);
      const m = await matTrad(pg, 'b');
      expect(m.grona).toBeGreaterThan(400);
      expect(m.domAndel, `domAndel ${m.domAndel}`).toBeGreaterThan(0.9);
      await skriv(pg, 'trad_hel_krona');
    });
  }, 120000);

  it('INGEN VIT RING annat än på det valda trädet: inga vita pixlar runt oskickade träd, en ring runt det vars kort är öppet', async () => {
    await oppna({ zoom: 17, pitch: 0, bearing: 0 }, async (pg) => {
      await taPixlar(pg);
      for (const id of ['a', 'b', 'c']) expect((await matTrad(pg, id)).vita, `vita pixlar vid ${id} utan val`).toBe(0);
      await pg.evaluate(() => { const w = window as any; w.vald = 'b'; w.ritaOm(); });
      await taPixlar(pg);
      expect((await matTrad(pg, 'b')).vita).toBeGreaterThan(150);
      expect((await matTrad(pg, 'a')).vita).toBe(0);
      expect((await matTrad(pg, 'c')).vita).toBe(0);
      await skriv(pg, 'trad_valt');
      await pg.evaluate(() => { const w = window as any; w.vald = null; w.ritaOm(); });
      await taPixlar(pg);
      expect((await matTrad(pg, 'b')).vita, 'ringen försvinner när kortet stängs').toBe(0);
    });
  }, 120000);

  it('INGEN GEST PÅ KARTAN: ett drag som börjar på trädet (mus och riktigt finger) panorerar kartan — trädet vrids i kortet, inte här', async () => {
    await oppna({ zoom: 16.5, pitch: 0, bearing: 0, touch: true }, async (pg, ctx) => {
      const s = await skarm(pg, 14.9992, 56.9996);
      const topp = { x: s.x, y: s.y - 60 };    // kronan
      const fore = await pg.evaluate(() => (window as any).map.getCenter());
      await pg.mouse.move(topp.x, topp.y); await pg.mouse.down(); await pg.mouse.move(topp.x + 90, topp.y + 40, { steps: 6 }); await pg.mouse.up();
      const efter = await pg.evaluate(() => (window as any).map.getCenter());
      expect(Math.abs(efter.lng - fore.lng) + Math.abs(efter.lat - fore.lat)).toBeGreaterThan(1e-5);
      expect(await pg.evaluate(() => (window as any).trad.map((t: any) => t.vinkel))).toEqual([40, 135, 300]);
      const cdp = await ctx.newCDPSession(pg);
      const s2 = await skarm(pg, 15.0004, 56.9996);
      const c0 = await pg.evaluate(() => (window as any).map.getCenter());
      const punkt = (x: number, y: number) => [{ x, y, id: 1 }];
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: punkt(s2.x, s2.y - 60) });
      for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: punkt(s2.x - 10 * i, s2.y - 60 + 6 * i) });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      const c1 = await pg.evaluate(() => (window as any).map.getCenter());
      expect(Math.abs(c1.lng - c0.lng) + Math.abs(c1.lat - c0.lat)).toBeGreaterThan(1e-5);
      expect(await pg.evaluate(() => (window as any).trad.map((t: any) => t.vinkel))).toEqual([40, 135, 300]);
    });
  }, 120000);
});

describe.skipIf(!CHROMIUM)('Kör upp och backa — riktig Chromium + MapLibre', () => {
  it('pilen ritas med spets i båda ändar och ordet (Brant) bara när skälet inte är Inget', async () => {
    await oppna({ zoom: 16.3, pitch: 0, bearing: 0 }, async (pg) => {
      await skriv(pg, 'korupp_ritad');
      const r = await pg.evaluate(() => {
        const w = window as any; const map = w.map;
        const ord = map.queryRenderedFeatures({ layers: [w.L.KORUPP_ORD_LAGER] }).map((f: any) => f.properties.text);
        const spetsar = map.queryRenderedFeatures({ layers: [w.L.KORUPP_SPETS_LAGER] }).length;
        return { ord, spetsar };
      });
      expect(r.ord).toEqual(['Brant']);          // den andra pilen har skälet Inget → inget ord
      expect(r.spetsar).toBeGreaterThanOrEqual(4);   // två pilar × två spetsar
    });
  }, 120000);

  it('FAST STORLEK: linjen är lika tjock på skärmen (4 px) vid zoom 15,5, 16 och 17', async () => {
    const tjock: number[] = [];
    for (const zoom of [15.5, 16, 17]) {
      await oppna({ zoom, pitch: 0, bearing: 0 }, async (pg) => {
        await taPixlar(pg);
        const t = await pg.evaluate(() => {
          const w = window as any; const map = w.map; const { cv, data, dpr } = w.__px;
          const p = w.pilar[0]; const a = map.project([p.start.lon, p.start.lat]); const b = map.project([p.slut.lon, p.slut.lat]);
          const y = Math.round(((a.y + b.y) / 2) * dpr);
          let run = 0, basta = 0;
          for (let x = Math.round((a.x - 20) * dpr); x < Math.round((a.x + 20) * dpr); x++) { const i = (y * cv.width + x) * 4; if (data[i] > 235 && data[i + 1] > 235 && data[i + 2] > 235) { run++; basta = Math.max(basta, run); } else run = 0; }
          return basta / dpr;
        });
        tjock.push(t);
        if (zoom === 16) await skriv(pg, 'korupp_fast_storlek');
      });
    }
    for (const t of tjock) { expect(t, JSON.stringify(tjock)).toBeGreaterThanOrEqual(3); expect(t, JSON.stringify(tjock)).toBeLessThanOrEqual(5); }
    expect(Math.max(...tjock) - Math.min(...tjock)).toBeLessThanOrEqual(1);
  }, 240000);

  it('ett drag från vägen mot gränsen blir en pil som BÖRJAR PÅ närmaste väg; kartan panorerar inte; ett kort drag blir ingen pil', async () => {
    await oppna({ zoom: 17, pitch: 0, bearing: 0 }, async (pg) => {
      await pg.evaluate(() => { (window as any).lage.korUppRita = true; });
      // start 12 px från väg 1 (ligger vid lat 57.0004), drag rakt norrut
      const v = await skarm(pg, 14.9996, 57.0004);
      const centerFore = await pg.evaluate(() => (window as any).map.getCenter());
      await pg.mouse.move(v.x, v.y + 12); await pg.mouse.down();
      await pg.mouse.move(v.x, v.y - 60, { steps: 6 });
      await skriv(pg, 'korupp_dras');
      await pg.mouse.move(v.x, v.y - 140, { steps: 6 });
      await pg.mouse.up();
      const ev = await pg.evaluate(() => (window as any).handelser);
      expect(ev.filter((e: any) => e.typ === 'forhands' && e.pil).length).toBeGreaterThan(3);
      expect(ev[ev.length - 1]).toMatchObject({ typ: 'korupp' });
      const pil = ev[ev.length - 1].pil;
      expect(pil.vagId).toBe('v1');
      // starten ligger PÅ vägen (lat 57.0004), inte där fingret sattes
      expect(Math.abs(pil.start.lat - 57.0004)).toBeLessThan(0.000003);
      const lang = await pg.evaluate((p: any) => (window as any).L.korUppLangdM(p), pil);
      expect(lang).toBeGreaterThan(20);
      const centerEfter = await pg.evaluate(() => (window as any).map.getCenter());
      expect(centerEfter.lng).toBeCloseTo(centerFore.lng, 6); expect(centerEfter.lat).toBeCloseTo(centerFore.lat, 6);
      // ett drag på 3 px är ett tryck, inte en pil
      await pg.evaluate(() => { (window as any).handelser.length = 0; });
      await pg.mouse.move(v.x + 100, v.y + 100); await pg.mouse.down(); await pg.mouse.move(v.x + 103, v.y + 100); await pg.mouse.up();
      const efter = await pg.evaluate(() => (window as any).handelser);
      expect(efter.filter((e: any) => e.typ === 'korupp'), JSON.stringify(efter)).toHaveLength(0);
    });
  }, 120000);

  it('en pil som börjar långt från alla vägar får ingen väg (vagId null) — starten ligger där fingret sattes', async () => {
    await oppna({ zoom: 17, pitch: 0, bearing: 0 }, async (pg) => {
      await pg.evaluate(() => { (window as any).lage.korUppRita = true; });
      await pg.mouse.move(150, 560); await pg.mouse.down(); await pg.mouse.move(250, 470, { steps: 5 }); await pg.mouse.up();
      const ev = await pg.evaluate(() => (window as any).handelser);
      const pil = ev[ev.length - 1].pil;
      expect(ev[ev.length - 1].typ).toBe('korupp');
      expect(pil.vagId).toBeNull();
    });
  }, 120000);
});
