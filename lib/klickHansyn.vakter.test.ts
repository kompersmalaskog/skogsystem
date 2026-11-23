// TRYCK PÅ HÄNSYN — vakter mot app/planering/page.tsx (Martin 2026-11-23). Beteendet prövas i klickPrioritet.hansyn.test.ts och klickHansyn.hytt.test.ts (riktig Chromium);
// här låses INKOPPLINGEN i sidan så att ordningen aldrig mer avgörs av hur lagren råkar ligga.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../app/planering/page.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

describe('klickkoppling i planeringssidan (planeringsvyn och körvyn delar den)', () => {
  it('trakt-lyssnaren väljer ytan på KATEGORI (hänsyn före traktdel) — Vidas ytor saknar areal, så storleken räcker inte', () => {
    expect(page).toContain('const vald = valjMinstaYta(bastaKategoriFeatures<any>(traktKand));');
    expect(page).not.toMatch(/valjMinstaYta\(traktKand\)/);
    expect(page).toContain("bastaKategoriFeatures, ALLA_KLICK_LAGER");
  });

  it('eget områdes fyllning (grans-fill) är traktyta: den avstår för varje specifik yta, symbol, linje och ytnummer', () => {
    const m = page.match(/if \(isDrawMode \|\| isZoneMode \|\| larmPlacering\) return;\n\s*if \(vinnandeKategoriForKarta\(map, e\.point\) !== '(\w+)'\) return;   \/\/ hög\/linje\/ytnummer och alla specifika ytor/);
    expect(m).not.toBeNull();
    expect(m![1]).toBe('traktyta');
  });

  it('egna zoner (zone-fill) är fortfarande kategori yta, och väg-⚠ går bara när den vinner', () => {
    expect(page).toMatch(/const onZoneClick = [\s\S]{0,400}vinnandeKategoriForKarta\(map, e\.point\) !== 'yta'\) return;/);
    expect(page).toContain("if (vinnandeKategoriForKarta(map, e.point) !== 'tma') return;   // larm och symboler är högre → avstå (lib/klickPrioritet)");
  });

  it('körspår tar aldrig emot tryck: ingen lyssnare på hyttspår-, planspår- eller körordningslager', () => {
    expect(page).not.toMatch(/map\.on\('click',\s*['"`](hyttspar|planspar|line-kor)/);
    expect(page).not.toMatch(/map\.on\('click',\s*\[?\s*(HYTTSPAR|PLANSPAR|SPAR)_?LAGER/i);
  });
});
