'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/* ── Design tokens — black/white only ── */
const bg = '#000';
const text = '#fff';
const muted = 'rgba(255,255,255,0.4)';
const divider = 'rgba(255,255,255,0.08)';
const good = '#22c55e';
const bad = '#ef4444';
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
function daysBetweenNull(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  return Math.floor((new Date(b).getTime() - new Date(a).getTime()) / 864e5);
}
function fmtDate(d: string | null): string | null {
  if (!d) return null;
  return new Date(d).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });
}
function fmtHM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}:${m.toString().padStart(2, '0')}`;
}
function fmtH(hours: number): string {
  return `${hours.toFixed(1)}h`;
}

/* ── Chart.js loader hook ── */
function useChartJs(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if ((window as any).Chart) { setReady(true); return; }
    const existing = document.querySelector('script[src*="chart.umd"]');
    if (existing) {
      existing.addEventListener('load', () => setReady(true));
      return;
    }
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js';
    s.onload = () => setReady(true);
    document.head.appendChild(s);
  }, []);
  return ready;
}

/* ── Chart config — minimal black/white ── */
const chartGrid = { color: 'rgba(255,255,255,0.06)' };
const chartTicks = { color: 'rgba(255,255,255,0.3)', font: { size: 11, family: 'system-ui' } };
const chartTooltip = {
  backgroundColor: '#111', titleColor: '#fff', bodyColor: 'rgba(255,255,255,0.6)',
  borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1, padding: 10,
};

/* ── Thin progress bar ── */
function Bar({ pct, color, height = 3 }: { pct: number; color: string; height?: number }) {
  return (
    <div style={{ height, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
      <div style={{ width: `${Math.min(100, Math.max(0, pct))}%`, height: '100%', background: color, borderRadius: 2, transition: 'width 1s cubic-bezier(0.4,0,0.2,1)' }} />
    </div>
  );
}

/* ── Drill-down Panel — full-width on mobile ── */
function DrillPanel({ open, onClose, title, children }: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode;
}) {
  return (
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
        zIndex: 500,
        opacity: open ? 1 : 0, pointerEvents: open ? 'all' : 'none',
        transition: 'opacity 0.25s',
      }} />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 'min(520px, 100vw)', background: bg,
        zIndex: 501, overflowY: 'auto',
        transform: open ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.3s cubic-bezier(0.4,0,0.2,1)',
      }}>
        <div style={{
          position: 'sticky', top: 0, background: bg,
          borderBottom: `1px solid ${divider}`,
          padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 10,
        }}>
          <div style={{ fontSize: 18, fontWeight: 600, color: text }}>{title}</div>
          <button onClick={onClose} style={{
            width: 32, height: 32, borderRadius: '50%',
            background: 'rgba(255,255,255,0.06)', border: 'none', cursor: 'pointer',
            color: muted, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>✕</button>
        </div>
        <div style={{ padding: '24px 24px 60px' }}>
          {children}
        </div>
      </div>
    </>
  );
}

/* ── Simple data row ── */
function DataRow({ label, value, last, warn }: { label: string; value: string | number; last?: boolean; warn?: boolean }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '12px 0', borderBottom: last ? 'none' : `1px solid ${divider}`, fontSize: 14,
    }}>
      <span style={{ color: muted }}>{label}</span>
      <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: warn ? bad : text }}>{value}</span>
    </div>
  );
}

/* ── Tappable section ── */
function TapSection({ label, onClick, children }: {
  label?: string; onClick?: () => void; children: React.ReactNode;
}) {
  return (
    <div onClick={onClick} style={{
      padding: '28px 0', borderBottom: `1px solid ${divider}`,
      cursor: onClick ? 'pointer' : undefined,
    }}>
      {label && <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', color: muted, marginBottom: 16 }}>{label}</div>}
      {children}
    </div>
  );
}

/* ── ObjektKort — minimal list item ── */
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

/* ── ObjektDetalj — redesigned detail view ── */
function ObjektDetalj({ obj, onBack }: { obj: UppfoljningObjekt; onBack: () => void }) {
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [panel, setPanel] = useState<string | null>(null);
  const [smalBred, setSmalBred] = useState<'smal' | 'bred'>('bred');
  const chartReady = useChartJs();

  // Chart refs
  const tidChartRef = useRef<HTMLCanvasElement>(null);
  const dieselChartRef = useRef<HTMLCanvasElement>(null);
  const sortChartRef = useRef<HTMLCanvasElement>(null);
  const prodChartRef = useRef<HTMLCanvasElement>(null);
  const chartInstances = useRef<any[]>([]);

  const closePanel = useCallback(() => setPanel(null), []);

  // Cleanup charts
  useEffect(() => {
    return () => {
      chartInstances.current.forEach(c => { try { c.destroy(); } catch {} });
      chartInstances.current = [];
    };
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const skId = obj.skordareObjektId;
      const stId = obj.skotareObjektId;
      const ids = [skId, stId].filter(Boolean) as string[];

      if (ids.length === 0) {
        setD({
          medelstam: 0, tidPerDag: [],
          skordare: { arbetstid: 0, g15: 0, g0: 0, kortaStopp: 0, avbrott: 0, rast: 0, tomgang: 0,
            stamPerG15: 0, m3PerG15: 0, flertrad: 0, antalStammar: 0,
            diesel: { tot: 0, perM3: 0, perTim: 0 }, sortiment: [], avbrott_lista: [],
            tidPerDag: [] },
          skotare: { arbetstid: 0, g15: 0, g0: 0, kortaStopp: 0, avbrott: 0, rast: 0, tomgang: 0,
            lass: 0, snittLass: 0, lassPerG15: 0, m3PerG15: 0, avstand: 0, lastrede: '–',
            diesel: { tot: 0, perM3: 0, perG15: 0 }, avbrott_lista: [],
            tidPerDag: [] },
        });
        setLoading(false);
        return;
      }

      // Fetch skotare_konfiguration
      let skotareKonf = 'bred';
      if (stId) {
        try {
          const { data: konfData } = await supabase.from('dim_objekt')
            .select('skotare_konfiguration')
            .eq('objekt_id', stId)
            .single();
          if (konfData?.skotare_konfiguration) skotareKonf = konfData.skotare_konfiguration;
        } catch {}
      }
      setSmalBred(skotareKonf as any);

      const [tidRes, prodRes, sortRes, dimSortRes, dimTradslagRes, avbrottRes, lassRes] = await Promise.all([
        supabase.from('fakt_tid').select('datum, objekt_id, maskin_id, processing_sek, terrain_sek, other_work_sek, maintenance_sek, disturbance_sek, rast_sek, kort_stopp_sek, bransle_liter, engine_time_sek, tomgang_sek').in('objekt_id', ids),
        supabase.from('fakt_produktion').select('objekt_id, volym_m3sub, stammar, processtyp, tradslag_id').in('objekt_id', ids),
        supabase.from('fakt_sortiment').select('objekt_id, sortiment_id, volym_m3sub, antal').in('objekt_id', ids),
        supabase.from('dim_sortiment').select('sortiment_id, namn'),
        supabase.from('dim_tradslag').select('tradslag_id, namn'),
        supabase.from('fakt_avbrott').select('objekt_id, maskin_id, typ, kategori_kod, langd_sek').in('objekt_id', ids),
        stId ? supabase.from('fakt_lass').select('objekt_id, volym_m3sob, korstracka_m').eq('objekt_id', stId) : Promise.resolve({ data: [] }),
      ]);

      const tidRows = tidRes.data || [];
      const prodRows = prodRes.data || [];
      const sortRows = sortRes.data || [];
      const dimSort = dimSortRes.data || [];
      const dimTradslag = dimTradslagRes.data || [];
      const avbrottRows = avbrottRes.data || [];
      const lassRows = (lassRes.data || []) as any[];

      const sortMap = new Map<string, string>();
      dimSort.forEach((s: any) => { if (s.namn) sortMap.set(s.sortiment_id, s.namn); });

      const tradslagMap = new Map<string, string>();
      dimTradslag.forEach((t: any) => { if (t.namn) tradslagMap.set(t.tradslag_id, t.namn); });

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

        // G15 = runtime (already includes kort_stopp since MOM durations are G15-inclusive)
        const runtime = processing + terrain + otherWork;
        const g0h = (runtime - kortStopp) / 3600;
        const g15h = runtime / 3600;
        const arbh = (runtime + maintenance + disturbance + rast) / 3600;

        // Sort per-day data
        const tidPerDag = Array.from(perDag.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([datum, v]) => ({
            datum,
            g15: (v.processing + v.terrain + v.otherWork) / 3600,
            avbrott: (v.maintenance + v.disturbance) / 3600,
            rast: v.rast / 3600,
            kortStopp: v.kortStopp / 3600,
            tomgang: v.tomgang / 3600,
            diesel: v.diesel,
          }));

        return {
          arbetstid: Math.round(arbh * 10) / 10,
          g15: Math.round(g15h * 10) / 10,
          g0: Math.round(g0h * 10) / 10,
          kortaStopp: Math.round(kortStopp / 60),
          avbrott: Math.round((maintenance + disturbance) / 60),
          rast: Math.round(rast / 60),
          tomgang: Math.round(tomgangTotal / 60),
          dieselTot: diesel,
          tidPerDag,
        };
      };

      // When skördare and skotare share the same objekt_id, filter by maskin_id too
      const shared = skId && stId && skId === stId;
      const skMid = obj.skordareModellMaskinId;
      const stMid = obj.skotareModellMaskinId;
      const skTidRows = skId ? tidRows.filter((r: any) => r.objekt_id === skId && (!shared || !skMid || r.maskin_id === skMid)) : [];
      const stTidRows = stId ? tidRows.filter((r: any) => r.objekt_id === stId && (!shared || !stMid || r.maskin_id === stMid)) : [];
      const skTid = buildTid(skTidRows);
      const stTid = buildTid(stTidRows);

      // Production aggregation
      const skProd = skId ? prodRows.filter((r: any) => r.objekt_id === skId) : [];
      let totalStammar = 0, mthStammar = 0, totalVol = 0;
      skProd.forEach((p: any) => {
        totalStammar += p.stammar || 0;
        totalVol += p.volym_m3sub || 0;
        if (p.processtyp === 'MTH') mthStammar += p.stammar || 0;
      });
      const flertrad = totalStammar > 0 ? Math.round((mthStammar / totalStammar) * 100) : 0;
      const medelstam = totalStammar > 0 ? Math.round((totalVol / totalStammar) * 100) / 100 : 0;
      const stamPerG15 = skTid.g15 > 0 ? Math.round((totalStammar / skTid.g15) * 10) / 10 : 0;
      const m3PerG15Sk = skTid.g15 > 0 ? Math.round((obj.volymSkordare / skTid.g15) * 10) / 10 : 0;

      // Skotare production from fakt_produktion (for produktionstakt)
      const stProd = stId ? prodRows.filter((r: any) => r.objekt_id === stId) : [];
      let stProdVol = 0;
      stProd.forEach((p: any) => { stProdVol += p.volym_m3sub || 0; });
      const m3PerG15StProd = stTid.g15 > 0 && stProdVol > 0 ? Math.round((stProdVol / stTid.g15) * 10) / 10 : 0;

      // Per trädslag production
      const tradslagAgg = new Map<string, { vol: number; st: number }>();
      skProd.forEach((r: any) => {
        const ts = (r.tradslag_id && tradslagMap.get(r.tradslag_id)) || r.tradslag_id || 'Övrigt';
        const prev = tradslagAgg.get(ts) || { vol: 0, st: 0 };
        prev.vol += r.volym_m3sub || 0; prev.st += r.stammar || 0;
        tradslagAgg.set(ts, prev);
      });
      const tradslagData = Array.from(tradslagAgg.entries())
        .map(([namn, v]) => ({ namn, vol: Math.round(v.vol * 10) / 10, st: Math.round(v.st) }))
        .sort((a, b) => b.vol - a.vol);

      // Sortiment
      const skSort = skId ? sortRows.filter((r: any) => r.objekt_id === skId) : [];
      const sortAgg = new Map<string, { vol: number; st: number }>();
      skSort.forEach((r: any) => {
        const namn = sortMap.get(r.sortiment_id) || r.sortiment_id || 'Övrigt';
        const prev = sortAgg.get(namn) || { vol: 0, st: 0 };
        prev.vol += r.volym_m3sub || 0; prev.st += r.antal || 0;
        sortAgg.set(namn, prev);
      });
      const sortiment = Array.from(sortAgg.entries())
        .map(([namn, v]) => ({ namn, vol: Math.round(v.vol), st: Math.round(v.st) }))
        .sort((a, b) => b.vol - a.vol);

      // Avbrott — group by orsak (kategori_kod + typ) with count
      const buildAvbrott = (rows: any[]) => {
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
          .map(([orsak, v]) => ({ orsak, typ: v.typ, tid: Math.round(v.tid / 60), antal: v.antal }))
          .sort((a, b) => b.tid - a.tid);
      };
      const skAvbrott = skId ? avbrottRows.filter((r: any) => r.objekt_id === skId && (!shared || !skMid || r.maskin_id === skMid)) : [];
      const stAvbrott = stId ? avbrottRows.filter((r: any) => r.objekt_id === stId && (!shared || !stMid || r.maskin_id === stMid)) : [];

      // Lass
      let totalLassVol = 0, totalKor = 0;
      lassRows.forEach((l: any) => { totalLassVol += l.volym_m3sob || 0; totalKor += l.korstracka_m || 0; });
      const antalLass = lassRows.length;
      const snittLass = antalLass > 0 ? Math.round((totalLassVol / antalLass) * 10) / 10 : 0;
      const lassPerG15 = stTid.g15 > 0 ? Math.round((antalLass / stTid.g15) * 100) / 100 : 0;
      const m3PerG15St = stTid.g15 > 0 ? Math.round((obj.volymSkotare / stTid.g15) * 10) / 10 : 0;
      const avstand = antalLass > 0 ? Math.round(totalKor / antalLass) : 0;

      // Diesel
      const dieselPerM3Sk = obj.volymSkordare > 0 ? Math.round((skTid.dieselTot / obj.volymSkordare) * 100) / 100 : 0;
      const dieselPerTimSk = skTid.g15 > 0 ? Math.round((skTid.dieselTot / skTid.g15) * 100) / 100 : 0;
      const dieselPerM3St = obj.volymSkotare > 0 ? Math.round((stTid.dieselTot / obj.volymSkotare) * 100) / 100 : 0;
      const dieselPerG15St = stTid.g15 > 0 ? Math.round((stTid.dieselTot / stTid.g15) * 100) / 100 : 0;

      // Merge all per-day data for combined charts
      const allDagar = new Map<string, any>();
      [...skTid.tidPerDag, ...stTid.tidPerDag].forEach(dag => {
        const prev = allDagar.get(dag.datum) || { g15: 0, avbrott: 0, rast: 0, kortStopp: 0, tomgang: 0, diesel: 0 };
        prev.g15 += dag.g15; prev.avbrott += dag.avbrott; prev.rast += dag.rast;
        prev.kortStopp += dag.kortStopp; prev.tomgang += dag.tomgang; prev.diesel += dag.diesel;
        allDagar.set(dag.datum, prev);
      });
      const tidPerDag = Array.from(allDagar.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([datum, v]) => ({ datum, ...v }));

      setD({
        medelstam,
        tidPerDag,
        tradslagData,
        skordare: {
          arbetstid: skTid.arbetstid, g15: skTid.g15, g0: skTid.g0,
          kortaStopp: skTid.kortaStopp, avbrott: skTid.avbrott, rast: skTid.rast, tomgang: skTid.tomgang,
          stamPerG15, m3PerG15: m3PerG15Sk, flertrad, antalStammar: totalStammar,
          diesel: { tot: Math.round(skTid.dieselTot), perM3: dieselPerM3Sk, perTim: dieselPerTimSk },
          sortiment, avbrott_lista: buildAvbrott(skAvbrott),
          tidPerDag: skTid.tidPerDag,
        },
        skotare: {
          arbetstid: stTid.arbetstid, g15: stTid.g15, g0: stTid.g0,
          kortaStopp: stTid.kortaStopp, avbrott: stTid.avbrott, rast: stTid.rast, tomgang: stTid.tomgang,
          lass: antalLass, snittLass, lassPerG15, m3PerG15: m3PerG15St, m3PerG15Prod: m3PerG15StProd, avstand, lastrede: '–',
          diesel: { tot: Math.round(stTid.dieselTot), perM3: dieselPerM3St, perG15: dieselPerG15St },
          avbrott_lista: buildAvbrott(stAvbrott),
          tidPerDag: stTid.tidPerDag,
        },
      });
      setLoading(false);
    })();
  }, [obj.skordareObjektId, obj.skotareObjektId]);

  // Create charts when panel opens
  useEffect(() => {
    if (!chartReady || !d) return;
    const Chart = (window as any).Chart;
    if (!Chart) return;

    // Destroy existing charts
    chartInstances.current.forEach(c => { try { c.destroy(); } catch {} });
    chartInstances.current = [];

    if (panel === 'tid' && tidChartRef.current) {
      const labels = d.tidPerDag.map((t: any) => {
        const date = new Date(t.datum);
        return `${date.getDate()}/${date.getMonth() + 1}`;
      });
      const chart = new Chart(tidChartRef.current, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            { label: 'G15', data: d.tidPerDag.map((t: any) => +t.g15.toFixed(1)), backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 2, stack: 's' },
            { label: 'Avbrott', data: d.tidPerDag.map((t: any) => +t.avbrott.toFixed(1)), backgroundColor: 'rgba(239,68,68,0.4)', borderRadius: 2, stack: 's' },
            { label: 'Rast', data: d.tidPerDag.map((t: any) => +t.rast.toFixed(1)), backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 2, stack: 's' },
          ],
        },
        options: {
          responsive: true, interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { position: 'top', labels: { font: { family: 'system-ui', size: 11 }, boxWidth: 8, borderRadius: 2, padding: 12, color: 'rgba(255,255,255,0.4)' } },
            tooltip: chartTooltip,
          },
          scales: {
            x: { stacked: true, grid: chartGrid, ticks: { ...chartTicks, font: { size: 10 } } },
            y: { stacked: true, grid: chartGrid, ticks: chartTicks, title: { display: true, text: 'Timmar', color: 'rgba(255,255,255,0.3)', font: { size: 10 } } },
          },
        },
      });
      chartInstances.current.push(chart);
    }

    if (panel === 'diesel' && dieselChartRef.current) {
      const labels = d.tidPerDag.map((t: any) => {
        const date = new Date(t.datum);
        return `${date.getDate()}/${date.getMonth() + 1}`;
      });
      const chart = new Chart(dieselChartRef.current, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              label: 'Liter', data: d.tidPerDag.map((t: any) => +t.diesel.toFixed(0)),
              backgroundColor: d.tidPerDag.map((t: any) => t.diesel === 0 ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.3)'),
              borderRadius: 2, yAxisID: 'y', order: 1,
            },
            {
              label: 'G15h', data: d.tidPerDag.map((t: any) => +t.g15.toFixed(1)),
              type: 'line', borderColor: 'rgba(255,255,255,0.2)', backgroundColor: 'transparent',
              pointBackgroundColor: d.tidPerDag.map((t: any) => t.g15 > 0 ? 'rgba(255,255,255,0.5)' : 'transparent'),
              pointRadius: d.tidPerDag.map((t: any) => t.g15 > 0 ? 3 : 0),
              tension: 0.3, yAxisID: 'y2', order: 0,
            },
          ],
        },
        options: {
          responsive: true, interaction: { mode: 'index', intersect: false },
          plugins: { legend: { display: false }, tooltip: chartTooltip },
          scales: {
            x: { grid: chartGrid, ticks: { ...chartTicks, font: { size: 10 } } },
            y: { grid: chartGrid, ticks: chartTicks, title: { display: true, text: 'Liter', color: 'rgba(255,255,255,0.3)', font: { size: 10 } } },
            y2: { position: 'right', grid: { drawOnChartArea: false }, ticks: chartTicks, title: { display: true, text: 'G15h', color: 'rgba(255,255,255,0.3)', font: { size: 10 } } },
          },
        },
      });
      chartInstances.current.push(chart);
    }

    if (panel === 'produktion' && sortChartRef.current && d.skordare.sortiment.length > 0) {
      const sortLabels = d.skordare.sortiment.map((s: any) => s.namn);
      const chart = new Chart(sortChartRef.current, {
        type: 'bar',
        data: {
          labels: sortLabels,
          datasets: [
            { label: 'm³', data: d.skordare.sortiment.map((s: any) => s.vol), backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 3, yAxisID: 'y', order: 1 },
            {
              label: 'Antal', data: d.skordare.sortiment.map((s: any) => s.st), type: 'line',
              borderColor: 'rgba(255,255,255,0.2)', backgroundColor: 'transparent',
              pointBackgroundColor: 'rgba(255,255,255,0.5)', pointRadius: 4, tension: 0.3, yAxisID: 'y2', order: 0,
            },
          ],
        },
        options: {
          responsive: true, interaction: { mode: 'index', intersect: false },
          plugins: { legend: { display: false }, tooltip: chartTooltip },
          scales: {
            x: { grid: chartGrid, ticks: chartTicks },
            y: { grid: chartGrid, ticks: chartTicks, title: { display: true, text: 'm³', color: 'rgba(255,255,255,0.3)', font: { size: 10 } } },
            y2: { position: 'right', grid: { drawOnChartArea: false }, ticks: chartTicks, title: { display: true, text: 'Antal', color: 'rgba(255,255,255,0.3)', font: { size: 10 } } },
          },
        },
      });
      chartInstances.current.push(chart);
    }

    if (panel === 'produktion' && prodChartRef.current && d.tradslagData.length > 0) {
      const chart = new Chart(prodChartRef.current, {
        type: 'bar',
        data: {
          labels: d.tradslagData.map((t: any) => t.namn),
          datasets: [
            { label: 'm³', data: d.tradslagData.map((t: any) => t.vol), backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 3, yAxisID: 'y', order: 1 },
            {
              label: 'Stammar', data: d.tradslagData.map((t: any) => t.st), type: 'line',
              borderColor: 'rgba(255,255,255,0.2)', backgroundColor: 'transparent',
              pointBackgroundColor: 'rgba(255,255,255,0.5)', pointRadius: 4, tension: 0.3, yAxisID: 'y2', order: 0,
            },
          ],
        },
        options: {
          responsive: true, interaction: { mode: 'index', intersect: false },
          plugins: { legend: { display: false }, tooltip: chartTooltip },
          scales: {
            x: { grid: chartGrid, ticks: chartTicks },
            y: { grid: chartGrid, ticks: chartTicks, title: { display: true, text: 'm³', color: 'rgba(255,255,255,0.3)', font: { size: 10 } } },
            y2: { position: 'right', grid: { drawOnChartArea: false }, ticks: chartTicks, title: { display: true, text: 'Stammar', color: 'rgba(255,255,255,0.3)', font: { size: 10 } } },
          },
        },
      });
      chartInstances.current.push(chart);
    }
  }, [panel, chartReady, d]);

  if (loading || !d) {
    return (
      <div style={{ minHeight: '100vh', background: bg, color: text, fontFamily: ff, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: muted, fontSize: 14 }}>Laddar...</div>
      </div>
    );
  }

  const volSk = Math.round(obj.volymSkordare);
  const volSt = Math.round(obj.volymSkotare);
  const maskin = obj.skordareModell || '–';
  const skotare = obj.skotareModell || null;
  const stammar = obj.stammar;

  const framkort = volSk > 0 ? Math.round((volSt / volSk) * 100) : 0;
  const kvar = 100 - framkort;
  const sagbart = d.skordare.sortiment.length > 0 ? Math.round((d.skordare.sortiment.filter((s: any) => s.namn.toLowerCase().includes('timmer')).reduce((a: number, s: any) => a + s.vol, 0) / Math.max(1, d.skordare.sortiment.reduce((a: number, s: any) => a + s.vol, 0))) * 100) : 0;

  const skDagar = daysBetweenNull(obj.skordareStart, obj.skordareSlut);
  const stDagar = daysBetweenNull(obj.skotareStart, obj.skotareSlut);
  const glapp = daysBetweenNull(obj.skordareSlut, obj.skotareStart);

  const isElephantKing = obj.skotareModellMaskinId === 'A110148';

  // Combined time
  const totalRuntime = d.skordare.g15 + d.skotare.g15;
  const totalAvbrott = (d.skordare.avbrott + d.skotare.avbrott) / 60;
  const totalRast = (d.skordare.rast + d.skotare.rast) / 60;
  const totalTomgang = (d.skordare.tomgang + d.skotare.tomgang) / 60;
  const totalTime = totalRuntime + totalAvbrott + totalRast + totalTomgang;

  const pctG15 = totalTime > 0 ? Math.round((totalRuntime / totalTime) * 100) : 0;
  const pctAvbrott = totalTime > 0 ? Math.round((totalAvbrott / totalTime) * 100) : 0;
  const pctRast = totalTime > 0 ? Math.round((totalRast / totalTime) * 100) : 0;
  const pctTomgang = totalTime > 0 ? 100 - pctG15 - pctAvbrott - pctRast : 0;

  // Combined diesel
  const totalDiesel = d.skordare.diesel.tot + d.skotare.diesel.tot;
  const totalDieselPerM3 = (obj.volymSkordare + obj.volymSkotare) > 0
    ? Math.round((totalDiesel / (obj.volymSkordare + obj.volymSkotare)) * 100) / 100 : 0;

  const handleSmalBred = async (val: 'smal' | 'bred') => {
    setSmalBred(val);
    const stId = obj.skotareObjektId;
    if (stId) {
      try {
        await supabase.from('dim_objekt').update({ skotare_konfiguration: val }).eq('objekt_id', stId);
      } catch {}
    }
  };

  return (
    <div style={{ position: 'fixed', top: 56, left: 0, right: 0, bottom: 0, background: bg, color: text, fontFamily: ff, WebkitFontSmoothing: 'antialiased', overflowY: 'auto' }}>

      {/* ── Header ── */}
      <div style={{ padding: '20px 24px 0' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: muted, fontSize: 14, cursor: 'pointer', padding: 0, marginBottom: 24, fontFamily: ff, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 18 }}>‹</span> Tillbaka
        </button>

        <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.5px', marginBottom: 6 }}>{obj.namn}</div>
        <div style={{ fontSize: 14, color: muted, marginBottom: 4 }}>{obj.agare} · {obj.areal} ha · {obj.typ === 'slutavverkning' ? 'Slutavverkning' : 'Gallring'}</div>

        {/* Machine info - minimal */}
        <div style={{ fontSize: 13, color: muted, marginTop: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div>{maskin} · {fmtDate(obj.skordareStart)} → {obj.skordareSlut ? fmtDate(obj.skordareSlut) : 'pågår'}{skDagar !== null ? ` · ${skDagar}d` : ''}</div>
          {skotare && <div>{skotare} · {obj.skotareStart ? `${fmtDate(obj.skotareStart)} → ${obj.skotareSlut ? fmtDate(obj.skotareSlut) : 'pågår'}` : 'Väntar'}{stDagar !== null ? ` · ${stDagar}d` : ''}</div>}
          {glapp !== null && glapp > 0 && <div style={{ color: bad, fontSize: 12 }}>{glapp} dagar mellanrum</div>}
          {obj.skotareStart && glapp !== null && glapp <= 0 && <div style={{ color: good, fontSize: 12 }}>Parallellkörning</div>}
        </div>

        {/* Smal/Bred toggle for Elephant King */}
        {isElephantKing && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16 }}>
            <span style={{ fontSize: 13, color: muted }}>Lastbredd</span>
            <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.06)', borderRadius: 8, padding: 3 }}>
              {(['smal', 'bred'] as const).map(v => (
                <button key={v} onClick={() => handleSmalBred(v)} style={{
                  padding: '5px 16px', border: 'none', borderRadius: 6,
                  fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: ff,
                  background: smalBred === v ? 'rgba(255,255,255,0.1)' : 'transparent',
                  color: smalBred === v ? text : muted,
                  transition: 'all 0.15s',
                }}>
                  {v === 'smal' ? 'Smal' : 'Bred'}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={{ padding: '0 24px 100px', maxWidth: 600, margin: '0 auto' }}>

        {/* ── Hero KPIs — two massive numbers ── */}
        <div style={{ display: 'flex', justifyContent: 'space-around', padding: '48px 0 32px', borderBottom: `1px solid ${divider}` }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 56, fontWeight: 700, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{volSk}</div>
            <div style={{ fontSize: 13, color: muted, marginTop: 8 }}>m³ skördat</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 56, fontWeight: 700, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{volSt}</div>
            <div style={{ fontSize: 13, color: muted, marginTop: 8 }}>m³ skotat</div>
          </div>
        </div>

        {/* ── Kvar i skogen ── */}
        <TapSection>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
            <span style={{ fontSize: 13, color: muted }}>Kvar i skogen</span>
            <span style={{ fontSize: 36, fontWeight: 700, color: kvar > 30 ? bad : good }}>{kvar}%</span>
          </div>
          <Bar pct={framkort} color={kvar > 30 ? bad : good} height={3} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: muted, marginTop: 10 }}>
            <span>Framkört {volSt} m³</span>
            <span>~{Math.max(0, volSk - volSt)} m³ kvar</span>
          </div>
        </TapSection>

        {/* ── Tidsbalans ── */}
        {d.skordare.g15 > 0 && d.skotare.g15 > 0 && (() => {
          const diff = d.skordare.g15 - d.skotare.g15;
          const skPct = Math.round((d.skordare.g15 / (d.skordare.g15 + d.skotare.g15)) * 100);
          const stPct = 100 - skPct;
          const skotareBakom = diff > 0;
          return (
            <TapSection label="Tidsbalans">
              <div style={{ display: 'flex', height: 24, borderRadius: 3, overflow: 'hidden', gap: 2, marginBottom: 12 }}>
                <div style={{ flex: skPct, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: text }}>{fmtH(d.skordare.g15)}</div>
                <div style={{ flex: stPct, background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: text }}>{fmtH(d.skotare.g15)}</div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: muted }}>
                <span>Skördare</span>
                <span>Skotare</span>
              </div>
              {Math.abs(diff) > 0.5 && (
                <div style={{ textAlign: 'center', fontSize: 13, marginTop: 12, color: skotareBakom ? bad : good }}>
                  Skotaren {Math.abs(diff).toFixed(1)}h {skotareBakom ? 'efter' : 'före'}
                </div>
              )}
            </TapSection>
          );
        })()}

        {/* ── Produktionstakt ── */}
        {(d.skordare.m3PerG15 > 0 || d.skotare.m3PerG15 > 0) && (
          <TapSection label="Produktionstakt">
            <div style={{ display: 'flex', justifyContent: 'space-around' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 40, fontWeight: 700, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{d.skordare.m3PerG15}</div>
                <div style={{ fontSize: 12, color: muted, marginTop: 6 }}>m³/G15h skördare</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 40, fontWeight: 700, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{d.skotare.m3PerG15}</div>
                <div style={{ fontSize: 12, color: muted, marginTop: 6 }}>m³/G15h skotare</div>
              </div>
            </div>
          </TapSection>
        )}

        {/* ── Combined Tid ── */}
        <TapSection label="Tid" onClick={() => setPanel('tid')}>
          <div style={{ display: 'flex', height: 20, borderRadius: 3, overflow: 'hidden', gap: 1, marginBottom: 16 }}>
            {pctG15 > 0 && <div style={{ flex: pctG15, background: 'rgba(255,255,255,0.25)' }} />}
            {pctAvbrott > 0 && <div style={{ flex: pctAvbrott, background: 'rgba(239,68,68,0.3)' }} />}
            {pctRast > 0 && <div style={{ flex: pctRast, background: 'rgba(255,255,255,0.06)' }} />}
            {pctTomgang > 0 && <div style={{ flex: pctTomgang, background: 'rgba(255,255,255,0.03)' }} />}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            <div>
              <div style={{ fontSize: 11, color: muted, marginBottom: 4 }}>Skördare</div>
              <div style={{ fontSize: 28, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtH(d.skordare.g15)}</div>
              <div style={{ fontSize: 12, color: muted }}>G0 {fmtH(d.skordare.g0)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: muted, marginBottom: 4 }}>Skotare</div>
              <div style={{ fontSize: 28, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtH(d.skotare.g15)}</div>
              <div style={{ fontSize: 12, color: muted }}>G0 {fmtH(d.skotare.g0)}</div>
            </div>
          </div>
          <div style={{ fontSize: 12, color: muted, marginTop: 12, display: 'flex', gap: 16 }}>
            <span>G15 {pctG15}%</span>
            <span>Avbrott {pctAvbrott}%</span>
            <span>Rast {pctRast}%</span>
          </div>
        </TapSection>

        {/* ── Combined Produktion ── */}
        <TapSection label="Produktion" onClick={() => setPanel('produktion')}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 24, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{d.skordare.stamPerG15}</div>
              <div style={{ fontSize: 11, color: muted }}>st/G15h</div>
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{d.medelstam || '–'}</div>
              <div style={{ fontSize: 11, color: muted }}>medelstam</div>
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{d.skordare.flertrad}%</div>
              <div style={{ fontSize: 11, color: muted }}>flerträd</div>
            </div>
          </div>
          {d.tradslagData.length > 0 && d.tradslagData.slice(0, 3).map((ts: any, i: number) => {
            const totVol = d.tradslagData.reduce((a: number, x: any) => a + x.vol, 0);
            const pct = totVol > 0 ? Math.round((ts.vol / totVol) * 100) : 0;
            return (
              <div key={i} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                  <span>{ts.namn}</span>
                  <span style={{ color: muted }}>{ts.vol} m³ · {pct}%</span>
                </div>
                <Bar pct={pct} color="rgba(255,255,255,0.2)" />
              </div>
            );
          })}
          {d.skotare.lass > 0 && (
            <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
              <div>
                <div style={{ fontSize: 24, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{d.skotare.lass}</div>
                <div style={{ fontSize: 11, color: muted }}>lass</div>
              </div>
              <div>
                <div style={{ fontSize: 24, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{d.skotare.snittLass}</div>
                <div style={{ fontSize: 11, color: muted }}>m³/lass</div>
              </div>
              <div>
                <div style={{ fontSize: 24, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{d.skotare.avstand}</div>
                <div style={{ fontSize: 11, color: muted }}>m avstånd</div>
              </div>
            </div>
          )}
        </TapSection>

        {/* ── Combined Diesel ── */}
        {totalDiesel > 0 && (
          <TapSection label="Diesel" onClick={() => setPanel('diesel')}>
            <div style={{ fontSize: 40, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{totalDiesel.toLocaleString('sv')} <span style={{ fontSize: 16, fontWeight: 400, color: muted }}>liter</span></div>
            <div style={{ fontSize: 13, color: muted, marginTop: 8 }}>{totalDieselPerM3} L/m³ totalt</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginTop: 20 }}>
              <div>
                <div style={{ fontSize: 12, color: muted, marginBottom: 4 }}>Skördare</div>
                <div style={{ fontSize: 18, fontWeight: 600 }}>{d.skordare.diesel.tot} L</div>
                <div style={{ fontSize: 12, color: muted }}>{d.skordare.diesel.perM3} L/m³ · {d.skordare.diesel.perTim} L/G15h</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: muted, marginBottom: 4 }}>Skotare</div>
                <div style={{ fontSize: 18, fontWeight: 600 }}>{d.skotare.diesel.tot} L</div>
                <div style={{ fontSize: 12, color: muted }}>{d.skotare.diesel.perM3} L/m³ · {d.skotare.diesel.perG15} L/G15h</div>
              </div>
            </div>
          </TapSection>
        )}

        {/* ── Combined Avbrott ── */}
        {(d.skordare.avbrott_lista.length > 0 || d.skotare.avbrott_lista.length > 0) && (
          <TapSection label="Avbrott" onClick={() => setPanel('avbrott')}>
            <div style={{ fontSize: 28, fontWeight: 700, color: bad, fontVariantNumeric: 'tabular-nums' }}>{fmtHM(d.skordare.avbrott + d.skotare.avbrott)}</div>
            <div style={{ fontSize: 13, color: muted, marginTop: 4, marginBottom: 16 }}>totalt stillestånd</div>
            {[...d.skordare.avbrott_lista, ...d.skotare.avbrott_lista]
              .sort((a: any, b: any) => b.tid - a.tid)
              .slice(0, 4)
              .map((a: any, i: number) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: i < 3 ? `1px solid ${divider}` : 'none', fontSize: 13 }}>
                  <span style={{ color: muted }}>{a.orsak} ({a.antal}x)</span>
                  <span style={{ fontWeight: 600, color: bad, fontVariantNumeric: 'tabular-nums' }}>{fmtHM(a.tid)}</span>
                </div>
              ))}
          </TapSection>
        )}

        {/* ── Extra KPIs ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, padding: '32px 0' }}>
          <div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{d.medelstam > 0 ? d.medelstam : '–'}</div>
            <div style={{ fontSize: 12, color: muted }}>medelstam m³fub</div>
          </div>
          <div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{obj.areal > 0 ? (volSk / obj.areal).toFixed(0) : '–'}</div>
            <div style={{ fontSize: 12, color: muted }}>m³/ha</div>
          </div>
        </div>

      </div>

      {/* ══════════ DRILL-DOWN PANELS ══════════ */}

      {/* ── TID Panel ── */}
      <DrillPanel open={panel === 'tid'} onClose={closePanel} title="Tidsfördelning">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 32 }}>
          <div><div style={{ fontSize: 24, fontWeight: 700 }}>{fmtH(d.skordare.arbetstid + d.skotare.arbetstid)}</div><div style={{ fontSize: 11, color: muted }}>arbetstid</div></div>
          <div><div style={{ fontSize: 24, fontWeight: 700 }}>{fmtH(totalRuntime)}</div><div style={{ fontSize: 11, color: muted }}>G15 totalt</div></div>
          <div><div style={{ fontSize: 24, fontWeight: 700 }}>{fmtHM(d.skordare.avbrott + d.skotare.avbrott)}</div><div style={{ fontSize: 11, color: muted }}>avbrott</div></div>
        </div>

        <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', color: muted, marginBottom: 12 }}>Fördelning</div>
        <DataRow label="G15 (produktiv)" value={`${fmtH(totalRuntime)} · ${pctG15}%`} />
        <DataRow label="Avbrott" value={`${fmtHM(d.skordare.avbrott + d.skotare.avbrott)} · ${pctAvbrott}%`} />
        <DataRow label="Rast" value={`${fmtHM(d.skordare.rast + d.skotare.rast)} · ${pctRast}%`} />
        <DataRow label="Tomgång" value={`${fmtHM(d.skordare.tomgang + d.skotare.tomgang)} · ${pctTomgang}%`} />
        <DataRow label="Korta stopp" value={fmtHM(d.skordare.kortaStopp + d.skotare.kortaStopp)} last />

        <div style={{ height: 32 }} />
        <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', color: muted, marginBottom: 12 }}>Per maskin</div>
        <DataRow label="Skördare G15" value={fmtH(d.skordare.g15)} />
        <DataRow label="Skördare G0" value={fmtH(d.skordare.g0)} />
        <DataRow label="Skotare G15" value={fmtH(d.skotare.g15)} />
        <DataRow label="Skotare G0" value={fmtH(d.skotare.g0)} last />

        {d.tidPerDag.length > 0 && (
          <>
            <div style={{ height: 32 }} />
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', color: muted, marginBottom: 12 }}>Tid per dag</div>
            <canvas ref={tidChartRef} style={{ maxHeight: 220, marginBottom: 16 }} />
          </>
        )}
      </DrillPanel>

      {/* ── PRODUKTION Panel ── */}
      <DrillPanel open={panel === 'produktion'} onClose={closePanel} title="Produktion">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 32 }}>
          <div><div style={{ fontSize: 24, fontWeight: 700 }}>{volSk.toLocaleString('sv')}</div><div style={{ fontSize: 11, color: muted }}>m³ totalt</div></div>
          <div><div style={{ fontSize: 24, fontWeight: 700 }}>{(d.skordare.antalStammar || stammar).toLocaleString('sv')}</div><div style={{ fontSize: 11, color: muted }}>stammar</div></div>
          <div><div style={{ fontSize: 24, fontWeight: 700 }}>{d.skordare.m3PerG15}</div><div style={{ fontSize: 11, color: muted }}>m³/G15h</div></div>
        </div>

        {d.tradslagData.length > 0 && (
          <>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', color: muted, marginBottom: 12 }}>Per trädslag</div>
            <canvas ref={prodChartRef} style={{ maxHeight: 180, marginBottom: 16 }} />
            {d.tradslagData.map((ts: any, i: number) => {
              const totVol = d.tradslagData.reduce((a: number, x: any) => a + x.vol, 0);
              const pct = totVol > 0 ? Math.round((ts.vol / totVol) * 100) : 0;
              return <DataRow key={i} label={ts.namn} value={`${ts.vol} m³ · ${pct}% · ${ts.st} st`} last={i === d.tradslagData.length - 1} />;
            })}
            <div style={{ height: 24 }} />
          </>
        )}

        {d.skordare.sortiment.length > 0 && (
          <>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', color: muted, marginBottom: 12 }}>Sortiment</div>
            <canvas ref={sortChartRef} style={{ maxHeight: 180, marginBottom: 16 }} />
            {d.skordare.sortiment.map((s: any, i: number) => {
              const totVol = d.skordare.sortiment.reduce((a: number, x: any) => a + x.vol, 0);
              const pct = totVol > 0 ? Math.round((s.vol / totVol) * 100) : 0;
              return <DataRow key={i} label={s.namn} value={`${s.vol} m³ · ${pct}% · ${s.st} st`} last={i === d.skordare.sortiment.length - 1} />;
            })}
            <div style={{ height: 24 }} />
          </>
        )}

        <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', color: muted, marginBottom: 12 }}>Produktivitet</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          {[
            { l: 'st/G15h', v: d.skordare.stamPerG15 },
            { l: 'm³/G15h', v: d.skordare.m3PerG15 },
            { l: 'MTH', v: `${d.skordare.flertrad}%` },
            { l: 'Medelstam', v: d.medelstam },
            { l: 'Sågbart', v: `${sagbart}%` },
            { l: 'm³/ha', v: obj.areal > 0 ? `${(volSk / obj.areal).toFixed(0)}` : '–' },
          ].map((p, i) => (
            <div key={i} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{p.v}</div>
              <div style={{ fontSize: 11, color: muted }}>{p.l}</div>
            </div>
          ))}
        </div>

        {d.skotare.lass > 0 && (
          <>
            <div style={{ height: 16 }} />
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', color: muted, marginBottom: 12 }}>Skotare</div>
            <DataRow label="Antal lass" value={d.skotare.lass} />
            <DataRow label="m³/G15h" value={d.skotare.m3PerG15} />
            <DataRow label="Lass/G15h" value={d.skotare.lassPerG15} />
            <DataRow label="Snitt lassvolym" value={`${d.skotare.snittLass} m³`} />
            <DataRow label="Skotningsavstånd" value={`${d.skotare.avstand} m`} last />
          </>
        )}
      </DrillPanel>

      {/* ── AVBROTT Panel ── */}
      <DrillPanel open={panel === 'avbrott'} onClose={closePanel} title="Avbrott">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 32 }}>
          <div><div style={{ fontSize: 24, fontWeight: 700, color: bad }}>{fmtHM(d.skordare.avbrott + d.skotare.avbrott)}</div><div style={{ fontSize: 11, color: muted }}>avbrott</div></div>
          <div><div style={{ fontSize: 24, fontWeight: 700 }}>{fmtHM(d.skordare.rast + d.skotare.rast)}</div><div style={{ fontSize: 11, color: muted }}>rast</div></div>
          <div><div style={{ fontSize: 24, fontWeight: 700 }}>{fmtHM(d.skordare.kortaStopp + d.skotare.kortaStopp)}</div><div style={{ fontSize: 11, color: muted }}>korta stopp</div></div>
        </div>

        {d.skordare.avbrott_lista.length > 0 && (
          <>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', color: muted, marginBottom: 12 }}>Skördare · {maskin}</div>
            {d.skordare.avbrott_lista.map((a: any, i: number) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 0', borderBottom: i < d.skordare.avbrott_lista.length - 1 ? `1px solid ${divider}` : 'none', fontSize: 13,
              }}>
                <div>
                  <div>{a.orsak}</div>
                  <div style={{ fontSize: 11, color: muted, marginTop: 1 }}>{a.typ} · {a.antal}x</div>
                </div>
                <div style={{ fontWeight: 600, color: bad, fontVariantNumeric: 'tabular-nums' }}>{fmtHM(a.tid)}</div>
              </div>
            ))}
            <div style={{ height: 24 }} />
          </>
        )}

        {d.skotare.avbrott_lista.length > 0 && (
          <>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', color: muted, marginBottom: 12 }}>Skotare · {skotare || '–'}</div>
            {d.skotare.avbrott_lista.map((a: any, i: number) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 0', borderBottom: i < d.skotare.avbrott_lista.length - 1 ? `1px solid ${divider}` : 'none', fontSize: 13,
              }}>
                <div>
                  <div>{a.orsak}</div>
                  <div style={{ fontSize: 11, color: muted, marginTop: 1 }}>{a.typ} · {a.antal}x</div>
                </div>
                <div style={{ fontWeight: 600, color: bad, fontVariantNumeric: 'tabular-nums' }}>{fmtHM(a.tid)}</div>
              </div>
            ))}
          </>
        )}

        {d.skordare.avbrott_lista.length === 0 && d.skotare.avbrott_lista.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: muted }}>Inga avbrott registrerade</div>
        )}
      </DrillPanel>

      {/* ── DIESEL Panel ── */}
      <DrillPanel open={panel === 'diesel'} onClose={closePanel} title="Diesel">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 32 }}>
          <div><div style={{ fontSize: 24, fontWeight: 700 }}>{totalDiesel.toLocaleString('sv')}</div><div style={{ fontSize: 11, color: muted }}>liter totalt</div></div>
          <div><div style={{ fontSize: 24, fontWeight: 700 }}>{totalDieselPerM3}</div><div style={{ fontSize: 11, color: muted }}>L/m³fub</div></div>
          <div><div style={{ fontSize: 24, fontWeight: 700 }}>{d.skordare.diesel.perTim}</div><div style={{ fontSize: 11, color: muted }}>L/G15h sk.</div></div>
        </div>

        <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', color: muted, marginBottom: 12 }}>Per maskin</div>
        <DataRow label="Skördare totalt" value={`${d.skordare.diesel.tot} L`} />
        <DataRow label="Skördare L/m³" value={d.skordare.diesel.perM3} />
        <DataRow label="Skördare L/G15h" value={d.skordare.diesel.perTim} />
        <DataRow label="Skotare totalt" value={`${d.skotare.diesel.tot} L`} />
        <DataRow label="Skotare L/m³" value={d.skotare.diesel.perM3} />
        <DataRow label="Skotare L/G15h" value={d.skotare.diesel.perG15} last />

        {d.tidPerDag.length > 0 && (
          <>
            <div style={{ height: 32 }} />
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', color: muted, marginBottom: 12 }}>Diesel per dag</div>
            <canvas ref={dieselChartRef} style={{ maxHeight: 220, marginBottom: 16 }} />
          </>
        )}
      </DrillPanel>

      {/* ── SKOTARPRODUKTION Panel ── */}
      <DrillPanel open={panel === 'skotarproduktion'} onClose={closePanel} title="Skotarproduktion">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 32 }}>
          <div><div style={{ fontSize: 24, fontWeight: 700 }}>{d.skotare.lass}</div><div style={{ fontSize: 11, color: muted }}>antal lass</div></div>
          <div><div style={{ fontSize: 24, fontWeight: 700 }}>{d.skotare.snittLass} m³</div><div style={{ fontSize: 11, color: muted }}>snitt/lass</div></div>
          <div><div style={{ fontSize: 24, fontWeight: 700 }}>{fmtH(d.skotare.g15)}</div><div style={{ fontSize: 11, color: muted }}>G15</div></div>
        </div>

        <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', color: muted, marginBottom: 12 }}>Produktivitet</div>
        <DataRow label="m³/G15h" value={d.skotare.m3PerG15} />
        <DataRow label="Lass/G15h" value={d.skotare.lassPerG15} />
        <DataRow label="Snitt lassvolym" value={`${d.skotare.snittLass} m³`} />
        <DataRow label="Skotningsavstånd" value={`${d.skotare.avstand} m`} last />

        <div style={{ height: 32 }} />
        <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', color: muted, marginBottom: 12 }}>Tid</div>
        <DataRow label="Arbetstid" value={fmtH(d.skotare.arbetstid)} />
        <DataRow label="G15" value={fmtH(d.skotare.g15)} />
        <DataRow label="G0" value={fmtH(d.skotare.g0)} />
        <DataRow label="Korta stopp" value={fmtHM(d.skotare.kortaStopp)} />
        <DataRow label="Avbrott" value={fmtHM(d.skotare.avbrott)} />
        <DataRow label="Rast" value={fmtHM(d.skotare.rast)} />
        <DataRow label="Tomgång" value={fmtHM(d.skotare.tomgang)} last />

        <div style={{ height: 32 }} />
        <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', color: muted, marginBottom: 12 }}>Diesel</div>
        <DataRow label="Totalt" value={`${d.skotare.diesel.tot} L`} />
        <DataRow label="Per m³fub" value={`${d.skotare.diesel.perM3} L`} />
        <DataRow label="Per G15h" value={`${d.skotare.diesel.perG15} L`} last />

        {d.skotare.avbrott_lista.length > 0 && (
          <>
            <div style={{ height: 32 }} />
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', color: muted, marginBottom: 12 }}>Avbrott</div>
            {d.skotare.avbrott_lista.map((a: any, i: number) => (
              <DataRow key={i} label={`${a.orsak} (${a.antal}x)`} value={fmtHM(a.tid)} last={i === d.skotare.avbrott_lista.length - 1} warn />
            ))}
          </>
        )}
      </DrillPanel>
    </div>
  );
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
      // Step 1: Fetch dimension tables and objekt info
      const [dimObjektRes, dimMaskinRes, objektTblRes] = await Promise.all([
        supabase.from('dim_objekt').select('*'),
        supabase.from('dim_maskin').select('*'),
        supabase.from('objekt').select('vo_nummer, markagare, areal, typ'),
      ]);

      const dimObjekt: any[] = dimObjektRes.data || [];
      const dimMaskin: any[] = dimMaskinRes.data || [];
      const objektTbl: any[] = objektTblRes.data || [];

      // Collect all objekt_ids to query fact tables with server-side filter
      const allObjektIds = [...new Set(dimObjekt.map(d => d.objekt_id).filter(Boolean))];

      // Paginated fetch helper (Supabase caps at 1000 rows per request)
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

      // Step 2: Fetch fact tables with pagination (fakt_produktion can exceed 1000 rows)
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

      // Build per-(objekt_id, maskin_id) diesel map for shared objekt_ids
      const tidPerMaskin = new Map<string, number>();
      tid.forEach(t => {
        if (t.objekt_id && t.maskin_id) {
          const k = t.objekt_id + '::' + t.maskin_id;
          tidPerMaskin.set(k, (tidPerMaskin.get(k) || 0) + (t.bransle_liter || 0));
        }
      });

      // Map objekt_id → set of maskin_ids from fakt_tid (to detect machines without dim_objekt)
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
        // Classify dim_objekt entries by machine type
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

        // Detect machines from fakt_tid that have no dim_objekt entry
        const allObjektIds = entries.map((e: any) => e.objekt_id);
        for (const oid of allObjektIds) {
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

        // Fallback: classify unknowns by checking which fact tables have data
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

        // Aggregate production across all skördare objekt_ids
        let skVol = 0, skStammar = 0;
        for (const e of skordareEntries) {
          const p = prodAgg.get(e.objekt_id);
          if (p) { skVol += p.vol; skStammar += p.stammar; }
        }

        // Aggregate lass across all skotare objekt_ids
        let stVol = 0, stCount = 0;
        for (const e of skotareEntries) {
          const l = lassAgg.get(e.objekt_id);
          if (l) { stVol += l.vol; stCount += l.count; }
        }
        // If skotare shares objekt_id with skördare and has no own lass, check shared objekt_ids
        if (stCount === 0 && skotareEntry) {
          for (const e of skordareEntries) {
            const l = lassAgg.get(e.objekt_id);
            if (l) { stVol += l.vol; stCount += l.count; }
          }
        }

        // Aggregate diesel per machine type using per-maskin map (handles shared objekt_ids)
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
