import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { serverSupabase } from "@/lib/lonesystem/server";
import { beraknaLoneunderlag, type LoneunderlagBerikad } from "@/lib/lonesystem/loneunderlag";
import { målMedarbetareId } from "@/lib/auth/server";
import { loneartLabel, loneartEnhet, fmtMangd } from "@/lib/lonesystem/lonearter";
import { attTittaPa, minText, timMin, kmUppdelning } from "@/lib/lonesystem/forarText";
import { loneperiodFranArbetsmanad } from "../route";

/**
 * GET /api/lon/min-manad/pdf?arbetsmanad=YYYY-MM[&medarbetare_id=]
 *
 * Förarens tidsspecifikation som PDF (A4) — SAMMA beräkning som skärmen och
 * exporten (beraknaLoneunderlag), ritad server-side med pdf-lib. Inga kronor.
 * Öppnas som länk i appen → iOS visar PDF:en med delningsarket (Spara i Filer,
 * skicka). Identitet ur sessionen (målMedarbetareId), aldrig ur URL:en.
 *
 * All tid i timmar och minuter ("8 tim 52 min"). Decimaler bara där talet går
 * till Fortnox — och då i parentes bredvid, så man kan stämma av (Martin
 * 2026-09-29). Samma förartexter som skärmen (lib/lonesystem/forarText).
 *
 * pdf-lib:s standardfonter kodar WinAnsi → åäö, "–", "—" och "·" går fint,
 * men inte pilar/emoji.
 */
export const dynamic = "force-dynamic";

const MANADER = ["januari", "februari", "mars", "april", "maj", "juni", "juli", "augusti", "september", "oktober", "november", "december"];
const DAGAR = ["sön", "mån", "tis", "ons", "tor", "fre", "lör"];
const t5 = (t: string | null) => (t || "").slice(0, 5) || "-";

export async function GET(req: NextRequest) {
  const arbetsmanad = req.nextUrl.searchParams.get("arbetsmanad") || "";
  if (!/^\d{4}-\d{2}$/.test(arbetsmanad)) {
    return NextResponse.json({ ok: false, error: "arbetsmanad (YYYY-MM) krävs" }, { status: 400 });
  }
  const mål = await målMedarbetareId(req.nextUrl.searchParams.get("medarbetare_id"));
  if (!mål.ok) return mål.res;

  try {
    const period = loneperiodFranArbetsmanad(arbetsmanad);
    const u = await beraknaLoneunderlag(serverSupabase(), { period, medarbetareIds: [mål.id] });
    const m = u.berikad.find(r => r.medarbetare_id === mål.id) ?? null;
    const bytes = await ritaPdf(arbetsmanad, m);
    const [å, mm] = arbetsmanad.split("-");
    const namnSlug = (m?.namn || "medarbetare").toLowerCase().replace(/[^a-z0-9åäö]+/gi, "-");
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="tidsspecifikation-${å}-${mm}-${namnSlug}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}

/** Radbryt en text så den ryms i maxW punkter. */
function radbryt(s: string, maxW: number, size: number, f: PDFFont): string[] {
  const ord = s.split(/\s+/);
  const rader: string[] = [];
  let rad = "";
  for (const o of ord) {
    const test = rad ? `${rad} ${o}` : o;
    if (f.widthOfTextAtSize(test, size) <= maxW || !rad) rad = test;
    else { rader.push(rad); rad = o; }
  }
  if (rad) rader.push(rad);
  return rader;
}

async function ritaPdf(arbetsmanad: string, m: LoneunderlagBerikad | null): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const [å, mm] = arbetsmanad.split("-").map(Number);
  const manadLabel = `${MANADER[mm - 1]} ${å}`;

  const W = 595.28, H = 841.89, ML = 48, MR = 48, MT = 56, MB = 48;
  let page: PDFPage = doc.addPage([W, H]);
  let y = H - MT;
  const grå = rgb(0.45, 0.45, 0.45), svart = rgb(0.08, 0.08, 0.08), linje = rgb(0.85, 0.85, 0.85);

  const nySida = () => { page = doc.addPage([W, H]); y = H - MT; };
  const behov = (px: number) => { if (y - px < MB) nySida(); };
  const text = (s: string, x: number, size = 10, f: PDFFont = font, färg = svart) => page.drawText(s, { x, y, size, font: f, color: färg });
  const rad = (px: number) => { y -= px; };
  const hr = () => { page.drawLine({ start: { x: ML, y: y + 4 }, end: { x: W - MR, y: y + 4 }, thickness: 0.5, color: linje }); };
  const rubrik = (s: string) => { behov(40); rad(22); text(s, ML, 12, bold); rad(8); hr(); rad(14); };
  const bredd = (s: string, size = 10, f: PDFFont = font) => f.widthOfTextAtSize(s, size);
  const högerText = (s: string, xRight: number, size = 10, f: PDFFont = font, färg = svart) => {
    page.drawText(s, { x: xRight - bredd(s, size, f), y, size, font: f, color: färg });
  };
  const stycke = (s: string, x: number, size: number, färg = svart, f: PDFFont = font) => {
    for (const r of radbryt(s, W - MR - x, size, f)) { behov(size + 4); text(r, x, size, f, färg); rad(size + 4); }
  };

  // Sidhuvud
  text("Tidsspecifikation", ML, 18, bold);
  rad(20);
  text(`${m?.namn ?? "-"}  ·  ${manadLabel}`, ML, 11, font, grå);
  rad(14);
  text("Mängder som går till lönen. Belopp räknas i lönesystemet, inte här.", ML, 9, font, grå);
  rad(6);

  if (!m) {
    rad(30); text("Inga arbetsdagar registrerade den här månaden.", ML, 11, font, grå);
    return doc.save();
  }

  // ── Går till lönen ──
  rubrik("Går till lönen");
  const kolMangd = W - MR;
  for (const r of m.rader) {
    behov(16);
    text(`${loneartLabel(r.SalaryCode)}`, ML, 10);
    text(`(${r.SalaryCode})`, ML + 150, 9, font, grå);
    if (loneartEnhet(r.SalaryCode) === "tim") {
      // "128 tim 10 min (128,17)" — tim och min att läsa, decimalen att stämma av mot Fortnox.
      const huvud = timMin(Number(r.Number));
      högerText(huvud, kolMangd, 10, bold);
      högerText(`(${fmtMangd(r.Number)})`, kolMangd - bredd(huvud, 10, bold) - 6, 9, font, grå);
    } else {
      högerText(`${fmtMangd(r.Number)} ${loneartEnhet(r.SalaryCode)}`, kolMangd, 10, bold);
    }
    rad(16);
  }
  if (m.rader.length === 0) { text("Inga lönerader denna månad.", ML, 10, font, grå); rad(16); }
  if (m.ob.timmar > 0) {
    behov(16);
    text("Brandrisk-OB", ML, 10); text("löneart ej fastställd", ML + 150, 9, font, grå);
    högerText(timMin(m.ob.timmar), kolMangd, 10, bold);
    rad(16);
  }
  if (m.extra_h > 0) {
    behov(14);
    text(`varav extra tid utanför maskinen: ${timMin(m.extra_h)} (ingår i timlön/övertid)`, ML, 9, font, grå);
    rad(14);
  }
  // Km uppdelad: körda km OCH km över fri pendling. "1 084 km" och "1 mil" ser
  // annars ut som ett fel — ersättningen räknas per dag, inte på månadens summa.
  const km = kmUppdelning(m.dagar, m.km_grans);
  if (km.totalKm > 0) {
    behov(14);
    const över = km.overKm > 0
      ? `varav ${km.overKm.toLocaleString("sv-SE")} km över ${m.km_grans} km/dag (${km.dagarOver} ${km.dagarOver === 1 ? "dag" : "dagar"}) = ${km.mil} påbörjad${km.mil === 1 ? "" : "e"} mil`
      : `ingen dag över ${m.km_grans} km — ingen reseersättning`;
    stycke(`Körda km: ${km.totalKm.toLocaleString("sv-SE")} km, ${över}.`, ML, 9, grå);
  }

  // ── Att titta på — samma förarord som skärmen ──
  const poster: { rubrik: string; hoger?: string; text: string }[] = [];
  if (m.obekraftade > 0) poster.push({ rubrik: `${m.obekraftade} ${m.obekraftade === 1 ? "dag" : "dagar"}`, hoger: "ej bekräftade", text: "Tiden är med i underlaget men ingen har granskat den. Bekräfta i Kalender." });
  if (m.ob.obesvarade > 0) poster.push({ rubrik: `${m.ob.obesvarade} tidig${m.ob.obesvarade === 1 ? " morgon" : "a morgnar"}`, hoger: "brandrisk?", text: "Var det beordrat för brandrisk? Svara i appen." });
  poster.push(...attTittaPa(m));
  if (poster.length) {
    rubrik("Att titta på");
    for (const p of poster) {
      behov(28);
      text(p.rubrik, ML, 10, bold);
      if (p.hoger) högerText(p.hoger, W - MR, 9.5, font, grå);
      rad(13);
      stycke(p.text, ML, 9, grå);
      rad(4);
    }
  }

  // ── Dag för dag ──
  rubrik("Dag för dag");
  // Tim-och-min-text är bredare än "8:52": rast upp till "2 tim 8 min", arbetad "11 tim 22 min".
  const kol = { datum: ML, start: ML + 42, slut: ML + 74, rast: ML + 106, arb: ML + 164, extra: ML + 228, km: ML + 286, mil: ML + 314, objekt: ML + 334 };
  const huvud = () => {
    text("Datum", kol.datum, 8, bold, grå); text("Start", kol.start, 8, bold, grå); text("Slut", kol.slut, 8, bold, grå);
    text("Rast", kol.rast, 8, bold, grå); text("Arbetad", kol.arb, 8, bold, grå); text("Extra", kol.extra, 8, bold, grå);
    text("Km", kol.km, 8, bold, grå); text("Mil", kol.mil, 8, bold, grå); text("Objekt", kol.objekt, 8, bold, grå);
    rad(12);
  };
  huvud();
  let sumArb = 0, sumExtra = 0, sumKm = 0, sumMil = 0;
  for (const d of m.dagar) {
    if (y - 14 < MB) { nySida(); huvud(); }
    // "perioder" = dag utan maskin: tiden står i Arbetad och kommer ur perioderna.
    const flagg = [!d.bekraftad ? "ej bekräftad" : "", d.perioddag ? "perioder" : "", d.brandrisk_beordrad === true ? "OB" : "", d.dagtyp && d.dagtyp !== "normal" ? d.dagtyp : ""].filter(Boolean).join(", ");
    const dt = new Date(`${d.datum}T12:00:00`);
    text(`${DAGAR[dt.getDay()]} ${dt.getDate()}`, kol.datum, 9); text(t5(d.start_tid), kol.start, 9); text(t5(d.slut_tid), kol.slut, 9);
    text(d.rast_min ? minText(d.rast_min) : "-", kol.rast, 9);
    text(minText(d.arbetad_min), kol.arb, 9); text(d.extra_min ? minText(d.extra_min) : "-", kol.extra, 9);
    text(d.km_totalt ? String(Math.round(d.km_totalt)) : "-", kol.km, 9);
    text(d.ersattningsmil ? String(d.ersattningsmil) : "-", kol.mil, 9);
    const objekt = (d.objekt.join(", ") || "-") + (flagg ? `  (${flagg})` : "");
    // Klipp på bredd, inte tecken — objektkolumnen slutar vid högermarginalen.
    let obj = objekt;
    while (obj.length > 4 && bredd(obj, 8.5) > W - MR - kol.objekt) obj = obj.slice(0, -2);
    text(obj === objekt ? objekt : obj.replace(/[\s,]+$/, "") + "…", kol.objekt, 8.5, font, flagg ? grå : svart);
    sumArb += d.arbetad_min; sumExtra += d.extra_min; sumKm += Math.round(d.km_totalt || 0); sumMil += d.ersattningsmil;
    rad(13);
  }
  rad(2); hr(); rad(12);
  text("Summa", kol.datum, 9, bold); text(minText(sumArb), kol.arb, 9, bold); text(sumExtra ? minText(sumExtra) : "-", kol.extra, 9, bold);
  text(sumKm ? sumKm.toLocaleString("sv-SE") : "-", kol.km, 9, bold); text(sumMil ? String(sumMil) : "-", kol.mil, 9, bold);
  rad(16);
  stycke(`Km = körda km (tur och retur). Mil = påbörjade mil över fri pendling (${m.km_grans} km/dag), räknat per dag. Arbetad = maskintid; Extra = arbete utanför maskinen. (perioder) = dag utan maskin, tiden ur perioderna.`, ML, 8, grå);
  text(`Skapad ${new Date().toISOString().slice(0, 16).replace("T", " ")} ur samma beräkning som löneunderlaget.`, ML, 8, font, grå);

  return doc.save();
}
