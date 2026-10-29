// DRIFTVAKT mellan lib/kartstil.ts och app/planering/page.tsx.
//
// Linjetyper, zoner, pilar och symbolernas storlek ritas INLINE i planeringsvyn
// och ar inte exporterade. lib/kartstil.ts ar en medveten kopia av dem, sa att
// egenkontrollens karta kan se ut som planeringen utan att planeringsvyn rors.
//
// En kopia glider isar fran sin kalla och ingen marker det forran nagon andrar
// i den ena. Det har testet gor att nagon marker det: det LASER page.tsx och
// jamfor varje varde. Andrar nagon en linjebredd, en farg eller en streckning
// dar utan att andra lib/kartstil.ts faller testet, och meddelandet sager
// vilken sida som glidit.
//
// KAN testet inte lasa nagot ur page.tsx - for att nagon byggt om det - sa
// FALLER det, hellre an att tyst sluta vakta. Uppdatera da extraktionen har.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  zonKantLager,
  IKON_STORLEK, STRECK_DASHED, STRECK_RANDAD, STRECK_STENMUR, STRECK_VANLIG, KANT_SVART_MJUK, KANT_SVART_STARK, VAG_KANT_FARG, LEGEND, LINJE_BREDD, LINJE_BREDD_GRANS,
  LINJE_KANT_BREDD, LINJE_KANT_BREDD_GRANS, LINJE_STIL, NUMMER_FONT_PX, NUMMER_STORLEK, PIL_STIL,
  STENMUR_BREDD, STENMUR_FARG, STENMUR_KANT_EXTRA, ZON_BREDD, ZON_FYLLNING_OPACITET, ZON_KANT_BREDD, ZON_KANT_FARG,
  ritaPilIkon, zoomKurva,
} from './kartstil';
import { ZONE_COLORS } from './zone-colors';
import { symbolDef } from './symboler';
import { MAPLIBRE_SPACING_FAKTOR, KRAFTLEDNING_KANT_EXTRA, KRAFTLEDNING_STOLPE_AVSTAND_PX, KRAFTLEDNING_STOLPE_BILD, KRAFTLEDNING_SYMBOL_AVSTAND_PX, kraftledningLager, BASVAG_STRECK_DASH, linjeLager } from './kartstil';
import { FARG_FARA, FARG_KULTUR, FARG_NATUR, FARG_STENMUR } from './larm/grupper';

// Radslut normaliseras: filen kan ha CRLF pa Windows och LF pa Vercel, och
// vakten ska ge samma svar bada stallena.
//
// KARTSTIL_PLANERING_KALLA later vakten lasa en annan fil an riktiga page.tsx.
// Det finns for ETT skal: att kunna bevisa att vakten larmar nar PLANERINGENS
// sida andras, utan att nagonsin behova rora den riktiga filen. Satts den inte
// lases alltid app/planering/page.tsx.
const KALLSOKVAG = process.env.KARTSTIL_PLANERING_KALLA ?? path.resolve(__dirname, '../app/planering/page.tsx');
const KALLA = readFileSync(KALLSOKVAG, 'utf8').replace(/\r\n/g, '\n');

function saknas(vad: string): never {
  throw new Error(
    `Kunde inte lasa "${vad}" ur app/planering/page.tsx - nagon har byggt om det. ` +
    'Vakten kan inte jamfora och faller hellre an tystnar. Uppdatera extraktionen i lib/kartstil.test.ts.',
  );
}

/** Texten mellan `start` och forsta `slut` efter den. */
function mellan(text: string, start: RegExp, slut: RegExp, vad: string): string {
  const s = start.exec(text);
  if (!s) saknas(vad);
  const efter = text.slice(s.index + s[0].length);
  const e = slut.exec(efter);
  if (!e) saknas(vad);
  return efter.slice(0, e.index);
}

/** `['interpolate', ['linear'], ['zoom'], 5, 3, 8, 4]` -> [[5,3],[8,4]] */
function stopp(uttryck: string, vad: string): [number, number][] {
  const m = /\['zoom'\],\s*([-\d.,\s]+)\]/.exec(uttryck);
  if (!m) saknas(vad);
  const tal = m[1].split(',').map((t) => t.trim()).filter(Boolean).map(Number);
  if (tal.length % 2 !== 0 || tal.some((n) => !Number.isFinite(n))) saknas(vad);
  const ut: [number, number][] = [];
  for (let i = 0; i < tal.length; i += 2) ut.push([tal[i], tal[i + 1]]);
  return ut;
}

const sammanfoga = (s: string) => s.replace(/\s+/g, '');

/** Färgkonstanterna ur färggrupperna (lib/larm/grupper) som planeringens källtext använder vid namn. */
const FARG_KONSTANTER: Record<string, string> = { FARG_FARA, FARG_NATUR, FARG_KULTUR, FARG_STENMUR };

describe('LEGEND', () => {
  it('lib/kartstil.LEGEND ar identisk med LEGEND i planeringsvyn', () => {
    const block = mellan(KALLA, /const LEGEND = \{/, /\n\};/, 'LEGEND');
    const kalla: Record<string, string> = {};
    for (const m of Array.from(block.matchAll(/^\s*(\w+):\s*(?:'([^']+)'|(FARG_\w+))/gm))) kalla[m[1]] = m[2] ?? FARG_KONSTANTER[m[3]] ?? saknas(m[3]);
    expect(Object.keys(kalla).length).toBeGreaterThan(5);
    expect(LEGEND).toEqual(kalla);
  });
});

describe('linjetyperna (lineTypeDefs)', () => {
  const block = mellan(KALLA, /const lineTypeDefs = \[/, /\n\s*\];/, 'lineTypeDefs');
  const farg = (tok: string) => {
    const l = /^LEGEND\.(\w+)$/.exec(tok);
    if (l) return (LEGEND as Record<string, string>)[l[1]] ?? saknas(`LEGEND.${l[1]}`);
    if (FARG_KONSTANTER[tok]) return FARG_KONSTANTER[tok];
    const s = /^'([^']+)'$/.exec(tok);
    return s ? s[1] : saknas(`farg ${tok}`);
  };

  it('samma typer, farger, strackning och ordning', () => {
    const kalla = Array.from(block.matchAll(/\{\s*id:\s*'(\w+)'([^}]*)\}/g)).map((m) => {
      const rest = m[2];
      const hamta = (nyckel: string) => new RegExp(`${nyckel}:\\s*([^,}]+)`).exec(rest)?.[1].trim();
      const o: Record<string, unknown> = { id: m[1], color: farg(hamta('color') ?? saknas(`${m[1]}.color`)) };
      const c2 = hamta('color2');
      if (c2) o.color2 = farg(c2);
      if (/striped:\s*true/.test(rest)) o.striped = true;
      if (/dashed:\s*true/.test(rest)) o.dashed = true;
      if (/stonewall:\s*true/.test(rest)) o.stonewall = true;
      if (/kraftledning:\s*true/.test(rest)) o.kraftledning = true;
      if (/solid:\s*true/.test(rest)) o.solid = true;
      if (/tunn:\s*true/.test(rest)) o.tunn = true;
      return o;
    });
    expect(kalla.length).toBe(10);   // backRoad* (3) borttagna: backväg är en egenskap på vägen; + El-ledning som linje (powerline)
    expect(LINJE_STIL).toEqual(kalla);
  });

  it('linjebredder och kantbredder', () => {
    const lw = mellan(KALLA, /const lw = isBoundary/, /const cwLw/, 'lw');
    const lwDelar = lw.split(/\n\s*:\s*/);
    expect(lwDelar.length).toBe(3);   // gräns · tunn (Naturvård) · övriga
    expect(stopp(lwDelar[0], 'lw/grans')).toEqual(LINJE_BREDD_GRANS.map((s) => [...s]));
    expect(lwDelar[1]).toContain('NATURVARD_BREDD');
    expect(stopp(lwDelar[2], 'lw/annan')).toEqual(LINJE_BREDD.map((s) => [...s]));

    const cw = mellan(KALLA, /const cwLw = isBoundary/, /\/\/ Mörk kant bakom varje linje/, 'cwLw');
    const delar = cw.split(/\n\s*:\s*/);
    expect(delar.length).toBe(3);
    expect(stopp(delar[0], 'cwLw/grans')).toEqual(LINJE_KANT_BREDD_GRANS.map((s) => [...s]));
    expect(delar[1]).toContain('NATURVARD_KANT_BREDD');
    expect(stopp(delar[2], 'cwLw/annan')).toEqual(LINJE_KANT_BREDD.map((s) => [...s]));
  });

  it('kantfarg: stark for gräns, basväg och stig, mjuk for resten', () => {
    expect(sammanfoga(KALLA)).toContain(
      sammanfoga("const casingColor = (isBoundary || isMainRoad || isTrail || arStickvag(lt.id)) ? VAG_KANT_FARG : 'rgba(0,0,0,0.5)'"),
    );
    expect(KANT_SVART_STARK).toBe('rgba(0,0,0,0.9)');
    expect(VAG_KANT_FARG).toBe(KANT_SVART_STARK);   // planeringens vägkant och egenkontrollens är samma färg
    expect(KANT_SVART_MJUK).toBe('rgba(0,0,0,0.5)');
  });

  it('streckning: dashed [3,2], vanlig [2.5,1.5], randad [2,2]', () => {
    const k = sammanfoga(KALLA);
    // Varden ur LIBBEN byggs in i planeringens text - ar libbens varde ett
    // annat an planeringens finns strangen inte dar. Bada riktningarna fangas.
    const a = (v: readonly number[]) => `[${v.join(', ')}]`;
    expect(k).toContain(sammanfoga(`...(lt.dashed ? { 'line-dasharray': ${a(STRECK_DASHED)} } : {})`));
    expect(k).toContain(sammanfoga(`...(!lt.striped && !lt.dashed && !lt.solid ? { 'line-dasharray': ${a(STRECK_VANLIG)} } : {})`));
    // Randad: basvägen (blå/gul) har lika långa streck med PLATTA ändar (BASVAG_STRECK_*); övriga randade linjer är oförändrade [2, 2] med rundade ändar.
    expect(k).toContain(sammanfoga(`paint: { 'line-color': lt.color2, 'line-width': (isMainRoad ? korBredd(lw) : lw) as any, 'line-dasharray': isMainRoad ? [...BASVAG_STRECK_DASH] : ${a(STRECK_RANDAD)} }`));
    expect([...BASVAG_STRECK_DASH]).toEqual([...STRECK_RANDAD]);
  });

  it('egenkontrollens karta: basvägens streck har platta ändar (som planeringen), övriga randade linjer rundade', () => {
    const lager = linjeLager('k', 'ek', null);
    const streck = (typ: string) => lager.find((l: any) => l.id === `ek-lin-${typ}-streck`);
    expect(streck('mainRoad').layout['line-cap']).toBe('butt');
    expect(streck('mainRoad').paint['line-dasharray']).toEqual([2, 2]);
    expect(streck('boundary').layout['line-cap']).toBe('round');
    expect(streck('boundary').paint['line-dasharray']).toEqual([2, 2]);
  });

  it('Naturvård är en tunn heldragen grön linje — inget rött streck (rött betyder fara, Martin 2026-10-28)', () => {
    const lager = linjeLager('k', 'ek', null);
    expect(lager.find((l: any) => l.id === 'ek-lin-nature-streck')).toBeUndefined();
    const bas = lager.find((l: any) => l.id === 'ek-lin-nature');
    expect(bas.paint['line-dasharray']).toBeUndefined();
    expect(bas.paint['line-color']).toBe(LEGEND.naturvard);
    const k = sammanfoga(KALLA);
    expect(k).toContain(sammanfoga("{ id: 'nature', color: LEGEND.naturvard, solid: true, tunn: true }"));
    expect(k).not.toMatch(/id: 'nature'[^}]*LEGEND\.fara/);
  });

  it('planeringen tonar ALDRIG ner traktgransen (undantaget som kontextlagret speglar)', () => {
    // Kontextlagret i egenkontrollen tonar ner linjerna men inte traktgransen
    // (TRAKTGRANS_TYP i lib/egenkontrollkarta.ts). Det ar planeringens regel:
    // gransen tas bort ur listan av nedtonbara typer. Andras den regeln dar
    // maste kontextlagret ses over - annars glider utseendet isar igen.
    const k = sammanfoga(KALLA);
    expect(k).toContain(sammanfoga('const dimmableLineTypes = lineTypeIds.filter(lt => lt !== \'boundary\');'));
    expect(k).toContain(sammanfoga('// Traktgräns: alltid tydlig'));
  });

  it('stenmur: farg, bredd och streckning', () => {
    const helt = mellan(KALLA, /if \(lt\.id === 'stonewall'\) \{/, /return;/, 'stenmur');
    expect(helt).toContain("id: 'line-stonewall-casing'");   // mörk kant under, som övriga linjer
    // KRAFTIG kant: bredare än muren med STENMUR_KANT_EXTRA, nära svart — ingen andra nyans.
    const kant = helt.slice(helt.indexOf("id: 'line-stonewall-casing'"), helt.indexOf("id: 'line-stonewall-base'"));
    expect(stopp(kant, 'stenmur/kant')).toEqual(STENMUR_BREDD.map(([z, v]) => [z, v + STENMUR_KANT_EXTRA]));
    expect(kant).toContain('rgba(0,0,0,0.9)');
    expect(STENMUR_KANT_EXTRA).toBeGreaterThanOrEqual(5);
    const block = helt.slice(helt.indexOf("id: 'line-stonewall-base'"));
    expect(block).toContain("'line-color': FARG_STENMUR");
    expect(STENMUR_FARG).toBe(FARG_STENMUR);   // Stenmur = Kultur (brun), gruppens färg
    expect(stopp(block, 'stenmur/bredd')).toEqual(STENMUR_BREDD.map((s) => [...s]));
    expect(sammanfoga(block)).toContain(sammanfoga(`'line-dasharray': [${STRECK_STENMUR.join(', ')}]`));
    expect(sammanfoga(block)).toContain(sammanfoga("'line-cap': 'butt'"));
  });
});

describe('zonerna', () => {
  it('zonbredd och kantbredd', () => {
    const w = mellan(KALLA, /const zoneWidth = /, /as any;/, 'zoneWidth');
    const c = mellan(KALLA, /const zoneCasingWidth = /, /as any;/, 'zoneCasingWidth');
    expect(stopp(w, 'zoneWidth')).toEqual(ZON_BREDD.map((s) => [...s]));
    expect(stopp(c, 'zoneCasingWidth')).toEqual(ZON_KANT_BREDD.map((s) => [...s]));
  });

  it('fyllning 0,2, mork kant, INGEN vit streckning (ytans farg ar gruppens farg)', () => {
    const k = sammanfoga(KALLA);
    expect(k).toContain(sammanfoga("gallringCase(GALLRING_FILL_OPACITY, 0.2)"));
    expect(ZON_FYLLNING_OPACITET).toBe(0.2);
    expect(k).toContain(sammanfoga("id: 'zone-outline-casing', type: 'line', source: 'zones-source', filter: ejGallring, paint: { 'line-color': 'rgba(0,0,0,0.6)'"));
    expect(ZON_KANT_FARG).toBe('rgba(0,0,0,0.6)');
    expect(k).not.toContain("id: 'zone-outline-dash'");
    expect(sammanfoga(JSON.stringify(zonKantLager('k', 'ek', null)))).not.toContain('dasharray');
  });

  it('zonfarger kommer ur lib/zone-colors - planeringens egen kalla', () => {
    // zoneTypes i planeringen bygger pa ZONE_COLORS.<typ>; har ska varje nyckel finnas.
    for (const typ of Object.keys(ZONE_COLORS)) {
      expect(ZONE_COLORS[typ]).toMatch(/^#[0-9a-f]{6}$/i);
    }
    expect(KALLA).toContain("import { ZONE_COLORS } from '@/lib/zone-colors'");
  });
});

describe('symboler och pilar', () => {
  it('symbolernas storlekskurva (markers-layer)', () => {
    const block = mellan(KALLA, /id: 'markers-layer',/, /'icon-allow-overlap'/, 'markers-layer');
    expect(stopp(block, 'icon-size')).toEqual(IKON_STORLEK.map((s) => [...s]));
  });

  it('pilarnas typer och farger', () => {
    const block = mellan(KALLA, /\(\[\s*\n\s*\{ id: 'fellingdirection'/, /\]\)\.forEach/, 'pilar');
    const kalla = Array.from(('{ id: \'fellingdirection\'' + block).matchAll(/id:\s*'(\w+)',\s*color:\s*LEGEND\.(\w+)/g))
      .map((m) => ({ id: m[1], color: (LEGEND as Record<string, string>)[m[2]] }));
    expect(kalla.length).toBe(2);
    expect(PIL_STIL).toEqual(kalla);
  });

  it('pilens storlek foljer symbolernas', () => {
    const block = mellan(KALLA, /id: 'arrows-layer',/, /'icon-rotate'/, 'arrows-layer');
    expect(stopp(block, 'pil/icon-size')).toEqual(IKON_STORLEK.map((s) => [...s]));
  });

  it('ritaPilIkon ritar exakt samma sak som planeringens', () => {
    // Jamfor ritsatserna (ctx.*), inte formateringen. Vitest kompilerar vart
    // eget TS med esbuild, som skriver om 'round' till "round" - citattecknen
    // normaliseras, annars larmar testet for nagot som inte ar drift.
    const satser = (t: string) =>
      (t.match(/ctx\.[a-zA-Z]+(?:\([^;]*\)|\s*=\s*[^;]+);/g) ?? [])
        .map((x) => sammanfoga(x).replace(/"/g, "'"));
    const fn = mellan(KALLA, /function ritaPilIkon\(/, /\n\}\n/, 'ritaPilIkon');
    const kalla = satser(fn);
    expect(kalla.length).toBeGreaterThan(8);
    expect(satser(ritaPilIkon.toString())).toEqual(kalla);
  });
});

describe('basvagsnumret', () => {
  it('ikonstorleken motsvarar textstorleken 11/14/17 px (planeringen skriver ingen fast vägetikett längre — egenkontrollens ikon behåller de gamla måtten)', () => {
    expect(NUMMER_STORLEK.map(([z, s]) => [z, Math.round(s * NUMMER_FONT_PX)])).toEqual([[12, 11], [15, 14], [17, 17]]);
  });

  it('planeringen har INGEN fast vägetikett: nummer och längd visas först vid tryck (Kartan lugnare)', () => {
    expect(KALLA).not.toContain("id: 'line-mainroad-label'");
  });
});

describe('zoomKurva ar den enda kurvbyggaren', () => {
  it('ger exakt formen planeringen skriver for hand', () => {
    expect(zoomKurva([[5, 3], [8, 4]])).toEqual(['interpolate', ['linear'], ['zoom'], 5, 3, 8, 4]);
  });
});

describe('en dämpad El-ledning (egenkontrollens kontextkarta) — samma funktion, nedtonad', () => {
  const lager = kraftledningLager('k', 'p', null, true, { opacitet: 0.4, breddFaktor: 0.6, utanKant: true });
  it('alla lager har opacitet ≤ 0,5 och kanten (casing) utelämnas när dimningen säger utanKant', () => {
    expect(lager.map((l: any) => l.id)).toEqual(['p-line', 'p-stolpar', 'p-symbol']);
    for (const l of lager) expect(l.paint['line-opacity'] ?? l.paint['icon-opacity'], l.id).toBeLessThanOrEqual(0.5);
  });
  it('med kant (dimning utan utanKant) är casingen dämpad den också', () => {
    const med = kraftledningLager('k', 'p', null, true, { opacitet: 0.4, breddFaktor: 1 });
    expect(med.find((l: any) => l.id === 'p-casing').paint['line-opacity']).toBe(0.4);
  });
  it('utan dimning är allt som förut: full opacitet, casing först', () => {
    const full = kraftledningLager('k', 'p', null);
    expect(full[0].id).toBe('p-casing');
    expect(full[0].paint['line-opacity']).toBe(1);
  });
});

describe('kraftledningen ser ut som en ledning (kraftledningLager)', () => {
  const lager = kraftledningLager('trakt-geo-source', 'trakt-kraftledning', ['==', ['get', 'x'], 1], false);
  const id = (s: string) => lager.find((l: any) => l.id === `trakt-kraftledning-${s}`);
  it('fyra lager, underst till överst: kant, linje, stolpar, farosymbol — och de startar dolda när sidan tänder dem', () => {
    expect(lager.map((l: any) => l.id)).toEqual(['trakt-kraftledning-casing', 'trakt-kraftledning-line', 'trakt-kraftledning-stolpar', 'trakt-kraftledning-symbol']);
    for (const l of lager) { expect(l.layout.visibility).toBe('none'); expect(l.filter).toEqual(['==', ['get', 'x'], 1]); }
    expect(kraftledningLager('k', 'p', null).every((l: any) => l.layout.visibility === 'visible' && !('filter' in l))).toBe(true);
  });
  it('röd linje (gruppens röd) med mörk kant som är bredare än linjen — heldragen', () => {
    expect(id('line').paint['line-color']).toBe(FARG_FARA);
    expect(id('line').paint).not.toHaveProperty('line-dasharray');
    expect(id('casing').paint['line-color']).toBe(KANT_SVART_STARK);
    const bredd = (l: any) => (l.paint['line-width'] as any[]).filter((_, i) => i >= 3 && i % 2 === 0);
    bredd(id('line')).forEach((w, i) => expect(bredd(id('casing'))[i]).toBeCloseTo(w + KRAFTLEDNING_KANT_EXTRA, 3));
  });
  it('stolpar: ett tvärstreck vinkelrätt mot linjen ungefär var 40:e px (symbol-placement line, kartans rotation)', () => {
    const l = id('stolpar');
    expect(l.type).toBe('symbol');
    expect(l.layout['symbol-placement']).toBe('line');
    expect(KRAFTLEDNING_STOLPE_AVSTAND_PX).toBe(40);   // målet på skärmen; MapLibre ritar ~1,2 × det inställda värdet (kalibrerat, se kartstil)
    expect(l.layout['symbol-spacing']).toBe(Math.round(40 / MAPLIBRE_SPACING_FAKTOR));
    expect(l.layout['symbol-spacing'] * MAPLIBRE_SPACING_FAKTOR).toBeGreaterThan(38);
    expect(l.layout['symbol-spacing'] * MAPLIBRE_SPACING_FAKTOR).toBeLessThan(42);
    expect(l.layout['icon-image']).toBe(KRAFTLEDNING_STOLPE_BILD);
    expect(l.layout['icon-rotation-alignment']).toBe('map');   // ikonens x-axel följer linjen; stapeln är lodrät i bilden → vinkelrät mot linjen
    expect(l.layout['icon-allow-overlap']).toBe(true);
  });
  it('farosymbolen (röd triangel med blixt, ur symbolkällan) EN gång per ledningsbit, mitt på, upprätt (2026-10-28)', () => {
    const l = id('symbol');
    expect(l.layout['symbol-placement']).toBe('line-center');
    expect(l.layout['symbol-spacing']).toBeUndefined();
    expect(KRAFTLEDNING_SYMBOL_AVSTAND_PX).toBe(250);   // A4 upprepar fortfarande
    expect(l.layout['icon-image']).toBe('marker-powerline');
    expect(l.layout['icon-rotation-alignment']).toBe('viewport');
    expect(symbolDef('powerline')).toMatchObject({ form: 'triangel', farg: FARG_FARA });
  });
  it('sidan ritar Vidas kraftledning med EXAKT den här funktionen (ingen egen, streckad variant kvar), och en ledning är ett undantag från zoom-klippet', () => {
    const sida = readFileSync('app/planering/page.tsx', 'utf8');
    expect(sida).toContain("kraftledningLager('trakt-geo-source', 'trakt-kraftledning'");
    expect(sida).not.toMatch(/id: 'trakt-kraftledning-line', type: 'line'/);
    expect(sida).toContain('ritaStolpeIkon()');
    const symbolZoom = readFileSync('lib/symbolZoom.ts', 'utf8');
    expect(symbolZoom).toContain("'trakt-kraftledning-stolpar'");
    expect(symbolZoom).toContain("'trakt-kraftledning-symbol'");
    for (const l of ['casing', 'line', 'stolpar', 'symbol']) expect(sida).toContain("`trakt-kraftledning-${l}`");   // tänds/släcks med Kör & fara
  });
});
