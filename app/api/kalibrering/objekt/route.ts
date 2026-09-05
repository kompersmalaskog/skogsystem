import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { hamtaDiameterPunkter, TOPPDIA_COLS } from "@/lib/kalibrering/diameterpunkter";
import { statistik } from "@/lib/kalibrering/statistik";

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
  grovPct: number | null; // Biometria: andel över grov-toleransen; null utan sådan rad
  fran: string;
  till: string;
};
export type KravRow = {
  variabel: string; metrik: string; riktning: string;
  tolerans: number | null; mal: number; golv: number; enhet: string; larm_min_matt: number | null;
};
// trosklar = maskinprofilens ALLA kravrader, så klienten dömer objektet via
// bedomProfil (VIDA:s mål/golv-trappa, Biometrias binära) — inget hårdkodat 85/3,5.
export type MaskinInfo = { profil: string | null; golvDia: number | null; traffPctTotal: number | null; n: number; trosklar: KravRow[] };
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

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("key") !== DEBUG_KEY) return new NextResponse("Ogiltig nyckel", { status: 401 });
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // filnamn → object_name + maskin_id, samt kontroll-datum (för period)
  const fk = await fetchAllRows<{ filnamn: string; object_name: string | null; maskin_id: string; datum: string }>((f, t) =>
    supabase.from("fakt_kalibrering").select("filnamn,object_name,maskin_id,datum").order('id').range(f, t),
  );
  if (fk.error) {
    const e = fk.error as { message?: string };
    return NextResponse.json({ ok: false, error: `fakt_kalibrering: ${e.message}` }, { status: 500 });
  }
  const filInfo = new Map<string, { obj: string | null; maskin: string }>();
  for (const r of fk.data) filInfo.set(r.filnamn, { obj: r.object_name, maskin: r.maskin_id });

  // stock id → filnamn (+ toppdia för att toppen ska räknas som mätpunkt)
  const stockRes = await fetchAllRows<{
    id: number;
    filnamn: string;
    maskin_toppdia_mm: number | null;
    operator_toppdia_mm: number | null;
  }>((f, t) =>
    supabase.from("detalj_kontroll_stock").select(`id,filnamn,${TOPPDIA_COLS}`).order("id", { ascending: true }).range(f, t),
  );
  if (stockRes.error) {
    const e = stockRes.error as { message?: string };
    return NextResponse.json({ ok: false, error: `stockar: ${e.message}` }, { status: 500 });
  }
  const stockFil = new Map<number, string>();
  for (const s of stockRes.data) stockFil.set(s.id, s.filnamn);

  // Diameterpunkter (mätpunkter + toppdia, OMÄTT-filtrerat) → per objekt + per maskin
  const objAvvik = new Map<string, { avvik: number[]; maskin: string | null }>();
  const maskAvvik = new Map<string, number[]>();
  const punktRes = await hamtaDiameterPunkter(supabase, stockRes.data);
  if (punktRes.error) {
    return NextResponse.json({ ok: false, error: `matpunkt: ${punktRes.error.message}` }, { status: 500 });
  }
  for (const p of punktRes.data) {
    const fil = stockFil.get(p.stockId);
    if (!fil) continue;
    const info = filInfo.get(fil);
    if (!info) continue;
    if (info.obj) {
      let o = objAvvik.get(info.obj);
      if (!o) { o = { avvik: [], maskin: info.maskin }; objAvvik.set(info.obj, o); }
      o.avvik.push(p.avvik);
    }
    if (info.maskin) {
      let ma = maskAvvik.get(info.maskin);
      if (!ma) { ma = []; maskAvvik.set(info.maskin, ma); }
      ma.push(p.avvik);
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
    supabase.from("dim_maskin").select("maskin_id,kravprofil").order('maskin_id').range(f, t),
  );
  const maskinProfil = new Map<string, string | null>();
  for (const r of dm.data) maskinProfil.set(r.maskin_id, r.kravprofil);
  // Hela kravprofilen per profil — klienten dömer via bedomProfil, inte via ett golv.
  const kp = await fetchAllRows<KravRow & { profil: string }>((f, t) =>
    supabase.from("kravprofil").select("profil,variabel,metrik,riktning,tolerans,mal,golv,enhet,larm_min_matt").order('id').range(f, t),
  );
  if (kp.error) {
    const e = kp.error as { message?: string };
    return NextResponse.json({ ok: false, error: `kravprofil: ${e.message}` }, { status: 500 });
  }
  const trosklarForProfil = new Map<string, KravRow[]>();
  for (const r of kp.data) {
    const { profil, ...rad } = r;
    (trosklarForProfil.get(profil) ?? trosklarForProfil.set(profil, []).get(profil)!).push(rad);
  }
  const golvForProfil = new Map<string, number>();
  const tolFor = (profil: string | null, metrik: string): number | null => {
    const r = profil ? trosklarForProfil.get(profil)?.find((t) => t.variabel === "diameter" && t.metrik === metrik) : undefined;
    return r && r.tolerans != null ? Number(r.tolerans) : null;
  };
  trosklarForProfil.forEach((rows, profil) => {
    const g = rows.find((t) => t.variabel === "diameter" && t.metrik === "traffprocent");
    if (g) golvForProfil.set(profil, Number(g.golv));
  });

  // bygg objekt-lista — samma statistik() som bedomning/tradslag (en källa)
  const objekt: ObjektStat[] = [];
  objAvvik.forEach((o, name) => {
    const n = o.avvik.length;
    if (n === 0) return;
    const profil = o.maskin ? (maskinProfil.get(o.maskin) ?? null) : null;
    const st = statistik(o.avvik, tolFor(profil, "traffprocent") ?? 4, tolFor(profil, "grov_avvikelse"));
    const period = objPeriod.get(name) ?? { fran: "", till: "" };
    objekt.push({
      object_name: name,
      maskin_id: o.maskin,
      n,
      traffPct: st.traffPct ?? 0,
      systematisk: st.systematisk ?? 0,
      standardavv: st.standardavv ?? 0,
      grovPct: st.grovPct,
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
      traffPctTotal: n > 0 ? r1((100 * avvik.filter((v) => Math.abs(v) <= (tolFor(profil, "traffprocent") ?? 4)).length) / n) : null,
      n,
      trosklar: profil ? (trosklarForProfil.get(profil) ?? []) : [],
    };
  });

  return NextResponse.json({ ok: true, objekt, maskiner } satisfies ObjektResponse);
}
