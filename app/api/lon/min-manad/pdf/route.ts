import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { serverSupabase } from "@/lib/lonesystem/server";
import { beraknaLoneunderlag, type LoneunderlagBerikad } from "@/lib/lonesystem/loneunderlag";
import { målMedarbetareId } from "@/lib/auth/server";
import { loneartLabel, loneartEnhet, fmtMangd } from "@/lib/lonesystem/lonearter";
import { loneperiodFranArbetsmanad } from "../route";

/**
 * GET /api/lon/min-manad/pdf?arbetsmanad=YYYY-MM[&medarbetare_id=]
 *
 * Förarens tidsspecifikation som PDF (A4) — SAMMA beräkning som skärmen och
 * exporten (beraknaLoneunderlag), ritad server-side med pdf-lib. Inga kronor.
 * Öppnas som länk i appen → iOS visar PDF:en med delningsarket (Spara i Filer,
 * skicka). Identitet ur sessionen (målMedarbetareId), aldrig ur URL:en.
 *
 * pdf-lib:s standardfonter kodar WinAnsi → åäö går fint, men inte pilar/emoji.
 * Håll texten till bokstäver, siffror, "-" och "·".
 */
export const dynamic = "force-dynamic";

const MANADER = ["januari", "februari", "mars", "april", "maj", "juni", "juli", "augusti", "september", "oktober", "november", "december"];
const fmtMin = (min: number) => { const h = Math.floor(min / 60), m = min % 60; return m ? `${h}:${String(m).padStart(2, "0")}` : `${h}:00`; };
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
  const högerText = (s: string, xRight: number, size = 10, f: PDFFont = font, färg = svart) => {
    const w = f.widthOfTextAtSize(s, size); page.drawText(s, { x: xRight - w, y, size, font: f, color: färg });
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
    högerText(`${fmtMangd(r.Number)} ${loneartEnhet(r.SalaryCode)}`, kolMangd, 10, bold);
    rad(16);
  }
  if (m.rader.length === 0) { text("Inga lönerader denna månad.", ML, 10, font, grå); rad(16); }
  if (m.ob.timmar > 0) {
    behov(16);
    text("Brandrisk-OB", ML, 10); text("löneart ej fastställd", ML + 150, 9, font, grå);
    högerText(`${fmtMangd(m.ob.timmar)} tim`, kolMangd, 10, bold);
    rad(16);
  }
  if (m.extra_h > 0) {
    behov(14);
    text(`varav extra tid utanför maskinen: ${fmtMangd(m.extra_h)} tim (ingår i timlön/övertid)`, ML, 9, font, grå);
    rad(14);
  }

  // ── Saknas ──
  const saknas: string[] = [];
  if (m.obekraftade > 0) saknas.push(`${m.obekraftade} obekräftad${m.obekraftade === 1 ? "" : "e"} arbetsdag${m.obekraftade === 1 ? "" : "ar"}`);
  if (m.ob.obesvarade > 0) saknas.push(`${m.ob.obesvarade} tidig${m.ob.obesvarade === 1 ? "" : "a"} dag${m.ob.obesvarade === 1 ? "" : "ar"} utan brandrisk-svar`);
  for (const s of m.synk) saknas.push(`${s.datum}: ${s.diff_min} min oförklarad tidsavvikelse (du sa ${s.bekraftat}, maskinen ${s.maskinen})`);
  for (const k of m.ledighetskollision) saknas.push(`${k.datum}: godkänd ledighet (${k.typ}) och ${fmtMin(k.arbetad_min)} arbete samma dag`);
  for (const f of m.franvaro) saknas.push(`${f.typ}: ${f.dagar} dag${f.dagar === 1 ? "" : "ar"} (${f.datum.join(", ")})`);
  if (saknas.length) {
    rubrik("Att åtgärda eller känna till");
    for (const s of saknas) { behov(14); text(`· ${s}`, ML, 9.5); rad(14); }
  }

  // ── Dag för dag ──
  rubrik("Dag för dag");
  const kol = { datum: ML, start: ML + 62, slut: ML + 100, rast: ML + 138, arb: ML + 176, extra: ML + 218, mil: ML + 258, objekt: ML + 300 };
  const huvud = () => {
    text("Datum", kol.datum, 8, bold, grå); text("Start", kol.start, 8, bold, grå); text("Slut", kol.slut, 8, bold, grå);
    text("Rast", kol.rast, 8, bold, grå); text("Arbetad", kol.arb, 8, bold, grå); text("Extra", kol.extra, 8, bold, grå);
    text("Mil", kol.mil, 8, bold, grå); text("Objekt", kol.objekt, 8, bold, grå);
    rad(12);
  };
  huvud();
  let sumArb = 0, sumExtra = 0, sumMil = 0;
  for (const d of m.dagar) {
    if (y - 14 < MB) { nySida(); huvud(); }
    // dagtyp "normal" är default-bruset — bara avvikande dagtyper (sjuk, vab, semester…) flaggas
    const flagg = [!d.bekraftad ? "ej bekräftad" : "", d.brandrisk_beordrad === true ? "OB" : "", d.dagtyp && d.dagtyp !== "normal" ? d.dagtyp : ""].filter(Boolean).join(", ");
    text(d.datum.slice(5), kol.datum, 9); text(t5(d.start_tid), kol.start, 9); text(t5(d.slut_tid), kol.slut, 9);
    text(d.rast_min != null ? `${d.rast_min} min` : "-", kol.rast, 9);
    text(fmtMin(d.arbetad_min), kol.arb, 9); text(d.extra_min ? fmtMin(d.extra_min) : "-", kol.extra, 9);
    text(d.ersattningsmil ? String(d.ersattningsmil) : "-", kol.mil, 9);
    const objekt = (d.objekt.join(", ") || "-") + (flagg ? `  (${flagg})` : "");
    text(objekt.length > 46 ? objekt.slice(0, 44) + "…" : objekt, kol.objekt, 8.5, font, flagg ? grå : svart);
    sumArb += d.arbetad_min; sumExtra += d.extra_min; sumMil += d.ersattningsmil;
    rad(13);
  }
  rad(2); hr(); rad(12);
  text("Summa", kol.datum, 9, bold); text(fmtMin(sumArb), kol.arb, 9, bold); text(sumExtra ? fmtMin(sumExtra) : "-", kol.extra, 9, bold); text(sumMil ? String(sumMil) : "-", kol.mil, 9, bold);
  rad(16);
  text(`Mil = påbörjade mil över fri pendling (${m.km_grans} km/dag). Arbetad = maskintid; Extra = arbete utanför maskinen.`, ML, 8, font, grå);
  rad(11);
  text(`Skapad ${new Date().toISOString().slice(0, 16).replace("T", " ")} ur samma beräkning som löneunderlaget.`, ML, 8, font, grå);

  return doc.save();
}
