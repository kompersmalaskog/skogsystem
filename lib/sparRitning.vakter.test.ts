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
    const live = page.indexOf('const uppdateraHyttsparLager = useCallback');
    expect(live).toBeGreaterThan(0);
    expect(page.slice(live, live + 900)).toContain('hyttsparRitadeLinjer(hyttsparPointsRef.current as any)');   // live eget spår: hela dagens RÅA punkter in, utjämnad linje ut
    // tidigare dagar: dagens EGNA rad filtreras bort (GROT-jobb tar också virkesobjektets skördarspår — då är raden en annan objekt_id och behålls)
    expect(page).toMatch(/\.filter\(\(r: any\) => r\.objekt_id !== objektId \|\| r\.datum !== idag\)[^\n]*\n\s*\.flatMap\(\(r: any\) => hyttsparRitadeLinjer\(/);
    // den andres spår: EN delad hjälpare (tillFeatures) som ritar via den utjämnade vägen — egna rader och GROT-jobbets virkesobjekt-rader går igenom samma
    expect(page).toMatch(/const tillFeatures = \(rader: any\[\] \| null\) => \(rader \|\| \[\]\)\n\s*\.flatMap\(\(r: any\) => hyttsparRitadeLinjer\(/);
    expect(page).toMatch(/for \(const coords of hyttsparRitadeLinjer\(Array\.isArray\(\(r as any\)\.points\)/);
  });
  it('importerna finns', () => {
    expect(page).toContain("import { hyttsparRitadeLinjer } from '../../lib/sparJamning'");
    expect(page).toMatch(/import \{[^}]*\bdampatSpar\b[^}]*\} from '\.\.\/\.\.\/lib\/sparStil'/);
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

describe('stilen: dämpade spår (lib/sparStil dampatSpar), en källa för alla fyra lagergrupper', () => {
  it('stilkonstanterna definieras inte i page.tsx (en källa: lib/sparStil) och sidan använder inte längre de gamla vita kanterna/neonfärgerna', () => {
    expect(page).not.toMatch(/const HYTTSPAR_LINE_WIDTH/);
    expect(page).not.toMatch(/const ROLLFARG_SKORDARE/);
    expect(page).not.toMatch(/const rollFarg\b/);
    expect(page).not.toMatch(/HYTTSPAR_LINE_WIDTH|HYTTSPAR_HIST_LINE_WIDTH|HYTTSPAR_CASING_WIDTH|HYTTSPAR_HIST_CASING_WIDTH|ROLLFARG_SKOTARE|ROLLFARG_SKORDARE/);
  });
  it('körvyns roll-effekt sätter färg, bredd och opacitet (+ casing) per lager ur dampatSpar — eget, historik och den andres', () => {
    expect(page).toContain("if (hyttRoll) { stila('hyttspar-egen', hyttRoll, 'egen'); stila('hyttspar-hist', hyttRoll, 'hist'); }");
    expect(page).toContain("if (andrasRoll) stila('hyttspar-andras', andrasRoll, 'andras');");
    expect(page).toContain("satt(`${namn}-line`, 'line-color', s.farg); satt(`${namn}-line`, 'line-width', s.bredd); satt(`${namn}-line`, 'line-opacity', s.opacitet);");
    expect(page).toContain("satt(`${namn}-casing`, 'line-width', s.bredd); satt(`${namn}-casing`, 'line-opacity', s.casingOpacitet);");
  });
  it('planeringsvyns lager skapas med stilen per roll', () => {
    expect(page).toContain("const st = dampatSpar(roll, 'plan');");
    expect(page).toContain("'line-opacity': st.opacitet as any, 'line-width': st.bredd");
    expect(page).toContain("'line-opacity': st.casingOpacitet, 'line-width': st.bredd");
  });
  it('tidigare dagar bleknar: alla tre raderna som läses (historik, den andres, planering) skickar med datum och sätter featurens alder', () => {
    expect(page.match(/properties: \{ alder: sparAlder\(/g)).toHaveLength(3);
    expect(page).toContain(".select('datum, points').eq('objekt_id', objektId).eq('roll', roll)");
    expect(page).toContain("select('datum, points').eq('objekt_id', horTillId).eq('roll', 'skordare')");
    expect(page).toContain("select('roll, datum, points').eq('objekt_id', objektId)");
  });
});
