import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/kalibrering/objekt?key=skogsystem-debug
 *
 * Objekt-nivå kalibrering: när en kund ringer om en trakt ska man kunna slå
 * upp objektet och svara med underlag. MaskinOBEROENDE — man vet objektet,
 * inte alltid maskinen. Maskinen visas som upplysning i svaret.
 *
 * Per objekt: träffprocent, systematisk avvikelse, standardavvikelse, n, period.
 * Plus maskinnivå (all-time träff + profil-golv) så klienten kan skilja
 * "det var trakten" från "det var maskinen den perioden".
 *
 * KRITISKT — OMÄTT ≠ AVVIKELSE: operator NULL/0 exkluderas innan något räknas.
 * Diameter på matpunktsnivå.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const DEBUG_KEY = "skogsystem-debug";

export type ObjektStat = {
  object_name: string;
  maskin_id: string | null;
  n: number;
  traffPct: number;
  systematisk: number;
  standardavv: number;
  fran: string;
  till: string;
};
export type MaskinInfo = { profil: string | null; golvDia: number | null; traffPctTotal: number | null; n: number };
export type ObjektResponse = {
  ok: true;
  objekt: ObjektStat[];
  maskiner: Record<string, MaskinInfo>;
};

async function fetchAllRows<T>(
  query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<{ data: T[]; error: unknown }> {
  const PAGE = 1000;
  const all: T[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await query(offset, offset + PAGE - 1);
    if (error) return { data: all, error };
    const batch = data ?? [];
    all.push(...batch);
    if (batch.length < PAGE) break;
    offset += PAGE;
  }
  return { data: all, error: null };
}
const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;
function popStd(vals: number[], mean: number): number {
  if (vals.length < 2) return 0;
  return Math.sqrt(vals.reduce((a, b) => a + (b - mean) * (b - mean), 0) / vals.length);
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("key") !== DEBUG_KEY) return new NextResponse("Ogiltig nyckel", { status: 401 });
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // filnamn → object_name + maskin_id, samt kontroll-datum (för period)
  const fk = await fetchAllRows<{ filnamn: string; object_name: string | null; maskin_id: string; datum: string }>((f, t) =>
    supabase.from("fakt_kalibrering").select("filnamn,object_name,maskin_id,datum").range(f, t),
  );
  if (fk.error) {
    const e = fk.error as { message?: string };
    return NextResponse.json({ ok: false, error: `fakt_kalibrering: ${e.message}` }, { status: 500 });
  }
  const filInfo = new Map<string, { obj: string | null; maskin: string }>();
  for (const r of fk.data) filInfo.set(r.filnamn, { obj: r.object_name, maskin: r.maskin_id });

  // stock id → filnamn
  const stockRes = await fetchAllRows<{ id: number; filnamn: string }>((f, t) =>
    supabase.from("detalj_kontroll_stock").select("id,filnamn").order("id", { ascending: true }).range(f, t),
  );
  if (stockRes.error) {
    const e = stockRes.error as { message?: string };
    return NextResponse.json({ ok: false, error: `stockar: ${e.message}` }, { status: 500 });
  }
  const stockFil = new Map<number, string>();
  for (const s of stockRes.data) stockFil.set(s.id, s.filnamn);
  const stockIds = stockRes.data.map((s) => s.id);

  // matpunkter → per objekt + per maskin (OMÄTT-filtrerat)
  const objAvvik = new Map<string, { avvik: number[]; maskin: string | null }>();
  const maskAvvik = new Map<string, number[]>();
  const CHUNK = 1000;
  for (let i = 0; i < stockIds.length; i += CHUNK) {
    const chunk = stockIds.slice(i, i + CHUNK);
    if (chunk.length === 0) continue;
    const mpRes = await fetchAllRows<{ detalj_kontroll_stock_id: number; diameter_maskin_mm: number | null; diameter_operator_mm: number | null }>((f, t) =>
      supabase.from("detalj_kontroll_stock_matpunkt")
        .select("detalj_kontroll_stock_id,diameter_maskin_mm,diameter_operator_mm")
        .in("detalj_kontroll_stock_id", chunk).range(f, t),
    );
    if (mpRes.error) {
      const e = mpRes.error as { message?: string };
      return NextResponse.json({ ok: false, error: `matpunkt: ${e.message}` }, { status: 500 });
    }
    for (const m of mpRes.data) {
      const dm = m.diameter_maskin_mm, do_ = m.diameter_operator_mm;
      if (dm == null || do_ == null || do_ === 0) continue; // OMÄTT-filter
      const fil = stockFil.get(m.detalj_kontroll_stock_id);
      if (!fil) continue;
      const info = filInfo.get(fil);
      if (!info) continue;
      const avvik = dm - do_;
      if (info.obj) {
        let o = objAvvik.get(info.obj);
        if (!o) { o = { avvik: [], maskin: info.maskin }; objAvvik.set(info.obj, o); }
        o.avvik.push(avvik);
      }
      if (info.maskin) {
        let ma = maskAvvik.get(info.maskin);
        if (!ma) { ma = []; maskAvvik.set(info.maskin, ma); }
        ma.push(avvik);
      }
    }
  }

  // period per objekt (min/max datum över objektets kontroller)
  const objPeriod = new Map<string, { fran: string; till: string }>();
  for (const r of fk.data) {
    if (!r.object_name) continue;
    const d = String(r.datum).slice(0, 10);
    const p = objPeriod.get(r.object_name);
    if (!p) objPeriod.set(r.object_name, { fran: d, till: d });
    else { if (d < p.fran) p.fran = d; if (d > p.till) p.till = d; }
  }

  // profil + golv per maskin
  const dm = await fetchAllRows<{ maskin_id: string; kravprofil: string | null }>((f, t) =>
    supabase.from("dim_maskin").select("maskin_id,kravprofil").range(f, t),
  );
  const maskinProfil = new Map<string, string | null>();
  for (const r of dm.data) maskinProfil.set(r.maskin_id, r.kravprofil);
  const kp = await fetchAllRows<{ profil: string; golv: number }>((f, t) =>
    supabase.from("kravprofil").select("profil,golv").eq("variabel", "diameter").eq("metrik", "traffprocent").range(f, t),
  );
  const golvForProfil = new Map<string, number>();
  for (const r of kp.data) golvForProfil.set(r.profil, Number(r.golv));

  // bygg objekt-lista
  const objekt: ObjektStat[] = [];
  objAvvik.forEach((o, name) => {
    const n = o.avvik.length;
    if (n === 0) return;
    const mean = o.avvik.reduce((a, b) => a + b, 0) / n;
    const period = objPeriod.get(name) ?? { fran: "", till: "" };
    objekt.push({
      object_name: name,
      maskin_id: o.maskin,
      n,
      traffPct: r1((100 * o.avvik.filter((v) => Math.abs(v) <= 4).length) / n),
      systematisk: r2(mean),
      standardavv: r2(popStd(o.avvik, mean)),
      fran: period.fran,
      till: period.till,
    });
  });
  objekt.sort((a, b) => b.n - a.n);

  // maskinnivå
  const maskiner: Record<string, MaskinInfo> = {};
  maskAvvik.forEach((avvik, maskin) => {
    const n = avvik.length;
    const profil = maskinProfil.get(maskin) ?? null;
    maskiner[maskin] = {
      profil,
      golvDia: profil ? (golvForProfil.get(profil) ?? null) : null,
      traffPctTotal: n > 0 ? r1((100 * avvik.filter((v) => Math.abs(v) <= 4).length) / n) : null,
      n,
    };
  });

  return NextResponse.json({ ok: true, objekt, maskiner } satisfies ObjektResponse);
}
