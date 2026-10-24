import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ADMIN_ROLLER, kravRoll } from "@/lib/auth/server";
import type { GreppRad } from "@/lib/kalibrering/greppTid";
import type { GreppResp } from "@/lib/kalibrering/typer";

/**
 * GET /api/kalibrering/grepp?maskin_id=X
 * Kräver inloggad admin (kravRoll) — ingen nyckel i adressen.
 *
 * Underlaget till Över tid › Greppet: hur ofta maskinens egen diameter står still, per månad, trädslag och grovlek, räknat på ALLA stammar
 * (detalj_stam_diameter). Tio miljoner punkter går inte att räkna per öppning, så databasen håller en cache (kalibrering_grepp_manad) som räknas om OBJEKT FÖR
 * OBJEKT när underlaget ändrats (migration 20261023180000). Den här rutten ser till att cachen är aktuell — inom en tidsbudget, ett objekt åt gången — och
 * läser den. Hinner den inte alla objekt säger svaret hur många som är kvar (`kvar`), och klienten frågar igen; det som redan är räknat visas under tiden.
 *
 * Ett objekt som inte går att räkna (timeout, fel) ligger i `fel` och stoppar inte de andra. Är migrationen inte körd svarar rutten `tillganglig: false`.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Efter så här lång tid börjar rutten inte på ett nytt objekt (det största tar ~5 s, svaret måste hinnas före maxDuration). */
const BUDGET_MS = 35_000;

type StatusRad = { objekt_id: string; antal_stammar: number; antal_raknade: number; aktuell: boolean };
type SammanstallRad = { manad: string; tradslag: string; klass: string; stammar: number | string; steg: number | string; still: number | string; summa_andel: number | string };

/** PostgREST säger att funktionen saknas med PGRST202 (schema-cachen) eller 42883 (Postgres). */
const funktionSaknas = (e: { code?: string; message?: string } | null): boolean =>
  !!e && (e.code === "PGRST202" || e.code === "42883" || /could not find the function|does not exist/i.test(e.message ?? ""));

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const vakt = await kravRoll(ADMIN_ROLLER);
  if (!vakt.ok) return vakt.res;
  const maskinId = url.searchParams.get("maskin_id");
  if (!maskinId) return NextResponse.json({ ok: false, error: "maskin_id krävs" }, { status: 400 });

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const tomt = (extra: Partial<GreppResp>): GreppResp => ({
    ok: true, maskin_id: maskinId, tillganglig: true, rader: [], kvar: 0, fel: [], stammarTotalt: 0, stammarRaknade: 0, ...extra,
  });

  const status = await supabase.rpc("kalibrering_grepp_status", { p_maskin: maskinId });
  if (status.error) {
    if (funktionSaknas(status.error)) return NextResponse.json(tomt({ tillganglig: false, orsak: "migration" }));
    return NextResponse.json({ ok: false, error: `status: ${status.error.message}` }, { status: 500 });
  }
  const objekt = (status.data ?? []) as StatusRad[];

  // Räkna om de objekt som inte är aktuella — det största först, så en tidsbudget som tar slut lämnar de små (snabba) till nästa fråga.
  const gamla = objekt.filter(o => !o.aktuell).sort((a, b) => b.antal_stammar - a.antal_stammar);
  const start = Date.now();
  const fel: string[] = [];
  let klara = 0;
  for (const o of gamla) {
    if (Date.now() - start > BUDGET_MS) break;
    const r = await supabase.rpc("kalibrering_grepp_rakna", { p_maskin: maskinId, p_objekt: o.objekt_id });
    if (r.error) fel.push(o.objekt_id); else klara++;
  }
  const kvar = gamla.length - klara - fel.length;

  const sam = await supabase.rpc("kalibrering_grepp_sammanstall", { p_maskin: maskinId });
  if (sam.error) return NextResponse.json({ ok: false, error: `sammanstall: ${sam.error.message}` }, { status: 500 });
  const rader: GreppRad[] = ((sam.data ?? []) as SammanstallRad[]).map(r => ({
    manad: r.manad, tradslag: r.tradslag, klass: r.klass, stammar: Number(r.stammar), steg: Number(r.steg), still: Number(r.still), summaAndel: Number(r.summa_andel),
  }));

  // Stammarna som gick att placera mot de som finns: ett objekt som fick räknas om har nya siffror, de övriga de gamla — summan visar täckningen.
  const nyStatus = klara > 0 ? await supabase.rpc("kalibrering_grepp_status", { p_maskin: maskinId }) : status;
  const sista = ((nyStatus.error ? objekt : nyStatus.data) ?? []) as StatusRad[];
  return NextResponse.json(tomt({
    rader, kvar, fel,
    stammarTotalt: sista.reduce((a, o) => a + o.antal_stammar, 0),
    stammarRaknade: sista.reduce((a, o) => a + o.antal_raknade, 0),
  }));
}
