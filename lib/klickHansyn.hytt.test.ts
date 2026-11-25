// @vitest-environment node
// TRYCK PÅ EN HÄNSYN I RIKTIG CHROMIUM + MAPLIBRE (Martin 2026-11-23): ett tryck på en hänsynsyta inne i en traktdel, med ett körspår ritat över, ska öppna HÄNSYNENS kort — inte traktens.
// Kartan har sidans egna lager-id:n i sidans skapandeordning, och lagerordningen läggs av RIKTIGA lib/lagerOrdning (traktgränsens fyllning hamnar över ytorna, som i appen). Prioriteringen
// är de RIKTIGA lib/klickPrioritet och lib/traktGeometri, buntade med esbuild. Vidas features bär inga arealer (som i prod). Handlarna i `tryck` är sidans beslut utskrivna
// (vilka lager varje lyssnare frågar, vem som avstår) — sidans rader vaktas ordagrant i klickHansyn.vakter.test.ts. "Före" kör den gamla regeln mot samma karta och visar felet.
// Gäller planeringsvyn (planspår) och körvyn (hyttspår): samma lyssnare, bara spårlagren skiljer. Finns ingen Chromium hoppas testet över (utom med KRAV_CHROMIUM=1).
import path from 'node:path';
import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';
import { hittaChromium, KARTA_ARGS } from './testStod/chromium';

const CHROMIUM = hittaChromium(KARTA_ARGS);
const MAPLIBRE = path.join(process.cwd(), 'node_modules/maplibre-gl/dist');
const ORIGIN = 'https://klickhansyn.invalid';

async function bunta(): Promise<string> {
  const r = await build({
    stdin: {
      contents: `import * as KP from './lib/klickPrioritet'; import * as TG from './lib/traktGeometri'; import * as LO from './lib/lagerOrdning'; window.KLICK = { KP, TG, LO };`,
      resolveDir: process.cwd(), loader: 'ts',
    },
    bundle: true, write: false, format: 'iife', platform: 'browser', logLevel: 'silent',
  });
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

/** Kartan: en traktdel, en Vida-hänsyn och en egen zon inne i den, ett eget område bredvid, en symbol och en väg-⚠ över hänsynen, och ett körspår rakt över hänsynen. */
async function bygg(pg: any, vy: 'plan' | 'hytt', areal = false) {
  await pg.evaluate(async (arg: any) => {
    const W = window as any; const { LO } = W.KLICK;
    const el = document.getElementById('m')!; el.innerHTML = '';
    const map = new W.maplibregl.Map({ container: 'm', center: [15.0, 57.0], zoom: 15, fadeDuration: 0, preserveDrawingBuffer: true, attributionControl: false,
      style: { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#3d4a2c' } }] } });
    await new Promise((r) => map.on('load', r));
    const rektangel = (lon: number, lat: number, dx: number, dy: number) => [[[lon - dx, lat - dy], [lon + dx, lat - dy], [lon + dx, lat + dy], [lon - dx, lat + dy], [lon - dx, lat - dy]]];
    const fc = (features: any[]) => ({ type: 'FeatureCollection', features });
    const poly = (coords: any, properties: any) => ({ type: 'Feature', properties, geometry: { type: 'Polygon', coordinates: coords } });
    // Vidas features: INGEN areal (AREA_HA / SHAPE.STAr saknas i prod).
    map.addSource('zones-source', { type: 'geojson', data: fc([poly(rektangel(15.002, 57.002, 0.0012, 0.0006), { id: 'zon-1', zoneType: 'protected', color: '#30d158' })]) });
    map.addSource('traktdel-parts-source', { type: 'geojson', data: fc([poly(rektangel(15.0, 57.0, 0.004, 0.004), { _lager: 'L_TRAKTDEL', _typ: 'traktgräns', FLBESKR: 'Föryngringsavv. utan fröt', _partKey: 'td:0', ...arg.areal ? { 'SHAPE.STAr': 55389.4558105 } : {} })]) });
    map.addSource('trakt-geo-source', { type: 'geojson', data: fc([poly(rektangel(15.0, 57.0, 0.0012, 0.0006), { _lager: 'L_TILLAGGSYTOR', _typ: 'hänsynsyta', TYP: '24', FLBESKR: 'Kant mot vatten O', LOPNR: '1', ...arg.areal ? { 'SHAPE.STAr': 2231.07080078 } : {} })]) });
    map.addSource('grans-source', { type: 'geojson', data: fc([poly(rektangel(14.9915, 57.0, 0.0025, 0.003), { id: 'omrade-1' })]) });
    map.addSource('punkter', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [14.9992, 57.0] } } });
    map.addSource('spar', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[14.9985, 57.0], [15.0015, 57.0]] } } });
    // Sidans skapandeordning (zone-fill först, sedan trakt-gr-fill, hänsyn, … grans-fill); lagerordningen lägger sedan om dem som i appen.
    map.addLayer({ id: 'zone-fill', type: 'fill', source: 'zones-source', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.2 } });
    map.addLayer({ id: 'trakt-gr-fill', type: 'fill', source: 'traktdel-parts-source', paint: { 'fill-color': '#ff453a', 'fill-opacity': 0 } });
    map.addLayer({ id: 'trakt-hansyn-fill', type: 'fill', source: 'trakt-geo-source', paint: { 'fill-color': '#30d158', 'fill-opacity': 0.06 } });
    map.addLayer({ id: 'grans-fill', type: 'fill', source: 'grans-source', paint: { 'fill-color': '#ff453a', 'fill-opacity': 0 } });
    const sparId = arg.vy === 'hytt' ? 'hyttspar-egen-0' : 'planspar-skordare-0';
    map.addLayer({ id: sparId, type: 'line', source: 'spar', paint: { 'line-color': '#bf5af2', 'line-width': 10 } });
    map.addLayer({ id: 'markers-hit', type: 'circle', source: 'punkter', paint: { 'circle-radius': 14, 'circle-color': '#0a84ff', 'circle-opacity': 0.01 } });
    LO.installeraLagerOrdning(map);
    W.__map = map;
    await new Promise((r) => { map.once('render', () => map.once('idle', r)); map.triggerRepaint(); });
  }, { vy, areal });
}

/** Sidans beslut vid ett tryck: vilka kort öppnas? (`gammal` = reglerna före rättningen.) */
async function tryck(pg: any, lngLat: [number, number], gammal: boolean): Promise<string[]> {
  return pg.evaluate((arg: any) => {
    const W = window as any, map = W.__map; const { KP, TG } = W.KLICK;
    const gammal: boolean = arg.gammal;
    const pt = map.project(arg.lngLat);
    const sporId = map.getLayer('hyttspar-egen-0') ? 'hyttspar-egen-0' : 'planspar-skordare-0';
    // Gamla regeln: 'yta' = alla sju ytlager, ingen väg-⚠-kategori.
    const GAMMAL = [
      { kategori: 'larm', lager: ['larm-pin-hit'] }, { kategori: 'symbol', lager: ['markers-avvikelse', 'markers-hit', 'arrows-hit', 'line-fall-trad', 'line-korupp-traff'] },
      { kategori: 'yta-nr', lager: ['yta-nr-hit'] }, { kategori: 'punkt', lager: ['hogar-hit', 'hogar-cluster', 'grot-circle', 'trakt-punkt-circle', 'trakt-raa-point'] },
      { kategori: 'linje', lager: ['line-hitbox', 'trakt-linje-hit', 'trakt-raa-line'] }, { kategori: 'fastighet', lager: ['trakt-ragang-hit'] },
      { kategori: 'yta', lager: ['grans-fill', 'zone-fill', 'trakt-hansyn-fill', 'trakt-ovrigt-fill', 'trakt-nb-fill', 'trakt-raa-fill', 'trakt-gr-fill'] },
    ];
    const tabell = gammal ? GAMMAL : KP.KLICK_LAGER;
    const alla = tabell.flatMap((k: any) => k.lager).filter((l: string) => map.getLayer(l));
    const kat = (l: string) => tabell.find((k: any) => k.lager.includes(l))?.kategori ?? null;
    const ids: string[] = map.queryRenderedFeatures(pt, { layers: alla }).map((f: any) => f.layer.id);
    const vinnare = tabell.find((k: any) => k.lager.some((l: string) => ids.includes(l)))?.kategori ?? null;
    const ut: string[] = [];
    const fra = (layers: string[]) => { const l = layers.filter((x) => map.getLayer(x)); return l.length ? map.queryRenderedFeatures(pt, { layers: l }) : []; };
    // handleMarkerFeatureClick: bara när symbol vinner.
    if (vinnare === 'symbol') ut.push('symbol');
    // Trakt-lyssnaren (onKlick): frågar sina egna lager, avstår för larm/ytnummer, väljer minsta ytan och avstår om en annan kategori vann.
    const LAGER = ['trakt-punkt-circle', 'trakt-raa-point', 'trakt-raa-line', 'trakt-hansyn-fill', 'trakt-ovrigt-fill', 'trakt-nb-fill', 'trakt-raa-fill', 'trakt-gr-fill'];
    const traffar = fra(LAGER);
    if (traffar.length && vinnare !== 'larm' && vinnare !== 'yta-nr') {
      const kand = traffar.filter((f: any) => TG.klassaTraktFeature(f.properties).kategori !== 'ignorera');
      if (kand.length) {
        const vald = TG.valjMinstaYta(gammal ? kand : KP.bastaKategoriFeatures(kand));
        const valdKat = kat(vald.layer.id) ?? 'yta';
        if (!(vinnare && vinnare !== valdKat)) ut.push('trakt:' + TG.klassaTraktFeature(vald.properties).kategori);
      }
    }
    // onZoneClick (egen zon): bara när 'yta' vinner.
    if (fra(['zone-fill']).length && vinnare === 'yta') ut.push('marker:zon');
    // grans-fill (eget område): förut 'yta', nu 'traktyta'.
    if (fra(['grans-fill']).length && vinnare === (gammal ? 'yta' : 'traktyta')) ut.push('marker:omrade');
    // Körspåret har ingen lyssnare — det syns i svaret bara som ett lager som INTE deltar.
    if (alla.includes(sporId)) ut.push('SPÅR-DELTAR');
    return ut;
  }, { lngLat, gammal });
}

const HANSYN: [number, number] = [15.0, 57.0];             // mitt i Vida-hänsynen (körspåret går rakt över, exakt där man trycker)
const ZON: [number, number] = [15.002, 57.002];            // egen zon inne i traktdelen
const TRAKTDEL: [number, number] = [15.003, 56.997];       // bara traktdelen
const SYMBOL: [number, number] = [14.9992, 57.0];          // en symbol inne i hänsynen
const OMRADE: [number, number] = [14.9915, 57.0];         // eget område (grans-fill), utanför traktdelen

describe.skipIf(!CHROMIUM)('Tryck på hänsyn — riktig Chromium + MapLibre', () => {
  for (const vy of ['plan', 'hytt'] as const) {
    for (const areal of [true, false]) {
      it(`${vy === 'plan' ? 'planeringsvyn' : 'körvyn'}, ${areal ? 'med arealer i datan (Brokamålas SHAPE.STAr)' : 'utan arealer'}: hänsyn, egen zon, traktdel, symbol och eget område — rätt kort, ett i taget, körspåret tar inget tryck`, async () => {
        const lib = await bunta();
        const b = await CHROMIUM!.launch({});
        try {
          const pg = await oppna(b, lib);
          await bygg(pg, vy, areal);
          // Lagerordningen är som i appen: traktdelens fyllning ÖVER hänsynens (sedan #1008), och körspåret över båda.
          const ordning: string[] = await pg.evaluate(() => (window as any).__map.getStyle().layers.map((l: any) => l.id));
          expect(ordning.indexOf('trakt-gr-fill')).toBeGreaterThan(ordning.indexOf('trakt-hansyn-fill'));
          expect(ordning.indexOf(vy === 'hytt' ? 'hyttspar-egen-0' : 'planspar-skordare-0')).toBeGreaterThan(ordning.indexOf('trakt-hansyn-fill'));

          // FÖRE (gamla reglerna): en egen zon inne i traktdelen öppnar BÅDA korten (traktens ovanpå) — oavsett data. Utan arealer slår traktdelen dessutom Vidas hänsyn.
          expect(await tryck(pg, HANSYN, true), 'före: hänsyn').toEqual(areal ? ['trakt:hansyn'] : ['trakt:traktdel']);
          expect(await tryck(pg, ZON, true), 'före: egen zon').toEqual(['trakt:traktdel', 'marker:zon']);

          // EFTER — samma resultat med och utan arealer:
          expect(await tryck(pg, HANSYN, false), 'hänsyn → hänsynens kort').toEqual(['trakt:hansyn']);
          expect(await tryck(pg, ZON, false), 'egen zon → zonens kort, inte traktens').toEqual(['marker:zon']);
          expect(await tryck(pg, TRAKTDEL, false), 'bara traktdelen → traktens kort').toEqual(['trakt:traktdel']);
          expect(await tryck(pg, SYMBOL, false), 'symbol över hänsynen → symbolen').toEqual(['symbol']);
          expect(await tryck(pg, OMRADE, false), 'eget område → områdets kort').toEqual(['marker:omrade']);
        } finally { await b.close(); }
      }, 120000);
    }
  }
});
