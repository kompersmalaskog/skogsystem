'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ── Design tokens (matching Jamforelse.tsx) ──
const ff = "'Geist', system-ui, sans-serif";

const C = {
  bg: '#111110',
  surface: '#1a1a18',
  surface2: '#222220',
  surface3: '#2a2a28',
  border: 'rgba(255,255,255,0.07)',
  border2: 'rgba(255,255,255,0.13)',
  border3: 'rgba(255,255,255,0.2)',
  t1: '#e8e8e4',
  t2: '#a8a8a2',
  t3: '#7a7a72',
  t4: '#3a3a36',
  green: '#5aff8c',
  greenBg: 'rgba(90,255,140,0.08)',
  greenBorder: 'rgba(90,255,140,0.2)',
  red: '#ff5f57',
  redBg: 'rgba(255,95,87,0.08)',
  amber: '#ffb340',
};

// ── Types ──
type Period = 'vecka' | 'manad' | 'kvartal';

interface TidRow {
  datum: string;
  maskin_id: string;
  objekt_id: string;
  operator_id: string | null;
  processing_sek: number;
  terrain_sek: number;
  other_work_sek: number;
  maintenance_sek: number;
  disturbance_sek: number;
  avbrott_sek: number;
  rast_sek: number;
  kort_stopp_sek: number;
  bransle_liter: number;
  engine_time_sek: number;
  tomgang_sek: number;
}

interface ProdRow {
  datum: string;
  maskin_id: string;
  objekt_id: string;
  volym_m3sub: number;
  stammar: number;
}

interface Maskin {
  maskin_id: string;
  modell: string;
  tillverkare: string;
  typ: string | null;
}

interface Operator {
  operator_id: string;
  operator_namn: string | null;
  operator_key: string | null;
}

type PanelId = 'produktivitet' | 'diesel' | 'tid' | 'kalibrering' | null;

// ── Helpers ──
function getPeriodRange(period: Period): { start: string; end: string } {
  const now = new Date();
  const end = now.toISOString().slice(0, 10);
  let start: Date;
  if (period === 'vecka') {
    start = new Date(now);
    start.setDate(start.getDate() - 7);
  } else if (period === 'manad') {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  } else {
    const q = Math.floor(now.getMonth() / 3) * 3;
    start = new Date(now.getFullYear(), q, 1);
  }
  return { start: start.toISOString().slice(0, 10), end };
}

function isSkordare(typ: string | null): boolean {
  if (!typ) return true;
  const t = typ.toLowerCase();
  return t !== 'forwarder' && t !== 'skotare';
}

function fmtNum(n: number, decimals = 1): string {
  return n.toLocaleString('sv-SE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

// ── Slide Panel ──
function SlidePanel({ open, onClose, title, children }: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode;
}) {
  return (
    <>
      {open && (
        <div
          onClick={onClose}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100 }}
        />
      )}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 'min(420px, 90vw)',
        background: C.bg, borderLeft: `1px solid ${C.border2}`,
        transform: open ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        zIndex: 101, overflowY: 'auto',
        boxShadow: open ? '-20px 0 60px rgba(0,0,0,0.5)' : 'none',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 20px 16px', borderBottom: `1px solid ${C.border}`,
          position: 'sticky', top: 0, background: C.bg, zIndex: 2,
        }}>
          <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: -0.3 }}>{title}</span>
          <button onClick={onClose} style={{
            background: 'none', border: `1px solid ${C.border}`, borderRadius: 8,
            color: C.t3, fontSize: 14, padding: '4px 12px', cursor: 'pointer', fontFamily: ff,
          }}>Stäng</button>
        </div>
        <div style={{ padding: '20px' }}>{children}</div>
      </div>
    </>
  );
}

// ── KPI Card ──
function KpiCard({ label, value, unit, sublabel, active, onClick }: {
  label: string; value: string; unit: string; sublabel: string;
  active: boolean; onClick: () => void;
}) {
  return (
    <div onClick={onClick} style={{
      background: active
        ? 'linear-gradient(145deg, #1e1e1c 0%, #141412 100%)'
        : C.surface,
      border: `1px solid ${active ? C.border3 : C.border}`,
      borderRadius: 14, padding: '16px 18px', cursor: 'pointer',
      position: 'relative', overflow: 'hidden',
      transition: 'all 0.2s',
      boxShadow: active ? '0 12px 40px rgba(0,0,0,0.5)' : 'none',
    }}>
      {active && (
        <div style={{
          position: 'absolute', top: 0, left: '10%', right: '10%', height: 1,
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)',
        }} />
      )}
      <div style={{ fontSize: 11, color: C.t3, fontWeight: 600, letterSpacing: '0.04em', marginBottom: 8 }}>
        {label}
      </div>
      <div style={{
        fontSize: 28, fontWeight: 700, lineHeight: 1, letterSpacing: -1.5,
        color: C.t1, fontVariantNumeric: 'tabular-nums',
        textShadow: '0 0 20px rgba(255,255,255,0.15)',
      }}>
        {value}
      </div>
      <div style={{ fontSize: 10, color: C.t4, marginTop: 4 }}>{unit}</div>
      <div style={{ fontSize: 10, color: C.t4, marginTop: 6, fontStyle: 'italic' }}>{sublabel}</div>
    </div>
  );
}

// ── Operator Row ──
function OperatorRow({ name, volym, g15h, prod, onClick }: {
  name: string; volym: number; g15h: number; prod: number; onClick: () => void;
}) {
  return (
    <div onClick={onClick} style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '14px 0', borderBottom: `1px solid ${C.border}`,
      cursor: 'pointer', transition: 'background 0.15s',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.t1 }}>{name}</div>
        <div style={{ fontSize: 11, color: C.t3, marginTop: 2 }}>
          {fmtNum(g15h, 0)}h G15 &middot; {fmtNum(volym, 0)} m³fub
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
        <div style={{
          fontSize: 20, fontWeight: 700, color: C.t1,
          fontVariantNumeric: 'tabular-nums', lineHeight: 1,
        }}>{fmtNum(prod)}</div>
        <div style={{ fontSize: 10, color: C.t4, marginTop: 2 }}>m³/G15h</div>
      </div>
      <div style={{ marginLeft: 12, color: C.t4, fontSize: 16 }}>&rsaquo;</div>
    </div>
  );
}

// ── Detail stat row inside panels ──
function StatRow({ label, value, unit, accent }: {
  label: string; value: string; unit?: string; accent?: boolean;
}) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      padding: '10px 0', borderBottom: `1px solid ${C.border}`,
    }}>
      <span style={{ fontSize: 12, color: C.t3 }}>{label}</span>
      <span style={{
        fontSize: 16, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
        color: accent ? C.green : C.t1,
      }}>
        {value}{unit && <span style={{ fontSize: 11, color: C.t4, marginLeft: 4 }}>{unit}</span>}
      </span>
    </div>
  );
}

// ── Time bar component ──
function TimeBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: C.t2 }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: C.t1, fontVariantNumeric: 'tabular-nums' }}>
          {fmtNum(pct, 1)}%
        </span>
      </div>
      <div style={{ height: 6, background: C.surface2, borderRadius: 3, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${Math.min(100, pct)}%`,
          background: color, borderRadius: 3,
          transition: 'width 0.6s ease',
        }} />
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════════
export default function Maskinvy2Page() {
  const [period, setPeriod] = useState<Period>('manad');
  const [loading, setLoading] = useState(true);
  const [tidRows, setTidRows] = useState<TidRow[]>([]);
  const [prodRows, setProdRows] = useState<ProdRow[]>([]);
  const [maskiner, setMaskiner] = useState<Maskin[]>([]);
  const [operatorer, setOperatorer] = useState<Operator[]>([]);
  const [activePanel, setActivePanel] = useState<PanelId>(null);
  const [selectedOp, setSelectedOp] = useState<string | null>(null);

  // ── Data loading ──
  const loadData = useCallback(async () => {
    setLoading(true);
    const { start, end } = getPeriodRange(period);

    const [tidRes, prodRes, maskinRes, opRes] = await Promise.all([
      supabase.from('fakt_tid')
        .select('datum, maskin_id, objekt_id, operator_id, processing_sek, terrain_sek, other_work_sek, maintenance_sek, disturbance_sek, avbrott_sek, rast_sek, kort_stopp_sek, bransle_liter, engine_time_sek, tomgang_sek')
        .gte('datum', start).lte('datum', end),
      supabase.from('fakt_produktion')
        .select('datum, maskin_id, objekt_id, volym_m3sub, stammar')
        .gte('datum', start).lte('datum', end),
      supabase.from('dim_maskin').select('maskin_id, modell, tillverkare, typ'),
      supabase.from('dim_operator').select('operator_id, operator_namn, operator_key'),
    ]);

    setTidRows((tidRes.data || []) as TidRow[]);
    setProdRows((prodRes.data || []) as ProdRow[]);
    setMaskiner((maskinRes.data || []) as Maskin[]);
    setOperatorer((opRes.data || []) as Operator[]);
    setLoading(false);
  }, [period]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Filter to skördare machines only ──
  const skordareIds = useMemo(() => {
    const ids = new Set<string>();
    maskiner.filter(m => isSkordare(m.typ)).forEach(m => ids.add(m.maskin_id));
    // Also include machines in tidRows not in dim_maskin (assume skördare if unknown)
    tidRows.forEach(r => {
      const m = maskiner.find(mm => mm.maskin_id === r.maskin_id);
      if (!m || isSkordare(m.typ)) ids.add(r.maskin_id);
    });
    return ids;
  }, [maskiner, tidRows]);

  const filteredTid = useMemo(() => tidRows.filter(r => skordareIds.has(r.maskin_id)), [tidRows, skordareIds]);
  const filteredProd = useMemo(() => prodRows.filter(r => skordareIds.has(r.maskin_id)), [prodRows, skordareIds]);

  // ── Aggregated KPIs ──
  const totals = useMemo(() => {
    const volym = filteredProd.reduce((s, r) => s + (r.volym_m3sub || 0), 0);
    const stammar = filteredProd.reduce((s, r) => s + (r.stammar || 0), 0);
    const processing = filteredTid.reduce((s, r) => s + (r.processing_sek || 0), 0);
    const terrain = filteredTid.reduce((s, r) => s + (r.terrain_sek || 0), 0);
    const otherWork = filteredTid.reduce((s, r) => s + (r.other_work_sek || 0), 0);
    const kortStopp = filteredTid.reduce((s, r) => s + (r.kort_stopp_sek || 0), 0);
    const maintenance = filteredTid.reduce((s, r) => s + (r.maintenance_sek || 0), 0);
    const disturbance = filteredTid.reduce((s, r) => s + (r.disturbance_sek || 0), 0);
    const avbrott = filteredTid.reduce((s, r) => s + (r.avbrott_sek || 0), 0);
    const rast = filteredTid.reduce((s, r) => s + (r.rast_sek || 0), 0);
    const bransle = filteredTid.reduce((s, r) => s + (r.bransle_liter || 0), 0);
    const engineTime = filteredTid.reduce((s, r) => s + (r.engine_time_sek || 0), 0);
    const tomgang = filteredTid.reduce((s, r) => s + (r.tomgang_sek || 0), 0);

    const g0Sek = processing + terrain + otherWork - kortStopp;
    const g15Sek = processing + terrain + otherWork;
    const arbetstidSek = g15Sek + maintenance + disturbance + avbrott;
    const totalTidSek = arbetstidSek + rast;

    const g15h = g15Sek / 3600;
    const produktivitet = g15h > 0 ? volym / g15h : 0;
    const dieselPerM3 = volym > 0 ? bransle / volym : 0;
    const utnyttjandegrad = totalTidSek > 0 ? (g15Sek / totalTidSek) * 100 : 0;
    const medelstam = stammar > 0 ? volym / stammar : 0;

    return {
      volym, stammar, g0Sek, g15Sek, g15h, arbetstidSek, totalTidSek,
      processing, terrain, otherWork, kortStopp,
      maintenance, disturbance, avbrott, rast,
      bransle, engineTime, tomgang,
      produktivitet, dieselPerM3, utnyttjandegrad, medelstam,
    };
  }, [filteredTid, filteredProd]);

  // ── Operator aggregation ──
  const opData = useMemo(() => {
    const opMap = new Map<string, { namn: string; volym: number; g15Sek: number; processingSek: number; terrainSek: number; otherSek: number; kortStoppSek: number; maintenanceSek: number; disturbanceSek: number; avbrottSek: number; rastSek: number; bransleLiter: number; stammar: number }>();

    const opNames = new Map<string, string>();
    operatorer.forEach(o => {
      opNames.set(o.operator_id, o.operator_namn || o.operator_key || o.operator_id);
    });

    for (const r of filteredTid) {
      const opId = r.operator_id || 'unknown';
      if (!opMap.has(opId)) {
        opMap.set(opId, {
          namn: opNames.get(opId) || opId,
          volym: 0, g15Sek: 0, processingSek: 0, terrainSek: 0, otherSek: 0,
          kortStoppSek: 0, maintenanceSek: 0, disturbanceSek: 0, avbrottSek: 0,
          rastSek: 0, bransleLiter: 0, stammar: 0,
        });
      }
      const d = opMap.get(opId)!;
      d.g15Sek += (r.processing_sek || 0) + (r.terrain_sek || 0) + (r.other_work_sek || 0);
      d.processingSek += r.processing_sek || 0;
      d.terrainSek += r.terrain_sek || 0;
      d.otherSek += r.other_work_sek || 0;
      d.kortStoppSek += r.kort_stopp_sek || 0;
      d.maintenanceSek += r.maintenance_sek || 0;
      d.disturbanceSek += r.disturbance_sek || 0;
      d.avbrottSek += r.avbrott_sek || 0;
      d.rastSek += r.rast_sek || 0;
      d.bransleLiter += r.bransle_liter || 0;
    }

    // Add production volumes per operator via objekt_id matching
    const opObjekts = new Map<string, Set<string>>();
    for (const r of filteredTid) {
      const opId = r.operator_id || 'unknown';
      if (!opObjekts.has(opId)) opObjekts.set(opId, new Set());
      opObjekts.get(opId)!.add(r.objekt_id);
    }

    // Sum production per objekt
    const prodByObj = new Map<string, { volym: number; stammar: number }>();
    for (const r of filteredProd) {
      if (!prodByObj.has(r.objekt_id)) prodByObj.set(r.objekt_id, { volym: 0, stammar: 0 });
      const d = prodByObj.get(r.objekt_id)!;
      d.volym += r.volym_m3sub || 0;
      d.stammar += r.stammar || 0;
    }

    // Count operators per objekt to split volume proportionally
    const objOps = new Map<string, string[]>();
    for (const [opId, objs] of opObjekts) {
      for (const obj of objs) {
        if (!objOps.has(obj)) objOps.set(obj, []);
        objOps.get(obj)!.push(opId);
      }
    }

    for (const [opId, objs] of opObjekts) {
      const d = opMap.get(opId);
      if (!d) continue;
      for (const obj of objs) {
        const prod = prodByObj.get(obj);
        if (!prod) continue;
        const share = 1 / (objOps.get(obj)?.length || 1);
        d.volym += prod.volym * share;
        d.stammar += prod.stammar * share;
      }
    }

    return Array.from(opMap.entries())
      .map(([id, d]) => ({ id, ...d, prod: d.g15Sek > 0 ? d.volym / (d.g15Sek / 3600) : 0 }))
      .filter(d => d.g15Sek > 60)
      .sort((a, b) => b.volym - a.volym);
  }, [filteredTid, filteredProd, operatorer]);

  // ── Selected operator details ──
  const selOpData = useMemo(() => {
    if (!selectedOp) return null;
    return opData.find(d => d.id === selectedOp) || null;
  }, [selectedOp, opData]);

  // ── Period label ──
  const periodLabel = period === 'vecka' ? 'Senaste 7 dagarna' : period === 'manad'
    ? new Date().toLocaleString('sv-SE', { month: 'long', year: 'numeric' })
    : `Q${Math.floor(new Date().getMonth() / 3) + 1} ${new Date().getFullYear()}`;

  // ── Render ──
  if (loading) {
    return (
      <div style={{
        position: 'fixed', top: 100, left: 0, right: 0, bottom: 0,
        background: C.bg, display: 'flex', alignItems: 'center',
        justifyContent: 'center', color: C.t3, fontFamily: ff, fontSize: 13, zIndex: 1,
      }}>
        Laddar data...
      </div>
    );
  }

  return (
    <div style={{
      position: 'fixed', top: 100, left: 0, right: 0, bottom: 0,
      overflow: 'auto', WebkitOverflowScrolling: 'touch' as any,
      background: C.bg, fontFamily: ff, color: C.t1, zIndex: 1,
    }}>
      <div style={{ padding: '20px 20px 80px', maxWidth: 600, margin: '0 auto' }}>

        {/* ── PERIOD SELECTOR ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
          <div style={{
            display: 'flex', gap: 2, background: 'rgba(255,255,255,0.05)',
            borderRadius: 8, padding: 3,
          }}>
            {(['vecka', 'manad', 'kvartal'] as const).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                style={{
                  padding: '6px 16px', border: 'none', borderRadius: 6, fontFamily: ff,
                  fontSize: 12, fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s',
                  background: period === p ? C.surface2 : 'transparent',
                  color: period === p ? C.t1 : C.t3,
                  letterSpacing: -0.2,
                }}
              >
                {p === 'vecka' ? 'Vecka' : p === 'manad' ? 'Månad' : 'Kvartal'}
              </button>
            ))}
          </div>
          <span style={{ fontSize: 12, color: C.t3 }}>{periodLabel}</span>
        </div>

        {/* ── HERO SECTION ── */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 11, color: C.t3, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
            Total volym skördare
          </div>
          <div style={{
            fontSize: 72, fontWeight: 700, lineHeight: 1, letterSpacing: -4,
            color: C.green, fontVariantNumeric: 'tabular-nums',
            textShadow: '0 0 40px rgba(90,255,140,0.3), 0 0 80px rgba(90,255,140,0.1)',
          }}>
            {Math.round(totals.volym).toLocaleString('sv-SE')}
          </div>
          <div style={{ fontSize: 13, color: C.t3, marginTop: 6 }}>m³fub</div>
          <div style={{ fontSize: 11, color: C.t4, marginTop: 4 }}>
            {Math.round(totals.stammar).toLocaleString('sv-SE')} stammar &middot; medelstam {fmtNum(totals.medelstam, 3)} m³
          </div>
        </div>

        {/* ── KPI CARDS ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 28 }}>
          <KpiCard
            label="Produktivitet"
            value={fmtNum(totals.produktivitet)}
            unit="m³/G15h"
            sublabel="Klicka för detaljer"
            active={activePanel === 'produktivitet'}
            onClick={() => setActivePanel(activePanel === 'produktivitet' ? null : 'produktivitet')}
          />
          <KpiCard
            label="Diesel"
            value={fmtNum(totals.dieselPerM3)}
            unit="l/m³"
            sublabel="Klicka för detaljer"
            active={activePanel === 'diesel'}
            onClick={() => setActivePanel(activePanel === 'diesel' ? null : 'diesel')}
          />
          <KpiCard
            label="Tidsfördelning"
            value={fmtNum(totals.utnyttjandegrad, 0)}
            unit="% utnyttjande"
            sublabel="G15 / totaltid"
            active={activePanel === 'tid'}
            onClick={() => setActivePanel(activePanel === 'tid' ? null : 'tid')}
          />
          <KpiCard
            label="Kalibrering"
            value={fmtNum(totals.medelstam, 3)}
            unit="m³/stam"
            sublabel="Medelstam"
            active={activePanel === 'kalibrering'}
            onClick={() => setActivePanel(activePanel === 'kalibrering' ? null : 'kalibrering')}
          />
        </div>

        {/* ── OPERATOR LIST ── */}
        <div style={{
          background: C.surface, borderRadius: 14, border: `1px solid ${C.border}`,
          padding: '0 18px', overflow: 'hidden',
        }}>
          <div style={{
            fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.14em', color: C.t4, padding: '16px 0 12px',
            borderBottom: `1px solid ${C.border}`,
          }}>
            Operatörer
          </div>

          {opData.length === 0 && (
            <div style={{ padding: '24px 0', textAlign: 'center', color: C.t4, fontSize: 12 }}>
              Inga operatörer hittades
            </div>
          )}

          {opData.map(op => (
            <OperatorRow
              key={op.id}
              name={op.namn}
              volym={op.volym}
              g15h={op.g15Sek / 3600}
              prod={op.prod}
              onClick={() => { setSelectedOp(op.id); }}
            />
          ))}
        </div>
      </div>

      {/* ── SLIDE PANELS ── */}

      {/* Produktivitet panel */}
      <SlidePanel
        open={activePanel === 'produktivitet'}
        onClose={() => setActivePanel(null)}
        title="Produktivitet"
      >
        <StatRow label="Volym totalt" value={fmtNum(totals.volym, 0)} unit="m³fub" accent />
        <StatRow label="G15-tid" value={fmtNum(totals.g15h, 1)} unit="h" />
        <StatRow label="Produktivitet" value={fmtNum(totals.produktivitet)} unit="m³/G15h" accent />
        <StatRow label="Stammar" value={Math.round(totals.stammar).toLocaleString('sv-SE')} unit="st" />
        <StatRow label="Medelstam" value={fmtNum(totals.medelstam, 3)} unit="m³" />
        <div style={{ marginTop: 20, fontSize: 11, color: C.t4, lineHeight: 1.6 }}>
          G15-tid inkluderar bearbetning, terrängkörning, övrigt arbete och korta stopp (&le;15 min).
        </div>
      </SlidePanel>

      {/* Diesel panel */}
      <SlidePanel
        open={activePanel === 'diesel'}
        onClose={() => setActivePanel(null)}
        title="Bränsleförbrukning"
      >
        <StatRow label="Total diesel" value={fmtNum(totals.bransle, 0)} unit="liter" />
        <StatRow label="Diesel per m³" value={fmtNum(totals.dieselPerM3)} unit="l/m³" accent />
        <StatRow label="Diesel per G15h" value={fmtNum(totals.g15h > 0 ? totals.bransle / totals.g15h : 0)} unit="l/h" />
        <StatRow label="Motortid" value={fmtNum(totals.engineTime / 3600, 1)} unit="h" />
        <StatRow label="Tomgång" value={fmtNum(totals.tomgang / 3600, 1)} unit="h" />
        <StatRow label="Tomgångsandel" value={fmtNum(totals.engineTime > 0 ? (totals.tomgang / totals.engineTime) * 100 : 0, 1)} unit="%" />
      </SlidePanel>

      {/* Tidsfördelning panel */}
      <SlidePanel
        open={activePanel === 'tid'}
        onClose={() => setActivePanel(null)}
        title="Tidsfördelning"
      >
        {(() => {
          const tot = totals.totalTidSek || 1;
          return (
            <>
              <TimeBar label="Bearbetning" pct={(totals.processing / tot) * 100} color={C.green} />
              <TimeBar label="Terrängkörning" pct={(totals.terrain / tot) * 100} color="#60a5fa" />
              <TimeBar label="Övrigt arbete" pct={(totals.otherWork / tot) * 100} color={C.amber} />
              <TimeBar label="Korta stopp" pct={(totals.kortStopp / tot) * 100} color="#a78bfa" />
              <TimeBar label="Underhåll" pct={(totals.maintenance / tot) * 100} color={C.t3} />
              <TimeBar label="Störning" pct={(totals.disturbance / tot) * 100} color={C.red} />
              <TimeBar label="Avbrott" pct={(totals.avbrott / tot) * 100} color="#f97316" />
              <TimeBar label="Rast" pct={(totals.rast / tot) * 100} color={C.t4} />
              <div style={{ marginTop: 16, borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
                <StatRow label="G0-tid" value={fmtNum(totals.g0Sek / 3600, 1)} unit="h" />
                <StatRow label="G15-tid" value={fmtNum(totals.g15Sek / 3600, 1)} unit="h" />
                <StatRow label="Arbetstid" value={fmtNum(totals.arbetstidSek / 3600, 1)} unit="h" />
                <StatRow label="Totaltid" value={fmtNum(totals.totalTidSek / 3600, 1)} unit="h" />
                <StatRow label="Utnyttjandegrad" value={fmtNum(totals.utnyttjandegrad, 1)} unit="%" accent />
              </div>
            </>
          );
        })()}
      </SlidePanel>

      {/* Kalibrering panel */}
      <SlidePanel
        open={activePanel === 'kalibrering'}
        onClose={() => setActivePanel(null)}
        title="Kalibrering"
      >
        <StatRow label="Medelstam" value={fmtNum(totals.medelstam, 3)} unit="m³" accent />
        <StatRow label="Totalt stammar" value={Math.round(totals.stammar).toLocaleString('sv-SE')} unit="st" />
        <StatRow label="Total volym" value={fmtNum(totals.volym, 0)} unit="m³fub" />
        <div style={{ marginTop: 20, fontSize: 11, color: C.t4, lineHeight: 1.6 }}>
          Medelstam beräknas som total volym / antal stammar. Kontrollera mot virkesmätning för att bedöma kalibreringsbehov.
        </div>
      </SlidePanel>

      {/* Operator detail panel */}
      <SlidePanel
        open={!!selectedOp}
        onClose={() => setSelectedOp(null)}
        title={selOpData?.namn || ''}
      >
        {selOpData && (() => {
          const g15h = selOpData.g15Sek / 3600;
          const totalSek = selOpData.g15Sek + selOpData.maintenanceSek + selOpData.disturbanceSek + selOpData.avbrottSek + selOpData.rastSek;
          const utnyttjande = totalSek > 0 ? (selOpData.g15Sek / totalSek) * 100 : 0;
          return (
            <>
              <StatRow label="Volym" value={fmtNum(selOpData.volym, 0)} unit="m³fub" accent />
              <StatRow label="Produktivitet" value={fmtNum(selOpData.prod)} unit="m³/G15h" accent />
              <StatRow label="G15-tid" value={fmtNum(g15h, 1)} unit="h" />
              <StatRow label="Stammar" value={Math.round(selOpData.stammar).toLocaleString('sv-SE')} unit="st" />
              <StatRow label="Medelstam" value={fmtNum(selOpData.stammar > 0 ? selOpData.volym / selOpData.stammar : 0, 3)} unit="m³" />
              <StatRow label="Diesel" value={fmtNum(selOpData.bransleLiter, 0)} unit="liter" />
              <StatRow label="Diesel/m³" value={fmtNum(selOpData.volym > 0 ? selOpData.bransleLiter / selOpData.volym : 0)} unit="l/m³" />
              <StatRow label="Utnyttjandegrad" value={fmtNum(utnyttjande, 1)} unit="%" />
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: C.t4, marginBottom: 12 }}>
                  Tidsfördelning
                </div>
                <TimeBar label="Bearbetning" pct={totalSek > 0 ? (selOpData.processingSek / totalSek) * 100 : 0} color={C.green} />
                <TimeBar label="Terrängkörning" pct={totalSek > 0 ? (selOpData.terrainSek / totalSek) * 100 : 0} color="#60a5fa" />
                <TimeBar label="Övrigt arbete" pct={totalSek > 0 ? (selOpData.otherSek / totalSek) * 100 : 0} color={C.amber} />
                <TimeBar label="Korta stopp" pct={totalSek > 0 ? (selOpData.kortStoppSek / totalSek) * 100 : 0} color="#a78bfa" />
                <TimeBar label="Underhåll" pct={totalSek > 0 ? (selOpData.maintenanceSek / totalSek) * 100 : 0} color={C.t3} />
                <TimeBar label="Störning" pct={totalSek > 0 ? (selOpData.disturbanceSek / totalSek) * 100 : 0} color={C.red} />
                <TimeBar label="Rast" pct={totalSek > 0 ? (selOpData.rastSek / totalSek) * 100 : 0} color={C.t4} />
              </div>
            </>
          );
        })()}
      </SlidePanel>
    </div>
  );
}
