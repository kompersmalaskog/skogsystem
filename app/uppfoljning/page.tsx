'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
import UppfoljningVy, { type UppfoljningData, type Maskin, type Forare, type AvbrottRad, type DieselDag } from './UppfoljningVy';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/* ── Design tokens ── */
const bg = '#000';
const text = '#fff';
const muted = 'rgba(255,255,255,0.4)';
const divider = 'rgba(255,255,255,0.08)';
const ff = 'system-ui, sans-serif';

/* ── Types ── */
interface UppfoljningObjekt {
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
  antalLass: number;
  dieselTotal: number;
  dagar: number | null;
  status: 'pagaende' | 'avslutat';
  egenSkotning: boolean;
}

/* ── Helpers ── */
function daysSince(dateStr: string): number {
  const d = new Date(dateStr);
  const now = new Date();
  return Math.max(0, Math.floor((now.getTime() - d.getTime()) / 864e5));
}
function daysBetween(a: string, b: string): number {
  return Math.max(0, Math.floor((new Date(b).getTime() - new Date(a).getTime()) / 864e5));
}
function fmtDate(d: string | null): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });
}
function fmtH(minutes: number): string {
  const h = Math.round(minutes * 10) / 10;
  return `${h.toFixed(1)}h`;
}

/* ── Data-processing helpers ── */
function getMachineType(maskin: any): 'skordare' | 'skotare' | 'unknown' {
  if (!maskin) return 'unknown';
  const cat = (maskin.maskin_typ || maskin.machineCategory || '').toLowerCase();
  if (cat.includes('skördare') || cat.includes('skordare') || cat.includes('harvester')) return 'skordare';
  if (cat.includes('skotare') || cat.includes('forwarder')) return 'skotare';
  return 'unknown';
}
function getMachineLabel(maskin: any): string {
  if (!maskin) return '';
  return [maskin.tillverkare, maskin.modell].filter(Boolean).join(' ');
}
function inferType(huvudtyp: string | undefined): 'slutavverkning' | 'gallring' {
  if (!huvudtyp) return 'slutavverkning';
  const t = huvudtyp.toLowerCase();
  if (t.includes('gallr')) return 'gallring';
  return 'slutavverkning';
}

/* ── ObjektKort — list item ── */
function ObjektKort({ obj, onClick }: { obj: UppfoljningObjekt; onClick: () => void }) {
  const vol = Math.round(obj.volymSkordare);
  return (
    <div onClick={onClick} style={{
      padding: '20px 0', cursor: 'pointer',
      borderBottom: `1px solid ${divider}`,
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    }}>
      <div>
        <div style={{ fontSize: 16, fontWeight: 600, color: text }}>{obj.namn}</div>
        <div style={{ fontSize: 13, color: muted, marginTop: 4 }}>{obj.agare}</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: text, fontVariantNumeric: 'tabular-nums' }}>{vol > 0 ? vol : '--'}</div>
        <div style={{ fontSize: 11, color: muted }}>m³</div>
      </div>
    </div>
  );
}

/* ── Detail view wrapper — fetches data and renders UppfoljningVy ── */
function ObjektDetalj({ obj, onBack }: { obj: UppfoljningObjekt; onBack: () => void }) {
  const [data, setData] = useState<UppfoljningData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const skId = obj.skordareObjektId;
      const stId = obj.skotareObjektId;
      const ids = [skId, stId].filter(Boolean) as string[];

      if (ids.length === 0) {
        setData(buildEmptyData(obj));
        setLoading(false);
        return;
      }

      const [tidRes, prodRes, sortRes, dimSortRes, dimTradslagRes, avbrottRes, lassRes, lassSortRes, dimOperatorRes] = await Promise.all([
        supabase.from('fakt_tid').select('datum, objekt_id, maskin_id, operator_id, processing_sek, terrain_sek, other_work_sek, maintenance_sek, disturbance_sek, rast_sek, kort_stopp_sek, bransle_liter, engine_time_sek, tomgang_sek').in('objekt_id', ids),
        supabase.from('fakt_produktion').select('objekt_id, volym_m3sub, stammar, processtyp, tradslag_id').in('objekt_id', ids),
        supabase.from('fakt_sortiment').select('objekt_id, sortiment_id, volym_m3sub, antal').in('objekt_id', ids),
        supabase.from('dim_sortiment').select('sortiment_id, namn'),
        supabase.from('dim_tradslag').select('tradslag_id, namn'),
        supabase.from('fakt_avbrott').select('objekt_id, maskin_id, typ, kategori_kod, langd_sek').in('objekt_id', ids),
        stId ? supabase.from('fakt_lass').select('objekt_id, datum, volym_m3sob, korstracka_m').eq('objekt_id', stId) : Promise.resolve({ data: [] }),
        stId ? supabase.from('fakt_lass_sortiment').select('objekt_id, sortiment_id, sortiment_namn, volym_m3sub').eq('objekt_id', stId) : Promise.resolve({ data: [] }),
        supabase.from('dim_operator').select('operator_id, operator_namn, operator_key'),
      ]);

      const tidRows = tidRes.data || [];
      const prodRows = prodRes.data || [];
      const sortRows = sortRes.data || [];
      const dimSort = dimSortRes.data || [];
      const dimTradslag = dimTradslagRes.data || [];
      const avbrottRows = avbrottRes.data || [];
      const lassRows = (lassRes.data || []) as any[];
      const lassSortRows = (lassSortRes.data || []) as any[];
      const dimOperators = dimOperatorRes.data || [];

      const sortMap = new Map<string, string>();
      dimSort.forEach((s: any) => { if (s.namn) sortMap.set(s.sortiment_id, s.namn); });

      const tradslagMap = new Map<string, string>();
      dimTradslag.forEach((t: any) => { if (t.namn) tradslagMap.set(t.tradslag_id, t.namn); });

      const operatorMap = new Map<string, string>();
      dimOperators.forEach((o: any) => {
        const namn = o.operator_namn || o.operator_key || '';
        if (namn) operatorMap.set(o.operator_id, namn);
      });

      // Build time data with per-day breakdown
      const buildTid = (rows: any[]) => {
        let processing = 0, terrain = 0, otherWork = 0, maintenance = 0, disturbance = 0, rast = 0, kortStopp = 0, diesel = 0, engineTime = 0, tomgangTotal = 0;
        const perDag = new Map<string, any>();

        rows.forEach(r => {
          const p = r.processing_sek || 0;
          const t = r.terrain_sek || 0;
          const o = r.other_work_sek || 0;
          const m = r.maintenance_sek || 0;
          const di = r.disturbance_sek || 0;
          const ra = r.rast_sek || 0;
          const ks = r.kort_stopp_sek || 0;
          const d = r.bransle_liter || 0;
          const et = r.engine_time_sek || 0;
          const tg = r.tomgang_sek || 0;

          processing += p; terrain += t; otherWork += o;
          maintenance += m; disturbance += di; rast += ra;
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

        const runtime = processing + terrain + otherWork;
        const g0h = (runtime - kortStopp) / 3600;
        const g15h = runtime / 3600;

        const tidPerDag = Array.from(perDag.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([datum, v]) => ({
            datum,
            g15: (v.processing + v.terrain + v.otherWork) / 3600,
            diesel: v.diesel,
          }));

        return {
          g15: Math.round(g15h * 10) / 10,
          g0: Math.round(g0h * 10) / 10,
          kortaStopp: kortStopp / 3600,
          avbrott: (maintenance + disturbance) / 3600,
          rast: rast / 3600,
          tomgang: tomgangTotal / 3600,
          dieselTot: diesel,
          tidPerDag,
        };
      };

      // When skördare and skotare share the same objekt_id, filter by maskin_id
      const shared = skId && stId && skId === stId;
      const skMid = obj.skordareModellMaskinId;
      const stMid = obj.skotareModellMaskinId;
      const skTidRows = skId ? tidRows.filter((r: any) => r.objekt_id === skId && (!shared || !skMid || r.maskin_id === skMid)) : [];
      const stTidRows = stId ? tidRows.filter((r: any) => r.objekt_id === stId && (!shared || !stMid || r.maskin_id === stMid)) : [];
      const skTid = buildTid(skTidRows);
      const stTid = buildTid(stTidRows);

      // Production aggregation
      const skProd = skId ? prodRows.filter((r: any) => r.objekt_id === skId) : [];
      let totalStammar = 0, totalVol = 0;
      skProd.forEach((p: any) => {
        totalStammar += p.stammar || 0;
        totalVol += p.volym_m3sub || 0;
      });
      const medelstam = totalStammar > 0 ? Math.round((totalVol / totalStammar) * 100) / 100 : 0;
      const stamPerG15 = skTid.g15 > 0 ? Math.round((totalStammar / skTid.g15) * 10) / 10 : 0;
      const m3PerG15Sk = skTid.g15 > 0 ? Math.round((obj.volymSkordare / skTid.g15) * 10) / 10 : 0;

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

      // Avbrott
      const buildAvbrott = (rows: any[]): AvbrottRad[] => {
        const m = new Map<string, { tid: number; antal: number; typ: string }>();
        rows.forEach(r => {
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
      };
      const skAvbrott = skId ? avbrottRows.filter((r: any) => r.objekt_id === skId && (!shared || !skMid || r.maskin_id === skMid)) : [];
      const stAvbrott = stId ? avbrottRows.filter((r: any) => r.objekt_id === stId && (!shared || !stMid || r.maskin_id === stMid)) : [];

      // Lass
      let totalLassVol = 0, totalKor = 0;
      const lassPerDagMap = new Map<string, number>();
      lassRows.forEach((l: any) => {
        totalLassVol += l.volym_m3sob || 0;
        totalKor += l.korstracka_m || 0;
        if (l.datum) {
          lassPerDagMap.set(l.datum, (lassPerDagMap.get(l.datum) || 0) + 1);
        }
      });
      const antalLass = lassRows.length;
      const snittLass = antalLass > 0 ? Math.round((totalLassVol / antalLass) * 10) / 10 : 0;
      const lassPerG15 = stTid.g15 > 0 ? Math.round((antalLass / stTid.g15) * 100) / 100 : 0;
      const m3PerG15St = stTid.g15 > 0 ? Math.round((obj.volymSkotare / stTid.g15) * 10) / 10 : 0;
      const avstand = antalLass > 0 ? Math.round(totalKor / antalLass) : 0;
      const lassPerDag = Array.from(lassPerDagMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([d, count]) => {
          const date = new Date(d);
          return { datum: `${date.getDate()}/${date.getMonth() + 1}`, lass: count };
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

      // Build förare per maskin from fakt_tid rows
      const opNamn = (opId: string): string => {
        // Try dim_operator lookup first
        const namn = operatorMap.get(opId);
        if (namn) return namn;
        // Fallback: strip maskin_id prefix (format: "maskinId_opKey")
        const idx = opId.indexOf('_');
        return idx >= 0 ? opId.substring(idx + 1) : opId;
      };

      const buildForare = (rows: any[]): { aktiv: string; tidigare: Forare[] } => {
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
        const aktiv = opNamn(sorted[0][0]);
        const tidigare: Forare[] = sorted.slice(1).map(([opId, dates]) => ({
          namn: opNamn(opId),
          fran: fmtDate(dates.min),
          till: fmtDate(dates.max),
        }));
        return { aktiv, tidigare };
      };

      const skForare = buildForare(skTidRows);
      const stForare = buildForare(stTidRows);

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

      const mapped: UppfoljningData = {
        objektNamn: obj.namn,
        skordat: Math.round(volSk),
        skotat: Math.round(volSt),
        kvarPct,
        maskiner,
        // Tid — all in hours
        skordareG15h: skTid.g15,
        skordareG0: skTid.g0,
        skordareTomgang: Math.round(skTid.tomgang * 10) / 10,
        skordareKortaStopp: Math.round(skTid.kortaStopp * 10) / 10,
        skordareRast: Math.round(skTid.rast * 10) / 10,
        skordareAvbrott: Math.round(skTid.avbrott * 10) / 10,
        skotareG15h: stTid.g15,
        skotareG0: stTid.g0,
        skotareTomgang: Math.round(stTid.tomgang * 10) / 10,
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
        // Avbrott — total computed from same fakt_avbrott rows as detail list
        avbrottSkordare: buildAvbrott(skAvbrott),
        avbrottSkordare_totalt: `${(skAvbrott.reduce((s: number, r: any) => s + (r.langd_sek || 0), 0) / 3600).toFixed(1)}h`,
        avbrottSkotare: buildAvbrott(stAvbrott),
        avbrottSkotareTotalt: `${(stAvbrott.reduce((s: number, r: any) => s + (r.langd_sek || 0), 0) / 3600).toFixed(1)}h`,
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

      setData(mapped);
      setLoading(false);
    })();
  }, [obj.skordareObjektId, obj.skotareObjektId]);

  if (loading || !data) {
    return (
      <div style={{ minHeight: '100vh', background: bg, color: text, fontFamily: ff, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: muted, fontSize: 14 }}>Laddar...</div>
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', top: 56, left: 0, right: 0, bottom: 0, overflowY: 'auto', background: '#070708' }}>
      {/* × close button in TopBar row */}
      <button onClick={onBack} style={{
        position: 'fixed',
        top: 10,
        right: 12,
        width: 36,
        height: 36,
        borderRadius: 10,
        background: 'rgba(255,255,255,0.08)',
        border: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        zIndex: 1001,
        color: 'rgba(255,255,255,0.7)',
        fontSize: 18,
        lineHeight: 1,
        fontFamily: 'system-ui, sans-serif',
      }}>×</button>
      <UppfoljningVy data={data} />
    </div>
  );
}

function buildEmptyData(obj: UppfoljningObjekt): UppfoljningData {
  return {
    objektNamn: obj.namn,
    skordat: 0, skotat: 0, kvarPct: 0, maskiner: [],
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

/* ── Main page ── */
export default function UppfoljningPage() {
  const [loading, setLoading] = useState(true);
  const [objekt, setObjekt] = useState<UppfoljningObjekt[]>([]);
  const [flik, setFlik] = useState<'alla' | 'pagaende' | 'avslutat'>('alla');
  const [filter, setFilter] = useState<'alla' | 'slutavverkning' | 'gallring'>('alla');
  const [sok, setSok] = useState('');
  const [valt, setValt] = useState<UppfoljningObjekt | null>(null);

  useEffect(() => {
    (async () => {
      const [dimObjektRes, dimMaskinRes, objektTblRes] = await Promise.all([
        supabase.from('dim_objekt').select('*'),
        supabase.from('dim_maskin').select('*'),
        supabase.from('objekt').select('vo_nummer, markagare, areal, typ'),
      ]);

      const dimObjekt: any[] = dimObjektRes.data || [];
      const dimMaskin: any[] = dimMaskinRes.data || [];
      const objektTbl: any[] = objektTblRes.data || [];

      const allObjektIds = [...new Set(dimObjekt.map(d => d.objekt_id).filter(Boolean))];

      async function fetchPaginated<T>(query: () => any): Promise<T[]> {
        let all: T[] = [];
        let from = 0;
        const pageSize = 1000;
        while (true) {
          const { data } = await query().range(from, from + pageSize - 1);
          if (!data || data.length === 0) break;
          all = all.concat(data);
          if (data.length < pageSize) break;
          from += pageSize;
        }
        return all;
      }

      const [produktion, lass, tid] = await Promise.all([
        allObjektIds.length > 0
          ? fetchPaginated<any>(() => supabase.from('fakt_produktion').select('objekt_id, maskin_id, volym_m3sub, stammar').in('objekt_id', allObjektIds))
          : Promise.resolve([] as any[]),
        allObjektIds.length > 0
          ? fetchPaginated<any>(() => supabase.from('fakt_lass').select('objekt_id, volym_m3sob').in('objekt_id', allObjektIds))
          : Promise.resolve([] as any[]),
        allObjektIds.length > 0
          ? fetchPaginated<any>(() => supabase.from('fakt_tid').select('objekt_id, maskin_id, bransle_liter').in('objekt_id', allObjektIds))
          : Promise.resolve([] as any[]),
      ]);

      const maskinMap = new Map<string, any>();
      dimMaskin.forEach(m => maskinMap.set(m.maskin_id, m));

      const objektInfo = new Map<string, { agare: string; areal: number; typ: string }>();
      objektTbl.forEach(o => {
        if (o.vo_nummer) {
          objektInfo.set(o.vo_nummer, { agare: o.markagare || '', areal: o.areal || 0, typ: o.typ || '' });
        }
      });

      const prodAgg = new Map<string, { vol: number; stammar: number }>();
      produktion.forEach(p => {
        const key = p.objekt_id;
        const prev = prodAgg.get(key) || { vol: 0, stammar: 0 };
        prev.vol += (p.volym_m3sub || 0);
        prev.stammar += (p.stammar || 0);
        prodAgg.set(key, prev);
      });

      const prodMaskinMap = new Map<string, string>();
      produktion.forEach(p => {
        if (p.maskin_id && p.objekt_id && !prodMaskinMap.has(p.objekt_id)) {
          prodMaskinMap.set(p.objekt_id, p.maskin_id);
        }
      });

      const tidMaskinMap = new Map<string, string>();
      tid.forEach(t => {
        if (t.maskin_id && t.objekt_id && !tidMaskinMap.has(t.objekt_id)) {
          tidMaskinMap.set(t.objekt_id, t.maskin_id);
        }
      });

      const lassAgg = new Map<string, { vol: number; count: number }>();
      lass.forEach(l => {
        const key = l.objekt_id;
        const prev = lassAgg.get(key) || { vol: 0, count: 0 };
        prev.vol += (l.volym_m3sob || 0);
        prev.count += 1;
        lassAgg.set(key, prev);
      });

      const tidAgg = new Map<string, number>();
      tid.forEach(t => {
        const key = t.objekt_id;
        tidAgg.set(key, (tidAgg.get(key) || 0) + (t.bransle_liter || 0));
      });

      const tidPerMaskin = new Map<string, number>();
      tid.forEach(t => {
        if (t.objekt_id && t.maskin_id) {
          const k = t.objekt_id + '::' + t.maskin_id;
          tidPerMaskin.set(k, (tidPerMaskin.get(k) || 0) + (t.bransle_liter || 0));
        }
      });

      const tidMaskinPerObjekt = new Map<string, Set<string>>();
      tid.forEach(t => {
        if (t.objekt_id && t.maskin_id) {
          const s = tidMaskinPerObjekt.get(t.objekt_id) || new Set();
          s.add(t.maskin_id);
          tidMaskinPerObjekt.set(t.objekt_id, s);
        }
      });

      const voGroups = new Map<string, any[]>();
      dimObjekt.forEach(d => {
        if (!d.objekt_id) return;
        if (d.exkludera === true) return;
        const key = d.vo_nummer || d.objekt_id;
        const arr = voGroups.get(key) || [];
        arr.push(d);
        voGroups.set(key, arr);
      });

      const result: UppfoljningObjekt[] = [];

      voGroups.forEach((entries, key) => {
        const skordareEntries: any[] = [];
        const skotareEntries: any[] = [];
        const unknownEntries: any[] = [];
        const knownMaskinIds = new Set<string>();

        for (const e of entries) {
          if (e.maskin_id) knownMaskinIds.add(e.maskin_id);
          const maskin = maskinMap.get(e.maskin_id);
          const mType = getMachineType(maskin);
          if (mType === 'skordare') skordareEntries.push(e);
          else if (mType === 'skotare') skotareEntries.push(e);
          else unknownEntries.push(e);
        }

        const allObjIds = entries.map((e: any) => e.objekt_id);
        for (const oid of allObjIds) {
          const tidMaskiner = tidMaskinPerObjekt.get(oid);
          if (!tidMaskiner) continue;
          for (const mid of tidMaskiner) {
            if (knownMaskinIds.has(mid)) continue;
            knownMaskinIds.add(mid);
            const maskin = maskinMap.get(mid);
            const mType = getMachineType(maskin);
            const synthetic = { objekt_id: oid, maskin_id: mid, _synthetic: true };
            if (mType === 'skordare') skordareEntries.push(synthetic);
            else if (mType === 'skotare') skotareEntries.push(synthetic);
            else unknownEntries.push(synthetic);
          }
        }

        if (skordareEntries.length === 0 && skotareEntries.length === 0) {
          for (const e of unknownEntries) {
            if (prodAgg.has(e.objekt_id)) { skordareEntries.push(e); continue; }
            if (lassAgg.has(e.objekt_id)) { skotareEntries.push(e); continue; }
          }
        }
        if (skordareEntries.length === 0 && skotareEntries.length === 0 && entries.length > 0) {
          skordareEntries.push(entries[0]);
          if (entries.length > 1) skotareEntries.push(entries[1]);
        }

        const skordareEntry = skordareEntries[0] || null;
        const skotareEntry = skotareEntries[0] || null;

        const firstEntry = entries[0];
        const vo = firstEntry.vo_nummer || '';
        const namn = firstEntry.object_name || firstEntry.objektnamn || vo || key;
        const info = objektInfo.get(vo);

        const agare = firstEntry.skogsagare || firstEntry.bolag || info?.agare || '';
        const areal = info?.areal || 0;
        const typ = inferType(firstEntry.huvudtyp || info?.typ);

        let skVol = 0, skStammar = 0;
        for (const e of skordareEntries) {
          const p = prodAgg.get(e.objekt_id);
          if (p) { skVol += p.vol; skStammar += p.stammar; }
        }

        let stVol = 0, stCount = 0;
        for (const e of skotareEntries) {
          const l = lassAgg.get(e.objekt_id);
          if (l) { stVol += l.vol; stCount += l.count; }
        }
        if (stCount === 0 && skotareEntry) {
          for (const e of skordareEntries) {
            const l = lassAgg.get(e.objekt_id);
            if (l) { stVol += l.vol; stCount += l.count; }
          }
        }

        let skDiesel = 0, stDiesel = 0;
        for (const e of skordareEntries) {
          const k = e.objekt_id + '::' + e.maskin_id;
          skDiesel += tidPerMaskin.get(k) || 0;
        }
        for (const e of skotareEntries) {
          const k = e.objekt_id + '::' + e.maskin_id;
          stDiesel += tidPerMaskin.get(k) || 0;
        }

        const skStart = skordareEntry?.start_date || null;
        const skSlut = skordareEntry?.end_date || skordareEntry?.skordning_avslutad || null;
        const stStart = skotareEntry?.start_date || null;
        const stSlut = skotareEntry?.end_date || skotareEntry?.skotning_avslutad || null;

        const allDone = entries.every((e: any) => e.end_date || e.skordning_avslutad || e.skotning_avslutad);

        const earliestStart = [skStart, stStart].filter(Boolean).sort()[0] || null;
        const latestEnd = [skSlut, stSlut].filter(Boolean).sort().reverse()[0] || null;
        let dagar: number | null = null;
        if (earliestStart) {
          dagar = allDone && latestEnd ? daysBetween(earliestStart, latestEnd) : daysSince(earliestStart);
        }

        const skMaskinId = skordareEntry?.maskin_id || prodMaskinMap.get(skordareEntry?.objekt_id);
        const stMaskinId = skotareEntry?.maskin_id || tidMaskinMap.get(skotareEntry?.objekt_id);

        result.push({
          vo_nummer: vo,
          namn,
          typ,
          agare,
          areal,
          skordareModell: skordareEntry ? getMachineLabel(maskinMap.get(skMaskinId)) : null,
          skordareStart: skStart,
          skordareSlut: skSlut,
          skordareObjektId: skordareEntry?.objekt_id || null,
          skordareModellMaskinId: skMaskinId || null,
          volymSkordare: skVol,
          stammar: skStammar,
          skotareModell: skotareEntry ? getMachineLabel(maskinMap.get(stMaskinId)) : null,
          skotareStart: stStart,
          skotareSlut: stSlut,
          skotareObjektId: skotareEntry?.objekt_id || null,
          skotareModellMaskinId: stMaskinId || null,
          volymSkotare: stVol,
          antalLass: stCount,
          dieselTotal: skDiesel + stDiesel,
          dagar,
          status: allDone ? 'avslutat' : 'pagaende',
          egenSkotning: entries.some((e: any) => e.egen_skotning === true),
        });
      });

      result.sort((a, b) => a.namn.localeCompare(b.namn, 'sv'));
      setObjekt(result);
      setLoading(false);
    })();
  }, []);

  const lista = useMemo(() => {
    return objekt
      .filter(o => flik === 'alla' || o.status === flik)
      .filter(o => filter === 'alla' || o.typ === filter)
      .filter(o => {
        if (!sok.trim()) return true;
        const t = sok.toLowerCase();
        return o.namn.toLowerCase().includes(t) || o.agare.toLowerCase().includes(t) || o.vo_nummer?.includes(t);
      });
  }, [objekt, flik, filter, sok]);

  if (valt) {
    return <ObjektDetalj obj={valt} onBack={() => setValt(null)} />;
  }

  return (
    <div style={{ position: 'fixed', top: 56, left: 0, right: 0, bottom: 0, background: bg, color: text, fontFamily: ff, WebkitFontSmoothing: 'antialiased', overflowY: 'auto' }}>

      <div style={{ padding: '32px 24px 0' }}>
        <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.5px', marginBottom: 28 }}>Uppföljning</div>

        <input
          type="text"
          placeholder="Sök objekt, ägare, VO..."
          value={sok}
          onChange={e => setSok(e.target.value)}
          style={{
            width: '100%', boxSizing: 'border-box', border: 'none',
            borderBottom: `1px solid ${divider}`,
            background: 'none', fontSize: 15, color: text, outline: 'none', fontFamily: ff,
            padding: '12px 0', marginBottom: 20,
          }}
        />

        <div style={{ display: 'flex', gap: 2, marginBottom: 16 }}>
          {(['alla', 'pagaende', 'avslutat'] as const).map(f => (
            <button key={f} onClick={() => setFlik(f)} style={{
              padding: '8px 18px', border: 'none', borderRadius: 0,
              fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: ff,
              background: 'none',
              color: flik === f ? text : muted,
              borderBottom: flik === f ? `2px solid ${text}` : '2px solid transparent',
              transition: 'all 0.15s',
            }}>
              {f === 'alla' ? 'Alla' : f === 'pagaende' ? 'Pågående' : 'Avslutade'}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
          {[{ k: 'alla', l: 'Alla' }, { k: 'slutavverkning', l: 'Slutavv.' }, { k: 'gallring', l: 'Gallring' }].map(f => (
            <button key={f.k} onClick={() => setFilter(f.k as any)} style={{
              padding: 0, border: 'none', cursor: 'pointer', fontFamily: ff,
              fontSize: 13, background: 'none',
              color: filter === f.k ? text : muted,
              fontWeight: filter === f.k ? 600 : 400,
              transition: 'all 0.15s',
            }}>{f.l}</button>
          ))}
        </div>
      </div>

      <div style={{ padding: '0 24px 120px', maxWidth: 600, margin: '0 auto' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: muted, fontSize: 14 }}>Laddar...</div>
        ) : lista.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: muted, fontSize: 14 }}>Inga objekt hittades</div>
        ) : (
          lista.map(o => (
            <ObjektKort key={o.skordareObjektId || o.skotareObjektId || o.vo_nummer} obj={o} onClick={() => setValt(o)} />
          ))
        )}
      </div>
    </div>
  );
}
