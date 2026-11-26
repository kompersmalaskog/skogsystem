// Körspåren mätta i en RIKTIG webbläsare (Chromium + MapLibre, appens egna paint-uttryck ur lib/sparStil och appens egen kedja lib/korspar) — jsdom har ingen layout och ingen karta.
// Facit är de riktiga spåren ur prod (fixturerna): Bondeskog (Giant, skördare, 21 nov), Edestad (Giant 20 nov + Elefant 26 skotare 19 nov).
// Mäter: (1) linjen är ritad HELA vägen (ingen lucka där skördaren stod still), (2) tre lägen med en blick — lila band, vit mittlinje där skotaren kört, ljust eget band där skördaren inte kört,
// (3) bredden följer METER (dubbelt så brett vid ett zoomsteg in, smalt utzoomat). Bakgrunden är syntetisk (nätverket nås inte härifrån) — det som mäts är spårens egna färger mot en mörk mark.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { hittaChromium, KARTA_ARGS } from './testStod/chromium';
import { korsparLinjer, type Koord } from './korspar';
import { delaKlart, delaUtanfor } from './korsparKlart';
import { kartSpar, MITTLINJE_FARG, MITTLINJE_BREDD, MITTLINJE_OPACITET, MITTLINJE_FILTER } from './sparStil';

const CHROMIUM = hittaChromium(KARTA_ARGS);
const MAPLIBRE = path.join(process.cwd(), 'node_modules/maplibre-gl/dist/maplibre-gl.js');
const lasFx = (f: string) => JSON.parse(fs.readFileSync(path.join(process.cwd(), 'lib/__fixtures__', f), 'utf8'));
const dec = (d: any) => { let la = d.la0, lo = d.lo0; return d.deltas.split(' ').map((s: string, i: number) => { const [a, b] = s.split(',').map(Number); la += a; lo += b; return { lat: la / 1e6, lng: lo / 1e6, tid: String(i) }; }); };
const dagar = (fx: any): Koord[][] => fx.dagar.flatMap((d: any) => korsparLinjer(dec(d)));
const feat = (linjer: Koord[][], props: any = {}) => linjer.map((c) => ({ type: 'Feature', properties: props, geometry: { type: 'LineString', coordinates: c } }));

type Prov = { id: string; punkter: Koord[] };
type Svar = { farger: Record<string, number[][]>; zoom: number; tvar?: number[] };

async function rita(kallor: any[], prov: Prov[], kamera: { center: number[]; zoom: number } | null, tvar?: { vid: Koord; vinkel: number }): Promise<Svar> {
  const b = await CHROMIUM!.launch({});
  try {
    const pg = await b.newPage({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 1 });
    await pg.addInitScript('window.__name=(f)=>f');
    await pg.setContent('<!doctype html><html><head><meta charset="utf-8"><style>html,body,#m{margin:0;height:100%}</style></head><body><div id="m"></div></body></html>');
    await pg.addScriptTag({ path: MAPLIBRE });
    await pg.evaluate('window.__name=(f)=>f');
    const s = kartSpar('plan', false);
    const lager = [
      { id: 'kant', paint: { 'line-color': s.kantFarg, 'line-opacity': s.kantOpacitet, 'line-width': s.kantBredd, 'line-blur': s.kantSudd } },
      { id: 'linje', paint: { 'line-color': s.farg, 'line-opacity': s.opacitet, 'line-width': s.bredd } },
      { id: 'mitt', filter: MITTLINJE_FILTER, paint: { 'line-color': MITTLINJE_FARG, 'line-opacity': MITTLINJE_OPACITET, 'line-width': MITTLINJE_BREDD } },
    ];
    return await pg.evaluate(async (p: any) => {
      const ml = (window as any).maplibregl;
      const alla: number[][] = p.kallor.flatMap((f: any) => f.geometry.coordinates);
      const lngs = alla.map((x) => x[0]), lats = alla.map((x) => x[1]);
      const w = Math.min(...lngs), e = Math.max(...lngs), so = Math.min(...lats), no = Math.max(...lats);
      const map = new ml.Map({ container: 'm', center: [(w + e) / 2, (so + no) / 2], zoom: 14, fadeDuration: 0, canvasContextAttributes: { preserveDrawingBuffer: true }, attributionControl: false,
        style: { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#1f3316' } }] } });
      await new Promise((r) => map.on('load', r));
      if (p.kamera) map.jumpTo(p.kamera); else map.fitBounds([[w, so], [e, no]], { padding: 40, animate: false, maxZoom: 19 });
      map.addSource('sp', { type: 'geojson', data: { type: 'FeatureCollection', features: p.kallor } });
      for (const l of p.lager) map.addLayer({ id: l.id, type: 'line', source: 'sp', ...(l.filter ? { filter: l.filter } : {}), paint: l.paint, layout: { 'line-cap': 'round', 'line-join': 'round' } });
      await new Promise((r) => { map.once('idle', r); map.triggerRepaint(); });
      const c = map.getCanvas(); const t = document.createElement('canvas'); t.width = c.width; t.height = c.height; const g = t.getContext('2d')!; g.drawImage(c, 0, 0);
      const px = (x: number, y: number) => { if (x < 2 || y < 2 || x > c.width - 3 || y > c.height - 3) return null; return Array.from(g.getImageData(Math.round(x), Math.round(y), 1, 1).data.slice(0, 3)); };
      const ut: Svar = { farger: {}, zoom: map.getZoom() };
      for (const pr of p.prov) ut.farger[pr.id] = pr.punkter.map((q: number[]) => { const o = map.project(q); return px(o.x, o.y); }).filter((x: any) => x);
      if (p.tvar) {
        const o = map.project(p.tvar.vid), cs = Math.cos(p.tvar.vinkel), sn = Math.sin(p.tvar.vinkel);
        ut.tvar = []; for (let d = -200; d <= 200; d += 1) { const v = px(o.x + cs * d, o.y + sn * d); ut.tvar.push(v ? v[0] * 0.3 + v[2] * 0.7 : 0); }
      }
      return ut;
    }, { kallor, lager, prov, kamera, tvar });
  } finally { await b.close(); }
}

// Färgklasser mot den mörkgröna marken (#1f3316): lila band (r och b höga, g låg), vit/ljus (alla höga).
const arLila = (c: number[]) => c[0] > 120 && c[2] > 170 && c[1] < 150 && c[2] - c[1] > 60;
const arLjus = (c: number[]) => c[0] > 190 && c[1] > 190 && c[2] > 190;
const andel = (fk: number[][], f: (c: number[]) => boolean) => fk.filter(f).length / Math.max(1, fk.length);
/** Glesa punkter längs linjerna (var 6:e hörn) — de som ligger i bild. */
/** Ändarna räknas inte: där möter en bit en annan (mittlinje, ljust band) och färgen är avsiktligt en annan. */
const langs = (linjer: Koord[][]): Koord[] => linjer.flatMap((l) => l.filter((_, i) => i % 6 === 0 && i > 3 && i < l.length - 4));

/** Mittpunkten på varje bit — för korta bitar (ljusa band) där ändarna är hela biten. */
const mittpunkter = (linjer: Koord[][]): Koord[] => linjer.map((l) => l[Math.floor(l.length / 2)]);

describe.skipIf(!CHROMIUM)('Körspåren — mätta i riktig Chromium + MapLibre', () => {
  const bon = dagar(lasFx('korspar_bondeskog_skordare_2026-11-21.json'));
  const eds = dagar(lasFx('korspar_edestad_skordare_2026-11-20.json'));
  const edk = dagar(lasFx('korspar_edestad_skotare_2026-11-19.json'));

  it('Bondeskog: skördarens spår är ritat HELA vägen — ingen lucka där maskinen stod still, bara EN linje per dag och brytning bara vid flytt', async () => {
    const r = await rita(feat(bon), [{ id: 'skordare', punkter: langs(bon) }], { center: [15.35741, 56.65925], zoom: 17.2 });
    expect(r.farger.skordare.length).toBeGreaterThan(30);
    expect(andel(r.farger.skordare, arLila), 'andel av hörnen som ligger på lila band').toBeGreaterThan(0.95);
    // Dagarna är hela spår: få linjer, inte stumpar (förut: 54 bitar varav 33 under 20 m).
    expect(bon.length).toBeLessThanOrEqual(4);
  }, 120000);

  it('Edestad i skotarläget: lila syns, vit mittlinje där Elefanten kört, eget ljust band där skördaren inte kört — tre lägen som skiljs åt', async () => {
    const klar = delaKlart(feat(eds) as any, edk) as any[];
    const ute = delaUtanfor(feat(edk) as any, eds) as any[];
    expect(klar.some((f) => f.properties.klar)).toBe(true);
    expect(ute.length).toBeGreaterThan(0);
    const kallor = [...klar, ...ute];
    const klarLinjer = klar.filter((f) => f.properties.klar).map((f) => f.geometry.coordinates as Koord[]);
    const bara = klar.filter((f) => !f.properties.klar).map((f) => f.geometry.coordinates as Koord[]);
    const uteLinjer = ute.map((f) => f.geometry.coordinates as Koord[]);
    const r = await rita(kallor, [
      { id: 'klar', punkter: langs(klarLinjer) },
      { id: 'bara', punkter: langs(bara) },
      { id: 'ute', punkter: mittpunkter(uteLinjer) },
    ], { center: [15.34995, 56.23300], zoom: 17.2 });
    expect(r.farger.klar.length).toBeGreaterThan(10);
    expect(andel(r.farger.klar, arLjus), 'mittlinjen: vit mitt i det lila').toBeGreaterThan(0.7);
    if (r.farger.bara.length > 10) expect(andel(r.farger.bara, arLila), 'skördarens eget stråk: lila').toBeGreaterThan(0.7);
    expect(r.farger.ute.length).toBeGreaterThan(5);
    expect(andel(r.farger.ute, arLjus), 'skotarens eget band: ljust').toBeGreaterThan(0.7);
    expect(andel(r.farger.ute, arLila), 'skotarens eget band är inte lila').toBeLessThan(0.15);
  }, 120000);

  it('bredden är i METER: dubbelt så brett vid ett zoomsteg in, och smalt utzoomat — tänder: en pixelbredd skulle vara lika bred vid båda', async () => {
    // Ett rakt stycke: en ändpunkt-nära punkt på Bondeskogs genomfart (första linjens 20:e punkt) och linjens riktning där.
    const l = bon.reduce((a, b) => (b.length > a.length ? b : a));
    const m = (q: Koord): [number, number] => [q[0] * 111320 * Math.cos((56.66 * Math.PI) / 180), q[1] * 110574];
    const dist = (a: Koord, b: Koord) => Math.hypot(m(a)[0] - m(b)[0], m(a)[1] - m(b)[1]);
    // Ett rakt stycke utan annan körning inom 25 m (annars korsar skanningen grannspåret): rak = ±8 hörn i linje, fritt = alla hörn utanför ±40 index ligger > 25 m bort.
    let i = -1;
    for (let k = 12; k < l.length - 12 && i < 0; k++) {
      const a1 = Math.atan2(m(l[k])[1] - m(l[k - 8])[1], m(l[k])[0] - m(l[k - 8])[0]), a2 = Math.atan2(m(l[k + 8])[1] - m(l[k])[1], m(l[k + 8])[0] - m(l[k])[0]);
      if (Math.abs(a1 - a2) > 0.1 || dist(l[k - 8], l[k + 8]) < 20) continue;
      if (l.every((q, j) => Math.abs(j - k) <= 40 || dist(q, l[k]) > 25)) i = k;
    }
    expect(i, 'ett rakt, fritt stycke finns i Bondeskogs spår').toBeGreaterThan(0);
    const vid = l[i], nasta = l[i + 8];
    const brett = async (zoom: number) => {
      const lat = (vid[1] * Math.PI) / 180;
      // riktning på skärmen: lng ökar åt höger, lat uppåt (norr = uppåt) → vinkel för PERPENDIKULÄREN mot linjen
      const dx = (nasta[0] - vid[0]) * Math.cos(lat), dy = nasta[1] - vid[1];
      const vinkelLinje = Math.atan2(-dy, dx);
      const r = await rita(feat([l]), [], { center: vid as any, zoom }, { vid, vinkel: vinkelLinje + Math.PI / 2 });
      const bg = Math.min(...r.tvar!), t = r.tvar!, mitt = Math.floor(t.length / 2);
      if (t[mitt] < bg + 40) return 0;
      let lo = mitt, hi = mitt; while (lo > 0 && t[lo - 1] > bg + 40) lo--; while (hi < t.length - 1 && t[hi + 1] > bg + 40) hi++;
      return hi - lo + 1;   // bredden (px) på bandet som går genom mitten — grannspår som skanningen råkar korsa räknas inte
    };
    const a = await brett(17.5), b = await brett(18.5);
    expect(a, 'px vid zoom 17,5').toBeGreaterThan(3);
    expect(b / a, 'ett zoomsteg in ≈ dubbel bredd').toBeGreaterThan(1.6);
    expect(b / a).toBeLessThan(2.4);
    const ut = await brett(15);
    expect(ut, 'utzoomat är bandet smalt (golv, aldrig en bred sudd)').toBeLessThan(a);
  }, 180000);
});
