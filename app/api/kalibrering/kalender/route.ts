import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/kalibrering/kalender?manad=YYYY-MM&key=skogsystem-debug
 *
 * Datalager för Kalibrering-kalendern. Returnerar status per skördare per dag
 * och en aggregerad dagsstatus (komplett/saknas/varning/inaktiv) för
 * kalenderfärgning. Ingen kontrollstam förväntas dagar då en maskin haft
 * dagsvolym < tröskel för dominant huvudtyp.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEBUG_KEY = "skogsystem-debug";

type Maskin = { maskin_id: string; tillverkare: string | null; modell: string | null; aktiv_till: string | null };
type ProdRow = { datum: string; maskin_id: string; objekt_id: string | null; volym_m3sub: number | null };
type ObjektRow = { objekt_id: string; huvudtyp: string | null };
type KalibRow = { id: number; datum: string; maskin_id: string; status: string; tradslag: string | null; filnamn: string | null };
type RegelRow = { huvudtyp: string; min_volym_m3sub: number };

type DagstatusMaskin = "komplett" | "saknas" | "varning" | "inaktiv";
type Dagstatus = "komplett" | "saknas" | "varning" | "inaktiv";

const pad = (n: number) => String(n).padStart(2, "0");
const round1 = (n: number) => Math.round(n * 10) / 10;

// Supabase JS har 1000-rads default cap. Paginera explicit för att inte tappa rader.
// Mönstret matchar app/affarsuppfoljning/page.tsx och app/oversikt/page.tsx.
async function fetchAllRows(
  queryFn: (from: number, to: number) => PromiseLike<{ data: any[] | null; error: any }>,
): Promise<{ data: any[]; error: any | null }> {
  const PAGE = 1000;
  const all: any[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await queryFn(offset, offset + PAGE - 1);
    if (error) return { data: [], error };
    const batch = data ?? [];
    all.push(...batch);
    if (batch.length < PAGE) break;
    offset += PAGE;
  }
  return { data: all, error: null };
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  if (key !== DEBUG_KEY) {
    return new NextResponse("Ogiltig nyckel", { status: 401 });
  }

  const manad = url.searchParams.get("manad");
  if (!manad || !/^\d{4}-\d{2}$/.test(manad)) {
    return NextResponse.json({ ok: false, error: "manad (YYYY-MM) krävs" }, { status: 400 });
  }

  const [y, m] = manad.split("-").map(Number);
  const startDatum = `${manad}-01`;
  const slutDatum = m === 12 ? `${y + 1}-01-01` : `${y}-${pad(m + 1)}-01`;
  const daysInMonth = new Date(y, m, 0).getDate();

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // === 1) Skördare ===
  const harvRes = await supabase
    .from("dim_maskin")
    .select("maskin_id, tillverkare, modell, aktiv_till")
    .eq("maskin_typ", "Harvester");
  if (harvRes.error) {
    return NextResponse.json({ ok: false, error: `dim_maskin: ${harvRes.error.message}` }, { status: 500 });
  }
  const harvesters: Maskin[] = harvRes.data ?? [];
  const harvesterIds = harvesters.map(h => h.maskin_id);

  if (harvesterIds.length === 0) {
    return NextResponse.json({ manad, dagar: [], sammanfattning: { produktionsdagar: 0, kompletta: 0, saknas: 0, varningar: 0, okand_huvudtyp_dagar: 0 } });
  }

  // === 2) Produktion i spannet, för Harvester-maskiner — paginerad ===
  const prodRes = await fetchAllRows((from, to) =>
    supabase
      .from("fakt_produktion")
      .select("datum, maskin_id, objekt_id, volym_m3sub")
      .gte("datum", startDatum)
      .lt("datum", slutDatum)
      .in("maskin_id", harvesterIds)
      .order("datum", { ascending: true })
      .order("maskin_id", { ascending: true })
      .order("objekt_id", { ascending: true })
      .order("tradslag_id", { ascending: true })
      .order("operator_id", { ascending: true })
      .range(from, to)
  );
  if (prodRes.error) {
    return NextResponse.json({ ok: false, error: `fakt_produktion: ${prodRes.error.message}` }, { status: 500 });
  }
  const prodRows = prodRes.data as ProdRow[];

  // === 3) dim_objekt för referenserade objekt_id — paginerad för säkerhets skull ===
  const refObjektIds = Array.from(new Set(prodRows.map(r => r.objekt_id).filter((x): x is string => !!x)));
  const objektMap = new Map<string, string | null>();
  if (refObjektIds.length > 0) {
    const objRes = await fetchAllRows((from, to) =>
      supabase
        .from("dim_objekt")
        .select("objekt_id, huvudtyp")
        .in("objekt_id", refObjektIds)
        .order("objekt_id", { ascending: true })
        .range(from, to)
    );
    if (objRes.error) {
      return NextResponse.json({ ok: false, error: `dim_objekt: ${objRes.error.message}` }, { status: 500 });
    }
    for (const o of objRes.data as ObjektRow[]) {
      objektMap.set(o.objekt_id, o.huvudtyp ?? null);
    }
  }

  // === 4) Kalibreringar i spannet, för Harvester-maskiner — paginerad ===
  const kalibRes = await fetchAllRows((from, to) =>
    supabase
      .from("fakt_kalibrering")
      .select("id, datum, maskin_id, status, tradslag, filnamn")
      .gte("datum", startDatum)
      .lt("datum", slutDatum)
      .in("maskin_id", harvesterIds)
      .order("datum", { ascending: true })
      .order("maskin_id", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to)
  );
  if (kalibRes.error) {
    return NextResponse.json({ ok: false, error: `fakt_kalibrering: ${kalibRes.error.message}` }, { status: 500 });
  }
  const kalibRows = kalibRes.data as KalibRow[];

  // === 5) Regler ===
  const regelRes = await supabase
    .from("kalibrering_kontroll_regler")
    .select("huvudtyp, min_volym_m3sub")
    .eq("aktiv", true);
  if (regelRes.error) {
    return NextResponse.json({ ok: false, error: `kalibrering_kontroll_regler: ${regelRes.error.message}` }, { status: 500 });
  }
  const reglerMap = new Map<string, number>();
  for (const r of (regelRes.data ?? []) as RegelRow[]) {
    reglerMap.set(r.huvudtyp, Number(r.min_volym_m3sub));
  }
  const defaultTroskel = reglerMap.get("_default") ?? 30;
  const tröskelFor = (huvudtyp: string | null) =>
    huvudtyp == null ? defaultTroskel : (reglerMap.get(huvudtyp) ?? defaultTroskel);

  // === In-memory aggregation: per (datum, maskin_id) → per huvudtyp → volym ===
  const NULL_KEY = "__NULL__";
  const perDayMachineHuvudtyp = new Map<string, Map<string, number>>(); // "datum|maskin_id" → ht → vol
  for (const p of prodRows) {
    const ht = p.objekt_id ? (objektMap.get(p.objekt_id) ?? null) : null;
    const htKey = ht ?? NULL_KEY;
    const dmKey = `${p.datum}|${p.maskin_id}`;
    const inner = perDayMachineHuvudtyp.get(dmKey) ?? new Map<string, number>();
    inner.set(htKey, (inner.get(htKey) ?? 0) + Number(p.volym_m3sub ?? 0));
    perDayMachineHuvudtyp.set(dmKey, inner);
  }

  // === Bestäm dominant huvudtyp + total volym per (datum, maskin_id) ===
  type Aggreg = { datum: string; maskin_id: string; total_volym: number; dominant_huvudtyp: string | null };
  const aggByKey = new Map<string, Aggreg>();
  perDayMachineHuvudtyp.forEach((inner, dmKey) => {
    const [datum, maskin_id] = dmKey.split("|");
    let total = 0;
    const entries: { ht: string | null; volym: number }[] = [];
    inner.forEach((volym, htKey) => {
      total += volym;
      entries.push({ ht: htKey === NULL_KEY ? null : htKey, volym });
    });
    // Sort: volym DESC, sedan huvudtyp ASC alfabetisk (NULL sorteras sist)
    entries.sort((a, b) => {
      if (b.volym !== a.volym) return b.volym - a.volym;
      if (a.ht === null && b.ht === null) return 0;
      if (a.ht === null) return 1;
      if (b.ht === null) return -1;
      return a.ht.localeCompare(b.ht, "sv");
    });
    const dominant = entries[0]?.ht ?? null;
    aggByKey.set(dmKey, { datum, maskin_id, total_volym: total, dominant_huvudtyp: dominant });
  });

  // === Kalibreringar grupperade per (datum, maskin_id) ===
  const kalibByKey = new Map<string, KalibRow[]>();
  for (const k of kalibRows) {
    const key = `${k.datum}|${k.maskin_id}`;
    const arr = kalibByKey.get(key) ?? [];
    arr.push(k);
    kalibByKey.set(key, arr);
  }

  // === Bygg dagar ===
  type MaskinDag = {
    maskin_id: string;
    tillverkare: string | null;
    modell: string | null;
    status: DagstatusMaskin;
    volym_m3sub: number;
    huvudtyp: string | null;
    huvudtyp_okand: boolean;
    trosklar: { min_volym_m3sub: number };
    kontroller: { id: number; tradslag: string | null; status: string; filnamn: string | null }[];
  };
  type DagRad = { datum: string; veckodag: number; status: Dagstatus; maskiner: MaskinDag[] };

  const dagar: DagRad[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const datum = `${manad}-${pad(d)}`;
    const dow = new Date(`${datum}T00:00:00Z`).getUTCDay(); // 0=Sun..6=Sat
    const veckodag = dow === 0 ? 7 : dow; // ISO: 1=Mon..7=Sun

    // Filtrera maskiner som var aktiva på dagen — sålda maskiner (aktiv_till < datum)
    // ska inte alls dyka upp i den dagens lista.
    const aktivaForDag = harvesters.filter(h => !h.aktiv_till || h.aktiv_till >= datum);
    const maskiner: MaskinDag[] = aktivaForDag.map(h => {
      const dmKey = `${datum}|${h.maskin_id}`;
      const agg = aggByKey.get(dmKey);
      const total = agg?.total_volym ?? 0;
      const dominant = agg?.dominant_huvudtyp ?? null;
      const trosk = tröskelFor(dominant);
      const kontroller = kalibByKey.get(dmKey) ?? [];

      let status: DagstatusMaskin;
      const harProblem = kontroller.some(k => k.status === "VARNING" || k.status === "FEL");
      if (total < trosk) {
        status = "inaktiv";
      } else if (kontroller.length === 0) {
        status = "saknas";
      } else if (harProblem) {
        status = "varning";
      } else {
        status = "komplett";
      }

      // huvudtyp_okand bara relevant när maskinen faktiskt producerade men ingen huvudtyp gick att slå upp
      const huvudtyp_okand = total > 0 && dominant === null;

      return {
        maskin_id: h.maskin_id,
        tillverkare: h.tillverkare,
        modell: h.modell,
        status,
        volym_m3sub: round1(total),
        huvudtyp: dominant,
        huvudtyp_okand,
        trosklar: { min_volym_m3sub: trosk },
        kontroller: kontroller.map(k => ({ id: k.id, tradslag: k.tradslag, status: k.status, filnamn: k.filnamn })),
      };
    });

    // Aggregerad dagstatus
    let dagstatus: Dagstatus;
    if (maskiner.every(m => m.status === "inaktiv")) {
      dagstatus = "inaktiv";
    } else if (maskiner.some(m => m.status === "varning")) {
      dagstatus = "varning";
    } else if (maskiner.some(m => m.status === "saknas")) {
      dagstatus = "saknas";
    } else {
      dagstatus = "komplett";
    }

    dagar.push({ datum, veckodag, status: dagstatus, maskiner });
  }

  const sammanfattning = {
    produktionsdagar: dagar.filter(d => d.status !== "inaktiv").length,
    kompletta: dagar.filter(d => d.status === "komplett").length,
    saknas: dagar.filter(d => d.status === "saknas").length,
    varningar: dagar.filter(d => d.status === "varning").length,
    okand_huvudtyp_dagar: dagar.filter(d => d.maskiner.some(m => m.huvudtyp_okand)).length,
  };

  return NextResponse.json({ manad, dagar, sammanfattning });
}
