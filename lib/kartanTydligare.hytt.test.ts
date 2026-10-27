// @vitest-environment node
// KARTAN TYDLIGARE I RIKTIG CHROMIUM + MAPLIBRE (Martin 2026-10-27: "kartorna och körspåren är för svaga, grått, dött"). jsdom kan inte rita — här mäts det i pixlar:
//  • körspåren (RIKTIGA hyttspår ur prod, fixtur hyttspar_utjamning) syns tydligt mot både ett flygfoto och en vit karta, tydligare än FÖRE (de dämpade från 2026-10-26),
//  • bakgrunden är inte grå vid standardstyrkan (85) — men är det vid Dämpad (0), så mätningen har tänder — och Skarp (100) är orörd bild,
//  • överläggets reglage (15 mot standard) ändrar det som ritas, via de riktiga funktionerna,
//  • produktionshögarna är oförändrade: samma lagerdefinition, och en opak högikon har exakt samma pixlar i varje läge.
// Bakgrunderna är SYNTETISKA (nätverket nås inte härifrån, ingen riktig ortofoto-ruta): flygfotot är mörk skog med åker, grusväg och hygge, den vita kartan har vägar, skog och sjö.
// KARTAN_SKRIV=<mapp> sparar före/efter-bilderna. Finns ingen Chromium hoppas mätningen över.
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
const SKRIV = process.env.KARTAN_SKRIV;

const fixtur = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'lib/__fixtures__/hyttspar_utjamning_2026-10-08.json'), 'utf8'));
const tillLngLat = (p: number[][]): number[][] => p.map(([lat, lng]) => [lng, lat]);
const SKORDARE = tillLngLat(fixtur.trestensdal_idag);   // dagens skördarspår (509 punkter)
const SKOTARE = tillLngLat(fixtur.trestensdal_igar);    // ett äldre spår (7 dagar) — ritas som skotarens

function bunta(): string {
  const mapp = fs.mkdtempSync(path.join(os.tmpdir(), 'kartan-tydligare-'));
  const ingang = path.join(mapp, 'entry.ts');
  fs.writeFileSync(ingang, ['kartBas', 'sparStil', 'lagerOpacitet', 'kartReglage', 'kartstil'].map((f) => `export * from ${JSON.stringify(path.join(process.cwd(), 'lib', f))};`).join('\n'));
  const ut = path.join(mapp, 'lib.js');
  createRequire(import.meta.url)('esbuild').buildSync({ entryPoints: [ingang], bundle: true, format: 'iife', globalName: 'lib', outfile: ut, logLevel: 'error' });
  return ut;
}

type Lage = { namn: string; styrka: number; spar: 'fore' | 'ny'; overlayProcent?: number };
type Resultat = { namn: string; kontrastSkordare: number; kontrastSkotare: number; mattnad: number; ljus: number; hog: number[][]; hogPaint: string; overlayPixel: number[] };

async function mat(bakgrund: 'flygfoto' | 'vit', lagen: Lage[]): Promise<Resultat[]> {
  const b = await CHROMIUM!.launch({});
  try {
    const pg = await b.newPage({ viewport: { width: 760, height: 520 } });
    await pg.setContent('<!doctype html><html><head><meta charset="utf-8"><style>html,body,#m{margin:0;height:100%}</style></head><body><div id="m"></div></body></html>');
    await pg.addScriptTag({ path: path.join(MAPLIBRE, 'maplibre-gl.js') });
    await pg.addScriptTag({ path: bunta() });
    const ut: Resultat[] = [];
    await pg.evaluate(async (p: any) => {
      const L = (window as any).lib; const ml = (window as any).maplibregl;
      // deterministisk slump
      let s = 12345; const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
      // ── syntetisk bakgrund ──
      const W = 1024; const c = document.createElement('canvas'); c.width = W; c.height = W; const g = c.getContext('2d')!;
      if (p.bakgrund === 'flygfoto') {
        g.fillStyle = '#2f4a22'; g.fillRect(0, 0, W, W);
        for (let i = 0; i < 9000; i++) { const t = rnd(); g.fillStyle = t < 0.5 ? '#3a5a2a' : t < 0.8 ? '#264019' : '#4d6b34'; g.fillRect(rnd() * W, rnd() * W, 3 + rnd() * 6, 3 + rnd() * 6); }
        g.fillStyle = '#c9b98a'; g.fillRect(40, 60, 300, 200);                    // åker
        g.fillStyle = '#8f7e55'; g.fillRect(560, 120, 280, 220);                  // hygge
        g.strokeStyle = '#d9d2bd'; g.lineWidth = 14; g.beginPath(); g.moveTo(0, 700); g.lineTo(520, 480); g.lineTo(W, 520); g.stroke();   // grusväg
      } else {
        g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, W, W);
        g.fillStyle = '#cfe3b5'; for (let i = 0; i < 14; i++) g.fillRect(rnd() * W, rnd() * W, 120 + rnd() * 160, 90 + rnd() * 140);
        g.fillStyle = '#aacbe8'; g.beginPath(); g.ellipse(820, 800, 120, 70, 0.4, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#b8b8b8'; g.lineWidth = 12; g.beginPath(); g.moveTo(0, 700); g.lineTo(520, 480); g.lineTo(W, 520); g.stroke();
        g.strokeStyle = '#ffffff'; g.lineWidth = 8; g.beginPath(); g.moveTo(0, 700); g.lineTo(520, 480); g.lineTo(W, 520); g.stroke();
        g.strokeStyle = '#c8a97e'; g.lineWidth = 1; for (let i = 0; i < 40; i++) { g.beginPath(); g.moveTo(0, i * 26); g.bezierCurveTo(300, i * 26 + 40, 700, i * 26 - 40, W, i * 26 + 10); g.stroke(); }
      }
      const alla = [...p.skordare, ...p.skotare];
      const lngs = alla.map((x: number[]) => x[0]), lats = alla.map((x: number[]) => x[1]);
      const w = Math.min(...lngs) - 0.0012, e = Math.max(...lngs) + 0.0012, so = Math.min(...lats) - 0.0008, no = Math.max(...lats) + 0.0008;
      const map = new ml.Map({ container: 'm', center: [(w + e) / 2, (so + no) / 2], zoom: 14, fadeDuration: 0, canvasContextAttributes: { preserveDrawingBuffer: true }, attributionControl: false,
        style: { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#e8e8e8' } }] } });
      await new Promise((r) => map.on('load', r));
      map.fitBounds([[w, so], [e, no]], { padding: 10, animate: false });
      map.addSource('bas', { type: 'image', url: c.toDataURL(), coordinates: [[w, no], [e, no], [e, so], [w, so]] });
      const BAS = p.bakgrund === 'flygfoto' ? 'satellite-layer' : 'lm-layer';
      map.addLayer({ id: BAS, type: 'raster', source: 'bas', paint: {} });
      // överlägg (WMS-liknande): en rutnätsbild som raster med lagrets standardopacitet 0,7 — styrs av de riktiga funktionerna
      const o = document.createElement('canvas'); o.width = 64; o.height = 64; const og = o.getContext('2d')!; og.fillStyle = '#ff00ff'; og.fillRect(0, 0, 64, 64);
      map.addSource('overlay', { type: 'image', url: o.toDataURL(), coordinates: [[w, so + (no - so) * 0.2], [w + (e - w) * 0.2, so + (no - so) * 0.2], [w + (e - w) * 0.2, so], [w, so]] });
      map.addLayer({ id: 'wms-layer-sks_markfuktighet', type: 'raster', source: 'overlay', paint: { 'raster-opacity': 0.7 } });
      // väg (basväg: blå med mörk kant, som i appen)
      const geo = (coords: number[][], props: any = {}) => ({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: props, geometry: { type: 'LineString', coordinates: coords } }] });
      const vagC = [[w + (e - w) * 0.1, so + (no - so) * 0.25], [w + (e - w) * 0.5, so + (no - so) * 0.4], [e - (e - w) * 0.1, so + (no - so) * 0.35]];
      map.addSource('vag', { type: 'geojson', data: geo(vagC) });
      map.addLayer({ id: 'vag-kant', type: 'line', source: 'vag', paint: { 'line-color': L.VAG_KANT_FARG, 'line-width': 7 } });
      map.addLayer({ id: 'vag', type: 'line', source: 'vag', paint: { 'line-color': '#3b82f6', 'line-width': 4 } });
      // spår: skördare idag (alder 0), skotare äldre (alder 7)
      map.addSource('skordare', { type: 'geojson', data: geo(p.skordare, { alder: 0 }) });
      map.addSource('skotare', { type: 'geojson', data: geo(p.skotare, { alder: 7 }) });
      for (const [id, k] of [['skordare', 'skordare'], ['skotare', 'skotare']]) {
        map.addLayer({ id: `${id}-kant`, type: 'line', source: id, paint: { 'line-color': '#000', 'line-width': 1, 'line-opacity': 0 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
        map.addLayer({ id: `${id}-linje`, type: 'line', source: id, paint: { 'line-color': '#000', 'line-width': 1, 'line-opacity': 1 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
      }
      // produktionshögar: samma lagerdefinition som i page.tsx (hogar-cluster), plus en OPAK högikon (pie) som symbol
      const hogPunkter = [[w + (e - w) * 0.85, so + (no - so) * 0.85], [w + (e - w) * 0.15, so + (no - so) * 0.8], [w + (e - w) * 0.5, so + (no - so) * 0.9]];
      map.addSource('hogar-source', { type: 'geojson', data: { type: 'FeatureCollection', features: hogPunkter.map((x) => ({ type: 'Feature', properties: { volym: 20 }, geometry: { type: 'Point', coordinates: x } })) } });
      map.addLayer({ id: 'hogar-cluster', type: 'circle', source: 'hogar-source', paint: { 'circle-radius': 24, 'circle-color': '#1d9e75', 'circle-opacity': 0.8, 'circle-stroke-width': 2.5, 'circle-stroke-color': 'rgba(255,255,255,0.8)' } });
      const pie = document.createElement('canvas'); pie.width = 40; pie.height = 40; const pg2 = pie.getContext('2d')!;
      pg2.fillStyle = '#1b5e20'; pg2.beginPath(); pg2.arc(20, 20, 18, 0, Math.PI * 2); pg2.fill(); pg2.fillStyle = '#f5a623'; pg2.beginPath(); pg2.moveTo(20, 20); pg2.arc(20, 20, 18, 0, 2.2); pg2.fill();
      const px = pg2.getImageData(0, 0, 40, 40);
      map.addImage('pie', { width: 40, height: 40, data: new Uint8Array(px.data.buffer) }, { pixelRatio: 1 });
      map.addLayer({ id: 'hogar-circle', type: 'symbol', source: 'hogar-source', layout: { 'icon-image': 'pie', 'icon-allow-overlap': true } });

      const stilar = (spar: string) => {
        if (spar === 'fore') {   // de dämpade spåren från 2026-10-26 (FÖRE)
          return { skordare: { farg: '#b093c9', bredd: 3, opacitet: ['interpolate', ['linear'], ['coalesce', ['to-number', ['get', 'alder']], 0], 0, 0.6, 14, 0.2], kantOp: 0, kantB: 3, kantF: '#fff' },
                   skotare: { farg: '#7fae8d', bredd: 2, opacitet: ['interpolate', ['linear'], ['coalesce', ['to-number', ['get', 'alder']], 0], 0, 0.5, 14, 0.12], kantOp: 0, kantB: 2, kantF: '#fff' } };
        }
        const a = L.dampatSpar('skordare', 'plan'), b = L.dampatSpar('skotare', 'plan');
        return { skordare: { farg: a.farg, bredd: a.bredd, opacitet: a.opacitet, kantOp: a.kantOpacitet, kantB: a.kantBredd, kantF: a.kantFarg },
                 skotare: { farg: b.farg, bredd: b.bredd, opacitet: b.opacitet, kantOp: b.kantOpacitet, kantB: b.kantBredd, kantF: b.kantFarg } };
      };
      const idle = () => new Promise((r) => { map.once('idle', r); map.triggerRepaint(); });
      const las = (punkter: number[][]) => {
        const o2 = document.createElement('canvas'); o2.width = map.getCanvas().width; o2.height = map.getCanvas().height; const x = o2.getContext('2d')!; x.drawImage(map.getCanvas(), 0, 0);
        const f = o2.width / map.getCanvas().clientWidth;
        return punkter.map((q) => { const pp = map.project(q); const d = x.getImageData(Math.round(pp.x * f), Math.round(pp.y * f), 1, 1).data; return [d[0], d[1], d[2]]; });
      };
      const dist = (a: number[], b2: number[]) => Math.hypot(a[0] - b2[0], a[1] - b2[1], a[2] - b2[2]);
      const urval = (rad: number[][]) => rad.filter((_, i) => i % 7 === 3);
      const mid = (rad: number[][]) => rad.slice(Math.floor(rad.length * 0.15), Math.floor(rad.length * 0.85));
      const ptsSkordare = urval(mid(p.skordare)), ptsSkotare = urval(mid(p.skotare));
      const patch: number[][] = []; for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) patch.push([w + (e - w) * (0.55 + i * 0.012), so + (no - so) * (0.55 + j * 0.012)]);
      const minne = L.nyttSkalaMinne();
      (window as any).rigg = { kor: async (lage: any) => {
        const kb = L.kartBasPaint(p.bakgrund === 'flygfoto' ? 'satellite' : 'lantmateriet', lage.styrka);
        for (const [k, v] of Object.entries(kb)) map.setPaintProperty(BAS, k, v);
        L.tillampaLagerOpacitet(map, lage.overlayProcent == null ? {} : { sks_markfuktighet: lage.overlayProcent }, minne);
        const st = stilar(lage.spar);
        for (const [id, s] of [['skordare', st.skordare], ['skotare', st.skotare]] as const) {
          map.setPaintProperty(`${id}-linje`, 'line-color', s.farg); map.setPaintProperty(`${id}-linje`, 'line-width', s.bredd); map.setPaintProperty(`${id}-linje`, 'line-opacity', s.opacitet);
          map.setPaintProperty(`${id}-kant`, 'line-color', s.kantF); map.setPaintProperty(`${id}-kant`, 'line-width', s.kantB); map.setPaintProperty(`${id}-kant`, 'line-opacity', s.kantOp);
        }
        const dolj = (v: 'none' | 'visible') => { for (const id of ['skordare', 'skotare']) { map.setLayoutProperty(`${id}-linje`, 'visibility', v); map.setLayoutProperty(`${id}-kant`, 'visibility', v); } };
        dolj('none'); await idle();
        const utanA = las(ptsSkordare), utanB = las(ptsSkotare), bas = las(patch);
        dolj('visible'); await idle();
        const medA = las(ptsSkordare), medB = las(ptsSkotare);
        const medel = (a: number[][], b2: number[][]) => a.reduce((sum, x, i) => sum + dist(x, b2[i]), 0) / a.length;
        const mattnad = bas.reduce((sum, x) => sum + (Math.max(...x) - Math.min(...x)) / 255, 0) / bas.length;
        const ljus = bas.reduce((sum, x) => sum + (x[0] + x[1] + x[2]) / 3 / 255, 0) / bas.length;
        const overlayPunkt = [w + (e - w) * 0.05, so + (no - so) * 0.05];
        return { namn: lage.namn, kontrastSkordare: medel(medA, utanA), kontrastSkotare: medel(medB, utanB), mattnad, ljus, hog: las(hogPunkter), hogPaint: JSON.stringify(['circle-radius', 'circle-color', 'circle-opacity', 'circle-stroke-width', 'circle-stroke-color'].map((k) => map.getPaintProperty('hogar-cluster', k))), overlayPixel: las([overlayPunkt])[0] };
      } };
    }, { bakgrund, skordare: SKORDARE, skotare: SKOTARE });
    for (const lage of lagen) {
      ut.push(await pg.evaluate((l: any) => (window as any).rigg.kor(l), lage));
      if (SKRIV && (lage.namn === 'fore' || lage.namn === 'ny' || lage.namn === 'skarp')) { fs.mkdirSync(SKRIV, { recursive: true }); await pg.screenshot({ path: path.join(SKRIV, `${bakgrund}-${lage.namn}.png`) }); }
    }
    return ut;
  } finally { await b.close(); }
}

const LAGEN: Lage[] = [
  { namn: 'fore', styrka: 0, spar: 'fore' },                    // Kartan lugnare: Dämpad + de dämpade spåren
  { namn: 'ny', styrka: 85, spar: 'ny' },                      // standard nu
  { namn: 'forespar-nybas', styrka: 85, spar: 'fore' },        // de gamla spåren på den NYA bakgrunden: isolerar vad spårändringen ensam gör
  { namn: 'skarp', styrka: 100, spar: 'ny' },
  { namn: 'ny-overlay15', styrka: 85, spar: 'ny', overlayProcent: 15 },
  { namn: 'ny-overlay70', styrka: 85, spar: 'ny', overlayProcent: 70 },
];

describe.skipIf(!CHROMIUM)('Kartan tydligare — mätt i pixlar', () => {
  for (const bakgrund of ['flygfoto', 'vit'] as const) {
    describe(bakgrund, () => {
      let r: Record<string, Resultat> = {};
      it('mätningen körs', async () => {
        const lista = await mat(bakgrund, LAGEN);
        r = Object.fromEntries(lista.map((x) => [x.namn, x]));
        if (SKRIV) fs.writeFileSync(path.join(SKRIV, `mattning-${bakgrund}.json`), JSON.stringify(lista, null, 2));
        expect(lista.length).toBe(LAGEN.length);
      }, 180000);
      // Kontrasten är RGB-avståndet mellan pixeln med och utan spåret. Mot den NYA (ljusare) bakgrunden isoleras vad spårändringen ensam gör; mot den gamla (mörkare) ger en ljus spårfärg
      // ett stort avstånd redan förut — därför jämförs inte nytt spår + ny bakgrund mot gammalt spår + gammal bakgrund (det talet står i PR-texten).
      it('skördarens spår (idag) syns tydligt, och tydligare än de gamla spåren på samma bakgrund', () => {
        expect(r.ny.kontrastSkordare, `${bakgrund} ny ${r.ny.kontrastSkordare}`).toBeGreaterThan(r.ny.kontrastSkordare > 0 ? r['forespar-nybas'].kontrastSkordare * 1.3 : 0);
        expect(r.ny.kontrastSkordare, `${bakgrund} ny ${r.ny.kontrastSkordare}`).toBeGreaterThan(60);
      });
      it('skotarens äldre spår (7 dagar) syns också, och tydligare än de gamla på samma bakgrund (golvet är högt)', () => {
        expect(r.ny.kontrastSkotare, `${bakgrund} ny ${r.ny.kontrastSkotare}`).toBeGreaterThan(r['forespar-nybas'].kontrastSkotare * 1.3);
        expect(r.ny.kontrastSkotare).toBeGreaterThan(45);
      });
      it('bakgrunden är inte grå vid standard: nästan all färg och ljus kvar mot Skarp — men Dämpad är grå (mätningen har tänder)', () => {
        expect(r.skarp.mattnad).toBeGreaterThan(0.05);   // bilden har färg att mäta
        expect(r.ny.mattnad, `${bakgrund}`).toBeGreaterThanOrEqual(r.skarp.mattnad * 0.8);
        expect(r.ny.ljus).toBeGreaterThanOrEqual(r.skarp.ljus * 0.8);
        expect(r.fore.mattnad).toBeLessThan(r.skarp.mattnad * 0.6);   // förut: tydligt gråare
        expect(r.fore.ljus).toBeLessThan(r.skarp.ljus * 0.8);
      });
      it('reglaget på ett överlägg ändrar det som ritas (15 är ljusare bakgrund än standard 70) och rör inget annat', () => {
        const d = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
        expect(d(r['ny-overlay15'].overlayPixel, r['ny-overlay70'].overlayPixel)).toBeGreaterThan(40);
        expect(r['ny-overlay15'].mattnad).toBeCloseTo(r['ny-overlay70'].mattnad, 6);   // bakgrundsprovet ligger utanför överlägget
      });
      it('produktionshögarna är oförändrade: samma lagerdefinition och exakt samma pixlar i högikonen i varje läge (spår, bakgrund och reglage)', () => {
        for (const n of Object.keys(r)) expect(r[n].hogPaint, n).toBe(r.fore.hogPaint);
        // högikonen är opak: mittpixeln (tredje högen ligger fritt) är identisk oavsett bakgrundsstyrka, spår och reglage
        for (const n of Object.keys(r)) expect(r[n].hog[2], `${n} ${bakgrund}`).toEqual(r.fore.hog[2]);
        expect(r.fore.hog[2]).not.toEqual([0, 0, 0]);
      });
    });
  }
});
