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
    expect(ordning).toEqual(['bakgrundskarta', 'kompass', 'overlay', 'wms-', 'smhi', 'markeringar', 'produktionsdata', 'zontyper', 'linjetyper', 'varning']);
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

describe('Ytor och Spårning: inga flikar — Ytor ligger i objektinfon som förut, spårens reglage bara i Lager', () => {
  it('YTOR-listan ligger i objektinfon, ordagrant som före PR:en (uträkning, rendering, harAnnat) — och arket vet inget om ytor', () => {
    expect(page).toContain('// === YTOR — en rad per NUMRERAD yta (Vidas hänsynsytor + traktdel-bitar + egna områden), i');
    expect(page).toContain("ytor.push({ nr, typ: 'hansyn', typLabel: 'Hänsynsyta'");
    expect(page).toContain("ytor.push({ nr, typ: 'traktdel', typLabel: 'Traktdel'");
    expect(page).toContain("ytor.push({ nr, typ: 'omrade', typLabel: 'Eget område'");
    expect(page).toContain('ytor.sort((a, b) => a.nr - b.nr);');
    expect(page).toContain('{/* YTOR — en rad per numrerad yta (hänsyn + traktdel-bitar + egna områden), i nummerordning.');
    expect(page).toContain('|| faroLinjer.length || ytor.length;');
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
  it('"Uppdatera spår" ligger i objektinfon (Fler val › KÖRVY), där den låg före PR:en', () => {
    const fv = mellan(page, 'const flerValGrupper = ()', 'const renderFlerVal =');
    expect(fv).toContain("...(andrasRoll ? [{ label: andrasRoll === 'skordare' ? 'Uppdatera skördarens spår' : 'Uppdatera skotarens spår', icon: 'refresh', action: () => { hamtaAndrasSpar(); } }] : []),");
    // i körvyns lista, mellan Kartdata och Avsluta körvy — som förut
    expect(fv.indexOf('Uppdatera skördarens spår')).toBeGreaterThan(fv.indexOf('label: korvyStatus.dataText'));
    expect(fv.indexOf('Uppdatera skördarens spår')).toBeLessThan(fv.indexOf("label: 'Avsluta körvy'"));
  });
});

describe('Rita & mät: stora rutor i arket, bara på ETT ställe', () => {
  const rita = mellan(page, 'const byggRita = ', '// Spårens förhandsfärg');
  it('fyra verktyg som förut (samma flöden via trycktPlusPost) + Spåra med GPS (Linjer-menyns egen väg, samma startGpsTracking)', () => {
    for (const s of [
      "id: 'linje', titel: RITA_NAMN.linje, ikon: 'linje', onTryck: () => trycktPlusPost('rita:linje')",
      "id: 'yta', titel: RITA_NAMN.yta, ikon: 'yta', onTryck: () => trycktPlusPost('rita:yta')",
      "id: 'strackan', titel: MAT_NAMN.strackan, ikon: 'strackan', onTryck: () => trycktPlusPost('matning:strackan')",
      "id: 'matyta', titel: MAT_NAMN.yta, ikon: 'matyta', onTryck: () => trycktPlusPost('matning:yta')",
      "id: 'gps', titel: 'Spåra med GPS', ikon: 'gps', onTryck: () => { stangPlus(); setActiveCategory('lines'); setSubMenu('gps-lines'); setMenuOpen(true); }",
    ]) expect(rita, s).toContain(s);
  });
  it('Spåra med GPS finns kvar i Linjer-menyn (menyn är oförändrad) och startar samma startGpsTracking', () => {
    expect(page).toContain("onClick={() => setSubMenu('gps-lines')}");
    expect(page).toContain('startGpsTracking(type.id);');
  });
  it('arket har ingen egen kopia av verktygen i Fler val-blocket (de ska bara finnas på ett ställe)', () => {
    const fv = mellan(page, 'const flerValGrupper = ()', 'const renderFlerVal =');
    expect(fv).not.toContain('RITA OCH MÄT');
    for (const p of ["trycktPlusPost('rita:linje')", "trycktPlusPost('rita:yta')", "trycktPlusPost('matning:strackan')", "trycktPlusPost('matning:yta')"]) expect(fv, p).not.toContain(p);
    // …och byggs bara i arket
    for (const p of ["trycktPlusPost('rita:linje')", "trycktPlusPost('matning:yta')"]) expect(page.split(p).length - 1, p).toBe(1);
  });
});

describe('Fler val: allt som fanns ligger kvar, nu i objektinfon', () => {
  const fv = mellan(page, 'const flerValGrupper = ()', 'const renderFlerVal =');
  const rend = mellan(page, 'const renderFlerVal =', 'const fastnaPlusPost');
  it('alla sju gamla grupptitlar finns kvar (och inga nya)', () => {
    const titlar = Array.from(fv.matchAll(/titel: '([^']+)'/g)).map((m) => m[1]);
    expect(titlar).toEqual(['RITA PÅ KARTAN', 'KÖRVY', 'SKOTARE', 'INFORMATION', 'FLÖDEN', 'OBJEKT', 'ÖVRIGT']);
  });
  it('varje gammalt val finns kvar med samma handling', () => {
    for (const rad of [
      "label: 'Symboler', icon: 'category', action: () => { setActiveCategory('symbols'); setMenuOpen(true); }",
      "label: 'Linjer', icon: 'timeline', action: () => { setActiveCategory('lines'); setMenuOpen(true); }",
      "label: 'Zoner', icon: 'crop_square', action: () => { setActiveCategory('zones'); setMenuOpen(true); }",
      "label: 'Nytt område'",
      "label: 'Pilar', icon: 'arrow_outward', action: () => { setActiveCategory('arrows'); setMenuOpen(true); }",
      "label: 'Mätning', icon: 'straighten', action: () => { setActiveCategory('measure'); setMenuOpen(true); }",
      "korvyBasKarta === 'lm' ? 'Baskarta: Karta → Topokarta' : 'Baskarta: Topokarta → Karta'",
      'label: korvyStatus.gpsText', 'label: korvyStatus.dataText',
      "label: 'Avsluta körvy', icon: 'close', action: () => { setKorvyActive(false); setKorvyForceRoll(null); }, danger: true",
      "label: 'Skördarkörvy'", "label: 'Skotarkörvy'", "label: 'Körvy 2D'",
      "label: 'Skotning', icon: 'local_shipping', action: () => { setActiveCategory('skotning'); setMenuOpen(true); }",
      "label: 'Markera utkört'",
      "label: 'Brandrisk', icon: 'local_fire_department', action: () => { setActiveCategory('brandrisk'); setMenuOpen(true); }",
      "label: 'Trakt', icon: 'info', action: () => { setTraktOpen(true); }",
      "label: 'Gallring', icon: 'nature', action: () => { setActiveCategory('gallring'); setMenuOpen(true); }",
      "label: 'Briefing'", "label: 'Kvittera markeringar'", "label: 'Checklista'",
      "label: 'Vägdata'", "label: 'Avsluta objekt'",
      "...(korvyActive ? [] : [{ label: 'Inställningar'",
      "label: 'Förslag'", "label: 'Byt objekt'",
    ]) expect(fv, rad).toContain(rad);
  });
  it('VY-växlaren (admin), AKTUELLT OBJEKT (tilldelning) och "Klar — skicka till förare" finns kvar, med samma handlers', () => {
    for (const s of ['{isAdminRiktig && (', 'handleVaxlaVy(item.id)', '!isForare && valtObjekt && valtObjekt.status !== \'avslutat\'', 'handleAssignSkordare', 'handleAssignSkotare', 'onClick={handleSendKlar}', "'Klar — skicka till förare'", 'Skickad till förare']) expect(rend, s).toContain(s);
  });
  it('objektinfon renderar blocket, och ett val stänger objektinfon', () => {
    expect(page).toContain('{renderFlerVal(stang)}');
    expect(rend).toContain('item.action(); stangInfo();');
  });
});

describe('ingångarna till Lager-fliken — den gamla helskärmsmenyn är borta, så alla vägar dit måste leda till arket', () => {
  it('objektinfons Lager-rad och Inställningar → Karta → Lager öppnar arket på Lager-fliken', () => {
    expect(page).toContain("gor: () => { stang(); oppnaPlusArk('lager'); }");
    expect(page).toContain("oppnaPlusArk('lager');   // Lager bor i plusarkets Lager-flik");
    expect(page).toContain('const oppnaPlusArk = (flik: FlikId) => { setLangtryckPunkt(null); setPlusArkStart(flik); setPlusRadOppen(true); };');
  });
  it('PlusRad startar direkt i arket på angiven flik, och en ny flik ommonterar den (key)', () => {
    const rad = las('../components/planering/PlusRad.tsx');
    expect(rad).toContain('const [visaAlla, setVisaAlla] = useState(!!startFlik);');
    expect(rad).toContain("const [flik, setFlik] = useState<FlikId>(startFlik ?? 'symboler');");
    expect(page).toContain("key={plusArkStart ?? 'docka'}");
    expect(page).toContain('startFlik={plusArkStart}');
  });
  it('plusknappen och stängning nollar startfliken, så nästa öppning börjar i dockan', () => {
    expect(page).toContain('const stangPlus = () => { setPlusRadOppen(false); setLangtryckPunkt(null); setPlusArkStart(null); };');
    expect(page).toContain('else { setPlusArkStart(null); setPlusRadOppen(true); }');
  });
});

describe('arkets form', () => {
  it('tre flikar i rätt ordning', () => {
    expect(FLIKAR.map((f) => f.etikett).join(' · ')).toBe('Symboler · Rita & mät · Lager');
  });
  it('mus: Esc stänger arket (lyssnaren sitter bara medan arket är öppet), klick på gripen växlar halv/hel, hjulet stannar i arket, inget hovring-beroende', () => {
    const ark = las('../components/planering/PlusArk.tsx');
    expect(ark).toContain("if (e.key === 'Escape') { e.preventDefault(); stangRef.current(); }");
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
