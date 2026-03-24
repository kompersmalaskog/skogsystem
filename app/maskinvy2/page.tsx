'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/* ══════════════════════════════════════════════════════════════
   DESIGN TOKENS
   ══════════════════════════════════════════════════════════════ */
const ff = "'Geist', system-ui, sans-serif";
const C = {
  bg: '#111110', surface: '#1a1a18', surface2: '#222220',
  border: 'rgba(255,255,255,0.07)', border2: 'rgba(255,255,255,0.13)',
  t1: '#e8e8e4', t2: '#a8a8a2', t3: '#7a7a72', t4: '#3a3a36',
  green: '#5aff8c', red: '#ff5f57', amber: '#ffb340', blue: '#60a5fa',
};

/* ══════════════════════════════════════════════════════════════
   TYPES
   ══════════════════════════════════════════════════════════════ */
type MachineType = 'skordare' | 'skotare';
type PeriodType = 'vecka' | 'manad' | 'kvartal' | 'ar';
type KpiId = 'volym' | 'produktivitet' | 'diesel' | 'utnyttjandegrad';

interface TidRow {
  datum: string; maskin_id: string; objekt_id: string; operator_id: string | null;
  processing_sek: number; terrain_sek: number; other_work_sek: number;
  maintenance_sek: number; disturbance_sek: number; avbrott_sek: number;
  rast_sek: number; kort_stopp_sek: number; bransle_liter: number;
  engine_time_sek: number; tomgang_sek: number;
}
interface ProdRow {
  datum: string; maskin_id: string; objekt_id: string;
  volym_m3sub: number; stammar: number;
}
interface Maskin { maskin_id: string; modell: string; tillverkare: string; typ: string | null; }
interface Operator { operator_id: string; operator_namn: string | null; operator_key: string | null; }

interface Agg {
  volym: number; stammar: number; g15Sek: number; totalTidSek: number; bransle: number;
  processingSek: number; terrainSek: number; otherSek: number; kortStoppSek: number;
  maintenanceSek: number; disturbanceSek: number; avbrottSek: number; rastSek: number;
}

interface OpAgg extends Agg { id: string; namn: string; maskinModell: string; }

/* ══════════════════════════════════════════════════════════════
   HELPERS
   ══════════════════════════════════════════════════════════════ */
function isSkordare(typ: string | null): boolean {
  if (!typ) return true;
  const t = typ.toLowerCase();
  return t !== 'forwarder' && t !== 'skotare';
}

function fN(n: number, d = 1): string {
  return n.toLocaleString('sv-SE', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function isoWeek(d: Date): { year: number; week: number } {
  const u = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = u.getUTCDay() || 7;
  u.setUTCDate(u.getUTCDate() + 4 - day);
  const y = u.getUTCFullYear();
  const y1 = new Date(Date.UTC(y, 0, 1));
  return { year: y, week: Math.ceil((((u.getTime() - y1.getTime()) / 86400000) + 1) / 7) };
}

function weekStart(year: number, week: number): Date {
  const jan4 = new Date(year, 0, 4);
  const dow = jan4.getDay() || 7;
  const w1 = new Date(jan4);
  w1.setDate(jan4.getDate() - dow + 1);
  const t = new Date(w1);
  t.setDate(w1.getDate() + (week - 1) * 7);
  return t;
}

function maxWeeks(y: number): number { return isoWeek(new Date(y, 11, 28)).week; }
function df(d: Date): string { return d.toISOString().slice(0, 10); }

const MON_SV = ['Jan', 'Feb', 'Mar', 'Apr', 'Maj', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];
const DAY_SV = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'];

function dateRange(p: PeriodType, year: number, week: number, month: number, quarter: number): { start: string; end: string } {
  switch (p) {
    case 'vecka': { const m = weekStart(year, week); const s = new Date(m); s.setDate(s.getDate() + 6); return { start: df(m), end: df(s) }; }
    case 'manad': return { start: df(new Date(year, month, 1)), end: df(new Date(year, month + 1, 0)) };
    case 'kvartal': return { start: df(new Date(year, quarter * 3, 1)), end: df(new Date(year, quarter * 3 + 3, 0)) };
    case 'ar': return { start: `${year}-01-01`, end: `${year}-12-31` };
  }
}

function prevRange(p: PeriodType, year: number, week: number, month: number, quarter: number): { start: string; end: string } {
  switch (p) {
    case 'vecka': { let py = year, pw = week - 1; if (pw < 1) { py--; pw = maxWeeks(py); } return dateRange('vecka', py, pw, 0, 0); }
    case 'manad': { let py = year, pm = month - 1; if (pm < 0) { py--; pm = 11; } return dateRange('manad', py, 0, pm, 0); }
    case 'kvartal': { let py = year, pq = quarter - 1; if (pq < 0) { py--; pq = 3; } return dateRange('kvartal', py, 0, 0, pq); }
    case 'ar': return dateRange('ar', year - 1, 0, 0, 0);
  }
}

function aggregate(tid: TidRow[], prod: ProdRow[]): Agg {
  const v = prod.reduce((s, r) => s + (r.volym_m3sub || 0), 0);
  const st = prod.reduce((s, r) => s + (r.stammar || 0), 0);
  const p = tid.reduce((s, r) => s + (r.processing_sek || 0), 0);
  const te = tid.reduce((s, r) => s + (r.terrain_sek || 0), 0);
  const ow = tid.reduce((s, r) => s + (r.other_work_sek || 0), 0);
  const ks = tid.reduce((s, r) => s + (r.kort_stopp_sek || 0), 0);
  const ma = tid.reduce((s, r) => s + (r.maintenance_sek || 0), 0);
  const di = tid.reduce((s, r) => s + (r.disturbance_sek || 0), 0);
  const av = tid.reduce((s, r) => s + (r.avbrott_sek || 0), 0);
  const ra = tid.reduce((s, r) => s + (r.rast_sek || 0), 0);
  const br = tid.reduce((s, r) => s + (r.bransle_liter || 0), 0);
  const g15 = p + te + ow;
  const arb = g15 + ma + di + av;
  return { volym: v, stammar: st, g15Sek: g15, totalTidSek: arb + ra, bransle: br, processingSek: p, terrainSek: te, otherSek: ow, kortStoppSek: ks, maintenanceSek: ma, disturbanceSek: di, avbrottSek: av, rastSek: ra };
}

function kpiVal(a: Agg, k: KpiId): number {
  const g15h = a.g15Sek / 3600;
  switch (k) {
    case 'volym': return a.volym;
    case 'produktivitet': return g15h > 0 ? a.volym / g15h : 0;
    case 'diesel': return a.volym > 0 ? a.bransle / a.volym : 0;
    case 'utnyttjandegrad': return a.totalTidSek > 0 ? (a.g15Sek / a.totalTidSek) * 100 : 0;
  }
}

const KPI_META: Record<KpiId, { label: string; unit: string; dec: number; lowerBetter: boolean }> = {
  volym: { label: 'Volym', unit: 'm³fub', dec: 0, lowerBetter: false },
  produktivitet: { label: 'Produktivitet', unit: 'm³/G15h', dec: 1, lowerBetter: false },
  diesel: { label: 'Diesel', unit: 'l/m³', dec: 2, lowerBetter: true },
  utnyttjandegrad: { label: 'Utnyttjandegrad', unit: '%', dec: 1, lowerBetter: false },
};

function trend(k: KpiId, curr: number, prev: number): 'up' | 'down' | 'flat' {
  if (prev === 0) return 'flat';
  const d = curr - prev;
  if (Math.abs(d / prev) < 0.005) return 'flat';
  const better = KPI_META[k].lowerBetter ? d < 0 : d > 0;
  return better ? 'up' : 'down';
}

function trendPct(c: number, p: number): number {
  return p === 0 ? 0 : ((c - p) / p) * 100;
}

/* ── Operator aggregation ── */
function aggregateOperators(
  tid: TidRow[], prod: ProdRow[], ops: Operator[], maskiner: Maskin[]
): OpAgg[] {
  const opNames = new Map<string, string>();
  ops.forEach(o => opNames.set(o.operator_id, o.operator_namn || o.operator_key || o.operator_id));

  const maskinMap = new Map<string, string>();
  maskiner.forEach(m => maskinMap.set(m.maskin_id, `${m.tillverkare} ${m.modell}`.trim()));

  // Aggregate time per operator
  const map = new Map<string, { g15: number; proc: number; terr: number; other: number; ks: number; maint: number; dist: number; avb: number; rast: number; bransle: number; maskinCount: Map<string, number> }>();

  for (const r of tid) {
    const id = r.operator_id || 'unknown';
    if (!map.has(id)) map.set(id, { g15: 0, proc: 0, terr: 0, other: 0, ks: 0, maint: 0, dist: 0, avb: 0, rast: 0, bransle: 0, maskinCount: new Map() });
    const d = map.get(id)!;
    const rp = r.processing_sek || 0, rt = r.terrain_sek || 0, ro = r.other_work_sek || 0;
    d.g15 += rp + rt + ro;
    d.proc += rp; d.terr += rt; d.other += ro;
    d.ks += r.kort_stopp_sek || 0;
    d.maint += r.maintenance_sek || 0;
    d.dist += r.disturbance_sek || 0;
    d.avb += r.avbrott_sek || 0;
    d.rast += r.rast_sek || 0;
    d.bransle += r.bransle_liter || 0;
    d.maskinCount.set(r.maskin_id, (d.maskinCount.get(r.maskin_id) || 0) + 1);
  }

  // Production split by operator time share per objekt
  const opObjG15 = new Map<string, Map<string, number>>(); // opId → objId → g15sek
  for (const r of tid) {
    const id = r.operator_id || 'unknown';
    if (!opObjG15.has(id)) opObjG15.set(id, new Map());
    const m = opObjG15.get(id)!;
    m.set(r.objekt_id, (m.get(r.objekt_id) || 0) + (r.processing_sek || 0) + (r.terrain_sek || 0) + (r.other_work_sek || 0));
  }

  // Total G15 per objekt (sum across all operators)
  const objTotalG15 = new Map<string, number>();
  for (const [, objMap] of opObjG15) {
    for (const [obj, g] of objMap) {
      objTotalG15.set(obj, (objTotalG15.get(obj) || 0) + g);
    }
  }

  // Production per objekt
  const prodByObj = new Map<string, { volym: number; stammar: number }>();
  for (const r of prod) {
    if (!prodByObj.has(r.objekt_id)) prodByObj.set(r.objekt_id, { volym: 0, stammar: 0 });
    const d = prodByObj.get(r.objekt_id)!;
    d.volym += r.volym_m3sub || 0;
    d.stammar += r.stammar || 0;
  }

  // Build result
  const result: OpAgg[] = [];
  for (const [id, d] of map) {
    let volym = 0, stammar = 0;
    const objs = opObjG15.get(id);
    if (objs) {
      for (const [obj, g] of objs) {
        const total = objTotalG15.get(obj) || 1;
        const share = g / total;
        const p = prodByObj.get(obj);
        if (p) { volym += p.volym * share; stammar += p.stammar * share; }
      }
    }

    // Most used machine
    let topMaskin = '';
    let topCount = 0;
    for (const [mid, cnt] of d.maskinCount) {
      if (cnt > topCount) { topCount = cnt; topMaskin = mid; }
    }

    const totalTid = d.g15 + d.maint + d.dist + d.avb + d.rast;
    result.push({
      id, namn: opNames.get(id) || id,
      maskinModell: maskinMap.get(topMaskin) || topMaskin,
      volym, stammar, g15Sek: d.g15, totalTidSek: totalTid, bransle: d.bransle,
      processingSek: d.proc, terrainSek: d.terr, otherSek: d.other,
      kortStoppSek: d.ks, maintenanceSek: d.maint, disturbanceSek: d.dist,
      avbrottSek: d.avb, rastSek: d.rast,
    });
  }
  return result.filter(o => o.g15Sek > 60).sort((a, b) => b.volym - a.volym);
}

/* ══════════════════════════════════════════════════════════════
   SUB-COMPONENTS
   ══════════════════════════════════════════════════════════════ */

function SlidePanel({ open, onClose, title, children, z = 100 }: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode; z?: number;
}) {
  return (
    <>
      {open && <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: z }} />}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(440px, 92vw)',
        background: C.bg, borderLeft: `1px solid ${C.border2}`,
        transform: open ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        zIndex: z + 1, overflowY: 'auto',
        boxShadow: open ? '-20px 0 60px rgba(0,0,0,0.5)' : 'none',
        fontFamily: ff,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 20px 16px', borderBottom: `1px solid ${C.border}`,
          position: 'sticky', top: 0, background: C.bg, zIndex: 2,
        }}>
          <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: -0.3 }}>{title}</span>
          <button onClick={onClose} style={{
            background: 'none', border: `1px solid ${C.border}`, borderRadius: 8,
            color: C.t3, fontSize: 13, padding: '4px 14px', cursor: 'pointer', fontFamily: ff,
          }}>Stäng</button>
        </div>
        <div style={{ padding: 20 }}>{children}</div>
      </div>
    </>
  );
}

function Pill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      padding: '6px 16px', border: 'none', borderRadius: 6, fontFamily: ff,
      fontSize: 12, fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s',
      background: active ? C.surface2 : 'transparent',
      color: active ? C.t1 : C.t3, letterSpacing: -0.2,
    }}>{label}</button>
  );
}

function Select({ value, onChange, children, style }: {
  value: string | number; onChange: (v: string) => void;
  children: React.ReactNode; style?: React.CSSProperties;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        background: C.surface, color: C.t1, border: `1px solid ${C.border}`,
        borderRadius: 6, padding: '5px 8px', fontSize: 12, fontFamily: ff,
        cursor: 'pointer', outline: 'none', ...style,
      }}
    >{children}</select>
  );
}

/* ══════════════════════════════════════════════════════════════
   BAR CHART (Level 2)
   ══════════════════════════════════════════════════════════════ */
function BarChart({ bars, prevAvg, color }: {
  bars: { label: string; value: number }[];
  prevAvg: number;
  color: string;
}) {
  const allV = [...bars.map(b => b.value), prevAvg];
  const maxV = Math.max(...allV, 0.001);
  const H = 160;
  return (
    <div style={{ position: 'relative', marginBottom: 24 }}>
      {prevAvg > 0 && (
        <div style={{
          position: 'absolute', left: 0, right: 0, zIndex: 2,
          bottom: 28 + (prevAvg / maxV) * H,
          borderTop: `1.5px dashed ${C.t4}`,
        }}>
          <span style={{ position: 'absolute', right: 0, top: -15, fontSize: 9, color: C.t3 }}>
            Föreg. {fN(prevAvg, 1)}
          </span>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: H }}>
        {bars.map((b, i) => (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
            <div style={{
              width: '80%', maxWidth: 36,
              height: `${Math.max((b.value / maxV) * 100, b.value > 0 ? 1 : 0)}%`,
              background: color, borderRadius: '3px 3px 0 0',
              transition: 'height 0.4s ease', opacity: 0.85,
            }} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 3, marginTop: 6 }}>
        {bars.map((b, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 9, color: C.t4, fontFamily: ff }}>{b.label}</div>
        ))}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   MAIN PAGE
   ══════════════════════════════════════════════════════════════ */
export default function Maskinvy2Page() {
  const now = new Date();
  const currWeek = isoWeek(now);

  // ── State ──
  const [machineType, setMachineType] = useState<MachineType>('skordare');
  const [selectedMaskin, setSelectedMaskin] = useState<string>('alla');
  const [periodType, setPeriodType] = useState<PeriodType>('manad');
  const [year, setYear] = useState(now.getFullYear());
  const [week, setWeek] = useState(currWeek.week);
  const [month, setMonth] = useState(now.getMonth());
  const [quarter, setQuarter] = useState(Math.floor(now.getMonth() / 3));

  const [loading, setLoading] = useState(true);
  const [tidCurr, setTidCurr] = useState<TidRow[]>([]);
  const [tidPrev, setTidPrev] = useState<TidRow[]>([]);
  const [prodCurr, setProdCurr] = useState<ProdRow[]>([]);
  const [prodPrev, setProdPrev] = useState<ProdRow[]>([]);
  const [maskiner, setMaskiner] = useState<Maskin[]>([]);
  const [operatorer, setOperatorer] = useState<Operator[]>([]);

  const [activeKpi, setActiveKpi] = useState<KpiId | null>(null);
  const [selectedOp, setSelectedOp] = useState<string | null>(null);

  // ── Data loading ──
  const tidCols = 'datum,maskin_id,objekt_id,operator_id,processing_sek,terrain_sek,other_work_sek,maintenance_sek,disturbance_sek,avbrott_sek,rast_sek,kort_stopp_sek,bransle_liter,engine_time_sek,tomgang_sek';
  const prodCols = 'datum,maskin_id,objekt_id,volym_m3sub,stammar';

  const loadData = useCallback(async () => {
    setLoading(true);
    const curr = dateRange(periodType, year, week, month, quarter);
    const prev = prevRange(periodType, year, week, month, quarter);

    const [tc, tp, pc, pp, mr, or_] = await Promise.all([
      supabase.from('fakt_tid').select(tidCols).gte('datum', curr.start).lte('datum', curr.end),
      supabase.from('fakt_tid').select(tidCols).gte('datum', prev.start).lte('datum', prev.end),
      supabase.from('fakt_produktion').select(prodCols).gte('datum', curr.start).lte('datum', curr.end),
      supabase.from('fakt_produktion').select(prodCols).gte('datum', prev.start).lte('datum', prev.end),
      supabase.from('dim_maskin').select('maskin_id,modell,tillverkare,typ'),
      supabase.from('dim_operator').select('operator_id,operator_namn,operator_key'),
    ]);

    setTidCurr((tc.data || []) as TidRow[]);
    setTidPrev((tp.data || []) as TidRow[]);
    setProdCurr((pc.data || []) as ProdRow[]);
    setProdPrev((pp.data || []) as ProdRow[]);
    setMaskiner((mr.data || []) as Maskin[]);
    setOperatorer((or_.data || []) as Operator[]);
    setLoading(false);
  }, [periodType, year, week, month, quarter]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Machines of selected type ──
  const typeMaskiner = useMemo(() => {
    const check = machineType === 'skordare' ? isSkordare : (t: string | null) => !isSkordare(t);
    return maskiner
      .filter(m => check(m.typ))
      .sort((a, b) => (`${a.tillverkare} ${a.modell}`).localeCompare(`${b.tillverkare} ${b.modell}`));
  }, [maskiner, machineType]);

  // ── Machine filter ──
  const machineIds = useMemo(() => {
    // Specific machine selected
    if (selectedMaskin !== 'alla') return new Set([selectedMaskin]);

    // All of this type
    const ids = new Set<string>();
    const check = machineType === 'skordare' ? isSkordare : (t: string | null) => !isSkordare(t);
    maskiner.filter(m => check(m.typ)).forEach(m => ids.add(m.maskin_id));
    tidCurr.forEach(r => {
      const m = maskiner.find(mm => mm.maskin_id === r.maskin_id);
      if (!m && machineType === 'skordare') ids.add(r.maskin_id);
      else if (m && check(m.typ)) ids.add(r.maskin_id);
    });
    return ids;
  }, [maskiner, tidCurr, machineType, selectedMaskin]);

  const fTidC = useMemo(() => tidCurr.filter(r => machineIds.has(r.maskin_id)), [tidCurr, machineIds]);
  const fTidP = useMemo(() => tidPrev.filter(r => machineIds.has(r.maskin_id)), [tidPrev, machineIds]);
  const fProdC = useMemo(() => prodCurr.filter(r => machineIds.has(r.maskin_id)), [prodCurr, machineIds]);
  const fProdP = useMemo(() => prodPrev.filter(r => machineIds.has(r.maskin_id)), [prodPrev, machineIds]);

  // ── Aggregates ──
  const aggCurr = useMemo(() => aggregate(fTidC, fProdC), [fTidC, fProdC]);
  const aggPrev = useMemo(() => aggregate(fTidP, fProdP), [fTidP, fProdP]);

  // ── Operators ──
  const opsCurr = useMemo(() => aggregateOperators(fTidC, fProdC, operatorer, maskiner), [fTidC, fProdC, operatorer, maskiner]);
  const opsPrev = useMemo(() => aggregateOperators(fTidP, fProdP, operatorer, maskiner), [fTidP, fProdP, operatorer, maskiner]);

  const selOp = useMemo(() => selectedOp ? opsCurr.find(o => o.id === selectedOp) || null : null, [selectedOp, opsCurr]);
  const selOpPrev = useMemo(() => selectedOp ? opsPrev.find(o => o.id === selectedOp) || null : null, [selectedOp, opsPrev]);

  // ── Chart bars (Level 2) ──
  const chartBars = useMemo(() => {
    if (!activeKpi) return [];
    const useDaily = periodType === 'vecka' || periodType === 'manad';

    if (useDaily) {
      // Group by day
      const curr = dateRange(periodType, year, week, month, quarter);
      const startD = new Date(curr.start + 'T00:00:00');
      const endD = new Date(curr.end + 'T00:00:00');
      const days: { label: string; date: string }[] = [];
      const d = new Date(startD);
      while (d <= endD) {
        const ds = df(d);
        const dayIdx = (d.getDay() + 6) % 7; // 0=Mon
        days.push({ label: periodType === 'vecka' ? DAY_SV[dayIdx] : `${d.getDate()}`, date: ds });
        d.setDate(d.getDate() + 1);
      }
      return days.map(day => {
        const dTid = fTidC.filter(r => r.datum === day.date);
        const dProd = fProdC.filter(r => r.datum === day.date);
        const a = aggregate(dTid, dProd);
        return { label: day.label, value: kpiVal(a, activeKpi!) };
      });
    } else {
      // Group by month
      const curr = dateRange(periodType, year, week, month, quarter);
      const startM = parseInt(curr.start.slice(5, 7)) - 1;
      const endM = parseInt(curr.end.slice(5, 7)) - 1;
      const months: number[] = [];
      for (let m = startM; m <= endM; m++) months.push(m);
      return months.map(mo => {
        const prefix = `${year}-${String(mo + 1).padStart(2, '0')}`;
        const mTid = fTidC.filter(r => r.datum.startsWith(prefix));
        const mProd = fProdC.filter(r => r.datum.startsWith(prefix));
        const a = aggregate(mTid, mProd);
        return { label: MON_SV[mo], value: kpiVal(a, activeKpi!) };
      });
    }
  }, [activeKpi, periodType, year, week, month, quarter, fTidC, fProdC]);

  const prevChartAvg = useMemo(() => {
    if (!activeKpi) return 0;
    return kpiVal(aggPrev, activeKpi);
  }, [activeKpi, aggPrev]);

  // ── Operator breakdown for Level 3 table ──
  const opTableRows = useMemo(() => {
    if (!selectedOp) return [];
    const useDaily = periodType === 'vecka';

    if (useDaily) {
      const curr = dateRange(periodType, year, week, month, quarter);
      const startD = new Date(curr.start + 'T00:00:00');
      const endD = new Date(curr.end + 'T00:00:00');
      const rows: { label: string; agg: Agg }[] = [];
      const d = new Date(startD);
      while (d <= endD) {
        const ds = df(d);
        const dayIdx = (d.getDay() + 6) % 7;
        const opTid = fTidC.filter(r => r.datum === ds && (r.operator_id || 'unknown') === selectedOp);
        const opProdIds = new Set(opTid.map(r => r.objekt_id));
        const opProd = fProdC.filter(r => r.datum === ds && opProdIds.has(r.objekt_id));
        // Simplified: attribute all matching prod to this operator (close enough for daily view)
        rows.push({ label: DAY_SV[dayIdx], agg: aggregate(opTid, opProd) });
        d.setDate(d.getDate() + 1);
      }
      return rows;
    } else {
      // Monthly rows
      const curr = dateRange(periodType, year, week, month, quarter);
      const startM = parseInt(curr.start.slice(5, 7)) - 1;
      const endM = parseInt(curr.end.slice(5, 7)) - 1;
      const rows: { label: string; agg: Agg }[] = [];
      for (let mo = startM; mo <= endM; mo++) {
        const prefix = `${year}-${String(mo + 1).padStart(2, '0')}`;
        const opTid = fTidC.filter(r => r.datum.startsWith(prefix) && (r.operator_id || 'unknown') === selectedOp);
        const opProdIds = new Set(opTid.map(r => r.objekt_id));
        const opProd = fProdC.filter(r => r.datum.startsWith(prefix) && opProdIds.has(r.objekt_id));
        rows.push({ label: MON_SV[mo], agg: aggregate(opTid, opProd) });
      }
      return rows;
    }
  }, [selectedOp, periodType, year, week, month, quarter, fTidC, fProdC]);

  // ── Period label ──
  const periodLabel = useMemo(() => {
    switch (periodType) {
      case 'vecka': return `v${week}, ${year}`;
      case 'manad': return `${MON_SV[month]} ${year}`;
      case 'kvartal': return `Q${quarter + 1} ${year}`;
      case 'ar': return `${year}`;
    }
  }, [periodType, year, week, month, quarter]);

  // ── Chart color per KPI ──
  const chartColor = (k: KpiId) => {
    switch (k) { case 'volym': return C.green; case 'produktivitet': return C.blue; case 'diesel': return C.amber; case 'utnyttjandegrad': return '#a78bfa'; }
  };

  /* ── Render ── */
  if (loading) {
    return (
      <div style={{
        position: 'fixed', top: 100, left: 0, right: 0, bottom: 0,
        background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: C.t3, fontFamily: ff, fontSize: 13, zIndex: 1,
      }}>Laddar data...</div>
    );
  }

  return (
    <div style={{
      position: 'fixed', top: 100, left: 0, right: 0, bottom: 0,
      overflow: 'auto', WebkitOverflowScrolling: 'touch' as any,
      background: C.bg, fontFamily: ff, color: C.t1, zIndex: 1,
    }}>
      <div style={{ padding: '20px 20px 80px', maxWidth: 600, margin: '0 auto' }}>

        {/* ═══ FILTERS ═══ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>

          {/* Machine type + specific machine */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: 3 }}>
              <Pill label="Skördare" active={machineType === 'skordare'} onClick={() => { setMachineType('skordare'); setSelectedMaskin('alla'); }} />
              <Pill label="Skotare" active={machineType === 'skotare'} onClick={() => { setMachineType('skotare'); setSelectedMaskin('alla'); }} />
            </div>
            <Select value={selectedMaskin} onChange={v => setSelectedMaskin(v)}>
              <option value="alla">Alla {machineType === 'skordare' ? 'skördare' : 'skotare'}</option>
              {typeMaskiner.map(m => (
                <option key={m.maskin_id} value={m.maskin_id}>
                  {`${m.tillverkare} ${m.modell}`.trim() || m.maskin_id}
                </option>
              ))}
            </Select>
          </div>

          {/* Period type + selectors */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: 3 }}>
              {(['vecka', 'manad', 'kvartal', 'ar'] as const).map(p => (
                <Pill key={p} label={p === 'vecka' ? 'Vecka' : p === 'manad' ? 'Månad' : p === 'kvartal' ? 'Kvartal' : 'År'}
                  active={periodType === p} onClick={() => setPeriodType(p)} />
              ))}
            </div>

            {/* Year selector */}
            <Select value={year} onChange={v => setYear(Number(v))}>
              {Array.from({ length: 5 }, (_, i) => now.getFullYear() - i).map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </Select>

            {/* Week selector */}
            {periodType === 'vecka' && (
              <Select value={week} onChange={v => setWeek(Number(v))} style={{ width: 72 }}>
                {Array.from({ length: maxWeeks(year) }, (_, i) => i + 1).map(w => (
                  <option key={w} value={w}>v{w}</option>
                ))}
              </Select>
            )}

            {/* Month selector */}
            {periodType === 'manad' && (
              <Select value={month} onChange={v => setMonth(Number(v))}>
                {MON_SV.map((m, i) => <option key={i} value={i}>{m}</option>)}
              </Select>
            )}

            {/* Quarter selector */}
            {periodType === 'kvartal' && (
              <Select value={quarter} onChange={v => setQuarter(Number(v))}>
                {[0, 1, 2, 3].map(q => <option key={q} value={q}>Q{q + 1}</option>)}
              </Select>
            )}
          </div>

          <div style={{ fontSize: 12, color: C.t3 }}>{periodLabel}</div>
        </div>

        {/* ═══ LEVEL 1 — 4 KPI CARDS ═══ */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 28 }}>
          {(['volym', 'produktivitet', 'diesel', 'utnyttjandegrad'] as const).map(k => {
            const cv = kpiVal(aggCurr, k);
            const pv = kpiVal(aggPrev, k);
            const dir = trend(k, cv, pv);
            const pct = trendPct(cv, pv);
            const meta = KPI_META[k];
            const isGood = dir === 'up';
            const tCol = dir === 'flat' ? C.t4 : isGood ? C.green : C.red;
            const arrow = dir === 'up' ? '↑' : dir === 'down' ? '↓' : '→';
            const active = activeKpi === k;

            return (
              <div key={k} onClick={() => { setActiveKpi(active ? null : k); setSelectedOp(null); }} style={{
                background: active ? 'linear-gradient(145deg, #1e1e1c, #141412)' : C.surface,
                border: `1px solid ${active ? C.border2 : C.border}`,
                borderRadius: 14, padding: '16px 18px', cursor: 'pointer',
                transition: 'all 0.2s',
                boxShadow: active ? '0 12px 40px rgba(0,0,0,0.5)' : 'none',
              }}>
                <div style={{ fontSize: 11, color: C.t3, fontWeight: 600, letterSpacing: '0.04em', marginBottom: 8 }}>
                  {meta.label}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{
                    fontSize: 28, fontWeight: 700, lineHeight: 1, letterSpacing: -1.5,
                    color: C.t1, fontVariantNumeric: 'tabular-nums',
                    textShadow: '0 0 20px rgba(255,255,255,0.1)',
                  }}>
                    {fN(cv, meta.dec)}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: tCol }}>
                    {arrow} {Math.abs(pct).toFixed(0)}%
                  </span>
                </div>
                <div style={{ fontSize: 10, color: C.t4, marginTop: 4 }}>{meta.unit}</div>
              </div>
            );
          })}
        </div>

        {/* ═══ SUMMARY ═══ */}
        <div style={{
          background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`,
          padding: '14px 18px', fontSize: 12, color: C.t3, lineHeight: 1.8,
        }}>
          <span style={{ color: C.t1, fontWeight: 600 }}>{fN(aggCurr.volym, 0)}</span> m³fub
          {' · '}
          <span style={{ color: C.t1, fontWeight: 600 }}>{fN(aggCurr.g15Sek / 3600, 0)}</span> G15h
          {' · '}
          <span style={{ color: C.t1, fontWeight: 600 }}>{fN(aggCurr.stammar, 0)}</span> stammar
          {' · '}
          <span style={{ color: C.t1, fontWeight: 600 }}>{fN(aggCurr.bransle, 0)}</span> l diesel
        </div>
      </div>

      {/* ═══ LEVEL 2 — KPI DETAIL PANEL ═══ */}
      <SlidePanel
        open={activeKpi !== null}
        onClose={() => { setActiveKpi(null); setSelectedOp(null); }}
        title={activeKpi ? KPI_META[activeKpi].label : ''}
        z={100}
      >
        {activeKpi && (
          <>
            {/* Chart */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 11, color: C.t4, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>
                {periodType === 'vecka' ? 'Per dag' : periodType === 'manad' ? 'Per dag' : 'Per månad'}
              </div>
              <BarChart bars={chartBars} prevAvg={prevChartAvg} color={chartColor(activeKpi)} />
            </div>

            {/* Driver list */}
            <div style={{ fontSize: 11, color: C.t4, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>
              Förare — rankad på {KPI_META[activeKpi].label.toLowerCase()}
            </div>
            {opsCurr.length === 0 && (
              <div style={{ padding: '20px 0', textAlign: 'center', color: C.t4, fontSize: 12 }}>Inga förare hittades</div>
            )}
            {opsCurr
              .sort((a, b) => {
                const av = kpiVal(a, activeKpi!);
                const bv = kpiVal(b, activeKpi!);
                return KPI_META[activeKpi!].lowerBetter ? av - bv : bv - av;
              })
              .map((op, i) => {
                const v = kpiVal(op, activeKpi!);
                const prevOp = opsPrev.find(o => o.id === op.id);
                const pv = prevOp ? kpiVal(prevOp, activeKpi!) : 0;
                const dir = trend(activeKpi!, v, pv);
                const arrow = dir === 'up' ? '↑' : dir === 'down' ? '↓' : '→';
                const tCol = dir === 'flat' ? C.t4 : dir === 'up' ? C.green : C.red;

                return (
                  <div key={op.id} onClick={() => setSelectedOp(op.id)} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 0', borderBottom: `1px solid ${C.border}`, cursor: 'pointer',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{
                        width: 22, height: 22, borderRadius: 11, background: C.surface2,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 700, color: C.t3, flexShrink: 0,
                      }}>{i + 1}</span>
                      <span style={{ fontSize: 13, fontWeight: 500, color: C.t1 }}>{op.namn}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                      <span style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: C.t1 }}>
                        {fN(v, KPI_META[activeKpi!].dec)}
                      </span>
                      <span style={{ fontSize: 10, color: C.t4 }}>{KPI_META[activeKpi!].unit}</span>
                      <span style={{ fontSize: 12, color: tCol, fontWeight: 600 }}>{arrow}</span>
                    </div>
                  </div>
                );
              })}
          </>
        )}
      </SlidePanel>

      {/* ═══ LEVEL 3 — DRIVER DETAIL PANEL ═══ */}
      <SlidePanel
        open={selectedOp !== null}
        onClose={() => setSelectedOp(null)}
        title={selOp?.namn || ''}
        z={200}
      >
        {selOp && (
          <>
            {/* Driver header */}
            <div style={{ fontSize: 12, color: C.t3, marginBottom: 20 }}>{selOp.maskinModell}</div>

            {/* 4 KPI mini-cards */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 24 }}>
              {(['volym', 'produktivitet', 'diesel', 'utnyttjandegrad'] as const).map(k => {
                const v = kpiVal(selOp, k);
                const pv = selOpPrev ? kpiVal(selOpPrev, k) : 0;
                const dir = trend(k, v, pv);
                const meta = KPI_META[k];
                const arrow = dir === 'up' ? '↑' : dir === 'down' ? '↓' : '→';
                const tCol = dir === 'flat' ? C.t4 : dir === 'up' ? C.green : C.red;

                return (
                  <div key={k} style={{
                    background: C.surface, border: `1px solid ${C.border}`,
                    borderRadius: 10, padding: '12px 14px',
                  }}>
                    <div style={{ fontSize: 10, color: C.t4, marginBottom: 4 }}>{meta.label}</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                      <span style={{ fontSize: 20, fontWeight: 700, color: C.t1, fontVariantNumeric: 'tabular-nums' }}>
                        {fN(v, meta.dec)}
                      </span>
                      <span style={{ fontSize: 11, color: tCol, fontWeight: 600 }}>{arrow}</span>
                    </div>
                    <div style={{ fontSize: 9, color: C.t4, marginTop: 2 }}>{meta.unit}</div>
                  </div>
                );
              })}
            </div>

            {/* Data table */}
            <div style={{ fontSize: 11, color: C.t4, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
              {periodType === 'vecka' ? 'Per dag' : 'Per månad'}
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border2}` }}>
                    {['', 'Volym', 'Prod.', 'Diesel', 'Utnyttj.'].map((h, i) => (
                      <th key={i} style={{
                        padding: '8px 6px', textAlign: i === 0 ? 'left' : 'right',
                        fontSize: 10, fontWeight: 600, color: C.t4, letterSpacing: '0.05em',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {opTableRows.map((row, i) => {
                    const v = kpiVal(row.agg, 'volym');
                    const p = kpiVal(row.agg, 'produktivitet');
                    const d = kpiVal(row.agg, 'diesel');
                    const u = kpiVal(row.agg, 'utnyttjandegrad');
                    const hasData = row.agg.g15Sek > 0;
                    return (
                      <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                        <td style={{ padding: '8px 6px', color: C.t2, fontWeight: 500 }}>{row.label}</td>
                        <td style={{ padding: '8px 6px', textAlign: 'right', color: hasData ? C.t1 : C.t4 }}>{hasData ? fN(v, 0) : '–'}</td>
                        <td style={{ padding: '8px 6px', textAlign: 'right', color: hasData ? C.t1 : C.t4 }}>{hasData ? fN(p, 1) : '–'}</td>
                        <td style={{ padding: '8px 6px', textAlign: 'right', color: hasData ? C.t1 : C.t4 }}>{hasData ? fN(d, 2) : '–'}</td>
                        <td style={{ padding: '8px 6px', textAlign: 'right', color: hasData ? C.t1 : C.t4 }}>{hasData ? fN(u, 1) : '–'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </SlidePanel>
    </div>
  );
}
