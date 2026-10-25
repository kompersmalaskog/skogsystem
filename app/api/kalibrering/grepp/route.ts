import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { kravInloggad } from "@/lib/auth/server";
import { lasRader, lasStatus } from "@/lib/kalibrering/greppServer";
import type { GreppResp } from "@/lib/kalibrering/typer";

/**
 * GET /api/kalibrering/grepp?maskin_id=X — alla inloggade (förarna ska se greppet).
 *
 * Underlaget till Över tid › Greppet: hur ofta maskinens egen diameter står still, per månad, trädslag och grovlek, räknat på ALLA stammar
 * (detalj_stam_diameter). Tio miljoner punkter går inte att räkna per öppning, så databasen håller en cache (kalibrering_grepp_manad, migration 20261024093226).
 *
 * DEN HÄR RUTTEN LÄSER BARA CACHEN OCH RÄKNAR ALDRIG (beslut Martin 2026-10-24: ingen människa ska behöva trigga omräkningen). Den räknas om av cron-jobbet
 * /api/cron/kalibrering-grepp när importen läst in nya stammar. `kvar` = hur många objekt som ligger efter; vyn säger "Räknas om" och siffrorna kompletteras av sig själva.
 * Är migrationen inte körd svarar rutten `tillganglig: false`.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const vakt = await kravInloggad();
  if (!vakt.ok) return vakt.res;
  const maskinId = new URL(req.url).searchParams.get("maskin_id");
  if (!maskinId) return NextResponse.json({ ok: false, error: "maskin_id krävs" }, { status: 400 });

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const tomt = (extra: Partial<GreppResp>): GreppResp => ({
    ok: true, maskin_id: maskinId, tillganglig: true, rader: [], kvar: 0, stammarTotalt: 0, stammarRaknade: 0, ...extra,
  });

  const status = await lasStatus(supabase, maskinId);
  if (!status.ok) {
    if (status.saknas) return NextResponse.json(tomt({ tillganglig: false, orsak: "migration" }));
    return NextResponse.json({ ok: false, error: status.fel }, { status: 500 });
  }
  const rader = await lasRader(supabase, maskinId);
  if (!rader.ok) return NextResponse.json({ ok: false, error: rader.fel }, { status: 500 });

  return NextResponse.json(tomt({
    rader: rader.rader,
    kvar: status.objekt.filter(o => !o.aktuell).length,
    stammarTotalt: status.objekt.reduce((a, o) => a + o.antal_stammar, 0),
    stammarRaknade: status.objekt.reduce((a, o) => a + o.antal_raknade, 0),
  }));
}
