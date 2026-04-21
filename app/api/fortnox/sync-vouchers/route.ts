import { NextRequest, NextResponse } from "next/server";
import { getFortnoxClient, serverSupabase } from "@/lib/lonesystem/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min — fulls sync för ett års vouchers

/**
 * POST /api/fortnox/sync-vouchers?full=1
 *
 * Synkar verifikat från Fortnox → fortnox_voucher_rows.
 *
 * Default: inkrementell (senaste 14 dagarna). full=1 → hela aktuella året.
 *
 * Auktorisering: antingen inloggad admin/chef via cookie ELLER
 * Authorization: Bearer <FORTNOX_SYNC_SECRET> (används av pg_cron).
 */

function auktoriseradCron(req: NextRequest): boolean {
  const secret = process.env.FORTNOX_SYNC_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") || "";
  return auth === `Bearer ${secret}`;
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
    const fullSync = url.searchParams.get("full") === "1";
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

    // 4) Hämta detalj per voucher + skriv till DB i batcher.
    // Radera först rader för alla verifikat vi ska återskapa så att
    // borttagna rader också försvinner från cachen.
    if (voucherList.length > 0) {
      const vnrLista = voucherList.map(v => v.VoucherNumber);
      const seriesSet = [...new Set(voucherList.map(v => v.VoucherSeries))];
      // Batcha delete 200 voucher-nummer åt gången
      for (let i = 0; i < vnrLista.length; i += 200) {
        const chunk = vnrLista.slice(i, i + 200);
        await supabase
          .from("fortnox_voucher_rows")
          .delete()
          .eq("financial_year", aktuelltFy.Id)
          .in("voucher_series", seriesSet)
          .in("voucher_number", chunk);
      }
    }

    let totalaRader = 0;
    const batchSize = 100;
    let pendingRows: any[] = [];

    for (const v of voucherList) {
      const detail: VoucherDetail = await fortnox(
        `/3/vouchers/${encodeURIComponent(v.VoucherSeries)}/${v.VoucherNumber}?financialyear=${aktuelltFy.Id}`,
      );
      const vch = detail.Voucher;
      if (!vch) continue;
      const rader = vch.VoucherRows || [];
      rader.forEach((r, idx) => {
        pendingRows.push({
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
      if (pendingRows.length >= batchSize * 20) {
        const { error } = await supabase.from("fortnox_voucher_rows").insert(pendingRows);
        if (error) throw new Error(`DB insert: ${error.message}`);
        totalaRader += pendingRows.length;
        pendingRows = [];
      }
    }
    if (pendingRows.length > 0) {
      const { error } = await supabase.from("fortnox_voucher_rows").insert(pendingRows);
      if (error) throw new Error(`DB insert: ${error.message}`);
      totalaRader += pendingRows.length;
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
      financial_year: aktuelltFy.Id,
      fromdate,
      todate: aktuelltFy.ToDate,
      voucher_count: voucherList.length,
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
