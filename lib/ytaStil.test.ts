import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { GRUPPER, VIDA, YTA } from './larm/grupper';
import { FORBJUDNA_ZONTYPER, SNEDSTRECK_GRUPPER, SNEDSTRECK_PX, YTA_ETIKETT, VIDA_ETIKETT, snedstreckBild, snedstreckId } from './ytaStil';
import { zonSnedstreckLager } from './kartstil';

describe('ytor man inte får köra in i är snedstreckade i gruppens färg', () => {
  it('Hänsyn, Fornlämning och Ej framkomlig (egna) samt Vidas hänsynsyta, nyckelbiotop och fornlämning — och inga andra', () => {
    const egna = Object.entries(YTA).filter(([, y]) => y.forbjuden).map(([t]) => t).sort();
    expect(egna).toEqual(['fornlamning', 'noentry', 'protected']);
    const vida = Object.entries(VIDA).filter(([, v]) => v.forbjuden).map(([k]) => k).sort();
    expect(vida).toEqual(['hansynsyta', 'nyckelbiotop', 'raa_yta']);
    expect(SNEDSTRECK_GRUPPER.slice().sort()).toEqual(['fara', 'kultur', 'natur']);
    expect(FORBJUDNA_ZONTYPER('natur')).toEqual(['protected']);
    expect(FORBJUDNA_ZONTYPER('kultur')).toEqual(['fornlamning']);
    expect(FORBJUDNA_ZONTYPER('fara')).toEqual(['noentry']);
    expect(FORBJUDNA_ZONTYPER('blott')).toEqual([]);
  });
  it('mönstret är gruppens färg, 45°, genomskinligt mellan strecken och går ihop i kanterna', () => {
    for (const g of SNEDSTRECK_GRUPPER) {
      const b = snedstreckBild(g);
      expect([b.width, b.height]).toEqual([SNEDSTRECK_PX, SNEDSTRECK_PX]);
      const hex = GRUPPER[g].farg;
      const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      const px = (x: number, y: number) => Array.from(b.data.slice((y * b.width + x) * 4, (y * b.width + x) * 4 + 4));
      const streck = px(0, 0);
      expect(streck.slice(0, 3), g).toEqual(rgb);
      expect(streck[3]).toBeGreaterThan(200);
      expect(px(4, 0)[3], g).toBe(0);                                   // mellan strecken
      expect(px(3, 5)).toEqual(px(3 + 8, 5 + 8).slice(0, 4));            // period 8 diagonalt
      for (let y = 0; y < SNEDSTRECK_PX; y++) expect(px(0, y)).toEqual(px(SNEDSTRECK_PX - 1 + 1 - SNEDSTRECK_PX, y));
      expect(snedstreckId(g)).toBe(`snedstreck-${g}`);
    }
  });
  it('namnet står i ytan i versaler (Blött heter RISA) och Vidas ytor har samma stil', () => {
    expect(YTA_ETIKETT).toMatchObject({ wet: 'RISA', protected: 'HÄNSYN', noentry: 'EJ FRAMKOMLIG', fornlamning: 'FORNLÄMNING', culture: 'KULTURMILJÖ', steep: 'BRANT' });
    expect(VIDA_ETIKETT).toEqual({ hansynsyta: 'HÄNSYN', nyckelbiotop: 'NYCKELBIOTOP', raa_yta: 'FORNLÄMNING', ovrigt: 'ÖVRIGT' });   // Vidas TYP 71 är ingen hänsyn: eget namn
  });
  it('egenkontrollens karta: ett snedstrecklager per grupp, filtrerat på de förbjudna zontyperna', () => {
    const lager = zonSnedstreckLager('kalla', 'ek-p', null);
    expect(lager.map((l) => l.id).sort()).toEqual(['ek-p-zon-snedstreck-fara', 'ek-p-zon-snedstreck-kultur', 'ek-p-zon-snedstreck-natur']);
    const natur = lager.find((l) => l.id.endsWith('natur'))!;
    expect(natur.paint['fill-pattern']).toBe('snedstreck-natur');
    expect(JSON.stringify(natur.filter)).toContain('protected');
  });
});

describe('planeringens kartlager', () => {
  const page = readFileSync('app/planering/page.tsx', 'utf8');
  it('egna ytor: snedstrecklager per grupp, ytnamnet ur YTA_ETIKETT, ingen vit streckning på kanten', () => {
    expect(page).toContain("id: `zone-hatch-${grupp}`");
    expect(page).toContain('FORBJUDNA_ZONTYPER(grupp)');
    expect(page).toContain('...Object.entries(YTA_ETIKETT).flat()');
    expect(page).not.toMatch(/id: 'zone-outline-stripe'|zone-outline-dash/);
  });
  it('Vidas ytor: hänsyn, nyckelbiotop och fornlämning snedstreckas och har sitt namn i ytan', () => {
    for (const id of ['trakt-hansyn-hatch', 'trakt-nb-hatch', 'trakt-raa-hatch', 'trakt-nb-label', 'trakt-raa-label', 'trakt-hansyn-label']) expect(page, id).toContain(`id: '${id}'`);
    expect(page).toContain("snedstreckId('natur')");
    expect(page).toContain("snedstreckId('kultur')");
    // nyckelbiotopens kant är heldragen nu (streckningen bärs av snedstrecket)
    const nb = page.slice(page.indexOf("id: 'trakt-nb-line'"), page.indexOf("id: 'trakt-nb-hatch'"));
    expect(nb).not.toContain('line-dasharray');
  });
  it('lagren följer synlighetsknapparna', () => {
    for (const id of ['trakt-hansyn-hatch', 'trakt-nb-hatch', 'trakt-nb-label', 'trakt-raa-hatch', 'trakt-raa-label']) expect(page, id).toContain(`set('${id}'`);
    expect(page).toContain('ZONE_LAGER().forEach(id => safeSetVisibility(id, zoneVis))');
  });
  it('symbolernas träffyta är 44 px (egenkontrollens TRAFF_RADIE_PX) och pricken 10 px med mörk kant', () => {
    expect(page).toMatch(/id: 'markers-hit'[\s\S]{0,200}'circle-radius': TRAFF_RADIE_PX/);
    expect(page).toMatch(/id: 'arrows-hit'[\s\S]{0,200}'circle-radius': TRAFF_RADIE_PX/);
    expect(page).toContain("'circle-stroke-color': PRICK_KANT_FARG");
  });
});
