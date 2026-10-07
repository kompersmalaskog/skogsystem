import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// Vakt mot att körvyns nya meny/snabbtryck (pill, plusrad, placering, prickar, Mät/Rita, kvitto) kopplas bort eller läcker in i planeringsvyn.
// planering/page.tsx är 23 000 rader och körs inte i enhetstester; beteendet är provat i den riktiga sidan (testsele, se PR) och
// reglerna i lib/*.test.ts. Det här provet läser källan och låser kopplingarna — bryts något vid en merge eller refaktor larmar det.
const las = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const page = las('../app/planering/page.tsx');

describe('objektpillen: tre tryckytor i körvyn, planeringens gamla pill orörd', () => {
  it('den nya pillen ersätter den gamla ENDAST när körvyn är aktiv; planeringens pill är else-grenen', () => {
    expect(page).toContain('{korvyActive && valtObjekt ? (\n            <KorvyObjektPill');
    expect(page).toContain('          ) : (\n          /* Objekt-pill (glasig).');
    expect(page).toContain("onNamn={() => setTraktOversiktOpen(o => !o)}");
  });
  it('räknarna sätter en markering vid maskinen (aldrig en gammal/saknad position)', () => {
    expect(page).toContain("onHogstubbe={() => placeraVidMaskinen('highstump')}");
    expect(page).toContain("onEvighetstrad={() => placeraVidMaskinen('eternitytree')}");
    expect(page).toContain('const kan = kanPlaceraPaPosition(korvyEffectivePos, gpsFixFarsk);');
    expect(page).toContain("if (!kan.ok) { visaKvitto(placeringsFelText(kan.skal), 'fel'); return; }");
  });
  it('"efter" och objektinfons avverkat räknas ur SAMMA beräkning (skördarens hyttspår, 10 m buffert, klippt mot traktgränsen)', () => {
    expect(page).toContain(".eq('roll', 'skordare')");
    expect(page).toContain('avverkadAreaM2(segment, { ringar })');
    expect(page).toContain('status: kravStatus(miljoAntal.hogstubbar, miljoKravVal.hogstubbar, andelAvverkat)');
    expect(page).toContain('miljoKrav(infoAreal || valtObjekt?.areal, valtObjekt?.cert)');
    expect(page).toContain('data-testid="objektinfo-avverkat"');
  });
});

describe('plusraden: EN delad komponent för körvyn och planeringen', () => {
  it('plus-knappen öppnar raden i BÅDA vyerna; den gamla menyn nås via Alla › Fler val', () => {
    expect(page).toContain('if (plusMenuOpen) setPlusMenuOpen(false); else if (plusRadOppen) { setPlusRadOppen(false); setLangtryckPunkt(null); } else setPlusRadOppen(true);');
    expect(page).toContain('{plusRadOppen && (() => {\n        const { poster, alla } = byggPlusRad();');
    expect(page).toContain('onFlerVal={() => { setPlusRadOppen(false); setLangtryckPunkt(null); setPlusMenuOpen(true); }}');
    expect(page).toContain('{/* === PLUS-MENY (bottom sheet) === */}');   // den gamla menyn finns kvar, oförändrad
  });
  it('Inställningar har flyttat till objektinfon i körvy men finns kvar i planeringens gamla meny', () => {
    expect(page).toContain("...(korvyActive ? [] : [{ label: 'Inställningar'");
    expect(page).toContain('data-testid="objektinfo-verktyg"');
    expect(page).toContain('id="gps-kalla-kort"');
  });
  it('fasta och användning sparas per maskin (ej i testläge)', () => {
    expect(page).toContain('const s = hamtaPlusRad(enhetMaskinId);');
    expect(page).toContain('if (!testlageAktivRef.current) sparaPlusRad(enhetMaskinId, ny);');
    expect(page).toContain('const r = fastaPost(plusRadRef.current, post);');
  });
  it('lagerväxlarna i raden och i Lager-menyn är SAMMA lista och SAMMA växel', () => {
    expect(page).toContain('{overlayLista.map(overlay => (');
    expect(page).toContain("onClick={() => { overlay.enabled && vaxlaLager(overlay.id); }}");
    expect(page).toContain("if (post.typ === 'lager') { vaxlaLager(post.id); noteraPlus(post); return; }");
  });
});

describe('placering: en väg, exakt där trycket träffade, dragbart efteråt', () => {
  it('tryck på kartan, "Vid maskinen" och långtryck går alla genom placeraSymbol', () => {
    expect(page).toContain('placeraSymbolRef.current?.(selectedSymbol, lngLat.lat, lngLat.lng);');
    expect(page).toContain('placeraSymbolRef.current = placeraSymbol;');
    expect(page).toContain('if (punkt) placeraSymbol(post.id, punkt.lat, punkt.lng);');
    expect(page).toContain('else setSelectedSymbol(post.id);');
  });
  it('smal list "Tryck där … ska stå" — "Vid maskinen" bara i körvy — och inget hårkors i körvyn', () => {
    expect(page).toContain('text={`Tryck där ${symbolNamn(selectedSymbol)} ska stå`}');
    expect(page).toContain("...(korvyActive ? [{ etikett: 'Vid maskinen'");
    expect(page).toContain('(selectedSymbol && !korvyActiveRef.current)');
  });
  it('planeringen frågar antal som förut; körvyn ger kvitto med Ångra', () => {
    expect(page).toContain('if (!korvyActive && m.antal !== undefined) setAntalPrompt({ markerId: String(id), type: typ });');
    expect(page).toContain('if (korvyActive) visaKvitto(kvittoRubrik(symbolNamn(typ)), \'ok\', id);');
  });
  it('håll fingret på kartan öppnar raden — bara när inget annat läge pågår, aldrig på en symbol', () => {
    expect(page).toContain("setLangtryckPunkt({ lat: ll.lat, lng: ll.lng });\n        setPlusRadOppen(true);");
    expect(page).toContain('}, LANGTRYCK_MS);');
    expect(page).toContain('langtryckTillatenRef.current = !!valtObjekt && !plusRadOppen');
    expect(page).toContain("layers: ['markers-hit'].filter((l) => map.getLayer(l))");
  });
  it('symbolkort öppnas inte medan man placerar eller mäter', () => {
    expect(page).toContain('if (selectedSymbolRef.current || korvyFigurAktivRef.current) return;');
  });
  it('Ångra tar bort markeringen ur listan OCH databasen, och databasradering väntar in en pågående spar', () => {
    expect(page).toContain('setMarkers((prev: any[]) => angraMarkering(prev, id));\n    deleteMarkerFromDb(id);');
    expect(page).toContain("const pagar = markerSparPagarRef.current.get(String(markerId));\n    if (pagar) { try { await pagar; }");
    expect(page).toContain('markerSparPagarRef.current.set(id, sparning);');
  });
  it('markeringar satta via flödet går att dra (båda vyerna), men andra symboler panorerar som förut', () => {
    expect(page).toContain("map.on('mousedown', 'markers-hit', onDown);");
    expect(page).toContain('      e.preventDefault();\n      dragId = String(id);');
    expect(page).toContain('if (id == null || !korvyEgnaMarkorRef.current.has(String(id))) return;');
    expect(page).toContain('korvyEgnaMarkorRef.current.add(String(id));');
  });
});

describe('prickar: högstubbe/evighetsträd i körvyn', () => {
  it('egen prick-lager på markers-source, symbolerna filtrerar bort dem, planeringen visar full symbol', () => {
    expect(page).toContain("id: 'markers-prick',");
    expect(page).toContain("filter: ['==', ['get', 'prick'], true],");
    expect(page).toContain("filter: ['!=', ['get', 'prick'], true],");
    expect(page).toContain("const prick = korvyActive && arPrick(m.type);");
    expect(page).toContain("'markers-layer', 'markers-prick', 'markers-hit'");
  });
  it('lagret är På som standard och döljs av sitt eget reglage', () => {
    expect(page).toContain('if (korvyActive && arPrick(m.type) && !prickarSynliga(overlays)) return false;');
    expect(page).toContain('...(korvyActive ? [{ id: PRICK_LAGER_ID');
    expect(page).toContain('overlays[PRICK_LAGER_ID]]');
  });
  it('inget proximitetskort för prickar; tryck → litet kort med Ta bort', () => {
    expect(page).toContain('const symbolMarkers = markers.filter(m => m.isMarker && !arPrick(m.type));');
    expect(page).toContain("if (korvyActiveRef.current && arPrick(m.type)) { setPrickValt({ id: String(m.id), typ: String(m.type) }); return; }");
    expect(page).toContain('testid="prick-kort"');
    expect(page).toContain("{ etikett: 'Ta bort', onClick: taBortPrick, destruktiv: true, testid: 'prick-tabort' }");
  });
});

describe('Mät/Rita i körvyn OCH planeringen → Spara som', () => {
  it('EN smal list i båda vyerna: planeringens gamla mätpanel och låsta chip är borta, alla vägar startar samma figur', () => {
    expect(page).not.toContain('MÄTVERKTYG (geo, klicka-punkter)');
    expect(page).not.toContain('Tryck på kartan för att sätta punkter');
    expect(page).not.toContain('panorera mellan tryck');
    expect(page).not.toContain('const klarMatning');
    expect(page).not.toContain('{!korvyActive && measureLocked');
    expect(page).toContain('{figur && !sparaSomOppen && (() => {');
    expect(page).toContain('{figur && sparaSomOppen && (');
    expect(page).not.toContain('{korvyActive && figur');
    // plusdockan och den gamla Mätning-menyn startar båda figuren — aldrig den gamla startaMatning direkt
    expect(page).toContain("onClick={() => startaFigur(false)}");
    expect(page).toContain("onClick={() => startaFigur(true)}");
    expect(page).toContain("if (post.typ === 'matning') startaFigur(yta);");
    expect(page).toContain("else { setActiveCategory(yta ? 'zones' : 'lines'); setMenuOpen(true); }");
    expect(page.match(/startaMatning\(/g)?.length).toBe(1);   // bara startaFigur anropar den
  });
  it('pekaren är ett kors medan man mäter (klass på kartans container + !important i stilblocket)', () => {
    expect(page).toContain("c.classList.add('mat-kors');");
    expect(page).toContain('.maplibregl-canvas-container.mat-kors .maplibregl-canvas { cursor: crosshair !important; }');
  });
  it('tryck på första punkten stänger ytan; dubbeltryck på sista punkten avslutar sträckan', () => {
    expect(page).toContain('if (yta && geo.length >= 3 && nara(geo[0])) { figurKlarRef.current(); return; }');
    expect(page).toContain('if (geo.length >= minPunkterNu && nu - sistaPaSista < DUBBELTRYCK_MS) { sistaPaSista = 0; figurKlarRef.current(); return; }');
  });
  it('Klar är stor och grön i listen', () => {
    expect(page).toContain("gron: true, testid: 'figur-klar'");
    expect(las('../components/planering/KorvyNertillList.tsx')).toContain('k.gron ? FARG.gron');
  });
  it('räknarna i planeringens objektinfo (den gamla rutan nere till vänster är borta)', () => {
    expect(page).not.toContain('MILJÖHÄNSYN-RÄKNARE');
    expect(page).not.toContain('miljoRaknareExpanderad');
    expect(page).toContain('data-testid="objektinfo-miljo"');
    expect(page).toMatch(/\{!korvyActive && \(\s*<div data-testid="objektinfo-miljo"/);
  });
  it('Klar → Spara som: vanlig markering via planeringens form och markörsynk, synlig för alla', () => {
    expect(page).toContain('byggFigurMarkering(val, measureGeo, id, latLonToSvg, numreringRef.current.nastaGransNr)');
    expect(page).toContain('setMarkers((prev: any[]) => [...prev, m]);\n    avslutaFigur();');
    expect(page).toContain("{ etikett: 'Klar', onClick: () => setSparaSomOppen(true)");
  });
  it('Spara som-valen pekar på typer som finns i planeringen (zoner och linjer)', async () => {
    const { SPARA_SOM } = await import('./sparSom');
    for (const v of SPARA_SOM) {
      if (v.mal.slag === 'zon') expect(page).toContain(`{ id: '${v.mal.zoneType}', name:`);
      if (v.mal.slag === 'linje') expect(page).toContain(`{ id: '${v.mal.lineType}', name:`);
    }
    expect(page).toContain("lineType: 'boundary'");
  });
  it('etiketten i figuren följer punkterna — en BILD per text i ett symbollager (inte textlager eller HTML-markör)', () => {
    expect(page).toContain("map.getSource('figur-etikett-source')");
    expect(page).toContain('const e = figur ? figurEtikett(measureGeo, figur.yta) : null;');
    expect(page).toContain("map.addLayer({ id: 'figur-etikett', type: 'symbol', source: 'figur-etikett-source', layout: { 'icon-image': ['get', 'bild']");
    expect(page).toContain('map.addImage(id, r.bild, { pixelRatio: ETIKETT_PIXELRATIO });');
    expect(page).not.toContain("'text-field': ['get', 'text']");
    expect(page).not.toContain('new ml.Marker({ element: el');
  });
  it('körvyns lager-whitelist släpper igenom figurens lager (annars ritas figuren aldrig i körvyn)', () => {
    const m = page.match(/const KEEP_PREFIX = \[([^\]]*)\];/);
    expect(m).not.toBeNull();
    const prefix = Array.from((m as RegExpMatchArray)[1].matchAll(/'([^']+)'/g)).map((x) => x[1]);
    // varje lager-id som figuren och prickarna lägger till måste börja på något släppt prefix
    for (const id of ['measure-fill', 'measure-line', 'measure-vertices', 'figur-etikett', 'markers-prick', 'markers-hit']) {
      expect(prefix.some((p) => id.startsWith(p)), id).toBe(true);
    }
  });
  it('planeringens mät-hjälpare kommer ur lib/geoMat (en källa för formlerna)', () => {
    expect(page).toContain('const pathMeters = geoPathMeters;');
    expect(page).toContain('const ringAreaM2 = geoRingAreaM2;');
    expect(page).toContain('const formatLength = geoFormatLength;');
    expect(page).toContain('const formatArea = geoFormatArea;');
  });
});

describe('komponenterna: tokens och stora tryckytor', () => {
  const filer = ['KorvyObjektPill', 'KorvyKvitto', 'KorvyNertillList', 'PlusRad', 'KorvySparaSom'];
  const kall = Object.fromEntries(filer.map((n) => [n, las(`../components/planering/${n}.tsx`)]));
  it('alla importerar designtokens och har inga färgliteraler (hex) eller egna textstorlekar', () => {
    for (const n of filer) {
      expect(kall[n], n).toContain("from '@/lib/design/tokens'");
      expect(kall[n].match(/#[0-9a-fA-F]{3,8}\b/g), `${n}: färgliteral`).toBeNull();
      expect(kall[n].match(/fontSize:\s*\d/g), `${n}: egen textstorlek`).toBeNull();
    }
  });
  it('pillen: tre separata knappar à 56 px', () => {
    expect(kall.KorvyObjektPill).toContain('export const PILL_HOJD_PX = 56;');
    expect(kall.KorvyObjektPill).toContain('data-testid="korvy-pill-namn"');
    expect(kall.KorvyObjektPill).toContain('testid="korvy-pill-hogstubbar"');
    expect(kall.KorvyObjektPill).toContain('testid="korvy-pill-evighetstrad"');
  });
  it('smal list: max 72 px, knappar 56 px', () => {
    expect(kall.KorvyNertillList).toContain('export const LIST_HOJD_PX = 72;');
    expect(kall.KorvyNertillList).toContain('LIST_HOJD_PX - 2 * AVSTAND.s');
  });
  it('plusdockan: sex symbolknappar + Alla + ×, ingen skugga över kartan, z-index över yt-overlays, plusknappen tonar bort medan dockan är öppen', () => {
    expect(kall.PlusRad).toContain('zIndex: 650');
    expect(kall.PlusRad).toContain('poster.slice(0, MAX_FASTA)');
    expect(kall.PlusRad).toContain('data-testid="plus-alla"');
    expect(kall.PlusRad).toContain('data-testid="plus-stang"');
    expect(kall.PlusRad).toContain("'Fast i dockan'");
    expect(kall.PlusRad).toContain("'Lossa'");
    expect(kall.PlusRad).toContain("transformOrigin: 'right bottom'");
    // dockan har INGEN bakgrundsskugga (kartan ovanför är fri) — det har bara Alla-arket
    const dockDel = kall.PlusRad.slice(kall.PlusRad.indexOf('// ── Dockan ──'));
    expect(dockDel).not.toContain('plus-bakgrund');
    expect(page).toContain("opacity: plusRadOppen ? 0 : 1,");
    expect(page).toContain("pointerEvents: plusRadOppen ? 'none' : 'auto',");
  });
  it('dockan visar symbolens riktiga färg (getIconDef) och bara symboler går att fästa', () => {
    expect(page).toContain('dockFarg: getIconDef(p.id).bg');
    expect(page).toContain('fastbar: arDockPost(p)');
  });
});
