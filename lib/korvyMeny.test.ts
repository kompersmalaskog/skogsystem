import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// Vakt mot att körvyns nya meny/snabbtryck (pill, snabbark, genvägar, kvitto, mätning) kopplas bort eller läcker in i planeringsvyn.
// planering/page.tsx är 23 000 rader och körs inte i enhetstester; beteendet är provat i den riktiga sidan (testsele, se PR) och
// reglerna i lib/*.test.ts. Det här provet läser källan och låser kopplingarna — bryts något vid en merge eller refaktor larmar det.
const las = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const page = las('../app/planering/page.tsx');

describe('körvyns nya struktur är kopplad — och bara i körvyn (planeringsvyn oförändrad)', () => {
  it('objektpillen med tre tryckytor ersätter den gamla ENDAST när körvyn är aktiv; planeringens pill finns kvar', () => {
    expect(page).toContain('{korvyActive && valtObjekt ? (\n            <KorvyObjektPill');
    expect(page).toContain("onHogstubbe={() => settSnabbMarkering('highstump')}");
    expect(page).toContain("onEvighetstrad={() => settSnabbMarkering('eternitytree')}");
    expect(page).toContain("onNamn={() => setTraktOversiktOpen(o => !o)}");
    expect(page).toContain('          ) : (\n          /* Objekt-pill (glasig).');   // den gamla pillen är else-grenen
  });

  it('plus-knappen öppnar snabbarket i körvy och den gamla plusmenyn i planeringen', () => {
    expect(page).toContain('if (korvyActive) setKorvySnabbark(o => !o); else setPlusMenuOpen(o => !o);');
    expect(page).toContain('{korvyActive && korvySnabbark && (() => {');
  });

  it('Inställningar har flyttat från plusmenyn till objektinfon i körvy — men finns kvar i planeringens plusmeny', () => {
    expect(page).toContain("...(korvyActive ? [] : [{ label: 'Inställningar'");
    expect(page).toContain('data-testid="objektinfo-verktyg"');
    expect(page).toContain("{ id: 'lager', etikett: 'Lager'");
    expect(page).toContain("{ id: 'installningar', etikett: 'Inställningar'");
    expect(page).toContain("{ id: 'gps-kalla', etikett: 'GPS-källa'");
    expect(page).toContain('id="gps-kalla-kort"');
    // "Fler val" öppnar den gamla menyn så inget (Avsluta körvy/objekt, Byt objekt …) går förlorat
    expect(page).toContain('onFlerVal={() => { setKorvySnabbark(false); setPlusMenuOpen(true); }}');
  });

  it('objektinfons "Avverkat X av Y ha" och körvyns rader visas bara i körvy', () => {
    expect(page).toContain('{korvyActive && (() => {\n                const arealHa = tolkaAreal(infoAreal)');
    expect(page).toContain('data-testid="objektinfo-avverkat"');
    expect(page).toContain('{korvyActive && (\n                <div data-testid="objektinfo-verktyg"');
  });

  it('pillens "efter" och objektinfons avverkat räknas ur SAMMA beräkning (skördarens hyttspår, 10 m buffert, klippt mot traktgränsen)', () => {
    expect(page).toContain(".eq('roll', 'skordare')");
    expect(page).toContain('avverkadAreaM2(segment, { ringar })');
    expect(page).toContain('status: kravStatus(miljoAntal.hogstubbar, miljoKravVal.hogstubbar, andelAvverkat)');
    expect(page).toContain('status: kravStatus(miljoAntal.evighetstrad, miljoKravVal.evighetstrad, andelAvverkat)');
    expect(page).toContain('miljoKrav(infoAreal || valtObjekt?.areal, valtObjekt?.cert)');
  });

  it('Ångra tar bort markeringen ur listan OCH databasen, och databasradering väntar in en pågående spar (ingen återuppståndelse)', () => {
    expect(page).toContain('setMarkers((prev: any[]) => angraMarkering(prev, id));\n    deleteMarkerFromDb(id);');
    expect(page).toContain("const pagar = markerSparPagarRef.current.get(String(markerId));\n    if (pagar) { try { await pagar; }");
    expect(page).toContain('markerSparPagarRef.current.set(id, sparning);');
  });

  it('snabbmarkering sätts aldrig på en saknad/gammal position', () => {
    expect(page).toContain('const kan = kanPlaceraPaPosition(korvyEffectivePos, gpsFixFarsk);');
    expect(page).toContain("if (!kan.ok) { visaKorvyKvitto(placeringsFelText(kan.skal), 'fel'); return; }");
  });

  it('egna nysatta markeringar går att dra, och ger inget proximitetskort', () => {
    expect(page).toContain("map.on('mousedown', 'markers-hit', onDown);");
    expect(page).toContain("map.on('touchstart', 'markers-hit', onDown);");
    expect(page).toContain('      e.preventDefault();\n      dragId = String(id);');
    expect(page).toContain('if (korvyEgnaMarkorRef.current.has(item.id)) continue;');
    expect(page).toContain('korvyEgnaMarkorRef.current.add(String(id));');
  });

  it('håll fingret på Lager-/Inställnings-rader ger "Lägg i plus" bara i körvy, och klicket efter långtrycket sväljs', () => {
    expect(page).toContain("{...lagerRadProps({ typ: 'lager', id: overlay.id })}");
    expect(page).toContain("{...lagerRadProps({ typ: 'lager', id: layer.id })}");
    expect(page).toContain("{...lagerRadProps({ typ: 'lager', id: 'brandrisk' })}");
    expect(page).toContain("{...lagerRadProps({ typ: 'installning', id: 'kompass' })}");
    expect(page).toContain("{...lagerRadProps({ typ: 'installning', id: 'rotera' })}");
    expect(page).toContain("const lagerRadProps = (g: Genvag): Record<string, any> => (korvyActive ? {");
    expect(page).toContain('const lagerKlickSluk = (): boolean => korvyActive && lagerLangtryck.slukKlick();');
    expect(page).toContain('Plus är full (${MAX_GENVAGAR}/${MAX_GENVAGAR}) — ta bort en genväg först');
  });

  it('genvägarna sparas per maskin och rör inte datorns localStorage i testläge', () => {
    expect(page).toContain('setKorvyGenvagar(hamtaGenvagar(enhetMaskinId));');
    expect(page).toContain('if (!testlageAktivRef.current) sparaGenvagar(enhetMaskinId, lista);');
  });

  it('mätning: körvyn har egen panel (stora knappar), planeringens gamla paneler döljs i körvy och planeringens Mätning-ark är oförändrat utan "köra"-raden', () => {
    expect(page).toContain('{!korvyActive && (measureMode || measureAreaMode) && (() => {');
    expect(page).toContain('{!korvyActive && measureLocked && measureGeo.length >= (measureLocked.yta ? 3 : 2) && (');
    expect(page).toContain("if (korvyActive) startaKorvyMatning('strackan'); else startaMatning(false);");
    expect(page).toContain("if (korvyActive) startaKorvyMatning('yta'); else startaMatning(true);");
    expect(page).toContain('{korvyActive && (\n                    <div\n                      data-testid="mat-kor-rad"');
    expect(page).toContain('<KorvyMatPanel');
  });

  it('planeringens mät-hjälpare kommer ur lib/geoMat (en källa för formlerna)', () => {
    expect(page).toContain('const pathMeters = geoPathMeters;');
    expect(page).toContain('const ringAreaM2 = geoRingAreaM2;');
    expect(page).toContain('const formatLength = geoFormatLength;');
    expect(page).toContain('const formatArea = geoFormatArea;');
  });
});

describe('komponenterna: stora tryckytor', () => {
  const pill = las('../components/planering/KorvyObjektPill.tsx');
  const ark = las('../components/planering/KorvySnabbArk.tsx');
  const kvitto = las('../components/planering/KorvyKvitto.tsx');
  const mat = las('../components/planering/KorvyMatPanel.tsx');
  it('pillen: tre separata knappar, var och en 56 px hög', () => {
    expect(pill).toContain('export const PILL_HOJD_PX = 56;');
    expect(pill).toContain('data-testid="korvy-pill-namn"');
    expect(pill).toContain('testid="korvy-pill-hogstubbar"');
    expect(pill).toContain('testid="korvy-pill-evighetstrad"');
    expect((pill.match(/height: PILL_HOJD_PX/g) || []).length).toBeGreaterThanOrEqual(3);
  });
  it('snabbarket: genvägskort ≥ 84 px, symbolrutor ≥ 104 px (spec: minst 72), z-index över yt-overlays som den gamla plusmenyn', () => {
    expect(ark).toContain('minHeight: 84');
    expect(ark).toContain('minHeight: 104');
    expect(ark).toContain('zIndex: 640');
    expect(ark).toContain('zIndex: 650');
  });
  it('kvittot: Ångra 48 px, ligger under snabbarket men över kartan', () => {
    expect(kvitto).toContain('height: 48');
    expect(kvitto).toContain('zIndex: 600');
  });
  it('mätpanelen: knappar ≥ 56 px', () => {
    expect(mat).toContain('minHeight: 56');
  });
});
