import { NextRequest, NextResponse } from "next/server";
import { serverSupabase } from "@/lib/lonesystem/server";
import { kravRoll, ADMIN_ROLLER } from "@/lib/auth/server";
import { beraknaArsovertid, OVERTID_MODELLER } from "@/lib/lonesystem/arsovertid";
import { ymdLokal } from "@/lib/datumLokal";

export const dynamic = "force-dynamic";

/**
 * GET /api/lon/arsovertid?ar=2026
 * Årets övertid per medarbetare enligt FYRA modeller (lib/lonesystem/arsovertid)
 * mot avtalets tak (gs_avtal.max_overtid_ar_h). Admin/chef. Den fjärde
 * (genomsnitt, avtalets §5 mom 2) läser markerade utjämningsperioder ur
 * tabellen utjamningsperiod; saknas tabellen räknas allt som antagna block
 * och svaret säger det (`utjamning_fel`).
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
    const [medRes, arbRes, extraRes, avtalRes, utjRes] = await Promise.all([
      supabase.from("medarbetare").select("id, namn").order("namn"),
      supabase.from("arbetsdag").select("medarbetare_id, datum, arbetad_min, dagtyp, start_tid").gte("datum", `${ar}-01-01`).lte("datum", tomDatum),
      supabase.from("extra_tid").select("medarbetare_id, datum, minuter").gte("datum", `${ar}-01-01`).lte("datum", tomDatum),
      supabase.from("gs_avtal").select("max_overtid_ar_h").order("giltigt_fran", { ascending: false }).limit(1).maybeSingle(),
      // Perioder som överlappar året
      supabase.from("utjamningsperiod").select("startdatum, slutdatum, medarbetare_id, anteckning")
        .lte("startdatum", tomDatum).gte("slutdatum", `${ar}-01-01`).order("startdatum"),
    ]);
    if (medRes.error) throw medRes.error;
    if (arbRes.error) throw arbRes.error;
    if (extraRes.error) throw extraRes.error;
    const tak = Number(avtalRes.data?.max_overtid_ar_h ?? 250);
    const utjamning: any[] = utjRes.error ? [] : (utjRes.data || []);
    const perMed = (medRes.data || []).map((m: any) => {
      const dagar = (arbRes.data || []).filter((d: any) => d.medarbetare_id === m.id);
      const extra = (extraRes.data || []).filter((e: any) => e.medarbetare_id === m.id);
      if (dagar.length === 0 && extra.length === 0) return null;
      const perioder = utjamning.filter(u => !u.medarbetare_id || u.medarbetare_id === m.id);
      return { medarbetare_id: m.id, namn: m.namn, ...beraknaArsovertid(dagar, extra, ar, tomDatum, perioder) };
    }).filter(Boolean);
    return NextResponse.json({
      ok: true, ar, tomDatum, tak, modeller: OVERTID_MODELLER, medarbetare: perMed,
      utjamning,
      utjamning_fel: utjRes.error ? (utjRes.error.message || String(utjRes.error)) : null,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, meddelande: e.message || String(e) }, { status: 500 });
  }
}
