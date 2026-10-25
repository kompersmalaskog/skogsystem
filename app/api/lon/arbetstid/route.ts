import { NextRequest, NextResponse } from "next/server";
import { serverSupabase } from "@/lib/lonesystem/server";
import { kravRoll, ADMIN_ROLLER } from "@/lib/auth/server";
import { beraknaArsovertid } from "@/lib/lonesystem/arsovertid";
import { byggArbetstid, dataFranDatum, GRANSER, type ArbetstidDag, type ArbetstidExtra, type ArbetstidFlytt } from "@/lib/arbetstidsgranser";
import { ymdLokal } from "@/lib/datumLokal";
import { hamtaFranvaro } from "@/lib/franvaro";
import { allaRader } from "@/lib/lonesystem/allaRader";
import type { VilaTrosklar } from "@/lib/vilobrott";

export const dynamic = "force-dynamic";

/**
 * GET /api/lon/arbetstid
 * Lagkontroll för arbetstid (lib/arbetstidsgranser): sex gränser per förare, räknade t.o.m. i dag. admin.
 * Övertiden är samma beräkning som årsövertiden (beraknaArsovertid, månadsregeln = lönens; utjämningsmånader som avtalets genomsnitt); snitt och vila ur samma
 * rader. Läsningen är PAGINERAD (lib/lonesystem/allaRader) — PostgREST svarar högst 1000 rader per anrop, och 12 förare × ett halvår är mer än så.
 * Maskinflyttens körtid (flyttdag.total_tid_min, mätt starttid → "Kör hem") räknas i gränserna 4–6 — bara här, lönen läser den inte.
 * Läsfel som påverkar talen blir `varningar` (aldrig "ingen gräns nådd"); fel på själva arbetstiden är ett 500.
 */

const plusEnDag = (s: string, n: number) => { const [y, m, d] = s.split("-").map(Number); const x = new Date(Date.UTC(y, m - 1, d + n)); return x.toISOString().slice(0, 10); };

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

    const nu = new Date();
    const [medRes0, avtalRes, utjRes, dagar, extra, flyttRes] = await Promise.all([
      supabase.from("medarbetare").select("id, namn, foretagsledare, anstallningsdatum").order("namn"),
      supabase.from("gs_avtal")
        .select("max_overtid_ar_h, helglon_dagar, ordinarie_vecka_h, dygnsvila_krav_h, dygnsvila_varning_h, veckovila_krav_h, veckovila_fonster_dagar, kompensation_deadline_dagar")
        .order("giltigt_fran", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("utjamningsperiod").select("startdatum, slutdatum, medarbetare_id, anteckning")
        .lte("startdatum", tomDatum).gte("slutdatum", `${ar}-01-01`).order("startdatum"),
      allaRader<ArbetstidDag & { medarbetare_id: string; dagtyp?: string | null }>(() =>
        supabase.from("arbetsdag").select("medarbetare_id, datum, arbetad_min, dagtyp, start_tid, slut_tid").gte("datum", fran).lte("datum", tomDatum)),
      allaRader<ArbetstidExtra & { medarbetare_id: string }>(() =>
        supabase.from("extra_tid").select("medarbetare_id, datum, minuter, start_tid, slut_tid, aktivitet_typ").gte("datum", fran).lte("datum", tomDatum)),
      // flyttdag.starttid är timestamptz: en dags marginal åt båda håll, lib/arbetstidsgranser sorterar på LOKALT datum.
      allaRader<ArbetstidFlytt & { medarbetare_id: string | null; forare: string | null }>(() =>
        supabase.from("flyttdag").select("medarbetare_id, forare, starttid, sluttid, total_tid_min").gte("starttid", `${plusEnDag(fran, -1)}T00:00:00Z`).lte("starttid", `${plusEnDag(tomDatum, 1)}T23:59:59Z`))
        .then(rader => ({ rader, fel: null as string | null }), (e: any) => ({ rader: [] as (ArbetstidFlytt & { medarbetare_id: string | null; forare: string | null })[], fel: String(e?.message || e) })),
    ]);
    // Maskinflytten är ett tillägg till arbetstiden, inte grunden: går den inte att läsa visas kortet ändå, med en varning.
    if (flyttRes.fel) varningar.push(`Kunde inte läsa maskinflytten (flyttdag: ${flyttRes.fel}) — flyttdagarna ingår inte, och arbetstid och vila kan vara för låga.`);
    const flyttRader = flyttRes.rader;
    // Kolumnen foretagsledare kommer med migrationen 20261013155407. Före den kör kortet ändå, utan delägarundantag, och säger det.
    let medRes: { data: any[] | null; error: any } = medRes0 as any;
    if (medRes0.error && /foretagsledare/i.test(String(medRes0.error.message || ""))) {
      varningar.push("Kolumnen medarbetare.foretagsledare finns inte än (migration 20261013155407_medarbetare_foretagsledare.sql är inte körd) — ingen person räknas som delägare, så delägare kan visas som gula eller röda.");
      medRes = await supabase.from("medarbetare").select("id, namn, anstallningsdatum").order("namn") as any;
    }
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

    // Flyttdagar utan medarbetare_id (kolumnen är nullbar): hör till en förare bara om namnet i `forare` är exakt ett medarbetarnamn.
    const namnTillId = new Map<string, string | null>();
    for (const m of (medRes.data || []) as any[]) {
      const k = String(m.namn || "").trim().toLowerCase();
      if (k) namnTillId.set(k, namnTillId.has(k) ? null : m.id);          // null = tvetydigt namn
    }
    let oplacerade = 0;
    const flyttPerMed = new Map<string, ArbetstidFlytt[]>();
    for (const r of flyttRader) {
      const id = r.medarbetare_id || namnTillId.get(String(r.forare || "").trim().toLowerCase()) || null;
      if (!id) { oplacerade++; continue; }
      if (!flyttPerMed.has(id)) flyttPerMed.set(id, []);
      flyttPerMed.get(id)!.push({ starttid: r.starttid, sluttid: r.sluttid, total_tid_min: r.total_tid_min });
    }
    // Bara företagsledare har kört lastbilen (alla flyttdagar med känd förare är deras): en flyttdag utan förare kan då bara
    // vara deras, och arbetstidslagen gäller inte dem — varningen vore brus utan åtgärd (prod 2026-10-25: 22 rundor som
    // cron-jobbet skapat utan förare, Martin 12 och Joacim 11 med). Kör en anställd förare lastbilen visas varningen igen.
    const ledare = new Set(((medRes.data || []) as any[]).filter(m => m.foretagsledare === true).map(m => m.id));
    const kandaForare = [...flyttPerMed.keys()];
    const baraLedareKor = kandaForare.length > 0 && kandaForare.every(id => ledare.has(id));
    if (oplacerade > 0 && !baraLedareKor) varningar.push(`${oplacerade} ${oplacerade === 1 ? "flyttdag kunde" : "flyttdagar kunde"} inte kopplas till en förare (saknar medarbetare och namnet matchar ingen) och ingår inte.`);

    const forare = (medRes.data || []).map((m: any) => {
      const sina = dagar.filter(d => d.medarbetare_id === m.id);
      const sinaExtra = extra.filter(e => e.medarbetare_id === m.id);
      const sinFlytt = flyttPerMed.get(m.id) || [];
      if (sina.length === 0 && sinaExtra.length === 0 && sinFlytt.length === 0) return null;
      const perioder = utjamning.filter(u => !u.medarbetare_id || u.medarbetare_id === m.id);
      const franvaro = franvaroRes.rader.filter(f => f.medarbetare_id === m.id);
      const arsovertid = beraknaArsovertid(sina, sinaExtra, ar, tomDatum, perioder, franvaro, { anstallningsdatum: m.anstallningsdatum ?? null, helglonNamn: avtal?.helglon_dagar ?? null, ordinarieVeckaH: avtal?.ordinarie_vecka_h ?? null });
      return byggArbetstid({ medarbetare_id: m.id, namn: m.namn || "Namnlös", tomDatum, arsovertid, dagar: sina, extra: sinaExtra, franvaro, trosklar, tak, flytt: sinFlytt, nu, foretagsledare: m.foretagsledare === true });
    }).filter(Boolean);

    return NextResponse.json({ ok: true, ar, tomDatum, forare, varningar });
  } catch (e: any) {
    return NextResponse.json({ ok: false, meddelande: e.message || String(e) }, { status: 500 });
  }
}
