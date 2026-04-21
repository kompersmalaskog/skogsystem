import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getFortnoxClient, serverSupabase } from "@/lib/lonesystem/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/fortnox/result-per-costcenter?fromdate=YYYY-MM-DD&todate=YYYY-MM-DD
 *
 * Admin-only. Aggregerar resultat per kostnadsställe från fortnox_voucher_rows
 * (cachad voucher-data, uppdateras nattligt via pg_cron → /api/fortnox/sync-vouchers).
 *
 * `/3/reports/result` finns inte i Fortnox REST API (returnerar 2000764
 * "No such route") så vi bygger rapporten själva från voucher-rader.
 *
 * Account-grupperingar (BAS 2023/2024):
 *   3xxx → intakter
 *   56xx → drivmedel (transportmedel)
 *   50-55xx + 57-59xx → drift_service (lokaler, reparation, ovriga externa)
 *   7xxx → loner (personalkostnader)
 *   4xxx/6xxx/8xxx → ovrigt
 */
export async function GET(req: NextRequest) {
  try {
    // ── Admin-check ──
    const cookieStore = await cookies();
    const authClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll(cs) { cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); },
        },
      },
    );
    const { data: { user } } = await authClient.auth.getUser();
    if (!user?.email) {
      return NextResponse.json({ ok: false, meddelande: "Ej inloggad" }, { status: 401 });
    }
    const { data: med } = await authClient
      .from("medarbetare")
      .select("roll")
      .eq("epost", user.email)
      .single();
    if (!med || (med.roll !== "admin" && med.roll !== "chef")) {
      return NextResponse.json({ ok: false, meddelande: "Kräver admin-roll" }, { status: 403 });
    }

    // ── Params ──
    const { searchParams } = new URL(req.url);
    const fromdate = searchParams.get("fromdate");
    const todate = searchParams.get("todate");
    if (!fromdate || !todate) {
      return NextResponse.json(
        { ok: false, meddelande: "fromdate och todate krävs (YYYY-MM-DD)" },
        { status: 400 },
      );
    }

    // ── Mappning + costcenters ──
    const supabase = serverSupabase();
    const [mapRes, maskinRes, ccRes, syncRes] = await Promise.all([
      supabase.from("maskin_kostnadsstalle").select("maskin_id, kostnadsstalle_kod"),
      supabase.from("dim_maskin").select("maskin_id, modell, maskin_typ"),
      // Fortnox costcenters är liten och statisk — vi kan kalla den direkt.
      (async () => {
        try {
          const client = (await getFortnoxClient()) as any;
          const r = await fetch("https://api.fortnox.se/3/costcenters", {
            headers: { Authorization: `Bearer ${client.accessToken}`, Accept: "application/json" },
            cache: "no-store",
          });
          if (!r.ok) return { data: [] as any[], error: `HTTP ${r.status}` };
          const body = await r.json();
          return { data: body?.CostCenters || [], error: null };
        } catch (e: any) {
          return { data: [] as any[], error: e?.message || String(e) };
        }
      })(),
      supabase.from("fortnox_sync_state").select("*").eq("id", 1).maybeSingle(),
    ]);
    const mappningar: { maskin_id: string; kostnadsstalle_kod: string }[] = mapRes.data || [];
    const maskinMap: Record<string, { modell: string | null; maskin_typ: string | null }> = {};
    for (const m of (maskinRes.data || [])) maskinMap[m.maskin_id] = m;
    const costCenters: { Code: string; Description?: string; Active?: boolean }[] = ccRes.data || [];
    const sync = syncRes.data;

    // ── Aggregera från cache ──
    const koder = mappningar.map(m => m.kostnadsstalle_kod);
    const { data: rader, error: radErr } = await supabase
      .from("fortnox_voucher_rows")
      .select("account, debit, credit, costcenter")
      .in("costcenter", koder.length ? koder : ["__ingen__"])
      .gte("transaction_date", fromdate)
      .lte("transaction_date", todate);
    if (radErr) {
      return NextResponse.json({ ok: false, meddelande: `Cache-läsning: ${radErr.message}` }, { status: 500 });
    }

    // Gruppera per (costcenter, account)
    type Summa = { sum: number };
    const perCC: Record<string, Record<string, Summa>> = {};
    for (const r of rader || []) {
      const cc = r.costcenter || "";
      if (!cc) continue;
      const acc = String(r.account || "").trim();
      if (!acc) continue;
      // Balans = credit - debit för intäktskonton (3xxx visas positivt),
      // debit - credit för kostnadskonton. Vi sparar båda och normaliserar
      // per kontoklass nedan.
      const netto = (Number(r.debit) || 0) - (Number(r.credit) || 0);
      if (!perCC[cc]) perCC[cc] = {};
      if (!perCC[cc][acc]) perCC[cc][acc] = { sum: 0 };
      perCC[cc][acc].sum += netto;
    }

    const maskiner: any[] = [];
    for (const m of mappningar) {
      const cc = costCenters.find(c => c.Code === m.kostnadsstalle_kod);
      const namnFort = cc?.Description || m.kostnadsstalle_kod;
      const maskinInfo = maskinMap[m.maskin_id];
      const accMap = perCC[m.kostnadsstalle_kod] || {};
      const kontoRader = Object.entries(accMap).map(([account, v]) => ({ account, sum: v.sum }));

      // Kategori-gruppering (BAS)
      let intakter = 0, drivmedel = 0, drift_service = 0, loner = 0, ovrigt = 0;
      for (const r of kontoRader) {
        const first = r.account.charAt(0);
        const two = r.account.slice(0, 2);
        // netto = debit - credit; intäktskonton (3xxx) är credit-saldo → netto är negativt
        if (first === "3") intakter += -r.sum;
        else if (two === "56") drivmedel += r.sum;
        else if (first === "5") drift_service += r.sum;
        else if (first === "7") loner += r.sum;
        else if (first === "4" || first === "6" || first === "8") ovrigt += r.sum;
      }
      const kostnader_total = drivmedel + drift_service + loner + ovrigt;
      const resultat = intakter - kostnader_total;

      maskiner.push({
        maskin_id: m.maskin_id,
        maskin_namn: maskinInfo?.modell || m.maskin_id,
        maskin_typ: maskinInfo?.maskin_typ || null,
        kostnadsstalle: { kod: m.kostnadsstalle_kod, namn: namnFort },
        ok: true,
        intakter,
        kostnader: { drivmedel, drift_service, loner, ovrigt, total: kostnader_total },
        resultat,
        konton: kontoRader,
      });
    }

    return NextResponse.json({
      ok: true,
      period: { fromdate, todate },
      kostnadsstallen: costCenters.map(c => ({ kod: c.Code, namn: c.Description, aktiv: c.Active })),
      maskiner,
      cache_status: sync
        ? {
            senaste_sync: sync.last_sync_at,
            senaste_lyckad: sync.last_success_at,
            status: sync.last_status,
            antal_verifikat: sync.voucher_count,
            antal_rader: sync.rows_count,
            fel: sync.last_error,
          }
        : null,
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        meddelande: e?.message || String(e),
        stack: e?.stack ? String(e.stack).split("\n").slice(0, 8) : null,
      },
      { status: 500 },
    );
  }
}
