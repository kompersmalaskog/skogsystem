// @vitest-environment node
// KÖRORDNING I RIKTIG CHROMIUM + MAPLIBRE (2026-10-25). Vägarna ritas med samma lagerspecar som planeringsvyn (korBredd/korFarg ur lib/korordningKarta, bredderna och
// färgerna ur page.tsx) och mäts i pixlar: bara nu ska vara tjockare (alla andra som vanligt), en körd väg grå, nu ska ha vita pilar på vägen och skenet under. Arvidstorp RP J-Hus -25 (prod
// 2026-10-25, fixtur) ritas som före (de gamla körriktningspilarna) och efter (körordning). Ingen flygfotobakgrund (nätverket nås inte härifrån): mörkgrön platta.
// jsdom kan inte rita en karta, därför Chromium; finns ingen hoppas mätningen över. KOR_SKRIV=<mapp> sparar skärmbilderna.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BASVAG_FARG_UTTRYCK, BASVAG_UTAN_FARG, BASVAG_STRECK_DASH, BASVAG_STRECK_LAYOUT, VAG_KANT_FARG, ritaPilIkon, forstaVagLagerId, LEGEND } from './kartstil';
import { korBredd, korFarg, KOR_OPACITET, KOR_INTE_KLAR, korEgenskap, korPunkter, korPunktLager, korSkenLager, KOR_KALLA, KOR_PIL_BILD, KOR_PIL_FARG } from './korordningKarta';
import { foreslaOrdning, statusPerVag, nyTackning, laggTillFix, type KorVag } from './korordning';

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
const CHROMIUM = chromium();
const MAPLIBRE = path.join(process.cwd(), 'node_modules/maplibre-gl/dist');
const LW = ['interpolate', ['linear'], ['zoom'], 5, 2, 8, 2, 11, 3, 13, 4, 15, 6, 17, 7];
const CW = ['interpolate', ['linear'], ['zoom'], 5, 4, 8, 4, 11, 5, 13, 6, 15, 8, 17, 9];
const fix = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'lib/__fixtures__/korordning_arvidstorp_2026-10-25.json'), 'utf8'));

type Vag = { id: string; farg: string; coords: [number, number][]; ordning?: number; bak?: boolean; klar?: boolean };

/** Ritar vägarna + körordningens lager i en riktig karta och returnerar pixlarna längs vägarna. */
async function rita(opt: { vagar: Vag[]; lage: 'planering' | 'korvy'; kor: boolean; gamlaPilar?: boolean; center: [number, number]; zoom: number; bredd?: number; hojd?: number; skriv?: string; namn?: string; mata?: Array<{ id: string; punkt: [number, number] }>; pilTid?: number }) {
  const kvvagar: KorVag[] = opt.vagar.map((v) => ({ id: v.id, ordning: v.ordning ?? null, bak: !!v.bak, klar: !!v.klar, coords: v.coords }));
  const status = statusPerVag(kvvagar);
  const feats = opt.vagar.map((v) => ({ type: 'Feature', properties: { lineType: 'mainRoad', id: v.id, farg: v.farg, ...(opt.kor ? korEgenskap(opt.lage === 'korvy' || status.get(v.id) === 'klar' ? status.get(v.id) : undefined) : {}) }, geometry: { type: 'LineString', coordinates: v.coords } }));
  const punkter = opt.kor ? korPunkter({ vagar: kvvagar, lage: opt.lage, tMs: opt.pilTid ?? 0, statisk: false, tackning: null }) : { type: 'FeatureCollection', features: [] };
  const b = await CHROMIUM!.launch({});
  try {
    const pg = await b.newPage({ viewport: { width: opt.bredd ?? 900, height: opt.hojd ?? 640 } });
    await pg.setContent('<!doctype html><html><head><meta charset="utf-8"><style>html,body,#m{margin:0;height:100%}</style></head><body><div id="m"></div></body></html>');
    await pg.addStyleTag({ path: path.join(MAPLIBRE, 'maplibre-gl.css') });
    await pg.addScriptTag({ path: path.join(MAPLIBRE, 'maplibre-gl.js') });
    const svar = await pg.evaluate(async (a: any) => {
      const el = document.getElementById('m')!;
      const map = new (window as any).maplibregl.Map({ container: 'm', center: a.center, zoom: a.zoom, fadeDuration: 0, preserveDrawingBuffer: true, attributionControl: false,
        style: { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#3d4a2c' } }] } });
      await new Promise((r) => map.on('load', r));
      map.addSource('lines-source', { type: 'geojson', data: { type: 'FeatureCollection', features: a.feats } });
      map.addSource(a.korKalla, { type: 'geojson', data: a.punkter });
      const mainRoad = ['==', ['get', 'lineType'], 'mainRoad'];
      const ids: string[] = [];
      const lagg = (l: any, fore?: string) => { map.addLayer(l, fore); ids.push(l.id); };
      lagg({ id: 'line-mainRoad-casing', type: 'line', source: 'lines-source', filter: mainRoad, paint: { 'line-color': a.kant, 'line-width': a.cw }, layout: { 'line-cap': 'round', 'line-join': 'miter' } });
      lagg({ id: 'line-mainRoad-base', type: 'line', source: 'lines-source', filter: mainRoad, paint: { 'line-color': a.farg, 'line-width': a.lw, 'line-opacity': a.opac }, layout: { 'line-cap': 'round', 'line-join': 'miter' } });
      lagg({ id: 'line-mainRoad-stripe', type: 'line', source: 'lines-source', filter: ['all', mainRoad, a.utanFarg, a.inteKlar], paint: { 'line-color': a.gul, 'line-width': a.lwK, 'line-dasharray': a.dash }, layout: a.streckLayout });
      if (a.kor) {
        map.addLayer(a.sken, 'line-mainRoad-casing');
        const pil = new Function('return ' + a.ritaPilSrc)();
        const c = pil(a.pilFarg, 80); const ctx = c.getContext('2d')!; const d = ctx.getImageData(0, 0, c.width, c.height);
        map.addImage(a.pilBild, { width: c.width, height: c.height, data: new Uint8Array(d.data.buffer) });
        for (const l of a.punktLager) map.addLayer(l);
      }
      if (a.gamlaPilar) {
        const c = new Function('return ' + a.ritaPilSrc)()('#3b82f6', 80); const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height);
        map.addImage('arrow-drivedirection', { width: c.width, height: c.height, data: new Uint8Array(d.data.buffer) });
        map.addSource('arrows-source', { type: 'geojson', data: { type: 'FeatureCollection', features: a.pilar.map((p: any) => ({ type: 'Feature', properties: { rotation: p.vinkel }, geometry: { type: 'Point', coordinates: [p.lng, p.lat] } })) } });
        map.addLayer({ id: 'arrows-layer', type: 'symbol', source: 'arrows-source', layout: { 'icon-image': 'arrow-drivedirection', 'icon-size': 0.6, 'icon-rotate': ['get', 'rotation'], 'icon-rotation-alignment': 'map', 'icon-allow-overlap': true } });
      }
      await new Promise((r) => { map.once('idle', r); map.triggerRepaint(); });
      const cv = document.createElement('canvas'); cv.width = map.getCanvas().width; cv.height = map.getCanvas().height;
      const ctx = cv.getContext('2d')!; ctx.drawImage(map.getCanvas(), 0, 0);
      const dpr = cv.width / map.getCanvas().clientWidth;
      const px = (x: number, y: number) => { const d = ctx.getImageData(Math.round(x * dpr), Math.round(y * dpr), 1, 1).data; return [d[0], d[1], d[2]]; };
      // tjockleken: lodrät skanning över varje mätpunkt (vägen är vågrät i mätfallet) — antal bildpunkter som skiljer sig från bakgrunden
      const matt: Record<string, any> = {};
      for (const m of a.mata) {
        const p = map.project(m.punkt);
        let n = 0; let farg: number[] | null = null;
        for (let dy = -30; dy <= 30; dy += 0.5) { const q = px(p.x, p.y + dy); const bakgrund = Math.abs(q[0] - 0x3d) < 14 && Math.abs(q[1] - 0x4a) < 14 && Math.abs(q[2] - 0x2c) < 14; if (!bakgrund) n += 0.5; }
        // färgen mäts där ingen vit pil ligger över (pilarna glider): av tre punkter tvärs vägen den som skiljer mest från vitt
        farg = [px(p.x, p.y), px(p.x, p.y - 2), px(p.x, p.y + 2)].sort((q, r) => (q[0] + q[1] + q[2]) - (r[0] + r[1] + r[2]))[0];
        matt[m.id] = { tjocklek: n, farg };
      }
      return { matt, lager: map.getStyle().layers.map((l: any) => l.id) };
    }, {
      feats, punkter, kor: opt.kor, gamlaPilar: !!opt.gamlaPilar, pilar: fix.pilar, center: opt.center, zoom: opt.zoom, korKalla: KOR_KALLA, pilBild: KOR_PIL_BILD, pilFarg: KOR_PIL_FARG, ritaPilSrc: ritaPilIkon.toString(),
      kant: VAG_KANT_FARG, cw: opt.kor ? korBredd(CW) : CW, lw: opt.kor ? korBredd(LW) : LW, lwK: opt.kor ? korBredd(LW) : LW, farg: opt.kor ? korFarg(BASVAG_FARG_UTTRYCK) : BASVAG_FARG_UTTRYCK, opac: opt.kor ? KOR_OPACITET : 1,
      utanFarg: BASVAG_UTAN_FARG, inteKlar: opt.kor ? KOR_INTE_KLAR : true, gul: LEGEND.gul, dash: [...BASVAG_STRECK_DASH], streckLayout: { ...BASVAG_STRECK_LAYOUT },
      sken: { ...korSkenLager('lines-source') }, punktLager: korPunktLager(), mata: opt.mata ?? [],
    });
    if (opt.skriv) { fs.mkdirSync(opt.skriv, { recursive: true }); await pg.screenshot({ path: path.join(opt.skriv, `${opt.namn ?? 'bild'}.png`) }); }
    return svar as { matt: Record<string, { tjocklek: number; farg: number[] }>; lager: string[] };
  } finally { await b.close(); }
}

// ── Mätfall: fyra vågräta vägar med varsin status ──────────────────────────────────────────────────────────────────────────────────────────────
const rakVag = (id: string, lat: number, extra: Partial<Vag> = {}): Vag => ({ id, farg: 'red', coords: [[15.0, lat], [15.003, lat]], ...extra });
const MATFALL: Vag[] = [
  rakVag('klar', 57.0000, { ordning: 1, klar: true }), rakVag('nu', 57.0004, { ordning: 2 }), rakVag('nasta', 57.0008, { ordning: 3 }), rakVag('kommande', 57.0012, { ordning: 4 }), rakVag('utan', 57.0016),
];
const MATPUNKTER = MATFALL.map((v) => ({ id: v.id, punkt: [15.0004, v.coords[0][1]] as [number, number] }));

describe.skipIf(!CHROMIUM)('Körordning — riktig Chromium + MapLibre, pixlar', () => {
  it('bara nu är tjock — nästa, kommande och en väg utan siffra ritas lika som vanligt (inga tunna linjer), en körd väg är grå', async () => {
    const m = await rita({ vagar: MATFALL, lage: 'korvy', kor: true, center: [15.0015, 57.0008], zoom: 16.6, mata: MATPUNKTER, skriv: process.env.KOR_SKRIV, namn: 'matfall' });
    const t = (id: string) => m.matt[id].tjocklek;
    // "nu" mäts med skenet (det lyser, alltså bredare); vägen själv är lika bred som en väg utan siffra — det visar jämförelsen utan sken i sista testet
    expect(Math.abs(t('nasta') - t('utan'))).toBeLessThan(1.5);
    expect(Math.abs(t('kommande') - t('utan'))).toBeLessThan(1.5);
    expect(Math.abs(t('klar') - t('utan'))).toBeLessThan(1.5);
    expect(t('nu')).toBeGreaterThan(t('utan') * 1.4);
    const [r, g, b] = m.matt.klar.farg;
    expect(Math.abs(r - g) < 40 && Math.abs(g - b) < 40, `klar väg ska vara grå, blev ${m.matt.klar.farg}`).toBe(true);
    const nu = m.matt.nu.farg;
    expect(nu[0] > nu[1] + 60, `nu-vägen ska vara röd, blev ${nu}`).toBe(true);
  }, 120000);
  it('lagren: skenet ligger UNDER väglagren, pilar/siffra/kvar ovanpå', async () => {
    const m = await rita({ vagar: MATFALL, lage: 'korvy', kor: true, center: [15.0015, 57.0008], zoom: 16.6 });
    const i = (id: string) => m.lager.indexOf(id);
    expect(i('line-kor-sken')).toBeLessThan(i('line-mainRoad-casing'));
    expect(i('line-kor-pil')).toBeGreaterThan(i('line-mainRoad-base'));
  }, 120000);
  it('utan körordning ritas vägen exakt som förut (samma tjocklek och färg)', async () => {
    const med = await rita({ vagar: MATFALL.map((v) => ({ ...v, ordning: undefined, klar: false })), lage: 'korvy', kor: true, center: [15.0015, 57.0008], zoom: 16.6, mata: MATPUNKTER });
    const utan = await rita({ vagar: MATFALL.map((v) => ({ ...v, ordning: undefined, klar: false })), lage: 'korvy', kor: false, center: [15.0015, 57.0008], zoom: 16.6, mata: MATPUNKTER });
    for (const v of MATFALL) { expect(med.matt[v.id].tjocklek).toBeCloseTo(utan.matt[v.id].tjocklek, 0); expect(med.matt[v.id].farg).toEqual(utan.matt[v.id].farg); }
  }, 120000);
});

// ── Arvidstorp: före (gamla körriktningspilar) och efter (körordning) ───────────────────────────────────────────────────────────────────────
describe.skipIf(!CHROMIUM)('Arvidstorp RP J-Hus -25 — före och efter (prod 2026-10-25)', () => {
  const vagar: Vag[] = fix.vagar.map((v: any) => ({ id: v.id, farg: v.farg, coords: v.coords }));
  const kv: KorVag[] = vagar.map((v) => ({ id: v.id, ordning: null, bak: false, klar: false, coords: v.coords }));
  const fs2 = foreslaOrdning(kv, fix.pilar, (id) => fix.vagar.find((v: any) => v.id === id)?.nummer ?? 0);
  const center: [number, number] = [fix.objekt.lng, fix.objekt.lat];
  const medOrdning = (klaraAntal: number): Vag[] => vagar.map((v) => { const r = fs2.rader.find((x) => x.id === v.id); return r ? { ...v, ordning: r.ordning, bak: r.bak, klar: r.ordning <= klaraAntal } : v; });
  it('före: de gamla pilarna; efter: planeringen (siffror + pilar) och körvyn (nu tjock och lyser, nästa bara en siffra, körd grå)', async () => {
    const skriv = process.env.KOR_SKRIV;
    await rita({ vagar, lage: 'planering', kor: false, gamlaPilar: true, center, zoom: 16.2, skriv, namn: 'arvidstorp-fore' });
    await rita({ vagar: medOrdning(0), lage: 'planering', kor: true, center, zoom: 16.2, skriv, namn: 'arvidstorp-efter-planering' });
    await rita({ vagar: medOrdning(1), lage: 'korvy', kor: true, center, zoom: 16.2, skriv, namn: 'arvidstorp-efter-korvy' });
    await rita({ vagar: medOrdning(1), lage: 'korvy', kor: true, center, zoom: 16.2, bredd: 390, hojd: 760, skriv, namn: 'arvidstorp-efter-korvy-telefon' });
    expect(fs2.rader.length).toBeGreaterThan(0);
  }, 180000);
});
