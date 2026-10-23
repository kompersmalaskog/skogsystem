import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { hamtaDiameterPunkter, TOPPDIA_COLS } from "@/lib/kalibrering/diameterpunkter";
import { byggGrovlekRader, type StockRad } from "@/lib/kalibrering/grovlek";
import type { GrovlekResp } from "@/lib/kalibrering/typer";

/**
 * GET /api/kalibrering/grovlek?key=skogsystem-debug&maskin_id=X
 *
 * Underlaget till Över tid › Per grovlek: en rad per STAM, månad och grovlek (operatörens diameter) med trädslag, kontroll och träff mot klaven. Hela historiken
 * för EN maskin. Rutnätet (period, trädslag, färg) räknas i klienten (lib/kalibrering/grovlek) av de här raderna — servern bara hämtar och grupperar.
 *
 * Samma punkter som Träff och Läget: mätpunkter längs stocken + toppen vid kapsnittet (lib/kalibrering/diameterpunkter), OMÄTT-filtrerat (operatör NULL/0 räknas
 * aldrig som avvikelse). Månaden är stockens kontrolldatum, som i diagnos. Toleransen är kravprofilens (±4 mm hos Vida), inte en konstant här.
 * Trädslag per KONTROLL (fakt_kalibrering.tradslag via filnamn), som i tradslag-rutten.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEBUG_KEY = "skogsystem-debug";
const FALLBACK_TOLERANS = 4;

async function fetchAllRows<T>(
  query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<{ data: T[]; error: unknown }> {
  const PAGE = 1000; const all: T[] = []; let offset = 0;
  for (;;) {
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

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // Toleransen ur maskinens kravprofil (diameter, träffprocent). Saknas profilen gäller 4 mm — samma som diagnos.
  const { data: maskinRows } = await supabase.from("dim_maskin").select("kravprofil").eq("maskin_id", maskinId).limit(1);
  const profil: string | null = maskinRows?.[0]?.kravprofil ?? null;
  let tolerans = FALLBACK_TOLERANS;
  if (profil) {
    const { data: kr } = await supabase.from("kravprofil").select("tolerans").eq("profil", profil).eq("variabel", "diameter").eq("metrik", "traffprocent").limit(1);
    if (kr?.[0]?.tolerans != null) tolerans = Number(kr[0].tolerans);
  }

  const fk = await fetchAllRows<{ filnamn: string; tradslag: string | null }>((f, t) =>
    supabase.from("fakt_kalibrering").select("filnamn,tradslag").eq("maskin_id", maskinId).order("id").range(f, t));
  if (fk.error) return NextResponse.json({ ok: false, error: `fakt_kalibrering: ${(fk.error as { message?: string }).message}` }, { status: 500 });
  const filTradslag = new Map<string, string>();
  for (const r of fk.data) if (r.tradslag) filTradslag.set(r.filnamn, r.tradslag.trim());

  const stockRes = await fetchAllRows<StockRad & { maskin_toppdia_mm: number | null; operator_toppdia_mm: number | null }>((f, t) =>
    supabase.from("detalj_kontroll_stock").select(`id,filnamn,kontroll_datum,harvest_date,stam_nummer,stock_nummer,machine_measurement_date,operator_measurement_date,${TOPPDIA_COLS}`)
      .eq("maskin_id", maskinId).order("id", { ascending: true }).range(f, t));
  if (stockRes.error) return NextResponse.json({ ok: false, error: `stockar: ${(stockRes.error as { message?: string }).message}` }, { status: 500 });

  const punktRes = await hamtaDiameterPunkter(supabase, stockRes.data);
  if (punktRes.error) return NextResponse.json({ ok: false, error: `matpunkt: ${punktRes.error.message}` }, { status: 500 });

  const stockar: StockRad[] = stockRes.data.map(s => ({
    id: s.id, filnamn: s.filnamn, kontroll_datum: String(s.kontroll_datum).slice(0, 10), harvest_date: s.harvest_date ? String(s.harvest_date) : null,
    stam_nummer: s.stam_nummer, stock_nummer: s.stock_nummer, machine_measurement_date: s.machine_measurement_date ?? null, operator_measurement_date: s.operator_measurement_date ?? null,
  }));
  const rader = byggGrovlekRader({ stockar, punkter: punktRes.data, filTradslag, tolerans });

  return NextResponse.json({ ok: true, maskin_id: maskinId, tolerans, rader } satisfies GrovlekResp);
}
