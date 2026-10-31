// Bakgrundskartan: EN källa (lib/kartBas) med två ändpunkter — Dämpad (Kartan lugnare, #963) och Skarp (ingen nedtoning) — och ett reglage däremellan (standard 85).
// Planeringsvyns stil, reglage-effekten och kartan utan valt objekt läser samma värden.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { KARTBAS_DAMPAD, KARTBAS_PAINT, KARTBAS_SKARP, KARTBAS_STANDARD_STYRKA, kartBasPaint } from './kartBas';
import { KARTLAGER, KARTLAGER_LAGER_ID, RASTER_KARTLAGER } from './kartlager';
import { tomKartaStil } from './objektKarta';

const lasa = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

describe('Dämpad (0) = nivån från Kartan lugnare: mörkare och gråare, alla lager', () => {
  it('varje bakgrundslager är dämpat: ljuset ner (vitt blir högst 80 % ljust) och färgen ner (mättnad högst −0,4)', () => {
    for (const lager of KARTLAGER) {
      const p = kartBasPaint(lager, 0);
      expect(p, lager).toEqual(KARTBAS_DAMPAD[lager]);
      expect(p['raster-brightness-max'], `${lager} ljus`).toBeLessThanOrEqual(0.8);
      expect(p['raster-brightness-max'], `${lager} ljus`).toBeGreaterThan(0.3);
      expect(p['raster-saturation'], `${lager} färg`).toBeLessThanOrEqual(-0.4);
    }
  });
  it('Flygfotot är mörkast: ortofotot har de ljusaste ytorna (åker, hygge, grusväg) där en gul linje annars försvinner', () => {
    const ljus = (l: (typeof KARTLAGER)[number]) => kartBasPaint(l, 0)['raster-brightness-max'];
    for (const l of KARTLAGER) if (l !== 'satellite') expect(ljus('satellite')).toBeLessThan(ljus(l));
    expect(ljus('satellite')).toBeGreaterThanOrEqual(0.45); expect(ljus('satellite')).toBeLessThanOrEqual(0.55);
  });
});

describe('Skarp (100) = ingen nedtoning alls', () => {
  it('ljus 1, mättnad 0, kontrast 0 (och full opacitet där Dämpad har en lägre)', () => {
    for (const lager of KARTLAGER) {
      const p = kartBasPaint(lager, 100);
      expect(p, lager).toEqual(KARTBAS_SKARP[lager]);
      expect(p['raster-brightness-max']).toBe(1); expect(p['raster-saturation']).toBe(0); expect(p['raster-contrast']).toBe(0);
      if ('raster-opacity' in p) expect(p['raster-opacity']).toBe(1);
    }
  });
  it('Dämpad och Skarp har samma nycklar (varje egenskap kan interpoleras)', () => {
    for (const l of KARTLAGER) expect(Object.keys(KARTBAS_SKARP[l]).sort()).toEqual(Object.keys(KARTBAS_DAMPAD[l]).sort());
  });
});

describe('standarden (85) — Martin 2026-10-27: tydligare, inte grått', () => {
  it('standardstyrkan är 85 och KARTBAS_PAINT är det som gäller utan eget val', () => {
    expect(KARTBAS_STANDARD_STYRKA).toBe(85);
    for (const l of KARTLAGER) expect(KARTBAS_PAINT[l]).toEqual(kartBasPaint(l));
  });
  it('Flygfoto: ljus ~0,9 och mättnad ~−0,1', () => {
    const p = KARTBAS_PAINT.satellite;
    expect(p['raster-brightness-max']).toBeGreaterThanOrEqual(0.88); expect(p['raster-brightness-max']).toBeLessThanOrEqual(0.95);
    expect(p['raster-saturation']).toBeGreaterThanOrEqual(-0.15); expect(p['raster-saturation']).toBeLessThanOrEqual(-0.05);
  });
  it('Karta, Topokarta och OpenStreetMap: ljus ~0,95 och mättnad nära 0', () => {
    for (const l of ['lantmateriet', 'terrain', 'osm'] as const) {
      const p = KARTBAS_PAINT[l];
      expect(p['raster-brightness-max'], l).toBeGreaterThanOrEqual(0.93); expect(p['raster-brightness-max'], l).toBeLessThanOrEqual(0.98);
      expect(p['raster-saturation'], l).toBeGreaterThanOrEqual(-0.12); expect(p['raster-saturation'], l).toBeLessThanOrEqual(0);
    }
  });
  it('tydligare än Kartan lugnare för alla lager (ljusare och mer färg)', () => {
    for (const l of KARTLAGER) {
      expect(KARTBAS_PAINT[l]['raster-brightness-max']).toBeGreaterThan(KARTBAS_DAMPAD[l]['raster-brightness-max']);
      expect(KARTBAS_PAINT[l]['raster-saturation']).toBeGreaterThan(KARTBAS_DAMPAD[l]['raster-saturation']);
    }
  });
});

describe('reglaget Dämpad ↔ Skarp', () => {
  it('ljus och mättnad ökar jämnt (monotont) från 0 till 100 i steg om 5', () => {
    for (const l of KARTLAGER) {
      let ljus = -1, farg = -2;
      for (let v = 0; v <= 100; v += 5) {
        const p = kartBasPaint(l, v);
        expect(p['raster-brightness-max'], `${l} ${v}`).toBeGreaterThanOrEqual(ljus); ljus = p['raster-brightness-max'];
        expect(p['raster-saturation'], `${l} ${v}`).toBeGreaterThanOrEqual(farg); farg = p['raster-saturation'];
      }
    }
  });
  it('halvvägs är exakt mitt emellan, och värden utanför 0–100 klamras', () => {
    expect(kartBasPaint('satellite', 50)['raster-brightness-max']).toBe(0.75);
    expect(kartBasPaint('satellite', -20)).toEqual(kartBasPaint('satellite', 0));
    expect(kartBasPaint('satellite', 400)).toEqual(kartBasPaint('satellite', 100));
    expect(kartBasPaint('satellite', Number.NaN)).toEqual(kartBasPaint('satellite'));
  });
  it('kartBasPaint ger en kopia (ingen kan ändra konstanterna av misstag)', () => {
    const k = kartBasPaint('satellite', 0); k['raster-brightness-max'] = 1;
    expect(KARTBAS_DAMPAD.satellite['raster-brightness-max']).toBe(0.5);
  });
});

describe('kartan utan valt objekt (tomKartaStil) har samma värden som planeringsvyn', () => {
  for (const lager of RASTER_KARTLAGER) {
    it(`${lager}: lagrets paint = kartBasPaint (standard), och följer ett eget reglagevärde`, () => {
      const bas: any = tomKartaStil(lager).layers.find((l: any) => l.id === KARTLAGER_LAGER_ID[lager]);
      expect(bas.paint).toEqual(KARTBAS_PAINT[lager]);
      const dampad: any = tomKartaStil(lager, 0).layers.find((l: any) => l.id === KARTLAGER_LAGER_ID[lager]);
      expect(dampad.paint).toEqual(KARTBAS_DAMPAD[lager]);
    });
  }
});

describe('kartan utan valt objekt med Ritad: grunden (bakgrund, terrängskuggning, vatten och vägar), aldrig en tom yta', () => {
  it('har den ritade kartans bakgrund och vektorlager, inga kartbilder', () => {
    const s: any = tomKartaStil('ritad');
    const ids = s.layers.map((l: any) => l.id);
    expect(ids).toContain('ritad-bakgrund');
    expect(ids).toContain('ritad-vag');
    expect(ids).not.toContain('satellite-layer');
    expect(s.sources['ritad-vektor']).toBeTruthy();
  });
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
