import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { kravInloggad } from "@/lib/auth/server";
import { hamtaDiameterPunkter, TOPPDIA_COLS } from "@/lib/kalibrering/diameterpunkter";
import { hamtaEra5 } from "@/lib/kalibrering/era5";
import { byggFeletUnderlag } from "@/lib/kalibrering/felet";
import type { FrostResp } from "@/lib/kalibrering/frost";
import { frostRader, type FrostStock } from "@/lib/kalibrering/frostServer";

/**
 * GET /api/kalibrering/frost?maskin_id=X — underlaget till Över tid › Frost: maskinens fel mot klaven per stam och grovlek, med virkets läge (varmt / fruset /
 * kallt, dygnet före mätningen). Hela maskinens historik. Alla inloggade, som Per grovlek. Samma diameterpunkter och regler som Var sitter felet.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const FALLBACK_DIA = 4;

async function fetchAllRows<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<{ data: T[]; error: unknown }> {
  const PAGE = 1000; const all: T[] = []; let offset = 0;
  for (;;) {
    const { data, error } = await query(offset, offset + PAGE - 1);
    if (error) return { data: all, error };
    const batch = data ?? []; all.push(...batch);
    if (batch.length < PAGE) break; offset += PAGE;
  }
  return { data: all, error: null };
}
const fel = (text: string) => NextResponse.json({ ok: false, error: text }, { status: 500 });

export async function GET(req: NextRequest) {
  const vakt = await kravInloggad();
  if (!vakt.ok) return vakt.res;
  const maskinId = new URL(req.url).searchParams.get("maskin_id");
  if (!maskinId) return NextResponse.json({ ok: false, error: "maskin_id krävs" }, { status: 400 });
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // Toleransen påverkar inte felet i mm, men byggFeletUnderlag räknar också träff — samma källa som Var sitter felet.
  const { data: m, error: mErr } = await supabase.from("dim_maskin").select("kravprofil").eq("maskin_id", maskinId).limit(1);
  if (mErr) return fel(`dim_maskin: ${mErr.message}`);
  let tolDia = FALLBACK_DIA;
  const profil: string | null = m?.[0]?.kravprofil ?? null;
  if (profil) {
    const { data: kr, error: kErr } = await supabase.from("kravprofil").select("variabel,tolerans").eq("profil", profil).eq("metrik", "traffprocent").eq("variabel", "diameter");
    if (kErr) return fel(`kravprofil: ${kErr.message}`);
    if (kr?.[0]?.tolerans != null) tolDia = Number(kr[0].tolerans);
  }

  const stockRes = await fetchAllRows<FrostStock & { maskin_toppdia_mm: number | null; operator_toppdia_mm: number | null }>((f, t) =>
    supabase.from("detalj_kontroll_stock")
      .select(`id,filnamn,kontroll_datum,harvest_date,stam_nummer,stock_nummer,machine_measurement_date,operator_measurement_date,maskin_langd_cm,operator_langd_cm,stem_lat,stem_lon,tid_ar_utc,${TOPPDIA_COLS}`)
      .eq("maskin_id", maskinId).order("id", { ascending: true }).range(f, t));
  if (stockRes.error) return fel(`stockar: ${(stockRes.error as { message?: string }).message}`);
  const stockar: FrostStock[] = stockRes.data.map(s => ({ ...s, kontroll_datum: String(s.kontroll_datum).slice(0, 10), harvest_date: s.harvest_date ? String(s.harvest_date) : null }));

  const punktRes = await hamtaDiameterPunkter(supabase, stockRes.data);
  if (punktRes.error) return fel(`matpunkt: ${punktRes.error.message}`);
  const { dia } = byggFeletUnderlag({ stockar, punkter: punktRes.data, filTradslag: new Map(), tolDia });

  const { rader, utanVader } = await frostRader(stockar, dia, (lat, lon, fran, till) => hamtaEra5(lat, lon, fran, till));
  return NextResponse.json({ ok: true, maskin_id: maskinId, rader, utanVader } satisfies FrostResp);
}
