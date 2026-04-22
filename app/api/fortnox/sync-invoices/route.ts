import { NextRequest, NextResponse } from "next/server";
import { getFortnoxClient, serverSupabase } from "@/lib/lonesystem/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/fortnox/sync-invoices?full=1
 *
 * Synkar fakturarader från Fortnox → fortnox_invoice_rows.
 * Default: senaste 14 dagar (FromDate på fakturan). full=1 → hela aktuella året.
 *
 * VO-regex körs på varje raddescription. Matchande rad får matched_objekt_id
 * satt (sync-styrd). manual_objekt_id skrivs aldrig över — admin sätter den
 * via inställningar om regex inte hittar.
 *
 * Auktorisering: Bearer <FORTNOX_SYNC_SECRET> (pg_cron) eller
 * ?key=skogsystem-debug (manuell testning).
 */

function auktoriseradCron(req: NextRequest): boolean {
  const secret = process.env.FORTNOX_SYNC_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") || "";
  return auth === `Bearer ${secret}`;
}

async function kontrolleraAdmin(req: NextRequest): Promise<boolean> {
  if (auktoriseradCron(req)) return true;
  const url = new URL(req.url);
  if (url.searchParams.get("key") === "skogsystem-debug") return true;
  return false;
}

type InvoiceListItem = {
  DocumentNumber: number;
  InvoiceDate: string;
  VoucherSeries?: string | null;
  VoucherNumber?: number | null;
};

type InvoiceDetail = {
  Invoice: {
    DocumentNumber: number;
    InvoiceDate: string;
    VoucherSeries?: string | null;
    VoucherNumber?: number | null;
    InvoiceRows: Array<{
      ArticleNumber?: string | null;
      Description?: string | null;
      DeliveredQuantity?: number | string | null;
      Price?: number | string | null;
      Total?: number | string | null;
      CostCenter?: string | null;
      Project?: string | null;
    }>;
  };
};

const VO_REGEX = /VO\s*(\d+)/i;

export async function POST(req: NextRequest) {
  const start = Date.now();
  const supabase = serverSupabase();

  if (!(await kontrolleraAdmin(req))) {
    return NextResponse.json({ ok: false, error: "Obehörig" }, { status: 401 });
  }

  await supabase
    .from("fortnox_sync_state")
    .update({ invoice_last_sync_at: new Date().toISOString(), invoice_last_status: "pågår", invoice_last_error: null })
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

    // Aktuellt financial year för fromdate-gränser
    const fyData = await fortnox("/3/financialyears");
    const fyList: Array<{ Id: number; FromDate: string; ToDate: string }> = fyData.FinancialYears || [];
    const idag = new Date().toISOString().slice(0, 10);
    const aktuelltFy = fyList.find(f => f.FromDate <= idag && f.ToDate >= idag) || fyList[0];
    if (!aktuelltFy) throw new Error("Hittade inget financial year");

    let fromdate: string;
    if (fullSync) {
      fromdate = aktuelltFy.FromDate;
    } else {
      const d = new Date();
      d.setDate(d.getDate() - 14);
      fromdate = d.toISOString().slice(0, 10);
      if (fromdate < aktuelltFy.FromDate) fromdate = aktuelltFy.FromDate;
    }

    // Hämta objekt-lista för VO-matchning
    const { data: objekter } = await supabase
      .from("dim_objekt")
      .select("objekt_id, vo_nummer")
      .not("vo_nummer", "is", null);
    const voMap: Record<string, string> = {};
    for (const o of (objekter || [])) {
      if (o.vo_nummer) voMap[String(o.vo_nummer).trim()] = o.objekt_id;
    }

    // Paginera /3/invoices med fromdate-filter
    let invoiceList: InvoiceListItem[] = [];
    let page = 1;
    const limit = 500;
    while (true) {
      const data = await fortnox(
        `/3/invoices?fromdate=${fromdate}&todate=${aktuelltFy.ToDate}&limit=${limit}&page=${page}`,
      );
      const vList: InvoiceListItem[] = data.Invoices || [];
      invoiceList.push(...vList);
      const meta = data.MetaInformation || {};
      const totalPages = meta["@TotalPages"] || 1;
      if (page >= totalPages || vList.length === 0) break;
      page++;
      if (page > 30) break; // säkerhetsbroms
    }

    // Hämta detalj per faktura + upsert:a raderna
    let totalaRader = 0;
    const upsertBatch: any[] = [];

    async function flushaBatch() {
      if (!upsertBatch.length) return;
      const { error } = await supabase
        .from("fortnox_invoice_rows")
        .upsert(upsertBatch, {
          onConflict: "document_number,row_num",
          ignoreDuplicates: false,
        });
      if (error) throw new Error(`DB upsert: ${error.message}`);
      totalaRader += upsertBatch.length;
      upsertBatch.length = 0;
    }

    for (const inv of invoiceList) {
      const detail: InvoiceDetail = await fortnox(`/3/invoices/${inv.DocumentNumber}`);
      const v = detail.Invoice;
      if (!v) continue;
      const rader = v.InvoiceRows || [];
      rader.forEach((r, idx) => {
        const desc = r.Description || "";
        const match = desc.match(VO_REGEX);
        const vo = match?.[1]?.trim() ?? null;
        const matched = vo ? (voMap[vo] || null) : null;
        upsertBatch.push({
          document_number: v.DocumentNumber,
          invoice_date: v.InvoiceDate,
          voucher_series: v.VoucherSeries || null,
          voucher_number: v.VoucherNumber || null,
          row_num: idx + 1,
          article_number: r.ArticleNumber || null,
          description: desc || null,
          delivered_quantity: r.DeliveredQuantity == null ? null : Number(r.DeliveredQuantity),
          price: r.Price == null ? null : Number(r.Price),
          total: r.Total == null ? null : Number(r.Total),
          costcenter: r.CostCenter || null,
          project: r.Project || null,
          matched_objekt_id: matched,
          synced_at: new Date().toISOString(),
          // manual_objekt_id utelämnas medvetet — bevaras av Postgres vid ON CONFLICT DO UPDATE
        });
      });
      if (upsertBatch.length >= 500) await flushaBatch();
    }
    await flushaBatch();

    const duration = Math.round((Date.now() - start) / 1000);
    await supabase
      .from("fortnox_sync_state")
      .update({
        invoice_last_sync_at: new Date().toISOString(),
        invoice_last_status: "ok",
        invoice_count: invoiceList.length,
        invoice_rows_count: totalaRader,
        invoice_last_error: null,
      })
      .eq("id", 1);

    return NextResponse.json({
      ok: true,
      läge: fullSync ? "full" : "inkrementell",
      fromdate,
      todate: aktuelltFy.ToDate,
      invoice_count: invoiceList.length,
      rader_skrivna: totalaRader,
      objekt_map_count: Object.keys(voMap).length,
      duration_sek: duration,
    });
  } catch (e: any) {
    const duration = Math.round((Date.now() - start) / 1000);
    await supabase
      .from("fortnox_sync_state")
      .update({
        invoice_last_status: "fel",
        invoice_last_error: e?.message || String(e),
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
