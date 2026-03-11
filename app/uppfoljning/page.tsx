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
function fmtMin(m: number): string {
  const h = Math.floor(m / 60);
  const min = Math.round(m % 60);
  return `${h}:${min.toString().padStart(2, '0')}`;
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
            {obj.egenSkotning ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: C.t3 }}>Egen skotning</span>
              </div>
            ) : (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
                <span style={{ fontSize: 10, color: C.t3 }}>Skotare</span>
                <span style={{ fontSize: 10, color: C.t2, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right' }}>
                  {obj.skotareModell ? obj.skotareModell.split(' ').slice(-2).join(' ') : '—'}
                </span>
                <span style={{ fontSize: 9, fontWeight: 600, color: obj.volymSkotare > 0 && !obj.skotareSlut ? C.green : obj.skotareSlut ? C.t3 : obj.skotareModell ? C.orange : C.t4, whiteSpace: 'nowrap' }}>
                  {obj.skotareSlut ? 'Klar' : obj.volymSkotare > 0 ? 'Pågår' : obj.skotareModell ? 'Väntar' : '—'}
                </span>
              </div>
            )}
          </div>

          {/* Progress */}
          {!obj.egenSkotning && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span style={{ fontSize: 11, color: C.t3 }}>{obj.areal} ha</span>
                  <span style={{ fontSize: 11, color: kvar > 30 ? C.orange : C.green, fontWeight: 600 }}>{kvar}% kvar i skogen</span>
                </div>
                <Bar pct={100 - kvar} color={kvar > 30 ? C.orange : C.green} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── ObjektDetalj — PIXEL-PERFECT copy of uppfoljning-v2.tsx ObjektDetalj ── */
/* Only difference: testdata replaced with real Supabase queries */
function ObjektDetalj({ obj, onBack }: { obj: UppfoljningObjekt; onBack: () => void }) {
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const skId = obj.skordareObjektId;
      const stId = obj.skotareObjektId;
      const ids = [skId, stId].filter(Boolean) as string[];

      if (ids.length === 0) {
        // No data — build empty d
        setD({
          medelstam: 0,
          skordare: { arbetstid:0, g15:0, g0:0, kortaStopp:0, avbrott:0, rast:0, tomgang:0,
            stamPerG15:0, m3PerG15:0, flertrad:0, antalStammar:0,
            diesel:{tot:0,perM3:0,perTim:0}, sortiment:[], avbrott_lista:[] },
          skotare: { arbetstid:0, g15:0, g0:0, kortaStopp:0, avbrott:0, rast:0, tomgang:0,
            lass:0, snittLass:0, lassPerG15:0, m3PerG15:0, avstand:0, lastrede:'–',
            diesel:{tot:0,perM3:0,perG15:0}, avbrott_lista:[] },
        });
        setLoading(false);
        return;
      }

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

      const sortMap = new Map<string, string>();
      dimSort.forEach((s: any) => sortMap.set(s.sortiment_id, s.namn));

      // Compute tid per machine — returns exact same shape as testAnalys
      const buildTid = (rows: any[]) => {
        let processing=0, terrain=0, otherWork=0, maintenance=0, disturbance=0, rast=0, kortStopp=0, diesel=0;
        rows.forEach(r => {
          processing += r.processing_sek||0; terrain += r.terrain_sek||0; otherWork += r.other_work_sek||0;
          maintenance += r.maintenance_sek||0; disturbance += r.disturbance_sek||0; rast += r.rast_sek||0;
          kortStopp += r.kort_stopp_sek||0; diesel += r.bransle_liter||0;
        });
        const g0h = (processing+terrain+otherWork)/3600;
        const g15h = (processing+terrain+otherWork+kortStopp)/3600;
        const arbh = (processing+terrain+otherWork+kortStopp+maintenance+disturbance+rast)/3600;
        return { arbetstid: Math.round(arbh*10)/10, g15: Math.round(g15h*10)/10, g0: Math.round(g0h*10)/10,
          kortaStopp: Math.round(kortStopp/60), avbrott: Math.round((maintenance+disturbance)/60),
          rast: Math.round(rast/60), tomgang: 0, dieselTot: diesel };
      };

      const skTidRows = skId ? tidRows.filter((r:any) => r.objekt_id===skId) : [];
      const stTidRows = stId ? tidRows.filter((r:any) => r.objekt_id===stId) : [];
      const skTid = buildTid(skTidRows);
      const stTid = buildTid(stTidRows);

      // Skördare produktion
      const skProd = skId ? prodRows.filter((r:any) => r.objekt_id===skId) : [];
      let totalStammar=0, mthStammar=0, totalVol=0;
      skProd.forEach((p:any) => { totalStammar += p.stammar||0; totalVol += p.volym_m3sub||0; if(p.processtyp==='MTH') mthStammar += p.stammar||0; });
      const flertrad = totalStammar>0 ? Math.round((mthStammar/totalStammar)*100) : 0;
      const medelstam = totalStammar>0 ? Math.round((totalVol/totalStammar)*100)/100 : 0;
      const stamPerG15 = skTid.g15>0 ? Math.round((totalStammar/skTid.g15)*10)/10 : 0;
      const m3PerG15Sk = skTid.g15>0 ? Math.round((obj.volymSkordare/skTid.g15)*10)/10 : 0;

      // Sortiment
      const skSort = skId ? sortRows.filter((r:any) => r.objekt_id===skId) : [];
      const sortAgg = new Map<string, {vol:number;st:number}>();
      skSort.forEach((r:any) => {
        const namn = sortMap.get(r.sortiment_id) || r.sortiment_id || 'Övrigt';
        const prev = sortAgg.get(namn) || {vol:0,st:0};
        prev.vol += r.volym_m3sub||0; prev.st += r.antal||0;
        sortAgg.set(namn, prev);
      });
      const sortiment = Array.from(sortAgg.entries())
        .map(([namn, v]) => ({namn, vol:Math.round(v.vol), st:Math.round(v.st)}))
        .sort((a,b)=>b.vol-a.vol);

      // Avbrott — exact same shape as testAnalys.avbrott_lista
      const buildAvbrott = (rows: any[]) => {
        const m = new Map<string,number>();
        rows.forEach(r => { m.set(r.typ||'Övrigt', (m.get(r.typ||'Övrigt')||0) + (r.tid_sek||0)); });
        return Array.from(m.entries()).map(([typ,sek]) => ({typ, tid:Math.round(sek/60)})).sort((a,b)=>b.tid-a.tid);
      };
      const skAvbrott = skId ? avbrottRows.filter((r:any) => r.objekt_id===skId) : [];
      const stAvbrott = stId ? avbrottRows.filter((r:any) => r.objekt_id===stId) : [];

      // Skotare lass
      let totalLassVol=0, totalKor=0;
      lassRows.forEach((l:any) => { totalLassVol += l.volym_m3sob||0; totalKor += l.korstracka_m||0; });
      const antalLass = lassRows.length;
      const snittLass = antalLass>0 ? Math.round((totalLassVol/antalLass)*10)/10 : 0;
      const lassPerG15 = stTid.g15>0 ? Math.round((antalLass/stTid.g15)*100)/100 : 0;
      const m3PerG15St = stTid.g15>0 ? Math.round((obj.volymSkotare/stTid.g15)*10)/10 : 0;
      const avstand = antalLass>0 ? Math.round(totalKor/antalLass) : 0;

      // Diesel — exact same shape as testAnalys
      const dieselPerM3Sk = obj.volymSkordare>0 ? Math.round((skTid.dieselTot/obj.volymSkordare)*100)/100 : 0;
      const dieselPerTimSk = skTid.g15>0 ? Math.round((skTid.dieselTot/skTid.g15)*100)/100 : 0;
      const dieselPerM3St = obj.volymSkotare>0 ? Math.round((stTid.dieselTot/obj.volymSkotare)*100)/100 : 0;
      const dieselPerG15St = stTid.g15>0 ? Math.round((stTid.dieselTot/stTid.g15)*100)/100 : 0;

      // Build d with EXACT same shape as testAnalys
      setD({
        medelstam,
        skordare: {
          arbetstid: skTid.arbetstid, g15: skTid.g15, g0: skTid.g0,
          kortaStopp: skTid.kortaStopp, avbrott: skTid.avbrott, rast: skTid.rast, tomgang: skTid.tomgang,
          stamPerG15, m3PerG15: m3PerG15Sk, flertrad, antalStammar: totalStammar,
          diesel: { tot: Math.round(skTid.dieselTot), perM3: dieselPerM3Sk, perTim: dieselPerTimSk },
          sortiment,
          avbrott_lista: buildAvbrott(skAvbrott),
        },
        skotare: {
          arbetstid: stTid.arbetstid, g15: stTid.g15, g0: stTid.g0,
          kortaStopp: stTid.kortaStopp, avbrott: stTid.avbrott, rast: stTid.rast, tomgang: stTid.tomgang,
          lass: antalLass, snittLass, lassPerG15, m3PerG15: m3PerG15St, avstand, lastrede: '–',
          diesel: { tot: Math.round(stTid.dieselTot), perM3: dieselPerM3St, perG15: dieselPerG15St },
          avbrott_lista: buildAvbrott(stAvbrott),
        },
      });
      setLoading(false);
    })();
  }, [obj.skordareObjektId, obj.skotareObjektId]);

  if (loading || !d) {
    return (
      <div style={{minHeight:'100vh',background:C.bg,color:C.t1,fontFamily:ff,display:'flex',alignItems:'center',justifyContent:'center'}}>
        <div style={{color:C.t3,fontSize:15}}>Laddar detaljer...</div>
      </div>
    );
  }

  // ── Aliases to match reference field names exactly ──
  const volSk = Math.round(obj.volymSkordare);
  const volSt = Math.round(obj.volymSkotare);
  const maskin = obj.skordareModell || '–';
  const skotare = obj.skotareModell || null;
  const vo = obj.vo_nummer || null;
  const uid = obj.skordareObjektId || obj.skotareObjektId || '–';
  const stammar = obj.stammar;

  // ── Exact same computed values as reference lines 145-156 ──
  const framkort = volSk>0?Math.round((volSt/volSk)*100):0;
  const kvar = 100-framkort;
  const tf = obj.typ==='slutavverkning'?C.yellow:C.green;
  const sagbart = d.skordare.sortiment.length>0 ? Math.round((d.skordare.sortiment.filter((s:any)=>s.namn.toLowerCase().includes('timmer')).reduce((a:number,s:any)=>a+s.vol,0)/d.skordare.sortiment.reduce((a:number,s:any)=>a+s.vol,0))*100) : 0;
  const produktiv = d.skordare.arbetstid>0 ? Math.round((d.skordare.g15/d.skordare.arbetstid)*100) : 0;
  const produktivSt = d.skotare.arbetstid>0 ? Math.round((d.skotare.g15/d.skotare.arbetstid)*100) : 0;

  const skDagar = daysBetweenNull(obj.skordareStart, obj.skordareSlut);
  const stDagar = daysBetweenNull(obj.skotareStart, obj.skotareSlut);
  const glapp = daysBetweenNull(obj.skordareSlut, obj.skotareStart);

  // ══════════════════════════════════════════════════════════════
  // JSX below is COPIED from uppfoljning-v2.tsx lines 158-450
  // ONLY data references changed: obj.volSk→volSk, obj.maskin→maskin, etc.
  // ALL styles, padding, fontSize, borderRadius etc are IDENTICAL
  // ══════════════════════════════════════════════════════════════
  return (
    <div style={{position:'fixed',inset:0,background:C.bg,color:C.t1,fontFamily:ff,WebkitFontSmoothing:'antialiased',overflowY:'auto'}}>
      {/* Header */}
      <div style={{padding:'14px 20px 20px',background:C.card}}>
        <button onClick={onBack} style={{background:'none',border:'none',color:C.blue,fontSize:15,cursor:'pointer',padding:0,marginBottom:16,fontFamily:ff,fontWeight:500}}>‹ Tillbaka</button>

        <div style={{marginBottom:16}}>
          <div style={{fontSize:28,fontWeight:700,letterSpacing:'-0.5px',marginBottom:6}}>{obj.namn}</div>
          <div style={{fontSize:14,color:C.t2}}>
            {obj.agare} · {obj.areal} ha
            <span style={{marginLeft:10,padding:'3px 12px',borderRadius:12,fontSize:12,fontWeight:500,background:tf+'15',color:tf}}>
              {obj.typ==='slutavverkning'?'Slutavverkning':'Gallring'}
            </span>
          </div>
          <div style={{fontSize:11,color:C.t3,marginTop:8}}>
            {vo && <span>VO {vo} · </span>}ID {uid}
          </div>
        </div>

        {/* Terräng */}
        <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:16}}>
          {[{l:'Bärighet',v:'–'},{l:'Terräng',v:'–'},{l:'Lutning',v:'–'},{l:'Underväxt',v:'–'}].map((t,i) => (
            <div key={i} style={{padding:'5px 12px',background:'rgba(255,255,255,0.04)',borderRadius:8}}>
              <span style={{fontSize:10,color:C.t3,marginRight:6}}>{t.l}</span>
              <span style={{fontSize:11,fontWeight:500,color:t.v==='Dålig'||t.v==='Brant'||t.v==='Mycket'?C.orange:C.t2}}>{t.v}</span>
            </div>
          ))}
        </div>

        {/* Maskiner med datum */}
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          <div style={{padding:'12px 14px',background:'rgba(255,255,255,0.03)',borderRadius:10,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <div style={{width:8,height:8,borderRadius:'50%',background:C.blue}}/>
              <div>
                <div style={{fontSize:12,fontWeight:600,color:C.t1}}>{maskin}</div>
                <div style={{fontSize:10,color:C.t3,marginTop:2}}>Skördare</div>
              </div>
            </div>
            <div style={{textAlign:'right'}}>
              <div style={{fontSize:12,color:C.t2}}>{fmtDate(obj.skordareStart)} → {obj.skordareSlut?fmtDate(obj.skordareSlut):'pågår'}</div>
              {skDagar && <div style={{fontSize:10,color:C.t3,marginTop:2}}>{skDagar} dagar</div>}
            </div>
          </div>

          {/* Glapp-indikator */}
          {glapp !== null && glapp > 0 && (
            <div style={{textAlign:'center',padding:'4px 0'}}>
              <span style={{fontSize:10,color:glapp>7?C.orange:C.t3}}>{glapp} dagar mellanrum</span>
            </div>
          )}
          {obj.skotareStart && glapp !== null && glapp <= 0 && (
            <div style={{textAlign:'center',padding:'4px 0'}}>
              <span style={{fontSize:10,color:C.green}}>Parallellkörning</span>
            </div>
          )}

          <div style={{padding:'12px 14px',background:'rgba(255,255,255,0.03)',borderRadius:10,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <div style={{width:8,height:8,borderRadius:'50%',background:C.green}}/>
              <div>
                <div style={{fontSize:12,fontWeight:600,color:C.t1}}>{skotare||'Ej tilldelad'}</div>
                <div style={{fontSize:10,color:C.t3,marginTop:2}}>Skotare</div>
              </div>
            </div>
            <div style={{textAlign:'right'}}>
              {obj.skotareStart ? (
                <>
                  <div style={{fontSize:12,color:C.t2}}>{fmtDate(obj.skotareStart)} → {obj.skotareSlut?fmtDate(obj.skotareSlut):'pågår'}</div>
                  {stDagar && <div style={{fontSize:10,color:C.t3,marginTop:2}}>{stDagar} dagar</div>}
                </>
              ) : (
                <div style={{fontSize:12,color:C.t4}}>Väntar</div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div style={{padding:'16px 16px 80px',maxWidth:700,margin:'0 auto'}}>

        {/* Visa avverkning */}
        <button onClick={()=>{}} style={{width:'100%',padding:'16px',background:C.card,border:'1px solid '+C.border,borderRadius:14,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:10,marginBottom:16}}>
          <span style={{fontSize:15,fontWeight:600,color:C.t1,fontFamily:ff}}>Visa avverkning på karta</span>
          <span style={{fontSize:14,color:C.t4}}>›</span>
        </button>

        {/* Stora nyckeltal */}
        <div style={{display:'flex',gap:10,marginBottom:12}}>
          <div style={{flex:1,background:C.card,borderRadius:16,padding:'24px 16px',textAlign:'center',border:'1px solid '+C.border}}>
            <div style={{fontSize:10,color:C.t3,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:10}}>Skördat</div>
            <div style={{fontSize:42,fontWeight:700,letterSpacing:'-1px',lineHeight:1}}>{volSk}</div>
            <div style={{fontSize:13,color:C.t3,marginTop:4}}>m³</div>
          </div>
          <div style={{flex:1,background:C.card,borderRadius:16,padding:'24px 16px',textAlign:'center',border:'1px solid '+C.border}}>
            <div style={{fontSize:10,color:C.t3,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:10}}>Skotat</div>
            <div style={{fontSize:42,fontWeight:700,letterSpacing:'-1px',lineHeight:1}}>{volSt}</div>
            <div style={{fontSize:13,color:C.t3,marginTop:4}}>m³</div>
          </div>
        </div>

        <div style={{display:'flex',gap:10,marginBottom:16}}>
          <div style={{flex:1,background:C.card,borderRadius:16,padding:'18px 16px',textAlign:'center',border:'1px solid '+C.border}}>
            <div style={{fontSize:10,color:C.t3,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:6}}>Medelstam</div>
            <div style={{fontSize:24,fontWeight:700}}>{d.medelstam||'–'}<span style={{fontSize:12,fontWeight:400,color:C.t3}}> m³fub</span></div>
          </div>
          <div style={{flex:1,background:C.card,borderRadius:16,padding:'18px 16px',textAlign:'center',border:'1px solid '+C.border}}>
            <div style={{fontSize:10,color:C.t3,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:6}}>Volym/ha</div>
            <div style={{fontSize:24,fontWeight:700}}>{obj.areal>0?(volSk/obj.areal).toFixed(0):'–'}<span style={{fontSize:12,fontWeight:400,color:C.t3}}> m³</span></div>
          </div>
        </div>

        {/* Kvar i skogen */}
        <div style={{background:C.card,borderRadius:16,padding:'20px 20px',marginBottom:16,border:'1px solid '+C.border}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:12}}>
            <span style={{fontSize:14,fontWeight:500,color:C.t2}}>Kvar i skogen</span>
            <div style={{textAlign:'right'}}>
              <span style={{fontSize:28,fontWeight:700,color:kvar>30?C.orange:C.green}}>{kvar}%</span>
            </div>
          </div>
          <Bar pct={kvar} color={kvar>30?C.orange:C.green} height={10}/>
          <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:C.t3,marginTop:8}}>
            <span>Skotat {volSt} m³</span>
            <span>Kvar ~{volSk-volSt} m³</span>
          </div>
        </div>

        {/* Diesel fritt bilväg */}
        <div style={{background:C.card,borderRadius:16,padding:'24px 20px',marginBottom:16,border:'1px solid '+C.border,textAlign:'center'}}>
          <div style={{fontSize:10,color:C.t3,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:10}}>Diesel fritt bilväg</div>
          <div style={{fontSize:36,fontWeight:700,letterSpacing:'-1px'}}>{(d.skordare.diesel.perM3+d.skotare.diesel.perM3).toFixed(2)}<span style={{fontSize:14,fontWeight:400,color:C.t3}}> L/m³fub</span></div>
          <div style={{display:'flex',justifyContent:'center',gap:24,marginTop:12,fontSize:12,color:C.t3}}>
            <span><span style={{display:'inline-block',width:7,height:7,borderRadius:'50%',background:C.blue,marginRight:6}}/>Skördare {d.skordare.diesel.perM3} L</span>
            <span><span style={{display:'inline-block',width:7,height:7,borderRadius:'50%',background:C.green,marginRight:6}}/>Skotare {d.skotare.diesel.perM3} L</span>
          </div>
        </div>

        {/* Tidsbalans */}
        <Section title="Tidsbalans" defaultOpen={true}>
          <div style={{marginTop:8}}/>
          <div style={{display:'flex',height:36,borderRadius:10,overflow:'hidden',marginBottom:12}}>
            {d.skordare.g15>0 && <div style={{background:C.blue,width:`${(d.skordare.g15/(d.skordare.g15+d.skotare.g15))*100}%`,display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:13,fontWeight:600}}>{d.skordare.g15}h</div>}
            {d.skotare.g15>0 && <div style={{background:C.green,width:`${(d.skotare.g15/(d.skordare.g15+d.skotare.g15))*100}%`,display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:13,fontWeight:600}}>{d.skotare.g15}h</div>}
          </div>
          <div style={{display:'flex',justifyContent:'center',gap:24,fontSize:11,color:C.t3,marginBottom:10}}>
            <span><span style={{display:'inline-block',width:7,height:7,borderRadius:'50%',background:C.blue,marginRight:5}}/>Skördare · {maskin}</span>
            <span><span style={{display:'inline-block',width:7,height:7,borderRadius:'50%',background:C.green,marginRight:5}}/>Skotare · {skotare||'Ej tilldelad'}</span>
          </div>
          <div style={{textAlign:'center',fontSize:13,color:C.green,fontWeight:500}}>
            Skotare {Math.round((1-(d.skotare.g15/d.skordare.g15))*100)}% snabbare
          </div>
        </Section>

        {/* ── SKÖRDARE ── */}
        <div style={{display:'flex',alignItems:'center',gap:10,margin:'24px 0 12px',paddingLeft:4}}>
          <div style={{width:10,height:10,borderRadius:'50%',background:C.blue}}/>
          <span style={{fontSize:18,fontWeight:700,letterSpacing:'-0.3px'}}>Skördare</span>
          <span style={{fontSize:12,color:C.t3}}>{maskin}</span>
        </div>

        <Section title="Tid" sub={`${produktiv}% produktiv`}>
          <div style={{display:'flex',justifyContent:'space-around',marginTop:8,marginBottom:20}}>
            {[{l:'Arbetstid',v:d.skordare.arbetstid},{l:'G15',v:d.skordare.g15},{l:'G0',v:d.skordare.g0}].map((t:any,i:number) => (
              <div key={i} style={{textAlign:'center'}}>
                <div style={{fontSize:28,fontWeight:700,letterSpacing:'-0.5px'}}>{t.v}</div>
                <div style={{fontSize:12,color:C.t3,marginTop:4}}>{t.l}</div>
              </div>
            ))}
          </div>
          <div style={{height:1,background:C.border,margin:'0 0 16px'}}/>
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8}}>
            {[{l:'Korta stopp',v:fmtMin(d.skordare.kortaStopp)},{l:'Avbrott',v:fmtMin(d.skordare.avbrott)},{l:'Rast',v:fmtMin(d.skordare.rast)},{l:'Tomgång',v:fmtMin(d.skordare.tomgang)}].map((t:any,i:number) => (
              <div key={i} style={{textAlign:'center'}}>
                <div style={{fontSize:10,color:C.t3,marginBottom:4}}>{t.l}</div>
                <div style={{fontSize:14,fontWeight:600}}>{t.v}</div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Produktion" sub={`${d.skordare.flertrad}% flerträd`}>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:16,marginTop:8}}>
            {[{l:'Stammar/G15',v:d.skordare.stamPerG15},{l:'m³/G15',v:d.skordare.m3PerG15},{l:'Stammar',v:d.skordare.antalStammar||stammar}].map((p:any,i:number) => (
              <div key={i}>
                <div style={{fontSize:11,color:C.t3,marginBottom:6}}>{p.l}</div>
                <div style={{fontSize:20,fontWeight:700}}>{p.v}</div>
              </div>
            ))}
          </div>
        </Section>

        {d.skordare.sortiment.length > 0 && (
          <Section title="Sortiment" sub={`${sagbart}% sågbart`}>
            <div style={{marginTop:4}}>
            {d.skordare.sortiment.map((s:any,i:number) => {
              const totVol = d.skordare.sortiment.reduce((a:number,x:any)=>a+x.vol,0);
              const pct = Math.round((s.vol/totVol)*100);
              return (
                <div key={i} style={{display:'flex',alignItems:'center',padding:'12px 0',borderBottom:i<d.skordare.sortiment.length-1?'1px solid '+C.border:'none'}}>
                  <span style={{fontSize:14,fontWeight:500,color:C.t2,flex:1}}>{s.namn}</span>
                  <span style={{fontSize:12,color:C.t3,minWidth:35,textAlign:'right',marginRight:12}}>{pct}%</span>
                  <span style={{fontSize:14,fontWeight:600,minWidth:60,textAlign:'right'}}>{s.vol} m³</span>
                  <span style={{fontSize:12,color:C.t3,minWidth:45,textAlign:'right',marginLeft:8}}>{s.st} st</span>
                </div>
              );
            })}
            </div>
          </Section>
        )}

        <Section title="Diesel" sub={`${d.skordare.diesel.perM3} L/m³`}>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:16,marginTop:8}}>
            {[{l:'Totalt',v:d.skordare.diesel.tot,s:'L'},{l:'Per m³fub',v:d.skordare.diesel.perM3,s:'L'},{l:'Per timme',v:d.skordare.diesel.perTim,s:'L'}].map((x:any,i:number) => (
              <div key={i}>
                <div style={{fontSize:11,color:C.t3,marginBottom:6}}>{x.l}</div>
                <div style={{fontSize:20,fontWeight:700}}>{x.v} <span style={{fontSize:12,color:C.t3,fontWeight:400}}>{x.s}</span></div>
              </div>
            ))}
          </div>
        </Section>

        {d.skordare.avbrott_lista.length > 0 && (
          <Section title="Avbrott & stillestånd">
            <div style={{marginTop:4}}>
            {d.skordare.avbrott_lista.map((a:any,i:number) => (
              <div key={i} style={{display:'flex',justifyContent:'space-between',padding:'12px 0',borderBottom:i<d.skordare.avbrott_lista.length-1?'1px solid '+C.border:'none'}}>
                <span style={{fontSize:14,color:C.t2}}>{a.typ}</span>
                <span style={{fontSize:14,fontWeight:600,color:C.orange}}>{fmtMin(a.tid)}</span>
              </div>
            ))}
            </div>
          </Section>
        )}

        {/* ── SKOTARE ── */}
        <div style={{display:'flex',alignItems:'center',gap:10,margin:'24px 0 12px',paddingLeft:4}}>
          <div style={{width:10,height:10,borderRadius:'50%',background:C.green}}/>
          <span style={{fontSize:18,fontWeight:700,letterSpacing:'-0.3px'}}>Skotare</span>
          <span style={{fontSize:12,color:C.t3}}>{skotare}</span>
        </div>

        <Section title="Tid" sub={`${produktivSt}% produktiv`}>
          <div style={{display:'flex',justifyContent:'space-around',marginTop:8,marginBottom:20}}>
            {[{l:'Arbetstid',v:d.skotare.arbetstid},{l:'G15',v:d.skotare.g15},{l:'G0',v:d.skotare.g0}].map((t:any,i:number) => (
              <div key={i} style={{textAlign:'center'}}>
                <div style={{fontSize:28,fontWeight:700,letterSpacing:'-0.5px'}}>{t.v}</div>
                <div style={{fontSize:12,color:C.t3,marginTop:4}}>{t.l}</div>
              </div>
            ))}
          </div>
          <div style={{height:1,background:C.border,margin:'0 0 16px'}}/>
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8}}>
            {[{l:'Korta stopp',v:fmtMin(d.skotare.kortaStopp)},{l:'Avbrott',v:fmtMin(d.skotare.avbrott)},{l:'Rast',v:fmtMin(d.skotare.rast)},{l:'Tomgång',v:fmtMin(d.skotare.tomgang)}].map((t:any,i:number) => (
              <div key={i} style={{textAlign:'center'}}>
                <div style={{fontSize:10,color:C.t3,marginBottom:4}}>{t.l}</div>
                <div style={{fontSize:14,fontWeight:600}}>{t.v}</div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Produktion" sub={`${d.skotare.lastrede} lastrede`}>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'20px 16px',marginTop:8}}>
            {[{l:'Antal lass',v:d.skotare.lass,s:''},{l:'Snitt lass',v:d.skotare.snittLass,s:'m³'},{l:'Lass/G15',v:d.skotare.lassPerG15,s:''},{l:'m³/G15',v:d.skotare.m3PerG15,s:''},{l:'Skotningsavst.',v:d.skotare.avstand,s:'m'}].map((p:any,i:number) => (
              <div key={i}>
                <div style={{fontSize:11,color:C.t3,marginBottom:6}}>{p.l}</div>
                <div style={{fontSize:20,fontWeight:700}}>{p.v} <span style={{fontSize:12,color:C.t3,fontWeight:400}}>{p.s}</span></div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Diesel" sub={`${d.skotare.diesel.perM3} L/m³`}>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:16,marginTop:8}}>
            {[{l:'Totalt',v:d.skotare.diesel.tot,s:'L'},{l:'Per m³fub',v:d.skotare.diesel.perM3,s:'L'},{l:'Per G15',v:d.skotare.diesel.perG15,s:'L'}].map((x:any,i:number) => (
              <div key={i}>
                <div style={{fontSize:11,color:C.t3,marginBottom:6}}>{x.l}</div>
                <div style={{fontSize:20,fontWeight:700}}>{x.v} <span style={{fontSize:12,color:C.t3,fontWeight:400}}>{x.s}</span></div>
              </div>
            ))}
          </div>
        </Section>

        {d.skotare.avbrott_lista.length > 0 && (
          <Section title="Avbrott & stillestånd">
            <div style={{marginTop:4}}>
            {d.skotare.avbrott_lista.map((a:any,i:number) => (
              <div key={i} style={{display:'flex',justifyContent:'space-between',padding:'12px 0',borderBottom:i<d.skotare.avbrott_lista.length-1?'1px solid '+C.border:'none'}}>
                <span style={{fontSize:14,color:C.t2}}>{a.typ}</span>
                <span style={{fontSize:14,fontWeight:600,color:C.orange}}>{fmtMin(a.tid)}</span>
              </div>
            ))}
            </div>
          </Section>
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
  const [flik, setFlik] = useState<'alla' | 'pagaende' | 'avslutat'>('alla');
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

      // Each dim_objekt row becomes its own uppföljningsobjekt (keyed by objekt_id)
      const voGroups = new Map<string, any[]>();
      dimObjekt.forEach(d => {
        const key = d.objekt_id;
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

  // Detail view
  if (valt) {
    return <ObjektDetalj obj={valt} onBack={() => setValt(null)} />;
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: C.bg, color: C.t1, fontFamily: ff, WebkitFontSmoothing: 'antialiased', overflowY: 'auto' }}>
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
          {(['alla', 'pagaende', 'avslutat'] as const).map(f => (
            <button key={f} onClick={() => setFlik(f)} style={{
              padding: '12px 0', border: 'none', background: 'none', fontSize: 15, fontWeight: 500,
              color: flik === f ? C.t1 : C.t3, cursor: 'pointer',
              borderBottom: flik === f ? '2px solid ' + C.t1 : '2px solid transparent',
              marginBottom: -1, fontFamily: ff,
            }}>
              {f === 'alla' ? 'Alla' : f === 'pagaende' ? 'Pågående' : 'Avslutade'}
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
      <div style={{ padding: '0 16px 120px', maxWidth: 700, margin: '0 auto' }}>
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
            <ObjektKort key={o.skordareObjektId || o.skotareObjektId || o.vo_nummer} obj={o} onClick={() => setValt(o)} />
          ))
        )}
      </div>
    </div>
  );
}
