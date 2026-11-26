// Ritar skotningsrapporten (lib/faktura/skotningsrapport.ts) som EN A4.
//
// EGEN RITARE, OCH VARFÖR. Appens andra rapporter ritas av
// `skapaArbetsmiljoPdf` — en enkolumns-A4 med fakta, svar, avsnitt och fot.
// Den räcker inte här: skotningsrapporten ska visa kartan och "Var låg
// virket?" SIDA VID SIDA, och tre svarskort i en rad, för att en inköpare ska
// se avståndet, spridningen och kartan i samma blick. Första försöket lade
// kartan på en egen sida och klämde in resten i enkolumnsmallen; Martin såg
// direkt att det inte var sidan han godkänt. En godkänd skiss är kravet, inte
// en utgångspunkt.
//
// SIDANS ORDNING (skissen, 2026-11-25):
//   Skotningsrapport · avsändare · trakten
//   [ SKOTNINGSAVSTÅND ] [ PRISLISTAN ] [ TILLÄGG ]     ← svaret, tre kort
//   källmeningen — var talet kommer ifrån
//   kartan            |  Var låg virket?                 ← sida vid sida
//   SKOTNINGEN — lass, kortaste, längsta, period
//   SAMMA KÖRNING, FYRA MÅTT — det fakturerade märkt
//   SÅ ÄR DET MÄTT
//
// KARTAN ÄR ÅTERANVÄND: `ritaKarta` i lib/egenkontrollRapportKartaPdf är
// appens vektorkarta för PDF (traktgräns, stammoln, hyttspår, pinnar, norr
// uppåt, skalstock). Ingen bakgrundskarta — en rapport som hämtar flygfoto
// genom en proxy blir förr eller senare en rapport UTAN karta, och det märks
// först när inköparen öppnar den.
//
// ² OCH ³ RITAS INTE av pdf-lib med StandardFonts.Helvetica: texten hamnar i
// filen men glyfen blir ett tomrum på papperet. Därför går ALL text genom
// `sanera` (skriver dem som 2/3), aldrig rakt till `drawText`.

import { sanera } from '@/lib/markagarrapport/pdf';
import { breddUtanKerning, delaUpphojt, UPP_LYFT, UPP_SKALA } from '@/lib/upphojtPdf';
import { ritaKarta, type KartLager } from '@/lib/egenkontrollRapportKartaPdf';
import type { KartMarkering, MarkSlag } from '@/lib/egenkontrollRapportKarta';
import type { SkotningsrapportSida, Rad, VirkeRad } from './skotningsrapport';

/** Allt kartan behöver, i lat/lng. Tomma listor ger ingen karta. */
export type RapportKarta = {
  /** Vidas traktdelar (L_TRAKTDEL). */
  granser: { lat: number; lng: number }[][];
  /**
   * Var virket stod: skördarens stammar.
   *
   * RITAS INTE på skotningsrapportens karta (Martin 2026-11-26: "bara visar hur
   * vi kört och hänsyner och blött och brant"). Kartan svarar på EN fråga —
   * varför vägen blev som den blev — och hur långt virket låg står exakt i
   * tabellen "Var låg virket?" bredvid. Lägena är kvar här för att de bestämmer
   * kartans RAM och var körspåret klipps: utan dem skulle en trakt utan Vidas
   * traktgräns få en ram bara av avläggen, och spåret klippas bort.
   */
  stammar: { lat: number; lng: number }[];
  /**
   * Skotarens körspår (ritning). Heter `korspar` och inte `spar`: `skotar_lass.spar`
   * var den trasiga spårkopian som avståndet en gång räknades ur, och en vakt
   * (`lassCykel.vakter.test.ts`) larmar på varje `.spar` i en fakturafil. Det
   * här är en bild, inte en mätning — men namnet ska inte be om ett undantag.
   */
  korspar: { lat: number; lng: number }[][];
  /** Avläggen, numrerade som på kartan i appen. */
  avlagg: { nr: number; namn: string; plats: { lat: number; lng: number } }[];
  /**
   * Hänsynen och det som styrde körningen: Vidas hänsynsytor, nyckelbiotoper
   * och fornlämningar, planerarens egna ytor (hänsyn, blött, brant) och
   * symboler. Samma typer och färger som i appen (`markeringsStil`).
   */
  markeringar?: KartMarkering[];
  /** Blött och brant ur SLU/Skogsstyrelsen. Tom lista = datan saknas, aldrig en gissning. */
  mark?: { slag: MarkSlag; ruta: { lat: number; lng: number }[] }[];
};

// MarkSlag och markens stil bor i lib/egenkontrollRapportKarta (EN tabell som både
// teckenförklaringen och ritaren läser). Re-exporteras här för anroparna.
export type { MarkSlag };

/**
 * Hur långt utanför trakten en spårpunkt får ligga och fortfarande höra till
 * jobbet. Avlägget ligger nästan alltid utanför traktgränsen, vid vägen, och
 * körningen dit är skotning — men hemresan är det inte.
 */
export const SPAR_MARGINAL_M = 200;

/**
 * Klipper körspåret mot trakten.
 *
 * HITTAT 2026-11-25 på Skälviken i prod: `hyttspar` för objektet innehåller
 * hela dagens körning, hemresan med. Spåret sträckte sig 6 308 m i höjd mot
 * traktens 448 — kartans ram blev sex kilometer hög och trakten en klump i
 * hörnet. Fixturen jag byggde testet mot hade 38 handplockade punkter, alla
 * inne på trakten, så testet kunde aldrig se det.
 *
 * Ramen är traktgräns ∪ stammar ∪ avlägg plus marginalen. En linje som lämnar
 * den BRYTS (inte raderas): det som är kvar inne ritas, och vi drar aldrig en
 * rak linje tvärs över kartan där maskinen försvann ut och kom tillbaka.
 * Saknas allt att klippa mot lämnas spåret som det är — hellre ett stort spår
 * än ett bortklippt.
 */
// Generisk i kartans typ: läsaren vet att den ALLTID sätter `mark` (den är
// valfri i `RapportKarta` för egenkontrollens skull), och den kunskapen ska
// inte tappas här. En returtyp `RapportKarta` hade gjort den "möjligen
// undefined" hos varje läsare och spridit `?? []` genom koden.
export function klippSparMotTrakt<T extends RapportKarta>(k: T): T {
  // Stammarna räknas med fast de inte ritas: på en trakt utan Vidas traktgräns
  // är de det enda som säger var trakten ligger, och utan dem skulle spåret
  // klippas mot en ruta runt avläggen — alltså bort.
  const inom: { lat: number; lng: number }[] = [
    ...k.granser.flat(), ...k.stammar, ...k.avlagg.map(a => a.plats),
  ];
  if (inom.length === 0 || k.korspar.length === 0) return k;

  const latMin = Math.min(...inom.map(p => p.lat));
  const latMax = Math.max(...inom.map(p => p.lat));
  const lngMin = Math.min(...inom.map(p => p.lng));
  const lngMax = Math.max(...inom.map(p => p.lng));
  const dLat = SPAR_MARGINAL_M / 111320;
  const dLng = SPAR_MARGINAL_M / (111320 * Math.max(0.1, Math.cos((latMin + latMax) / 2 * Math.PI / 180)));

  const inne = (p: { lat: number; lng: number }) =>
    p.lat >= latMin - dLat && p.lat <= latMax + dLat
    && p.lng >= lngMin - dLng && p.lng <= lngMax + dLng;

  const korspar: RapportKarta['korspar'] = [];
  for (const linje of k.korspar) {
    let bit: { lat: number; lng: number }[] = [];
    for (const p of linje) {
      if (inne(p)) bit.push(p);
      else { if (bit.length > 1) korspar.push(bit); bit = []; }
    }
    if (bit.length > 1) korspar.push(bit);
  }
  return { ...k, korspar };
}

/** true när det finns något att rita. En tom karta ritas aldrig. */
export function harKarta(k: RapportKarta): boolean {
  // Stammarna räknas INTE: de ritas inte längre, så en trakt som bara har dem
  // skulle ge en tom ruta med en teckenförklaring under.
  return k.granser.some(r => r.length > 0)
    || k.korspar.some(l => l.length > 0) || k.avlagg.length > 0;
}

function tillLager(k: RapportKarta): KartLager {
  return {
    granser: k.granser.filter(r => r.length > 1),
    // VIRKET RITAS INTE. Kartan svarar på varför vägen blev som den blev —
    // körspåret, hänsynen, det blöta och det branta — och allt virke på samma
    // bild tar den platsen: tvåhundra högar ligger över både marken och
    // spåret. Hur långt virket låg står i tabellen bredvid, i m³fub per
    // avståndsklass, och ett tal är mer sant än en bild av samma sak.
    stammar: [],
    hyttspar: k.korspar.length > 0 ? [{ roll: 'skotare', linjer: k.korspar.filter(l => l.length > 1) }] : undefined,
    markeringar: k.markeringar ?? [],
    mark: k.mark,
    pinnar: k.avlagg.map(a => ({ nr: a.nr, rubrik: a.namn, plats: a.plats })),
  };
}

// ── Sidans mått ──────────────────────────────────────────────────────────

const A4 = { b: 595.28, h: 841.89 };
const MARG = 44;
/** Innehållets bredd. */
const B = A4.b - 2 * MARG;
/** Luft mellan de två kolumnerna och mellan korten. */
const GAP = 14;
/** Kartans kolumn. Resten går till "Var låg virket?". */
const KART_B = 300;
const HOGER_X = MARG + KART_B + GAP;
const HOGER_B = B - KART_B - GAP;

const STEG = {
  titel: 23, trakt: 15, kortVarde: 17, rubrik: 9.5,
  text: 9, meta: 8, micro: 7,
};

/** Ljus A4-palett, samma betydelser som appens mörka tema. */
const FARGER = {
  text: '#111111', sek: '#6e6e73', ter: '#9a9aa0',
  linje: '#e5e5ea', kort: '#f5f5f7', stapel: '#2f4b14', stapelBg: '#e8ece2',
};

export async function skapaSkotningsrapportPdf(
  sida: SkotningsrapportSida,
  karta: RapportKarta,
): Promise<Uint8Array> {
  const lib = await import('pdf-lib');
  const { PDFDocument, StandardFonts, rgb } = lib;
  const pdf = await PDFDocument.create();
  pdf.setTitle(sanera(sida.titel));
  pdf.setProducer('Skogsystem');
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const fet = await pdf.embedFont(StandardFonts.HelveticaBold);
  type Font = typeof normal;
  type Farg = ReturnType<typeof rgb>;

  const hex = (h: string): Farg => rgb(
    parseInt(h.slice(1, 3), 16) / 255,
    parseInt(h.slice(3, 5), 16) / 255,
    parseInt(h.slice(5, 7), 16) / 255,
  );
  const F = {
    text: hex(FARGER.text), sek: hex(FARGER.sek), ter: hex(FARGER.ter),
    linje: hex(FARGER.linje), kort: hex(FARGER.kort),
    stapel: hex(FARGER.stapel), stapelBg: hex(FARGER.stapelBg),
  };

  let sid = pdf.addPage([A4.b, A4.h]);
  /** y räknas från SIDANS TOPP; drawText översätter. */
  let y = MARG;
  const nySida = () => { sid = pdf.addPage([A4.b, A4.h]); y = MARG; };
  /** Bryt till ny sida om `h` inte ryms före foten. */
  const plats = (h: number) => { if (y + h > A4.h - MARG - 16) nySida(); };

  // All text går genom `delaUpphojt`: ² och ³ ritas som mindre siffror lyfta
  // över baslinjen, eftersom pdf-lib inte ritar tecknen med Helvetica (de blir
  // tomrum på papperet). Mätningen måste följa samma regel, annars hamnar
  // högerställd text och radbrytningar fel.
  //
  // Bredden mats med `breddUtanKerning` — pdf-lib MATER med kerning men RITAR
  // utan, och varje del efter den forsta laggs pa den matta bredden. Se
  // lib/upphojtPdf.
  const bredd = (s: string, st: number, f: Font) =>
    delaUpphojt(s).reduce((b, d) =>
      b + breddUtanKerning(f, sanera(d.text), d.upp ? st * UPP_SKALA : st), 0);

  const text = (s: string, x: number, yy: number, st: number, f: Font, farg: Farg) => {
    let dx = x;
    for (const d of delaUpphojt(s)) {
      const stl = d.upp ? st * UPP_SKALA : st;
      sid.drawText(sanera(d.text), {
        x: dx, y: A4.h - yy - st * 0.76 + (d.upp ? st * UPP_LYFT : 0),
        size: stl, font: f, color: farg,
      });
      dx += breddUtanKerning(f, sanera(d.text), stl);
    }
  };
  const hogerText = (s: string, hx: number, yy: number, st: number, f: Font, farg: Farg) =>
    text(s, hx - bredd(s, st, f), yy, st, f, farg);

  /** Radbryter mot en bredd med fontens EGNA mått, aldrig en teckengissning. */
  const bryt = (s: string, st: number, f: Font, max: number): string[] => {
    const ut: string[] = [];
    for (const stycke of s.split('\n')) {
      let rad = '';
      for (const ord of stycke.split(/\s+/).filter(Boolean)) {
        const test = rad ? `${rad} ${ord}` : ord;
        if (bredd(test, st, f) > max && rad) { ut.push(rad); rad = ord; }
        else rad = test;
      }
      ut.push(rad);
    }
    return ut.filter(r => r.length > 0);
  };
  /** Ritar radbruten text och returnerar höjden. */
  const stycke = (s: string, x: number, yy: number, st: number, f: Font, farg: Farg, max: number, radsteg = st * 1.35) => {
    const rader = bryt(s, st, f, max);
    rader.forEach((r, i) => text(r, x, yy + i * radsteg, st, f, farg));
    return rader.length * radsteg;
  };
  const etikett = (s: string, x: number, yy: number, farg: Farg = F.ter) =>
    text(s.toUpperCase(), x, yy, STEG.micro, fet, farg);

  // ── Huvudet ────────────────────────────────────────────────────────────
  text(sida.titel, MARG, y, STEG.titel, fet, F.text);
  y += STEG.titel * 1.1;
  text(sida.avsandare, MARG, y, STEG.meta, normal, F.sek);
  y += STEG.meta * 1.6 + 6;
  text(sida.traktNamn, MARG, y, STEG.trakt, fet, F.text);
  y += STEG.trakt * 1.1;
  text(sida.traktFakta, MARG, y, STEG.meta, normal, F.sek);
  y += STEG.meta * 1.5 + 10;
  sid.drawLine({ start: { x: MARG, y: A4.h - y }, end: { x: MARG + B, y: A4.h - y }, thickness: 0.6, color: F.linje });
  y += 14;

  // ── Tre kort: avståndet, prislistan, tillägget ─────────────────────────
  // Avståndet är rapportens svar och står först. Saknas prislistan blir det
  // två kort som delar bredden — aldrig ett tomt kort.
  {
    const n = Math.max(1, sida.kort.length);
    const kb = (B - GAP * (n - 1)) / n;
    const unders = sida.kort.map(k => (k.under ? bryt(k.under, STEG.micro, normal, kb - 20) : []));
    const kh = 12 + STEG.micro * 1.4 + STEG.kortVarde * 1.25
      + Math.max(...unders.map(u => u.length)) * (STEG.micro * 1.35) + 12;
    plats(kh + 16);
    sida.kort.forEach((k, i) => {
      const x = MARG + i * (kb + GAP);
      sid.drawRectangle({
        x, y: A4.h - y - kh, width: kb, height: kh,
        color: F.kort, borderColor: F.linje, borderWidth: 0.6,
      });
      let ky = y + 11;
      etikett(k.etikett, x + 10, ky);
      ky += STEG.micro * 1.4 + 2;
      text(k.varde, x + 10, ky, STEG.kortVarde, fet, F.text);
      ky += STEG.kortVarde * 1.25;
      unders[i].forEach((r, j) => text(r, x + 10, ky + j * (STEG.micro * 1.35), STEG.micro, normal, F.sek));
    });
    y += kh + 12;
  }

  // Källmeningen: var talet kommer ifrån. Står alltid, också när den säger
  // att det inte finns något mätt.
  y += stycke(sida.kalla, MARG, y, STEG.text, normal, F.text, B) + 16;

  // ── Kartan | Var låg virket? ───────────────────────────────────────────
  {
    const lager = tillLager(karta);
    const ritas = harKarta(karta);
    // Kartans höjd styrs av HÖGERKOLUMNEN när den är högre: en karta med tom
    // yta under ser oavsiktlig ut, en tabell som sticker ut under kartan
    // likaså. Höjden räknas därför ur tabellens innehåll, med ett golv.
    const virke = sida.virke;
    const virkeRader = virke?.rader ?? [];
    const underH = virke ? bryt(virke.under, STEG.micro, normal, HOGER_B).length * (STEG.micro * 1.35) : 0;
    const notH = virke?.not ? bryt(virke.not, STEG.micro, normal, HOGER_B).length * (STEG.micro * 1.35) : 0;
    const radH = 21;
    const hogerH = virke
      ? STEG.rubrik * 1.3 + underH + 8 + virkeRader.length * radH + 10 + STEG.meta * 1.4 + notH
      : 0;
    const forklH = bryt(sida.kartforklaring, STEG.micro, normal, KART_B).length * (STEG.micro * 1.35);
    const kartH = Math.max(210, Math.min(300, hogerH - forklH - 6));
    plats(Math.max(kartH + forklH, hogerH) + 20);

    const toppen = y;
    if (ritas) {
      ritaKarta(
        lib as never, sid as never, { normal, fet } as never,
        { x: MARG, top: toppen, b: KART_B, h: kartH },
        lager, sanera,
        // `extentAllt`: avlägget ligger utanför traktgränsen och MÅSTE med —
        // rapporten handlar om avståndet från det. `ritaKarta` ritar sin egen
        // skalstock inne i rutan; vi ritar ingen till.
        { etiketter: true, extentAllt: true },
      );
      stycke(sida.kartforklaring, MARG, toppen + kartH + 6, STEG.micro, normal, F.sek, KART_B);
    } else {
      sid.drawRectangle({
        x: MARG, y: A4.h - toppen - kartH, width: KART_B, height: kartH,
        color: F.kort, borderColor: F.linje, borderWidth: 0.6,
      });
      stycke('Trakten har ingen karta i appen: Vidas traktgräns, stammarnas lägen och skotarens körspår saknas.',
        MARG + 12, toppen + kartH / 2 - 8, STEG.meta, normal, F.sek, KART_B - 24);
    }

    if (virke) {
      let hy = toppen;
      text(virke.rubrik, HOGER_X, hy, STEG.rubrik, fet, F.text);
      hy += STEG.rubrik * 1.3;
      hy += stycke(virke.under, HOGER_X, hy, STEG.micro, normal, F.sek, HOGER_B) + 8;
      // En rad = etikett, m³fub till höger, och en stapel under som visar
      // andelen. Talet står alltid — stapeln är bara en förstärkning.
      for (const r of virkeRader as VirkeRad[]) {
        text(r.etikett, HOGER_X, hy, STEG.meta, normal, F.text);
        hogerText(`${r.m3fub} m³fub`, HOGER_X + HOGER_B, hy, STEG.meta, fet, F.text);
        const sy = A4.h - hy - STEG.meta * 1.5 - 4;
        sid.drawRectangle({ x: HOGER_X, y: sy, width: HOGER_B, height: 2.5, color: F.stapelBg });
        const bb = Math.max(1.5, (HOGER_B * Math.min(100, Math.max(0, r.andel))) / 100);
        sid.drawRectangle({ x: HOGER_X, y: sy, width: bb, height: 2.5, color: F.stapel });
        hy += radH;
      }
      hy += 4;
      sid.drawLine({ start: { x: HOGER_X, y: A4.h - hy }, end: { x: HOGER_X + HOGER_B, y: A4.h - hy }, thickness: 0.6, color: F.linje });
      hy += 6;
      text('Summa', HOGER_X, hy, STEG.meta, normal, F.sek);
      hogerText(virke.summa, HOGER_X + HOGER_B, hy, STEG.meta, fet, F.text);
      hy += STEG.meta * 1.4 + 4;
      if (virke.not) hy += stycke(virke.not, HOGER_X, hy, STEG.micro, normal, F.ter, HOGER_B);
      y = Math.max(toppen + kartH + forklH + 6, hy);
    } else {
      y = toppen + kartH + forklH + 6;
    }
    y += 20;
  }

  // ── Skotningen: en vågrät statsrad ─────────────────────────────────────
  if (sida.skotningen.length > 0) {
    const stats = sida.skotningen;
    const kb = B / stats.length;
    const unders = stats.map(s => (s.under ? bryt(s.under, STEG.micro, normal, B) : []));
    const extra = unders.flat().length;
    plats(STEG.micro * 1.4 + 8 + STEG.rubrik * 1.3 + STEG.micro * 1.4 + extra * (STEG.micro * 1.35) + 24);
    etikett('Skotningen', MARG, y);
    y += STEG.micro * 1.4 + 8;
    stats.forEach((s, i) => {
      const x = MARG + i * kb;
      text(s.varde, x, y, STEG.rubrik, fet, F.text);
      text(s.etikett, x, y + STEG.rubrik * 1.25, STEG.micro, normal, F.sek);
    });
    y += STEG.rubrik * 1.25 + STEG.micro * 1.5 + 4;
    // Perioden och under-texten står i FULL BREDD under statsraden: de är
    // meningar, inte etiketter, och sköt in i grannkolumnen som stats.
    if (sida.skotningenPeriod) {
      y += stycke(sida.skotningenPeriod, MARG, y, STEG.meta, normal, F.sek, B) + 2;
    }
    for (const u of unders) {
      for (const r of u) { text(r, MARG, y, STEG.micro, normal, F.ter); y += STEG.micro * 1.35; }
    }
    y += 16;
  }

  // ── Måtten | Så är det mätt, sida vid sida ─────────────────────────────
  // Två kolumner, inte två avsnitt under varandra: mätt 2026-11-25 blev sidan
  // två A4 med dem staplade, och då bryts måtten mitt itu. De hör ihop ändå —
  // vänster säger VAD vi mätt, höger HUR.
  if (sida.matt.length > 0 || sida.saMatt.length > 0) {
    const kb = (B - GAP) / 2;
    const hx = MARG + kb + GAP;
    const toppen = y;
    let vy = toppen;
    let hy = toppen;

    if (sida.matt.length > 0) {
      etikett('Samma körning, fyra mått', MARG, vy);
      vy += STEG.micro * 1.4 + 4;
      if (sida.mattLucka) vy += stycke(sida.mattLucka, MARG, vy, STEG.micro, normal, F.ter, kb) + 5;
      for (const r of sida.matt as Rad[]) {
        text(r.etikett, MARG, vy, STEG.meta, fet, F.text);
        hogerText(r.varde, MARG + kb, vy, STEG.meta, fet, F.text);
        vy += STEG.meta * 1.4;
        if (r.under) vy += stycke(r.under, MARG, vy, STEG.micro, normal, F.sek, kb);
        vy += 6;
      }
    }

    if (sida.saMatt.length > 0) {
      etikett('Så är det mätt', hx, hy);
      hy += STEG.micro * 1.4 + 4;
      for (const s of sida.saMatt) {
        text(s.rubrik, hx, hy, STEG.meta, fet, F.text);
        hy += STEG.meta * 1.4;
        hy += stycke(s.text, hx, hy, STEG.micro, normal, F.sek, kb) + 6;
      }
    }
    y = Math.max(vy, hy) + 10;
  }

  // ── Foten, nere på varje sida ──────────────────────────────────────────
  const fotY = A4.h - MARG - STEG.micro;
  for (const s of pdf.getPages()) {
    s.drawLine({
      start: { x: MARG, y: A4.h - fotY + STEG.micro + 4 },
      end: { x: MARG + B, y: A4.h - fotY + STEG.micro + 4 },
      thickness: 0.6, color: F.linje,
    });
    s.drawText(sanera(sida.not), {
      x: MARG, y: A4.h - fotY - STEG.micro * 0.76,
      size: STEG.micro, font: normal, color: F.ter,
    });
  }

  return pdf.save();
}
