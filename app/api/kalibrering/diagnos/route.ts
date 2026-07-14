import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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
export type KlassStat = {
  klass: string;
  min: number;
  max: number;
  n: number;
  traffPct: number | null;
  systMonthly: SystManad[];
  plateauShare: number | null;
  plateauN: number;
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

  // === Stockar i fönstret: id → månad ===
  const stockRes = await fetchAllRows<{ id: number; kontroll_datum: string }>((from, to) =>
    supabase.from("detalj_kontroll_stock").select("id,kontroll_datum")
      .eq("maskin_id", maskinId).gte("kontroll_datum", fran).lt("kontroll_datum", tillExkl)
      .order("id", { ascending: true }).range(from, to),
  );
  if (stockRes.error) {
    const e = stockRes.error as { message?: string };
    return NextResponse.json({ ok: false, error: `stockar: ${e.message}` }, { status: 500 });
  }
  const stockMonth = new Map<number, string>();
  for (const s of stockRes.data) stockMonth.set(s.id, String(s.kontroll_datum).slice(0, 7));
  const stockIds = stockRes.data.map((s) => s.id);

  // === Matpunkter → per klass: n, träff, systematik per månad (OMÄTT-filtrerat) ===
  type Cell = { avvik: number[] };
  const perKlass = new Map<string, { avvik: number[]; traff: number; manad: Map<string, Cell> }>();
  for (const k of KLASS_DEF) perKlass.set(k.klass, { avvik: [], traff: 0, manad: new Map() });
  const CHUNK = 1000;
  for (let i = 0; i < stockIds.length; i += CHUNK) {
    const chunk = stockIds.slice(i, i + CHUNK);
    if (chunk.length === 0) continue;
    const mpRes = await fetchAllRows<{ detalj_kontroll_stock_id: number; diameter_maskin_mm: number | null; diameter_operator_mm: number | null }>((from, to) =>
      supabase.from("detalj_kontroll_stock_matpunkt")
        .select("detalj_kontroll_stock_id,diameter_maskin_mm,diameter_operator_mm")
        .in("detalj_kontroll_stock_id", chunk).range(from, to),
    );
    if (mpRes.error) {
      const e = mpRes.error as { message?: string };
      return NextResponse.json({ ok: false, error: `matpunkt: ${e.message}` }, { status: 500 });
    }
    for (const m of mpRes.data) {
      const dm = m.diameter_maskin_mm, do_ = m.diameter_operator_mm;
      if (dm == null || do_ == null || do_ === 0) continue; // OMÄTT-filter
      const k = klassAv(do_);
      const bucket = perKlass.get(k)!;
      const avvik = dm - do_;
      bucket.avvik.push(avvik);
      if (Math.abs(avvik) <= 4) bucket.traff++;
      const mo = stockMonth.get(m.detalj_kontroll_stock_id) ?? "?";
      let cell = bucket.manad.get(mo);
      if (!cell) { cell = { avvik: [] }; bucket.manad.set(mo, cell); }
      cell.avvik.push(avvik);
    }
  }

  // === Planområden ur stem_diameter_profile (position>130, klass = punktens maskindia) ===
  const profRes = await fetchAllRows<{ kontroll_datum: string; stem_diameter_profile: { diameter_mm: number; position_cm: number }[] | null }>((from, to) =>
    supabase.from("detalj_kontroll_stam").select("kontroll_datum,stem_diameter_profile")
      .eq("maskin_id", maskinId).gte("kontroll_datum", fran).lt("kontroll_datum", tillExkl)
      .order("id", { ascending: true }).range(from, to),
  );
  const platKlass = new Map<string, { plan: number; tot: number }>();
  for (const k of KLASS_DEF) platKlass.set(k.klass, { plan: 0, tot: 0 });
  const platManad = new Map<string, { plan: number; tot: number }>();
  if (!profRes.error) {
    for (const st of profRes.data) {
      const prof = (st.stem_diameter_profile ?? []).slice().sort((a, b) => a.position_cm - b.position_cm);
      const mo = String(st.kontroll_datum).slice(0, 7);
      for (let j = 1; j < prof.length; j++) {
        if (prof[j].position_cm <= 130) continue;
        const d = prof[j].diameter_mm, dPrev = prof[j - 1].diameter_mm;
        if (d == null || dPrev == null) continue;
        const k = klassAv(d);
        const pk = platKlass.get(k)!;
        pk.tot++;
        let pm = platManad.get(mo);
        if (!pm) { pm = { plan: 0, tot: 0 }; platManad.set(mo, pm); }
        pm.tot++;
        if (d >= dPrev) { pk.plan++; pm.plan++; } // sjunker INTE = planområde
      }
    }
  }

  // === Bygg klass-svar ===
  const klasser: KlassStat[] = KLASS_DEF.map((def) => {
    const b = perKlass.get(def.klass)!;
    const n = b.avvik.length;
    const systMonthly: SystManad[] = Array.from(b.manad.entries())
      .map(([manad, cell]) => ({
        manad,
        systematik: r1(cell.avvik.reduce((a, c) => a + c, 0) / cell.avvik.length),
        n: cell.avvik.length,
      }))
      .sort((a, b2) => a.manad.localeCompare(b2.manad));
    const pk = platKlass.get(def.klass)!;
    return {
      klass: def.klass, min: def.min, max: def.max, n,
      traffPct: n > 0 ? r1((100 * b.traff) / n) : null,
      systMonthly,
      plateauShare: pk.tot > 0 ? r1((100 * pk.plan) / pk.tot) : null,
      plateauN: pk.tot,
    };
  });

  const plateauMonthly = Array.from(platManad.entries())
    .map(([manad, v]) => ({ manad, share: v.tot > 0 ? r1((100 * v.plan) / v.tot) : 0, n: v.tot }))
    .sort((a, b) => a.manad.localeCompare(b.manad));

  // === Markörer: historik (reparation/kalibrering) + åtgärder (förare) ===
  const markorer: Markor[] = [];
  const { data: hist } = await supabase
    .from("fakt_kalibrering_historik").select("datum,orsak")
    .eq("maskin_id", maskinId).gte("datum", fran).lt("datum", tillExkl).order("datum", { ascending: true });
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
