// @vitest-environment node
// LUGNARE KÖRVY PÅ BROKAMÅLAS RIKTIGA DATA (objekt 7469112c-9247-4250-bf32-73d63a76e284, prod 2026-11-23, fixtur `lib/__fixtures__/brokamala_lugnare_2026-11-23.json`):
// förarens 18 symboler (x/y ur planering_markeringar, omräknade som sidans svgToLatLon), Vidas fem hänsynsytor, sju avlägg, tre nyckelbiotoper, tre fornlämningsytor
// och tre traktdelar — ritade med appens egna bilder, etikettstil och regler (lib/korvyKlar, lib/korvyText, lib/narStyrka) i riktig Chromium + MapLibre.
// Före = som körvyn är nu. Efter = förarens Klar på det som går att dämpa + text bara inom 100 m. BROKAMALA_SKRIV=<mapp> sparar före.png och efter.png.
// Rigg, inte den inloggade sidan: sidans lagerdefinitioner är utdragna (källvakt i korvyText.test.ts), ingen riktig flygfotobakgrund.
import path from 'node:path';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';
import { hittaChromium, KARTA_ARGS } from './testStod/chromium';

const CHROMIUM = hittaChromium(KARTA_ARGS);
const MAPLIBRE = path.join(process.cwd(), 'node_modules/maplibre-gl/dist');
const ORIGIN = 'https://brokamala.invalid';
const SKRIV = process.env.BROKAMALA_SKRIV;
const FX = JSON.parse(readFileSync(path.join(process.cwd(), 'lib/__fixtures__/brokamala_lugnare_2026-11-23.json'), 'utf8'));

async function bunta(): Promise<string> {
  const r = await build({
    stdin: {
      contents: `import * as K from './lib/korvyKlar'; import * as T from './lib/korvyText'; import * as N from './lib/narStyrka'; import * as Y from './lib/ytaStil';
        import * as G from './lib/larm/grupper'; import * as I from './lib/marker-icons'; import * as V from './lib/viktigtEtikett'; import * as D from './lib/design/tokens';
        window.LUGNARE = { K, T, N, Y, G, I, V, D };`,
      resolveDir: process.cwd(), loader: 'ts',
    },
    bundle: true, write: false, format: 'iife', platform: 'browser', logLevel: 'silent',
  });
  return r.outputFiles[0].text;
}

describe.skipIf(!CHROMIUM)('Lugnare körvy på Brokamålas riktiga data — riktig Chromium + MapLibre', () => {
  it('före/efter: färre texter nära 100 m, dämpade symboler, faror/kultur/Viktigt kvar fulla', async () => {
    const lib = await bunta();
    const b = await CHROMIUM!.launch({});
    try {
      const pg = await (await b.newContext({ viewport: { width: 1180, height: 740 } })).newPage();
      await pg.route(`${ORIGIN}/**`, (rt: any) => rt.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><head><meta charset="utf-8"><style>html,body,#m{margin:0;height:100%}</style></head><body><div id="m"></div></body></html>' }));
      await pg.goto(`${ORIGIN}/`);
      await pg.addStyleTag({ path: path.join(MAPLIBRE, 'maplibre-gl.css') });
      await pg.addScriptTag({ path: path.join(MAPLIBRE, 'maplibre-gl.js') });
      await pg.addScriptTag({ content: lib });
      const r = await pg.evaluate(async (fx: any) => {
        const W = window as any; const { K, T, N, Y, G, I, V, D } = W.LUGNARE;
        const FARG = D.FARG;
        const MASKIN = { lat: 56.2996, lon: 14.4686 };   // maskinen står vid hänsyn 1/3 och fornlämningen
        document.getElementById('m')!.innerHTML = '';
        const map = new W.maplibregl.Map({ container: 'm', center: [MASKIN.lon, MASKIN.lat], zoom: 15.7, fadeDuration: 0, preserveDrawingBuffer: true, attributionControl: false,
          style: { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#33422a' } }] } });
        await new Promise((res) => map.on('load', res));
        const fc = (features: any[]) => ({ type: 'geojson', data: { type: 'FeatureCollection', features } } as any);
        const poly = (rings: any, props: any) => ({ type: 'Feature', properties: props, geometry: { type: 'Polygon', coordinates: rings } });
        const mitt = (rings: any) => { const r0 = rings[0]; const n = r0.length - 1; let x = 0, y = 0; for (let i = 0; i < n; i++) { x += r0[i][0]; y += r0[i][1]; } return [x / n, y / n]; };
        const pt = (c: number[], props: any) => ({ type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: c } });
        // --- Vidas ytor (fyllning + kant) ---
        const hansyn = Object.entries(fx.hansyn).map(([n, rings]) => poly(rings, { n }));
        map.addSource('hansyn', fc(hansyn));
        map.addLayer({ id: 'hansyn-fill', type: 'fill', source: 'hansyn', paint: { 'fill-color': G.GRUPPER.natur.farg, 'fill-opacity': 0.12 } });
        map.addLayer({ id: 'hansyn-line', type: 'line', source: 'hansyn', paint: { 'line-color': G.GRUPPER.natur.farg, 'line-width': 1.5 } });
        map.addSource('nb', fc(fx.nyckelbiotop.map((rings: any) => poly(rings, {}))));
        map.addLayer({ id: 'nb-line', type: 'line', source: 'nb', paint: { 'line-color': G.GRUPPER.natur.farg, 'line-width': 1.5 } });
        map.addSource('raa', fc(fx.raa.map((rings: any) => poly(rings, {}))));
        map.addLayer({ id: 'raa-fill', type: 'fill', source: 'raa', paint: { 'fill-color': G.GRUPPER.kultur.farg, 'fill-opacity': 0.12 } });
        map.addLayer({ id: 'raa-line', type: 'line', source: 'raa', paint: { 'line-color': G.GRUPPER.kultur.farg, 'line-width': 1.5 } });
        map.addSource('traktdel', fc(fx.traktdel.map((rings: any) => poly(rings, {}))));
        map.addLayer({ id: 'traktdel-line', type: 'line', source: 'traktdel', paint: { 'line-color': FARG.rod, 'line-width': 2 } });
        // --- Etikettkällor (en punkt per yta, som sidan) ---
        map.addSource('trakt-etikett-source', fc([
          ...hansyn.map((f: any) => pt(mitt(f.geometry.coordinates), { _typ: 'hänsynsyta', LOPNR: f.properties.n })),
          ...fx.nyckelbiotop.map((rings: any) => pt(mitt(rings), { _lager: 'SV_SKS_NYCKELBIOTOP_101' })),
          ...fx.raa.map((rings: any) => pt(mitt(rings), { _lager: 'L_RAA_POLY_101' })),
        ]));
        map.addSource('trakt-geo-source', fc(fx.avlagg.map((a: any) => pt(a.p, { _typ: 'punkt', EXTRA_LABE: a.e }))));
        map.addSource('yta-nr-source', fc(fx.traktdel.map((rings: any, i: number) => pt(mitt(rings), { nr: i + 1 }))));
        const rubrik = ['Open Sans Semibold', 'Open Sans Regular', 'Arial Unicode MS Regular'];
        const ytaText = (id: string, filter: any, falt: any) => map.addLayer({ id, type: 'symbol', source: 'trakt-etikett-source', filter,
          layout: { 'text-field': falt, 'text-size': Y.YTA_ETIKETT_STORLEK, 'text-font': rubrik, 'text-allow-overlap': true }, paint: { 'text-color': Y.YTA_ETIKETT_STIL.text, 'text-halo-color': Y.YTA_ETIKETT_STIL.kant, 'text-halo-width': Y.YTA_ETIKETT_STIL.kantBredd } });
        ytaText('trakt-hansyn-label', ['==', ['get', '_typ'], 'hänsynsyta'], ['concat', Y.VIDA_ETIKETT.hansynsyta, ' ', ['to-string', ['get', 'LOPNR']]]);
        ytaText('trakt-nb-label', ['==', ['get', '_lager'], 'SV_SKS_NYCKELBIOTOP_101'], Y.VIDA_ETIKETT.nyckelbiotop);
        ytaText('trakt-raa-label', ['==', ['get', '_lager'], 'L_RAA_POLY_101'], Y.VIDA_ETIKETT.raa_yta);
        map.addLayer({ id: 'trakt-punkt-label', type: 'symbol', source: 'trakt-geo-source', filter: ['==', ['get', '_typ'], 'punkt'],
          layout: { 'text-field': ['to-string', ['get', 'EXTRA_LABE']], 'text-size': 11, 'text-font': ['Open Sans Bold'], 'text-offset': [0, 2.4], 'text-anchor': 'top', 'text-allow-overlap': true }, paint: { 'text-color': '#fff', 'text-halo-color': 'rgba(0,0,0,0.7)', 'text-halo-width': 1.2 } });
        map.addLayer({ id: 'yta-nr-label', type: 'symbol', source: 'yta-nr-source', layout: { 'text-field': ['to-string', ['get', 'nr']], 'text-size': 15, 'text-font': ['Open Sans Bold'], 'text-allow-overlap': true }, paint: { 'text-color': '#fff', 'text-halo-color': 'rgba(0,0,0,0.85)', 'text-halo-width': 1.8 } });
        // --- Förarens symboler: x/y → lat/lon som sidans svgToLatLon (origo = objektets lat/lng, zoom 16) ---
        const o = fx.objekt; const scale = 156543.03392 * Math.cos(o.lat * Math.PI / 180) / Math.pow(2, 16);
        const ll = (x: number, y: number) => [o.lng + (x * scale) / (111320 * Math.cos(o.lat * Math.PI / 180)), o.lat + (-y * scale) / 111320];
        const hav = (a: number[], b: number[]) => { const R = 6371008.8, r = Math.PI / 180; const dLa = (b[1] - a[1]) * r, dLo = (b[0] - a[0]) * r; const h = Math.sin(dLa / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
        for (const def of I.markerIconDefs) { const img = await I.loadMarkerImageForMaplibre(def.id); if (img && !map.hasImage(`marker-${def.id}`)) map.addImage(`marker-${def.id}`, img); }
        const symboler = fx.markeringar.map((m: any) => ({ ...m, c: ll(m.x, m.y) }));
        const VIKTIGT_ID = 'm14';   // en av Info-symbolerna har en Viktigt-rad → förblir full, med gul etikett
        const KLAR = new Set(symboler.map((m: any) => m.id));   // Klar på ALLT (även fara/kultur/Viktigt, som inte ska gå att dämpa)
        const bygg = (efter: boolean) => symboler.map((m: any) => {
          const dist = hav([MASKIN.lon, MASKIN.lat], m.c);
          const fara = G.gruppForSymbol(m.type) === 'fara';
          let opacity = N.narStyrka(dist, fara || m.id === VIKTIGT_ID);
          if (efter) opacity = K.dampadOpacitet(opacity, { id: m.id, typ: m.type, klara: KLAR, harViktigt: m.id === VIKTIGT_ID, slaPa: true });
          return { type: 'Feature', properties: { type: m.type, id: m.id, opacity, dist: Math.round(dist) }, geometry: { type: 'Point', coordinates: m.c } };
        });
        map.addSource('markers-source', fc(bygg(false)));
        map.addLayer({ id: 'markers-layer', type: 'symbol', source: 'markers-source', layout: { 'icon-image': ['concat', 'marker-', ['get', 'type']], 'icon-size': ['interpolate', ['linear'], ['zoom'], 15, 0.5, 17, 0.75], 'icon-allow-overlap': true, 'icon-ignore-placement': true },
          paint: { 'icon-opacity': ['number', ['get', 'opacity'], 1], 'icon-opacity-transition': { duration: 0 } } });
        const FARO = Object.keys(G.SYMBOL_GRUPP).filter((t) => G.SYMBOL_GRUPP[t] === 'fara');
        map.addLayer({ id: 'markers-korvy-label', type: 'symbol', source: 'markers-source', filter: ['match', ['get', 'type'], FARO, true, false],
          layout: { 'text-field': ['match', ['get', 'type'], ...FARO.flatMap((t: string) => [t, G.SYMBOL_NAMN[t] ?? '']), ''], 'text-size': 14, 'text-offset': [0, 1.2], 'text-anchor': 'top', 'text-allow-overlap': true, 'text-font': rubrik },
          paint: { 'text-color': '#fff', 'text-halo-color': 'rgba(0,0,0,0.6)', 'text-halo-width': 1.2 } });
        // Viktigt-etiketten (sidans lager): gul rad vid en Info-symbol.
        const vm = symboler.find((s: any) => s.id === VIKTIGT_ID);
        map.addSource(V.VIKTIGT_KALLA, fc([pt(vm.c, { text: '⚠ Kör inte över bäcken', ovan: true })]));
        map.addLayer(V.viktigtLager());
        // Maskinens position: blå prick med vit kant.
        map.addSource('maskin', fc([pt([MASKIN.lon, MASKIN.lat], {})]));
        map.addLayer({ id: 'maskin', type: 'circle', source: 'maskin', paint: { 'circle-radius': 7, 'circle-color': FARG.bla, 'circle-stroke-color': '#fff', 'circle-stroke-width': 2.5 } });
        const vila = () => new Promise((res) => { map.once('render', () => map.once('idle', res)); map.triggerRepaint(); });
        const NARA = ['trakt-hansyn-label', 'trakt-nb-label', 'trakt-punkt-label', 'yta-nr-label'];
        const ALLTID = ['trakt-raa-label', 'markers-korvy-label', 'viktigt-etikett'];
        const rakna = () => { map.redraw(); const q = (id: string) => map.queryRenderedFeatures({ layers: [id] }).length; return { nara: Object.fromEntries(NARA.map((id) => [id, q(id)])), alltid: Object.fromEntries(ALLTID.map((id) => [id, q(id)])) }; };
        const bild = () => { const c = map.getCanvas(); const k = document.createElement('canvas'); k.width = c.width; k.height = c.height; k.getContext('2d')!.drawImage(c, 0, 0); return k.toDataURL('image/png'); };
        let senaste: any[] = bygg(false);
        const lasOpac = () => Object.fromEntries(senaste.map((f: any) => [f.properties.id, f.properties.opacity]));
        await vila();
        const fore = { ...rakna(), opac: lasOpac(), bild: bild() };
        senaste = bygg(true);
        (map.getSource('markers-source') as any).setData({ type: 'FeatureCollection', features: senaste });
        T.tillampaTextRadie(map, MASKIN);
        await vila();
        const efter = { ...rakna(), opac: lasOpac(), bild: bild() };
        return { fore, efter, typer: Object.fromEntries(symboler.map((s: any) => [s.id, s.type])) };
      }, FX);
      if (SKRIV) {
        mkdirSync(SKRIV, { recursive: true });
        writeFileSync(path.join(SKRIV, 'brokamala-fore.png'), Buffer.from(r.fore.bild.split(',')[1], 'base64'));
        writeFileSync(path.join(SKRIV, 'brokamala-efter.png'), Buffer.from(r.efter.bild.split(',')[1], 'base64'));
      }
      const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
      // Texten: färre nära-etiketter efter, men inga alltid-etiketter försvinner.
      expect(sum(r.fore.nara), 'före: all text syns').toBeGreaterThan(sum(r.efter.nara));
      expect(sum(r.efter.nara), 'efter: något är nära maskinen och syns').toBeGreaterThan(0);
      expect(r.efter.alltid, 'faror, kultur och Viktigt: lika många före och efter').toEqual(r.fore.alltid);
      expect(r.fore.alltid['markers-korvy-label'], 'de tre varningarna har namn').toBe(3);
      // Symbolerna: dämpbara blir halvgenomskinliga (<= 0,35), fara/kultur/Viktigt behåller sin avståndsstyrka.
      const typer = r.typer as Record<string, string>;
      for (const [id, typ] of Object.entries(typer)) {
        const foreO = r.fore.opac[id], efterO = r.efter.opac[id];
        if (['warning', 'culturemonument'].includes(typ) || id === 'm14') expect(efterO, `${typ} ${id} oförändrad`).toBe(foreO);
        else expect(efterO, `${typ} ${id} dämpad`).toBeLessThanOrEqual(0.35);
      }
    } finally { await b.close(); }
  }, 180000);
});
