'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/* ── Design tokens matching uppfoljning-v2.tsx exactly ── */
const C = {
  bg: '#09090b', card: '#131315', card2: '#1a1a1d', border: 'rgba(255,255,255,0.06)',
  t1: '#fafafa', t2: 'rgba(255,255,255,0.7)', t3: 'rgba(255,255,255,0.45)', t4: 'rgba(255,255,255,0.2)',
  yellow: '#eab308', green: '#22c55e', orange: '#f97316', blue: '#3b82f6', red: '#ef4444', purple: '#5856d6',
};
const ff = "-apple-system,BlinkMacSystemFont,'SF Pro Display',system-ui,sans-serif";

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
  volymSkordare: number;
  stammar: number;
  skotareModell: string | null;
  skotareStart: string | null;
  skotareSlut: string | null;
  skotareObjektId: string | null;
  volymSkotare: number;
  antalLass: number;
  dieselTotal: number;
  dagar: number | null;
  status: 'pagaende' | 'avslutat';
}

interface TidData {
  arbetstid: number; // hours
  g15: number;
  g0: number;
  kortaStopp: number; // minutes
  avbrott: number;
  rast: number;
  tomgang: number;
  dieselTot: number; // liters
}

interface SortimentRow {
  namn: string;
  vol: number;
  st: number;
}

interface AvbrottRow {
  typ: string;
  tid: number; // minutes
}

interface DetailData {
  medelstam: number;
  skordare: {
    tid: TidData;
    stammar: number;
    flertradPct: number;
    sortiment: SortimentRow[];
    avbrott: AvbrottRow[];
  };
  skotare: {
    tid: TidData;
    antalLass: number;
    snittLass: number;
    skotningsAvstand: number;
    avbrott: AvbrottRow[];
  };
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
function fmtMin(m: number): string {
  const h = Math.floor(m / 60);
  const min = Math.round(m % 60);
  return `${h}:${min.toString().padStart(2, '0')}`;
}
function fmtHours(h: number): string {
  return h.toFixed(1);
}

/* ── Bar ── */
function Bar({ pct, color, height = 8 }: { pct: number; color: string; height?: number }) {
  return (
    <div style={{ height, background: 'rgba(255,255,255,0.04)', borderRadius: height / 2, overflow: 'hidden' }}>
      <div style={{ width: `${Math.min(100, Math.max(0, pct))}%`, height: '100%', background: color, borderRadius: height / 2, opacity: .65, transition: 'width 0.5s ease' }} />
    </div>
  );
}

/* ── Section (collapsible) — exact same as uppfoljning-v2.tsx ── */
function Section({ title, sub, children, defaultOpen = false }: { title: string; sub?: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginBottom: 12 }}>
      <div onClick={() => setOpen(!open)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', background: C.card, borderRadius: open ? '16px 16px 0 0' : 16, cursor: 'pointer', border: '1px solid ' + C.border, borderBottom: open ? 'none' : undefined }}>
        <div>
          <span style={{ fontSize: 15, fontWeight: 600, color: C.t1 }}>{title}</span>
          {sub && <span style={{ fontSize: 12, color: C.t3, marginLeft: 10 }}>{sub}</span>}
        </div>
        <span style={{ fontSize: 16, color: C.t4, transform: open ? 'rotate(90deg)' : '', transition: 'transform 0.2s ease' }}>›</span>
      </div>
      {open && (
        <div style={{ background: C.card, borderRadius: '0 0 16px 16px', border: '1px solid ' + C.border, borderTop: 'none', padding: '4px 20px 20px' }}>
          {children}
        </div>
      )}
    </div>
  );
}

/* ── ObjektKort — exact same design as uppfoljning-v2.tsx ── */
function ObjektKort({ obj, onClick }: { obj: UppfoljningObjekt; onClick: () => void }) {
  const kvar = obj.volymSkordare > 0 ? Math.max(0, 100 - Math.round((obj.volymSkotare / obj.volymSkordare) * 100)) : 0;
  const ej = obj.volymSkordare === 0;
  const tf = obj.typ === 'slutavverkning' ? C.yellow : C.green;

  return (
    <div onClick={onClick} style={{ background: C.card, borderRadius: 16, padding: '18px 18px', cursor: 'pointer', marginBottom: 10, border: '1px solid ' + C.border, transition: 'transform 0.1s' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: ej ? 0 : 14 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 3, height: 22, borderRadius: 2, background: tf, opacity: .6 }} />
            <div>
              <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.3px' }}>{obj.namn}</div>
              <div style={{ fontSize: 12, color: C.t3, marginTop: 3 }}>
                {obj.agare}
                {obj.vo_nummer && <span style={{ marginLeft: 8, padding: '2px 8px', background: 'rgba(255,255,255,0.04)', borderRadius: 5, fontSize: 10, fontWeight: 500 }}>VO {obj.vo_nummer}</span>}
              </div>
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          {!ej && <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.5px' }}>{Math.round(obj.volymSkordare)}<span style={{ fontSize: 11, fontWeight: 400, color: C.t3 }}> m³</span></div>}
          <span style={{ fontSize: 10, fontWeight: 500, color: tf, padding: '2px 10px', background: tf + '15', borderRadius: 6 }}>
            {obj.typ === 'slutavverkning' ? 'Slutavv.' : 'Gallring'}
          </span>
        </div>
      </div>

      {ej ? (
        <div style={{ marginTop: 10, fontSize: 12, color: C.t3 }}>Ej startad{obj.areal > 0 ? ` · ${obj.areal} ha` : ''}</div>
      ) : (
        <div>
          {/* Maskin-rader */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
              <span style={{ fontSize: 10, color: C.t3 }}>Skördare</span>
              <span style={{ fontSize: 10, color: C.t2, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right' }}>
                {obj.skordareModell ? obj.skordareModell.split(' ').slice(-2).join(' ') : '—'}
              </span>
              <span style={{ fontSize: 9, fontWeight: 600, color: obj.skordareSlut ? C.t3 : C.green, whiteSpace: 'nowrap' }}>
                {obj.skordareSlut ? 'Klar' : 'Pågår'}
              </span>
            </div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
              <span style={{ fontSize: 10, color: C.t3 }}>Skotare</span>
              <span style={{ fontSize: 10, color: C.t2, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right' }}>
                {obj.skotareModell ? obj.skotareModell.split(' ').slice(-2).join(' ') : '—'}
              </span>
              <span style={{ fontSize: 9, fontWeight: 600, color: obj.volymSkotare > 0 && !obj.skotareSlut ? C.green : obj.skotareSlut ? C.t3 : obj.skotareModell ? C.orange : C.t4, whiteSpace: 'nowrap' }}>
                {obj.skotareSlut ? 'Klar' : obj.volymSkotare > 0 ? 'Pågår' : obj.skotareModell ? 'Väntar' : '—'}
              </span>
            </div>
          </div>

          {/* Progress */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                <span style={{ fontSize: 11, color: C.t3 }}>
                  {obj.areal > 0 ? `${obj.areal} ha` : ''}
                  {obj.areal > 0 && obj.dagar !== null ? ' · ' : ''}
                  {obj.dagar !== null ? `${obj.dagar} dagar` : ''}
                </span>
                <span style={{ fontSize: 11, color: kvar > 30 ? C.orange : C.green, fontWeight: 600 }}>{kvar}% kvar i skogen</span>
              </div>
              <Bar pct={100 - kvar} color={kvar > 30 ? C.orange : C.green} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Compute TidData from fakt_tid rows ── */
function computeTid(rows: any[]): TidData {
  let processing = 0, terrain = 0, otherWork = 0, maintenance = 0, disturbance = 0, rast = 0, kortStopp = 0, diesel = 0;
  rows.forEach(r => {
    processing += r.processing_sek || 0;
    terrain += r.terrain_sek || 0;
    otherWork += r.other_work_sek || 0;
    maintenance += r.maintenance_sek || 0;
    disturbance += r.disturbance_sek || 0;
    rast += r.rast_sek || 0;
    kortStopp += r.kort_stopp_sek || 0;
    diesel += r.bransle_liter || 0;
  });
  const g0 = (processing + terrain + otherWork) / 3600;
  const g15 = (processing + terrain + otherWork + kortStopp) / 3600;
  const arbetstid = (processing + terrain + otherWork + kortStopp + maintenance + disturbance + rast) / 3600;
  return {
    arbetstid,
    g15,
    g0,
    kortaStopp: kortStopp / 60,
    avbrott: (maintenance + disturbance) / 60,
    rast: rast / 60,
    tomgang: 0, // not tracked in fakt_tid
    dieselTot: diesel,
  };
}

/* ── ObjektDetalj — full detail view with real Supabase data ── */
function ObjektDetalj({ obj, onBack }: { obj: UppfoljningObjekt; onBack: () => void }) {
  const [detalj, setDetalj] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const skId = obj.skordareObjektId;
      const stId = obj.skotareObjektId;
      const ids = [skId, stId].filter(Boolean) as string[];
      if (ids.length === 0) { setLoading(false); return; }

      // Fetch all detail data in parallel
      const [tidRes, prodRes, sortRes, dimSortRes, avbrottRes, lassRes] = await Promise.all([
        supabase.from('fakt_tid').select('objekt_id, processing_sek, terrain_sek, other_work_sek, maintenance_sek, disturbance_sek, rast_sek, kort_stopp_sek, bransle_liter').in('objekt_id', ids),
        supabase.from('fakt_produktion').select('objekt_id, volym_m3sub, stammar, processtyp').in('objekt_id', ids),
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

      // Sortiment lookup
      const sortMap = new Map<string, string>();
      dimSort.forEach((s: any) => sortMap.set(s.sortiment_id, s.namn));

      // Split tid by machine
      const skTidRows = skId ? tidRows.filter((r: any) => r.objekt_id === skId) : [];
      const stTidRows = stId ? tidRows.filter((r: any) => r.objekt_id === stId) : [];
      const skTid = computeTid(skTidRows);
      const stTid = computeTid(stTidRows);

      // Skördare produktion
      const skProd = skId ? prodRows.filter((r: any) => r.objekt_id === skId) : [];
      let totalStammar = 0, mthStammar = 0, totalVol = 0;
      skProd.forEach((p: any) => {
        totalStammar += p.stammar || 0;
        totalVol += p.volym_m3sub || 0;
        if (p.processtyp === 'MTH') mthStammar += p.stammar || 0;
      });
      const flertradPct = totalStammar > 0 ? Math.round((mthStammar / totalStammar) * 100) : 0;
      const medelstam = totalStammar > 0 ? totalVol / totalStammar : 0;

      // Sortiment for skördare
      const skSort = skId ? sortRows.filter((r: any) => r.objekt_id === skId) : [];
      const sortAgg = new Map<string, { vol: number; st: number }>();
      skSort.forEach((r: any) => {
        const namn = sortMap.get(r.sortiment_id) || r.sortiment_id || 'Övrigt';
        const prev = sortAgg.get(namn) || { vol: 0, st: 0 };
        prev.vol += r.volym_m3sub || 0;
        prev.st += r.antal || 0;
        sortAgg.set(namn, prev);
      });
      const sortiment: SortimentRow[] = Array.from(sortAgg.entries())
        .map(([namn, d]) => ({ namn, vol: Math.round(d.vol), st: Math.round(d.st) }))
        .sort((a, b) => b.vol - a.vol);

      // Avbrott per machine
      const skAvbrott = skId ? avbrottRows.filter((r: any) => r.objekt_id === skId) : [];
      const stAvbrott = stId ? avbrottRows.filter((r: any) => r.objekt_id === stId) : [];
      const aggAvbrott = (rows: any[]): AvbrottRow[] => {
        const m = new Map<string, number>();
        rows.forEach(r => { m.set(r.typ || 'Övrigt', (m.get(r.typ || 'Övrigt') || 0) + (r.tid_sek || 0)); });
        return Array.from(m.entries()).map(([typ, sek]) => ({ typ, tid: Math.round(sek / 60) })).sort((a, b) => b.tid - a.tid);
      };

      // Skotare lass data
      let totalLassVol = 0, totalKorstracka = 0;
      lassRows.forEach((l: any) => {
        totalLassVol += l.volym_m3sob || 0;
        totalKorstracka += l.korstracka_m || 0;
      });
      const antalLass = lassRows.length;
      const snittLass = antalLass > 0 ? totalLassVol / antalLass : 0;
      const skotningsAvstand = antalLass > 0 ? totalKorstracka / antalLass : 0;

      setDetalj({
        medelstam,
        skordare: {
          tid: skTid,
          stammar: totalStammar,
          flertradPct,
          sortiment,
          avbrott: aggAvbrott(skAvbrott),
        },
        skotare: {
          tid: stTid,
          antalLass,
          snittLass,
          skotningsAvstand,
          avbrott: aggAvbrott(stAvbrott),
        },
      });
      setLoading(false);
    })();
  }, [obj.skordareObjektId, obj.skotareObjektId]);

  const tf = obj.typ === 'slutavverkning' ? C.yellow : C.green;
  const framkort = obj.volymSkordare > 0 ? Math.round((obj.volymSkotare / obj.volymSkordare) * 100) : 0;
  const kvar = Math.max(0, 100 - framkort);
  const skDagar = daysBetweenNull(obj.skordareStart, obj.skordareSlut);
  const stDagar = daysBetweenNull(obj.skotareStart, obj.skotareSlut);
  const glapp = daysBetweenNull(obj.skordareSlut, obj.skotareStart);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, color: C.t1, fontFamily: ff, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: C.t3, fontSize: 15 }}>Laddar detaljer...</div>
      </div>
    );
  }

  const d = detalj;
  const skG15 = d?.skordare.tid.g15 || 0;
  const stG15 = d?.skotare.tid.g15 || 0;
  const skArbetstid = d?.skordare.tid.arbetstid || 0;
  const stArbetstid = d?.skotare.tid.arbetstid || 0;
  const produktivSk = skArbetstid > 0 ? Math.round((skG15 / skArbetstid) * 100) : 0;
  const produktivSt = stArbetstid > 0 ? Math.round((stG15 / stArbetstid) * 100) : 0;
  const dieselPerM3Sk = obj.volymSkordare > 0 && d ? (d.skordare.tid.dieselTot / obj.volymSkordare) : 0;
  const dieselPerM3St = obj.volymSkotare > 0 && d ? (d.skotare.tid.dieselTot / obj.volymSkotare) : 0;
  const dieselPerTimSk = skG15 > 0 && d ? (d.skordare.tid.dieselTot / skG15) : 0;
  const dieselPerG15St = stG15 > 0 && d ? (d.skotare.tid.dieselTot / stG15) : 0;
  const stamPerG15 = skG15 > 0 && d ? (d.skordare.stammar / skG15) : 0;
  const m3PerG15Sk = skG15 > 0 ? (obj.volymSkordare / skG15) : 0;
  const m3PerG15St = stG15 > 0 ? (obj.volymSkotare / stG15) : 0;
  const lassPerG15 = stG15 > 0 && d ? (d.skotare.antalLass / stG15) : 0;
  const sortTotVol = d?.skordare.sortiment.reduce((a, s) => a + s.vol, 0) || 0;
  const sagbart = sortTotVol > 0 && d ? Math.round((d.skordare.sortiment.filter(s => s.namn.toLowerCase().includes('timmer')).reduce((a, s) => a + s.vol, 0) / sortTotVol) * 100) : 0;

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.t1, fontFamily: ff, WebkitFontSmoothing: 'antialiased' }}>
      {/* Header */}
      <div style={{ padding: '14px 20px 20px', background: C.card }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: C.blue, fontSize: 15, cursor: 'pointer', padding: 0, marginBottom: 16, fontFamily: ff, fontWeight: 500 }}>‹ Tillbaka</button>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.5px', marginBottom: 6 }}>{obj.namn}</div>
          <div style={{ fontSize: 14, color: C.t2 }}>
            {obj.agare}{obj.areal > 0 ? ` · ${obj.areal} ha` : ''}
            <span style={{ marginLeft: 10, padding: '3px 12px', borderRadius: 12, fontSize: 12, fontWeight: 500, background: tf + '15', color: tf }}>
              {obj.typ === 'slutavverkning' ? 'Slutavverkning' : 'Gallring'}
            </span>
          </div>
          {obj.vo_nummer && (
            <div style={{ fontSize: 11, color: C.t3, marginTop: 8 }}>
              VO {obj.vo_nummer}
            </div>
          )}
        </div>

        {/* Maskiner med datum */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ padding: '12px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: C.blue }} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.t1 }}>{obj.skordareModell || 'Ej tilldelad'}</div>
                <div style={{ fontSize: 10, color: C.t3, marginTop: 2 }}>Skördare</div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              {obj.skordareStart ? (
                <>
                  <div style={{ fontSize: 12, color: C.t2 }}>{fmtDate(obj.skordareStart)} → {obj.skordareSlut ? fmtDate(obj.skordareSlut) : 'pågår'}</div>
                  {skDagar !== null && <div style={{ fontSize: 10, color: C.t3, marginTop: 2 }}>{skDagar} dagar</div>}
                </>
              ) : (
                <div style={{ fontSize: 12, color: C.t4 }}>Ej startad</div>
              )}
            </div>
          </div>

          {/* Glapp-indikator */}
          {glapp !== null && glapp > 0 && (
            <div style={{ textAlign: 'center', padding: '4px 0' }}>
              <span style={{ fontSize: 10, color: glapp > 7 ? C.orange : C.t3 }}>{glapp} dagar mellanrum</span>
            </div>
          )}
          {obj.skotareStart && glapp !== null && glapp <= 0 && (
            <div style={{ textAlign: 'center', padding: '4px 0' }}>
              <span style={{ fontSize: 10, color: C.green }}>Parallellkörning</span>
            </div>
          )}

          <div style={{ padding: '12px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: C.green }} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.t1 }}>{obj.skotareModell || 'Ej tilldelad'}</div>
                <div style={{ fontSize: 10, color: C.t3, marginTop: 2 }}>Skotare</div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              {obj.skotareStart ? (
                <>
                  <div style={{ fontSize: 12, color: C.t2 }}>{fmtDate(obj.skotareStart)} → {obj.skotareSlut ? fmtDate(obj.skotareSlut) : 'pågår'}</div>
                  {stDagar !== null && <div style={{ fontSize: 10, color: C.t3, marginTop: 2 }}>{stDagar} dagar</div>}
                </>
              ) : (
                <div style={{ fontSize: 12, color: C.t4 }}>Väntar</div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: '16px 16px 120px' }}>

        {/* Stora nyckeltal */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1, background: C.card, borderRadius: 16, padding: '24px 16px', textAlign: 'center', border: '1px solid ' + C.border }}>
            <div style={{ fontSize: 10, color: C.t3, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Skördat</div>
            <div style={{ fontSize: 42, fontWeight: 700, letterSpacing: '-1px', lineHeight: 1 }}>{Math.round(obj.volymSkordare)}</div>
            <div style={{ fontSize: 13, color: C.t3, marginTop: 4 }}>m³</div>
          </div>
          <div style={{ flex: 1, background: C.card, borderRadius: 16, padding: '24px 16px', textAlign: 'center', border: '1px solid ' + C.border }}>
            <div style={{ fontSize: 10, color: C.t3, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Skotat</div>
            <div style={{ fontSize: 42, fontWeight: 700, letterSpacing: '-1px', lineHeight: 1 }}>{Math.round(obj.volymSkotare)}</div>
            <div style={{ fontSize: 13, color: C.t3, marginTop: 4 }}>m³</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <div style={{ flex: 1, background: C.card, borderRadius: 16, padding: '18px 16px', textAlign: 'center', border: '1px solid ' + C.border }}>
            <div style={{ fontSize: 10, color: C.t3, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Medelstam</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{d ? d.medelstam.toFixed(2) : '–'}<span style={{ fontSize: 12, fontWeight: 400, color: C.t3 }}> m³fub</span></div>
          </div>
          <div style={{ flex: 1, background: C.card, borderRadius: 16, padding: '18px 16px', textAlign: 'center', border: '1px solid ' + C.border }}>
            <div style={{ fontSize: 10, color: C.t3, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Volym/ha</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{obj.areal > 0 ? (obj.volymSkordare / obj.areal).toFixed(0) : '–'}<span style={{ fontSize: 12, fontWeight: 400, color: C.t3 }}> m³</span></div>
          </div>
        </div>

        {/* Kvar i skogen */}
        <div style={{ background: C.card, borderRadius: 16, padding: '20px 20px', marginBottom: 16, border: '1px solid ' + C.border }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
            <span style={{ fontSize: 14, fontWeight: 500, color: C.t2 }}>Kvar i skogen</span>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: 28, fontWeight: 700, color: kvar > 30 ? C.orange : C.green }}>{kvar}%</span>
            </div>
          </div>
          <Bar pct={kvar} color={kvar > 30 ? C.orange : C.green} height={10} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: C.t3, marginTop: 8 }}>
            <span>Skotat {Math.round(obj.volymSkotare)} m³</span>
            <span>Kvar ~{Math.round(Math.max(0, obj.volymSkordare - obj.volymSkotare))} m³</span>
          </div>
        </div>

        {/* Diesel fritt bilväg */}
        {d && (d.skordare.tid.dieselTot > 0 || d.skotare.tid.dieselTot > 0) && (
          <div style={{ background: C.card, borderRadius: 16, padding: '24px 20px', marginBottom: 16, border: '1px solid ' + C.border, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: C.t3, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Diesel fritt bilväg</div>
            <div style={{ fontSize: 36, fontWeight: 700, letterSpacing: '-1px' }}>
              {(dieselPerM3Sk + dieselPerM3St).toFixed(2)}
              <span style={{ fontSize: 14, fontWeight: 400, color: C.t3 }}> L/m³fub</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 12, fontSize: 12, color: C.t3 }}>
              <span><span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: C.blue, marginRight: 6 }} />Skördare {dieselPerM3Sk.toFixed(2)} L</span>
              <span><span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: C.green, marginRight: 6 }} />Skotare {dieselPerM3St.toFixed(2)} L</span>
            </div>
          </div>
        )}

        {/* Tidsbalans */}
        {d && (skG15 > 0 || stG15 > 0) && (
          <Section title="Tidsbalans" defaultOpen={true}>
            <div style={{ marginTop: 8 }} />
            <div style={{ display: 'flex', height: 36, borderRadius: 10, overflow: 'hidden', marginBottom: 12 }}>
              {skG15 > 0 && (
                <div style={{ background: C.blue, width: `${(skG15 / (skG15 + stG15)) * 100}%`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13, fontWeight: 600 }}>{fmtHours(skG15)}h</div>
              )}
              {stG15 > 0 && (
                <div style={{ background: C.green, width: `${(stG15 / (skG15 + stG15)) * 100}%`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13, fontWeight: 600 }}>{fmtHours(stG15)}h</div>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 24, fontSize: 11, color: C.t3, marginBottom: 10 }}>
              <span><span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: C.blue, marginRight: 5 }} />Skördare · {obj.skordareModell ? obj.skordareModell.split(' ').slice(-2).join(' ') : '–'}</span>
              <span><span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: C.green, marginRight: 5 }} />Skotare · {obj.skotareModell ? obj.skotareModell.split(' ').slice(-2).join(' ') : '–'}</span>
            </div>
            {skG15 > 0 && stG15 > 0 && stG15 < skG15 && (
              <div style={{ textAlign: 'center', fontSize: 13, color: C.green, fontWeight: 500 }}>
                Skotare {Math.round((1 - (stG15 / skG15)) * 100)}% snabbare
              </div>
            )}
            {skG15 > 0 && stG15 > 0 && stG15 >= skG15 && (
              <div style={{ textAlign: 'center', fontSize: 13, color: C.orange, fontWeight: 500 }}>
                Skotare {Math.round(((stG15 / skG15) - 1) * 100)}% långsammare
              </div>
            )}
          </Section>
        )}

        {/* ── SKÖRDARE ── */}
        {d && skG15 > 0 && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '24px 0 12px', paddingLeft: 4 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: C.blue }} />
              <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.3px' }}>Skördare</span>
              <span style={{ fontSize: 12, color: C.t3 }}>{obj.skordareModell ? obj.skordareModell.split(' ').slice(-2).join(' ') : ''}</span>
            </div>

            <Section title="Tid" sub={`${produktivSk}% produktiv`}>
              <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 8, marginBottom: 20 }}>
                {[{ l: 'Arbetstid', v: fmtHours(skArbetstid) }, { l: 'G15', v: fmtHours(skG15) }, { l: 'G0', v: fmtHours(d.skordare.tid.g0) }].map((t, i) => (
                  <div key={i} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.5px' }}>{t.v}</div>
                    <div style={{ fontSize: 12, color: C.t3, marginTop: 4 }}>{t.l}</div>
                  </div>
                ))}
              </div>
              <div style={{ height: 1, background: C.border, margin: '0 0 16px' }} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
                {[
                  { l: 'Korta stopp', v: fmtMin(d.skordare.tid.kortaStopp) },
                  { l: 'Avbrott', v: fmtMin(d.skordare.tid.avbrott) },
                  { l: 'Rast', v: fmtMin(d.skordare.tid.rast) },
                  { l: 'Tomgång', v: fmtMin(d.skordare.tid.tomgang) },
                ].map((t, i) => (
                  <div key={i} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: C.t3, marginBottom: 4 }}>{t.l}</div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{t.v}</div>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="Produktion" sub={`${d.skordare.flertradPct}% flerträd`}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginTop: 8 }}>
                {[
                  { l: 'Stammar/G15', v: stamPerG15.toFixed(1) },
                  { l: 'm³/G15', v: m3PerG15Sk.toFixed(1) },
                  { l: 'Stammar', v: d.skordare.stammar },
                ].map((p, i) => (
                  <div key={i}>
                    <div style={{ fontSize: 11, color: C.t3, marginBottom: 6 }}>{p.l}</div>
                    <div style={{ fontSize: 20, fontWeight: 700 }}>{p.v}</div>
                  </div>
                ))}
              </div>
            </Section>

            {d.skordare.sortiment.length > 0 && (
              <Section title="Sortiment" sub={`${sagbart}% sågbart`}>
                <div style={{ marginTop: 4 }}>
                  {d.skordare.sortiment.map((s, i) => {
                    const pct = sortTotVol > 0 ? Math.round((s.vol / sortTotVol) * 100) : 0;
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '12px 0', borderBottom: i < d.skordare.sortiment.length - 1 ? '1px solid ' + C.border : 'none' }}>
                        <span style={{ fontSize: 14, fontWeight: 500, color: C.t2, flex: 1 }}>{s.namn}</span>
                        <span style={{ fontSize: 12, color: C.t3, minWidth: 35, textAlign: 'right', marginRight: 12 }}>{pct}%</span>
                        <span style={{ fontSize: 14, fontWeight: 600, minWidth: 60, textAlign: 'right' }}>{s.vol} m³</span>
                        <span style={{ fontSize: 12, color: C.t3, minWidth: 45, textAlign: 'right', marginLeft: 8 }}>{s.st} st</span>
                      </div>
                    );
                  })}
                </div>
              </Section>
            )}

            <Section title="Diesel" sub={`${dieselPerM3Sk.toFixed(2)} L/m³`}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginTop: 8 }}>
                {[
                  { l: 'Totalt', v: Math.round(d.skordare.tid.dieselTot), s: 'L' },
                  { l: 'Per m³fub', v: dieselPerM3Sk.toFixed(2), s: 'L' },
                  { l: 'Per timme', v: dieselPerTimSk.toFixed(2), s: 'L' },
                ].map((x, i) => (
                  <div key={i}>
                    <div style={{ fontSize: 11, color: C.t3, marginBottom: 6 }}>{x.l}</div>
                    <div style={{ fontSize: 20, fontWeight: 700 }}>{x.v} <span style={{ fontSize: 12, color: C.t3, fontWeight: 400 }}>{x.s}</span></div>
                  </div>
                ))}
              </div>
            </Section>

            {d.skordare.avbrott.length > 0 && (
              <Section title="Avbrott & stillestånd">
                <div style={{ marginTop: 4 }}>
                  {d.skordare.avbrott.map((a, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: i < d.skordare.avbrott.length - 1 ? '1px solid ' + C.border : 'none' }}>
                      <span style={{ fontSize: 14, color: C.t2 }}>{a.typ}</span>
                      <span style={{ fontSize: 14, fontWeight: 600, color: C.orange }}>{fmtMin(a.tid)}</span>
                    </div>
                  ))}
                </div>
              </Section>
            )}
          </>
        )}

        {/* ── SKOTARE ── */}
        {d && stG15 > 0 && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '24px 0 12px', paddingLeft: 4 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: C.green }} />
              <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.3px' }}>Skotare</span>
              <span style={{ fontSize: 12, color: C.t3 }}>{obj.skotareModell ? obj.skotareModell.split(' ').slice(-2).join(' ') : ''}</span>
            </div>

            <Section title="Tid" sub={`${produktivSt}% produktiv`}>
              <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 8, marginBottom: 20 }}>
                {[{ l: 'Arbetstid', v: fmtHours(stArbetstid) }, { l: 'G15', v: fmtHours(stG15) }, { l: 'G0', v: fmtHours(d.skotare.tid.g0) }].map((t, i) => (
                  <div key={i} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.5px' }}>{t.v}</div>
                    <div style={{ fontSize: 12, color: C.t3, marginTop: 4 }}>{t.l}</div>
                  </div>
                ))}
              </div>
              <div style={{ height: 1, background: C.border, margin: '0 0 16px' }} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
                {[
                  { l: 'Korta stopp', v: fmtMin(d.skotare.tid.kortaStopp) },
                  { l: 'Avbrott', v: fmtMin(d.skotare.tid.avbrott) },
                  { l: 'Rast', v: fmtMin(d.skotare.tid.rast) },
                  { l: 'Tomgång', v: fmtMin(d.skotare.tid.tomgang) },
                ].map((t, i) => (
                  <div key={i} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: C.t3, marginBottom: 4 }}>{t.l}</div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{t.v}</div>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="Produktion">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '20px 16px', marginTop: 8 }}>
                {[
                  { l: 'Antal lass', v: d.skotare.antalLass, s: '' },
                  { l: 'Snitt lass', v: d.skotare.snittLass.toFixed(1), s: 'm³' },
                  { l: 'Lass/G15', v: lassPerG15.toFixed(2), s: '' },
                  { l: 'm³/G15', v: m3PerG15St.toFixed(1), s: '' },
                  { l: 'Skotningsavst.', v: Math.round(d.skotare.skotningsAvstand), s: 'm' },
                ].map((p, i) => (
                  <div key={i}>
                    <div style={{ fontSize: 11, color: C.t3, marginBottom: 6 }}>{p.l}</div>
                    <div style={{ fontSize: 20, fontWeight: 700 }}>{p.v} <span style={{ fontSize: 12, color: C.t3, fontWeight: 400 }}>{p.s}</span></div>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="Diesel" sub={`${dieselPerM3St.toFixed(2)} L/m³`}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginTop: 8 }}>
                {[
                  { l: 'Totalt', v: Math.round(d.skotare.tid.dieselTot), s: 'L' },
                  { l: 'Per m³fub', v: dieselPerM3St.toFixed(2), s: 'L' },
                  { l: 'Per G15', v: dieselPerG15St.toFixed(2), s: 'L' },
                ].map((x, i) => (
                  <div key={i}>
                    <div style={{ fontSize: 11, color: C.t3, marginBottom: 6 }}>{x.l}</div>
                    <div style={{ fontSize: 20, fontWeight: 700 }}>{x.v} <span style={{ fontSize: 12, color: C.t3, fontWeight: 400 }}>{x.s}</span></div>
                  </div>
                ))}
              </div>
            </Section>

            {d.skotare.avbrott.length > 0 && (
              <Section title="Avbrott & stillestånd">
                <div style={{ marginTop: 4 }}>
                  {d.skotare.avbrott.map((a, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: i < d.skotare.avbrott.length - 1 ? '1px solid ' + C.border : 'none' }}>
                      <span style={{ fontSize: 14, color: C.t2 }}>{a.typ}</span>
                      <span style={{ fontSize: 14, fontWeight: 600, color: C.orange }}>{fmtMin(a.tid)}</span>
                    </div>
                  ))}
                </div>
              </Section>
            )}
          </>
        )}

        {/* No data fallback */}
        {(!d || (skG15 === 0 && stG15 === 0)) && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: C.t3 }}>
            <div style={{ fontSize: 15, marginBottom: 8 }}>Ingen detaljerad tiddata tillgänglig</div>
            <div style={{ fontSize: 12 }}>Produktionsdata visas när tidsrapporter finns i systemet</div>
          </div>
        )}
      </div>
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
  const [flik, setFlik] = useState<'pagaende' | 'avslutat'>('pagaende');
  const [filter, setFilter] = useState<'alla' | 'slutavverkning' | 'gallring'>('alla');
  const [sok, setSok] = useState('');
  const [valt, setValt] = useState<UppfoljningObjekt | null>(null);

  useEffect(() => {
    (async () => {
      // Fetch all data in parallel
      const [dimObjektRes, dimMaskinRes, produktionRes, lassRes, tidRes, objektTblRes] = await Promise.all([
        supabase.from('dim_objekt').select('*'),
        supabase.from('dim_maskin').select('*'),
        supabase.from('fakt_produktion').select('objekt_id, volym_m3sub, stammar').limit(50000),
        supabase.from('fakt_lass').select('objekt_id, volym_m3sob').limit(50000),
        supabase.from('fakt_tid').select('objekt_id, bransle_liter').limit(50000),
        supabase.from('objekt').select('vo_nummer, markagare, areal, typ'),
      ]);

      const dimObjekt: any[] = dimObjektRes.data || [];
      const dimMaskin: any[] = dimMaskinRes.data || [];
      const produktion: any[] = produktionRes.data || [];
      const lass: any[] = lassRes.data || [];
      const tid: any[] = tidRes.data || [];
      const objektTbl: any[] = objektTblRes.data || [];

      // Maskin lookup
      const maskinMap = new Map<string, any>();
      dimMaskin.forEach(m => maskinMap.set(m.maskin_id, m));

      // Objekt-table lookup by vo_nummer (for areal, markagare, typ)
      const objektInfo = new Map<string, { agare: string; areal: number; typ: string }>();
      objektTbl.forEach(o => {
        if (o.vo_nummer) {
          objektInfo.set(o.vo_nummer, { agare: o.markagare || '', areal: o.areal || 0, typ: o.typ || '' });
        }
      });

      // Aggregate fakt_produktion per objekt_id
      const prodAgg = new Map<string, { vol: number; stammar: number }>();
      produktion.forEach(p => {
        const key = p.objekt_id;
        const prev = prodAgg.get(key) || { vol: 0, stammar: 0 };
        prev.vol += (p.volym_m3sub || 0);
        prev.stammar += (p.stammar || 0);
        prodAgg.set(key, prev);
      });

      // Aggregate fakt_lass per objekt_id
      const lassAgg = new Map<string, { vol: number; count: number }>();
      lass.forEach(l => {
        const key = l.objekt_id;
        const prev = lassAgg.get(key) || { vol: 0, count: 0 };
        prev.vol += (l.volym_m3sob || 0);
        prev.count += 1;
        lassAgg.set(key, prev);
      });

      // Aggregate fakt_tid per objekt_id
      const tidAgg = new Map<string, number>();
      tid.forEach(t => {
        const key = t.objekt_id;
        tidAgg.set(key, (tidAgg.get(key) || 0) + (t.bransle_liter || 0));
      });

      // Group dim_objekt by vo_nummer (or objekt_id if no vo_nummer)
      const voGroups = new Map<string, any[]>();
      dimObjekt.forEach(d => {
        if (d.exkludera) return; // skip excluded objects
        const key = d.vo_nummer || d.objekt_id;
        if (!key) return;
        const arr = voGroups.get(key) || [];
        arr.push(d);
        voGroups.set(key, arr);
      });

      // Build UppfoljningObjekt for each VO group
      const result: UppfoljningObjekt[] = [];

      voGroups.forEach((entries, key) => {
        let skordareEntry: any = null;
        let skotareEntry: any = null;

        // Determine skördare/skotare per entry via maskin_id → dim_maskin
        for (const e of entries) {
          const maskin = maskinMap.get(e.maskin_id);
          const mType = getMachineType(maskin);
          if (mType === 'skordare' && !skordareEntry) skordareEntry = e;
          else if (mType === 'skotare' && !skotareEntry) skotareEntry = e;
        }

        // Fallback: if machine type unknown, use production data to infer
        if (!skordareEntry && !skotareEntry) {
          for (const e of entries) {
            if (!skordareEntry && prodAgg.has(e.objekt_id)) { skordareEntry = e; continue; }
            if (!skotareEntry && lassAgg.has(e.objekt_id)) { skotareEntry = e; continue; }
          }
        }
        // If still nothing assigned, put first as skördare
        if (!skordareEntry && !skotareEntry && entries.length > 0) {
          skordareEntry = entries[0];
          if (entries.length > 1) skotareEntry = entries[1];
        }

        // Name & metadata
        const firstEntry = entries[0];
        const vo = firstEntry.vo_nummer || '';
        const namn = firstEntry.object_name || firstEntry.objektnamn || vo || key;
        const info = objektInfo.get(vo);

        // Owner: try dim_objekt.skogsagare/bolag, then objekt table
        const agare = firstEntry.skogsagare || firstEntry.bolag || info?.agare || '';
        const areal = info?.areal || 0;
        const typ = inferType(firstEntry.huvudtyp || info?.typ);

        // Volumes
        const skProd = skordareEntry ? prodAgg.get(skordareEntry.objekt_id) : null;
        const stLass = skotareEntry ? lassAgg.get(skotareEntry.objekt_id) : null;

        // Diesel
        const skDiesel = skordareEntry ? (tidAgg.get(skordareEntry.objekt_id) || 0) : 0;
        const stDiesel = skotareEntry ? (tidAgg.get(skotareEntry.objekt_id) || 0) : 0;

        // Dates
        const skStart = skordareEntry?.start_date || null;
        const skSlut = skordareEntry?.end_date || skordareEntry?.skordning_avslutad || null;
        const stStart = skotareEntry?.start_date || null;
        const stSlut = skotareEntry?.end_date || skotareEntry?.skotning_avslutad || null;

        // Status: avslutat if ALL entries have an end date
        const allDone = entries.every((e: any) => e.end_date || e.skordning_avslutad || e.skotning_avslutad);

        // Days: from earliest start to now (pågående) or to latest end (avslutad)
        const earliestStart = [skStart, stStart].filter(Boolean).sort()[0] || null;
        const latestEnd = [skSlut, stSlut].filter(Boolean).sort().reverse()[0] || null;
        let dagar: number | null = null;
        if (earliestStart) {
          dagar = allDone && latestEnd ? daysBetween(earliestStart, latestEnd) : daysSince(earliestStart);
        }

        result.push({
          vo_nummer: vo,
          namn,
          typ,
          agare,
          areal,
          skordareModell: skordareEntry ? getMachineLabel(maskinMap.get(skordareEntry.maskin_id)) : null,
          skordareStart: skStart,
          skordareSlut: skSlut,
          skordareObjektId: skordareEntry?.objekt_id || null,
          volymSkordare: skProd?.vol || 0,
          stammar: skProd?.stammar || 0,
          skotareModell: skotareEntry ? getMachineLabel(maskinMap.get(skotareEntry.maskin_id)) : null,
          skotareStart: stStart,
          skotareSlut: stSlut,
          skotareObjektId: skotareEntry?.objekt_id || null,
          volymSkotare: stLass?.vol || 0,
          antalLass: stLass?.count || 0,
          dieselTotal: skDiesel + stDiesel,
          dagar,
          status: allDone ? 'avslutat' : 'pagaende',
        });
      });

      result.sort((a, b) => a.namn.localeCompare(b.namn, 'sv'));
      setObjekt(result);
      setLoading(false);
    })();
  }, []);

  const lista = useMemo(() => {
    return objekt
      .filter(o => o.status === flik)
      .filter(o => filter === 'alla' || o.typ === filter)
      .filter(o => {
        if (!sok.trim()) return true;
        const t = sok.toLowerCase();
        return o.namn.toLowerCase().includes(t) || o.agare.toLowerCase().includes(t) || o.vo_nummer?.includes(t);
      });
  }, [objekt, flik, filter, sok]);

  // Detail view
  if (valt) {
    return <ObjektDetalj obj={valt} onBack={() => setValt(null)} />;
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.t1, fontFamily: ff, WebkitFontSmoothing: 'antialiased' }}>
      <div style={{ padding: '24px 20px 0' }}>
        <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.5px', marginBottom: 20 }}>Uppföljning</div>

        {/* Sök */}
        <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: '12px 16px', gap: 10, marginBottom: 16 }}>
          <span style={{ fontSize: 16, color: C.t3 }}>⌕</span>
          <input
            type="text"
            placeholder="Sök objekt, ägare, VO..."
            value={sok}
            onChange={e => setSok(e.target.value)}
            style={{ flex: 1, border: 'none', background: 'none', fontSize: 16, color: C.t1, outline: 'none', fontFamily: ff }}
          />
          {sok && <button onClick={() => setSok('')} style={{ background: C.t3, border: 'none', color: C.bg, width: 20, height: 20, borderRadius: '50%', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>}
        </div>

        {/* Flikar */}
        <div style={{ display: 'flex', gap: 28, borderBottom: '1px solid ' + C.border, marginBottom: 14 }}>
          {(['pagaende', 'avslutat'] as const).map(f => (
            <button key={f} onClick={() => setFlik(f)} style={{
              padding: '12px 0', border: 'none', background: 'none', fontSize: 15, fontWeight: 500,
              color: flik === f ? C.t1 : C.t3, cursor: 'pointer',
              borderBottom: flik === f ? '2px solid ' + C.t1 : '2px solid transparent',
              marginBottom: -1, fontFamily: ff,
            }}>
              {f === 'pagaende' ? 'Pågående' : 'Avslutade'}
            </button>
          ))}
        </div>

        {/* Filter */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {[{ k: 'alla', l: 'Alla' }, { k: 'slutavverkning', l: 'Slutavverkning' }, { k: 'gallring', l: 'Gallring' }].map(f => (
            <button key={f.k} onClick={() => setFilter(f.k as any)} style={{
              padding: '9px 18px', borderRadius: 22, border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer',
              background: filter === f.k ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.03)',
              color: filter === f.k ? C.t1 : C.t3, fontFamily: ff,
            }}>{f.l}</button>
          ))}
        </div>
      </div>

      {/* Lista */}
      <div style={{ padding: '0 16px 120px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: C.t3 }}>
            <div style={{ fontSize: 15 }}>Laddar...</div>
          </div>
        ) : lista.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: C.t3 }}>
            <div style={{ fontSize: 40, marginBottom: 12, opacity: .3 }}>○</div>
            <div style={{ fontSize: 15 }}>Inga objekt hittades</div>
          </div>
        ) : (
          lista.map(o => (
            <ObjektKort key={o.vo_nummer} obj={o} onClick={() => setValt(o)} />
          ))
        )}
      </div>
    </div>
  );
}
