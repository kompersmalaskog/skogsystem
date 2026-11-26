// Körspåren på de två kartorna som inte är planeringens (objektöversikten, skotarlänken) mätta i RIKTIG Chromium + MapLibre med produktionens egna funktioner
// (korsparLinjerForServer → korsparKallor → korsparLager) på Edestads riktiga spår (fixturerna). Bakgrunden är syntetisk (nätverket nås inte härifrån).
// Mäter: skördarens band är lila längs hela spåret, den vita mittlinjen syns där skotaren kört, skotarens eget ljusa band där skördaren inte kört, och
// skotarlänkens uppsättning (bara skördaren) har inget vitt alls.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { hittaChromium, KARTA_ARGS } from './testStod/chromium';
import { korsparLinjerForServer, type Koord } from './korspar';
import { korsparKallor, korsparLager } from './korsparLager';

const CHROMIUM = hittaChromium(KARTA_ARGS);
const MAPLIBRE = path.join(process.cwd(), 'node_modules/maplibre-gl/dist/maplibre-gl.js');
const dec = (d: any) => { let la = d.la0, lo = d.lo0; return d.deltas.split(' ').map((s: string, i: number) => { const [a, b] = s.split(',').map(Number); la += a; lo += b; return { lat: la / 1e6, lng: lo / 1e6, tid: String(i) }; }); };
const dagar = (f: string): Koord[][] => JSON.parse(fs.readFileSync(path.join(process.cwd(), 'lib/__fixtures__', f), 'utf8')).dagar.flatMap((d: any) => korsparLinjerForServer(dec(d)));

async function rita(kallor: Record<string, any[]>, lager: any[], punkter: Record<string, Koord[]>): Promise<Record<string, number[][]>> {
  const b = await CHROMIUM!.launch({});
  try {
    const pg = await b.newPage({ viewport: { width: 1000, height: 700 }, deviceScaleFactor: 1 });
    await pg.addInitScript('window.__name=(f)=>f');
    await pg.setContent('<!doctype html><html><head><meta charset="utf-8"><style>html,body,#m{margin:0;height:100%}</style></head><body><div id="m"></div></body></html>');
    await pg.addScriptTag({ path: MAPLIBRE });
    await pg.evaluate('window.__name=(f)=>f');
    return await pg.evaluate(async (p: any) => {
      const ml = (window as any).maplibregl;
      const alla: number[][] = Object.values(p.punkter).flat() as number[][];
      const lo = alla.map((x) => x[0]), la = alla.map((x) => x[1]);
      const map = new ml.Map({ container: 'm', center: [0, 0], zoom: 14, fadeDuration: 0, canvasContextAttributes: { preserveDrawingBuffer: true }, attributionControl: false,
        style: { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#1f3316' } }] } });
      await new Promise((r) => map.on('load', r));
      map.fitBounds([[Math.min(...lo), Math.min(...la)], [Math.max(...lo), Math.max(...la)]], { padding: 60, animate: false, maxZoom: 19 });
      for (const [id, f] of Object.entries(p.kallor)) map.addSource(id, { type: 'geojson', data: { type: 'FeatureCollection', features: f } });
      for (const l of p.lager) map.addLayer(l);
      await new Promise((r) => { map.once('idle', r); map.triggerRepaint(); });
      const c = map.getCanvas(); const t = document.createElement('canvas'); t.width = c.width; t.height = c.height; const g = t.getContext('2d')!; g.drawImage(c, 0, 0);
      const ut: Record<string, number[][]> = {};
      for (const [id, q] of Object.entries(p.punkter) as [string, number[][]][]) ut[id] = q.map((pt) => { const o = map.project(pt); if (o.x < 2 || o.y < 2 || o.x > c.width - 3 || o.y > c.height - 3) return null; return Array.from(g.getImageData(Math.round(o.x), Math.round(o.y), 1, 1).data.slice(0, 3)); }).filter((x: any) => x) as number[][];
      return ut;
    }, { kallor, lager, punkter });
  } finally { await b.close(); }
}
const arLila = (c: number[]) => c[0] > 120 && c[2] > 170 && c[1] < 150 && c[2] - c[1] > 60;
const arLjus = (c: number[]) => c[0] > 190 && c[1] > 190 && c[2] > 190;
const andel = (fk: number[][], f: (c: number[]) => boolean) => fk.filter(f).length / Math.max(1, fk.length);
const mitt = (ls: Koord[][]) => ls.map((l) => l[Math.floor(l.length / 2)]);

describe.skipIf(!CHROMIUM)('Körspår på objektöversikten och skotarlänken — riktig Chromium + MapLibre', () => {
  const skordar = dagar('korspar_edestad_skordare_2026-11-20.json'), skotar = dagar('korspar_edestad_skotare_2026-11-19.json');

  it('objektöversikten: skördarens band lila, vit mittlinje där skotaren kört, skotarens eget ljusa band där skördaren inte kört', async () => {
    const k = korsparKallor(skordar, skotar);
    expect(k.skordare.some((f) => f.properties.klar === true)).toBe(true);   // skotaren körde i skördarens spår på Edestad
    expect(k.skotare.length).toBeGreaterThan(0);                              // …och på ställen där skördaren inte var
    const lager = [...korsparLager('t', 'skordare', 'sk'), ...korsparLager('t', 'skotare', 'st')];
    const klar = k.skordare.filter((f) => f.properties.klar === true).map((f) => f.geometry.coordinates);
    const orort = k.skordare.filter((f) => f.properties.klar === false).map((f) => f.geometry.coordinates);
    const ute = k.skotare.map((f) => f.geometry.coordinates);
    const r = await rita({ sk: k.skordare, st: k.skotare }, lager, { klar: mitt(klar), orort: mitt(orort).filter((_, i) => i % 2 === 0), ute: mitt(ute) });
    expect(r.klar.length).toBeGreaterThan(3);
    expect(andel(r.klar, arLjus)).toBeGreaterThan(0.6);            // mittlinjen är vit där skotaren kört
    expect(andel(r.orort, arLila)).toBeGreaterThan(0.6);           // lila band där bara skördaren kört
    expect(andel(r.ute, arLjus)).toBeGreaterThan(0.6);             // skotarens eget band: ljust
  });

  it('skotarlänken (bara skördaren): lila band, ingenting vitt, och bandet är ritat längs hela spåret', async () => {
    const k = korsparKallor(skordar, []);
    const lager = korsparLager('sk', 'skordare', 'sk').filter((l: any) => !l.filter);
    const alla = skordar.flatMap((l) => l.filter((_, i) => i % 8 === 4));
    const r = await rita({ sk: k.skordare }, lager, { alla });
    expect(r.alla.length).toBeGreaterThan(30);
    expect(andel(r.alla, arLila)).toBeGreaterThan(0.9);
    expect(andel(r.alla, arLjus)).toBeLessThan(0.02);
  });
});
