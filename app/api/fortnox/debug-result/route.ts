import { NextRequest, NextResponse } from "next/server";
import { decrypt } from "@/lib/lonesystem/crypto";
import { serverSupabase } from "@/lib/lonesystem/server";

// Debug: utreder varför /reports/result ger 400. Skyddad med ?key. Ta bort när klart.
const DEBUG_KEY = "skogsystem-debug";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("key") !== DEBUG_KEY) {
    return NextResponse.json({ ok: false, error: "Ogiltig nyckel" }, { status: 401 });
  }
  const fromdate = url.searchParams.get("fromdate") || "2026-01-01";
  const todate = url.searchParams.get("todate") || "2026-04-30";
  const testCC = url.searchParams.get("costcenter") || "M13";

  const supabase = serverSupabase();
  const { data: koppling } = await supabase
    .from("lonesystem_koppling")
    .select("access_token")
    .eq("system_typ", "fortnox")
    .eq("aktiv", true)
    .maybeSingle();
  if (!koppling?.access_token) {
    return NextResponse.json({ error: "Ingen koppling" }, { status: 404 });
  }
  const accessToken = decrypt(koppling.access_token);

  async function call(path: string) {
    const full = `https://api.fortnox.se${path}`;
    const r = await fetch(full, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      cache: "no-store",
    });
    const text = await r.text();
    let body: any;
    try { body = JSON.parse(text); } catch { body = text.slice(0, 1500); }
    return { path, url: full, status: r.status, body };
  }

  // Hämta vår mappning från DB
  const { data: mapp } = await supabase
    .from("maskin_kostnadsstalle")
    .select("maskin_id, kostnadsstalle_kod")
    .order("kostnadsstalle_kod");

  // Fortnox-anrop
  const ccRes = await call("/3/costcenters");
  const ccList: any[] = ccRes.body?.CostCenters || [];
  const ccKoder = ccList.map(c => ({ kod: c.Code, namn: c.Description, aktiv: c.Active }));

  const fyRes = await call("/3/financialyears");
  const fyList = fyRes.body?.FinancialYears || [];
  const aktuelltFy = fyList.find((f: any) => f.FromDate <= fromdate && f.ToDate >= todate) || fyList[0];

  // Testa resultat-endpointen i 5 varianter så vi ser vilken Fortnox accepterar
  const varianter = [
    `/3/reports/result?costcenter=${encodeURIComponent(testCC)}&fromdate=${fromdate}&todate=${todate}`,
    `/3/reports/result?costcenter=${encodeURIComponent(testCC)}&accountingyear=${new Date(fromdate).getFullYear()}`,
    aktuelltFy ? `/3/reports/result?costcenter=${encodeURIComponent(testCC)}&financialyear=${aktuelltFy.Id}` : null,
    `/3/reports/result?fromdate=${fromdate}&todate=${todate}`,
    `/3/reports/result`,
    `/3/vouchers?financialyear=${aktuelltFy?.Id || ""}&limit=2`,
  ].filter(Boolean) as string[];

  const varianttester: any[] = [];
  for (const p of varianter) {
    varianttester.push(await call(p));
  }

  // Matcha våra koder mot Fortnox koder
  const våraKoder = (mapp || []).map(m => m.kostnadsstalle_kod);
  const fortnoxKoder = ccKoder.map(c => c.kod);
  const matchning = våraKoder.map(k => ({
    kod: k,
    finns_i_fortnox: fortnoxKoder.includes(k),
    matchar_case_insensitive: fortnoxKoder.some(fk => fk.toLowerCase() === k.toLowerCase()),
  }));

  return NextResponse.json({
    ok: true,
    våra_mappningar: mapp,
    fortnox_costcenters_count: ccList.length,
    fortnox_costcenters: ccKoder,
    matchning_mot_våra_koder: matchning,
    financialyears: fyList.map((f: any) => ({ Id: f.Id, FromDate: f.FromDate, ToDate: f.ToDate, AccountChartType: f.AccountChartType })),
    aktuellt_fy: aktuelltFy,
    result_endpoint_tester: varianttester,
  }, { status: 200 });
}
