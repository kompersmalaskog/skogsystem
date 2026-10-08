import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// Källkodsvakter: planeringssidan (23 000 rader) går inte att montera i vitest. Beteendet är bevisat i sparJamning.test.ts / sparStil.test.ts och i
// testselens riktiga rendering — de här vakterna larmar om KOPPLINGEN bryts: ritningen ska vara utjämnad, men allt som SPARAS eller RÄKNAS ska
// vara rådata ("bara ritningen, sparad data oförändrad. Avverkad areal och analyser använder rådata som idag").
const page = readFileSync(new URL('../app/planering/page.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const forekomster = (re: RegExp) => (page.match(re) || []).length;

describe('RITNINGEN går genom utjämningen — på exakt de fyra ritställena', () => {
  it('hyttsparRitadeLinjer anropas på fyra ställen: live eget spår, tidigare dagar, den andres spår, planeringsvyn', () => {
    expect(forekomster(/hyttsparRitadeLinjer\(/g)).toBe(4);
    expect(page).toMatch(/hyttspar-egen-source[\s\S]{0,400}?\n?[\s\S]{0,400}?hyttsparRitadeLinjer\(hyttsparPointsRef\.current as any\)|hyttsparRitadeLinjer\(hyttsparPointsRef\.current as any\)/);
    expect(page).toMatch(/\.filter\(\(r: any\) => r\.datum !== idag\)[^\n]*\n\s*\.flatMap\(\(r: any\) => hyttsparRitadeLinjer\(/);
    expect(page).toMatch(/const features = \(data \|\| \[\]\)\n\s*\.flatMap\(\(r: any\) => hyttsparRitadeLinjer\(/);
    expect(page).toMatch(/for \(const coords of hyttsparRitadeLinjer\(Array\.isArray\(\(r as any\)\.points\)/);
  });
  it('importerna finns', () => {
    expect(page).toContain("import { hyttsparRitadeLinjer } from '../../lib/sparJamning'");
    expect(page).toMatch(/import \{[^}]*\bsparStil\b[^}]*\} from '\.\.\/\.\.\/lib\/sparStil'/);
  });
});

describe('SPARAD DATA och ANALYSER är RÅDATA', () => {
  it('avverkad areal räknas på hyttsparTillLinjer (rådata) — både de hämtade raderna och live-punkterna', () => {
    expect(page).toContain("const live = roll === 'skordare' ? hyttsparTillLinjer(hyttsparPointsRef.current as any) : [];");
    expect(page).toMatch(/skordarSparRef\.current = \(data \|\| \[\]\)\.flatMap\(\(r: any\) => hyttsparTillLinjer\(Array\.isArray\(r\.points\) \? r\.points : \[\]\)\)/);
    expect(page).toContain('avverkadAreaM2(segment, { ringar })');
    expect(forekomster(/hyttsparTillLinjer\(/g)).toBe(2);   // exakt de två analysställena — inget annat använder rådata-segmenteringen
  });
  it('sparningen (hyttspar_append / sparaHyttspar) rör aldrig den utjämnade ritningen', () => {
    const a = page.indexOf('const sparaHyttspar = useCallback');
    expect(a).toBeGreaterThan(0);
    const kropp = page.slice(a, a + 5000);
    expect(kropp).toContain('hyttspar_append');
    expect(kropp).not.toContain('hyttsparRitadeLinjer');
    expect(kropp).not.toContain('jamnaSpar');
  });
  it('hyttsparPointsRef (det som sparas) tilldelas aldrig ur en utjämnad linje', () => {
    expect(page).not.toMatch(/hyttsparPointsRef\.current = [^;\n]*(hyttsparRitadeLinjer|jamnaSpar)/);
    expect(page).not.toMatch(/skordarSparRef\.current = [^;\n]*(hyttsparRitadeLinjer|jamnaSpar)/);
  });
});

describe('stilen: skördaren jämn 3 px full färg i alla lager, skotaren som förut', () => {
  it('stilkonstanterna definieras inte längre i page.tsx (en källa: lib/sparStil)', () => {
    expect(page).not.toMatch(/const HYTTSPAR_LINE_WIDTH/);
    expect(page).not.toMatch(/const ROLLFARG_SKORDARE/);
    expect(page).not.toMatch(/const rollFarg\b/);
  });
  it('körvyns roll-effekt sätter färg, bredd och opacitet (+ casing) per lager ur sparStil — eget, historik och den andres', () => {
    expect(page).toContain("if (hyttRoll) { stila('hyttspar-egen', hyttRoll, 'egen'); stila('hyttspar-hist', hyttRoll, 'hist'); }");
    expect(page).toContain("if (andrasRoll) stila('hyttspar-andras', andrasRoll, 'andras');");
    expect(page).toContain("satt(`${namn}-line`, 'line-color', s.farg); satt(`${namn}-line`, 'line-width', s.linjeBredd); satt(`${namn}-line`, 'line-opacity', s.linjeOpacitet);");
    expect(page).toContain("satt(`${namn}-casing`, 'line-width', s.casingBredd); satt(`${namn}-casing`, 'line-opacity', s.casingOpacitet);");
  });
  it('planeringsvyns lager skapas med stilen per roll (skördare 3 px full, skotare som förut)', () => {
    expect(page).toContain("const st = sparStil(roll, 'plan');");
    expect(page).toContain("'line-opacity': st.linjeOpacitet, 'line-width': st.linjeBredd");
    expect(page).toContain("'line-opacity': st.casingOpacitet, 'line-width': st.casingBredd");
  });
});
