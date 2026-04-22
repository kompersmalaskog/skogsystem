'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
import UppfoljningVy, { type UppfoljningData, type Maskin, type Forare, type AvbrottRad, type DieselDag } from './UppfoljningVy';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/* ── Design tokens (V6) ── */
const V6_GREY = '#8e8e93';
const V6_GREY2 = '#636366';
const V6_CARD = '#1c1c1e';
const V6_SEP = 'rgba(255,255,255,0.06)';
const V6_SK = '#a8d582';
const V6_ST = '#f0b24c';
const V6_WARN = '#ff9f0a';
const V6_DONE = '#30d158';
const V6_FF = "-apple-system,BlinkMacSystemFont,'SF Pro Display','SF Pro Text','Inter',system-ui,sans-serif";

const bg = '#000';
const text = '#fff';
const muted = V6_GREY;
const ff = V6_FF;

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
  grotSkotning: boolean;
  externSkotning: boolean;
  externForetag: string;
  externPrisTyp: 'm3' | 'timme';
  externPris: number;
  externAntal: number;
  skordareLastDate: string | null;
  skotareLastDate: string | null;
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

/* ── V6 status-härledning ── */
type V6StatusKey = 'skordare' | 'skotare' | 'vantar' | 'pagaende' | 'done';
function v6Status(obj: UppfoljningObjekt): { t: string; k: V6StatusKey } {
  if (obj.status === 'avslutat') return { t: 'Avslutat', k: 'done' };
  const seven = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  const skAct = !!(obj.skordareLastDate && obj.skordareLastDate >= seven);
  const stAct = !!(obj.skotareLastDate && obj.skotareLastDate >= seven);
  const skDone = !!obj.skordareSlut;
  if (skAct) return { t: 'Skördare kör', k: 'skordare' };
  if (skDone && stAct) return { t: 'Skotare kör', k: 'skotare' };
  if (skDone && !stAct) return { t: 'Väntar på skotning', k: 'vantar' };
  if (obj.skordareModell && !skAct && !skDone) return { t: 'Skördare kör', k: 'skordare' };
  return { t: 'Pågående', k: 'pagaende' };
}

/* ── V6 Oskotat-kort (kompakt, expanderbar) ── */
function V6OskotatKort({ data, onFilter }: { data: UppfoljningObjekt[]; onFilter: (k: 'slutavverkning' | 'gallring' | 'grot') => void }) {
  const [open, setOpen] = useState(false);
  const oskotat = {
    slut: { m3: 0, objekt: [] as UppfoljningObjekt[] },
    gall: { m3: 0, objekt: [] as UppfoljningObjekt[] },
    grot: { m3: 0, objekt: [] as UppfoljningObjekt[] },
  };
  data.forEach(o => {
    if (o.status === 'avslutat') return;
    const kvar = Math.max(0, o.volymSkordare - o.volymSkotare);
    if (kvar <= 0) return;
    if (o.grotSkotning) {
      const grotKvar = Math.round(o.volymSkordare * 0.15);
      if (grotKvar > 0) { oskotat.grot.m3 += grotKvar; oskotat.grot.objekt.push(o); }
    }
    if (o.typ === 'slutavverkning') { oskotat.slut.m3 += kvar; oskotat.slut.objekt.push(o); }
    else if (o.typ === 'gallring') { oskotat.gall.m3 += kvar; oskotat.gall.objekt.push(o); }
  });
  const total = oskotat.slut.m3 + oskotat.gall.m3 + oskotat.grot.m3;
  if (total === 0) return null;

  const rad = (label: string, key: 'slutavverkning' | 'gallring' | 'grot', kat: typeof oskotat.slut) => {
    if (kat.m3 === 0) return null;
    return (
      <button key={key} onClick={() => { onFilter(key); setOpen(false); }} style={{ display: 'flex', alignItems: 'center', width: '100%', padding: '12px 18px', background: 'transparent', border: 'none', borderTop: `0.5px solid ${V6_SEP}`, color: '#fff', fontFamily: V6_FF, cursor: 'pointer', textAlign: 'left' }}>
        <span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: 11, color: V6_GREY, marginRight: 12, fontVariantNumeric: 'tabular-nums' }}>{kat.objekt.length} obj</span>
        <span style={{ fontSize: 15, fontWeight: 600, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.2px', minWidth: 56, textAlign: 'right' }}>{Math.round(kat.m3).toLocaleString('sv-SE')}</span>
        <span style={{ fontSize: 10, color: V6_GREY, fontWeight: 600, marginLeft: 3 }}>m³</span>
        <svg width="7" height="12" viewBox="0 0 8 14" fill="none" stroke={V6_GREY2} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 8 }}>
          <polyline points="1 1 7 7 1 13" />
        </svg>
      </button>
    );
  };

  return (
    <div style={{ margin: '0 16px 14px', background: V6_CARD, borderRadius: 12, overflow: 'hidden' }}>
      <button onClick={() => setOpen(!open)} style={{ display: 'flex', alignItems: 'center', width: '100%', padding: '13px 16px', background: 'transparent', border: 'none', color: '#fff', fontFamily: V6_FF, cursor: 'pointer', textAlign: 'left', gap: 10 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: V6_WARN, flexShrink: 0 }} />
        <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.1px' }}>Oskotat i skogen</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 16, fontWeight: 700, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.3px' }}>{Math.round(total).toLocaleString('sv-SE')}</span>
        <span style={{ fontSize: 11, color: V6_GREY, fontWeight: 600, marginLeft: 3 }}>m³</span>
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke={V6_GREY} strokeWidth="2" strokeLinecap="round" style={{ marginLeft: 6, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>
          <polyline points="4 2 8 6 4 10" />
        </svg>
      </button>
      {open && (
        <>
          {rad('Slutavverkning', 'slutavverkning', oskotat.slut)}
          {rad('Gallring', 'gallring', oskotat.gall)}
          {rad('Grot', 'grot', oskotat.grot)}
        </>
      )}
    </div>
  );
}

/* ── V6 Row ── */
function V6Row({ obj, onClick, divider: showDivider }: { obj: UppfoljningObjekt; onClick: () => void; divider: boolean }) {
  const kvar = Math.max(0, obj.volymSkordare - obj.volymSkotare);
  const status = v6Status(obj);
  const statusColor =
    status.k === 'skordare' ? V6_SK :
    status.k === 'skotare' ? V6_ST :
    status.k === 'vantar' ? V6_WARN :
    status.k === 'done' ? V6_DONE :
    V6_GREY;
  const showKvar = kvar > 0 && obj.status !== 'avslutat';
  const rightNum = showKvar ? Math.round(kvar) : Math.round(obj.volymSkordare);
  const rightLabel = showKvar ? 'kvar' : 'm³';
  let liggerDagar: number | null = null;
  if (status.k === 'vantar' && obj.skordareSlut) {
    const d = Math.round((Date.now() - new Date(obj.skordareSlut).getTime()) / 864e5);
    if (d > 0) liggerDagar = d;
  }

  return (
    <button onClick={onClick} style={{ display: 'flex', alignItems: 'center', width: '100%', minHeight: 60, padding: '12px 16px', gap: 12, background: 'transparent', border: 'none', textAlign: 'left', color: '#fff', fontFamily: V6_FF, cursor: 'pointer', borderTop: showDivider ? `0.5px solid ${V6_SEP}` : 'none' }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{obj.namn}</div>
        <div style={{ fontSize: 12, color: V6_GREY, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {obj.typ === 'slutavverkning' ? 'Slutavverkning' : 'Gallring'}{obj.areal ? ` · ${obj.areal} ha` : ''}
          {liggerDagar != null && (
            <span> · <span style={{ color: V6_WARN, fontWeight: 600 }}>Oskotat {liggerDagar} {liggerDagar === 1 ? 'dag' : 'dagar'} · färdigskördat {fmtDate(obj.skordareSlut)}</span></span>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, flexShrink: 0 }}>
        <span style={{ fontSize: 17, fontWeight: 600, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.3px', color: '#fff' }}>{rightNum.toLocaleString('sv-SE')}</span>
        <span style={{ fontSize: 11, color: V6_GREY, fontWeight: 500 }}>{rightLabel}{showKvar ? ' m³' : ''}</span>
      </div>
      <svg width="7" height="12" viewBox="0 0 8 14" fill="none" stroke={V6_GREY2} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 4, flexShrink: 0 }}>
        <polyline points="1 1 7 7 1 13" />
      </svg>
    </button>
  );
}

function V6GroupHeader({ title, count }: { title: string; count: number }) {
  return (
    <div style={{ padding: '20px 20px 8px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: V6_GREY, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{title}</span>
      <span style={{ fontSize: 13, color: V6_GREY, fontVariantNumeric: 'tabular-nums' }}>{count}</span>
    </div>
  );
}

/* ── V6 iOS sökbar ── */
function V6Search({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [focused, setFocused] = useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const active = focused || value.length > 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(118,118,128,0.24)', borderRadius: 10, padding: '7px 8px', minWidth: 0, position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: active ? '0 0 auto' : 1, justifyContent: active ? 'flex-start' : 'center', transition: 'flex .2s' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={V6_GREY} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          {!active && <span style={{ fontSize: 15, color: V6_GREY }}>Sök</span>}
        </div>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{ flex: active ? 1 : 0, width: active ? 'auto' : 0, border: 'none', background: 'none', outline: 'none', color: '#fff', fontSize: 15, fontFamily: V6_FF, minWidth: 0, padding: 0 }}
        />
        {value.length > 0 && (
          <button onMouseDown={e => { e.preventDefault(); onChange(''); inputRef.current?.focus(); }} style={{ background: 'rgba(255,255,255,0.22)', border: 'none', borderRadius: '50%', width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0, flexShrink: 0 }} aria-label="Rensa">
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="#000" strokeWidth="1.8" strokeLinecap="round">
              <line x1="1.5" y1="1.5" x2="6.5" y2="6.5" /><line x1="6.5" y1="1.5" x2="1.5" y2="6.5" />
            </svg>
          </button>
        )}
      </div>
      {active && (
        <button onMouseDown={e => { e.preventDefault(); onChange(''); inputRef.current?.blur(); }} style={{ background: 'none', border: 'none', color: '#0a84ff', fontSize: 15, fontFamily: V6_FF, cursor: 'pointer', padding: '0 2px', flexShrink: 0, whiteSpace: 'nowrap' }}>Avbryt</button>
      )}
    </div>
  );
}

/* ── V6 Segmented ── */
function V6Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div style={{ display: 'flex', background: 'rgba(118,118,128,0.24)', borderRadius: 9, padding: 2, position: 'relative' }}>
      {options.map(([k, l]) => {
        const on = value === k;
        return (
          <button key={k} onClick={() => onChange(k)} style={{ flex: 1, padding: '6px 8px', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: on ? 600 : 500, fontFamily: V6_FF, cursor: 'pointer', background: on ? '#636366' : 'transparent', color: '#fff', transition: 'background .15s', minWidth: 0, whiteSpace: 'nowrap', letterSpacing: '-0.1px', boxShadow: on ? '0 1px 2px rgba(0,0,0,0.2)' : 'none' }}>{l}</button>
        );
      })}
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

      const [tidRes, prodRes, sortRes, dimSortRes, dimTradslagRes, avbrottRes, lassRes, lassSortRes, dimOperatorRes, dimMaskinRes] = await Promise.all([
        supabase.from('fakt_tid').select('datum, objekt_id, maskin_id, operator_id, processing_sek, terrain_sek, other_work_sek, maintenance_sek, disturbance_sek, avbrott_sek, rast_sek, kort_stopp_sek, bransle_liter, engine_time_sek, tomgang_sek').in('objekt_id', ids),
        supabase.from('fakt_produktion').select('objekt_id, maskin_id, volym_m3sub, stammar, processtyp, tradslag_id, datum').in('objekt_id', ids),
        supabase.from('fakt_sortiment').select('objekt_id, sortiment_id, volym_m3sub, antal').in('objekt_id', ids),
        supabase.from('dim_sortiment').select('sortiment_id, namn'),
        supabase.from('dim_tradslag').select('tradslag_id, namn'),
        supabase.from('fakt_avbrott').select('objekt_id, maskin_id, typ, kategori_kod, langd_sek, datum').in('objekt_id', ids),
        stId ? supabase.from('fakt_lass').select('objekt_id, datum, volym_m3sob, korstracka_m').eq('objekt_id', stId) : Promise.resolve({ data: [] }),
        stId ? supabase.from('fakt_lass_sortiment').select('objekt_id, sortiment_id, sortiment_namn, volym_m3sub').eq('objekt_id', stId) : Promise.resolve({ data: [] }),
        supabase.from('dim_operator').select('operator_id, operator_namn, operator_key'),
        supabase.from('dim_maskin').select('maskin_id, maskin_typ'),
      ]);

      const tidRows = tidRes.data || [];
      const prodRows = prodRes.data || [];
      const sortRows = sortRes.data || [];
      const dimSort = dimSortRes.data || [];
      const dimTradslag = dimTradslagRes.data || [];
      let avbrottRows = avbrottRes.data || [];

      // If objekt_id query missed avbrott for a machine, fetch by maskin_id as fallback
      const skMidFb = obj.skordareModellMaskinId;
      const stMidFb = obj.skotareModellMaskinId;
      const hasSkAvbrott = skMidFb ? avbrottRows.some((r: any) => r.maskin_id === skMidFb) : true;
      const hasStAvbrott = stMidFb ? avbrottRows.some((r: any) => r.maskin_id === stMidFb) : true;
      if (!hasSkAvbrott || !hasStAvbrott) {
        const fallbackQueries = [];
        if (!hasSkAvbrott && skMidFb) fallbackQueries.push(supabase.from('fakt_avbrott').select('objekt_id, maskin_id, typ, kategori_kod, langd_sek, datum').eq('maskin_id', skMidFb).limit(2000));
        if (!hasStAvbrott && stMidFb) fallbackQueries.push(supabase.from('fakt_avbrott').select('objekt_id, maskin_id, typ, kategori_kod, langd_sek, datum').eq('maskin_id', stMidFb).limit(2000));
        const fallbackResults = await Promise.all(fallbackQueries);
        for (const res of fallbackResults) {
          if (res.data) avbrottRows = [...avbrottRows, ...res.data];
        }
      }

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
          avbrott: (maintenance + disturbance + avbrottSek) / 3600,
          rast: rast / 3600,
          tomgang: tomgangTotal / 3600,
          dieselTot: diesel,
          tidPerDag,
        };
      };

      // Build sets of harvester/forwarder maskin_ids from dim_maskin
      const harvesterIds = new Set<string>();
      const forwarderIds = new Set<string>();
      (dimMaskinRes.data || []).forEach((m: any) => {
        const typ = (m.maskin_typ || '').toLowerCase();
        if (typ === 'harvester' || typ === 'skördare') harvesterIds.add(m.maskin_id);
        else if (typ === 'forwarder' || typ === 'skotare') forwarderIds.add(m.maskin_id);
      });

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

      // Avbrott — deduplicate rows from overlapping MOM files before aggregating
      const deduplicateAvbrott = (rows: any[]): any[] => {
        // Group by datum+maskin_id+kategori_kod+typ, keep the entry with the longest duration (latest MOM file)
        const groups = new Map<string, any>();
        rows.forEach(r => {
          const key = `${r.datum}|${r.maskin_id}|${r.kategori_kod}|${r.typ}|${r.langd_sek}`;
          if (!groups.has(key)) groups.set(key, r);
        });
        return Array.from(groups.values());
      };
      const buildAvbrott = (rows: any[]): AvbrottRad[] => {
        const deduped = deduplicateAvbrott(rows);
        const m = new Map<string, { tid: number; antal: number; typ: string }>();
        deduped.forEach(r => {
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
        totalLassVol += l.volym_m3sob || 0;
        totalKor += l.korstracka_m || 0;
        if (l.datum) {
          const prev = lassPerDagMap.get(l.datum) || { lass: 0, m3: 0 };
          prev.lass += 1;
          prev.m3 += (l.volym_m3sob || 0);
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
        // Avbrott — deduplicated totals from fakt_avbrott
        avbrottSkordare: buildAvbrott(skAvbrott),
        avbrottSkordare_totalt: `${(deduplicateAvbrott(skAvbrott).reduce((s: number, r: any) => s + (r.langd_sek || 0), 0) / 3600).toFixed(1)}h`,
        avbrottSkotare: buildAvbrott(stAvbrott),
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
    <div style={{ position: 'fixed', top: 56, left: 0, right: 0, bottom: 0, overflowY: 'auto', background: '#000' }}>
      <div style={{ maxWidth: 440, margin: '0 auto', minHeight: '100%' }}>
        <UppfoljningVy data={data} onBack={onBack} />
      </div>
    </div>
  );
}

function buildEmptyData(obj: UppfoljningObjekt): UppfoljningData {
  return {
    objektNamn: obj.namn,
    skordat: 0, skotat: 0, kvarPct: 0, egenSkotning: obj.egenSkotning, grotSkotning: obj.grotSkotning,
    externSkotning: obj.externSkotning, externForetag: obj.externForetag, externPrisTyp: obj.externPrisTyp, externPris: obj.externPris, externAntal: obj.externAntal,
    maskiner: [],
    typ: obj.typ, areal: obj.areal, agare: obj.agare, status: obj.status,
    skordareModell: obj.skordareModell, skordareStart: obj.skordareStart, skordareSlut: obj.skordareSlut, skordareLastDate: obj.skordareLastDate,
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

/* ── Main page ── */
export default function UppfoljningPage() {
  const [loading, setLoading] = useState(true);
  const [objekt, setObjekt] = useState<UppfoljningObjekt[]>([]);
  const [typ, setTyp] = useState<'alla' | 'slutavverkning' | 'gallring' | 'grot'>('alla');
  const [oskotatFilter, setOskotatFilter] = useState<'slutavverkning' | 'gallring' | 'grot' | null>(null);
  const [visaAvslutade, setVisaAvslutade] = useState(false);
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
          ? fetchPaginated<any>(() => supabase.from('fakt_tid').select('objekt_id, maskin_id, bransle_liter, datum').in('objekt_id', allObjektIds))
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

      // Track last activity date per (objekt_id::maskin_id)
      const lastDatePerMaskin = new Map<string, string>();
      tid.forEach(t => {
        if (t.objekt_id && t.maskin_id && t.datum) {
          const k = t.objekt_id + '::' + t.maskin_id;
          const prev = lastDatePerMaskin.get(k);
          if (!prev || t.datum > prev) lastDatePerMaskin.set(k, t.datum);
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
        const seenSkObjIds = new Set<string>();
        for (const e of skordareEntries) {
          if (seenSkObjIds.has(e.objekt_id)) continue;
          seenSkObjIds.add(e.objekt_id);
          const p = prodAgg.get(e.objekt_id);
          if (p) { skVol += p.vol; skStammar += p.stammar; }
        }

        let stVol = 0, stCount = 0;
        const seenStObjIds = new Set<string>();
        for (const e of skotareEntries) {
          if (seenStObjIds.has(e.objekt_id)) continue;
          seenStObjIds.add(e.objekt_id);
          const l = lassAgg.get(e.objekt_id);
          if (l) { stVol += l.vol; stCount += l.count; }
        }
        if (stCount === 0 && skotareEntry) {
          const seenFb = new Set<string>();
          for (const e of skordareEntries) {
            if (seenFb.has(e.objekt_id)) continue;
            seenFb.add(e.objekt_id);
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

        // Find last activity dates
        let skLastDate: string | null = null;
        for (const e of skordareEntries) {
          const d = lastDatePerMaskin.get(e.objekt_id + '::' + e.maskin_id);
          if (d && (!skLastDate || d > skLastDate)) skLastDate = d;
        }
        let stLastDate: string | null = null;
        for (const e of skotareEntries) {
          const d = lastDatePerMaskin.get(e.objekt_id + '::' + e.maskin_id);
          if (d && (!stLastDate || d > stLastDate)) stLastDate = d;
        }

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
          grotSkotning: entries.some((e: any) => e.risskotning === true),
          externSkotning: entries.some((e: any) => {
            try { return e.ovrigt_info && JSON.parse(e.ovrigt_info).extern_skotning === true; } catch { return false; }
          }),
          externForetag: (() => {
            for (const e of entries) {
              try { const p = e.ovrigt_info && JSON.parse(e.ovrigt_info); if (p?.extern_skotning) return p.extern_foretag || ''; } catch {}
            }
            return '';
          })(),
          externPrisTyp: (() => {
            for (const e of entries) {
              try { const p = e.ovrigt_info && JSON.parse(e.ovrigt_info); if (p?.extern_skotning) return p.extern_pris_typ || 'm3'; } catch {}
            }
            return 'm3' as const;
          })(),
          externPris: (() => {
            for (const e of entries) {
              try { const p = e.ovrigt_info && JSON.parse(e.ovrigt_info); if (p?.extern_skotning) return p.extern_pris || 0; } catch {}
            }
            return 0;
          })(),
          externAntal: (() => {
            for (const e of entries) {
              try { const p = e.ovrigt_info && JSON.parse(e.ovrigt_info); if (p?.extern_skotning) return p.extern_antal || 0; } catch {}
            }
            return 0;
          })(),
          skordareLastDate: skLastDate,
          skotareLastDate: stLastDate,
        });
      });

      result.sort((a, b) => a.namn.localeCompare(b.namn, 'sv'));
      setObjekt(result);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    return objekt.filter(o => {
      if (o.status === 'avslutat' && !visaAvslutade && !oskotatFilter) return false;
      if (oskotatFilter) {
        if (o.status === 'avslutat') return false;
        const kvar = o.volymSkordare - o.volymSkotare;
        if (kvar <= 0) return false;
        if (oskotatFilter === 'grot' && !o.grotSkotning) return false;
        if (oskotatFilter !== 'grot' && o.typ !== oskotatFilter) return false;
      } else {
        if (typ === 'grot' && !o.grotSkotning) return false;
        if (typ !== 'alla' && typ !== 'grot' && o.typ !== typ) return false;
      }
      if (sok.trim()) {
        const t = sok.toLowerCase();
        if (!(o.namn.toLowerCase().includes(t) || (o.agare || '').toLowerCase().includes(t) || (o.vo_nummer || '').includes(t))) return false;
      }
      return true;
    });
  }, [objekt, typ, sok, oskotatFilter, visaAvslutade]);

  const avslutadeCount = useMemo(() => objekt.filter(o => o.status === 'avslutat').length, [objekt]);

  if (valt) {
    return <ObjektDetalj obj={valt} onBack={() => setValt(null)} />;
  }

  const order: V6StatusKey[] = ['skordare', 'skotare', 'vantar', 'pagaende', 'done'];
  const titles: Record<V6StatusKey, string> = {
    skordare: 'Skördare kör',
    skotare: 'Skotare kör',
    vantar: 'Väntar på skotning',
    pagaende: 'Övrigt pågående',
    done: 'Avslutade',
  };
  const groups: Record<V6StatusKey, UppfoljningObjekt[]> = { skordare: [], skotare: [], vantar: [], pagaende: [], done: [] };
  filtered.forEach(o => { const k = v6Status(o).k; (groups[k] || groups.pagaende).push(o); });

  const filterLabel = oskotatFilter ? ({ slutavverkning: 'Slutavverkning', gallring: 'Gallring', grot: 'Grot' } as const)[oskotatFilter] : '';

  return (
    <div style={{ position: 'fixed', top: 56, left: 0, right: 0, bottom: 0, background: bg, color: text, fontFamily: ff, WebkitFontSmoothing: 'antialiased', overflowY: 'auto' }}>
      <div style={{ maxWidth: 440, margin: '0 auto', minHeight: '100%' }}>
        <div style={{ padding: '20px 20px 8px' }}>
          <h1 style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-0.8px', margin: 0 }}>Uppföljning</h1>
        </div>
        <div style={{ padding: '8px 16px 14px' }}>
          <V6Search value={sok} onChange={setSok} />
        </div>

        {!oskotatFilter && <V6OskotatKort data={objekt} onFilter={setOskotatFilter} />}

        {oskotatFilter && (
          <div style={{ margin: '0 16px 14px', padding: '12px 16px', background: V6_CARD, borderRadius: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: V6_WARN }} />
            <span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>Oskotat · {filterLabel}</span>
            <button onClick={() => setOskotatFilter(null)} style={{ background: 'none', border: 'none', color: V6_WARN, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: V6_FF }}>Rensa</button>
          </div>
        )}

        {!oskotatFilter && (
          <div style={{ padding: '0 16px 12px' }}>
            <V6Segmented<'alla' | 'slutavverkning' | 'gallring' | 'grot'>
              value={typ}
              onChange={setTyp}
              options={[['alla', 'Alla'], ['slutavverkning', 'Slutavv.'], ['gallring', 'Gallring'], ['grot', 'Grot']]}
            />
          </div>
        )}

        <div style={{ paddingBottom: 40 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 60, color: muted, fontSize: 14 }}>Laddar...</div>
          ) : (
            <>
              {order.map(k => {
                const rows = groups[k];
                if (!rows || rows.length === 0) return null;
                return (
                  <section key={k}>
                    <V6GroupHeader title={titles[k]} count={rows.length} />
                    <div style={{ margin: '0 16px', background: V6_CARD, borderRadius: 14, overflow: 'hidden' }}>
                      {rows.map((o, i) => (
                        <V6Row key={o.skordareObjektId || o.skotareObjektId || o.vo_nummer} obj={o} onClick={() => setValt(o)} divider={i > 0} />
                      ))}
                    </div>
                  </section>
                );
              })}
              {filtered.length === 0 && (
                <div style={{ textAlign: 'center', padding: 80, color: V6_GREY, fontSize: 15 }}>Inga objekt hittades</div>
              )}

              {!oskotatFilter && avslutadeCount > 0 && (
                <div style={{ padding: '24px 16px 12px' }}>
                  <button onClick={() => setVisaAvslutade(!visaAvslutade)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: '12px 16px', background: 'transparent', border: `0.5px solid ${V6_SEP}`, borderRadius: 10, color: V6_GREY, fontSize: 13, fontWeight: 500, fontFamily: V6_FF, cursor: 'pointer' }}>
                    <span>{visaAvslutade ? 'Dölj' : 'Visa'} avslutade</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>({avslutadeCount})</span>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
