// @vitest-environment node
// VIKTIGT-ETIKETTEN I RIKTIG CHROMIUM + MAPLIBRE (Martin 2026-11-23): raden står som gul text vid ytan/symbolen på kartan i körvyn, överlever kollision med annat och ritas av
// sidans EGET lager (lib/viktigtEtikett) — samma kod som i appen, buntad med esbuild. Pixlarna mäts: gul text finns där etiketten ska stå, och är borta när Viktigt tas bort.
// VIKTIGT_SKRIV=<mapp> sparar bilderna. Finns ingen Chromium hoppas testet över (utom med KRAV_CHROMIUM=1).
import path from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';
import { hittaChromium, KARTA_ARGS } from './testStod/chromium';

const CHROMIUM = hittaChromium(KARTA_ARGS);
const MAPLIBRE = path.join(process.cwd(), 'node_modules/maplibre-gl/dist');
const ORIGIN = 'https://viktigt.invalid';
const SKRIV = process.env.VIKTIGT_SKRIV;

async function bunta(): Promise<string> {
  const r = await build({
    stdin: { contents: `import * as V from './lib/viktigtEtikett'; import * as LO from './lib/lagerOrdning'; window.VIKTIGT = { V, LO };`, resolveDir: process.cwd(), loader: 'ts' },
    bundle: true, write: false, format: 'iife', platform: 'browser', logLevel: 'silent',
  });
  return r.outputFiles[0].text;
}

describe.skipIf(!CHROMIUM)('Viktigt-etiketten på kartan — riktig Chromium + MapLibre', () => {
  it('gul text vid ytan och vid symbolen på flera zoomnivåer, aldrig nedtonad, båda syns även när de ligger över varandra, borta utan Viktigt', async () => {
    const lib = await bunta();
    const b = await CHROMIUM!.launch({});
    try {
      const ctx = await b.newContext({ viewport: { width: 700, height: 600 } });
      const pg = await ctx.newPage();
      await pg.route(`${ORIGIN}/**`, (rt: any) => rt.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><head><meta charset="utf-8"><style>html,body,#m{margin:0;height:100%}</style></head><body><div id="m"></div></body></html>' }));
      await pg.goto(`${ORIGIN}/`);
      await pg.addStyleTag({ path: path.join(MAPLIBRE, 'maplibre-gl.css') });
      await pg.addScriptTag({ path: path.join(MAPLIBRE, 'maplibre-gl.js') });
      await pg.addScriptTag({ content: lib });

      const gulaPixlar = async (zoom: number, med: boolean): Promise<{ gul: number; renderade: number; bild: string }> => pg.evaluate(async (arg: any) => {
        const W = window as any; const { V, LO } = W.VIKTIGT;
        document.getElementById('m')!.innerHTML = '';
        const map = new W.maplibregl.Map({ container: 'm', center: [15.0, 57.0], zoom: arg.zoom, fadeDuration: 0, preserveDrawingBuffer: true, attributionControl: false,
          style: { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#3d4a2c' } }] } });
        await new Promise((r) => map.on('load', r));
        const rektangel = (lon: number, lat: number, dx: number, dy: number) => [[[lon - dx, lat - dy], [lon + dx, lat - dy], [lon + dx, lat + dy], [lon - dx, lat + dy], [lon - dx, lat - dy]]];
        // En hänsynsyta (Vida, nyckel hansyn:1) mitt på kartan och en egen symbol (marker:7) 30 m norr om den, och en andra symbol rakt över den första (kollision).
        const vida = { features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: rektangel(15.0, 57.0, 0.0012, 0.0006) }, properties: { _lager: 'L_TILLAGGSYTOR', _typ: 'hänsynsyta', LOPNR: '1' } }] };
        const viktigt = new Map<string, string>(arg.med ? [['hansyn:1', 'Kör inte över bäcken'], ['marker:7', 'Skarpt stup här'], ['marker:8', 'Stängsel']] : []);
        const fc = V.viktigtPunkter({ viktigt, symboler: [{ id: 7, lng: 15.0, lat: 57.0003 }, { id: 8, lng: 15.0, lat: 57.00031 }], egna: [], vida });
        map.addSource(V.VIKTIGT_KALLA, { type: 'geojson', data: fc });
        map.addLayer(V.viktigtLager());
        LO.installeraLagerOrdning(map);
        await new Promise((r) => { map.once('render', () => map.once('idle', r)); map.triggerRepaint(); });
        map.redraw();
        const c = map.getCanvas();
        const k = document.createElement('canvas'); k.width = c.width; k.height = c.height;
        const g = k.getContext('2d')!; g.drawImage(c, 0, 0);
        const d = g.getImageData(0, 0, k.width, k.height).data;
        let gul = 0;
        for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - 255) < 24 && Math.abs(d[i + 1] - 214) < 24 && d[i + 2] < 60) gul++;
        const renderade = map.queryRenderedFeatures({ layers: [V.VIKTIGT_LAGER] }).length;
        return { gul, renderade, bild: k.toDataURL('image/png') };
      }, { zoom, med });

      if (SKRIV) mkdirSync(SKRIV, { recursive: true });
      for (const zoom of [15, 17]) {
        const r = await gulaPixlar(zoom, true);
        if (SKRIV) writeFileSync(path.join(SKRIV, `viktigt-etikett-z${zoom}.png`), Buffer.from(r.bild.split(',')[1], 'base64'));
        expect(r.gul, `gul text syns vid zoom ${zoom}`).toBeGreaterThan(150);
        expect(r.renderade, `alla tre etiketter ritas vid zoom ${zoom}, också de som ligger över varandra`).toBeGreaterThanOrEqual(3);
      }
      const utan = await gulaPixlar(16, false);
      expect(utan.gul, 'utan Viktigt finns ingen gul text').toBe(0);
      expect(utan.renderade).toBe(0);
    } finally { await b.close(); }
  }, 120000);
});
