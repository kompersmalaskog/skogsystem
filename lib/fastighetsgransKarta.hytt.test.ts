// @vitest-environment node
// FASTIGHETSGRÄNSEN I RIKTIG CHROMIUM + MAPLIBRE (2026-10-22, "Fastighetsgräns supertydlig"). jsdom kan inte rita en karta, därför Chromium; finns ingen hoppas mätningen över.
// Ritar en syntetisk värld (två grannfastigheter A och B, en traktdel i A) med EXAKT lagerspecarna ur lib/fastighetsgransKarta och traktgränsen med samma konstanter som
// planeringsvyn (page.tsx är källvaktad nedan), på mörkgrön "flygfoto"-bakgrund och på vit karta, och mäter i pixlar:
//   1. rågången är en vit kärna med mörk kant — på BÅDA bakgrunderna (på vit syns den på kanten, på mörkt på kärnan),
//   2. gränspinnarna är röda,
//   3. traktgränsen ligger OVANPÅ rågången: där de sammanfaller syns ett vitt band med röd/gul snitsel i mitten, där de skiljer sig syns båda var för sig,
//   4. skimmer på trakten egen fastighet / nedtonad granne — och INGEN nedtoning när ägaren inte går att avgöra,
//   5. beteckningen står på båda sidor om gränsen,
//   6. en etikett per yta: en MultiPolygon med tre delar ger tre etiketter när polygonen själv bär etiketten (felet) och EN när etiketten är en punkt (lib/ytaEtikett).
// Skala: zoom 17 på lat 57 = 3,07 px per meter (MapLibres 512-rutor), vyn är 900 × 640 px = ±146 × ±104 m kring (200, 100).
// FASTIGHET_SKRIV=<mapp> sparar skärmbilderna.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { byggRagang } from './fastighetsgrans';
import { LEGEND } from './kartstil';
import { vidaEtikettPunkter } from './ytaEtikett';
import { RAGANG_LAGER_ORDNING, TRAKTGRANS_BREDD, TRAKTGRANS_KANT_BREDD, TRAKTGRANS_KANT_FARG, ragangKallor, ragangLager, forstaVektorLagerId } from './fastighetsgransKarta';

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
// FASTIGHET_UTAN_CHROMIUM=1: bara källvakterna (mutationskontrollen kör dem snabbt, Chromium-mätningarna för sig).
const CHROMIUM = process.env.FASTIGHET_UTAN_CHROMIUM ? null : chromium();
const MAPLIBRE = path.join(process.cwd(), 'node_modules/maplibre-gl/dist');

// -- världen, i meter (x österut, y norrut från [15, 57]) ----------------------------------------------------------------------------------
const LNG0 = 15, LAT0 = 57;
const KX = 111320 * Math.cos((LAT0 * Math.PI) / 180), KY = 111320;
const ll = (x: number, y: number): [number, number] => [LNG0 + x / KX, LAT0 + y / KY];
const ring = (pts: number[][]) => [...pts, pts[0]].map(([x, y]) => ll(x, y));
const ruta = (x0: number, y0: number, x1: number, y1: number) => ring([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
const fast = (trakt: string, block: string, r: number[][]) => ({ type: 'Feature', properties: { _lager: 'SV_FASTIGHET', DETALJTYP: 'fastighetsområde', TRAKT: trakt, BLOCKENHET: block, KOMMUNKOD: '0763' }, geometry: { type: 'Polygon', coordinates: [r] } });
const traktdel = (r: number[][]) => ({ type: 'Feature', properties: { _lager: 'L_TRAKTDEL' }, geometry: { type: 'MultiPolygon', coordinates: [[r]] } });
const A = fast('KOMPERSMÅLA', '3:12', ruta(0, 0, 200, 200));
const B = fast('RYD', '1:4', ruta(200, 0, 400, 200));
// Trakt i A. Östra kanten ligger PÅ rågången (x = 200) för y 40–100 och viker sedan in till x = 170 (y 100–160): där skiljer sig traktgränsen från rågången.
const TRAKT_EGEN = traktdel(ring([[60, 40], [200, 40], [200, 100], [170, 100], [170, 160], [60, 160]]));
// Trakt på BÅDA fastigheterna lika mycket (x 100–300): ägaren går inte att avgöra.
const TRAKT_PA_TVA = traktdel(ruta(100, 40, 300, 160));

type Rod = [number, number, number];
const BG: Record<string, string> = { flygfoto: '#3d4a2c', karta: '#f2efe9' };

interface Matt {
  /** kolumnen/raden i pixlar för en världskoordinat (meter) */
  pxX: (x: number) => number; pxY: (y: number) => number;
  px: (x: number, y: number) => Rod;
  rad: (y: number, x0: number, x1: number) => Rod[];
  kol: (x: number, y0: number, y1: number) => Rod[];
  bakgrund: Rod;
  /** antal sammanhängande textklumpar i ett fönster (m) */
  klumpar: (x0: number, y0: number, x1: number, y1: number) => number;
  /** antal ljusa pixlar (text) i ett fönster */
  ljusa: (x0: number, y0: number, x1: number, y1: number) => number;
}

async function rita(bakgrund: 'flygfoto' | 'karta', fc: any, opt: { skriv?: string; namn?: string; zoom?: number } = {}): Promise<Matt> {
  const modell = byggRagang(fc);
  expect(modell, 'byggRagang gav ingen modell').not.toBeNull();
  const b = await CHROMIUM!.launch({});
  try {
    const pg = await b.newPage({ viewport: { width: 900, height: 640 } });
    await pg.setContent('<!doctype html><html><head><meta charset="utf-8"><style>html,body,#m{margin:0;height:100%}</style></head><body><div id="m"></div></body></html>');
    await pg.addStyleTag({ path: path.join(MAPLIBRE, 'maplibre-gl.css') });
    await pg.addScriptTag({ path: path.join(MAPLIBRE, 'maplibre-gl.js') });
    await pg.evaluate(async (a: any) => {
      const el = document.getElementById('m')!; el.innerHTML = '';
      const map = new (window as any).maplibregl.Map({ container: 'm', center: a.center, zoom: a.zoom, fadeDuration: 0, preserveDrawingBuffer: true, attributionControl: false,
        style: { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': a.bg } }] } });
      (window as any).__map = map;
      await new Promise((r) => map.on('load', r));
      const data: Record<string, any> = { 'trakt-ragang-yta-source': a.modell.ytor, 'trakt-ragang-linje-source': a.modell.linjer, 'trakt-ragang-pinne-source': a.modell.pinnar, 'trakt-ragang-etikett-source': a.modell.etiketter };
      for (const [id, spec] of a.kallor) map.addSource(id, { ...spec, data: data[id] });
      map.addSource('traktdel-parts-source', { type: 'geojson', data: a.traktdelar });
      const forsta = a.forstaId;   // beforeId ur forstaVektorLagerId — här finns bara bakgrunden, alltså undefined (allt läggs överst, som på sidan)
      for (const { spec } of a.lager) { const s = JSON.parse(JSON.stringify(spec)); s.layout.visibility = 'visible'; map.addLayer(s, forsta); }
      // Traktgränsen, EXAKT som page.tsx ritar den (lagren läggs efter rågången): kant, röd linje, gult streck.
      map.addLayer({ id: 'trakt-gr-casing', type: 'line', source: 'traktdel-parts-source', paint: { 'line-color': a.kantFarg, 'line-width': a.kantBredd }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
      map.addLayer({ id: 'trakt-gr-line', type: 'line', source: 'traktdel-parts-source', paint: { 'line-color': a.fara, 'line-width': a.bredd }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
      map.addLayer({ id: 'trakt-gr-stripe', type: 'line', source: 'traktdel-parts-source', paint: { 'line-color': a.gul, 'line-width': a.bredd, 'line-dasharray': [2, 2] }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
      await new Promise((r) => { map.once('idle', r); map.triggerRepaint(); });
      const c = document.createElement('canvas'); c.width = map.getCanvas().width; c.height = map.getCanvas().height;
      (window as any).__ctx = c.getContext('2d')!; (window as any).__ctx.drawImage(map.getCanvas(), 0, 0);
      (window as any).__dpr = c.width / map.getCanvas().clientWidth;
    }, {
      bg: BG[bakgrund], zoom: opt.zoom ?? 17, center: ll(200, 100), modell: { ytor: modell!.ytor, linjer: modell!.linjer, pinnar: modell!.pinnar, etiketter: modell!.etiketter },
      kallor: ragangKallor(), lager: ragangLager(), forstaId: forstaVektorLagerId([{ id: 'bg', type: 'background' }]),
      traktdelar: { type: 'FeatureCollection', features: fc.features.filter((f: any) => f.properties._lager === 'L_TRAKTDEL').flatMap((f: any) => f.geometry.coordinates.map((p: any) => ({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: p } }))) },
      kantFarg: TRAKTGRANS_KANT_FARG, kantBredd: TRAKTGRANS_KANT_BREDD, bredd: TRAKTGRANS_BREDD, fara: LEGEND.fara, gul: LEGEND.gul,
    });
    if (opt.skriv) { fs.mkdirSync(opt.skriv, { recursive: true }); await pg.screenshot({ path: path.join(opt.skriv, `${opt.namn ?? 'bild'}-${bakgrund}.png`) }); }
    // Hämta hela bilden som en rad pixlar till noden (900 × 640 × 4 = 2,3 MB): all mätning sker sedan här, utan fler rundor till sidan.
    const bild: { w: number; h: number; dpr: number; data: number[]; pxX: number[]; pxY: number[] } = await pg.evaluate((a: any) => {
      const ctx = (window as any).__ctx, map = (window as any).__map, dpr = (window as any).__dpr;
      const w = ctx.canvas.width, h = ctx.canvas.height;
      const L = (x: number, y: number) => [a.lng0 + x / a.kx, a.lat0 + y / a.ky];
      return { w, h, dpr, data: Array.from(ctx.getImageData(0, 0, w, h).data as Uint8ClampedArray), pxX: a.xs.map((x: number) => map.project(L(x, 100)).x), pxY: a.ys.map((y: number) => map.project(L(200, y)).y) };
    }, { xs: Array.from({ length: 41 }, (_, i) => i * 10), ys: Array.from({ length: 21 }, (_, i) => i * 10), lng0: LNG0, lat0: LAT0, kx: KX, ky: KY });
    const { w, h, dpr, data } = bild;
    const interp = (tab: number[], steg: number, v: number) => { const i = Math.max(0, Math.min(tab.length - 2, Math.floor(v / steg))); return tab[i] + ((tab[i + 1] - tab[i]) * (v - i * steg)) / steg; };
    const pxX = (x: number) => interp(bild.pxX, 10, x), pxY = (y: number) => interp(bild.pxY, 10, y);
    const px = (x: number, y: number): Rod => { const X = Math.round(pxX(x) * dpr), Y = Math.round(pxY(y) * dpr); const i = (Y * w + X) * 4; return [data[i], data[i + 1], data[i + 2]]; };
    const at = (X: number, Y: number): Rod => { const i = (Y * w + X) * 4; return [data[i], data[i + 1], data[i + 2]]; };
    const bgRod = (hex: string): Rod => [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16)) as Rod;
    const ljus = (p: Rod) => p[0] > 235 && p[1] > 235 && p[2] > 235;
    const ljusa = (x0: number, y0: number, x1: number, y1: number) => {
      const X0 = Math.round(pxX(Math.min(x0, x1)) * dpr), X1 = Math.round(pxX(Math.max(x0, x1)) * dpr), Ya = Math.round(pxY(y0) * dpr), Yb = Math.round(pxY(y1) * dpr);
      let n = 0; for (let Y = Math.min(Ya, Yb); Y <= Math.max(Ya, Yb); Y++) for (let X = X0; X <= X1; X++) if (ljus(at(X, Y))) n++;
      return n;
    };
    const klumpar = (x0: number, y0: number, x1: number, y1: number) => {
      // Rutor om 6 px; en ruta är "text" om den har en ljus pixel (vit text med mörk glorie på mörk bakgrund); grannrutor (även diagonalt, 2 rutors glapp) slås ihop.
      const S = 6, X0 = Math.round(pxX(Math.min(x0, x1)) * dpr), X1 = Math.round(pxX(Math.max(x0, x1)) * dpr), Ya = Math.round(pxY(y0) * dpr), Yb = Math.round(pxY(y1) * dpr);
      const Y0 = Math.min(Ya, Yb), Y1 = Math.max(Ya, Yb), cols = Math.ceil((X1 - X0 + 1) / S), rows = Math.ceil((Y1 - Y0 + 1) / S);
      const occ = new Array(cols * rows).fill(false);
      for (let Y = Y0; Y <= Y1; Y++) for (let X = X0; X <= X1; X++) if (ljus(at(X, Y))) occ[Math.floor((Y - Y0) / S) * cols + Math.floor((X - X0) / S)] = true;
      const sett = new Array(cols * rows).fill(false); let n = 0;
      for (let s = 0; s < occ.length; s++) {
        if (!occ[s] || sett[s]) continue; n++;
        const k = [s]; sett[s] = true;
        while (k.length) {
          const c = k.pop()!, cx = c % cols, cy = Math.floor(c / cols);
          for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
            const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
            const t = ny * cols + nx; if (occ[t] && !sett[t]) { sett[t] = true; k.push(t); }
          }
        }
      }
      return n;
    };
    return {
      pxX, pxY, px, bakgrund: bgRod(BG[bakgrund]), klumpar, ljusa,
      rad: (y, x0, x1) => { const Y = Math.round(pxY(y) * dpr), out: Rod[] = []; for (let X = Math.round(pxX(x0) * dpr); X <= Math.round(pxX(x1) * dpr); X++) out.push(at(X, Y)); return out; },
      kol: (x, y0, y1) => { const X = Math.round(pxX(x) * dpr), out: Rod[] = []; const Ya = Math.round(pxY(y0) * dpr), Yb = Math.round(pxY(y1) * dpr); for (let Y = Math.min(Ya, Yb); Y <= Math.max(Ya, Yb); Y++) out.push(at(X, Y)); return out; },
    };
  } finally { await b.close(); }
}

const lum = (p: Rod) => 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2];
const arVit = (p: Rod) => p[0] > 225 && p[1] > 225 && p[2] > 225;
const arMork = (p: Rod) => lum(p) < 70;
const arRod = (p: Rod) => p[0] > 200 && p[1] < 110 && p[2] < 110;
const arGul = (p: Rod) => p[0] > 200 && p[1] > 150 && p[2] < 110;
const SKRIV = process.env.FASTIGHET_SKRIV;
const PX_PER_M = 3.07;

describe.skipIf(!CHROMIUM)('Rågången i riktig Chromium + MapLibre — vit kärna, mörk kant, på flygfoto OCH vit karta', () => {
  for (const bg of ['flygfoto', 'karta'] as const) {
    it(`${bg}: en vit kärna med mörk kant på båda sidor (rågång utan traktgräns, y = 20)`, async () => {
      const m = await rita(bg, { features: [A, B, TRAKT_EGEN] }, { skriv: SKRIV, namn: 'ragang' });
      const rad = m.rad(20, 170, 230);                         // tvärs över gränsen x = 200 där ingen traktgräns finns (trakten börjar vid y = 40)
      const mitt = Math.floor(rad.length / 2);
      expect(arVit(rad[mitt]), `kärnan blev rgb(${rad[mitt]})`).toBe(true);
      // Kärnan är minst 10 px bred (12 px vid zoom 17) — mät sammanhängande vita pixlar runt mitten.
      let v = 0; for (let i = mitt; i < rad.length && arVit(rad[i]); i++) v++; for (let i = mitt - 1; i >= 0 && arVit(rad[i]); i--) v++;
      expect(v, 'kärnans bredd i pixlar').toBeGreaterThanOrEqual(10);
      // Mörk kant på BÅDA sidor om kärnan (syns mot vit karta; på mörkt flygfoto syns kärnan i sig).
      const kantV = rad.slice(0, mitt - 5).reverse().findIndex(arMork), kantH = rad.slice(mitt + 6).findIndex(arMork);
      expect(kantV, 'mörk kant väster om kärnan').toBeGreaterThanOrEqual(0); expect(kantV).toBeLessThan(10);
      expect(kantH, 'mörk kant öster om kärnan').toBeGreaterThanOrEqual(0); expect(kantH).toBeLessThan(10);
    }, 90000);
  }

  it('gränspinnarna är röda prickar med vit kant (hörnet vid y = 0, där ingen traktgräns ligger över)', async () => {
    const m = await rita('flygfoto', { features: [A, B, TRAKT_EGEN] });
    const kol = m.kol(200, -8, 8);
    expect(kol.some(arRod), 'ingen röd pinne vid (200, 0)').toBe(true);
    const fara = LEGEND.fara; const [r, g, b] = [1, 3, 5].map((k) => parseInt(fara.slice(k, k + 2), 16));
    const rodast = kol.reduce((best, p) => (Math.abs(p[0] - r) + Math.abs(p[1] - g) + Math.abs(p[2] - b) < Math.abs(best[0] - r) + Math.abs(best[1] - g) + Math.abs(best[2] - b) ? p : best));
    expect(Math.abs(rodast[0] - r) + Math.abs(rodast[1] - g) + Math.abs(rodast[2] - b), `pinnens färg rgb(${rodast})`).toBeLessThan(60);
  }, 90000);
});

describe.skipIf(!CHROMIUM)('Traktgränsen OVANPÅ rågången — ingen döljer den andra', () => {
  for (const bg of ['flygfoto', 'karta'] as const) {
    it(`${bg}: där de sammanfaller (y 40–100) är det ett vitt band med snitselstreck i mitten`, async () => {
      const m = await rita(bg, { features: [A, B, TRAKT_EGEN] }, { skriv: SKRIV, namn: 'traktgrans' });
      const mittKol = m.kol(200, 50, 90);
      const snitsel = mittKol.filter((p) => arRod(p) || arGul(p)).length / mittKol.length;
      expect(snitsel, 'andel snitsel (röd/gul) längs mitten av det sammanfallande avsnittet').toBeGreaterThan(0.8);
      expect(mittKol.some(arRod), 'rött i snitseln').toBe(true);
      expect(mittKol.some(arGul), 'gult i snitseln').toBe(true);
      // Rågångens vita kant syns på båda sidor om snitseln (traktgränsen är smalare än kärnan): någon rad per sida ska ha vitt inom 3–5 px från mitten.
      const X = Math.round(m.pxX(200));
      let vanster = 0, hoger = 0, rader = 0;
      for (let y = 50; y <= 90; y += 2) {
        rader++;
        const r = m.rad(y, 200 - 16 / PX_PER_M, 200 + 16 / PX_PER_M);    // ±16 px kring rågången
        const mitt = Math.floor(r.length / 2);
        if (r.slice(mitt - 6, mitt - 3).some(arVit)) vanster++;
        if (r.slice(mitt + 4, mitt + 7).some(arVit)) hoger++;
      }
      expect(X).toBeGreaterThan(0);
      expect(vanster / rader, 'vitt band väster om snitseln').toBeGreaterThan(0.7);
      expect(hoger / rader, 'vitt band öster om snitseln').toBeGreaterThan(0.7);
    }, 90000);

    it(`${bg}: där de skiljer sig (y 100–160) syns båda var för sig — rågången vit vid x = 200, traktgränsen röd/gul vid x = 170`, async () => {
      const m = await rita(bg, { features: [A, B, TRAKT_EGEN] });
      const ragang = m.kol(200, 115, 145);
      expect(ragang.filter(arVit).length / ragang.length, 'rågången ensam är vit').toBeGreaterThan(0.8);
      expect(ragang.some((p) => arRod(p) || arGul(p)), 'ingen snitsel på rågången där traktgränsen viker av').toBe(false);
      const trakt = m.kol(170, 115, 145);
      expect(trakt.filter((p) => arRod(p) || arGul(p)).length / trakt.length, 'traktgränsen ensam är röd/gul').toBeGreaterThan(0.8);
    }, 90000);
  }
});

describe.skipIf(!CHROMIUM)('Vems mark — skimmer på trakten egen fastighet, nedtonad granne, och INGET när det inte går att avgöra', () => {
  it('trakten ligger i A: A ljusare än bakgrunden, B mörkare', async () => {
    const m = await rita('flygfoto', { features: [A, B, TRAKT_EGEN] }, { skriv: SKRIV, namn: 'skimmer-egen' });
    expect(lum(m.px(120, 20)), 'A (egen) ska vara ljusare än bakgrunden').toBeGreaterThan(lum(m.bakgrund) + 2);
    expect(lum(m.px(300, 20)), 'B (granne) ska vara mörkare än bakgrunden').toBeLessThan(lum(m.bakgrund) - 6);
  }, 90000);
  it('trakten ligger lika mycket på A och B: ingen av dem tonas — hellre lika än fel', async () => {
    const m = await rita('flygfoto', { features: [A, B, TRAKT_PA_TVA] }, { skriv: SKRIV, namn: 'skimmer-osaker' });
    expect(Math.abs(lum(m.px(120, 20)) - lum(m.bakgrund)), 'A ska vara orörd').toBeLessThan(1.5);
    expect(Math.abs(lum(m.px(300, 20)) - lum(m.bakgrund)), 'B ska vara orörd').toBeLessThan(1.5);
  }, 90000);
});

describe.skipIf(!CHROMIUM)('Beteckningen står på båda sidor om gränsen', () => {
  it('text (vit med mörk glorie) finns både 14 m väster och 14 m öster om rågången', async () => {
    const m = await rita('flygfoto', { features: [A, B, TRAKT_EGEN] }, { skriv: SKRIV, namn: 'beteckning', zoom: 18 });
    const vansterSida = m.ljusa(150, 55, 192, 145), hogerSida = m.ljusa(208, 55, 250, 145);
    expect(vansterSida, 'ingen beteckning på A:s sida').toBeGreaterThan(40);
    expect(hogerSida, 'ingen beteckning på B:s sida').toBeGreaterThan(40);
  }, 90000);
});

describe.skipIf(!CHROMIUM)('En etikett per yta — aldrig dubbel', () => {
  // Nyckelbiotop som MultiPolygon med tre delar, som i prod. Gammalt sätt: etiketten läses ur polygonkällan → en per del. Nytt: en punkt per yta (lib/ytaEtikett).
  const nb = { type: 'Feature', properties: { _lager: 'SV_SKS_NYCKELBIOTOP_101', _typ: 'nyckelbiotop', Beteckn: 'NB1' }, geometry: { type: 'MultiPolygon', coordinates: [[ruta(20, 20, 70, 70)], [ruta(90, 30, 150, 90)], [ruta(30, 110, 120, 190)]] } };
  it('mätningen har tänder: etiketten läst ur polygonen ger en per DEL (tre), punktkällan en', async () => {
    // Hela scenen i en egen sida: tre delar, två sätt att etikettera.
    const bild = async (kalla: 'poly' | 'punkt') => {
      const nbPunkt = vidaEtikettPunkter({ features: [nb] });
      const b = await CHROMIUM!.launch({});
      try {
        const pg = await b.newPage({ viewport: { width: 900, height: 640 } });
        await pg.setContent('<!doctype html><html><head><meta charset="utf-8"><style>html,body,#m{margin:0;height:100%}</style></head><body><div id="m"></div></body></html>');
        await pg.addStyleTag({ path: path.join(MAPLIBRE, 'maplibre-gl.css') });
        await pg.addScriptTag({ path: path.join(MAPLIBRE, 'maplibre-gl.js') });
        const antal = await pg.evaluate(async (a: any) => {
          const map = new (window as any).maplibregl.Map({ container: 'm', center: a.center, zoom: 17.5, fadeDuration: 0, preserveDrawingBuffer: true, attributionControl: false,
            style: { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#3d4a2c' } }] } });
          await new Promise((r) => map.on('load', r));
          map.addSource('nb', { type: 'geojson', data: { type: 'FeatureCollection', features: [a.nb] } });
          map.addSource('nb-punkt', { type: 'geojson', data: a.nbPunkt });
          map.addLayer({ id: 'nb-fill', type: 'fill', source: 'nb', paint: { 'fill-color': '#30d158', 'fill-opacity': 0.3 } });
          map.addLayer({ id: 'nb-label', type: 'symbol', source: a.kalla === 'poly' ? 'nb' : 'nb-punkt', layout: { 'text-field': 'NYCKELBIOTOP', 'text-size': 14, 'text-font': ['Open Sans Semibold', 'Arial Unicode MS Regular'], 'text-allow-overlap': true }, paint: { 'text-color': '#ffffff', 'text-halo-color': 'rgba(0,0,0,0.9)', 'text-halo-width': 1.8 } });
          await new Promise((r) => { map.once('idle', r); map.triggerRepaint(); });
          const c = document.createElement('canvas'); c.width = map.getCanvas().width; c.height = map.getCanvas().height;
          const ctx = c.getContext('2d')!; ctx.drawImage(map.getCanvas(), 0, 0);
          const w = c.width, h = c.height, d = ctx.getImageData(0, 0, w, h).data;
          // Textklumpar: ljusa pixlar (vit text) i 6 px-rutor, grannrutor (2 rutors glapp) slås ihop.
          const S = 6, cols = Math.ceil(w / S), rows = Math.ceil(h / S), occ = new Array(cols * rows).fill(false);
          for (let Y = 0; Y < h; Y++) for (let X = 0; X < w; X++) { const i = (Y * w + X) * 4; if (d[i] > 235 && d[i + 1] > 235 && d[i + 2] > 235) occ[Math.floor(Y / S) * cols + Math.floor(X / S)] = true; }
          const sett = new Array(cols * rows).fill(false); let n = 0;
          for (let s = 0; s < occ.length; s++) {
            if (!occ[s] || sett[s]) continue; n++; const k = [s]; sett[s] = true;
            while (k.length) { const q = k.pop()!, cx = q % cols, cy = Math.floor(q / cols); for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue; const t = ny * cols + nx; if (occ[t] && !sett[t]) { sett[t] = true; k.push(t); } } }
          }
          return n;
        }, { center: ll(75, 105), nb, nbPunkt, kalla });
        if (SKRIV) { fs.mkdirSync(SKRIV, { recursive: true }); await pg.screenshot({ path: path.join(SKRIV, `nb-${kalla}.png`) }); }
        return antal;
      } finally { await b.close(); }
    };
    const gammal = await bild('poly'), ny = await bild('punkt');
    expect(gammal, 'etiketten läst ur polygonen ska ge en per del').toBe(3);
    expect(ny, 'etikettpunkten ska ge exakt EN etikett').toBe(1);
  }, 120000);
});

// -- källvakter: sidan ritar rågången och etiketterna med de delade specarna --------------------------------------------------------------------
describe('page.tsx ritar rågången med de delade specarna', () => {
  const sida = fs.readFileSync(path.join(process.cwd(), 'app/planering/page.tsx'), 'utf8');
  it('rågångens källor och lager skapas ur lib/fastighetsgransKarta, skimret UNDER första vektorlagret, resten före traktgränsen', () => {
    expect(sida).toMatch(/for \(const \[id, spec\] of ragangKallor\(\)\) map\.addSource\(id, spec as any\)/);
    expect(sida).toMatch(/for \(const \{ spec, nedre \} of ragangLager\(\)\) map\.addLayer\(spec, nedre \? forstaVektorId : undefined\)/);
    expect(sida.indexOf('ragangLager()')).toBeLessThan(sida.indexOf("id: 'trakt-gr-casing'"));
  });
  it('traktgränsen är smal och kanten tunn (inget bredare svart band som täcker rågången under)', () => {
    expect(sida).toMatch(/const trTdW = TRAKTGRANS_BREDD as any/);
    expect(sida).toMatch(/const trTdCasingW = TRAKTGRANS_KANT_BREDD as any/);
    expect(sida).toMatch(/'line-color': TRAKTGRANS_KANT_FARG, 'line-width': trTdCasingW/);
    expect(sida).not.toMatch(/'line-color': 'rgba\(0,0,0,0\.9\)', 'line-width': trTdCasingW/);
  });
  it('de tre ytetikett-lagren och zone-label läser EN punkt per yta, inte polygonkällan', () => {
    for (const id of ['trakt-hansyn-label', 'trakt-nb-label', 'trakt-raa-label']) expect(sida).toMatch(new RegExp(`id: '${id}', type: 'symbol', source: 'trakt-etikett-source'`));
    expect(sida).toMatch(/id: 'zone-label',\s*type: 'symbol',\s*source: 'zones-etikett-source'/);
    expect(sida).toMatch(/zonEtikettPunkter\(features\)/);
    expect(sida).toMatch(/vidaEtikettPunkter\(traktGeo\)/);
  });
  it('rågångens lager följer körvyns whitelist (prefixet trakt-) och synlighet styrs av RAGANG_LAGER_ORDNING', () => {
    for (const id of RAGANG_LAGER_ORDNING) expect(id.startsWith('trakt-')).toBe(true);
    expect(sida).toMatch(/for \(const id of RAGANG_LAGER_ORDNING\)/);
  });
  it('tryck på rågången avstår för allt som är högre, och lagerknappen styr ritningen men INTE fällningsvarningen', () => {
    expect(sida).toMatch(/if \(vinnandeKategoriForKarta\(map, e\.point\) !== 'fastighet'\) return;/);
    expect(sida).toMatch(/const pa = !!overlays\.fastighetsgrans && !!ragang;/);
    expect(sida).toMatch(/const nu = fastighetsFall\(fgPos, ragang, /);          // säkerhetsvarningen ligger kvar även med lagret släckt
  });
  it('fällningscirkeln blir vit streckad bara när inget skyddsvärt vinner, och kortet viker för larm, instruktion och grind', () => {
    expect(sida).toMatch(/!fall\.grupp && fgFall \? fastighetsCirkelPaint\(!!visa\) : fallningCirkelPaint\(fall, !!visa\)/);
    expect(sida).toMatch(/fgFall && !fall\.grupp && !larm\.kort && !inst\.kort && !grindKort/);
  });
});
