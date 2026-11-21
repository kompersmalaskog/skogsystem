import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// Källkodsvakter: planeringssidan (23 000 rader) går inte att montera i vitest. Beteendet är bevisat i sparJamning.test.ts / sparStil.test.ts och i
// testselens riktiga rendering — de här vakterna larmar om KOPPLINGEN bryts: ritningen ska vara utjämnad, men allt som SPARAS eller RÄKNAS ska
// vara rådata ("bara ritningen, sparad data oförändrad. Avverkad areal och analyser använder rådata som idag").
const page = readFileSync(new URL('../app/planering/page.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const forekomster = (re: RegExp) => (page.match(re) || []).length;

describe('RITNINGEN går genom körspårskedjan (lib/korspar) — på exakt ritställena', () => {
  it('korsparLinjer/cachadeKorspar ritar: live eget spår rakt, tidigare dagar, den andres spår och planeringsvyn cachat per dag och objekt', () => {
    const live = page.indexOf('const ritaKorvySpar = useCallback');   // körvyns tre källor ritas av EN funktion (lib/korsparKlart)
    expect(live).toBeGreaterThan(0);
    expect(page.slice(live, live + 1500)).toContain('korsparLinjer(hyttsparPointsRef.current as any)');   // live eget spår: hela dagens RÅA punkter in, rensad linje ut
    // tidigare dagar: dagens EGNA rad filtreras bort (GROT-jobb tar också virkesobjektets skördarspår — då är raden en annan objekt_id och behålls)
    expect(page).toMatch(/\.filter\(\(r: any\) => r\.objekt_id !== objektId \|\| r\.datum !== idag\)[^\n]*\n\s*\.flatMap\(\(r: any\) => cachadeKorspar\(/);
    // den andres spår (egna rader + GROT-jobbets virkesobjekt) och planeringens båda roller: alla via cachadeKorspar med nyckel objekt|roll|datum
    expect(page.match(/cachadeKorspar\(/g)!.length).toBe(4);   // historik, den andres, virkesobjektets, planeringens
    expect(page).toMatch(/cachadeKorspar\(`\$\{objektId\}\|\$\{roll\}\|\$\{\(r as any\)\.datum\}`/);
    // Den GAMLA utjämningen + stråkbyggaren finns kvar för EN sak: skotarlägets lass-logik (skotarHamtaVagar) läser skördarens STRÅK som förut. Ritningen går aldrig genom dem.
    expect(forekomster(/hyttsparRitadeLinjer\(/g)).toBe(1);
    expect(page.match(/strakFeatures\(/g)!.length).toBe(1);
    expect(page.slice(live, live + 2600)).not.toContain('strakFeatures');
    expect(page.slice(live, live + 2600)).not.toContain('hyttsparRitadeLinjer');
  });
  it('importerna finns', () => {
    expect(page).toContain("import { korsparLinjer, cachadeKorspar } from '../../lib/korspar'");
    expect(page).toContain("import { delaKlart, delaUtanfor } from '../../lib/korsparKlart'");
    expect(page).toMatch(/import \{[^}]*\bkartSpar\b[^}]*\} from '\.\.\/\.\.\/lib\/sparStil'/);
  });
});

describe('SPARAD DATA och ANALYSER är RÅDATA', () => {
  it('avverkad areal räknas på hyttsparTillLinjer (rådata) — både de hämtade raderna och live-punkterna', () => {
    expect(page).toContain("const live = roll === 'skordare' ? hyttsparTillLinjer(hyttsparPointsRef.current as any) : [];");
    expect(page).toMatch(/skordarSparDagRef\.current = \(data \|\| \[\]\)\.map\(\(r: any\) => \(\{ datum: String\(r\.datum \?\? ''\), segment: hyttsparTillLinjer\(Array\.isArray\(r\.points\) \? r\.points : \[\]\) \}\)\)/);   // per dag (tempot per område)
    expect(page).toContain('skordarSparRef.current = skordarSparDagRef.current.flatMap((d) => d.segment);');
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

describe('stilen: körspårsbandet (lib/sparStil kartSpar), en källa för alla fyra lagergrupper', () => {
  it('stilkonstanterna definieras inte i page.tsx (en källa: lib/sparStil) och sidan använder inte längre de gamla vita kanterna/neonfärgerna', () => {
    expect(page).not.toMatch(/const HYTTSPAR_LINE_WIDTH/);
    expect(page).not.toMatch(/const ROLLFARG_SKORDARE/);
    expect(page).not.toMatch(/const rollFarg\b/);
    expect(page).not.toMatch(/HYTTSPAR_LINE_WIDTH|HYTTSPAR_HIST_LINE_WIDTH|HYTTSPAR_CASING_WIDTH|HYTTSPAR_HIST_CASING_WIDTH|ROLLFARG_SKOTARE|ROLLFARG_SKORDARE/);
  });
  it('körvyns roll-effekt sätter färg, bredd och opacitet (+ ytterkantens bredd och mjukhet) per lager ur kartSpar — eget, historik och den andres', () => {
    expect(page).toContain("if (hyttRoll) { stila('hyttspar-egen', hyttRoll, 'egen'); stila('hyttspar-hist', hyttRoll, 'hist'); }");
    expect(page).toContain("if (andrasRoll) stila('hyttspar-andras', andrasRoll, 'andras');");
    expect(page).toContain("satt(`${namn}-line`, 'line-color', s.farg); satt(`${namn}-line`, 'line-width', s.bredd); satt(`${namn}-line`, 'line-opacity', s.opacitet);");
    expect(page).toContain("satt(`${namn}-casing`, 'line-color', s.kantFarg); satt(`${namn}-casing`, 'line-width', s.kantBredd); satt(`${namn}-casing`, 'line-opacity', s.kantOpacitet); satt(`${namn}-casing`, 'line-blur', s.kantSudd);");
  });
  it('planeringsvyns lager skapas med stilen per roll', () => {
    expect(page).toContain("const st = kartSpar('plan');");   // skördaren grå där skotaren kört, skotaren som band (lib/sparStil kartSpar)
    expect(page).toContain("'line-opacity': st.opacitet as any, 'line-width': st.bredd");
    expect(page).toContain("'line-color': st.kantFarg, 'line-opacity': st.kantOpacitet as any, 'line-width': st.kantBredd, 'line-blur': st.kantSudd");
  });
  it('ingen blekning med åldern: raderna läses utan alder på bandet (bara lass-logikens stråk bär den)', () => {
    expect(page.match(/alder: sparAlder\(/g)).toHaveLength(1);   // tillRader (stråk för skotarlägets lass-logik) — kartans band är lika starka alla dagar (Martin 2026-11-11)
    expect(page).toContain(".select('datum, points').eq('objekt_id', objektId).eq('roll', roll)");
    expect(page).toContain("select('datum, points').eq('objekt_id', horTillId).eq('roll', 'skordare')");
    expect(page).toContain("select('roll, datum, points').eq('objekt_id', objektId)");
  });
});
