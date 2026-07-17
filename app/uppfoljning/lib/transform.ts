// Pure data-transformations för uppföljningsvyn.
// Inga sidoeffekter, ingen fetch, ingen React.

import type { UppfoljningData, Maskin, Forare, AvbrottRad, DieselDag } from '../UppfoljningVy';
import { G15_GRANS_SEK } from '@/lib/g15';

// ── Typer ─────────────────────────────────────────────────────────────────
export interface UppfoljningObjekt {
  vo_nummer: string;
  namn: string;
  typ: 'slutavverkning' | 'gallring';
  agare: string;
  areal: number;
  skordareModell: string | null;
  skordareStart: string | null;
  skordareSlut: string | null;
  skordareObjektId: string | null;
  skordareModellMaskinId: string | null;
  volymSkordare: number;
  stammar: number;
  skotareModell: string | null;
  skotareStart: string | null;
  skotareSlut: string | null;
  skotareObjektId: string | null;
  skotareModellMaskinId: string | null;
  volymSkotare: number;
  skotatArManuell: boolean;
  // Sista avverkningsdag = MAX(fakt_produktion.datum) — liggetidens ankare
  sistaAvverkning: string | null;
  // Tilldelad skotare (BARA maskinnamn, aldrig förare): planeringens
  // objekt.skotare_maskin_id primärt, dim-världens skotarrad som fallback
  tilldeladSkotare: string | null;
  antalLass: number;
  dieselTotal: number;
  dagar: number | null;
  status: 'pagaende' | 'avslutat';
  egenSkotning: boolean;
  grotSkotning: boolean;
  // GROT-anpassat avverkningsobjekt (dim_objekt.grot_anpassad). Skild från
  // grotSkotning (=risskotning, det separata skotarjobbet) — se hooken.
  grotAnpassad: boolean;
  externSkotning: boolean;
  externForetag: string;
  externPrisTyp: 'm3' | 'timme';
  externPris: number;
  externAntal: number;
  skordareLastDate: string | null;
  skotareLastDate: string | null;
}

export interface BuildUppfoljningDataInput {
  obj: UppfoljningObjekt;
  tidRows: any[];
  prodRows: any[];
  sortRows: any[];
  lassRows: any[];
  lassSortRows: any[];
  avbrottRows: any[];
  dimSort: any[];
  dimTradslag: any[];
  dimOperators: any[];
  dimMaskin: any[];
}

// ── Privat helper (parar med fmtDate i page.tsx) ─────────────────────────
function fmtDate(d: string | null): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });
}

// ── Tidsdata ──────────────────────────────────────────────────────────────
export function buildTid(rows: any[]) {
  let processing = 0, terrain = 0, otherWork = 0, maintenance = 0, disturbance = 0, avbrottSek = 0, rast = 0, kortStopp = 0, diesel = 0, engineTime = 0, tomgangTotal = 0;
  const perDag = new Map<string, any>();

  rows.forEach(r => {
    const p = r.processing_sek || 0;
    const t = r.terrain_sek || 0;
    const o = r.other_work_sek || 0;
    const m = r.maintenance_sek || 0;
    const di = r.disturbance_sek || 0;
    const ab = r.avbrott_sek || 0;
    const ra = r.rast_sek || 0;
    const ks = r.kort_stopp_sek || 0;
    const d = r.bransle_liter || 0;
    const et = r.engine_time_sek || 0;
    const tg = r.tomgang_sek || 0;

    processing += p; terrain += t; otherWork += o;
    maintenance += m; disturbance += di; avbrottSek += ab; rast += ra;
    kortStopp += ks; diesel += d; engineTime += et; tomgangTotal += tg;

    const datum = r.datum;
    if (datum) {
      const prev = perDag.get(datum) || { processing: 0, terrain: 0, otherWork: 0, maintenance: 0, disturbance: 0, rast: 0, kortStopp: 0, diesel: 0, tomgang: 0 };
      prev.processing += p; prev.terrain += t; prev.otherWork += o;
      prev.maintenance += m; prev.disturbance += di; prev.rast += ra;
      prev.kortStopp += ks; prev.diesel += d; prev.tomgang += tg;
      perDag.set(datum, prev);
    }
  });

  // G15 = processing + terrain (verifierat mot PONSSE-rapport på två maskiner).
  // other_work ingår INTE i G15 — visas som egen siffra där så behövs.
  const runtime = processing + terrain;
  const g0h = (runtime - kortStopp) / 3600;
  const g15h = runtime / 3600;

  const tidPerDag = Array.from(perDag.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([datum, v]) => ({
      datum,
      g15: (v.processing + v.terrain) / 3600,
      diesel: v.diesel,
    }));

  return {
    g15: Math.round(g15h * 10) / 10,
    g0: Math.round(g0h * 10) / 10,
    kortaStopp: kortStopp / 3600,
    avbrott: (maintenance + disturbance + avbrottSek) / 3600,
    rast: rast / 3600,
    tomgang: tomgangTotal / 3600,
    dieselTot: diesel,
    tidPerDag,
  };
}

// ── Avbrott ───────────────────────────────────────────────────────────────
export function deduplicateAvbrott(rows: any[]): any[] {
  // Group by datum+maskin_id+kategori_kod+typ+langd_sek, keep the entry with the longest duration (latest MOM file)
  const groups = new Map<string, any>();
  rows.forEach(r => {
    const key = `${r.datum}|${r.maskin_id}|${r.kategori_kod}|${r.typ}|${r.langd_sek}`;
    if (!groups.has(key)) groups.set(key, r);
  });
  return Array.from(groups.values());
}

export function buildAvbrott(rows: any[], opts: { g15Split?: boolean } = {}): AvbrottRad[] {
  const { g15Split = true } = opts;
  const deduped = deduplicateAvbrott(rows);
  // G15-splitten gäller SKÖRDARE: DownTime under gränsen är samma fenomen som
  // maskinens korta pauser och räknas in i "Korta pauser"-raden via
  // kortaAvbrottTimmar() — inte här. SKOTARE saknar korta pauser-begreppet
  // (kort_stopp_sek = 0) — deras rader visas OFILTRERADE med riktiga kategorier
  // (g15Split: false). Se lib/g15.ts.
  const urval = g15Split
    ? deduped.filter((r: any) => (r.langd_sek || 0) >= G15_GRANS_SEK)
    : deduped;
  const m = new Map<string, { tid: number; antal: number; typ: string }>();
  urval.forEach(r => {
    const orsak = r.kategori_kod || r.typ || 'Övrigt';
    const typ = r.typ || 'Övrigt';
    const prev = m.get(orsak) || { tid: 0, antal: 0, typ };
    prev.tid += (r.langd_sek || 0);
    prev.antal += 1;
    m.set(orsak, prev);
  });
  return Array.from(m.entries())
    .map(([orsak, v]) => ({ orsak, typ: v.typ, tid: `${(v.tid / 3600).toFixed(1)}h`, antal: v.antal }))
    .sort((a, b) => parseFloat(b.tid) - parseFloat(a.tid));
}

// Korta pauser-hemflytt — BARA SKÖRDARE: DownTime under G15-gränsen är samma
// fenomen som maskinens korta pauser (kort_stopp_sek) — verifierat i MOM-källor
// (objektbytesglapp, 0 väggklocke-överlapp → adderbara utan dubbelräkning).
// Används ALDRIG för skotare (de saknar korta pauser-begreppet). Timmar.
export function kortaAvbrottTimmar(rows: any[]): number {
  return deduplicateAvbrott(rows)
    .filter((r: any) => (r.langd_sek || 0) < G15_GRANS_SEK)
    .reduce((s: number, r: any) => s + (r.langd_sek || 0), 0) / 3600;
}

// ── Förare ────────────────────────────────────────────────────────────────
export function opNamn(opId: string, operatorMap: Map<string, string>): string {
  // Try dim_operator lookup first
  const namn = operatorMap.get(opId);
  if (namn) return namn;
  // Fallback: strip maskin_id prefix (format: "maskinId_opKey")
  const idx = opId.indexOf('_');
  return idx >= 0 ? opId.substring(idx + 1) : opId;
}

export function buildForare(rows: any[], operatorMap: Map<string, string>): { aktiv: string; tidigare: Forare[] } {
  // Group by operator_id, track first/last date
  const opDates = new Map<string, { min: string; max: string }>();
  rows.forEach((r: any) => {
    const opId = r.operator_id;
    if (!opId) return;
    const d = r.datum;
    if (!d) return;
    const prev = opDates.get(opId);
    if (!prev) {
      opDates.set(opId, { min: d, max: d });
    } else {
      if (d < prev.min) prev.min = d;
      if (d > prev.max) prev.max = d;
    }
  });
  if (opDates.size === 0) return { aktiv: '', tidigare: [] };
  // Sort by last date descending — most recent is aktiv
  const sorted = Array.from(opDates.entries())
    .sort(([, a], [, b]) => b.max.localeCompare(a.max));
  const aktiv = opNamn(sorted[0][0], operatorMap);
  const tidigare: Forare[] = sorted.slice(1).map(([opId, dates]) => ({
    namn: opNamn(opId, operatorMap),
    fran: fmtDate(dates.min),
    till: fmtDate(dates.max),
  }));
  return { aktiv, tidigare };
}

// ── Huvudtransform ────────────────────────────────────────────────────────
export function buildUppfoljningData(input: BuildUppfoljningDataInput): UppfoljningData {
  const { obj, tidRows, prodRows, sortRows, lassRows, lassSortRows, avbrottRows, dimSort, dimTradslag, dimOperators, dimMaskin } = input;

  const sortMap = new Map<string, string>();
  dimSort.forEach((s: any) => { if (s.namn) sortMap.set(s.sortiment_id, s.namn); });

  const tradslagMap = new Map<string, string>();
  dimTradslag.forEach((t: any) => { if (t.namn) tradslagMap.set(t.tradslag_id, t.namn); });

  const operatorMap = new Map<string, string>();
  dimOperators.forEach((o: any) => {
    const namn = o.operator_namn || o.operator_key || '';
    if (namn) operatorMap.set(o.operator_id, namn);
  });

  // Build sets of harvester/forwarder maskin_ids from dim_maskin
  const harvesterIds = new Set<string>();
  const forwarderIds = new Set<string>();
  dimMaskin.forEach((m: any) => {
    const typ = (m.maskin_typ || '').toLowerCase();
    if (typ === 'harvester' || typ === 'skördare') harvesterIds.add(m.maskin_id);
    else if (typ === 'forwarder' || typ === 'skotare') forwarderIds.add(m.maskin_id);
  });

  const skId = obj.skordareObjektId;
  const stId = obj.skotareObjektId;
  // When skördare and skotare share the same objekt_id, filter by machine type
  const shared = skId && stId && skId === stId;
  // For shared objekt: keep only harvesters for skördare, only forwarders for skotare
  const skTidRows = skId ? tidRows.filter((r: any) => r.objekt_id === skId && (!shared || !forwarderIds.has(r.maskin_id))) : [];
  const stTidRows = stId ? tidRows.filter((r: any) => r.objekt_id === stId && (!shared || !harvesterIds.has(r.maskin_id))) : [];
  const skTid = buildTid(skTidRows);
  const stTid = buildTid(stTidRows);

  // Production aggregation — exclude forwarders when shared objekt_id
  const skProd = skId ? prodRows.filter((r: any) => r.objekt_id === skId && (!shared || !forwarderIds.has(r.maskin_id))) : [];
  let totalStammar = 0, totalVol = 0;
  skProd.forEach((p: any) => {
    totalStammar += p.stammar || 0;
    totalVol += p.volym_m3sub || 0;
  });
  const medelstam = totalStammar > 0 ? Math.round((totalVol / totalStammar) * 100) / 100 : 0;
  const stamPerG15 = skTid.g15 > 0 ? Math.round((totalStammar / skTid.g15) * 10) / 10 : 0;
  const m3PerG15Sk = skTid.g15 > 0 ? Math.round((totalVol / skTid.g15) * 10) / 10 : 0;

  // Produktion per dag (skördare)
  const prodPerDagMap = new Map<string, number>();
  skProd.forEach((r: any) => {
    if (!r.datum) return;
    prodPerDagMap.set(r.datum, (prodPerDagMap.get(r.datum) || 0) + (r.volym_m3sub || 0));
  });
  const prodSkordarePerDag = Array.from(prodPerDagMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([d, m3]) => {
      const date = new Date(d);
      return { datum: `${date.getDate()}/${date.getMonth() + 1}`, m3: Math.round(m3) };
    });

  // Per trädslag
  const tradslagAgg = new Map<string, number>();
  skProd.forEach((r: any) => {
    const ts = (r.tradslag_id && tradslagMap.get(r.tradslag_id)) || r.tradslag_id || 'Övrigt';
    tradslagAgg.set(ts, (tradslagAgg.get(ts) || 0) + (r.volym_m3sub || 0));
  });
  const totalTradslagVol = Array.from(tradslagAgg.values()).reduce((a, b) => a + b, 0);
  const tradslag = Array.from(tradslagAgg.entries())
    .map(([namn, vol]) => ({ namn, pct: totalTradslagVol > 0 ? Math.round((vol / totalTradslagVol) * 100) : 0 }))
    .sort((a, b) => b.pct - a.pct);

  // Sortiment — use FPR (skotare/fakt_lass_sortiment) if available, fallback to HPR (skördare/fakt_sortiment)
  const sortAgg = new Map<string, number>();
  if (lassSortRows.length > 0) {
    lassSortRows.forEach((r: any) => {
      const namn = r.sortiment_namn || sortMap.get(r.sortiment_id) || r.sortiment_id || 'Övrigt';
      sortAgg.set(namn, (sortAgg.get(namn) || 0) + (r.volym_m3sub || 0));
    });
  } else {
    const skSort = skId ? sortRows.filter((r: any) => r.objekt_id === skId) : [];
    skSort.forEach((r: any) => {
      const namn = sortMap.get(r.sortiment_id) || r.sortiment_id || 'Övrigt';
      sortAgg.set(namn, (sortAgg.get(namn) || 0) + (r.volym_m3sub || 0));
    });
  }
  const sortiment = Array.from(sortAgg.entries())
    .map(([namn, vol]) => ({ namn, m3: Math.round(vol) }))
    .sort((a, b) => b.m3 - a.m3);

  // Filter avbrott: match by objekt_id OR by maskin_id (for data stored under different objekt_ids)
  // Use fakt_tid date range + object work period to scope maskin_id-based matches
  const skDatumSet = new Set(skTidRows.map((r: any) => r.datum).filter(Boolean));
  const stDatumSet = new Set(stTidRows.map((r: any) => r.datum).filter(Boolean));
  const inDateRange = (datum: string | null, start: string | null, slut: string | null): boolean => {
    if (!datum || !start) return false;
    return datum >= start && (!slut || datum <= slut);
  };
  const skAvbrott = skId ? avbrottRows.filter((r: any) => {
    if (harvesterIds.has(r.maskin_id)) {
      return r.objekt_id === skId || skDatumSet.has(r.datum) || inDateRange(r.datum, obj.skordareStart, obj.skordareSlut);
    }
    return r.objekt_id === skId && !shared;
  }) : [];
  const stAvbrott = stId ? avbrottRows.filter((r: any) => {
    if (forwarderIds.has(r.maskin_id)) {
      return r.objekt_id === stId || stDatumSet.has(r.datum) || inDateRange(r.datum, obj.skotareStart, obj.skotareSlut);
    }
    return r.objekt_id === stId && !shared;
  }) : [];

  // Lass
  let totalLassVol = 0, totalKor = 0;
  const lassPerDagMap = new Map<string, { lass: number; m3: number }>();
  lassRows.forEach((l: any) => {
    totalLassVol += l.volym_m3sub || 0;
    totalKor += l.korstracka_m || 0;
    if (l.datum) {
      const prev = lassPerDagMap.get(l.datum) || { lass: 0, m3: 0 };
      prev.lass += 1;
      prev.m3 += (l.volym_m3sub || 0);
      lassPerDagMap.set(l.datum, prev);
    }
  });
  const antalLass = lassRows.length;
  const snittLass = antalLass > 0 ? Math.round((totalLassVol / antalLass) * 10) / 10 : 0;
  const lassPerG15 = stTid.g15 > 0 ? Math.round((antalLass / stTid.g15) * 100) / 100 : 0;
  const m3PerG15St = stTid.g15 > 0 ? Math.round((obj.volymSkotare / stTid.g15) * 10) / 10 : 0;
  const avstand = antalLass > 0 ? Math.round(totalKor / antalLass) : 0;
  const lassPerDag = Array.from(lassPerDagMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([d, v]) => {
      const date = new Date(d);
      return { datum: `${date.getDate()}/${date.getMonth() + 1}`, lass: v.lass, m3: Math.round(v.m3) };
    });

  // Diesel
  const dieselPerM3Sk = obj.volymSkordare > 0 ? Math.round((skTid.dieselTot / obj.volymSkordare) * 100) / 100 : 0;
  const dieselPerTimSk = skTid.g15 > 0 ? Math.round((skTid.dieselTot / skTid.g15) * 100) / 100 : 0;
  const dieselPerM3St = obj.volymSkotare > 0 ? Math.round((stTid.dieselTot / obj.volymSkotare) * 100) / 100 : 0;
  const dieselPerG15St = stTid.g15 > 0 ? Math.round((stTid.dieselTot / stTid.g15) * 100) / 100 : 0;

  const totalDiesel = Math.round(skTid.dieselTot) + Math.round(stTid.dieselTot);
  const totalDieselPerM3 = obj.volymSkordare > 0 ? Math.round((totalDiesel / obj.volymSkordare) * 100) / 100 : 0;

  // Kvar i skogen
  const volSk = obj.volymSkordare;
  const volSt = obj.volymSkotare;
  const framkort = volSk > 0 ? Math.round((volSt / volSk) * 100) : 0;
  const kvarPct = Math.max(0, 100 - framkort);

  // Build diesel per day
  const dieselSkordare: DieselDag[] = skTid.tidPerDag
    .filter(d => d.diesel > 0)
    .map(d => {
      const date = new Date(d.datum);
      return { datum: `${date.getDate()}/${date.getMonth() + 1}`, liter: Math.round(d.diesel) };
    });
  const dieselSkotare: DieselDag[] = stTid.tidPerDag
    .filter(d => d.diesel > 0)
    .map(d => {
      const date = new Date(d.datum);
      return { datum: `${date.getDate()}/${date.getMonth() + 1}`, liter: Math.round(d.diesel) };
    });

  const skForare = buildForare(skTidRows, operatorMap);
  const stForare = buildForare(stTidRows, operatorMap);

  // Build maskiner array
  const maskiner: Maskin[] = [];
  if (obj.skordareModell) {
    maskiner.push({
      typ: 'Skördare',
      modell: obj.skordareModell,
      start: fmtDate(obj.skordareStart),
      slut: obj.skordareSlut ? fmtDate(obj.skordareSlut) : 'pågår',
      aktivForare: skForare.aktiv,
      ...(skForare.tidigare.length > 0 ? { tidigareForare: skForare.tidigare } : {}),
    });
  }
  if (obj.skotareModell) {
    maskiner.push({
      typ: 'Skotare',
      modell: obj.skotareModell,
      start: fmtDate(obj.skotareStart),
      slut: obj.skotareSlut ? fmtDate(obj.skotareSlut) : 'pågår',
      aktivForare: stForare.aktiv,
      ...(stForare.tidigare.length > 0 ? { tidigareForare: stForare.tidigare } : {}),
    });
  }

  return {
    objektNamn: obj.namn,
    skordat: Math.round(volSk),
    skotat: Math.round(volSt),
    kvarPct,
    egenSkotning: obj.egenSkotning,
    grotSkotning: obj.grotSkotning,
    externSkotning: obj.externSkotning,
    externForetag: obj.externForetag,
    externPrisTyp: obj.externPrisTyp,
    externPris: obj.externPris,
    externAntal: obj.externAntal,
    maskiner,
    // V6 meta
    typ: obj.typ,
    areal: obj.areal,
    agare: obj.agare,
    status: obj.status,
    skordareModell: obj.skordareModell,
    skordareStart: obj.skordareStart,
    skordareSlut: obj.skordareSlut,
    skordareLastDate: obj.skordareLastDate,
    skotatArManuell: obj.skotatArManuell,
    skotareModell: obj.skotareModell,
    skotareStart: obj.skotareStart,
    skotareSlut: obj.skotareSlut,
    skotareLastDate: obj.skotareLastDate,
    operatorSkordare: skForare.aktiv || null,
    operatorSkotare: stForare.aktiv || null,
    prodSkordarePerDag,
    // Tid — all in hours
    skordareG15h: skTid.g15,
    skordareG0: skTid.g0,
    skordareTomgang: Math.round(skTid.tomgang * 10) / 10,
    skordareKortaStopp: Math.round((skTid.kortaStopp + kortaAvbrottTimmar(skAvbrott)) * 10) / 10,
    skordareRast: Math.round(skTid.rast * 10) / 10,
    skordareAvbrott: Math.round(skTid.avbrott * 10) / 10,
    skotareG15h: stTid.g15,
    skotareG0: stTid.g0,
    skotareTomgang: Math.round(stTid.tomgang * 10) / 10,
    // Skotare: rå kort_stopp_sek (= 0 i verkligheten — skotare har inga korta
    // pauser; ingen hemflytt av korta DownTime hit, de ligger i avbrottslistan).
    skotareKortaStopp: Math.round(stTid.kortaStopp * 10) / 10,
    skotareRast: Math.round(stTid.rast * 10) / 10,
    skotareAvbrott: Math.round(stTid.avbrott * 10) / 10,
    // Produktion
    skordareM3G15h: m3PerG15Sk,
    skordareStammarG15h: stamPerG15,
    skordareMedelstam: medelstam,
    skotareM3G15h: m3PerG15St,
    skotareLassG15h: lassPerG15,
    skotareSnittlass: snittLass,
    tradslag,
    sortiment,
    // Diesel
    dieselTotalt: totalDiesel,
    dieselPerM3: totalDieselPerM3,
    skordareL: Math.round(skTid.dieselTot),
    skordareL_M3: dieselPerM3Sk,
    skordareL_G15h: dieselPerTimSk,
    skotareL: Math.round(stTid.dieselTot),
    skotareL_M3: dieselPerM3St,
    skotareL_G15h: dieselPerG15St,
    dieselSkordare,
    dieselSkotare,
    // Avbrott — deduplicated totals from fakt_avbrott
    avbrottSkordare: buildAvbrott(skAvbrott),
    // Skördare: totalen räknar ENBART avbrott ≥ G15-gränsen — korta ingår i
    // "Korta pauser"-raden ovan (kortaAvbrottTimmar).
    avbrottSkordare_totalt: `${(deduplicateAvbrott(skAvbrott).filter((r: any) => (r.langd_sek || 0) >= G15_GRANS_SEK).reduce((s: number, r: any) => s + (r.langd_sek || 0), 0) / 3600).toFixed(1)}h`,
    // Skotare: INGEN G15-split — alla DownTime i lista + total (skotare saknar
    // korta pauser-begreppet; se lib/g15.ts).
    avbrottSkotare: buildAvbrott(stAvbrott, { g15Split: false }),
    avbrottSkotareTotalt: `${(deduplicateAvbrott(stAvbrott).reduce((s: number, r: any) => s + (r.langd_sek || 0), 0) / 3600).toFixed(1)}h`,
    // Skotarproduktion
    antalLass,
    snittlassM3: snittLass,
    lassG15h: lassPerG15,
    skotningsavstand: avstand,
    lassPerDag,
    // Balans
    skordareBalG15h: skTid.g15,
    skotareBalG15h: stTid.g15,
  };
}

// ── Empty-data (när ingen objekt_id finns att fetcha mot) ────────────────
export function buildEmptyData(obj: UppfoljningObjekt): UppfoljningData {
  return {
    objektNamn: obj.namn,
    skordat: 0, skotat: 0, kvarPct: 0, egenSkotning: obj.egenSkotning, grotSkotning: obj.grotSkotning,
    externSkotning: obj.externSkotning, externForetag: obj.externForetag, externPrisTyp: obj.externPrisTyp, externPris: obj.externPris, externAntal: obj.externAntal,
    maskiner: [],
    typ: obj.typ, areal: obj.areal, agare: obj.agare, status: obj.status,
    skordareModell: obj.skordareModell, skordareStart: obj.skordareStart, skordareSlut: obj.skordareSlut, skordareLastDate: obj.skordareLastDate,
    skotatArManuell: obj.skotatArManuell,
    skotareModell: obj.skotareModell, skotareStart: obj.skotareStart, skotareSlut: obj.skotareSlut, skotareLastDate: obj.skotareLastDate,
    operatorSkordare: null, operatorSkotare: null, prodSkordarePerDag: [],
    skordareG15h: 0, skordareG0: 0, skordareTomgang: 0, skordareKortaStopp: 0, skordareRast: 0, skordareAvbrott: 0,
    skotareG15h: 0, skotareG0: 0, skotareTomgang: 0, skotareKortaStopp: 0, skotareRast: 0, skotareAvbrott: 0,
    skordareM3G15h: 0, skordareStammarG15h: 0, skordareMedelstam: 0,
    skotareM3G15h: 0, skotareLassG15h: 0, skotareSnittlass: 0,
    tradslag: [], sortiment: [],
    dieselTotalt: 0, dieselPerM3: 0,
    skordareL: 0, skordareL_M3: 0, skordareL_G15h: 0,
    skotareL: 0, skotareL_M3: 0, skotareL_G15h: 0,
    dieselSkordare: [], dieselSkotare: [],
    avbrottSkordare: [], avbrottSkordare_totalt: '0h',
    avbrottSkotare: [], avbrottSkotareTotalt: '0h',
    antalLass: 0, snittlassM3: 0, lassG15h: 0, skotningsavstand: 0, lassPerDag: [],
    skordareBalG15h: 0, skotareBalG15h: 0,
  };
}
