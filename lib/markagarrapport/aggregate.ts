// Huvudpipeline för markägarrapport — slutavverkning.
//
// Identifier-mappning:
//   route-param objekt_id (text) = dim_objekt.objekt_id = vo_nummer
//   objekt.id (uuid) hämtas via vo_nummer-join för hpr_filer-uppslag
//   detalj_stock/detalj_stam joinas direkt på text-id
//
// Pagination: detalj_stock och detalj_stam överstiger 1000 rader för
// realistiska avverkningar. Använd fetchAll-helpern.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AggregateResult, MarkagarRapport } from './types';
import {
  detectRot,
  normalizeTradslag,
  tradslagDisplay,
} from './detect';
import {
  massaRefPerMaskin,
  timmerSnittGranPerMaskin,
  loadPrismatris,
  getPrisForStock,
  harledGrupp,
  type DetaljStockRow,
} from './pris';
import { bmavForlust, avkapRaddat, klassificeraAvkap } from './vardering';

interface SortimentRow {
  sortiment_id: string;
  maskin_id: string;
  namn: string | null;
  fargmarkning?: boolean | null;
}

interface Options {
  /** Hoppa över atgard='slutavverkning'-checken — för debug mot gallring. */
  bypassAtgardCheck?: boolean;
  /** Inkludera mellansiffror (massa-pris, timmer-pris per maskin) i svaret. */
  includeDebug?: boolean;
  /** Begränsa till första N hpr-filer + filtrera detalj_stock/detalj_stam på deras filnamn.
   *  Används för verifiering mot stora gallringsobjekt utan att timeout:a. */
  limitToFirstNFiles?: number;
}

async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const out: T[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await build(from, to);
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < pageSize) break;
  }
  return out;
}

function parseStockKey(sk: string): { stem_key: string; log_key: number } {
  // Nytt format efter dedupe-fix: "{stem_key}_{log_key}"
  const m2 = /^(\d+)_(\d+)$/.exec(sk);
  if (m2) return { stem_key: m2[1], log_key: parseInt(m2[2], 10) };
  // Gammalt format med filnamn: "{stem_key}_{log_key}_{filnamn}"
  const m3 = /^(\d+)_(\d+)_(.+)$/.exec(sk);
  if (m3) return { stem_key: m3[1], log_key: parseInt(m3[2], 10) };
  return { stem_key: sk, log_key: 0 };
}

export async function aggregateMarkagarRapport(
  supabase: SupabaseClient,
  objektIdText: string,
  opts: Options = {},
): Promise<AggregateResult> {
  // 1. dim_objekt + atgard-gate
  const { data: dimObjekt } = await supabase
    .from('dim_objekt')
    .select('objekt_id, object_name, skogsagare, atgard, areal_ha, vo_nummer')
    .eq('objekt_id', objektIdText)
    .maybeSingle();

  if (!dimObjekt) return { status: 'objekt_saknas' };

  const atgardLower = (dimObjekt.atgard ?? '').toLowerCase();
  if (!opts.bypassAtgardCheck && atgardLower !== 'slutavverkning') {
    return { status: 'ej_implementerad', atgard: dimObjekt.atgard };
  }

  // 2. objekt-uuid via vo_nummer + areal-fallback
  const { data: objektRow } = await supabase
    .from('objekt')
    .select('id, areal, namn')
    .eq('vo_nummer', objektIdText)
    .maybeSingle();
  const objektUuid: string | null = objektRow?.id ?? null;

  const yta_ha: number | null =
    objektRow?.areal != null ? Number(objektRow.areal)
    : dimObjekt.areal_ha != null ? Number(dimObjekt.areal_ha)
    : null;
  const yta_kalla: 'objekt.areal' | 'dim_objekt.areal_ha' | null =
    objektRow?.areal != null ? 'objekt.areal'
    : dimObjekt.areal_ha != null ? 'dim_objekt.areal_ha'
    : null;

  // 3. hpr_filer (uuid-join)
  let hprFiler: Array<{ id: string; maskin_id: string | null; filnamn: string }> = [];
  if (objektUuid) {
    const { data } = await supabase
      .from('hpr_filer')
      .select('id, maskin_id, filnamn')
      .eq('objekt_id', objektUuid);
    hprFiler = data ?? [];
  }
  if (hprFiler.length === 0) return { status: 'ingen_data', reason: 'inga_hpr_filer' };

  // Begränsning för diagnostik-körningar mot stora dataset
  if (opts.limitToFirstNFiles && opts.limitToFirstNFiles > 0) {
    hprFiler = hprFiler.slice(0, opts.limitToFirstNFiles);
  }
  const filnamnFilter = opts.limitToFirstNFiles
    ? hprFiler.map(f => f.filnamn)
    : null;

  // 4. hpr_stammar — endast för bio_energy_adaption + total_volym (referens)
  const hprFilerIds = hprFiler.map(f => f.id);
  const hprStammar = await fetchAll<{
    hpr_fil_id: string; stam_nummer: number | null;
    tradslag: string | null; dbh: number | null;
    lat: number | null; lng: number | null;
    total_volym: number | null; sortiment: string | null;
    bio_energy_adaption: string | null;
  }>((from, to) => supabase
    .from('hpr_stammar')
    .select('hpr_fil_id, stam_nummer, tradslag, dbh, lat, lng, total_volym, sortiment, bio_energy_adaption')
    .in('hpr_fil_id', hprFilerIds)
    .range(from, to)
  );

  // 5. detalj_stock + detalj_stam (paginerat)
  const stocksRaw = await fetchAll<{
    stock_key: string; stem_key: string | null; log_key: number | null;
    maskin_id: string;
    sortiment_id: string | null; sortiment_namn: string | null;
    volym_m3sub: number | string | null; volym_m3sob: number | string | null;
    langd_cm: number | null;
    toppdia_ob_mm: number | null; toppdia_ub_mm: number | null;
    kaporsak: string | null;
    latitude: number | null; longitude: number | null;
    filnamn: string | null;
  }>((from, to) => {
    let q = supabase
      .from('detalj_stock')
      .select('stock_key, stem_key, log_key, maskin_id, sortiment_id, sortiment_namn, volym_m3sub, volym_m3sob, langd_cm, toppdia_ob_mm, toppdia_ub_mm, kaporsak, latitude, longitude, filnamn')
      .eq('objekt_id', objektIdText);
    if (filnamnFilter) q = q.in('filnamn', filnamnFilter);
    return q.range(from, to);
  });
  if (stocksRaw.length === 0) return { status: 'ingen_data', reason: 'ingen_detalj_stock' };

  const stammarRaw = await fetchAll<{
    stam_key: string; dbh_mm: number | null;
    latitude: number | null; longitude: number | null;
    tradslag_id: string | null; stem_grade: number | null;
    stubbbehandling: boolean | string | null;
    manuell_frikap: boolean | string | null;
    tidpunkt: string | null;
    filnamn: string | null; maskin_id: string;
  }>((from, to) => {
    let q = supabase
      .from('detalj_stam')
      .select('stam_key, dbh_mm, latitude, longitude, tradslag_id, stem_grade, stubbbehandling, manuell_frikap, tidpunkt, filnamn, maskin_id')
      .eq('objekt_id', objektIdText);
    if (filnamnFilter) q = q.in('filnamn', filnamnFilter);
    return q.range(from, to);
  });

  // 6. Sortiment + grupp (per maskin)
  // Plocka maskin_id från BÅDE hpr_filer och detalj_stam — gallrings-importer kan ha
  // null på hpr_filer.maskin_id men detalj_stam.maskin_id är alltid satt.
  const maskinIds = Array.from(new Set([
    ...hprFiler.map(f => f.maskin_id),
    ...stammarRaw.map(s => s.maskin_id),
    ...stocksRaw.map(s => s.maskin_id),
  ].filter((m): m is string => !!m)));
  const { data: sortRowsRaw } = await supabase
    .from('dim_sortiment')
    .select('sortiment_id, maskin_id, namn, fargmarkning')
    .in('maskin_id', maskinIds);
  const sortRows = (sortRowsRaw ?? []) as SortimentRow[];
  const sortimentById = new Map<string, SortimentRow>(sortRows.map(s => [s.sortiment_id, s]));

  const sortIds = sortRows.map(s => s.sortiment_id);
  const { data: gruppRows } = sortIds.length > 0
    ? await supabase
        .from('dim_sortiment_grupp')
        .select('sortiment_id, grupp')
        .in('sortiment_id', sortIds)
    : { data: [] as Array<{ sortiment_id: string; grupp: string | null }> };
  const gruppById = new Map<string, string | null>(
    (gruppRows ?? []).map(g => [g.sortiment_id, g.grupp])
  );

  // 6b. Prismatris (en query, returnerar sorterad Map för O(N) lookup per stock)
  const prismatris = await loadPrismatris(supabase, sortIds);

  // 7. Tradslag-mappning (detalj_stam.tradslag_id → text-namn via dim_tradslag)
  const tradslagIds = Array.from(new Set(
    stammarRaw.map(s => s.tradslag_id).filter((t): t is string => !!t)
  ));
  const { data: dimTradslagRows } = tradslagIds.length > 0
    ? await supabase
        .from('dim_tradslag')
        .select('tradslag_id, namn')
        .in('tradslag_id', tradslagIds)
    : { data: [] as Array<{ tradslag_id: string; namn: string | null }> };
  const tradslagNamnById = new Map<string, string>(
    (dimTradslagRows ?? []).map(t => [t.tradslag_id, normalizeTradslag(t.namn)])
  );

  // 8. fakt_skift → operatör
  const datumSet = new Set<string>();
  for (const s of stammarRaw) {
    if (s.tidpunkt) datumSet.add(String(s.tidpunkt).slice(0, 10));
  }
  let operatorNamn = new Set<string>();
  if (datumSet.size > 0 && maskinIds.length > 0) {
    const { data: skiftRader } = await supabase
      .from('fakt_skift')
      .select('datum, maskin_id, operator_id')
      .in('datum', Array.from(datumSet))
      .in('maskin_id', maskinIds);
    const operatorIds = Array.from(new Set(
      (skiftRader ?? []).map(s => s.operator_id).filter((o): o is string => !!o)
    ));
    if (operatorIds.length > 0) {
      const { data: opRows } = await supabase
        .from('dim_operator')
        .select('operator_id, operator_namn')
        .in('operator_id', operatorIds);
      operatorNamn = new Set(
        (opRows ?? []).map(o => o.operator_namn).filter((n): n is string => !!n)
      );
    }
  }

  // 9. Maskin-info
  const { data: maskinRows } = await supabase
    .from('dim_maskin')
    .select('maskin_id, modell')
    .in('maskin_id', maskinIds);
  const maskinModellById = new Map<string, string>(
    (maskinRows ?? []).map(m => [m.maskin_id, m.modell ?? ''])
  );

  // 10. Bygg per-stam-strukturer
  // Använd separata stem_key/log_key-kolumner när de finns; fallback till stock_key-parsing
  // (för historiska rader importerade före dedupe-fixen).
  type ParsedStock = { stem_key: string; log_key: number; row: typeof stocksRaw[number] };
  const parsedStocks: ParsedStock[] = stocksRaw.map(r => {
    if (r.stem_key && r.log_key != null) {
      return { stem_key: r.stem_key, log_key: r.log_key, row: r };
    }
    const p = parseStockKey(r.stock_key);
    return { stem_key: p.stem_key, log_key: p.log_key, row: r };
  });

  // {stem_key::filnamn} → sorterade stocks
  const stocksPerStam = new Map<string, ParsedStock[]>();
  for (const p of parsedStocks) {
    const key = `${p.stem_key}::${p.row.filnamn ?? ''}`;
    const arr = stocksPerStam.get(key) ?? [];
    arr.push(p);
    stocksPerStam.set(key, arr);
  }
  Array.from(stocksPerStam.values()).forEach(arr =>
    arr.sort((a: ParsedStock, b: ParsedStock) => a.log_key - b.log_key)
  );

  // {stam_key::filnamn} → stam-rad
  const stamByKey = new Map<string, typeof stammarRaw[number]>();
  for (const s of stammarRaw) {
    stamByKey.set(`${s.stam_key}::${s.filnamn ?? ''}`, s);
  }

  // Anrika stocks med stam_tradslag, langd_cm, toppdia_ub_mm för pris-uppslag
  const enrichedStocks: DetaljStockRow[] = parsedStocks.map(p => {
    const stam = stamByKey.get(`${p.stem_key}::${p.row.filnamn ?? ''}`);
    const tradslag = stam?.tradslag_id
      ? tradslagNamnById.get(stam.tradslag_id) ?? ''
      : '';
    return {
      stock_key: p.row.stock_key,
      maskin_id: p.row.maskin_id,
      sortiment_id: p.row.sortiment_id,
      sortiment_namn: p.row.sortiment_namn,
      volym_m3sub: Number(p.row.volym_m3sub) || 0,
      langd_cm: p.row.langd_cm != null ? Number(p.row.langd_cm) : null,
      toppdia_ub_mm: p.row.toppdia_ub_mm != null ? Number(p.row.toppdia_ub_mm) : null,
      filnamn: p.row.filnamn,
      stam_tradslag: tradslag,
    };
  });

  // 11. Pris-referenser — räknas från avverkningens egna stocks via prismatris
  const massaPerMaskin = massaRefPerMaskin(enrichedStocks, prismatris);
  const timmerPerMaskin = timmerSnittGranPerMaskin(enrichedStocks, prismatris, gruppById);

  // 12. Per-stam-aggregering
  let bmavCount = 0;
  let avkapCount = 0;
  let grade9Count = 0;
  let granStammar = 0;
  let totalStammar = 0;
  let totalVolym = 0;
  let rotpaverkadVolym = 0;
  let totalForlust = 0;
  let totalRaddat = 0;
  let raddadVolym = 0;

  const avkapUtfall = { lyckad: 0, misslyckad: 0, avkap_igen: 0, ovrigt: 0 };
  const kartaStammar: MarkagarRapport['karta']['stammar'] = [];
  const tradslagAcc = new Map<string, { volym: number; stammar: number; sumDbh: number; nDbh: number }>();

  for (const stam of stammarRaw) {
    totalStammar += 1;
    const stamKey = `${stam.stam_key}::${stam.filnamn ?? ''}`;
    const tradslag = stam.tradslag_id
      ? tradslagNamnById.get(stam.tradslag_id) ?? ''
      : '';
    if (tradslag === 'GRAN') granStammar += 1;

    const stocks = stocksPerStam.get(stamKey) ?? [];
    const totalStamVolym = stocks.reduce(
      (sum, s) => sum + (Number(s.row.volym_m3sub) || 0), 0
    );
    totalVolym += totalStamVolym;

    const ts_acc = tradslagAcc.get(tradslag)
      ?? { volym: 0, stammar: 0, sumDbh: 0, nDbh: 0 };
    ts_acc.volym += totalStamVolym;
    ts_acc.stammar += 1;
    if (stam.dbh_mm != null) {
      ts_acc.sumDbh += Number(stam.dbh_mm);
      ts_acc.nDbh += 1;
    }
    tradslagAcc.set(tradslag, ts_acc);

    const firstStock = stocks[0];
    const firstStockNamn = firstStock?.row.sortiment_namn ?? '';
    const rotTyp = detectRot({
      tradslag,
      dbh_mm: stam.dbh_mm != null ? Number(stam.dbh_mm) : null,
      firstStockNamn,
      stemGrade: stam.stem_grade != null ? Number(stam.stem_grade) : null,
    });

    if (stam.latitude != null && stam.longitude != null) {
      kartaStammar.push({
        lat: Number(stam.latitude),
        lng: Number(stam.longitude),
        dbh_mm: stam.dbh_mm != null ? Number(stam.dbh_mm) : null,
        rot_typ: rotTyp,
        tradslag,
      });
    }

    if (rotTyp === 'bmav') {
      bmavCount += 1;
      rotpaverkadVolym += totalStamVolym;
      const massaPris = massaPerMaskin.get(stam.maskin_id) ?? 0;
      const timmerPris = timmerPerMaskin.get(stam.maskin_id) ?? 0;
      if (firstStock && massaPris > 0 && timmerPris > 0) {
        totalForlust += bmavForlust(
          Number(firstStock.row.volym_m3sub) || 0,
          timmerPris,
          massaPris,
        );
      }
    } else if (rotTyp === 'avkap') {
      avkapCount += 1;
      rotpaverkadVolym += totalStamVolym;
      const stock2 = stocks[1];
      const massaPris = massaPerMaskin.get(stam.maskin_id) ?? 0;
      if (firstStock && stock2 && massaPris > 0) {
        const stock2Pris = getPrisForStock(
          prismatris,
          stock2.row.sortiment_id,
          stock2.row.langd_cm != null ? Number(stock2.row.langd_cm) : null,
          stock2.row.toppdia_ub_mm != null ? Number(stock2.row.toppdia_ub_mm) : null,
        ) ?? 0;
        if (stock2Pris > 0) {
          totalRaddat += avkapRaddat(
            Number(firstStock.row.volym_m3sub) || 0,
            Number(stock2.row.volym_m3sub) || 0,
            stock2Pris,
            massaPris,
          );
        }
        const stock2Grupp = stock2.row.sortiment_id
          ? gruppById.get(stock2.row.sortiment_id) ?? null
          : null;
        const utfall = klassificeraAvkap(stock2.row.sortiment_namn, stock2Grupp);
        if (utfall === 'lyckad') {
          avkapUtfall.lyckad += 1;
          raddadVolym += Number(stock2.row.volym_m3sub) || 0;
        }
        else if (utfall === 'misslyckad') avkapUtfall.misslyckad += 1;
        else if (utfall === 'avkap-igen') avkapUtfall.avkap_igen += 1;
        else avkapUtfall.ovrigt += 1;
      }
    } else if (rotTyp === 'grade9') {
      grade9Count += 1;
      rotpaverkadVolym += totalStamVolym;
    }
  }

  // 13. Virkesvärde — pris-uppslag per stock i prismatrisen
  let virkesvarde = 0;
  for (const s of enrichedStocks) {
    const pris = getPrisForStock(prismatris, s.sortiment_id, s.langd_cm, s.toppdia_ub_mm);
    if (pris == null) continue;
    virkesvarde += s.volym_m3sub * pris;
  }

  // 14. Trädslag-array (sorterat på volym)
  const tradslagArr = Array.from(tradslagAcc.entries())
    .filter(([k]) => k !== '')
    .map(([k, v]) => ({
      namn: tradslagDisplay(k),
      volym_m3sub: v.volym,
      andel_pct: totalVolym > 0 ? (v.volym / totalVolym) * 100 : 0,
      stammar: v.stammar,
      medeldiameter_cm: v.nDbh > 0 ? (v.sumDbh / v.nDbh) / 10 : null,
    }))
    .sort((a, b) => b.volym_m3sub - a.volym_m3sub);

  // 15. Sortiment-tabell — gruppera på namn enligt design (dubbletter med
  // samma sortiment_namn slås ihop, dimensions-info används bara internt för pris).
  const sortimentAcc = new Map<string, {
    stockar: number; volym: number; varde: number;
    namn: string; tradslag: string;
  }>();
  for (const s of enrichedStocks) {
    if (!s.sortiment_id) continue;
    const namn = s.sortiment_namn ?? '';
    const groupKey = namn || s.sortiment_id;
    const pris = getPrisForStock(prismatris, s.sortiment_id, s.langd_cm, s.toppdia_ub_mm) ?? 0;
    const a = sortimentAcc.get(groupKey) ?? {
      stockar: 0, volym: 0, varde: 0,
      namn,
      tradslag: s.stam_tradslag ?? '',
    };
    a.stockar += 1;
    a.volym += s.volym_m3sub;
    a.varde += s.volym_m3sub * pris;
    sortimentAcc.set(groupKey, a);
  }
  const sortimentArr = Array.from(sortimentAcc.entries())
    .map(([gk, v]) => ({
      sortiment_id: gk,
      namn: v.namn,
      tradslag: v.tradslag,
      klass: null as string | null,
      stockar: v.stockar,
      volym_m3sub: v.volym,
      varde_kr: v.varde,
    }))
    .sort((a, b) => b.varde_kr - a.varde_kr);

  // 15b. Fördelning per sortimentkategori (Timmer/Klentimmer/Kubb/Massa/Energi/Övrigt)
  const fordelningTotalVolym = sortimentArr.reduce((s, r) => s + r.volym_m3sub, 0);
  const fordelningTotalVarde = sortimentArr.reduce((s, r) => s + r.varde_kr, 0);
  const fordelningAcc = new Map<string, { volym: number; varde: number }>();
  for (const r of sortimentArr) {
    const grupp = harledGrupp(r.namn, null) ?? 'Övrigt';
    const a = fordelningAcc.get(grupp) ?? { volym: 0, varde: 0 };
    a.volym += r.volym_m3sub;
    a.varde += r.varde_kr;
    fordelningAcc.set(grupp, a);
  }
  const fordelningOrdning = ['Timmer', 'Klentimmer', 'Kubb', 'Massa', 'Energi', 'Övrigt'];
  const fordelning = fordelningOrdning
    .map((g) => {
      const a = fordelningAcc.get(g);
      if (!a) return null;
      return {
        grupp: g,
        volym_m3sub: a.volym,
        volym_andel_pct: fordelningTotalVolym > 0 ? (a.volym / fordelningTotalVolym) * 100 : 0,
        varde_kr: a.varde,
        varde_andel_pct: fordelningTotalVarde > 0 ? (a.varde / fordelningTotalVarde) * 100 : 0,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x != null);

  // 16. Top-2 timmer-sortiment med dimensionsstaplar från prismatrisen.
  // Bygger om från enrichedStocks: top-2 grupp='Timmer'-sortiment efter volym,
  // sedan grupperar deras stocks per sortiment_id (en rad per matrisuppslag).
  const timmerSortimentByVolym = new Map<string, { namn: string; volym: number }>();
  for (const s of enrichedStocks) {
    if (!s.sortiment_id) continue;
    if (harledGrupp(s.sortiment_namn, gruppById.get(s.sortiment_id)) !== 'Timmer') continue;
    const namn = s.sortiment_namn ?? s.sortiment_id;
    const a = timmerSortimentByVolym.get(namn) ?? { namn, volym: 0 };
    a.volym += s.volym_m3sub;
    timmerSortimentByVolym.set(namn, a);
  }
  const top2TimmerNamn = Array.from(timmerSortimentByVolym.values())
    .sort((a, b) => b.volym - a.volym)
    .slice(0, 2)
    .map(t => t.namn);

  const timmerTop2: MarkagarRapport['timmer_top2'] = top2TimmerNamn.map(namn => {
    // Aggregera stocks med detta namn per (langd_min, dia_min) i prismatrisen
    const perDim = new Map<string, { dia_min: number; dia_max: number; volym: number; pris: number | null }>();
    let total = 0;
    for (const s of enrichedStocks) {
      if (s.sortiment_namn !== namn) continue;
      total += s.volym_m3sub;
      const arr = s.sortiment_id ? prismatris.get(s.sortiment_id) ?? [] : [];
      let row = null as { langd_min_cm: number; dia_min_mm: number; pris_per_m3: number } | null;
      for (const r of arr) {
        if (s.langd_cm != null && s.toppdia_ub_mm != null
            && r.langd_min_cm <= s.langd_cm && r.dia_min_mm <= s.toppdia_ub_mm) {
          row = r; break;
        }
      }
      if (!row) continue;
      const key = `${row.dia_min_mm}`;
      const a = perDim.get(key) ?? { dia_min: row.dia_min_mm, dia_max: row.dia_min_mm, volym: 0, pris: row.pris_per_m3 };
      a.volym += s.volym_m3sub;
      perDim.set(key, a);
    }
    return {
      sortiment_namn: namn,
      total_volym_m3sub: total,
      dimensioner: Array.from(perDim.values())
        .sort((a, b) => a.dia_min - b.dia_min)
        .map(d => ({
          dia_klass: `${d.dia_min}+ mm`,
          dia_min_mm: d.dia_min,
          dia_max_mm: d.dia_max,
          volym_m3sub: d.volym,
          pris_per_m3: d.pris,
        })),
    };
  });

  // 17. Stubbar
  let stubBehandlade = 0;
  let stubTotalt = 0;
  for (const stam of stammarRaw) {
    if (stam.stubbbehandling != null) {
      stubTotalt += 1;
      const v = stam.stubbbehandling;
      const behandlad = v === true
        || (typeof v === 'string' && /^(yes|y|true|behandlad)/i.test(v));
      if (behandlad) stubBehandlade += 1;
    }
  }

  // 18. Header-info — datum från första tidpunkt
  const tidpunkter = stammarRaw
    .map(s => s.tidpunkt ? String(s.tidpunkt).slice(0, 10) : null)
    .filter((t): t is string => !!t)
    .sort();
  const forsta_datum = tidpunkter[0] ?? null;

  const operatorStr = operatorNamn.size === 0 ? '–'
    : operatorNamn.size === 1 ? Array.from(operatorNamn)[0]
    : 'Flera operatörer';

  const maskinStr = maskinIds.length === 1
    ? `${maskinModellById.get(maskinIds[0]) ?? ''} (${maskinIds[0]})`.trim()
    : maskinIds.length > 1 ? 'Flera maskiner' : '–';

  // 19. DTO
  const data: MarkagarRapport = {
    objekt: {
      objekt_id: objektIdText,
      namn: dimObjekt.object_name ?? null,
      skogsagare: dimObjekt.skogsagare ?? null,
      atgard: dimObjekt.atgard ?? null,
      forsta_datum,
      operator: operatorStr,
      maskin: maskinStr,
    },
    oversikt: {
      yta_ha,
      yta_kalla,
      stammar: totalStammar,
      volym_m3sub: totalVolym,
      virkesvarde_kr: virkesvarde,
    },
    karta: { stammar: kartaStammar },
    tradslag: tradslagArr,
    rotrota: {
      stammar_med_rot: bmavCount + avkapCount + grade9Count,
      bmav_count: bmavCount,
      avkap_count: avkapCount,
      grade9_count: grade9Count,
      pct_av_gran: granStammar > 0
        ? ((bmavCount + avkapCount) / granStammar) * 100
        : 0,
      rotpaverkad_volym_m3: rotpaverkadVolym,
      rotpaverkad_pct: totalVolym > 0
        ? (rotpaverkadVolym / totalVolym) * 100
        : 0,
      vardeforlust_kr: -totalForlust,
      vardeforlust_pct: virkesvarde > 0
        ? (totalForlust / virkesvarde) * 100
        : 0,
      rotandel_pct: totalStammar > 0
        ? ((bmavCount + avkapCount) / totalStammar) * 100
        : 0,
    },
    avkap_skicklighet: {
      totalt: avkapCount,
      lyckade: avkapUtfall.lyckad,
      raddat_kr: totalRaddat,
      raddad_volym_m3: raddadVolym,
      utfall: avkapUtfall,
    },
    fordelning,
    timmer_top2: timmerTop2,
    stubbar: { behandlade: stubBehandlade, totalt: stubTotalt },
    sortiment: sortimentArr,
  };

  if (opts.includeDebug) {
    data.debug = {
      massa_pris_per_maskin: Object.fromEntries(massaPerMaskin),
      timmer_pris_per_maskin: Object.fromEntries(timmerPerMaskin),
    };
  }

  // Tysta unused-varning för referensdata vi exponerar via debug-endpointen senare
  void hprStammar;

  return { status: 'ok', data };
}
