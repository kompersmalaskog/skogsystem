import { NextRequest, NextResponse } from "next/server";
import { serverSupabase } from "@/lib/lonesystem/server";
import { kravRoll, ADMIN_ROLLER } from "@/lib/auth/server";
import { beraknaArsovertid } from "@/lib/lonesystem/arsovertid";
import { byggArbetstid, dataFranDatum, GRANSER, type ArbetstidDag, type ArbetstidExtra } from "@/lib/arbetstidsgranser";
import { ymdLokal } from "@/lib/datumLokal";
import { hamtaFranvaro } from "@/lib/franvaro";
import type { VilaTrosklar } from "@/lib/vilobrott";

export const dynamic = "force-dynamic";

/**
 * GET /api/lon/arbetstid
 * Lagkontroll för arbetstid (lib/arbetstidsgranser): sex gränser per förare, räknade t.o.m. i dag. admin.
 * Övertiden är samma beräkning som årsövertiden (beraknaArsovertid, avtalets genomsnittsmodell); snitt och vila ur samma
 * rader. Läsningen är PAGINERAD — PostgREST svarar högst 1000 rader per anrop, och 12 förare × ett halvår är mer än så.
 * Läsfel som påverkar talen blir `varningar` (aldrig "ingen gräns nådd"); fel på själva arbetstiden är ett 500.
 */

const SIDA = 1000;

async function allaRader<T>(bygg: () => any): Promise<T[]> {
  const ut: T[] = [];
  for (let fran = 0; ; fran += SIDA) {
    const r = await bygg().order("id", { ascending: true }).range(fran, fran + SIDA - 1);
    if (r.error) throw r.error;
    ut.push(...((r.data || []) as T[]));
    if (!r.data || r.data.length < SIDA) break;
  }
  return ut;
}

/** Lagens värden — används bara när avtalsraden inte går att läsa, och då med en varning. */
const LAGENS_VILA: VilaTrosklar = {
  dygnsvila_krav_h: GRANSER.dygnsvilaH, dygnsvila_varning_h: GRANSER.dygnsvilaH + 1,
  veckovila_krav_h: GRANSER.veckovilaH, veckovila_fonster_dagar: 7, kompensation_deadline_dagar: 14,
};

export async function GET(_req: NextRequest) {
  const vakt = await kravRoll(ADMIN_ROLLER);
  if (!vakt.ok) return vakt.res;
  try {
    const tomDatum = ymdLokal(new Date());
    const ar = Number(tomDatum.slice(0, 4));
    const fran = dataFranDatum(tomDatum);
    const supabase = serverSupabase();
    const varningar: string[] = [];

    const franvaroRes = await hamtaFranvaro(supabase, { fran: [fran, `${ar - 1}-12-22`].sort()[0], till: tomDatum });
    if (franvaroRes.fel) varningar.push(`Kunde inte läsa frånvaron (${franvaroRes.fel}) — övertid och 48-timmarssnittet räknas utan den och kan vara för låga.`);

    const [medRes, avtalRes, utjRes, dagar, extra] = await Promise.all([
      supabase.from("medarbetare").select("id, namn").order("namn"),
      supabase.from("gs_avtal")
        .select("max_overtid_ar_h, dygnsvila_krav_h, dygnsvila_varning_h, veckovila_krav_h, veckovila_fonster_dagar, kompensation_deadline_dagar")
        .order("giltigt_fran", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("utjamningsperiod").select("startdatum, slutdatum, medarbetare_id, anteckning")
        .lte("startdatum", tomDatum).gte("slutdatum", `${ar}-01-01`).order("startdatum"),
      allaRader<ArbetstidDag & { medarbetare_id: string; dagtyp?: string | null }>(() =>
        supabase.from("arbetsdag").select("medarbetare_id, datum, arbetad_min, dagtyp, start_tid, slut_tid").gte("datum", fran).lte("datum", tomDatum)),
      allaRader<ArbetstidExtra & { medarbetare_id: string }>(() =>
        supabase.from("extra_tid").select("medarbetare_id, datum, minuter, start_tid, slut_tid, aktivitet_typ").gte("datum", fran).lte("datum", tomDatum)),
    ]);
    if (medRes.error) throw medRes.error;

    const avtal: any = avtalRes.error ? null : avtalRes.data;
    const harVila = !!avtal && ["dygnsvila_krav_h", "dygnsvila_varning_h", "veckovila_krav_h", "veckovila_fonster_dagar", "kompensation_deadline_dagar"].every(k => Number.isFinite(Number(avtal[k])) && avtal[k] != null);
    if (!harVila) varningar.push(`Kunde inte läsa avtalets vilokrav (gs_avtal${avtalRes.error ? `: ${avtalRes.error.message}` : ""}) — lagens värden används: 11 tim dygnsvila, 36 tim veckovila.`);
    const trosklar: VilaTrosklar = harVila
      ? {
          dygnsvila_krav_h: Number(avtal.dygnsvila_krav_h), dygnsvila_varning_h: Number(avtal.dygnsvila_varning_h), veckovila_krav_h: Number(avtal.veckovila_krav_h),
          veckovila_fonster_dagar: Number(avtal.veckovila_fonster_dagar), kompensation_deadline_dagar: Number(avtal.kompensation_deadline_dagar),
        }
      : LAGENS_VILA;
    const tak = Number(avtal?.max_overtid_ar_h ?? GRANSER.allmanOvertidAr);

    const utjamning: any[] = utjRes.error ? [] : (utjRes.data || []);
    if (utjRes.error) varningar.push(`Kunde inte läsa utjämningsperioderna (${utjRes.error.message}) — all övertid räknas som fastställd, och en månad kan visas röd i onödan.`);

    const forare = (medRes.data || []).map((m: any) => {
      const sina = dagar.filter(d => d.medarbetare_id === m.id);
      const sinaExtra = extra.filter(e => e.medarbetare_id === m.id);
      if (sina.length === 0 && sinaExtra.length === 0) return null;
      const perioder = utjamning.filter(u => !u.medarbetare_id || u.medarbetare_id === m.id);
      const franvaro = franvaroRes.rader.filter(f => f.medarbetare_id === m.id);
      const arsovertid = beraknaArsovertid(sina, sinaExtra, ar, tomDatum, perioder, franvaro);
      return byggArbetstid({ medarbetare_id: m.id, namn: m.namn || "Namnlös", tomDatum, arsovertid, dagar: sina, extra: sinaExtra, franvaro, trosklar, tak });
    }).filter(Boolean);

    return NextResponse.json({ ok: true, ar, tomDatum, forare, varningar });
  } catch (e: any) {
    return NextResponse.json({ ok: false, meddelande: e.message || String(e) }, { status: 500 });
  }
}
