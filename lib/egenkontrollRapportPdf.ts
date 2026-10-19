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

import { OBSERVATION_TON } from './egenkontrollObservation';
import { OMDOME_ETIKETT, type Bild, type Fynd, type LatLng, type RapportModell } from './egenkontrollRapport';

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

  // 3. Fynd. Rubriken pa raden ar fet; texten under ar besiktarens egen kommentar - aldrig en fylld rad.
  const fynd = (f: Fynd) => {
    rum(STEG.text * RAD * 2);
    const nr = f.nr !== null ? `${f.nr}` : '';
    if (nr) text(nr, MARG, y, STEG.text, fet, SVART);
    const typ = f.typ ? ` · ${f.typ}` : '';
    const ton = f.observation ? ` · ${OBSERVATION_TON[f.omdome].etikett}` : '';
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

/** Antal bilder per sida. Tva ryms med bildtext; fler gor dem sma. */
const BILDER_PER_SIDA = 2;

/** Meter -> ett "snyggt" langd for skalstocken: 50, 100, 200, 500, 1000 ... */
export function skalstock(meterPerPt: number, maxPt: number): { meter: number; pt: number } {
  const kandidater = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];
  let valt = kandidater[0];
  for (const k of kandidater) if (k / meterPerPt <= maxPt) valt = k;
  return { meter: valt, pt: valt / meterPerPt };
}

/**
 * Projicerar punkter till en ruta (b x h pt) utan att forvrida: längdgraden skalas med cos(lat), annars blir
 * kartan bredare an den ar i verkligheten. Norr ar uppat. Returnerar en funktion och meter per pt.
 */
export function projicera(punkter: LatLng[], b: number, h: number, pad = 18) {
  const lat0 = punkter.reduce((s, p) => s + p.lat, 0) / punkter.length;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const xs = punkter.map((p) => p.lng * k), ys = punkter.map((p) => p.lat);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const spannX = Math.max(maxX - minX, 1e-6), spannY = Math.max(maxY - minY, 1e-6);
  const skala = Math.min((b - 2 * pad) / spannX, (h - 2 * pad) / spannY);
  const offX = (b - spannX * skala) / 2, offY = (h - spannY * skala) / 2;
  return {
    /** x, y i rutans egna koordinater, y nedat fran overkanten. */
    till: (p: LatLng) => ({ x: offX + (p.lng * k - minX) * skala, y: h - (offY + (p.lat - minY) * skala) }),
    meterPerPt: 111320 / skala,
  };
}

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
  kartSida.drawRectangle({ x: MARG, y: A4.h - KARTA_Y - KARTA_H, width: B, height: KARTA_H, color: KARTYTA, borderColor: LINJE, borderWidth: 0.5 });
  const { granser, pinnar, utanPlats } = m.bilaga.karta;
  const allaPunkter: LatLng[] = [...granser.flat(), ...pinnar.map((p) => p.plats)];
  let yy = KARTA_Y + KARTA_H + 16;
  if (allaPunkter.length === 0) {
    textPa(kartSida, 'Kartan saknas: ingen traktgräns och inga positioner finns för den här rundan.', MARG + 12, KARTA_Y + 14, STEG.text, normal, GRA);
  } else {
    const pr = projicera(allaPunkter, B, KARTA_H);
    const xy = (p: LatLng) => { const q = pr.till(p); return { x: MARG + q.x, y: A4.h - KARTA_Y - q.y }; };
    for (const ring of granser) {
      if (ring.length < 2) continue;
      for (let i = 0; i < ring.length; i += 1) {
        const a = xy(ring[i]), z = xy(ring[(i + 1) % ring.length]);
        kartSida.drawLine({ start: a, end: z, thickness: 1.2, color: c(60), dashArray: [5, 3] });
      }
    }
    for (const p of pinnar) {
      const q = xy(p.plats);
      kartSida.drawCircle({ x: q.x, y: q.y, size: 8.5, color: SVART });
      const t = String(p.nr);
      kartSida.drawText(t, { x: q.x - mat(t, STEG.meta, fet) / 2, y: q.y - STEG.meta * 0.36, size: STEG.meta, font: fet, color: c(255) });
    }
    // Norrpil och skalstock: utan dem ar en karta en teckning.
    textPa(kartSida, 'N', MARG + B - 20, KARTA_Y + 10, STEG.meta, fet, SVART);
    kartSida.drawLine({ start: { x: MARG + B - 16, y: A4.h - KARTA_Y - 32 }, end: { x: MARG + B - 16, y: A4.h - KARTA_Y - 22 }, thickness: 1.2, color: SVART });
    const sk = skalstock(pr.meterPerPt, 120);
    const sx = MARG + 14, sy = A4.h - KARTA_Y - KARTA_H + 16;
    kartSida.drawLine({ start: { x: sx, y: sy }, end: { x: sx + sk.pt, y: sy }, thickness: 1.5, color: SVART });
    textPa(kartSida, sk.meter >= 1000 ? `${sk.meter / 1000} km` : `${sk.meter} m`, sx, A4.h - sy + 4, STEG.micro, normal, GRA);
    if (granser.length > 0) textPa(kartSida, 'Streckad linje: Vidas traktgräns', MARG + B - 130, A4.h - (A4.h - KARTA_Y - KARTA_H + 16) + 4, STEG.micro, normal, GRA);
  }
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

  // Foton: BILDER_PER_SIDA per sida, var och en med nummer och bildtext.
  const BILD_H = 292;
  for (let i = 0; i < m.bilaga.bilder.length; i += 1) {
    const b: Bild = m.bilaga.bilder[i];
    let sida = sidor[sidor.length - 1];
    const plats = i % BILDER_PER_SIDA;
    if (plats === 0) { sida = nySida(); huvud(sida, MARG); }
    const top = MARG + 28 + plats * (BILD_H + 56);
    const d = data[i] as BildData;
    const bild = d.typ === 'png' ? await doc.embedPng(d.bytes) : await doc.embedJpg(d.bytes);
    const skala = Math.min(B / bild.width, BILD_H / bild.height);
    const w = bild.width * skala, h = bild.height * skala;
    sida.drawImage(bild, { x: MARG + (B - w) / 2, y: A4.h - top - h, width: w, height: h });
    const nr = b.nr !== null ? `${b.nr}` : '';
    const del = b.del.av > 1 ? ` (${b.del.i}/${b.del.av})` : '';
    if (nr) textPa(sida, nr, MARG, top + BILD_H + 8, STEG.text, fet, SVART);
    const rader = brytText(`${b.text}${del}`, B - 18, (t) => normal.widthOfTextAtSize(t, STEG.text)).slice(0, 3);
    rader.forEach((r, k) => textPa(sida, r, MARG + 18, top + BILD_H + 8 + k * STEG.text * RAD, STEG.text, normal, SVART));
  }

  sidor.forEach((s, i) => {
    const t = `Sida ${i + 1} av ${sidor.length}`;
    s.drawText(t, { x: MARG + B - normal.widthOfTextAtSize(t, STEG.micro), y: MARG - 18, size: STEG.micro, font: normal, color: GRA });
  });
  return doc.save();
}
