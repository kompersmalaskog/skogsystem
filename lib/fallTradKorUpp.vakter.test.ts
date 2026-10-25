// Vakter för fällträd och kör upp och backa (2026-10-25): det som inte får glida tillbaka — läser sidan och lib-filerna, ingen karta.
//   • Ingen migration: båda lagras som pil-markeringar (typ 'pil' — planering_markeringar har en CHECK som bara tillåter symbol/linje/zon/pil).
//   • Bara skördaren ser träden och bara i fällningscirkeln; skotaren inga. Kör upp-pilen nära skördaren och skotaren (80 m). Redigering (vrida, rita) bara i planeringen.
//   • Gamla gröna pilar försvinner först när planeraren godkänt förslaget. Körvyns whitelist, klippning på zoom och klickprioritet känner de nya lagren.
//   • EN ny fast text på kartan: ordet vid kör upp-pilen (skälet). Trädet har ingen text.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SYMBOL_LAGER, SYMBOL_UNDANTAG } from './symbolZoom';
import { KLICK_LAGER } from './klickPrioritet';
import { korUppLager } from './korUpp';
import { tradLager } from './fallTrad';

const rot = process.cwd();
const las = (p: string) => fs.readFileSync(path.join(rot, p), 'utf8');
const sida = las('app/planering/page.tsx');

describe('lagring: ingen migration', () => {
  it('både trädet och kör upp-pilen är pil-markeringar: getMarkerTyp ger "pil" för allt med isArrow, och ingen annan typ skickas till databasen', () => {
    expect(sida).toMatch(/const getMarkerTyp = \(m: Marker\): string => \{[^}]*if \(m\.isArrow\) return 'pil';/);
    for (const f of ['lib/fallTrad.ts', 'lib/korUpp.ts', 'lib/fallTradGester.ts', 'lib/hooks/useFallOchKorUpp.ts']) expect(las(f), f).not.toMatch(/typ:\s*'(trad|korupp|trädet)/);
    expect(las('lib/fallTrad.ts')).toContain("export const TRAD_TYP = 'fellingtree'");
    expect(las('lib/korUpp.ts')).toContain("export const KORUPP_TYP = 'koruppbacka'");
  });
});

describe('vad som syns var', () => {
  it('sidan väljer läge: planering = alla, körvy skotare/skördare = kör upp bara nära (träd bara skördaren)', () => {
    expect(sida).toContain("const lage = !korvyActive ? 'planering' : skotarKorvy ? 'skotare' : 'skordare';");
    expect(sida).toContain('const synliga = synligaTrad(trad, lage, pos);');
    expect(sida).toContain('ksrc.setData(korUppData(synligaKorUpp(pilar, lage, pos)));');
  });
  it('handtaget går bara att dra i planeringen — körvyn rör aldrig ett träd', () => {
    expect(sida).toContain('redigerbara: !korvyActive && !!valtObjekt?.id,');
    expect(sida).toContain("tradSynligaRef.current = lage === 'planering' ? synliga : [];");
    expect(sida).toContain("{ redigera: lage === 'planering' }");
  });
  it('de gamla pilarnas lager får aldrig trädet eller kör upp-pilen (annars saknas bilden arrow-fellingtree)', () => {
    expect(sida).toContain('m.isArrow && !arFallTrad(m) && !arKorUpp(m)');
  });
});

describe('förslaget ur de gröna pilarna', () => {
  it('Godkänn skapar träden och tar DÅ bort pilarna; "Inte nu" tar inte bort något; förslaget finns bara i Fällriktning-läget i planeringen', () => {
    expect(sida).toContain("isArrowMode && arrowType === TRAD_TYP && !tradForslagNej && !korvyActive ? foreslaTrad(markers as any[], svgToLatLon) : null");
    const ja = sida.slice(sida.indexOf("testid: 'trad-forslag-ja'"));
    const jaKropp = ja.slice(0, ja.indexOf("} },"));
    expect(jaKropp).toContain('setMarkers((prev: any[]) => [...prev.filter((m) => !bort.has(String(m.id))), ...nya]);');
    expect(jaKropp).toContain('bortMarkorer.forEach((m) => deleteMarkerFromDb(m.id));');
    const nej = sida.slice(sida.indexOf("testid: 'trad-forslag-nej'"), sida.indexOf("testid: 'trad-forslag-ja'"));
    expect(nej).not.toContain('deleteMarkerFromDb');
    expect(nej).not.toContain('setMarkers');
  });
  it('förslaget syns som spöken med svagare färg innan godkännandet (inte som riktiga träd)', () => {
    expect(sida).toContain('{ redigera: false, forslag: true }');
  });
});

describe('menyn och kartan känner de nya sorterna', () => {
  it('Rita-menyns Pilar-ruta erbjuder bara trädet och kör upp-pilen — de gamla går inte längre att placera', () => {
    expect(sida).toContain('arrowTypes.filter((t) => t.id === TRAD_TYP || t.id === KORUPP_TYP)');
    expect(sida).toContain("{ id: TRAD_TYP, name: 'Fällriktning', color: LEGEND.naturvard },");
    expect(sida).toContain("{ id: KORUPP_TYP, name: 'Kör upp och backa', color: FARG.text },");
  });
  it('ett tryck gör inget i kör upp-läget (det dras), och trädet placeras med ett tryck', () => {
    expect(sida).toContain('if (isArrowMode && arrowType === KORUPP_TYP) return;');
  });
  it('alla nya lager har prefixet line- (körvyns whitelist), och bilderna/lagren läggs i kartan vid start', () => {
    for (const l of [...korUppLager(), ...tradLager()]) expect(l.id.startsWith('line-'), l.id).toBe(true);
    expect(sida).toContain("const KEEP_PREFIX = ['line-',");
    expect(sida).toContain('for (const l of [...korUppLager(), ...tradLager()]) if (!map.getLayer(l.id)) map.addLayer(l);');
  });
  it('symbollagren är klippta eller uttalade undantag; tryck på dem öppnar kortet (klickprioritet: punkt)', () => {
    for (const l of [...korUppLager(), ...tradLager()].filter((x) => x.type === 'symbol')) expect([...SYMBOL_LAGER, ...SYMBOL_UNDANTAG], l.id).toContain(l.id);
    const punkt = KLICK_LAGER.find((k) => k.kategori === 'punkt')!.lager;
    expect(punkt).toContain('line-fall-trad'); expect(punkt).toContain('line-korupp-traff');
    expect(sida).toContain("map.on('click', TRAD_LAGER, handleMarkerFeatureClick);");
    expect(sida).toContain("map.on('click', KORUPP_TRAFF_LAGER, handleMarkerFeatureClick);");
  });
  it('kortet för trädet har ingen ratt (handtaget sitter på kartan); kör upp-pilens kort har skälen', () => {
    expect(sida).toContain('{marker.isArrow && !arFallTrad(marker) && !arKorUpp(marker) && (');
    expect(sida).toContain('data-testid="korupp-skal"');
  });
});

describe('fast text på kartan', () => {
  it('trädet har ingen text; kör upp-pilen har EN: ordet (skälet)', () => {
    expect(tradLager().filter((l) => JSON.stringify(l).includes('text-field'))).toEqual([]);
    expect(korUppLager().filter((l) => JSON.stringify(l).includes('text-field')).map((l) => l.id)).toEqual(['line-korupp-ord']);
    expect(sida).not.toContain("'line-korupp-ord'");   // lagret bor i lib/korUpp, inte som en text i sidan
  });
});

describe('instruktionskortet', () => {
  it('kör upp-pilen är ett område i samlaOmraden (maskinläget), inte en separat kortväg', () => {
    const k = las('lib/instruktioner/instruktioner.ts');
    expect(k).toContain('if (arKorUpp(m)) {');
    expect(k).toContain("kalla: 'planering', etikett: 'Planerare'");
  });
});
