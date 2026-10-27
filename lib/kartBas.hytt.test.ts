// @vitest-environment node
// BAKGRUNDEN TONAS NER PÅ RIKTIGT — mätt i riktig Chromium + MapLibre (jsdom kan inte rita). En bild med vitt (åker/vägkant) och en mättad röd ruta ritas genom
// varje bakgrundslagers paint ur lib/kartBas; vitt ska bli grått (ljusast ≤ 80 % av 255) och den röda ska ha tappat minst en tredjedel av sin färgspridning.
// Utan Chromium hoppas mätningen över.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { KARTBAS_PAINT, kartBasPaint } from './kartBas';
import { KARTLAGER } from './kartlager';

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

async function mat(paint: Record<string, number> | null): Promise<{ vitt: number[]; rod: number[] }> {
  const b = await CHROMIUM!.launch({});
  try {
    const pg = await b.newPage({ viewport: { width: 300, height: 200 } });
    await pg.setContent('<!doctype html><html><head><meta charset="utf-8"><style>html,body,#m{margin:0;height:100%}</style></head><body><div id="m"></div></body></html>');
    await pg.addScriptTag({ path: path.join(MAPLIBRE, 'maplibre-gl.js') });
    return await pg.evaluate(async (p: any) => {
      const c = document.createElement('canvas'); c.width = 64; c.height = 32; const g = c.getContext('2d')!;
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, 32, 32); g.fillStyle = 'rgb(200,60,50)'; g.fillRect(32, 0, 32, 32);
      const map = new (window as any).maplibregl.Map({ container: 'm', center: [0, 0], zoom: 2, fadeDuration: 0, preserveDrawingBuffer: true, attributionControl: false,
        style: { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#000' } }] } });
      await new Promise((r) => map.on('load', r));
      map.addSource('f', { type: 'image', url: c.toDataURL(), coordinates: [[-30, 10], [30, 10], [30, -10], [-30, -10]] });
      map.addLayer({ id: 'r', type: 'raster', source: 'f', paint: { ...(p ?? {}), 'raster-fade-duration': 0, 'raster-resampling': 'nearest' } });
      await new Promise((r) => { map.once('idle', r); map.triggerRepaint(); });
      const o = document.createElement('canvas'); o.width = map.getCanvas().width; o.height = map.getCanvas().height; const x = o.getContext('2d')!; x.drawImage(map.getCanvas(), 0, 0);
      const at = (lng: number) => { const q = map.project([lng, 0]); const d = x.getImageData(Math.round(q.x * (o.width / map.getCanvas().clientWidth)), Math.round(q.y * (o.height / map.getCanvas().clientHeight)), 1, 1).data; return [d[0], d[1], d[2]]; };
      return { vitt: at(-15), rod: at(15) };
    }, paint);
  } finally { await b.close(); }
}
const spridning = (p: number[]) => Math.max(...p) - Math.min(...p);

describe.skipIf(!CHROMIUM)('kartBasPaint i riktig MapLibre — Dämpad (0) tonar ned, standard (85) är nästan orört, Skarp (100) är orört', () => {
  it('orört: vitt är vitt och röd är röd (mätningen har tänder)', async () => {
    const m = await mat(null);
    expect(Math.max(...m.vitt)).toBeGreaterThan(240);
    expect(spridning(m.rod)).toBeGreaterThan(120);
  }, 90000);
  for (const lager of KARTLAGER) {
    it(`${lager}: Dämpad — ljusast ≤ 80 % och färgspridningen minst en tredjedel mindre`, async () => {
      const ref = await mat(null);
      const m = await mat(kartBasPaint(lager, 0));
      expect(Math.max(...m.vitt), `${lager} vitt blev ${m.vitt}`).toBeLessThanOrEqual(255 * 0.8);
      expect(spridning(m.rod), `${lager} röd blev ${m.rod}`).toBeLessThan(spridning(ref.rod) * (2 / 3));
    }, 90000);
  }
  for (const lager of KARTLAGER) {
    it(`${lager}: standard (85) behåller nästan all ljus och färg (≥ 85 %) — inte grått; Skarp (100) är orörd bild`, async () => {
      const ref = await mat(null);
      const std = await mat(KARTBAS_PAINT[lager]);
      const skarp = await mat(kartBasPaint(lager, 100));
      expect(Math.max(...std.vitt), `${lager} vitt blev ${std.vitt}`).toBeGreaterThanOrEqual(255 * 0.85);
      expect(spridning(std.rod), `${lager} röd blev ${std.rod}`).toBeGreaterThanOrEqual(spridning(ref.rod) * 0.85);
      expect(skarp.vitt).toEqual(ref.vitt); expect(skarp.rod).toEqual(ref.rod);
    }, 90000);
  }
});
