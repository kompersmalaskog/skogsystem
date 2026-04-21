import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getFortnoxClient, serverSupabase } from "@/lib/lonesystem/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/fortnox/result-per-costcenter?fromdate=YYYY-MM-DD&todate=YYYY-MM-DD
 *
 * Admin-only. Hämtar:
 *   1) GET /3/costcenters  — lista kostnadsställen (namn + kod)
 *   2) maskin_kostnadsstalle från Supabase — mappning maskin_id → kostnadsstalle_kod
 *   3) För varje mappad maskin: GET /3/reports/result?costcenter=KOD&fromdate=&todate=
 *
 * Account-grupperingar (enligt BAS 2023/2024):
 *   3xxx → intakter
 *   56xx → drivmedel (transportmedel)
 *   50-55xx + 57-59xx → drift_service (lokaler, reparation, ovriga externa)
 *   7xxx → loner (personalkostnader)
 *   ovrigt = alla andra 4-8xxx
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

    // ── Fortnox + mappning ──
    const supabase = serverSupabase();
    const [mapRes, maskinRes] = await Promise.all([
      supabase.from("maskin_kostnadsstalle").select("maskin_id, kostnadsstalle_kod"),
      supabase.from("dim_maskin").select("maskin_id, modell, maskin_typ"),
    ]);
    const mappningar: { maskin_id: string; kostnadsstalle_kod: string }[] = mapRes.data || [];
    const maskinMap: Record<string, { modell: string | null; maskin_typ: string | null }> = {};
    for (const m of (maskinRes.data || [])) maskinMap[m.maskin_id] = m;

    const client = (await getFortnoxClient()) as any;
    const accessToken: string = client.accessToken;

    // Fortnox helper — retry once på 401 (token refresh hanteras av getFortnoxClient men defensivt)
    async function fortnoxGet(path: string): Promise<{ ok: boolean; status: number; body: any; rawText?: string }> {
      const r = await fetch(`https://api.fortnox.se${path}`, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
        cache: "no-store",
      });
      const text = await r.text();
      let body: any;
      try { body = JSON.parse(text); } catch { body = null; }
      return { ok: r.ok, status: r.status, body, rawText: body == null ? text.slice(0, 500) : undefined };
    }

    // 1) Kostnadsställen
    const ccRes = await fortnoxGet("/3/costcenters");
    if (!ccRes.ok) {
      return NextResponse.json(
        {
          ok: false,
          meddelande: `Fortnox /3/costcenters: HTTP ${ccRes.status}`,
          detalj: ccRes.body || ccRes.rawText,
        },
        { status: 502 },
      );
    }
    // Fortnox svarar typiskt { CostCenters: [{ Code, Description, Active }] }
    const costCenters: { Code: string; Description?: string; Active?: boolean }[] =
      ccRes.body?.CostCenters || ccRes.body?.costcenters || [];

    // 2) Resultatrapport per mappad maskin
    const qs = `fromdate=${encodeURIComponent(fromdate)}&todate=${encodeURIComponent(todate)}`;
    const maskiner: any[] = [];

    for (const m of mappningar) {
      const cc = costCenters.find(c => c.Code === m.kostnadsstalle_kod);
      const namnFort = cc?.Description || m.kostnadsstalle_kod;
      const maskinInfo = maskinMap[m.maskin_id];

      const rRes = await fortnoxGet(`/3/reports/result?costcenter=${encodeURIComponent(m.kostnadsstalle_kod)}&${qs}`);

      if (!rRes.ok) {
        maskiner.push({
          maskin_id: m.maskin_id,
          maskin_namn: maskinInfo?.modell || m.maskin_id,
          maskin_typ: maskinInfo?.maskin_typ || null,
          kostnadsstalle: { kod: m.kostnadsstalle_kod, namn: namnFort },
          ok: false,
          fel: `Fortnox HTTP ${rRes.status}`,
          detalj: rRes.body || rRes.rawText,
        });
        continue;
      }

      // Fortnox /reports/result-respons är inte offentligt dokumenterad — vi
      // parsar defensivt. Ofta finns { Report: { Rows: [{ Account, Sum }] } }
      // eller { Accounts: [{ Number, Balance }] }. Vi normaliserar.
      const rader: { account: string; sum: number }[] = [];
      const body = rRes.body || {};
      const candidates = [
        body?.Report?.Rows,
        body?.Result?.Rows,
        body?.Rows,
        body?.Accounts,
        body?.ReportRows,
      ];
      const rowList = candidates.find(x => Array.isArray(x)) || [];
      for (const row of rowList) {
        const acc = String(row.Account ?? row.AccountNumber ?? row.Number ?? "").trim();
        const sum = Number(row.Sum ?? row.Balance ?? row.Amount ?? 0);
        if (acc) rader.push({ account: acc, sum });
      }

      // Kategori-gruppering
      let intakter = 0, drivmedel = 0, drift_service = 0, loner = 0, ovrigt = 0;
      for (const r of rader) {
        const first = r.account.charAt(0);
        const two = r.account.slice(0, 2);
        if (first === "3") intakter += -r.sum; // intäkter står med negativt tecken i PL
        else if (two === "56") drivmedel += r.sum;
        else if (first === "5") drift_service += r.sum;
        else if (first === "7") loner += r.sum;
        else if (first === "4" || first === "6" || first === "8") ovrigt += r.sum;
      }
      // Om belopp kom in som redan positiva (olika varianter hos Fortnox), justera tecken
      if (intakter < 0) intakter = -intakter;
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
        konton: rader, // raw för drill-down
      });
    }

    return NextResponse.json({
      ok: true,
      period: { fromdate, todate },
      kostnadsstallen: costCenters.map(c => ({ kod: c.Code, namn: c.Description, aktiv: c.Active })),
      maskiner,
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
