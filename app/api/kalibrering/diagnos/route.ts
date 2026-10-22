import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { hamtaDiameterPunkter, TOPPDIA_COLS } from "@/lib/kalibrering/diameterpunkter";

/**
 * GET /api/kalibrering/diagnos?key=skogsystem-debug&maskin_id=X
 *
 * Diagnos-underlag för kalibreringsvyn: rådata per DIAMETERKLASS över det
 * rullande 90-dagarsfönstret, plus planområdesandel (tryckmätaren) och
 * åtgärdsmarkörer. Själva diagnosen (kurva/tryck/slitage + åtgärdstext) körs
 * i klienten (diagnos() i page.tsx) där UI-texten bor.
 *
 * Tre fel skiljs på signatur:
 *   - Kurva:  systematik KONSEKVENT i en underpresterande klass (samma tecken)
 *   - Tryck:  systematik VÄXLAR TECKEN + planområden höga i grova klasser
 *   - Slitage: planområden kvar EFTER en tryckhöjnings-markör (eskalering)
 *
 * KRITISKT — OMÄTT ≠ AVVIKELSE: operator NULL/0 exkluderas innan något räknas.
 * KRITISKT — DIAGNOS BARA PÅ UNDERPRESTERANDE KLASS: golvet (profilens
 *   träffprocent-golv) skickas med så klienten aldrig larmar på en klass som
 *   klarar kravet, oavsett vad tecknen gör.
 *
 * Klassaxel: diameter klassas på OPERATÖRENS (sanna) diameter för träff/
 * systematik. Planområden räknas ur maskinens stem_diameter_profile och
 * klassas på punktens EGEN maskindiameter (det finns ingen operatörsprofil).
 *
 * Underlaget = mätpunkter längs stocken OCH toppdiametern vid kapsnittet,
 * via lib/kalibrering/diameterpunkter (samma källa som bedomning).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEBUG_KEY = "skogsystem-debug";
const FONSTER_DAGAR = 90;

const KLASS_DEF = [
  { klass: "<150", min: 0, max: 150 },
  { klass: "150-199", min: 150, max: 200 },
  { klass: "200-249", min: 200, max: 250 },
  { klass: "250-299", min: 250, max: 300 },
  { klass: "300+", min: 300, max: 100000 },
] as const;
const klassAv = (d: number): string =>
  d < 150 ? "<150" : d < 200 ? "150-199" : d < 250 ? "200-249" : d < 300 ? "250-299" : "300+";

export type SystManad = { manad: string; systematik: number; n: number };
export type TraffManad = { manad: string; traffPct: number; n: number };
export type PlatManad = { manad: string; share: number; n: number };
// Spridning per månad: RÅA summor, inte färdig std. std är INTE viktbart som
// träffprocent — för att aggregera månad→kvartal korrekt behövs Σn/Σsum/Σsumsq:
//   std = √(Σsumsq/Σn − (Σsum/Σn)²).  Att medelvärda månads-std vore fel.
export type SpridManad = { manad: string; n: number; sum: number; sumsq: number };
export type KlassStat = {
  klass: string;
  min: number;
  max: number;
  // Verdikt-fält: 90-dagarsfönstret (används av förarvyn/diagnos()).
  n: number;
  traffPct: number | null;
  standardavv: number | null; // spridning i fönstret — "Flaxar den?"-slutsatsen
  systMonthly: SystManad[];
  plateauShare: number | null;
  plateauN: number;
  // Trend-fält: HELA historiken, per månad (Trend "Läget"/"Flaxar den?"-kurvorna).
  traffMonthly: TraffManad[];
  plateauMonthly: PlatManad[];
  spridMonthly: SpridManad[];
};
export type Markor = { datum: string; kalla: "reparation" | "kalibrering" | "atgard"; text: string };
export type DiagnosResponse = {
  ok: true;
  maskin_id: string;
  profil: string | null;
  golvDia: number | null;
  fonster: { fran: string; till: string; dagar: number } | null;
  klasser: KlassStat[];
  plateauMonthly: { manad: string; share: number; n: number }[];
  markorer: Markor[];
};

async function fetchAllRows<T>(
  query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<{ data: T[]; error: unknown }> {
  const PAGE = 1000;
  const all: T[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await query(offset, offset + PAGE - 1);
    if (error) return { data: all, error };
    const batch = data ?? [];
    all.push(...batch);
    if (batch.length < PAGE) break;
    offset += PAGE;
  }
  return { data: all, error: null };
}
const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;
// Populationens std (÷N — vi har hela populationen, inte ett urval).
function popStd(vals: number[], mean: number): number {
  if (vals.length < 2) return 0;
  return Math.sqrt(vals.reduce((a, b) => a + (b - mean) * (b - mean), 0) / vals.length);
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("key") !== DEBUG_KEY) return new NextResponse("Ogiltig nyckel", { status: 401 });
  const maskinId = url.searchParams.get("maskin_id");
  if (!maskinId) return NextResponse.json({ ok: false, error: "maskin_id krävs" }, { status: 400 });

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // === Profil + diameter-golv ===
  const { data: maskinRows } = await supabase.from("dim_maskin").select("kravprofil").eq("maskin_id", maskinId).limit(1);
  const profil: string | null = maskinRows?.[0]?.kravprofil ?? null;
  let golvDia: number | null = null;
  if (profil) {
    const { data: kr } = await supabase
      .from("kravprofil").select("golv")
      .eq("profil", profil).eq("variabel", "diameter").eq("metrik", "traffprocent").limit(1);
    golvDia = kr?.[0]?.golv != null ? Number(kr[0].golv) : null;
  }

  // === Fönster: 90 dagar t.o.m. maskinens senaste kontroll ===
  const { data: senaste } = await supabase
    .from("detalj_kontroll_stock").select("kontroll_datum")
    .eq("maskin_id", maskinId).order("kontroll_datum", { ascending: false }).limit(1);
  if (!senaste || senaste.length === 0) {
    return NextResponse.json({
      ok: true, maskin_id: maskinId, profil, golvDia, fonster: null, klasser: [], plateauMonthly: [], markorer: [],
    } satisfies DiagnosResponse);
  }
  const till = String(senaste[0].kontroll_datum).slice(0, 10);
  const tillD = new Date(`${till}T00:00:00Z`);
  const fran = new Date(tillD.getTime() - (FONSTER_DAGAR - 1) * 86400000).toISOString().slice(0, 10);
  const tillExkl = new Date(tillD.getTime() + 86400000).toISOString().slice(0, 10);

  // === Stockar: HELA historiken (månadsserier) + fönster-flagga (verdikt) ===
  const stockRes = await fetchAllRows<{
    id: number;
    kontroll_datum: string;
    maskin_toppdia_mm: number | null;
    operator_toppdia_mm: number | null;
  }>((from, to) =>
    supabase.from("detalj_kontroll_stock").select(`id,kontroll_datum,${TOPPDIA_COLS}`)
      .eq("maskin_id", maskinId)
      .order("id", { ascending: true }).range(from, to),
  );
  if (stockRes.error) {
    const e = stockRes.error as { message?: string };
    return NextResponse.json({ ok: false, error: `stockar: ${e.message}` }, { status: 500 });
  }
  const stockMonth = new Map<number, string>();
  const stockInWin = new Map<number, boolean>();
  for (const s of stockRes.data) {
    const d = String(s.kontroll_datum).slice(0, 10);
    stockMonth.set(s.id, d.slice(0, 7));
    stockInWin.set(s.id, d >= fran && d < tillExkl);
  }

  // === Matpunkter (OMÄTT-filtrerat) → per klass: fönster-aggregat (verdikt) + månadsserier (allt) ===
  type KB = {
    winAvvik: number[]; winTraff: number;                        // 90d verdikt
    winManad: Map<string, number[]>;                             // 90d systMonthly (verdikt + Stabilitet-grid)
    allManad: Map<string, { avvik: number[]; traff: number }>;   // hela historiken (traffMonthly)
  };
  const perKlass = new Map<string, KB>();
  for (const k of KLASS_DEF) perKlass.set(k.klass, { winAvvik: [], winTraff: 0, winManad: new Map(), allManad: new Map() });
  // Mätpunkter längs stocken + toppdiametern vid kapsnittet (OMÄTT-filtrerat
  // i hjälparen). Klassaxeln är operatörens diameter — toppen har en sådan
  // och klassas på exakt samma sätt som en mätpunkt.
  const punktRes = await hamtaDiameterPunkter(supabase, stockRes.data);
  if (punktRes.error) {
    return NextResponse.json({ ok: false, error: `matpunkt: ${punktRes.error.message}` }, { status: 500 });
  }
  for (const p of punktRes.data) {
    const b = perKlass.get(klassAv(p.operator_mm))!;
    const avvik = p.avvik;
    const traff = Math.abs(avvik) <= 4;
    const mo = stockMonth.get(p.stockId) ?? "?";
    let am = b.allManad.get(mo);
    if (!am) { am = { avvik: [], traff: 0 }; b.allManad.set(mo, am); }
    am.avvik.push(avvik); if (traff) am.traff++;
    if (stockInWin.get(p.stockId)) {
      b.winAvvik.push(avvik); if (traff) b.winTraff++;
      let wm = b.winManad.get(mo);
      if (!wm) { wm = []; b.winManad.set(mo, wm); }
      wm.push(avvik);
    }
  }

  // === Planområden ur stem_diameter_profile (hela historiken + fönster) ===
  const profRes = await fetchAllRows<{ kontroll_datum: string; stem_diameter_profile: { diameter_mm: number; position_cm: number }[] | null }>((from, to) =>
    supabase.from("detalj_kontroll_stam").select("kontroll_datum,stem_diameter_profile")
      .eq("maskin_id", maskinId)
      .order("id", { ascending: true }).range(from, to),
  );
  const platWin = new Map<string, { plan: number; tot: number }>();                     // 90d per klass (plateauShare)
  const platAllMonth = new Map<string, Map<string, { plan: number; tot: number }>>();   // per klass per månad (allt)
  for (const k of KLASS_DEF) { platWin.set(k.klass, { plan: 0, tot: 0 }); platAllMonth.set(k.klass, new Map()); }
  const platManadOverall = new Map<string, { plan: number; tot: number }>();            // allt, överlag (slitage + Siffror-över-tid)
  if (!profRes.error) {
    for (const st of profRes.data) {
      const prof = (st.stem_diameter_profile ?? []).slice().sort((a, b) => a.position_cm - b.position_cm);
      const d10 = String(st.kontroll_datum).slice(0, 10);
      const mo = d10.slice(0, 7);
      const inWin = d10 >= fran && d10 < tillExkl;
      for (let j = 1; j < prof.length; j++) {
        if (prof[j].position_cm <= 130) continue;
        const d = prof[j].diameter_mm, dPrev = prof[j - 1].diameter_mm;
        if (d == null || dPrev == null) continue;
        const k = klassAv(d);
        const flat = d >= dPrev ? 1 : 0; // sjunker INTE = planområde
        const cm = platAllMonth.get(k)!;
        let c = cm.get(mo); if (!c) { c = { plan: 0, tot: 0 }; cm.set(mo, c); }
        c.tot++; c.plan += flat;
        let po = platManadOverall.get(mo); if (!po) { po = { plan: 0, tot: 0 }; platManadOverall.set(mo, po); }
        po.tot++; po.plan += flat;
        if (inWin) { const pw = platWin.get(k)!; pw.tot++; pw.plan += flat; }
      }
    }
  }

  // === Bygg klass-svar ===
  const klasser: KlassStat[] = KLASS_DEF.map((def) => {
    const b = perKlass.get(def.klass)!;
    const n = b.winAvvik.length;
    const systMonthly: SystManad[] = Array.from(b.winManad.entries())
      .map(([manad, avvik]) => ({ manad, systematik: r1(avvik.reduce((a, c) => a + c, 0) / avvik.length), n: avvik.length }))
      .sort((a, b2) => a.manad.localeCompare(b2.manad));
    const traffMonthly: TraffManad[] = Array.from(b.allManad.entries())
      .map(([manad, cell]) => ({ manad, traffPct: r1((100 * cell.traff) / cell.avvik.length), n: cell.avvik.length }))
      .sort((a, b2) => a.manad.localeCompare(b2.manad));
    const plateauMonthlyKlass: PlatManad[] = Array.from(platAllMonth.get(def.klass)!.entries())
      .map(([manad, v]) => ({ manad, share: v.tot > 0 ? r1((100 * v.plan) / v.tot) : 0, n: v.tot }))
      .sort((a, b2) => a.manad.localeCompare(b2.manad));
    // Spridning per månad: råa summor så klienten kan aggregera std exakt per period.
    const spridMonthly: SpridManad[] = Array.from(b.allManad.entries())
      .map(([manad, cell]) => ({
        manad,
        n: cell.avvik.length,
        sum: cell.avvik.reduce((a, c) => a + c, 0),
        sumsq: cell.avvik.reduce((a, c) => a + c * c, 0),
      }))
      .sort((a, b2) => a.manad.localeCompare(b2.manad));
    // Spridning i 90-dagarsfönstret — bär "Flaxar den?"-slutsatsen.
    const winMean = n > 0 ? b.winAvvik.reduce((a, c) => a + c, 0) / n : 0;
    const pw = platWin.get(def.klass)!;
    return {
      klass: def.klass, min: def.min, max: def.max, n,
      traffPct: n > 0 ? r1((100 * b.winTraff) / n) : null,
      standardavv: n > 0 ? r2(popStd(b.winAvvik, winMean)) : null,
      systMonthly,
      plateauShare: pw.tot > 0 ? r1((100 * pw.plan) / pw.tot) : null,
      plateauN: pw.tot,
      traffMonthly,
      plateauMonthly: plateauMonthlyKlass,
      spridMonthly,
    };
  });

  const plateauMonthly = Array.from(platManadOverall.entries())
    .map(([manad, v]) => ({ manad, share: v.tot > 0 ? r1((100 * v.plan) / v.tot) : 0, n: v.tot }))
    .sort((a, b) => a.manad.localeCompare(b.manad));

  // === Markörer: historik (reparation/kalibrering) + åtgärder (förare) ===
  const markorer: Markor[] = [];
  const { data: hist } = await supabase
    .from("fakt_kalibrering_historik").select("datum,orsak")
    .eq("maskin_id", maskinId).order("datum", { ascending: true }); // hela historiken — markörer i Trend spänner allt
  for (const h of hist ?? []) {
    const orsak = String(h.orsak ?? "");
    if (/repair/i.test(orsak)) markorer.push({ datum: String(h.datum).slice(0, 10), kalla: "reparation", text: "Reparation av mätsystem" });
  }
  const { data: atg } = await supabase
    .from("kalibrering_atgard").select("datum,text")
    .eq("maskin_id", maskinId).order("datum", { ascending: true });
  for (const a of atg ?? []) markorer.push({ datum: String(a.datum).slice(0, 10), kalla: "atgard", text: String(a.text ?? "") });
  markorer.sort((a, b) => a.datum.localeCompare(b.datum));

  return NextResponse.json({
    ok: true, maskin_id: maskinId, profil, golvDia,
    fonster: { fran, till, dagar: FONSTER_DAGAR },
    klasser, plateauMonthly, markorer,
  } satisfies DiagnosResponse);
}
