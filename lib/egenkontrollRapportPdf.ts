// A4-rapporten som PDF, ritad ur RapportModell (lib/egenkontrollRapport.ts). Ingen beraknad siffra
// ritas harifran - modellen har redan raknat allt, ritaren bara placerar.
//
// TVA FILER, som Vidas Redovisning och Bilaga:
//   skapaRapportPdf  - den tata A4:n: huvud, tre antal, fynd, provytor, forutsattningar, KOMMENTAREN SIST.
//   skapaBilagaPdf   - karta (VEKTOR, ingen bakgrundskarta) + foton med bildtext.
//
// VEKTORKARTAN AR ETT MEDVETET VAL (Martin 2026-10-19): en karta som hamtar ortofoto genom en proxy med
// nyckel ger forr eller senare en rapport UTAN karta, och det marks forst nar mottagaren oppnar den.
// Vektorkartan kan inte ga sonder. Ortofoto ar en egen PR om det visar sig saknas.
//
// FOTON: hamtas innan nagon sida ritas. Gar EN bild inte att hamta kastas ett fel som sager hur manga -
// ett utskick med en lucka dar en bild skulle vara ar samre an inget utskick.
//
// pdf-lib (ren JS, fungerar i iOS-PWA:n) som Manadsfacit; standardfonterna klarar WinAnsi. Laddas dynamiskt
// sa att pdf-lib inte hamnar i sidans bundle.

import { OMDOME_ETIKETT, type Bild, type Fynd, type RapportModell } from './egenkontrollRapport';
import { kartaHojd, ritaKarta, ritaTeckenforklaring } from './egenkontrollRapportKartaPdf';
import { ritaFotoNoteringar } from './egenkontrollFotoPdf';

export { projicera, skalstock } from './egenkontrollRapportKartaPdf';

const A4 = { b: 595.28, h: 841.89 };
const MARG = 48;
const B = A4.b - 2 * MARG;
/** Pappersstorlekar (pt). Tat A4 kraver mindre an skarmens steg; vikterna ar 400 och 700. */
const STEG = { tal: 32, rubrik: 20, text: 10.5, meta: 9, micro: 8 };
const RAD = 1.35;

/** Standardfonterna klarar WinAnsi (å ä ö · – …). Hart mellanslag -> mellanslag; ovrigt utanfor Latin-1 -> '?'. */
export function san(s: string): string {
  return s.replace(/[  ]/g, ' ').replace(/[^ -ÿ–—‘’“”…]/g, '?');
}

type PdfLib = typeof import('pdf-lib');

async function nyttDokument(titel: string) {
  const lib: PdfLib = await import('pdf-lib');
  const doc = await lib.PDFDocument.create();
  doc.setTitle(titel);
  doc.setProducer('Skogsystem');
  const normal = await doc.embedFont(lib.StandardFonts.Helvetica);
  const fet = await doc.embedFont(lib.StandardFonts.HelveticaBold);
  return { lib, doc, normal, fet };
}

/** Rader som ryms i `bredd`. Ord som ensamma ar bredare an raden bryts tecken for tecken. */
export function brytText(s: string, bredd: number, mat: (t: string) => number): string[] {
  const rader: string[] = [];
  let rad = '';
  for (const ord of san(s).split(/\s+/).filter(Boolean)) {
    let del = ord;
    while (mat(del) > bredd) {
      let n = del.length - 1;
      while (n > 1 && mat(del.slice(0, n)) > bredd) n -= 1;
      if (rad) { rader.push(rad); rad = ''; }
      rader.push(del.slice(0, n));
      del = del.slice(n);
    }
    const kandidat = rad ? `${rad} ${del}` : del;
    if (rad && mat(kandidat) > bredd) { rader.push(rad); rad = del; } else rad = kandidat;
  }
  if (rad) rader.push(rad);
  return rader;
}

// ---------------------------------------------------------------------------
// Rapporten
// ---------------------------------------------------------------------------

export async function skapaRapportPdf(m: RapportModell): Promise<Uint8Array> {
  const { lib, doc, normal, fet } = await nyttDokument(`Egenkontroll ${m.huvud.objektNamn}`);
  const c = (g: number) => lib.rgb(g / 255, g / 255, g / 255);
  const SVART = c(17), GRA = c(110), LINJE = c(215);

  let sida = doc.addPage([A4.b, A4.h]);
  let y = MARG;
  const sidor = [sida];
  type Font = typeof normal;
  const bredd = (s: string, storlek: number, f: Font) => f.widthOfTextAtSize(san(s), storlek);

  const nySida = () => {
    sida = doc.addPage([A4.b, A4.h]);
    sidor.push(sida);
    y = MARG;
    text(`Egenkontroll · ${m.huvud.objektNamn}`, MARG, y, STEG.meta, normal, GRA);
    y += STEG.meta * RAD + 14;
  };
  /** Ser till att `h` ryms; annars ny sida. */
  const rum = (h: number) => { if (y + h > A4.h - MARG - 16) nySida(); };

  function text(s: string, x: number, yy: number, storlek: number, f: Font, farg: ReturnType<typeof c>) {
    sida.drawText(san(s), { x, y: A4.h - yy - storlek * 0.78, size: storlek, font: f, color: farg });
  }
  const linje = (yy: number) => sida.drawLine({
    start: { x: MARG, y: A4.h - yy }, end: { x: MARG + B, y: A4.h - yy }, thickness: 0.5, color: LINJE,
  });

  /** Ett stycke, radbrutet. Returnerar inget - y flyttas. Varje rad provas mot sidslutet. */
  const stycke = (s: string, x: number, storlek: number, f: Font, farg: ReturnType<typeof c>, maxB = B - (x - MARG)) => {
    for (const rad of brytText(s, maxB, (t) => f.widthOfTextAtSize(t, storlek))) {
      rum(storlek * RAD);
      text(rad, x, y, storlek, f, farg);
      y += storlek * RAD;
    }
  };

  const sektion = (rubrik: string) => {
    rum(STEG.meta * RAD + 34);
    y += 14;
    text(rubrik.toUpperCase(), MARG, y, STEG.micro, fet, GRA);
    y += STEG.micro * RAD + 3;
    linje(y);
    y += 7;
  };

  // 1. Huvud.
  text('Kompersmåla Skog', MARG, y, STEG.meta, fet, SVART);
  const hog = m.utkast ? 'UTKAST – rundan är inte avslutad' : 'Egenkontroll';
  text(hog, MARG + B - bredd(hog, STEG.meta, normal), y, STEG.meta, m.utkast ? fet : normal, m.utkast ? SVART : GRA);
  y += STEG.meta + 22;
  text(m.huvud.objektNamn, MARG, y, STEG.rubrik, fet, SVART);
  y += STEG.rubrik + 8;
  const huvudrader: [string, string][] = [
    ['Besöksdatum', m.huvud.besok],
    ['Typ', m.huvud.typ + (m.huvud.voNummer ? ` · VO ${m.huvud.voNummer}` : '')],
    ...(m.huvud.utfordAv ? [['Utförare', m.huvud.utfordAv] as [string, string]] : []),
    ...(m.huvud.maskingrupp ? [['Maskingrupp', m.huvud.maskingrupp] as [string, string]] : []),
  ];
  for (const [etikett, varde] of huvudrader) {
    text(etikett, MARG, y, STEG.text, normal, GRA);
    text(varde, MARG + 84, y, STEG.text, normal, SVART);
    y += STEG.text * RAD;
  }
  y += 14;

  // 2. De tre talen: ANTAL, inte betyg. Godkant kommer med bara nar den finns.
  const tal: [string, number][] = [
    [OMDOME_ETIKETT.bra, m.tal.bra],
    [OMDOME_ETIKETT.battre, m.tal.battre],
    [OMDOME_ETIKETT.avvikelse, m.tal.avvikelse],
    ...(m.tal.godkant > 0 ? [[OMDOME_ETIKETT.godkant, m.tal.godkant] as [string, number]] : []),
  ];
  const kolB = B / tal.length;
  tal.forEach(([etikett, n], i) => {
    text(String(n), MARG + kolB * i, y, STEG.tal, fet, SVART);
    text(`${etikett.toLowerCase()}`, MARG + kolB * i, y + STEG.tal + 3, STEG.meta, normal, GRA);
  });
  y += STEG.tal + STEG.meta + 12;
  if (m.tal.obesvarade > 0) {
    text(`${m.tal.obesvarade} ${m.tal.obesvarade === 1 ? 'punkt' : 'punkter'} ej besvarade`, MARG, y, STEG.meta, fet, SVART);
    y += STEG.meta * RAD + 2;
  }

  // KARTAN, direkt under de tre talen: det forsta man ser - man orienterar sig forst, laser sedan (som Vidas bilaga). Vektor, alla lager;
  // stammolnet glesas aldrig ut. Se lib/egenkontrollRapportKartaPdf.ts.
  y += 6;
  const kl = { granser: m.karta.granser, stammar: m.karta.stammar, hyttspar: m.karta.hyttspar, markeringar: m.karta.markeringar, noteringar: m.karta.noteringar, pinnar: m.karta.pinnar };
  const kh = kartaHojd(kl, B);
  rum(kh + 60);
  const ritad = ritaKarta(lib, sida, { normal, fet }, { x: MARG, top: y, b: B, h: kh }, kl, san);
  if (!ritad) text('Kartan saknas: ingen traktgräns, inga stammar och inga positioner finns för den här rundan.', MARG + 12, y + 14, STEG.text, normal, GRA);
  y += kh + 8;
  if (m.karta.fakta) {
    text(m.karta.fakta, MARG, y, STEG.text, fet, SVART);
    y += STEG.text * RAD + 2;
  }
  for (const j of m.jamforelse ?? []) {
    text(`${j.etikett}: ${j.text}`, MARG, y, STEG.meta, normal, GRA);
    y += STEG.meta * RAD;
  }
  y += ritaTeckenforklaring(lib, sida, { normal }, MARG, y, B, m.karta.teckenforklaring, san) + 2;
  for (const a of m.karta.anmarkningar) { stycke(a, MARG, STEG.meta, fet, SVART); }

  // 3. Fynd. Rubriken pa raden ar fet; texten under ar besiktarens egen kommentar - aldrig en fylld rad.
  const fynd = (f: Fynd) => {
    rum(STEG.text * RAD * 2);
    const nr = f.nr !== null ? `${f.nr}` : '';
    if (nr) text(nr, MARG, y, STEG.text, fet, SVART);
    const typ = f.typ ? ` · ${f.typ}` : '';
    const ton = f.observation ? ` · ${OMDOME_ETIKETT[f.omdome]}` : '';
    if (f.antalBilder > 0) {
      const t = 'Bild i bilagan';
      text(t, MARG + B - bredd(t, STEG.meta, normal), y + 1, STEG.meta, normal, GRA);
    }
    stycke(`${f.rubrik}${typ}${ton}`, MARG + 18, STEG.text, fet, SVART, B - 18 - 80);
    if (f.text) stycke(f.text, MARG + 18, STEG.text, normal, SVART);
    if (f.planText) stycke(`Planen: ${f.planText}`, MARG + 18, STEG.meta, normal, GRA);
    y += 5;
  };
  const rubrikRad = (etikett: string, rader: string[]) => {
    if (rader.length === 0) return;
    stycke(`${etikett}: ${rader.join(', ')}`, MARG, STEG.meta, normal, GRA);
    y += 3;
  };

  if (m.avvikelser.length > 0) { sektion(`Avvikelser (${m.avvikelser.length})`); m.avvikelser.forEach(fynd); }
  if (m.battre.length > 0) { sektion(`Kan bli bättre (${m.battre.length})`); m.battre.forEach(fynd); }
  if (m.godkant.fynd.length > 0 || m.godkant.ovriga.length > 0) {
    sektion('Godkänt');
    m.godkant.fynd.forEach(fynd);
    rubrikRad('Godkänt utan kommentar', m.godkant.ovriga);
  }
  if (m.bra.fynd.length > 0 || m.bra.ovriga.length > 0) {
    sektion('Bra');
    m.bra.fynd.forEach(fynd);
    rubrikRad('Bra utan kommentar', m.bra.ovriga);
  }
  if (m.observationer.length > 0) {
    sektion('Observationer');
    stycke('Det som sågs ute och som planen inte frågade om. Räknas inte i antalen ovan.', MARG, STEG.meta, normal, GRA);
    y += 4;
    m.observationer.forEach(fynd);
  }
  if (m.provytor) {
    sektion('Provytor');
    m.provytor.forEach((r) => stycke(r, MARG, STEG.text, normal, SVART));
  }
  if (m.forutsattningar.length > 0) {
    sektion('Förutsättningar');
    m.forutsattningar.forEach((r) => stycke(r, MARG, STEG.text, normal, SVART));
  }
  if (m.bilaga.utanText > 0) {
    y += 6;
    stycke(
      `${m.bilaga.utanText} ${m.bilaga.utanText === 1 ? 'foto' : 'foton'} på punkter utan anmärkning och utan kommentar ingår inte i bilagan.`,
      MARG, STEG.meta, normal, GRA,
    );
  }

  // 4. KOMMENTAREN SIST, i lopande text. Ingen tom ruta nar ingen skrivits.
  if (m.kommentar) {
    sektion('Kommentar');
    for (const s of m.kommentar) { stycke(s, MARG, STEG.text, normal, SVART); y += 4; }
  }

  // 5. Sidfot: sidnummer pa alla sidor.
  sidor.forEach((s, i) => {
    const t = `Sida ${i + 1} av ${sidor.length}`;
    s.drawText(t, { x: MARG + B - normal.widthOfTextAtSize(t, STEG.micro), y: MARG - 18, size: STEG.micro, font: normal, color: GRA });
  });
  return doc.save();
}

// ---------------------------------------------------------------------------
// Bilagan
// ---------------------------------------------------------------------------

export type BildData = { bytes: Uint8Array; typ: 'jpg' | 'png' };
/** Hamtar en bild ur lagringen. null/kast = gick inte; bilagan skapas da inte. */
export type HamtaBild = (sokvag: string) => Promise<BildData | null>;

/**
 * LAYOUT E (Martin 2026-10-21): ETT foto per sida, i en 3:4-ruta som fyller sidans bredd (496 x 662 pt av 499 pt innehallsbredd).
 * Bilagan ar bevis till en kund - 99 % av bredden sager "titta har", 44 % ar en miniatyr; sidantalet kostar ingenting i en PDF. Fotona ar stationa 3:4
 * (appen komprimerar till 1200 x 1600): tva per sida hade tvingat ner bredden till 263 pt. Bildtexten (nummer + text, upp till tre rader) ligger under
 * bilden i en fast remsa, sa rutan blir exakt sa hog som sidan tillater. Ett foto i annan form ritas inpassat (contain) i samma ruta.
 */
const FOTO_TOP = MARG + 28;
const FOTO_TEXTREMSA = 56;
const FOTO_RUTA_H = A4.h - MARG - FOTO_TOP - FOTO_TEXTREMSA;
export const FOTO_RUTA = { b: Math.min(B, (FOTO_RUTA_H * 3) / 4), h: FOTO_RUTA_H, top: FOTO_TOP };

export async function skapaBilagaPdf(m: RapportModell, hamtaBild: HamtaBild): Promise<Uint8Array> {
  // Foton FORST: en bild som inte gar att hamta far aldrig bli en lucka i ett utskick.
  const data: (BildData | null)[] = [];
  for (const b of m.bilaga.bilder) {
    let d: BildData | null = null;
    try { d = await hamtaBild(b.sokvag); } catch { d = null; }
    data.push(d);
  }
  const saknas = data.filter((d) => d === null).length;
  if (saknas > 0) {
    throw new Error(`${saknas} av ${data.length} bilder gick inte att hämta. Försök igen — bilagan skapas inte med luckor.`);
  }

  const { lib, doc, normal, fet } = await nyttDokument(`Bilaga egenkontroll ${m.huvud.objektNamn}`);
  const c = (g: number) => lib.rgb(g / 255, g / 255, g / 255);
  const SVART = c(17), GRA = c(110), LINJE = c(215), KARTYTA = c(247);
  type Font = typeof normal;
  const sidor: ReturnType<typeof doc.addPage>[] = [];
  const nySida = () => { const s = doc.addPage([A4.b, A4.h]); sidor.push(s); return s; };
  const textPa = (s: ReturnType<typeof doc.addPage>, t: string, x: number, yy: number, storlek: number, f: Font, farg: ReturnType<typeof c>) =>
    s.drawText(san(t), { x, y: A4.h - yy - storlek * 0.78, size: storlek, font: f, color: farg });
  const mat = (t: string, storlek: number, f: Font) => f.widthOfTextAtSize(san(t), storlek);
  const huvud = (s: ReturnType<typeof doc.addPage>, y0: number) => {
    textPa(s, `Bilaga · ${m.huvud.objektNamn}`, MARG, y0, STEG.meta, fet, SVART);
    const d = m.huvud.besok;
    textPa(s, d, MARG + B - mat(d, STEG.meta, normal), y0, STEG.meta, normal, GRA);
  };

  // Sida 1: kartan.
  const kartSida = nySida();
  huvud(kartSida, MARG);
  const KARTA_Y = MARG + 28, KARTA_H = 360;
  const { granser, stammar, pinnar, utanPlats } = m.bilaga.karta;
  let yy = KARTA_Y + KARTA_H + 16;
  // Bilagans EGEN karta, till fotonumren: traktgrans, stammolnet blekt (orientering) och de numrerade pinnarna.
  const ritad = ritaKarta(lib, kartSida, { normal, fet }, { x: MARG, top: KARTA_Y, b: B, h: KARTA_H }, { granser, stammar, pinnar }, san, { stammarBlek: true });
  if (!ritad) textPa(kartSida, 'Kartan saknas: ingen traktgräns och inga positioner finns för den här rundan.', MARG + 12, KARTA_Y + 14, STEG.text, normal, GRA);
  const poster = [
    ...(granser.length > 0 ? [{ nyckel: 'traktgrans', etikett: 'Traktgräns' }] : []),
    ...(pinnar.length > 0 ? [{ nyckel: 'kontrollpunkt', etikett: 'Numret hör till rapporten och fotona' }] : []),
  ];
  let ly = KARTA_Y + KARTA_H + 8;
  ly += ritaTeckenforklaring(lib, kartSida, { normal }, MARG, ly, B, poster, san);
  if (stammar.length > 0) {
    textPa(kartSida, 'Grå prickar: avverkade stammar (orientering).', MARG, ly, STEG.micro, normal, GRA);
    ly += 12;
  }
  yy = ly + 8;
  // Teckenforklaring: numren pa kartan = numren i rapporten och pa fotona.
  // Alla numrerade fynd star i listan - de utan plats med det sagt, sa inget nummer fran rapporten saknas har.
  const lista = [
    ...pinnar.map((p) => ({ nr: p.nr, rubrik: p.rubrik, plats: true })),
    ...utanPlats.map((p) => ({ nr: p.nr, rubrik: p.rubrik, plats: false })),
  ].sort((a, z) => a.nr - z.nr);
  for (const p of lista) {
    if (yy > A4.h - MARG - 14) break;
    textPa(kartSida, String(p.nr), MARG, yy, STEG.text, fet, SVART);
    textPa(kartSida, p.rubrik, MARG + 18, yy, STEG.text, normal, SVART);
    if (!p.plats) textPa(kartSida, 'plats saknas', MARG + 18 + mat(p.rubrik, STEG.text, normal) + 8, yy + 1, STEG.meta, normal, GRA);
    yy += STEG.text * RAD;
  }

  // Foton: ETT per sida (layout E), med nummer, bildtext och - ovanpa bilden - fotots noteringar (bara "sa har blev det").
  for (let i = 0; i < m.bilaga.bilder.length; i += 1) {
    const b: Bild = m.bilaga.bilder[i];
    const sida = nySida();
    huvud(sida, MARG);
    const d = data[i] as BildData;
    const bild = d.typ === 'png' ? await doc.embedPng(d.bytes) : await doc.embedJpg(d.bytes);
    const skala = Math.min(FOTO_RUTA.b / bild.width, FOTO_RUTA.h / bild.height);
    const w = bild.width * skala, h = bild.height * skala;
    const x = MARG + (B - w) / 2;
    sida.drawImage(bild, { x, y: A4.h - FOTO_RUTA.top - h, width: w, height: h });
    ritaFotoNoteringar(lib, sida, { normal }, { x, top: FOTO_RUTA.top, b: w, h }, b.noteringar, san);
    const nr = b.nr !== null ? `${b.nr}` : '';
    const del = b.del.av > 1 ? ` (${b.del.i}/${b.del.av})` : '';
    const textTop = FOTO_RUTA.top + h + 8;
    if (nr) textPa(sida, nr, MARG, textTop, STEG.text, fet, SVART);
    const rader = brytText(`${b.text}${del}`, B - 18, (t) => normal.widthOfTextAtSize(t, STEG.text)).slice(0, 3);
    rader.forEach((r, k) => textPa(sida, r, MARG + 18, textTop + k * STEG.text * RAD, STEG.text, normal, SVART));
  }

  sidor.forEach((s, i) => {
    const t = `Sida ${i + 1} av ${sidor.length}`;
    s.drawText(t, { x: MARG + B - normal.widthOfTextAtSize(t, STEG.micro), y: MARG - 18, size: STEG.micro, font: normal, color: GRA });
  });
  return doc.save();
}
