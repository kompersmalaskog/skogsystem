// Vakter för ritläges-spärren (2026-10-25): det som inte får glida tillbaka — läser sidan och lib-filerna, ingen karta (kartan prövas i lib/fallTradKorUpp.hytt.test.ts).
//   • Spärren läggs på kartan innan någon annan lyssnare, och gäller ALLA lägen: varje läge som tar tryck på kartan står i flaggan `ritlageSparrRef`.
//   • Plusdockan är inget ritläge (ett tryck på kartan stänger den).
//   • Bara ritlägets EGNA lyssnare (symbol/pil/larmplats, mät, risa, de två trycken) är märkta; ingen annan lyssnare är det.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const las = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const sida = las('app/planering/page.tsx');

describe('spärren sitter på kartan och gäller alla ritlägen', () => {
  it('läggs på direkt när kartan är klar — före alla andra click-lyssnare', () => {
    const start = sida.indexOf('const handleMapReady = useCallback((map: any) => {');
    expect(start).toBeGreaterThan(0);
    expect(sida.slice(start, start + 500)).toContain('installeraRitlageSparr(map, () => ritlageSparrRef.current);');
  });
  it('flaggan innehåller varje läge där ett tryck på kartan är ritning, placering eller mätning — och inte plusdockan', () => {
    const rad = sida.slice(sida.indexOf('ritlageSparrRef.current ='), sida.indexOf('const kartLageIgang'));
    for (const f of ['isDrawMode', 'isZoneMode', 'isArrowMode', 'measureMode', 'measureAreaMode', 'omradeRitning', 'skotningDrawing', 'hornEditActive', 'larmPlacering', 'risaMarkMode', 'selectedSymbol', 'figur']) expect(rad, f).toContain(f);
    expect(rad).not.toContain('plusRadOppen');   // dockan stängs av ett tryck på kartan
  });
});

describe('vilka lyssnare som är märkta', () => {
  it('i sidan: ritverktygets klick och dubbelklick, mätningen och risa-delen — och inga andra', () => {
    const traffar = sida.match(/= tillatIRitlage\(/g) ?? [];
    expect(traffar).toHaveLength(4);
    expect(sida).toContain('const onClick = tillatIRitlage((e: any) => {\n      if (larmPlacering) {');
    expect(sida).toContain('const onDblClick = tillatIRitlage((e: any) => {');
    expect(sida).toContain('const onClick = tillatIRitlage((e: any) => {\n      const ll = e?.lngLat;\n      if (!ll) return;\n      const geo = measureGeoRef.current;');
    expect(sida).toContain('const onClick = tillatIRitlage((e: any) => {\n      const ll = e?.lngLat;\n      if (!ll) return;\n      setRisaTaps(');
  });
  it('symbol-, linje-, yt-, hög-, GROT-, larm- och avläggskorten är INTE märkta (de ska tystna i ritläge)', () => {
    for (const namn of ['handleMarkerFeatureClick', 'handleHogarClick', 'handleClusterClick', 'handleMapClick', 'handleGrotClick', 'onLineClick', 'onZoneClick', 'onLarmClick', 'onRagangKlick', 'onYtaNrKlick']) {
      expect(sida, namn).not.toMatch(new RegExp(`const ${namn} = tillatIRitlage`));
    }
  });
  it('de två trycken (kör upp, träd): alla kartlyssnare i lib/tvaTryck är märkta', () => {
    const t = las('lib/tvaTryck.ts');
    for (const namn of ['onKlick', 'visa', 'doljVidLyft']) expect(t, namn).toMatch(new RegExp(`const ${namn} = tillatIRitlage\\(`));
    expect(t).toContain("map.on('click', onKlick);");
  });
});

describe('två tryck i stället för drag', () => {
  it('ingen dragkod kvar för träd eller kör upp: ingen mousedown/touchstart på kartans canvas i lib/tvaTryck', () => {
    const t = las('lib/tvaTryck.ts');
    expect(t).not.toMatch(/addEventListener|dragPan|mousedown/);
    expect(t).toContain('map.doubleClickZoom?.disable();');
    expect(t).toContain('map.doubleClickZoom?.enable();');
  });
  it('sidan kopplar de två trycken i planeringen (inte körvyn) och avslutar läget när andra trycket är gjort', () => {
    expect(sida).toContain("const tvaSlag = isArrowMode && !korvyActive ? (arrowType === KORUPP_TYP ? 'korupp' : arrowType === TRAD_TYP ? 'trad' : null) : null;");
    expect(sida).toContain('useTvaTryck(mapInstanceRef.current, mapLibreReady, {');
    expect(sida).toContain("if (isArrowMode && (arrowType === KORUPP_TYP || arrowType === TRAD_TYP)) return;");
    expect(sida).not.toContain('useFallOchKorUpp');
  });
  it('listen längst ner säger vad nästa tryck är: start, slut, stubbe, riktning', () => {
    for (const t of ['Tryck där vägen börjar', 'Tryck hur långt in du ska köra', 'Tryck där trädet stod', 'Tryck åt vilket håll trädet faller']) expect(sida, t).toContain(t);
  });
});
