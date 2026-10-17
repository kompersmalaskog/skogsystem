// Rubriken i meny-arket. Själva sidan går inte att montera i vitest, så kopplingen mellan "vilka kategorier arket kan öppnas på" och "vilka som har rubrik"
// låses här genom att läsa page.tsx: en kategori som sidan öppnar utan post i MENY_KATEGORIER ger tom rubrik (så var det en gång för två av dem i en felaktig bild — nu vaktas det).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { MENY_KATEGORIER, menyRubrik } from './menyRubrik';

const page = readFileSync(new URL('../app/planering/page.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const unika = (re: RegExp) => Array.from(new Set(Array.from(page.matchAll(re), (m) => m[1]))).sort();

describe('menyRubrik', () => {
  it('alla sju kategorier har en icke-tom rubrik', () => {
    expect(MENY_KATEGORIER.map((c) => c.id).sort()).toEqual(['arrows', 'brandrisk', 'gallring', 'lines', 'settings', 'skotning', 'zones']);
    for (const c of MENY_KATEGORIER) expect(menyRubrik(null, c.id), c.id).toBe(c.name);
    expect(MENY_KATEGORIER.map((c) => c.name)).toEqual(['Linjer', 'Zoner', 'Pilar', 'Gallring', 'Inställningar', 'Brandrisk', 'Skotning']);
  });
  it('undermenyn går före kategorin; GPS och manuell har egna ord; utan val står "Meny"; en okänd kategori ger aldrig tom rubrik', () => {
    expect(menyRubrik('gps-lines', 'lines')).toBe('Spåra med GPS');
    expect(menyRubrik('draw-lines', 'lines')).toBe('Rita manuellt');
    expect(menyRubrik('Något annat', 'zones')).toBe('Något annat');
    expect(menyRubrik(null, null)).toBe('Meny');
    expect(menyRubrik(null, 'finns-inte')).toBe('Meny');
  });
});

describe('källvakt: page.tsx', () => {
  const satta = unika(/setActiveCategory\('([a-z-]+)'\)/g);
  const block = unika(/activeCategory === '([a-z-]+)'/g);
  it('varje kategori sidan öppnar arket på har en rubrik', () => {
    const ids = MENY_KATEGORIER.map((c) => c.id as string);
    for (const k of satta) expect(ids, `setActiveCategory('${k}') saknar rubrik`).toContain(k);
    for (const k of block) expect(ids, `activeCategory === '${k}' saknar rubrik`).toContain(k);
  });
  it('varje rubrik hör till en kategori som sidan faktiskt kan öppna och som har ett innehållsblock (inga döda poster)', () => {
    for (const c of MENY_KATEGORIER) {
      expect(satta, `${c.id} sätts aldrig`).toContain(c.id);
      expect(block, `${c.id} har inget block`).toContain(c.id);
    }
  });
  it('den gamla listan och den icke-anropade openMenu är borta och kommer inte tillbaka', () => {
    expect(page).not.toContain('menuCategories');
    expect(page).not.toMatch(/const openMenu\b/);
    expect(page).not.toMatch(/\bopenMenu\(/);
    expect(page).toContain('<MenyRubrik subMenu={subMenu} activeCategory={activeCategory} />');
  });
});
