// Flygfotots rutstorlek: 512 bara på skärmar med hög upplösning, och exakt dagens adress på alla andra (maskindatorerna får ingen ny trafik).
import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { FLYGFOTO_MALL, FLYGFOTO_MALL_RETINA, RETINA_FRAN_DPR, arRetina, flygfotoMall, rutVarianter, skarmDpr, utanRutstorlek } from './flygfotoRuta';

const las = (f: string) => fs.readFileSync(path.resolve(__dirname, '..', f), 'utf8');

describe('flygfotoMall', () => {
  it('DPR 1 och Windows-skalning (1,25) får EXAKT adressen som alltid gällt — ingen mer trafik på maskindatorerna', () => {
    expect(FLYGFOTO_MALL).toBe('/api/forarkarta?layer=ortofoto&z={z}&x={x}&y={y}');
    for (const d of [1, 1.1, 1.25, 1.49]) { expect(flygfotoMall(d), `${d}`).toBe('/api/forarkarta?layer=ortofoto&z={z}&x={x}&y={y}'); expect(arRetina(d)).toBe(false); }
  });
  it('telefon, surfplatta och Mac (DPR 1,5 och uppåt) får 512', () => {
    expect(RETINA_FRAN_DPR).toBe(1.5);
    for (const d of [1.5, 2, 2.625, 3]) { expect(flygfotoMall(d), `${d}`).toBe('/api/forarkarta?layer=ortofoto&z={z}&x={x}&y={y}&s=512'); expect(arRetina(d)).toBe(true); }
    expect(FLYGFOTO_MALL_RETINA.startsWith(FLYGFOTO_MALL)).toBe(true);
  });
  it('skräp ger en vanlig ruta, och utan fönster (server) är DPR 1', () => {
    for (const d of [Number.NaN, 0, -2, Infinity]) expect(arRetina(d), `${d}`).toBe(false);
    expect(flygfotoMall(Number.NaN)).toBe(FLYGFOTO_MALL);
    expect(skarmDpr()).toBeGreaterThan(0);
  });
});

describe('vakter: kartans källa är fortfarande 256 med maxzoom 18, och alla ställen delar mallen', () => {
  it('planeringsvyn och kartan utan objekt: tileSize 256, maxzoom 18, flygfotoMall()', () => {
    const sida = las('app/planering/page.tsx'), tom = las('lib/objektKarta.ts');
    expect(sida).toMatch(/satellite: \{\s*type: 'raster' as const,\s*tiles: \[flygfotoMall\(\)\][^\n]*\n\s*tileSize: 256,\s*maxzoom: 18,/);
    expect(tom).toMatch(/satellite: \{ type: 'raster' as const, tiles: \[flygfotoMall\(\)\], tileSize: 256, maxzoom: 18,/);
  });
  it('ingen annan fil än mallen skriver flygfotots adress för hand (nedladdningen och kartan måste hålla ihop)', () => {
    for (const f of ['app/planering/page.tsx', 'lib/objektKarta.ts']) expect(las(f), f).not.toContain("layer=ortofoto&z={z}");
  });
});

describe('256-varianten av en 512-adress (offlinekartor sparade före uppdateringen)', () => {
  const r512 = '/api/forarkarta?layer=ortofoto&z=17&x=1&y=2&s=512', r256 = '/api/forarkarta?layer=ortofoto&z=17&x=1&y=2';
  it('512 → 256 är exakt adressen en gammal nedladdning sparade; allt annat är oförändrat', () => {
    expect(utanRutstorlek(r512)).toBe(r256);
    expect(utanRutstorlek(FLYGFOTO_MALL_RETINA)).toBe(FLYGFOTO_MALL);
    for (const u of [r256, '/api/forarkarta?z=17&x=1&y=2', '/api/forarkarta?layer=ortofoto&z=17&x=1&y=2&s=5123', 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/15/1/2.png']) expect(utanRutstorlek(u), u).toBe(u);
    expect(rutVarianter(r512)).toEqual([r512, r256]); expect(rutVarianter(r256)).toEqual([r256]);
  });
});
