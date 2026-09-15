import { NextRequest, NextResponse } from "next/server";
import { serverSupabase } from "@/lib/lonesystem/server";
import { kravRoll, ADMIN_ROLLER } from "@/lib/auth/server";
import { beraknaArsovertid, OVERTID_MODELLER } from "@/lib/lonesystem/arsovertid";
import { ymdLokal } from "@/lib/datumLokal";

export const dynamic = "force-dynamic";

/**
 * GET /api/lon/arsovertid?ar=2026
 * Årets övertid per medarbetare enligt TRE modeller (lib/lonesystem/arsovertid)
 * mot avtalets tak (gs_avtal.max_overtid_ar_h). Admin/chef. Ingen modell är
 * vald — det är en avtalsfråga; kortet i Lön-fliken visar alla tre.
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
    const [medRes, arbRes, extraRes, avtalRes] = await Promise.all([
      supabase.from("medarbetare").select("id, namn").order("namn"),
      supabase.from("arbetsdag").select("medarbetare_id, datum, arbetad_min, dagtyp, start_tid").gte("datum", `${ar}-01-01`).lte("datum", tomDatum),
      supabase.from("extra_tid").select("medarbetare_id, datum, minuter").gte("datum", `${ar}-01-01`).lte("datum", tomDatum),
      supabase.from("gs_avtal").select("max_overtid_ar_h").order("giltigt_fran", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (medRes.error) throw medRes.error;
    if (arbRes.error) throw arbRes.error;
    if (extraRes.error) throw extraRes.error;
    const tak = Number(avtalRes.data?.max_overtid_ar_h ?? 250);
    const perMed = (medRes.data || []).map((m: any) => {
      const dagar = (arbRes.data || []).filter((d: any) => d.medarbetare_id === m.id);
      const extra = (extraRes.data || []).filter((e: any) => e.medarbetare_id === m.id);
      if (dagar.length === 0 && extra.length === 0) return null;
      return { medarbetare_id: m.id, namn: m.namn, ...beraknaArsovertid(dagar, extra, ar, tomDatum) };
    }).filter(Boolean);
    return NextResponse.json({ ok: true, ar, tomDatum, tak, modeller: OVERTID_MODELLER, medarbetare: perMed });
  } catch (e: any) {
    return NextResponse.json({ ok: false, meddelande: e.message || String(e) }, { status: 500 });
  }
}
