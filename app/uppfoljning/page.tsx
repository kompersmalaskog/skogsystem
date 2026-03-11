'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/* ── Maskinvy-style design tokens ── */
const C = {
  bg: '#111110', surface: '#1a1a18', surface2: '#222220',
  border: 'rgba(255,255,255,0.07)', border2: 'rgba(255,255,255,0.12)',
  text: '#e8e8e4', muted: '#7a7a72', dim: '#3a3a36',
  accent: '#5aff8c', accent2: '#1a4a2e',
  warn: '#ffb340', danger: '#ff5f57', blue: '#5b8fff',
  yellow: '#ffb340', green: '#5aff8c',
};
const ff = "'Geist', system-ui, sans-serif";
const ffNum = "'Fraunces', Georgia, serif";

const globalCss = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Geist:wght@400;500;600;700&display=swap');
`;

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

/* ── Chart config constants ── */
const chartGrid = { color: 'rgba(255,255,255,0.05)' };
const chartTicks = { color: '#7a7a72', font: { size: 11, family: 'Geist' } };
const chartTooltip = {
  backgroundColor: '#1a1a18', titleColor: '#e8e8e4', bodyColor: '#7a7a72',
  borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1, padding: 10,
};

/* ── Bar (maskinvy-style progress bar) ── */
function Bar({ pct, color, height = 3 }: { pct: number; color: string; height?: number }) {
  return (
    <div style={{ height, background: C.dim, borderRadius: 2, overflow: 'hidden' }}>
      <div style={{ width: `${Math.min(100, Math.max(0, pct))}%`, height: '100%', background: color, borderRadius: 2, transition: 'width 1s cubic-bezier(0.4,0,0.2,1)' }} />
    </div>
  );
}

/* ── Drill-down Panel (maskinvy-style right sliding overlay) ── */
function DrillPanel({ open, onClose, icon, title, subtitle, children }: {
  open: boolean; onClose: () => void; icon: string; title: string; subtitle?: string; children: React.ReactNode;
}) {
  return (
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)', zIndex: 500,
        opacity: open ? 1 : 0, pointerEvents: open ? 'all' : 'none',
        transition: 'opacity 0.25s',
      }} />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 520, background: C.surface,
        borderLeft: `1px solid ${C.border2}`,
        zIndex: 501, overflowY: 'auto',
        transform: open ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.3s cubic-bezier(0.4,0,0.2,1)',
      }}>
        <div style={{
          position: 'sticky', top: 0, background: C.surface,
          borderBottom: `1px solid ${C.border}`,
          padding: '18px 24px', display: 'flex', alignItems: 'center', gap: 14, zIndex: 10,
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: 8,
            background: 'rgba(255,255,255,0.07)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.7)', flexShrink: 0,
          }}>{icon}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: ffNum, fontSize: 18, fontWeight: 500 }}>{title}</div>
            {subtitle && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{subtitle}</div>}
          </div>
          <button onClick={onClose} style={{
            width: 30, height: 30, borderRadius: '50%',
            background: 'rgba(255,255,255,0.07)', border: 'none', cursor: 'pointer',
            color: C.muted, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>✕</button>
        </div>
        <div style={{ padding: '20px 24px 40px' }}>
          {children}
        </div>
      </div>
    </>
  );
}

/* ── KPI grid (maskinvy forar-kpis style) ── */
function KpiGrid({ items }: { items: { v: string | number; l: string }[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(items.length, 3)},1fr)`, gap: 8, marginBottom: 20 }}>
      {items.map((x, i) => (
        <div key={i} style={{ background: C.surface2, borderRadius: 10, padding: '14px 12px', textAlign: 'center' }}>
          <div style={{ fontFamily: ffNum, fontSize: 24, lineHeight: 1, color: C.text }}>{x.v}</div>
          <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.6px', color: C.muted, marginTop: 4 }}>{x.l}</div>
        </div>
      ))}
    </div>
  );
}

/* ── Section label (maskinvy fsec-title style) ── */
function SectionLabel({ text }: { text: string }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.8px', color: C.muted, marginBottom: 10 }}>
      {text}
    </div>
  );
}

/* ── Data row (maskinvy frow style) ── */
function DataRow({ label, value, last, warn }: { label: string; value: string | number; last?: boolean; warn?: boolean }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '9px 0', borderBottom: last ? 'none' : `1px solid ${C.border}`, fontSize: 12,
    }}>
      <span style={{ color: C.muted }}>{label}</span>
      <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: warn ? C.warn : undefined }}>{value}</span>
    </div>
  );
}

/* ── Clickable card (maskinvy card style) ── */
function ClickCard({ title, badge, onClick, children }: {
  title: string; badge?: string; onClick?: () => void; children: React.ReactNode;
}) {
  return (
    <div onClick={onClick} style={{
      background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16,
      overflow: 'hidden', transition: 'border-color 0.2s',
      cursor: onClick ? 'pointer' : undefined, marginBottom: 8,
    }}>
      <div style={{ padding: '18px 22px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.9px', color: C.muted }}>{title}</div>
        {badge && <span style={{
          display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 20,
          fontSize: 10, fontWeight: 600, letterSpacing: '0.3px',
          background: 'rgba(90,255,140,0.1)', color: C.accent,
        }}>{badge}</span>}
      </div>
      <div style={{ padding: '14px 22px 20px' }}>{children}</div>
    </div>
  );
}

/* ── ObjektKort — simplified card ── */
function ObjektKort({ obj, onClick }: { obj: UppfoljningObjekt; onClick: () => void }) {
  const done = obj.status === 'avslutat';
  return (
    <div onClick={onClick} style={{
      background: C.surface, borderRadius: 16, padding: '18px 22px', cursor: 'pointer',
      marginBottom: 8, border: `1px solid ${C.border}`, transition: 'border-color 0.2s',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.3px', color: C.text }}>{obj.namn}</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>{obj.agare}</div>
        </div>
        {done && (
          <span style={{
            fontSize: 11, fontWeight: 600, color: C.accent, padding: '4px 12px',
            background: 'rgba(90,255,140,0.1)', borderRadius: 20, flexShrink: 0, marginLeft: 12,
          }}>Klar</span>
        )}
      </div>
      {!done && (obj.skordareModell || obj.skotareModell) && (
        <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
          {obj.skordareModell && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: C.surface2, borderRadius: 8 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.blue, flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: C.text }}>{obj.skordareModell}</span>
            </div>
          )}
          {obj.skotareModell && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: C.surface2, borderRadius: 8 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.accent, flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: C.text }}>{obj.skotareModell}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── ObjektDetalj — maskinvy-styled detail view with drill-down charts ── */
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
          medelstam: 0, tidPerDag: [], dieselPerDag: [],
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

      const [tidRes, prodRes, sortRes, dimSortRes, avbrottRes, lassRes] = await Promise.all([
        supabase.from('fakt_tid').select('datum, objekt_id, processing_sek, terrain_sek, other_work_sek, maintenance_sek, disturbance_sek, rast_sek, kort_stopp_sek, bransle_liter, engine_time_sek, tomgang_sek').in('objekt_id', ids),
        supabase.from('fakt_produktion').select('objekt_id, volym_m3sub, stammar, processtyp, tradslag').in('objekt_id', ids),
        supabase.from('fakt_sortiment').select('objekt_id, sortiment_id, volym_m3sub, antal').in('objekt_id', ids),
        supabase.from('dim_sortiment').select('sortiment_id, namn'),
        supabase.from('fakt_avbrott').select('objekt_id, typ, tid_sek').in('objekt_id', ids),
        stId ? supabase.from('fakt_lass').select('objekt_id, volym_m3sob, korstracka_m').eq('objekt_id', stId) : Promise.resolve({ data: [] }),
      ]);

      const tidRows = tidRes.data || [];
      const prodRows = prodRes.data || [];
      const sortRows = sortRes.data || [];
      const dimSort = dimSortRes.data || [];
      const avbrottRows = avbrottRes.data || [];
      const lassRows = (lassRes.data || []) as any[];

      const sortMap = new Map<string, string>();
      dimSort.forEach((s: any) => sortMap.set(s.sortiment_id, s.namn));

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

      const skTidRows = skId ? tidRows.filter((r: any) => r.objekt_id === skId) : [];
      const stTidRows = stId ? tidRows.filter((r: any) => r.objekt_id === stId) : [];
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

      // Per trädslag production
      const tradslagAgg = new Map<string, { vol: number; st: number }>();
      skProd.forEach((r: any) => {
        const ts = r.tradslag || 'Övrigt';
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

      // Avbrott
      const buildAvbrott = (rows: any[]) => {
        const m = new Map<string, number>();
        rows.forEach(r => { m.set(r.typ || 'Övrigt', (m.get(r.typ || 'Övrigt') || 0) + (r.tid_sek || 0)); });
        return Array.from(m.entries()).map(([typ, sek]) => ({ typ, tid: Math.round(sek / 60) })).sort((a, b) => b.tid - a.tid);
      };
      const skAvbrott = skId ? avbrottRows.filter((r: any) => r.objekt_id === skId) : [];
      const stAvbrott = stId ? avbrottRows.filter((r: any) => r.objekt_id === stId) : [];

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
          lass: antalLass, snittLass, lassPerG15, m3PerG15: m3PerG15St, avstand, lastrede: '–',
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
            { label: 'G15', data: d.tidPerDag.map((t: any) => +t.g15.toFixed(1)), backgroundColor: 'rgba(90,255,140,0.5)', borderRadius: 3, stack: 's' },
            { label: 'Avbrott', data: d.tidPerDag.map((t: any) => +t.avbrott.toFixed(1)), backgroundColor: 'rgba(255,179,64,0.4)', borderRadius: 3, stack: 's' },
            { label: 'Rast', data: d.tidPerDag.map((t: any) => +t.rast.toFixed(1)), backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 3, stack: 's' },
          ],
        },
        options: {
          responsive: true, interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { position: 'top', labels: { font: { family: 'Geist', size: 11 }, boxWidth: 8, borderRadius: 2, padding: 12, color: '#7a7a72' } },
            tooltip: chartTooltip,
          },
          scales: {
            x: { stacked: true, grid: chartGrid, ticks: { ...chartTicks, font: { size: 10 } } },
            y: { stacked: true, grid: chartGrid, ticks: chartTicks, title: { display: true, text: 'Timmar', color: '#7a7a72', font: { size: 10 } } },
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
              backgroundColor: d.tidPerDag.map((t: any) => t.diesel === 0 ? 'rgba(255,255,255,0.04)' : 'rgba(90,255,140,0.5)'),
              borderRadius: 3, yAxisID: 'y', order: 1,
            },
            {
              label: 'G15h', data: d.tidPerDag.map((t: any) => +t.g15.toFixed(1)),
              type: 'line', borderColor: 'rgba(91,143,255,0.6)', backgroundColor: 'rgba(91,143,255,0.05)',
              pointBackgroundColor: d.tidPerDag.map((t: any) => t.g15 > 0 ? '#5b8fff' : 'transparent'),
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
            y: { grid: chartGrid, ticks: chartTicks, title: { display: true, text: 'Liter', color: '#7a7a72', font: { size: 10 } } },
            y2: { position: 'right', grid: { drawOnChartArea: false }, ticks: { ...chartTicks, color: '#5b8fff' }, title: { display: true, text: 'G15h', color: '#5b8fff', font: { size: 10 } } },
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
            { label: 'm³', data: d.skordare.sortiment.map((s: any) => s.vol), backgroundColor: 'rgba(90,255,140,0.5)', borderRadius: 4, yAxisID: 'y', order: 1 },
            {
              label: 'Antal', data: d.skordare.sortiment.map((s: any) => s.st), type: 'line',
              borderColor: 'rgba(91,143,255,0.6)', backgroundColor: 'rgba(91,143,255,0.05)',
              pointBackgroundColor: '#5b8fff', pointRadius: 4, tension: 0.3, yAxisID: 'y2', order: 0,
            },
          ],
        },
        options: {
          responsive: true, interaction: { mode: 'index', intersect: false },
          plugins: { legend: { display: false }, tooltip: chartTooltip },
          scales: {
            x: { grid: chartGrid, ticks: chartTicks },
            y: { grid: chartGrid, ticks: chartTicks, title: { display: true, text: 'm³', color: '#7a7a72', font: { size: 10 } } },
            y2: { position: 'right', grid: { drawOnChartArea: false }, ticks: { ...chartTicks, color: '#5b8fff' }, title: { display: true, text: 'Antal', color: '#5b8fff', font: { size: 10 } } },
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
            { label: 'm³', data: d.tradslagData.map((t: any) => t.vol), backgroundColor: 'rgba(90,255,140,0.5)', borderRadius: 4, yAxisID: 'y', order: 1 },
            {
              label: 'Stammar', data: d.tradslagData.map((t: any) => t.st), type: 'line',
              borderColor: 'rgba(91,143,255,0.6)', backgroundColor: 'rgba(91,143,255,0.05)',
              pointBackgroundColor: '#5b8fff', pointRadius: 4, tension: 0.3, yAxisID: 'y2', order: 0,
            },
          ],
        },
        options: {
          responsive: true, interaction: { mode: 'index', intersect: false },
          plugins: { legend: { display: false }, tooltip: chartTooltip },
          scales: {
            x: { grid: chartGrid, ticks: chartTicks },
            y: { grid: chartGrid, ticks: chartTicks, title: { display: true, text: 'm³', color: '#7a7a72', font: { size: 10 } } },
            y2: { position: 'right', grid: { drawOnChartArea: false }, ticks: { ...chartTicks, color: '#5b8fff' }, title: { display: true, text: 'Stammar', color: '#5b8fff', font: { size: 10 } } },
          },
        },
      });
      chartInstances.current.push(chart);
    }
  }, [panel, chartReady, d]);

  if (loading || !d) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: ff, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: C.muted, fontSize: 14 }}>Laddar detaljer...</div>
      </div>
    );
  }

  const volSk = Math.round(obj.volymSkordare);
  const volSt = Math.round(obj.volymSkotare);
  const maskin = obj.skordareModell || '–';
  const skotare = obj.skotareModell || null;
  const vo = obj.vo_nummer || null;
  const uid = obj.skordareObjektId || obj.skotareObjektId || '–';
  const stammar = obj.stammar;

  const framkort = volSk > 0 ? Math.round((volSt / volSk) * 100) : 0;
  const kvar = 100 - framkort;
  const tf = obj.typ === 'slutavverkning' ? C.warn : C.accent;
  const sagbart = d.skordare.sortiment.length > 0 ? Math.round((d.skordare.sortiment.filter((s: any) => s.namn.toLowerCase().includes('timmer')).reduce((a: number, s: any) => a + s.vol, 0) / Math.max(1, d.skordare.sortiment.reduce((a: number, s: any) => a + s.vol, 0))) * 100) : 0;
  const produktiv = d.skordare.arbetstid > 0 ? Math.round((d.skordare.g15 / d.skordare.arbetstid) * 100) : 0;
  const produktivSt = d.skotare.arbetstid > 0 ? Math.round((d.skotare.g15 / d.skotare.arbetstid) * 100) : 0;

  const skDagar = daysBetweenNull(obj.skordareStart, obj.skordareSlut);
  const stDagar = daysBetweenNull(obj.skotareStart, obj.skotareSlut);
  const glapp = daysBetweenNull(obj.skordareSlut, obj.skotareStart);

  const isElephantKing = obj.skotareModellMaskinId === 'A110148';

  // Total time percentages for time bar
  const totalRuntime = d.skordare.g15 + d.skotare.g15;
  const totalAvbrott = (d.skordare.avbrott + d.skotare.avbrott) / 60;
  const totalRast = (d.skordare.rast + d.skotare.rast) / 60;
  const totalTomgang = (d.skordare.tomgang + d.skotare.tomgang) / 60;
  const totalTime = totalRuntime + totalAvbrott + totalRast + totalTomgang;

  const pctG15 = totalTime > 0 ? Math.round((totalRuntime / totalTime) * 100) : 0;
  const pctAvbrott = totalTime > 0 ? Math.round((totalAvbrott / totalTime) * 100) : 0;
  const pctRast = totalTime > 0 ? Math.round((totalRast / totalTime) * 100) : 0;
  const pctTomgang = totalTime > 0 ? 100 - pctG15 - pctAvbrott - pctRast : 0;

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
    <div style={{ position: 'fixed', top: 56, left: 0, right: 0, bottom: 0, background: C.bg, color: C.text, fontFamily: ff, WebkitFontSmoothing: 'antialiased', overflowY: 'auto' }}>
      <style>{globalCss}</style>

      {/* ── Header ── */}
      <div style={{ padding: '14px 22px 22px', background: C.surface, borderBottom: `1px solid ${C.border}` }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: C.blue, fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 16, fontFamily: ff, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 16 }}>‹</span> Tillbaka
        </button>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontFamily: ffNum, fontSize: 26, fontWeight: 700, letterSpacing: '-1px', marginBottom: 6, color: C.text }}>{obj.namn}</div>
          <div style={{ fontSize: 13, color: C.muted }}>
            {obj.agare} · {obj.areal} ha
            <span style={{
              marginLeft: 10, padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 600, letterSpacing: '0.3px',
              background: obj.typ === 'slutavverkning' ? 'rgba(255,179,64,0.1)' : 'rgba(90,255,140,0.1)', color: tf,
            }}>
              {obj.typ === 'slutavverkning' ? 'Slutavverkning' : 'Gallring'}
            </span>
          </div>
          <div style={{ fontSize: 10, color: C.dim, marginTop: 8, letterSpacing: '0.3px' }}>
            {vo && <span>VO {vo} · </span>}ID {uid}
          </div>
        </div>

        {/* Maskiner med datum */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ padding: '12px 14px', background: C.surface2, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: C.blue }} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{maskin}</div>
                <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>Skördare</div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 12, color: C.text }}>{fmtDate(obj.skordareStart)} → {obj.skordareSlut ? fmtDate(obj.skordareSlut) : 'pågår'}</div>
              {skDagar !== null && <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{skDagar} dagar</div>}
            </div>
          </div>

          {glapp !== null && glapp > 0 && (
            <div style={{ textAlign: 'center', padding: '4px 0' }}>
              <span style={{ fontSize: 10, color: glapp > 7 ? C.warn : C.muted }}>{glapp} dagar mellanrum</span>
            </div>
          )}
          {obj.skotareStart && glapp !== null && glapp <= 0 && (
            <div style={{ textAlign: 'center', padding: '4px 0' }}>
              <span style={{ fontSize: 10, color: C.accent }}>Parallellkörning</span>
            </div>
          )}

          <div style={{ padding: '12px 14px', background: C.surface2, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: C.accent }} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{skotare || 'Ej tilldelad'}</div>
                <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>Skotare</div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              {obj.skotareStart ? (
                <>
                  <div style={{ fontSize: 12, color: C.text }}>{fmtDate(obj.skotareStart)} → {obj.skotareSlut ? fmtDate(obj.skotareSlut) : 'pågår'}</div>
                  {stDagar !== null && <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{stDagar} dagar</div>}
                </>
              ) : (
                <div style={{ fontSize: 12, color: C.dim }}>Väntar</div>
              )}
            </div>
          </div>

          {/* Smal/Bred toggle for Elephant King */}
          {isElephantKing && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', background: C.surface2, borderRadius: 10 }}>
              <span style={{ fontSize: 11, color: C.muted, flex: 1 }}>Skotare lastbredd</span>
              <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: 3 }}>
                {(['smal', 'bred'] as const).map(v => (
                  <button key={v} onClick={() => handleSmalBred(v)} style={{
                    padding: '5px 14px', border: 'none', borderRadius: 6,
                    fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: ff,
                    background: smalBred === v ? C.surface : 'transparent',
                    color: smalBred === v ? C.accent : C.muted,
                    transition: 'all 0.15s',
                  }}>
                    {v === 'smal' ? 'Smal' : 'Bred'}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ padding: '16px 16px 80px', maxWidth: 700, margin: '0 auto' }}>

        {/* ── Hero KPIs ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <div style={{ background: C.surface, borderRadius: 16, padding: '24px 18px', textAlign: 'center', border: `1px solid ${C.border}`, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', bottom: -60, right: -60, width: 200, height: 200, borderRadius: '50%', background: 'radial-gradient(circle, rgba(90,255,140,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', color: C.muted, marginBottom: 12 }}>Skördat</div>
            <div style={{ fontFamily: ffNum, fontSize: 48, fontWeight: 700, letterSpacing: '-2px', lineHeight: 1, color: C.accent }}>{volSk}</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>m³fub</div>
          </div>
          <div style={{ background: C.surface, borderRadius: 16, padding: '24px 18px', textAlign: 'center', border: `1px solid ${C.border}`, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', bottom: -60, right: -60, width: 200, height: 200, borderRadius: '50%', background: 'radial-gradient(circle, rgba(91,143,255,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', color: C.muted, marginBottom: 12 }}>Skotat</div>
            <div style={{ fontFamily: ffNum, fontSize: 48, fontWeight: 700, letterSpacing: '-2px', lineHeight: 1, color: C.blue }}>{volSt}</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>m³fub</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <div style={{ background: C.surface, borderRadius: 16, padding: '18px 16px', textAlign: 'center', border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.8px', color: C.muted, marginBottom: 8 }}>Medelstam</div>
            <div style={{ fontFamily: ffNum, fontSize: 28, fontWeight: 700, letterSpacing: '-1px', color: C.text }}>{d.medelstam || '–'}<span style={{ fontSize: 11, fontWeight: 400, color: C.muted, fontFamily: ff }}> m³fub</span></div>
          </div>
          <div style={{ background: C.surface, borderRadius: 16, padding: '18px 16px', textAlign: 'center', border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.8px', color: C.muted, marginBottom: 8 }}>Volym/ha</div>
            <div style={{ fontFamily: ffNum, fontSize: 28, fontWeight: 700, letterSpacing: '-1px', color: C.text }}>{obj.areal > 0 ? (volSk / obj.areal).toFixed(0) : '–'}<span style={{ fontSize: 11, fontWeight: 400, color: C.muted, fontFamily: ff }}> m³</span></div>
          </div>
        </div>

        {/* ── Kvar i skogen ── */}
        <div style={{ background: C.surface, borderRadius: 16, padding: '20px 22px', marginBottom: 8, border: `1px solid ${C.border}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
            <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.8px', color: C.muted }}>Kvar i skogen</span>
            <span style={{ fontFamily: ffNum, fontSize: 32, fontWeight: 700, letterSpacing: '-1px', color: kvar > 30 ? C.warn : C.accent }}>{kvar}%</span>
          </div>
          <Bar pct={kvar} color={kvar > 30 ? C.warn : C.accent} height={4} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: C.muted, marginTop: 10 }}>
            <span>Skotat {volSt} m³</span>
            <span>Kvar ~{volSk - volSt} m³</span>
          </div>
        </div>

        {/* ── TIDSBALANS ── */}
        {d.skordare.g15 > 0 && d.skotare.g15 > 0 && (() => {
          const diff = d.skordare.g15 - d.skotare.g15;
          const pctDiff = d.skordare.g15 > 0 ? Math.round((diff / d.skordare.g15) * 100) : 0;
          const skotareBakom = diff > 0;
          const diffColor = skotareBakom ? C.danger : C.accent;
          const diffText = skotareBakom
            ? `Skotaren låg ${Math.abs(diff).toFixed(1)}h efter skördaren (${Math.abs(pctDiff)}% långsammare)`
            : diff < 0
              ? `Skotaren låg ${Math.abs(diff).toFixed(1)}h före skördaren (${Math.abs(pctDiff)}% snabbare)`
              : 'Skördare och skotare i balans';
          const skPct = Math.round((d.skordare.g15 / (d.skordare.g15 + d.skotare.g15)) * 100);
          const stPct = 100 - skPct;
          return (
            <div style={{ background: C.surface, borderRadius: 16, padding: '20px 22px', marginBottom: 8, border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.8px', color: C.muted, marginBottom: 14 }}>Tidsbalans</div>
              <div style={{ display: 'flex', height: 18, borderRadius: 5, overflow: 'hidden', gap: 2, marginBottom: 12 }}>
                <div style={{ flex: skPct, background: 'rgba(91,143,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 9, fontWeight: 600 }}>{fmtH(d.skordare.g15)}</div>
                <div style={{ flex: stPct, background: 'rgba(90,255,140,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 9, fontWeight: 600 }}>{fmtH(d.skotare.g15)}</div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 20, fontSize: 11, color: C.muted, marginBottom: 14 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 6, height: 6, borderRadius: 2, background: C.blue, display: 'inline-block' }} />Skördare</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 6, height: 6, borderRadius: 2, background: C.accent, display: 'inline-block' }} />Skotare</span>
              </div>
              <div style={{ textAlign: 'center', fontSize: 12, fontWeight: 500, color: diffColor }}>{diffText}</div>
            </div>
          );
        })()}

        {/* ── TID — clickable card ── */}
        <ClickCard title="Tid" badge={`${produktiv}% produktiv`} onClick={() => setPanel('tid')}>
          <div style={{ display: 'flex', height: 18, borderRadius: 5, overflow: 'hidden', gap: 2, marginBottom: 14 }}>
            {pctG15 > 0 && <div style={{ flex: pctG15, background: 'rgba(90,255,140,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 600 }} />}
            {pctAvbrott > 0 && <div style={{ flex: pctAvbrott, background: 'rgba(255,179,64,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 600 }} />}
            {pctRast > 0 && <div style={{ flex: pctRast, background: 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 600 }} />}
            {pctTomgang > 0 && <div style={{ flex: pctTomgang, background: 'rgba(91,143,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 600 }} />}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: C.muted }}><div style={{ width: 6, height: 6, borderRadius: 2, background: 'rgba(90,255,140,0.4)' }} />G15 {fmtH(totalRuntime)}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: C.muted }}><div style={{ width: 6, height: 6, borderRadius: 2, background: 'rgba(255,179,64,0.4)' }} />Avbrott {fmtHM(d.skordare.avbrott + d.skotare.avbrott)}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: C.muted }}><div style={{ width: 6, height: 6, borderRadius: 2, background: 'rgba(255,255,255,0.08)' }} />Rast {fmtHM(d.skordare.rast + d.skotare.rast)}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: C.muted }}><div style={{ width: 6, height: 6, borderRadius: 2, background: 'rgba(91,143,255,0.3)' }} />Tomgång {fmtHM(d.skordare.tomgang + d.skotare.tomgang)}</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <div style={{ background: C.surface2, borderRadius: 8, padding: '10px 8px', textAlign: 'center' }}>
              <div style={{ fontFamily: ffNum, fontSize: 22, lineHeight: 1 }}>{fmtH(d.skordare.g15)}</div>
              <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.5px', color: C.muted, marginTop: 3 }}>Skördare G15</div>
            </div>
            <div style={{ background: C.surface2, borderRadius: 8, padding: '10px 8px', textAlign: 'center' }}>
              <div style={{ fontFamily: ffNum, fontSize: 22, lineHeight: 1 }}>{fmtH(d.skotare.g15)}</div>
              <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.5px', color: C.muted, marginTop: 3 }}>Skotare G15</div>
            </div>
          </div>
          <div style={{ marginTop: 12, fontSize: 10, color: C.muted, textAlign: 'center', letterSpacing: '0.3px' }}>Tryck för tidsdetaljer per dag →</div>
        </ClickCard>

        {/* ── PRODUKTION — clickable card ── */}
        <ClickCard title="Produktion" badge={`${d.skordare.flertrad}% flerträd`} onClick={() => setPanel('produktion')}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 14 }}>
            {[
              { l: 'Stammar/G15', v: d.skordare.stamPerG15 },
              { l: 'm³/G15', v: d.skordare.m3PerG15 },
              { l: 'Stammar', v: d.skordare.antalStammar || stammar },
            ].map((p, i) => (
              <div key={i} style={{ background: C.surface2, borderRadius: 10, padding: '14px 12px', textAlign: 'center' }}>
                <div style={{ fontFamily: ffNum, fontSize: 20, fontWeight: 700, lineHeight: 1 }}>{typeof p.v === 'number' ? p.v.toLocaleString('sv') : p.v}</div>
                <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.6px', color: C.muted, marginTop: 6 }}>{p.l}</div>
              </div>
            ))}
          </div>
          {d.tradslagData.length > 0 && (
            <>
              {d.tradslagData.slice(0, 4).map((ts: any, i: number) => {
                const totVol = d.tradslagData.reduce((a: number, x: any) => a + x.vol, 0);
                const pct = totVol > 0 ? Math.round((ts.vol / totVol) * 100) : 0;
                return (
                  <div key={i} style={{ padding: '9px 0', borderBottom: i < Math.min(d.tradslagData.length, 4) - 1 ? `1px solid ${C.border}` : 'none' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
                      <span style={{ fontSize: 13, fontWeight: 400 }}>{ts.namn}</span>
                      <span style={{ fontSize: 12, color: C.muted, fontVariantNumeric: 'tabular-nums' }}>{ts.vol} m³ · {pct}%</span>
                    </div>
                    <Bar pct={pct} color="rgba(255,255,255,0.2)" />
                  </div>
                );
              })}
            </>
          )}
          <div style={{ marginTop: 12, fontSize: 10, color: C.muted, textAlign: 'center', letterSpacing: '0.3px' }}>Tryck för sortiment & trädslag →</div>
        </ClickCard>

        {/* ── AVBROTT — clickable card ── */}
        {(d.skordare.avbrott_lista.length > 0 || d.skotare.avbrott_lista.length > 0) && (
          <ClickCard title="Avbrott & stillestånd" badge={fmtHM(d.skordare.avbrott + d.skotare.avbrott)} onClick={() => setPanel('avbrott')}>
            {d.skordare.avbrott_lista.slice(0, 4).map((a: any, i: number) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: i < 3 ? `1px solid ${C.border}` : 'none', fontSize: 12 }}>
                <span style={{ color: C.muted }}>{a.typ}</span>
                <span style={{ fontWeight: 600, color: C.warn, fontVariantNumeric: 'tabular-nums' }}>{fmtHM(a.tid)}</span>
              </div>
            ))}
            <div style={{ marginTop: 12, fontSize: 10, color: C.muted, textAlign: 'center', letterSpacing: '0.3px' }}>Tryck för alla avbrott →</div>
          </ClickCard>
        )}

        {/* ── DIESEL — clickable card ── */}
        <ClickCard title="Diesel" badge={`${(d.skordare.diesel.perM3 + d.skotare.diesel.perM3).toFixed(2)} L/m³`} onClick={() => setPanel('diesel')}>
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <div style={{ fontFamily: ffNum, fontSize: 40, fontWeight: 700, letterSpacing: '-2px', color: C.text }}>
              {(d.skordare.diesel.perM3 + d.skotare.diesel.perM3).toFixed(2)}
              <span style={{ fontSize: 13, fontWeight: 400, color: C.muted, fontFamily: ff }}> L/m³fub</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 10, fontSize: 11, color: C.muted }}>
              <span><span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: C.blue, marginRight: 6 }} />Skördare {d.skordare.diesel.perM3} L</span>
              <span><span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: C.accent, marginRight: 6 }} />Skotare {d.skotare.diesel.perM3} L</span>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6 }}>
            <div style={{ background: C.surface2, borderRadius: 8, padding: '10px 8px', textAlign: 'center' }}>
              <div style={{ fontFamily: ffNum, fontSize: 18, lineHeight: 1 }}>{d.skordare.diesel.tot + d.skotare.diesel.tot}</div>
              <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.5px', color: C.muted, marginTop: 3 }}>Liter totalt</div>
            </div>
            <div style={{ background: C.surface2, borderRadius: 8, padding: '10px 8px', textAlign: 'center' }}>
              <div style={{ fontFamily: ffNum, fontSize: 18, lineHeight: 1 }}>{d.skordare.diesel.perTim}</div>
              <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.5px', color: C.muted, marginTop: 3 }}>L/G15h skördare</div>
            </div>
            <div style={{ background: C.surface2, borderRadius: 8, padding: '10px 8px', textAlign: 'center' }}>
              <div style={{ fontFamily: ffNum, fontSize: 18, lineHeight: 1 }}>{d.skotare.diesel.perG15}</div>
              <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.5px', color: C.muted, marginTop: 3 }}>L/G15h skotare</div>
            </div>
          </div>
          <div style={{ marginTop: 12, fontSize: 10, color: C.muted, textAlign: 'center', letterSpacing: '0.3px' }}>Tryck för diesel per dag →</div>
        </ClickCard>

        {/* ── Skotare produktion — clickable card ── */}
        {d.skotare.lass > 0 && (
          <ClickCard title="Skotarproduktion" badge={`${d.skotare.lass} lass`} onClick={() => setPanel('skotarproduktion')}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
              {[
                { l: 'Antal lass', v: d.skotare.lass },
                { l: 'Snitt lass', v: `${d.skotare.snittLass} m³` },
                { l: 'Lass/G15', v: d.skotare.lassPerG15 },
                { l: 'm³/G15', v: d.skotare.m3PerG15 },
                { l: 'Skotningsavst.', v: `${d.skotare.avstand} m` },
              ].map((p, i) => (
                <div key={i} style={{ background: C.surface2, borderRadius: 10, padding: '14px 12px', textAlign: 'center' }}>
                  <div style={{ fontFamily: ffNum, fontSize: 20, fontWeight: 700, lineHeight: 1 }}>{p.v}</div>
                  <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.6px', color: C.muted, marginTop: 6 }}>{p.l}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 12, fontSize: 10, color: C.muted, textAlign: 'center', letterSpacing: '0.3px' }}>Tryck för skotardetaljer →</div>
          </ClickCard>
        )}
      </div>

      {/* ══════════ DRILL-DOWN PANELS ══════════ */}

      {/* ── TID Panel ── */}
      <DrillPanel open={panel === 'tid'} onClose={closePanel} icon="⏱" title="Tidsfördelning" subtitle={`${obj.namn} · ${maskin}`}>
        <KpiGrid items={[
          { v: fmtH(d.skordare.arbetstid + d.skotare.arbetstid), l: 'Arbetstid' },
          { v: fmtH(totalRuntime), l: 'G15 totalt' },
          { v: fmtHM(d.skordare.avbrott + d.skotare.avbrott), l: 'Avbrott' },
        ]} />

        <SectionLabel text="Fördelning" />
        <div style={{ background: C.surface2, borderRadius: 10, padding: '4px 16px', marginBottom: 20 }}>
          <DataRow label="G15 (produktiv)" value={`${fmtH(totalRuntime)} · ${pctG15}%`} />
          <DataRow label="Avbrott" value={`${fmtHM(d.skordare.avbrott + d.skotare.avbrott)} · ${pctAvbrott}%`} />
          <DataRow label="Rast" value={`${fmtHM(d.skordare.rast + d.skotare.rast)} · ${pctRast}%`} />
          <DataRow label="Tomgång" value={`${fmtHM(d.skordare.tomgang + d.skotare.tomgang)} · ${pctTomgang}%`} />
          <DataRow label="Korta stopp" value={fmtHM(d.skordare.kortaStopp + d.skotare.kortaStopp)} last />
        </div>

        <SectionLabel text="Per maskin" />
        <div style={{ background: C.surface2, borderRadius: 10, padding: '4px 16px', marginBottom: 20 }}>
          <DataRow label={`Skördare G15`} value={fmtH(d.skordare.g15)} />
          <DataRow label={`Skördare G0`} value={fmtH(d.skordare.g0)} />
          <DataRow label={`Skotare G15`} value={fmtH(d.skotare.g15)} />
          <DataRow label={`Skotare G0`} value={fmtH(d.skotare.g0)} last />
        </div>

        {d.tidPerDag.length > 0 && (
          <>
            <SectionLabel text="Tid per dag" />
            <canvas ref={tidChartRef} style={{ maxHeight: 220, marginBottom: 16 }} />
          </>
        )}
      </DrillPanel>

      {/* ── PRODUKTION Panel ── */}
      <DrillPanel open={panel === 'produktion'} onClose={closePanel} icon="🌲" title="Produktion & sortiment" subtitle={`${obj.namn} · ${maskin}`}>
        <KpiGrid items={[
          { v: volSk.toLocaleString('sv'), l: 'm³ totalt' },
          { v: (d.skordare.antalStammar || stammar).toLocaleString('sv'), l: 'Stammar' },
          { v: d.skordare.m3PerG15, l: 'm³/G15h' },
        ]} />

        {d.tradslagData.length > 0 && (
          <>
            <SectionLabel text="Per trädslag" />
            <canvas ref={prodChartRef} style={{ maxHeight: 180, marginBottom: 16 }} />
            <div style={{ background: C.surface2, borderRadius: 10, padding: '4px 16px', marginBottom: 20 }}>
              {d.tradslagData.map((ts: any, i: number) => {
                const totVol = d.tradslagData.reduce((a: number, x: any) => a + x.vol, 0);
                const pct = totVol > 0 ? Math.round((ts.vol / totVol) * 100) : 0;
                return <DataRow key={i} label={ts.namn} value={`${ts.vol} m³ · ${pct}% · ${ts.st} st`} last={i === d.tradslagData.length - 1} />;
              })}
            </div>
          </>
        )}

        {d.skordare.sortiment.length > 0 && (
          <>
            <SectionLabel text="Sortiment" />
            <canvas ref={sortChartRef} style={{ maxHeight: 180, marginBottom: 16 }} />
            <div style={{ background: C.surface2, borderRadius: 10, padding: '4px 16px', marginBottom: 20 }}>
              {d.skordare.sortiment.map((s: any, i: number) => {
                const totVol = d.skordare.sortiment.reduce((a: number, x: any) => a + x.vol, 0);
                const pct = totVol > 0 ? Math.round((s.vol / totVol) * 100) : 0;
                return <DataRow key={i} label={s.namn} value={`${s.vol} m³ · ${pct}% · ${s.st} st`} last={i === d.skordare.sortiment.length - 1} />;
              })}
            </div>
          </>
        )}

        <SectionLabel text="Produktivitet" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
          {[
            { l: 'Stammar/G15h', v: d.skordare.stamPerG15 },
            { l: 'm³/G15h', v: d.skordare.m3PerG15 },
            { l: 'MTH-andel', v: `${d.skordare.flertrad}%` },
            { l: 'Medelstam', v: d.medelstam },
            { l: 'Sågbart', v: `${sagbart}%` },
            { l: 'Volym/ha', v: obj.areal > 0 ? `${(volSk / obj.areal).toFixed(0)}` : '–' },
          ].map((p, i) => (
            <div key={i} style={{ background: C.surface2, borderRadius: 10, padding: '14px 12px', textAlign: 'center' }}>
              <div style={{ fontFamily: ffNum, fontSize: 20, fontWeight: 700, lineHeight: 1 }}>{p.v}</div>
              <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.6px', color: C.muted, marginTop: 6 }}>{p.l}</div>
            </div>
          ))}
        </div>
      </DrillPanel>

      {/* ── AVBROTT Panel ── */}
      <DrillPanel open={panel === 'avbrott'} onClose={closePanel} icon="⚠" title="Avbrott & stillestånd" subtitle={`${obj.namn}`}>
        <KpiGrid items={[
          { v: fmtHM(d.skordare.avbrott + d.skotare.avbrott), l: 'Avbrott totalt' },
          { v: fmtHM(d.skordare.rast + d.skotare.rast), l: 'Rast' },
          { v: fmtHM(d.skordare.kortaStopp + d.skotare.kortaStopp), l: 'Korta stopp' },
        ]} />

        {d.skordare.avbrott_lista.length > 0 && (
          <>
            <SectionLabel text={`Skördare · ${maskin}`} />
            <div style={{ background: C.surface2, borderRadius: 10, padding: '4px 16px', marginBottom: 20 }}>
              {d.skordare.avbrott_lista.map((a: any, i: number) => (
                <DataRow key={i} label={a.typ} value={fmtHM(a.tid)} last={i === d.skordare.avbrott_lista.length - 1} warn />
              ))}
            </div>
          </>
        )}

        {d.skotare.avbrott_lista.length > 0 && (
          <>
            <SectionLabel text={`Skotare · ${skotare || '–'}`} />
            <div style={{ background: C.surface2, borderRadius: 10, padding: '4px 16px', marginBottom: 20 }}>
              {d.skotare.avbrott_lista.map((a: any, i: number) => (
                <DataRow key={i} label={a.typ} value={fmtHM(a.tid)} last={i === d.skotare.avbrott_lista.length - 1} warn />
              ))}
            </div>
          </>
        )}

        {d.skordare.avbrott_lista.length === 0 && d.skotare.avbrott_lista.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: C.muted }}>Inga avbrott registrerade</div>
        )}
      </DrillPanel>

      {/* ── DIESEL Panel ── */}
      <DrillPanel open={panel === 'diesel'} onClose={closePanel} icon="⛽" title="Dieselförbrukning" subtitle={`${obj.namn}`}>
        <KpiGrid items={[
          { v: (d.skordare.diesel.tot + d.skotare.diesel.tot).toLocaleString('sv'), l: 'Liter totalt' },
          { v: (d.skordare.diesel.perM3 + d.skotare.diesel.perM3).toFixed(2), l: 'L/m³fub' },
          { v: d.skordare.diesel.perTim, l: 'L/G15h skördare' },
        ]} />

        <SectionLabel text="Per maskin" />
        <div style={{ background: C.surface2, borderRadius: 10, padding: '4px 16px', marginBottom: 20 }}>
          <DataRow label="Skördare totalt" value={`${d.skordare.diesel.tot} L`} />
          <DataRow label="Skördare L/m³" value={d.skordare.diesel.perM3} />
          <DataRow label="Skördare L/G15h" value={d.skordare.diesel.perTim} />
          <DataRow label="Skotare totalt" value={`${d.skotare.diesel.tot} L`} />
          <DataRow label="Skotare L/m³" value={d.skotare.diesel.perM3} />
          <DataRow label="Skotare L/G15h" value={d.skotare.diesel.perG15} last />
        </div>

        {d.tidPerDag.length > 0 && (
          <>
            <SectionLabel text="Diesel per dag" />
            <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: C.muted }}><div style={{ width: 7, height: 7, borderRadius: '50%', background: C.accent }} />Liter</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: C.muted }}><div style={{ width: 7, height: 7, borderRadius: '50%', background: C.blue }} />G15h</div>
            </div>
            <canvas ref={dieselChartRef} style={{ maxHeight: 220, marginBottom: 16 }} />
          </>
        )}
      </DrillPanel>

      {/* ── SKOTARPRODUKTION Panel ── */}
      <DrillPanel open={panel === 'skotarproduktion'} onClose={closePanel} icon="🚜" title="Skotarproduktion" subtitle={`${obj.namn} · ${skotare || '–'}`}>
        <KpiGrid items={[
          { v: d.skotare.lass, l: 'Antal lass' },
          { v: `${d.skotare.snittLass} m³`, l: 'Snitt per lass' },
          { v: fmtH(d.skotare.g15), l: 'G15-timmar' },
        ]} />

        <SectionLabel text="Produktivitet" />
        <div style={{ background: C.surface2, borderRadius: 10, padding: '4px 16px', marginBottom: 20 }}>
          <DataRow label="m³/G15h" value={d.skotare.m3PerG15} />
          <DataRow label="Lass/G15h" value={d.skotare.lassPerG15} />
          <DataRow label="Snitt lassvolym" value={`${d.skotare.snittLass} m³`} />
          <DataRow label="Skotningsavstånd" value={`${d.skotare.avstand} m`} last />
        </div>

        <SectionLabel text="Tid" />
        <div style={{ background: C.surface2, borderRadius: 10, padding: '4px 16px', marginBottom: 20 }}>
          <DataRow label="Arbetstid" value={fmtH(d.skotare.arbetstid)} />
          <DataRow label="G15" value={fmtH(d.skotare.g15)} />
          <DataRow label="G0" value={fmtH(d.skotare.g0)} />
          <DataRow label="Korta stopp" value={fmtHM(d.skotare.kortaStopp)} />
          <DataRow label="Avbrott" value={fmtHM(d.skotare.avbrott)} />
          <DataRow label="Rast" value={fmtHM(d.skotare.rast)} />
          <DataRow label="Tomgång" value={fmtHM(d.skotare.tomgang)} last />
        </div>

        <SectionLabel text="Diesel" />
        <div style={{ background: C.surface2, borderRadius: 10, padding: '4px 16px', marginBottom: 20 }}>
          <DataRow label="Totalt" value={`${d.skotare.diesel.tot} L`} />
          <DataRow label="Per m³fub" value={`${d.skotare.diesel.perM3} L`} />
          <DataRow label="Per G15h" value={`${d.skotare.diesel.perG15} L`} last />
        </div>

        {d.skotare.avbrott_lista.length > 0 && (
          <>
            <SectionLabel text="Avbrott" />
            <div style={{ background: C.surface2, borderRadius: 10, padding: '4px 16px' }}>
              {d.skotare.avbrott_lista.map((a: any, i: number) => (
                <DataRow key={i} label={a.typ} value={fmtHM(a.tid)} last={i === d.skotare.avbrott_lista.length - 1} warn />
              ))}
            </div>
          </>
        )}
      </DrillPanel>
    </div>
  );
}

/* ── Data-processing helpers ── */
function getMachineType(maskin: any): 'skordare' | 'skotare' | 'unknown' {
  if (!maskin) return 'unknown';
  const cat = (maskin.machineCategory || maskin.typ || '').toLowerCase();
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
      const [dimObjektRes, dimMaskinRes, produktionRes, lassRes, tidRes, objektTblRes] = await Promise.all([
        supabase.from('dim_objekt').select('*'),
        supabase.from('dim_maskin').select('*'),
        supabase.from('fakt_produktion').select('objekt_id, maskin_id, volym_m3sub, stammar').limit(50000),
        supabase.from('fakt_lass').select('objekt_id, volym_m3sob').limit(50000),
        supabase.from('fakt_tid').select('objekt_id, maskin_id, bransle_liter').limit(50000),
        supabase.from('objekt').select('vo_nummer, markagare, areal, typ'),
      ]);

      const dimObjekt: any[] = dimObjektRes.data || [];
      const dimMaskin: any[] = dimMaskinRes.data || [];
      const produktion: any[] = produktionRes.data || [];
      const lass: any[] = lassRes.data || [];
      const tid: any[] = tidRes.data || [];
      const objektTbl: any[] = objektTblRes.data || [];

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

      const voGroups = new Map<string, any[]>();
      dimObjekt.forEach(d => {
        const key = d.objekt_id;
        if (!key) return;
        const arr = voGroups.get(key) || [];
        arr.push(d);
        voGroups.set(key, arr);
      });

      const result: UppfoljningObjekt[] = [];

      voGroups.forEach((entries, key) => {
        let skordareEntry: any = null;
        let skotareEntry: any = null;

        for (const e of entries) {
          const maskin = maskinMap.get(e.maskin_id);
          const mType = getMachineType(maskin);
          if (mType === 'skordare' && !skordareEntry) skordareEntry = e;
          else if (mType === 'skotare' && !skotareEntry) skotareEntry = e;
        }

        if (!skordareEntry && !skotareEntry) {
          for (const e of entries) {
            if (!skordareEntry && prodAgg.has(e.objekt_id)) { skordareEntry = e; continue; }
            if (!skotareEntry && lassAgg.has(e.objekt_id)) { skotareEntry = e; continue; }
          }
        }
        if (!skordareEntry && !skotareEntry && entries.length > 0) {
          skordareEntry = entries[0];
          if (entries.length > 1) skotareEntry = entries[1];
        }

        const firstEntry = entries[0];
        const vo = firstEntry.vo_nummer || '';
        const namn = firstEntry.object_name || firstEntry.objektnamn || vo || key;
        const info = objektInfo.get(vo);

        const agare = firstEntry.skogsagare || firstEntry.bolag || info?.agare || '';
        const areal = info?.areal || 0;
        const typ = inferType(firstEntry.huvudtyp || info?.typ);

        const skProd = skordareEntry ? prodAgg.get(skordareEntry.objekt_id) : null;
        const stLass = skotareEntry ? lassAgg.get(skotareEntry.objekt_id) : null;

        const skDiesel = skordareEntry ? (tidAgg.get(skordareEntry.objekt_id) || 0) : 0;
        const stDiesel = skotareEntry ? (tidAgg.get(skotareEntry.objekt_id) || 0) : 0;

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

        const skMaskinId = prodMaskinMap.get(skordareEntry?.objekt_id) || skordareEntry?.maskin_id;
        const stMaskinId = tidMaskinMap.get(skotareEntry?.objekt_id) || skotareEntry?.maskin_id;

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
          volymSkordare: skProd?.vol || 0,
          stammar: skProd?.stammar || 0,
          skotareModell: skotareEntry ? getMachineLabel(maskinMap.get(stMaskinId)) : null,
          skotareStart: stStart,
          skotareSlut: stSlut,
          skotareObjektId: skotareEntry?.objekt_id || null,
          skotareModellMaskinId: stMaskinId || null,
          volymSkotare: stLass?.vol || 0,
          antalLass: stLass?.count || 0,
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
    <div style={{ position: 'fixed', top: 56, left: 0, right: 0, bottom: 0, background: C.bg, color: C.text, fontFamily: ff, WebkitFontSmoothing: 'antialiased', overflowY: 'auto' }}>
      <style>{globalCss}</style>

      <div style={{ padding: '28px 22px 0' }}>
        <div style={{ fontFamily: ffNum, fontSize: 28, fontWeight: 700, letterSpacing: '-1px', marginBottom: 22, color: C.text }}>Uppföljning</div>

        <div style={{ display: 'flex', alignItems: 'center', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '11px 16px', gap: 10, marginBottom: 16, transition: 'border-color 0.2s' }}>
          <span style={{ fontSize: 14, color: C.dim }}>⌕</span>
          <input
            type="text"
            placeholder="Sök objekt, ägare, VO..."
            value={sok}
            onChange={e => setSok(e.target.value)}
            style={{ flex: 1, border: 'none', background: 'none', fontSize: 14, color: C.text, outline: 'none', fontFamily: ff }}
          />
          {sok && <button onClick={() => setSok('')} style={{ background: C.muted, border: 'none', color: C.bg, width: 18, height: 18, borderRadius: '50%', fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>}
        </div>

        <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: 3, marginBottom: 14, width: 'fit-content' }}>
          {(['alla', 'pagaende', 'avslutat'] as const).map(f => (
            <button key={f} onClick={() => setFlik(f)} style={{
              padding: '6px 16px', border: 'none', borderRadius: 6,
              fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: ff,
              background: flik === f ? C.surface2 : 'transparent',
              color: flik === f ? C.text : C.muted, transition: 'all 0.15s',
            }}>
              {f === 'alla' ? 'Alla' : f === 'pagaende' ? 'Pågående' : 'Avslutade'}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
          {[{ k: 'alla', l: 'Alla' }, { k: 'slutavverkning', l: 'Slutavverkning' }, { k: 'gallring', l: 'Gallring' }].map(f => (
            <button key={f.k} onClick={() => setFilter(f.k as any)} style={{
              padding: '5px 14px', borderRadius: 20, fontSize: 10, fontWeight: 600, cursor: 'pointer',
              letterSpacing: '0.3px', border: 'none', fontFamily: ff, transition: 'all 0.15s',
              background: filter === f.k
                ? (f.k === 'slutavverkning' ? 'rgba(255,179,64,0.1)' : f.k === 'gallring' ? 'rgba(90,255,140,0.1)' : 'rgba(255,255,255,0.06)')
                : 'rgba(255,255,255,0.03)',
              color: filter === f.k
                ? (f.k === 'slutavverkning' ? C.warn : f.k === 'gallring' ? C.accent : C.text)
                : C.muted,
            }}>{f.l}</button>
          ))}
        </div>
      </div>

      <div style={{ padding: '0 16px 120px', maxWidth: 700, margin: '0 auto' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: C.muted }}>
            <div style={{ fontSize: 14 }}>Laddar...</div>
          </div>
        ) : lista.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: C.muted }}>
            <div style={{ fontSize: 36, marginBottom: 12, opacity: .3 }}>○</div>
            <div style={{ fontSize: 14 }}>Inga objekt hittades</div>
          </div>
        ) : (
          lista.map(o => (
            <ObjektKort key={o.skordareObjektId || o.skotareObjektId || o.vo_nummer} obj={o} onClick={() => setValt(o)} />
          ))
        )}
      </div>
    </div>
  );
}
