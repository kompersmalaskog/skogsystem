import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getFortnoxClient, hämtaKoppling, serverSupabase } from "@/lib/lonesystem/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/fortnox/probe?costcenter=M13
 *
 * Debug-endpoint. Admin-only. Testar systematiskt flera Fortnox-endpoints
 * och returnerar status + råbody för varje så vi kan se exakt vad Fortnox
 * svarar. Används när /api/fortnox/result-per-costcenter ger 502.
 *
 * Plocka ut costcenter-koden från query eller använd första mappade.
 */
export async function GET(req: NextRequest) {
  try {
    // Admin-check
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
    if (!user?.email) return NextResponse.json({ ok: false, meddelande: "Ej inloggad" }, { status: 401 });
    const { data: med } = await authClient.from("medarbetare").select("roll").eq("epost", user.email).single();
    if (!med || (med.roll !== "admin" && med.roll !== "chef")) {
      return NextResponse.json({ ok: false, meddelande: "Kräver admin-roll" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    let cc = searchParams.get("costcenter") || "";
    const customYear = searchParams.get("year");

    // Token-status
    const koppling = await hämtaKoppling();
    const tokenInfo = {
      finns_rad: !!koppling,
      system_typ: koppling?.system_typ || null,
      aktiv: koppling?.aktiv ?? null,
      har_access_token: !!koppling?.access_token,
      har_refresh_token: !!koppling?.refresh_token,
      token_utgar: koppling?.token_utgar || null,
      token_utgar_om_sek: koppling?.token_utgar
        ? Math.round((new Date(koppling.token_utgar).getTime() - Date.now()) / 1000)
        : null,
      senast_synkad: koppling?.senast_synkad || null,
    };

    let fortnoxKlar = false;
    let accessTokenLen = 0;
    let accessTokenPrefix = "";
    try {
      const client = (await getFortnoxClient()) as any;
      fortnoxKlar = true;
      accessTokenLen = String(client.accessToken).length;
      accessTokenPrefix = String(client.accessToken).slice(0, 8);
    } catch (e: any) {
      return NextResponse.json({
        ok: false,
        steg: "getFortnoxClient",
        meddelande: e?.message || String(e),
        token: tokenInfo,
      }, { status: 500 });
    }

    const client = (await getFortnoxClient()) as any;
    const accessToken: string = client.accessToken;

    async function tryCall(path: string): Promise<{ path: string; status: number; ok: boolean; headers: Record<string, string>; body: any }> {
      const url = `https://api.fortnox.se${path}`;
      const r = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
        cache: "no-store",
      });
      const hdrs: Record<string, string> = {};
      r.headers.forEach((v, k) => { hdrs[k] = v; });
      const text = await r.text();
      let body: any;
      try { body = JSON.parse(text); } catch { body = text.slice(0, 2000); }
      return { path, status: r.status, ok: r.ok, headers: hdrs, body };
    }

    // Fyll i cc från mappning om inte angivet
    if (!cc) {
      const supabase = serverSupabase();
      const { data } = await supabase.from("maskin_kostnadsstalle").select("kostnadsstalle_kod").limit(1);
      cc = data?.[0]?.kostnadsstalle_kod || "M1";
    }

    const calls: any[] = [];

    // 1. /3/companyinformation — alltid tillgänglig, verifierar token
    calls.push({ label: "companyinformation (token-test)", ...(await tryCall("/3/companyinformation")) });

    // 2. /3/costcenters — används av resultat-route
    calls.push({ label: "costcenters", ...(await tryCall("/3/costcenters")) });

    // 3. /3/financialyears — behövs för ID till reports?
    const fyRes = await tryCall("/3/financialyears");
    calls.push({ label: "financialyears", ...fyRes });

    // Hitta senaste financial year-id
    let fyId: string | number | null = null;
    try {
      const fyList = (fyRes.body as any)?.FinancialYears || [];
      if (Array.isArray(fyList) && fyList.length) {
        const sorted = [...fyList].sort((a: any, b: any) => String(b.ToDate).localeCompare(String(a.ToDate)));
        fyId = sorted[0]?.Id ?? sorted[0]?.id ?? null;
      }
    } catch {}

    // 4-7. Olika varianter av resultatrapport-endpoint
    const y = customYear || new Date().getFullYear().toString();
    const variants = [
      `/3/reports/result?costcenter=${encodeURIComponent(cc)}&fromdate=${y}-01-01&todate=${y}-12-31`,
      fyId != null ? `/3/reports/result?financialyear=${encodeURIComponent(String(fyId))}&costcenter=${encodeURIComponent(cc)}` : null,
      fyId != null ? `/3/reports/result?financialyear=${encodeURIComponent(String(fyId))}` : null,
      `/3/reports/result`,
      `/3/financialyears/${fyId ?? 1}/accountingperiods`,
      // Voucher-baserad fallback (det vi sannolikt kommer behöva använda)
      `/3/vouchers?financialyear=${fyId ?? ""}&limit=1`,
    ].filter(Boolean) as string[];

    for (const path of variants) {
      calls.push({ label: `variant: ${path}`, ...(await tryCall(path)) });
    }

    return NextResponse.json({
      ok: true,
      token: { ...tokenInfo, fortnox_klar: fortnoxKlar, access_token_len: accessTokenLen, access_token_prefix: accessTokenPrefix },
      kostnadsstalle_testat: cc,
      financialyear_id: fyId,
      anrop: calls,
      tips: "Se vilket 'label' som returnerar 200. Om 'companyinformation' ger 401 → token-refresh trasig. Om 'costcenters' ger 404 → fel scope. Om /reports/result alltid ger 404 → endpointen finns inte, gå över till voucher-aggregering.",
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, meddelande: e?.message || String(e), stack: e?.stack ? String(e.stack).split("\n").slice(0, 8) : null },
      { status: 500 },
    );
  }
}
