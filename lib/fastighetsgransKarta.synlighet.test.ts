// @vitest-environment node
// FASTIGHETSGRÄNSEN: SYNLIGHET OCH LJUSHET I RIKTIG CHROMIUM + MAPLIBRE (Martin 2026-10-22, två fel efter hans test på Stänkelsmåla 2025).
//   FEL 1 — "syns fast lagret är släckt": lagret var tänt som STANDARD och hooken sparade standarden som ett val. Här prövas att INGET som hör till fastighetsgränsen syns när lagret är av,
//           också med ett gammalt sparat läge, i en riktig karta med de riktiga lagerspecarna och den riktiga prod-geometrin (alla tio lager, hela duken: noll avvikande pixlar).
//   FEL 2 — "nedtoningen ser omvänd ut": urvalet var rätt men styrkan för svag mot ett flygfoto. Här prövas att traktdelarna är LJUSARE än varje nedtonad fastighet, på mörk och ljus
//           bakgrund, med de riktiga polygonerna (hela uppsättningen, md5-kontrollerad mot prod).
// Funktionerna som körs i webbläsaren är de RIKTIGA (lib/fastighetsgransKarta.ts buntad med esbuild), inte en kopia. Finns ingen Chromium hoppas kartdelen över.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { build } from 'esbuild';
import { byggRagang, provpunkter, traktdelarUr } from './fastighetsgrans';
import { DEFAULT_MAP_LAYERS, lasSparadeLager } from './hooks/useMapLayers';
import { LM_GRANS, RAGANG_LAGER_ORDNING, fastighetsSynlighet } from './fastighetsgransKarta';

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
const CHROMIUM = process.env.FASTIGHET_UTAN_CHROMIUM ? null : chromium();
const MAPLIBRE = path.join(process.cwd(), 'node_modules/maplibre-gl/dist');
const FC = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'lib/__fixtures__/fastighetsgrans_stankelsmala.json'), 'utf8'));

// ── ren sanning: synlighetsfunktionen ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('fastighetsSynlighet — släckt lager = ingenting av fastighetsgränsen syns', () => {
  const bool = [false, true];
  it('alla 16 kombinationer: släckt lager ger aldrig Vidas rågång, och Lantmäteri bara när briefingen själv tänt det', () => {
    for (const harVidaData of bool) for (const geometriLast of bool) for (const briefingLM of bool) {
      const s = fastighetsSynlighet({ lagerPa: false, harVidaData, geometriLast, briefingLM });
      expect(s.vida, JSON.stringify({ harVidaData, geometriLast, briefingLM })).toBe(false);
      expect(s.lm, JSON.stringify({ harVidaData, geometriLast, briefingLM })).toBe(briefingLM);
    }
  });
  it('tänt lager: Vidas rågång när Vida har fastighetsytor, annars Lantmäteri (först när geometrin är läst) — aldrig båda stilarna samtidigt', () => {
    expect(fastighetsSynlighet({ lagerPa: true, harVidaData: true, geometriLast: true, briefingLM: false })).toEqual({ vida: true, lm: false });
    expect(fastighetsSynlighet({ lagerPa: true, harVidaData: false, geometriLast: true, briefingLM: false })).toEqual({ vida: false, lm: true });
    expect(fastighetsSynlighet({ lagerPa: true, harVidaData: false, geometriLast: false, briefingLM: false })).toEqual({ vida: false, lm: false });
  });
  it('lagerPa måste vara exakt true: undefined, 0, "" och "true" tänder inget', () => {
    for (const v of [undefined, 0, '', 'true', null] as any[]) expect(fastighetsSynlighet({ lagerPa: v, harVidaData: true, geometriLast: true, briefingLM: false })).toEqual({ vida: false, lm: false });
  });
  it('gammalt sparat läge → lagerPa → synlighet: ett läge från första versionen (true utan märke) tänder inget', () => {
    const gammalt = '{"hansyn":true,"fastighetsgrans":true,"fastighetsgranser":true}';
    const l = lasSparadeLager(gammalt);
    expect(fastighetsSynlighet({ lagerPa: l.fastighetsgrans, harVidaData: true, geometriLast: true, briefingLM: l.fastighetsgranser })).toEqual({ vida: false, lm: false });
    expect(fastighetsSynlighet({ lagerPa: DEFAULT_MAP_LAYERS.fastighetsgrans, harVidaData: true, geometriLast: true, briefingLM: false })).toEqual({ vida: false, lm: false });
  });
});

// ── riktig karta ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
interface Sida { b: any; pg: any }
async function oppna(bg: string, zoom: number, center: [number, number]): Promise<Sida> {
  const bunt = await build({ entryPoints: [path.join(process.cwd(), 'lib/fastighetsgransKarta.ts')], bundle: true, format: 'iife', globalName: 'FG', write: false, platform: 'browser' });
  const b = await CHROMIUM!.launch({});
  const pg = await b.newPage({ viewport: { width: 1500, height: 1000 } });
  await pg.setContent('<!doctype html><html><head><meta charset="utf-8"><style>html,body,#m{margin:0;height:100%}</style></head><body><div id="m"></div></body></html>');
  await pg.addStyleTag({ path: path.join(MAPLIBRE, 'maplibre-gl.css') });
  await pg.addScriptTag({ path: path.join(MAPLIBRE, 'maplibre-gl.js') });
  await pg.addScriptTag({ content: bunt.outputFiles[0].text });
  await pg.evaluate(async (a: any) => {
    const map = new (window as any).maplibregl.Map({ container: 'm', center: a.center, zoom: a.zoom, fadeDuration: 0, preserveDrawingBuffer: true, attributionControl: false,
      style: { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': a.bg } }] } });
    (window as any).__map = map;
    await new Promise((r) => map.on('load', r));
  }, { bg, zoom, center });
  return { b, pg };
}

describe.skipIf(!CHROMIUM)('Fastighetslagret i riktig karta med verklig prod-geometri (Stänkelsmåla 2025)', () => {
  const modell = byggRagang(FC)!;
  const BG = '#3d4a2c';
  // Samma lager som sidan skapar: alla börjar osynliga (page.tsx lägger dem med visibility none), sedan avgör fastighetsSynlighet. Lantmäteri-rastret får en tile-URL som inte svarar
  // härifrån; det är osynligt i alla släckta lägen, och i det tända läget bevisas bara Vidas vektor.
  async function bygg(pg: any): Promise<void> {
    await pg.evaluate(async (a: any) => {
      const map = (window as any).__map, FG = (window as any).FG;
      const data: Record<string, any> = { 'trakt-ragang-yta-source': a.m.ytor, 'trakt-ragang-linje-source': a.m.linjer, 'trakt-ragang-etikett-source': a.m.etiketter };
      for (const [id, spec] of FG.ragangKallor()) map.addSource(id, { ...spec, data: data[id] });
      for (const { spec } of FG.ragangLager()) map.addLayer(JSON.parse(JSON.stringify(spec)));
      const lm = FG.lmGransLager();
      for (const [id, spec] of lm.kallor) map.addSource(id, spec);
      for (const spec of lm.lager) map.addLayer(spec);
    }, { m: { ytor: modell.ytor, linjer: modell.linjer, etiketter: modell.etiketter } });
  }
  /** Ritar om och räknar pixlar som avviker från bakgrunden (hela duken) samt läser varje fastighetslagers synlighet. */
  async function lasLaget(pg: any): Promise<{ avvikande: number; synliga: string[] }> {
    return pg.evaluate(async (a: any) => {
      const map = (window as any).__map;
      await new Promise((r) => { map.once('idle', r); map.triggerRepaint(); });
      const c = document.createElement('canvas'); const src = map.getCanvas(); c.width = src.width; c.height = src.height;
      const ctx = c.getContext('2d')!; ctx.drawImage(src, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      const bg = [1, 3, 5].map((k) => parseInt(a.bg.slice(k, k + 2), 16));
      let avvikande = 0;
      for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) > 2) avvikande++;
      const synliga = a.ids.filter((id: string) => map.getLayer(id) && map.getLayoutProperty(id, 'visibility') !== 'none');
      return { avvikande, synliga };
    }, { bg: BG, ids: [...RAGANG_LAGER_ORDNING, LM_GRANS.kantLager, LM_GRANS.linjeLager] });
  }
  /** Tillämpar tillståndet med den RIKTIGA funktionen ur lib/fastighetsgransKarta (buntad). */
  async function tillampa(pg: any, i: { lagerPa: boolean; harVidaData: boolean; geometriLast: boolean; briefingLM: boolean }): Promise<void> {
    await pg.evaluate((a: any) => { const FG = (window as any).FG; FG.tillampaFastighetsSynlighet((window as any).__map, FG.fastighetsSynlighet(a)); }, i);
  }

  const lagen: [string, string | null][] = [
    ['ingenting sparat (första starten)', null],
    ['gammalt sparat läge från första versionen: fastighetsgrans true, inget märke', '{"hansyn":true,"fastighetsgrans":true,"fastighetsgranser":true}'],
    ['sparat läge där användaren släckt lagret', '{"fastighetsgransVal":true,"fastighetsgrans":false}'],
    ['trasigt sparat läge', '{trasig'],
  ];
  for (const [namn, raw] of lagen) {
    it(`LAGRET SLÄCKT (${namn}): ingen vit gränslinje, ingen nedtoning, inga beteckningar — alla lager osynliga och duken exakt bakgrunden, på trakten och utzoomat`, async () => {
      const l = lasSparadeLager(raw);
      expect(l.fastighetsgrans).toBe(false);
      for (const [zoom, center] of [[16.2, [15.3035, 56.5873]], [14.4, [15.3105, 56.5875]]] as [number, [number, number]][]) {
        const { b, pg } = await oppna(BG, zoom, center);
        try {
          await bygg(pg);
          await tillampa(pg, { lagerPa: l.fastighetsgrans, harVidaData: true, geometriLast: true, briefingLM: l.fastighetsgranser });
          const r = await lasLaget(pg);
          expect(r.synliga, `synliga lager vid zoom ${zoom}`).toEqual([]);
          expect(r.avvikande, `pixlar som inte är bakgrund vid zoom ${zoom}`).toBe(0);
        } finally { await b.close(); }
      }
    }, 120000);
  }
  it('LAGRET SLÄCKT utan Vida-data (Lantmäteri-vägen): inte heller då syns något', async () => {
    const { b, pg } = await oppna(BG, 16.2, [15.3035, 56.5873]);
    try {
      await bygg(pg);
      await tillampa(pg, { lagerPa: false, harVidaData: false, geometriLast: true, briefingLM: false });
      const r = await lasLaget(pg);
      expect(r.synliga).toEqual([]); expect(r.avvikande).toBe(0);
    } finally { await b.close(); }
  }, 120000);
  it('SAMMA karta, lagret TÄNT: alla åtta vektorlager syns (så att tomt ovan inte beror på att inget går att rita) och Lantmäteri-paret är släckt', async () => {
    const { b, pg } = await oppna(BG, 16.2, [15.3035, 56.5873]);
    try {
      await bygg(pg);
      await tillampa(pg, { lagerPa: true, harVidaData: true, geometriLast: true, briefingLM: false });
      const r = await lasLaget(pg);
      expect(r.synliga.sort()).toEqual([...RAGANG_LAGER_ORDNING].sort());
      expect(r.avvikande, 'tänt lager ska ändra duken').toBeGreaterThan(50000);
    } finally { await b.close(); }
  }, 120000);
  it('lagret tänds och släcks om och om igen: duken är exakt bakgrunden varje gång det är släckt', async () => {
    const { b, pg } = await oppna(BG, 16.2, [15.3035, 56.5873]);
    try {
      await bygg(pg);
      for (const pa of [true, false, true, false]) {
        await tillampa(pg, { lagerPa: pa, harVidaData: true, geometriLast: true, briefingLM: false });
        const r = await lasLaget(pg);
        if (pa) expect(r.avvikande).toBeGreaterThan(50000); else { expect(r.synliga).toEqual([]); expect(r.avvikande).toBe(0); }
      }
    } finally { await b.close(); }
  }, 120000);

  // ── fel 2: traktdelarna ligger i den ljusa delen, ljusare än varje nedtonad fastighet, på mörk OCH ljus bakgrund ─────────────────────
  for (const bg of ['#3d4a2c', '#f2efe9', '#101510', '#8a8a8a']) {
    it(`bakgrund ${bg}: varje traktdels yta är LJUSARE än varje nedtonad fastighets yta (verkliga polygoner, bara fyllningarna så att inga linjer stör)`, async () => {
      const delar = traktdelarUr(FC);
      const mork = (modell.ytor.features as any[]).filter((f) => f.properties.sida === 'utanfor');
      const { b, pg } = await oppna(bg, 14.4, [15.3105, 56.5875]);
      try {
        await pg.evaluate(async (a: any) => {
          const map = (window as any).__map, FG = (window as any).FG;
          map.addSource('y', { type: 'geojson', data: a.ytor });
          for (const { spec } of FG.ragangLager()) if (spec.id === 'trakt-ragang-yta-trakt' || spec.id === 'trakt-ragang-yta-utanfor') { const s = JSON.parse(JSON.stringify(spec)); s.source = 'y'; s.layout.visibility = 'visible'; map.addLayer(s); }
          await new Promise((r) => { map.once('idle', r); map.triggerRepaint(); });
        }, { ytor: modell.ytor });
        // Punkter: alla provpunkter i traktdelarna, och tio punkter per nedtonad yta (jämnt utspridda över dess provpunkter) som ligger på skärmen.
        const traktPerDel = delar.map((d) => provpunkter([d]));
        const traktPunkter = traktPerDel.flat();
        // Bara punkter som ligger minst 8 m från ytans kant (4 px här): på en smal tomt/sliver (3 m bred) hamnar pixeln annars i grannen och mätningen säger inget om ytan.
        const kantAvstandM = (pt: number[], poly: number[][][]): number => {
          const ky = 111320, kx = 111320 * Math.cos((pt[1] * Math.PI) / 180); let d = Infinity;
          for (const r of poly) for (let i = 1; i < r.length; i++) {
            const ax = (r[i - 1][0] - pt[0]) * kx, ay = (r[i - 1][1] - pt[1]) * ky, bx = (r[i][0] - pt[0]) * kx, by = (r[i][1] - pt[1]) * ky;
            const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy, u = l2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2));
            d = Math.min(d, Math.hypot(ax + u * dx, ay + u * dy));
          }
          return d;
        };
        const morkPunkter = mork.map((f) => { const pp = provpunkter([f.geometry.coordinates]).filter((q) => kantAvstandM(q, f.geometry.coordinates) >= 8); const n = 10; return pp.length === 0 ? [] : Array.from({ length: Math.min(n, pp.length) }, (_, k) => pp[Math.floor((k + 0.5) * pp.length / Math.min(n, pp.length))]); });
        const lum = await pg.evaluate(async (a: any) => {
          const map = (window as any).__map; await new Promise((r) => { map.once('idle', r); map.triggerRepaint(); }); const src = map.getCanvas();
          const c = document.createElement('canvas'); c.width = src.width; c.height = src.height; const ctx = c.getContext('2d')!; ctx.drawImage(src, 0, 0);
          const dpr = src.width / src.clientWidth;
          const L = (p: number[]) => { const q = map.project(p); const X = Math.round(q.x * dpr), Y = Math.round(q.y * dpr); if (X < 0 || Y < 0 || X >= c.width || Y >= c.height) return null; const d = ctx.getImageData(X, Y, 1, 1).data; return 0.2126 * d[0] + 0.7152 * d[1] + 0.0722 * d[2]; };
          return { trakt: a.trakt.map(L).filter((v: number | null) => v !== null), mork: a.mork.map((pp: number[][]) => pp.map(L).filter((v: number | null) => v !== null)) };
        }, { trakt: traktPunkter, mork: morkPunkter });
        expect(lum.trakt.length, 'traktens provpunkter på skärmen').toBe(traktPunkter.length);
        const alla = (lum.mork as number[][]).flat();
        expect(alla.length, 'nedtonade punkter som kunde mätas').toBeGreaterThan(50);
        const morkMax = Math.max(...alla);
        if (process.env.FASTIGHET_DEBUG) (lum.mork as number[][]).forEach((vals, i) => { const hog = vals.filter((v) => v > Math.min(...alla) + 5); if (hog.length) console.log('LJUS-I-NEDTONAD', mork[i].properties.namn, vals.map((v) => v.toFixed(0)).join(','), 'punkter', JSON.stringify(morkPunkter[i].slice(0, 3))); });
        // Varje traktdel: minst 97 % av dess punkter är ljusare än den LJUSASTE nedtonade punkten (traktgränsen ligger några meter över rågången på ett ställe, Stänkelsmåla 1:8 får ~1 % av
        // en del — det är rätt, den biten ligger på grannens mark och tonas ned). Aldrig fler än 3 % mörka, och aldrig en hel del.
        let start = 0;
        traktPerDel.forEach((pp, k) => {
          const v = (lum.trakt as number[]).slice(start, start + pp.length); start += pp.length;
          const ljusare = v.filter((x) => x > morkMax).length / v.length;
          expect(ljusare, `traktdel ${k + 1}: andel av punkterna ljusare än den ljusaste nedtonade punkten (${morkMax.toFixed(1)})`).toBeGreaterThanOrEqual(0.97);
        });
        // Och i snitt är trakten MYCKET ljusare: medelljuset i trakten överstiger medelljuset i de nedtonade med minst faktorn 2 (på alla bakgrunder är lit/dim ≥ 2).
        const snitt = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
        expect(snitt(lum.trakt as number[]) / Math.max(snitt(alla), 1), 'ljusförhållande trakt/nedtonad').toBeGreaterThan(2);
      } finally { await b.close(); }
    }, 120000);
  }
});
