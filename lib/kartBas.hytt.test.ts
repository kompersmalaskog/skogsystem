// @vitest-environment node
// BAKGRUNDEN TONAS NER PÅ RIKTIGT — mätt i riktig Chromium + MapLibre (jsdom kan inte rita). En bild med vitt (åker/vägkant) och en mättad röd ruta ritas genom
// varje bakgrundslagers paint ur lib/kartBas; vitt ska bli grått (ljusast ≤ 80 % av 255) och den röda ska ha tappat minst en tredjedel av sin färgspridning.
// Utan Chromium hoppas mätningen över.
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { KARTBAS_PAINT, kartBasPaint } from './kartBas';
import { KARTLAGER } from './kartlager';
import { hittaChromium, KARTA_ARGS } from './testStod/chromium';

const chromium = () => hittaChromium(KARTA_ARGS);
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
  // Mörk (#1121) är mörk med flit, också i Skarp ("reglaget avgör hur mycket av skogen som syns, aldrig en ljus karta"): den prövas för sig.
  it('mork: mörk i alla lägen — Skarp högst hälften av ljuset, standard mörkare än orört, Dämpad mörkast', async () => {
    const ref = await mat(null);
    const std = await mat(KARTBAS_PAINT.mork), skarp = await mat(kartBasPaint('mork', 100)), dampad = await mat(kartBasPaint('mork', 0));
    expect(Math.max(...skarp.vitt), `skarp vitt ${skarp.vitt}`).toBeLessThanOrEqual(255 * 0.5);
    expect(Math.max(...std.vitt)).toBeLessThan(Math.max(...ref.vitt));
    expect(Math.max(...dampad.vitt)).toBeLessThan(Math.max(...std.vitt));
  }, 90000);
  for (const lager of KARTLAGER.filter((l) => l !== 'mork')) {
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
