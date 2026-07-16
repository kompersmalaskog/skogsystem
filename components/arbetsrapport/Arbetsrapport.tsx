"use client";
import React, { useState, useEffect, useRef, useMemo, CSSProperties, ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { uppdateraVerifierat, upsertVerifierat, SPARA_FEL } from "@/lib/supabase-save";
import { extraMinPerDag } from "@/lib/arbetstid";
import { getRödaDagar } from "@/lib/roda-dagar";
import { formatObjektNamn } from "@/utils/formatObjektNamn";
import { vilaTrosklarFromAvtal } from "@/lib/gs-avtal";
import type { VilaTrosklar } from "@/lib/vilobrott";
import { hamtaAktuellaVilobrott, hamtaVilobrottForPeriod, analyseraOchSpara, type VilobrottRad } from "@/lib/vilobrott-storage";

/** Hämtar körsträcka (km) från /api/routing — cache → ORS → haversine-fallback.
 *  Returnerar { km, source } där source är 'cache' | 'ors' | 'fallback'. */
async function hämtaVägKm(fLat: number, fLng: number, tLat: number, tLng: number): Promise<{km:number; source:string}|null> {
  try {
    const r = await fetch(`/api/routing?fromLat=${fLat}&fromLng=${fLng}&toLat=${tLat}&toLng=${tLng}`);
    if (!r.ok) return null;
    const j = await r.json();
    if (typeof j?.km !== "number") return null;
    return { km: j.km, source: j.source || 'unknown' };
  } catch {
    return null;
  }
}

const css = `
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(14px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes scalePop {
    0%   { transform: scale(0.85); opacity: 0; }
    60%  { transform: scale(1.04); }
    100% { transform: scale(1);    opacity: 1; }
  }
  @keyframes checkPop {
    0%   { transform: scale(0);    opacity: 0; }
    50%  { transform: scale(1.1);  opacity: 1; }
    70%  { transform: scale(0.95); }
    100% { transform: scale(1);    opacity: 1; }
  }
  @keyframes checkDraw {
    from { stroke-dashoffset: 60; }
    to   { stroke-dashoffset: 0; }
  }
  @keyframes dimIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes sheetSlideUp {
    from { transform: translateY(100%); }
    to   { transform: translateY(0); }
  }
  @keyframes pulseDot {
    0%,100% { opacity: 1; transform: scale(1); }
    50%     { opacity: 0.4; transform: scale(0.7); }
  }
  @keyframes pulseLive {
    from { opacity: 1; }
    to   { opacity: 0.4; }
  }
  @keyframes slideIn {
    from { opacity: 0; transform: translateY(32px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes menuPulse {
    0%,100% { box-shadow: 0 0 0 0 rgba(255,149,0,0.5); }
    50%     { box-shadow: 0 0 0 6px rgba(255,149,0,0); }
  }
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  body { margin: 0; }
  *::-webkit-scrollbar { display: none; }
  * { scrollbar-width: none; -ms-overflow-style: none; }
`;

const C = {
  bg:"#000", card:"#1c1c1e", label:"#8e8e93", text:"#fff",
  line:"rgba(255,255,255,0.08)", blue:"#0a84ff", green:"#30d158",
  red:"#ff453a", orange:"#ff9f0a", ink:"#fff",
  dark:"#000", darkCard:"rgba(255,255,255,0.08)", darkLabel:"rgba(255,255,255,0.4)",
};
const T = { fontFamily:"'Inter',-apple-system,'SF Pro Display',sans-serif", color:C.text };
// Fasta bredder på siffror — förhindrar sidhopp när min går 9→10, km 99→100,
// timmar 09:59→10:00. Sprid som {...TNUM} på element som visar siffror.
const TNUM: CSSProperties = { fontVariantNumeric: "tabular-nums" };
// Typografi-skala från Uppföljning v6-designsystemet (design_handoff_uppfoljning_v6).
// Sprid som {...TYPE.x} — kombinera med {...TNUM} där siffror visas.
const TYPE = {
  largeTitle: { fontSize:34, fontWeight:700, letterSpacing:"-0.8px" },
  h1:         { fontSize:30, fontWeight:700, letterSpacing:"-0.8px", lineHeight:1.05 },
  h2:         { fontSize:20, fontWeight:700, letterSpacing:"-0.3px" },
  bigNum:     { fontSize:32, fontWeight:700, letterSpacing:"-0.8px", lineHeight:1 },
  body:       { fontSize:17, fontWeight:600, letterSpacing:"-0.2px" },
  bodyList:   { fontSize:16, fontWeight:600, letterSpacing:"-0.2px" },
  meta:       { fontSize:13, fontWeight:500 },
  caption:    { fontSize:12, fontWeight:400 },
  micro:      { fontSize:11, fontWeight:600, letterSpacing:"0.06em", textTransform:"uppercase" as const },
  // Utanför v6-skalan — medvetet undantag: timer-klockan på pågående pass.
  display:    { fontSize:72, fontWeight:600, letterSpacing:"-3px" },
} satisfies Record<string, CSSProperties>;
// Interna vy-headers (fixed/sticky) ska börja UNDER appens globala TopBar
// (56px + safe-area, zIndex 1000) — inte på viewportens y=0 som TopBar äger.
const HEADER_TOP = "calc(56px + env(safe-area-inset-top))";
const shell: CSSProperties  = { minHeight:"100vh", background:"#000", ...T, display:"flex", flexDirection:"column" as const, padding:"0 20px", boxSizing:"border-box" as const, width:"100%" };
const darkShell: CSSProperties = { ...shell };
const topBar: CSSProperties = { paddingTop:24, paddingBottom:12 };
const mid: CSSProperties    = { flex:1, display:"flex", flexDirection:"column" as const, justifyContent:"center", alignItems:"center", textAlign:"center" as const };
const bottom: CSSProperties = { paddingBottom:36, display:"flex", flexDirection:"column" as const, gap:10 };

// BottomNavBar-höjd inkl. safe-area-padding. Scrollbara vyer behöver
// `SCROLL_BOTTOM` som paddingBottom så sista innehållet inte skärs av navet.
const NAV_HEIGHT = 80;
const SCROLL_BOTTOM = NAV_HEIGHT + 40;

const btn = {
  primary:   { width:"100%", height:56, padding:"0 24px", background:"#2a2a2a", color:"#fff", border:"none", borderRadius:12, fontSize:17, fontWeight:600, cursor:"pointer", fontFamily:"inherit" } as CSSProperties,
  green:     { width:"100%", height:56, padding:"0 24px", background:C.green, color:"#fff", border:"none", borderRadius:12, fontSize:17, fontWeight:600, cursor:"pointer", fontFamily:"inherit" } as CSSProperties,
  secondary: { width:"100%", height:44, padding:"0", background:"transparent", color:"#8e8e93", border:"none", borderRadius:0, fontSize:15, fontWeight:500, cursor:"pointer", fontFamily:"inherit" } as CSSProperties,
  ghost:     { width:"100%", padding:"14px 24px", background:"transparent", color:C.blue, border:`1.5px solid ${C.blue}`, borderRadius:12, fontSize:15, fontWeight:600, cursor:"pointer", fontFamily:"inherit" } as CSSProperties,
  danger:    { width:"100%", padding:"17px 24px", background:"transparent", color:C.red, border:`1.5px solid rgba(255,69,58,0.3)`, borderRadius:12, fontSize:17, fontWeight:600, cursor:"pointer", fontFamily:"inherit" } as CSSProperties,
  textBack:  { width:"100%", height:44, padding:"0", background:"transparent", color:"#8e8e93", border:"none", borderRadius:0, fontSize:15, fontWeight:500, cursor:"pointer", fontFamily:"inherit" } as CSSProperties,
};

const månadsNamn = (offset = 0) => {
  const d = new Date();
  d.setMonth(d.getMonth() + offset);
  return d.toLocaleString('sv-SE', { month: 'long', year: 'numeric' });
};

const symbolText = (s: number) => {
  if (s <= 2) return 'Klart';
  if (s <= 4) return 'Halvklart';
  if (s <= 6) return 'Mulet';
  if (s <= 10) return 'Regn';
  if (s <= 14) return 'Snöblandat regn';
  if (s <= 18) return 'Snö';
  if (s <= 22) return 'Åska';
  return 'Varierat';
};

const tim = (a,b) => {
  if(!a||!b) return 0;
  const [sh,sm]=a.split(":").map(Number),[eh,em]=b.split(":").map(Number); 
  return Math.max(0,eh*60+em-sh*60-sm); 
};
const fmt = (m) => { 
  const h=Math.floor(m/60),min=m%60; 
  if(!h)return`${min} min`; 
  if(!min)return`${h} tim`; 
  return`${h} tim ${min} min`;
};
const hälsning = () => {
  const h = new Date().getHours();
  if(h < 5) return "God natt";
  if(h < 10) return "God morgon";
  if(h < 12) return "God förmiddag";
  if(h < 17) return "God eftermiddag";
  if(h < 22) return "God kväll";
  return "God natt";
};

/* Klockslag HH:MM från Date */
const nuKlock = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
};

/** Nu-tid avrundad nedåt till närmsta 5-minuters-intervall ("HH:MM"). */
const nuKlock5 = () => {
  const d = new Date();
  const h = String(d.getHours()).padStart(2,'0');
  const m = String(Math.floor(d.getMinutes()/5)*5).padStart(2,'0');
  return `${h}:${m}`;
};

/* ── Extra-aktiviteter ── */
type AktivitetTyp = 'rotben'|'reservdelar'|'markagare'|'service'|'mote'|'flytt'|'annat'|'utbildning'|'ledig';
const AKTIVITETER: { typ: AktivitetTyp; label: string; icon: string; debDefault: boolean }[] = [
  { typ:'rotben',      label:'Kapa rotben',         icon:'content_cut',     debDefault:false },
  { typ:'reservdelar', label:'Hämta reservdelar',   icon:'build',           debDefault:false },
  { typ:'service',     label:'Service',             icon:'engineering',     debDefault:false },
  { typ:'utbildning',  label:'Utbildning',          icon:'school',          debDefault:false },
  { typ:'markagare',   label:'Markägarmöte',        icon:'handshake',       debDefault:true  },
  { typ:'flytt',       label:'Flytt av maskin',     icon:'local_shipping',  debDefault:true  },
  { typ:'ledig',       label:'Ledig',               icon:'home',            debDefault:false },
  { typ:'mote',        label:'Möte',                icon:'groups',          debDefault:false },
  { typ:'annat',       label:'Annat',               icon:'more_horiz',      debDefault:false },
];
/** Typer som visas i "Starta extra arbete"-vyn (morgon + kväll). */
const EXTRA_ARBETE_TYPER: AktivitetTyp[] = ['reservdelar','service','utbildning','markagare','flytt','ledig','annat'];
const aktLabel = (typ: string|null|undefined) => AKTIVITETER.find(a=>a.typ===typ)?.label || 'Extra';
const aktIcon  = (typ: string|null|undefined) => AKTIVITETER.find(a=>a.typ===typ)?.icon  || 'more_horiz';

/** Sekunder mellan start_tid (HH:MM eller HH:MM:SS) och nu. Returnerar 0 om start saknas. */
const sekDiff = (start: string|null|undefined): number => {
  if (!start) return 0;
  const p = start.split(':').map(Number);
  const sh = p[0]||0, sm = p[1]||0, ss = p[2]||0;
  const now = new Date();
  const startMs = new Date(now.getFullYear(), now.getMonth(), now.getDate(), sh, sm, ss).getTime();
  return Math.max(0, Math.floor((now.getTime() - startMs) / 1000));
};

/** Formatera sekunder som HH:MM:SS. */
const fmtHMS = (sek: number): string => {
  const h = Math.floor(sek / 3600);
  const m = Math.floor((sek % 3600) / 60);
  const s = sek % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
};

/* Beräkna minuter mellan två tids-strängar HH:MM (eller HH:MM:SS) */
const minutDiff = (start: string|null|undefined, slut: string|null|undefined) => {
  if(!start) return 0;
  const slutEff = slut || nuKlock();
  const [sh,sm] = start.slice(0,5).split(':').map(Number);
  const [eh,em] = slutEff.slice(0,5).split(':').map(Number);
  return Math.max(0, eh*60+em - sh*60-sm);
};

/* ── Sub-komponenter ── */
const BackBtn = ({ onClick }: { onClick: () => void; light?: boolean }) => (
  <button onClick={onClick} style={{ width:44,height:44,borderRadius:12,background:"rgba(255,255,255,0.1)",border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
    <svg width="9" height="16" viewBox="0 0 9 16" fill="none"><path d="M8 1L1 8L8 15" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
  </button>
);

const secHead: CSSProperties = { margin:"0 0 10px",...TYPE.micro,color:"#8e8e93" };

function BottomNavBar({ aktiv, onNav }: { aktiv: string; onNav: (s: string) => void }) {
  return (
    <nav style={{ position:"fixed",bottom:0,left:0,width:"100%",zIndex:50,display:"flex",justifyContent:"space-around",alignItems:"center",padding:"12px 16px 24px",background:"rgba(31,31,31,0.7)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",borderRadius:"12px 12px 0 0" }}>
      {[
        {icon:"today",key:"morgon",label:"Dag"},
        {icon:"calendar_month",key:"kalender",label:"Kalender"},
        {icon:"bar_chart",key:"mintid",label:"Min tid"},
        {icon:"settings",key:"inst",label:"Inställningar"},
      ].map(n=>(
        <button key={n.key} onClick={()=>onNav(n.key)} style={{ display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",color:aktiv===n.key?"#0a84ff":"#8e8e93",background:"none",border:"none",cursor:"pointer",fontFamily:"'Inter',sans-serif",borderRadius:12,height:48,width:64,padding:0 }}>
          <span className="material-symbols-outlined" style={{ fontSize:22,marginBottom:2,fontVariationSettings:aktiv===n.key?"'FILL' 1":"'FILL' 0" }}>{n.icon}</span>
          <span style={{ fontSize:10,fontWeight:aktiv===n.key?600:500 }}>{n.label}</span>
        </button>
      ))}
    </nav>
  );
}
const Label = ({ children, style }: { children: ReactNode; style?: CSSProperties }) => (
  <p style={{ ...secHead,...style }}>{children}</p>
);

const Card = ({ children, style, onClick }: { children?: ReactNode; onClick?: () => void; style?: CSSProperties }) => (
  <div onClick={onClick} style={{ background:"#1c1c1e",borderRadius:12,padding:"18px 20px",marginBottom:10,border:"1px solid rgba(255,255,255,0.06)",cursor:onClick?"pointer":"default",...style }}>{children}</div>
);

const ChevronRight = ({ light = false }: { light?: boolean }) => (
  <svg width="8" height="14" viewBox="0 0 8 14" fill="none">
    <path d="M1 1l6 6-6 6" stroke="rgba(255,255,255,0.3)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const CheckCircle = ({ color=C.green, size=80 }) => (
  <div style={{ width:size,height:size,borderRadius:"50%",background:color,display:"flex",alignItems:"center",justifyContent:"center" }}>
    <svg width={size*0.44} height={size*0.44} viewBox="0 0 24 24" fill="none">
      <path d="M5 12l5 5L19 7" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  </div>
);

/* iOS-stil scroll-wheel — snap-to-item, klick = välj, scroll = byt */
const Wheel = ({ value, onChange, min=0, max=59, step=1, pad=2, width=64 }:
  { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; pad?: number; width?: number }) => {
  const items = useMemo(() => {
    const arr: number[] = [];
    for (let i = min; i <= max; i += step) arr.push(i);
    return arr;
  }, [min, max, step]);
  const ITEM_H = 36;
  const VISIBLE = 5;
  const PAD = ITEM_H * Math.floor(VISIBLE / 2);
  const ref = useRef<HTMLDivElement>(null);
  const scrollT = useRef<any>(null);
  const ignoreNext = useRef(false);

  const closestIdx = useMemo(() => {
    let best = 0, bestDiff = Math.abs(items[0] - value);
    for (let i = 1; i < items.length; i++) {
      const d = Math.abs(items[i] - value);
      if (d < bestDiff) { best = i; bestDiff = d; }
    }
    return best;
  }, [items, value]);

  useEffect(() => {
    if (!ref.current) return;
    const target = closestIdx * ITEM_H;
    if (Math.abs(ref.current.scrollTop - target) > 1) {
      ignoreNext.current = true;
      ref.current.scrollTop = target;
    }
  }, [closestIdx]);

  const handleScroll = () => {
    if (!ref.current) return;
    if (ignoreNext.current) { ignoreNext.current = false; return; }
    clearTimeout(scrollT.current);
    scrollT.current = setTimeout(() => {
      if (!ref.current) return;
      const idx = Math.round(ref.current.scrollTop / ITEM_H);
      const clampedIdx = Math.max(0, Math.min(items.length - 1, idx));
      const newVal = items[clampedIdx];
      if (newVal !== value) onChange(newVal);
    }, 130);
  };

  return (
    <div style={{ position:"relative", width, height: VISIBLE * ITEM_H, overflow:"hidden" }}>
      <div style={{ position:"absolute", left:0, right:0, top:PAD, height:ITEM_H, background:"rgba(255,255,255,0.06)", borderRadius:8, pointerEvents:"none" }}/>
      <div style={{ position:"absolute", left:0, right:0, top:0, height:PAD, background:"linear-gradient(to bottom,#1c1c1e,rgba(28,28,30,0))", pointerEvents:"none", zIndex:2 }}/>
      <div style={{ position:"absolute", left:0, right:0, bottom:0, height:PAD, background:"linear-gradient(to top,#1c1c1e,rgba(28,28,30,0))", pointerEvents:"none", zIndex:2 }}/>
      <div ref={ref} onScroll={handleScroll} style={{
        height:"100%", overflowY:"scroll",
        scrollSnapType:"y mandatory",
        WebkitOverflowScrolling:"touch",
      }}>
        <div style={{ height:PAD }}/>
        {items.map((v, i) => (
          <div
            key={v}
            onClick={() => { ref.current?.scrollTo({ top: i * ITEM_H, behavior:"smooth" }); }}
            style={{
              height: ITEM_H,
              display:"flex", alignItems:"center", justifyContent:"center",
              fontSize:24, fontWeight:600, color:"#fff",
              scrollSnapAlign:"center",
              opacity: i === closestIdx ? 1 : 0.35,
              transition: "opacity 0.15s",
              cursor:"pointer",
              userSelect:"none",
              fontVariantNumeric:"tabular-nums",
            }}
          >{String(v).padStart(pad,"0")}</div>
        ))}
        <div style={{ height:PAD }}/>
      </div>
    </div>
  );
};

const TimePicker = ({ value, onChange, label }: { value: string; onChange: (v: string) => void; label?: string }) => {
  const [h,m] = value.split(":").map(Number);
  const p2 = (n:number) => String(n).padStart(2,"0");
  return (
    <div style={{ marginBottom:28 }}>
      {label && <Label style={{ textAlign:"center" }}>{label}</Label>}
      <div style={{ display:"flex",justifyContent:"center",alignItems:"center",gap:6 }}>
        <Wheel value={h} onChange={v=>onChange(`${p2(v)}:${p2(m)}`)} min={0} max={23}/>
        <span style={{ fontSize:30,fontWeight:600,color:"#fff",lineHeight:1 }}>:</span>
        <Wheel value={m} onChange={v=>onChange(`${p2(h)}:${p2(v)}`)} min={0} max={55} step={5}/>
      </div>
    </div>
  );
};

const MinPicker = ({ value, onChange, label }: { value: number; onChange: (v: number) => void; label?: string }) => {
  const h=Math.floor(value/60),m=value%60;
  return (
    <div style={{ marginBottom:28 }}>
      {label && <Label style={{ textAlign:"center" }}>{label}</Label>}
      <div style={{ display:"flex",justifyContent:"center",alignItems:"center",gap:6 }}>
        <Wheel value={h} onChange={v=>onChange(v*60+m)} min={0} max={8} pad={1} width={48}/>
        <span style={{ fontSize:13,color:C.label,fontWeight:600,marginLeft:2,marginRight:8 }}>tim</span>
        <Wheel value={m} onChange={v=>onChange(h*60+v)} min={0} max={55} step={5}/>
        <span style={{ fontSize:13,color:C.label,fontWeight:600,marginLeft:2 }}>min</span>
      </div>
    </div>
  );
};

const KmPicker = ({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) => {
  const h=Math.floor(value/100),t=Math.floor((value%100)/10),e=value%10;
  const D=(v,add)=>(
    <div style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:6 }}>
      <button style={{ width:44,height:40,background:"rgba(255,255,255,0.08)",border:"none",borderRadius:10,fontSize:16,cursor:"pointer",color:"#fff" }} onClick={()=>onChange(Math.min(999,value+add))}>▲</button>
      <div style={{ width:48,height:52,background:"rgba(255,255,255,0.06)",borderRadius:12,fontSize:28,fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff" }}>{v}</div>
      <button style={{ width:44,height:40,background:"rgba(255,255,255,0.08)",border:"none",borderRadius:10,fontSize:16,cursor:"pointer",color:"#fff" }} onClick={()=>onChange(Math.max(0,value-add))}>▼</button>
    </div>
  );
  return (
    <div style={{ marginBottom:28 }}>
      <Label style={{ textAlign:"center" }}>{label}</Label>
      <div style={{ display:"flex",justifyContent:"center",alignItems:"center",gap:8 }}>
        {D(h,100)}{D(t,10)}{D(e,1)}
        <span style={{ ...TYPE.meta,color:C.label,fontWeight:600,marginLeft:6 }}>km</span>
      </div>
    </div>
  );
};

/* ─── DELAD OBJEKTVÄLJARE ──────────────────────────────
   Kortlista med gruppering (pågående/planerade/avslutade), sök och
   blå bock på valt. Ersätter de tre live-väljarna (A: Plats, D:
   redigering, C: efter-stopp) — steg 1 kopplar in A.
──────────────────────────────────────────────────────── */
// Visnings-title-case: bara ord i HELVERSALER görs om ('ROGER' → 'Roger').
// Rör aldrig datat — ren visning. Timestamp-namn passerar orörda (siffror).
const visningsNamn = (s: string) => (s || '').trim().split(/\s+/).map(w =>
  w.length > 1 && w === w.toUpperCase() && /[A-ZÅÄÖ]/.test(w)
    ? w.charAt(0) + w.slice(1).toLowerCase()
    : w
).join(' ');

const ObjektValjarLista = ({ objekt, valtId, onVälj, tillåtInget = false }: {
  objekt: any[]; valtId: string | null; onVälj: (o: any | null) => void; tillåtInget?: boolean;
}) => {
  const [sök, setSök] = useState("");
  const [visaAvslutade, setVisaAvslutade] = useState(false);

  // Äldre statusvärden (skordning/skotning/klar) sorteras in i närmaste
  // grupp; oplanerad/okänd hamnar bland planerade.
  const grupp = (o: any): 'pagaende' | 'planerad' | 'avslutad' => {
    const s = (o.status || '').toLowerCase();
    if (s === 'pagaende' || s === 'skordning' || s === 'skotning') return 'pagaende';
    if (s === 'avslutat' || s === 'klar') return 'avslutad';
    return 'planerad';
  };

  const bock = (
    <div style={{ width:20,height:20,borderRadius:"50%",background:"#0a84ff",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
      <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l3 3L9 1" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
    </div>
  );

  const kort = (o: any, prick = false) => {
    // Metaraden ska bara innehålla det som TILLFÖR något utöver huvudraden:
    // - VO visas bara när det är ett riktigt VO-nummer (siffror) — inte
    //   maskingenererade nycklar ("_050624-132829").
    // - Markägare/åtgärd hoppas över om något av deras ord (≥3 tecken) redan
    //   syns i objektnamnet ("Stefan Svensson · Gallring" upprepar inte
    //   "Stefan Svensson" eller "Första gallring").
    const namnOrd = new Set(visningsNamn(o.namn).toLowerCase().split(/[^a-zåäöé0-9]+/i).filter(w => w.length >= 3));
    const upprepar = (s: string) => visningsNamn(s).toLowerCase().split(/[^a-zåäöé0-9]+/i).filter(w => w.length >= 3).some(w => namnOrd.has(w));
    const voVisas = o.vo != null && /^\d+$/.test(String(o.vo)) ? `VO ${o.vo}` : null;
    const ägareVisas = o.ägare && !upprepar(o.ägare) ? visningsNamn(o.ägare) : null;
    const atgardVisas = o.atgard && !upprepar(o.atgard) ? o.atgard : null;
    const meta = [voVisas, ägareVisas, atgardVisas].filter(Boolean).join(' · ');
    return (
      <button key={o.id} onClick={() => onVälj(o)}
        style={{ width:"100%",display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,background:"#1c1c1e",border:"1px solid rgba(255,255,255,0.06)",borderRadius:12,padding:"13px 14px",minHeight:64,boxSizing:"border-box",marginBottom:8,cursor:"pointer",fontFamily:"inherit",textAlign:"left" }}>
        {/* Enradiga kort (utan metarad) centreras vertikalt via flex-raden +
            minHeight — samma korthöjd som tvåradiga, medvetet enradigt. */}
        <div style={{ minWidth:0 }}>
          <p style={{ margin:0,...TYPE.bodyList,color:"#fff",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{visningsNamn(o.namn)}</p>
          {meta && <p style={{ margin:"2px 0 0",...TYPE.meta,color:"#8e8e93",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",...TNUM }}>{meta}</p>}
        </div>
        <div style={{ display:"flex",alignItems:"center",gap:8,flexShrink:0 }}>
          {prick && <div style={{ width:9,height:9,borderRadius:"50%",background:"#30d158" }}/>}
          {valtId === o.id && bock}
        </div>
      </button>
    );
  };

  const q = sök.trim().toLowerCase();
  const träffar = q
    ? objekt.filter(o =>
        (o.namn || '').toLowerCase().includes(q) ||
        String(o.vo ?? '').toLowerCase().includes(q) ||
        (o.ägare || '').toLowerCase().includes(q))
    : null;

  const pagaende = objekt.filter(o => grupp(o) === 'pagaende');
  const planerade = objekt.filter(o => grupp(o) === 'planerad');
  const avslutade = objekt.filter(o => grupp(o) === 'avslutad');

  return (
    <div style={{ padding:"12px 16px 24px" }}>
      {/* Sök */}
      <div style={{ display:"flex",alignItems:"center",gap:8,background:"#1c1c1e",border:"1px solid rgba(255,255,255,0.06)",borderRadius:10,padding:"10px 12px",marginBottom:14 }}>
        <span className="material-symbols-outlined" style={{ fontSize:18,color:"#8e8e93" }}>search</span>
        <input value={sök} onChange={e => setSök(e.target.value)} placeholder="Sök objekt…"
          style={{ flex:1,background:"none",border:"none",outline:"none",color:"#fff",fontSize:15,fontFamily:"inherit",padding:0 }}/>
      </div>

      {tillåtInget && !q && (
        <button onClick={() => onVälj(null)}
          style={{ width:"100%",display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,background:"#1c1c1e",border:"1px solid rgba(255,255,255,0.06)",borderRadius:12,padding:"13px 14px",minHeight:64,boxSizing:"border-box",marginBottom:14,cursor:"pointer",fontFamily:"inherit",textAlign:"left" }}>
          <span style={{ ...TYPE.bodyList,color:"#8e8e93" }}>Inget objekt</span>
          {valtId == null && bock}
        </button>
      )}

      {träffar ? (
        // Sökläge: platt träfflista utan gruppering
        träffar.length > 0
          ? träffar.map(o => kort(o, grupp(o) === 'pagaende'))
          : <p style={{ margin:"24px 0",textAlign:"center",...TYPE.meta,color:"#8e8e93" }}>Inga objekt matchar &quot;{sök.trim()}&quot;</p>
      ) : (<>
        {pagaende.length > 0 && (<>
          <h4 style={{ ...secHead,marginBottom:8 }}>Pågående</h4>
          {pagaende.map(o => kort(o, true))}
        </>)}
        {planerade.length > 0 && (<>
          <h4 style={{ ...secHead,marginTop:pagaende.length > 0 ? 16 : 0,marginBottom:8 }}>Planerade</h4>
          {planerade.map(o => kort(o))}
        </>)}
        {avslutade.length > 0 && (
          visaAvslutade ? (<>
            <h4 style={{ ...secHead,marginTop:16,marginBottom:8 }}>Avslutade</h4>
            {avslutade.map(o => kort(o))}
          </>) : (
            <button onClick={() => setVisaAvslutade(true)}
              style={{ width:"100%",marginTop:12,padding:"12px 0",background:"none",border:"none",color:"#0a84ff",...TYPE.meta,cursor:"pointer",fontFamily:"inherit",...TNUM }}>
              Visa avslutade ({avslutade.length})
            </button>
          )
        )}
      </>)}
    </div>
  );
};


/* ═══════════════════════════════════════════════════════
   MAIN
═══════════════════════════════════════════════════════ */
export default function Arbetsrapport() {
  const [steg,  setSteg]   = useState("morgon");
  const [kmM,   setKmM]    = useState<{km:number}|null>(null);
  const [kmK,   setKmK]    = useState<{km:number}|null>(null);
  const [kmBerakning, setKmBerakning] = useState<number|null>(null);
  const [extra, setExtra]  = useState([]);
  // Dagens tider — synkas från arbetsdag-tabellen via useEffect nedan.
  // Tomma initialvärden (inte hårdkodade defaults) så vi inte råkar skriva
  // pseudo-data till DB om bekraftaDagen körs innan synk landat.
  const [start, setStart]  = useState("");
  const [slut,  setSlut]   = useState("");
  const [rast,  setRast]   = useState(0);
  // Per-fält dirty-tracking: säger om föraren har redigerat fältet lokalt
  // sedan synk. Synk-useEffect skriver ALDRIG över ett ändrat fält — men
  // andra fält uppdateras fritt från DB. Frys bara det föraren faktiskt rört.
  const [startÄndrad, setStartÄndrad] = useState(false);
  const [slutÄndrad,  setSlutÄndrad]  = useState(false);
  const [rastÄndrad,  setRastÄndrad]  = useState(false);
  const [trakÄndrad,  setTrakÄndrad]  = useState(false);
  // Felmeddelande under Bekräfta-knappen när guarden blockerar (tomma tider).
  const [bekraftaFel, setBekraftaFel] = useState<string | null>(null);
  const [ändring,setÄ]     = useState(null);
  const [betald,setBetald] = useState(0);
  const [trak,  setTrak]   = useState<{summa:number}|null>(null);
  const [trakÖppen, setTrakÖppen] = useState(false);
  const [dagTyp,setDagTyp] = useState("normal");
  const [hemadress, setHemadress] = useState("");
  const [redigHem, setRedigHem] = useState("");
  const [btBil, setBtBil] = useState("");
  const [redigBt, setRedigBt] = useState("");
  const [kvAvTyp,  setKvAvTyp]  = useState(null);
  const [kvAvBesk, setKvAvBesk] = useState("");
  const [kvAvDeb,  setKvAvDeb]  = useState(false);
  const [kvAvObj,  setKvAvObj]  = useState(null);
  const [kvAvVäljer, setKvAvVäljer] = useState(false);
  const [redStart, setRedStart] = useState("06:00");
  const [redSlut,  setRedSlut]  = useState("16:00");
  const [redRast,  setRedRast]  = useState(0);
  const [redKm,    setRedKm]    = useState(0);
  const [redKmBerakning, setRedKmBerakning] = useState<number|null>(null);
  const [redKmChain, setRedKmChain] = useState<{fromLabel:string;toLabel:string;km:number;source:string}[]|null>(null);
  const [redAnl,   setRedAnl]   = useState("");
  const [redVy,    setRedVy]    = useState("översikt");
  const [redDagar, setRedDagar] = useState<Record<string, {start:string;slut:string;rast:number;km:number;anl:string}>>({});
  // Godkänd-status per period (YYYY-MM -> status) — hämtas från loneunderlag
  // så "Godkänd" överlever omladdning; inte en sessionsflagga.
  const [lönStatusPerPeriod, setLönStatusPerPeriod] = useState<Record<string,string>>({});
  const [lönBekräfta, setLönBekräfta] = useState(false);
  const [lönOffset, setLönOffset] = useState(0);
  const [lönVy, setLönVy] = useState<'översikt'|'detaljer'>('översikt');
  const [sparatToast, setSparatToast] = useState(false);
  const [igårKopierat, setIgårKopierat] = useState(false);
  const [pamOpen, setPamOpen] = useState<null | 'obekraftad' | 'pagaende' | 'dagligTid'>(null);
  const [pushEnhetsNamn, setPushEnhetsNamn] = useState<string | null>(null);
  const [visaÖvrigt, setVisaÖvrigt] = useState(false);
  const [efterStoppSheet, setEfterStoppSheet] = useState<any | null>(null);
  const [heldagsMeddelande, setHeldagsMeddelande] = useState<{text:string;icon?:string;typ:string}|null>(null);
  const [bekräftelseVisa, setBekräftelseVisa] = useState(false);
  const [visaTiderSheet, setVisaTiderSheet] = useState(false);
  const [visaKmSheet, setVisaKmSheet] = useState(false);
  const [extraTidData, setExtraTidData] = useState<any[]>([]);
  const [årsData, setÅrsData] = useState<any[]>([]);
  const [lönSparar, setLönSparar] = useState(false);
  const [lönFel, setLönFel] = useState("");
  const [månadsKlar, setMånadsKlar] = useState(false);
  const [kalÅr, setKalÅr] = useState(new Date().getFullYear());
  const [kalMånad, setKalMånad] = useState(new Date().getMonth());
  const [dagData, setDagData] = useState<Record<string, any>>({});

  // temp states för ändra tid/km
  const [tS,setTS]=useState("06:12"),[tE,setTE]=useState("16:45"),[tR,setTR]=useState(30);
  const [tMK,setTMK]=useState(72),[tKK,setTKK]=useState(75);
  const [anledn,setAnledn]=useState("");

  // manuell dag
  const [mStart,setMStart]=useState(()=>nuKlock5()),[mSlut,setMSlut]=useState(()=>nuKlock5()),[mRast,setMRast]=useState(0),[mBesk,setMBesk]=useState("");

  // historik redigering
  const [redDag,setRedDag]=useState(null);

  // Väder
  const [vader, setVader] = useState<{
    temp: number;
    symbol: number;
    beskrivning: string;
  } | null>(null);

  // Supabase data
  const [medarbetare, setMedarbetare] = useState<any>(null);
  const [gsAvtal, setGsAvtal] = useState<any>(null);
  const [objektLista, setObjektLista] = useState<any[]>([]);
  const [historik, setHistorik] = useState<any[]>([]);
  const [dagensObjekt, setDagensObjekt] = useState<string | null>(null);
  const [valtObjektId, setValtObjektId] = useState<string | null>(null);
  const [visaObjektVäljare, setVisaObjektVäljare] = useState(false);
  const [redObjektId, setRedObjektId] = useState<string | null>(null);
  const [redMaskinId, setRedMaskinId] = useState<string | null>(null);
  const [visaRedObjektVäljare, setVisaRedObjektVäljare] = useState(false);
  const [visaRedMaskinVäljare, setVisaRedMaskinVäljare] = useState(false);
  const [visaRedRastPicker, setVisaRedRastPicker] = useState(false);
  const [visaRedKmSheet, setVisaRedKmSheet] = useState(false);
  const [redTmpKmM, setRedTmpKmM] = useState(0);
  const [redTmpKmK, setRedTmpKmK] = useState(0);
  // Vila-trösklar från gs_avtal (krav_h, varning_h, fönster). Läses i samma
  // Promise.all som gsAvtal — sätts via vilaTrosklarFromAvtal nedan.
  const [trosklar, setTrosklar] = useState<VilaTrosklar | null>(null);
  // Vilobrott från DB. aktuella = senaste 14 dagar för Dag-vyn + Min tid-översikten.
  // periodVilobrott = brott inom Vila-flikens valda period. null = laddar, [] = inga brott.
  const [aktuellaVilobrott, setAktuellaVilobrott] = useState<VilobrottRad[]>([]);
  const [periodVilobrott, setPeriodVilobrott] = useState<VilobrottRad[] | null>(null);
  // Inline-expansion av rödramat kort i Vila-fliken — visar orsak/kompensation.
  const [vilaKortExpanded, setVilaKortExpanded] = useState<string | null>(null);
  // Orsaks-flöde när föraren bekräftar dagen med obesvarade brott. Kön fryses
  // vid flödesstart och byggs INTE om från re-fetchad aktuellaVilobrott — annars
  // skulle besvarade brott försvinna ur listan och idx peka fel.
  const [vilobrottKö, setVilobrottKö] = useState<VilobrottRad[]>([]);
  const [vilobrottIdx, setVilobrottIdx] = useState(0);
  const [vilobrottOrsakVal, setVilobrottOrsakVal] = useState<'oforutsedd' | 'akut_jour' | 'planerad_avtal' | 'annat' | null>(null);
  const [vilobrottOrsakFritext, setVilobrottOrsakFritext] = useState("");
  const [visaHelÅrVila, setVisaHelÅrVila] = useState(false);
  const [vilaPeriod, setVilaPeriod] = useState<'7d'|'30d'|'månad'|'år'>('7d');
  const [vilaMånad, setVilaMånad] = useState(new Date().getMonth());
  const [vilaÅrExpand, setVilaÅrExpand] = useState<number|null>(null);
  const [visaAllaDygnsvila, setVisaAllaDygnsvila] = useState(false);
  const [visaAllaVeckovila, setVisaAllaVeckovila] = useState(false);
  const [minTidFlik, setMinTidFlik] = useState<'översikt'|'saldon'|'vila'|'monster'|'lön'>('översikt');
  const [atkVal, setAtkVal] = useState<'ledig'|'kontant'|'pension'|null>(null);
  const [atkValSparat, setAtkValSparat] = useState<any>(null);
  const [fortnoxSaldo, setFortnoxSaldo] = useState<{
    semester:{betalda:number;obetalda:number;sparade:number;uttagna:number;kvar:number};
    atk:{saldo_kr:number;timmar:number|null};
    lon:{timlon:number};
  } | null>(null);
  // 'tom' = anropet lyckades men medarbetaren saknar lönesystem-koppling (404)
  // — inte samma sak som 'error' (nätverk/Fortnox nere/timeout).
  const [fortnoxSaldoStatus, setFortnoxSaldoStatus] = useState<'idle'|'loading'|'ok'|'tom'|'error'>('idle');
  const [kmSummary, setKmSummary] = useState<{totalKm:number;ersattningsKm:number}|null>(null);
  const [maskinNamn, setMaskinNamn] = useState<string | null>(null);
  const [maskinNamnMap, setMaskinNamnMap] = useState<Record<string, string>>({});

  // Extra-aktiviteter — pågående + ny aktivitet
  const [pagaendeAktiviteter, setPagaendeAktiviteter] = useState<any[]>([]);
  const [stoppaSlutTid, setStoppaSlutTid] = useState(nuKlock());
  const [stoppaTarget, setStoppaTarget] = useState<any>(null);
  const [tidslinjeDatum, setTidslinjeDatum] = useState<string|null>(null);
  const [extraDagData, setExtraDagData] = useState<Record<string, any[]>>({});

  useEffect(() => {
    Promise.all([
      supabase.auth.getUser().then(({ data: { user } }) =>
        user?.email
          ? supabase.from("medarbetare").select("*").eq("epost", user.email).single()
          : supabase.from("medarbetare").select("*").limit(1).single()
      ),
      (()=>{ const idag=new Date().toISOString().slice(0,10); return supabase.from("gs_avtal").select("*").lte("giltigt_fran",idag).or(`giltigt_till.is.null,giltigt_till.gte.${idag}`).order("giltigt_fran",{ascending:false}).limit(1).maybeSingle(); })(),
      supabase.from("dim_objekt").select("objekt_id, object_name, vo_nummer, skogsagare, huvudtyp, atgard, latitude, longitude").order("object_name"),
      // Status för objektväljarens gruppering (pågående/planerade/avslutade).
      // objekt-tabellen matchas mot dim_objekt via vo_nummer — exakt likhet.
      supabase.from("objekt").select("vo_nummer, status"),
    ]).then(([med, avt, obj, objStatus]) => {
      if(med.data) {
        setMedarbetare(med.data);
        setHemadress(med.data.hemadress || "");
        setBtBil(med.data.bt_bil || "");
        // Fetch maskin namn
        if(med.data.maskin_id) {
          supabase.from("maskiner").select("namn").eq("maskin_id", med.data.maskin_id).single()
            .then(r => { if(r.data?.namn) setMaskinNamn(r.data.namn); });
        }
        // Fetch historik for this medarbetare
        supabase.from("arbetsdag").select("*").eq("medarbetare_id", med.data.id).order("datum",{ascending:false}).limit(60)
          .then(res => { if(res.data) setHistorik(res.data); });
        // Fetch year data for Min tid
        const årStart = `${new Date().getFullYear()}-01-01`;
        supabase.from("arbetsdag").select("*").eq("medarbetare_id", med.data.id).gte("datum", årStart).order("datum",{ascending:true})
          .then(res => { if(res.data) setÅrsData(res.data); });
        // Fetch ATK-val
        // maybeSingle: 0 rader är normalfallet innan valet gjorts — .single() gav 406-brus i konsolen
        supabase.from("atk_val").select("*").eq("medarbetare_id", med.data.id).eq("period", String(new Date().getFullYear())).maybeSingle()
          .then(res => { if(res.data) setAtkValSparat(res.data); });
        // Fetch godkänd-status per period för månadssammanställningen
        supabase.from("loneunderlag").select("period,status").eq("medarbetare_id", med.data.id)
          .then(res => {
            if(res.data) setLönStatusPerPeriod(Object.fromEntries(res.data.map((r:any) => [r.period, r.status])));
          });
        // Fetch extra_tid for löneunderlag + pågående
        supabase.from("extra_tid").select("*").eq("medarbetare_id", med.data.id).order("datum",{ascending:false}).limit(200)
          .then(res => {
            if(res.data) {
              setExtraTidData(res.data);
              const idagStr = new Date().toISOString().split("T")[0];
              setPagaendeAktiviteter(res.data.filter((e:any) => e.start_tid && !e.slut_tid && e.datum === idagStr));
            }
          });
        // Fetch aktuella vilobrott (senaste 14 dagar) för Dag-vyns morgon-
        // varningar och Min tid-översikten. Tom array är OK.
        hamtaAktuellaVilobrott(med.data.id)
          .then(setAktuellaVilobrott)
          .catch(err => console.error('Vilobrott-fel:', err));
      }
      if(avt.data) {
        setGsAvtal(avt.data);
        // Härled trösklarna från samma avtalsrad. Krasch här ska inte rasera
        // resten av appen — trosklar förblir null, vila-varningar visas inte.
        try {
          setTrosklar(vilaTrosklarFromAvtal(avt.data));
        } catch (err) {
          console.error('Vila-trösklar saknas i gs_avtal:', err);
        }
      }
      if(obj.data) {
        const statusPerVo = new Map<string, string>(
          (objStatus.data || []).filter((r:any) => r.vo_nummer != null && r.status)
            .map((r:any) => [String(r.vo_nummer), r.status])
        );
        setObjektLista(obj.data.map(o => {
          // object_name är ibland en autogenererad timestamp-sträng (yymmddHHMMSS).
          // Faller då tillbaka till "Skogsägare · Huvudtyp" så föraren ser ett vettigt namn.
          const n = (o.object_name || '').trim();
          const raw = n && !/^\d{10,}$/.test(n)
            ? n
            : ([o.skogsagare, o.huvudtyp].filter(Boolean).join(' · ') || o.objekt_id);
          return {
            id:o.objekt_id, namn:formatObjektNamn(raw), ägare:o.skogsagare||'', lat:o.latitude, lng:o.longitude,
            vo:o.vo_nummer ?? null, atgard:o.atgard || o.huvudtyp || null,
            status:o.vo_nummer != null ? statusPerVo.get(String(o.vo_nummer)) ?? null : null,
          };
        }));
      }
    });
    // Hämta maskinnamn-lookup
    supabase.from("dim_maskin").select("maskin_id, tillverkare, modell").then(res => {
      if(res.data) {
        const m: Record<string, string> = {};
        for(const r of res.data) m[r.maskin_id] = r.modell || r.tillverkare || r.maskin_id;
        setMaskinNamnMap(m);
      }
    });
    // Hämta väder från SMHI via GPS
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          fetch(`/api/smhi-nederb?lat=${latitude}&lon=${longitude}`)
            .then(r => r.json())
            .then(json => {
              if (json.prognos?.dagar?.[0]) {
                const dag = json.prognos.dagar[0];
                setVader({
                  temp: dag.tempMax,
                  symbol: dag.symbol,
                  beskrivning: symbolText(dag.symbol),
                });
              }
            })
            .catch(e => console.error('Väder fel:', e));
        },
        (err) => console.error('GPS fel:', err),
        { timeout: 10000 }
      );
    }
    // Hämta dagens objekt via dim_objekt (senaste aktiva objekt för maskin)
    // arbetsdag har ingen objekt_id — dagensObjekt hämtas separat om det behövs
  }, []);

  // Automatisk km-beräkning (hem → trakt) när kvällsvyn öppnas. Hämtar
  // vägavstånd från /api/routing (ORS + cache, fallback haversine×1.4).
  // Fyller kmM/kmK bara om föraren inte redan skrivit in ett värde manuellt.
  useEffect(() => {
    if (steg !== "kväll") return;
    if (!medarbetare) return;
    const idagKey = new Date().toISOString().split('T')[0];
    const objId = valtObjektId || dagData[idagKey]?.objekt_id;
    const obj = objektLista.find(o => o.id === objId);
    const hLat = medarbetare.hem_lat, hLng = medarbetare.hem_lng;
    const oLat = obj?.lat, oLng = obj?.lng;
    if (hLat == null || hLng == null || oLat == null || oLng == null) {
      console.warn('km-beräkning: koordinater saknas', { hLat, hLng, oLat, oLng, objId });
      setKmBerakning(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const res = await hämtaVägKm(Number(hLat), Number(hLng), Number(oLat), Number(oLng));
      if (cancelled || !res) return;
      const { km, source } = res;
      const totalTurRetur = km * 2;
      setKmBerakning(totalTurRetur);
      if (kmM == null) setKmM({ km });
      if (kmK == null) setKmK({ km });
    })();
    return () => { cancelled = true; };
  }, [steg, medarbetare?.id, medarbetare?.hem_lat, medarbetare?.hem_lng, valtObjektId, dagData, objektLista]);

  // Hämta km-kedja för en specifik dag när kalenderns redigera-vy öppnas.
  // /api/km-chain bygger hem → obj1 → obj2 → ... → hem från arbetsdag-raderna
  // och returnerar varje segment. Idag finns alltid 1 objekt per dag (UNIQUE
  // constraint), men infrastrukturen stödjer flera.
  useEffect(() => {
    if (steg !== "redigera" || !redDag) return;
    if (!medarbetare?.id || !redDag.datum) return;
    setRedKmChain(null);
    setRedKmBerakning(null);
    let cancelled = false;
    fetch(`/api/km-chain?medarbetare_id=${encodeURIComponent(medarbetare.id)}&datum=${redDag.datum}`)
      .then(r => r.json())
      .then(j => {
        if (cancelled || !j?.ok) return;
        setRedKmChain(j.segments || []);
        setRedKmBerakning(j.totalKm);
        setRedKm(prev => prev === 0 ? j.totalKm : prev);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [steg, redDag?.datum, redDag?.objekt_id, medarbetare?.id]);

  // Hämta push-enhetsnamn för aktuell enhet när Inställningar öppnas.
  useEffect(() => {
    if (steg !== "inst") return;
    if (!medarbetare?.id) return;
    if (typeof navigator === "undefined" || !('serviceWorker' in navigator)) { setPushEnhetsNamn(null); return; }
    (async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = reg ? await reg.pushManager.getSubscription() : null;
        if (!sub) { setPushEnhetsNamn(null); return; }
        const { data } = await supabase.from("push_subscriptions").select("device_name").eq("endpoint", sub.endpoint).maybeSingle();
        setPushEnhetsNamn(data?.device_name || "Denna enhet");
      } catch { setPushEnhetsNamn(null); }
    })();
  }, [steg, medarbetare?.id]);

  // Pre-fyll "Starta extra arbete"-vyns Objekt-val med dagens aktiva objekt.
  // Om föraren ska till ett annat objekt ändrar hen manuellt.
  useEffect(() => {
    if (steg !== "startaExtraArbete") return;
    if (kvAvObj) return;
    const idagArb = dagData[idagKey] || historik.find((d: any) => d.datum === idagKey);
    const objId = valtObjektId || idagArb?.objekt_id;
    if (!objId) return;
    const o = objektLista.find(x => x.id === objId);
    if (o) {
      setKvAvObj(o);
      setKvAvDeb(true);
    }
  }, [steg, valtObjektId, objektLista.length]);

  // Tickar varje sekund så pågående-aktivitetens HH:MM:SS-timer uppdateras live.
  // Re-render:en triggas bara när pagaendeAktiviteter är non-tom för att spara batteri.
  const [, setNuTick] = useState(0);
  useEffect(() => {
    if (pagaendeAktiviteter.length === 0) return;
    const iv = setInterval(() => setNuTick(t => t + 1), 1000);
    return () => clearInterval(iv);
  }, [pagaendeAktiviteter.length]);

  // Re-fetcha aktuella vilobrott när föraren går till morgon eller mintid.
  // Fångar både egna mutationer (analyseraOchSpara körs i omgång 2) och
  // sällsynta admin-vy-ändringar. Initial fetch sker i Promise.all ovan.
  useEffect(() => {
    if (steg !== "morgon" && steg !== "dag" && steg !== "meny" && steg !== "mintid") return;
    if (!medarbetare?.id) return;
    hamtaAktuellaVilobrott(medarbetare.id)
      .then(setAktuellaVilobrott)
      .catch(err => console.error('Vilobrott-fel:', err));
  }, [steg, medarbetare?.id]);

  // Fetcha periodVilobrott för Vila-fliken när period eller månad ändras.
  // Marginal-fönster: hämta från-7 dagar för att fånga rullande veckovila-brott
  // vars startdatum ligger strax före periodens början. Render-filtret nedan
  // håller perioden konsekvent för användaren.
  useEffect(() => {
    if (steg !== "mintid" || minTidFlik !== 'vila') return;
    if (!medarbetare?.id) return;

    const nu = new Date();
    let from: Date, to: Date;
    if (vilaPeriod === '7d') {
      from = new Date(nu); from.setDate(nu.getDate() - 7);
      to = new Date(nu);
    } else if (vilaPeriod === '30d') {
      from = new Date(nu); from.setDate(nu.getDate() - 30);
      to = new Date(nu);
    } else if (vilaPeriod === 'månad') {
      from = new Date(nu.getFullYear(), vilaMånad, 1);
      to = new Date(nu.getFullYear(), vilaMånad + 1, 0);
    } else {
      from = new Date(nu.getFullYear(), 0, 1);
      to = new Date(nu.getFullYear(), 11, 31);
    }
    // Marginal-fönster
    const fromMarginal = new Date(from); fromMarginal.setDate(from.getDate() - 7);

    const isoFrom = fromMarginal.toISOString().slice(0, 10);
    const isoTo = to.toISOString().slice(0, 10);

    let cancelled = false;
    setPeriodVilobrott(null);
    hamtaVilobrottForPeriod(medarbetare.id, isoFrom, isoTo)
      .then(brott => { if (!cancelled) setPeriodVilobrott(brott); })
      .catch(err => {
        if (cancelled) return;
        console.error('PeriodVilobrott-fel:', err);
        setPeriodVilobrott([]);
      });
    return () => { cancelled = true; };
  }, [steg, minTidFlik, medarbetare?.id, vilaPeriod, vilaMånad]);

  // Sätt mStart/mSlut till aktuell tid (avrundad till 5 min) när manuell-dag-
  // vyerna öppnas. Gör att defaulten inte blir stale om appen legat öppen.
  useEffect(() => {
    if (steg === "manuellDag")   setMStart(nuKlock5());
    if (steg === "manuellKväll") setMSlut(nuKlock5());
  }, [steg]);


  // Hämta månadens km-summa (med auto-beräkning för dagar som saknar km i DB)
  // när kalendervyn öppnas eller månaden ändras.
  useEffect(() => {
    if (steg !== "kalender") return;
    if (!medarbetare?.id) return;
    const month = `${kalÅr}-${String(kalMånad+1).padStart(2,'0')}`;
    let cancelled = false;
    setKmSummary(null);
    fetch(`/api/km-summary?medarbetare_id=${encodeURIComponent(medarbetare.id)}&month=${month}`)
      .then(r => r.json())
      .then(j => {
        if (cancelled || !j?.ok) return;
        setKmSummary({ totalKm: j.totalKm, ersattningsKm: j.ersattningsKm });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [steg, medarbetare?.id, kalÅr, kalMånad]);

  // Lazy-hämta semester- och ATK-saldo från Fortnox när Saldon-fliken öppnas.
  // Ärliga tillstånd: ingen väntan får vara oändlig — 10s timeout aborterar
  // och landar i 'error' (med Försök igen-knapp i UI:t). 404 = medarbetaren
  // saknar lönesystem-koppling = 'tom', vilket INTE är ett fel.
  // Återförsök: knappen sätter status 'idle' → effekten (som har status i
  // deps och bara agerar i idle) kör om hämtningen. Ingen retry-loop:
  // 'error' stannar tills föraren aktivt trycker.
  useEffect(() => {
    if (minTidFlik !== 'saldon') return;
    if (!medarbetare?.id) return;
    if (fortnoxSaldoStatus !== 'idle') return;
    setFortnoxSaldoStatus('loading');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    fetch(`/api/fortnox/employee-details?medarbetare_id=${encodeURIComponent(medarbetare.id)}`, { signal: ctrl.signal })
      .then(async r => {
        if (r.status === 404) { setFortnoxSaldoStatus('tom'); return; }
        const json = await r.json();
        if (json?.ok) {
          setFortnoxSaldo({ semester: json.semester, atk: json.atk, lon: json.lon });
          setFortnoxSaldoStatus('ok');
        } else {
          setFortnoxSaldoStatus('error');
        }
      })
      .catch(() => setFortnoxSaldoStatus('error'))
      .finally(() => clearTimeout(timer));
  }, [minTidFlik, medarbetare?.id, fortnoxSaldoStatus]);

  // === ARBETSDAG-NOTIS (start + avslut) ===
  const [arbetsdagToast, setArbetsdagToast] = useState<{
    typ: 'start' | 'slut'; maskin: string; objekt: string; start: string; slut?: string; tid?: string;
  } | null>(null);

  useEffect(() => {
    if (!medarbetare?.id) return;
    const today = new Date().toISOString().slice(0, 10);
    const startKey = `arbetsdag_toast_start_${today}`;
    const slutKey = `arbetsdag_toast_slut_${today}`;

    let knownIds = new Set<string>();
    let knownSlut: Record<string, string | null> = {}; // id → slut_tid
    let initialDone = false;

    const poll = async () => {
      const { data } = await supabase.from('arbetsdag')
        .select('id, maskin_id, objekt_id, start_tid, slut_tid, arbetad_min')
        .eq('medarbetare_id', medarbetare.id)
        .eq('datum', today);
      if (!data) return;

      if (!initialDone) {
        knownIds = new Set(data.map((r: any) => r.id));
        for (const r of data) knownSlut[r.id] = r.slut_tid || null;
        initialDone = true;
        return;
      }

      for (const row of data) {
        const maskin = maskinNamnMap[row.maskin_id] || row.maskin_id || '';
        const objNamn = objektLista.find((o: any) => o.id === row.objekt_id)?.namn || row.objekt_id || '';
        const startTid = row.start_tid ? row.start_tid.slice(0, 5) : '';

        // Ny rad → start-notis + auto-stoppa pågående extra-aktiviteter
        if (!knownIds.has(row.id) && !localStorage.getItem(startKey)) {
          knownIds.add(row.id);
          knownSlut[row.id] = row.slut_tid || null;
          setArbetsdagToast({ typ: 'start', maskin, objekt: objNamn, start: startTid });
          localStorage.setItem(startKey, '1');
          setTimeout(() => setArbetsdagToast(null), 10000);
          // Auto-stoppa pågående aktiviteter på maskinstart
          if (startTid) {
            const { data: opna } = await supabase.from('extra_tid')
              .select('id, aktivitet_typ, start_tid')
              .eq('medarbetare_id', medarbetare.id)
              .eq('datum', today)
              .is('slut_tid', null);
            if (opna && opna.length > 0) {
              const startSec = startTid + ':00';
              for (const o of opna) {
                const min = minutDiff(o.start_tid, startSec);
                // Bakgrundspoll — ingen alert; re-fetchen nedan visar sanningen om stängningen inte gick igenom
                const res = await uppdateraVerifierat(supabase, 'extra_tid', { slut_tid: startSec, minuter: min }, { id: o.id });
                if (!res.ok) console.error('[auto-stopp] extra_tid', o.id, 'kunde inte stängas');
              }
              setPagaendeAktiviteter([]);
              // Refresh extra_tid lista
              supabase.from("extra_tid").select("*").eq("medarbetare_id", medarbetare.id).order("datum",{ascending:false}).limit(200)
                .then(res => { if(res.data) setExtraTidData(res.data); });
            }
          }
          return;
        }

        // slut_tid blev satt → slut-notis
        const prevSlut = knownSlut[row.id];
        if (!prevSlut && row.slut_tid && !localStorage.getItem(slutKey)) {
          knownSlut[row.id] = row.slut_tid;
          const slutTid = row.slut_tid.slice(0, 5);
          // Dagstotal = maskintid + dagens extra tid. Hämtas färskt här (inte
          // ur extraTidData-state) — effekten har stale closure på state.
          const { data: dagensExtra } = await supabase.from('extra_tid')
            .select('minuter').eq('medarbetare_id', medarbetare.id).eq('datum', today);
          const extraMinIdag = (dagensExtra || []).reduce((a: number, e: any) => a + (e.minuter || 0), 0);
          const totMin = (row.arbetad_min || 0) + extraMinIdag;
          const h = Math.floor(totMin / 60);
          const m = totMin % 60;
          const tid = `${h}h ${m}min`;
          setArbetsdagToast({ typ: 'slut', maskin, objekt: objNamn, start: startTid, slut: slutTid, tid });
          localStorage.setItem(slutKey, '1');
          setTimeout(() => setArbetsdagToast(null), 10000);
          // Send push notification for when app is closed
          const kmTot = (row.km_morgon || 0) + (row.km_kvall || 0) + (row.km_totalt || 0);
          fetch('/api/notify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              medarbetare_id: medarbetare.id,
              title: 'Din arbetsdag',
              body: `${tid}${kmTot > 0 ? ` · ${kmTot}km` : ''} — Stämmer?`,
              url: '/arbetsrapport',
            }),
          }).catch(() => {});
          return;
        }

        knownIds.add(row.id);
        knownSlut[row.id] = row.slut_tid || null;
      }
    };
    poll();
    // vilobrott pollas INTE — tabellen muteras av klienten själv via
    // analyseraOchSpara() efter arbetsdag-mutation, eller från admin-vy
    // (ovanligt). Re-fetch sker vid steg-byte och vid mount. Om det visar
    // sig att admin-ändringar inte syns i tid kan vi lägga på polling här.
    const interval = setInterval(poll, 60000);
    return () => clearInterval(interval);
  }, [medarbetare?.id, maskinNamnMap, objektLista]);

  // Hämta dagdata för kalendern när månad/år ändras. `steg` ingår också i
  // dependency-listan så att återbesök till kalender-vyn efter bekräftelse
  // triggar en ny hämtning — undviker stale data om state-update missas.
  useEffect(() => {
    if (!medarbetare) return;
    // Kör bara när användaren faktiskt är i kalender-vyn eller vyer som
    // visar kalender-data (redigera/tidslinje). Slipp att köra varje gång
    // morgon/mintid/inst-state ändras.
    if (steg !== 'kalender' && steg !== 'redigera' && steg !== 'tidslinje' && steg !== 'morgon') return;
    const förstadag = new Date(kalÅr, kalMånad, 1).toISOString().slice(0, 10);
    const sistadag = new Date(kalÅr, kalMånad + 1, 0).toISOString().slice(0, 10);
    // Hämta arbetsdag + arbetsdag_objekt parallellt så vi kan visa flera
    // objekt per dag i UI:t (Hössjömåla + Flytt etc.).
    Promise.all([
      supabase.from('arbetsdag')
        .select('*')
        .eq('medarbetare_id', medarbetare.id)
        .gte('datum', förstadag)
        .lte('datum', sistadag),
      supabase.from('arbetsdag_objekt')
        .select('id, arbetsdag_id, objekt_id, objekt_namn, start_tid, slut_tid, arbetad_min, ordning')
        .order('ordning', { ascending: true }),
    ]).then(([adRes, ojRes]) => {
      if (adRes.data) {
        const objektPerDag: Record<string, any[]> = {};
        for (const o of (ojRes.data || [])) {
          if (!objektPerDag[o.arbetsdag_id]) objektPerDag[o.arbetsdag_id] = [];
          objektPerDag[o.arbetsdag_id].push(o);
        }
        const map: Record<string, any> = {};
        for (const r of adRes.data) {
          map[r.datum] = {
            id: r.id,
            status: r.bekraftad ? 'ok' : 'saknas',
            arbMin: r.arbetad_min || 0,
            km: r.km_totalt || 0,
            km_morgon: r.km_morgon || 0,
            km_kvall: r.km_kvall || 0,
            km_totalt: r.km_totalt || 0,
            trak: !!r.traktamente,
            traktamente: !!r.traktamente,
            dagtyp: r.dagtyp,
            bekraftad: !!r.bekraftad,
            bekraftad_tid: r.bekraftad_tid,
            start_tid: r.start_tid || null,
            slut_tid: r.slut_tid || null,
            rast_min: r.rast_min ?? 0,
            start: r.start_tid ? r.start_tid.slice(0,5) : '06:00',
            slut: r.slut_tid ? r.slut_tid.slice(0,5) : '',
            rast: r.rast_min ?? 0,
            maskin_id: r.maskin_id,
            maskin_namn: maskinNamnMap[r.maskin_id] || r.maskin_id || null,
            // Primärt objekt (bakåtkompat)
            objekt_id: r.objekt_id || null,
            objekt_namn: objektLista.find(o => o.id === r.objekt_id)?.namn || r.objekt_id || null,
            objekt_ägare: objektLista.find(o => o.id === r.objekt_id)?.ägare || null,
            // Hela listan av objekt för dagen (kan vara flera vid objekt-byte)
            objekt_lista: (objektPerDag[r.id] || []).map(o => ({
              id: o.id,
              objekt_id: o.objekt_id,
              objekt_namn: o.objekt_namn || objektLista.find(x => x.id === o.objekt_id)?.namn || o.objekt_id,
              start_tid: o.start_tid,
              slut_tid: o.slut_tid,
              arbetad_min: o.arbetad_min,
              ordning: o.ordning,
            })),
          };
        }
        setDagData(map);
      }
    });
    // Hämta extra_tid för månaden — gruppera per datum
    supabase.from('extra_tid')
      .select('*')
      .eq('medarbetare_id', medarbetare.id)
      .gte('datum', förstadag)
      .lte('datum', sistadag)
      .order('start_tid', { ascending: true })
      .then(res => {
        if (res.data) {
          const map: Record<string, any[]> = {};
          for (const r of res.data) {
            if (!map[r.datum]) map[r.datum] = [];
            map[r.datum].push(r);
          }
          setExtraDagData(map);
        }
      });
  }, [medarbetare, kalÅr, kalMånad, maskinNamnMap, objektLista, steg]);

  const idag=new Date();
  const datumStr=`${["Sön","Mån","Tis","Ons","Tor","Fre","Lör"][idag.getDay()]} ${idag.getDate()} ${["jan","feb","mar","apr","maj","jun","jul","aug","sep","okt","nov","dec"][idag.getMonth()]}`;

  const frikm = gsAvtal?.km_grans_per_dag ?? 60;
  const fardtidPerMil = gsAvtal?.fardtid_kr_per_mil ?? 10.49;
  const arbMin = Math.max(0,tim(start,slut)-rast);
  const totKm  = (kmM?.km||0)+(kmK?.km||0);
  const ersKm  = Math.max(0,totKm-frikm);                          // km över gränsen
  const milPåbörjade = ersKm>0 ? Math.ceil(ersKm/10) : 0;          // påbörjade mil
  const ersKr  = Math.round(milPåbörjade*fardtidPerMil*100)/100;   // färdtidsersättning kr
  const totEx  = extra.reduce((a,e)=>a+e.min,0);
  const totMin = arbMin+totEx;
  const idagKey = new Date().toISOString().split('T')[0];
  const igårDate = new Date(); igårDate.setDate(igårDate.getDate()-1);
  const igårKey = igårDate.toISOString().split('T')[0];
  const igårObekräftad = dagData[igårKey] && !dagData[igårKey].status?.includes?.('ok') && dagData[igårKey].start_tid && !historik.find(d => d.datum === igårKey && d.bekraftad);
  const isWorking = !!dagData[idagKey];
  const förnamn = medarbetare?.namn?.split(' ')[0] || '';

  // Synka dagens tider/rast/traktamente från arbetsdag-tabellen till lokala state.
  // Per-fält dirty-tracking: skriv ALDRIG över ett fält som föraren redigerat
  // lokalt. Andra fält uppdateras fritt från DB (om en MOM-eftermiddagsfil ger
  // ny slut_tid medan föraren redigerar rast, ska hen få den nya slut-tiden
  // MEN behålla sin rast). Ligger efter idagKey-deklarationen (TDZ).
  //
  // Sekund-normalisering: DB lagrar "HH:MM:SS", UI jobbar med "HH:MM" —
  // .slice(0,5) så Ändra tider-sheetens jämförelser inte slår falskt dirty.
  // rast-fallback är 0, inte 30 (DB-defaulten) — vår regel: rast = 0 om
  // föraren inte markerat Meal break. Importen sätter värdet explicit.
  useEffect(() => {
    const idagArb = dagData[idagKey];
    if (!idagArb) return;
    if (!startÄndrad) {
      setStart(idagArb.start_tid ? idagArb.start_tid.slice(0, 5) : "");
    }
    if (!slutÄndrad) {
      setSlut(idagArb.slut_tid ? idagArb.slut_tid.slice(0, 5) : "");
    }
    if (!rastÄndrad) {
      // Number()-cast eftersom Postgres NUMERIC kan komma som string via REST.
      const r = idagArb.rast_min;
      setRast(r == null ? 0 : Number(r));
    }
    if (!trakÄndrad) {
      // arbetsdag.traktamente är boolean. Mappa till state-objektet eller null.
      if (idagArb.traktamente) {
        // Bevara befintligt belopp om state redan har det, annars hel-default
        setTrak(prev => prev ?? { summa: gsAvtal?.traktamente_hel_kr ?? 300 });
      } else {
        setTrak(null);
      }
    }
  }, [
    idagKey,
    dagData[idagKey]?.id,
    dagData[idagKey]?.start_tid,
    dagData[idagKey]?.slut_tid,
    dagData[idagKey]?.rast_min,
    dagData[idagKey]?.traktamente,
    startÄndrad, slutÄndrad, rastÄndrad, trakÄndrad,
    gsAvtal?.traktamente_hel_kr,
  ]);

  // Vila-varningar för startsidan.
  // - Faktiska brott (obesvarade) hämtas från vilobrott-tabellen via
  //   aktuellaVilobrott (senaste 14 dagar). En sanning.
  // - "Kort dygnsvila sedan igår" är en PREDIKTIV förvarning i zonen mellan
  //   krav_h och varning_h — INTE ett brott. Räknas inline från årsData
  //   eftersom det baseras på klockslag-nu, inte på en specifik arbetsdag.
  const vilaVarningar: {typ:'röd'|'orange';text:string}[] = [];

  for (const b of aktuellaVilobrott) {
    if (b.besvarat_av_forare) continue;
    if (b.typ === 'dygnsvila') {
      vilaVarningar.push({
        typ: 'röd',
        text: `Dygnsvila bruten ${b.datum.slice(5)}: ${Number(b.vila_h)}h vila (krav ${Number(b.krav_h)}h)`,
      });
    } else if (b.typ === 'veckovila') {
      vilaVarningar.push({
        typ: 'orange',
        text: `Veckovila bruten ${b.datum.slice(5)}: ${Number(b.vila_h)}h vila (krav ${Number(b.krav_h)}h)`,
      });
    }
  }

  // Prediktiv orange "kort dygnsvila sedan igår" — INTE ett brott, bara
  // förvarning i zonen mellan krav_h och varning_h. Brotts-varningar kommer
  // från DB-loopen ovan.
  if (trosklar) {
    const senaste = [...årsData].filter(r=>r.slut_tid && r.datum < idagKey).sort((a,b)=>b.datum.localeCompare(a.datum))[0];
    if (senaste) {
      const slutDt = new Date(`${senaste.datum}T${senaste.slut_tid.slice(0,5)}`);
      const vilaTim = (new Date().getTime() - slutDt.getTime()) / 3600000;
      if (vilaTim >= trosklar.dygnsvila_krav_h && vilaTim < trosklar.dygnsvila_varning_h) {
        vilaVarningar.push({typ:'orange',text:`Kort dygnsvila: ${Math.round(vilaTim*10)/10}h sedan igår`});
      }
    }
  }

  const input = { width:"100%",minHeight:52,padding:"14px 16px",fontSize:16,border:"1px solid rgba(255,255,255,0.08)",borderRadius:12,background:"rgba(255,255,255,0.06)",outline:"none",fontFamily:"inherit",color:"#fff" };

  // === ARBETSDAG TOAST (DOM element) — must be before any early return ===
  useEffect(() => {
    if (!arbetsdagToast) {
      const el = document.getElementById('arbetsdag-toast');
      if (el) el.remove();
      return;
    }
    let el = document.getElementById('arbetsdag-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'arbetsdag-toast';
      document.body.appendChild(el);
    }
    el.style.cssText = 'position:fixed;bottom:20px;left:16px;right:16px;z-index:10000;animation:slideIn 0.3s ease;';
    const isSlut = arbetsdagToast.typ === 'slut';
    const title = isSlut ? 'Din arbetsdag är avslutad' : 'Din arbetsdag har startat';
    const detail = isSlut
      ? `${arbetsdagToast.maskin}${arbetsdagToast.objekt ? ' · ' + arbetsdagToast.objekt : ''}<br>${arbetsdagToast.start} – ${arbetsdagToast.slut || ''} · ${arbetsdagToast.tid || ''}`
      : `${arbetsdagToast.maskin}${arbetsdagToast.objekt ? ' · ' + arbetsdagToast.objekt : ''}${arbetsdagToast.start ? ' · Starttid: ' + arbetsdagToast.start : ''}`;
    el.innerHTML = `<div style="background:#1c1c1e;border-radius:16px;padding:16px 18px;box-shadow:0 8px 30px rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.1);">
      <div style="font-size:15px;font-weight:600;color:#fff;margin-bottom:4px;">${title}</div>
      <div style="font-size:13px;color:rgba(255,255,255,0.5);margin-bottom:12px;">${detail}</div>
      <div style="display:flex;gap:8px;">
        <button id="toast-ok" style="flex:1;padding:10px;border-radius:10px;border:1px solid rgba(255,255,255,0.15);background:transparent;color:rgba(255,255,255,0.6);font-size:14px;font-weight:600;cursor:pointer;">OK</button>
      </div>
    </div>`;
    const okBtn = el.querySelector('#toast-ok');
    if (okBtn) okBtn.addEventListener('click', () => { setArbetsdagToast(null); });
    return () => { el?.remove(); };
  }, [arbetsdagToast]);

  // Vilo-detektering vid arbetsdag-mutation. Anropas efter Avsluta pass,
  // Starta manuellt, och Ändra tider-sheet. Räknar fönstret datum-3 till
  // datum+3 så att både dygnsvila (par av dagar) och rullande veckovila
  // fångas. Re-fetchar aktuellaVilobrott direkt så UI:t uppdateras inline.
  //
  // TODO: om fönstret spränger årsData-räckvidden (nära årsskifte) missas
  // eventuella vilobrott i den extrema gränszonen. Mycket ovanligt scenario.
  // Löses om det visar sig vara ett problem genom att fetcha extra batch.
  //
  // TODO: MOM-import (Python-skript) kör inte denna helper automatiskt.
  // Detektering sker nästa gång föraren öppnar appen. Löses via webhook
  // eller Edge Function vid HPR/MOM-import.
  const synkaVilobrott = async (mutationDatum: string) => {
    if (!medarbetare?.id || !trosklar) return;
    const fromDt = new Date(mutationDatum); fromDt.setDate(fromDt.getDate() - 3);
    const toDt = new Date(mutationDatum); toDt.setDate(toDt.getDate() + 3);
    const fromIso = fromDt.toISOString().slice(0, 10);
    const toIso = toDt.toISOString().slice(0, 10);
    const dagarIFonster = årsData.filter(r => r.datum >= fromIso && r.datum <= toIso);
    try {
      await analyseraOchSpara(medarbetare.id, dagarIFonster, trosklar, fromIso, toIso);
      const nyaBrott = await hamtaAktuellaVilobrott(medarbetare.id);
      setAktuellaVilobrott(nyaBrott);
    } catch (err) {
      // Mutationen är redan sparad i Supabase — vilo-data uppdateras vid
      // nästa render. Ingen toast/UI-fel, bara console-logg.
      console.error('Vilo-analys/re-fetch misslyckades efter mutation:', err);
    }
  };

  // Bekräfta arbetsdagen — extraherad så samma kod kan köras både direkt
  // (när inga obesvarade brott finns) och från sparaOrsakOchFortsätt
  // (efter sista brottet besvarats). Pågående extra-tid-aktiviteter stoppas
  // INTE här — det görs i Bekräfta-onClick före för-checken så det alltid sker.
  //
  // Returnerar true om bekräftelsen lyckades, false om guarden blockerade.
  // KRITISK ORDNING (mot race med synk-useEffect:en):
  //   1. UPSERT till DB  2. setDagData lokalt  3. SEN nollställ dirty-flaggorna.
  const bekraftaDagen = async (): Promise<boolean> => {
    if (!medarbetare?.id) return false;

    // Guard: tomma tider ska aldrig skrivas till DB. Föraren måste fylla
    // i start- och sluttid (Avsluta pass eller Ändra tider) innan bekräftelse.
    if (!start || !slut) {
      setBekraftaFel('Tiderna saknas — fyll i start- och sluttid innan du bekräftar.');
      return false;
    }
    setBekraftaFel(null);

    const idagArb = dagData[idagKey];
    const dagObjId = valtObjektId || idagArb?.objekt_id || null;
    const nuBekrIso = new Date().toISOString();

    // 1. UPSERT — alla värden från lokala state (garanterat icke-tomma efter guard).
    //    VERIFIERAT: träffar skrivningen inte databasen (RLS, borttagen rad,
    //    nätfel) får dagen ALDRIG visas som bekräftad — det är lönedata.
    const uppRes = await upsertVerifierat(supabase, "arbetsdag", {
      medarbetare_id: medarbetare.id,
      datum: idagKey,
      start_tid: start, slut_tid: slut, rast_min: rast,
      km_morgon: kmM?.km ?? 0, km_kvall: kmK?.km ?? 0,
      maskin_id: medarbetare.maskin_id,
      objekt_id: dagObjId,
      traktamente: trak, bekraftad: true,
      bekraftad_tid: nuBekrIso,
    }, { onConflict: 'medarbetare_id,datum' });
    if (!uppRes.ok) {
      setBekraftaFel(uppRes.fel);
      return false;
    }

    // 2. setDagData lokalt — samma värden som UPSERT skickade. Körs FÖRE
    //    dirty-nollställningen så synk-useEffect:en (när den sen kör pga
    //    dirty=false) ser dagData == state == DB. Ingen race där synken
    //    skriver gamla värden tillbaka över bekräftelsen.
    const startMedSek = start.length === 5 ? start + ':00' : start;
    const slutMedSek  = slut.length === 5  ? slut  + ':00' : slut;
    setDagData(d => ({ ...d, [idagKey]: {
      ...d[idagKey],
      start_tid: startMedSek,
      slut_tid: slutMedSek,
      rast_min: rast,
      traktamente: !!trak,
      bekraftad: true,
      bekraftad_tid: nuBekrIso,
    } }));

    // 3. Nollställ dirty-flaggor — nu är state == dagData == DB.
    setStartÄndrad(false);
    setSlutÄndrad(false);
    setRastÄndrad(false);
    setTrakÄndrad(false);

    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(200);
    setBekräftelseVisa(true);
    setTimeout(() => setBekräftelseVisa(false), 2000);
    return true;
  };

  // Sparar förarens orsak-svar för det aktuella brottet i kön och avancerar.
  // Vid sista brottet: bekräftar dagen + nollställer kön. Vid backa: avbrytsHelpern.
  const sparaOrsakOchFortsätt = async () => {
    if (!vilobrottOrsakVal) return;
    if (vilobrottOrsakVal === 'annat' && !vilobrottOrsakFritext.trim()) return;
    if (!trosklar) return;
    const aktivt = vilobrottKö[vilobrottIdx];
    if (!aktivt) return;

    const nuIso = new Date().toISOString();
    const kompH = Number(aktivt.krav_h) - Number(aktivt.vila_h);
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + trosklar.kompensation_deadline_dagar);
    const deadlineIso = deadline.toISOString().slice(0, 10);

    try {
      const res = await uppdateraVerifierat(supabase, "vilobrott", {
        besvarat_av_forare: true,
        orsak: vilobrottOrsakVal,
        orsak_fritext: vilobrottOrsakVal === 'annat' ? vilobrottOrsakFritext.trim() : null,
        besvarat_tid: nuIso,
        kompensation_h: kompH,
        kompensation_deadline: deadlineIso,
      }, { id: aktivt.id });
      if (!res.ok) throw new Error(res.fel);
      // Re-fetcha aktuellaVilobrott så Dag-vyns gula varningar uppdateras.
      // RÖR INTE vilobrottKö — den är fryst genom hela flödet.
      if (medarbetare?.id) {
        const nyaBrott = await hamtaAktuellaVilobrott(medarbetare.id);
        setAktuellaVilobrott(nyaBrott);
      }
    } catch (err) {
      console.error('Spara orsak misslyckades:', err);
      return; // Håll föraren kvar i vyn — låt hen försöka igen
    }

    // Avancera eller bekräfta
    if (vilobrottIdx < vilobrottKö.length - 1) {
      setVilobrottIdx(i => i + 1);
      setVilobrottOrsakVal(null);
      setVilobrottOrsakFritext("");
    } else {
      // Sista brottet — bekräfta dagen. Om guarden blockerar (tomma tider)
      // går vi tillbaka till morgon-vyn där felmeddelandet syns under
      // Bekräfta-knappen. Orsak-svaret är redan persistat i DB så det går
      // inte förlorat — föraren fixar tiderna och bekräftar igen.
      await bekraftaDagen();
      setVilobrottKö([]);
      setVilobrottIdx(0);
      setVilobrottOrsakVal(null);
      setVilobrottOrsakFritext("");
      setSteg("morgon");
    }
  };

  // Loading fallback
  if(!medarbetare) return (
    <div style={shell}>
      <style>{css}</style>
      <div style={{ flex:1,display:"flex",alignItems:"center",justifyContent:"center" }}>
        <p style={{ fontSize:17,color:C.label }}>Laddar...</p>
      </div>
    </div>
  );

  // Global timer-banner — visas så länge en extra tid-timer är aktiv, oavsett vy.
  // Placeras av varje vys returnerade JSX genom `{timerBanner}`.
  const aktivTimer = pagaendeAktiviteter[0];
  const stoppaAktivTimer = async () => {
    if (!aktivTimer) return;
    const nuT = nuKlock() + ":00";
    const min = minutDiff(aktivTimer.start_tid, nuT);
    const res = await uppdateraVerifierat(supabase, "extra_tid", { slut_tid: nuT, minuter: min }, { id: aktivTimer.id }, "*");
    if (!res.ok) { alert(res.fel); return; } // timern står kvar — inget låtsas-stopp
    const uppdaterad = res.rows[0];
    setPagaendeAktiviteter(arr => arr.filter(x => x.id !== aktivTimer.id));
    setExtraTidData(arr => arr.map(x => x.id === aktivTimer.id ? uppdaterad : x));
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(120);
    setKvAvTyp(uppdaterad.aktivitet_typ || null);
    setKvAvObj(uppdaterad.objekt_id ? objektLista.find(o => o.id === uppdaterad.objekt_id) || null : null);
    setKvAvDeb(!!uppdaterad.debiterbar);
    setKvAvBesk(uppdaterad.kommentar || "");
    setEfterStoppSheet(uppdaterad);
  };
  const timerBanner = aktivTimer ? (
    <div style={{
      position:"fixed", top:64, left:0, right:0, height:44,
      background:"rgba(30,10,10,0.92)",
      borderBottom:"1px solid rgba(255,69,58,0.4)",
      backdropFilter:"blur(12px)", WebkitBackdropFilter:"blur(12px)",
      zIndex:900, display:"flex", alignItems:"center",
      padding:"0 14px", gap:10,
      fontFamily:"'Inter',-apple-system,sans-serif",
    }}>
      <div style={{ width:8,height:8,borderRadius:"50%",background:"#ff453a",animation:"pulseDot 2s infinite",flexShrink:0 }} />
      <span style={{ fontSize:13,fontWeight:600,color:"#fff",flexShrink:0 }}>
        Tidlogg pågår {(aktivTimer.start_tid||'').slice(0,5)}
      </span>
      <span style={{ ...TYPE.bodyList,color:"#fff",fontVariantNumeric:"tabular-nums",marginLeft:"auto",marginRight:8,flexShrink:0 }}>
        {fmtHMS(sekDiff(aktivTimer.start_tid))}
      </span>
      <button onClick={stoppaAktivTimer}
        style={{ background:"#ff453a",color:"#fff",border:"none",borderRadius:8,padding:"6px 14px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit",flexShrink:0 }}>
        Stoppa
      </button>
    </div>
  ) : null;



  /* ─── ORSAK TILL VILOBROTT ─── */
  if(steg==="vilobrottOrsak") {
    const aktivt = vilobrottKö[vilobrottIdx];
    if (!aktivt) {
      // Defensiv: tom kö men vyn är aktiv. Render inget — useEffect i Promise.all
      // eller en framtida fetch kommer återställa state. Föraren kan trycka tillbaka.
      return null;
    }
    const totalBrott = vilobrottKö.length;
    const visarRäknare = totalBrott > 1;
    const orsakAlternativ = [
      { key: 'oforutsedd' as const,     label: 'Oförutsedd händelse',          sub: 'Trafik, väder, oväntat fel' },
      { key: 'akut_jour' as const,      label: 'Akut situation eller jour',    sub: 'Brådskande arbete som krävde min närvaro' },
      { key: 'planerad_avtal' as const, label: 'Planerat undantag enligt avtal', sub: 'Förhandlat med chef i förväg' },
      { key: 'annat' as const,          label: 'Annat',                        sub: 'Skriv en kort beskrivning' },
    ];
    const avbryt = () => {
      // Backar till morgon. Redan-besvarade brott är sparade i DB —
      // föraren förlorar ingenting. Dagen förblir obekräftad.
      setVilobrottKö([]);
      setVilobrottIdx(0);
      setVilobrottOrsakVal(null);
      setVilobrottOrsakFritext("");
      setSteg("morgon");
    };
    const klart = !!vilobrottOrsakVal && (vilobrottOrsakVal !== 'annat' || vilobrottOrsakFritext.trim().length > 0);
    const ärSista = vilobrottIdx === vilobrottKö.length - 1;
    return (
      <div style={shell}>
        <style>{css}</style>{timerBanner}
        <div style={topBar}>
          <div style={{ display:"flex",alignItems:"center",gap:14 }}>
            <BackBtn onClick={avbryt}/>
            <div>
              <h1 style={{ margin:0,...TYPE.h1 }}>
                {aktivt.typ === 'dygnsvila' ? 'Dygnsvila bruten' : 'Veckovila bruten'}
              </h1>
              <p style={{ margin:"3px 0 0",fontSize:13,color:C.label }}>
                {visarRäknare ? `${vilobrottIdx + 1} av ${totalBrott} · ` : ''}Varför bröts vilan?
              </p>
            </div>
          </div>
        </div>
        <div style={{ flex:1,overflowY:"auto",paddingTop:8,paddingBottom:120 }}>
          {/* Beskrivning av brottet */}
          <Card style={{ background:"rgba(255,69,58,0.06)",border:"1px solid rgba(255,69,58,0.2)" }}>
            <p style={{ margin:0,...TYPE.meta,color:"#fff",lineHeight:1.5 }}>{aktivt.beskrivning}</p>
          </Card>

          {/* Orsaksval */}
          <Label style={{ marginTop:20 }}>Välj orsak</Label>
          {orsakAlternativ.map(o => (
            <Card key={o.key} onClick={()=>setVilobrottOrsakVal(o.key)}
              style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,
                background: vilobrottOrsakVal===o.key ? "rgba(0,122,255,0.06)" : C.card,
                border: vilobrottOrsakVal===o.key ? "1px solid rgba(0,122,255,0.2)" : "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ flex:1 }}>
                <p style={{ margin:0,fontSize:16,fontWeight:600,color:"#fff" }}>{o.label}</p>
                <p style={{ margin:"2px 0 0",fontSize:13,color:C.label }}>{o.sub}</p>
              </div>
              {vilobrottOrsakVal===o.key
                ? <div style={{ width:22,height:22,borderRadius:"50%",background:C.blue,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginLeft:12 }}><svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l3 3L9 1" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
                : <div style={{ width:22,height:22,borderRadius:"50%",border:`1.5px solid ${C.line}`,flexShrink:0,marginLeft:12 }}/>
              }
            </Card>
          ))}

          {/* Fritext för "Annat" */}
          {vilobrottOrsakVal === 'annat' && (
            <div style={{ marginTop:16 }}>
              <Label>Beskriv kort</Label>
              <textarea
                placeholder="T.ex. röjde fallna träd över vägen"
                value={vilobrottOrsakFritext}
                onChange={e=>setVilobrottOrsakFritext(e.target.value)}
                rows={3}
                style={{ width:"100%",background:"#353535",border:"none",borderRadius:12,color:"#fff",padding:12,fontSize:15,outline:"none",fontFamily:"inherit",resize:"none",boxSizing:"border-box" }}
                autoFocus
              />
            </div>
          )}
        </div>
        <div style={bottom}>
          <button
            style={{ ...btn.primary, opacity: klart ? 1 : 0.35 }}
            disabled={!klart}
            onClick={sparaOrsakOchFortsätt}
          >
            {ärSista ? 'Spara och bekräfta dagen' : 'Spara och fortsätt'}
          </button>
          <button style={btn.textBack} onClick={avbryt}>Avbryt</button>
        </div>
      </div>
    );
  }

  /* ─── TIDSLINJE FÖR EN DAG ─── */
  if(steg==="tidslinje" && tidslinjeDatum) {
    const dag = dagData[tidslinjeDatum];
    const extra = (extraDagData[tidslinjeDatum] || []).slice().sort((a,b)=>(a.start_tid||'').localeCompare(b.start_tid||''));
    type Hand = { typ:'maskin'|'extra'; start:string; slut:string; label:string; sub?:string; minuter:number; debiterbar?:boolean };
    const händelser: Hand[] = [];
    if(dag?.start_tid && dag?.slut_tid) {
      const objNamn = objektLista.find(o=>o.id===dag.objekt_id)?.namn || dag.objekt_namn || dag.maskin_id || 'Maskin';
      händelser.push({
        typ:'maskin',
        start:dag.start_tid.slice(0,5),
        slut:dag.slut_tid.slice(0,5),
        label:`Maskin — ${objNamn}`,
        sub: dag.maskin_namn || dag.maskin_id,
        minuter: dag.arbMin||0,
      });
    }
    for(const e of extra) {
      händelser.push({
        typ:'extra',
        start:(e.start_tid||'').slice(0,5),
        slut:(e.slut_tid||'').slice(0,5)||'pågår',
        label: aktLabel(e.aktivitet_typ),
        sub: e.aktivitet_text || (e.objekt_id ? (objektLista.find(o=>o.id===e.objekt_id)?.namn || '') : ''),
        minuter: e.minuter||0,
        debiterbar: e.debiterbar,
      });
    }
    händelser.sort((a,b)=>a.start.localeCompare(b.start));
    const totMaskin = dag?.arbMin||0;
    const totExtra = extra.reduce((a,e)=>a+(e.minuter||0),0);
    const datDate = new Date(tidslinjeDatum);
    const datLabel = `${["sön","mån","tis","ons","tor","fre","lör"][datDate.getDay()]} ${datDate.getDate()} ${["jan","feb","mar","apr","maj","jun","jul","aug","sep","okt","nov","dec"][datDate.getMonth()]}`;
    return (
      <div style={shell}>
        <style>{css}</style>{timerBanner}
        <div style={topBar}>
          <div style={{ display:"flex",alignItems:"center",gap:14 }}>
            <BackBtn onClick={()=>{setTidslinjeDatum(null);setSteg("kalender");}}/>
            <div>
              <p style={{ margin:0,fontSize:13,color:C.label,textTransform:"capitalize" }}>{datLabel}</p>
              <h1 style={{ margin:"4px 0 0",...TYPE.h1 }}>Tidslinje</h1>
            </div>
          </div>
        </div>
        <div style={{ flex:1,overflowY:"auto",paddingTop:16,paddingBottom:32 }}>
          {/* Summering */}
          <Card style={{ padding:"16px 20px" }}>
            <div style={{ display:"flex",justifyContent:"space-between",marginBottom:8 }}>
              <span style={{ ...TYPE.meta,color:C.label }}>Maskin</span>
              <span style={{ ...TYPE.bodyList,...TNUM }}>{fmt(totMaskin)}</span>
            </div>
            {totExtra>0&&(
              <div style={{ display:"flex",justifyContent:"space-between" }}>
                <span style={{ ...TYPE.meta,color:C.label }}>Extra tid</span>
                <span style={{ ...TYPE.bodyList,color:C.orange,...TNUM }}>+ {fmt(totExtra)}</span>
              </div>
            )}
          </Card>
          {/* Lista händelser */}
          <div style={{ marginTop:16 }}>
            {händelser.length===0?(
              <Card><p style={{ margin:0,...TYPE.meta,color:C.label,textAlign:"center" }}>Inga händelser denna dag</p></Card>
            ):händelser.map((h,i)=>(
              <Card key={i} style={{ display:"flex",alignItems:"flex-start",gap:14 }}>
                <div style={{ minWidth:90,...TYPE.meta,color:C.label,fontWeight:500,fontVariantNumeric:"tabular-nums" }}>
                  {h.start}–{h.slut}
                </div>
                <div style={{ flex:1 }}>
                  <p style={{ margin:0,...TYPE.bodyList,color:h.typ==='maskin'?'#fff':C.orange }}>{h.label}</p>
                  {h.sub&&<p style={{ margin:"3px 0 0",fontSize:13,color:C.label }}>{h.sub}</p>}
                  <p style={{ margin:"6px 0 0",fontSize:12,fontWeight:500,color:C.label }}>{fmt(h.minuter)}{h.debiterbar?' · debiterbar':''}</p>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  /* ─── HEM (morgon/dag/meny unified) ─── */
  if(steg==="morgon"||steg==="dag"||steg==="meny") return (
    <div style={{ minHeight:"100vh",background:"#000",color:"#e5e2e0",fontFamily:"'Inter',-apple-system,sans-serif",WebkitFontSmoothing:"antialiased",display:"flex",flexDirection:"column" }}>
      <style>{css}</style>{timerBanner}

      {/* Top bar */}
      <header style={{ position:"fixed",top:0,width:"100%",height:64,background:"rgba(0,0,0,0.8)",backdropFilter:"blur(12px)",WebkitBackdropFilter:"blur(12px)",zIndex:50,display:"flex",justifyContent:"center",alignItems:"center",padding:"0 24px",boxSizing:"border-box" }}>
        <span style={{ ...TYPE.body,color:"#fff" }}>Dag</span>
      </header>

      <main style={{ paddingTop:aktivTimer?140:96,paddingBottom:128,paddingLeft:24,paddingRight:24,flex:1,width:"100%",boxSizing:"border-box" }}>

        {/* Påminnelse obekräftad dag */}
        {igårObekräftad&&(
          <div onClick={()=>{
            const d2=dagData[igårKey];
            setRedDag({...(d2||{}),datum:igårKey});
            setRedStart(d2?.start_tid||"00:00");
            setRedSlut(d2?.slut_tid||"00:00");
            setRedRast(d2?.rast_min||0);
            setRedKm(d2?.km_totalt||0);
            setRedKmBerakning(null);
            setRedAnl("");
            setRedObjektId(d2?.objekt_id||null);
            setRedMaskinId(d2?.maskin_id||null);
            setRedVy("översikt");
            setSteg("redigera");
          }} style={{ background:"rgba(255,159,10,0.06)",border:"1px solid rgba(255,159,10,0.25)",borderRadius:12,padding:"14px 16px",marginBottom:16,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between",animation:"fadeUp 0.3s ease" }}>
            <div style={{ display:"flex",alignItems:"center",gap:10 }}>
              <span className="material-symbols-outlined" style={{ color:"#ff9f0a",fontSize:20 }}>warning</span>
              <span style={{ ...TYPE.bodyList,color:"#fff" }}>Du glömde bekräfta gårdagen</span>
            </div>
            <span className="material-symbols-outlined" style={{ color:"#8e8e93",fontSize:18 }}>chevron_right</span>
          </div>
        )}

        {/* Vila-varningar */}
        {vilaVarningar.map((v,i)=>(
          <div key={i} style={{ background:v.typ==='röd'?"rgba(255,69,58,0.08)":"rgba(255,159,10,0.08)",border:`1px solid ${v.typ==='röd'?"rgba(255,69,58,0.25)":"rgba(255,159,10,0.25)"}`,borderRadius:12,padding:"14px 16px",marginBottom:12,display:"flex",alignItems:"center",gap:10 }}>
            <span className="material-symbols-outlined" style={{ color:v.typ==='röd'?"#ff453a":"#ff9f0a",fontSize:20 }}>warning</span>
            <span style={{ ...TYPE.meta,color:"#fff" }}>{v.text}</span>
          </div>
        ))}

        {/* Timer-varningar: 3h-påminnelse (orange) och 12h-varning (röd) */}
        {pagaendeAktiviteter.map(p => {
          const sek = sekDiff(p.start_tid);
          if (sek > 12*3600) return (
            <div key={`varn-${p.id}`} style={{ background:"rgba(255,69,58,0.1)",border:"1px solid rgba(255,69,58,0.35)",borderRadius:12,padding:"14px 16px",marginBottom:10,display:"flex",alignItems:"center",gap:10 }}>
              <span className="material-symbols-outlined" style={{ color:"#ff453a",fontSize:22 }}>warning</span>
              <div style={{ flex:1,minWidth:0 }}>
                <p style={{ margin:0,...TYPE.bodyList,color:"#fff" }}>Timer igång sedan igår</p>
                <p style={{ margin:"2px 0 0",fontSize:13,color:"rgba(255,255,255,0.6)" }}>Startad {(p.start_tid||'').slice(0,5)} — glömd att stoppa?</p>
              </div>
            </div>
          );
          if (sek > 3*3600) return (
            <div key={`pam-${p.id}`} style={{ background:"rgba(255,159,10,0.08)",border:"1px solid rgba(255,159,10,0.25)",borderRadius:12,padding:"12px 16px",marginBottom:10,display:"flex",alignItems:"center",gap:10 }}>
              <span className="material-symbols-outlined" style={{ color:"#ff9f0a",fontSize:20 }}>schedule</span>
              <p style={{ margin:0,fontSize:13,color:"#fff" }}>Timer igång sedan {(p.start_tid||'').slice(0,5)} — glömt stoppa?</p>
            </div>
          );
          return null;
        })}

        {/* Pågående extra-aktiviteter visas nu via global banner ovanför — se timerBanner */}

        {/* Hero */}
        <section style={{ marginBottom:40,animation:"fadeUp 0.5s ease both" }}>
          <h1 style={{ ...TYPE.h2,color:"#fff",margin:"0 0 4px" }}>{hälsning()}, {förnamn}</h1>
          <p style={{ margin:0,...TYPE.meta,color:"#8e8e93" }}>{datumStr}</p>
        </section>

        {/* Shift Status Card — döljs efter bekräftning och när pass redan avslutats
            (då finns sammanfattningen i stället). */}
        {!dagData[idagKey]?.bekraftad && !dagData[idagKey]?.slut_tid && (
        <section style={{ background:isWorking?"#1c1c1e":"rgba(255,255,255,0.04)",borderRadius:12,padding:"20px 24px",marginBottom:32,position:"relative",overflow:"hidden",animation:"fadeUp 0.5s ease 0.05s both",border:isWorking?"1px solid rgba(255,255,255,0.06)":"1px solid rgba(255,255,255,0.05)" }}>
          <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:isWorking?12:4 }}>
            {isWorking
              ? <div style={{ width:8,height:8,borderRadius:"50%",background:"#0a84ff",flexShrink:0,animation:"pulseDot 2s infinite" }} />
              : <span className="material-symbols-outlined" style={{ fontSize:18,color:"#8e8e93" }}>schedule</span>
            }
            {(()=>{
              const typ = dagData[idagKey]?.dagtyp;
              const startKort = dagData[idagKey]?.start_tid?.slice(0,5) || '—';
              const dagTypVisa: Record<string,string> = {
                sjuk: 'Sjukdag', vab: 'VAB', semester: 'Semester', atk: 'ATK',
                utbildning: 'Utbildning pågår', service: 'Service pågår',
                möte: 'Möte pågår', annat: 'Annat arbete pågår',
              };
              const rubrik = !isWorking
                ? 'Väntar på maskin'
                : (typ && typ !== 'normal' && dagTypVisa[typ])
                  ? dagTypVisa[typ]
                  : `Pågående sedan ${startKort}`;
              return <h2 style={{ margin:0,color:"#fff",...TYPE.body,...TNUM }}>{rubrik}</h2>;
            })()}
          </div>
          <p style={{ fontSize:13,color:"rgba(255,255,255,0.5)",margin:isWorking?"0 0 16px":"0 0 14px",lineHeight:1.5,...TNUM }}>
            {!isWorking
              ? 'Startar automatiskt vid inloggning'
              : (dagData[idagKey]?.dagtyp && dagData[idagKey]?.dagtyp !== 'normal')
                ? `Startad ${(dagData[idagKey]?.start_tid||'').slice(0,5)}`
                : 'Avslutas automatiskt vid utloggning från maskinen'
            }
          </p>
          {isWorking && ((maskinNamn || medarbetare?.maskin_id) || (dagData[idagKey]?.objekt_id)) && (
            <div style={{ display:"flex",flexDirection:"column",gap:4,marginBottom:16,paddingBottom:16,borderBottom:"1px solid rgba(255,255,255,0.06)" }}>
              {(maskinNamn || medarbetare?.maskin_id) && (
                <div style={{ display:"flex",justifyContent:"space-between" }}>
                  <span style={{ fontSize:13,color:"rgba(255,255,255,0.5)" }}>Maskin</span>
                  <span style={{ ...TYPE.bodyList,color:"#fff" }}>{maskinNamn || medarbetare?.maskin_id}</span>
                </div>
              )}
              {dagData[idagKey]?.objekt_id && (
                <div style={{ display:"flex",justifyContent:"space-between" }}>
                  <span style={{ fontSize:13,color:"rgba(255,255,255,0.5)" }}>Objekt</span>
                  <span style={{ ...TYPE.bodyList,color:"#fff" }}>{objektLista.find(o => o.id === dagData[idagKey]?.objekt_id)?.namn || dagData[idagKey]?.objekt_id}</span>
                </div>
              )}
            </div>
          )}
          <div>
            {isWorking ? (
              <button onClick={async ()=>{
                const nuT = nuKlock();
                // Verifiera FÖRE lokal state — ett pass som inte avslutades i DB får inte se avslutat ut
                const res = await uppdateraVerifierat(supabase, "arbetsdag", { slut_tid: nuT + ":00" }, { id: dagData[idagKey]?.id });
                if (!res.ok) { alert(res.fel); return; }
                setSlut(nuT); setSlutÄndrad(true);
                setDagData(d => ({ ...d, [idagKey]: { ...d[idagKey], slut_tid: nuT + ":00" } }));
                if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(50);
                synkaVilobrott(idagKey);
              }} style={{ width:"100%",height:56,padding:"0 12px",borderRadius:10,border:"1px solid rgba(255,255,255,0.06)",background:"rgba(255,255,255,0.04)",color:"#fff",...TYPE.bodyList,cursor:"pointer",fontFamily:"inherit" }}>
                Avsluta pass
              </button>
            ) : pagaendeAktiviteter.length===0 ? (
              <button onClick={async ()=>{
                const nuT = nuKlock();
                if (!medarbetare?.id) { console.warn('[Starta manuellt] medarbetare saknas'); return; }
                const res = await upsertVerifierat(supabase, "arbetsdag", {
                  medarbetare_id: medarbetare.id,
                  datum: idagKey,
                  start_tid: nuT + ":00",
                  maskin_id: medarbetare.maskin_id || null,
                  // arbetad_min är generated (slut_tid - start_tid - rast_min) — sätts ej manuellt
                }, { onConflict: 'medarbetare_id,datum', select: "*" });
                if (!res.ok) { alert(res.fel); return; }
                setStart(nuT); setStartÄndrad(true);
                const data = res.rows[0];
                if (data) {
                  setDagData(d => ({ ...d, [idagKey]: {
                    ...(d[idagKey] || {}),
                    id: data.id,
                    status: 'saknas',
                    arbMin: 0,
                    km: 0, km_morgon: 0, km_kvall: 0, km_totalt: 0,
                    trak: !!data.traktamente,
                    start_tid: data.start_tid,
                    start: (data.start_tid||'').slice(0,5),
                    slut_tid: null,
                    slut: '',
                    rast_min: 0,
                    rast: 0,
                    maskin_id: data.maskin_id,
                    maskin_namn: maskinNamnMap[data.maskin_id] || data.maskin_id || null,
                    objekt_id: data.objekt_id || null,
                    objekt_namn: objektLista.find(o => o.id === data.objekt_id)?.namn || null,
                  }}));
                  if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(50);
                  synkaVilobrott(idagKey);
                }
              }} style={{ width:"100%",height:56,padding:"0 12px",borderRadius:10,border:"1px solid rgba(255,255,255,0.25)",background:"transparent",color:"#fff",...TYPE.bodyList,cursor:"pointer",fontFamily:"inherit" }}>
                Starta manuellt
              </button>
            ) : <span />}
          </div>
        </section>
        )}

        {/* Logga tid — lågmäld textlänk under dagens status, inte huvudhandlingen.
            Visas i alla lägen utom när en timer redan pågår eller dagen är
            bekräftad. Täcker morgon före MOM, under pass och kvällsarbete
            efter pass (t.ex. köra hem, hämta reservdelar). */}
        {!dagData[idagKey]?.bekraftad && pagaendeAktiviteter.length===0 && (
          <button onClick={async ()=>{
            const startTid = nuKlock();
            const { data, error } = await supabase.from("extra_tid").insert({
              medarbetare_id: medarbetare.id,
              datum: idagKey,
              start_tid: startTid + ":00",
              slut_tid: null,
              minuter: 0,
              kalla: 'morgon',
            }).select().single();
            if (error || !data) { alert(SPARA_FEL); return; }
            setPagaendeAktiviteter(p => [...p, data]);
            setExtraTidData(d => [data, ...d]);
            if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(80);
          }}
            style={{ display:"flex",alignItems:"center",gap:6,margin:"-8px 0 28px",padding:0,background:"none",border:"none",color:"#0a84ff",...TYPE.bodyList,cursor:"pointer",fontFamily:"inherit" }}>
            <span className="material-symbols-outlined" style={{ fontSize:18 }}>add</span>
            Extra arbete
          </button>
        )}

        {/* "Samma som igår" — visas när dagen ännu inte startat och igår var bekräftad
            med data värd att kopiera (objekt, km eller traktamente). */}
        {!isWorking && !dagData[idagKey]?.bekraftad && (() => {
          const igår = historik.find(d => d.datum === igårKey);
          if (!igår?.bekraftad) return null;
          const harObjekt = !!igår.objekt_id;
          const igårKmTot = (igår.km_morgon || 0) + (igår.km_kvall || 0);
          const harKm = igårKmTot > 0;
          const harTrak = !!igår.traktamente;
          if (!harObjekt && !harKm && !harTrak) return null;
          const igårObjNamn = igår.objekt_id ? (objektLista.find(o => o.id === igår.objekt_id)?.namn || null) : null;
          const sammanfattning: string[] = [];
          if (igårObjNamn) sammanfattning.push(igårObjNamn);
          if (harKm) sammanfattning.push(`${igårKmTot} km`);
          if (harTrak) sammanfattning.push('traktamente');
          return (
            <section style={{ marginBottom:24 }}>
              <button onClick={() => {
                if (igår.objekt_id) setValtObjektId(igår.objekt_id);
                if (igår.km_morgon != null) setKmM({ km: igår.km_morgon });
                if (igår.km_kvall != null) setKmK({ km: igår.km_kvall });
                if (igår.traktamente) { setTrak({ summa: gsAvtal?.traktamente_hel_kr ?? 300 }); setTrakÄndrad(true); }
                setIgårKopierat(true);
                setTimeout(() => setIgårKopierat(false), 2000);
                if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(60);
              }} style={{
                width:"100%", display:"flex", alignItems:"center", justifyContent:"space-between",
                padding:"14px 16px", background:"#1c1c1e",
                border:"1px solid rgba(255,255,255,0.06)", borderRadius:12,
                cursor:"pointer", fontFamily:"inherit", textAlign:"left",
              }}>
                <div style={{ minWidth:0, flex:1 }}>
                  <p style={{ margin:0, ...TYPE.bodyList, color:"#fff" }}>
                    {igårKopierat ? "Använt — redo att bekräfta" : "Samma som igår"}
                  </p>
                  {!igårKopierat && (
                    <p style={{ margin:"3px 0 0", fontSize:13, color:"#8e8e93", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{sammanfattning.join(' · ')}</p>
                  )}
                </div>
                <span className="material-symbols-outlined" style={{ fontSize:22, color: igårKopierat ? "#30d158" : "#0a84ff", flexShrink:0, marginLeft:12 }}>{igårKopierat ? "check_circle" : "history"}</span>
              </button>
            </section>
          );
        })()}

        {/* Dagssammanfattning + Bekräfta — när maskin-passet är avslutat,
            eller när det bara finns färdiga extra-aktiviteter för idag. */}
        {(()=>{
          const idagArb: any = dagData[idagKey];
          const extraFärdiga = (extraTidData || []).filter((e: any) => e.datum === idagKey && e.slut_tid);
          const harMaskinPass = !!idagArb?.slut_tid;
          if (!harMaskinPass && extraFärdiga.length === 0) return null;
          const redanBekräftad = !!idagArb?.bekraftad;
          const varBekräftad   = !!idagArb?.bekraftad_tid;
          const ändradSedan    = varBekräftad && !redanBekräftad;
          const bekräftadTidKort = idagArb?.bekraftad_tid
            ? new Date(idagArb.bekraftad_tid).toLocaleTimeString('sv-SE',{hour:'2-digit',minute:'2-digit'})
            : '';
          const dagNamnLång = ["Söndag","Måndag","Tisdag","Onsdag","Torsdag","Fredag","Lördag"][idag.getDay()];
          const månNamnLång = ["januari","februari","mars","april","maj","juni","juli","augusti","september","oktober","november","december"][idag.getMonth()];
          const dagTypRubrik: Record<string,string> = { sjuk:'Sjukdag', vab:'VAB' };
          const typPrefix = idagArb?.dagtyp && idagArb.dagtyp !== 'normal' ? dagTypRubrik[idagArb.dagtyp] : '';
          const datumRubrik = typPrefix
            ? `${typPrefix} — ${dagNamnLång} ${idag.getDate()} ${månNamnLång}`
            : `${dagNamnLång} ${idag.getDate()} ${månNamnLång}`;
          const dagObjId = valtObjektId || idagArb?.objekt_id || null;
          const dagObjNamn = dagObjId ? (objektLista.find(o => o.id === dagObjId)?.namn || dagObjId) : '';
          const maskinNamnLång = maskinNamn || maskinNamnMap[medarbetare?.maskin_id] || medarbetare?.maskin_id || '';
          const helKr  = gsAvtal?.traktamente_hel_kr  ?? 300;
          const halvKr = gsAvtal?.traktamente_halv_kr ?? 150;
          const harKm = totKm > 0 || (kmBerakning != null && kmBerakning > 0);
          const harErsKr = ersKr > 0;
          const harKmBlock = harKm && harMaskinPass;
          const harObjBlock = !!(dagObjNamn || maskinNamnLång) && harMaskinPass;
          const sammanRad = (label: string, value: string, onClick?: () => void) => (
            <div key={label} onClick={onClick}
              style={{ display:"flex",justifyContent:"space-between",padding:"6px 0",alignItems:"center",cursor:onClick?"pointer":"default" }}>
              <span style={{ color:"rgba(255,255,255,0.6)",...TYPE.meta }}>{label}</span>
              <div style={{ display:"flex",alignItems:"center",gap:4 }}>
                <span style={{ color:"#fff",...TYPE.bodyList,...TNUM }}>{value}</span>
                {onClick && <span className="material-symbols-outlined" style={{ fontSize:16,color:"rgba(255,255,255,0.25)" }}>chevron_right</span>}
              </div>
            </div>
          );
          const öppnaTider = () => { setTS(start); setTE(slut); setTR(rast); setVisaTiderSheet(true); };
          const öppnaKm    = () => { setTMK(kmM?.km||0); setTKK(kmK?.km||0); setVisaKmSheet(true); };
          return (
            <section style={{ marginBottom:32 }}>
              <div style={{ background:"#1c1c1e",borderRadius:12,padding:"20px",border:"1px solid rgba(255,255,255,0.06)" }}>
                <p style={{ margin:"0 0 6px",...TYPE.body,color:"#fff" }}>{datumRubrik}</p>
                {redanBekräftad && (
                  <div style={{ display:"flex",alignItems:"center",gap:6,marginBottom:12 }}>
                    <span className="material-symbols-outlined" style={{ fontSize:18,color:"#30d158" }}>check_circle</span>
                    <span style={{ ...TYPE.meta,color:"#30d158",...TNUM }}>Bekräftad{bekräftadTidKort?` kl ${bekräftadTidKort}`:''}</span>
                  </div>
                )}
                {ändradSedan && (
                  <div style={{ display:"flex",alignItems:"center",gap:6,marginBottom:12 }}>
                    <span className="material-symbols-outlined" style={{ fontSize:18,color:"#ff9f0a" }}>edit</span>
                    <span style={{ ...TYPE.meta,color:"#ff9f0a" }}>Ändrad — ej bekräftad</span>
                  </div>
                )}
                {!redanBekräftad && !ändradSedan && <div style={{ height:6 }} />}
                {/* Hjälte: Total arbetstid — hela blocket klickbart, öppnar Ändra tider
                    (start/slut/rast, samma sheet som Arbetstid/Rast-raderna öppnade). */}
                {harMaskinPass && (
                  <div onClick={öppnaTider} style={{ textAlign:"center",padding:"14px 0 16px",cursor:"pointer",borderBottom:(harObjBlock||harKmBlock)?"1px solid rgba(255,255,255,0.08)":"none",marginBottom:(harObjBlock||harKmBlock)?10:0 }}>
                    {/* "Maskinpass", inte "Total arbetstid" — siffran är passets tid
                        (start→slut−rast, redigerbar här). Extra tid är egna poster;
                        dagens TOTAL visas som dämpad rad nedan när extra finns. */}
                    <p style={{ margin:"0 0 8px",...TYPE.meta,color:"#8e8e93" }}>Maskinpass</p>
                    <p style={{ margin:0,...TYPE.bigNum,color:"#fff",...TNUM }}>{fmt(arbMin)}</p>
                    <p style={{ margin:"8px 0 0",...TYPE.meta,color:"#8e8e93",...TNUM }}>
                      {start} → {slut} · rast {rast} min
                      <span className="material-symbols-outlined" style={{ fontSize:14,color:"rgba(255,255,255,0.25)",verticalAlign:"-2px",marginLeft:2 }}>chevron_right</span>
                    </p>
                    <p style={{ margin:"6px 0 0",...TYPE.caption,color:"#636366" }}>Rast = tid markerad som Meal break i maskinen</p>
                    {(()=>{
                      const exMinIdag = extraTidData.filter(e => e.datum === idagKey).reduce((a,e) => a + (e.minuter||0), 0);
                      return exMinIdag > 0 ? (
                        <p style={{ margin:"6px 0 0",...TYPE.caption,color:"#8e8e93",...TNUM }}>+ {fmt(exMinIdag)} extra arbete · totalt {fmt(arbMin + exMinIdag)} idag</p>
                      ) : null;
                    })()}
                  </div>
                )}
                {harObjBlock&&(
                  <div style={{ paddingBottom:10,borderBottom:harKmBlock?"1px solid rgba(255,255,255,0.08)":"none",marginBottom:harKmBlock?10:0 }}>
                    {maskinNamnLång && sammanRad("Maskin", maskinNamnLång)}
                    {(()=>{
                      // Flera objekt per dag (Hössjömåla + Flytt etc.) — visa varje
                      // som egen rad. Faller tillbaka på primärt objekt om listan saknas.
                      const objLista = idagArb?.objekt_lista || [];
                      if (objLista.length > 1) {
                        return objLista.map((o:any, i:number) => {
                          const tidStr = o.start_tid && o.slut_tid
                            ? ` (${o.start_tid.slice(0,5)}–${o.slut_tid.slice(0,5)})`
                            : o.arbetad_min ? ` (${fmt(o.arbetad_min)})` : '';
                          return (
                            <div key={o.id} style={{ display:"flex",justifyContent:"space-between",padding:"6px 0",alignItems:"center" }}>
                              <span style={{ color:"rgba(255,255,255,0.6)",...TYPE.meta }}>{i === 0 ? "Objekt" : ""}</span>
                              <span style={{ color:"#fff",...TYPE.bodyList,textAlign:"right" as const,...TNUM }}>
                                {o.objekt_namn || o.objekt_id}
                                <span style={{ color:"rgba(255,255,255,0.5)",fontSize:13,...TNUM }}>{tidStr}</span>
                              </span>
                            </div>
                          );
                        });
                      }
                      return dagObjNamn ? sammanRad("Objekt", dagObjNamn) : null;
                    })()}
                  </div>
                )}
                {/* Körning — bara för maskinpass */}
                {harMaskinPass && (
                  <div style={{ paddingBottom:10,borderBottom:"1px solid rgba(255,255,255,0.08)",marginBottom:10 }}>
                    {sammanRad("Körning", `${totKm} km`, öppnaKm)}
                    {harErsKr && sammanRad("Ersättning", `${ersKr.toFixed(2).replace('.',',')} kr`)}
                  </div>
                )}
                {/* Extra tid-rader för idag — klickbara för att redigera typ/objekt/deb/kommentar.
                    Prefix Morgon/Kväll/Extra avgörs av tid relative till arbetsdag. */}
                {(()=>{
                  const extraIdag = (extraTidData || [])
                    .filter((e: any) => e.datum === idagKey && e.slut_tid)
                    .sort((a: any, b: any) => (a.start_tid||'').localeCompare(b.start_tid||''));
                  if (extraIdag.length === 0) return null;
                  const arbSt = dagData[idagKey]?.start_tid;
                  const arbEn = dagData[idagKey]?.slut_tid;
                  const prefixFör = (e: any): string => {
                    if (arbSt && e.slut_tid && e.slut_tid <= arbSt) return "Morgon";
                    if (arbEn && e.start_tid && e.start_tid >= arbEn) return "Kväll";
                    return "Extra";
                  };
                  return (
                    <div style={{ paddingBottom:10,borderBottom:"1px solid rgba(255,255,255,0.08)",marginBottom:10,display:"flex",flexDirection:"column",gap:6 }}>
                      {extraIdag.map((e: any) => {
                        const typLabel = e.aktivitet_typ ? aktLabel(e.aktivitet_typ) : '';
                        const tidStr = `${(e.start_tid||'').slice(0,5)}–${(e.slut_tid||'').slice(0,5)}`;
                        const värde = `${typLabel?typLabel+' ':''}${tidStr} (${fmt(e.minuter||0)})`;
                        return (
                          <div key={e.id} onClick={()=>{
                            setKvAvTyp(e.aktivitet_typ || null);
                            setKvAvObj(e.objekt_id ? objektLista.find(o => o.id === e.objekt_id) || null : null);
                            setKvAvDeb(!!e.debiterbar);
                            setKvAvBesk(e.kommentar || "");
                            setEfterStoppSheet(e);
                          }} style={{ display:"flex",justifyContent:"space-between",padding:"6px 0",alignItems:"center",cursor:"pointer",gap:8 }}>
                            <span style={{ color:"rgba(255,255,255,0.6)",...TYPE.meta,flexShrink:0 }}>{prefixFör(e)}</span>
                            <div style={{ display:"flex",alignItems:"center",gap:4,minWidth:0 }}>
                              <span style={{ color:"#fff",...TYPE.bodyList,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",...TNUM }}>{värde}</span>
                              <span className="material-symbols-outlined" style={{ fontSize:16,color:"rgba(255,255,255,0.25)",flexShrink:0 }}>chevron_right</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
                {harMaskinPass && (
                <div onClick={()=>setTrakÖppen(v=>!v)} style={{ display:"flex",justifyContent:"space-between",padding:"6px 0",cursor:"pointer",alignItems:"center" }}>
                  <span style={{ color:"rgba(255,255,255,0.6)",...TYPE.meta }}>Traktamente</span>
                  <div style={{ display:"flex",alignItems:"center",gap:4 }}>
                    <span style={{ color:"#fff",...TYPE.bodyList,...TNUM }}>{trak?.summa ? `${trak.summa} kr` : "Inget"}</span>
                    <span className="material-symbols-outlined" style={{ fontSize:18,color:"rgba(255,255,255,0.3)",transform:trakÖppen?"rotate(90deg)":"none",transition:"transform 0.2s" }}>chevron_right</span>
                  </div>
                </div>
                )}
                {harMaskinPass && trakÖppen&&(
                  <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginTop:10 }}>
                    {[{k:'inget',l:'Inget',v:null},{k:'halv',l:`Halv · ${halvKr}`,v:{summa:halvKr}},{k:'hel',l:`Hel · ${helKr}`,v:{summa:helKr}}].map(opt=>{
                      const valt = opt.v === null ? !trak : (trak?.summa === (opt.v as any)?.summa);
                      return (
                        <button key={opt.k} onClick={async ()=>{
                          setTrakÖppen(false);
                          if (dagData[idagKey]?.id) {
                            const bryterBekräftelse = !!dagData[idagKey]?.bekraftad;
                            const payload: any = { traktamente: !!opt.v };
                            if (bryterBekräftelse) payload.bekraftad = false;
                            const res = await uppdateraVerifierat(supabase, "arbetsdag", payload, { id: dagData[idagKey].id });
                            if (!res.ok) { alert(res.fel); return; } // trak-valet rörs inte — DB och UI ska aldrig glida isär
                            if (bryterBekräftelse) setDagData(d => ({ ...d, [idagKey]: { ...d[idagKey], bekraftad: false, traktamente: !!opt.v } }));
                            else setDagData(d => ({ ...d, [idagKey]: { ...d[idagKey], traktamente: !!opt.v } }));
                          }
                          setTrak(opt.v as any); setTrakÄndrad(true);
                        }}
                          style={{ background:valt?"rgba(173,198,255,0.12)":"rgba(255,255,255,0.04)",border:valt?"1px solid rgba(173,198,255,0.3)":"1px solid rgba(255,255,255,0.06)",borderRadius:10,padding:"10px 6px",color:valt?"#0a84ff":"#fff",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit" }}>{opt.l}</button>
                      );
                    })}
                  </div>
                )}
              </div>
              {/* Primärknapp: Bekräfta / Bekräfta igen / Ändra rapport — bara för maskinpass */}
              {harMaskinPass && pagaendeAktiviteter.length===0 && (redanBekräftad ? (
                <button onClick={()=>setVisaTiderSheet(false)}
                  style={{ width:"100%",marginTop:16,padding:"18px",background:"#2c2c2e",color:"#fff",border:"none",borderRadius:12,fontSize:16,fontWeight:600,cursor:"default",fontFamily:"inherit" }}>
                  Ändra rapport
                </button>
              ) : (
                <button
                  onClick={async ()=>{
                    const nuT = nuKlock();
                    const nuTS = nuT + ":00";
                    // Stoppa eventuella pågående extra-tid-aktiviteter.
                    // Går stängningen inte igenom avbryts bekräftelsen — annars
                    // bekräftas dagen med en timer som fortfarande är öppen i DB.
                    for (const p of pagaendeAktiviteter) {
                      const min = minutDiff(p.start_tid, nuTS);
                      const res = await uppdateraVerifierat(supabase, "extra_tid", { slut_tid: nuTS, minuter: min }, { id: p.id });
                      if (!res.ok) { alert(res.fel); return; }
                    }
                    if (pagaendeAktiviteter.length > 0) setPagaendeAktiviteter([]);

                    // För-check: kör analys på [idag-7, idag] och hämta obesvarade brott.
                    // Om någon finns → starta orsaks-flödet och vänta. Annars → bekräfta direkt.
                    if (medarbetare?.id && trosklar) {
                      const fromDt = new Date(idagKey); fromDt.setDate(fromDt.getDate() - 7);
                      const fromIso = fromDt.toISOString().slice(0, 10);
                      const toIso = idagKey;
                      const dagar = årsData.filter(r => r.datum >= fromIso && r.datum <= toIso);
                      try {
                        await analyseraOchSpara(medarbetare.id, dagar, trosklar, fromIso, toIso);
                        const nyaBrott = await hamtaAktuellaVilobrott(medarbetare.id);
                        setAktuellaVilobrott(nyaBrott);
                        const obesvarade = nyaBrott
                          .filter(b => !b.besvarat_av_forare)
                          .filter(b => b.datum >= fromIso && b.datum <= toIso);
                        if (obesvarade.length > 0) {
                          // Frys kön — bygg INTE om från re-fetchad aktuellaVilobrott under flödet
                          setVilobrottKö(obesvarade);
                          setVilobrottIdx(0);
                          setVilobrottOrsakVal(null);
                          setVilobrottOrsakFritext("");
                          setSteg("vilobrottOrsak");
                          return;
                        }
                      } catch (err) {
                        // För-check fel ska inte blockera arbetsflödet — bekräfta ändå.
                        // Vilo-data uppdateras vid nästa render.
                        console.error('Vilo-för-check misslyckades:', err);
                      }
                    }

                    // Inga obesvarade brott — bekräfta direkt
                    await bekraftaDagen();
                  }}
                  style={{ width:"100%",marginTop:16,padding:"20px",background:"#30D158",color:"#fff",border:"none",borderRadius:12,fontSize:17,fontWeight:600,cursor:"pointer",fontFamily:"inherit" }}>
                  {ändradSedan ? "Bekräfta igen" : "Bekräfta dagen"}
                </button>
              ))}
              {/* Guard-felmeddelande — visas om bekraftaDagen blockerade pga tomma tider */}
              {bekraftaFel && (
                <p style={{ margin:"10px 0 0",...TYPE.meta,color:"#ff453a",textAlign:"center" }}>{bekraftaFel}</p>
              )}
              {/* "+ Starta extra tid" lever nu högst upp i dag-vyn som enda ingång */}
            </section>
          );
        })()}

        {/* Bottom sheet för Starta extra arbete renderas utanför main (nedan) */}

        {/* Månadssammanställnings-notis (OBS: månadsKlar sätts aldrig — död sedan tidigare, flaggad) */}
        {månadsKlar&&!lönStatusPerPeriod[new Date().toISOString().slice(0,7)]&&(
          <div onClick={()=>setSteg("lön")} style={{ background:"rgba(255,149,0,0.08)",border:"1px solid rgba(255,149,0,0.25)",borderRadius:12,padding:16,marginBottom:24,cursor:"pointer",animation:"fadeUp 0.4s ease" }}>
            <p style={{ margin:"0 0 6px",fontSize:13,fontWeight:500,color:C.orange }}>Månaden är slut</p>
            <p style={{ margin:"0 0 8px",...TYPE.bodyList,color:"#fff" }}>Granska månadssammanställningen för {månadsNamn()}</p>
            <span style={{ ...TYPE.meta,color:"#0a84ff" }}>Öppna →</span>
          </div>
        )}

        {/* Frånvaro & övrigt — klickbart kort, expandera för val */}
        {!isWorking && !dagData[idagKey]?.bekraftad && (
          <section style={{ marginTop:32,marginBottom:16,animation:"fadeUp 0.5s ease 0.15s both" }}>
            <button onClick={()=>setVisaÖvrigt(v=>!v)}
              style={{ width:"100%",display:"flex",justifyContent:"space-between",alignItems:"center",padding:"16px 20px",background:"#1c1c1e",borderRadius:12,border:"1px solid rgba(255,255,255,0.06)",cursor:"pointer",fontFamily:"inherit",textAlign:"left" }}>
              <div>
                <p style={{ margin:0,fontSize:16,fontWeight:600,color:"#fff" }}>Frånvaro</p>
                <p style={{ margin:"3px 0 0",fontSize:13,color:"rgba(255,255,255,0.5)" }}>Sjuk, VAB</p>
              </div>
              <span className="material-symbols-outlined" style={{ fontSize:22,color:"rgba(255,255,255,0.45)",transform:visaÖvrigt?"rotate(90deg)":"none",transition:"transform 0.2s",flexShrink:0,marginLeft:12 }}>chevron_right</span>
            </button>
            {visaÖvrigt && (
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginTop:12,animation:"fadeUp 0.25s ease" }}>
                {[
                  {id:"sjuk", label:"Sjukfrånvaro", icon:"medical_services", heldag:true, msg:{text:"Krya på dig!", icon:"sick"}},
                  {id:"vab",  label:"VAB",          icon:"child_care",       heldag:true, msg:{text:"VAB registrerad"}},
                ].map(s=>(
                  <button key={s.id} onClick={async ()=>{
                    const nuT = nuKlock();
                    const nuIso = new Date().toISOString();
                    // Heldagstyper: bekräftas direkt, ingen tid krävs
                    // Timertyper: skapas med start_tid, pågående tills föraren avslutar
                    const payload: any = {
                      medarbetare_id: medarbetare.id,
                      datum: idagKey,
                      dagtyp: s.id,
                    };
                    if (s.heldag) {
                      payload.bekraftad = true;
                      payload.bekraftad_tid = nuIso;
                    } else {
                      payload.start_tid = nuT + ":00";
                    }
                    const res = await upsertVerifierat(supabase, "arbetsdag", payload, { onConflict: 'medarbetare_id,datum', select: "*" });
                    if (!res.ok) { alert(res.fel); return; }
                    const data = res.rows[0];
                    if (data) {
                      setDagTyp(s.id);
                      setDagData(d => ({ ...d, [idagKey]: {
                        ...(d[idagKey] || {}),
                        id: data.id,
                        status: data.bekraftad ? 'ok' : 'saknas',
                        dagtyp: data.dagtyp,
                        start_tid: data.start_tid,
                        start: data.start_tid ? data.start_tid.slice(0,5) : '',
                        slut_tid: data.slut_tid || null,
                        slut: data.slut_tid ? data.slut_tid.slice(0,5) : '',
                        bekraftad: !!data.bekraftad,
                        bekraftad_tid: data.bekraftad_tid,
                        arbMin: 0,
                        km: 0, km_morgon: 0, km_kvall: 0, km_totalt: 0,
                      }}));
                      setVisaÖvrigt(false);
                      if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(120);
                      if (s.heldag) {
                        setHeldagsMeddelande({ typ: s.id, text: s.msg!.text, icon: (s.msg as any).icon });
                        setTimeout(() => setHeldagsMeddelande(null), 2500);
                      }
                    }
                  }}
                    style={{ height:56,background:"#1c1c1e",borderRadius:12,border:"1px solid rgba(255,255,255,0.06)",display:"flex",alignItems:"center",justifyContent:"center",gap:8,padding:"0 12px",cursor:"pointer",fontFamily:"inherit" }}>
                    <span className="material-symbols-outlined" style={{ color:"#8e8e93",fontSize:18 }}>{s.icon}</span>
                    <span style={{ color:"#fff",...TYPE.bodyList }}>{s.label}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}


        {/* Maskinstatus & Plats — startsidans metadata, göms när pass avslutats eller bekräftats */}
        {!dagData[idagKey]?.slut_tid && !dagData[idagKey]?.bekraftad && (
        <section style={{ marginTop:48,paddingTop:32,borderTop:"1px solid rgba(255,255,255,0.05)",animation:"fadeUp 0.5s ease 0.15s both" }}>
          <div style={{ marginBottom:24 }}>
            <h3 style={secHead}>Maskinstatus</h3>
            <div style={{ display:"flex",flexWrap:"wrap",gap:8 }}>
              {maskinNamn || medarbetare?.maskin_id ? (
                <div style={{ background:"#1c1c1e",padding:"6px 12px",borderRadius:999,fontSize:13,fontWeight:500,color:"#fff" }}>
                  {[maskinNamn, medarbetare?.maskin_id].filter(Boolean).join(" · ")}
                </div>
              ) : <p style={{ margin:0,fontSize:13,color:"#636366" }}>Ingen maskin inloggad</p>}
            </div>
          </div>
          {(()=>{
            const vObj = valtObjektId ? objektLista.find(o=>o.id===valtObjektId) : null;
            const visatObjekt = dagensObjekt || dagData[idagKey]?.objekt_namn || (vObj?.namn);
            const visatÄgare = vObj?.ägare || null;
            const platsText = visatObjekt
              ? `${visatObjekt}${visatÄgare ? ` · ${visatÄgare}` : ''}`
              : "Välj objekt";
            return (
              <button onClick={()=>setVisaObjektVäljare(true)}
                style={{ width:"100%",display:"flex",justifyContent:"space-between",alignItems:"center",padding:"16px 20px",background:"#1c1c1e",borderRadius:12,border:"1px solid rgba(255,255,255,0.06)",cursor:"pointer",fontFamily:"inherit",textAlign:"left" }}>
                <div>
                  <p style={{ margin:0,fontSize:16,fontWeight:600,color:"#fff" }}>Plats</p>
                  <p style={{ margin:"3px 0 0",fontSize:13,color:"rgba(255,255,255,0.5)" }}>{platsText}</p>
                </div>
                <span className="material-symbols-outlined" style={{ fontSize:22,color:"rgba(255,255,255,0.45)",flexShrink:0,marginLeft:12 }}>chevron_right</span>
              </button>
            );
          })()}
        </section>
        )}

        {/* Objektväljare */}
        {visaObjektVäljare&&(
          <div style={{ position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.8)",zIndex:100,display:"flex",alignItems:"flex-end",justifyContent:"center" }}>
            <div style={{ background:"#0d0d0f",borderRadius:"12px 12px 0 0",width:"100%",maxWidth:500,maxHeight:"70vh",display:"flex",flexDirection:"column" }}>
              <div style={{ padding:"16px 20px",borderBottom:"1px solid rgba(255,255,255,0.06)",display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                <h3 style={{ margin:0,...TYPE.h2 }}>Välj objekt</h3>
                <button onClick={()=>setVisaObjektVäljare(false)} style={{ background:"none",border:"none",color:"#8e8e93",...TYPE.meta,cursor:"pointer",fontFamily:"inherit" }}>Stäng</button>
              </div>
              <div style={{ flex:1,overflowY:"auto" }}>
                <ObjektValjarLista
                  objekt={objektLista}
                  valtId={valtObjektId}
                  onVälj={o => { if (o) setValtObjektId(o.id); setVisaObjektVäljare(false); }}
                />
              </div>
            </div>
          </div>
        )}
      </main>

      <BottomNavBar aktiv="morgon" onNav={s=>setSteg(s)} />

      {/* Bottom sheet: Starta extra arbete */}
      {/* Objekt-väljare (stackad ovanpå Starta extra-sheet:en) */}

      {/* Objekt-väljare för efter-stopp-sheet (stackat ovanpå) */}
      {efterStoppSheet && kvAvVäljer && (
        <div onClick={()=>setKvAvVäljer(false)}
          style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:1700,display:"flex",alignItems:"flex-end",justifyContent:"center",animation:"dimIn 0.2s ease" }}>
          <div onClick={e=>e.stopPropagation()}
            style={{ width:"100%",maxWidth:560,background:"#0d0d0f",borderRadius:"12px 12px 0 0",padding:"10px 0 20px",maxHeight:"85vh",display:"flex",flexDirection:"column",animation:"sheetSlideUp 0.28s cubic-bezier(0.2,0.8,0.2,1)" }}>
            <div style={{ display:"flex",justifyContent:"center",padding:"6px 0 14px" }}>
              <div style={{ width:40,height:5,borderRadius:3,background:"rgba(255,255,255,0.2)" }} />
            </div>
            <div style={{ padding:"0 20px 12px",display:"flex",alignItems:"center",justifyContent:"space-between" }}>
              <p style={{ margin:0,...TYPE.h2,color:"#fff" }}>Välj objekt</p>
              <button onClick={()=>setKvAvVäljer(false)} style={{ background:"none",border:"none",color:"rgba(255,255,255,0.6)",fontSize:14,fontWeight:500,cursor:"pointer",fontFamily:"inherit" }}>Avbryt</button>
            </div>
            <div style={{ flex:1,overflowY:"auto" }}>
              {objektLista.length === 0 ? (
                <p style={{ margin:"32px 20px",textAlign:"center",...TYPE.meta,color:"rgba(255,255,255,0.5)" }}>Inga objekt tillgängliga</p>
              ) : (
                <ObjektValjarLista
                  objekt={objektLista}
                  valtId={kvAvObj?.id ?? null}
                  onVälj={o => { setKvAvObj(o); setKvAvVäljer(false); }}
                  tillåtInget
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Bottom sheet: Vad gjorde du? (öppnas efter Stoppa på pågående timer) */}
      {efterStoppSheet && (()=>{
        const typer = EXTRA_ARBETE_TYPER.map(t => AKTIVITETER.find(x => x.typ === t)!);
        const tidLabel = `${(efterStoppSheet.start_tid||'').slice(0,5)} – ${(efterStoppSheet.slut_tid||'').slice(0,5)} · ${fmt(efterStoppSheet.minuter || 0)}`;
        const stäng = () => {
          setEfterStoppSheet(null);
          setKvAvTyp(null); setKvAvObj(null); setKvAvDeb(false); setKvAvBesk("");
        };
        const sparaDetaljer = async () => {
          const res = await uppdateraVerifierat(supabase, "extra_tid", {
            aktivitet_typ: kvAvTyp || null,
            objekt_id: kvAvObj?.id || null,
            debiterbar: kvAvDeb,
            kommentar: kvAvBesk || null,
          }, { id: efterStoppSheet.id });
          if (!res.ok) { alert(res.fel); return; } // sheet:en står kvar så föraren kan försöka igen
          setExtraTidData(d => d.map(x => x.id === efterStoppSheet.id
            ? { ...x, aktivitet_typ: kvAvTyp || null, objekt_id: kvAvObj?.id || null, debiterbar: kvAvDeb, kommentar: kvAvBesk || null }
            : x
          ));
          stäng();
        };
        return (
          <div onClick={stäng} style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:1600,display:"flex",alignItems:"flex-end",justifyContent:"center",animation:"dimIn 0.2s ease" }}>
            <div onClick={e=>e.stopPropagation()}
              style={{ width:"100%",maxWidth:560,background:"#1c1c1e",borderRadius:"12px 12px 0 0",padding:"10px 20px 28px",maxHeight:"90vh",overflowY:"auto",animation:"sheetSlideUp 0.28s cubic-bezier(0.2,0.8,0.2,1)" }}>
              <div style={{ display:"flex",justifyContent:"center",padding:"6px 0 14px" }}>
                <div style={{ width:40,height:5,borderRadius:3,background:"rgba(255,255,255,0.2)" }} />
              </div>
              <p style={{ margin:"0 0 4px",...TYPE.h2,color:"#fff" }}>Vad gjorde du?</p>
              <p style={{ margin:"0 0 16px",...TYPE.meta,color:"rgba(255,255,255,0.5)" }}>{tidLabel}</p>

              <p style={{ margin:"0 0 8px",fontSize:13,color:"rgba(255,255,255,0.6)" }}>Aktivitet</p>
              {typer.map(t=>(
                <div key={t.typ} onClick={()=>setKvAvTyp(t.typ)}
                  style={{ background:kvAvTyp===t.typ?"rgba(10,132,255,0.15)":"rgba(255,255,255,0.04)",borderRadius:12,padding:"12px 16px",marginBottom:6,cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",border:kvAvTyp===t.typ?"1px solid rgba(10,132,255,0.35)":"1px solid rgba(255,255,255,0.06)" }}>
                  <span style={{ ...TYPE.bodyList,color:"#fff" }}>{t.label}</span>
                  {kvAvTyp===t.typ
                    ? <div style={{ width:20,height:20,borderRadius:"50%",background:"#0a84ff",display:"flex",alignItems:"center",justifyContent:"center" }}><svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l3 3L9 1" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
                    : <div style={{ width:20,height:20,borderRadius:"50%",border:"1.5px solid rgba(255,255,255,0.18)" }}/>
                  }
                </div>
              ))}

              <div onClick={()=>setKvAvVäljer(true)} style={{ marginTop:12,background:"rgba(255,255,255,0.04)",borderRadius:12,padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",border:"1px solid rgba(255,255,255,0.06)" }}>
                <div>
                  <p style={{ margin:0,...TYPE.bodyList,color:"#fff" }}>Objekt</p>
                  <p style={{ margin:"2px 0 0",fontSize:13,color:kvAvObj?"#0a84ff":"rgba(255,255,255,0.5)" }}>{kvAvObj?kvAvObj.namn:"Välj objekt (valfritt)"}</p>
                </div>
                <ChevronRight/>
              </div>

              <div style={{ marginTop:6,background:"rgba(255,255,255,0.04)",borderRadius:12,padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",border:"1px solid rgba(255,255,255,0.06)" }}>
                <div>
                  <p style={{ margin:0,...TYPE.bodyList,color:"#fff" }}>Debiterbar</p>
                  <p style={{ margin:"2px 0 0",fontSize:13,color:"rgba(255,255,255,0.5)" }}>Faktureras kunden</p>
                </div>
                <div onClick={()=>setKvAvDeb(v=>!v)}
                  style={{ width:51,height:31,borderRadius:999,background:kvAvDeb?"#30d158":"rgba(120,120,128,0.3)",cursor:"pointer",position:"relative",transition:"background 0.2s",flexShrink:0 }}>
                  <div style={{ width:27,height:27,borderRadius:"50%",background:"#fff",position:"absolute",top:2,left:kvAvDeb?22:2,transition:"left 0.2s" }}/>
                </div>
              </div>

              <div style={{ marginTop:12 }}>
                <p style={{ margin:"0 0 6px",fontSize:13,color:"rgba(255,255,255,0.6)" }}>Kommentar (valfritt)</p>
                <input value={kvAvBesk} onChange={e=>setKvAvBesk(e.target.value)} placeholder="Eller hoppa över"
                  style={{ width:"100%",padding:"13px 14px",fontSize:15,border:"1px solid rgba(255,255,255,0.08)",borderRadius:10,outline:"none",background:"rgba(255,255,255,0.04)",color:"#fff",fontFamily:"inherit",boxSizing:"border-box" }}/>
              </div>

              <button onClick={sparaDetaljer}
                style={{ width:"100%",marginTop:20,padding:"18px",background:"#0a84ff",color:"#fff",border:"none",borderRadius:12,fontSize:17,fontWeight:700,cursor:"pointer",fontFamily:"inherit" }}>
                Spara
              </button>
              <button onClick={stäng}
                style={{ width:"100%",marginTop:8,padding:"12px",background:"none",color:"rgba(255,255,255,0.6)",border:"none",fontSize:14,fontWeight:500,cursor:"pointer",fontFamily:"inherit" }}>
                Hoppa över
              </button>
            </div>
          </div>
        );
      })()}

      {/* Bottom sheet: Ändra tider */}
      {visaTiderSheet && (()=>{
        const tAm = Math.max(0, tim(tS, tE) - tR);
        const stäng = () => setVisaTiderSheet(false);
        const ändrat = tS !== start || tE !== slut || tR !== rast;
        return (
          <div onClick={stäng} style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:1500,display:"flex",alignItems:"flex-end",justifyContent:"center",animation:"dimIn 0.2s ease" }}>
            <div onClick={e=>e.stopPropagation()}
              style={{ width:"100%",maxWidth:560,background:"#1c1c1e",borderRadius:"12px 12px 0 0",padding:"10px 20px 28px",maxHeight:"92vh",overflowY:"auto",animation:"sheetSlideUp 0.28s cubic-bezier(0.2,0.8,0.2,1)" }}>
              <div style={{ display:"flex",justifyContent:"center",padding:"6px 0 14px" }}>
                <div style={{ width:40,height:5,borderRadius:3,background:"rgba(255,255,255,0.2)" }} />
              </div>
              <p style={{ margin:"0 0 16px",...TYPE.h2,color:"#fff" }}>Ändra tider</p>
              <div style={{ background:"rgba(255,255,255,0.04)",borderRadius:12,padding:"16px 12px",display:"flex",flexDirection:"column",gap:16 }}>
                <div>
                  <span style={{ ...secHead,display:"block",textAlign:"center",marginBottom:6,color:tS!==start?C.orange:"rgba(255,255,255,0.5)" }}>Start</span>
                  <TimePicker value={tS} onChange={setTS}/>
                </div>
                <div style={{ borderTop:"1px solid rgba(255,255,255,0.06)",paddingTop:14 }}>
                  <span style={{ ...secHead,display:"block",textAlign:"center",marginBottom:6,color:tE!==slut?C.orange:"rgba(255,255,255,0.5)" }}>Slut</span>
                  <TimePicker value={tE} onChange={setTE}/>
                </div>
                <div style={{ borderTop:"1px solid rgba(255,255,255,0.06)",paddingTop:14 }}>
                  <span style={{ ...secHead,display:"block",textAlign:"center",marginBottom:8,color:tR!==rast?C.orange:"rgba(255,255,255,0.5)" }}>Rast</span>
                  <div style={{ display:"flex",justifyContent:"center",alignItems:"center",gap:8 }}>
                    <Wheel value={tR} onChange={setTR} min={0} max={120} step={5}/>
                    <span style={{ ...TYPE.meta,color:"rgba(255,255,255,0.5)",fontWeight:600 }}>min</span>
                  </div>
                </div>
              </div>
              <div style={{ marginTop:16,padding:"18px 20px",background:"rgba(48,209,88,0.08)",borderRadius:12,display:"flex",justifyContent:"space-between",alignItems:"baseline" }}>
                <span style={{ color:"rgba(255,255,255,0.6)",...TYPE.meta,fontWeight:500 }}>Maskinpass</span>
                <span style={{ color:"#30d158",...TYPE.h2,...TNUM }}>{fmt(tAm)}</span>
              </div>
              <div style={{ display:"grid",gridTemplateColumns:"1fr 2fr",gap:8,marginTop:16 }}>
                <button onClick={stäng}
                  style={{ padding:"16px",background:"rgba(255,255,255,0.06)",color:"#fff",border:"none",borderRadius:12,fontSize:15,fontWeight:600,cursor:"pointer",fontFamily:"inherit" }}>
                  Avbryt
                </button>
                <button
                  onClick={async ()=>{
                    if (ändrat) {
                      if (dagData[idagKey]?.id) {
                        // Om dagen var bekräftad, rasera bekräftelsen så status visar "Ändrad".
                        // Verifiera skrivningen FÖRE lokal state — tider är lönedata,
                        // ett "Spara" som inte nådde DB får inte se sparat ut.
                        const bryterBekräftelse = !!dagData[idagKey]?.bekraftad;
                        const payload: any = { start_tid: tS + ":00", slut_tid: tE ? tE + ":00" : null, rast_min: tR };
                        if (bryterBekräftelse) payload.bekraftad = false;
                        const res = await uppdateraVerifierat(supabase, "arbetsdag", payload, { id: dagData[idagKey].id });
                        if (!res.ok) { alert(res.fel); return; } // sheet:en står kvar
                        setDagData(d => ({ ...d, [idagKey]: { ...d[idagKey], start_tid: tS + ":00", slut_tid: tE ? tE + ":00" : null, rast_min: tR, start: tS, slut: tE, rast: tR, ...(bryterBekräftelse ? { bekraftad: false } : {}) } }));
                        synkaVilobrott(idagKey);
                      }
                      // Per-fält dirty: frys bara det föraren faktiskt ändrade
                      if (tS !== start) { setStart(tS); setStartÄndrad(true); }
                      if (tE !== slut)  { setSlut(tE);  setSlutÄndrad(true); }
                      if (tR !== rast)  { setRast(tR);  setRastÄndrad(true); }
                    }
                    stäng();
                  }}
                  style={{ padding:"16px",background:"#0a84ff",color:"#fff",border:"none",borderRadius:12,fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:"inherit" }}>
                  Spara
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Bottom sheet: Ändra km */}
      {visaKmSheet && (()=>{
        const ny = tMK + tKK;
        const över = Math.max(0, ny - frikm);
        const mil = över > 0 ? Math.ceil(över/10) : 0;
        const kr = Math.round(mil * fardtidPerMil * 100) / 100;
        const stäng = () => setVisaKmSheet(false);
        const KmInput = ({label, value, onChange}: {label: string; value: number; onChange: (v:number)=>void}) => (
          <div style={{ flex:1,background:"rgba(255,255,255,0.04)",borderRadius:12,padding:"14px 16px",border:"1px solid rgba(255,255,255,0.06)" }}>
            <p style={{ margin:"0 0 10px",fontSize:13,color:"rgba(255,255,255,0.6)",fontWeight:500 }}>{label}</p>
            <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between" }}>
              <button onClick={()=>onChange(Math.max(0, value-10))} style={{ width:36,height:36,borderRadius:10,background:"rgba(255,255,255,0.08)",border:"none",color:"#fff",fontSize:20,cursor:"pointer" }}>−</button>
              <span style={{ fontSize:28,fontWeight:700,color:"#fff",fontVariantNumeric:"tabular-nums" }}>{value}</span>
              <button onClick={()=>onChange(Math.min(999, value+10))} style={{ width:36,height:36,borderRadius:10,background:"rgba(255,255,255,0.08)",border:"none",color:"#fff",fontSize:20,cursor:"pointer" }}>+</button>
            </div>
            <p style={{ margin:"6px 0 0",textAlign:"center",fontSize:12,color:"rgba(255,255,255,0.4)" }}>km</p>
          </div>
        );
        return (
          <div onClick={stäng} style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:1500,display:"flex",alignItems:"flex-end",justifyContent:"center",animation:"dimIn 0.2s ease" }}>
            <div onClick={e=>e.stopPropagation()}
              style={{ width:"100%",maxWidth:560,background:"#1c1c1e",borderRadius:"12px 12px 0 0",padding:"10px 20px 28px",maxHeight:"85vh",overflowY:"auto",animation:"sheetSlideUp 0.28s cubic-bezier(0.2,0.8,0.2,1)" }}>
              <div style={{ display:"flex",justifyContent:"center",padding:"6px 0 14px" }}>
                <div style={{ width:40,height:5,borderRadius:3,background:"rgba(255,255,255,0.2)" }} />
              </div>
              <p style={{ margin:"0 0 16px",...TYPE.h2,color:"#fff" }}>Ändra km</p>
              <div style={{ display:"flex",gap:10 }}>
                <KmInput label="Morgon" value={tMK} onChange={setTMK}/>
                <KmInput label="Kväll"  value={tKK} onChange={setTKK}/>
              </div>
              <div style={{ marginTop:16,padding:"18px 20px",background:"rgba(48,209,88,0.08)",borderRadius:12 }}>
                <div style={{ display:"flex",justifyContent:"space-between",alignItems:"baseline" }}>
                  <span style={{ color:"rgba(255,255,255,0.6)",...TYPE.meta }}>Totalt</span>
                  <span style={{ color:"#30d158",...TYPE.h2,...TNUM }}>{ny} km</span>
                </div>
                {över > 0
                  ? <p style={{ margin:"8px 0 0",fontSize:13,color:"#30d158",fontWeight:500 }}>Färdtidsersättning: {över} km över {frikm} km = {mil} mil × {fardtidPerMil.toString().replace('.',',')} kr = {kr.toFixed(2).replace('.',',')} kr</p>
                  : <p style={{ margin:"8px 0 0",fontSize:13,color:"rgba(255,255,255,0.5)" }}>Ingen färdtidsersättning (≤ {frikm} km)</p>
                }
              </div>
              <div style={{ display:"grid",gridTemplateColumns:"1fr 2fr",gap:8,marginTop:16 }}>
                <button onClick={stäng}
                  style={{ padding:"16px",background:"rgba(255,255,255,0.06)",color:"#fff",border:"none",borderRadius:12,fontSize:15,fontWeight:600,cursor:"pointer",fontFamily:"inherit" }}>
                  Avbryt
                </button>
                <button
                  onClick={async ()=>{
                    if (dagData[idagKey]?.id) {
                      const bryterBekräftelse = !!dagData[idagKey]?.bekraftad;
                      const payload: any = { km_morgon: tMK, km_kvall: tKK };
                      if (bryterBekräftelse) payload.bekraftad = false;
                      const res = await uppdateraVerifierat(supabase, "arbetsdag", payload, { id: dagData[idagKey].id });
                      if (!res.ok) { alert(res.fel); return; } // sheet:en står kvar
                      setDagData(d => ({ ...d, [idagKey]: { ...d[idagKey], km_morgon: tMK, km_kvall: tKK, km: tMK+tKK, km_totalt: tMK+tKK, ...(bryterBekräftelse ? { bekraftad: false } : {}) } }));
                    }
                    setKmM({km:tMK}); setKmK({km:tKK});
                    stäng();
                  }}
                  style={{ padding:"16px",background:"#0a84ff",color:"#fff",border:"none",borderRadius:12,fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:"inherit" }}>
                  Spara
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Bekräftelse-overlay efter Bekräfta dagen ✓ */}
      {/* Heldagstyp-meddelande (Sjuk/VAB/Semester/Ledig) — auto-stänger efter 2.5s */}
      {heldagsMeddelande && (
        <div style={{ position:"fixed",inset:0,background:"#000",zIndex:2100,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",animation:"dimIn 0.2s ease",padding:"24px" }}>
          {heldagsMeddelande.icon && (
            <span className="material-symbols-outlined" style={{ fontSize:96,color:"#fff",marginBottom:24,animation:"checkPop 0.5s cubic-bezier(0.2,0.8,0.3,1.2)" }}>{heldagsMeddelande.icon}</span>
          )}
          <p style={{ margin:"0 0 16px",...TYPE.largeTitle,color:"#fff",textAlign:"center" }}>{heldagsMeddelande.text}</p>
          <p style={{ margin:0,...TYPE.meta,color:"rgba(255,255,255,0.5)" }}>
            {["Söndag","Måndag","Tisdag","Onsdag","Torsdag","Fredag","Lördag"][idag.getDay()]} {idag.getDate()} {["januari","februari","mars","april","maj","juni","juli","augusti","september","oktober","november","december"][idag.getMonth()]}
          </p>
        </div>
      )}

      {/* Timer visas nu som kompakt banner överst — se timerBanner */}

      {bekräftelseVisa && (
        <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:2000,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",animation:"dimIn 0.2s ease" }}>
          <div style={{ width:120,height:120,borderRadius:"50%",background:"#30D158",display:"flex",alignItems:"center",justifyContent:"center",animation:"checkPop 0.5s cubic-bezier(0.2,0.8,0.3,1.2)" }}>
            <svg width="56" height="56" viewBox="0 0 52 52">
              <path d="M14 27 L23 36 L38 18" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" strokeDasharray="60" style={{ animation:"checkDraw 0.4s 0.2s both ease-out" }}/>
            </svg>
          </div>
          <p style={{ margin:"32px 0 0",...TYPE.largeTitle,color:"#fff" }}>Dagen bekräftad</p>
        </div>
      )}
    </div>
  );


  /* ─── MIN TID ─── */
  if(steg==="mintid") {
    const nu = new Date();
    const dagKort = ['SÖN','MÅN','TIS','ONS','TOR','FRE','LÖR'];
    const dagNamn = ['söndag','måndag','tisdag','onsdag','torsdag','fredag','lördag'];
    const månNamn2 = ['jan','feb','mar','apr','maj','jun','jul','aug','sep','okt','nov','dec'];

    // Extra tid (arbete när maskinen var av) är arbetstid rakt av — räknas
    // in i ALLA summor och övertidsberäkningar här, samma definition som
    // löneexporten (lib/arbetstid.ts). En dag kan ha extra utan maskinpass.
    const extraPerDag = extraMinPerDag(extraTidData);
    const extraMinMellan = (from: string, tom?: string) => {
      let s = 0;
      for (const [datum, min] of extraPerDag) {
        if (datum >= from && (!tom || datum <= tom)) s += min;
      }
      return s;
    };

    // Vecka: hitta mån-sön för aktuell vecka
    const dagIdx = (nu.getDay()+6)%7; // 0=mån
    const veckStart = new Date(nu); veckStart.setDate(nu.getDate()-dagIdx);
    const veckSlut = new Date(veckStart); veckSlut.setDate(veckStart.getDate()+6);
    const veckoNr = Math.ceil((Math.floor((nu.getTime()-new Date(nu.getFullYear(),0,1).getTime())/864e5)+new Date(nu.getFullYear(),0,1).getDay()+1)/7);
    const rödaDagarVecka = getRödaDagar(nu.getFullYear());
    const veckoDagar: {datum:string;dag:string;h:number}[] = [];
    let veckoTot = 0;
    let veckoArbDagar = 0;
    for(let i=0;i<7;i++){
      const d=new Date(veckStart); d.setDate(veckStart.getDate()+i);
      const k=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      const ad=årsData.find(r=>r.datum===k);
      // Extra tid räknas även på dagar UTAN maskinpass (ad saknas då)
      const h=Math.round(((ad?.arbetad_min||0)+(extraPerDag.get(k)||0))/60*10)/10;
      veckoTot+=h;
      const dow=d.getDay();
      if(dow!==0&&dow!==6&&!rödaDagarVecka[k]) veckoArbDagar++;
      veckoDagar.push({datum:k,dag:dagNamn[d.getDay()],dagKort:dagKort[d.getDay()],h});
    }
    const veckoMålH = veckoArbDagar * 8;
    const maxH = Math.max(...veckoDagar.map(d=>d.h),1);

    // Idag
    const idagKey2 = nu.toISOString().split('T')[0];
    const idagAd = årsData.find(r=>r.datum===idagKey2);
    const idagH = Math.round(((idagAd?.arbetad_min||0)+(extraPerDag.get(idagKey2)||0))/60*10)/10;
    const idagDiff = idagH - 8;

    // Månad
    const månStart = `${nu.getFullYear()}-${String(nu.getMonth()+1).padStart(2,'0')}-01`;
    const månData = årsData.filter(r=>r.datum>=månStart);
    const månJobbatMin = månData.reduce((a,d)=>a+(d.arbetad_min||0),0) + extraMinMellan(månStart);
    const månJobbatH = Math.round(månJobbatMin/60*10)/10;
    // Räkna arbetsdagar i månaden
    const dIM = new Date(nu.getFullYear(),nu.getMonth()+1,0).getDate();
    const rödaDagar2 = getRödaDagar(nu.getFullYear());
    let månArbDagar=0;
    for(let d=1;d<=dIM;d++){
      const dt=new Date(nu.getFullYear(),nu.getMonth(),d);
      const dow=dt.getDay();
      const k=`${nu.getFullYear()}-${String(nu.getMonth()+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      if(dow!==0&&dow!==6&&!rödaDagar2[k]) månArbDagar++;
    }
    const månMålH = månArbDagar*8;
    const månÖvH = Math.max(0,månJobbatH-månMålH);

    // Kvartal
    const kvartal = Math.floor(nu.getMonth()/3);
    const kvStart = `${nu.getFullYear()}-${String(kvartal*3+1).padStart(2,'0')}-01`;
    const kvData = årsData.filter(r=>r.datum>=kvStart);
    const kvMin = kvData.reduce((a,d)=>a+(d.arbetad_min||0),0) + extraMinMellan(kvStart);
    // Räkna kvartalets arbetsdagar
    let kvArbDagar=0;
    for(let m=kvartal*3;m<kvartal*3+3;m++){
      const dagar=new Date(nu.getFullYear(),m+1,0).getDate();
      for(let d=1;d<=dagar;d++){
        const dt=new Date(nu.getFullYear(),m,d);
        const dow=dt.getDay();
        const k=`${nu.getFullYear()}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        if(dow!==0&&dow!==6&&!rödaDagar2[k]) kvArbDagar++;
      }
    }
    const kvÖvH = Math.max(0,Math.round(kvMin/60*10)/10-kvArbDagar*8);

    // År — övertid beräknad per månad
    const årsMin = årsData.reduce((a,d)=>a+(d.arbetad_min||0),0) + extraMinMellan(`${nu.getFullYear()}-01-01`);
    let årsÖvH = 0;
    for(let m=0;m<=nu.getMonth();m++){
      const mp=`${nu.getFullYear()}-${String(m+1).padStart(2,'0')}`;
      const mMin=årsData.filter(d=>d.datum&&d.datum.startsWith(mp)).reduce((a,d)=>a+(d.arbetad_min||0),0)
        + extraMinMellan(`${mp}-01`, `${mp}-31`);
      // Räkna vardagar i månaden
      const dIM2=m===nu.getMonth()?nu.getDate():new Date(nu.getFullYear(),m+1,0).getDate();
      let mArbD=0;
      for(let d=1;d<=dIM2;d++){
        const dt=new Date(nu.getFullYear(),m,d);
        const dow=dt.getDay();
        const k=`${nu.getFullYear()}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        if(dow!==0&&dow!==6&&!rödaDagar2[k]) mArbD++;
      }
      const mMålMin=mArbD*480;
      const mÖv=Math.max(0,mMin-mMålMin);
      årsÖvH+=mÖv/60;
    }
    årsÖvH=Math.round(årsÖvH*10)/10;
    const årsKvar = Math.max(0,250-årsÖvH);
    const årsBarFärg = årsÖvH>230?"#ff453a":årsÖvH>200?"#ff9f0a":"#30d158";

    // Varningar — vila läses från vilobrott-tabellen (en sanning, samma som
    // Dag-vyn). Övertidstak ligger kvar inline tills övertidshantering blir
    // egen uppgift (200/230/250h är separat scope, ej rört av denna refaktor).
    const varningar: {typ:'röd'|'orange';text:string}[] = [];
    for (const b of aktuellaVilobrott) {
      if (b.besvarat_av_forare) continue;
      if (b.typ === 'dygnsvila') {
        varningar.push({
          typ: 'röd',
          text: `Dygnsvila bruten ${b.datum.slice(5)}: ${Number(b.vila_h)}h vila (krav ${Number(b.krav_h)}h)`,
        });
      } else if (b.typ === 'veckovila') {
        varningar.push({
          typ: 'orange',
          text: `Veckovila bruten ${b.datum.slice(5)}: ${Number(b.vila_h)}h vila (krav ${Number(b.krav_h)}h)`,
        });
      }
    }
    // Övertidstak — separat scope, ej rört
    if(årsÖvH>230) varningar.push({typ:'röd',text:`${årsKvar}h kvar till max 250h övertid`});
    else if(årsÖvH>200) varningar.push({typ:'orange',text:'Du närmar dig övertidstaket (250h)'});

    const fmtDiff = (h: number) => { const abs=Math.abs(h); const hh=Math.floor(abs); const mm=Math.round((abs-hh)*60); return `${h>=0?'+':'−'}${hh}h${mm>0?` ${mm}min`:''}`; };
    const månDiff = månJobbatH - månMålH;

    return (
      <div style={{ minHeight:"100vh",background:"#000",color:"#fff",fontFamily:"'Inter',-apple-system,sans-serif",WebkitFontSmoothing:"antialiased",paddingBottom:120 }}>
        <style>{css}</style>{timerBanner}
        <header style={{ position:"fixed",top:HEADER_TOP,width:"100%",zIndex:50,background:"rgba(0,0,0,0.8)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",display:"flex",flexDirection:"column",padding:"0 24px",paddingTop:16 }}>
          <h1 style={{ margin:"0 0 12px",...TYPE.h1,color:"#fff" }}>Min tid</h1>
          <div style={{ display:"flex",gap:0,background:"rgba(255,255,255,0.06)",borderRadius:8,padding:2,marginBottom:12,overflowX:"auto" }}>
            {([['översikt','Översikt'],['saldon','Saldon'],['vila','Vila'],['monster','Mönster'],['lön','Lön']] as const).map(([k,l])=>(
              <button key={k} onClick={()=>{if(k==='lön'){setSteg('lön');return;}setMinTidFlik(k);}} style={{ flex:1,minWidth:60,padding:"7px 8px",borderRadius:6,border:"none",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",background:minTidFlik===k?"rgba(255,255,255,0.12)":"transparent",color:minTidFlik===k?"#fff":"#8e8e93",whiteSpace:"nowrap" }}>{l}</button>
            ))}
          </div>
        </header>

        <main style={{ paddingTop:126,paddingLeft:20,paddingRight:20,paddingBottom:SCROLL_BOTTOM }}>

          {/* Varningar — bara på översikt */}
          {minTidFlik==='översikt'&&varningar.length>0&&(
            <section style={{ marginBottom:24 }}>
              {varningar.map((v,i)=>(
                <div key={i} style={{ background:v.typ==='röd'?"rgba(255,69,58,0.08)":"rgba(255,159,10,0.08)",border:`1px solid ${v.typ==='röd'?"rgba(255,69,58,0.25)":"rgba(255,159,10,0.25)"}`,borderRadius:12,padding:"14px 16px",marginBottom:8,display:"flex",alignItems:"center",gap:10 }}>
                  <span className="material-symbols-outlined" style={{ color:v.typ==='röd'?"#ff453a":"#ff9f0a",fontSize:20 }}>warning</span>
                  <span style={{ ...TYPE.meta,color:"#fff" }}>{v.text}</span>
                </div>
              ))}
            </section>
          )}

          {minTidFlik==='översikt'&&<>
          {/* Stapeldiagram — veckan */}
          <section style={{ marginBottom:32 }}>
            <h3 style={secHead}>Vecka {veckoNr}</h3>
            <div style={{ background:"#1c1c1e",borderRadius:12,padding:20,border:"1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ display:"flex",alignItems:"flex-end",justifyContent:"space-between",height:120,gap:6,marginBottom:8 }}>
                {veckoDagar.map(d=>(
                  <div key={d.datum} style={{ flex:1,display:"flex",flexDirection:"column",alignItems:"center",height:"100%" }}>
                    {d.h>0&&<span style={{ fontSize:10,fontWeight:600,color:"#0a84ff",marginBottom:4 }}>{d.h}</span>}
                    <div style={{ flex:1,display:"flex",alignItems:"flex-end",width:"100%" }}>
                      <div style={{ width:"100%",height:`${d.h>0?Math.max(8,d.h/maxH*100):8}%`,background:d.h>0?"#0a84ff":"rgba(255,255,255,0.08)",borderRadius:4,transition:"height 0.4s ease" }} />
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display:"flex",justifyContent:"space-between" }}>
                {veckoDagar.map(d=>(
                  <div key={d.datum+'l'} style={{ flex:1,textAlign:"center" }}>
                    <span style={{ fontSize:9,fontWeight:600,color:d.h>0?"#8e8e93":"rgba(255,255,255,0.15)",letterSpacing:"0.05em" }}>{(d as any).dagKort}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Summering */}
          <section style={{ marginBottom:32 }}>
            <h3 style={secHead}>Summering</h3>
            <div style={{ background:"#1c1c1e",borderRadius:12,padding:"4px 20px",border:"1px solid rgba(255,255,255,0.06)" }}>
              {[
                ...(idagH>0?[{label:"Idag",val:`${idagH}h`}]:[]),
                {label:"Veckan",val:`${Math.round(veckoTot*10)/10}h`,sub:`av ${veckoMålH}h`},
                {label:"Månaden",val:`${månJobbatH}h`,sub:månÖvH>0?`av ${månMålH}h (${månÖvH}h övertid)`:`av ${månMålH}h`},
                {label:"Året",val:`${Math.round(årsMin/60*10)/10}h`,sub:'totalt'},
              ].map((r,i,arr)=>(
                <div key={r.label} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 0",borderBottom:i<arr.length-1?"1px solid rgba(255,255,255,0.04)":"none" }}>
                  <span style={{ ...TYPE.meta,color:"#8e8e93" }}>{r.label}</span>
                  <div style={{ display:"flex",alignItems:"baseline",gap:8 }}>
                    <span style={{ ...TYPE.bodyList,color:"#fff" }}>{r.val}</span>
                    {'sub' in r&&<span style={{ fontSize:12,fontWeight:500,color:"#8e8e93" }}>{(r as any).sub}</span>}
                  </div>
                </div>
              ))}
            </div>
          </section>

          </>}

          {minTidFlik==='saldon'&&<>
          {/* Semester */}
          {(()=>{
            const laddar = fortnoxSaldoStatus==='loading' || fortnoxSaldoStatus==='idle';
            const fel    = fortnoxSaldoStatus==='error';
            const tom    = fortnoxSaldoStatus==='tom';

            const betalda = fortnoxSaldo?.semester.betalda ?? 0;
            const obetalda = fortnoxSaldo?.semester.obetalda ?? 0;
            const sparade = fortnoxSaldo?.semester.sparade ?? 0;
            const uttagna = fortnoxSaldo?.semester.uttagna ?? 0;
            const semKvar = fortnoxSaldo?.semester.kvar ?? 0;
            const semTotalt = betalda + sparade;
            const semPct = semTotalt>0?Math.min(100,uttagna/semTotalt*100):0;

            return (
              <section style={{ marginBottom:24 }}>
                <h3 style={secHead}>Semester</h3>
                <div style={{ background:"#1c1c1e",borderRadius:12,padding:20,border:"1px solid rgba(255,255,255,0.06)" }}>
                  {laddar?(
                    <p style={{ margin:0,...TYPE.meta,color:"#8e8e93" }}>Hämtar saldo…</p>
                  ):fel?(<>
                    <p style={{ margin:0,...TYPE.meta,color:"#ff9f0a" }}>Kunde inte hämta saldo</p>
                    <button onClick={()=>setFortnoxSaldoStatus('idle')}
                      style={{ marginTop:12,padding:"10px 16px",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:10,color:"#fff",...TYPE.meta,cursor:"pointer",fontFamily:"inherit" }}>
                      Försök igen
                    </button>
                  </>):tom?(
                    <p style={{ margin:0,...TYPE.meta,color:"#8e8e93" }}>Inget saldo registrerat</p>
                  ):(<>
                    {/* Hjälte: dagar kvar — flikens hela poäng, samma mönster
                        som Dag-vyns Total och kalenderns månadskort. */}
                    <div style={{ textAlign:"center",padding:"6px 0 4px" }}>
                      <p style={{ margin:0,...TYPE.bigNum,color:"#fff",...TNUM }}>
                        {semKvar}
                        <span style={{ ...TYPE.meta,color:"#8e8e93",marginLeft:6 }}>dagar kvar</span>
                      </p>
                      <div style={{ height:4,background:"rgba(255,255,255,0.06)",borderRadius:2,marginTop:14,overflow:"hidden" }}>
                        <div style={{ height:"100%",width:`${semPct}%`,background:"#0a84ff",borderRadius:2 }} />
                      </div>
                    </div>
                    <div style={{ borderTop:"1px solid rgba(255,255,255,0.08)",marginTop:16,paddingTop:8 }}>
                      {[
                        ["Betalda",`${betalda} dagar`],
                        ["Sparade",`${sparade} dagar`],
                        ["Obetalda",`${obetalda} dagar`],
                        ["Uttagna",`${uttagna} dagar`],
                      ].map(([l,v])=>(
                        <div key={l as string} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0" }}>
                          <span style={{ ...TYPE.meta,color:"#8e8e93" }}>{l}</span>
                          <span style={{ ...TYPE.bodyList,color:"#fff",...TNUM }}>{v}</span>
                        </div>
                      ))}
                    </div>
                  </>)}
                </div>
              </section>
            );
          })()}

          {/* ATK */}
          {(()=>{
            const laddar = fortnoxSaldoStatus==='loading' || fortnoxSaldoStatus==='idle';
            const fel    = fortnoxSaldoStatus==='error';
            const tom    = fortnoxSaldoStatus==='tom';

            const atkKr    = fortnoxSaldo?.atk.saldo_kr ?? 0;
            const atkTimmar = fortnoxSaldo?.atk.timmar ?? null;
            const atkDagar = atkTimmar!=null ? Math.round(atkTimmar/8*10)/10 : null;
            const årNu2 = nu.getFullYear();
            const harValt = !!atkValSparat;

            // ATK-valperiod: 1-15 maj
            const maj1  = new Date(årNu2, 4, 1);
            const maj15 = new Date(årNu2, 4, 15, 23, 59, 59);
            const föreValperiod = nu < maj1;
            const iValperiod    = nu >= maj1 && nu <= maj15;
            const efterValperiod = nu > maj15;

            return (
              <section style={{ marginBottom:24 }}>
                <h3 style={secHead}>ATK</h3>
                {/* Saldo */}
                <div style={{ background:"#1c1c1e",borderRadius:12,padding:20,border:"1px solid rgba(255,255,255,0.06)",marginBottom:12 }}>
                  {laddar?(
                    <p style={{ margin:0,...TYPE.meta,color:"#8e8e93" }}>Hämtar saldo…</p>
                  ):fel?(<>
                    <p style={{ margin:0,...TYPE.meta,color:"#ff9f0a" }}>Kunde inte hämta saldo</p>
                    <button onClick={()=>setFortnoxSaldoStatus('idle')}
                      style={{ marginTop:12,padding:"10px 16px",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:10,color:"#fff",...TYPE.meta,cursor:"pointer",fontFamily:"inherit" }}>
                      Försök igen
                    </button>
                  </>):tom?(
                    <p style={{ margin:0,...TYPE.meta,color:"#8e8e93" }}>Inget saldo registrerat</p>
                  ):(<>
                    <div style={{ display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:atkTimmar!=null?16:0 }}>
                      <span style={{ ...TYPE.h2,color:"#fff",...TNUM }}>{atkKr.toLocaleString('sv-SE')} <span style={{ ...TYPE.meta,color:"#8e8e93" }}>kr</span></span>
                    </div>
                    {atkTimmar!=null&&(
                      <div style={{ display:"flex",justifyContent:"space-between" }}>
                        <span style={{ fontSize:13,color:"#8e8e93" }}>Motsvarar</span>
                        <span style={{ fontSize:13,fontWeight:600,color:"#fff" }}>{atkTimmar}h ({atkDagar} dagar)</span>
                      </div>
                    )}
                  </>)}
                </div>

                {/* ATK-val — beror på datum */}
                {föreValperiod&&(
                  <div style={{ background:"#1c1c1e",borderRadius:12,padding:20,border:"1px solid rgba(255,255,255,0.06)" }}>
                    <p style={{ margin:0,...TYPE.meta,color:"#8e8e93" }}>ATK-val öppnar 1 maj</p>
                  </div>
                )}

                {efterValperiod&&harValt&&(
                  <div style={{ background:"#1c1c1e",borderRadius:12,padding:16,border:"1px solid rgba(48,209,88,0.2)" }}>
                    <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                      <span className="material-symbols-outlined" style={{ fontSize:18,color:"#30d158" }}>check_circle</span>
                      <span style={{ ...TYPE.meta,color:"#fff" }}>
                        Ditt val: {atkValSparat.val==='ledig'?'Ledig tid':atkValSparat.val==='kontant'?'Pengar':'Pension'}
                      </span>
                    </div>
                  </div>
                )}

                {/* Valfönstret stängt utan val: säg det ärligt och lugnt —
                    föraren kan inget göra förrän nästa fönster, ingen varning
                    och inget "kontakta chef". */}
                {efterValperiod&&!harValt&&(
                  <div style={{ background:"#1c1c1e",borderRadius:12,padding:16,border:"1px solid rgba(255,255,255,0.06)" }}>
                    <p style={{ margin:0,...TYPE.meta,color:"#8e8e93" }}>Inget val registrerat i år · nästa ATK-val öppnar 1 maj</p>
                  </div>
                )}

                {iValperiod&&harValt&&(
                  <div style={{ background:"#1c1c1e",borderRadius:12,padding:16,border:"1px solid rgba(48,209,88,0.2)" }}>
                    <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                      <span className="material-symbols-outlined" style={{ fontSize:16,color:"#30d158" }}>check</span>
                      <span style={{ ...TYPE.meta,color:"#fff" }}>
                        {atkValSparat.val==='ledig'?`Du valde ledig tid${atkDagar!=null?`: ${atkDagar} dagar`:''}`:atkValSparat.val==='kontant'?`Utbetalas juni ${årNu2}: ≈ ${atkKr.toLocaleString('sv-SE')} kr`:`Avsatt till pension: ≈ ${atkKr.toLocaleString('sv-SE')} kr`}
                      </span>
                    </div>
                  </div>
                )}

                {/* Valfönstret öppet: en handling, inte en varning. */}
                {iValperiod&&!harValt&&(
                  <div style={{ background:"#1c1c1e",borderRadius:12,padding:20,border:"1px solid rgba(255,255,255,0.06)" }}>
                    <p style={{ margin:"0 0 16px",...TYPE.body,color:"#fff" }}>Gör ditt ATK-val {årNu2}</p>
                    <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:16 }}>
                      {([
                        {k:'ledig' as const,label:'Ledig tid',sub:atkDagar!=null?`= ${atkDagar} dagar`:''},
                        {k:'kontant' as const,label:'Pengar',sub:`≈ ${atkKr.toLocaleString('sv-SE')} kr`,sub2:'före skatt'},
                        {k:'pension' as const,label:'Pension',sub:`≈ ${atkKr.toLocaleString('sv-SE')} kr`,sub2:'till pension'},
                      ]).map(o=>(
                        <button key={o.k} onClick={()=>setAtkVal(o.k)} style={{ background:atkVal===o.k?"rgba(173,198,255,0.12)":"rgba(255,255,255,0.04)",border:atkVal===o.k?"1px solid rgba(173,198,255,0.3)":"1px solid rgba(255,255,255,0.06)",borderRadius:10,padding:"14px 8px",cursor:"pointer",fontFamily:"inherit",textAlign:"center" }}>
                          <p style={{ margin:0,fontSize:13,fontWeight:600,color:atkVal===o.k?"#0a84ff":"#fff" }}>{o.label}</p>
                          <p style={{ margin:"4px 0 0",fontSize:12,color:"#8e8e93" }}>{o.sub}</p>
                          {'sub2' in o&&<p style={{ margin:"2px 0 0",fontSize:11,color:"#636366" }}>{(o as any).sub2}</p>}
                        </button>
                      ))}
                    </div>
                    <button
                      disabled={!atkVal}
                      onClick={async()=>{
                        if(!atkVal) return;
                        const row={medarbetare_id:medarbetare.id,period:String(årNu2),val:atkVal,timmar:atkTimmar ?? 0,belopp:atkVal!=='ledig'?atkKr:null,datum_valt:new Date().toISOString(),status:'bekräftad'};
                        const res = await upsertVerifierat(supabase, "atk_val", row, { onConflict: 'medarbetare_id,period' });
                        if (!res.ok) { alert(res.fel); return; } // ATK-valet får aldrig se bekräftat ut utan att vara sparat
                        setAtkValSparat(row);
                      }}
                      style={{ width:"100%",height:48,background:atkVal?"#0a84ff":"rgba(255,255,255,0.04)",border:"none",borderRadius:12,color:atkVal?"#fff":"#636366",fontSize:15,fontWeight:600,cursor:atkVal?"pointer":"default",fontFamily:"inherit",opacity:atkVal?1:0.5 }}>
                      Bekräfta val
                    </button>
                  </div>
                )}
              </section>
            );
          })()}

          </>}

          {minTidFlik==='översikt'&&<>
          {/* Övertid året — progress bar */}
          <section style={{ marginBottom:32 }}>
            <h3 style={secHead}>Övertid {nu.getFullYear()}</h3>
            <div style={{ background:"#1c1c1e",borderRadius:12,padding:20,border:"1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:12 }}>
                <span style={{ ...TYPE.h2,color:årsBarFärg,...TNUM }}>{årsÖvH}h</span>
                <span style={{ ...TYPE.meta,color:"#8e8e93" }}>av 250h</span>
              </div>
              <div style={{ height:4,background:"rgba(255,255,255,0.06)",borderRadius:2,marginBottom:8,overflow:"hidden" }}>
                <div style={{ height:"100%",width:`${Math.min(100,årsÖvH/250*100)}%`,background:årsBarFärg,borderRadius:2,transition:"width 0.5s" }} />
              </div>
              <p style={{ margin:0,fontSize:13,color:"#8e8e93" }}>{årsKvar} tim kvar</p>
            </div>
          </section>

          </>}

          {minTidFlik==='vila'&&<>
          {/* Dygnsvila med periodväljare */}
          {(()=>{
            // Beräkna anledning för dagar i ett gap
            const rödaDagarÅr=getRödaDagar(nu.getFullYear());
            const getAnledning=(slutDatum:string,startDatum:string)=>{
              const d1=new Date(slutDatum),d2=new Date(startDatum);
              const delar:string[]=[];
              let harHelg=false;
              // Kolla varje dag mellan (exklusivt slutdagen, inklusivt mellandagar)
              const cur=new Date(d1);cur.setDate(cur.getDate()+1);
              while(cur<d2){
                const k=cur.toISOString().split('T')[0];
                const dow=cur.getDay();
                const ad=årsData.find(r=>r.datum===k);
                if(ad?.dagtyp==='sjuk'&&!delar.includes('Sjuk')) delar.push('Sjuk');
                else if(ad?.dagtyp==='vab'&&!delar.includes('VAB')) delar.push('VAB');
                else if(ad?.dagtyp==='semester'&&!delar.includes('Semester')) delar.push('Semester');
                else if(ad?.dagtyp==='atk'&&!delar.includes('ATK')) delar.push('ATK');
                else if(rödaDagarÅr[k]&&!delar.includes(rödaDagarÅr[k])) delar.push(rödaDagarÅr[k]);
                else if((dow===0||dow===6)&&!harHelg){harHelg=true;delar.unshift('Helg');}
                cur.setDate(cur.getDate()+1);
              }
              return delar.length>0?delar.join(' + '):'';
            };

            // Beräkna alla viloperioder för hela året
            const sortAsc=[...årsData].filter(r=>r.slut_tid&&r.start_tid).sort((a,b)=>a.datum.localeCompare(b.datum));
            const allVila: {datum:string;vila:number;label:string;månad:number;slutDatum:string;slutTid:string;startDatum:string;startTid:string;ledig:boolean;anledning:string}[] = [];
            for(let i=0;i<sortAsc.length-1;i++){
              const dag1=sortAsc[i], dag2=sortAsc[i+1];
              const d1=new Date(dag1.datum), d2n=new Date(dag2.datum);
              const dagarMellan=Math.round((d2n.getTime()-d1.getTime())/864e5);
              if(dagarMellan>14) continue;
              const sT=dag1.slut_tid.slice(0,5), stT=dag2.start_tid.slice(0,5);
              const slutDt=new Date(`${dag1.datum}T${sT}`);
              const startDt=new Date(`${dag2.datum}T${stT}`);
              const vila=(startDt.getTime()-slutDt.getTime())/3600000;
              if(vila<=0||vila>400) continue;
              const dt2=new Date(dag2.datum);
              const fmtD=(d:Date)=>`${dagNamn[d.getDay()].slice(0,3)} ${d.getDate()} ${månNamn2[d.getMonth()]}`;
              const anledning=dagarMellan>1?getAnledning(dag1.datum,dag2.datum):'';
              allVila.push({datum:dag2.datum,vila:Math.round(vila*10)/10,label:fmtD(dt2),månad:dt2.getMonth(),slutDatum:dag1.datum,slutTid:sT,startDatum:dag2.datum,startTid:stT,ledig:dagarMellan>1,anledning});
            }
            const vilaRev=[...allVila].reverse();

            // Filter baserat på vald period
            const nu5=new Date();
            let filtVila=vilaRev;
            let periodLabel='';
            if(vilaPeriod==='7d'){
              const cutoff=new Date(nu5); cutoff.setDate(nu5.getDate()-7);
              filtVila=vilaRev.filter(r=>r.datum>=cutoff.toISOString().split('T')[0]);
              periodLabel='senaste 7 dagarna';
            } else if(vilaPeriod==='30d'){
              const cutoff=new Date(nu5); cutoff.setDate(nu5.getDate()-30);
              filtVila=vilaRev.filter(r=>r.datum>=cutoff.toISOString().split('T')[0]);
              periodLabel='senaste 30 dagarna';
            } else if(vilaPeriod==='månad'){
              const mp=`${nu5.getFullYear()}-${String(vilaMånad+1).padStart(2,'0')}`;
              filtVila=vilaRev.filter(r=>r.datum.startsWith(mp));
              periodLabel=`${['januari','februari','mars','april','maj','juni','juli','augusti','september','oktober','november','december'][vilaMånad]} ${nu5.getFullYear()}`;
            } else {
              filtVila=vilaRev;
              periodLabel=`${nu5.getFullYear()}`;
            }
            // TODO vid release: förarna måste informeras om att veckovila-vyn nu visar
            // rullande 7-dagars-brott istället för ISO-veckor. Den gamla vyn var bug
            // enligt arbetsmiljölagen (rullande fönster är rätt tolkning). Lite för-info
            // i app eller mail innan deploy hjälper förståelsen.

            // Brott läses från vilobrott-tabellen (en sanning). Render-filtret
            // håller perioden konsekvent — marginal-fönstret vid fetch (-7d) är
            // bara där för att fånga rullande brott som överlappar perioden.
            const periodFrom = vilaPeriod==='7d' ? (()=>{ const d=new Date(nu5); d.setDate(nu5.getDate()-7); return d.toISOString().slice(0,10); })()
              : vilaPeriod==='30d' ? (()=>{ const d=new Date(nu5); d.setDate(nu5.getDate()-30); return d.toISOString().slice(0,10); })()
              : vilaPeriod==='månad' ? `${nu5.getFullYear()}-${String(vilaMånad+1).padStart(2,'0')}-01`
              : `${nu5.getFullYear()}-01-01`;
            const periodTo = vilaPeriod==='månad'
              ? new Date(nu5.getFullYear(), vilaMånad+1, 0).toISOString().slice(0,10)
              : vilaPeriod==='år'
                ? `${nu5.getFullYear()}-12-31`
                : nu5.toISOString().slice(0,10);
            const dbBrottIPeriod = (periodVilobrott || []).filter(b => b.datum >= periodFrom && b.datum <= periodTo);
            const dbDygn = dbBrottIPeriod.filter(b => b.typ === 'dygnsvila');
            const dbVeck = dbBrottIPeriod.filter(b => b.typ === 'veckovila');
            // Matcha en allVila-rad (visning) mot ett dygnsvila-brott (DB).
            // allVila.slutDatum motsvarar vilobrott.datum (slut-dag).
            const brottForRad = (r: typeof allVila[0]) => dbDygn.find(b => b.datum === r.slutDatum);
            const brott = filtVila.filter(r => !!brottForRad(r));
            const harProblem = brott.length > 0;
            const vvHarProblem = dbVeck.length > 0;
            const periodLaddar = periodVilobrott === null;
            // Dygnsvila-tröskeln används i VilaKort + PDF. Veckovila-tröskeln
            // läses direkt från b.krav_h på varje brott, så den behöver inte
            // hoistas här.
            const krav_h = trosklar?.dygnsvila_krav_h ?? 11;
            const orsakLabel = (o: string | null) => {
              if (!o) return '';
              return { oforutsedd:'Oförutsedd händelse', akut_jour:'Akut jour', planerad_avtal:'Planerat enligt avtal', annat:'Annat' }[o] || o;
            };

            // Export. Dygnsvila listas per viloperiod (status från DB-brott).
            // Veckovila listas per DB-brott (rullande fönster) — inte per ISO-vecka.
            const exportPDF = () => {
              const fVH=(h:number)=>{const hh=Math.floor(h);const mm=Math.round((h-hh)*60);return mm>0?`${hh}h ${mm}min`:`${hh}h`;};
              const fDe=(d:string)=>{const dt=new Date(d);return `${dagNamn[dt.getDay()].slice(0,3)} ${dt.getDate()} ${månNamn2[dt.getMonth()]}`;};
              let html=`<html><head><title>Viloperioder</title><style>body{font-family:Inter,system-ui,sans-serif;padding:32px;font-size:13px;color:#222}h1{font-size:18px;margin-bottom:4px}h2{font-size:14px;margin-top:24px;color:#666}table{width:100%;border-collapse:collapse;margin-top:8px}th{text-align:left;padding:8px 12px;background:#f5f5f5;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#666;border-bottom:1px solid #ddd}td{padding:8px 12px;border-bottom:1px solid #eee}.warn{color:#d32f2f;font-weight:600}.ok{color:#2e7d32}</style></head><body>`;
              html+=`<h1>${medarbetare?.namn||''}</h1><p style="color:#666;margin:0 0 24px">Viloperioder — ${periodLabel}</p>`;
              html+=`<h2>Dygnsvila</h2><table><tr><th>Slutade</th><th>Startade igen</th><th>Vila</th><th>Anledning</th><th>Status</th></tr>`;
              for(const r of [...filtVila].reverse()){
                const b = brottForRad(r);
                const ok = !b;
                html+=`<tr><td>${fDe(r.slutDatum)} ${r.slutTid}</td><td>${fDe(r.startDatum)} ${r.startTid}</td><td>${fVH(r.vila)}</td><td>${r.anledning||'—'}</td><td class="${ok?'ok':'warn'}">${ok?'OK':`⚠ Under ${krav_h}h`}</td></tr>`;
              }
              html+=`</table>`;
              html+=`<h2>Veckovila — rullande ${trosklar?.veckovila_fonster_dagar ?? 7}-dagarsfönster</h2>`;
              if(dbVeck.length===0){
                html+=`<p style="color:#666">Inga brott i perioden.</p>`;
              } else {
                html+=`<table><tr><th>Startdatum</th><th>Vila</th><th>Krav</th><th>Beskrivning</th><th>Status</th></tr>`;
                for(const b of dbVeck){
                  html+=`<tr><td>${fDe(b.datum)}</td><td>${fVH(Number(b.vila_h))}</td><td>${fVH(Number(b.krav_h))}</td><td>${b.beskrivning||'—'}</td><td class="warn">⚠ Under ${Number(b.krav_h)}h</td></tr>`;
                }
                html+=`</table>`;
              }
              html+=`</body></html>`;
              const w=window.open('','','width=700,height=900');
              if(w){w.document.write(html);w.document.close();w.document.title='Viloperioder';setTimeout(()=>w.print(),300);}
            };

            // Render en vilorad med klockslag. Rödramat kort = brott i DB:n,
            // klickbart för inline-expansion av orsak/kompensation.
            const fmtVilaH = (h:number) => { const hh=Math.floor(h); const mm=Math.round((h-hh)*60); return mm>0?`${hh}h ${mm}min`:`${hh}h`; };
            const fD=(d:Date)=>`${dagNamn[d.getDay()].slice(0,3)} ${d.getDate()} ${månNamn2[d.getMonth()]}`;

            // ── Sammanfattnings-kort: faktiska siffror, inte binär status. ──
            // Föraren ska se SIN vila ("i natt: 12h 40min"), inte bara "uppfylld".
            // Samma viloperioder som brott-detekteringen redan räknar — vi VISAR dem bara.
            const senasteVilaRad = vilaRev[0] || null; // senaste beräknade viloperioden, oavsett periodfilter
            const veckoFonsterDagar = trosklar?.veckovila_fonster_dagar ?? 7;
            const veckoKravH = trosklar?.veckovila_krav_h ?? 36;
            // Längsta sammanhängande vila i rullande fönster [nu-7d, nu]:
            // viloperioderna klippta mot fönstret + pågående vila sedan sista
            // passets slut (fram till nu, eller till ett pågående pass start).
            const fonsterStartMs = nu5.getTime() - veckoFonsterDagar*864e5;
            let veckoLangstaH = 0; let harVeckoData = false;
            for (const r of allVila) {
              const s = new Date(`${r.slutDatum}T${r.slutTid}`).getTime();
              const e = new Date(`${r.startDatum}T${r.startTid}`).getTime();
              const cs = Math.max(s, fonsterStartMs), ce = Math.min(e, nu5.getTime());
              if (ce > cs) { harVeckoData = true; veckoLangstaH = Math.max(veckoLangstaH, (ce-cs)/36e5); }
            }
            const sistaPasset = sortAsc[sortAsc.length-1];
            if (sistaPasset) {
              const passSlutStr = `${sistaPasset.datum}T${sistaPasset.slut_tid.slice(0,5)}`;
              // Pågående pass (start utan slut) efter sista avslutade passet
              // avslutar den pågående vilan — annars räknas vilan fram till nu.
              const pagaendePass = årsData
                .filter(r => r.start_tid && !r.slut_tid && `${r.datum}T${r.start_tid.slice(0,5)}` > passSlutStr)
                .sort((a,b) => a.datum.localeCompare(b.datum))[0];
              const vilaSlutMs = pagaendePass
                ? new Date(`${pagaendePass.datum}T${pagaendePass.start_tid.slice(0,5)}`).getTime()
                : nu5.getTime();
              const s = new Date(passSlutStr).getTime();
              const cs = Math.max(s, fonsterStartMs), ce = Math.min(vilaSlutMs, nu5.getTime());
              if (ce > cs) { harVeckoData = true; veckoLangstaH = Math.max(veckoLangstaH, (ce-cs)/36e5); }
            }
            veckoLangstaH = Math.round(veckoLangstaH*10)/10;
            // Statusnivå: rött under kravet, gult inom 1h över golvet ("det var
            // tight" — mild markering, inget larm), grönt med god marginal.
            const vilaNiva = (vilaH:number, kravH:number) =>
              vilaH < kravH ? 'brott' : vilaH < kravH + 1 ? 'nara' : 'ok';
            // Långa ledigheter (>=24h) visas som hela timmar — "161h 12min" är
            // brus på den nivån och spränger kortbredden.
            const fmtStor = (h:number) => h >= 24 ? `${Math.round(h)}h` : fmtVilaH(h);
            const SammanfattningsKort = ({label, vilaH, kravH, saknas}:{label:string;vilaH:number;kravH:number;saknas?:boolean}) => {
              const st = vilaNiva(vilaH, kravH);
              const farg = st==='brott' ? '#ff453a' : st==='nara' ? '#ff9f0a' : '#30d158';
              return (
                <div style={{ background:"#1c1c1e",borderRadius:12,padding:"16px 18px",border:"1px solid rgba(255,255,255,0.06)" }}>
                  <p style={{ margin:"0 0 8px",...TYPE.meta,color:"#8e8e93" }}>{label}</p>
                  {saknas ? (
                    <p style={{ margin:0,...TYPE.meta,color:"#8e8e93" }}>Ingen vila registrerad än</p>
                  ) : (<>
                    <p style={{ margin:0,fontSize:22,fontWeight:700,color:"#fff",...TNUM }}>{fmtStor(vilaH)}</p>
                    <p style={{ margin:"6px 0 0",fontSize:12,fontWeight:600,color:farg,display:"flex",alignItems:"center",gap:4 }}>
                      <span className="material-symbols-outlined" style={{ fontSize:14 }}>{st==='brott'?'warning':'check'}</span>
                      {st==='brott' ? `under krav ${kravH}h` : st==='nara' ? `nära gränsen · krav ${kravH}h` : `krav ${kravH}h`}
                    </p>
                  </>)}
                </div>
              );
            };
            const VilaKort = ({r}:{r:typeof allVila[0]}) => {
              const b = brottForRad(r);
              const ok = !b;
              const expanderad = b && vilaKortExpanded === b.id;
              const d1=new Date(r.slutDatum),d2=new Date(r.startDatum);
              return (
                <div
                  onClick={b ? () => setVilaKortExpanded(expanderad ? null : b.id) : undefined}
                  style={{ background:"#1c1c1e",borderRadius:12,padding:"16px 18px",marginBottom:8,border:`1px solid ${ok?"rgba(255,255,255,0.06)":"rgba(255,69,58,0.2)"}`,cursor: b ? "pointer" : "default" }}>
                  <p style={{ margin:"0 0 6px",...TYPE.bodyList,color:"#fff",textTransform:"capitalize" }}>{fD(d1)}</p>
                  <p style={{ margin:"0 0 2px",fontSize:13,color:"#8e8e93" }}>Slutade kl {r.slutTid}</p>
                  <p style={{ margin:"0 0 10px",fontSize:13,color:"#8e8e93" }}>Startade igen: <span style={{ textTransform:"capitalize" }}>{fD(d2)}</span> kl {r.startTid}</p>
                  <div style={{ display:"flex",alignItems:"center",gap:6 }}>
                    {!ok&&<span className="material-symbols-outlined" style={{ color:"#ff453a",fontSize:16 }}>warning</span>}
                    <span style={{ ...TYPE.meta,fontWeight:600,color:ok?"#30d158":"#ff453a",...TNUM }}>Dygnsvila: {fmtVilaH(r.vila)}</span>
                    {ok&&<span className="material-symbols-outlined" style={{ color:"#30d158",fontSize:16 }}>check</span>}
                    {!ok&&<span style={{ fontSize:12,color:"#ff453a" }}>(kräver {krav_h}h)</span>}
                  </div>
                  {r.anledning&&<p style={{ margin:"6px 0 0",fontSize:12,color:"#8e8e93" }}>{r.anledning}</p>}
                  {expanderad && b && (
                    <div style={{ marginTop:10,paddingTop:10,borderTop:"1px solid rgba(255,255,255,0.06)" }}>
                      {b.besvarat_av_forare ? (
                        <p style={{ margin:0,fontSize:12,color:"#8e8e93" }}>
                          Besvarat: {orsakLabel(b.orsak)}{b.orsak_fritext ? ` · ${b.orsak_fritext}` : ''}
                          {b.kompensation_h != null && ` · ${Number(b.kompensation_h)}h kompensation${b.kompensation_uttagen ? ' (uttagen)' : ''}`}
                        </p>
                      ) : (
                        <p style={{ margin:0,fontSize:12,color:"#ff9f0a" }}>Inte besvarat — bekräfta dagen för att ange orsak</p>
                      )}
                    </div>
                  )}
                </div>
              );
            };

            return (<>
            {/* Sammanfattning: faktiska siffror — föraren ser SIN vila, inte bara "uppfylld" */}
            <section style={{ marginBottom:24 }}>
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
                <SammanfattningsKort label="Senaste dygnsvila" vilaH={senasteVilaRad?.vila ?? 0} kravH={krav_h} saknas={!senasteVilaRad} />
                <SammanfattningsKort label={`Veckovila (${veckoFonsterDagar} dagar)`} vilaH={veckoLangstaH} kravH={veckoKravH} saknas={!harVeckoData} />
              </div>
            </section>

            {/* Dygnsvila */}
            <section style={{ marginBottom:24 }}>
              <h3 style={secHead}>Dygnsvila</h3>
              <div style={{ display:"flex",gap:0,marginBottom:16,background:"rgba(255,255,255,0.06)",borderRadius:8,padding:2 }}>
                {([['7d','7 dagar'],['30d','30 dagar'],['månad','Månad'],['år','År']] as const).map(([k,l])=>(
                  <button key={k} onClick={()=>{setVilaPeriod(k);setVisaAllaDygnsvila(false);}} style={{ flex:1,padding:"8px 0",borderRadius:6,border:"none",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",background:vilaPeriod===k?"rgba(255,255,255,0.12)":"transparent",color:vilaPeriod===k?"#fff":"#8e8e93" }}>{l}</button>
                ))}
              </div>
              {vilaPeriod==='månad'&&(
                <div style={{ display:"flex",alignItems:"center",justifyContent:"center",gap:16,marginBottom:16 }}>
                  <button onClick={()=>setVilaMånad(m=>(m-1+12)%12)} style={{ background:"none",border:"none",cursor:"pointer",padding:4 }}><span className="material-symbols-outlined" style={{ color:"#0a84ff",fontSize:20 }}>chevron_left</span></button>
                  <span style={{ ...TYPE.bodyList,color:"#fff",minWidth:120,textAlign:"center",textTransform:"capitalize" }}>{periodLabel}</span>
                  <button onClick={()=>setVilaMånad(m=>(m+1)%12)} style={{ background:"none",border:"none",cursor:"pointer",padding:4 }}><span className="material-symbols-outlined" style={{ color:"#0a84ff",fontSize:20 }}>chevron_right</span></button>
                </div>
              )}

              {/* Default: kompakt eller problem */}
              {!visaAllaDygnsvila&&vilaPeriod!=='år'?(
                <div style={{ background:"#1c1c1e",borderRadius:12,padding:"4px 20px",border:"1px solid rgba(255,255,255,0.06)" }}>
                  {!harProblem?(
                    <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 0" }}>
                      {/* Siffrorna bor i sammanfattnings-korten ovanför — här bara vägen till detaljerna */}
                      <span style={{ ...TYPE.meta,color:"#8e8e93",...TNUM }}>{filtVila.length} {filtVila.length===1?'viloperiod':'viloperioder'} {periodLabel}</span>
                      <button onClick={()=>setVisaAllaDygnsvila(true)} style={{ background:"none",border:"none",color:"#0a84ff",fontSize:13,fontWeight:500,cursor:"pointer",fontFamily:"inherit",padding:0 }}>Se alla nätter →</button>
                    </div>
                  ):(
                    <>
                      {brott.map((r,i)=><VilaKort key={i} r={r} />)}
                      <div style={{ padding:"10px 0 14px",borderTop:"1px solid rgba(255,255,255,0.04)" }}>
                        <button onClick={()=>setVisaAllaDygnsvila(true)} style={{ background:"none",border:"none",color:"#0a84ff",fontSize:13,fontWeight:500,cursor:"pointer",fontFamily:"inherit",padding:0 }}>Se alla {filtVila.length} nätter →</button>
                      </div>
                    </>
                  )}
                </div>
              ):vilaPeriod==='år'?(
                /* Årsvy per månad */
                <div style={{ background:"#1c1c1e",borderRadius:12,padding:"4px 20px",border:"1px solid rgba(255,255,255,0.06)" }}>
                  {(()=>{
                    const mån=Array.from({length:12},(_,m)=>{const mv=allVila.filter(r=>r.månad===m);return{m,mv,brott:mv.filter(r=>r.vila<11).length};}).filter(x=>x.mv.length>0);
                    return mån.length===0?<p style={{ padding:"14px 0",margin:0,...TYPE.meta,color:"#8e8e93" }}>Ingen data</p>:mån.map((x,i)=>{
                      const nm=['Januari','Februari','Mars','April','Maj','Juni','Juli','Augusti','September','Oktober','November','December'][x.m];
                      const exp=vilaÅrExpand===x.m;
                      return (<div key={x.m}>
                        <div onClick={()=>setVilaÅrExpand(exp?null:x.m)} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 0",borderBottom:!exp&&i<mån.length-1?"1px solid rgba(255,255,255,0.04)":"none",cursor:"pointer" }}>
                          <span style={{ ...TYPE.bodyList }}>{nm}</span>
                          <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                            <span style={{ fontSize:13,color:x.brott>0?"#ff453a":"#8e8e93",display:"inline-flex",alignItems:"center",gap:4 }}>{x.mv.length} dagar{x.brott>0?` · ${x.brott}`:''}<span className="material-symbols-outlined" style={{ fontSize:14 }}>{x.brott>0?'warning':'check'}</span></span>
                            <span className="material-symbols-outlined" style={{ fontSize:16,color:"#8e8e93",transform:exp?"rotate(180deg)":"",transition:"transform 0.2s" }}>expand_more</span>
                          </div>
                        </div>
                        {exp&&<div style={{ padding:"8px 0" }}>{x.mv.map((r,j)=><VilaKort key={j} r={r} />)}</div>}
                      </div>);
                    });
                  })()}
                </div>
              ):(
                /* Expanderad lista med kort */
                <div>
                  {filtVila.length===0?<div style={{ background:"#1c1c1e",borderRadius:12,padding:"14px 20px",border:"1px solid rgba(255,255,255,0.06)" }}><p style={{ margin:0,...TYPE.meta,color:"#8e8e93" }}>Ingen data för perioden</p></div>:
                  filtVila.map((r,i)=><VilaKort key={i} r={r} />)}
                  <button onClick={()=>setVisaAllaDygnsvila(false)} style={{ width:"100%",marginTop:4,background:"none",border:"none",color:"#8e8e93",fontSize:13,fontWeight:500,cursor:"pointer",fontFamily:"inherit",padding:"8px 0" }}>Dölj detaljer</button>
                </div>
              )}
            </section>

            {/* Veckovila — rullande fönster från DB:n. Inga ISO-vecka-grupperingar. */}
            <section style={{ marginBottom:24 }}>
              <h3 style={secHead}>Veckovila</h3>
              {periodLaddar ? (
                <div style={{ background:"#1c1c1e",borderRadius:12,padding:"14px 20px",border:"1px solid rgba(255,255,255,0.06)" }}>
                  <p style={{ margin:0,...TYPE.meta,color:"#8e8e93" }}>Laddar viloperioder…</p>
                </div>
              ) : !visaAllaVeckovila?(
                <div style={{ background:"#1c1c1e",borderRadius:12,padding:"4px 20px",border:"1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 0" }}>
                    {/* Aktuell veckovila-siffra bor i sammanfattnings-kortet ovanför —
                        den här sektionen redovisar BROTT i vald period */}
                    <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                      {vvHarProblem&&<span className="material-symbols-outlined" style={{ fontSize:18,color:"#ff453a" }}>warning</span>}
                      <span style={{ ...TYPE.meta,color:vvHarProblem?"#fff":"#8e8e93" }}>{vvHarProblem?`${dbVeck.length} brott mot veckovila`:`Inga brott ${periodLabel}`}</span>
                    </div>
                    {dbVeck.length>0 && <button onClick={()=>setVisaAllaVeckovila(true)} style={{ background:"none",border:"none",color:"#0a84ff",fontSize:13,fontWeight:500,cursor:"pointer",fontFamily:"inherit",padding:0 }}>Visa alla →</button>}
                  </div>
                </div>
              ):(
                <div>
                  {dbVeck.length===0 ? (
                    <div style={{ background:"#1c1c1e",borderRadius:12,padding:"14px 20px",border:"1px solid rgba(255,255,255,0.06)" }}>
                      <p style={{ margin:0,...TYPE.meta,color:"#8e8e93" }}>Inga brott i perioden</p>
                    </div>
                  ) : dbVeck.map(b => {
                    const dt = new Date(b.datum);
                    const expanderad = vilaKortExpanded === b.id;
                    return (
                      <div key={b.id}
                        onClick={() => setVilaKortExpanded(expanderad ? null : b.id)}
                        style={{ background:"#1c1c1e",borderRadius:12,padding:"16px 18px",marginBottom:8,border:"1px solid rgba(255,69,58,0.2)",cursor:"pointer" }}>
                        <p style={{ margin:"0 0 4px",fontSize:13,fontWeight:600,color:"#fff",textTransform:"capitalize" }}>{fD(dt)}</p>
                        <p style={{ margin:"0 0 8px",fontSize:13,color:"#8e8e93" }}>{b.beskrivning}</p>
                        <div style={{ display:"flex",alignItems:"center",gap:6 }}>
                          <span className="material-symbols-outlined" style={{ color:"#ff453a",fontSize:16 }}>warning</span>
                          <span style={{ ...TYPE.meta,fontWeight:600,color:"#ff453a",...TNUM }}>Veckovila: {fmtVilaH(Number(b.vila_h))}</span>
                          <span style={{ fontSize:12,color:"#ff453a" }}>(kräver {Number(b.krav_h)}h)</span>
                        </div>
                        {expanderad && (
                          <div style={{ marginTop:10,paddingTop:10,borderTop:"1px solid rgba(255,255,255,0.06)" }}>
                            {b.besvarat_av_forare ? (
                              <p style={{ margin:0,fontSize:12,color:"#8e8e93" }}>
                                Besvarat: {orsakLabel(b.orsak)}{b.orsak_fritext ? ` · ${b.orsak_fritext}` : ''}
                                {b.kompensation_h != null && ` · ${Number(b.kompensation_h)}h kompensation${b.kompensation_uttagen ? ' (uttagen)' : ''}`}
                              </p>
                            ) : (
                              <p style={{ margin:0,fontSize:12,color:"#ff9f0a" }}>Inte besvarat — bekräfta dagen för att ange orsak</p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <div style={{ padding:"10px 0 14px",borderTop:"1px solid rgba(255,255,255,0.04)" }}>
                    <button onClick={()=>setVisaAllaVeckovila(false)} style={{ background:"none",border:"none",color:"#8e8e93",fontSize:13,fontWeight:500,cursor:"pointer",fontFamily:"inherit",padding:0 }}>Dölj detaljer</button>
                  </div>
                </div>
              )}
            </section>

            {/* Export + Löneunderlag */}
            <section style={{ paddingTop:16,borderTop:"1px solid rgba(255,255,255,0.05)",display:"flex",flexDirection:"column",gap:12 }}>
              <button onClick={exportPDF} style={{ display:"flex",alignItems:"center",gap:8,width:"100%",background:"none",border:"none",padding:"12px 0",cursor:"pointer",fontFamily:"inherit" }}>
                <span className="material-symbols-outlined" style={{ color:"#8e8e93",fontSize:18 }}>print</span>
                <span style={{ fontSize:15,fontWeight:500,color:"#8e8e93" }}>Exportera PDF →</span>
              </button>
            </section>
            </>);
          })()}
          </>}

          {minTidFlik==='monster'&&(()=>{
            // Senaste 30 dagarna av extra_tid
            const nu30 = new Date();
            const cutoff = new Date(nu30); cutoff.setDate(nu30.getDate()-30);
            const cutoffStr = cutoff.toISOString().split('T')[0];
            const senaste30 = extraTidData.filter(e => e.datum && e.datum >= cutoffStr);
            // Dagar med data (unika datum för arbetsdagar)
            const arbDagar30 = new Set(årsData.filter(d => d.datum && d.datum >= cutoffStr && d.start_tid).map(d => d.datum)).size || 1;
            // Per typ
            type Stat = { typ:string; antal:number; minTot:number; medel:number; deb:number; kall:Record<string,number> };
            const perTyp = new Map<string, Stat>();
            for(const e of senaste30) {
              const t = e.aktivitet_typ || 'annat';
              if(!perTyp.has(t)) perTyp.set(t, { typ:t, antal:0, minTot:0, medel:0, deb:0, kall:{morgon:0,kvall:0,under_dagen:0} });
              const s = perTyp.get(t)!;
              s.antal++;
              s.minTot += e.minuter || 0;
              if(e.debiterbar) s.deb++;
              if(e.kalla) s.kall[e.kalla] = (s.kall[e.kalla]||0)+1;
            }
            perTyp.forEach(s => { s.medel = s.antal>0 ? Math.round(s.minTot/s.antal) : 0; });
            const stats = Array.from(perTyp.values()).sort((a,b)=>b.minTot-a.minTot);
            const totMin = senaste30.reduce((a,e)=>a+(e.minuter||0),0);
            return (
              <>
                {/* Sammanfattning */}
                <section style={{ marginBottom:24 }}>
                  <h3 style={secHead}>Senaste 30 dagarna</h3>
                  <div style={{ background:"#1c1c1e",borderRadius:12,padding:20,border:"1px solid rgba(255,255,255,0.06)" }}>
                    <p style={{ margin:0,...TYPE.h2,color:"#fff",...TNUM }}>{Math.round(totMin/60*10)/10}h <span style={{ ...TYPE.meta,color:"#8e8e93" }}>extra tid totalt</span></p>
                    <p style={{ margin:"6px 0 0",fontSize:13,color:"#8e8e93" }}>{senaste30.length} aktiviteter över {arbDagar30} arbetsdagar</p>
                  </div>
                </section>
                {/* Per typ */}
                {stats.length === 0 ? (
                  <Card><p style={{ margin:0,...TYPE.meta,color:C.label,textAlign:"center" }}>Ingen extra tid registrerad senaste 30 dagarna</p></Card>
                ) : (
                  <section>
                    <h3 style={secHead}>Per aktivitet</h3>
                    {stats.map(s => {
                      const pct = Math.round(s.antal/arbDagar30*100);
                      const kallEntries: [string, number][] = Object.entries(s.kall) as [string, number][];
                      const dominantKall = kallEntries.sort((a,b)=>b[1]-a[1])[0];
                      const kallText = dominantKall && dominantKall[1]>0
                        ? (dominantKall[0]==='morgon'?'oftast på morgonen':dominantKall[0]==='kvall'?'oftast på kvällen':'oftast under dagen')
                        : '';
                      return (
                        <Card key={s.typ} style={{ padding:"16px 18px" }}>
                          <div style={{ display:"flex",alignItems:"center",gap:12,marginBottom:8 }}>
                            <span className="material-symbols-outlined" style={{ color:"#0a84ff",fontSize:22 }}>{aktIcon(s.typ)}</span>
                            <div style={{ flex:1 }}>
                              <p style={{ margin:0,...TYPE.bodyList,color:"#fff" }}>{aktLabel(s.typ)}</p>
                              <p style={{ margin:"2px 0 0",fontSize:12,color:C.label }}>{pct}% av dagarna · snitt {fmt(s.medel)}</p>
                            </div>
                            <span style={{ ...TYPE.bodyList,color:"#fff" }}>{Math.round(s.minTot/60*10)/10}h</span>
                          </div>
                          {/* Bar */}
                          <div style={{ height:4,background:"rgba(255,255,255,0.06)",borderRadius:2,overflow:"hidden",marginBottom:6 }}>
                            <div style={{ height:"100%",width:`${Math.min(100,pct)}%`,background:"#0a84ff",borderRadius:2 }}/>
                          </div>
                          <p style={{ margin:0,fontSize:12,color:C.label }}>
                            {s.antal} gånger{s.deb>0?` · ${s.deb} debiterbar${s.deb>1?'a':''}`:''}{kallText?` · ${kallText}`:''}
                          </p>
                        </Card>
                      );
                    })}
                    {/* Stapeldiagram fördelning */}
                    <h3 style={{ ...secHead,marginTop:24 }}>Fördelning</h3>
                    <div style={{ background:"#1c1c1e",borderRadius:12,padding:20,border:"1px solid rgba(255,255,255,0.06)" }}>
                      <div style={{ display:"flex",height:24,borderRadius:6,overflow:"hidden" }}>
                        {stats.map((s,i) => {
                          const w = totMin>0 ? (s.minTot/totMin*100) : 0;
                          const färger = ["#0a84ff","#30d158","#ff9f0a","#ff453a","#bf5af2","#64d2ff"];
                          return <div key={s.typ} title={aktLabel(s.typ)} style={{ width:`${w}%`,background:färger[i%färger.length] }}/>;
                        })}
                      </div>
                      <div style={{ display:"flex",flexWrap:"wrap",gap:8,marginTop:12 }}>
                        {stats.map((s,i) => {
                          const färger = ["#0a84ff","#30d158","#ff9f0a","#ff453a","#bf5af2","#64d2ff"];
                          return (
                            <div key={s.typ} style={{ display:"flex",alignItems:"center",gap:6 }}>
                              <div style={{ width:10,height:10,borderRadius:2,background:färger[i%färger.length] }}/>
                              <span style={{ fontSize:11,color:"#8e8e93" }}>{aktLabel(s.typ)}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </section>
                )}
              </>
            );
          })()}

        </main>
        <BottomNavBar aktiv="mintid" onNav={s=>setSteg(s)} />
      </div>
    );
  }

  /* ─── MÅNADSSAMMANSTÄLLNING ───
     Kontrollsteg: föraren granskar månadens RÅDATA (tid, dagar, km,
     traktamente, frånvaro) och godkänner den innan den lämnas vidare.
     Appen räknar INGA kronor — Fortnox äger löneberäkningen. */
  if(steg==="lön"){
    // Filtrera historik på vald månad (lönOffset 0 = innevarande, -1 = förra)
    const _nuRef = new Date();
    const nu = new Date(_nuRef.getFullYear(), _nuRef.getMonth() + lönOffset, 1);
    const lönePeriod = `${nu.getFullYear()}-${String(nu.getMonth()+1).padStart(2,"0")}`;
    const lönMånadsLabel = nu.toLocaleString('sv-SE', { month: 'long', year: 'numeric' });
    const kanLönBak = lönOffset > -12;
    const kanLönFram = lönOffset < 0;
    const stegLönBak = () => { if (kanLönBak) setLönOffset(o => o - 1); };
    const stegLönFram = () => { if (kanLönFram) setLönOffset(o => o + 1); };
    const månadsHistorik = historik.filter(d => d.datum && d.datum.startsWith(lönePeriod));

    // Extra tid filtrerad på månad
    const månadsExtraTid = extraTidData.filter(e => e.datum && e.datum.startsWith(lönePeriod));
    const extraTidMin = månadsExtraTid.reduce((a,e) => a + (e.minuter || 0), 0);

    // Rådata från faktiska dagar i filtrerad historik + extra tid — inga kronor
    const arbetsdagar = månadsHistorik.length;
    const jobbadMin2 = månadsHistorik.reduce((a,d) => a + (d.arbetad_min || 0), 0) + extraTidMin;
    const extraTidH = Math.round(extraTidMin/60*10)/10;
    const jobbadH = arbetsdagar > 0 || extraTidMin > 0 ? Math.round(jobbadMin2/60*10)/10 : 0;
    const totalKm = månadsHistorik.reduce((a,d) => a + (d.km_totalt || d.km_morgon || 0) + (d.km_kvall || 0), 0);
    const trakDagar = månadsHistorik.filter(d => d.traktamente).length;
    const redigeringar = Object.entries(redDagar);

    // Frånvaro per dagtyp (rad visas bara om typen förekommer)
    const FRANVARO_TYPER: [string,string][] = [['sjuk','Sjukfrånvaro'],['vab','VAB'],['semester','Semester'],['atk','ATK']];
    const frånvaroRader = FRANVARO_TYPER
      .map(([typ,label]) => [label, månadsHistorik.filter(d => d.dagtyp === typ).length] as [string,number])
      .filter(([,n]) => n > 0);
    const frånvaroAntal = frånvaroRader.reduce((a,[,n]) => a + n, 0);
    const arbetadeDagar = arbetsdagar - frånvaroAntal;

    // Bekräftelse-gaten — själva poängen med kontrollsteget: ALLA dagar måste
    // vara bekräftade innan månaden kan godkännas. Ingen "skicka ändå" — lön
    // är för viktigt för halvgranskad rådata.
    const bekräftadeDagar = månadsHistorik.filter(d => d.bekraftad).length;
    const obekräftadeDagar = arbetsdagar - bekräftadeDagar;

    const periodStatus = lönStatusPerPeriod[lönePeriod] || null;
    const ärGodkänd = !!periodStatus;
    const kanGodkänna = arbetsdagar > 0 && obekräftadeDagar === 0 && !ärGodkänd;

    // Godkänn månaden: föraren har granskat rådatan och står för den.
    // TODO(Fortnox): här kopplas den faktiska Fortnox-sändningen in när
    // integrationen byggs — appen skickar då RÅDATAN nedan (inga kronor),
    // Fortnox räknar lönen. Tills dess: godkännandet = status på
    // loneunderlag-raden, som admin/lönekörningen läser.
    const godkännMånad = async () => {
      setLönSparar(true);
      setLönFel("");
      const res = await upsertVerifierat(supabase, "loneunderlag", {
        medarbetare_id: medarbetare.id,
        namn: medarbetare.namn,
        maskin_id: medarbetare.maskin_id,
        maskin: maskinNamn || '',
        period: lönePeriod,
        arbetsdagar,
        jobbade_timmar: jobbadH,
        total_km: totalKm,
        traktamente_dagar: trakDagar,
        franvaro: frånvaroRader.length ? Object.fromEntries(frånvaroRader) : null,
        redigeringar: redigeringar.map(([datum,v])=>({datum,anledning:v.anl})),
        skickat_av: medarbetare.namn,
        skickat_tidpunkt: new Date().toISOString(),
        status: "godkand_av_forare",
      }, { onConflict: 'medarbetare_id,period' });
      if (!res.ok) { setLönFel(res.fel); setLönSparar(false); return; }
      setLönStatusPerPeriod(m => ({ ...m, [lönePeriod]: "godkand_av_forare" }));
      setLönSparar(false);
    };

    // Build weekly breakdown from historik — filtered to current month.
    // Total per dag/vecka = maskintid + extra tid (lib/arbetstid.ts-definitionen);
    // delarna hålls separata så staplarna kan visa fördelningen.
    const månadsPrefix = lönePeriod; // "YYYY-MM"
    const löneRödaDagar = getRödaDagar(nu.getFullYear());
    const veckoNrFör = (datum: string) => {
      const date = new Date(datum);
      const dayOfYear = Math.floor((date.getTime() - new Date(date.getFullYear(),0,1).getTime()) / 86400000);
      return Math.ceil((dayOfYear + new Date(date.getFullYear(),0,1).getDay()) / 7);
    };
    const veckoData: Record<number, { dagar: {datum:string;min:number;extraMin:number;rödDag?:string}[]; sumH:number; helglönH:number }> = {};
    const extraPerDagMånad = extraMinPerDag(månadsExtraTid);
    historik.filter(d => d.datum && d.datum.startsWith(månadsPrefix)).forEach(d => {
      const weekNum = veckoNrFör(d.datum);
      if(!veckoData[weekNum]) veckoData[weekNum] = { dagar:[], sumH:0, helglönH:0 };
      const m = d.arbetad_min || 0;
      const ex = extraPerDagMånad.get(d.datum) || 0;
      veckoData[weekNum].dagar.push({ datum:d.datum, min:m, extraMin:ex });
      veckoData[weekNum].sumH += (m + ex)/60;
    });
    // Extra tid på dagar UTAN maskinpass — egen dagrad (bara ljusgrön stapel)
    for (const [datum, ex] of extraPerDagMånad) {
      if (!datum.startsWith(månadsPrefix) || ex <= 0) continue;
      const weekNum = veckoNrFör(datum);
      if(!veckoData[weekNum]) veckoData[weekNum] = { dagar:[], sumH:0, helglönH:0 };
      if (veckoData[weekNum].dagar.find(x => x.datum === datum)) continue; // redan medräknad ovan
      veckoData[weekNum].dagar.push({ datum, min:0, extraMin:ex });
      veckoData[weekNum].sumH += ex/60;
    }
    // Add röda dagar to weeks
    const lönÅr=nu.getFullYear(), lönMån=nu.getMonth();
    const dIMlön=new Date(lönÅr,lönMån+1,0).getDate();
    for(let d=1;d<=dIMlön;d++){
      const dt=new Date(lönÅr,lönMån,d);
      const k=dt.toISOString().split('T')[0];
      if(!k.startsWith(månadsPrefix)) continue;
      const rödNamn=löneRödaDagar[k];
      if(!rödNamn) continue;
      const dayOfYear=Math.floor((dt.getTime()-new Date(lönÅr,0,1).getTime())/86400000);
      const weekNum=Math.ceil((dayOfYear+new Date(lönÅr,0,1).getDay())/7);
      if(!veckoData[weekNum]) veckoData[weekNum]={dagar:[],sumH:0,helglönH:0};
      // Lägg till röd dag om den inte redan finns som arbetsdag/extra-dag
      if(!veckoData[weekNum].dagar.find(x=>x.datum===k)){
        veckoData[weekNum].dagar.push({datum:k,min:0,extraMin:0,rödDag:rödNamn});
      }
      // Helglön: röd dag på vardag
      const dow=dt.getDay();
      if(dow!==0&&dow!==6) veckoData[weekNum].helglönH+=8;
    }
    // Sort dagar within each week
    Object.values(veckoData).forEach(w=>w.dagar.sort((a,b)=>a.datum.localeCompare(b.datum)));
    const sortedWeeks = Object.entries(veckoData).sort(([a],[b]) => Number(a)-Number(b));

    // Build objekt/maskin aggregation — filtered to current month.
    // Rå maskin_id sparas (inte modellnamn) — förarna känner igen numret,
    // och underraden ska vara lugn, inte upprepa "Rottne H8E" överallt.
    const maskinAgg: Record<string,{namn:string;maskinId:string;dagar:number}> = {};
    månadsHistorik.forEach(d => {
      if(!d.maskin_id) return;
      const key = d.maskin_id + (d.objekt_id||'');
      if(!maskinAgg[key]) {
        const objNamn = d.objekt_id ? (objektLista.find(o=>o.id===d.objekt_id)?.namn || '') : '';
        maskinAgg[key] = { namn:objNamn, maskinId:d.maskin_id, dagar:0 };
      }
      maskinAgg[key].dagar++;
    });
    const objektEntries = Object.values(maskinAgg).sort((a,b) => b.dagar-a.dagar);

    const bottomNav = <BottomNavBar aktiv="mintid" onNav={s=>setSteg(s)} />;

    // ─── DETALJER-VY ───
    if(lönVy==='detaljer') {
      const dagNamn = ['söndag','måndag','tisdag','onsdag','torsdag','fredag','lördag'];
      const månNamn = ['jan','feb','mar','apr','maj','jun','jul','aug','sep','okt','nov','dec'];
      return (
        <div style={{ minHeight:"100vh",background:"#000",color:"#fff",fontFamily:"'Inter',-apple-system,sans-serif",WebkitFontSmoothing:"antialiased" }}>
          <style>{css}</style>{timerBanner}
          <header style={{ position:"fixed",top:HEADER_TOP,width:"100%",zIndex:50,background:"rgba(0,0,0,0.8)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",display:"flex",alignItems:"center",padding:"0 16px",height:64 }}>
            <button onClick={()=>setLönVy('översikt')} style={{ background:"none",border:"none",cursor:"pointer",padding:"8px 12px 8px 8px",fontFamily:"inherit",display:"flex",alignItems:"center",gap:4 }}>
              <span className="material-symbols-outlined" style={{ color:"#0a84ff",fontSize:20 }}>chevron_left</span>
              <span style={{ color:"#0a84ff",fontSize:15,fontWeight:500 }}>Sammanställning</span>
            </button>
            <div style={{ flex:1,display:"flex",alignItems:"center",justifyContent:"flex-end",gap:8 }}>
              <button onClick={stegLönBak} disabled={!kanLönBak} style={{ background:"none",border:"none",cursor:kanLönBak?"pointer":"default",padding:4,opacity:kanLönBak?1:0.3 }}>
                <span className="material-symbols-outlined" style={{ color:"#0a84ff",fontSize:20 }}>chevron_left</span>
              </button>
              <span style={{ ...TYPE.bodyList,color:"#fff",textTransform:"capitalize" }}>{lönMånadsLabel}</span>
              <button onClick={stegLönFram} disabled={!kanLönFram} style={{ background:"none",border:"none",cursor:kanLönFram?"pointer":"default",padding:4,opacity:kanLönFram?1:0.3 }}>
                <span className="material-symbols-outlined" style={{ color:"#0a84ff",fontSize:20 }}>chevron_right</span>
              </button>
            </div>
          </header>

          <main style={{ paddingTop:80,paddingBottom:128,padding:"80px 16px 128px",maxWidth:640,margin:"0 auto" }}>

            {/* Timmar per vecka — veckan som hjälte, staplar visar dagsrytmen */}
            <section style={{ marginBottom:32 }}>
              <h2 style={{ ...secHead,marginBottom:16,marginLeft:4 }}>Timmar per vecka</h2>
              <div style={{ display:"flex",flexDirection:"column",gap:16 }}>
                {(()=>{
                  // Svenskt decimalkomma genomgående ("58,5" — inte "58.5")
                  const fmtTim = (h:number) => (Math.round(h*10)/10).toString().replace('.', ',');
                  return sortedWeeks.map(([weekNum, week]) => {
                  const firstDay = week.dagar.sort((a,b)=>a.datum.localeCompare(b.datum))[0];
                  const lastDay = week.dagar[week.dagar.length-1];
                  const fd = firstDay ? new Date(firstDay.datum) : null;
                  const ld = lastDay ? new Date(lastDay.datum) : null;
                  const rangeStr = fd && ld ? `${fd.getDate()}–${ld.getDate()} ${månNamn[fd.getMonth()]}` : '';
                  // Veckans längsta dag (maskin + extra) styr stapelskalan
                  const maxMin = Math.max(...week.dagar.map(d => d.min + d.extraMin), 1);
                  return (
                    <div key={weekNum} style={{ background:"#1c1c1e",borderRadius:12,padding:20 }}>
                      {/* Veckan som hjälte: micro-label + stor totalsiffra, dagarna lugna under */}
                      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:16 }}>
                        <div>
                          <p style={{ margin:"0 0 3px",...TYPE.micro,color:"#8e8e93" }}>Vecka {weekNum}</p>
                          <p style={{ margin:0,...TYPE.meta,color:"#636366",...TNUM }}>{rangeStr}</p>
                        </div>
                        <div style={{ display:"flex",alignItems:"baseline",gap:5 }}>
                          <span style={{ fontSize:24,fontWeight:700,color:"#fff",...TNUM }}>{fmtTim(week.sumH)}</span>
                          <span style={{ fontSize:13,color:"#8e8e93" }}>tim</span>
                        </div>
                      </div>
                      <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
                        {week.dagar.map(dag => {
                          const dt = new Date(dag.datum);
                          const h = Math.round((dag.min + dag.extraMin)/60*10)/10;
                          const dagLabel = dagNamn[dt.getDay()].charAt(0).toUpperCase()+dagNamn[dt.getDay()].slice(1)+' '+dt.getDate()+' '+månNamn[dt.getMonth()];
                          // Röd dag flaggas BARA visuellt (datum + namn i rött) — ingen
                          // lönelogik, ingen omräkning; det är ett separat löneprojekt.
                          const rödNamn = dag.rödDag || löneRödaDagar[dag.datum] || null;
                          if(dag.rödDag) {
                            // Röd dag utan arbete — bara flaggan
                            return (
                            <div key={dag.datum} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid rgba(255,255,255,0.03)" }}>
                              <span style={{ ...TYPE.meta,color:"#ff453a" }}>{dagLabel} · {dag.rödDag}</span>
                              <span style={{ fontSize:13,color:"#636366" }}>—</span>
                            </div>
                          );}
                          return (
                            <div key={dag.datum} style={{ padding:"8px 0",borderBottom:"1px solid rgba(255,255,255,0.03)" }}>
                              <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6 }}>
                                <span style={{ ...TYPE.meta,color:rödNamn?"#ff453a":undefined }}>{dagLabel}{rödNamn?` · ${rödNamn}`:''}</span>
                                <span style={{ ...TYPE.bodyList,...TNUM }}>{fmtTim(h)} tim</span>
                              </div>
                              {/* Delad stapel: mörk grön = maskinarbete, ljus grön = extra tid.
                                  Dag utan extra = bara mörk. Skalad mot veckans längsta dag (totalt). */}
                              <div style={{ height:4,borderRadius:2,background:"rgba(255,255,255,0.06)",overflow:"hidden",display:"flex" }}>
                                {dag.min>0&&<div style={{ height:"100%",background:"#30d158",width:`${Math.round(dag.min/maxMin*100)}%` }} />}
                                {dag.extraMin>0&&<div style={{ height:"100%",background:"#7dd88f",width:`${Math.round(dag.extraMin/maxMin*100)}%` }} />}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                  });
                })()}
                {sortedWeeks.length===0&&<p style={{ color:"#8e8e93",...TYPE.meta,padding:20 }}>Ingen data för perioden</p>}
                {/* Förklaringsrad för delade staplar */}
                {sortedWeeks.length>0&&(
                  <div style={{ display:"flex",gap:16,padding:"2px 4px 0" }}>
                    <span style={{ display:"inline-flex",alignItems:"center",gap:6,fontSize:12,color:"#8e8e93" }}>
                      <span style={{ width:10,height:4,borderRadius:2,background:"#30d158" }} />Maskinarbete
                    </span>
                    <span style={{ display:"inline-flex",alignItems:"center",gap:6,fontSize:12,color:"#8e8e93" }}>
                      <span style={{ width:10,height:4,borderRadius:2,background:"#7dd88f" }} />Extra tid
                    </span>
                  </div>
                )}
              </div>
            </section>

            {/* Körning — rådata; ersättningen räknas i Fortnox */}
            <section style={{ marginBottom:32 }}>
              <h2 style={{ ...secHead,marginBottom:16,marginLeft:4 }}>Körning</h2>
              <div style={{ background:"#1c1c1e",borderRadius:12,padding:20,display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                <p style={{ fontSize:12,color:"#8e8e93",margin:0 }}>Total körning</p>
                <p style={{ ...TYPE.h2,margin:0,...TNUM }}>{totalKm} km</p>
              </div>
            </section>

            {/* Objekt denna månad — objektnamnet störst (det man känner igen),
                dagarna som tal, stapel visar fördelningen, maskinen lugn underrad */}
            <section>
              <h2 style={{ ...secHead,marginBottom:16,marginLeft:4 }}>Objekt denna månad</h2>
              <div style={{ display:"flex",flexDirection:"column",gap:12 }}>
                {(()=>{
                  const maxDagar = Math.max(...objektEntries.map(o=>o.dagar), 1);
                  return objektEntries.map((o,i) => (
                    <div key={i} style={{ background:"#1c1c1e",borderRadius:12,padding:"16px 18px" }}>
                      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"baseline",gap:12,marginBottom:8 }}>
                        <p style={{ margin:0,...TYPE.body,color:"#fff",minWidth:0 }}>{o.namn || (maskinNamnMap[o.maskinId] || o.maskinId)}</p>
                        <p style={{ margin:0,flexShrink:0 }}>
                          <span style={{ fontSize:17,fontWeight:700,color:"#fff",...TNUM }}>{o.dagar}</span>
                          <span style={{ fontSize:12,color:"#8e8e93",marginLeft:4 }}>{o.dagar===1?'dag':'dagar'}</span>
                        </p>
                      </div>
                      {/* Stapel: objektets dagar relativt objektet med flest */}
                      <div style={{ height:4,borderRadius:2,background:"rgba(255,255,255,0.06)",overflow:"hidden" }}>
                        <div style={{ height:"100%",borderRadius:2,background:"#30d158",width:`${Math.round(o.dagar/maxDagar*100)}%` }} />
                      </div>
                      {o.namn && <p style={{ margin:"8px 0 0",fontSize:12,color:"#8e8e93",...TNUM }}>{o.maskinId}</p>}
                    </div>
                  ));
                })()}
                {objektEntries.length===0&&<p style={{ color:"#8e8e93",...TYPE.meta,padding:20 }}>Inga objekt denna månad</p>}
              </div>
            </section>

            {/* Extra tid — arbetstid UTANFÖR maskinen: när maskindatorn är av
                registrerar MOM inget, så tiden läggs in manuellt för att ge lön.
                En del kan dessutom faktureras. INGA kronor — Fortnox räknar belopp. */}
            <section style={{ margin:"32px 0" }}>
              <h2 style={{ ...secHead,marginBottom:16,marginLeft:4 }}>Extra tid</h2>
              {månadsExtraTid.length===0 ? (
                <div style={{ background:"#1c1c1e",borderRadius:12,padding:"14px 20px" }}>
                  <p style={{ margin:0,...TYPE.meta,color:"#8e8e93" }}>Ingen extra tid registrerad denna månad</p>
                </div>
              ) : (()=>{
                const fmtTid = (min:number) => { const h=Math.floor(min/60), m=min%60; return h>0?`${h} tim${m>0?` ${m} min`:''}`:`${m} min`; };
                const fmtDecKomma = (min:number) => (Math.round(min/60*10)/10).toString().replace('.',',');
                const fakturerbarMin = månadsExtraTid.filter(e=>e.debiterbar).reduce((a,e)=>a+(e.minuter||0),0);
                const poster = [...månadsExtraTid].sort((a,b)=>(b.datum||'').localeCompare(a.datum||''));
                const aktNamn = (e:any) => e.aktivitet_text || (e.aktivitet_typ ? aktLabel(e.aktivitet_typ) : null) || e.kommentar || 'Extra arbete';
                return (
                <div style={{ background:"#1c1c1e",borderRadius:12,padding:"4px 20px" }}>
                  {/* Hjälte: får jag lön för all min tid? */}
                  <div style={{ textAlign:"center",padding:"18px 0 16px",borderBottom:"1px solid rgba(255,255,255,0.08)" }}>
                    <p style={{ margin:0,...TYPE.bigNum,color:"#fff",...TNUM }}>{fmtDecKomma(extraTidMin)} <span style={{ ...TYPE.h2,color:"#8e8e93",fontWeight:600 }}>tim</span></p>
                    <p style={{ margin:"8px 0 0",...TYPE.meta,color:"#8e8e93" }}>arbete när maskinen var avstängd</p>
                  </div>
                  {/* Stödrad: arbetsgivarfrågan — vad kan faktureras? */}
                  <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 0",borderBottom:"1px solid rgba(255,255,255,0.08)" }}>
                    <span style={{ fontSize:16,color:"#fff" }}>Varav fakturerbart</span>
                    <span style={{ ...TYPE.bodyList,color:fakturerbarMin>0?"#30d158":"#8e8e93",...TNUM }}>{fmtDecKomma(fakturerbarMin)} tim</span>
                  </div>
                  {/* Poster — grön prick = fakturerbar */}
                  {poster.map((e,i)=>(
                    <div key={e.id||i} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,padding:"12px 0",borderBottom:i<poster.length-1?"1px solid rgba(255,255,255,0.04)":"none" }}>
                      <div style={{ display:"flex",alignItems:"center",gap:8,minWidth:0,flex:1 }}>
                        {e.debiterbar&&<span style={{ width:7,height:7,borderRadius:"50%",background:"#30d158",flexShrink:0 }} />}
                        <div style={{ minWidth:0 }}>
                          <p style={{ margin:0,...TYPE.meta,color:"#fff",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{aktNamn(e)}</p>
                          <p style={{ margin:"1px 0 0",fontSize:11,color:"#636366",...TNUM }}>{e.datum}</p>
                        </div>
                      </div>
                      <span style={{ ...TYPE.bodyList,color:"#fff",flexShrink:0,...TNUM }}>{fmtTid(e.minuter||0)}</span>
                    </div>
                  ))}
                </div>
                );
              })()}
            </section>
          </main>
          {bottomNav}
        </div>
      );
    }

    // ─── ÖVERSIKT-VY ───
    return (
      <div style={{ minHeight:"100vh",background:"#000",color:"#fff",fontFamily:"'Inter',-apple-system,sans-serif",WebkitFontSmoothing:"antialiased",display:"flex",flexDirection:"column" }}>
        <style>{css}</style>{timerBanner}

        {/* Header */}
        <header style={{ position:"fixed",top:HEADER_TOP,width:"100%",zIndex:50,background:"rgba(0,0,0,0.8)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",display:"flex",justifyContent:"space-between",alignItems:"center",padding:"0 24px",height:64 }}>
          <div style={{ display:"flex",alignItems:"center",gap:8 }}>
            <button onClick={stegLönBak} disabled={!kanLönBak} style={{ background:"none",border:"none",cursor:kanLönBak?"pointer":"default",padding:8,borderRadius:"50%",opacity:kanLönBak?1:0.3 }}>
              <span className="material-symbols-outlined" style={{ color:"#0a84ff" }}>chevron_left</span>
            </button>
            <h1 style={{ margin:0,...TYPE.body,color:"#fff",letterSpacing:"-0.02em",textTransform:"capitalize",minWidth:120,textAlign:"center" }}>{lönMånadsLabel}</h1>
            <button onClick={stegLönFram} disabled={!kanLönFram} style={{ background:"none",border:"none",cursor:kanLönFram?"pointer":"default",padding:8,borderRadius:"50%",opacity:kanLönFram?1:0.3 }}>
              <span className="material-symbols-outlined" style={{ color:"#0a84ff" }}>chevron_right</span>
            </button>
          </div>
          <span className="material-symbols-outlined" style={{ color:"#0a84ff" }}>calendar_month</span>
        </header>

        <main style={{ paddingTop:96,paddingBottom:192,padding:"96px 16px 192px",maxWidth:448,margin:"0 auto",width:"100%" }}>

          {/* Hjälte: Arbetad tid — samma mönster som Dag-vyns Total. Rådata,
              inga kronor: Fortnox räknar lönen på det föraren godkänner här. */}
          <section style={{ background:"#1c1c1e",borderRadius:12,padding:"4px 20px",marginBottom:16 }}>
            {ärGodkänd && (
              <div style={{ display:"flex",justifyContent:"center",paddingTop:14 }}>
                <span style={{ display:"inline-flex",alignItems:"center",gap:4,padding:"4px 10px",borderRadius:12,background:"rgba(48,209,88,0.1)",color:C.green,fontSize:13,fontWeight:600,border:"1px solid rgba(48,209,88,0.2)" }}>
                  <span className="material-symbols-outlined" style={{ fontSize:14 }}>check</span>
                  Godkänd
                </span>
              </div>
            )}
            <div style={{ textAlign:"center",padding:"18px 0 16px",borderBottom:"1px solid rgba(255,255,255,0.08)" }}>
              <p style={{ margin:"0 0 8px",...TYPE.meta,color:"#8e8e93" }}>Arbetad tid</p>
              <p style={{ margin:0,...TYPE.bigNum,color:"#fff",...TNUM }}>
                {jobbadH.toLocaleString('sv-SE')} <span style={{ ...TYPE.h2,color:"#8e8e93",fontWeight:600 }}>tim</span>
              </p>
              <p style={{ margin:"8px 0 0",...TYPE.meta,color:"#8e8e93",...TNUM }}>
                {arbetadeDagar} arbetsdagar{extraTidH > 0 ? ` · varav extra tid ${extraTidH.toLocaleString('sv-SE')} tim` : ''}
              </p>
            </div>
            {/* Stödrader — rådata som label ↔ värde */}
            {([
              ["Bekräftade dagar", `${bekräftadeDagar} av ${arbetsdagar}`, obekräftadeDagar > 0 ? C.orange : C.green],
              ["Körning", `${totalKm.toLocaleString('sv-SE')} km`, "#fff"],
              ["Traktamente", `${trakDagar} ${trakDagar === 1 ? 'dag' : 'dagar'}`, "#fff"],
              ...frånvaroRader.map(([label, n]) => [label, `${n} ${n === 1 ? 'dag' : 'dagar'}`, "#fff"] as [string,string,string]),
            ] as [string,string,string][]).map(([l,v,färg],i,arr)=>(
              <div key={l} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 0",borderBottom:i < arr.length-1 ? "1px solid rgba(255,255,255,0.08)" : "none" }}>
                <span style={{ fontSize:16,color:"#fff" }}>{l}</span>
                <span style={{ ...TYPE.bodyList,color:färg,...TNUM }}>{v}</span>
              </div>
            ))}
          </section>

          {/* Bekräftelse-gaten: obekräftade dagar blockerar godkännandet helt */}
          {arbetsdagar > 0 && obekräftadeDagar > 0 && !ärGodkänd && (
            <div style={{ background:"rgba(255,149,0,0.08)",border:"1px solid rgba(255,149,0,0.25)",borderRadius:12,padding:"14px 16px",marginBottom:16,display:"flex",gap:10,alignItems:"flex-start" }}>
              <span className="material-symbols-outlined" style={{ fontSize:20,color:C.orange,flexShrink:0 }}>warning</span>
              <p style={{ margin:0,...TYPE.meta,color:C.orange,lineHeight:1.45 }}>
                {obekräftadeDagar} {obekräftadeDagar === 1 ? 'dag är inte bekräftad' : 'dagar är inte bekräftade'} — alla dagar måste bekräftas innan du kan skicka. Gå till Kalender och bekräfta.
              </p>
            </div>
          )}
          {arbetsdagar === 0 && (
            <div style={{ background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:12,padding:"14px 16px",marginBottom:16 }}>
              <p style={{ margin:0,...TYPE.meta,color:"#8e8e93" }}>Inga arbetsdagar den här månaden — inget att skicka.</p>
            </div>
          )}

          {/* Se detaljer-länk */}
          <div style={{ padding:"0 4px",marginBottom:32 }}>
            <button onClick={()=>setLönVy('detaljer')} style={{ display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",background:"none",border:"none",cursor:"pointer",padding:"4px 0",fontFamily:"inherit" }}>
              <span style={{ fontSize:15,fontWeight:500,color:"#0a84ff" }}>Se detaljer</span>
              <span className="material-symbols-outlined" style={{ color:"#0a84ff",fontSize:18 }}>arrow_forward</span>
            </button>
          </div>

          {/* Fel */}
          {lönFel&&(
            <div style={{ background:"rgba(255,59,48,0.08)",borderRadius:12,padding:"12px 16px",marginBottom:16,border:"1px solid rgba(255,59,48,0.2)" }}>
              <p style={{ margin:0,...TYPE.meta,color:C.red }}>{lönFel}</p>
            </div>
          )}

          {/* Action — gaten styr: obekräftade dagar (eller tom månad) = inaktiv knapp */}
          <div style={{ paddingTop:24 }}>
            {ärGodkänd ? (
              <button disabled style={{ width:"100%",height:56,background:C.green,color:"#fff",border:"none",borderRadius:12,fontSize:17,fontWeight:600,fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",gap:6 }}>
                <span className="material-symbols-outlined" style={{ fontSize:20 }}>check</span>
                Godkänd
              </button>
            ) : (
              <button onClick={()=>{ if(kanGodkänna && !lönSparar) setLönBekräfta(true); }} disabled={!kanGodkänna || lönSparar}
                style={{ width:"100%",height:56,background:kanGodkänna?"#0a84ff":"#2c2c2e",color:kanGodkänna?"#fff":"#636366",border:"none",borderRadius:12,fontSize:17,fontWeight:600,cursor:kanGodkänna?"pointer":"default",fontFamily:"inherit",opacity:lönSparar?0.6:1 }}>
                {lönSparar?"Sparar...":"Godkänn och skicka"}
              </button>
            )}
            <p style={{ textAlign:"center",fontSize:13,color:"#8e8e93",margin:"12px 0 0" }}>Fortnox räknar lönen — appen skickar bara rådatan</p>
          </div>
        </main>
        {bottomNav}

        {/* Bekräftelsedialog innan inskickning */}
        {lönBekräfta && (
          <div onClick={()=>setLönBekräfta(false)} style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:24,animation:"dimIn 0.2s ease" }}>
            <div onClick={e=>e.stopPropagation()} style={{ width:"100%",maxWidth:360,background:"#1c1c1e",borderRadius:12,padding:"24px 20px",border:"1px solid rgba(255,255,255,0.06)" }}>
              <p style={{ margin:"0 0 8px",...TYPE.h2,color:"#fff",textAlign:"center" }}>Godkänn {lönMånadsLabel}?</p>
              <p style={{ margin:"0 0 20px",fontSize:13,color:"#8e8e93",textAlign:"center",lineHeight:1.4 }}>
                Du intygar att månadens tider och dagar stämmer. Sammanställningen låses och lämnas till lönehanteringen. Det går inte att ångra.
              </p>
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:8 }}>
                <button onClick={()=>setLönBekräfta(false)} style={{ height:48,background:"rgba(255,255,255,0.06)",color:"#fff",border:"none",borderRadius:12,fontSize:15,fontWeight:600,cursor:"pointer",fontFamily:"inherit" }}>
                  Avbryt
                </button>
                <button onClick={async ()=>{ setLönBekräfta(false); await godkännMånad(); }} disabled={lönSparar} style={{ height:48,background:C.green,color:"#fff",border:"none",borderRadius:12,fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:"inherit" }}>
                  Godkänn
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ─── INSTÄLLNINGAR ─── */
  if(steg==="inst") {
    const autoSave = (field: 'hem'|'bt', val: string) => {
      if(field==='hem'&&val&&val!==hemadress){setHemadress(val);setSparatToast(true);setTimeout(()=>setSparatToast(false),2000);}
      if(field==='bt'&&val&&val!==btBil){setBtBil(val);setSparatToast(true);setTimeout(()=>setSparatToast(false),2000);}
    };
    return (
    <div style={shell}><style>{css}</style>{timerBanner}
      <div style={topBar}>
        <div style={{ display:"flex",alignItems:"center",gap:14 }}>
          <BackBtn onClick={()=>setSteg("morgon")}/>
          <h1 style={{ margin:0,...TYPE.h1 }}>Inställningar</h1>
        </div>
      </div>
      <div style={{ flex:1,paddingTop:16,paddingBottom:SCROLL_BOTTOM,overflowY:"auto" }}>
        <Label>Hemadress</Label>
        <Card style={{ marginBottom:6 }}>
          <p style={{ margin:"0 0 10px",fontSize:13,color:C.label }}>Används för att beräkna körersättning</p>
          <input
            value={redigHem||hemadress}
            onChange={e=>setRedigHem(e.target.value)}
            onFocus={()=>{ if(!redigHem) setRedigHem(hemadress); }}
            onBlur={()=>autoSave('hem',redigHem)}
            style={{ width:"100%",padding:"13px 14px",fontSize:16,border:"1px solid rgba(255,255,255,0.08)",borderRadius:10,outline:"none",background:"rgba(255,255,255,0.06)",color:"#fff",fontFamily:"inherit" }}
          />
        </Card>
        <p style={{ margin:"0 0 32px",fontSize:13,color:C.label }}>Adressen används bara för att räkna ut avstånd — aldrig delad med andra.</p>
        <Label>Maskin</Label>
        <Card style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
          <div>
            <p style={{ margin:0,fontSize:16,fontWeight:600 }}>{maskinNamn || 'Okänd maskin'}</p>
            <p style={{ margin:"3px 0 0",fontSize:13,color:C.label }}>{medarbetare?.maskin_id || ''} · hämtas från MOM</p>
          </div>
          <div style={{ width:8,height:8,borderRadius:"50%",background:C.green }}/>
        </Card>

        <div style={{ marginTop:24 }}/>
        <Label>Bil · Bluetooth</Label>
        <Card style={{ marginBottom:6 }}>
          <p style={{ margin:"0 0 10px",fontSize:13,color:C.label }}>Appen startar automatiskt när bilen kopplar upp</p>
          <input
            value={redigBt||btBil}
            onChange={e=>setRedigBt(e.target.value)}
            onFocus={()=>{ if(!redigBt) setRedigBt(btBil); }}
            onBlur={()=>autoSave('bt',redigBt)}
            placeholder="T.ex. Min bil"
            style={{ width:"100%",padding:"13px 14px",fontSize:16,border:"1px solid rgba(255,255,255,0.08)",borderRadius:10,outline:"none",background:"rgba(255,255,255,0.06)",color:"#fff",fontFamily:"inherit" }}
          />
        </Card>
        {btBil&&<div style={{ background:"rgba(48,209,88,0.08)",borderRadius:10,padding:"10px 14px",display:"flex",alignItems:"center",gap:8 }}>
          <div style={{ width:8,height:8,borderRadius:"50%",background:C.green,flexShrink:0 }}/>
          <p style={{ margin:0,fontSize:13,color:C.green,fontWeight:500 }}>{btBil} ansluten</p>
        </div>}

        <Card onClick={()=>setSteg("avtal")} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:24 }}>
          <div>
            <p style={{ margin:0,...TYPE.bodyList }}>Mitt avtal</p>
            <p style={{ margin:"2px 0 0",fontSize:13,color:C.label }}>{gsAvtal?.namn || 'GS-avtalet'}</p>
          </div>
          <ChevronRight/>
        </Card>

        {/* Påminnelser */}
        <div style={{ marginTop:32 }}><Label>Påminnelser</Label></div>
        {(() => {
          const uppdatera = async (field: string, value: any): Promise<boolean> => {
            const res = await uppdateraVerifierat(supabase, "medarbetare", { [field]: value }, { id: medarbetare.id });
            if (!res.ok) { alert(res.fel); return false; } // ingen "Sparat"-toast på en skrivning som inte hände
            setMedarbetare((m: any) => ({ ...m, [field]: value }));
            setSparatToast(true); setTimeout(() => setSparatToast(false), 1800);
            return true;
          };

          const togglePush = async (on: boolean) => {
            if (!await uppdatera("push_aktiv", on)) return;
            if (typeof navigator === "undefined" || !('serviceWorker' in navigator)) return;
            try {
              if (on) {
                const reg = await navigator.serviceWorker.register('/sw.js');
                await navigator.serviceWorker.ready;
                let sub = await reg.pushManager.getSubscription();
                if (!sub) {
                  const perm = await Notification.requestPermission();
                  if (perm !== "granted") return;
                  const vapid = "BGe21_FkdZWkOiaLTWE2GXADsaA08uC2eRGglHIyJ85rL35YkrkUY1L3jTJ7fGvAQlDRjJsH3AMMeX62B63hr34";
                  const base64 = (vapid + "=".repeat((4 - vapid.length % 4) % 4)).replace(/-/g,'+').replace(/_/g,'/');
                  const raw = window.atob(base64);
                  const appKey = new Uint8Array(raw.length);
                  for (let i = 0; i < raw.length; i++) appKey[i] = raw.charCodeAt(i);
                  sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: appKey });
                }
                const deviceName = (navigator.userAgent || '').slice(0, 120);
                await fetch('/api/push/subscribe', {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ medarbetare_id: medarbetare.id, subscription: sub.toJSON(), device_name: deviceName }),
                });
                setPushEnhetsNamn(deviceName);
              } else {
                const reg = await navigator.serviceWorker.getRegistration();
                const sub = reg ? await reg.pushManager.getSubscription() : null;
                if (sub) {
                  await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
                  await sub.unsubscribe();
                }
                setPushEnhetsNamn(null);
              }
            } catch (e) { console.warn('[push-toggle]', e); }
          };

          const obekraftad = medarbetare?.pamin_obekraftad_min ?? 30;
          const pagaende   = medarbetare?.pamin_pagaende_min  ?? 180;
          const dagligAkt  = medarbetare?.daglig_pamin_aktiv  ?? true;
          const dagligTid  = (medarbetare?.daglig_pamin_tid  || '18:00').slice(0,5);
          const pushOn     = medarbetare?.push_aktiv         ?? true;

          const Rad = ({ rubrik, undertext, value, onClick, right }: any) => (
            <div onClick={onClick} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,padding:"14px 0",borderBottom:`1px solid ${C.line}`,cursor:onClick?"pointer":"default" }}>
              {/* minWidth:0 låter den långa undertexten krympa/radbrytas — värdet
                  till höger är flexShrink:0 + nowrap så "30 min" aldrig bryts. */}
              <div style={{ minWidth:0 }}>
                <p style={{ margin:0,...TYPE.bodyList,color:"#fff" }}>{rubrik}</p>
                {undertext && <p style={{ margin:"2px 0 0",fontSize:13,color:C.label }}>{undertext}</p>}
              </div>
              <div style={{ display:"flex",alignItems:"center",gap:8,flexShrink:0 }}>
                {value && <span style={{ ...TYPE.bodyList,color:"#fff",whiteSpace:"nowrap",...TNUM }}>{value}</span>}
                {right || (onClick && <ChevronRight/>)}
              </div>
            </div>
          );

          const Toggle = ({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) => (
            <div onClick={()=>onChange(!on)}
              style={{ width:51,height:31,borderRadius:999,background:on?C.green:"rgba(120,120,128,0.3)",cursor:"pointer",position:"relative",transition:"background 0.2s",flexShrink:0 }}>
              <div style={{ width:27,height:27,borderRadius:"50%",background:"#fff",position:"absolute",top:2,left:on?22:2,transition:"left 0.2s" }}/>
            </div>
          );

          const OptionGrid = ({ opts, selected, onPick, cols=4 }: any) => (
            <div style={{ display:"grid",gridTemplateColumns:`repeat(${cols},1fr)`,gap:6,padding:"10px 0 14px" }}>
              {opts.map((o: any) => {
                const valt = o.v === selected;
                return (
                  <button key={o.l} onClick={()=>onPick(o.v)}
                    style={{ background:valt?"rgba(173,198,255,0.12)":"rgba(255,255,255,0.04)",border:valt?"1px solid rgba(173,198,255,0.3)":"1px solid rgba(255,255,255,0.06)",borderRadius:10,padding:"10px 4px",color:valt?"#0a84ff":"#fff",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit" }}>
                    {o.l}
                  </button>
                );
              })}
            </div>
          );

          return (
            <Card style={{ padding:"4px 20px" }}>
              <Rad rubrik="Obekräftad dag" undertext="Påminn mig efter · efter maskin loggat ut"
                value={`${obekraftad} min`}
                onClick={()=>setPamOpen(pamOpen==='obekraftad'?null:'obekraftad')}/>
              {pamOpen==='obekraftad' && <OptionGrid
                opts={[{l:'15 min',v:15},{l:'30 min',v:30},{l:'60 min',v:60},{l:'2 tim',v:120}]}
                selected={obekraftad}
                onPick={(v:number)=>{ uppdatera("pamin_obekraftad_min", v); setPamOpen(null); }}/>}

              <Rad rubrik="Pågående aktivitet" undertext="Om jag glömt stoppa"
                value={pagaende<60?`${pagaende} min`:`${pagaende/60} tim`}
                onClick={()=>setPamOpen(pamOpen==='pagaende'?null:'pagaende')}/>
              {pamOpen==='pagaende' && <OptionGrid
                opts={[{l:'1 tim',v:60},{l:'2 tim',v:120},{l:'3 tim',v:180},{l:'5 tim',v:300}]}
                selected={pagaende}
                onPick={(v:number)=>{ uppdatera("pamin_pagaende_min", v); setPamOpen(null); }}/>}

              <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 0",borderBottom:`1px solid ${C.line}` }}>
                <div onClick={()=>dagligAkt && setPamOpen(pamOpen==='dagligTid'?null:'dagligTid')} style={{ flex:1,cursor:dagligAkt?"pointer":"default" }}>
                  <p style={{ margin:0,...TYPE.bodyList,color:"#fff" }}>Daglig påminnelse</p>
                  <p style={{ margin:"2px 0 0",fontSize:13,color:C.label }}>{dagligAkt?`Kl ${dagligTid} · om dagen inte bekräftats`:'Avstängd'}</p>
                </div>
                <Toggle on={dagligAkt} onChange={v=>uppdatera("daglig_pamin_aktiv", v)}/>
              </div>
              {pamOpen==='dagligTid' && dagligAkt && <OptionGrid cols={6}
                opts={['16:00','17:00','18:00','19:00','20:00','21:00'].map(t=>({l:t,v:t}))}
                selected={dagligTid}
                onPick={(v:string)=>{ uppdatera("daglig_pamin_tid", v); setPamOpen(null); }}/>}

              <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 0" }}>
                <div>
                  <p style={{ margin:0,...TYPE.bodyList,color:"#fff" }}>Push-notiser</p>
                  <p style={{ margin:"2px 0 0",fontSize:13,color:C.label }}>{pushOn ? (pushEnhetsNamn ? `Aktiverad · ${pushEnhetsNamn.slice(0,40)}` : 'Aktiverad') : 'Avstängd'}</p>
                </div>
                <Toggle on={pushOn} onChange={togglePush}/>
              </div>
            </Card>
          );
        })()}

        <div style={{ marginTop:48, paddingTop:24, borderTop:"1px solid rgba(255,255,255,0.08)" }}>
          <button
            onClick={async ()=>{ await supabase.auth.signOut(); window.location.href='/login'; }}
            style={{ width:"100%",padding:"14px 0",borderRadius:12,border:"none",background:"rgba(255,69,58,0.12)",color:"#ff453a",fontSize:16,fontWeight:600,fontFamily:"inherit",cursor:"pointer" }}
          >
            Logga ut
          </button>
        </div>
      </div>

      {/* Sparat-toast */}
      {sparatToast&&<div style={{ position:"fixed",bottom:100,left:"50%",transform:"translateX(-50%)",background:"#1c1c1e",border:"1px solid rgba(255,255,255,0.1)",borderRadius:12,padding:"10px 20px",...TYPE.meta,color:"#fff",animation:"fadeUp 0.3s ease",zIndex:100 }}>Sparat</div>}
      <BottomNavBar aktiv="inst" onNav={s=>setSteg(s)} />
    </div>
  );}


  /* ─── MITT AVTAL ─── */
  if(steg==="avtal") return (
    <div style={shell}><style>{css}</style>{timerBanner}
      <div style={topBar}>
        <div style={{ display:"flex",alignItems:"center",gap:14 }}>
          <BackBtn onClick={()=>setSteg("inst")}/>
          <div>
            <h1 style={{ margin:0,...TYPE.h1 }}>Mitt avtal</h1>
            <p style={{ margin:"4px 0 0",fontSize:13,color:C.label }}>{gsAvtal?.namn || 'Skogsavtalet 2025-2027'}</p>
          </div>
        </div>
      </div>
      <div style={{ flex:1,overflowY:"auto",paddingTop:16,paddingBottom:SCROLL_BOTTOM }}>
        {[
          {rubrik:"Avtalsperiod",rader:[
            ["Avtal",gsAvtal?.namn||"Skogsavtalet 2025-2027"],
            ["Gäller","1 apr 2025 – 31 mar 2027"],
          ]},
          {rubrik:"Övertid",rader:[
            ["Övertidsersättning",`${gsAvtal?.overtid_vardag_kr??54.94} kr/tim`],
            ["Max övertid",`${gsAvtal?.max_overtid_ar??250} tim/år`],
          ]},
          {rubrik:"OB-ersättning",rader:[
            ["Mån-fre kväll/natt (17-06:30)",`${gsAvtal?.ob_kvall_kr??43.77} kr/tim`],
            ["Nattarbete (00-05)",`${gsAvtal?.ob_natt_kr??56.82} kr/tim`],
            ["Lördag",`${gsAvtal?.ob_lordag_kr??68.95} kr/tim`],
            ["Söndag",`${gsAvtal?.ob_sondag_kr??103.38} kr/tim`],
          ]},
          {rubrik:"Färdmedel & färdtid",rader:[
            ["Färdmedelsersättning",`${gsAvtal?.km_ersattning_kr??27.50} kr/mil`],
            ["Km-gräns",`${gsAvtal?.km_grans_per_dag??60} km/dag`],
            ["Färdtidsersättning (>60 km)",`${gsAvtal?.fardtid_kr??10.49} kr/mil`],
          ]},
          {rubrik:"ATK",rader:[
            ["Avsättning",`${gsAvtal?.atk_procent??3.62}% (uttagsår ${gsAvtal?.atk_period??'2025-2026'})`],
            ["Nästa period",`${gsAvtal?.atk_procent_nasta??3.92}%`],
            ["Ledig tid",`${gsAvtal?.atk_ledig_tim??65.2} tim/år`],
            ["Pension-tillägg","+20%"],
          ]},
          {rubrik:"Traktamente",rader:[
            ["Heldag",`${gsAvtal?.traktamente_hel_kr??300} kr`],
            ["Halvdag",`${gsAvtal?.traktamente_halv_kr??150} kr`],
          ]},
          {rubrik:"Sjuklön",rader:[
            ["Ersättning","80% av lön efter karens"],
          ]},
          {rubrik:"Semester",rader:[
            ["Semesterdagar","25 dagar/år"],
            ["Intjäningsår","1 april – 31 mars"],
            ["Ersättning tidsbegränsad","13%"],
          ]},
          {rubrik:"Helglön (timavlönade)",rader:[
            ["Dagar","Nyårsdagen, Trettondagen, Långfredagen, Annandag påsk, 1 maj, Kristi himmelf., Nationaldagen, Midsommarafton, Julafton, Juldagen, Annandag jul, Nyårsafton"],
          ]},
          {rubrik:"Övriga tillägg",rader:[
            ["Skifttillägg",`${gsAvtal?.skifttillagg_kr??8.00} kr/tim`],
            ["Bortovaro >12h",`${gsAvtal?.bortovaro_kr??8.03} kr/tim`],
          ]},
        ].map(({rubrik,rader})=>(
          <div key={rubrik} style={{ marginBottom:20 }}>
            <Label>{rubrik}</Label>
            <Card style={{ padding:"4px 20px" }}>
              {rader.map(([l,v],i,arr)=>(
                <div key={l} style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",padding:"13px 0",borderBottom:i<arr.length-1?`1px solid ${C.line}`:"none" }}>
                  <span style={{ ...TYPE.meta,color:C.label,flex:1 }}>{l}</span>
                  <span style={{ ...TYPE.bodyList,textAlign:"right",maxWidth:"55%",marginLeft:12 }}>{v}</span>
                </div>
              ))}
            </Card>
          </div>
        ))}
        <button onClick={()=>window.open('/avtal/skogsavtalet-2025-2027.pdf','_blank')} style={{ width:"100%",height:48,background:"#2a2a2a",border:"none",borderRadius:12,color:"#fff",...TYPE.bodyList,cursor:"pointer",fontFamily:"inherit",marginBottom:16 }}>
          Läs hela avtalet →
        </button>
        <div style={{ background:"rgba(10,132,255,0.08)",borderRadius:12,padding:"14px 16px",marginBottom:24,border:"1px solid rgba(10,132,255,0.15)" }}>
          <p style={{ margin:0,fontSize:13,color:C.blue,fontWeight:500 }}>Värdena hämtas från Supabase och uppdateras automatiskt om avtalet ändras.</p>
        </div>
      </div>
    </div>
  );

  /* ─── KALENDER ─── */






  /* ─── FRÅNVARO ─── */
  if(steg==="bekräftaFrånvaro") return (
    <div style={shell}><style>{css}</style>{timerBanner}
      <div style={topBar}><p style={{ margin:0,...TYPE.meta,color:C.label }}>{datumStr}</p></div>
      <div style={mid}>
        <div style={{ width:80,height:80,borderRadius:12,background:"rgba(255,255,255,0.08)",display:"flex",alignItems:"center",justifyContent:"center",marginBottom:28,animation:"scalePop 0.4s ease" }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
            <path d={dagTyp==="sjuk"?"M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15v-4H7l5-8v4h4l-5 8z":"M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"} fill="#8e8e93"/>
          </svg>
        </div>
        <h1 style={{ ...TYPE.h1,margin:"0 0 10px" }}>{dagTyp==="sjuk"?"Krya på dig":dagTyp==="atk"?"ATK-dag":dagTyp==="semester"?"Semester":"Hoppas barnet mår bättre"}</h1>
        <p style={{ ...TYPE.meta,color:C.label }}>{dagTyp==="sjuk"?"Sjukanmälan":dagTyp==="atk"?"ATK":dagTyp==="semester"?"Semester":"VAB"} registreras för {datumStr}</p>
      </div>
      <div style={bottom}>
        <button style={btn.primary} onClick={async()=>{
          // onConflict saknades här — fanns dagen redan (t.ex. MOM-skapad rad)
          // krockade upserten tyst och "Registrerat" visades ändå.
          const res = await upsertVerifierat(supabase, "arbetsdag", {
            medarbetare_id:medarbetare.id,
            datum:new Date().toISOString().split("T")[0],
            dagtyp:dagTyp,
            bekraftad:true,
            bekraftad_tid:new Date().toISOString(),
          }, { onConflict: 'medarbetare_id,datum' });
          if (!res.ok) { alert(res.fel); return; }
          setSteg("klarFrånvaro");
        }}>Bekräfta</button>
        <button style={{ ...btn.textBack, marginTop:2 }} onClick={()=>setSteg("morgon")}>Ångra och gå tillbaka</button>
      </div>
    </div>
  );

  if(steg==="klarFrånvaro") return (
    <div style={shell}><style>{css}</style>{timerBanner}
      <div style={topBar}><p style={{ margin:0,...TYPE.meta,color:C.label }}>{datumStr}</p></div>
      <div style={mid}>
        <div style={{ animation:"scalePop 0.4s ease",marginBottom:28 }}><CheckCircle/></div>
        <h1 style={{ ...TYPE.h1,margin:"0 0 10px" }}>Registrerat</h1>
        <p style={{ ...TYPE.meta,color:C.label }}>{dagTyp==="sjuk"?"Sjukanmälan":dagTyp==="atk"?"ATK":dagTyp==="semester"?"Semester":"VAB"} för {datumStr}</p>
      </div>
      <div style={bottom}><button style={btn.secondary} onClick={()=>setSteg("morgon")}>Tillbaka</button></div>
    </div>
  );

  /* ─── MANUELL DAG ─── */
  if(steg==="manuellDag"){
    const titlar: Record<string,string> = {
      normal: "Manuell arbetsdag",
      service: "Service",
      utbildning: "Utbildning",
      annat: "Annat arbete",
      möte: "Möte",
    };
    const platsh: Record<string,string> = {
      normal: "Vad gjorde du? (t.ex. avverkning, skotning, markberedning)",
      service: "Vad servade du? (t.ex. kedjebyte, hydraulik, smörjning)",
      utbildning: "Vad lärde du dig? (t.ex. säkerhetskurs, ny maskin)",
      annat: "Beskriv arbetet (t.ex. röjning, vägunderhåll)",
      möte: "Vem mötte du? Vad handlade det om?",
    };
    const titel = titlar[dagTyp] || "Manuell arbetsdag";
    const platshold = platsh[dagTyp] || "Vad gjorde du?";
    return (
      <div style={shell}><style>{css}</style>{timerBanner}
        <div style={topBar}><div style={{ display:"flex",alignItems:"center",gap:14 }}><BackBtn onClick={()=>setSteg("morgon")}/><h1 style={{ margin:0,...TYPE.h1 }}>{titel}</h1></div></div>
        <div style={{ flex:1,paddingTop:20,overflowY:"auto" }}>
          <div style={{ marginBottom:24 }}>
            <Label>Vad gör du?</Label>
            <textarea
              placeholder={platshold}
              value={mBesk}
              onChange={e=>setMBesk(e.target.value)}
              rows={3}
              style={{ ...input, minHeight:80, padding:12, resize:"vertical", boxSizing:"border-box", lineHeight:1.4 }}
            />
          </div>
          <TimePicker value={mStart} onChange={setMStart} label="Starttid"/>
          <div style={{ background:"rgba(48,209,88,0.07)",borderRadius:12,padding:"12px 16px" }}>
            <p style={{ margin:0,...TYPE.meta,color:C.green }}>Sluttid och rast fyller du i när dagen är slut</p>
          </div>
        </div>
        <div style={bottom}>
          <button style={{ ...btn.primary,opacity:mBesk?1:0.35 }} disabled={!mBesk}
            onClick={()=>{setStart(mStart); setStartÄndrad(true); setSlut(""); setSlutÄndrad(true); setSteg("manuellPågår");}}>
            Starta arbetet
          </button>
        </div>
      </div>
    );
  }

  if(steg==="manuellPågår") {
    const dagTypVisa: Record<string,string> = {
      utbildning:'Utbildning pågår', service:'Service pågår', möte:'Möte pågår', annat:'Annat arbete pågår',
    };
    const statusText = dagTypVisa[dagTyp] || 'Arbetsdag startad';
    return (
    <div style={shell}><style>{css}</style>{timerBanner}
      <div style={topBar}>
        <p style={{ margin:0,...TYPE.meta,color:C.label }}>{datumStr}</p>
      </div>
      <div style={mid}>
        <div style={{ width:10,height:10,borderRadius:"50%",background:C.blue,marginBottom:28,animation:"pulseDot 2s infinite" }}/>
        <p style={{ ...TYPE.display,margin:0,...TNUM }}>{start}</p>
        <p style={{ ...TYPE.meta,color:C.label,margin:"10px 0 24px" }}>{statusText}</p>
        {mBesk && (
          <div style={{ background:"rgba(255,255,255,0.06)",borderRadius:12,padding:"12px 24px" }}>
            <p style={{ margin:0,...TYPE.bodyList }}>{mBesk}</p>
          </div>
        )}
      </div>
      <div style={bottom}>
        <button style={btn.secondary} onClick={()=>{setKmM({km:72});setKmK({km:72});setSteg("manuellKväll");}}>Avsluta dagen →</button>
      </div>
      <BottomNavBar aktiv="morgon" onNav={s=>setSteg(s)} />
    </div>
    );
  }

  if(steg==="manuellKväll") return (
    <div style={shell}><style>{css}</style>{timerBanner}
      <div style={topBar}><div style={{ display:"flex",alignItems:"center",gap:14 }}><BackBtn onClick={()=>setSteg("manuellPågår")}/><h1 style={{ margin:0,...TYPE.h1 }}>Avsluta dagen</h1></div></div>
      <div style={{ flex:1,paddingTop:20,overflowY:"auto" }}>
        <Card style={{ marginBottom:24 }}><p style={{ margin:0,...TYPE.meta,color:C.label }}>Startade</p><p style={{ margin:"4px 0 0",...TYPE.h2,...TNUM }}>{start}</p></Card>
        <TimePicker value={mSlut} onChange={setMSlut} label="Sluttid"/>
        <MinPicker  value={mRast} onChange={setMRast} label="Rast"/>
        <div style={{ textAlign:"center",padding:20,background:"rgba(48,209,88,0.07)",borderRadius:12,marginBottom:24 }}>
          <Label>Arbetstid</Label>
          <p style={{ margin:0,...TYPE.bigNum,color:C.green,...TNUM }}>{fmt(Math.max(0,tim(start,mSlut)-mRast))}</p>
        </div>
      </div>
      <div style={bottom}>
        <button style={btn.primary} onClick={()=>{setSlut(mSlut); setSlutÄndrad(true); setRast(mRast); setRastÄndrad(true); setSteg("morgon");}}>Spara och fortsätt</button>
      </div>
    </div>
  );

  /* ─── REDIGERA HISTORIK ─── */
  if(steg==="redigera"&&redDag){
    const redArbMin = Math.max(0, tim(redStart,redSlut)-redRast);
    // Jämför mot snake_case-fälten i redDag — tidigare använde vi camelCase
    // (redDag.start etc.) som alltid var undefined, vilket gjorde harÄndrat=true
    // direkt när dagvyn öppnades. Det dolda anledning-fältet dök då upp omotiverat.
    const redStartOrig = redDag.start_tid||"00:00";
    const redSlutOrig  = redDag.slut_tid||"00:00";
    const redRastOrig  = redDag.rast_min||0;
    const redKmOrig    = redDag.km_totalt||0;
    const harÄndrat = redStart!==redStartOrig||redSlut!==redSlutOrig||redRast!==redRastOrig||redKm!==redKmOrig||(redObjektId&&redObjektId!==(redDag.objekt_id||null));

    if(redVy==="tid") return (
      <div style={shell}><style>{css}</style>{timerBanner}
        <div style={topBar}><div style={{ display:"flex",alignItems:"center",gap:14 }}><BackBtn onClick={()=>setRedVy("översikt")}/><h1 style={{ margin:0,...TYPE.h1 }}>Ändra arbetstid</h1></div></div>
        <div style={{ flex:1,overflowY:"auto",paddingTop:24 }}>

          {/* Start, Slut, Rast — iOS-stil scroll-wheels */}
          <div style={{ background:C.card,borderRadius:12,padding:"20px 16px",marginBottom:16,display:"flex",flexDirection:"column",gap:18 }}>
            <div>
              <span style={{ ...secHead,display:"block",textAlign:"center",marginBottom:8,color:redStart!==(redDag.start||"00:00")?C.orange:"#8e8e93" }}>Start</span>
              <TimePicker value={redStart} onChange={setRedStart}/>
            </div>
            <div style={{ borderTop:"1px solid rgba(255,255,255,0.05)",paddingTop:18 }}>
              <span style={{ ...secHead,display:"block",textAlign:"center",marginBottom:8,color:redSlut!==(redDag.slut||"00:00")?C.orange:"#8e8e93" }}>Slut</span>
              <TimePicker value={redSlut} onChange={setRedSlut}/>
            </div>
            <div style={{ borderTop:"1px solid rgba(255,255,255,0.05)",paddingTop:18 }}>
              <span style={{ ...secHead,display:"block",textAlign:"center",marginBottom:8,color:redRast!==(redDag.rast||0)?C.orange:"#8e8e93" }}>Rast</span>
              <div style={{ display:"flex",justifyContent:"center",alignItems:"center",gap:8,marginBottom:28 }}>
                <Wheel value={redRast} onChange={setRedRast} min={0} max={120} step={5}/>
                <span style={{ ...TYPE.meta,color:C.label,fontWeight:600 }}>min</span>
              </div>
            </div>
          </div>

          {/* Resultat */}
          <div style={{ textAlign:"center",padding:"18px 20px",background:"rgba(48,209,88,0.07)",borderRadius:12 }}>
            <p style={{ margin:"0 0 4px",fontSize:11,fontWeight:600,color:C.label }}>Arbetstid</p>
            <p style={{ margin:0,...TYPE.bigNum,color:C.green,...TNUM }}>{fmt(redArbMin)}</p>
          </div>
        </div>
        <div style={bottom}><button style={btn.primary} onClick={()=>setRedVy("översikt")}>Klar</button></div>
      </div>
    );

    if(redVy==="km") return (
      <div style={shell}><style>{css}</style>{timerBanner}
        <div style={topBar}><div style={{ display:"flex",alignItems:"center",gap:14 }}><BackBtn onClick={()=>setRedVy("översikt")}/><h1 style={{ margin:0,...TYPE.h1 }}>Ändra körning</h1></div></div>
        <div style={{ flex:1,paddingTop:20 }}>
          <KmPicker value={redKm} onChange={setRedKm} label="Totalt"/>
          <div style={{ textAlign:"center",padding:20,background:"rgba(48,209,88,0.07)",borderRadius:12 }}>
            <Label>Körning</Label>
            <p style={{ margin:0,...TYPE.bigNum,color:C.green,...TNUM }}>{redKm} km</p>
            {redKmBerakning!=null&&redKmBerakning>0&&<p style={{ margin:"4px 0 0",fontSize:12,color:"#8e8e93",...TNUM }}>Beräknat: {redKmBerakning} km (vägavstånd)</p>}
            {(()=>{ const över=Math.max(0,redKm-frikm); const mil=över>0?Math.ceil(över/10):0; const kr=Math.round(mil*fardtidPerMil*100)/100;
              return över>0
                ? <p style={{ margin:"8px 0 0",...TYPE.meta,color:C.green,...TNUM }}>Färdtidsersättning: {över} km över {frikm} km = {mil} påbörjade mil × {fardtidPerMil.toString().replace('.',',')} kr = {kr.toFixed(2).replace('.',',')} kr</p>
                : <p style={{ margin:"8px 0 0",fontSize:13,color:"#8e8e93" }}>Ingen färdtidsersättning (≤ {frikm} km)</p>;
            })()}
          </div>
        </div>
        <div style={bottom}><button style={btn.primary} onClick={()=>setRedVy("översikt")}>Klar</button></div>
      </div>
    );

    const månNamnKort = ['jan','feb','mar','apr','maj','jun','jul','aug','sep','okt','nov','dec'];
    const redDatumDisplay = (() => { const p = redDag.datum?.split('-'); if(!p||p.length<3) return redDag.datum; return `${parseInt(p[2])} ${månNamnKort[parseInt(p[1])-1]}`; })();
    const redMånadDisplay = (() => { const p = redDag.datum?.split('-'); if(!p||p.length<2) return ''; const m=parseInt(p[1])-1; const månader=['januari','februari','mars','april','maj','juni','juli','augusti','september','oktober','november','december']; return `${månader[m]} ${p[0]}`; })();
    const tidKort = (t: string|null|undefined) => t ? t.slice(0,5) : '—';
    const sparadRed: {start:string;slut:string;rast:number;km:number;anl:string} | undefined = redDagar[redDag.datum];

    if(sparadRed && redVy==="översikt") return (
      <div style={shell}><style>{css}</style>{timerBanner}
        <div style={topBar}>
          <div style={{ display:"flex",alignItems:"center",gap:14 }}>
            <BackBtn onClick={()=>setSteg("kalender")}/>
            <div>
              <p style={{ margin:0,fontSize:13,color:C.blue,fontWeight:600 }}>Redigerad</p>
              <h1 style={{ margin:"4px 0 0",...TYPE.h1 }}>{redDatumDisplay}</h1>
            </div>
          </div>
        </div>
        <div style={{ flex:1,overflowY:"auto",paddingTop:8 }}>
          <Label>Sparade värden</Label>
          <Card style={{ padding:"4px 20px" }}>
            {[
              ["Arbetstid", fmt(Math.max(0,tim(sparadRed.start,sparadRed.slut)-sparadRed.rast))],
              ["Start", sparadRed.start],
              ["Slut", sparadRed.slut],
              ["Rast", `${sparadRed.rast} min`],
              ["Körning", `${sparadRed.km} km`],
            ].map(([l,v],i,arr)=>(
              <div key={l} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"13px 0",borderBottom:i<arr.length-1?`1px solid ${C.line}`:"none" }}>
                <span style={{ ...TYPE.meta,color:"#fff" }}>{l}</span>
                <span style={{ ...TYPE.bodyList,color:"#fff" }}>{v}</span>
              </div>
            ))}
          </Card>

          <div style={{ marginTop:20 }}><Label>Original från MOM</Label></div>
          <Card style={{ padding:"4px 20px" }}>
            {[
              ["Arbetstid", fmt(redDag.arbMin||0)],
              ["Körning", `${redDag.km||0} km`],
            ].map(([l,v],i,arr)=>(
              <div key={l} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"13px 0",borderBottom:i<arr.length-1?`1px solid ${C.line}`:"none" }}>
                <span style={{ ...TYPE.meta,color:"#fff" }}>{l}</span>
                <span style={{ ...TYPE.bodyList,fontWeight:500,color:"rgba(255,255,255,0.5)",textDecoration:"line-through",...TNUM }}>{v}</span>
              </div>
            ))}
          </Card>

          {sparadRed.anl&&(
            <div style={{ marginTop:20 }}>
              <Label>Anledning</Label>
              <Card><p style={{ margin:0,...TYPE.meta }}>{sparadRed.anl}</p></Card>
            </div>
          )}
        </div>
        <div style={bottom}>
          <button style={btn.secondary} onClick={()=>setRedVy("tid")}>Ändra igen</button>
          <button style={btn.secondary} onClick={()=>setSteg("kalender")}>Stäng</button>
        </div>
      </div>
    );

    return (
      <div style={shell}><style>{css}</style>{timerBanner}
        <div style={topBar}>
          <div style={{ display:"flex",alignItems:"center",gap:14 }}>
            <BackBtn onClick={()=>setSteg("kalender")}/>
            <div>
              <p style={{ margin:0,fontSize:13,color:C.label }}>{redMånadDisplay}</p>
              <h1 style={{ margin:"4px 0 0",...TYPE.h1 }}>
                {redDag?.dagtyp === 'sjuk' ? `Sjukdag — ${redDatumDisplay}`
                  : redDag?.dagtyp === 'vab' ? `VAB — ${redDatumDisplay}`
                  : redDatumDisplay}
              </h1>
            </div>
          </div>
        </div>
        {(()=>{
          // Heldagstyp (sjuk/vab) får en minimal vy — ingen arbetstid/körning,
          // bara statusmeddelande + bekräftad-rad.
          if (redDag?.dagtyp === 'sjuk' || redDag?.dagtyp === 'vab') {
            const bekraftadRedan = !!redDag?.bekraftad;
            const bekraftadTidFmt = redDag?.bekraftad_tid
              ? new Date(redDag.bekraftad_tid).toLocaleTimeString('sv-SE',{hour:'2-digit',minute:'2-digit'})
              : null;
            const meddelande = redDag.dagtyp === 'sjuk'
              ? { icon: 'sick' as string | null, text: 'Krya på dig!' }
              : { icon: null as string | null, text: 'VAB registrerad' };
            return (<>
              <div style={{ flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"48px 24px" }}>
                {meddelande.icon && (
                  <span className="material-symbols-outlined" style={{ fontSize:72,color:"#fff",marginBottom:20 }}>{meddelande.icon}</span>
                )}
                <p style={{ margin:0,...TYPE.largeTitle,color:"#fff",textAlign:"center" }}>{meddelande.text}</p>
              </div>
              <div style={bottom}>
                {bekraftadRedan ? (<>
                  <div style={{ width:"100%",padding:"14px 16px",background:"rgba(48,209,88,0.10)",border:"1px solid rgba(48,209,88,0.25)",borderRadius:12,textAlign:"center",display:"flex",alignItems:"center",justifyContent:"center",gap:6 }}>
                    <span className="material-symbols-outlined" style={{ fontSize:18,color:"#30d158" }}>check_circle</span>
                    <span style={{ ...TYPE.meta,color:"#8e8e93",...TNUM }}>Bekräftad{bekraftadTidFmt?` kl ${bekraftadTidFmt}`:''}</span>
                  </div>
                  <button style={{ ...btn.secondary, marginTop:8 }} onClick={()=>setSteg("kalender")}>Tillbaka</button>
                </>) : (<>
                  <button
                    style={{ width:"100%",padding:"18px",background:"#30D158",color:"#fff",border:"none",borderRadius:12,fontSize:17,fontWeight:700,cursor:"pointer",fontFamily:"inherit" }}
                    onClick={async ()=>{
                      const nuIso = new Date().toISOString();
                      const res = await uppdateraVerifierat(supabase, "arbetsdag",
                        { bekraftad: true, bekraftad_tid: nuIso },
                        { medarbetare_id: medarbetare.id, datum: redDag.datum });
                      if (!res.ok) { alert(res.fel); return; }
                      setRedDag((d:any) => ({ ...d, bekraftad: true, bekraftad_tid: nuIso }));
                      setDagData(dd => ({ ...dd, [redDag.datum]: { ...(dd[redDag.datum]||{}), bekraftad: true, bekraftad_tid: nuIso } }));
                      if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(120);
                    }}>
                    Bekräfta dagen
                  </button>
                  <button style={{ ...btn.secondary, marginTop:8 }} onClick={()=>setSteg("kalender")}>Tillbaka</button>
                </>)}
              </div>
            </>);
          }
          const harData = !!(redDag?.start_tid);
          const extraTidForDag = (extraTidData || [])
            .filter((e:any) => e.datum === redDag.datum && e.slut_tid)
            .sort((a:any,b:any) => (a.start_tid||'').localeCompare(b.start_tid||''));
          const harExtra = extraTidForDag.length > 0;
          const prefixFörExtra = (e: any): string => {
            const arbSt = redDag?.start_tid;
            const arbEn = redDag?.slut_tid;
            if (arbSt && e.slut_tid && e.slut_tid <= arbSt) return "Morgon";
            if (arbEn && e.start_tid && e.start_tid >= arbEn) return "Kväll";
            return "Extra";
          };
          return (<>
        <div style={{ flex:1,overflowY:"auto",paddingTop:8 }}>
          {!harData&&redStart==="00:00"&&redSlut==="00:00"&&redRast===0&&!harExtra?(
            <Card style={{ padding:"24px 20px",textAlign:"center" as const }}>
              {/* Ärligt tomt: varken maskinpass eller loggad extra-tid. */}
              <p style={{ margin:"0 0 4px",...TYPE.meta,color:"#fff" }}>Ingen data för den här dagen</p>
              <p style={{ margin:0,fontSize:13,color:"#fff" }}>Lägg till arbetstid och körning manuellt</p>
            </Card>
          ):!harData&&!harExtra?(
            <Card style={{ padding:"4px 20px" }}>
              <div onClick={()=>setRedVy("tid")} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 0",borderBottom:`1px solid ${C.line}`,cursor:"pointer" }}>
                <span style={{ fontSize:16,color:"#fff" }}>Arbetstid</span>
                <div style={{ display:"flex",alignItems:"center",gap:10 }}>
                  <span style={{ fontSize:16,fontWeight:600,color:C.orange }}>{fmt(redArbMin)}</span>
                  <ChevronRight/>
                </div>
              </div>
              <div onClick={()=>setRedVy("km")} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 0",cursor:"pointer" }}>
                <span style={{ fontSize:16,color:"#fff" }}>Körning</span>
                <div style={{ display:"flex",alignItems:"center",gap:10 }}>
                  <span style={{ fontSize:16,fontWeight:600,color:redKm>0?C.orange:"#fff" }}>{redKm} km</span>
                  <ChevronRight/>
                </div>
              </div>
            </Card>
          ):!harData?(
            /* Extra-tid finns men inget maskinpass: konstatera det lugnt —
               säg ALDRIG "ingen data" när den loggade tiden listas nedanför.
               Samma ärlighetsprincip som Saldon-tillstånden. */
            <Card style={{ padding:"16px 20px",textAlign:"center" as const }}>
              <p style={{ margin:0,...TYPE.meta,color:"#8e8e93" }}>Ingen maskindata den här dagen</p>
            </Card>
          ):(
            <Card style={{ padding:"4px 20px" }}>
              {/* Hjälte: Total arbetstid — hela blocket klickbart, öppnar Ändra
                  arbetstid (start/slut/rast-hjulen). Ersätter Arbetstid/Rast/Total-
                  raderna; orange stödrad när tiderna ändrats men inte sparats. */}
              <div onClick={()=>setRedVy("tid")} style={{ textAlign:"center",padding:"18px 0 16px",cursor:"pointer",borderBottom:`1px solid ${C.line}` }}>
                {/* "Maskinpass" — siffran är passets tid; extra tid listas nedan
                    och dagens total visas som dämpad rad när extra finns */}
                <p style={{ margin:"0 0 8px",...TYPE.meta,color:"#8e8e93" }}>Maskinpass</p>
                <p style={{ margin:0,...TYPE.bigNum,color:"#fff",...TNUM }}>{fmt(redArbMin)}</p>
                <p style={{ margin:"8px 0 0",...TYPE.meta,color:(redStart!==redStartOrig||redSlut!==redSlutOrig||redRast!==redRastOrig)?C.orange:"#8e8e93",...TNUM }}>
                  {redStart.slice(0,5)} → {redSlut.slice(0,5)} · rast {redRast} min
                  <span className="material-symbols-outlined" style={{ fontSize:14,color:"rgba(255,255,255,0.25)",verticalAlign:"-2px",marginLeft:2 }}>chevron_right</span>
                </p>
                <p style={{ margin:"6px 0 0",...TYPE.caption,color:"#636366" }}>Rast = tid markerad som Meal break i maskinen</p>
                {(()=>{
                  const exMinDag = extraTidForDag.reduce((a:number,e:any) => a + (e.minuter||0), 0);
                  return exMinDag > 0 ? (
                    <p style={{ margin:"6px 0 0",...TYPE.caption,color:"#8e8e93",...TNUM }}>+ {fmt(exMinDag)} extra arbete · totalt {fmt(redArbMin + exMinDag)}</p>
                  ) : null;
                })()}
              </div>
              {/* Maskin — klickbar */}
              <div onClick={()=>setVisaRedMaskinVäljare(true)} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 0",borderBottom:`1px solid ${C.line}`,cursor:"pointer" }}>
                <span style={{ fontSize:16,color:"#fff" }}>Maskin</span>
                <div style={{ display:"flex",alignItems:"center",gap:10 }}>
                  <span style={{ ...TYPE.bodyList,color:"#fff" }}>{(()=>{const m=redMaskinId?maskinNamnMap[redMaskinId]:null; return m||redDag.maskin_namn||redDag.maskin_id||"—";})()}</span>
                  <ChevronRight/>
                </div>
              </div>
              {/* Objekt — flera vid byte under dagen, annars klickbar enstaka */}
              {(()=>{
                const objLista = redDag?.objekt_lista || [];
                if (objLista.length > 1) {
                  return objLista.map((o:any, i:number) => {
                    const tidStr = o.start_tid && o.slut_tid
                      ? ` (${o.start_tid.slice(0,5)}–${o.slut_tid.slice(0,5)})`
                      : o.arbetad_min ? ` (${fmt(o.arbetad_min)})` : '';
                    return (
                      <div key={o.id} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 0",borderBottom:`1px solid ${C.line}` }}>
                        <span style={{ fontSize:16,color:"#fff" }}>{i === 0 ? "Objekt" : ""}</span>
                        <span style={{ ...TYPE.bodyList,color:"#fff",textAlign:"right" as const }}>
                          {o.objekt_namn || o.objekt_id}
                          <span style={{ color:"rgba(255,255,255,0.5)",fontSize:13 }}>{tidStr}</span>
                        </span>
                      </div>
                    );
                  });
                }
                return (
                  <div onClick={()=>setVisaRedObjektVäljare(true)} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 0",borderBottom:`1px solid ${C.line}`,cursor:"pointer" }}>
                    <span style={{ fontSize:16,color:"#fff" }}>Objekt</span>
                    <div style={{ display:"flex",alignItems:"center",gap:10 }}>
                      <span style={{ ...TYPE.bodyList,color:"#fff" }}>{(()=>{const o=redObjektId?objektLista.find(x=>x.id===redObjektId):null; return o?o.namn:(formatObjektNamn(redDag.objekt_namn)||redDag.objekt_id||"—");})()}</span>
                      <ChevronRight/>
                    </div>
                  </div>
                );
              })()}
              {redDag.extra>0&&(
                <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 0",borderBottom:redDag.trak?`1px solid ${C.line}`:"none" }}>
                  <span style={{ fontSize:16,color:"#fff" }}>Extra tid</span>
                  <span style={{ fontSize:16,fontWeight:600,color:"#fff" }}>{redDag.extra} min</span>
                </div>
              )}
              {redDag.trak&&(
                <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 0" }}>
                  <span style={{ fontSize:16,color:"#fff" }}>Traktamente</span>
                  <span style={{ fontSize:16,fontWeight:600,color:"#fff" }}>{gsAvtal?.traktamente_hel_kr ?? 300} kr</span>
                </div>
              )}
            </Card>
          )}

          {/* Loggad tid — extra_tid-poster för dagen */}
          {harExtra && (
            <div style={{ marginTop:16 }}>
              <Label>Loggad tid</Label>
              <Card style={{ padding:"4px 20px" }}>
                {extraTidForDag.map((e:any, i:number) => {
                  const typLabel = e.aktivitet_typ ? aktLabel(e.aktivitet_typ) : 'Extra';
                  const tidStr = `${(e.start_tid||'').slice(0,5)}–${(e.slut_tid||'').slice(0,5)}`;
                  const varaktighet = fmt(e.minuter || 0);
                  return (
                    <div key={e.id} onClick={() => {
                      setKvAvTyp(e.aktivitet_typ || null);
                      setKvAvObj(e.objekt_id ? objektLista.find(o => o.id === e.objekt_id) || null : null);
                      setKvAvDeb(!!e.debiterbar);
                      setKvAvBesk(e.kommentar || "");
                      setEfterStoppSheet(e);
                    }}
                      style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 0",borderBottom:i<extraTidForDag.length-1?`1px solid ${C.line}`:"none",cursor:"pointer",gap:10 }}>
                      <span style={{ fontSize:16,color:"#fff",flexShrink:0 }}>{prefixFörExtra(e)}</span>
                      <div style={{ display:"flex",alignItems:"center",gap:10,minWidth:0 }}>
                        <span style={{ ...TYPE.bodyList,color:"#fff",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{typLabel} {tidStr} ({varaktighet})</span>
                        <ChevronRight/>
                      </div>
                    </div>
                  );
                })}
              </Card>
            </div>
          )}

          {/* Körning — separat kort med morgon/kväll/total (eller segment-kedja) + färdtidsersättning */}
          {redDag?.start_tid&&(()=>{
            const över = Math.max(0, redKm - frikm);
            const mil  = över>0 ? Math.ceil(över/10) : 0;
            const kr   = Math.round(mil*fardtidPerMil*100)/100;
            const segs = redKmChain || [];
            const harFlerObjekt = segs.length > 2;
            const öppnaKmSheet = () => {
              const harSplit = (redDag.km_morgon||0) > 0 || (redDag.km_kvall||0) > 0;
              const m = harSplit ? (redDag.km_morgon||0) : Math.round(redKm/2);
              const k = harSplit ? (redDag.km_kvall||0)  : redKm - Math.round(redKm/2);
              setRedTmpKmM(m); setRedTmpKmK(k);
              setVisaRedKmSheet(true);
            };

            // Radformat gemensamt för både 1-objekt- och multi-objekt-vyerna
            const rad = (label: string, value: string, bold=false, onClick?: () => void) => (
              <div key={label} onClick={onClick} style={{ display:"flex",justifyContent:"space-between",padding:"8px 0",alignItems:"center",cursor:onClick?"pointer":"default" }}>
                <span style={{ color:"#fff",...TYPE.meta,fontWeight:bold?600:500 }}>{label}</span>
                <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                  <span style={{ color:"#fff",...(bold?TYPE.body:TYPE.bodyList),...TNUM }}>{value}</span>
                  {onClick && <span className="material-symbols-outlined" style={{ fontSize:16,color:"rgba(255,255,255,0.35)" }}>chevron_right</span>}
                </div>
              </div>
            );

            return (
              <Card style={{ padding:"16px 20px" }}>
                <p style={{ ...secHead }}>Körning</p>

                {harFlerObjekt ? (
                  // Multi-objekt: visa varje segment som egen rad
                  segs.map((s, i) => {
                    const label = i === 0            ? `Morgon (→ ${s.toLabel})`
                                : i === segs.length-1 ? `Kväll (${s.fromLabel} →)`
                                :                       `Flytt (${s.fromLabel} → ${s.toLabel})`;
                    return rad(label, `${s.km} km`, false, öppnaKmSheet);
                  })
                ) : segs.length === 2 ? (
                  // 1-objekt via chain: segment[0] = morgon, segment[1] = kväll
                  <>{rad("Morgon", `${segs[0].km} km`, false, öppnaKmSheet)}{rad("Kväll", `${segs[1].km} km`, false, öppnaKmSheet)}</>
                ) : (
                  // Fallback: DB-split eller redKm/2
                  (()=>{
                    const harSplit = (redDag.km_morgon||0) > 0 || (redDag.km_kvall||0) > 0;
                    const morgonVisa = harSplit ? (redDag.km_morgon||0) : Math.round(redKm/2);
                    const kvallVisa  = harSplit ? (redDag.km_kvall||0)  : redKm - Math.round(redKm/2);
                    return <>{rad("Morgon", `${morgonVisa} km`, false, öppnaKmSheet)}{rad("Kväll", `${kvallVisa} km`, false, öppnaKmSheet)}</>;
                  })()
                )}

                <div style={{ borderTop:"1px solid rgba(255,255,255,0.1)",marginTop:6,paddingTop:10 }}>
                  {rad("Totalt", `${redKm} km`, true, öppnaKmSheet)}
                </div>
                {redKmBerakning!=null&&(
                  <p style={{ margin:"8px 0 0",fontSize:12,color:"#fff" }}>Beräknat vägavstånd</p>
                )}
                {över>0&&(
                  <div style={{ borderTop:"1px solid rgba(255,255,255,0.1)",marginTop:10,paddingTop:10 }}>
                    <div style={{ display:"flex",justifyContent:"space-between",padding:"6px 0" }}>
                      <span style={{ color:"#fff",...TYPE.meta }}>Färdtidsersättning</span>
                      <span style={{ color:"#fff",...TYPE.bodyList }}>{kr.toFixed(2).replace('.',',')} kr</span>
                    </div>
                    <p style={{ margin:"2px 0 0",fontSize:12,color:"#fff" }}>
                      {över} km över {frikm} km = {mil} mil × {fardtidPerMil.toString().replace('.',',')} kr
                    </p>
                  </div>
                )}
              </Card>
            );
          })()}

          {/* Anledning — visas om något ändrats */}
          {harÄndrat&&(
            <div style={{ marginTop:16 }}>
              <Label>{harData?"Anledning till ändring":"Kommentar"} <span style={{ color:C.red }}>*</span></Label>
              <input
                placeholder="Kommentar"
                value={redAnl}
                onChange={e=>setRedAnl(e.target.value)}
                style={{ width:"100%",padding:"15px 16px",fontSize:16,border:"none",borderRadius:12,background:C.card,outline:"none",boxShadow:"none",fontFamily:"inherit",color:"#fff" }}
              />
            </div>
          )}
        </div>
        <div style={bottom}>
          {(()=>{
            const bekraftadRedan = !!redDag?.bekraftad;
            const bekraftadTidFmt = redDag?.bekraftad_tid
              ? new Date(redDag.bekraftad_tid).toLocaleTimeString('sv-SE',{hour:'2-digit',minute:'2-digit'})
              : null;
            // Bekräfta-villkor:
            //  (a) maskinpass avslutat (slut_tid finns) — normalfall
            //  (b) heldagstyp (sjuk/vab) — klar direkt när registrerad
            //  (c) bara extra_tid utan maskinpass — inget att vänta på
            // Om passet pågår (start utan slut) visar vi istället en grå
            // väntetext.
            const harStart = !!redDag?.start_tid;
            const harSlut = !!redDag?.slut_tid;
            const erHelDag = redDag?.dagtyp === 'sjuk' || redDag?.dagtyp === 'vab';
            const harExtra = (extraTidData || []).some((e:any) => e.datum === redDag.datum && e.slut_tid);
            const kanBekrafta = !bekraftadRedan && (harSlut || erHelDag || (harExtra && !harStart));
            const passPågår = harStart && !harSlut && !erHelDag;
            if (!harData && redStart==="00:00" && redSlut==="00:00" && redRast===0) {
              return <button style={btn.primary} onClick={()=>setRedVy("tid")}>Lägg till manuellt</button>;
            }
            if (harÄndrat) {
              return (
                <button
                  style={{ ...btn.primary,opacity:!redAnl?0.35:1 }}
                  disabled={!redAnl}
                  onClick={async ()=>{
                    try {
                      // arbetad_min + km_totalt är generated columns — räknas från rast_min
                      // resp. km_morgon+km_kvall. Bevara morgon/kväll-splitten som
                      // användaren satte via km-sheet; om den saknas fall tillbaka
                      // till jämn split.
                      const storedMorg = redDag.km_morgon ?? null;
                      const storedKvall = redDag.km_kvall ?? null;
                      let kmMorg: number;
                      let kmKvall: number;
                      if (storedMorg != null && storedKvall != null && (storedMorg + storedKvall) === redKm) {
                        kmMorg = storedMorg;
                        kmKvall = storedKvall;
                      } else {
                        const halv = Math.round(redKm / 2);
                        kmMorg = halv;
                        kmKvall = redKm - halv;
                      }
                      const res = await upsertVerifierat(supabase, "arbetsdag", {
                        medarbetare_id: medarbetare.id,
                        datum: redDag.datum,
                        start_tid: redStart, slut_tid: redSlut, rast_min: redRast,
                        km_morgon: kmMorg, km_kvall: kmKvall,
                        objekt_id: redObjektId || redDag.objekt_id || null,
                        maskin_id: redMaskinId || redDag.maskin_id || null,
                        redigerad: true,
                        redigerad_anl: redAnl, redigerad_tid: new Date().toISOString(),
                      }, { onConflict: 'medarbetare_id,datum' });
                      if (!res.ok) throw new Error(res.fel);
                      setRedDagar(r=>({...r,[redDag.datum]:{start:redStart,slut:redSlut,rast:redRast,km:redKm,anl:redAnl}}));
                      setSteg("kalender");
                    } catch(e) {
                      alert("Kunde inte spara — kontrollera anslutningen.");
                    }
                  }}>
                  {harData?"Spara ändring":"Spara"}
                </button>
              );
            }
            // Ingen ändring gjord. Bekräfta-knapp visas bara för dagar där
            // passet är avslutat (eller saknas). Pågående pass visar väntetext.
            if (kanBekrafta) {
              return (<>
                <button
                  style={{ width:"100%",padding:"18px",background:"#30D158",color:"#fff",border:"none",borderRadius:12,fontSize:17,fontWeight:700,cursor:"pointer",fontFamily:"inherit" }}
                  onClick={async ()=>{
                    const nuIso = new Date().toISOString();
                    const res = await uppdateraVerifierat(supabase, "arbetsdag",
                      { bekraftad: true, bekraftad_tid: nuIso },
                      { medarbetare_id: medarbetare.id, datum: redDag.datum });
                    if (!res.ok) { alert(res.fel); return; }
                    setRedDag((d:any) => ({ ...d, bekraftad: true, bekraftad_tid: nuIso }));
                    setDagData(dd => ({ ...dd, [redDag.datum]: { ...(dd[redDag.datum]||{}), bekraftad: true, bekraftad_tid: nuIso, status: 'ok' } }));
                    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(120);
                  }}>
                  Bekräfta dagen
                </button>
                <button style={{ ...btn.secondary, marginTop:8 }} onClick={()=>setSteg("kalender")}>Tillbaka</button>
              </>);
            }
            if (passPågår) {
              return (<>
                <div style={{ width:"100%",padding:"14px 16px",textAlign:"center" }}>
                  <span style={{ ...TYPE.meta,color:"#8e8e93" }}>Pass pågår — kan bekräftas efter avslut</span>
                </div>
                <button style={btn.secondary} onClick={()=>setSteg("kalender")}>Tillbaka</button>
              </>);
            }
            if (bekraftadRedan) {
              return (<>
                <div style={{ width:"100%",padding:"14px 16px",background:"rgba(48,209,88,0.10)",border:"1px solid rgba(48,209,88,0.25)",borderRadius:12,textAlign:"center",display:"flex",alignItems:"center",justifyContent:"center",gap:6 }}>
                  <span className="material-symbols-outlined" style={{ fontSize:18,color:"#30d158" }}>check_circle</span>
                  <span style={{ ...TYPE.meta,color:"#8e8e93",...TNUM }}>Bekräftad{bekraftadTidFmt?` kl ${bekraftadTidFmt}`:''}</span>
                </div>
                <button style={{ ...btn.secondary, marginTop:8 }} onClick={()=>setSteg("kalender")}>Tillbaka</button>
              </>);
            }
            return <button style={btn.secondary} onClick={()=>setSteg("kalender")}>Tillbaka</button>;
          })()}
        </div>
          </>);
        })()}

        {/* Objektväljare för redigering */}
        {visaRedObjektVäljare&&(
          <div style={{ position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.8)",zIndex:100,display:"flex",alignItems:"flex-end",justifyContent:"center" }}>
            <div style={{ background:"#0d0d0f",borderRadius:"12px 12px 0 0",width:"100%",maxWidth:500,maxHeight:"70vh",display:"flex",flexDirection:"column" }}>
              <div style={{ padding:"16px 20px",borderBottom:"1px solid rgba(255,255,255,0.06)",display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                <h3 style={{ margin:0,...TYPE.h2 }}>Välj objekt</h3>
                <button onClick={()=>setVisaRedObjektVäljare(false)} style={{ background:"none",border:"none",color:"#8e8e93",...TYPE.meta,cursor:"pointer",fontFamily:"inherit" }}>Stäng</button>
              </div>
              <div style={{ flex:1,overflowY:"auto" }}>
                <ObjektValjarLista
                  objekt={objektLista}
                  valtId={redObjektId || redDag?.objekt_id || null}
                  onVälj={o => { if (o) setRedObjektId(o.id); setVisaRedObjektVäljare(false); }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Maskinväljare */}
        {visaRedMaskinVäljare&&(
          <div style={{ position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.8)",zIndex:100,display:"flex",alignItems:"flex-end",justifyContent:"center" }}>
            <div style={{ background:"#1c1c1e",borderRadius:"12px 12px 0 0",width:"100%",maxWidth:500,maxHeight:"70vh",display:"flex",flexDirection:"column" }}>
              <div style={{ padding:"16px 20px",borderBottom:"1px solid rgba(255,255,255,0.06)",display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                <h3 style={{ margin:0,...TYPE.h2 }}>Välj maskin</h3>
                <button onClick={()=>setVisaRedMaskinVäljare(false)} style={{ background:"none",border:"none",color:"#8e8e93",...TYPE.meta,cursor:"pointer",fontFamily:"inherit" }}>Stäng</button>
              </div>
              <div style={{ flex:1,overflowY:"auto",padding:"8px 0" }}>
                {Object.entries(maskinNamnMap).map(([mid,namn])=>(
                  <button key={mid} onClick={()=>{setRedMaskinId(mid);setVisaRedMaskinVäljare(false);}} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",width:"100%",padding:"14px 20px",background:"none",border:"none",borderBottom:"1px solid rgba(255,255,255,0.04)",cursor:"pointer",fontFamily:"inherit",textAlign:"left" }}>
                    <div>
                      <p style={{ margin:0,...TYPE.bodyList,color:"#fff" }}>{namn}</p>
                      <p style={{ margin:"2px 0 0",fontSize:12,color:"#8e8e93" }}>{mid}</p>
                    </div>
                    {redMaskinId===mid&&<div style={{ width:20,height:20,borderRadius:"50%",background:"#0a84ff",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}><svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l3 3L9 1" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg></div>}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Rast-picker — centrerad iOS-stil wheel */}
        {visaRedRastPicker&&(
          <div onClick={()=>setVisaRedRastPicker(false)} style={{ position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.7)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center" }}>
            <div onClick={e=>e.stopPropagation()} style={{ background:"#1c1c1e",borderRadius:12,padding:24,width:240 }}>
              <p style={{ margin:"0 0 16px",...TYPE.micro,color:"#8e8e93",textAlign:"center" }}>Rast</p>
              <div style={{ display:"flex",justifyContent:"center",alignItems:"center",gap:8 }}>
                <Wheel value={redRast} onChange={setRedRast} min={0} max={120} step={5}/>
                <span style={{ ...TYPE.meta,color:"#8e8e93",fontWeight:600 }}>min</span>
              </div>
              <button onClick={()=>setVisaRedRastPicker(false)} style={{ width:"100%",marginTop:16,height:44,background:"rgba(255,255,255,0.08)",border:"none",borderRadius:10,color:"#fff",...TYPE.bodyList,cursor:"pointer",fontFamily:"inherit" }}>Klar</button>
            </div>
          </div>
        )}

        {/* Km-sheet — bottom sheet för att ändra morgon/kväll-km. Klickbar från Körning-kortet. */}
        {visaRedKmSheet && (()=>{
          const ny = redTmpKmM + redTmpKmK;
          const över = Math.max(0, ny - frikm);
          const mil = över > 0 ? Math.ceil(över/10) : 0;
          const kr = Math.round(mil * fardtidPerMil * 100) / 100;
          const stäng = () => setVisaRedKmSheet(false);
          const KmInp = ({label, value, onChange}: {label: string; value: number; onChange: (v:number)=>void}) => (
            <div style={{ flex:1,background:"rgba(255,255,255,0.04)",borderRadius:12,padding:"14px 16px",border:"1px solid rgba(255,255,255,0.06)" }}>
              <p style={{ margin:"0 0 10px",fontSize:13,color:"#fff",fontWeight:500 }}>{label}</p>
              <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between" }}>
                <button onClick={()=>onChange(Math.max(0, value-10))} style={{ width:36,height:36,borderRadius:10,background:"rgba(255,255,255,0.08)",border:"none",color:"#fff",fontSize:20,cursor:"pointer" }}>−</button>
                <span style={{ fontSize:28,fontWeight:700,color:"#fff",fontVariantNumeric:"tabular-nums" }}>{value}</span>
                <button onClick={()=>onChange(Math.min(999, value+10))} style={{ width:36,height:36,borderRadius:10,background:"rgba(255,255,255,0.08)",border:"none",color:"#fff",fontSize:20,cursor:"pointer" }}>+</button>
              </div>
              <p style={{ margin:"6px 0 0",textAlign:"center",fontSize:12,color:"#fff" }}>km</p>
            </div>
          );
          return (
            <div onClick={stäng} style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:1500,display:"flex",alignItems:"flex-end",justifyContent:"center",animation:"dimIn 0.2s ease" }}>
              <div onClick={e=>e.stopPropagation()}
                style={{ width:"100%",maxWidth:560,background:"#1c1c1e",borderRadius:"12px 12px 0 0",padding:"10px 20px 28px",maxHeight:"85vh",overflowY:"auto",animation:"sheetSlideUp 0.28s cubic-bezier(0.2,0.8,0.2,1)" }}>
                <div style={{ display:"flex",justifyContent:"center",padding:"6px 0 14px" }}>
                  <div style={{ width:40,height:5,borderRadius:3,background:"rgba(255,255,255,0.2)" }} />
                </div>
                <p style={{ margin:"0 0 16px",...TYPE.h2,color:"#fff" }}>Ändra km</p>
                <div style={{ display:"flex",gap:10 }}>
                  <KmInp label="Morgon" value={redTmpKmM} onChange={setRedTmpKmM}/>
                  <KmInp label="Kväll"  value={redTmpKmK} onChange={setRedTmpKmK}/>
                </div>
                <div style={{ marginTop:16,padding:"18px 20px",background:"rgba(48,209,88,0.08)",borderRadius:12 }}>
                  <div style={{ display:"flex",justifyContent:"space-between",alignItems:"baseline" }}>
                    <span style={{ color:"#fff",...TYPE.meta }}>Totalt</span>
                    <span style={{ color:"#30d158",...TYPE.h2,...TNUM }}>{ny} km</span>
                  </div>
                  {över > 0
                    ? <p style={{ margin:"8px 0 0",fontSize:13,color:"#30d158",fontWeight:500 }}>Färdtidsersättning: {över} km över {frikm} km = {mil} mil × {fardtidPerMil.toString().replace('.',',')} kr = {kr.toFixed(2).replace('.',',')} kr</p>
                    : <p style={{ margin:"8px 0 0",fontSize:13,color:"#fff" }}>Ingen färdtidsersättning (≤ {frikm} km)</p>
                  }
                </div>
                <div style={{ display:"grid",gridTemplateColumns:"1fr 2fr",gap:8,marginTop:16 }}>
                  <button onClick={stäng}
                    style={{ padding:"16px",background:"rgba(255,255,255,0.06)",color:"#fff",border:"none",borderRadius:12,fontSize:15,fontWeight:600,cursor:"pointer",fontFamily:"inherit" }}>
                    Avbryt
                  </button>
                  <button
                    onClick={async () => {
                      // Skriv till DB först om raden finns (samma beteende som
                      // dag-vyns km-sheet), lokal state efter verifierad skrivning.
                      // Bryter bekräftelse vid ändring.
                      if (redDag?.id) {
                        const bryterBekräftelse = !!redDag?.bekraftad;
                        const payload: any = { km_morgon: redTmpKmM, km_kvall: redTmpKmK, redigerad: true, redigerad_tid: new Date().toISOString() };
                        if (bryterBekräftelse) { payload.bekraftad = false; payload.bekraftad_tid = null; }
                        const res = await uppdateraVerifierat(supabase, "arbetsdag", payload, { id: redDag.id });
                        if (!res.ok) {
                          alert(res.fel);
                          return;
                        }
                        setDagData(dd => ({
                          ...dd,
                          [redDag.datum]: {
                            ...(dd[redDag.datum]||{}),
                            km_morgon: redTmpKmM,
                            km_kvall: redTmpKmK,
                            km_totalt: ny,
                            ...(bryterBekräftelse ? { bekraftad: false, bekraftad_tid: null } : {}),
                          },
                        }));
                        setRedDag((d:any) => ({ ...d, km_morgon: redTmpKmM, km_kvall: redTmpKmK, km_totalt: ny, ...(bryterBekräftelse ? { bekraftad: false, bekraftad_tid: null } : {}) }));
                      } else {
                        // Ingen DB-rad än — bara lokal state (skrivs vid Spara/upsert)
                        setRedDag((d:any) => ({ ...d, km_morgon: redTmpKmM, km_kvall: redTmpKmK, km_totalt: ny }));
                      }
                      setRedKm(ny);
                      stäng();
                    }}
                    style={{ padding:"16px",background:"#0a84ff",color:"#fff",border:"none",borderRadius:12,fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:"inherit" }}>
                    Spara
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    );
  }

  /* ─── KALENDER ─── */
  if(steg==="kalender"){
    const bas=new Date(kalÅr,kalMånad,1);
    const dagar=new Date(kalÅr,kalMånad+1,0).getDate();
    const startDag=(bas.getDay()+6)%7;
    const rödaDagar=getRödaDagar(kalÅr);
    const kalMånadLabel=bas.toLocaleString('sv-SE',{month:'long',year:'numeric'});
    const kalMånadNamn=bas.toLocaleString('sv-SE',{month:'long'});

    // Navigation limits: 12 months back, 1 month forward
    const nuDat=new Date();
    const minDat=new Date(nuDat.getFullYear(),nuDat.getMonth()-12,1);
    const maxDat=new Date(nuDat.getFullYear(),nuDat.getMonth()+1,1);
    const kanBakåt=bas>minDat;
    const kanFramåt=new Date(kalÅr,kalMånad+1,1)<=maxDat;

    const navigera=(dir: number)=>{
      let ny=kalMånad+dir, å=kalÅr;
      if(ny<0){ny=11;å--;}
      if(ny>11){ny=0;å++;}
      setKalMånad(ny);setKalÅr(å);
    };

    const dagKey=(d)=>`${kalÅr}-${String(kalMånad+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    const veckar=["Mån","Tis","Ons","Tor","Fre","Lör","Sön"];
    const cells=[...Array(startDag).fill(null),...Array(dagar).fill(0).map((_,i)=>i+1)];
    while(cells.length%7!==0)cells.push(null);

    // Beräkna månadsmål: vardagar × 8h, minus röda dagar
    let arbetsdagar=0;
    for(let d=1;d<=dagar;d++){
      const k=dagKey(d);
      const date=new Date(kalÅr,kalMånad,d);
      const dow=date.getDay();
      if(dow!==0&&dow!==6&&!rödaDagar[k]) arbetsdagar++;
    }
    const målH = arbetsdagar*8;

    // Total jobbad tid denna månad
    const jobbadMin = Object.values(dagData).reduce((a: number, d: any) => a + (d.arbMin || 0), 0);
    const jobbadH = Math.round(jobbadMin / 60 * 10) / 10;
    // km hämtas från /api/km-summary som fyller ut saknade DB-värden via ORS
    const totalKm = kmSummary?.totalKm ?? 0;
    const ersKm   = kmSummary?.ersattningsKm ?? 0;
    const övH = Math.max(0, jobbadH-målH);

    const statusFärg=(d)=>{
      const k=dagKey(d);
      const dag=dagData[k];
      // Prick visas BARA när det finns en arbetsdag-rad för dagen:
      //   sjuk/vab-dagtyp → egen färg
      //   bekräftat      → grön
      //   annars          → orange
      // Om raden saknas returneras icke-prickfärgat värde ("röd" för
      // helgdagar i texten, "weekend"/"tom" för alla andra) — de saknas
      // i dotFärg så ingen prick renderas. Tidigare föll gångna vardagar
      // utan data in i "saknas"-grenen, vilket gav spurious orange prickar.
      if (dag?.dagtyp === 'sjuk') return 'sjuk';
      if (dag?.dagtyp === 'vab')  return 'vab';
      if (dag?.bekraftad) return 'ok';
      if (dag) return 'saknas';
      if (rödaDagar[k]) return 'röd';
      const date = new Date(kalÅr, kalMånad, d);
      const dow = date.getDay();
      if (dow === 0 || dow === 6) return 'weekend';
      return 'tom';
    };

    const dotFärg: Record<string,string> = {
      ok:"#30D158",         // grön — bekräftad (tydligare än vit mot mörk bg)
      saknas:"#ff9f0a",     // orange — data finns men ej bekräftat
      sjuk:"#ff453a",       // röd
      vab:"#ff9f0a",         // orange
    };
    const extraPrickFärg = "#0A84FF"; // blå för extra tid

    return (
      <div style={{ minHeight:"100vh",background:"#000",color:"#fff",fontFamily:"'Inter',-apple-system,sans-serif",WebkitFontSmoothing:"antialiased",display:"flex",flexDirection:"column" }}>
        <style>{css}</style>{timerBanner}

        {/* Header — sticky nav with month + arrows */}
        <header style={{ position:"sticky",top:HEADER_TOP,background:"rgba(0,0,0,0.8)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",zIndex:50,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 24px",height:64 }}>
          <button onClick={()=>kanBakåt&&navigera(-1)} style={{ background:"none",border:"none",cursor:"pointer",opacity:kanBakåt?1:0.3,padding:4 }}>
            <span className="material-symbols-outlined" style={{ color:"#0a84ff" }}>chevron_left</span>
          </button>
          <h1 style={{ margin:0,fontSize:18,fontWeight:600,letterSpacing:"-0.02em",color:"#0a84ff" }}>{kalMånadLabel}</h1>
          <button onClick={()=>kanFramåt&&navigera(1)} style={{ background:"none",border:"none",cursor:"pointer",opacity:kanFramåt?1:0.3,padding:4 }}>
            <span className="material-symbols-outlined" style={{ color:"#0a84ff" }}>chevron_right</span>
          </button>
        </header>

        <main style={{ flex:1,padding:"0 16px 128px",overflowY:"auto" }}>

          {/* Extra-tid summa för månaden */}
          {(() => {
            const månExtraMin = Object.entries(extraDagData)
              .filter(([d])=>d.startsWith(`${kalÅr}-${String(kalMånad+1).padStart(2,'0')}`))
              .reduce((a,[,arr])=>a + arr.reduce((s:number,e:any)=>s+(e.minuter||0),0), 0);
            return månExtraMin > 0 ? (
              <p style={{ margin:"8px 4px 0",fontSize:12,color:"#30d158",fontWeight:600 }}>+ {Math.round(månExtraMin/60*10)/10}h extra (utöver maskin)</p>
            ) : null;
          })()}

          {/* Summary card — hjälte: månadens berättelse (jobbat mot mål) överst,
              resten som lugna stödrader. Målet ingår i hjälten ("av X tim"). */}
          <section style={{ marginTop:16,marginBottom:32 }}>
            <div style={{ background:"#1c1c1e",borderRadius:12,padding:24 }}>
              <div style={{ textAlign:"center" }}>
                <p style={{ margin:"0 0 8px",...TYPE.meta,color:"#8e8e93" }}>Jobbat i {kalMånadNamn}</p>
                <p style={{ margin:0,...TYPE.bigNum,color:"#fff",...TNUM }}>
                  {String(jobbadH).replace('.',',')}
                  <span style={{ ...TYPE.meta,color:"#8e8e93",marginLeft:6,...TNUM }}>av {målH} tim</span>
                </p>
                {/* Progress mot månadsmålet — grön oavsett andel (läge, inte larm), klampad till 100% */}
                <div style={{ height:5,borderRadius:3,background:"rgba(255,255,255,0.08)",marginTop:14,overflow:"hidden" }}>
                  <div style={{ height:"100%",borderRadius:3,background:"#30d158",width:`${Math.min(100, målH > 0 ? (jobbadH / målH) * 100 : 0)}%`,minWidth:jobbadH > 0 ? 6 : 0 }}/>
                </div>
              </div>
              <div style={{ borderTop:"1px solid rgba(255,255,255,0.08)",marginTop:18,paddingTop:8 }}>
                {[
                  ["Arbetsdagar",`${arbetsdagar}`],
                  ["Körning",`${totalKm.toLocaleString('sv-SE')} km`],
                  ["Km med ersättning",`${ersKm.toLocaleString('sv-SE')} km`],
                ].map(([label,val])=>(
                  <div key={label as string} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0" }}>
                    <span style={{ ...TYPE.meta,color:"#8e8e93" }}>{label}</span>
                    <span style={{ ...TYPE.bodyList,color:"#fff",...TNUM }}>{val}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Calendar grid */}
          <section style={{ marginBottom:40 }}>
            {/* Weekday headers */}
            <div style={{ display:"grid",gridTemplateColumns:"repeat(7,1fr)",textAlign:"center",marginBottom:16 }}>
              {veckar.map(v=>(
                <div key={v} style={{ color:"#8e8e93",fontSize:12,fontWeight:600 }}>{v}</div>
              ))}
            </div>

            {/* Day cells */}
            <div style={{ display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:"24px 0",textAlign:"center" }}>
              {cells.map((d,i)=>{
                if(!d) return <div key={i} style={{ padding:"8px 0",opacity:0.2 }}>{(() => {
                  // Show prev/next month days faded
                  if(i < startDag) {
                    const prevMonth = new Date(kalÅr, kalMånad, 0);
                    return prevMonth.getDate() - (startDag - 1 - i);
                  }
                  return '';
                })()}</div>;

                const s=statusFärg(d);
                const isToday=d===nuDat.getDate()&&kalMånad===nuDat.getMonth()&&kalÅr===nuDat.getFullYear();
                const k=dagKey(d);
                const datum=`${kalÅr}-${String(kalMånad+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
                const erRedigerad=!!redDagar[datum]&&typeof redDagar[datum]==="object";
                const helgNamn = rödaDagar[k] || '';
                const harExtra = (extraDagData[datum]||[]).length > 0;

                return (
                  <div key={i}
                    onClick={()=>{
                      // Alla dagar är klickbara. Om extra-tid finns: visa tidslinje,
                      // annars öppna dagvy (redigera). Tom data → tom dagvy med
                      // "Lägg till manuellt"-fallback.
                      if(harExtra) {
                        setTidslinjeDatum(datum);
                        setSteg("tidslinje");
                        return;
                      }
                      const d2=dagData[k];
                      setRedDag({...(d2||{}),datum});
                      setRedStart(d2?.start_tid||"00:00");
                      setRedSlut(d2?.slut_tid||"00:00");
                      setRedRast(d2?.rast_min||0);
                      setRedKm(d2?.km_totalt||0);
                      setRedKmBerakning(null);
                      setRedAnl("");
                      setRedObjektId(d2?.objekt_id||null);
                      setRedMaskinId(d2?.maskin_id||null);
                      setRedVy("översikt");
                      setSteg("redigera");
                    }}
                    style={{ position:"relative",display:"flex",flexDirection:"column",alignItems:"center",cursor:"pointer",padding:"8px 0" }}>
                    {/* Ring: idag=blå, redigerad=gul, idag har prioritet */}
                    {isToday && <div style={{ position:"absolute",top:4,width:36,height:36,border:"2px solid #0a84ff",borderRadius:"50%" }} />}
                    {erRedigerad && !isToday && <div style={{ position:"absolute",top:4,width:36,height:36,border:"2px solid #ffd60a",borderRadius:"50%" }} />}
                    <span style={{
                      fontSize:15,
                      fontWeight: isToday ? 700 : 500,
                      color: s==="röd" ? "#ff453a" : "#fff",
                      position:"relative",zIndex:1,
                      lineHeight:"36px",
                    }}>{d}</span>
                    {/* Helgdag namn */}
                    {helgNamn && <span style={{ fontSize:8,color:s==="röd"?"#ff453a":"#8e8e93",marginTop:1,lineHeight:1.2,maxWidth:44,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{helgNamn}</span>}
                    {/* Status dot: bekräftad=grön, saknas=orange, + blå punkt för extra tid.
                        Visas även på helgdagar — helgtexten döljer inte pricken. */}
                    {(dotFärg[s]||harExtra)?(
                      <div style={{ display:"flex",gap:3,marginTop:4 }}>
                        {dotFärg[s]&&(
                          <div style={{ width:4,height:4,borderRadius:"50%",background:dotFärg[s] }}/>
                        )}
                        {harExtra&&(
                          <div style={{ width:4,height:4,borderRadius:"50%",background:extraPrickFärg }}/>
                        )}
                      </div>
                    ):null}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Legend */}
          <section style={{ marginTop:32,paddingTop:32,borderTop:"1px solid rgba(255,255,255,0.05)" }}>
            <h3 style={{ ...secHead,marginBottom:24 }}>Statusförklaring</h3>
            <div style={{ display:"flex",flexDirection:"column",gap:20 }}>
              <div style={{ display:"flex",alignItems:"center",gap:16 }}>
                <div style={{ width:12,height:12,borderRadius:"50%",background:"#30D158" }} />
                <span style={{ ...TYPE.meta,color:"#fff" }}>Bekräftad</span>
              </div>
              <div style={{ display:"flex",alignItems:"center",gap:16 }}>
                <div style={{ width:12,height:12,borderRadius:"50%",background:"#ff9f0a" }} />
                <span style={{ ...TYPE.meta,color:"#fff" }}>Obekräftad</span>
              </div>
              <div style={{ display:"flex",alignItems:"center",gap:16 }}>
                <div style={{ width:12,height:12,borderRadius:"50%",background:"#0A84FF" }} />
                <span style={{ ...TYPE.meta,color:"#fff" }}>Extra tid (klicka för tidslinje)</span>
              </div>
              <div style={{ display:"flex",alignItems:"center",gap:16 }}>
                <div style={{ width:20,height:20,border:"2px solid #ffd60a",borderRadius:"50%" }} />
                <span style={{ ...TYPE.meta,color:"#fff" }}>Redigerad</span>
              </div>
              <div style={{ display:"flex",alignItems:"center",gap:16 }}>
                <div style={{ width:20,height:20,border:"2px solid #0a84ff",borderRadius:"50%" }} />
                <span style={{ ...TYPE.meta,color:"#fff" }}>Idag</span>
              </div>
            </div>
          </section>
        </main>

        <BottomNavBar aktiv="kalender" onNav={s=>setSteg(s)} />
      </div>
    );
  }

  /* ─── MÅNADSSAMMANFATTNING ─── */
  /* ─── KLAR ─── */
  if(steg==="klar") return (
    <div style={shell}><style>{css}</style>{timerBanner}
      <div style={topBar}><p style={{ margin:0,...TYPE.meta,color:C.label }}>{datumStr}</p></div>
      <div style={mid}>
        <div style={{ animation:"scalePop 0.5s ease",marginBottom:32 }}><CheckCircle size={88}/></div>
        <h1 style={{ ...TYPE.largeTitle,margin:"0 0 10px",animation:"fadeUp 0.4s ease 0.15s both" }}>Tack, {förnamn}</h1>
        <p style={{ ...TYPE.meta,color:C.label,margin:0,animation:"fadeUp 0.4s ease 0.25s both" }}>Ha en bra kväll</p>
      </div>
      <div style={bottom}></div>
    </div>
  );

  return null;
}
