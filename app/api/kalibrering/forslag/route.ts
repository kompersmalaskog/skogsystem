import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { kravInloggad } from "@/lib/auth/server";
import { hamtaDiameterPunkter, TOPPDIA_COLS } from "@/lib/kalibrering/diameterpunkter";
import { byggForslagStammar, FORSLAG, punktBesked } from "@/lib/kalibrering/forslag";
import { byggKort, greppSteg } from "@/lib/kalibrering/forslagKort";
import { andringarUr, tolkaMarkor } from "@/lib/kalibrering/forslagMarkorer";
import { lasRader, lasStatus } from "@/lib/kalibrering/greppServer";
import { HISTORIK_MARKOR_KOLUMNER, type HistorikMarkorRad } from "@/lib/kalibrering/historik";
import type { StockRad } from "@/lib/kalibrering/grovlek";
import type { ForslagResp } from "@/lib/kalibrering/typer";

/**
 * GET /api/kalibrering/forslag?maskin_id=X — alla inloggade (förarna är de som ska göra något i maskinen).
 *
 * Kortet "Gör så här" och besked per punkt på diameterkurvan. Räknandet bor i lib/kalibrering (forslag, forslagKort, forslagMarkorer) och är rent;
 * rutten hämtar bara underlaget: klavade stammar de senaste FONSTER_MAX_DAGAR dagarna (samma punkter, samma OMÄTT-filter och samma fysiska stam som Per
 * grovlek), förarens åtgärder (kalibrering_atgard), kalibreringarna i historiken och greppets cache (läses, räknas aldrig här). Appen skriver aldrig till maskinen.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

const dagSverige = (): string => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });
const minusDagar = (datum: string, n: number): string => new Date(new Date(`${datum}T00:00:00Z`).getTime() - n * 86400000).toISOString().slice(0, 10);

export async function GET(req: NextRequest) {
  const vakt = await kravInloggad();
  if (!vakt.ok) return vakt.res;
  const maskinId = new URL(req.url).searchParams.get("maskin_id");
  if (!maskinId) return NextResponse.json({ ok: false, error: "maskin_id krävs" }, { status: 400 });

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const idag = dagSverige();
  const fran = minusDagar(idag, FORSLAG.FONSTER_MAX_DAGAR);
  const fel = (meddelande: string) => NextResponse.json({ ok: false, error: meddelande }, { status: 500 });

  // Trädslag per kontroll (fakt_kalibrering via filnamn), som i Per grovlek.
  const fk = await fetchAllRows<{ filnamn: string; tradslag: string | null }>((f, t) =>
    supabase.from("fakt_kalibrering").select("filnamn,tradslag").eq("maskin_id", maskinId).order("id").range(f, t));
  if (fk.error) return fel(`fakt_kalibrering: ${(fk.error as { message?: string }).message}`);
  const filTradslag = new Map<string, string>();
  for (const r of fk.data) if (r.tradslag) filTradslag.set(r.filnamn, r.tradslag.trim());

  const stockRes = await fetchAllRows<StockRad & { maskin_toppdia_mm: number | null; operator_toppdia_mm: number | null }>((f, t) =>
    supabase.from("detalj_kontroll_stock").select(`id,filnamn,kontroll_datum,harvest_date,stam_nummer,stock_nummer,machine_measurement_date,operator_measurement_date,${TOPPDIA_COLS}`)
      .eq("maskin_id", maskinId).gte("kontroll_datum", fran).order("id", { ascending: true }).range(f, t));
  if (stockRes.error) return fel(`stockar: ${(stockRes.error as { message?: string }).message}`);
  const punktRes = await hamtaDiameterPunkter(supabase, stockRes.data);
  if (punktRes.error) return fel(`matpunkt: ${punktRes.error.message}`);

  const stockar: StockRad[] = stockRes.data.map(s => ({
    id: s.id, filnamn: s.filnamn, kontroll_datum: String(s.kontroll_datum).slice(0, 10), harvest_date: s.harvest_date ? String(s.harvest_date) : null,
    stam_nummer: s.stam_nummer, stock_nummer: s.stock_nummer, machine_measurement_date: s.machine_measurement_date ?? null, operator_measurement_date: s.operator_measurement_date ?? null,
  }));
  const stammar = byggForslagStammar({ stockar, punkter: punktRes.data, filTradslag });

  // Förarens åtgärder (alla — en tryckändring kan ligga före fönstret men fortfarande styra veckans väntan) och kalibreringarna i historiken.
  const atg = await supabase.from("kalibrering_atgard").select("datum,text").eq("maskin_id", maskinId).order("datum", { ascending: true });
  if (atg.error) return fel(`kalibrering_atgard: ${atg.error.message}`);
  const hist = await supabase.from("fakt_kalibrering_historik").select(HISTORIK_MARKOR_KOLUMNER).eq("maskin_id", maskinId).gte("datum", fran).order("datum", { ascending: true });
  if (hist.error) return fel(`fakt_kalibrering_historik: ${hist.error.message}`);

  const atgarder = (atg.data ?? []).map(a => ({ datum: String(a.datum).slice(0, 10), text: String(a.text ?? "") }));
  const andringar = andringarUr({
    atgarder,
    historik: (hist.data ?? []) as unknown as HistorikMarkorRad[],
  });
  // Dagar föraren svarat på knivar och valsar: "Klart, allt såg bra ut" och "Bytte något" (byte är också en ändring av maskinen).
  const kollat = atgarder.filter(a => { const s = tolkaMarkor(a.text).slag; return s === "kontroll" || s === "byte"; }).map(a => a.datum);

  // Greppet: läses ur cachen. Går det inte att läsa vet vi inte om knivar och valsar ska kollas — vyn säger det.
  const status = await lasStatus(supabase, maskinId);
  let greppLast = false;
  let grepp: ReturnType<typeof greppSteg> = [];
  if (status.ok) {
    const rader = await lasRader(supabase, maskinId);
    if (rader.ok) { greppLast = true; grepp = greppSteg(rader.rader, idag); }
  }

  const punkter = punktBesked({ stammar, andringar, idag });
  const kort = byggKort({ punkter, grepp, andringar, kollat, idag });
  const senaste = andringar.length ? andringar[andringar.length - 1] : null;
  return NextResponse.json({
    ok: true, maskin_id: maskinId, idag, kort, punkter, grepp, greppLast,
    senasteAndring: senaste ? { datum: senaste.datum, slag: senaste.slag } : null,
    stammar: stammar.length,
  } satisfies ForslagResp);
}
