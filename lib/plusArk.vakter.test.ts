import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { FLIKAR } from './plusArk';

// Vakt för plusarkets ommöblering ("Alla" → Symboler · Ytor · Spårning · Lager). Ommöbleringen får inte tappa eller lägga till något:
// samma symbolkategorier, samma lager i samma grupper och ordning som den gamla Lager-menyn, och varje val som "Fler val" hade.
// page.tsx är 23 000 rader och körs inte i enhetstester — provet läser källan och låser kopplingarna; beteendet är provat i den riktiga
// sidan (testsele, se PR) och reglerna i lib/plusArk.test.ts.
const las = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const page = las('../app/planering/page.tsx');
const mellan = (src: string, fran: string, till: string): string => {
  const a = src.indexOf(fran), b = src.indexOf(till, a + fran.length);
  expect(a, `hittar inte "${fran}"`).toBeGreaterThan(-1);
  expect(b, `hittar inte "${till}"`).toBeGreaterThan(a);
  return src.slice(a, b);
};

describe('Symboler: samma kategorier, namn och ordning som appen alltid haft', () => {
  const kat = mellan(page, 'const symbolCategories = [', 'const markerTypes');
  const namn = Array.from(kat.matchAll(/^\s{6}name: '([^']+)'/gm)).map((m) => m[1]);
  const symboler = Array.from(kat.matchAll(/\{ id: '([a-z]+)', name: '([^']+)' \}/g)).map((m) => `${m[1]}=${m[2]}`);

  it('de sex kategorierna i den ordning appen har dem', () => {
    expect(namn).toEqual(['Naturvård', 'Kultur', 'Avverkning', 'Infrastruktur', 'Terräng', 'Övrigt']);
  });
  it('20 symboler med samma id och namn, i samma ordning', () => {
    expect(symboler).toEqual([
      'eternitytree=Evighetsträd', 'naturecorner=Naturhörna',
      'culturemonument=Kulturminne', 'culturestump=Kulturstubbe',
      'highstump=Högstubbe', 'landing=Avlägg', 'brashpile=Rishög', 'windfall=Vindfälle', 'manualfelling=Manuell fällning', 'felloutside=Träd att avverka',
      'powerline=El-ledning', 'road=Väg', 'turningpoint=Vändplats',
      'ditch=Dike', 'bridge=Bro', 'corduroy=Kavling', 'wet=Fuktig mark', 'steep=Brant', 'trail=Stig / Led',
      'warning=Varning',
    ]);
  });
  it('arket bygger Symboler direkt ur symbolCategories (inga egna grupper) med symbolens riktiga färg', () => {
    expect(page).toContain('const byggSymbolKategorier = (): SymbolKategori[] => symbolCategories.map((k) => ({');
    expect(page).toContain('id: k.name, rubrik: k.name,');
    expect(page).toContain('poster: k.symbols.map((s) => postVy({ typ: \'symbol\', id: s.id }, arFastNu({ typ: \'symbol\', id: s.id }))),');
    expect(page).toContain('dockFarg: getIconDef(p.id).bg');
  });
});

describe('Lager: samma grupper i samma ordning som den gamla Lager-menyn', () => {
  const lager = mellan(page, 'const byggLager = (): LagerGrupp[] => {', 'const byggPlusRad = ');
  it('grupperna kommer i ordningen Bakgrundskarta, Kompass, Overlay, WMS-grupperna, SMHI, Dina markeringar, Produktionsdata, Zontyper, Linjetyper, Varningsinställningar', () => {
    const ordning = Array.from(lager.matchAll(/g\.push\(\{\s*id: [`']([^`'$]+)/g)).map((m) => m[1]);
    expect(ordning).toEqual(['bakgrundskarta', 'kompass', 'overlay', 'wms-', 'smhi', 'markeringar', 'produktionsdata', 'zontyper', 'linjetyper', 'skotad-trakt', 'varning']);   // 'skotad-trakt' = skotarens rad "Trakten färdigskotad" (bara skotare, lib/skotarLass)
    // WMS-grupperna kommer ur samma lista som förut (lib/mapLayers), i dess ordning
    expect(lager).toContain('for (const grp of wmsLayerGroups) {');
  });
  it('bakgrundskartorna är de fyra som fanns, med samma namn och beskrivningar', () => {
    for (const rad of [
      "{ id: 'lantmateriet', name: 'Karta', desc: 'Lantmäteriet — dämpad' }",
      "{ id: 'satellite', name: 'Flygfoto', desc: 'Lantmäteriet ortofoto 0,5 m' }",
      "{ id: 'terrain', name: 'Topokarta', desc: 'Lantmäteriet — full färg' }",
      "{ id: 'osm', name: 'OpenStreetMap', desc: 'Standardkarta' }",
    ]) expect(lager).toContain(rad);
    expect(lager).toContain('onTryck: () => setMapType(t.id)');
  });
  it('Produktionsdata har kvar alla fyra raderna (Avverkade stammar, GROT, Mitt spår, andra maskinens spår) och skriver samma state', () => {
    const p = mellan(lager, "id: 'produktionsdata'", "if (visibleLayers.zones)");
    for (const s of ["'Avverkade stammar'", "'GROT (grenar & toppar)'", "'Mitt spår'", "'Skördarens spår' : 'Skotarens spår'", "sla('produktionshogar')", "sla('grothogar')", "sla('mittSpar')", "sla('andrasSpar')"]) expect(p, s).toContain(s);
  });
  it('Dina markeringar, Zontyper, Linjetyper och Varningsinställningar skriver samma state som den gamla menyn', () => {
    expect(lager).toContain("[['symbols', 'Symboler'], ['lines', 'Linjer'], ['zones', 'Zoner'], ['arrows', 'Pilar']]");
    expect(lager).toContain('setVisibleLayers((prev) => ({ ...prev, [id]: !prev[id] }))');
    expect(lager).toContain('setVisibleZones((prev) => ({ ...prev, [z.id]: prev[z.id] === false }))');
    expect(lager).toContain("lineTypes.filter((l) => !l.id.includes('sideRoad') && !l.id.includes('backRoad'))");
    expect(lager).toContain('setVisibleLines((prev) => ({ ...prev, [l.id]: prev[l.id] === false }))');
    expect(lager).toContain('if (visibleLayers.zones) {');
    expect(lager).toContain('if (visibleLayers.lines) {');
    expect(lager).toContain('setWarningMenuOpen(true)');
  });
  it('Kompass visar ingen "Av"-text', () => {
    const k = mellan(lager, "id: 'kompass',", "g.push({ id: 'overlay'");
    expect(k).toContain(": korvyKompass === 'saknas' ? 'Ingen kompass på enheten' : undefined");
    expect(k).not.toMatch(/'Av'/);
  });
  it('det som tvingas i körvyn tvingas av kartans effekter — listan rör dem inte', () => {
    expect(page).toContain("const KORVY_SKYDDSLAGER = new Set(['nyckelbiotoper', 'biotopskydd', 'vattenskydd', 'naturreservat', 'natura2000', 'sumpskog', 'kraftledningar']);");
    expect(lager).not.toContain('KORVY_SKYDDSLAGER');
  });
});

describe('Ytor och Spårning: inga flikar — Ytor ligger i objektinfon (Om trakten) som förut, spårens reglage bara i Lager', () => {
  it('YTOR-listan räknas som före PR:en och ritas i Om trakten — och arket vet inget om ytor', () => {
    expect(page).toContain('// === YTOR — en rad per NUMRERAD yta (Vidas hänsynsytor + traktdel-bitar + egna områden), i');
    expect(page).toContain("ytor.push({ nr, typ: 'hansyn', typLabel: 'Hänsynsyta'");
    expect(page).toContain("ytor.push({ nr, typ: 'traktdel', typLabel: 'Traktdel'");
    expect(page).toContain("ytor.push({ nr, typ: 'omrade', typLabel: 'Eget område'");
    expect(page).toContain('ytor.sort((a, b) => a.nr - b.nr);');
    expect(page).toContain('ytor: ovrigaYtor.map((y) => ({ nr: y.nr, typLabel: y.typLabel');   // traktdelar och egna områden matas som ytor; Vidas hänsynsytor är markeringar (samma rad som våra)
    expect(las('../components/planering/OmTrakten.tsx')).toContain('data-testid="om-yta"');   // ytorna är en typrad ("Hänsynsytor · 2 st") och listas i typvyn
    expect(page).not.toContain('byggYtor');
    const ark = las('../components/planering/PlusArk.tsx');
    expect(ark).not.toMatch(/ytor|Ytor/);
  });
  it('ingen Spårning-flik: hyttspårens reglage (Mitt spår, andra maskinens spår) finns bara i Lager › Produktionsdata', () => {
    expect(page).not.toContain('byggSparning');
    const ark = las('../components/planering/PlusArk.tsx');
    expect(ark).not.toMatch(/sparning|Spårning/);
    const lager = mellan(page, 'const byggLager = (): LagerGrupp[] => {', 'const byggPlusRad = ');
    expect(lager).toContain("vaxel('mittSpar', 'Mitt spår'");
    expect(lager).toContain("andrasRoll === 'skordare' ? 'Skördarens spår' : 'Skotarens spår'");
    // …och inget annat ställe i arket bygger reglagen
    const bygg = mellan(page, 'const byggRita = ', 'const byggLager = ');
    expect(bygg).not.toContain('mittSpar');
  });
  it('"Uppdatera spår" ligger i objektinfons Mer › Körvy, mellan Kartdata och Avsluta körvy som förut', () => {
    expect(page).toContain("andrasSparText: andrasRoll ? (andrasRoll === 'skordare' ? 'Uppdatera skördarens spår' : 'Uppdatera skotarens spår') : null,");
    expect(page).toContain('andrasSpar: efter(() => { hamtaAndrasSpar(); }),');
    const mer = las('../lib/objektKort.ts');
    expect(mer.indexOf("id: 'andras-spar'")).toBeGreaterThan(mer.indexOf("id: 'kartdata'"));
    expect(mer.indexOf("id: 'andras-spar'")).toBeLessThan(mer.indexOf("id: 'avsluta-korvy'"));
  });
});

describe('Rita & mät: ÅTTA rutor — alla ritverktyg (och Snitsla stickvägar), inga dubbletter, och ingen annanstans', () => {
  const rita = mellan(page, 'const byggRita = ', '// Spårens förhandsfärg');
  const tryck = mellan(page, 'const trycktPlusPost = ', 'const placeraListSynlig');
  it('åtta rutor i den här ordningen: Rita linje, Rita yta, Nytt område (alla), Pilar, Mät sträcka, Mät yta, Spåra med GPS, Snitsla stickvägar (förut Gallring i objektinfons meny) — EN Spåra med GPS, ingen egen "Spåra basväg"', () => {
    const ids = Array.from(rita.matchAll(/\{ id: '([a-z]+)', titel:/g)).map((m) => m[1]);
    expect(ids).toEqual(['linje', 'yta', 'omrade', 'pilar', 'strackan', 'matyta', 'gps', 'stickvagar']);
    expect(rita).not.toContain('Spåra basväg');
    expect(page).not.toContain("subMenu === 'gps-basvag'");
    expect(rita).toContain("setActiveCategory('gallring'); setMenuOpen(true);");   // samma Gallring-ark som förut
    expect(rita).not.toContain('isAdminRiktig');   // Nytt område för alla: ersätter Spara som › Yta, som alla (även förare) hade
    expect(rita).toContain("{ id: 'omrade', titel: 'Nytt område', ikon: 'omrade', onTryck:");
  });
  it('INGA dubbletter: rutorna Linjer, Zoner och Mätning finns inte (de gjorde samma sak som Rita linje, Rita yta och Mät sträcka/Mät yta)', () => {
    for (const s of ["titel: 'Linjer'", "titel: 'Zoner'", "titel: 'Mätning'", "id: 'linjer'", "id: 'zoner'", "id: 'matning'", 'oppnaMeny', "setActiveCategory('measure')"]) expect(rita, s).not.toContain(s);
    const ark = las('../components/planering/PlusArk.tsx');
    expect(ark).toContain("export type RitaIkonId = 'linje' | 'yta' | 'strackan' | 'matyta' | 'gps' | 'omrade' | 'pilar' | 'stickvag';");
  });
  it('rutorna startar sina verktyg: Pilar öppnar pil-menyn, Nytt område samma ritläge, Mät sträcka/yta samma figur, Spåra med GPS samma undermeny', () => {
    for (const s of [
      "{ id: 'pilar', titel: 'Pilar', ikon: 'pilar', onTryck: () => { stangPlus(); avslutaPagaendeLage(); setActiveCategory('arrows'); setMenuOpen(true); } }",
      "stangPlus(); avslutaPagaendeLage(); const map = mapInstanceRef.current; setOmradeRitning(true); if (map) map.easeTo({ pitch: 0, bearing: 0, duration: 400 });",
      "id: 'strackan', titel: MAT_NAMN.strackan, ikon: 'strackan', onTryck: () => trycktPlusPost('matning:strackan')",
      "id: 'matyta', titel: MAT_NAMN.yta, ikon: 'matyta', onTryck: () => trycktPlusPost('matning:yta')",
      "id: 'gps', titel: 'Spåra med GPS', ikon: 'gps', onTryck: () => { stangPlus(); avslutaPagaendeLage(); setActiveCategory('lines'); setSubMenu('gps-lines'); setMenuOpen(true); }",
      "id: 'linje', titel: RITA_NAMN.linje, ikon: 'linje', onTryck: () => trycktPlusPost('rita:linje')",
      "id: 'yta', titel: RITA_NAMN.yta, ikon: 'yta', onTryck: () => trycktPlusPost('rita:yta')",
    ]) expect(rita, s).toContain(s);
  });
  it('Rita linje / Rita yta: typlistan FÖRST, i körvyn (hytten) OCH planeringsvyn — linjetyperna direkt (inget tomt mellansteg), zontyperna; ingen ritfigur för dem', () => {
    expect(tryck).toContain("if (post.typ === 'matning') startaFigur(yta);");
    expect(tryck).toContain("else if (yta) { setActiveCategory('zones'); setMenuOpen(true); }");
    expect(tryck).toContain("else { setActiveCategory('lines'); setSubMenu('draw-lines'); setMenuOpen(true); }");
    expect(tryck).not.toContain('korvyActive');           // ingen vy-skillnad längre
    expect(tryck.split('startaFigur(').length - 1).toBe(1); // bara Mät sträcka/yta startar mätfiguren
  });
  it('Rita linje/Rita yta (hytten ritar nu med typ först): ett tryck inne i trakten är en PUNKT — Vida-ytkortet (ytfyllnad och ytnummer) öppnas inte under ritning', () => {
    expect(page).toContain('const ritlageRef = useRef(false);');
    expect(page).toContain('ritlageRef.current = isDrawMode || isZoneMode;');
    const vida = mellan(page, 'const onYtaNrKlick = (e: any) => {', 'if (larmPlacering) return;');
    expect(vida).toContain('if (ritlageRef.current) return;');
    const fyll = mellan(page, '// urvalsritning: tryck = hörn\n      if (ritlageRef.current)', 'if (larmPlacering) return;');
    expect(fyll).toContain('ritlageRef.current');
    expect(page.split('if (ritlageRef.current) return;').length - 1).toBe(2);
  });
  it('Mätning-menyn (Mät avstånd/area; nåddes bara via den borttagna Mätning-rutan — samma anrop som Mät sträcka/yta) är borta', () => {
    expect(page).not.toContain("activeCategory === 'measure'");
    expect(page).not.toContain("{ id: 'measure', name: 'Mätning'");
    expect(page).not.toContain('{/* === MÄTNING === */}');
    expect(page).not.toContain('Mät avstånd');
    expect(page).not.toContain("setActiveCategory('measure')");
  });
  it('typlistorna är oförändrade: samma filter och samma klick för linjetyper (rita och GPS), samma zontyper med Gallringszonens trädslag', () => {
    const rit = mellan(page, '{/* Linjer - Rita */}', '{/* === ZONER === */}');
    const gps = mellan(page, '{/* Linjer - GPS */}', '{/* Linjer - Rita */}');
    const filter = "lineTypes.filter(t => t.id !== 'boundary' && !t.id.includes('sideRoad') && !t.id.includes('backRoad')).map(type => (";
    // Rita linje OCH Spåra med GPS visar SAMMA lista (ritaLinjeTyper, se enRad.vakter.test.ts): Basväg som EN rad först, övriga linjetyper som förut
    expect(rit).toContain('typer={ritaLinjeTyper}');
    expect(gps).toContain('typer={ritaLinjeTyper}');
    expect(page).toContain("const ritaLinjeTyper = lineTypes.filter(t => t.id !== 'boundary' && !t.id.includes('sideRoad') && !t.id.includes('backRoad'));");
    expect(filter).toContain("lineTypes.filter(t => t.id !== 'boundary'");
    expect(rit).toContain('setDrawType(type.id);');
    expect(rit).toContain('setDrawFarg(null);');   // övriga linjetyper har ingen färg; Basväg startar via startaBasvagRita
    expect(rit).toContain('setIsDrawMode(true);');
    expect(gps).toContain('startGpsTracking(type.id);');
    const zon = mellan(page, '{/* === ZONER === */}', '{/* === PILAR === */}');
    expect(zon).toContain('zoneTypes.map(type => (');
    expect(zon).toContain('{gallringExpanded && GALLRING_TRADSLAG.map(ts => (');
    expect(zon).toContain('setIsZoneMode(true);');
  });
  it('Linjer-menyns tomma rotsteg är borta (en rad "Rita manuellt" som bara ledde vidare); typlistan har inget steg bakom sig, så tillbakapilen visas inte där', () => {
    expect(page).not.toContain("{activeCategory === 'lines' && !subMenu && (");
    expect(page).toContain("{subMenu && activeCategory !== 'lines' ? (");
    expect(page.split("setSubMenu('draw-lines')").length - 1).toBe(1);   // bara Rita linje går dit
  });
  it('gamla Symboler-menyn (död kod, nåddes inte längre) är borta; symbolerna väljs i Symboler-fliken', () => {
    expect(page).not.toContain("activeCategory === 'symbols'");
    expect(page).not.toContain("{ id: 'symbols', name: 'Symboler', desc");
    expect(page).not.toContain('{/* === SYMBOLER === */}');
    expect(page).toContain('const byggSymbolKategorier = ');
  });
  it('INGET ritverktyg finns kvar i objektinfons Mer (de ska bara finnas på ett ställe): ingen RITA PÅ KARTAN-grupp, inga ritstarter', () => {
    const fv = las('../lib/objektKort.ts') + las('../components/planering/MerMeny.tsx');
    expect(fv).not.toContain('RITA PÅ KARTAN');
    expect(fv).not.toContain('rita-pa-kartan');
    for (const s of ["setActiveCategory('symbols')", "setActiveCategory('lines')", "setActiveCategory('zones')", "setActiveCategory('arrows')", "setActiveCategory('measure')", 'setOmradeRitning(true)', "label: 'Nytt område'"]) expect(fv, s).not.toContain(s);
  });
  it('Spåra med GPS finns på ETT ställe: rutan (öppnar GPS-undermenyn; startGpsTracking oförändrad)', () => {
    expect(page.split("setSubMenu('gps-lines')").length - 1).toBe(1);
    const gps = mellan(page, '{/* Linjer - GPS */}', '{/* Linjer - Rita */}');
    expect(gps).toContain('startGpsTracking(type.id);');
  });
  it('arket har ingen egen kopia av verktygen i Mer (de ska bara finnas på ett ställe)', () => {
    const fv = las('../lib/objektKort.ts') + las('../components/planering/MerMeny.tsx');
    expect(fv).not.toContain('RITA OCH MÄT');
    for (const p of ["trycktPlusPost('rita:linje')", "trycktPlusPost('rita:yta')", "trycktPlusPost('matning:strackan')", "trycktPlusPost('matning:yta')"]) expect(fv, p).not.toContain(p);
    // …och byggs bara i arket
    for (const p of ["trycktPlusPost('rita:linje')", "trycktPlusPost('matning:yta')"]) expect(page.split(p).length - 1, p).toBe(1);
  });
});

describe('Mer (tavla 27): varje gammalt menyval finns kvar eller har flyttat — inget tappat', () => {
  const mer = las('../lib/objektKort.ts');
  const merVy = las('../components/planering/MerMeny.tsx');
  it('Mer har gruppernas rubriker Körvy · Föraren · Planeraren · Övrigt, och Avsluta objekt för sig', () => {
    const titlar = Array.from(mer.matchAll(/titel: '([^']+)'/g)).map((m) => m[1]);
    expect(titlar).toEqual(expect.arrayContaining(['Körvy', 'Föraren', 'Planeraren', 'Övrigt']));
    expect(merVy).toContain('data-testid="mer-avsluta-objekt"');
  });
  it('gamla val som finns kvar i Mer, med samma handling i sidan', () => {
    for (const rad of [
      "korvyBasKarta === 'lm' ? 'Baskarta: Karta → Topokarta' : 'Baskarta: Topokarta → Karta'", 'gpsText: korvyStatus.gpsText', 'dataText: korvyStatus.dataText',
      "avslutaKorvy: efter(() => { setKorvyActive(false); setKorvyForceRoll(null); }),",
      "skordarKorvy: efter(() => { unlockKorvyLjud(); setKorvyForceRoll('skordare'); setKorvyActive(true); }),",
      "skotarKorvy: efter(() => { setKorvyForceRoll('skotare'); setKorvyActive(true); }),",
      "skotning: efter(() => { setActiveCategory('skotning'); setMenuOpen(true); }),",
      'markeraUtkort: efter(startaMarkeraUtkort),',
      "trakt: efter(() => { setTraktOpen(true); }),",
      "vagdata: efter(() => { korOmVagdata(); }),",
      "genomgang: efter(() => { setBriefingMode(true); setActiveCategory(null); }),",
      "installningar: efter(() => oppnaInst(false)),",
    ]) expect(page, rad).toContain(rad);
  });
  it('Checklista (Vidas egenkontroll, checklist_items) är borta ur Mer › Övrigt — datan och genomgångens egen väg dit rörs inte', () => {
    expect(mer).not.toContain("id: 'checklista'");
    expect(page).not.toContain('checklista: efter(');
    expect(page).toContain('setChecklistOpen(false)');   // modalen finns kvar för Genomgång & kvittering
    expect(las('../lib/objektInfoSpar.ts')).toContain('checklist_items');   // kolumnen sparas som förut
  });
  it('Briefing + Kvittera markeringar blev ETT val (Genomgång & kvittering); genomgången slutar redan i kvitteringen', () => {
    expect(mer).toContain("etikett: 'Genomgång & kvittering'");
    expect(mer).not.toContain("etikett: 'Briefing'");
    expect(mer).not.toContain("etikett: 'Kvittera markeringar'");
    expect(las('../app/planering/TraktBriefing.tsx')).toContain('setChecklistOpen(true);');
  });
  it('borta ur menyn: Byt objekt (namnet och ⌂ gör det), Brandrisk (kortet och lagret), Gallring (ligger i +), Inställningar och Förslag (startsidan, utom maskindator/körvy)', () => {
    expect(page).not.toContain("label: 'Byt objekt'");
    expect(mer).not.toContain('Byt objekt');
    expect(mer).not.toContain("etikett: 'Brandrisk'");
    expect(mer).not.toContain("etikett: 'Gallring'");
    expect(las('../app/HomeClient.tsx')).toContain("href: '/planering?installningar=1'");
    expect(page).toContain("u.searchParams.get('installningar') !== '1'");
  });
  it('Mer › Planeraren har bara VY-växlaren (admin); Tilldelning och "Klar — skicka till förare" är borta — Klar för maskin bor i Klar med trakten?', () => {
    for (const s of ['visaSom: isAdminRiktig ? {', 'handleVaxlaVy(id)']) expect(page, s).toContain(s);
    for (const s of ['handleAssignSkordare', 'handleAssignSkotare', 'handleSendKlar', 'onSkicka:']) expect(page, s).not.toContain(s);
    for (const s of ["'Klar — skicka till förare'", 'Skickad till förare', 'mer-tilldelning']) expect(merVy, s).not.toContain(s);
    // Klar för maskin: samma status + tidsstämpel som den gamla knappen, och spärrar aldrig
    expect(page).toContain("{ status: STATUS_PLANERAD, klar_skickad_timestamp: nowIso }");
    expect(las('../components/planering/KlarMedTrakten.tsx')).toContain("data-testid=\"klar-for-maskin\"");
  });
  it('ett val i Mer stänger objektinfon (som Fler val gjorde)', () => {
    expect(page).toContain('const efter = (f: () => void) => () => { if (typeof navigator !== \'undefined\' && navigator.vibrate) navigator.vibrate(8); f(); stang(); };');
  });
});

describe('ingångarna till Lager-fliken — den gamla helskärmsmenyn är borta, så alla vägar dit måste leda till arket', () => {
  it('objektinfons Lager-rad och Inställningar → Karta → Lager öppnar arket på Lager-fliken', () => {
    expect(page).toContain("lager: efter(() => oppnaPlusArk('lager')),");
    expect(page).toContain("oppnaPlusArk('lager');   // Lager bor i plusarkets Lager-flik");
    expect(page).toContain('const oppnaPlusArk = (flik: FlikId) => { setLangtryckPunkt(null); setPlusArkStart(flik); setPlusRadOppen(true); };');
  });
  it('PlusRad startar direkt i arket på angiven flik, och en ny flik ommonterar den (key)', () => {
    const rad = las('../components/planering/PlusRad.tsx');
    expect(rad).toContain('const [visaAlla, setVisaAlla] = useState(!!startFlik);');
    expect(rad).toContain("const [flik, setFlik] = useState<FlikId>(startFlik ?? 'symboler');");
    // nyckeln = öppningsnummer + startflik; fryst medan panelen glider ut (annars byts den när plusArkStart nollas och panelen blinkar bort)
    expect(page).toContain("nyckel: `${plusEpokRef.current}:${plusArkStart ?? 'docka'}`");
    expect(page).toContain('key={plusRadVisning.nyckel}');
    expect(page).toContain('startFlik={plusRadVisning.start}');
  });
  it('plusknappen och stängning nollar startfliken, så nästa öppning börjar i dockan', () => {
    expect(page).toContain('const stangPlus = () => { setPlusRadOppen(false); setLangtryckPunkt(null); setPlusArkStart(null); };');
    expect(page).toContain('else { setPlusArkStart(null); setPlusRadOppen(true); }');
  });
});

describe('Redigera: Återställ längst ner (en väg tillbaka) — och inget "Lossa" på långtryck', () => {
  const ark = las('../components/planering/PlusArk.tsx');
  const rad = las('../components/planering/PlusRad.tsx');
  it('Återställ är röd text (KNAPP.destruktiv) LÄNGST NER i Redigera: efter symbolgrunden, bara medan man redigerar, inaktiv utan fasta platser', () => {
    const sym = mellan(ark, 'const symbolerFlik = (', '// RITA & MÄT:');
    expect(sym).toContain('{redigerar && (');
    expect(sym).toContain('data-testid="plus-ark-aterstall"');
    expect(sym).toContain('...KNAPP.destruktiv');
    expect(sym).toContain('...(harFasta ? null : INAKTIV)');
    expect(sym.indexOf('plus-ark-aterstall')).toBeGreaterThan(sym.indexOf('data.symboler.map'));   // efter alla symboler = längst ner
    expect(ark).toContain('const harFasta = dockNu.some((p) => p.fast);');
  });
  it('Återställ frågar först i appens egen dialog (appDialog, samma som Numrera om) och gör inget förrän man bekräftar; sedan lämnar Redigera', () => {
    expect(ark).toContain('const aterstall = () => onAterstall(() => { setRedigerar(false); setLista([]); });');
    const h = mellan(page, 'const aterstallPlusDocka = ', '// ── MÄT/RITA i körvyn');
    expect(h).toContain('setAppDialog({');
    expect(h).toContain("okLabel: 'Återställ', cancelLabel: 'Avbryt',");
    expect(h).toContain('onOk: () => { uppdateraPlusRad((s) => aterstallDocka(s)); klart(); },');
    // inget skrivs utanför onOk
    expect(h.split('uppdateraPlusRad').length - 1).toBe(1);
    expect(page).toContain('onAterstall={aterstallPlusDocka}');
  });
  it('Esc och klick bakom lämnar dialogen ifred: Esc går inte till arket medan en modal dialog ligger ovanpå', () => {
    expect(ark).toContain("!document.querySelector('[role=\"dialog\"][aria-modal=\"true\"]')");
  });
  it('INGET Lossa: håll-kortet finns bara för automatiska symboler ("Fast i dockan"); ett långt tryck på en fast symbol gör ingenting; ingen lossa-kod kvar', () => {
    expect(rad).toContain('lt.start(() => { if (!p.fast) setHall(');
    expect(rad).toContain('Fast i dockan');
    expect(rad).not.toMatch(/[Ll]ossa|onLossa/);
    expect(page).not.toMatch(/lossaPost|lossaPlusPost|onLossa/);
    expect(page).not.toContain('lossa en först');
  });
});

describe('arkets form', () => {
  it('tre flikar i rätt ordning', () => {
    expect(FLIKAR.map((f) => f.etikett).join(' · ')).toBe('Symboler · Rita & mät · Lager');
  });
  it('mus: Esc stänger arket (lyssnaren sitter bara medan arket är öppet), klick på gripen växlar halv/hel, hjulet stannar i arket, inget hovring-beroende', () => {
    const ark = las('../components/planering/PlusArk.tsx');
    expect(ark).toContain("if (e.key === 'Escape' && !document.querySelector('[role=\"dialog\"][aria-modal=\"true\"]')) { e.preventDefault(); stangRef.current(); }");
    expect(ark).toContain("window.addEventListener('keydown', tangent);");
    expect(ark).toContain("return () => window.removeEventListener('keydown', tangent);");
    expect(ark).toContain("else setDetent(detent === 'halv' ? 'hel' : 'halv');");   // utan drag = klick på gripen
    // hjulet stannar i arket: både arket självt och dess scrollyta spärrar överscroll (annars kedjar det vidare till sidan/kartan)
    expect(ark).toContain("display: 'flex', flexDirection: 'column', overscrollBehavior: 'contain',");
    expect(ark).toContain("overflowY: 'auto', WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain'");
    expect(ark).not.toMatch(/onMouseEnter|onMouseOver|onMouseLeave|:hover|hover/);
    // klick på kartan ovanför (bakgrunden) stänger
    expect(ark).toContain('<div data-testid="plus-bakgrund" onClick={stangBakgrund}');
  });
  it('ingen "Fler val", ingen rubrik "Alla", ingen "‹ Dockan" i arket', () => {
    const ark = las('../components/planering/PlusArk.tsx');
    expect(ark).not.toContain('Fler val');
    expect(ark).not.toContain('Dockan</');
    expect(ark).not.toMatch(/<span[^>]*>Alla<\/span>/);
  });
  it('Redigera sparar via Klar och bara om något ändrats; kryss stänger arket och kastar ändringen (inget sparas utan Klar)', () => {
    const ark = las('../components/planering/PlusArk.tsx');
    expect(ark).toContain('if (arAndrad(dockPosterNu, lista)) onSparaDocka(lista.map(postNyckel));');
    expect(ark).toContain('data-testid="plus-alla-stang" onClick={onStang}');
    // onSparaDocka anropas på ETT ställe: Klar
    expect(ark.match(/onSparaDocka\(/g)).toHaveLength(1);
  });
});
