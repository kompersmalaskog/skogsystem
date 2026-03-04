'use client';

import React, { useState, useEffect, useMemo } from 'react';
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
  volymSkordare: number;
  stammar: number;
  skotareModell: string | null;
  skotareStart: string | null;
  skotareSlut: string | null;
  volymSkotare: number;
  antalLass: number;
  dieselTotal: number;
  dagar: number | null;
  status: 'pagaende' | 'avslutat';
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

/* ── Bar ── */
function Bar({ pct, color, height = 8 }: { pct: number; color: string; height?: number }) {
  return (
    <div style={{ height, background: 'rgba(255,255,255,0.04)', borderRadius: height / 2, overflow: 'hidden' }}>
      <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: color, borderRadius: height / 2, opacity: .65, transition: 'width 0.5s ease' }} />
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
          volymSkordare: skProd?.vol || 0,
          stammar: skProd?.stammar || 0,
          skotareModell: skotareEntry ? getMachineLabel(maskinMap.get(skotareEntry.maskin_id)) : null,
          skotareStart: stStart,
          skotareSlut: stSlut,
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
            <ObjektKort key={o.vo_nummer} obj={o} onClick={() => console.log('Objekt klickat:', o.vo_nummer, o)} />
          ))
        )}
      </div>
    </div>
  );
}
