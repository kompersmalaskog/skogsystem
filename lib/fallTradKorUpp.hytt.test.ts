// @vitest-environment node
// FÄLLTRÄD OCH KÖR UPP OCH BACKA I RIKTIG CHROMIUM + MAPLIBRE (2026-10-25). jsdom kan varken rita en karta eller skicka ett riktigt finger — därför mäts det här i pixlar och med riktiga mus-
// och pekhändelser mot kartans canvas (CDP för pek): trädet vrids runt stubben, handtaget hittas där ringen ritas (även med lutad och vriden karta), draget från vägen blir en pil som börjar
// PÅ vägen, kartan panorerar inte under draget, och ett drag som inte börjar på handtaget panorerar som vanligt. Själva lib-koden buntas med esbuild och körs i webbläsaren (inga kopior).
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
      add(L.TRAD_BILD, L.ritaTradBild(false), 2); add(L.TRAD_BILD_REDIGERA, L.ritaTradBild(true), 2); add(L.KORUPP_SPETS_BILD, L.ritaSpetsBild(), 2);
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
      w.ritaOm = () => { map.getSource(L.TRAD_KALLA).setData(L.tradData(w.trad, { redigera: true })); map.getSource(L.KORUPP_KALLA).setData(L.korUppData(w.pilar)); };
      w.ritaOm();
      w.handelser = [];
      w.lage = { korUppRita: false };
      w.stang = L.kopplaFallOchKorUppGester(map, () => ({
        map, klar: true, redigerbara: w.lage.redigerbara !== false, tradRef: { current: w.trad }, korUppRita: w.lage.korUppRita,
        vagarRef: { current: [{ id: 'v1', coords: [[14.9985, 57.0004], [15.0015, 57.0004]] }, { id: 'v2', coords: [[15.0, 57.0004], [15.0, 56.9992]] }] },
        onVrid: (id: string, vinkel: number, spara: boolean) => { w.handelser.push({ typ: 'vrid', id, vinkel, spara }); w.trad = w.trad.map((t: any) => (t.id === id ? { ...t, vinkel } : t)); w.ritaOm(); },
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

describe.skipIf(!CHROMIUM)('Fällträd — riktig Chromium + MapLibre', () => {
  for (const p of [{ zoom: 17, pitch: 0, bearing: 0 }, { zoom: 16.5, pitch: 50, bearing: 30 }]) {
    it(`trädet vrids runt stubben, kronan pekar åt vinkeln och ringen ligger på handtagets plats (zoom ${p.zoom}, lutning ${p.pitch}°, riktning ${p.bearing}°)`, async () => {
      await oppna(p, async (pg) => {
        await skriv(pg, `trad_z${p.zoom}_p${p.pitch}`);
        const m = await pg.evaluate(async () => {
          const w = window as any; const map = w.map;
          await new Promise((r) => { map.once('idle', r); map.triggerRepaint(); });   // kopieras i samma uppgift som ritningen: annars är WebGL-bufferten tömd
          const cv = document.createElement('canvas'); cv.width = map.getCanvas().width; cv.height = map.getCanvas().height;
          const ctx = cv.getContext('2d')!; ctx.drawImage(map.getCanvas(), 0, 0);
          const dpr = cv.width / map.getCanvas().clientWidth;
          const data = ctx.getImageData(0, 0, cv.width, cv.height).data;
          const ut: any[] = [];
          for (const t of w.trad) {
            const s = map.project([t.stubbe.lon, t.stubbe.lat]); const h = w.L.handtagPunkt(t); const hp = map.project([h.lon, h.lat]);
            // stubbens krämfärg (#ecdcb6) och handtagets vita ring runt respektive förväntad plats
            const hitta = (cx: number, cy: number, rad: number, test: (r: number, g: number, b: number) => boolean) => {
              let sx = 0, sy = 0, n = 0;
              for (let y = Math.max(0, Math.round((cy - rad) * dpr)); y < Math.min(cv.height, Math.round((cy + rad) * dpr)); y++) for (let x = Math.max(0, Math.round((cx - rad) * dpr)); x < Math.min(cv.width, Math.round((cx + rad) * dpr)); x++) {
                const i = (y * cv.width + x) * 4; if (test(data[i], data[i + 1], data[i + 2])) { sx += x / dpr; sy += y / dpr; n++; }
              }
              return n ? { x: sx / n, y: sy / n, n } : null;
            };
            const stubbe = hitta(s.x, s.y, 14, (r, g, b) => r > 215 && g > 200 && b > 160 && b < 205);
            const ring = hitta(hp.x, hp.y, 26, (r, g, b) => r > 245 && g > 245 && b > 245);
            const krona = hitta((s.x + hp.x) / 2, (s.y + hp.y) / 2, 40, (r, g, b) => g > r + 40 && g > b + 25 && g > 100);
            ut.push({ id: t.id, s: { x: s.x, y: s.y }, hp: { x: hp.x, y: hp.y }, stubbe, ring, krona });
          }
          return ut;
        });
        for (const t of m) {
          expect(t.stubbe, `stubben saknas för ${t.id}`).not.toBeNull();
          expect(Math.hypot(t.stubbe.x - t.s.x, t.stubbe.y - t.s.y), `stubben ska ligga på trädets plats (${t.id})`).toBeLessThan(9);   // mitten av den krämfärgade ytan (ringar och prick drar den några px)
          expect(t.ring, `handtagsringen saknas för ${t.id}`).not.toBeNull();
          expect(Math.hypot(t.ring.x - t.hp.x, t.ring.y - t.hp.y), `ringen ska ligga där handtaget förväntas (${t.id})`).toBeLessThan(p.pitch ? 26 : 8);
          expect(t.krona, `kronan saknas för ${t.id}`).not.toBeNull();
          // kronan ligger på stubbens riktning mot handtaget (skalärprodukt > 0)
          const dx = t.hp.x - t.s.x, dy = t.hp.y - t.s.y;
          expect((t.krona.x - t.s.x) * dx + (t.krona.y - t.s.y) * dy, `kronan ska peka åt handtaget (${t.id})`).toBeGreaterThan(0);
        }
      });
    }, 120000);
  }

  it('MUS: ett drag på ringen vrider trädet (live + sparas vid släpp) och panorerar inte kartan; ett drag bredvid panorerar som vanligt', async () => {
    await oppna({ zoom: 16.5, pitch: 50, bearing: 30 }, async (pg) => {
      const s = await skarm(pg, 14.9992, 56.9996);
      const h = await pg.evaluate(() => { const w = window as any; const p = w.L.handtagPunkt(w.trad[0]); const q = w.map.project([p.lon, p.lat]); return { x: q.x, y: q.y }; });
      const centerFore = await pg.evaluate(() => (window as any).map.getCenter());
      await pg.mouse.move(h.x, h.y); await pg.mouse.down();
      await pg.mouse.move(h.x + 20, h.y + 40, { steps: 4 });
      await pg.mouse.move(s.x + 90, s.y, { steps: 6 });    // rakt åt höger om stubben på skärmen
      await skriv(pg, 'trad_dras');
      await pg.mouse.up();
      const ev = await pg.evaluate(() => (window as any).handelser);
      expect(ev.length).toBeGreaterThan(2);
      expect(ev.filter((e: any) => e.spara).length).toBe(1);
      expect(ev[ev.length - 1].spara).toBe(true);
      // skärmens "rakt åt höger" är kartans riktning 90 + 30 (kartan är vriden 30°) — jämfört mot kartans egen unproject
      const forvantat = await pg.evaluate(([x, y]: number[]) => { const w = window as any; const q = w.map.unproject([x, y]); return w.L.vinkelFranPunkt(w.trad[0].stubbe, { lat: q.lat, lon: q.lng }); }, [s.x + 90, s.y]);
      expect(Math.abs(((ev[ev.length - 1].vinkel - forvantat + 540) % 360) - 180)).toBeLessThan(3);
      const centerEfter = await pg.evaluate(() => (window as any).map.getCenter());
      expect(centerEfter.lng).toBeCloseTo(centerFore.lng, 6); expect(centerEfter.lat).toBeCloseTo(centerFore.lat, 6);
      // ett drag på tom mark panorerar
      await pg.evaluate(() => { (window as any).handelser.length = 0; });
      await pg.mouse.move(120, 120); await pg.mouse.down(); await pg.mouse.move(220, 200, { steps: 6 }); await pg.mouse.up();
      expect(await pg.evaluate(() => (window as any).handelser.length)).toBe(0);
      const c2 = await pg.evaluate(() => (window as any).map.getCenter());
      expect(Math.abs(c2.lng - centerEfter.lng) + Math.abs(c2.lat - centerEfter.lat)).toBeGreaterThan(1e-5);
    });
  }, 120000);

  it('körvyn rör aldrig ett träd: med redigerbara av vrider ett drag på ringen ingenting och kartan panorerar i stället', async () => {
    await oppna({ zoom: 17, pitch: 0, bearing: 0 }, async (pg) => {
      await pg.evaluate(() => { (window as any).lage.redigerbara = false; });
      const h = await pg.evaluate(() => { const w = window as any; const p = w.L.handtagPunkt(w.trad[0]); const q = w.map.project([p.lon, p.lat]); return { x: q.x, y: q.y }; });
      const fore = await pg.evaluate(() => (window as any).map.getCenter());
      await pg.mouse.move(h.x, h.y); await pg.mouse.down(); await pg.mouse.move(h.x + 80, h.y + 60, { steps: 6 }); await pg.mouse.up();
      expect(await pg.evaluate(() => (window as any).handelser.length)).toBe(0);
      const efter = await pg.evaluate(() => (window as any).map.getCenter());
      expect(Math.abs(efter.lng - fore.lng) + Math.abs(efter.lat - fore.lat)).toBeGreaterThan(1e-5);
    });
  }, 120000);

  it('PEK (riktigt finger via CDP): samma drag vrider trädet och panorerar inte kartan', async () => {
    await oppna({ zoom: 17, pitch: 0, bearing: 0, touch: true }, async (pg, ctx) => {
      const cdp = await ctx.newCDPSession(pg);
      const s = await skarm(pg, 15.0004, 56.9996);
      const h = await pg.evaluate(() => { const w = window as any; const p = w.L.handtagPunkt(w.trad[1]); const q = w.map.project([p.lon, p.lat]); return { x: q.x, y: q.y }; });
      const centerFore = await pg.evaluate(() => (window as any).map.getCenter());
      const punkt = (x: number, y: number) => [{ x, y, id: 1 }];
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: punkt(h.x, h.y) });
      for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: punkt(h.x + ((s.x - 80 - h.x) * i) / 8, h.y + ((s.y - h.y) * i) / 8) });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      const ev = await pg.evaluate(() => (window as any).handelser);
      expect(ev.filter((e: any) => e.spara).length).toBe(1);
      expect(Math.abs(((ev[ev.length - 1].vinkel - 270 + 540) % 360) - 180)).toBeLessThan(6);    // rakt åt vänster
      const centerEfter = await pg.evaluate(() => (window as any).map.getCenter());
      expect(centerEfter.lng).toBeCloseTo(centerFore.lng, 6); expect(centerEfter.lat).toBeCloseTo(centerFore.lat, 6);
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
