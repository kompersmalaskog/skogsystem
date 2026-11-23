// @vitest-environment node
// TRYCK PÅ BROKAMÅLA (Martin 2026-11-23): "vissa hänsynsytor och symboler går inte att trycka på". Riktig Chromium + MapLibre med Brokamåla 1:5 V-H -26:s RIKTIGA data ur prod
// (fixtur: Vidas geometri med 5 hänsynsytor, 3 fornlämningsytor, 3 nyckelbiotoper, 23 fastighetsgränser och 65 rågångsstycken + planerarens 18 symboler, 4 zoner och 17 vägar) och sidans
// egna träfflager (line-hitbox 44 px, trakt-linje-hit 44 px, trakt-ragang-hit 22 px, markers-hit 44 px, zone-fill, trakt-*-fill). Prioriteringen, närmaste-träff-valet, stapeln och
// rågången är de RIKTIGA lib/klickPrioritet, lib/klickNara, lib/fastighetsgrans — buntade med esbuild. "Före" = reglerna före rättningen (kategorin avgör, träffytans hela bredd räknas,
// första träffen vinner). Finns ingen Chromium hoppas testet över (utom med KRAV_CHROMIUM=1).
import path from 'node:path';
import fs from 'node:fs';
import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';
import { hittaChromium, KARTA_ARGS } from './testStod/chromium';

const CHROMIUM = hittaChromium(KARTA_ARGS);
const MAPLIBRE = path.join(process.cwd(), 'node_modules/maplibre-gl/dist');
const ORIGIN = 'https://brokamala.invalid';
const FIX = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'lib/__fixtures__/brokamala_tryck_2026-11-23.json'), 'utf8'));

async function bunta(): Promise<string> {
  const r = await build({
    stdin: {
      contents: `import * as KP from './lib/klickPrioritet'; import * as TG from './lib/traktGeometri'; import * as LO from './lib/lagerOrdning'; import * as FG from './lib/fastighetsgrans'; import * as FK from './lib/fastighetsgransKarta'; import * as LT from './lib/linjeTryck'; import * as YS from './lib/ytaStil'; import * as KN from './lib/klickNara'; import * as SY from './lib/symboler'; import * as TA from './lib/traktAreal'; window.KLICK = { KP, TG, LO, FG, FK, LT, YS, KN, SY, TA };`,
      resolveDir: process.cwd(), loader: 'ts',
    },
    bundle: true, write: false, format: 'iife', platform: 'browser', logLevel: 'silent', keepNames: false,
  });
  return r.outputFiles[0].text;
}

async function oppna(b: any, lib: string) {
  const ctx = await b.newContext({ viewport: { width: 900, height: 900 } });
  const pg = await ctx.newPage();
  await pg.route(`${ORIGIN}/**`, (rt: any) => rt.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><head><meta charset="utf-8"><style>html,body,#m{margin:0;height:100%}</style></head><body><div id="m"></div></body></html>' }));
  await pg.goto(`${ORIGIN}/`);
  await pg.addStyleTag({ path: path.join(MAPLIBRE, 'maplibre-gl.css') });
  await pg.addScriptTag({ path: path.join(MAPLIBRE, 'maplibre-gl.js') });
  await pg.addScriptTag({ content: lib });
  return pg;
}

/** Bygger sidans träfflager av riktig data och mäter vem som vinner. Returnerar allt som testen kontrollerar. */
async function mat(pg: any, ragangPa: boolean) {
  return pg.evaluate(async (arg: any) => {
    const W = window as any; const { KP, TG, LO, FG, FK, LT, YS, KN, SY, TA } = W.KLICK;
    const { fix, ragangPa } = arg;
    const C = fix.origo;
    const scale = 156543.03392 * Math.cos(C.lat * Math.PI / 180) / Math.pow(2, 16);
    const kx = 111320 * Math.cos(C.lat * Math.PI / 180), ky = 111320;
    const svg = (x: number, y: number) => [C.lng + (x * scale) / kx, C.lat + (-y * scale) / ky];
    const map = new W.maplibregl.Map({ container: 'm', center: [C.lng, C.lat], zoom: 17, fadeDuration: 0, preserveDrawingBuffer: true, attributionControl: false,
      style: { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#3d4a2c' } }] } });
    await new Promise((r) => map.on('load', r));
    const fc = (features: any[]) => ({ type: 'FeatureCollection', features });
    const geoF = TA.medAreal(fc(fix.features)).features;
    const delar = geoF.filter((f: any) => f.properties._lager === 'L_TRAKTDEL').map((f: any, i: number) => ({ ...f, properties: { ...f.properties, _partKey: 'td:' + i } }));
    map.addSource('trakt-geo-source', { type: 'geojson', data: fc(geoF) });
    map.addSource('traktdel-parts-source', { type: 'geojson', data: fc(delar) });
    const mm = fix.markeringar;
    const linjer = mm.filter((m: any) => m.typ === 'linje' && (m.path || []).length >= 2).map((m: any) => ({ type: 'Feature', properties: { id: m.id }, geometry: { type: 'LineString', coordinates: m.path.map((p: any) => svg(p.x, p.y)) } }));
    map.addSource('lines-source', { type: 'geojson', data: fc(linjer) });
    const zoner = mm.filter((m: any) => m.typ === 'zon').map((m: any) => ({ type: 'Feature', properties: { id: m.id, color: '#30d158' }, geometry: { type: 'Polygon', coordinates: [m.path.map((p: any) => svg(p.x, p.y))] } }));
    map.addSource('zones-source', { type: 'geojson', data: fc(zoner) });
    const symb = mm.filter((m: any) => m.typ === 'symbol').map((m: any) => ({ type: 'Feature', properties: { id: m.id, type: m.type }, geometry: { type: 'Point', coordinates: svg(m.x, m.y) } }));
    map.addSource('markers-source', { type: 'geojson', data: fc(symb) });
    const rag = FG.byggRagang({ features: geoF });
    for (const [id, spec] of FK.ragangKallor()) map.addSource(id, spec);
    map.getSource(FK.RAGANG_KALLOR.yta).setData(rag.ytor); map.getSource(FK.RAGANG_KALLOR.linje).setData(rag.linjer); map.getSource(FK.RAGANG_KALLOR.etikett).setData(rag.etiketter);
    for (const { spec } of FK.ragangLager()) { if (ragangPa) spec.layout = { ...spec.layout, visibility: 'visible' }; map.addLayer(spec); }
    const FLB = ['downcase', ['to-string', ['coalesce', ['get', 'FLBESKR'], '']]];
    map.addLayer({ id: 'zone-fill', type: 'fill', source: 'zones-source', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.2 } });
    map.addLayer({ id: 'line-hitbox', type: 'line', source: 'lines-source', paint: { 'line-color': 'rgba(0,0,0,0)', 'line-width': LT.LINJE_TRAFF_PX } });
    map.addLayer({ id: 'trakt-gr-fill', type: 'fill', source: 'traktdel-parts-source', paint: { 'fill-color': '#ff453a', 'fill-opacity': 0 } });
    map.addLayer({ id: 'trakt-hansyn-fill', type: 'fill', source: 'trakt-geo-source', filter: YS.HANSYNSYTA_FILTER, paint: { 'fill-color': '#30d158', 'fill-opacity': 0.18 } });
    map.addLayer({ id: 'trakt-ovrigt-fill', type: 'fill', source: 'trakt-geo-source', filter: YS.OVRIGT_YTA_FILTER, paint: { 'fill-color': '#fff', 'fill-opacity': 0.01 } });
    map.addLayer({ id: 'trakt-linje-hit', type: 'line', source: 'trakt-geo-source', filter: ['==', ['get', '_typ'], 'linje'], paint: { 'line-color': 'rgba(0,0,0,0)', 'line-width': LT.LINJE_TRAFF_PX } });
    map.addLayer({ id: 'trakt-punkt-circle', type: 'circle', source: 'trakt-geo-source', filter: ['all', ['==', ['get', '_typ'], 'punkt'], ['!', ['in', 'larm', FLB]]], paint: { 'circle-radius': 10, 'circle-color': '#fff' } });
    map.addLayer({ id: 'trakt-nb-fill', type: 'fill', source: 'trakt-geo-source', filter: ['==', ['get', '_lager'], 'SV_SKS_NYCKELBIOTOP_101'], paint: { 'fill-color': '#30d158', 'fill-opacity': 0.1 } });
    map.addLayer({ id: 'trakt-raa-fill', type: 'fill', source: 'trakt-geo-source', filter: ['==', ['get', '_lager'], 'L_RAA_POLY_101'], paint: { 'fill-color': '#b5651d', 'fill-opacity': 0.14 } });
    map.addLayer({ id: 'trakt-raa-line', type: 'line', source: 'trakt-geo-source', filter: ['in', ['get', '_lager'], ['literal', ['L_RAA_POLY_101', 'L_RAA_LINE_101']]], paint: { 'line-color': '#b5651d', 'line-width': 2.5 } });
    map.addLayer({ id: 'trakt-raa-point', type: 'circle', source: 'trakt-geo-source', filter: ['==', ['get', '_lager'], 'L_RAA_POINT_101'], paint: { 'circle-radius': 6, 'circle-color': '#b5651d' } });
    map.addLayer({ id: 'markers-hit', type: 'circle', source: 'markers-source', paint: { 'circle-radius': 22, 'circle-color': 'rgba(0,0,0,0)' } });
    LO.installeraLagerOrdning(map);
    const alla = KP.ALLA_KLICK_LAGER.filter((l: string) => map.getLayer(l));
    const proj = (lng: number, lat: number) => map.project([lng, lat]);
    const idle = () => new Promise<void>((r) => { map.once('idle', () => r()); map.triggerRepaint(); });
    const inside = (p: number[], ring: number[][]) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if (((yi > p[1]) !== (yj > p[1])) && (p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi)) c = !c; } return c; };
    const raaRing = geoF.filter((f: any) => f.properties._lager === 'L_RAA_POLY_101').map((f: any) => f.geometry.coordinates[0]);
    const iRaa = (q: number[]) => raaRing.some((r: number[][]) => inside(q, r));
    const hansyn = (n: number) => geoF.find((f: any) => f.properties._lager === 'L_TILLAGGSYTOR' && f.properties.LOPNR === n).geometry.coordinates[0];

    // Sidans beslut vid ett tryck, FÖRE och EFTER.
    const vinnare = (pt: any, gammal: boolean) => {
      const feats = map.queryRenderedFeatures(pt, { layers: alla });
      return gammal ? KP.valjKlickKategori(feats.map((f: any) => f.layer.id)) : KN.vinnandeKategoriNara(feats, { x: pt.x, y: pt.y }, proj);
    };
    const stapelAv = (pt: any) => {
      const lager = ['trakt-punkt-circle', 'trakt-raa-point', 'trakt-raa-line', 'trakt-hansyn-fill', 'trakt-ovrigt-fill', 'trakt-nb-fill', 'trakt-raa-fill', 'trakt-gr-fill'].filter((l) => map.getLayer(l));
      const kand = map.queryRenderedFeatures(pt, { layers: lager }).filter((f: any) => TG.klassaTraktFeature(f.properties).kategori !== 'ignorera');
      const kortFranYta = (pr: any) => TG.byggTraktKort(pr);
      return KN.stapelOrdning(kand, (f: any) => TG.ytaNyckel(f.properties) ?? JSON.stringify(f.properties), (f: any) => KN.stapelRang(SY.traktKortBetydelse(kortFranYta(f.properties)).grupp), (f: any) => TG.traktArealHa(f.properties || {}))
        .map((f: any) => ({ lager: f.layer.id, rubrik: kortFranYta(f.properties).rubrik, grupp: SY.traktKortBetydelse(kortFranYta(f.properties)).grupp }));
    };
    // 1. Andel av varje hänsynsyta där trycket (före/efter) går till en LINJE eller RÅGÅNG i stället för ytan. Ytan sampas inuti, bara punkter där ingen symbol ligger över.
    const rapport: any = {};
    for (const n of [1, 2, 3, 4, 5]) {
      const ring = hansyn(n); const cx = ring.reduce((a: number, p: number[]) => a + p[0], 0) / ring.length, cy = ring.reduce((a: number, p: number[]) => a + p[1], 0) / ring.length;
      map.jumpTo({ center: [cx, cy], zoom: 16, pitch: 0, bearing: 0 }); await idle();
      const xs = ring.map((p: number[]) => p[0]), ys = ring.map((p: number[]) => p[1]);
      const rad: any = { n: 0, gammalLinjeEllerGrans: 0, nyLinjeEllerGrans: 0, gammalYta: 0, nyYta: 0 };
      for (let i = 0; i < 24; i++) for (let j = 0; j < 24; j++) {
        const q = [Math.min(...xs) + (Math.max(...xs) - Math.min(...xs)) * (i + .5) / 24, Math.min(...ys) + (Math.max(...ys) - Math.min(...ys)) * (j + .5) / 24];
        if (!inside(q, ring)) continue;
        const pt = map.project(q);
        if (map.queryRenderedFeatures(pt, { layers: ['markers-hit'] }).length) continue;   // symbolen vinner där, oförändrat
        rad.n++;
        const g = vinnare(pt, true), nyK = vinnare(pt, false);
        if (g === 'linje' || g === 'fastighet') rad.gammalLinjeEllerGrans++; if (g === 'yta') rad.gammalYta++;
        if (nyK === 'linje' || nyK === 'fastighet') rad.nyLinjeEllerGrans++; if (nyK === 'yta') rad.nyYta++;
      }
      rapport['hansyn' + n] = rad;
    }
    // 2. Fri punkt: längst från symboler och linjer — ytans eget tryck.
    const symP = symb.map((f: any) => f.geometry.coordinates);
    const allaLinjer: number[][][] = linjer.map((f: any) => f.geometry.coordinates); for (const f of geoF) if (f.properties._typ === 'linje') allaLinjer.push(f.geometry.coordinates);
    const dSeg = (p: number[], a: number[], b: number[]) => { const ax = (a[0] - p[0]) * kx, ay = (a[1] - p[1]) * ky, bx = (b[0] - p[0]) * kx, by = (b[1] - p[1]) * ky; const dx = bx - ax, dy = by - ay; const l2 = dx * dx + dy * dy; const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)); return Math.hypot(ax + t * dx, ay + t * dy); };
    const frihet = (p: number[]) => Math.min(...symP.map((q: number[]) => Math.hypot((p[0] - q[0]) * kx, (p[1] - q[1]) * ky)), ...allaLinjer.flatMap((l) => l.slice(1).map((q, i) => dSeg(p, l[i], q))));
    const basta = (ring: number[][], ok: (q: number[]) => boolean) => {
      const xs = ring.map((p) => p[0]), ys = ring.map((p) => p[1]); let b: number[] | null = null, bf = -1;
      for (let i = 0; i < 40; i++) for (let j = 0; j < 40; j++) { const q = [Math.min(...xs) + (Math.max(...xs) - Math.min(...xs)) * (i + .5) / 40, Math.min(...ys) + (Math.max(...ys) - Math.min(...ys)) * (j + .5) / 40]; if (!inside(q, ring) || !ok(q)) continue; const f = frihet(q); if (f > bf) { bf = f; b = q; } }
      return { p: b!, fri: bf };
    };
    const tryck = async (q: number[]) => { map.jumpTo({ center: q, zoom: 17, pitch: 0, bearing: 0 }); await idle(); const pt = map.project(q); return { gammal: vinnare(pt, true), ny: vinnare(pt, false), stapel: stapelAv(pt) }; };
    const fri: any = {};
    for (const n of [1, 4]) { const b = basta(hansyn(n), () => true); fri['hansyn' + n] = { fri: Math.round(b.fri), ...(await tryck(b.p)) }; }
    const ov = basta(hansyn(3), iRaa); fri.overlapp = { fri: Math.round(ov.fri), ...(await tryck(ov.p)) };
    const ut = basta(hansyn(3), (q) => !iRaa(q)); fri.utanforFornlamning = { fri: Math.round(ut.fri), ...(await tryck(ut.p)) };
    // 3. Två tätt liggande symboler: noten och bron.
    const note = mm.find((m: any) => m.type === 'note' && Math.abs(m.x + 68.5) < 1), bro = mm.find((m: any) => m.type === 'bridge');
    map.jumpTo({ center: svg(note.x, note.y), zoom: 16, pitch: 0, bearing: 0 }); await idle();
    const ptN = map.project(svg(note.x, note.y));
    const traffar = map.queryRenderedFeatures(ptN, { layers: ['markers-hit'] });
    const narmast = KN.narmasteTraff(traffar, { x: ptN.x, y: ptN.y }, proj);
    const symbol = { traffar: traffar.map((f: any) => f.properties.type), gammalForsta: traffar[0]?.properties.type, nyNarmast: narmast?.properties.type, avstandBroPx: Math.round(Math.hypot(map.project(svg(bro.x, bro.y)).x - ptN.x, map.project(svg(bro.x, bro.y)).y - ptN.y)) };
    // 4. Rågången: med lagret tänt får den inte stjäla en hänsyn bort från dess kant (≥ 8 px) — och utan yta under fingret gäller träffytan som förut.
    return { rapport, fri, symbol, ragangStycken: rag.linjer.features.length };
  }, { fix: FIX, ragangPa });
}

describe.skipIf(!CHROMIUM)('Tryck på Brokamåla — riktig Chromium + MapLibre med riktig data', () => {
  it('hänsynsytor, överlapp och tätt liggande symboler', async () => {
    const lib = await bunta();
    const b = await CHROMIUM!.launch({});
    try {
      const pg = await oppna(b, lib);
      const r = await mat(pg, true);
      if (process.env.BROKAMALA_SKRIV) console.log(JSON.stringify(r, null, 1));

      // FÖRE: breda träffytor tog trycket långt från själva linjen/gränsen; EFTER: ytan vinner där trycket ligger på ytan.
      for (const n of [1, 2, 4, 5]) {
        const h = r.rapport['hansyn' + n];
        expect(h.n, `hänsyn ${n}: prov`).toBeGreaterThan(10);
        expect(h.nyLinjeEllerGrans, `hänsyn ${n}: efter`).toBeLessThanOrEqual(h.gammalLinjeEllerGrans);
        expect(h.nyYta, `hänsyn ${n}: efter`).toBeGreaterThanOrEqual(h.gammalYta);
      }
      const forre = [1, 2, 4, 5].reduce((a, n) => a + r.rapport['hansyn' + n].gammalLinjeEllerGrans, 0);
      const efter = [1, 2, 4, 5].reduce((a, n) => a + r.rapport['hansyn' + n].nyLinjeEllerGrans, 0);
      expect(forre, 'före rättningen stal linje och rågång trycken').toBeGreaterThan(efter * 2);

      // Fri punkt i Hänsyn 4 och 1: ytans tryck, ingen stapel (en enda yta).
      for (const n of [1, 4]) {
        expect(r.fri['hansyn' + n].ny, `hänsyn ${n} fri punkt`).toBe('yta');
        expect(r.fri['hansyn' + n].stapel, `hänsyn ${n}: en enda yta → ingen stapel`).toEqual([]);
      }
      // Där Hänsyn 3 och fornlämningsytan ligger över varandra: BÅDA, fornlämning (kultur) före hänsyn (natur).
      expect(r.fri.overlapp.stapel.map((s: any) => s.lager)).toEqual(['trakt-raa-fill', 'trakt-hansyn-fill']);
      expect(r.fri.overlapp.stapel.map((s: any) => s.grupp)).toEqual(['kultur', 'natur']);
      expect(r.fri.overlapp.stapel[1].rubrik).toMatch(/^Hänsyn 3/);
      // Utanför fornlämningen: bara Hänsyn 3, ingen stapel.
      expect(r.fri.utanforFornlamning.ny).toBe('yta');
      expect(r.fri.utanforFornlamning.stapel).toEqual([]);

      // Noten och bron ligger tätt: den närmaste vinner (förut den som ritats sist = bron).
      expect(r.symbol.traffar).toContain('note');
      expect(r.symbol.traffar).toContain('bridge');
      expect(r.symbol.gammalForsta, 'före: första träffen').toBe('bridge');
      expect(r.symbol.nyNarmast, 'efter: närmaste').toBe('note');
    } finally { await b.close(); }
  }, 300000);
});
