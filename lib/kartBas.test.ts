// Bakgrundskartan är nedtonad för ALLA fyra lager, från EN källa (lib/kartBas) — planeringsvyns stil och kartan utan valt objekt läser samma värden.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { KARTBAS_PAINT, kartBasPaint } from './kartBas';
import { KARTLAGER, KARTLAGER_LAGER_ID } from './kartlager';
import { tomKartaStil } from './objektKarta';

const lasa = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

describe('KARTBAS_PAINT — mörkare och gråare, alla lager', () => {
  it('varje bakgrundslager är dämpat: ljuset ner (vitt blir högst 80 % ljust) och färgen ner (mättnad högst −0,4)', () => {
    for (const lager of KARTLAGER) {
      const p = KARTBAS_PAINT[lager];
      expect(p['raster-brightness-max'], `${lager} ljus`).toBeLessThanOrEqual(0.8);
      expect(p['raster-brightness-max'], `${lager} ljus`).toBeGreaterThan(0.3);   // inte så mörkt att kartan inte går att läsa
      expect(p['raster-saturation'], `${lager} färg`).toBeLessThanOrEqual(-0.4);
    }
  });
  it('Topokarta och OpenStreetMap — förut orörda — är med, inte bara Flygfoto och Karta', () => {
    expect(KARTBAS_PAINT.terrain['raster-brightness-max']).toBeLessThan(1);
    expect(KARTBAS_PAINT.osm['raster-brightness-max']).toBeLessThan(1);
  });
  it('Flygfotot är mörkast: ortofotot har de ljusaste ytorna (åker, hygge, grusväg) där en gul linje annars försvinner', () => {
    const ljus = (l: (typeof KARTLAGER)[number]) => KARTBAS_PAINT[l]['raster-brightness-max'];
    for (const l of KARTLAGER) if (l !== 'satellite') expect(ljus('satellite')).toBeLessThan(ljus(l));
  });
  it('Flygfotot har ungefär halva ljusstyrkan och är tydligt avmättat (Martin 2026-10-25)', () => {
    const p = KARTBAS_PAINT.satellite;
    expect(p['raster-brightness-max']).toBeGreaterThanOrEqual(0.45);
    expect(p['raster-brightness-max']).toBeLessThanOrEqual(0.55);
    expect(p['raster-saturation']).toBeLessThanOrEqual(-0.55);
  });
  it('kartBasPaint ger en kopia (ingen kan ändra konstanten av misstag)', () => {
    const k = kartBasPaint('satellite'); k['raster-brightness-max'] = 1;
    expect(KARTBAS_PAINT.satellite['raster-brightness-max']).toBeLessThan(1);
  });
});

describe('kartan utan valt objekt (tomKartaStil) har samma nedtoning som planeringsvyn', () => {
  for (const lager of KARTLAGER) {
    it(`${lager}: lagrets paint = KARTBAS_PAINT`, () => {
      const bas: any = tomKartaStil(lager).layers.find((l: any) => l.id === KARTLAGER_LAGER_ID[lager]);
      expect(bas.paint).toEqual(KARTBAS_PAINT[lager]);
    });
  }
});

describe('page.tsx tar baslagrens paint ur lib/kartBas (ingen egen kopia av siffrorna)', () => {
  const sida = lasa('app/planering/page.tsx');
  it('alla fyra baslager i mapStyleConfig använder kartBasPaint', () => {
    for (const [id, nyckel] of [['osm-layer', 'osm'], ['satellite-layer', 'satellite'], ['lm-layer', 'lantmateriet'], ['terrain-layer', 'terrain']]) {
      expect(sida, id).toMatch(new RegExp(`id: '${id}'[^\\n]*paint: kartBasPaint\\('${nyckel}'\\)`));
    }
  });
  it('de gamla bokstavliga värdena finns inte kvar i baslagren', () => {
    expect(sida).not.toMatch(/id: 'satellite-layer'[^\n]*'raster-brightness-max': 0\.7/);
    expect(sida).not.toMatch(/id: 'lm-layer'[^\n]*'raster-saturation': -0\.45/);
  });
});
