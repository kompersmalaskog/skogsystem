// Skotningsrapporten som FIL: ritas PDF:en, och står talen i den?
//
// Ett grönt test på vymodellen bevisar bara att texten är rätt uträknad. Det
// Martin skickar till inköparen är en PDF, och den enda kontrollen som duger
// är att rendera den och läsa tillbaka den: texten med unpdf, kartan och
// staplarna som pixlar med pdftoppm. En tom kartruta, en tabell som hamnade
// under kartan i stället för bredvid, eller en glyf som inte ritas syns inte i
// någon vymodell.
//
// LAYOUTEN ÄR EN DEL AV KRAVET. Martin godkände en skiss där kartan och "Var
// låg virket?" står SIDA VID SIDA; första bygget la kartan på en egen sida och
// han såg direkt att det inte var sidan han sagt ja till. Därför mäts de två
// kolumnerna i pixlar, inte bara texten.
//
// Kartan är Skälvikens riktiga geometri ur prod (fixturen), så måtten,
// stammolnets täthet och avläggets placering är verkliga.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractText, getDocumentProxy } from 'unpdf';
import { skotningsrapport, type SkotningsrapportIndata } from './skotningsrapport';
import { harKarta, skapaSkotningsrapportPdf, type RapportKarta } from './skotningsrapportPdf';
import type { CykelSammanstallning } from './lassCykel';
import fixtur from './__fixtures__/skalviken_karta_2026-11-25.json';
import { SKALVIKEN_AVLAGG, SKALVIKEN_RUTOR } from './__fixtures__/skalviken_virke_2026-11-25';

const latlng = (c: number[][]) => c.map(([lng, lat]) => ({ lat, lng }));

const KARTA: RapportKarta = {
  granser: (fixtur.granser as number[][][]).map(latlng),
  stammar: latlng(fixtur.stammar as number[][]),
  korspar: (fixtur.skotarspar as number[][][]).map(latlng),
  avlagg: [{ nr: 1, namn: '01-1', plats: { lat: 56.28761946, lng: 15.37559972 } }],
};

const TOM: RapportKarta = { granser: [], stammar: [], korspar: [], avlagg: [] };

const CYKEL: CykelSammanstallning = {
  lass: 85, medCykel: 70, volym: 1553, volymMedCykel: 1278,
  cykelM: 1477, enkelVagM: 738.6, hemMedLassM: 660, vidAvlaggetM: 250,
  ytterstM: 414.4,
  utan: { fonster_for_langt: 14, forsta_lasset: 1 },
};

const SKALVIKEN: SkotningsrapportIndata = {
  trakt: {
    namn: 'Skälviken RP J-Hus -25', voNummer: '11271860', kund: 'Vida',
    avtalsform: 'Rp', arealHa: 7.28,
  },
  skotare: ['Elefant 26'],
  period: { fran: '2026-11-03', till: '2026-11-18' },
  dagar: 11,
  volymM3fub: 1746.35,
  avstandM: 414.4,
  handsatt: false,
  cykel: CYKEL,
  lass: [
    { avstandM: 672, volym: 18, kalla: 'app' },
    { avstandM: 414, volym: 20, kalla: 'app' },
    { avstandM: 40, volym: 19, kalla: 'app' },
  ],
  virke: SKALVIKEN_RUTOR,
  avlagg: [{ ...SKALVIKEN_AVLAGG, namn: '01-1' }],
  pris: { grundavstandM: 200, krPer100m: 4, kronor: 20956.2 },
};

const bygg = (i: SkotningsrapportIndata = SKALVIKEN, k: RapportKarta = KARTA) =>
  skapaSkotningsrapportPdf(skotningsrapport(i), k);

/** PDF:ens hela text, med hårda mellanslag normaliserade. */
async function pdfText(bytes: Uint8Array): Promise<string> {
  const doc = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(doc, { mergePages: true });
  return (Array.isArray(text) ? text.join('\n') : text).replace(/[  ]/g, ' ');
}

/**
 * Första förekomsten av ett ord, med koordinater i pt (origo uppe till
 * vänster, A4 = 595 × 842). `pdftotext -bbox` ger exakta lägen — bättre än
 * gissade pixelrutor när det är LAYOUTEN som ska bevisas.
 */
function ord(bytes: Uint8Array, s: string): { x: number; y: number; x2: number } {
  const dir = mkdtempSync(join(tmpdir(), 'skotrapport-bbox-'));
  const fil = join(dir, 'r.pdf');
  writeFileSync(fil, bytes);
  const xml = execFileSync('pdftotext', ['-bbox', fil, '-']).toString();
  const re = new RegExp(
    `<word xMin="([\\d.]+)" yMin="([\\d.]+)" xMax="([\\d.]+)" yMax="[\\d.]+">${s}</word>`);
  const m = re.exec(xml);
  if (!m) throw new Error(`ordet "${s}" finns inte i PDF:en`);
  return { x: Number(m[1]), y: Number(m[2]), x2: Number(m[3]) };
}

/**
 * Alla förekomster av ett ord, i ordning. Behövs när samma ord står flera
 * gånger på en rad och det är FÖRHÅLLANDET mellan dem som ska bevisas.
 */
function allaOrd(bytes: Uint8Array, s: string): { x: number; y: number; x2: number }[] {
  const dir = mkdtempSync(join(tmpdir(), 'skotrapport-bbox-alla-'));
  const fil = join(dir, 'r.pdf');
  writeFileSync(fil, bytes);
  const xml = execFileSync('pdftotext', ['-bbox', fil, '-']).toString();
  const re = new RegExp(
    `<word xMin="([\\d.]+)" yMin="([\\d.]+)" xMax="([\\d.]+)" yMax="[\\d.]+">${s}</word>`, 'g');
  const ut: { x: number; y: number; x2: number }[] = [];
  for (const m of xml.matchAll(re)) ut.push({ x: Number(m[1]), y: Number(m[2]), x2: Number(m[3]) });
  return ut;
}

/** Sidorna som bilder. Returnerar antalet. */
function antalSidor(bytes: Uint8Array): number {
  const dir = mkdtempSync(join(tmpdir(), 'skotrapport-'));
  const pdf = join(dir, 'rapport.pdf');
  writeFileSync(pdf, bytes);
  execFileSync('pdftoppm', ['-png', '-r', '72', pdf, join(dir, 'sida')]);
  return readdirSync(dir).filter(f => f.endsWith('.png')).length;
}

type Ruta = { x0?: number; x1?: number; y0: number; y1: number };

/** Sidans två kolumner, som andel av bredden. Uppmätta i den riktiga PDF:en. */
const KART_KOL = { x0: 0.08, x1: 0.55 };
const TAB_KOL = { x0: 0.62, x1: 0.95 };

/**
 * Räknar pixlar som inte är sidans vita bakgrund, i en ruta.
 * Alla gränser är andel av bildens bredd/höjd. Läser pdftoppm:s egen
 * PPM-utgång i stället för en bildparser — ingen extra beroende.
 */
function ritat(
  pdf: Uint8Array, r: Ruta, sida = 1, troskel = 235,
  /** Egen färgregel i stället för "mörkare än tröskeln" — för att mäta EN färg. */
  farg?: (r: number, g: number, b: number) => boolean,
): { ritade: number; andel: number } {
  const dir = mkdtempSync(join(tmpdir(), 'skotrapport-ppm-'));
  const fil = join(dir, 'r.pdf');
  writeFileSync(fil, pdf);
  const s = String(sida);
  execFileSync('pdftoppm', ['-r', '110', '-f', s, '-l', s, fil, join(dir, 's')]);
  const ppm = readdirSync(dir).find(f => f.endsWith('.ppm'))!;
  const buf = readFileSync(join(dir, ppm));
  // P6-huvud: "P6\n<b> <h>\n255\n"
  const m = /^P6\s+(\d+)\s+(\d+)\s+(\d+)\s/.exec(buf.subarray(0, 64).toString('latin1'))!;
  const b = Number(m[1]), h = Number(m[2]), start = m[0].length;
  const xf = Math.floor(b * (r.x0 ?? 0)), xt = Math.floor(b * (r.x1 ?? 1));
  let ritade = 0, totalt = 0;
  for (let y = Math.floor(h * r.y0); y < Math.floor(h * r.y1); y++) {
    for (let x = xf; x < xt; x++) {
      const i = start + (y * b + x) * 3;
      totalt++;
      const tr = farg
        ? farg(buf[i], buf[i + 1], buf[i + 2])
        : buf[i] < troskel || buf[i + 1] < troskel || buf[i + 2] < troskel;
      if (tr) ritade++;
    }
  }
  return { ritade, andel: ritade / Math.max(1, totalt) };
}

/**
 * Stapelfärgens pixlar på sida 1 (mörkgrön, SORTIMENTFARG.timmer).
 * Stapelns bakgrund är nästan vit och räknas inte.
 */
function gront(pdf: Uint8Array): number {
  const dir = mkdtempSync(join(tmpdir(), 'skotrapport-gron-'));
  const fil = join(dir, 'r.pdf');
  writeFileSync(fil, pdf);
  execFileSync('pdftoppm', ['-r', '110', '-f', '1', '-l', '1', fil, join(dir, 's')]);
  const ppm = readdirSync(dir).find(f => f.endsWith('.ppm'))!;
  const buf = readFileSync(join(dir, ppm));
  const m = /^P6\s+(\d+)\s+(\d+)\s+(\d+)\s/.exec(buf.subarray(0, 64).toString('latin1'))!;
  const b = Number(m[1]), h = Number(m[2]), start = m[0].length;
  let n = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < b; x++) {
      const i = start + (y * b + x) * 3;
      if (buf[i + 1] > buf[i] + 15 && buf[i + 1] > buf[i + 2] + 15 && buf[i + 1] < 160) n++;
    }
  }
  return n;
}

describe('kartan ritas bara när det finns något att rita', () => {
  it('Skälvikens riktiga geometri ger en karta', () => {
    expect(harKarta(KARTA)).toBe(true);
  });

  it('en tom karta är tom', () => {
    expect(harKarta(TOM)).toBe(false);
    // En ring med en enda punkt är ingen ring, men den räknas som "något" —
    // då ritas gränsen inte, men stammarna/spåret kan ändå vara värda en karta.
    expect(harKarta({ ...TOM, granser: [[{ lat: 56, lng: 15 }]] })).toBe(true);
  });
});

describe('PDF:en', () => {
  it('ALLT PÅ EN SIDA — inköparen ska inte behöva bläddra för svaret', async () => {
    const bytes = await bygg();
    expect(bytes.byteLength).toBeGreaterThan(2000);
    expect(antalSidor(bytes)).toBe(1);
  }, 30000);

  // SKISSENS KRAV. Kartan vänster, tabellen höger, i samma höjd. Mäts i
  // pixlar: en tabell som hamnat UNDER kartan skulle ge noll ritat i höger
  // kolumn på kartans höjd, och testet faller.
  it('KARTAN OCH TABELLEN STÅR SIDA VID SIDA', async () => {
    const bytes = await bygg();
    // Bevisat med ordens egna koordinater: tabellens rubrik börjar i höger
    // halva, och OVANFÖR teckenförklaringen som står under kartan. Hamnar
    // tabellen under kartan blir den y-jämförelsen omvänd.
    const rubrik = ord(bytes, 'Var');                 // "Var låg virket?"
    const underKartan = ord(bytes, 'Traktgränsen');   // teckenförklaringen
    expect(rubrik.x).toBeGreaterThan(300);
    expect(underKartan.x).toBeLessThan(100);
    expect(rubrik.y).toBeLessThan(underKartan.y);
    // Och båda kolumnerna har faktiskt ritats i samma höjdband.
    const vanster = ritat(bytes, { ...KART_KOL, y0: 0.40, y1: 0.52 });
    const hoger = ritat(bytes, { ...TAB_KOL, y0: 0.40, y1: 0.52 });
    expect(vanster.ritade).toBeGreaterThan(1200); // stammoln + gräns + spår
    expect(hoger.ritade).toBeGreaterThan(1500);   // rader + staplar
    // Men ingen av dem är en helsvart platta.
    expect(vanster.andel).toBeLessThan(0.5);
    expect(hoger.andel).toBeLessThan(0.5);
  }, 30000);

  it('MÅTTEN VÄNSTER, "SÅ ÄR DET MÄTT" HÖGER — i samma höjdband', async () => {
    const bytes = await bygg();
    const matt = ord(bytes, 'Halva');       // "Halva cykeln"
    const hur = ord(bytes, 'Täckning');     // sista stycket i "Så är det mätt"
    expect(matt.x).toBeLessThan(150);
    expect(hur.x).toBeGreaterThan(250);
    // Staplade under varandra skulle "Täckning" hamna långt under måtten;
    // bredvid varandra ligger de inom ett par centimeter.
    expect(Math.abs(hur.y - matt.y)).toBeLessThan(60);
  }, 30000);

  it('KARTAN TÄCKER SIN KOLUMN — inte en tunn remsa högst upp', async () => {
    const bytes = await bygg();
    // Ritat både i kartans övre och nedre del. (Mät inte "mer än textsidan":
    // text är TÄTARE än en karta.)
    expect(ritat(bytes, { ...KART_KOL, y0: 0.29, y1: 0.35 }).ritade).toBeGreaterThan(400);
    expect(ritat(bytes, { ...KART_KOL, y0: 0.46, y1: 0.52 }).ritade).toBeGreaterThan(400);
  }, 30000);

  it('STAPLARNA RITAS — andelen syns, inte bara talet', async () => {
    // Mät STAPELFÄRGEN (mörkgrön), inte "finns det mer ritat": en tabell utan
    // staplar men med rader hade annars sett likadan ut för mätningen.
    expect(gront(await bygg())).toBeGreaterThan(400);
    // Utan virke finns varken rader eller staplar.
    expect(gront(await bygg({ ...SKALVIKEN, virke: [] }))).toBeLessThan(50);
  }, 30000);

  it('FACIT: 414 m, 12 kr/m³fub och 20 956 kr står i filen', async () => {
    const t = await pdfText(await bygg());
    for (const del of [
      'Skotningsrapport', 'Skälviken RP J-Hus -25', 'Kompersmåla Skog AB',
      // ³ ritas som en lyft siffra; i filens text blir den en vanlig trea.
      '414 m', '20 956 kr', '12,00 kr', 'per m3fub',
      'Ut till virket', 'fakturerat', '739 m', 'Vid avlägget',
      'Var låg virket?', '1 746 m3fub',
    ]) {
      expect(t, del).toContain(del);
    }
    // Och halva cykelns pris står INTE någonstans — det är inte fakturerat.
    expect(t).not.toContain('41 9');
  }, 30000);

  it('skotningen och de fyra måtten står på sidan', async () => {
    const t = await pdfText(await bygg());
    for (const del of [
      'SKOTNINGEN', 'Kortaste lasset', 'Längsta lasset', 'Lassen tillsammans',
      '3 november 2026 – 18 november 2026',
      'SAMMA KÖRNING, FYRA MÅTT', 'SÅ ÄR DET MÄTT',
    ]) {
      expect(t, del).toContain(del);
    }
    // Summan av lassens enkla vägar påstår aldrig att maskinen körde så långt.
    expect(t).toContain('Maskinen körde mer än så');
    expect(t).not.toContain('Körd sträcka');
  }, 30000);

  it('skalstocken och teckenförklaringen står vid kartan', async () => {
    const t = await pdfText(await bygg());
    // Skalstockens längd i meter — ett jämnt tal följt av " m".
    expect(t).toMatch(/\b(50|100|200|250|500) m\b/);
    expect(t).toContain('Norr är uppåt');
    expect(t).toContain('Traktgränsen');
  }, 30000);

  // Avlägget ligger nästan alltid UTANFÖR traktgränsen, vid vägen — och hela
  // rapporten handlar om avståndet från det. `kartExtent` tar som standard
  // bara traktgräns + stammar, så utan `extentAllt` klipptes avlägget och
  // halva körspåret bort (uppmätt på Skälviken 2026-11-25).
  it('AVLÄGGET ÄR MED I BILDEN, fast det ligger utanför traktgränsen', async () => {
    const utanforTrakten = KARTA.avlagg[0].plats.lat;
    const nordligastIGransen = Math.max(...KARTA.granser.flat().map(p => p.lat));
    expect(utanforTrakten).toBeGreaterThan(nordligastIGransen); // annars provar testet inget

    // Avläggspinnen är en fylld svart ring: en tät mörk fläck överst i
    // kartan, uppmätt på 0,32–0,35 av höjden.
    const ruta = { x0: 0.15, x1: 0.45, y0: 0.32, y1: 0.35 };
    const med = ritat(await bygg(), ruta, 1, 200);
    const utan = ritat(await bygg(SKALVIKEN, { ...KARTA, avlagg: [] }), ruta, 1, 200);
    expect(med.ritade).toBeGreaterThan(utan.ritade + 200);
  }, 30000);

  // pdf-lib ritar inte ² och ³ med StandardFonts.Helvetica: texten hamnar i
  // filen (pdftotext läser "m³fub") men glyfen blir ett TOMRUM på papperet.
  // Ett textprov hade alltså sagt "rätt" medan inköparen läser "1 746 m fub".
  it('ENHETEN SYNS PÅ PAPPERET — "m3fub", aldrig "m fub"', async () => {
    const bytes = await bygg();
    const dir = mkdtempSync(join(tmpdir(), 'skotrapport-enhet-'));
    const fil = join(dir, 'r.pdf');
    writeFileSync(fil, bytes);
    // Filen säger 3:an i klartext, inte ett frågetecken från saneringen.
    const txt = execFileSync('pdftotext', [fil, '-']).toString();
    expect(txt).toContain('m3fub');
    expect(txt).not.toContain('m?fub');
    // ... och den RITAS: tilläggskortets undertext ("1 746 m³fub skördad
    // volym") ligger i tredje kortet, uppmätt på 0,19–0,23 av höjden.
    // Jämförs med samma rapport där volymen saknar enhet: trean är liten,
    // men den FINNS.
    const ruta = { x0: 0.66, x1: 0.96, y0: 0.19, y1: 0.23 };
    expect(ritat(bytes, ruta, 1, 200).ritade).toBeGreaterThan(800);
  }, 30000);

// KERNINGBUGGEN, uppmätt på Bondeskog 2026-11-25. pdf-lib MÄTER text med
  // kerning men RITAR utan, och raden med m³fub ritas i tre drawText
  // (text · upphöjd siffra · text). Lades nästa bit på den MÄTTA bredden
  // hamnade trean 3,1 pt för tidigt — mitt i m:et — och bara på de LÅNGA
  // delarna, så ett m³fub på samma rad kunde se rätt ut medan det andra inte
  // gjorde det. Det syns inte i texten: pdftotext läser "m3fub" i båda fallen.
  it('UPPHÖJDA SIFFRAN SITTER EFTER m:et, också sist på en lång rad', async () => {
    const bytes = await bygg();
    const m = allaOrd(bytes, 'm');
    const treor = allaOrd(bytes, '3');
    expect(m.length).toBeGreaterThan(0);
    expect(treor.length).toBeGreaterThan(0);

    // Varje upphöjd trea (de ligger ovanför radens baslinje) ska börja vid
    // eller efter det m som står närmast till vänster på samma rad.
    let provade = 0;
    for (const tre of treor) {
      const fore = m
        .filter(o => Math.abs(o.y - tre.y) < 3 && o.x < tre.x2)
        .sort((a, b) => b.x - a.x)[0];
      if (!fore) continue;
      provade++;
      // Tolerans 0,1 pt för avrundning i pdftotext.
      expect(tre.x).toBeGreaterThanOrEqual(fore.x2 - 0.1);
    }
    expect(provade).toBeGreaterThan(2);
  }, 30000);

/**
   * MARTINS FYRA KRAV 2026-11-25: "inga röda högar dom ska vara som appen
   * titta dom och hänsyner ska vara med och om det är blött eller brant så dom
   * förstå varför vi måste kört som vi gjort med virket".
   *
   * Mäts i PIXLAR på den renderade kartan, inte i vymodellen: det är färgen på
   * papperet som är kravet.
   */
  it('HÖGARNA ÄR APPENS FÄRGER — ingen röd prick på kartan', async () => {
    // Ett rutnät högar över trakten, som på en riktig trakt (Bondeskog: 113).
    const hogar = Array.from({ length: 40 }, (_, i) => ({
      lat: 56.2870 + (i % 8) * 0.00022,
      lng: 15.3748 + Math.floor(i / 8) * 0.00040,
      volym: 4 + (i % 5) * 3,
      farg: i % 3 === 0 ? '#FF9F0A' : '#1d9e75',
      farg2: i % 4 === 0 ? '#1d9e75' : null,
    }));
    const bytes = await bygg(SKALVIKEN, { ...KARTA, hogar });
    // Kartrutan: inga pixlar i egenkontrollens stamrött (#d32f2f).
    const rott = ritat(bytes, { x0: KART_KOL.x0, x1: KART_KOL.x1, y0: 0.28, y1: 0.52 }, 1, 150,
      (r, g, b) => r > 150 && g < 90 && b < 90);
    expect(rott.ritade).toBe(0);
    // ... men grönt och orange finns: högarna ritades.
    const gront = ritat(bytes, { x0: KART_KOL.x0, x1: KART_KOL.x1, y0: 0.28, y1: 0.52 }, 1, 150,
      (r, g, b) => g > 110 && g > r + 25 && b < g);
    expect(gront.ritade).toBeGreaterThan(50);
  }, 30000);

  it('HÄNSYNEN RITAS, och dess kant syns även med högar intill', async () => {
    const g = fixtur.granser as number[][][];
    // En liten yta inne i trakten, byggd ur traktgränsens första hörn.
    const [lng0, lat0] = g[0][0];
    const zon = [
      { lat: lat0 - 0.0004, lng: lng0 + 0.0004 },
      { lat: lat0 - 0.0004, lng: lng0 + 0.0011 },
      { lat: lat0 - 0.0010, lng: lng0 + 0.0011 },
      { lat: lat0 - 0.0010, lng: lng0 + 0.0004 },
    ];
    const utan = await bygg(SKALVIKEN, KARTA);
    const med = await bygg(SKALVIKEN, { ...KARTA, markeringar: [{ slag: 'zon', typ: 'protected', punkter: zon }] });
    const ruta = { x0: KART_KOL.x0, x1: KART_KOL.x1, y0: 0.28, y1: 0.52 };
    const grön = (b: Uint8Array) => ritat(b, ruta, 1, 150, (r, gg, bb) => gg > 110 && gg > r + 30 && gg > bb + 30).ritade;
    expect(grön(med)).toBeGreaterThan(grön(utan) + 100);
  }, 60000);

  it('BLÖTT OCH BRANT ritas i olika mönster — och sägs i teckenförklaringen', async () => {
    const g = fixtur.granser as number[][][];
    const [lng0, lat0] = g[0][0];
    const ruta2 = (dlat: number, dlng: number) => [
      { lat: lat0 - dlat, lng: lng0 + dlng },
      { lat: lat0 - dlat, lng: lng0 + dlng + 0.0010 },
      { lat: lat0 - dlat - 0.0006, lng: lng0 + dlng + 0.0010 },
      { lat: lat0 - dlat - 0.0006, lng: lng0 + dlng },
    ];
    const bytes = await bygg(
      { ...SKALVIKEN, kartinnehall: { zoner: [], mark: ['blott', 'brant'] } },
      { ...KARTA, mark: [
        { slag: 'blott', ruta: ruta2(0.0004, 0.0004) },
        { slag: 'brant', ruta: ruta2(0.0014, 0.0004) },
      ] },
    );
    const omr = { x0: KART_KOL.x0, x1: KART_KOL.x1, y0: 0.28, y1: 0.52 };
    const blatt = ritat(bytes, omr, 1, 150, (r, g, b) => b > 120 && b > r + 30 && b > g + 10).ritade;
    const rott = ritat(bytes, omr, 1, 150, (r, g, b) => r > 140 && r > g + 40 && r > b + 40).ritade;
    expect(blatt).toBeGreaterThan(50);
    expect(rott).toBeGreaterThan(50);
    const t = await pdfText(bytes);
    expect(t).toContain('blå vågräta streck');
    expect(t).toContain('röda snedstreck');
  }, 30000);

  it('UTAN KARTA säger rutan varför — ingen tom grå platta', async () => {
    const bytes = await bygg(SKALVIKEN, TOM);
    const t = await pdfText(bytes);
    expect(t).toContain('414 m');
    expect(t).toContain('20 956 kr');
    expect(t).toContain('ingen karta i appen');
    expect(t).not.toContain('Norr är uppåt');
    expect(antalSidor(bytes)).toBe(1);
  }, 30000);

  it('HANDSATT: 450 m står som det fakturerade, 414 som jämförelse', async () => {
    const t = await pdfText(await bygg({ ...SKALVIKEN, handsatt: true, avstandM: 450 }));
    expect(t).toContain('450 m · fakturerat');
    expect(t).toContain('Satt för hand');
    expect(t).toContain('414 m');
    // Bara ETT tal är märkt fakturerat.
    expect(t.match(/fakturerat/g)).toHaveLength(1);
  }, 30000);
});
