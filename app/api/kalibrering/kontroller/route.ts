import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { kravInloggad } from "@/lib/auth/server";
import { kontrollTider, type StockTidRad } from "@/lib/kalibrering/kontrollLista";
import type { KontrollTid } from "@/lib/kalibrering/typer";

/**
 * GET /api/kalibrering/kontroller?maskin_id=X
 *
 * Vad listan Kontroller behöver utöver fakt_kalibrering: NÄR varje kontroll mättes (svensk tid) och hur stammen valdes (slump/förvald).
 * Båda ligger bara på stockraderna. Tiderna är Opti-tider med radens `tid_ar_utc` och omräknas här med lib/optiTid (aldrig rått).
 * Små rader (fem kolumner), en maskin åt gången, paginerat på PK.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE = 1000;

export type KontrollerResponse = { ok: true; maskin_id: string; tider: Record<string, KontrollTid> };

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const vakt = await kravInloggad();
  if (!vakt.ok) return vakt.res;
  const maskinId = url.searchParams.get("maskin_id");
  if (!maskinId) return NextResponse.json({ ok: false, error: "maskin_id krävs" }, { status: 400 });

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const rader: StockTidRad[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from("detalj_kontroll_stock")
      .select("filnamn,stem_selection,operator_measurement_date,tid_ar_utc")
      .eq("maskin_id", maskinId)
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) return NextResponse.json({ ok: false, error: `detalj_kontroll_stock: ${error.message}` }, { status: 500 });
    const batch = (data ?? []) as StockTidRad[];
    rader.push(...batch);
    if (batch.length < PAGE) break;
  }

  return NextResponse.json({ ok: true, maskin_id: maskinId, tider: kontrollTider(rader) } satisfies KontrollerResponse);
}
