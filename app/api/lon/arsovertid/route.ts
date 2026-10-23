import { NextRequest, NextResponse } from "next/server";
import { serverSupabase } from "@/lib/lonesystem/server";
import { kravRoll, ADMIN_ROLLER } from "@/lib/auth/server";
import { beraknaArsovertid, overtidPerManad, OVERTID_MODELLER } from "@/lib/lonesystem/arsovertid";
import { ymdLokal } from "@/lib/datumLokal";
import { hamtaFranvaro } from "@/lib/franvaro";
import { allaRader } from "@/lib/lonesystem/allaRader";

export const dynamic = "force-dynamic";

/**
 * GET /api/lon/arsovertid?ar=2026
 * Årets övertid per medarbetare enligt FEM modeller (lib/lonesystem/arsovertid)
 * mot avtalets tak (gs_avtal.max_overtid_ar_h). admin. Lagkontrollens tal är
 * `modeller.manad` (månadsregeln, samma som lönen; `manader` månad för månad och
 * `per_manad` = fördelningen som summerar till årets tal). Utjämningsmånaderna
 * och `genomsnitt` (avtalets §5 mom 2) läser markerade utjämningsperioder ur
 * tabellen utjamningsperiod; saknas tabellen räknas allt som antagna block
 * och svaret säger det (`utjamning_fel`). Basen per vecka är 40 tim minus
 * frånvaro (ledighet_ansokningar via lib/franvaro) och röda vardagar; kan
 * frånvaron inte läsas räknas utan den och svaret säger det (`franvaro_fel`):
 * basen drogs inte för frånvaro, så övertiden blir för LÅG, aldrig "ingen frånvaro".
 *
 * Årets arbetsdag och extra_tid läses PAGINERAT (lib/lonesystem/allaRader): PostgREST svarar högst 1000 rader per anrop, och en läsning
 * utan range tappar tyst allt efter rad 1000 — för låg övertid utan något fel. Prod hade 823 arbetsdag-rader 2026-10-13.
 */
export async function GET(req: NextRequest) {
  const vakt = await kravRoll(ADMIN_ROLLER);
  if (!vakt.ok) return vakt.res;
  try {
    const nu = new Date();
    const arParam = Number(req.nextUrl.searchParams.get("ar"));
    const ar = Number.isInteger(arParam) && arParam > 2000 ? arParam : nu.getFullYear();
    const tomDatum = ar === nu.getFullYear() ? ymdLokal(nu) : `${ar}-12-31`;
    const supabase = serverSupabase();
    // Frånvaro från måndagen i ISO-vecka 1 (kan vara i december året före) t.o.m. idag. Alla förare i en läsning.
    const franvaroRes = await hamtaFranvaro(supabase, { fran: `${ar - 1}-12-22`, till: tomDatum });
    const [medRes, arbetsdagar, extraRader, avtalRes, utjRes] = await Promise.all([
      supabase.from("medarbetare").select("id, namn, anstallningsdatum, foretagsledare").order("namn"),
      allaRader<any>(() => supabase.from("arbetsdag").select("medarbetare_id, datum, arbetad_min, dagtyp, start_tid").gte("datum", `${ar}-01-01`).lte("datum", tomDatum)),
      allaRader<any>(() => supabase.from("extra_tid").select("medarbetare_id, datum, minuter").gte("datum", `${ar}-01-01`).lte("datum", tomDatum)),
      supabase.from("gs_avtal").select("max_overtid_ar_h, helglon_dagar, ordinarie_vecka_h").order("giltigt_fran", { ascending: false }).limit(1).maybeSingle(),
      // Perioder som överlappar året
      supabase.from("utjamningsperiod").select("startdatum, slutdatum, medarbetare_id, anteckning")
        .lte("startdatum", tomDatum).gte("slutdatum", `${ar}-01-01`).order("startdatum"),
    ]);
    if (medRes.error) throw medRes.error;
    const tak = Number(avtalRes.data?.max_overtid_ar_h ?? 250);
    const utjamning: any[] = utjRes.error ? [] : (utjRes.data || []);
    const perMed = (medRes.data || []).map((m: any) => {
      const dagar = arbetsdagar.filter((d: any) => d.medarbetare_id === m.id);
      const extra = extraRader.filter((e: any) => e.medarbetare_id === m.id);
      if (dagar.length === 0 && extra.length === 0) return null;
      const perioder = utjamning.filter(u => !u.medarbetare_id || u.medarbetare_id === m.id);
      const franvaro = franvaroRes.rader.filter(f => f.medarbetare_id === m.id);
      const a = beraknaArsovertid(dagar, extra, ar, tomDatum, perioder, franvaro, {
        anstallningsdatum: m.anstallningsdatum ?? null, helglonNamn: avtalRes.data?.helglon_dagar ?? null, ordinarieVeckaH: avtalRes.data?.ordinarie_vecka_h ?? null,
      });
      return { medarbetare_id: m.id, namn: m.namn, foretagsledare: m.foretagsledare === true, ...a, per_manad: overtidPerManad(a) };
    }).filter(Boolean);
    return NextResponse.json({
      ok: true, ar, tomDatum, tak, modeller: OVERTID_MODELLER, medarbetare: perMed,
      utjamning,
      utjamning_fel: utjRes.error ? (utjRes.error.message || String(utjRes.error)) : null,
      franvaro_fel: franvaroRes.fel,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, meddelande: e.message || String(e) }, { status: 500 });
  }
}
