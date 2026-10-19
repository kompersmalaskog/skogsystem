import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

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
    expect(page).toContain('extraBrickor({ barighet: infoBarighet, terrang: infoTerrang, basvag: basvagSammanfattning(kartMarkeringar.filter(arBasvagMark).map((m) => m.langdM)) ?? paTrakten.basvagKm, avverkat: avverkatText })');
    expect(page).toContain("!avverkat.harSpar ? 'inget skördarspår loggat än'");
  });
});

describe('plusraden: EN delad komponent för körvyn och planeringen', () => {
  it('plus-knappen öppnar raden i BÅDA vyerna; "Fler val" finns inte längre i arket — dess innehåll bor i objektinfon', () => {
    expect(page).toContain('if (plusRadOppen) { setPlusRadOppen(false); setLangtryckPunkt(null); setPlusArkStart(null); } else { setPlusArkStart(null); setPlusRadOppen(true); }');
    // Innehållet byggs BARA medan plus är öppet; vid stängning ligger det senaste kvar så panelen (≥ 900 px) hinner glida undan.
    expect(page).toContain('if (plusRadOppen) {\n    const { poster, ark } = byggPlusRad();');
    expect(page).toContain('{plusRadVisning && (\n        <PlusRad');
    expect(page).toContain('oppen={plusRadOppen}');
    expect(page).toContain('onSparaDocka={sparaDockaPlatser}');
    expect(page).toContain('<ObjektInfo oppen={infoOppen} startVy={infoStartVy} {...op} />');   // Fler vals innehåll bor i objektinfons Mer
    // den gamla plusmenyn (bottom sheet) och den gamla helskärms-Lager-menyn är borta — inga döda ingångar kvar
    expect(page).not.toContain('PLUS-MENY (bottom sheet)');
    expect(page).not.toContain('plusMenuOpen');
    expect(page).not.toContain('onFlerVal');
    expect(page).not.toContain('layerMenuOpen');
    expect(page).not.toContain('=== LAGER-MENY ===');
    const arket = las('../components/planering/PlusRad.tsx') + las('../components/planering/PlusArk.tsx');
    expect(arket).not.toContain('Fler val');
    expect(arket).not.toContain('Dockan</');   // "‹ Dockan"-knappen är borta
  });
  it('Inställningar och GPS-källa ligger i objektinfons Mer i körvy och på maskindatorn; i vanlig planering bor Inställningar på startsidan', () => {
    expect(page).toContain('installningar: efter(() => oppnaInst(false)),');
    expect(page).toContain('gpsKalla: webSerialStott ? efter(() => oppnaInst(true)) : null,');
    expect(page).toContain('id="gps-kalla-kort"');
    const mer = las('../lib/objektKort.ts');
    expect(mer).toContain('if (c.korvyAktiv || c.maskinlage) {');
    expect(las('../app/HomeClient.tsx')).toContain("href: '/planering?installningar=1'");
  });
  it('fasta och användning sparas per maskin (ej i testläge)', () => {
    expect(page).toContain('const s = hamtaPlusRad(enhetMaskinId);');
    expect(page).toContain('if (!testlageAktivRef.current) sparaPlusRad(enhetMaskinId, ny);');
    expect(page).toContain('const r = fastaPost(plusRadRef.current, post);');
  });
  it('lagerväxlarna i arkets Lager-flik använder SAMMA lista (overlayLista) och SAMMA växel (vaxlaLager) som förut', () => {
    expect(page).toContain("overlayLista.map((o) => vaxel(o.id, o.name, o.desc, lagerPa(o.id), lagerBild(o.id), () => { if (o.enabled) vaxlaLager(o.id); }))");
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
    // kvittot är "Högstubbe satt" — med "· osäker ±N m" när telefonens position var grov (lib/telefonGps)
    // planeraren får kvittot också under planeringen ("Avlägg satt · 4 kvar", lib/klarTrakt.kvittoMedKvar) — inte ved-symbolen, den öppnar kortet igen
    expect(page).toContain("if (korvyActive || (klarGaller && typ !== 'firewood')) visaKvitto(osakerM ? `${kvittoRubrik(symbolNamn(typ))} · osäker ±${osakerM} m` : kvittoRubrik(symbolNamn(typ)), 'ok', id);");
  });
  it('håll fingret på kartan öppnar raden — bara när inget annat läge pågår, aldrig på en symbol', () => {
    expect(page).toContain('setLangtryckPunkt({ lat: ll.lat, lng: ll.lng });');
    expect(page).toContain('langtryckNereRef.current = true;\n        setPlusRadOppen(true);');
    expect(page).toContain('}, LANGTRYCK_MS);');
    expect(page).toContain('langtryckTillatenRef.current = !!valtObjekt && !plusRadOppen');
    expect(page).toContain("layers: ['markers-hit'].filter((l) => map.getLayer(l))");
  });
  it('symbolkort öppnas inte medan man placerar eller mäter', () => {
    expect(page).toContain('if (selectedSymbolRef.current || korvyFigurAktivRef.current || plusRadOppenRef.current) return;');
  });
  it('Ångra tar bort markeringen ur listan OCH databasen, och databasradering väntar in en pågående spar', () => {
    expect(page).toContain('setMarkers((prev: any[]) => angraMarkering(prev, id));\n    deleteMarkerFromDb(id);');
    // väntar-in-en-pågående-spar-logiken bor i hooken (lib/hooks/useMarkeringarSynk): graven läggs först när den lokala sparningen är klar
    const hook = las('../lib/hooks/useMarkeringarSynk.ts');
    expect(hook).toContain("const pagar = sparPagarPerId.current.get(mid);\n    if (pagar) { try { await pagar; }");
    expect(hook).toContain('sparPagarPerId.current.set(id, sparning);');
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
    expect(page).toContain('const symbolMarkers = markers.filter((m): m is MedXY => harXY(m) && !!m.isMarker && !arPrick(m.type));');
    expect(page).toContain("if (korvyActiveRef.current && arPrick(m.type)) { setPrickValt({ id: String(m.id), typ: String(m.type) }); return; }");
    expect(page).toContain('testid="prick-kort"');
    expect(page).toContain("{ etikett: 'Ta bort', onClick: taBortPrick, destruktiv: true, testid: 'prick-tabort' }");
  });
});

describe('Mät i körvyn OCH planeringen → en rad, Klar visar talet', () => {
  it('EN smal list i båda vyerna: planeringens gamla mätpanel och låsta chip är borta, alla vägar startar samma figur', () => {
    expect(page).not.toContain('MÄTVERKTYG (geo, klicka-punkter)');
    expect(page).not.toContain('Tryck på kartan för att sätta punkter');
    expect(page).not.toContain('panorera mellan tryck');
    expect(page).not.toContain('const klarMatning');   // gamla låsta chip-flödet
    expect(page).not.toContain('{!korvyActive && measureLocked');
    expect(page).toContain('{figur && (() => {');
    expect(page).not.toContain('sparaSomOppen');
    expect(page).not.toContain('{korvyActive && figur');
    // Mät sträcka/Mät yta (plusdockan) startar figuren — aldrig den gamla startaMatning direkt. Rita linje/Rita yta startar INTE figuren längre:
    // typlistan först (körvyn och planeringen), sedan ritning.
    expect(page).toContain("if (post.typ === 'matning') startaFigur(yta);");
    expect(page).toContain("else if (yta) { setActiveCategory('zones'); setMenuOpen(true); }");
    expect(page).toContain("else { setActiveCategory('lines'); setSubMenu('draw-lines'); setMenuOpen(true); }");
    expect(page).not.toContain('else if (korvyActive) startaFigur(yta);');
    expect(page.split('startaFigur(').length - 1).toBe(1);   // enda anropet: Mät sträcka/yta i trycktPlusPost
    expect(page).not.toContain("onClick={() => startaFigur(false)}");   // den gamla Mätning-menyn är borta
    expect(page.match(/startaMatning\(/g)?.length).toBe(1);   // bara startaFigur anropar den
  });
  it('ett tryck medan man mäter eller har valt en symbol öppnar INGET kort (ytkort, larm, symbolkort …) — alla tryckvakter', () => {
    const vakt = 'hornEditActiveRef.current || korvyFigurAktivRef.current || selectedSymbolRef.current || plusRadOppenRef.current';
    expect(page.split(vakt).length - 1).toBe(11);                                        // yt-, larm-, symbol-, hög-, GROT-, TMA- … linjens tryck och skotarens avläggsrutor
    expect(page).toContain('skotningDrawing || korvyFigurAktivRef.current || selectedSymbolRef.current || plusRadOppenRef.current) return;');   // zonens tryck
  });
  it('ett tryck på kartan utanför dockan STÄNGER den (och gör inget annat); lyftet efter ett långtryck stänger inte', () => {
    expect(page).toContain("map.on('click', onKlick);");
    expect(page).toContain('}, [plusRadOppen, mapLibreReady]);');
    expect(page).toContain('if (langtryckNereRef.current || Date.now() < langtryckSlukTillRef.current) return;');
    expect(page).toContain('plusRadOppenRef.current = plusRadOppen;');
    // långtrycket sätter "finger nere" när dockan öppnas, och lyftet startar en kort spärr mot det klick som följer
    expect(page).toContain('langtryckNereRef.current = true;');
    expect(page).toContain('langtryckSlukTillRef.current = Date.now() + 400;');
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
  it('räknarna i planeringens objektinfo: EN gång, "5 av 15" under På kartan i Om trakten (den gamla rutan nere till vänster och dubbletten är borta)', () => {
    expect(page).not.toContain('MILJÖHÄNSYN-RÄKNARE');
    expect(page).not.toContain('miljoRaknareExpanderad');
    expect(page).not.toContain('data-testid="objektinfo-miljo"');
    expect(page).toContain("{ id: 'hogstubbar', namn: 'Högstubbar', antal: hogstubbarVy.antal, krav: hogstubbarVy.krav, uppfyllt: hogstubbarVy.status === 'uppfyllt' },");
    expect(las('../components/planering/OmTrakten.tsx')).toContain('p.miljo.map((m) =>');   // raderna "Högstubbar · 3 av 11 markerade" (typraderna i Om trakten, lib/omTrakten)
    expect(las('../components/planering/ObjektKort.tsx')).not.toMatch(/högstubb/i);   // kortet visar dem inte (ingen dubblett)
  });
  it('Klar låser mätningen och visar talet — ingenting sparas (Spara som finns inte längre)', () => {
    expect(page).toContain("const lasMatning = () => { if (figur && measureGeoRef.current.length >= (figur.yta ? 3 : 2)) setMeasureLocked({ yta: figur.yta }); };");
    expect(page).toContain("{ etikett: '✓', aria: 'Klar', onClick: lasMatning,");
    for (const s of ['byggFigurMarkering', 'SPARA_SOM', 'sparaFigurSom', 'KorvySparaSom', "from '../../lib/sparSom'"]) expect(page, s).not.toContain(s);
    expect(existsSync(new URL('./sparSom.ts', import.meta.url))).toBe(false);
    expect(existsSync(new URL('../components/planering/KorvySparaSom.tsx', import.meta.url))).toBe(false);
  });
  it('alla typer som Spara som kunde spara går att rita: zonerna i Rita yta, Stig/Led i Rita linje, Stickväg i Snitsla stickvägar (gallringsverktyget; inte längre i Rita linje), Yta = Nytt område (traktgräns med nummer)', () => {
    for (const [id, namn] of [['wet', 'Blött'], ['protected', 'Hänsyn'], ['steep', 'Brant']]) expect(page).toContain(`{ id: '${id}', name: '${namn}',`);   // zoner (Blött, Naturvård = Hänsyn, Brant)
    expect(page).toContain("{ id: 'trail', name: 'Stig/Led',");
    expect(page).toContain("{ id: 'sideRoadRed', name: 'Stickväg Röd', color: LEGEND.fara, striped: false },");   // typen finns kvar (befintliga stickvägar, gallringsverktyget) men står inte i Rita linje
    expect(page).not.toContain("name: 'Stickväg', key: t.id");
    expect(page).toContain("{ id: Date.now(), isLine: true, lineType: 'boundary', nummer, path }");   // Nytt område
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
  const filer = ['KorvyObjektPill', 'KorvyKvitto', 'KorvyNertillList', 'PlusRad', 'PlusArk'];
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
    expect(kall.PlusRad).toContain('data-testid="plus-hall-fast"');
    expect(kall.PlusRad).toMatch(/>\s*Fast i dockan\s*</);
    // ingen "Lossa" per symbol: en fast symbol har inget håll-kort, vägen tillbaka är Återställ i Redigera
    expect(kall.PlusRad).not.toContain('Lossa');
    expect(kall.PlusRad).toContain('lt.start(() => { if (!p.fast) setHall(');
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
