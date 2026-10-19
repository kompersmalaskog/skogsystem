import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// Vakt för "ett läge i taget, en rad, en uppsättning knappar": när man placerar, ritar, mäter eller ritar ett nytt område finns EXAKT EN rad
// längst ner (vad som pågår) och EN uppsättning knappar (↩ ✓ ×). Inget överst, inga dubbla texter, inga dubbla stäng-knappar.
// page.tsx körs inte i enhetstester — provet läser källan och låser kopplingarna; beteendet är provat i den riktiga sidan (testsele, se PR).
const las = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const page = las('../app/planering/page.tsx');
const mellan = (src: string, fran: string, till: string): string => {
  const a = src.indexOf(fran), b = src.indexOf(till, a + fran.length);
  expect(a, `hittar inte "${fran}"`).toBeGreaterThan(-1);
  expect(b, `hittar inte "${till}"`).toBeGreaterThan(a);
  return src.slice(a, b);
};
const antal = (s: string, del: string) => s.split(del).length - 1;

describe('EN rad längst ner per läge', () => {
  it('fem lägen, fem rader — varje rad finns på exakt ett ställe i sidan', () => {
    for (const id of ['pil-list', 'omrade-list', 'figur-list']) expect(antal(page, `testid="${id}"`), id).toBe(1);
    // rita-list har två utseenden i SAMMA villkor: basväg ur Klar med trakten? (NedfaldList med "‹ Klar med trakten?") eller vanlig ritning — aldrig båda
    expect(antal(page, 'testid="rita-list"')).toBe(2);
    // placera-list har två utseenden i SAMMA villkor: avlägg ur Klar med trakten? (NedfaldList med "‹ Klar med trakten?") eller vanlig placering — aldrig båda
    expect(antal(page, 'testid="placera-list"')).toBe(2);
  });
  it('varje rad visas av sitt läge (och inte av något annat): villkoret står direkt före raden', () => {
    expect(page).toMatch(/\{placeraListSynlig && selectedSymbol && \(klarAterAvlagg && selectedSymbol === 'landing' \? \(\s*\/\*[^*]*\*\/\s*<NedfaldList\s+testid="placera-list"/);
    expect(page).toMatch(/\) : \(\s*<KorvyNertillList\s+testid="placera-list"/);
    expect(page).toMatch(/\{pilListSynlig && \(\s*<KorvyNertillList\s+testid="pil-list"/);
    expect(page).toMatch(/\{ritListSynlig && \(klarAterBasvag \? \(\s*\/\*[^*]*\*\/\s*<NedfaldList\s+testid="rita-list"/);
    expect(page).toMatch(/\) : \(\s*<KorvyNertillList\s+testid="rita-list"/);
    expect(page).toMatch(/\{omradeListSynlig && \(\s*<KorvyNertillList\s+testid="omrade-list"/);
    expect(page).toMatch(/\{figur && \(\(\) => \{[\s\S]{0,200}<KorvyNertillList\s+testid="figur-list"/);
  });
  it('raderna är samma komponent (KorvyNertillList) — en stil, en höjd, ett läge på skärmen', () => {
    const rader = mellan(page, '{/* PLACERA SYMBOL: raden stängd', '{/* PRICK (körvy)');
    // fem lägen + sjätte: telefonens "‹ Om trakten" medan en markering från Om trakten är framhävd (framhav-list) — villkoret nedan stänger den när ett annat läge pågår.
    // Två av raderna (framhav-list, och placera-list för avlägg ur Klar med trakten?) är NedfaldList = KorvyNertillList med en "‹ tillbaka"-knapp först: samma stil, samma höjd.
    expect(antal(rader, '<KorvyNertillList')).toBe(5);
    expect(antal(rader, '<NedfaldList')).toBe(4);   // placera (avlägg), rita (basväg), framhav, och frågan om Vidas avlägg (avlagg-granska-list, stapla)
    expect(las('../components/planering/NedfaldList.tsx')).toContain('<KorvyNertillList');
  });
  it('framhävningens rad (Om trakten › Visa ›, telefon) visas aldrig samtidigt med ett annat nertill-läge eller med öppen objektinfo', () => {
    expect(page).toMatch(/const framhavListSynlig = !!framhavdMarkering && framhavdLageRef\.current === 'ark' && !traktOversiktOpen && !plusRadOppen && !menuOpen && !figur && !placeraListSynlig && !ritListSynlig && !pilListSynlig && !omradeListSynlig;/);
    expect(page).toMatch(/\{framhavListSynlig && framhavdMarkering && \(\s*<NedfaldList\s+testid="framhav-list"/);
  });
  it('knapparna: ↩ ✓ × för rita, område och mät; bara × för placera och pil', () => {
    const rita = mellan(page, 'testid="rita-list"', 'testid="omrade-list"');
    expect(rita).toContain("{ etikett: '↩', aria: 'Ångra', onClick: undoLastSegment, av: ritaHistoria.length === 0, testid: 'rita-angra' }");
    expect(rita).toContain("{ etikett: '✓', aria: 'Klar', onClick: isZoneMode ? finishZone : finishLine, av: nRit < (isZoneMode ? 3 : 2), gron: true, testid: 'rita-klar' }");
    expect(rita).toContain("AVBRYT_KNAPP(cancelDrawing, 'rita-avbryt')");
    const omrade = mellan(page, 'testid="omrade-list"', '{/* MÄT (körvy OCH planering)');
    for (const s of ["testid: 'omrade-angra'", "testid: 'omrade-klar'", "AVBRYT_KNAPP(() => setOmradeRitning(false), 'omrade-avbryt')", 'omradeRitningHandleRef.current?.angra()', 'omradeRitningHandleRef.current?.finalize()']) expect(omrade, s).toContain(s);
    const mat = mellan(page, '{figur && (() => {', 'PRICK (körvy)');
    for (const s of ["testid: 'figur-angra'", "testid: 'figur-klar'", "AVBRYT_KNAPP(avslutaFigur, 'figur-kasta')", 'onClick: angraMatning', 'onClick: lasMatning']) expect(mat, s).toContain(s);
    expect(page).toContain("AVBRYT_KNAPP(() => setSelectedSymbol(null), 'placera-avbryt')");
    expect(page).toContain("AVBRYT_KNAPP(() => { setIsArrowMode(false); setArrowType(null); }, 'pil-avbryt')");
  });
  it('texten: typ/verktyg · hur långt man kommit — "Basväg · 120 m", "Ej framkomlig · 4 punkter", "Mät yta · 1,4 ha"', () => {
    expect(page).toContain("text={`${ritNamn} · ${ritFramsteg}`}");
    expect(page).toContain("const ritFramsteg = isZoneMode || nRit < 2 ? punktText(nRit) : geoFormatLength(geoPathMeters(currentDrawCoords));");
    expect(page).toContain("text={`${figur.yta ? 'Mät yta' : 'Mät sträcka'} · ${e ? e.text : punktText(n)}${klar ? ' · klar' : ''}`}");
    expect(page).toContain("text={`Nytt område · ${punktText(omradePunkter)}`}");
    expect(page).toContain("text={`Tryck där ${symbolNamn(selectedSymbol)} ska stå`}");
  });
});

describe('inget överst, inga dubbletter', () => {
  it('toppbannern (activeMode) finns bara kvar för skotningens "Markera utkört" — inte för rita, mät, pil eller Nytt område', () => {
    const am = mellan(page, 'const activeMode', '  return (\n    <div style={{\n      position: \'fixed\'');
    for (const s of ['isDrawMode', 'isZoneMode', 'isArrowMode', 'isMeasuring', 'omradeRitning', 'Ritar ', 'Placerar pil', 'Mäter']) expect(am, s).not.toContain(s);
    expect(am).toContain("label: 'Markera utkört'");
  });
  it('mittpillret "Tryck för att placera ×", "Dra för att rita", den gamla ångra/klar/avbryt-balken och de döda mätblocken är borta', () => {
    for (const s of ['Tryck för att placera', 'Dra för att rita', 'AKTIV RITNING INDIKATOR', 'MÄTNINGS-INDIKATOR', 'YTMÄTNINGS-INDIKATOR', '{false && measureMode', '{false && measureAreaMode', 'Ritar traktgräns', 'Ritar zon']) {
      expect(page, s).not.toContain(s);
    }
  });
  it('Spara som är borta ur flödet: ingen sparaSomOppen, ingen sparaFigurSom, ingen KorvySparaSom', () => {
    for (const s of ['sparaSomOppen', 'setSparaSomOppen', 'sparaFigurSom', 'KorvySparaSom', 'SPARA_SOM', 'byggFigurMarkering']) expect(page, s).not.toContain(s);
  });
  it('kvittot (körvyn) väntar medan någon av raderna visas', () => {
    expect(page).toContain('!figur && !placeraListSynlig && !ritListSynlig && !pilListSynlig && !omradeListSynlig && (');
  });
});

describe('ett läge i taget', () => {
  it('ett verktyg som väljs avslutar det som pågår (placera, rita, pil, mät, Nytt område) — annars skulle två rader visas', () => {
    const f = mellan(page, 'const avslutaPagaendeLage = () => {', '  // ── PLUSRADENS TRYCK ──');
    for (const s of ['avslutaFigur()', 'cancelDrawing()', 'setSelectedSymbol(null)', 'setIsArrowMode(false)', 'setOmradeRitning(false)']) expect(f, s).toContain(s);
    const tryck = mellan(page, 'const trycktPlusPost = ', 'const placeraListSynlig');
    expect(tryck).toContain('avslutaPagaendeLage();');
    expect(tryck).not.toContain('if (figur) avslutaFigur();');
    const rita = mellan(page, 'const byggRita = ', '// Spårens förhandsfärg');
    expect(antal(rita, 'avslutaPagaendeLage();')).toBe(4);   // Nytt område, Pilar, Spåra med GPS, Snitsla stickvägar (Rita linje/yta och Mät går via trycktPlusPost)
  });
  it('raderna döljs medan plusdockan eller en meny är öppen — samma regel som placera', () => {
    for (const s of [
      'const ritListSynlig = (isDrawMode || isZoneMode) && !plusRadOppen && !menuOpen && !figur;',
      'const pilListSynlig = isArrowMode && !!arrowType && !plusRadOppen && !menuOpen && !figur;',
      'const omradeListSynlig = omradeRitning && !plusRadOppen && !menuOpen && !figur;',
    ]) expect(page, s).toContain(s);
  });
});

describe('mät: Klar visar talet, inget sparas', () => {
  it('Klar låser punkterna (setMeasureLocked) — ingen markering skrivs', () => {
    const f = mellan(page, 'const lasMatning = ', '  // ↩ tar bort senaste punkten');
    expect(f).toContain('setMeasureLocked({ yta: figur.yta })');
    for (const s of ['setMarkers', 'saveMarkerToDb', 'Supabase', 'supabase']) expect(f, s).not.toContain(s);
  });
  it('låst = inga fler punkter (klickeffekten och korset), ↩ öppnar igen och tar bort senaste punkten', () => {
    expect(page).toContain('if ((!measureMode && !measureAreaMode) || measureLocked) return;');
    expect(page).toContain("if (!map || !mapLibreReady || !(measureMode || measureAreaMode) || measureLocked) return;");
    expect(page).toContain('const angraMatning = () => { setMeasureLocked(null); angraSista(); };');
    expect(page).toContain('av: klar || n < (figur.yta ? 3 : 2)');
  });
});

describe('Rita linje: Basväg är EN rad, stickvägar ritas inte här (de görs i Snitsla stickvägar)', () => {
  it('listan = linjetyperna utan traktgräns, stickväg och backväg: Basväg först (EN rad), sedan övriga; ingen "Stickväg" bland dem', () => {
    const lista = mellan(page, 'const ritaLinjeTyper = ', '  const oppnaBasvagSteg');
    expect(lista).toContain("lineTypes.filter(t => t.id !== 'boundary' && !t.id.includes('sideRoad') && !t.id.includes('backRoad'));");
    expect(lista).not.toContain('Stickväg');
    expect(lista).not.toContain('medBasvagFarger');
    expect(page.split('typer={ritaLinjeTyper}').length - 1).toBe(2);   // Rita linje och Spåra med GPS visar samma lista
    // kartans och markeringarnas namn oförändrade: befintliga stickvägar ritas och visas som förut
    expect(page).toContain("{ id: 'sideRoadRed', name: 'Stickväg Röd', color: LEGEND.fara, striped: false },");
  });
  it('Snitsla stickvägar (gallringsverktyget) är orört: samma Gallring-ark, samma spårstart utan färgargument', () => {
    expect(page).toContain("setActiveCategory('gallring'); setMenuOpen(true);");
    expect(page).toContain('startGpsTracking(lineId);');
    expect(page).toContain("startGpsTracking(colorMap[colorId] || 'sideRoadRed');");
  });
});

describe('Nytt område (= Spara som › Yta): för alla, med ↩', () => {
  it('Nytt område-rutan är inte längre bakom isAdminRiktig', () => {
    const rita = mellan(page, 'const byggRita = ', '// Spårens förhandsfärg');
    expect(rita).not.toContain('isAdminRiktig');
  });
  it('ritmotorn har ångra (tar bort senaste hörnet) och anropar onPunkter', () => {
    const lib = las('./polygonRitning.ts');
    expect(lib).toContain('angra: () => void;');
    expect(lib).toContain('coords.pop();\n    opts.onPunkter?.(coords.length);\n    drawOverlay();');
    expect(lib).toContain('return { finalize, avbryt: teardown, antal: () => coords.length, angra };');
  });
});

describe('telefonbredd: texten får plats bredvid tre knappar', () => {
  it('den gröna ✓ är bara dubbelt så bred på bred skärm (smal → samma som övriga knappar), annars kapas "Ej framkomlig · 4 punkter" på 390 px', () => {
    const k = las('../components/planering/KorvyNertillList.tsx');
    expect(k).toContain('minWidth: k.gron && !smal ? KNAPP_HOJD_PX * 2 : KNAPP_HOJD_PX');
    expect(k).toContain("padding: `0 ${k.gron && !smal ? AVSTAND.l : AVSTAND.m}px`");
  });
});

describe('↩ i Rita ångrar senaste handlingen — inte ett fast antal punkter', () => {
  it('historik av koordinater före varje handling: ett tryck = en punkt, ett frihandsdrag = hela draget', () => {
    expect(page).toContain("const [ritaHistoria, setRitaHistoria] = useState<[number, number][][]>([]);");
    expect(page).toContain("setRitaHistoria(h => [...h, currentDrawCoords]);   // ↩ tar bort just den här punkten\n        setCurrentDrawCoords([...currentDrawCoords, lastCoord]);");
    expect(page).toContain("setRitaHistoria(h => [...h, currentDrawCoords]);   // ↩ tar bort hela draget\n        setCurrentDrawCoords(simplified);");
    const f = mellan(page, 'const undoLastSegment = () => {', '  const cancelDrawing = () => {');
    expect(f).toContain('if (ritaHistoria.length === 0) return;');
    expect(f).toContain('setCurrentDrawCoords(ritaHistoria[ritaHistoria.length - 1]);');
    expect(f).toContain('setRitaHistoria(ritaHistoria.slice(0, -1));');
    for (const s of ['removeCount', '0.2', 'Math.max(3', 'cancelDrawing']) expect(f, s).not.toContain(s);   // gamla regeln: max(3, 20 %) och "avbryt vid ≤ 1 punkt"
  });
  it('historiken börjar om för varje ritning (typ/läge byts eller ritningen avslutas)', () => {
    expect(page).toContain('useEffect(() => { setRitaHistoria([]); }, [isDrawMode, isZoneMode, drawType, zoneType]);');
  });
});

describe('ett ord för samma sak: zontypen "protected" heter Hänsyn överallt (lagrad typ oförändrad)', () => {
  it('planeringsvyn: Rita yta-listan, Lager (Zontyper), kortet, briefingen och översiktslistan läser alla zoneTypes — namnet står på ETT ställe', () => {
    expect(page).toContain("{ id: 'protected', name: 'Hänsyn', color: ZONE_COLORS.protected, icon: 'naturecorner' },");
    expect(page).not.toContain("{ id: 'protected', name: 'Naturvård'");
    expect(page).toContain("{ id: 'zone_protected',  name: 'Hänsyn',");      // Varningsavstånd (Zoner)
    expect(page).not.toContain('Naturvårdszon');
    expect(page).toContain("zoneTypes.find(t => t.id === marker.zoneType)?.name || 'Zon'");   // kortets rubrik
  });
  it('översikten och egenkontrollen: samma ord', () => {
    expect(las('../app/oversikt/markeringar.ts')).toContain("protected: 'Hänsyn',");
    expect(las('./egenkontroll.ts')).toContain("protected: { rubrik: 'Hänsyn', grupp: 'Naturvård' },");
    for (const [fil, gammal] of [['../app/oversikt/markeringar.ts', 'Skyddat område'], ['./egenkontroll.ts', 'Skyddad zon']]) expect(las(fil), gammal).not.toContain(gammal);
  });
  it('den lagrade typen är orörd: id och färg', () => {
    expect(page).toContain("{ id: 'zone_protected',");
    expect(las('./zone-colors.ts')).toContain("protected:   '#30d158'");
    expect(las('./varningsInstallningar.ts')).toContain('zone_protected:   K(30),');
  });
});

describe('Vida-raden i Lager (overlay-hansyn) heter "Hänsynsytor – Vida" — dina egna zoner heter fortsatt "Hänsyn"', () => {
  it('bara etiketten är ändrad: id, beskrivning och villkor (data finns) oförändrade', () => {
    const rad = "...(geoTyper.has('hänsynsyta') ? [{ id: 'hansyn', name: 'Hänsynsytor – Vida', desc: 'Hänsynsytor att spara', enabled: true }] : []),";
    expect(page).toContain(rad);
    expect(las('../components/KartLagerMeny.tsx')).toContain(rad);   // samma lager, samma etikett i egenkontrollens meny
    expect(page).not.toContain("{ id: 'hansyn', name: 'Hänsyn',");
    expect(las('../components/KartLagerMeny.tsx')).not.toContain("{ id: 'hansyn', name: 'Hänsyn',");
  });
  it('zonen heter fortfarande Hänsyn', () => {
    expect(page).toContain("{ id: 'protected', name: 'Hänsyn', color: ZONE_COLORS.protected, icon: 'naturecorner' },");
  });
});
