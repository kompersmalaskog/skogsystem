// @vitest-environment node
// LUGNARE KÖRVY I RIKTIG CHROMIUM + MAPLIBRE (Martin 2026-11-23, Brokamåla 1:5): (1) en symbol som föraren tryckt Klar på är halvgenomskinlig men lika stor,
// aldrig en fara/kultur/Viktigt; (2) etiketter ritas bara inom 100 m från maskinen — faror och kultur alltid. Samma funktioner som i appen (lib/korvyKlar,
// lib/korvyText), buntade med esbuild; lagerdefinitionerna är sidans (källvakt i korvyText.test.ts). KLAR_SKRIV=<mapp> sparar bilderna.
// Finns ingen Chromium hoppas testet över (utom med KRAV_CHROMIUM=1).
import path from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';
import { hittaChromium, KARTA_ARGS } from './testStod/chromium';

const CHROMIUM = hittaChromium(KARTA_ARGS);
const MAPLIBRE = path.join(process.cwd(), 'node_modules/maplibre-gl/dist');
const ORIGIN = 'https://lugnare.invalid';
const SKRIV = process.env.KLAR_SKRIV;

async function bunta(): Promise<string> {
  const r = await build({
    stdin: {
      contents: `import * as K from './lib/korvyKlar'; import * as T from './lib/korvyText'; import * as F from './lib/fokusTrakt'; window.LUGNARE = { K, T, F };`,
      resolveDir: process.cwd(), loader: 'ts',
    },
    bundle: true, write: false, format: 'iife', platform: 'browser', logLevel: 'silent',
  });
  return r.outputFiles[0].text;
}

async function nyKarta(pg: any, lib: string) {
  await pg.route(`${ORIGIN}/**`, (rt: any) => rt.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><head><meta charset="utf-8"><style>html,body,#m{margin:0;height:100%}</style></head><body><div id="m"></div></body></html>' }));
  await pg.goto(`${ORIGIN}/`);
  await pg.addStyleTag({ path: path.join(MAPLIBRE, 'maplibre-gl.css') });
  await pg.addScriptTag({ path: path.join(MAPLIBRE, 'maplibre-gl.js') });
  await pg.addScriptTag({ content: lib });
}

describe.skipIf(!CHROMIUM)('Lugnare körvy — riktig Chromium + MapLibre', () => {
  it('Klar: dämpad symbol är halvgenomskinlig och lika stor; fara, kultur och Viktigt förblir fulla; en annan maskin ser den full', async () => {
    const lib = await bunta();
    const b = await CHROMIUM!.launch({});
    try {
      const pg = await (await b.newContext({ viewport: { width: 700, height: 500 } })).newPage();
      await nyKarta(pg, lib);
      const r = await pg.evaluate(async () => {
        const W = window as any; const { K } = W.LUGNARE;
        const BG = [0x3d, 0x4a, 0x2c];
        document.getElementById('m')!.innerHTML = '';
        const map = new W.maplibregl.Map({ container: 'm', center: [15.0, 57.0], zoom: 16, fadeDuration: 0, preserveDrawingBuffer: true, attributionControl: false,
          style: { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#3d4a2c' } }] } });
        await new Promise((r) => map.on('load', r));
        // En vit fyrkant som symbolbild (samma storlek för alla typer).
        const px = 32; const data = new Uint8Array(px * px * 4).fill(255);
        for (const t of ['landing', 'powerline', 'culturemonument', 'eternitytree']) map.addImage(`marker-${t}`, { width: px, height: px, data });
        // Sju symboler på en rad; Klar är satt på alla, men bara de som går att dämpa blir halvgenomskinliga.
        const rader = [
          { id: '1', typ: 'landing', klar: false, viktigt: false },       // vanlig, full
          { id: '2', typ: 'landing', klar: true, viktigt: false },        // dämpad
          { id: '3', typ: 'powerline', klar: true, viktigt: false },      // fara: förblir full
          { id: '4', typ: 'culturemonument', klar: true, viktigt: false },// kultur: förblir full
          { id: '5', typ: 'landing', klar: true, viktigt: true },         // Viktigt: förblir full
          { id: '6', typ: 'eternitytree', klar: true, viktigt: false },   // natur: dämpad
        ];
        const klara = new Set<string>(rader.filter((x) => x.klar).map((x) => x.id));
        const lon = (i: number) => 15.0 + (i - 2.5) * 0.0006;
        const features = rader.map((x, i) => ({ type: 'Feature', properties: { type: x.typ, id: x.id,
          opacity: K.dampadOpacitet(1, { id: x.id, typ: x.typ, klara, harViktigt: x.viktigt, slaPa: true }) }, geometry: { type: 'Point', coordinates: [lon(i), 57.0] } }));
        // Och en SKOTARE (slaPa=false) som ser samma symbol (id 2) full:
        features.push({ type: 'Feature', properties: { type: 'landing', id: '2', opacity: K.dampadOpacitet(1, { id: '2', typ: 'landing', klara, harViktigt: false, slaPa: false }) }, geometry: { type: 'Point', coordinates: [lon(6), 57.0] } });
        map.addSource('markers-source', { type: 'geojson', data: { type: 'FeatureCollection', features } });
        // Sidans markers-layer (icon-opacity ur featurens opacity, samma storlek för alla).
        map.addLayer({ id: 'markers-layer', type: 'symbol', source: 'markers-source', layout: { 'icon-image': ['concat', 'marker-', ['get', 'type']], 'icon-size': 0.75, 'icon-allow-overlap': true, 'icon-ignore-placement': true }, paint: { 'icon-opacity': ['number', ['get', 'opacity'], 1], 'icon-opacity-transition': { duration: 0 } } });
        await new Promise((r) => { map.once('render', () => map.once('idle', r)); map.triggerRepaint(); });
        map.redraw();
        const c = map.getCanvas(); const k = document.createElement('canvas'); k.width = c.width; k.height = c.height;
        const g = k.getContext('2d')!; g.drawImage(c, 0, 0);
        const lasIkon = (i: number) => {
          const p = map.project([lon(i), 57.0]); const dpr = c.width / c.clientWidth;
          const cx = Math.round(p.x * dpr), cy = Math.round(p.y * dpr), h = Math.round(40 * dpr);
          const d = g.getImageData(cx - h, cy - h, h * 2, h * 2).data;
          // Storleken = omslutande rektangel kring pixlar som skiljer sig från bakgrunden (kanten är kantutjämnad, så ett lågt tröskelvärde).
          let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1; const bredd = h * 2;
          for (let q = 0; q < d.length; q += 4) if (Math.abs(d[q] - BG[0]) + Math.abs(d[q + 1] - BG[1]) + Math.abs(d[q + 2] - BG[2]) > 6) { const i = q / 4; const x = i % bredd, y = Math.floor(i / bredd); if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
          const m = g.getImageData(cx, cy, 1, 1).data;
          return { b: x1 - x0 + 1, hojd: y1 - y0 + 1, mittR: m[0] };
        };
        const ut = [0, 1, 2, 3, 4, 5, 6].map(lasIkon);
        return { ut, opac: features.map((f: any) => f.properties.opacity), bild: k.toDataURL('image/png') };
      });
      if (SKRIV) { mkdirSync(SKRIV, { recursive: true }); writeFileSync(path.join(SKRIV, 'klar-symboler.png'), Buffer.from(r.bild.split(',')[1], 'base64')); }
      const [full, dampad, fara, kultur, viktigt, natur, skotare] = r.ut;
      expect(full.mittR, 'vanlig symbol är full (vit)').toBeGreaterThan(240);
      expect(dampad.mittR, 'dämpad symbol är halvgenomskinlig: mörkare än full, ljusare än bakgrunden').toBeLessThan(160);
      expect(dampad.mittR).toBeGreaterThan(61 + 20);
      expect(Math.abs(dampad.b - full.b) + Math.abs(dampad.hojd - full.hojd), 'dämpad symbol är lika stor som full (±1 px kantutjämning)').toBeLessThanOrEqual(2);
      expect(natur.mittR, 'natur (evighetsträd) går att dämpa').toBeLessThan(160);
      for (const [namn, v] of [['fara', fara], ['kultur', kultur], ['viktigt', viktigt]] as const) expect(v.mittR, `${namn} förblir full trots sparat Klar`).toBeGreaterThan(240);
      expect(skotare.mittR, 'skotarens körvy: samma symbol full trots att skördaren dämpat den').toBeGreaterThan(240);
      expect(Math.abs(skotare.b - full.b) + Math.abs(skotare.hojd - full.hojd)).toBeLessThanOrEqual(1);
    } finally { await b.close(); }
  }, 120000);

  it('text bara inom 100 m: Hänsyn/nummer/avlägg göms längre bort, faror och kultur syns alltid; cirkeln följer maskinen; allt tillbaka när körvyn stängs', async () => {
    const lib = await bunta();
    const b = await CHROMIUM!.launch({});
    try {
      const pg = await (await b.newContext({ viewport: { width: 700, height: 600 } })).newPage();
      await nyKarta(pg, lib);
      const r = await pg.evaluate(async () => {
        const W = window as any; const { T, F } = W.LUGNARE;
        document.getElementById('m')!.innerHTML = '';
        const map = new W.maplibregl.Map({ container: 'm', center: [15.0, 57.0], zoom: 15, fadeDuration: 0, preserveDrawingBuffer: true, attributionControl: false,
          style: { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#3d4a2c' } }] } });
        await new Promise((r) => map.on('load', r));
        const pkt = (lat: number, props: any) => ({ type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: [15.0, lat] } });
        const NARA = 57.0003, LANGT = 57.0036;   // ca 33 m resp. 400 m norr om maskinen
        const fc = (features: any[]) => ({ type: 'geojson', data: { type: 'FeatureCollection', features } });
        // Sidans källor och etikettlager (samma id:n och filter som i app/planering/page.tsx).
        map.addSource('trakt-etikett-source', fc([pkt(NARA, { _typ: 'hänsynsyta', n: 'nara' }), pkt(LANGT, { _typ: 'hänsynsyta', n: 'langt' })]));
        map.addSource('trakt-raa-source', fc([pkt(LANGT, { _lager: 'L_RAA_POLY_101', n: 'raa-langt' })]));
        map.addSource('zones-etikett-source', fc([pkt(NARA, { zoneType: 'protected', nr: 3, n: 'zon-nara' }), pkt(LANGT, { zoneType: 'protected', nr: 4, n: 'zon-langt' }), { type: 'Feature', properties: { zoneType: 'fornlamning', n: 'kultur-langt' }, geometry: { type: 'Point', coordinates: [15.004, LANGT] } }]));
        map.addSource('yta-nr-source', fc([pkt(NARA, { nr: 1, n: 'nr-nara' }), pkt(LANGT, { nr: 2, n: 'nr-langt' })]));
        map.addSource('markers-source', fc([pkt(LANGT, { type: 'powerline', id: 'f1', n: 'fara-langt' }), pkt(NARA, { type: 'powerline', id: 'f2', n: 'fara-nara' })]));
        const text = (id: string, source: string, filter: any, falt: any) => map.addLayer({ id, type: 'symbol', source, ...(filter ? { filter } : {}),
          layout: { 'text-field': falt, 'text-size': 14, 'text-allow-overlap': true, 'text-ignore-placement': true, 'text-font': ['Open Sans Semibold', 'Open Sans Regular', 'Arial Unicode MS Regular'] }, paint: { 'text-color': '#fff' } });
        text('trakt-hansyn-label', 'trakt-etikett-source', F.fokusEtikettFilter(['==', ['get', '_typ'], 'hänsynsyta']), 'Hänsyn 3');
        text('trakt-raa-label', 'trakt-raa-source', F.fokusEtikettFilter(['==', ['get', '_lager'], 'L_RAA_POLY_101']), 'Fornlämning');
        text('zone-label', 'zones-etikett-source', ['in', ['get', 'zoneType'], ['literal', ['protected', 'fornlamning', 'wet']]], ['to-string', ['get', 'n']]);
        text('yta-nr-label', 'yta-nr-source', undefined as any, ['to-string', ['get', 'nr']]);
        text('markers-korvy-label', 'markers-source', ['match', ['get', 'type'], ['powerline', 'warning'], true, false], 'El-ledning');
        const synliga = () => {
          map.redraw();
          const per = (id: string) => map.queryRenderedFeatures({ layers: [id] }).map((f: any) => f.properties.n ?? f.properties.nr).sort();
          return Object.fromEntries(['trakt-hansyn-label', 'trakt-raa-label', 'zone-label', 'yta-nr-label', 'markers-korvy-label'].map((id) => [id, per(id)]));
        };
        const vila = () => new Promise((r) => { map.once('render', () => map.once('idle', r)); map.triggerRepaint(); });
        await vila();
        const fore = synliga();
        T.tillampaTextRadie(map, { lat: 57.0, lon: 15.0 });
        await vila();
        const nara = synliga();
        // Maskinen kör 400 m norrut: nu är det "langt" som är nära och "nara" som är långt.
        T.tillampaTextRadie(map, { lat: 57.0036, lon: 15.0 });
        await vila();
        const flyttad = synliga();
        T.aterstallTextRadie(map);
        await vila();
        const efter = synliga();
        const c = map.getCanvas(); const k = document.createElement('canvas'); k.width = c.width; k.height = c.height; k.getContext('2d')!.drawImage(c, 0, 0);
        return { fore, nara, flyttad, efter, bild: k.toDataURL('image/png') };
      });
      if (SKRIV) { mkdirSync(SKRIV, { recursive: true }); writeFileSync(path.join(SKRIV, 'text-radie.png'), Buffer.from(r.bild.split(',')[1], 'base64')); }
      // Före: allt syns (kontroll att testet mäter något).
      expect(r.fore['trakt-hansyn-label']).toHaveLength(2);
      expect(r.fore['zone-label']).toHaveLength(3);
      // Maskinen i origo: bara det nära (33 m) syns av nära-texten.
      expect(r.nara['trakt-hansyn-label'], 'Hänsyn 3: bara den nära').toEqual(['nara']);
      expect(r.nara['yta-nr-label'], 'områdesnummer: bara det nära').toEqual(['nr-nara']);
      expect(r.nara['zone-label'], 'egen yta: den nära + kulturytan (alltid); den långt bort göms').toEqual(['kultur-langt', 'zon-nara']);
      // Alltid: Vidas fornlämning och faror (också 400 m bort).
      expect(r.nara['trakt-raa-label'], 'fornlämning (kultur) syns alltid').toEqual(['raa-langt']);
      expect(r.nara['markers-korvy-label'], 'faror syns alltid, nära och långt bort').toEqual(['fara-langt', 'fara-nara']);
      // Cirkeln följer maskinen.
      expect(r.flyttad['trakt-hansyn-label']).toEqual(['langt']);
      expect(r.flyttad['yta-nr-label']).toEqual(['nr-langt']);
      // Körvyn stängs: som före.
      expect(r.efter).toEqual(r.fore);
    } finally { await b.close(); }
  }, 120000);
});
