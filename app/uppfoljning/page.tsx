'use client';

import React, { useState, useEffect, useMemo } from 'react';
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
  // Type colors
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

/* ── Bar (maskinvy-style progress bar) ── */
function Bar({ pct, color, height = 3 }: { pct: number; color: string; height?: number }) {
  return (
    <div style={{ height, background: C.dim, borderRadius: 2, overflow: 'hidden' }}>
      <div style={{ width: `${Math.min(100, Math.max(0, pct))}%`, height: '100%', background: color, borderRadius: 2, transition: 'width 1s cubic-bezier(0.4,0,0.2,1)' }} />
    </div>
  );
}

/* ── Section (collapsible, maskinvy card style) ── */
function Section({ title, sub, children, defaultOpen = false }: { title: string; sub?: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginBottom: 8 }}>
      <div onClick={() => setOpen(!open)} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '18px 22px', background: C.surface, cursor: 'pointer',
        border: `1px solid ${C.border}`,
        borderRadius: open ? '16px 16px 0 0' : 16,
        borderBottom: open ? 'none' : undefined,
        transition: 'border-color 0.2s',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.9px', color: C.muted }}>{title}</span>
          {sub && <span style={{ fontSize: 11, color: C.muted, fontWeight: 400 }}>{sub}</span>}
        </div>
        <span style={{ fontSize: 14, color: C.dim, transform: open ? 'rotate(90deg)' : '', transition: 'transform 0.2s ease' }}>›</span>
      </div>
      {open && (
        <div style={{ background: C.surface, borderRadius: '0 0 16px 16px', border: `1px solid ${C.border}`, borderTop: 'none', padding: '4px 22px 20px' }}>
          {children}
        </div>
      )}
    </div>
  );
}

/* ── ObjektKort — maskinvy card style ── */
function ObjektKort({ obj, onClick }: { obj: UppfoljningObjekt; onClick: () => void }) {
  const kvar = obj.volymSkordare > 0 ? Math.max(0, 100 - Math.round((obj.volymSkotare / obj.volymSkordare) * 100)) : 0;
  const ej = obj.volymSkordare === 0;
  const tf = obj.typ === 'slutavverkning' ? C.warn : C.accent;

  return (
    <div onClick={onClick} style={{
      background: C.surface, borderRadius: 16, padding: '20px 22px', cursor: 'pointer',
      marginBottom: 8, border: `1px solid ${C.border}`, transition: 'border-color 0.2s, transform 0.2s',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: ej ? 0 : 14 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 3, height: 22, borderRadius: 2, background: tf, opacity: .6 }} />
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.3px', color: C.text }}>{obj.namn}</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>
                {obj.agare}
                {obj.vo_nummer && <span style={{ marginLeft: 8, padding: '2px 8px', background: 'rgba(255,255,255,0.05)', borderRadius: 20, fontSize: 10, fontWeight: 600, letterSpacing: '0.3px' }}>VO {obj.vo_nummer}</span>}
              </div>
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          {!ej && <div style={{ fontFamily: ffNum, fontSize: 28, fontWeight: 700, letterSpacing: '-1px', lineHeight: 1, color: C.text }}>{Math.round(obj.volymSkordare)}<span style={{ fontSize: 11, fontWeight: 400, color: C.muted, fontFamily: ff }}> m³</span></div>}
          <span style={{
            fontSize: 10, fontWeight: 600, color: tf, padding: '2px 8px', letterSpacing: '0.3px',
            background: obj.typ === 'slutavverkning' ? 'rgba(255,179,64,0.1)' : 'rgba(90,255,140,0.1)',
            borderRadius: 20, display: 'inline-block', marginTop: ej ? 0 : 4,
          }}>
            {obj.typ === 'slutavverkning' ? 'Slutavv.' : 'Gallring'}
          </span>
        </div>
      </div>

      {ej ? (
        <div style={{ marginTop: 10, fontSize: 11, color: C.muted }}>Ej startad{obj.areal > 0 ? ` · ${obj.areal} ha` : ''}</div>
      ) : (
        <div>
          {/* Maskin-rader */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 5, padding: '7px 10px', background: C.surface2, borderRadius: 8 }}>
              <span style={{ fontSize: 10, color: C.muted }}>Skördare</span>
              <span style={{ fontSize: 10, color: C.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right' }}>
                {obj.skordareModell ? obj.skordareModell.split(' ').slice(-2).join(' ') : '—'}
              </span>
              <span style={{ fontSize: 9, fontWeight: 600, color: obj.skordareSlut ? C.muted : C.accent, whiteSpace: 'nowrap' }}>
                {obj.skordareSlut ? 'Klar' : 'Pågår'}
              </span>
            </div>
            {obj.egenSkotning ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '7px 10px', background: C.surface2, borderRadius: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: C.muted }}>Egen skotning</span>
              </div>
            ) : (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 5, padding: '7px 10px', background: C.surface2, borderRadius: 8 }}>
                <span style={{ fontSize: 10, color: C.muted }}>Skotare</span>
                <span style={{ fontSize: 10, color: C.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right' }}>
                  {obj.skotareModell ? obj.skotareModell.split(' ').slice(-2).join(' ') : '—'}
                </span>
                <span style={{ fontSize: 9, fontWeight: 600, color: obj.volymSkotare > 0 && !obj.skotareSlut ? C.accent : obj.skotareSlut ? C.muted : obj.skotareModell ? C.warn : C.dim, whiteSpace: 'nowrap' }}>
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
                  <span style={{ fontSize: 11, color: C.muted }}>{obj.areal} ha</span>
                  <span style={{ fontSize: 11, color: kvar > 30 ? C.warn : C.accent, fontWeight: 600 }}>{kvar}% kvar i skogen</span>
                </div>
                <Bar pct={100 - kvar} color={kvar > 30 ? C.warn : C.accent} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── ObjektDetalj — maskinvy-styled detail view ── */
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

      const skProd = skId ? prodRows.filter((r:any) => r.objekt_id===skId) : [];
      let totalStammar=0, mthStammar=0, totalVol=0;
      skProd.forEach((p:any) => { totalStammar += p.stammar||0; totalVol += p.volym_m3sub||0; if(p.processtyp==='MTH') mthStammar += p.stammar||0; });
      const flertrad = totalStammar>0 ? Math.round((mthStammar/totalStammar)*100) : 0;
      const medelstam = totalStammar>0 ? Math.round((totalVol/totalStammar)*100)/100 : 0;
      const stamPerG15 = skTid.g15>0 ? Math.round((totalStammar/skTid.g15)*10)/10 : 0;
      const m3PerG15Sk = skTid.g15>0 ? Math.round((obj.volymSkordare/skTid.g15)*10)/10 : 0;

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

      const buildAvbrott = (rows: any[]) => {
        const m = new Map<string,number>();
        rows.forEach(r => { m.set(r.typ||'Övrigt', (m.get(r.typ||'Övrigt')||0) + (r.tid_sek||0)); });
        return Array.from(m.entries()).map(([typ,sek]) => ({typ, tid:Math.round(sek/60)})).sort((a,b)=>b.tid-a.tid);
      };
      const skAvbrott = skId ? avbrottRows.filter((r:any) => r.objekt_id===skId) : [];
      const stAvbrott = stId ? avbrottRows.filter((r:any) => r.objekt_id===stId) : [];

      let totalLassVol=0, totalKor=0;
      lassRows.forEach((l:any) => { totalLassVol += l.volym_m3sob||0; totalKor += l.korstracka_m||0; });
      const antalLass = lassRows.length;
      const snittLass = antalLass>0 ? Math.round((totalLassVol/antalLass)*10)/10 : 0;
      const lassPerG15 = stTid.g15>0 ? Math.round((antalLass/stTid.g15)*100)/100 : 0;
      const m3PerG15St = stTid.g15>0 ? Math.round((obj.volymSkotare/stTid.g15)*10)/10 : 0;
      const avstand = antalLass>0 ? Math.round(totalKor/antalLass) : 0;

      const dieselPerM3Sk = obj.volymSkordare>0 ? Math.round((skTid.dieselTot/obj.volymSkordare)*100)/100 : 0;
      const dieselPerTimSk = skTid.g15>0 ? Math.round((skTid.dieselTot/skTid.g15)*100)/100 : 0;
      const dieselPerM3St = obj.volymSkotare>0 ? Math.round((stTid.dieselTot/obj.volymSkotare)*100)/100 : 0;
      const dieselPerG15St = stTid.g15>0 ? Math.round((stTid.dieselTot/stTid.g15)*100)/100 : 0;

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
      <div style={{minHeight:'100vh',background:C.bg,color:C.text,fontFamily:ff,display:'flex',alignItems:'center',justifyContent:'center'}}>
        <div style={{color:C.muted,fontSize:14}}>Laddar detaljer...</div>
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

  const framkort = volSk>0?Math.round((volSt/volSk)*100):0;
  const kvar = 100-framkort;
  const tf = obj.typ==='slutavverkning'?C.warn:C.accent;
  const sagbart = d.skordare.sortiment.length>0 ? Math.round((d.skordare.sortiment.filter((s:any)=>s.namn.toLowerCase().includes('timmer')).reduce((a:number,s:any)=>a+s.vol,0)/d.skordare.sortiment.reduce((a:number,s:any)=>a+s.vol,0))*100) : 0;
  const produktiv = d.skordare.arbetstid>0 ? Math.round((d.skordare.g15/d.skordare.arbetstid)*100) : 0;
  const produktivSt = d.skotare.arbetstid>0 ? Math.round((d.skotare.g15/d.skotare.arbetstid)*100) : 0;

  const skDagar = daysBetweenNull(obj.skordareStart, obj.skordareSlut);
  const stDagar = daysBetweenNull(obj.skotareStart, obj.skotareSlut);
  const glapp = daysBetweenNull(obj.skordareSlut, obj.skotareStart);

  return (
    <div style={{position:'fixed',top:56,left:0,right:0,bottom:0,background:C.bg,color:C.text,fontFamily:ff,WebkitFontSmoothing:'antialiased',overflowY:'auto'}}>
      {/* Header */}
      <div style={{padding:'14px 22px 22px',background:C.surface,borderBottom:`1px solid ${C.border}`}}>
        <button onClick={onBack} style={{background:'none',border:'none',color:C.blue,fontSize:13,cursor:'pointer',padding:0,marginBottom:16,fontFamily:ff,fontWeight:500,display:'flex',alignItems:'center',gap:4}}>
          <span style={{fontSize:16}}>‹</span> Tillbaka
        </button>

        <div style={{marginBottom:16}}>
          <div style={{fontFamily:ffNum,fontSize:26,fontWeight:700,letterSpacing:'-1px',marginBottom:6,color:C.text}}>{obj.namn}</div>
          <div style={{fontSize:13,color:C.muted}}>
            {obj.agare} · {obj.areal} ha
            <span style={{
              marginLeft:10,padding:'2px 8px',borderRadius:20,fontSize:10,fontWeight:600,letterSpacing:'0.3px',
              background:obj.typ==='slutavverkning'?'rgba(255,179,64,0.1)':'rgba(90,255,140,0.1)',
              color:tf,
            }}>
              {obj.typ==='slutavverkning'?'Slutavverkning':'Gallring'}
            </span>
          </div>
          <div style={{fontSize:10,color:C.dim,marginTop:8,letterSpacing:'0.3px'}}>
            {vo && <span>VO {vo} · </span>}ID {uid}
          </div>
        </div>

        {/* Terräng */}
        <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:16}}>
          {[{l:'Bärighet',v:'–'},{l:'Terräng',v:'–'},{l:'Lutning',v:'–'},{l:'Underväxt',v:'–'}].map((t,i) => (
            <div key={i} style={{padding:'5px 12px',background:C.surface2,borderRadius:8}}>
              <span style={{fontSize:10,color:C.muted,marginRight:6}}>{t.l}</span>
              <span style={{fontSize:11,fontWeight:500,color:t.v==='Dålig'||t.v==='Brant'||t.v==='Mycket'?C.warn:C.text}}>{t.v}</span>
            </div>
          ))}
        </div>

        {/* Maskiner med datum */}
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          <div style={{padding:'12px 14px',background:C.surface2,borderRadius:10,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <div style={{width:8,height:8,borderRadius:'50%',background:C.blue}}/>
              <div>
                <div style={{fontSize:12,fontWeight:600,color:C.text}}>{maskin}</div>
                <div style={{fontSize:10,color:C.muted,marginTop:2}}>Skördare</div>
              </div>
            </div>
            <div style={{textAlign:'right'}}>
              <div style={{fontSize:12,color:C.text}}>{fmtDate(obj.skordareStart)} → {obj.skordareSlut?fmtDate(obj.skordareSlut):'pågår'}</div>
              {skDagar && <div style={{fontSize:10,color:C.muted,marginTop:2}}>{skDagar} dagar</div>}
            </div>
          </div>

          {glapp !== null && glapp > 0 && (
            <div style={{textAlign:'center',padding:'4px 0'}}>
              <span style={{fontSize:10,color:glapp>7?C.warn:C.muted}}>{glapp} dagar mellanrum</span>
            </div>
          )}
          {obj.skotareStart && glapp !== null && glapp <= 0 && (
            <div style={{textAlign:'center',padding:'4px 0'}}>
              <span style={{fontSize:10,color:C.accent}}>Parallellkörning</span>
            </div>
          )}

          <div style={{padding:'12px 14px',background:C.surface2,borderRadius:10,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <div style={{width:8,height:8,borderRadius:'50%',background:C.accent}}/>
              <div>
                <div style={{fontSize:12,fontWeight:600,color:C.text}}>{skotare||'Ej tilldelad'}</div>
                <div style={{fontSize:10,color:C.muted,marginTop:2}}>Skotare</div>
              </div>
            </div>
            <div style={{textAlign:'right'}}>
              {obj.skotareStart ? (
                <>
                  <div style={{fontSize:12,color:C.text}}>{fmtDate(obj.skotareStart)} → {obj.skotareSlut?fmtDate(obj.skotareSlut):'pågår'}</div>
                  {stDagar && <div style={{fontSize:10,color:C.muted,marginTop:2}}>{stDagar} dagar</div>}
                </>
              ) : (
                <div style={{fontSize:12,color:C.dim}}>Väntar</div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div style={{padding:'16px 16px 80px',maxWidth:700,margin:'0 auto'}}>

        {/* Visa avverkning */}
        <button onClick={()=>{}} style={{width:'100%',padding:'14px',background:C.surface,border:`1px solid ${C.border}`,borderRadius:16,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:10,marginBottom:16,transition:'border-color 0.2s'}}>
          <span style={{fontSize:13,fontWeight:600,color:C.text,fontFamily:ff}}>Visa avverkning på karta</span>
          <span style={{fontSize:14,color:C.dim}}>›</span>
        </button>

        {/* Hero KPIs — maskinvy style */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
          <div style={{background:C.surface,borderRadius:16,padding:'24px 18px',textAlign:'center',border:`1px solid ${C.border}`,position:'relative',overflow:'hidden'}}>
            <div style={{position:'absolute',bottom:-60,right:-60,width:200,height:200,borderRadius:'50%',background:'radial-gradient(circle, rgba(90,255,140,0.08) 0%, transparent 70%)',pointerEvents:'none'}}/>
            <div style={{fontSize:10,fontWeight:600,textTransform:'uppercase',letterSpacing:'1px',color:C.muted,marginBottom:12}}>Skördat</div>
            <div style={{fontFamily:ffNum,fontSize:48,fontWeight:700,letterSpacing:'-2px',lineHeight:1,color:C.accent}}>{volSk}</div>
            <div style={{fontSize:11,color:C.muted,marginTop:6}}>m³fub</div>
          </div>
          <div style={{background:C.surface,borderRadius:16,padding:'24px 18px',textAlign:'center',border:`1px solid ${C.border}`,position:'relative',overflow:'hidden'}}>
            <div style={{position:'absolute',bottom:-60,right:-60,width:200,height:200,borderRadius:'50%',background:'radial-gradient(circle, rgba(91,143,255,0.08) 0%, transparent 70%)',pointerEvents:'none'}}/>
            <div style={{fontSize:10,fontWeight:600,textTransform:'uppercase',letterSpacing:'1px',color:C.muted,marginBottom:12}}>Skotat</div>
            <div style={{fontFamily:ffNum,fontSize:48,fontWeight:700,letterSpacing:'-2px',lineHeight:1,color:C.blue}}>{volSt}</div>
            <div style={{fontSize:11,color:C.muted,marginTop:6}}>m³fub</div>
          </div>
        </div>

        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
          <div style={{background:C.surface,borderRadius:16,padding:'18px 16px',textAlign:'center',border:`1px solid ${C.border}`}}>
            <div style={{fontSize:10,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.8px',color:C.muted,marginBottom:8}}>Medelstam</div>
            <div style={{fontFamily:ffNum,fontSize:28,fontWeight:700,letterSpacing:'-1px',color:C.text}}>{d.medelstam||'–'}<span style={{fontSize:11,fontWeight:400,color:C.muted,fontFamily:ff}}> m³fub</span></div>
          </div>
          <div style={{background:C.surface,borderRadius:16,padding:'18px 16px',textAlign:'center',border:`1px solid ${C.border}`}}>
            <div style={{fontSize:10,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.8px',color:C.muted,marginBottom:8}}>Volym/ha</div>
            <div style={{fontFamily:ffNum,fontSize:28,fontWeight:700,letterSpacing:'-1px',color:C.text}}>{obj.areal>0?(volSk/obj.areal).toFixed(0):'–'}<span style={{fontSize:11,fontWeight:400,color:C.muted,fontFamily:ff}}> m³</span></div>
          </div>
        </div>

        {/* Kvar i skogen */}
        <div style={{background:C.surface,borderRadius:16,padding:'20px 22px',marginBottom:8,border:`1px solid ${C.border}`}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:12}}>
            <span style={{fontSize:10,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.8px',color:C.muted}}>Kvar i skogen</span>
            <div style={{textAlign:'right'}}>
              <span style={{fontFamily:ffNum,fontSize:32,fontWeight:700,letterSpacing:'-1px',color:kvar>30?C.warn:C.accent}}>{kvar}%</span>
            </div>
          </div>
          <Bar pct={kvar} color={kvar>30?C.warn:C.accent} height={4}/>
          <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:C.muted,marginTop:10}}>
            <span>Skotat {volSt} m³</span>
            <span>Kvar ~{volSk-volSt} m³</span>
          </div>
        </div>

        {/* Diesel fritt bilväg */}
        <div style={{background:C.surface,borderRadius:16,padding:'24px 22px',marginBottom:16,border:`1px solid ${C.border}`,textAlign:'center',position:'relative',overflow:'hidden'}}>
          <div style={{position:'absolute',bottom:-40,left:-40,width:160,height:160,borderRadius:'50%',background:'radial-gradient(circle, rgba(255,179,64,0.06) 0%, transparent 70%)',pointerEvents:'none'}}/>
          <div style={{fontSize:10,fontWeight:600,textTransform:'uppercase',letterSpacing:'1px',color:C.muted,marginBottom:10}}>Diesel fritt bilväg</div>
          <div style={{fontFamily:ffNum,fontSize:40,fontWeight:700,letterSpacing:'-2px',color:C.text}}>{(d.skordare.diesel.perM3+d.skotare.diesel.perM3).toFixed(2)}<span style={{fontSize:13,fontWeight:400,color:C.muted,fontFamily:ff}}> L/m³fub</span></div>
          <div style={{display:'flex',justifyContent:'center',gap:24,marginTop:14,fontSize:11,color:C.muted}}>
            <span><span style={{display:'inline-block',width:7,height:7,borderRadius:'50%',background:C.blue,marginRight:6}}/>Skördare {d.skordare.diesel.perM3} L</span>
            <span><span style={{display:'inline-block',width:7,height:7,borderRadius:'50%',background:C.accent,marginRight:6}}/>Skotare {d.skotare.diesel.perM3} L</span>
          </div>
        </div>

        {/* Tidsbalans */}
        <Section title="Tidsbalans" defaultOpen={true}>
          <div style={{marginTop:8}}/>
          <div style={{display:'flex',height:18,borderRadius:5,overflow:'hidden',gap:2,marginBottom:12}}>
            {d.skordare.g15>0 && <div style={{background:C.blue,width:`${(d.skordare.g15/(d.skordare.g15+d.skotare.g15))*100}%`,display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:9,fontWeight:600}}>{d.skordare.g15}h</div>}
            {d.skotare.g15>0 && <div style={{background:C.accent,width:`${(d.skotare.g15/(d.skordare.g15+d.skotare.g15))*100}%`,display:'flex',alignItems:'center',justifyContent:'center',color:'#0a1a10',fontSize:9,fontWeight:600}}>{d.skotare.g15}h</div>}
          </div>
          <div style={{display:'flex',justifyContent:'center',gap:20,fontSize:11,color:C.muted,marginBottom:10}}>
            <span style={{display:'flex',alignItems:'center',gap:4}}><span style={{width:6,height:6,borderRadius:2,background:C.blue,display:'inline-block'}}/>Skördare · {maskin}</span>
            <span style={{display:'flex',alignItems:'center',gap:4}}><span style={{width:6,height:6,borderRadius:2,background:C.accent,display:'inline-block'}}/>Skotare · {skotare||'Ej tilldelad'}</span>
          </div>
          {d.skordare.g15>0 && d.skotare.g15>0 && (
            <div style={{textAlign:'center',fontSize:12,color:C.accent,fontWeight:500}}>
              Skotare {Math.round((1-(d.skotare.g15/d.skordare.g15))*100)}% snabbare
            </div>
          )}
        </Section>

        {/* ── SKÖRDARE ── */}
        <div style={{display:'flex',alignItems:'center',gap:10,margin:'20px 0 8px',paddingLeft:4}}>
          <div style={{width:10,height:10,borderRadius:'50%',background:C.blue}}/>
          <span style={{fontFamily:ffNum,fontSize:18,fontWeight:600,letterSpacing:'-0.3px'}}>Skördare</span>
          <span style={{fontSize:11,color:C.muted}}>{maskin}</span>
        </div>

        <Section title="Tid" sub={`${produktiv}% produktiv`}>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginTop:12,marginBottom:16}}>
            {[{l:'Arbetstid',v:d.skordare.arbetstid},{l:'G15',v:d.skordare.g15},{l:'G0',v:d.skordare.g0}].map((t:any,i:number) => (
              <div key={i} style={{background:C.surface2,borderRadius:10,padding:'14px 12px',textAlign:'center'}}>
                <div style={{fontFamily:ffNum,fontSize:24,fontWeight:700,lineHeight:1,color:C.text}}>{t.v}</div>
                <div style={{fontSize:9,textTransform:'uppercase',letterSpacing:'0.6px',color:C.muted,marginTop:6}}>{t.l}</div>
              </div>
            ))}
          </div>
          <div style={{height:1,background:C.border,margin:'0 0 16px'}}/>
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8}}>
            {[{l:'Korta stopp',v:fmtMin(d.skordare.kortaStopp)},{l:'Avbrott',v:fmtMin(d.skordare.avbrott)},{l:'Rast',v:fmtMin(d.skordare.rast)},{l:'Tomgång',v:fmtMin(d.skordare.tomgang)}].map((t:any,i:number) => (
              <div key={i} style={{textAlign:'center'}}>
                <div style={{fontSize:9,color:C.muted,marginBottom:4,textTransform:'uppercase',letterSpacing:'0.5px'}}>{t.l}</div>
                <div style={{fontSize:13,fontWeight:600,fontVariantNumeric:'tabular-nums'}}>{t.v}</div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Produktion" sub={`${d.skordare.flertrad}% flerträd`}>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginTop:12}}>
            {[{l:'Stammar/G15',v:d.skordare.stamPerG15},{l:'m³/G15',v:d.skordare.m3PerG15},{l:'Stammar',v:d.skordare.antalStammar||stammar}].map((p:any,i:number) => (
              <div key={i} style={{background:C.surface2,borderRadius:10,padding:'14px 12px',textAlign:'center'}}>
                <div style={{fontFamily:ffNum,fontSize:20,fontWeight:700,lineHeight:1}}>{p.v}</div>
                <div style={{fontSize:9,textTransform:'uppercase',letterSpacing:'0.6px',color:C.muted,marginTop:6}}>{p.l}</div>
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
                <div key={i} style={{display:'flex',alignItems:'center',padding:'12px 0',borderBottom:i<d.skordare.sortiment.length-1?`1px solid ${C.border}`:'none'}}>
                  <span style={{fontSize:13,fontWeight:400,color:C.muted,flex:1}}>{s.namn}</span>
                  <span style={{fontSize:12,color:C.dim,minWidth:35,textAlign:'right',marginRight:12}}>{pct}%</span>
                  <span style={{fontFamily:ffNum,fontSize:13,fontWeight:600,minWidth:60,textAlign:'right',fontVariantNumeric:'tabular-nums'}}>{s.vol} m³</span>
                  <span style={{fontSize:11,color:C.muted,minWidth:45,textAlign:'right',marginLeft:8}}>{s.st} st</span>
                </div>
              );
            })}
            </div>
          </Section>
        )}

        <Section title="Diesel" sub={`${d.skordare.diesel.perM3} L/m³`}>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginTop:12}}>
            {[{l:'Totalt',v:d.skordare.diesel.tot,s:'L'},{l:'Per m³fub',v:d.skordare.diesel.perM3,s:'L'},{l:'Per timme',v:d.skordare.diesel.perTim,s:'L'}].map((x:any,i:number) => (
              <div key={i} style={{background:C.surface2,borderRadius:10,padding:'14px 12px',textAlign:'center'}}>
                <div style={{fontFamily:ffNum,fontSize:20,fontWeight:700,lineHeight:1}}>{x.v} <span style={{fontSize:11,color:C.muted,fontWeight:400,fontFamily:ff}}>{x.s}</span></div>
                <div style={{fontSize:9,textTransform:'uppercase',letterSpacing:'0.6px',color:C.muted,marginTop:6}}>{x.l}</div>
              </div>
            ))}
          </div>
        </Section>

        {d.skordare.avbrott_lista.length > 0 && (
          <Section title="Avbrott & stillestånd">
            <div style={{marginTop:4}}>
            {d.skordare.avbrott_lista.map((a:any,i:number) => (
              <div key={i} style={{display:'flex',justifyContent:'space-between',padding:'12px 0',borderBottom:i<d.skordare.avbrott_lista.length-1?`1px solid ${C.border}`:'none'}}>
                <span style={{fontSize:13,color:C.muted}}>{a.typ}</span>
                <span style={{fontSize:13,fontWeight:600,color:C.warn,fontVariantNumeric:'tabular-nums'}}>{fmtMin(a.tid)}</span>
              </div>
            ))}
            </div>
          </Section>
        )}

        {/* ── SKOTARE ── */}
        <div style={{display:'flex',alignItems:'center',gap:10,margin:'20px 0 8px',paddingLeft:4}}>
          <div style={{width:10,height:10,borderRadius:'50%',background:C.accent}}/>
          <span style={{fontFamily:ffNum,fontSize:18,fontWeight:600,letterSpacing:'-0.3px'}}>Skotare</span>
          <span style={{fontSize:11,color:C.muted}}>{skotare}</span>
        </div>

        <Section title="Tid" sub={`${produktivSt}% produktiv`}>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginTop:12,marginBottom:16}}>
            {[{l:'Arbetstid',v:d.skotare.arbetstid},{l:'G15',v:d.skotare.g15},{l:'G0',v:d.skotare.g0}].map((t:any,i:number) => (
              <div key={i} style={{background:C.surface2,borderRadius:10,padding:'14px 12px',textAlign:'center'}}>
                <div style={{fontFamily:ffNum,fontSize:24,fontWeight:700,lineHeight:1,color:C.text}}>{t.v}</div>
                <div style={{fontSize:9,textTransform:'uppercase',letterSpacing:'0.6px',color:C.muted,marginTop:6}}>{t.l}</div>
              </div>
            ))}
          </div>
          <div style={{height:1,background:C.border,margin:'0 0 16px'}}/>
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8}}>
            {[{l:'Korta stopp',v:fmtMin(d.skotare.kortaStopp)},{l:'Avbrott',v:fmtMin(d.skotare.avbrott)},{l:'Rast',v:fmtMin(d.skotare.rast)},{l:'Tomgång',v:fmtMin(d.skotare.tomgang)}].map((t:any,i:number) => (
              <div key={i} style={{textAlign:'center'}}>
                <div style={{fontSize:9,color:C.muted,marginBottom:4,textTransform:'uppercase',letterSpacing:'0.5px'}}>{t.l}</div>
                <div style={{fontSize:13,fontWeight:600,fontVariantNumeric:'tabular-nums'}}>{t.v}</div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Produktion" sub={`${d.skotare.lastrede} lastrede`}>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginTop:12}}>
            {[{l:'Antal lass',v:d.skotare.lass,s:''},{l:'Snitt lass',v:d.skotare.snittLass,s:'m³'},{l:'Lass/G15',v:d.skotare.lassPerG15,s:''},{l:'m³/G15',v:d.skotare.m3PerG15,s:''},{l:'Skotningsavst.',v:d.skotare.avstand,s:'m'}].map((p:any,i:number) => (
              <div key={i} style={{background:C.surface2,borderRadius:10,padding:'14px 12px',textAlign:'center'}}>
                <div style={{fontFamily:ffNum,fontSize:20,fontWeight:700,lineHeight:1}}>{p.v} <span style={{fontSize:11,color:C.muted,fontWeight:400,fontFamily:ff}}>{p.s}</span></div>
                <div style={{fontSize:9,textTransform:'uppercase',letterSpacing:'0.6px',color:C.muted,marginTop:6}}>{p.l}</div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Diesel" sub={`${d.skotare.diesel.perM3} L/m³`}>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginTop:12}}>
            {[{l:'Totalt',v:d.skotare.diesel.tot,s:'L'},{l:'Per m³fub',v:d.skotare.diesel.perM3,s:'L'},{l:'Per G15',v:d.skotare.diesel.perG15,s:'L'}].map((x:any,i:number) => (
              <div key={i} style={{background:C.surface2,borderRadius:10,padding:'14px 12px',textAlign:'center'}}>
                <div style={{fontFamily:ffNum,fontSize:20,fontWeight:700,lineHeight:1}}>{x.v} <span style={{fontSize:11,color:C.muted,fontWeight:400,fontFamily:ff}}>{x.s}</span></div>
                <div style={{fontSize:9,textTransform:'uppercase',letterSpacing:'0.6px',color:C.muted,marginTop:6}}>{x.l}</div>
              </div>
            ))}
          </div>
        </Section>

        {d.skotare.avbrott_lista.length > 0 && (
          <Section title="Avbrott & stillestånd">
            <div style={{marginTop:4}}>
            {d.skotare.avbrott_lista.map((a:any,i:number) => (
              <div key={i} style={{display:'flex',justifyContent:'space-between',padding:'12px 0',borderBottom:i<d.skotare.avbrott_lista.length-1?`1px solid ${C.border}`:'none'}}>
                <span style={{fontSize:13,color:C.muted}}>{a.typ}</span>
                <span style={{fontSize:13,fontWeight:600,color:C.warn,fontVariantNumeric:'tabular-nums'}}>{fmtMin(a.tid)}</span>
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

  if (valt) {
    return <ObjektDetalj obj={valt} onBack={() => setValt(null)} />;
  }

  return (
    <div style={{ position: 'fixed', top: 56, left: 0, right: 0, bottom: 0, background: C.bg, color: C.text, fontFamily: ff, WebkitFontSmoothing: 'antialiased', overflowY: 'auto' }}>
      <style>{globalCss}</style>

      <div style={{ padding: '28px 22px 0' }}>
        <div style={{ fontFamily: ffNum, fontSize: 28, fontWeight: 700, letterSpacing: '-1px', marginBottom: 22, color: C.text }}>Uppföljning</div>

        {/* Sök */}
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

        {/* Flikar — maskinvy tab style */}
        <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: 3, marginBottom: 14, width: 'fit-content' }}>
          {(['alla', 'pagaende', 'avslutat'] as const).map(f => (
            <button key={f} onClick={() => setFlik(f)} style={{
              padding: '6px 16px', border: 'none', borderRadius: 6,
              fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: ff,
              background: flik === f ? C.surface2 : 'transparent',
              color: flik === f ? C.text : C.muted,
              transition: 'all 0.15s',
            }}>
              {f === 'alla' ? 'Alla' : f === 'pagaende' ? 'Pågående' : 'Avslutade'}
            </button>
          ))}
        </div>

        {/* Filter — maskinvy badge style */}
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

      {/* Lista */}
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
