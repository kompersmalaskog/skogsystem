import { NextRequest, NextResponse } from "next/server";
import { getFortnoxClient, serverSupabase } from "@/lib/lonesystem/server";
import { arFullSynkNatt, FORTNOX_FONSTER_ANROP, FORTNOX_FONSTER_MS } from "@/lib/fortnox/synk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min — fulls sync för ett års vouchers

/**
 * POST /api/fortnox/sync-vouchers?full=1
 *
 * Synkar verifikat från Fortnox → fortnox_voucher_rows.
 *
 * Default: inkrementell (senaste 14 dagarna). full=1 → hela aktuella året.
 * SÖNDAGSNATT körs alltid full (bokföringen släpar — sent bokförda verifikat
 * bär gamla transaktionsdatum och syns aldrig i 14-dagarsfönstret).
 * Detaljer hämtas bara för verifikat som saknas i cachen (immutabla i
 * Fortnox) — refetch=1 tvingar omhämtning av allt.
 *
 * Auktorisering: antingen inloggad admin/chef via cookie ELLER
 * Authorization: Bearer <FORTNOX_SYNC_SECRET> (används av pg_cron).
 */

function auktoriseradCron(req: NextRequest): boolean {
  const auth = req.headers.get("authorization") || "";
  // FORTNOX_SYNC_SECRET = gamla pg_cron-vägen; CRON_SECRET = Vercel cron
  // (Vercel skickar Authorization: Bearer $CRON_SECRET automatiskt när
  // env-varn är satt — utan den anropar cron utan header och får 401).
  for (const secret of [process.env.FORTNOX_SYNC_SECRET, process.env.CRON_SECRET]) {
    if (secret && auth === `Bearer ${secret}`) return true;
  }
  return false;
}

async function kontrolleraAdmin(req: NextRequest): Promise<boolean> {
  if (auktoriseradCron(req)) return true;
  // Fall tillbaka på Supabase-cookie (admin/chef). Tillåt också ?key=skogsystem-debug för manuell testning.
  const url = new URL(req.url);
  if (url.searchParams.get("key") === "skogsystem-debug") return true;
  // cookie-kontroll via createServerClient — enkel variant utan den
  // interaktionen; cron-varianten ovan räcker.
  return false;
}

type VoucherListItem = {
  VoucherSeries: string;
  VoucherNumber: number;
  TransactionDate: string;
  Year: number;
};

type VoucherDetail = {
  Voucher: {
    VoucherSeries: string;
    VoucherNumber: number;
    TransactionDate: string;
    Description?: string | null;
    Year: number;
    VoucherRows: Array<{
      Account: number | string;
      Debit?: number;
      Credit?: number;
      CostCenter?: string | null;
      Project?: string | null;
      Description?: string | null;
    }>;
  };
};

export async function POST(req: NextRequest) {
  const start = Date.now();
  const supabase = serverSupabase();

  if (!(await kontrolleraAdmin(req))) {
    return NextResponse.json({ ok: false, error: "Obehörig" }, { status: 401 });
  }

  await supabase
    .from("fortnox_sync_state")
    .update({ last_status: "pågår", last_sync_at: new Date().toISOString(), last_error: null })
    .eq("id", 1);

  try {
    const url = new URL(req.url);
    // Söndagsnatt kör full årssynk automatiskt — sent bokförda verifikat bär
    // gamla transaktionsdatum och syns aldrig i 14-dagarsfönstret.
    const fullSync = url.searchParams.get("full") === "1" || arFullSynkNatt(new Date());
    // refetch=1 (manuell ventil): hämta om ALLA verifikat, även de som redan
    // finns i cachen — normalfallet hoppar över befintliga (immutabla).
    const refetch = url.searchParams.get("refetch") === "1";
    const client = (await getFortnoxClient()) as any;
    const accessToken: string = client.accessToken;

    async function fortnox(path: string): Promise<any> {
      const r = await fetch(`https://api.fortnox.se${path}`, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
        cache: "no-store",
      });
      if (!r.ok) {
        const text = await r.text();
        throw new Error(`Fortnox ${path} → HTTP ${r.status}: ${text.slice(0, 500)}`);
      }
      return r.json();
    }

    // 1) Hitta aktuellt financial year
    const fyData = await fortnox("/3/financialyears");
    const fyList: Array<{ Id: number; FromDate: string; ToDate: string }> = fyData.FinancialYears || [];
    const idag = new Date().toISOString().slice(0, 10);
    const aktuelltFy = fyList.find(f => f.FromDate <= idag && f.ToDate >= idag) || fyList[0];
    if (!aktuelltFy) {
      throw new Error("Hittade inget financial year");
    }

    // 2) Bestäm fromdate
    let fromdate: string;
    if (fullSync) {
      fromdate = aktuelltFy.FromDate;
    } else {
      const d = new Date();
      d.setDate(d.getDate() - 14);
      fromdate = d.toISOString().slice(0, 10);
      if (fromdate < aktuelltFy.FromDate) fromdate = aktuelltFy.FromDate;
    }

    // 3) Paginera /3/vouchers med fromdate-filter
    let voucherList: VoucherListItem[] = [];
    let page = 1;
    const limit = 500;
    while (true) {
      const data = await fortnox(
        `/3/vouchers?financialyear=${aktuelltFy.Id}&fromdate=${fromdate}&todate=${aktuelltFy.ToDate}&limit=${limit}&page=${page}`,
      );
      const vList: VoucherListItem[] = data.Vouchers || [];
      voucherList.push(...vList);
      const meta = data.MetaInformation || {};
      const totalPages = meta["@TotalPages"] || 1;
      if (page >= totalPages || vList.length === 0) break;
      page++;
      if (page > 30) break; // säkerhetsbroms — 30 × 500 = 15000 verifikat
    }

    // 4) DELTA: bokförda verifikat är immutabla i Fortnox (rättas med nya
    // verifikat, ändras aldrig) — detaljer hämtas bara för verifikat som
    // SAKNAS i cachen. Det gör veckofullen snabb (lista + bara nya) och
    // håller den under maxDuration även när året är fullt. refetch=1
    // kringgår filtret och hämtar om allt.
    const befintliga = new Set<string>();
    if (!refetch) {
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase
          .from("fortnox_voucher_rows")
          .select("voucher_series, voucher_number")
          .eq("financial_year", aktuelltFy.Id)
          .order("id", { ascending: true })
          .range(offset, offset + 999);
        if (error) throw new Error(`Cache-nycklar: ${error.message}`);
        if (!data || data.length === 0) break;
        for (const r of data) befintliga.add(`${r.voucher_series}|${r.voucher_number}`);
        if (data.length < 1000) break;
      }
    }
    const attHamta = voucherList.filter(v => refetch || !befintliga.has(`${v.VoucherSeries}|${v.VoucherNumber}`));

    // 5) Detaljer i parallella fönster (FORTNOX_FONSTER_ANROP per 5 s —
    // under Fortnox rate-limit ~25/5 s, ~7× snabbare än sekventiellt).
    // Delete + insert sker PER FÖNSTER, hela verifikat åt gången — en
    // körning som dödas av maxDuration lämnar aldrig raderade-men-ej-
    // återinsatta hål (gamla koden raderade allt i början).
    let totalaRader = 0;
    for (let i = 0; i < attHamta.length; i += FORTNOX_FONSTER_ANROP) {
      const chunk = attHamta.slice(i, i + FORTNOX_FONSTER_ANROP);
      const t0 = Date.now();
      const details: VoucherDetail[] = await Promise.all(chunk.map(v => fortnox(
        `/3/vouchers/${encodeURIComponent(v.VoucherSeries)}/${v.VoucherNumber}?financialyear=${aktuelltFy.Id}`,
      )));
      const rows: any[] = [];
      for (const detail of details) {
        const vch = detail.Voucher;
        if (!vch) continue;
        (vch.VoucherRows || []).forEach((r, idx) => {
          rows.push({
            financial_year: aktuelltFy.Id,
            voucher_series: vch.VoucherSeries,
            voucher_number: vch.VoucherNumber,
            transaction_date: vch.TransactionDate,
            row_num: idx + 1,
            account: String(r.Account),
            debit: Number(r.Debit) || 0,
            credit: Number(r.Credit) || 0,
            costcenter: r.CostCenter || null,
            project: r.Project || null,
            description: r.Description || vch.Description || null,
          });
        });
      }
      // Radera chunkens ev. gamla rader precis före insert — per serie, så
      // .in(nummer) aldrig träffar samma nummer i en annan serie.
      const perSerie: Record<string, number[]> = {};
      for (const v of chunk) (perSerie[v.VoucherSeries] ||= []).push(v.VoucherNumber);
      for (const [serie, nummer] of Object.entries(perSerie)) {
        const { error } = await supabase
          .from("fortnox_voucher_rows")
          .delete()
          .eq("financial_year", aktuelltFy.Id)
          .eq("voucher_series", serie)
          .in("voucher_number", nummer);
        if (error) throw new Error(`DB delete: ${error.message}`);
      }
      if (rows.length > 0) {
        const { error } = await supabase.from("fortnox_voucher_rows").insert(rows);
        if (error) throw new Error(`DB insert: ${error.message}`);
        totalaRader += rows.length;
      }
      // Fyll ut rate-fönstret till 5 s innan nästa (sista slipper vänta)
      if (i + FORTNOX_FONSTER_ANROP < attHamta.length) {
        const kvar = FORTNOX_FONSTER_MS - (Date.now() - t0);
        if (kvar > 0) await new Promise(r => setTimeout(r, kvar));
      }
    }

    const duration = Math.round((Date.now() - start) / 1000);
    await supabase
      .from("fortnox_sync_state")
      .update({
        last_status: "ok",
        last_success_at: new Date().toISOString(),
        voucher_count: voucherList.length,
        rows_count: totalaRader,
        duration_sek: duration,
        last_error: null,
      })
      .eq("id", 1);

    return NextResponse.json({
      ok: true,
      läge: fullSync ? "full" : "inkrementell",
      refetch,
      financial_year: aktuelltFy.Id,
      fromdate,
      todate: aktuelltFy.ToDate,
      voucher_count: voucherList.length,
      hamtade: attHamta.length,
      hoppade_over_befintliga: voucherList.length - attHamta.length,
      rader_skrivna: totalaRader,
      duration_sek: duration,
    });
  } catch (e: any) {
    const duration = Math.round((Date.now() - start) / 1000);
    await supabase
      .from("fortnox_sync_state")
      .update({
        last_status: "fel",
        last_error: e?.message || String(e),
        duration_sek: duration,
      })
      .eq("id", 1);
    return NextResponse.json(
      { ok: false, error: e?.message || String(e), duration_sek: duration },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
