// Vakter för fällträd och kör upp och backa (2026-10-25): det som inte får glida tillbaka — läser sidan och lib-filerna, ingen karta.
//   • Ingen migration: båda lagras som pil-markeringar (typ 'pil' — planering_markeringar har en CHECK som bara tillåter symbol/linje/zon/pil).
//   • Bara skördaren ser träden och bara i fällningscirkeln; skotaren inga. Kör upp-pilen nära skördaren och skotaren (80 m). Att rita kör upp-pilen bara i planeringen. Trädet vrids i kortet (som de gamla pilarna), inte med en gest på kartan.
//   • Gamla gröna pilar försvinner först när planeraren godkänt förslaget. Körvyns whitelist, klippning på zoom och klickprioritet känner de nya lagren.
//   • EN ny fast text på kartan: ordet vid kör upp-pilen (skälet). Trädet har ingen text.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SYMBOL_LAGER, SYMBOL_UNDANTAG } from './symbolZoom';
import { KLICK_LAGER } from './klickPrioritet';
import { korUppLager } from './korUpp';
import { tradLager } from './fallTrad';
import { tvaTryckLager } from './tvaTryck';

const rot = process.cwd();
const las = (p: string) => fs.readFileSync(path.join(rot, p), 'utf8');
const sida = las('app/planering/page.tsx');

describe('lagring: ingen migration', () => {
  it('både trädet och kör upp-pilen är pil-markeringar: getMarkerTyp ger "pil" för allt med isArrow, och ingen annan typ skickas till databasen', () => {
    expect(sida).toMatch(/const getMarkerTyp = \(m: Marker\): string => \{[^}]*if \(m\.isArrow\) return 'pil';/);
    for (const f of ['lib/fallTrad.ts', 'lib/korUpp.ts', 'lib/tvaTryck.ts', 'lib/hooks/useTvaTryck.ts']) expect(las(f), f).not.toMatch(/typ:\s*'(trad|korupp|trädet)/);
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
  it('den vita ringen sitter bara på trädet vars kort är öppet, och bara i planeringen', () => {
    expect(sida).toContain("valdId: lage === 'planering' && markerMenuOpen != null ? String(markerMenuOpen) : null");
  });
  it('träden har ingen gest på kartan: ingen vridning genom drag, inget handtag (stubbe och riktning sätts med två tryck)', () => {
    for (const f of ['lib/tvaTryck.ts', 'lib/hooks/useTvaTryck.ts', 'lib/fallTrad.ts']) expect(las(f), f).not.toMatch(/onVrid|redigerbara|arPaHandtag|handtagPunkt|HANDTAG/);
    expect(sida).not.toMatch(/onVrid|redigerbara:/);
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
    expect(sida).toContain('{ forslag: true }');
  });
});

describe('menyn och kartan känner de nya sorterna', () => {
  it('Rita-menyns Pilar-ruta erbjuder bara trädet och kör upp-pilen — de gamla går inte längre att placera', () => {
    expect(sida).toContain('arrowTypes.filter((t) => t.id === TRAD_TYP || t.id === KORUPP_TYP)');
    expect(sida).toContain("{ id: TRAD_TYP, name: 'Fällriktning', color: LEGEND.naturvard },");
    expect(sida).toContain("{ id: KORUPP_TYP, name: 'Kör upp och backa', color: FARG.text },");
  });
  it('kör upp och träd sätts med TVÅ tryck (useTvaTryck): ritverktygets eget klick lägger ingen av dem', () => {
    expect(sida).toContain('if (isArrowMode && (arrowType === KORUPP_TYP || arrowType === TRAD_TYP)) return;');
  });
  it('alla nya lager har prefixet line- (körvyns whitelist), och bilderna/lagren läggs i kartan vid start', () => {
    for (const l of [...korUppLager(), ...tradLager(), ...tvaTryckLager()]) expect(l.id.startsWith('line-'), l.id).toBe(true);
    expect(sida).toContain("const KEEP_PREFIX = ['line-',");
    expect(sida).toContain('for (const l of [...korUppLager(), ...tradLager(), ...tvaTryckLager()]) if (!map.getLayer(l.id)) map.addLayer(l);');
  });
  it('symbollagren är klippta eller uttalade undantag; tryck på dem öppnar kortet (klickprioritet: punkt)', () => {
    for (const l of [...korUppLager(), ...tradLager()].filter((x) => x.type === 'symbol')) expect([...SYMBOL_LAGER, ...SYMBOL_UNDANTAG], l.id).toContain(l.id);
    const punkt = KLICK_LAGER.find((k) => k.kategori === 'punkt')!.lager;
    expect(punkt).toContain('line-fall-trad'); expect(punkt).toContain('line-korupp-traff');
    expect(sida).toContain("map.on('click', TRAD_LAGER, handleMarkerFeatureClick);");
    expect(sida).toContain("map.on('click', KORUPP_TRAFF_LAGER, handleMarkerFeatureClick);");
  });
  it('trädet vrids i kortet med SAMMA ratt som de gamla pilarna; kör upp-pilen har ingen ratt (den ritas) men skälen', () => {
    expect(sida).toContain('{marker.isArrow && !arKorUpp(marker) && (');
    expect(sida).toContain('<ArrowRotationControl');
    expect(sida).toContain('data-testid="korupp-skal"');
  });
});

describe('läget ligger kvar tills Klar (Martin 2026-10-25: flera träd/pilar i rad, som Rita)', () => {
  const klart = sida.slice(sida.indexOf('onKlart: (k) => {'), sida.indexOf('const avslutaTvaTryck'));
  it('ett färdigt träd eller en färdig pil avslutar INTE läget: onKlart rör varken isArrowMode eller arrowType', () => {
    expect(klart).toContain('setMarkers(');
    expect(klart).not.toContain('setIsArrowMode');
    expect(klart).not.toContain('setArrowType');
    expect(klart).not.toContain('setMarkerMenuOpen');   // skäl-kortet öppnas först vid Klar, annars ligger det i vägen för nästa tryck
  });
  it('✓ Klar finns i pil-listan (grön, som Rita) och avslutar läget utan att öppna något kort; × avbryter', () => {
    expect(sida).toContain("{ etikett: '✓', aria: 'Klar', onClick: avslutaTvaTryck, gron: true, testid: 'pil-klar' }");
    const fn = sida.slice(sida.indexOf('const avslutaTvaTryck'), sida.indexOf('// === KÖRVY (3D-förarvy) effekter ==='));
    expect(fn).toContain('setIsArrowMode(false); setArrowType(null);');
    expect(fn).not.toContain('setMarkerMenuOpen');   // inget kort vid Klar: skälet är redan valt i listen
    expect(fn).toContain('tvaTryckData(null, null)');   // en pågående start/förhandsvisning kastas
    expect(sida).toContain("'pil-avbryt'");
  });
});

describe('skäl i listen nertill (Martin 2026-10-25, skiss 60)', () => {
  it('listen har en rad med alla skäl medan kör upp-läget är på, och valt skäl följer med varje ny pil', () => {
    expect(sida).toContain("val={!tradForslagAktivt && tvaSlag === 'korupp' ? KORUPP_SKAL.map(");
    expect(sida).toContain('nyKorUpp(k.start, k.slut, k.vagId, Date.now(), korUppSkalRef.current)');
  });
  it('skälet börjar om på Inget när läget slutar eller byts', () => {
    expect(sida).toContain("if (tvaSlag !== 'korupp') setKorUppSkal('inget');");
  });
});

describe('fast storlek på skärmen', () => {
  it('kör upp-pilen har samma tjocklek och spets vid varje zoom: inga zoomuttryck i lagren', () => {
    for (const l of korUppLager().filter((x) => x.id !== 'line-korupp-ord')) expect(JSON.stringify(l.paint ?? {}) + JSON.stringify(l.layout ?? {}), l.id).not.toContain('"zoom"');
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
