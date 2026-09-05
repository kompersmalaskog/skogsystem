import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { hamtaDiameterPunkter, TOPPDIA_COLS } from "@/lib/kalibrering/diameterpunkter";
import { statistik, type VariabelStat } from "@/lib/kalibrering/statistik";

/**
 * GET /api/kalibrering/tradslag?key=skogsystem-debug&maskin_id=X
 *
 * Per-trädslag-underlag för Rapport-tabellen — PER MASKIN (aldrig flottans
 * total). Gran på PONSSE (VIDA) och Gran på R64428 (BIOMETRIA) är olika saker.
 *
 * Per trädslag: diameter (matpunktsnivå) + längd (stocknivå) som VariabelStat,
 * så klientens bedomProfil() kan färga mot maskinens kravprofil. Population =
 * hela historiken för maskinen (samma som Rapporten aggregerar på).
 *
 * Trädslag per KONTROLL (fakt_kalibrering.tradslag, en per filnamn) → mappas
 * till stockarnas/matpunkternas trädslag via filnamn.
 *
 * ?dagar=N → rullande N-dagarsfönster t.o.m. maskinens senaste kontroll, exakt
 * som bedomning. Utan parametern: hela historiken. Rapporten skickar dagar=90
 * så per-trädslag-tabellen och hjältens tal bygger på SAMMA fönster — annars
 * står 80 % (90 dagar) ovanför 70 % (allt) för samma maskin, omärkt.
 *
 * KRITISKT — OMÄTT ≠ AVVIKELSE: operator NULL/0 exkluderas innan något räknas.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const DEBUG_KEY = "skogsystem-debug";

export type KravRow = {
  variabel: string; metrik: string; riktning: string;
  tolerans: number | null; mal: number; golv: number; enhet: string; larm_min_matt: number | null;
};
export type { VariabelStat };
export type TradslagStat = { tradslag: string; diameter: VariabelStat; langd: VariabelStat };
export type TradslagResponse = {
  ok: true; maskin_id: string; profil: string | null; trosklar: KravRow[]; tradslag: TradslagStat[];
  fonster: { fran: string; till: string; dagar: number } | null;
};

async function fetchAllRows<T>(
  query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<{ data: T[]; error: unknown }> {
  const PAGE = 1000; const all: T[] = []; let offset = 0;
  while (true) {
    const { data, error } = await query(offset, offset + PAGE - 1);
    if (error) return { data: all, error };
    const batch = data ?? []; all.push(...batch);
    if (batch.length < PAGE) break; offset += PAGE;
  }
  return { data: all, error: null };
}
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("key") !== DEBUG_KEY) return new NextResponse("Ogiltig nyckel", { status: 401 });
  const maskinId = url.searchParams.get("maskin_id");
  if (!maskinId) return NextResponse.json({ ok: false, error: "maskin_id krävs" }, { status: 400 });
  const dagarParam = url.searchParams.get("dagar");
  const dagar = dagarParam && Number(dagarParam) > 0 ? Math.floor(Number(dagarParam)) : null;

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // Fönster: N dagar t.o.m. senaste kontroll (samma beräkning som bedomning/route.ts)
  let fonster: { fran: string; till: string; dagar: number } | null = null;
  let fran: string | null = null;
  let tillExkl: string | null = null;
  if (dagar) {
    const { data: senaste } = await supabase.from("detalj_kontroll_stock").select("kontroll_datum")
      .eq("maskin_id", maskinId).order("kontroll_datum", { ascending: false }).limit(1);
    if (senaste && senaste.length > 0) {
      const till = String(senaste[0].kontroll_datum).slice(0, 10);
      const tillD = new Date(`${till}T00:00:00Z`);
      fran = new Date(tillD.getTime() - (dagar - 1) * 86400000).toISOString().slice(0, 10);
      tillExkl = new Date(tillD.getTime() + 86400000).toISOString().slice(0, 10);
      fonster = { fran, till, dagar };
    }
  }

  // profil + trösklar
  const { data: maskinRows } = await supabase.from("dim_maskin").select("kravprofil").eq("maskin_id", maskinId).limit(1);
  const profil: string | null = maskinRows?.[0]?.kravprofil ?? null;
  let trosklar: KravRow[] = [];
  if (profil) {
    const { data } = await supabase.from("kravprofil")
      .select("variabel,metrik,riktning,tolerans,mal,golv,enhet,larm_min_matt").eq("profil", profil);
    trosklar = (data ?? []) as KravRow[];
  }
  const tolFor = (variabel: string, metrik: string): number | null => {
    const r = trosklar.find((t) => t.variabel === variabel && t.metrik === metrik);
    return r && r.tolerans != null ? Number(r.tolerans) : null;
  };
  const tolDia = tolFor("diameter", "traffprocent");
  const grovDia = tolFor("diameter", "grov_avvikelse");
  const tolLen = tolFor("langd", "traffprocent");
  const grovLen = tolFor("langd", "grov_avvikelse");

  // filnamn → trädslag (för denna maskin)
  const fkRes = await fetchAllRows<{ filnamn: string; tradslag: string | null }>((f, t) =>
    supabase.from("fakt_kalibrering").select("filnamn,tradslag").eq("maskin_id", maskinId).order('id').range(f, t),
  );
  const filTradslag = new Map<string, string>();
  for (const r of fkRes.data) if (r.tradslag) filTradslag.set(r.filnamn, r.tradslag.trim());

  // stockar (denna maskin): id → filnamn + längd + toppdia
  const stockRes = await fetchAllRows<{
    id: number;
    filnamn: string;
    maskin_langd_cm: number | null;
    operator_langd_cm: number | null;
    maskin_toppdia_mm: number | null;
    operator_toppdia_mm: number | null;
  }>((f, t) => {
    let q = supabase.from("detalj_kontroll_stock").select(`id,filnamn,maskin_langd_cm,operator_langd_cm,${TOPPDIA_COLS}`)
      .eq("maskin_id", maskinId);
    if (fran && tillExkl) q = q.gte("kontroll_datum", fran).lt("kontroll_datum", tillExkl);
    return q.order("id", { ascending: true }).range(f, t);
  });
  if (stockRes.error) {
    const e = stockRes.error as { message?: string };
    return NextResponse.json({ ok: false, error: `stockar: ${e.message}` }, { status: 500 });
  }
  const stockFil = new Map<number, string>();
  const lenAvvik = new Map<string, number[]>(); // trädslag(lower) → längd-avvik
  const diaAvvik = new Map<string, number[]>(); // trädslag(lower) → dia-avvik
  const namnFor = new Map<string, string>();     // lower → visningsnamn
  for (const s of stockRes.data) {
    stockFil.set(s.id, s.filnamn);
    const tr = filTradslag.get(s.filnamn);
    if (!tr) continue;
    const key = tr.toLowerCase();
    if (!namnFor.has(key)) namnFor.set(key, tr);
    if (s.maskin_langd_cm != null && s.operator_langd_cm != null && s.operator_langd_cm !== 0) {
      (lenAvvik.get(key) ?? lenAvvik.set(key, []).get(key)!).push(s.maskin_langd_cm - s.operator_langd_cm);
    }
  }
  // Diameterpunkter (mätpunkter + toppdia, OMÄTT-filtrerat) → dia per trädslag
  const punktRes = await hamtaDiameterPunkter(supabase, stockRes.data);
  if (punktRes.error) {
    return NextResponse.json({ ok: false, error: `matpunkt: ${punktRes.error.message}` }, { status: 500 });
  }
  for (const p of punktRes.data) {
    const fil = stockFil.get(p.stockId);
    const tr = fil ? filTradslag.get(fil) : undefined;
    if (!tr) continue;
    const key = tr.toLowerCase();
    (diaAvvik.get(key) ?? diaAvvik.set(key, []).get(key)!).push(p.avvik);
  }

  const keys = Array.from(new Set([...diaAvvik.keys(), ...lenAvvik.keys()]));
  const tradslag: TradslagStat[] = keys.map((key) => ({
    tradslag: namnFor.get(key) ?? key,
    diameter: statistik(diaAvvik.get(key) ?? [], tolDia, grovDia),
    langd: statistik(lenAvvik.get(key) ?? [], tolLen, grovLen),
  })).sort((a, b) => (b.diameter.n) - (a.diameter.n));

  return NextResponse.json({ ok: true, maskin_id: maskinId, profil, trosklar, tradslag, fonster } satisfies TradslagResponse);
}
