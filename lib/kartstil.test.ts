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
  IKON_STORLEK, STRECK_DASHED, STRECK_RANDAD, STRECK_STENMUR, STRECK_VANLIG, STRECK_ZON, KANT_SVART_MJUK, KANT_SVART_STARK, LEGEND, LINJE_BREDD, LINJE_BREDD_GRANS,
  LINJE_KANT_BREDD, LINJE_KANT_BREDD_GRANS, LINJE_STIL, NUMMER_FONT_PX, NUMMER_STORLEK, PIL_STIL,
  STENMUR_BREDD, STENMUR_FARG, ZON_BREDD, ZON_FYLLNING_OPACITET, ZON_KANT_BREDD, ZON_KANT_FARG,
  ritaPilIkon, zoomKurva,
} from './kartstil';
import { ZONE_COLORS } from './zone-colors';

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

describe('LEGEND', () => {
  it('lib/kartstil.LEGEND ar identisk med LEGEND i planeringsvyn', () => {
    const block = mellan(KALLA, /const LEGEND = \{/, /\n\};/, 'LEGEND');
    const kalla: Record<string, string> = {};
    for (const m of Array.from(block.matchAll(/^\s*(\w+):\s*'([^']+)'/gm))) kalla[m[1]] = m[2];
    expect(Object.keys(kalla).length).toBeGreaterThan(5);
    expect(LEGEND).toEqual(kalla);
  });
});

describe('linjetyperna (lineTypeDefs)', () => {
  const block = mellan(KALLA, /const lineTypeDefs = \[/, /\n\s*\];/, 'lineTypeDefs');
  const farg = (tok: string) => {
    const l = /^LEGEND\.(\w+)$/.exec(tok);
    if (l) return (LEGEND as Record<string, string>)[l[1]] ?? saknas(`LEGEND.${l[1]}`);
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
      return o;
    });
    expect(kalla.length).toBe(12);
    expect(LINJE_STIL).toEqual(kalla);
  });

  it('linjebredder och kantbredder', () => {
    const lw = mellan(KALLA, /const lw = isBoundary/, /const cwLw/, 'lw');
    const lwDelar = lw.split(/\n\s*:\s*/);
    expect(lwDelar.length).toBe(2);
    expect(stopp(lwDelar[0], 'lw/grans')).toEqual(LINJE_BREDD_GRANS.map((s) => [...s]));
    expect(stopp(lwDelar[1], 'lw/annan')).toEqual(LINJE_BREDD.map((s) => [...s]));

    const cw = mellan(KALLA, /const cwLw = isBoundary/, /\/\/ Svart casing/, 'cwLw');
    const delar = cw.split(/\n\s*:\s*/);
    expect(delar.length).toBe(2);
    expect(stopp(delar[0], 'cwLw/grans')).toEqual(LINJE_KANT_BREDD_GRANS.map((s) => [...s]));
    expect(stopp(delar[1], 'cwLw/annan')).toEqual(LINJE_KANT_BREDD.map((s) => [...s]));
  });

  it('kantfarg: stark for gräns, basväg och stig, mjuk for resten', () => {
    expect(sammanfoga(KALLA)).toContain(
      sammanfoga("const casingColor = (isBoundary || isMainRoad || isTrail) ? 'rgba(0,0,0,0.9)' : 'rgba(0,0,0,0.5)'"),
    );
    expect(KANT_SVART_STARK).toBe('rgba(0,0,0,0.9)');
    expect(KANT_SVART_MJUK).toBe('rgba(0,0,0,0.5)');
  });

  it('streckning: dashed [3,2], vanlig [2.5,1.5], randad [2,2]', () => {
    const k = sammanfoga(KALLA);
    // Varden ur LIBBEN byggs in i planeringens text - ar libbens varde ett
    // annat an planeringens finns strangen inte dar. Bada riktningarna fangas.
    const a = (v: readonly number[]) => `[${v.join(', ')}]`;
    expect(k).toContain(sammanfoga(`...(lt.dashed ? { 'line-dasharray': ${a(STRECK_DASHED)} } : {})`));
    expect(k).toContain(sammanfoga(`...(!lt.striped && !lt.dashed ? { 'line-dasharray': ${a(STRECK_VANLIG)} } : {})`));
    expect(k).toContain(sammanfoga(`paint: { 'line-color': lt.color2, 'line-width': lw, 'line-dasharray': ${a(STRECK_RANDAD)} }`));
  });

  it('stenmur: farg, bredd och streckning', () => {
    const block = mellan(KALLA, /if \(lt\.id === 'stonewall'\) \{/, /return;/, 'stenmur');
    expect(block).toContain(`'line-color': '${STENMUR_FARG}'`);
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

  it('fyllning 0,2, mork kant, vit streckning [2,2]', () => {
    const k = sammanfoga(KALLA);
    expect(k).toContain(sammanfoga("gallringCase(GALLRING_FILL_OPACITY, 0.2)"));
    expect(ZON_FYLLNING_OPACITET).toBe(0.2);
    expect(k).toContain(sammanfoga("id: 'zone-outline-casing', type: 'line', source: 'zones-source', filter: ejGallring, paint: { 'line-color': 'rgba(0,0,0,0.6)'"));
    expect(ZON_KANT_FARG).toBe('rgba(0,0,0,0.6)');
    expect(k).toContain(sammanfoga(`'line-color': '#fff', 'line-width': zoneWidth, 'line-dasharray': [${STRECK_ZON.join(', ')}]`));
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
  it('ikonstorleken motsvarar planeringens textstorlek 11/14/17 px', () => {
    const block = mellan(KALLA, /id: 'line-mainroad-label'/, /'symbol-placement'/, 'basvagsetikett');
    const text = stopp(block.slice(block.indexOf("'text-size'")), 'text-size');
    expect(NUMMER_STORLEK.map(([z, s]) => [z, Math.round(s * NUMMER_FONT_PX)])).toEqual(text);
  });

  it('planeringen skriver fortfarande basvagens nummer i etiketten', () => {
    // Ritas som ikon har, men det ar samma uppgift: numret ur markorens `nummer`.
    expect(KALLA).toContain("m.lineType === 'mainRoad' && typeof m.nummer === 'number'");
  });
});

describe('zoomKurva ar den enda kurvbyggaren', () => {
  it('ger exakt formen planeringen skriver for hand', () => {
    expect(zoomKurva([[5, 3], [8, 4]])).toEqual(['interpolate', ['linear'], ['zoom'], 5, 3, 8, 4]);
  });
});
