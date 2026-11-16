// Källvakt (2026-11-10): planeringsvyn fick aldrig ha en effekt som "återställer" lagrens opacitet när markeringarna ändras.
// Den gamla briefingens återställ-gren gjorde det vid kartans start och vid varje ändrad markering och skrev över
// lagrens egna värden: en körd väg (körordningen, KOR_OPACITET 0,6) fick full styrka och gallringszonerna (0,75) blev bleka (0,2).
// Mätt i riktig Chromium + MapLibre: körd väg 110,115,106 → 142,142,147, gallringszon 51,175,77 → 58,101,53.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../app/planering/page.tsx', import.meta.url), 'utf8');

describe('lagren behåller sina egna värden', () => {
  it('ingen kod sätter vägarnas line-opacity till 1 för alla linjetyper', () => {
    expect(page).not.toMatch(/const id = `line-\$\{lt\}-\$\{suffix\}`;\s*if \(map\.getLayer\(id\)\) map\.setPaintProperty\(id, 'line-opacity', 1\)/);
  });
  it("ingen kod sätter zone-fill till en platt opacitet (gallringszonerna har 0,75)", () => {
    expect(page).not.toContain("id === 'zone-fill' ? 0.2 : 1");
  });
  it('vägarna ritas med körordningens opacitet', () => {
    expect(page).toContain("...(arVag ? { 'line-opacity': KOR_OPACITET } : {})");
  });
});
