// @vitest-environment node
// SKÄLVIKEN: ÄR TRAKTEN LJUSARE ÄN SKOGEN UTANFÖR? (Martin 2026-10-27: "inne i trakten ser flygfotot mörkare/gråare ut än skogen utanför — det ska vara TVÄRTOM".)
// Mäts i riktig Chromium + MapLibre med Skälvikens RIKTIGA data ur prod (traktgräns, de fem hänsynsytorna, skördarens och skotarens hyttspår, fixtur skalviken_2026-10-27.json)
// över ett SYNTETISKT flygfoto (nätverket nås inte härifrån; samma skog inne och ute, så all skillnad kommer från lagren). Lagren byggs med appens egna funktioner
// (dampatSpar, kartBasPaint, snedstreckBild, byggTonYta …) och sidans egna paint-värden. Varje lager mäts för sig och alla tillsammans, FÖRE (lagren som de var i #1014:s
// första version) och EFTER (den här ändringen). Måttet är medelljus inne i trakten delat med medelljus > 50 m utanför: 1,00 = lika, över 1 = trakten ljusare.
// SKARPA_SKRIV=<mapp> sparar bilderna (läggs i PR-texten, aldrig i repot). Finns ingen Chromium hoppas mätningen över.
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
const SKRIV = process.env.SKARPA_SKRIV;
const fx = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'lib/__fixtures__/skalviken_2026-10-27.json'), 'utf8'));

function bunta(): string {
  const mapp = fs.mkdtempSync(path.join(os.tmpdir(), 'trakt-skarpa-'));
  const ingang = path.join(mapp, 'entry.ts');
  const filer = ['kartBas', 'sparStil', 'ytaStil', 'kartKlart', 'traktTon'].filter((f) => fs.existsSync(path.join(process.cwd(), 'lib', `${f}.ts`)));
  fs.writeFileSync(ingang, filer.map((f) => `export * from ${JSON.stringify(path.join(process.cwd(), 'lib', f))};`).join('\n'));
  const ut = path.join(mapp, 'lib.js');
  createRequire(import.meta.url)('esbuild').buildSync({ entryPoints: [ingang], bundle: true, format: 'iife', globalName: 'lib', outfile: ut, logLevel: 'error' });
  return ut;
}

export interface Rad { scen: string; ljusInne: number; ljusUte: number; kvot: number; mattInne: number; mattUte: number }
type Variant = 'fore' | 'efter';

async function mat(variant: Variant, zoomLage: 'fit' | 'oversikt', viewport: { width: number; height: number }): Promise<{ rader: Rad[]; vag: { fore: number; efter: number }; tonKoll: any }> {
  const b = await CHROMIUM!.launch({});
  try {
    const pg = await b.newPage({ viewport });
    await pg.setContent('<!doctype html><html><head><meta charset="utf-8"><style>html,body,#m{margin:0;height:100%}</style></head><body><div id="m"></div></body></html>');
    await pg.addScriptTag({ path: path.join(MAPLIBRE, 'maplibre-gl.js') });
    await pg.addScriptTag({ path: bunta() });
    const ut = await pg.evaluate(async (p: any) => {
      const L = (window as any).lib; const ml = (window as any).maplibregl;
      const lng = p.trakt.map((q: number[]) => q[0]), lat = p.trakt.map((q: number[]) => q[1]);
      const w = Math.min(...lng) - 0.012, e = Math.max(...lng) + 0.012, so = Math.min(...lat) - 0.007, no = Math.max(...lat) + 0.007;
      const cw = Math.min(...lng), ce = Math.max(...lng), cs = Math.min(...lat), cn = Math.max(...lat);
      let s = 4242; const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
      // ── syntetiskt flygfoto: samma skog överallt, plus en väg och några hus UTANFÖR trakten (för "vägar och hus ska synas") ──
      const W = 2048; const c = document.createElement('canvas'); c.width = W; c.height = W; const g = c.getContext('2d')!;
      g.fillStyle = '#2f4a22'; g.fillRect(0, 0, W, W);
      for (let i = 0; i < 60000; i++) { const t = rnd(); g.fillStyle = t < 0.5 ? '#3a5a2a' : t < 0.8 ? '#264019' : '#4d6b34'; g.fillRect(rnd() * W, rnd() * W, 3 + rnd() * 6, 3 + rnd() * 6); }
      const px = (lo: number) => ((lo - w) / (e - w)) * W, py = (la: number) => ((no - la) / (no - so)) * W;
      // vägen: ligger öster om trakten, ~120 m från gränsen; husen vid vägen
      g.strokeStyle = '#d9d2bd'; g.lineWidth = 9; g.beginPath(); g.moveTo(px(ce + 0.0035), py(cs - 0.002)); g.lineTo(px(ce + 0.0038), py(cn + 0.002)); g.stroke();
      g.fillStyle = '#e8e2d2'; for (const [dx, dy] of [[0.0044, 0.0003], [0.0046, 0.0009], [0.0042, -0.0006]]) g.fillRect(px(ce + dx), py((cs + cn) / 2 + dy), 16, 12);
      const map = new ml.Map({ container: 'm', center: [(cw + ce) / 2, (cs + cn) / 2], zoom: 15, fadeDuration: 0, canvasContextAttributes: { preserveDrawingBuffer: true }, attributionControl: false,
        style: { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#e8e8e8' } }] } });
      const kartfel: string[] = []; map.on('error', (ev: any) => kartfel.push(String(ev?.error?.message || ev?.message || ev)));
      await new Promise((r) => map.on('load', r));
      if (p.zoomLage === 'fit') map.fitBounds([[cw, cs], [ce, cn]], { padding: 40, animate: false }); else map.jumpTo({ center: [(cw + ce) / 2, (cs + cn) / 2], zoom: 14.6 });
      map.addSource('bas', { type: 'image', url: c.toDataURL(), coordinates: [[w, no], [e, no], [e, so], [w, so]] });
      map.addLayer({ id: 'satellite-layer', type: 'raster', source: 'bas', paint: L.kartBasPaint('satellite', 85) });

      const poly = (ring: number[][]) => ({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } });
      const lin = (coords: number[][], props: any = {}) => ({ type: 'Feature', properties: props, geometry: { type: 'LineString', coordinates: coords } });
      const fc = (features: any[]) => ({ type: 'FeatureCollection', features });
      const hide = 'none' as const;
      const grupper: Record<string, string[]> = {};
      const lagg = (grupp: string, spec: any) => { map.addLayer({ ...spec, layout: { ...(spec.layout || {}), visibility: hide } }); (grupper[grupp] ||= []).push(spec.id); };

      // 1) hänsyn: Vidas fem ytor (fill 0.18 i naturgrönt + snedstreck, sidans värden) + planerarens egen hänsynszon
      const nat = '#30d158';
      map.addSource('hansyn', { type: 'geojson', data: fc(p.hansyn.map(poly)) });
      const bild = L.snedstreckBild('natur'); map.addImage('snedstreck-natur', { width: bild.width, height: bild.height, data: new Uint8Array(bild.data.buffer) }, { pixelRatio: 2 });
      lagg('hansyn', { id: 'trakt-hansyn-fill', type: 'fill', source: 'hansyn', paint: { 'fill-color': nat, 'fill-opacity': 0.18 } });
      lagg('hansyn', { id: 'trakt-hansyn-hatch', type: 'fill', source: 'hansyn', paint: { 'fill-pattern': 'snedstreck-natur' } });
      // 2) traktdelens osynliga tappyta (röd 0,05)
      map.addSource('traktdel', { type: 'geojson', data: fc([poly(p.trakt)]) });
      lagg('traktfyll', { id: 'trakt-gr-fill', type: 'fill', source: 'traktdel', paint: { 'fill-color': '#ff453a', 'fill-opacity': 0.05 } });
      // 3) spår: skördarens två dagar (idag respektive 5 dagar gammalt) och skotarens
      map.addSource('spar', { type: 'geojson', data: fc([lin(p.skordare[0], { roll: 'skordare', alder: 4 }), lin(p.skordare[1], { roll: 'skordare', alder: 0 }), lin(p.skotare[0], { roll: 'skotare', alder: 1 })]) });
      const stil = (roll: string) => {
        if (p.variant === 'fore') {   // #1014:s första version (fast pixelbredd, mörk kant överallt)
          const bredd = roll === 'skordare' ? 3 : 2.5;
          const bl = (a: number, b2: number) => ['interpolate', ['linear'], ['coalesce', ['to-number', ['get', 'alder']], 0], 0, a, 14, b2];
          return { farg: roll === 'skordare' ? '#bf5af2' : '#64d2ff', bredd, op: bl(0.9, 0.45), kant: 'rgba(0,0,0,0.9)', kantB: bredd + 2, kantOp: bl(0.72, 0.36) };
        }
        const d = L.dampatSpar(roll, 'plan');
        return { farg: d.farg, bredd: d.bredd, op: d.opacitet, kant: d.kantFarg, kantB: d.kantBredd, kantOp: d.kantOpacitet };
      };
      for (const roll of ['skordare', 'skotare']) {
        const st = stil(roll);
        lagg('spar', { id: `planspar-${roll}-casing`, type: 'line', source: 'spar', filter: ['==', ['get', 'roll'], roll], paint: { 'line-color': st.kant, 'line-width': st.kantB, 'line-opacity': st.kantOp }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
        lagg('spar', { id: `planspar-${roll}-line`, type: 'line', source: 'spar', filter: ['==', ['get', 'roll'], roll], paint: { 'line-color': st.farg, 'line-width': st.bredd, 'line-opacity': st.op }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
      }
      // 4) skotad yta (grå yta ur kartKlart). OBS: Skälviken har INGA skotning_uttag i prod — raden är HYPOTETISK (en skotad yta över västra halvan) och visar bara vad lagret hade gjort.
      const mitt = (cw + ce) / 2;
      const vast = [[cw, cs], [mitt, cs], [mitt, cn], [cw, cn], [cw, cs]];
      map.addSource('klart', { type: 'geojson', data: fc([poly(vast)]) });
      if (p.variant === 'fore') {
        lagg('klart', { id: 'klart-yta-fill', type: 'fill', source: 'klart', paint: { 'fill-color': '#8e8e93', 'fill-opacity': 0.16 } });
        lagg('klart', { id: 'klart-yta-line', type: 'line', source: 'klart', paint: { 'line-color': '#8e8e93', 'line-width': 1.5, 'line-opacity': 0.55 } });
      } else {
        if (L.KLART_YTA_FYLLNING > 0) lagg('klart', { id: 'klart-yta-fill', type: 'fill', source: 'klart', paint: { 'fill-color': L.KLART_FARG, 'fill-opacity': L.KLART_YTA_FYLLNING } });
        lagg('klart', { id: 'klart-yta-line', type: 'line', source: 'klart', paint: { 'line-color': L.KLART_FARG, 'line-width': L.KLART_YTA_KANT_BREDD ?? 1.5, 'line-opacity': L.KLART_YTA_KANT_OPACITET } });
      }
      // 5) nedtoning utanför trakten (bara EFTER)
      if (p.variant === 'efter' && L.byggTonYta) {
        map.addSource('ton', { type: 'geojson', data: L.byggTonYta([[p.trakt]]) });
        // ligger precis över bakgrunden, under allt annat (som lib/lagerOrdning)
        map.addLayer({ id: 'trakt-utanfor-ton', type: 'fill', source: 'ton', paint: { 'fill-color': L.UTANFOR_TON_FARG, 'fill-opacity': L.UTANFOR_TON_OPACITET, 'fill-antialias': false }, layout: { visibility: hide } }, 'trakt-hansyn-fill');
        grupper.ton = ['trakt-utanfor-ton'];
      }

      const idle = () => new Promise((r) => { map.once('idle', r); map.triggerRepaint(); });
      const visa = (grupp: string[]) => { for (const gr of Object.values(grupper)) for (const id of gr) map.setLayoutProperty(id, 'visibility', grupp.some((x) => grupper[x]?.includes(id)) ? 'visible' : 'none'); };

      // ── masker: inne i trakten / mer än 50 m utanför (meter i lokalt plan) ──
      const lat0 = (cs + cn) / 2, kx = 111320 * Math.cos((lat0 * Math.PI) / 180), ky = 111320;
      const ring = p.trakt.map((q: number[]) => [(q[0] - cw) * kx, (q[1] - cs) * ky]);
      const inne = (x: number, y: number) => { let r = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) r = !r; } return r; };
      const avst = (x: number, y: number) => { let m = Infinity; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [ax, ay] = ring[j], [bx, by] = ring[i]; const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy; const t = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0; m = Math.min(m, Math.hypot(x - (ax + t * dx), y - (ay + t * dy))); } return m; };
      const avlasning = () => {
        const cv = map.getCanvas(); const o = document.createElement('canvas'); o.width = cv.width; o.height = cv.height; const x = o.getContext('2d')!; x.drawImage(cv, 0, 0);
        return { x, f: o.width / cv.clientWidth, W: cv.clientWidth, H: cv.clientHeight };
      };
      let samp: Array<[number, number]> = [];
      const matt = (): { ljusInne: number; ljusUte: number; mattInne: number; mattUte: number } => {
        samp = [];
        const { x, f, W: bw, H: bh } = avlasning(); const img = x.getImageData(0, 0, Math.round(bw * f), Math.round(bh * f)); const d = img.data;
        let li = 0, ni = 0, mi = 0, lu = 0, nu = 0, mu = 0;
        for (let sy = 2; sy < bh; sy += 3) for (let sx = 2; sx < bw; sx += 3) {
          const ll = map.unproject([sx, sy]); const mx = (ll.lng - cw) * kx, my = (ll.lat - cs) * ky;
          const i = (Math.round(sy * f) * img.width + Math.round(sx * f)) * 4; const r = d[i], gg = d[i + 1], bb = d[i + 2];
          const lj = (0.2126 * r + 0.7152 * gg + 0.0722 * bb) / 255, mt = (Math.max(r, gg, bb) - Math.min(r, gg, bb)) / 255;
          if (inne(mx, my)) { li += lj; mi += mt; ni++; samp.push([0, lj]); }
          else if (avst(mx, my) > 60) { lu += lj; mu += mt; nu++; samp.push([2, lj]); }   // 60 m: lite marginal utanför 50 m-gränsen
          else if (avst(mx, my) < 40) samp.push([1, lj]);   // kanten: utanför trakten men inom 40 m — ska vara orörd
        }
        return { ljusInne: li / Math.max(1, ni), ljusUte: lu / Math.max(1, nu), mattInne: mi / Math.max(1, ni), mattUte: mu / Math.max(1, nu) };
      };

      const rader: any[] = []; const samplingar: Record<string, Array<[number, number]>> = {};
      const scen: Array<[string, string[]]> = [['bas', []], ['hansyn', ['hansyn']], ['traktfyll', ['traktfyll']], ['spar', ['spar']], ['skotad-yta (hypotetisk)', ['klart']], ['alla lager', ['hansyn', 'traktfyll', 'spar', 'klart']]];
      if (p.variant === 'efter') scen.push(['bara nedtoning', ['ton']], ['alla lager + nedtoning', ['hansyn', 'traktfyll', 'spar', 'klart', 'ton']]);
      const bilder: Record<string, string> = {};
      for (const [namn, lag] of scen) {
        visa(lag); await idle();
        const m = matt(); rader.push({ scen: namn, ...m, kvot: m.ljusInne / m.ljusUte }); samplingar[namn] = samp;
        bilder[namn] = map.getCanvas().toDataURL('image/png');
      }
      // vägens kontrast mot sin omgivning utanför trakten (vägar och hus ska synas): vägpixel mot skogspixel bredvid, utan och med nedtoningen
      const vagKontrast = async (lag: string[]) => {
        visa(lag); await idle(); const { x, f } = avlasning();
        const pVag = map.project([ce + 0.00365, (cs + cn) / 2]), pSkog = map.project([ce + 0.0031, (cs + cn) / 2]);
        const rd = (q: any) => x.getImageData(Math.round(q.x * f), Math.round(q.y * f), 1, 1).data;
        const a = rd(pVag), b2 = rd(pSkog); return Math.hypot(a[0] - b2[0], a[1] - b2[1], a[2] - b2[2]);
      };
      const vag = { fore: await vagKontrast([]), efter: grupper.ton ? await vagKontrast(['ton']) : -1 };
      // pixel för pixel: bara nedtoning mot bara bakgrund — orörd inne och i 40 m-kanten, ca 25 % mörkare längre ut, aldrig svart
      let tonKoll: any = null;
      if (samplingar['bara nedtoning'] && samplingar.bas) {
        const a = samplingar.bas, b2 = samplingar['bara nedtoning']; const kv: Record<number, number[]> = { 0: [], 1: [], 2: [] };
        a.forEach(([k, l], i) => { if (l > 0.02 && b2[i] && b2[i][0] === k) kv[k].push(b2[i][1] / l); });
        const mm = (x: number[]) => ({ min: Math.min(...x), max: Math.max(...x), medel: x.reduce((u, v) => u + v, 0) / Math.max(1, x.length), n: x.length });
        tonKoll = { inne: mm(kv[0]), kant: mm(kv[1]), ute: mm(kv[2]) };
      }
      return { rader, vag, bilder, kartfel, tonKoll };
    }, { variant, zoomLage, trakt: fx.trakt, hansyn: fx.hansyn, skordare: fx.skordare, skotare: fx.skotare });
    if (SKRIV) {
      fs.mkdirSync(SKRIV, { recursive: true });
      for (const [namn, url] of Object.entries(ut.bilder as Record<string, string>)) fs.writeFileSync(path.join(SKRIV, `${variant}-${zoomLage}-${viewport.width}-${namn.replace(/[^a-z0-9]+/gi, '_')}.png`), Buffer.from(url.split(',')[1], 'base64'));
      fs.writeFileSync(path.join(SKRIV, `rapport-${variant}-${zoomLage}-${viewport.width}.json`), JSON.stringify({ rader: ut.rader, vag: ut.vag, tonKoll: ut.tonKoll }, null, 2));
    }
    if ((ut.kartfel as string[]).length) throw new Error(`MapLibre-fel: ${(ut.kartfel as string[]).slice(0, 5).join(' | ')}`);
    return { rader: ut.rader, vag: ut.vag, tonKoll: ut.tonKoll };
  } finally { await b.close(); }
}

export const SCENER = [{ zoomLage: 'fit' as const, viewport: { width: 760, height: 520 } }, { zoomLage: 'oversikt' as const, viewport: { width: 760, height: 520 } }, { zoomLage: 'fit' as const, viewport: { width: 390, height: 844 } }];

describe.skipIf(!CHROMIUM)('Skälviken — trakten ska vara ljusare än omgivningen', () => {
  for (const sc of SCENER) {
    const namn = `${sc.zoomLage} ${sc.viewport.width}px`;
    describe(namn, () => {
      let fore: Rad[] = [], efter: Rad[] = [], vag = { fore: 0, efter: 0 }, tonKoll: any = null;
      it('mätningen körs (före och efter)', async () => {
        fore = (await mat('fore', sc.zoomLage, sc.viewport)).rader;
        const e = await mat('efter', sc.zoomLage, sc.viewport); efter = e.rader; vag = e.vag; tonKoll = e.tonKoll;
        // eslint-disable-next-line no-console
        console.log(`\n${namn}\n` + [...fore.map((r) => `  FÖRE  ${r.scen.padEnd(28)} inne ${r.ljusInne.toFixed(3)} ute ${r.ljusUte.toFixed(3)} kvot ${r.kvot.toFixed(3)}  färg inne ${r.mattInne.toFixed(3)} ute ${r.mattUte.toFixed(3)}`), ...efter.map((r) => `  EFTER ${r.scen.padEnd(28)} inne ${r.ljusInne.toFixed(3)} ute ${r.ljusUte.toFixed(3)} kvot ${r.kvot.toFixed(3)}  färg inne ${r.mattInne.toFixed(3)} ute ${r.mattUte.toFixed(3)}`)].join('\n') + `\n  väg mot skog: ${vag.fore.toFixed(1)} → ${vag.efter.toFixed(1)}\n  ton/bas per pixel — inne min ${tonKoll.inne.min.toFixed(3)} · kant min ${tonKoll.kant.min.toFixed(3)} (n ${tonKoll.kant.n}) · ute min ${tonKoll.ute.min.toFixed(3)} medel ${tonKoll.ute.medel.toFixed(3)} max ${tonKoll.ute.max.toFixed(3)} (n ${tonKoll.ute.n})`);
        expect(fore.length).toBeGreaterThan(5);
      }, 240000);
      const rad = (l: Rad[], s: string) => l.find((r) => r.scen === s)!;
      it('inget enskilt lager gör trakten mörkare än skogen utanför (kvot ≥ 0,97 för varje lager för sig, EFTER)', () => {
        for (const s of ['bas', 'hansyn', 'traktfyll', 'spar', 'skotad-yta (hypotetisk)']) expect(rad(efter, s).kvot, `${namn} ${s}`).toBeGreaterThanOrEqual(0.97);
      });
      it('med alla lager är trakten ljusare än omgivningen (kvot ≥ 1,3 med nedtoningen)', () => {
        expect(rad(efter, 'alla lager + nedtoning').kvot, namn).toBeGreaterThanOrEqual(1.3);
      });
      it('nedtoningen utanför är ca 25 % mörkare (kvot 1/0,75 = 1,33 ±0,05 på ren bakgrund) och lämnar trakten orörd', () => {
        const bas = rad(efter, 'bas'), ton = rad(efter, 'bara nedtoning');
        expect(ton.ljusInne / bas.ljusInne, namn).toBeCloseTo(1, 2);
        expect(ton.ljusUte / bas.ljusUte, namn).toBeGreaterThan(0.72);
        expect(ton.ljusUte / bas.ljusUte, namn).toBeLessThan(0.78);
      });
      it('vägar och hus utanför syns fortfarande: vägens kontrast mot skogen sjunker högst 30 % (när vägen ligger i bild)', () => {
        expect(vag.efter, namn).toBeGreaterThanOrEqual(vag.fore * 0.7);
      });
      it('pixel för pixel: inne i trakten och i 40 m-kanten är bilden helt orörd, längre ut är den 25 % mörkare — aldrig svart', () => {
        expect(tonKoll.inne.min, `${namn} inne`).toBeGreaterThanOrEqual(0.995);
        if (tonKoll.kant.n > 20) expect(tonKoll.kant.min, `${namn} kant`).toBeGreaterThanOrEqual(0.995);
        if (tonKoll.ute.n > 20) {
          expect(tonKoll.ute.min, `${namn} ute`).toBeGreaterThanOrEqual(0.7);
          expect(tonKoll.ute.max, `${namn} ute`).toBeLessThanOrEqual(0.8);
          expect(tonKoll.ute.medel, `${namn} ute`).toBeGreaterThan(0.73);
          expect(tonKoll.ute.medel, `${namn} ute`).toBeLessThan(0.77);
        }
      });
    });
  }
});
