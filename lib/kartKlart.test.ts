// DET SOM ÄR KLART BLIR GRÅTT — bara status som redan finns (lib/kartKlart). Skotad yta = skotning_uttag-polygoner, en avslutad trakt ritas i sina vanliga färger (Martin 2026-10-29).
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FARG } from './design/tokens';
import * as kartKlart from './kartKlart';
import { INGA_YTOR, KLART_FARG, KLART_LINJE_OPACITET, skotadeYtor } from './kartKlart';

const lasa = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

describe('en avslutad trakt gråas inte (Martin 2026-10-29)', () => {
  it('det finns ingen regel som gör en hel trakt grå på status', () => {
    expect('arObjektKlart' in kartKlart).toBe(false);
    expect('KLART_LINJELAGER' in kartKlart).toBe(false);
    expect('KLART_TONAS_BORT' in kartKlart).toBe(false);
  });
});

describe('skotadeYtor — de sparade uttagens polygoner', () => {
  const kvadrat = [[15, 56], [15.001, 56], [15.001, 56.001], [15, 56.001]];
  it('en polygon blir en yta; ett öppet hörn stängs', () => {
    const r = skotadeYtor([{ polygon_coords: kvadrat }]);
    expect(r.features).toHaveLength(1);
    const ring = r.features[0].geometry.coordinates[0];
    expect(ring).toHaveLength(5);
    expect(ring[4]).toEqual(ring[0]);
  });
  it('en redan stängd polygon stängs inte en gång till', () => {
    expect(skotadeYtor([{ polygon_coords: [...kvadrat, kvadrat[0]] }]).features[0].geometry.coordinates[0]).toHaveLength(5);
  });
  it('samma polygon på flera rader (ett uttag per sortiment delar polygon) ritas EN gång', () => {
    expect(skotadeYtor([{ polygon_coords: kvadrat }, { polygon_coords: kvadrat }, { polygon_coords: kvadrat }]).features).toHaveLength(1);
  });
  it('två olika polygoner blir två ytor', () => {
    const b = kvadrat.map(([x, y]) => [x + 0.01, y]);
    expect(skotadeYtor([{ polygon_coords: kvadrat }, { polygon_coords: b }]).features).toHaveLength(2);
  });
  it('legacy-uttag utan polygon, för få hörn och skräp hoppas över — aldrig en påhittad yta', () => {
    const r = skotadeYtor([
      { polygon_coords: null }, {}, { polygon_coords: [] }, { polygon_coords: [[1, 2], [3, 4]] },
      { polygon_coords: [[1, 2], [3, 'x'], [5, 6]] }, { polygon_coords: 'inte en lista' }, { polygon_coords: [[1, 2], [1, 2], [1, 2]] },
    ]);
    expect(r.features).toHaveLength(0);
    expect(skotadeYtor(null)).toEqual(INGA_YTOR);
    expect(skotadeYtor(undefined)).toEqual(INGA_YTOR);
  });
});

describe('utseendet', () => {
  it('klart = appens sekundära grå (ingen ny färg) och svagare än det som är kvar', () => {
    expect(KLART_FARG).toBe(FARG.text2);
    expect(KLART_LINJE_OPACITET).toBeLessThan(0.95);
    expect(KLART_LINJE_OPACITET).toBeGreaterThanOrEqual(0.4);   // maskinspåren ska fortfarande gå att följa
  });
});

describe('page.tsx — klart-kopplingen', () => {
  const sida = lasa('app/planering/page.tsx');
  it('lagren för skotad yta finns, ligger under zonerna och står i körvyns KEEP_PREFIX (prefixet klart-)', () => {
    expect(sida.indexOf("id: KLART_KANT_LAGER")).toBeGreaterThan(0);
    expect(sida.indexOf("id: KLART_KANT_LAGER")).toBeLessThan(sida.indexOf("id: 'zone-fill', type: 'fill'"));
    // ingen grå fyllning: fotot inne i trakten ska synas i full skärpa (Martin 2026-10-27)
    expect(sida).not.toContain("KLART_FYLLNING_LAGER");
    expect(sida).not.toMatch(/KLART_KALLA[^\n]*type: 'fill'/);
    expect(sida).toMatch(/KEEP_PREFIX = \[[^\]]*'klart-'\]/);
  });
  it('planeringsvyn gråar aldrig vägar eller spår för att trakten är avslutad — basvägen behåller blå/gul', () => {
    expect(sida).not.toMatch(/traktKlar/);
    expect(sida).not.toMatch(/arObjektKlart/);
    expect(sida).not.toMatch(/klartOrigRef/);
  });
  it('läsfel på de skotade ytorna ger INGA ytor (aldrig en påhittad)', () => {
    expect(sida).toMatch(/skotade ytor kunde inte läsas[^]{0,120}setData\(INGA_YTOR\)/);
  });
});
