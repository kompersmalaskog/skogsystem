"use client";
import React, { useState, useEffect, useRef, useMemo, CSSProperties, ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { getRödaDagar } from "@/lib/roda-dagar";
import { formatObjektNamn } from "@/utils/formatObjektNamn";

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
  line:"rgba(255,255,255,0.08)", blue:"#0a84ff", green:"#34c759",
  red:"#ff453a", orange:"#ff9f0a", ink:"#fff",
  dark:"#000", darkCard:"rgba(255,255,255,0.08)", darkLabel:"rgba(255,255,255,0.4)",
};
const T = { fontFamily:"'Inter',-apple-system,'SF Pro Display',sans-serif", color:C.text };
const shell: CSSProperties  = { minHeight:"100vh", background:"#000", ...T, display:"flex", flexDirection:"column" as const, padding:"0 20px", boxSizing:"border-box" as const, width:"100%" };
const darkShell: CSSProperties = { ...shell };
const topBar: CSSProperties = { paddingTop:24, paddingBottom:12 };
const mid: CSSProperties    = { flex:1, display:"flex", flexDirection:"column" as const, justifyContent:"center", alignItems:"center", textAlign:"center" as const };
const bottom: CSSProperties = { paddingBottom:36, display:"flex", flexDirection:"column" as const, gap:10 };

const btn = {
  primary:   { width:"100%", height:56, padding:"0 24px", background:"#2a2a2a", color:"#fff", border:"none", borderRadius:14, fontSize:17, fontWeight:600, cursor:"pointer", fontFamily:"inherit" } as CSSProperties,
  green:     { width:"100%", height:56, padding:"0 24px", background:C.green, color:"#fff", border:"none", borderRadius:14, fontSize:17, fontWeight:600, cursor:"pointer", fontFamily:"inherit" } as CSSProperties,
  secondary: { width:"100%", height:44, padding:"0", background:"transparent", color:"#8e8e93", border:"none", borderRadius:0, fontSize:15, fontWeight:500, cursor:"pointer", fontFamily:"inherit" } as CSSProperties,
  ghost:     { width:"100%", padding:"14px 24px", background:"transparent", color:C.blue, border:`1.5px solid ${C.blue}`, borderRadius:14, fontSize:15, fontWeight:600, cursor:"pointer", fontFamily:"inherit" } as CSSProperties,
  danger:    { width:"100%", padding:"17px 24px", background:"transparent", color:C.red, border:`1.5px solid rgba(255,69,58,0.3)`, borderRadius:14, fontSize:17, fontWeight:600, cursor:"pointer", fontFamily:"inherit" } as CSSProperties,
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
type AktivitetTyp = 'rotben'|'reservdelar'|'markagare'|'service'|'mote'|'flytt'|'annat';
const AKTIVITETER: { typ: AktivitetTyp; label: string; icon: string; debDefault: boolean }[] = [
  { typ:'rotben',      label:'Kapa rotben',         icon:'content_cut',     debDefault:false },
  { typ:'reservdelar', label:'Hämta reservdelar',   icon:'build',           debDefault:false },
  { typ:'markagare',   label:'Markägarmöte',        icon:'handshake',       debDefault:true  },
  { typ:'service',     label:'Service',             icon:'engineering',     debDefault:false },
  { typ:'mote',        label:'Möte',                icon:'groups',          debDefault:false },
  { typ:'flytt',       label:'Flytt av maskin',     icon:'local_shipping',  debDefault:true  },
  { typ:'annat',       label:'Annat',               icon:'more_horiz',      debDefault:false },
];
/** Typer som visas i "Starta extra arbete"-vyn (morgon + kväll). */
const EXTRA_ARBETE_TYPER: AktivitetTyp[] = ['reservdelar','service','markagare','flytt','annat'];
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
  <button onClick={onClick} style={{ width:40,height:40,borderRadius:12,background:"rgba(255,255,255,0.1)",border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
    <svg width="9" height="16" viewBox="0 0 9 16" fill="none"><path d="M8 1L1 8L8 15" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
  </button>
);

const secHead: CSSProperties = { margin:"0 0 10px",fontSize:11,fontWeight:700,color:"#636366",textTransform:"uppercase",letterSpacing:"0.15em" };

function BottomNavBar({ aktiv, onNav }: { aktiv: string; onNav: (s: string) => void }) {
  return (
    <nav style={{ position:"fixed",bottom:0,left:0,width:"100%",zIndex:50,display:"flex",justifyContent:"space-around",alignItems:"center",padding:"12px 16px 24px",background:"rgba(31,31,31,0.7)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",borderRadius:"16px 16px 0 0",boxShadow:"0 -4px 20px rgba(0,0,0,0.5)" }}>
      {[
        {icon:"today",key:"morgon",label:"Dag"},
        {icon:"calendar_month",key:"kalender",label:"Kalender"},
        {icon:"bar_chart",key:"mintid",label:"Min tid"},
        {icon:"settings",key:"inst",label:"Inställningar"},
      ].map(n=>(
        <button key={n.key} onClick={()=>onNav(n.key)} style={{ display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",color:aktiv===n.key?"#adc6ff":"#8b90a0",background:"none",border:"none",cursor:"pointer",fontFamily:"'Inter',sans-serif",borderRadius:12,height:48,width:64,padding:0 }}>
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
        <span style={{ fontSize:15,color:C.label,fontWeight:600,marginLeft:6 }}>km</span>
      </div>
    </div>
  );
};

/* ─── EXTRA TID – EN SKÄRM ─────────────────────────────
   Allt samlat: debiterbar toggle + objekt + tid + beskrivning
──────────────────────────────────────────────────────── */
const ExtraTidSkärm = ({ initial, objekt, onSpara, onTaBort, onAvbryt, harBefintlig }) => {
  const [min,  setMin]  = useState(initial?.min  ?? 30);
  const [besk, setBesk] = useState(initial?.besk ?? "");
  const [deb,  setDeb]  = useState(initial?.deb  ?? false);
  const [obj,  setObj]  = useState(initial?.obj  ?? null);
  const [väljer, setVäljer] = useState(false);

  if(väljer) return (
    <div style={shell}>
      <style>{css}</style>
      <div style={topBar}>
        <div style={{ display:"flex",alignItems:"center",gap:14 }}>
          <BackBtn onClick={()=>setVäljer(false)}/>
          <h1 style={{ margin:0,fontSize:24,fontWeight:700 }}>Välj objekt</h1>
        </div>
      </div>
      <div style={{ flex:1,paddingTop:16 }}>
        {objekt.map(o=>(
          <Card key={o.id} onClick={()=>{setObj(o);setVäljer(false);}} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",background:obj?.id===o.id?"rgba(0,122,255,0.06)":"#1c1c1e",border:obj?.id===o.id?"1px solid rgba(0,122,255,0.2)":"1px solid rgba(255,255,255,0.06)" }}>
            <div>
              <p style={{ margin:0,fontSize:16,fontWeight:600 }}>{o.namn}</p>
              <p style={{ margin:"3px 0 0",fontSize:13,color:"#8e8e93" }}>{o.ägare}</p>
            </div>
            {obj?.id===o.id
              ? <div style={{ width:22,height:22,borderRadius:"50%",background:"#0a84ff",display:"flex",alignItems:"center",justifyContent:"center" }}><svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l3 3L9 1" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
              : <ChevronRight/>
            }
          </Card>
        ))}
      </div>
    </div>
  );

  return (
    <div style={{ minHeight:"100vh",background:"#000",color:"#e2e2e2",fontFamily:"'Inter',-apple-system,sans-serif",WebkitFontSmoothing:"antialiased" }}>
      <style>{css}</style>

      {/* Header */}
      <header style={{ position:"fixed",top:0,width:"100%",zIndex:50,background:"rgba(0,0,0,0.8)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 16px",height:64 }}>
        <div style={{ display:"flex",alignItems:"center",gap:16 }}>
          <button onClick={onAvbryt} style={{ background:"none",border:"none",cursor:"pointer",padding:4 }}>
            <span className="material-symbols-outlined" style={{ color:"#34c759",fontSize:24 }}>arrow_back</span>
          </button>
          <h1 style={{ margin:0,fontSize:18,fontWeight:700,color:"#fff",letterSpacing:"-0.02em" }}>Extra tid</h1>
        </div>
      </header>

      <main style={{ paddingTop:96,paddingBottom:32,padding:"96px 16px 32px",maxWidth:512,margin:"0 auto" }}>
        <div style={{ display:"flex",flexDirection:"column",gap:24 }}>

          {/* Tid-väljare — iOS-stil scroll-wheels */}
          <section style={{ background:"#1c1c1e",borderRadius:16,padding:"20px 16px",border:"1px solid rgba(255,255,255,0.06)" }}>
            <MinPicker value={min} onChange={setMin}/>
            <div style={{ marginTop:4,paddingTop:16,borderTop:"1px solid rgba(255,255,255,0.04)",textAlign:"center" }}>
              <p style={{ margin:0,fontSize:15,fontWeight:600,color:"#34c759" }}>Total tid: {fmt(min)}</p>
            </div>
          </section>

          {/* Beskrivning */}
          <section style={{ background:"#1c1c1e",borderRadius:16,padding:20,border:"1px solid rgba(255,255,255,0.06)" }}>
            <label style={{ ...secHead,display:"block",marginBottom:12 }}>Vad gjorde du?</label>
            <textarea
              placeholder="T.ex. hämtat reservdelar, träffat markägare..."
              value={besk}
              onChange={e=>setBesk(e.target.value)}
              rows={4}
              style={{ width:"100%",background:"#353535",border:"none",borderRadius:12,color:"#fff",padding:12,fontSize:15,outline:"none",fontFamily:"inherit",resize:"none",boxSizing:"border-box" }}
            />
          </section>

          {/* Debiterbar */}
          <section style={{ background:"#1c1c1e",borderRadius:16,padding:20,border:"1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between" }}>
              <span style={{ fontSize:17,fontWeight:500,color:"#fff" }}>Debiterbar</span>
              <div onClick={()=>{setDeb(v=>!v); if(deb)setObj(null);}}
                style={{ width:51,height:31,borderRadius:16,background:deb?"#34c759":"rgba(120,120,128,0.3)",cursor:"pointer",position:"relative",transition:"background 0.2s" }}>
                <div style={{ width:27,height:27,borderRadius:"50%",background:"#fff",position:"absolute",top:2,left:deb?22:2,transition:"left 0.2s",boxShadow:"0 2px 4px rgba(0,0,0,0.3)" }}/>
              </div>
            </div>
            <p style={{ margin:"8px 0 0",fontSize:14,color:"#8e8e93" }}>Faktureras kunden</p>

            {/* Objekt — visas om debiterbar */}
            {deb && (
              <div onClick={()=>setVäljer(true)} style={{ marginTop:16,paddingTop:16,borderTop:"1px solid rgba(255,255,255,0.06)",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer" }}>
                <div>
                  <p style={{ margin:0,fontSize:16,fontWeight:500 }}>Objekt</p>
                  <p style={{ margin:"2px 0 0",fontSize:13,color:obj?"#0a84ff":"#8e8e93" }}>{obj?obj.namn:"Välj objekt"}</p>
                </div>
                <ChevronRight/>
              </div>
            )}
          </section>

          {/* Knappar */}
          <div style={{ display:"flex",flexDirection:"column",gap:16,paddingTop:16 }}>
            <button
              style={{ width:"100%",height:56,background:"#2a2a2a",color:"#fff",border:"1px solid rgba(255,255,255,0.05)",borderRadius:14,fontSize:16,fontWeight:600,cursor:"pointer",fontFamily:"inherit",opacity:besk&&(!deb||obj)?1:0.35 }}
              disabled={!besk||(!(!deb||obj))}
              onClick={()=>onSpara({min,besk,deb,obj})}
            >
              Spara
            </button>
            {harBefintlig && <button onClick={onTaBort} style={{ width:"100%",padding:"12px 0",background:"none",border:"none",color:"#ff453a",fontSize:15,fontWeight:500,cursor:"pointer",fontFamily:"inherit" }}>Ta bort extra tid</button>}
            <button onClick={onAvbryt} style={{ width:"100%",padding:"8px 0",background:"none",border:"none",color:"#8e8e93",fontSize:15,fontWeight:500,cursor:"pointer",fontFamily:"inherit" }}>
              Avbryt
            </button>
          </div>
        </div>
      </main>

      {/* Fade gradient */}
      <div style={{ position:"fixed",bottom:0,width:"100%",height:96,background:"linear-gradient(to top,#000,transparent)",pointerEvents:"none" }} />
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
  const [start, setStart]  = useState("06:12");
  const [slut,  setSlut]   = useState("16:45");
  const [rast,  setRast]   = useState(30);
  const [ändring,setÄ]     = useState(null);
  const [betald,setBetald] = useState(0);
  const [trak,  setTrak]   = useState<{summa:number}|null>(null);
  const [trakÖppen, setTrakÖppen] = useState(false);
  const [dagTyp,setDagTyp] = useState("normal");
  const [avTyp,  setAvTyp]  = useState(null);
  const [avBesk, setAvBesk] = useState("");
  const [avDeb,  setAvDeb]  = useState(false);
  const [avObj,  setAvObj]  = useState(null);
  const [avVäljer, setAvVäljer] = useState(false);
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
  const [redRast,  setRedRast]  = useState(30);
  const [redKm,    setRedKm]    = useState(0);
  const [redKmBerakning, setRedKmBerakning] = useState<number|null>(null);
  const [redKmChain, setRedKmChain] = useState<{fromLabel:string;toLabel:string;km:number;source:string}[]|null>(null);
  const [redAnl,   setRedAnl]   = useState("");
  const [redVy,    setRedVy]    = useState("översikt");
  const [redDagar, setRedDagar] = useState<Record<string, {start:string;slut:string;rast:number;km:number;anl:string}>>({});
  const [lönSkickat, setLönSkickat] = useState(false);
  const [lönVy, setLönVy] = useState<'översikt'|'detaljer'>('översikt');
  const [sparatToast, setSparatToast] = useState(false);
  const [pamOpen, setPamOpen] = useState<null | 'obekraftad' | 'pagaende' | 'dagligTid'>(null);
  const [pushEnhetsNamn, setPushEnhetsNamn] = useState<string | null>(null);
  const [visaÖvrigt, setVisaÖvrigt] = useState(false);
  const [efterStoppSheet, setEfterStoppSheet] = useState<any | null>(null);
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
  const [mStart,setMStart]=useState(()=>nuKlock5()),[mSlut,setMSlut]=useState(()=>nuKlock5()),[mRast,setMRast]=useState(30),[mBesk,setMBesk]=useState("");

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
  const [fortnoxSaldoStatus, setFortnoxSaldoStatus] = useState<'idle'|'loading'|'ok'|'error'>('idle');
  const [kmSummary, setKmSummary] = useState<{totalKm:number;ersattningsKm:number}|null>(null);
  const [maskinNamn, setMaskinNamn] = useState<string | null>(null);
  const [maskinNamnMap, setMaskinNamnMap] = useState<Record<string, string>>({});

  // Extra-aktiviteter — pågående + ny aktivitet
  const [pagaendeAktiviteter, setPagaendeAktiviteter] = useState<any[]>([]);
  const [valjAktivitet, setValjAktivitet] = useState<{kalla:'morgon'|'kvall'|'under_dagen'} | null>(null);
  const [valdAkt, setValdAkt] = useState<typeof AKTIVITETER[number] | null>(null);
  const [aktAnnatText, setAktAnnatText] = useState("");
  const [aktDeb, setAktDeb] = useState(false);
  const [aktObjekt, setAktObjekt] = useState<any>(null);
  const [aktVisaObjekt, setAktVisaObjekt] = useState(false);
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
      supabase.from("dim_objekt").select("objekt_id, object_name, vo_nummer, skogsagare, huvudtyp, latitude, longitude").order("object_name"),
    ]).then(([med, avt, obj]) => {
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
        supabase.from("atk_val").select("*").eq("medarbetare_id", med.data.id).eq("period", String(new Date().getFullYear())).single()
          .then(res => { if(res.data) setAtkValSparat(res.data); });
        // Fetch extra_tid for löneunderlag + pågående
        supabase.from("extra_tid").select("*").eq("medarbetare_id", med.data.id).order("datum",{ascending:false}).limit(200)
          .then(res => {
            if(res.data) {
              setExtraTidData(res.data);
              const idagStr = new Date().toISOString().split("T")[0];
              setPagaendeAktiviteter(res.data.filter((e:any) => e.start_tid && !e.slut_tid && e.datum === idagStr));
            }
          });
      }
      if(avt.data) setGsAvtal(avt.data);
      if(obj.data) setObjektLista(obj.data.map(o => {
        // object_name är ibland en autogenererad timestamp-sträng (yymmddHHMMSS).
        // Faller då tillbaka till "Skogsägare · Huvudtyp" så föraren ser ett vettigt namn.
        const n = (o.object_name || '').trim();
        const raw = n && !/^\d{10,}$/.test(n)
          ? n
          : ([o.skogsagare, o.huvudtyp].filter(Boolean).join(' · ') || o.objekt_id);
        return { id:o.objekt_id, namn:formatObjektNamn(raw), ägare:o.skogsagare||'', lat:o.latitude, lng:o.longitude };
      }));
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

  // Lazy-hämta semester- och ATK-saldo från Fortnox när Saldon-fliken öppnas
  useEffect(() => {
    if (minTidFlik !== 'saldon') return;
    if (!medarbetare?.id) return;
    if (fortnoxSaldoStatus === 'loading' || fortnoxSaldoStatus === 'ok') return;
    setFortnoxSaldoStatus('loading');
    fetch(`/api/fortnox/employee-details?medarbetare_id=${encodeURIComponent(medarbetare.id)}`)
      .then(r => r.json())
      .then(json => {
        if (json?.ok) {
          setFortnoxSaldo({ semester: json.semester, atk: json.atk, lon: json.lon });
          setFortnoxSaldoStatus('ok');
        } else {
          setFortnoxSaldoStatus('error');
        }
      })
      .catch(() => setFortnoxSaldoStatus('error'));
  }, [minTidFlik, medarbetare?.id]);

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
                await supabase.from('extra_tid').update({ slut_tid: startSec, minuter: min }).eq('id', o.id);
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
          const h = Math.floor((row.arbetad_min || 0) / 60);
          const m = (row.arbetad_min || 0) % 60;
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
    const interval = setInterval(poll, 60000);
    return () => clearInterval(interval);
  }, [medarbetare?.id, maskinNamnMap, objektLista]);

  // Hämta dagdata för kalendern när månad/år ändras
  useEffect(() => {
    if (!medarbetare) return;
    const förstadag = new Date(kalÅr, kalMånad, 1).toISOString().slice(0, 10);
    const sistadag = new Date(kalÅr, kalMånad + 1, 0).toISOString().slice(0, 10);
    supabase.from('arbetsdag')
      .select('*')
      .eq('medarbetare_id', medarbetare.id)
      .gte('datum', förstadag)
      .lte('datum', sistadag)
      .then(res => {
        if (res.data) {
          const map: Record<string, any> = {};
          for (const r of res.data) {
            map[r.datum] = {
              id: r.id,
              status: r.bekraftad ? 'ok' : 'saknas',
              arbMin: r.arbetad_min || 0,
              km: r.km_totalt || 0,
              km_morgon: r.km_morgon || 0,
              km_kvall: r.km_kvall || 0,
              km_totalt: r.km_totalt || 0,
              trak: !!r.traktamente,
              start_tid: r.start_tid || '06:00',
              slut_tid: r.slut_tid || '16:00',
              rast_min: r.rast_min || 30,
              start: r.start_tid || '06:00',
              slut: r.slut_tid || '16:00',
              rast: r.rast_min || 30,
              maskin_id: r.maskin_id,
              maskin_namn: maskinNamnMap[r.maskin_id] || r.maskin_id || null,
              objekt_id: r.objekt_id || null,
              objekt_namn: objektLista.find(o => o.id === r.objekt_id)?.namn || r.objekt_id || null,
              objekt_ägare: objektLista.find(o => o.id === r.objekt_id)?.ägare || null,
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
  }, [medarbetare, kalÅr, kalMånad, maskinNamnMap, objektLista]);

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

  // Vila-beräkningar för startsidan
  const vilaVarningar: {typ:'röd'|'orange';text:string}[] = [];
  const tidigastStart = (() => {
    // Kolla dygnsvila: senaste arbetsdag med slut_tid — exkludera idag
    // (annars räknas dagens nyss-avslutade pass som "sedan igår").
    const senaste = [...årsData].filter(r=>r.slut_tid && r.datum < idagKey).sort((a,b)=>b.datum.localeCompare(a.datum))[0];
    if(!senaste) return null;
    const slutDt = new Date(`${senaste.datum}T${senaste.slut_tid.slice(0,5)}`);
    const nuDt = new Date();
    const vilaTim = (nuDt.getTime()-slutDt.getTime())/3600000;
    if(vilaTim<11) vilaVarningar.push({typ:'röd',text:`Du har bara vilat ${Math.round(vilaTim*10)/10}h sedan igår — dygnsviolan kräver 11h`});
    else if(vilaTim<12) vilaVarningar.push({typ:'orange',text:`Kort dygnsvila: ${Math.round(vilaTim*10)/10}h sedan igår`});
    // Beräkna tidigast start imorgon
    const tidigast = new Date(slutDt.getTime()+11*3600000);
    return `${String(tidigast.getHours()).padStart(2,'0')}:${String(tidigast.getMinutes()).padStart(2,'0')}`;
  })();
  // Veckovila: kolla senaste 7 dagarna
  (() => {
    const nu2 = new Date();
    const senaste7: boolean[] = [];
    for(let i=0;i<7;i++){
      const d=new Date(nu2); d.setDate(nu2.getDate()-i);
      const k=d.toISOString().split('T')[0];
      senaste7.push(!!årsData.find(r=>r.datum===k&&r.start_tid));
    }
    let maxLedigt=0,led=0;
    for(const jobbat of senaste7){
      if(!jobbat) led++; else led=0;
      maxLedigt=Math.max(maxLedigt,led);
    }
    if(maxLedigt<2) vilaVarningar.push({typ:'orange',text:'Du saknar veckovila — 36h krävs per 7 dagar'});
  })();

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

  // Loading fallback
  if(!medarbetare) return (
    <div style={shell}>
      <style>{css}</style>
      <div style={{ flex:1,display:"flex",alignItems:"center",justifyContent:"center" }}>
        <p style={{ fontSize:17,color:C.label }}>Laddar...</p>
      </div>
    </div>
  );

  if(steg==="extraTid") return (
    <ExtraTidSkärm
      initial={extra[0]||null}
      objekt={objektLista}
      harBefintlig={extra.length>0}
      onSpara={async e=>{
        setExtra([e]);
        await supabase.from("extra_tid").insert({
          medarbetare_id: medarbetare.id,
          datum: new Date().toISOString().split("T")[0],
          minuter: e.min, debiterbar: e.deb,
          objekt_id: e.obj?.id ?? null,
          kommentar: e.besk,
        });
        setSteg("morgon");
      }}
      onTaBort={()=>{setExtra([]);setSteg("morgon");}}
      onAvbryt={()=>setSteg("morgon")}
    />
  );

  /* ─── VÄLJ AKTIVITET — stora kort ─── */
  const startaAktivitet = async (akt: typeof AKTIVITETER[number]) => {
    if(akt.typ === 'annat') {
      // För "annat" → visa val-vyn med textfält
      setValdAkt(akt);
      setAktAnnatText("");
      setAktDeb(akt.debDefault);
      setAktObjekt(dagensObjekt ? objektLista.find(o=>o.id===dagensObjekt) : null);
      setSteg("bekraftaAktivitet");
      return;
    }
    // Direkt-start för övriga (ett klick)
    const startTid = nuKlock();
    const datum = new Date().toISOString().split("T")[0];
    const objId = dagensObjekt || valtObjektId || dagData[datum]?.objekt_id || null;
    const { data } = await supabase.from("extra_tid").insert({
      medarbetare_id: medarbetare.id,
      datum,
      start_tid: startTid + ":00",
      slut_tid: null,
      minuter: 0,
      aktivitet_typ: akt.typ,
      aktivitet_text: null,
      objekt_id: objId,
      debiterbar: akt.debDefault,
      kalla: valjAktivitet?.kalla || 'under_dagen',
      kommentar: akt.label,
    }).select().single();
    if(data) {
      setPagaendeAktiviteter(p => [...p, data]);
      setExtraTidData(d => [data, ...d]);
    }
    setValjAktivitet(null);
    setSteg(valjAktivitet?.kalla === 'kvall' ? "kväll" : "morgon");
  };

  if(steg==="valjAktivitet") return (
    <div style={shell}>
      <style>{css}</style>
      <div style={topBar}>
        <div style={{ display:"flex",alignItems:"center",gap:14 }}>
          <BackBtn onClick={()=>{setValjAktivitet(null);setSteg(valjAktivitet?.kalla==='kvall'?"kväll":"morgon");}}/>
          <div>
            <h1 style={{ margin:0,fontSize:24,fontWeight:700 }}>Vad gör du?</h1>
            <p style={{ margin:"3px 0 0",fontSize:13,color:C.label }}>Starttid sätts till nu ({nuKlock()})</p>
          </div>
        </div>
      </div>
      <div style={{ flex:1,paddingTop:16,overflowY:"auto",paddingBottom:32 }}>
        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
          {AKTIVITETER.map(a=>(
            <button key={a.typ}
              onClick={()=>startaAktivitet(a)}
              style={{
                aspectRatio:"1/1",
                background:"#1c1c1e",
                border:"1px solid rgba(255,255,255,0.06)",
                borderRadius:16,
                display:"flex",
                flexDirection:"column",
                alignItems:"center",
                justifyContent:"center",
                gap:12,
                cursor:"pointer",
                fontFamily:"inherit",
                padding:16,
              }}>
              <span className="material-symbols-outlined" style={{ fontSize:40,color:"#adc6ff" }}>{a.icon}</span>
              <span style={{ fontSize:15,fontWeight:600,color:"#fff",textAlign:"center",lineHeight:1.2 }}>{a.label}</span>
              {a.debDefault&&<span style={{ fontSize:10,color:C.green,fontWeight:600 }}>DEBITERBAR</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  /* ─── BEKRÄFTA AKTIVITET (för "Annat" eller manuell ändring) ─── */
  if(steg==="bekraftaAktivitet" && valdAkt) {
    if(aktVisaObjekt) return (
      <div style={shell}><style>{css}</style>
        <div style={topBar}><div style={{ display:"flex",alignItems:"center",gap:14 }}><BackBtn onClick={()=>setAktVisaObjekt(false)}/><h1 style={{ margin:0,fontSize:24,fontWeight:700 }}>Välj objekt</h1></div></div>
        <div style={{ flex:1,paddingTop:16,overflowY:"auto" }}>
          {objektLista.map(o=>(
            <Card key={o.id} onClick={()=>{setAktObjekt(o);setAktVisaObjekt(false);}} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",background:aktObjekt?.id===o.id?"rgba(0,122,255,0.06)":"#1c1c1e" }}>
              <div><p style={{ margin:0,fontSize:16,fontWeight:600 }}>{o.namn}</p><p style={{ margin:"3px 0 0",fontSize:13,color:C.label }}>{o.ägare}</p></div>
              {aktObjekt?.id===o.id&&<div style={{ width:22,height:22,borderRadius:"50%",background:C.blue,display:"flex",alignItems:"center",justifyContent:"center" }}><svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l3 3L9 1" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg></div>}
            </Card>
          ))}
        </div>
      </div>
    );
    const klart = valdAkt.typ !== 'annat' || aktAnnatText.trim().length > 0;
    return (
      <div style={shell}>
        <style>{css}</style>
        <div style={topBar}>
          <div style={{ display:"flex",alignItems:"center",gap:14 }}>
            <BackBtn onClick={()=>{setValdAkt(null);setSteg("valjAktivitet");}}/>
            <div>
              <h1 style={{ margin:0,fontSize:24,fontWeight:700 }}>{valdAkt.label}</h1>
              <p style={{ margin:"3px 0 0",fontSize:13,color:C.label }}>Starttid: {nuKlock()}</p>
            </div>
          </div>
        </div>
        <div style={{ flex:1,overflowY:"auto",paddingTop:16,paddingBottom:120 }}>
          {valdAkt.typ === 'annat' && (
            <div style={{ marginBottom:20 }}>
              <Label>Beskriv vad du gör</Label>
              <input
                placeholder="T.ex. röjde sten på vägen"
                value={aktAnnatText}
                onChange={e=>setAktAnnatText(e.target.value)}
                style={{ width:"100%",padding:"15px 16px",fontSize:16,border:"none",borderRadius:12,background:"#1c1c1e",outline:"none",fontFamily:"inherit",color:"#fff",boxSizing:"border-box" }}
                autoFocus
              />
            </div>
          )}
          <Card style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
            <div>
              <p style={{ margin:0,fontSize:16,fontWeight:600 }}>Debiterbar</p>
              <p style={{ margin:"2px 0 0",fontSize:13,color:C.label }}>Faktureras kunden</p>
            </div>
            <div onClick={()=>{setAktDeb(v=>!v); if(aktDeb) setAktObjekt(null);}}
              style={{ width:51,height:31,borderRadius:16,background:aktDeb?C.green:"rgba(120,120,128,0.2)",cursor:"pointer",position:"relative",transition:"background 0.2s" }}>
              <div style={{ width:27,height:27,borderRadius:"50%",background:"#fff",position:"absolute",top:2,left:aktDeb?22:2,transition:"left 0.2s",boxShadow:"0 2px 4px rgba(0,0,0,0.2)" }}/>
            </div>
          </Card>
          {aktDeb && (
            <Card onClick={()=>setAktVisaObjekt(true)} style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
              <div>
                <p style={{ margin:0,fontSize:16,fontWeight:600 }}>Objekt</p>
                <p style={{ margin:"2px 0 0",fontSize:13,color:aktObjekt?C.blue:C.label }}>{aktObjekt?aktObjekt.namn:"Välj objekt"}</p>
              </div>
              <ChevronRight/>
            </Card>
          )}
        </div>
        <div style={bottom}>
          <button
            style={{ ...btn.primary,opacity:klart?1:0.35 }}
            disabled={!klart}
            onClick={async ()=>{
              const startTid = nuKlock();
              const datum = new Date().toISOString().split("T")[0];
              const objId = aktDeb ? (aktObjekt?.id || null) : (dagensObjekt || valtObjektId || dagData[datum]?.objekt_id || null);
              const { data } = await supabase.from("extra_tid").insert({
                medarbetare_id: medarbetare.id,
                datum,
                start_tid: startTid + ":00",
                slut_tid: null,
                minuter: 0,
                aktivitet_typ: valdAkt.typ,
                aktivitet_text: valdAkt.typ === 'annat' ? aktAnnatText : null,
                objekt_id: objId,
                debiterbar: aktDeb,
                kalla: valjAktivitet?.kalla || 'under_dagen',
                kommentar: valdAkt.typ === 'annat' ? aktAnnatText : valdAkt.label,
              }).select().single();
              if(data) {
                setPagaendeAktiviteter(p => [...p, data]);
                setExtraTidData(d => [data, ...d]);
              }
              const kalla = valjAktivitet?.kalla;
              setValdAkt(null); setAktObjekt(null); setAktDeb(false); setAktAnnatText(""); setValjAktivitet(null);
              setSteg(kalla==='kvall'?"kväll":"morgon");
            }}
          >Starta</button>
          <button style={btn.textBack} onClick={()=>{setValdAkt(null);setSteg("valjAktivitet");}}>Avbryt</button>
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
        <style>{css}</style>
        <div style={topBar}>
          <div style={{ display:"flex",alignItems:"center",gap:14 }}>
            <BackBtn onClick={()=>{setTidslinjeDatum(null);setSteg("kalender");}}/>
            <div>
              <p style={{ margin:0,fontSize:13,color:C.label,textTransform:"capitalize" }}>{datLabel}</p>
              <h1 style={{ margin:"4px 0 0",fontSize:24,fontWeight:700 }}>Tidslinje</h1>
            </div>
          </div>
        </div>
        <div style={{ flex:1,overflowY:"auto",paddingTop:16,paddingBottom:32 }}>
          {/* Summering */}
          <Card style={{ padding:"16px 20px" }}>
            <div style={{ display:"flex",justifyContent:"space-between",marginBottom:8 }}>
              <span style={{ fontSize:14,color:C.label }}>Maskin</span>
              <span style={{ fontSize:14,fontWeight:600 }}>{fmt(totMaskin)}</span>
            </div>
            {totExtra>0&&(
              <div style={{ display:"flex",justifyContent:"space-between" }}>
                <span style={{ fontSize:14,color:C.label }}>Extra tid</span>
                <span style={{ fontSize:14,fontWeight:600,color:C.orange }}>+ {fmt(totExtra)}</span>
              </div>
            )}
          </Card>
          {/* Lista händelser */}
          <div style={{ marginTop:16 }}>
            {händelser.length===0?(
              <Card><p style={{ margin:0,fontSize:14,color:C.label,textAlign:"center" }}>Inga händelser denna dag</p></Card>
            ):händelser.map((h,i)=>(
              <Card key={i} style={{ display:"flex",alignItems:"flex-start",gap:14 }}>
                <div style={{ minWidth:90,fontSize:14,color:C.label,fontWeight:500,fontVariantNumeric:"tabular-nums" }}>
                  {h.start}–{h.slut}
                </div>
                <div style={{ flex:1 }}>
                  <p style={{ margin:0,fontSize:15,fontWeight:600,color:h.typ==='maskin'?'#fff':C.orange }}>{h.label}</p>
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
      <style>{css}</style>

      {/* Top bar */}
      <header style={{ position:"fixed",top:0,width:"100%",height:64,background:"rgba(0,0,0,0.8)",backdropFilter:"blur(12px)",WebkitBackdropFilter:"blur(12px)",zIndex:50,display:"flex",justifyContent:"space-between",alignItems:"center",padding:"0 24px",boxSizing:"border-box" }}>
        <span style={{ fontSize:13,fontWeight:500,letterSpacing:"0.1em",color:"#adc6ff" }}>{datumStr.toUpperCase()}</span>
        <span className="material-symbols-outlined" style={{ color:"#adc6ff",fontSize:22 }}>sync</span>
      </header>

      <main style={{ paddingTop:96,paddingBottom:128,paddingLeft:24,paddingRight:24,flex:1,width:"100%",boxSizing:"border-box" }}>

        {/* Påminnelse obekräftad dag */}
        {igårObekräftad&&(
          <div onClick={()=>{
            const d=dagData[igårKey];
            setStart(d.start_tid||"06:00");setSlut(d.slut_tid||"16:00");setRast(d.rast_min||30);
            setSteg("morgon");
          }} style={{ background:"rgba(255,159,10,0.06)",border:"1px solid rgba(255,159,10,0.25)",borderRadius:12,padding:"14px 16px",marginBottom:16,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between",animation:"fadeUp 0.3s ease" }}>
            <div style={{ display:"flex",alignItems:"center",gap:10 }}>
              <span className="material-symbols-outlined" style={{ color:"#ff9f0a",fontSize:20 }}>warning</span>
              <span style={{ fontSize:14,fontWeight:600,color:"#fff" }}>Du glömde bekräfta gårdagen</span>
            </div>
            <span className="material-symbols-outlined" style={{ color:"#8e8e93",fontSize:18 }}>chevron_right</span>
          </div>
        )}

        {/* Vila-varningar */}
        {vilaVarningar.map((v,i)=>(
          <div key={i} style={{ background:v.typ==='röd'?"rgba(255,69,58,0.08)":"rgba(255,159,10,0.08)",border:`1px solid ${v.typ==='röd'?"rgba(255,69,58,0.25)":"rgba(255,159,10,0.25)"}`,borderRadius:12,padding:"14px 16px",marginBottom:12,display:"flex",alignItems:"center",gap:10 }}>
            <span className="material-symbols-outlined" style={{ color:v.typ==='röd'?"#ff453a":"#ff9f0a",fontSize:20 }}>warning</span>
            <span style={{ fontSize:14,fontWeight:500,color:"#fff" }}>{v.text}</span>
          </div>
        ))}

        {/* Timer-varningar: 3h-påminnelse (orange) och 12h-varning (röd) */}
        {pagaendeAktiviteter.map(p => {
          const sek = sekDiff(p.start_tid);
          if (sek > 12*3600) return (
            <div key={`varn-${p.id}`} style={{ background:"rgba(255,69,58,0.1)",border:"1px solid rgba(255,69,58,0.35)",borderRadius:12,padding:"14px 16px",marginBottom:10,display:"flex",alignItems:"center",gap:10 }}>
              <span className="material-symbols-outlined" style={{ color:"#ff453a",fontSize:22 }}>warning</span>
              <div style={{ flex:1,minWidth:0 }}>
                <p style={{ margin:0,fontSize:14,fontWeight:700,color:"#fff" }}>Timer igång sedan igår</p>
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

        {/* Pågående extra-aktiviteter — stora kort med live-timer */}
        {pagaendeAktiviteter.map(p => (
          <div key={p.id} style={{ background:"rgba(255,69,58,0.08)",border:"1px solid rgba(255,69,58,0.25)",borderRadius:16,padding:"20px 20px 18px",marginBottom:14,animation:"fadeUp 0.3s ease" }}>
            <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:16 }}>
              <div style={{ width:10,height:10,borderRadius:"50%",background:"#ff453a",boxShadow:"0 0 8px #ff453a",animation:"pulseDot 2s infinite" }} />
              <span style={{ fontSize:16,fontWeight:700,color:"#fff" }}>Pågående: {p.aktivitet_text || aktLabel(p.aktivitet_typ)}</span>
            </div>
            <p style={{ margin:"0 0 4px",fontSize:14,color:C.label }}>Startad {(p.start_tid||'').slice(0,5)}</p>
            <p style={{ margin:"0 0 16px",fontSize:32,fontWeight:700,color:"#fff",fontVariantNumeric:"tabular-nums",letterSpacing:"-0.01em" }}>⏱ {fmtHMS(sekDiff(p.start_tid))}</p>
            <button onClick={async ()=>{
              // Stoppa direkt: sätt slut_tid + minuter, ta bort från pågående, öppna detalj-sheet
              const nuT = nuKlock() + ":00";
              const min = minutDiff(p.start_tid, nuT);
              const { data } = await supabase.from("extra_tid").update({ slut_tid: nuT, minuter: min }).eq("id", p.id).select().single();
              const uppdaterad = data || { ...p, slut_tid: nuT, minuter: min };
              setPagaendeAktiviteter(arr => arr.filter(x => x.id !== p.id));
              setExtraTidData(arr => arr.map(x => x.id === p.id ? uppdaterad : x));
              if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(120);
              // Förifyll detalj-sheet med befintliga värden (om några) + öppna det
              setKvAvTyp(uppdaterad.aktivitet_typ || null);
              setKvAvObj(uppdaterad.objekt_id ? objektLista.find(o => o.id === uppdaterad.objekt_id) || null : null);
              setKvAvDeb(!!uppdaterad.debiterbar);
              setKvAvBesk(uppdaterad.kommentar || "");
              setEfterStoppSheet(uppdaterad);
            }}
              style={{ width:"100%",padding:"16px",background:"#ff453a",border:"none",borderRadius:12,color:"#fff",fontSize:16,fontWeight:700,cursor:"pointer",fontFamily:"inherit" }}>
              Stoppa
            </button>
          </div>
        ))}

        {/* Starta extra tid — visas när ingen timer pågår och dagen ej bekräftats.
            Även före arbetsdag (ingen MOM-start) — föraren kan starta redan kl 06. */}
        {!dagData[idagKey]?.slut_tid && !dagData[idagKey]?.bekraftad && pagaendeAktiviteter.length===0 && (
          <button onClick={async ()=>{
            const startTid = nuKlock();
            const { data } = await supabase.from("extra_tid").insert({
              medarbetare_id: medarbetare.id,
              datum: idagKey,
              start_tid: startTid + ":00",
              slut_tid: null,
              minuter: 0,
              kalla: 'morgon',
            }).select().single();
            if (data) {
              setPagaendeAktiviteter(p => [...p, data]);
              setExtraTidData(d => [data, ...d]);
            }
            if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(80);
          }}
            style={{ display:"flex",alignItems:"center",justifyContent:"center",gap:6,marginBottom:16,marginLeft:"auto",padding:"10px 16px",background:"#0a84ff",border:"none",borderRadius:10,color:"#fff",fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"inherit" }}>
            <span className="material-symbols-outlined" style={{ fontSize:18 }}>play_arrow</span>
            Starta extra tid
          </button>
        )}

        {/* Hero */}
        <section style={{ marginBottom:40,animation:"fadeUp 0.5s ease both" }}>
          <h1 style={{ fontSize:32,fontWeight:700,letterSpacing:"-0.02em",color:"#fff",margin:"0 0 4px" }}>{hälsning()}, {förnamn}</h1>
          <p style={{ margin:0,fontSize:15,color:"#8e8e93" }}>{datumStr}</p>
        </section>

        {/* Shift Status Card — döljs efter bekräftning och när pass redan avslutats
            (då finns sammanfattningen i stället). */}
        {!dagData[idagKey]?.bekraftad && !dagData[idagKey]?.slut_tid && (
        <section style={{ background:isWorking?"#1c1c1e":"rgba(255,255,255,0.04)",borderRadius:16,padding:"20px 24px",marginBottom:32,position:"relative",overflow:"hidden",animation:"fadeUp 0.5s ease 0.05s both",border:isWorking?"1px solid rgba(255,255,255,0.06)":"1px solid rgba(255,255,255,0.05)" }}>
          <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:isWorking?12:4 }}>
            {isWorking
              ? <div style={{ width:8,height:8,borderRadius:"50%",background:"#adc6ff",boxShadow:"0 0 8px #adc6ff",flexShrink:0,animation:"pulseDot 2s infinite" }} />
              : <span style={{ fontSize:18,lineHeight:1 }}>⏳</span>
            }
            <h2 style={{ margin:0,color:"#fff",fontWeight:600,fontSize:17 }}>
              {isWorking ? `Pågående sedan ${dagData[idagKey]?.start_tid?.slice(0,5) || '—'}` : 'Väntar på maskin'}
            </h2>
          </div>
          <p style={{ fontSize:13,color:"rgba(255,255,255,0.5)",margin:isWorking?"0 0 16px":"0 0 14px",lineHeight:1.5 }}>
            {isWorking ? 'Avslutas automatiskt vid utloggning från maskinen' : 'Startar automatiskt vid inloggning'}
          </p>
          {isWorking && ((maskinNamn || medarbetare?.maskin_id) || (dagData[idagKey]?.objekt_id)) && (
            <div style={{ display:"flex",flexDirection:"column",gap:4,marginBottom:16,paddingBottom:16,borderBottom:"1px solid rgba(255,255,255,0.06)" }}>
              {(maskinNamn || medarbetare?.maskin_id) && (
                <div style={{ display:"flex",justifyContent:"space-between" }}>
                  <span style={{ fontSize:13,color:"rgba(255,255,255,0.5)" }}>Maskin</span>
                  <span style={{ fontSize:14,color:"#fff",fontWeight:500 }}>{maskinNamn || medarbetare?.maskin_id}</span>
                </div>
              )}
              {dagData[idagKey]?.objekt_id && (
                <div style={{ display:"flex",justifyContent:"space-between" }}>
                  <span style={{ fontSize:13,color:"rgba(255,255,255,0.5)" }}>Objekt</span>
                  <span style={{ fontSize:14,color:"#fff",fontWeight:500 }}>{objektLista.find(o => o.id === dagData[idagKey]?.objekt_id)?.namn || dagData[idagKey]?.objekt_id}</span>
                </div>
              )}
            </div>
          )}
          <div>
            {isWorking ? (
              <button onClick={async ()=>{
                const nuT = nuKlock();
                setSlut(nuT);
                await supabase.from("arbetsdag").update({ slut_tid: nuT + ":00" }).eq("id", dagData[idagKey]?.id);
                setDagData(d => ({ ...d, [idagKey]: { ...d[idagKey], slut_tid: nuT + ":00" } }));
                if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(50);
              }} style={{ width:"100%",padding:"12px",borderRadius:10,border:"1px solid rgba(255,69,58,0.45)",background:"rgba(255,69,58,0.05)",color:"#ff453a",fontSize:15,fontWeight:600,cursor:"pointer",fontFamily:"inherit" }}>
                Avsluta pass
              </button>
            ) : pagaendeAktiviteter.length===0 ? (
              <button onClick={async ()=>{
                const nuT = nuKlock();
                if (!medarbetare?.id) { console.warn('[Starta manuellt] medarbetare saknas'); return; }
                setStart(nuT);
                const { data, error } = await supabase.from("arbetsdag").upsert({
                  medarbetare_id: medarbetare.id,
                  datum: idagKey,
                  start_tid: nuT + ":00",
                  maskin_id: medarbetare.maskin_id || null,
                  // arbetad_min är generated (slut_tid - start_tid - rast_min) — sätts ej manuellt
                }, { onConflict: 'medarbetare_id,datum' }).select().single();
                if (error) { console.error('[Starta manuellt] supabase-fel', error); return; }
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
                }
              }} style={{ width:"100%",padding:"12px",borderRadius:10,border:"1px solid rgba(255,255,255,0.25)",background:"transparent",color:"#fff",fontSize:15,fontWeight:600,cursor:"pointer",fontFamily:"inherit" }}>
                Starta manuellt
              </button>
            ) : <span />}
          </div>
        </section>
        )}

        {/* Dagssammanfattning + Bekräfta — när maskin-passet är avslutat */}
        {(()=>{
          const idagArb: any = dagData[idagKey];
          if (!idagArb?.slut_tid) return null;
          const redanBekräftad = !!idagArb?.bekraftad;
          const varBekräftad   = !!idagArb?.bekraftad_tid;
          const ändradSedan    = varBekräftad && !redanBekräftad;
          const bekräftadTidKort = idagArb?.bekraftad_tid
            ? new Date(idagArb.bekraftad_tid).toLocaleTimeString('sv-SE',{hour:'2-digit',minute:'2-digit'})
            : '';
          const dagNamnLång = ["Söndag","Måndag","Tisdag","Onsdag","Torsdag","Fredag","Lördag"][idag.getDay()];
          const månNamnLång = ["januari","februari","mars","april","maj","juni","juli","augusti","september","oktober","november","december"][idag.getMonth()];
          const datumRubrik = `${dagNamnLång} ${idag.getDate()} ${månNamnLång}`;
          const dagObjId = valtObjektId || idagArb?.objekt_id || null;
          const dagObjNamn = dagObjId ? (objektLista.find(o => o.id === dagObjId)?.namn || dagObjId) : '';
          const maskinNamnLång = maskinNamn || maskinNamnMap[medarbetare?.maskin_id] || medarbetare?.maskin_id || '';
          const helKr  = gsAvtal?.traktamente_hel_kr  ?? 300;
          const halvKr = gsAvtal?.traktamente_halv_kr ?? 150;
          const harKm = totKm > 0 || (kmBerakning != null && kmBerakning > 0);
          const harErsKr = ersKr > 0;
          const harKmBlock = harKm;
          const harObjBlock = !!(dagObjNamn || maskinNamnLång);
          const sammanRad = (label: string, value: string, onClick?: () => void) => (
            <div key={label} onClick={onClick}
              style={{ display:"flex",justifyContent:"space-between",padding:"6px 0",alignItems:"center",cursor:onClick?"pointer":"default" }}>
              <span style={{ color:"rgba(255,255,255,0.6)",fontSize:15 }}>{label}</span>
              <div style={{ display:"flex",alignItems:"center",gap:4 }}>
                <span style={{ color:"#fff",fontSize:15,fontWeight:600 }}>{value}</span>
                {onClick && <span className="material-symbols-outlined" style={{ fontSize:16,color:"rgba(255,255,255,0.25)" }}>chevron_right</span>}
              </div>
            </div>
          );
          const öppnaTider = () => { setTS(start); setTE(slut); setTR(rast); setVisaTiderSheet(true); };
          const öppnaKm    = () => { setTMK(kmM?.km||0); setTKK(kmK?.km||0); setVisaKmSheet(true); };
          return (
            <section style={{ marginBottom:32 }}>
              <div style={{ background:"#1c1c1e",borderRadius:16,padding:"20px",border:"1px solid rgba(255,255,255,0.06)" }}>
                <p style={{ margin:"0 0 6px",fontSize:17,fontWeight:600,color:"#fff" }}>{datumRubrik}</p>
                {redanBekräftad && (
                  <div style={{ display:"flex",alignItems:"center",gap:6,marginBottom:12 }}>
                    <span className="material-symbols-outlined" style={{ fontSize:18,color:"#34c759" }}>check_circle</span>
                    <span style={{ fontSize:13,color:"#34c759",fontWeight:500 }}>Bekräftad{bekräftadTidKort?` kl ${bekräftadTidKort}`:''}</span>
                  </div>
                )}
                {ändradSedan && (
                  <div style={{ display:"flex",alignItems:"center",gap:6,marginBottom:12 }}>
                    <span className="material-symbols-outlined" style={{ fontSize:18,color:"#ff9f0a" }}>edit</span>
                    <span style={{ fontSize:13,color:"#ff9f0a",fontWeight:500 }}>Ändrad — ej bekräftad</span>
                  </div>
                )}
                {!redanBekräftad && !ändradSedan && <div style={{ height:6 }} />}
                <div style={{ paddingBottom:10,borderBottom:(harObjBlock||harKmBlock)?"1px solid rgba(255,255,255,0.08)":"none",marginBottom:(harObjBlock||harKmBlock)?10:0 }}>
                  {sammanRad("Arbetstid", `${start} → ${slut}`, öppnaTider)}
                  {sammanRad("Rast", `${rast} min`, öppnaTider)}
                  {sammanRad("Total", fmt(arbMin))}
                </div>
                {harObjBlock&&(
                  <div style={{ paddingBottom:10,borderBottom:harKmBlock?"1px solid rgba(255,255,255,0.08)":"none",marginBottom:harKmBlock?10:0 }}>
                    {maskinNamnLång && sammanRad("Maskin", maskinNamnLång)}
                    {dagObjNamn     && sammanRad("Objekt", dagObjNamn)}
                  </div>
                )}
                {/* Körning — alltid synlig efter avslutat pass, klickbar för manuell input */}
                <div style={{ paddingBottom:10,borderBottom:"1px solid rgba(255,255,255,0.08)",marginBottom:10 }}>
                  {sammanRad("Körning", `${totKm} km`, öppnaKm)}
                  {harErsKr && sammanRad("Ersättning", `${ersKr.toFixed(2).replace('.',',')} kr`)}
                </div>
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
                            <span style={{ color:"rgba(255,255,255,0.6)",fontSize:15,flexShrink:0 }}>{prefixFör(e)}</span>
                            <div style={{ display:"flex",alignItems:"center",gap:4,minWidth:0 }}>
                              <span style={{ color:"#fff",fontSize:15,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{värde}</span>
                              <span className="material-symbols-outlined" style={{ fontSize:16,color:"rgba(255,255,255,0.25)",flexShrink:0 }}>chevron_right</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
                <div onClick={()=>setTrakÖppen(v=>!v)} style={{ display:"flex",justifyContent:"space-between",padding:"6px 0",cursor:"pointer",alignItems:"center" }}>
                  <span style={{ color:"rgba(255,255,255,0.6)",fontSize:15 }}>Traktamente</span>
                  <div style={{ display:"flex",alignItems:"center",gap:4 }}>
                    <span style={{ color:"#fff",fontSize:15,fontWeight:600 }}>{trak?.summa ? `${trak.summa} kr` : "Inget"}</span>
                    <span className="material-symbols-outlined" style={{ fontSize:18,color:"rgba(255,255,255,0.3)",transform:trakÖppen?"rotate(90deg)":"none",transition:"transform 0.2s" }}>chevron_right</span>
                  </div>
                </div>
                {trakÖppen&&(
                  <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginTop:10 }}>
                    {[{k:'inget',l:'Inget',v:null},{k:'halv',l:`Halv · ${halvKr}`,v:{summa:halvKr}},{k:'hel',l:`Hel · ${helKr}`,v:{summa:helKr}}].map(opt=>{
                      const valt = opt.v === null ? !trak : (trak?.summa === (opt.v as any)?.summa);
                      return (
                        <button key={opt.k} onClick={async ()=>{
                          setTrak(opt.v as any); setTrakÖppen(false);
                          if (dagData[idagKey]?.id) {
                            const bryterBekräftelse = !!dagData[idagKey]?.bekraftad;
                            const payload: any = { traktamente: !!opt.v };
                            if (bryterBekräftelse) payload.bekraftad = false;
                            await supabase.from("arbetsdag").update(payload).eq("id", dagData[idagKey].id);
                            if (bryterBekräftelse) setDagData(d => ({ ...d, [idagKey]: { ...d[idagKey], bekraftad: false, traktamente: !!opt.v } }));
                            else setDagData(d => ({ ...d, [idagKey]: { ...d[idagKey], traktamente: !!opt.v } }));
                          }
                        }}
                          style={{ background:valt?"rgba(173,198,255,0.12)":"rgba(255,255,255,0.04)",border:valt?"1px solid rgba(173,198,255,0.3)":"1px solid rgba(255,255,255,0.06)",borderRadius:10,padding:"10px 6px",color:valt?"#adc6ff":"#fff",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit" }}>{opt.l}</button>
                      );
                    })}
                  </div>
                )}
              </div>
              {/* Primärknapp: Bekräfta / Bekräfta igen / Ändra rapport */}
              {pagaendeAktiviteter.length===0 && (redanBekräftad ? (
                <button onClick={()=>setVisaTiderSheet(false)}
                  style={{ width:"100%",marginTop:16,padding:"18px",background:"#2c2c2e",color:"#fff",border:"none",borderRadius:14,fontSize:16,fontWeight:600,cursor:"default",fontFamily:"inherit" }}>
                  Ändra rapport
                </button>
              ) : (
                <button
                  onClick={async ()=>{
                    const nuT = nuKlock();
                    const nuTS = nuT + ":00";
                    const effektivSlut = slut || nuT;
                    for (const p of pagaendeAktiviteter) {
                      const min = minutDiff(p.start_tid, nuTS);
                      await supabase.from("extra_tid").update({ slut_tid: nuTS, minuter: min }).eq("id", p.id);
                    }
                    if (pagaendeAktiviteter.length > 0) setPagaendeAktiviteter([]);
                    const nuBekrIso = new Date().toISOString();
                    // arbetad_min och km_totalt är generated columns — skickas inte.
                    await supabase.from("arbetsdag").upsert({
                      medarbetare_id: medarbetare.id,
                      datum: new Date().toISOString().split("T")[0],
                      start_tid: start, slut_tid: effektivSlut, rast_min: rast,
                      km_morgon: kmM?.km ?? 0, km_kvall: kmK?.km ?? 0,
                      maskin_id: medarbetare.maskin_id,
                      objekt_id: dagObjId,
                      traktamente: trak, bekraftad: true,
                      bekraftad_tid: nuBekrIso,
                    }, { onConflict: 'medarbetare_id,datum' });
                    setSlut(effektivSlut.slice(0,5));
                    setDagData(d => ({ ...d, [idagKey]: { ...d[idagKey], bekraftad: true, bekraftad_tid: nuBekrIso, slut_tid: effektivSlut } }));
                    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(200);
                    setBekräftelseVisa(true);
                    setTimeout(() => setBekräftelseVisa(false), 2000);
                  }}
                  style={{ width:"100%",marginTop:16,padding:"20px",background:"#34C759",color:"#fff",border:"none",borderRadius:14,fontSize:18,fontWeight:700,cursor:"pointer",fontFamily:"inherit" }}>
                  {ändradSedan ? "Bekräfta igen" : "Bekräfta dagen ✓"}
                </button>
              ))}
              {/* + Starta extra tid — synlig även när dagen är bekräftad (glömd aktivitet) */}
              {pagaendeAktiviteter.length===0 && (
                <button onClick={async ()=>{
                  const startTid = nuKlock();
                  const { data } = await supabase.from("extra_tid").insert({
                    medarbetare_id: medarbetare.id,
                    datum: idagKey,
                    start_tid: startTid + ":00",
                    slut_tid: null,
                    minuter: 0,
                    kalla: (dagData[idagKey]?.slut_tid || dagData[idagKey]?.bekraftad) ? 'kvall' : 'morgon',
                  }).select().single();
                  if (data) {
                    setPagaendeAktiviteter(p => [...p, data]);
                    setExtraTidData(d => [data, ...d]);
                  }
                  if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(80);
                }}
                  style={{ width:"100%",marginTop:10,padding:"18px",background:"transparent",color:"#fff",border:"1px solid rgba(255,255,255,0.25)",borderRadius:14,fontSize:15,fontWeight:600,cursor:"pointer",fontFamily:"inherit" }}>
                  + Starta extra tid
                </button>
              )}
            </section>
          );
        })()}

        {/* Bottom sheet för Starta extra arbete renderas utanför main (nedan) */}

        {/* Löneunderlag-notis */}
        {månadsKlar&&!lönSkickat&&(
          <div onClick={()=>setSteg("lön")} style={{ background:"rgba(255,149,0,0.08)",border:"1px solid rgba(255,149,0,0.25)",borderRadius:12,padding:16,marginBottom:24,cursor:"pointer",animation:"fadeUp 0.4s ease" }}>
            <p style={{ margin:"0 0 6px",fontSize:13,fontWeight:500,color:C.orange }}>Månaden är slut</p>
            <p style={{ margin:"0 0 8px",fontSize:15,fontWeight:600,color:"#fff" }}>Granska löneunderlaget för {månadsNamn()}</p>
            <span style={{ fontSize:14,color:"#adc6ff",fontWeight:500 }}>Öppna →</span>
          </div>
        )}

        {/* Frånvaro & övrigt — kollapsbar sektion längst ner, edge-cases */}
        {!isWorking && !dagData[idagKey]?.bekraftad && (
          <section style={{ marginTop:40,marginBottom:16,animation:"fadeUp 0.5s ease 0.15s both" }}>
            <button onClick={()=>setVisaÖvrigt(v=>!v)}
              style={{ width:"100%",display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 4px",background:"none",border:"none",cursor:"pointer",fontFamily:"inherit" }}>
              <span style={{ fontSize:14,fontWeight:500,color:"rgba(255,255,255,0.5)",letterSpacing:"0.02em" }}>Frånvaro & övrigt</span>
              <span className="material-symbols-outlined" style={{ fontSize:18,color:"rgba(255,255,255,0.3)",transform:visaÖvrigt?"rotate(90deg)":"none",transition:"transform 0.2s" }}>chevron_right</span>
            </button>
            {visaÖvrigt && (
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginTop:12,animation:"fadeUp 0.25s ease" }}>
                {[
                  {id:"sjuk",       label:"Sjukfrånvaro", icon:"medical_services", next:"bekräftaFrånvaro"},
                  {id:"vab",        label:"VAB",          icon:"child_care",       next:"bekräftaFrånvaro"},
                  {id:"utbildning", label:"Utbildning",   icon:"school",           next:"manuellDag"},
                  {id:"service",    label:"Service",      icon:"build",            next:"manuellDag"},
                  {id:"möte",       label:"Möte",         icon:"groups",           next:"manuellDag"},
                  {id:"annat",      label:"Annat",        icon:"more_horiz",       next:"manuellDag"},
                ].map(s=>(
                  <button key={s.id} onClick={()=>{setDagTyp(s.id);setSteg(s.next);}}
                    style={{ height:52,background:"#1c1c1e",borderRadius:12,border:"1px solid rgba(255,255,255,0.06)",display:"flex",alignItems:"center",justifyContent:"center",gap:8,padding:"0 12px",cursor:"pointer",fontFamily:"inherit" }}>
                    <span className="material-symbols-outlined" style={{ color:"#8e8e93",fontSize:18 }}>{s.icon}</span>
                    <span style={{ color:"#fff",fontWeight:500,fontSize:14 }}>{s.label}</span>
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
              {maskinNamn || medarbetare?.maskin_id ? <>
                {maskinNamn && <div style={{ background:"#1c1c1e",padding:"6px 12px",borderRadius:20,fontSize:13,fontWeight:500,color:"#fff" }}>{maskinNamn}</div>}
                {medarbetare?.maskin_id && <div style={{ background:"#1c1c1e",padding:"6px 12px",borderRadius:20,fontSize:13,fontWeight:500,color:"#fff" }}>{medarbetare.maskin_id}</div>}
              </> : <p style={{ margin:0,fontSize:13,color:"#636366" }}>Ingen maskin inloggad</p>}
            </div>
          </div>
          <div>
            <h3 style={secHead}>Plats</h3>
            {(()=>{
              const vObj = valtObjektId ? objektLista.find(o=>o.id===valtObjektId) : null;
              const visatObjekt = dagensObjekt || dagData[idagKey]?.objekt_namn || (vObj?.namn);
              const visatÄgare = vObj?.ägare || null;
              if(visatObjekt) return (
                <div>
                  <p style={{ margin:0,fontSize:13,fontWeight:500,color:"#fff" }}>{visatObjekt}{visatÄgare ? ` · ${visatÄgare}` : ''}</p>
                  <button onClick={()=>setVisaObjektVäljare(true)} style={{ background:"none",border:"none",padding:0,marginTop:4,fontSize:12,color:"#8e8e93",cursor:"pointer",fontFamily:"inherit" }}>Ändra objekt</button>
                </div>
              );
              return (
                <button onClick={()=>setVisaObjektVäljare(true)} style={{ background:"none",border:"none",padding:0,fontSize:13,fontWeight:500,color:"#adc6ff",cursor:"pointer",fontFamily:"inherit" }}>Välj objekt</button>
              );
            })()}
          </div>
        </section>
        )}

        {/* Objektväljare */}
        {visaObjektVäljare&&(
          <div style={{ position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.8)",zIndex:100,display:"flex",alignItems:"flex-end",justifyContent:"center" }}>
            <div style={{ background:"#1c1c1e",borderRadius:"16px 16px 0 0",width:"100%",maxWidth:500,maxHeight:"70vh",display:"flex",flexDirection:"column" }}>
              <div style={{ padding:"16px 20px",borderBottom:"1px solid rgba(255,255,255,0.06)",display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                <h3 style={{ margin:0,fontSize:17,fontWeight:600 }}>Välj objekt</h3>
                <button onClick={()=>setVisaObjektVäljare(false)} style={{ background:"none",border:"none",color:"#8e8e93",fontSize:14,cursor:"pointer",fontFamily:"inherit" }}>Stäng</button>
              </div>
              <div style={{ flex:1,overflowY:"auto",padding:"8px 0" }}>
                {objektLista.map(o=>(
                  <button key={o.id} onClick={()=>{setValtObjektId(o.id);setVisaObjektVäljare(false);}} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",width:"100%",padding:"14px 20px",background:"none",border:"none",borderBottom:"1px solid rgba(255,255,255,0.04)",cursor:"pointer",fontFamily:"inherit",textAlign:"left" }}>
                    <div>
                      <p style={{ margin:0,fontSize:15,fontWeight:500,color:"#fff" }}>{o.namn}</p>
                      {o.ägare&&<p style={{ margin:"2px 0 0",fontSize:12,color:"#8e8e93" }}>{o.ägare}</p>}
                    </div>
                    {valtObjektId===o.id&&<div style={{ width:20,height:20,borderRadius:"50%",background:"#adc6ff",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}><svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l3 3L9 1" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg></div>}
                  </button>
                ))}
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
            style={{ width:"100%",maxWidth:560,background:"#1c1c1e",borderRadius:"20px 20px 0 0",padding:"10px 0 20px",maxHeight:"85vh",display:"flex",flexDirection:"column",animation:"sheetSlideUp 0.28s cubic-bezier(0.2,0.8,0.2,1)",boxShadow:"0 -8px 32px rgba(0,0,0,0.5)" }}>
            <div style={{ display:"flex",justifyContent:"center",padding:"6px 0 14px" }}>
              <div style={{ width:40,height:5,borderRadius:3,background:"rgba(255,255,255,0.2)" }} />
            </div>
            <div style={{ padding:"0 20px 12px",display:"flex",alignItems:"center",justifyContent:"space-between" }}>
              <p style={{ margin:0,fontSize:20,fontWeight:700,color:"#fff" }}>Välj objekt</p>
              <button onClick={()=>setKvAvVäljer(false)} style={{ background:"none",border:"none",color:"rgba(255,255,255,0.6)",fontSize:14,fontWeight:500,cursor:"pointer",fontFamily:"inherit" }}>Avbryt</button>
            </div>
            <div style={{ flex:1,overflowY:"auto",padding:"0 8px 0" }}>
              {objektLista.length === 0 ? (
                <p style={{ margin:"32px 20px",textAlign:"center",fontSize:14,color:"rgba(255,255,255,0.5)" }}>Inga objekt tillgängliga</p>
              ) : objektLista.map(o=>{
                const valt = kvAvObj?.id === o.id;
                return (
                  <button key={o.id} onClick={()=>{ setKvAvObj(o); setKvAvVäljer(false); }}
                    style={{ display:"flex",justifyContent:"space-between",alignItems:"center",width:"100%",padding:"14px 14px",background:valt?"rgba(10,132,255,0.1)":"none",border:"none",borderRadius:10,cursor:"pointer",fontFamily:"inherit",textAlign:"left",marginBottom:2 }}>
                    <div style={{ minWidth:0,flex:1 }}>
                      <p style={{ margin:0,fontSize:15,fontWeight:500,color:"#fff",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{o.namn}</p>
                      {o.ägare && <p style={{ margin:"2px 0 0",fontSize:12,color:"rgba(255,255,255,0.5)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{o.ägare}</p>}
                    </div>
                    {valt && <span className="material-symbols-outlined" style={{ fontSize:22,color:"#0a84ff",flexShrink:0,marginLeft:8 }}>check</span>}
                  </button>
                );
              })}
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
          await supabase.from("extra_tid").update({
            aktivitet_typ: kvAvTyp || null,
            objekt_id: kvAvObj?.id || null,
            debiterbar: kvAvDeb,
            kommentar: kvAvBesk || null,
          }).eq("id", efterStoppSheet.id);
          setExtraTidData(d => d.map(x => x.id === efterStoppSheet.id
            ? { ...x, aktivitet_typ: kvAvTyp || null, objekt_id: kvAvObj?.id || null, debiterbar: kvAvDeb, kommentar: kvAvBesk || null }
            : x
          ));
          stäng();
        };
        return (
          <div onClick={stäng} style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:1600,display:"flex",alignItems:"flex-end",justifyContent:"center",animation:"dimIn 0.2s ease" }}>
            <div onClick={e=>e.stopPropagation()}
              style={{ width:"100%",maxWidth:560,background:"#1c1c1e",borderRadius:"20px 20px 0 0",padding:"10px 20px 28px",maxHeight:"90vh",overflowY:"auto",animation:"sheetSlideUp 0.28s cubic-bezier(0.2,0.8,0.2,1)",boxShadow:"0 -8px 32px rgba(0,0,0,0.5)" }}>
              <div style={{ display:"flex",justifyContent:"center",padding:"6px 0 14px" }}>
                <div style={{ width:40,height:5,borderRadius:3,background:"rgba(255,255,255,0.2)" }} />
              </div>
              <p style={{ margin:"0 0 4px",fontSize:22,fontWeight:700,color:"#fff" }}>Vad gjorde du?</p>
              <p style={{ margin:"0 0 16px",fontSize:14,color:"rgba(255,255,255,0.5)" }}>{tidLabel}</p>

              <p style={{ margin:"0 0 8px",fontSize:13,color:"rgba(255,255,255,0.6)" }}>Aktivitet</p>
              {typer.map(t=>(
                <div key={t.typ} onClick={()=>setKvAvTyp(t.typ)}
                  style={{ background:kvAvTyp===t.typ?"rgba(10,132,255,0.15)":"rgba(255,255,255,0.04)",borderRadius:12,padding:"12px 16px",marginBottom:6,cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",border:kvAvTyp===t.typ?"1px solid rgba(10,132,255,0.35)":"1px solid rgba(255,255,255,0.06)" }}>
                  <span style={{ fontSize:15,fontWeight:500,color:"#fff" }}>{t.label}</span>
                  {kvAvTyp===t.typ
                    ? <div style={{ width:20,height:20,borderRadius:"50%",background:"#0a84ff",display:"flex",alignItems:"center",justifyContent:"center" }}><svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l3 3L9 1" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
                    : <div style={{ width:20,height:20,borderRadius:"50%",border:"1.5px solid rgba(255,255,255,0.18)" }}/>
                  }
                </div>
              ))}

              <div onClick={()=>setKvAvVäljer(true)} style={{ marginTop:12,background:"rgba(255,255,255,0.04)",borderRadius:12,padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",border:"1px solid rgba(255,255,255,0.06)" }}>
                <div>
                  <p style={{ margin:0,fontSize:15,fontWeight:600,color:"#fff" }}>Objekt</p>
                  <p style={{ margin:"2px 0 0",fontSize:13,color:kvAvObj?"#0a84ff":"rgba(255,255,255,0.5)" }}>{kvAvObj?kvAvObj.namn:"Välj objekt (valfritt)"}</p>
                </div>
                <ChevronRight/>
              </div>

              <div style={{ marginTop:6,background:"rgba(255,255,255,0.04)",borderRadius:12,padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",border:"1px solid rgba(255,255,255,0.06)" }}>
                <div>
                  <p style={{ margin:0,fontSize:15,fontWeight:600,color:"#fff" }}>Debiterbar</p>
                  <p style={{ margin:"2px 0 0",fontSize:13,color:"rgba(255,255,255,0.5)" }}>Faktureras kunden</p>
                </div>
                <div onClick={()=>setKvAvDeb(v=>!v)}
                  style={{ width:51,height:31,borderRadius:16,background:kvAvDeb?"#34c759":"rgba(120,120,128,0.3)",cursor:"pointer",position:"relative",transition:"background 0.2s",flexShrink:0 }}>
                  <div style={{ width:27,height:27,borderRadius:"50%",background:"#fff",position:"absolute",top:2,left:kvAvDeb?22:2,transition:"left 0.2s",boxShadow:"0 2px 4px rgba(0,0,0,0.2)" }}/>
                </div>
              </div>

              <div style={{ marginTop:12 }}>
                <p style={{ margin:"0 0 6px",fontSize:13,color:"rgba(255,255,255,0.6)" }}>Kommentar (valfritt)</p>
                <input value={kvAvBesk} onChange={e=>setKvAvBesk(e.target.value)} placeholder="Eller hoppa över"
                  style={{ width:"100%",padding:"13px 14px",fontSize:15,border:"1px solid rgba(255,255,255,0.08)",borderRadius:10,outline:"none",background:"rgba(255,255,255,0.04)",color:"#fff",fontFamily:"inherit",boxSizing:"border-box" }}/>
              </div>

              <button onClick={sparaDetaljer}
                style={{ width:"100%",marginTop:20,padding:"18px",background:"#0a84ff",color:"#fff",border:"none",borderRadius:14,fontSize:17,fontWeight:700,cursor:"pointer",fontFamily:"inherit" }}>
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
              style={{ width:"100%",maxWidth:560,background:"#1c1c1e",borderRadius:"20px 20px 0 0",padding:"10px 20px 28px",maxHeight:"92vh",overflowY:"auto",animation:"sheetSlideUp 0.28s cubic-bezier(0.2,0.8,0.2,1)",boxShadow:"0 -8px 32px rgba(0,0,0,0.5)" }}>
              <div style={{ display:"flex",justifyContent:"center",padding:"6px 0 14px" }}>
                <div style={{ width:40,height:5,borderRadius:3,background:"rgba(255,255,255,0.2)" }} />
              </div>
              <p style={{ margin:"0 0 16px",fontSize:22,fontWeight:700,color:"#fff" }}>Ändra tider</p>
              <div style={{ background:"rgba(255,255,255,0.04)",borderRadius:14,padding:"16px 12px",display:"flex",flexDirection:"column",gap:16 }}>
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
                    <span style={{ fontSize:14,color:"rgba(255,255,255,0.5)",fontWeight:600 }}>min</span>
                  </div>
                </div>
              </div>
              <div style={{ marginTop:16,padding:"18px 20px",background:"rgba(52,199,89,0.08)",borderRadius:12,display:"flex",justifyContent:"space-between",alignItems:"baseline" }}>
                <span style={{ color:"rgba(255,255,255,0.6)",fontSize:15,fontWeight:500 }}>Total arbetstid</span>
                <span style={{ color:"#34c759",fontSize:24,fontWeight:700 }}>{fmt(tAm)}</span>
              </div>
              <div style={{ display:"grid",gridTemplateColumns:"1fr 2fr",gap:8,marginTop:16 }}>
                <button onClick={stäng}
                  style={{ padding:"16px",background:"rgba(255,255,255,0.06)",color:"#fff",border:"none",borderRadius:12,fontSize:15,fontWeight:600,cursor:"pointer",fontFamily:"inherit" }}>
                  Avbryt
                </button>
                <button
                  onClick={async ()=>{
                    if (ändrat) {
                      setStart(tS); setSlut(tE); setRast(tR);
                      if (dagData[idagKey]?.id) {
                        // Om dagen var bekräftad, rasera bekräftelsen så status visar "Ändrad"
                        const bryterBekräftelse = !!dagData[idagKey]?.bekraftad;
                        const payload: any = { start_tid: tS + ":00", slut_tid: tE ? tE + ":00" : null, rast_min: tR };
                        if (bryterBekräftelse) payload.bekraftad = false;
                        await supabase.from("arbetsdag").update(payload).eq("id", dagData[idagKey].id);
                        setDagData(d => ({ ...d, [idagKey]: { ...d[idagKey], start_tid: tS + ":00", slut_tid: tE ? tE + ":00" : null, rast_min: tR, start: tS, slut: tE, rast: tR, ...(bryterBekräftelse ? { bekraftad: false } : {}) } }));
                      }
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
          <div style={{ flex:1,background:"rgba(255,255,255,0.04)",borderRadius:14,padding:"14px 16px",border:"1px solid rgba(255,255,255,0.06)" }}>
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
              style={{ width:"100%",maxWidth:560,background:"#1c1c1e",borderRadius:"20px 20px 0 0",padding:"10px 20px 28px",maxHeight:"85vh",overflowY:"auto",animation:"sheetSlideUp 0.28s cubic-bezier(0.2,0.8,0.2,1)",boxShadow:"0 -8px 32px rgba(0,0,0,0.5)" }}>
              <div style={{ display:"flex",justifyContent:"center",padding:"6px 0 14px" }}>
                <div style={{ width:40,height:5,borderRadius:3,background:"rgba(255,255,255,0.2)" }} />
              </div>
              <p style={{ margin:"0 0 16px",fontSize:22,fontWeight:700,color:"#fff" }}>Ändra km</p>
              <div style={{ display:"flex",gap:10 }}>
                <KmInput label="Morgon" value={tMK} onChange={setTMK}/>
                <KmInput label="Kväll"  value={tKK} onChange={setTKK}/>
              </div>
              <div style={{ marginTop:16,padding:"18px 20px",background:"rgba(52,199,89,0.08)",borderRadius:12 }}>
                <div style={{ display:"flex",justifyContent:"space-between",alignItems:"baseline" }}>
                  <span style={{ color:"rgba(255,255,255,0.6)",fontSize:15 }}>Totalt</span>
                  <span style={{ color:"#34c759",fontSize:24,fontWeight:700 }}>{ny} km</span>
                </div>
                {över > 0
                  ? <p style={{ margin:"8px 0 0",fontSize:13,color:"#34c759",fontWeight:500 }}>Färdtidsersättning: {över} km över {frikm} km = {mil} mil × {fardtidPerMil.toString().replace('.',',')} kr = {kr.toFixed(2).replace('.',',')} kr</p>
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
                    setKmM({km:tMK}); setKmK({km:tKK});
                    if (dagData[idagKey]?.id) {
                      const bryterBekräftelse = !!dagData[idagKey]?.bekraftad;
                      const payload: any = { km_morgon: tMK, km_kvall: tKK };
                      if (bryterBekräftelse) payload.bekraftad = false;
                      await supabase.from("arbetsdag").update(payload).eq("id", dagData[idagKey].id);
                      setDagData(d => ({ ...d, [idagKey]: { ...d[idagKey], km_morgon: tMK, km_kvall: tKK, km: tMK+tKK, km_totalt: tMK+tKK, ...(bryterBekräftelse ? { bekraftad: false } : {}) } }));
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

      {/* Bekräftelse-overlay efter Bekräfta dagen ✓ */}
      {/* Timer-fullskärm: aktiv pågående-timer tar över hela vyn */}
      {pagaendeAktiviteter.length > 0 && !efterStoppSheet && (()=>{
        const p = pagaendeAktiviteter[0];
        const label = p.aktivitet_typ ? aktLabel(p.aktivitet_typ) : 'Extra';
        return (
          <div style={{ position:"fixed",inset:0,background:"#000",zIndex:1400,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"24px" }}>
            <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:12 }}>
              <div style={{ width:10,height:10,borderRadius:"50%",background:"#ff453a",boxShadow:"0 0 10px #ff453a",animation:"pulseDot 2s infinite" }} />
              <p style={{ margin:0,fontSize:17,fontWeight:600,color:"#fff" }}>Pågående: {label}</p>
            </div>
            <p style={{ margin:"0 0 32px",fontSize:14,color:"rgba(255,255,255,0.55)" }}>Startad {(p.start_tid||'').slice(0,5)}</p>
            <p style={{ margin:"0 0 48px",fontSize:72,fontWeight:700,color:"#fff",fontVariantNumeric:"tabular-nums",letterSpacing:"-0.02em",lineHeight:1 }}>{fmtHMS(sekDiff(p.start_tid))}</p>
            <button onClick={async ()=>{
              const nuT = nuKlock() + ":00";
              const min = minutDiff(p.start_tid, nuT);
              const { data } = await supabase.from("extra_tid").update({ slut_tid: nuT, minuter: min }).eq("id", p.id).select().single();
              const uppdaterad = data || { ...p, slut_tid: nuT, minuter: min };
              setPagaendeAktiviteter(arr => arr.filter(x => x.id !== p.id));
              setExtraTidData(arr => arr.map(x => x.id === p.id ? uppdaterad : x));
              if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(120);
              setKvAvTyp(uppdaterad.aktivitet_typ || null);
              setKvAvObj(uppdaterad.objekt_id ? objektLista.find(o => o.id === uppdaterad.objekt_id) || null : null);
              setKvAvDeb(!!uppdaterad.debiterbar);
              setKvAvBesk(uppdaterad.kommentar || "");
              setEfterStoppSheet(uppdaterad);
            }} style={{ width:"min(90%,360px)",padding:"22px",background:"#ff453a",border:"none",borderRadius:16,color:"#fff",fontSize:19,fontWeight:700,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 8px 32px rgba(255,69,58,0.35)" }}>
              Stoppa
            </button>
          </div>
        );
      })()}

      {bekräftelseVisa && (
        <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:2000,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",animation:"dimIn 0.2s ease" }}>
          <div style={{ width:120,height:120,borderRadius:"50%",background:"#34C759",display:"flex",alignItems:"center",justifyContent:"center",animation:"checkPop 0.5s cubic-bezier(0.2,0.8,0.3,1.2)",boxShadow:"0 0 60px rgba(52,199,89,0.4)" }}>
            <svg width="56" height="56" viewBox="0 0 52 52">
              <path d="M14 27 L23 36 L38 18" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" strokeDasharray="60" style={{ animation:"checkDraw 0.4s 0.2s both ease-out" }}/>
            </svg>
          </div>
          <p style={{ margin:"32px 0 0",fontSize:22,fontWeight:700,color:"#fff",letterSpacing:"-0.01em" }}>Dagen bekräftad ✓</p>
        </div>
      )}
    </div>
  );

  /* ─── AVVIKELSE – registrera aktivitet på vägen till maskinen ─── */
  if(steg==="avvikelse"){
    const typer = [
      {id:"reservdelar", label:"Hämta reservdelar"},
      {id:"objekt",      label:"Kollat på ett objekt"},
      {id:"annat",       label:"Annat"},
    ];

    if(avVäljer) return (
      <div style={shell}><style>{css}</style>
        <div style={topBar}><div style={{ display:"flex",alignItems:"center",gap:14 }}><BackBtn onClick={()=>setAvVäljer(false)}/><h1 style={{ margin:0,fontSize:24,fontWeight:700 }}>Välj objekt</h1></div></div>
        <div style={{ flex:1,paddingTop:16 }}>
          {objektLista.map(o=>(
            <Card key={o.id} onClick={()=>{setAvObj(o);setAvVäljer(false);}} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",background:avObj?.id===o.id?"rgba(0,122,255,0.06)":C.card }}>
              <div><p style={{ margin:0,fontSize:16,fontWeight:600 }}>{o.namn}</p><p style={{ margin:"3px 0 0",fontSize:13,color:C.label }}>{o.ägare}</p></div>
              {avObj?.id===o.id&&<div style={{ width:22,height:22,borderRadius:"50%",background:C.blue,display:"flex",alignItems:"center",justifyContent:"center" }}><svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l3 3L9 1" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg></div>}
            </Card>
          ))}
        </div>
      </div>
    );

    return (
      <div style={shell}><style>{css}</style>
        <div style={topBar}>
          <h1 style={{ margin:"0 0 6px",fontSize:26,fontWeight:700 }}>{hälsning()}, {förnamn}</h1>
          <p style={{ margin:0,fontSize:15,color:C.label }}>Du loggade in på maskinen</p>
        </div>

        <div style={{ flex:1,overflowY:"auto",paddingTop:8 }}>

          {/* Vad gjorde du? */}
          <Label>Vad gjorde du på vägen?</Label>
          {typer.map(t=>(
            <Card key={t.id} onClick={()=>setAvTyp(t.id)}
              style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,background:avTyp===t.id?"rgba(0,122,255,0.06)":C.card,border:avTyp===t.id?`1px solid rgba(0,122,255,0.2)`:"none" }}>
              <span style={{ fontSize:16,fontWeight:500 }}>{t.label}</span>
              {avTyp===t.id
                ?<div style={{ width:22,height:22,borderRadius:"50%",background:C.blue,display:"flex",alignItems:"center",justifyContent:"center" }}><svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l3 3L9 1" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
                :<div style={{ width:22,height:22,borderRadius:"50%",border:`1.5px solid ${C.line}` }}/>
              }
            </Card>
          ))}

          {avTyp&&<>
            {/* Beskrivning */}
            <div style={{ marginTop:16,marginBottom:12 }}>
              <Label>Kommentar</Label>
              <input placeholder="Kommentar" value={avBesk} onChange={e=>setAvBesk(e.target.value)}
                style={{ width:"100%",padding:"15px 16px",fontSize:16,border:"none",borderRadius:12,background:C.card,outline:"none",boxShadow:"none",fontFamily:"inherit" }}/>
            </div>

            {/* Debiterbar toggle */}
            <Card style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:avDeb?8:0 }}>
              <div>
                <p style={{ margin:0,fontSize:16,fontWeight:600 }}>Debiterbar</p>
                <p style={{ margin:"2px 0 0",fontSize:13,color:C.label }}>Faktureras kunden</p>
              </div>
              <div onClick={()=>{setAvDeb(v=>!v);if(avDeb)setAvObj(null);}}
                style={{ width:51,height:31,borderRadius:16,background:avDeb?C.green:"rgba(120,120,128,0.2)",cursor:"pointer",position:"relative",transition:"background 0.2s" }}>
                <div style={{ width:27,height:27,borderRadius:"50%",background:"#fff",position:"absolute",top:2,left:avDeb?22:2,transition:"left 0.2s",boxShadow:"0 2px 4px rgba(0,0,0,0.2)" }}/>
              </div>
            </Card>

            {avDeb&&<Card onClick={()=>setAvVäljer(true)} style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
              <div>
                <p style={{ margin:0,fontSize:16,fontWeight:600 }}>Objekt</p>
                <p style={{ margin:"2px 0 0",fontSize:13,color:avObj?C.blue:C.label }}>{avObj?avObj.namn:"Välj objekt"}</p>
              </div>
              <ChevronRight/>
            </Card>}
          </>}
        </div>

        <div style={bottom}>
          <button
            style={{ ...btn.primary,opacity:(avTyp&&avBesk&&(!avDeb||avObj))?1:0.35 }}
            disabled={!avTyp||!avBesk||(avDeb&&!avObj)}
            onClick={()=>{
              // Lägg till som extra tid om debiterbar
              if(avDeb&&avObj) setExtra(e=>[...e,{besk:avBesk,min:45,deb:true,obj:avObj}]);
              setSteg("dag");
            }}>
            Klar, starta dagen
          </button>
        </div>
      </div>
    );
  }

  /* ─── MIN TID ─── */
  if(steg==="mintid") {
    const nu = new Date();
    const dagKort = ['SÖN','MÅN','TIS','ONS','TOR','FRE','LÖR'];
    const dagNamn = ['söndag','måndag','tisdag','onsdag','torsdag','fredag','lördag'];
    const månNamn2 = ['jan','feb','mar','apr','maj','jun','jul','aug','sep','okt','nov','dec'];

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
      const h=ad ? Math.round((ad.arbetad_min||0)/60*10)/10 : 0;
      veckoTot+=h;
      const dow=d.getDay();
      if(dow!==0&&dow!==6&&!rödaDagarVecka[k]) veckoArbDagar++;
      veckoDagar.push({datum:k,dag:dagNamn[d.getDay()],dagKort:dagKort[d.getDay()],h});
    }
    const veckoMålH = veckoArbDagar * 8;
    const maxH = Math.max(...veckoDagar.map(d=>d.h),1);

    // Idag
    const idagAd = årsData.find(r=>r.datum===nu.toISOString().split('T')[0]);
    const idagH = idagAd ? Math.round((idagAd.arbetad_min||0)/60*10)/10 : 0;
    const idagDiff = idagH - 8;

    // Månad
    const månStart = `${nu.getFullYear()}-${String(nu.getMonth()+1).padStart(2,'0')}-01`;
    const månData = årsData.filter(r=>r.datum>=månStart);
    const månJobbatMin = månData.reduce((a,d)=>a+(d.arbetad_min||0),0);
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
    const kvMin = kvData.reduce((a,d)=>a+(d.arbetad_min||0),0);
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
    const årsMin = årsData.reduce((a,d)=>a+(d.arbetad_min||0),0);
    let årsÖvH = 0;
    for(let m=0;m<=nu.getMonth();m++){
      const mp=`${nu.getFullYear()}-${String(m+1).padStart(2,'0')}`;
      const mMin=årsData.filter(d=>d.datum&&d.datum.startsWith(mp)).reduce((a,d)=>a+(d.arbetad_min||0),0);
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
    const årsBarFärg = årsÖvH>230?"#ff453a":årsÖvH>200?"#ff9f0a":"#34c759";

    // Varningar
    const varningar: {typ:'röd'|'orange';text:string}[] = [];
    // Dygnsvila
    const sorterad = [...årsData].filter(r=>r.slut_tid&&r.start_tid).sort((a,b)=>a.datum.localeCompare(b.datum));
    for(let i=0;i<sorterad.length-1;i++){
      const dag1=sorterad[i], dag2=sorterad[i+1];
      const dagarGap=Math.round((new Date(dag2.datum).getTime()-new Date(dag1.datum).getTime())/864e5);
      if(dagarGap>7) continue;
      const d1=new Date(`${dag1.datum}T${dag1.slut_tid.slice(0,5)}`);
      const d2=new Date(`${dag2.datum}T${dag2.start_tid.slice(0,5)}`);
      const vila=(d2.getTime()-d1.getTime())/3600000;
      if(vila>0&&vila<11) varningar.push({typ:'röd',text:`Dygnsvila bruten ${dag1.datum.slice(5)}: bara ${Math.round(vila*10)/10}h vila`});
    }
    // Veckovila — senaste 7 dagarna
    const senaste7 = [];
    for(let i=0;i<7;i++){
      const d=new Date(nu); d.setDate(nu.getDate()-i);
      const k=d.toISOString().split('T')[0];
      const ad=årsData.find(r=>r.datum===k);
      senaste7.push({datum:k,jobbat:!!(ad?.start_tid)});
    }
    // Kolla om det finns 36h ledigt (minst 1.5 dagar i rad utan jobb)
    let maxLedigt=0, ledigt=0;
    for(const d of senaste7){
      if(!d.jobbat) ledigt++; else ledigt=0;
      maxLedigt=Math.max(maxLedigt,ledigt);
    }
    if(maxLedigt<2) varningar.push({typ:'orange',text:'Ingen veckovila senaste 7 dagarna'});
    // Övertidstak
    if(årsÖvH>230) varningar.push({typ:'röd',text:`${årsKvar}h kvar till max 250h övertid`});
    else if(årsÖvH>200) varningar.push({typ:'orange',text:'Du närmar dig övertidstaket (250h)'});

    const fmtDiff = (h: number) => { const abs=Math.abs(h); const hh=Math.floor(abs); const mm=Math.round((abs-hh)*60); return `${h>=0?'+':'−'}${hh}h${mm>0?` ${mm}min`:''}`; };
    const månDiff = månJobbatH - månMålH;

    return (
      <div style={{ minHeight:"100vh",background:"#000",color:"#e2e2e2",fontFamily:"'Inter',-apple-system,sans-serif",WebkitFontSmoothing:"antialiased",paddingBottom:120 }}>
        <style>{css}</style>
        <header style={{ position:"fixed",top:0,width:"100%",zIndex:50,background:"rgba(0,0,0,0.8)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",display:"flex",flexDirection:"column",padding:"0 24px",paddingTop:16 }}>
          <h1 style={{ margin:"0 0 12px",fontSize:20,fontWeight:700,color:"#fff" }}>Min tid</h1>
          <div style={{ display:"flex",gap:0,background:"rgba(255,255,255,0.06)",borderRadius:8,padding:2,marginBottom:12,overflowX:"auto" }}>
            {([['översikt','Översikt'],['saldon','Saldon'],['vila','Vila'],['monster','Mönster'],['lön','Löneunderlag']] as const).map(([k,l])=>(
              <button key={k} onClick={()=>{if(k==='lön'){setSteg('lön');return;}setMinTidFlik(k);}} style={{ flex:1,minWidth:60,padding:"7px 8px",borderRadius:6,border:"none",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",background:minTidFlik===k?"rgba(255,255,255,0.12)":"transparent",color:minTidFlik===k?"#fff":"#8e8e93",whiteSpace:"nowrap" }}>{l}</button>
            ))}
          </div>
        </header>

        <main style={{ paddingTop:110,paddingLeft:20,paddingRight:20 }}>

          {/* Varningar — bara på översikt */}
          {minTidFlik==='översikt'&&varningar.length>0&&(
            <section style={{ marginBottom:24 }}>
              {varningar.map((v,i)=>(
                <div key={i} style={{ background:v.typ==='röd'?"rgba(255,69,58,0.08)":"rgba(255,159,10,0.08)",border:`1px solid ${v.typ==='röd'?"rgba(255,69,58,0.25)":"rgba(255,159,10,0.25)"}`,borderRadius:12,padding:"14px 16px",marginBottom:8,display:"flex",alignItems:"center",gap:10 }}>
                  <span className="material-symbols-outlined" style={{ color:v.typ==='röd'?"#ff453a":"#ff9f0a",fontSize:20 }}>warning</span>
                  <span style={{ fontSize:14,fontWeight:500,color:"#fff" }}>{v.text}</span>
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
                    {d.h>0&&<span style={{ fontSize:10,fontWeight:600,color:"#adc6ff",marginBottom:4 }}>{d.h}</span>}
                    <div style={{ flex:1,display:"flex",alignItems:"flex-end",width:"100%" }}>
                      <div style={{ width:"100%",height:`${d.h>0?Math.max(8,d.h/maxH*100):8}%`,background:d.h>0?"#adc6ff":"rgba(255,255,255,0.08)",borderRadius:4,transition:"height 0.4s ease" }} />
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
                  <span style={{ fontSize:15,color:"#8e8e93" }}>{r.label}</span>
                  <div style={{ display:"flex",alignItems:"baseline",gap:8 }}>
                    <span style={{ fontSize:15,fontWeight:600,color:"#fff" }}>{r.val}</span>
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
                    <p style={{ margin:0,fontSize:14,color:"#8e8e93" }}>Hämtar saldo…</p>
                  ):fel?(
                    <p style={{ margin:0,fontSize:14,color:"#ff9f0a" }}>Kunde inte hämta saldo</p>
                  ):(<>
                    <div style={{ display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:12 }}>
                      <span style={{ fontSize:28,fontWeight:700,color:"#fff" }}>{semKvar} <span style={{ fontSize:14,fontWeight:400,color:"#8e8e93" }}>dagar kvar</span></span>
                    </div>
                    <div style={{ height:4,background:"rgba(255,255,255,0.06)",borderRadius:2,marginBottom:12,overflow:"hidden" }}>
                      <div style={{ height:"100%",width:`${semPct}%`,background:"#adc6ff",borderRadius:2 }} />
                    </div>
                    <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
                      {[
                        ["Betalda",`${betalda} dagar`],
                        ...(obetalda>0?[["Obetalda",`${obetalda} dagar`]]:[]),
                        ...(sparade>0?[["Sparade",`${sparade} dagar`]]:[]),
                        ["Uttagna",`${uttagna} dagar`],
                      ].map(([l,v])=>(
                        <div key={l as string} style={{ display:"flex",justifyContent:"space-between" }}>
                          <span style={{ fontSize:13,color:"#8e8e93" }}>{l}</span>
                          <span style={{ fontSize:13,fontWeight:600,color:"#fff" }}>{v}</span>
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
                    <p style={{ margin:0,fontSize:14,color:"#8e8e93" }}>Hämtar saldo…</p>
                  ):fel?(
                    <p style={{ margin:0,fontSize:14,color:"#ff9f0a" }}>Kunde inte hämta saldo</p>
                  ):(<>
                    <div style={{ display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:atkTimmar!=null?16:0 }}>
                      <span style={{ fontSize:28,fontWeight:700,color:"#fff" }}>{atkKr.toLocaleString('sv-SE')} <span style={{ fontSize:14,fontWeight:400,color:"#8e8e93" }}>kr</span></span>
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
                    <p style={{ margin:0,fontSize:14,color:"#8e8e93" }}>ATK-val öppnar 1 maj</p>
                  </div>
                )}

                {efterValperiod&&harValt&&(
                  <div style={{ background:"#1c1c1e",borderRadius:12,padding:16,border:"1px solid rgba(52,199,89,0.2)" }}>
                    <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                      <span style={{ fontSize:16 }}>✅</span>
                      <span style={{ fontSize:14,color:"#fff" }}>
                        Ditt val: {atkValSparat.val==='ledig'?'Ledig tid':atkValSparat.val==='kontant'?'Pengar':'Pension'}
                      </span>
                    </div>
                  </div>
                )}

                {efterValperiod&&!harValt&&(
                  <div style={{ background:"#1c1c1e",borderRadius:12,padding:16,border:"1px solid rgba(255,159,10,0.3)" }}>
                    <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                      <span style={{ fontSize:16 }}>⚠️</span>
                      <span style={{ fontSize:14,color:"#fff" }}>Inget val gjort — kontakta chef</span>
                    </div>
                  </div>
                )}

                {iValperiod&&harValt&&(
                  <div style={{ background:"#1c1c1e",borderRadius:12,padding:16,border:"1px solid rgba(52,199,89,0.2)" }}>
                    <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                      <span style={{ color:"#34c759",fontSize:14 }}>✓</span>
                      <span style={{ fontSize:14,color:"#fff" }}>
                        {atkValSparat.val==='ledig'?`Du valde ledig tid${atkDagar!=null?`: ${atkDagar} dagar`:''}`:atkValSparat.val==='kontant'?`Utbetalas juni ${årNu2}: ≈ ${atkKr.toLocaleString('sv-SE')} kr`:`Avsatt till pension: ≈ ${atkKr.toLocaleString('sv-SE')} kr`}
                      </span>
                    </div>
                  </div>
                )}

                {iValperiod&&!harValt&&(
                  <div style={{ background:"#1c1c1e",borderRadius:12,padding:20,border:"1px solid rgba(255,159,10,0.25)" }}>
                    <p style={{ margin:"0 0 16px",fontSize:14,fontWeight:600,color:"#ff9f0a" }}>Välj för ditt ATK {årNu2}</p>
                    <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:16 }}>
                      {([
                        {k:'ledig' as const,label:'Ledig tid',sub:atkDagar!=null?`= ${atkDagar} dagar`:''},
                        {k:'kontant' as const,label:'Pengar',sub:`≈ ${atkKr.toLocaleString('sv-SE')} kr`,sub2:'före skatt'},
                        {k:'pension' as const,label:'Pension',sub:`≈ ${atkKr.toLocaleString('sv-SE')} kr`,sub2:'till pension'},
                      ]).map(o=>(
                        <button key={o.k} onClick={()=>setAtkVal(o.k)} style={{ background:atkVal===o.k?"rgba(173,198,255,0.12)":"rgba(255,255,255,0.04)",border:atkVal===o.k?"1px solid rgba(173,198,255,0.3)":"1px solid rgba(255,255,255,0.06)",borderRadius:10,padding:"14px 8px",cursor:"pointer",fontFamily:"inherit",textAlign:"center" }}>
                          <p style={{ margin:0,fontSize:13,fontWeight:600,color:atkVal===o.k?"#adc6ff":"#fff" }}>{o.label}</p>
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
                        await supabase.from("atk_val").upsert(row, { onConflict: 'medarbetare_id,period' });
                        setAtkValSparat(row);
                      }}
                      style={{ width:"100%",height:48,background:atkVal?"#2a2a2a":"rgba(255,255,255,0.04)",border:"none",borderRadius:12,color:atkVal?"#fff":"#636366",fontSize:15,fontWeight:600,cursor:atkVal?"pointer":"default",fontFamily:"inherit",opacity:atkVal?1:0.5 }}>
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
                <span style={{ fontSize:28,fontWeight:700,color:årsBarFärg }}>{årsÖvH}h</span>
                <span style={{ fontSize:14,color:"#8e8e93" }}>av 250h</span>
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
            const brott=filtVila.filter(r=>r.vila<11);
            const harProblem=brott.length>0;

            // Veckovila — beräkna längsta lucka mellan pass per vecka
            const getVeckoNr=(d:Date)=>Math.ceil((Math.floor((d.getTime()-new Date(d.getFullYear(),0,1).getTime())/864e5)+new Date(d.getFullYear(),0,1).getDay()+1)/7);
            const veckoNrNu=getVeckoNr(nu5);

            // Bygg alla luckor mellan på-varandra-följande pass
            const sortAsc2=[...årsData].filter(r=>r.slut_tid&&r.start_tid).sort((a,b)=>a.datum.localeCompare(b.datum));
            const allGaps:{veckoNr:number;slutDatum:string;slutTid:string;startDatum:string;startTid:string;h:number;anledning:string}[]=[];
            for(let i=0;i<sortAsc2.length-1;i++){
              const d1=sortAsc2[i],d2=sortAsc2[i+1];
              const sT=d1.slut_tid.slice(0,5),stT=d2.start_tid.slice(0,5);
              const slutDt=new Date(`${d1.datum}T${sT}`);
              const startDt=new Date(`${d2.datum}T${stT}`);
              const h=(startDt.getTime()-slutDt.getTime())/36e5;
              if(h<=0||h>500) continue;
              const vNr=getVeckoNr(slutDt);
              const dagarM=Math.round((new Date(d2.datum).getTime()-new Date(d1.datum).getTime())/864e5);
              const anl=dagarM>1?getAnledning(d1.datum,d2.datum):'';
              allGaps.push({veckoNr:vNr,slutDatum:d1.datum,slutTid:sT,startDatum:d2.datum,startTid:stT,h:Math.round(h*10)/10,anledning:anl});
            }

            // Per vecka: hitta längsta luckan
            const vvMap=new Map<number,typeof allGaps[0]>();
            for(const g of allGaps){
              const prev=vvMap.get(g.veckoNr);
              if(!prev||g.h>prev.h) vvMap.set(g.veckoNr,g);
            }

            // Filtrera veckor baserat på period
            let vvKeys=[...vvMap.keys()].sort((a,b)=>b-a);
            if(vilaPeriod==='7d') vvKeys=vvKeys.filter(k=>k>=veckoNrNu-1);
            else if(vilaPeriod==='30d') vvKeys=vvKeys.filter(k=>k>=veckoNrNu-4);
            else if(vilaPeriod==='månad'){
              // Hitta veckor som hör till vald månad
              const mStart=new Date(nu5.getFullYear(),vilaMånad,1);
              const mSlut=new Date(nu5.getFullYear(),vilaMånad+1,0);
              const vStart=getVeckoNr(mStart),vSlut=getVeckoNr(mSlut);
              vvKeys=vvKeys.filter(k=>k>=vStart&&k<=vSlut);
            }

            const vvData=vvKeys.map(k=>({veckoNr:k,pågår:k===veckoNrNu,...vvMap.get(k)!}));
            const vvHarProblem=vvData.some(v=>!v.pågår&&v.h<36);

            // Export
            const exportPDF = () => {
              const fVH=(h:number)=>{const hh=Math.floor(h);const mm=Math.round((h-hh)*60);return mm>0?`${hh}h ${mm}min`:`${hh}h`;};
              const fDe=(d:string)=>{const dt=new Date(d);return `${dagNamn[dt.getDay()].slice(0,3)} ${dt.getDate()} ${månNamn2[dt.getMonth()]}`;};
              let html=`<html><head><title>Viloperioder</title><style>body{font-family:Inter,system-ui,sans-serif;padding:32px;font-size:13px;color:#222}h1{font-size:18px;margin-bottom:4px}h2{font-size:14px;margin-top:24px;color:#666}table{width:100%;border-collapse:collapse;margin-top:8px}th{text-align:left;padding:8px 12px;background:#f5f5f5;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#666;border-bottom:1px solid #ddd}td{padding:8px 12px;border-bottom:1px solid #eee}.warn{color:#d32f2f;font-weight:600}.ok{color:#2e7d32}</style></head><body>`;
              html+=`<h1>${medarbetare?.namn||''}</h1><p style="color:#666;margin:0 0 24px">Viloperioder — ${periodLabel}</p>`;
              html+=`<h2>Dygnsvila</h2><table><tr><th>Slutade</th><th>Startade igen</th><th>Vila</th><th>Anledning</th><th>Status</th></tr>`;
              for(const r of [...filtVila].reverse()){
                const ok=r.vila>=11;
                html+=`<tr><td>${fDe(r.slutDatum)} ${r.slutTid}</td><td>${fDe(r.startDatum)} ${r.startTid}</td><td>${fVH(r.vila)}</td><td>${r.anledning||'—'}</td><td class="${ok?'ok':'warn'}">${ok?'OK':'⚠ Under 11h'}</td></tr>`;
              }
              html+=`</table>`;
              html+=`<h2>Veckovila</h2><table><tr><th>Vecka</th><th>Slutade</th><th>Startade igen</th><th>Vila</th><th>Anledning</th><th>Status</th></tr>`;
              vvData.forEach(v=>{const ok=v.h>=36;const fVH2=(h:number)=>{const hh=Math.floor(h);const mm=Math.round((h-hh)*60);return mm>0?`${hh}h ${mm}min`:`${hh}h`;};html+=`<tr><td>Vecka ${v.veckoNr}</td><td>${fDe(v.slutDatum)} ${v.slutTid}</td><td>${fDe(v.startDatum)} ${v.startTid}</td><td>${fVH2(v.h)}</td><td>${v.anledning||'—'}</td><td class="${ok?'ok':'warn'}">${ok?'OK':'⚠ Under 36h'}</td></tr>`;});
              html+=`</table></body></html>`;
              const w=window.open('','','width=700,height=900');
              if(w){w.document.write(html);w.document.close();w.document.title='Viloperioder';setTimeout(()=>w.print(),300);}
            };

            // Render en vilorad med klockslag
            const fmtVilaH = (h:number) => { const hh=Math.floor(h); const mm=Math.round((h-hh)*60); return mm>0?`${hh}h ${mm}min`:`${hh}h`; };
            const fD=(d:Date)=>`${dagNamn[d.getDay()].slice(0,3)} ${d.getDate()} ${månNamn2[d.getMonth()]}`;
            const VilaKort = ({r}:{r:typeof allVila[0]}) => {
              const ok=r.vila>=11;
              const d1=new Date(r.slutDatum),d2=new Date(r.startDatum);
              return (
                <div style={{ background:"#1c1c1e",borderRadius:12,padding:"16px 18px",marginBottom:8,border:`1px solid ${ok?"rgba(255,255,255,0.06)":"rgba(255,69,58,0.2)"}` }}>
                  <p style={{ margin:"0 0 6px",fontSize:14,fontWeight:600,color:"#fff",textTransform:"capitalize" }}>{fD(d1)}</p>
                  <p style={{ margin:"0 0 2px",fontSize:13,color:"#8e8e93" }}>Slutade kl {r.slutTid}</p>
                  <p style={{ margin:"0 0 10px",fontSize:13,color:"#8e8e93" }}>Startade igen: <span style={{ textTransform:"capitalize" }}>{fD(d2)}</span> kl {r.startTid}</p>
                  <div style={{ display:"flex",alignItems:"center",gap:6 }}>
                    {!ok&&<span style={{ color:"#ff453a",fontSize:13 }}>⚠</span>}
                    <span style={{ fontSize:14,fontWeight:600,color:ok?"#34c759":"#ff453a" }}>Dygnsvila: {fmtVilaH(r.vila)}</span>
                    {ok&&<span style={{ color:"#34c759",fontSize:13 }}>✓</span>}
                    {!ok&&<span style={{ fontSize:12,color:"#ff453a" }}>(kräver 11h)</span>}
                  </div>
                  {r.anledning&&<p style={{ margin:"6px 0 0",fontSize:12,color:"#8e8e93" }}>{r.anledning}</p>}
                </div>
              );
            };

            return (<>
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
                  <button onClick={()=>setVilaMånad(m=>(m-1+12)%12)} style={{ background:"none",border:"none",cursor:"pointer",padding:4 }}><span className="material-symbols-outlined" style={{ color:"#adc6ff",fontSize:20 }}>chevron_left</span></button>
                  <span style={{ fontSize:15,fontWeight:600,color:"#fff",minWidth:120,textAlign:"center",textTransform:"capitalize" }}>{periodLabel}</span>
                  <button onClick={()=>setVilaMånad(m=>(m+1)%12)} style={{ background:"none",border:"none",cursor:"pointer",padding:4 }}><span className="material-symbols-outlined" style={{ color:"#adc6ff",fontSize:20 }}>chevron_right</span></button>
                </div>
              )}

              {/* Default: kompakt eller problem */}
              {!visaAllaDygnsvila&&vilaPeriod!=='år'?(
                <div style={{ background:"#1c1c1e",borderRadius:12,padding:"4px 20px",border:"1px solid rgba(255,255,255,0.06)" }}>
                  {!harProblem?(
                    <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 0" }}>
                      <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                        <span style={{ fontSize:14,color:"#34c759" }}>✓</span>
                        <span style={{ fontSize:14,color:"#fff" }}>Dygnsviolan uppfylld</span>
                      </div>
                      <button onClick={()=>setVisaAllaDygnsvila(true)} style={{ background:"none",border:"none",color:"#adc6ff",fontSize:13,fontWeight:500,cursor:"pointer",fontFamily:"inherit",padding:0 }}>Visa alla →</button>
                    </div>
                  ):(
                    <>
                      {brott.map((r,i)=><VilaKort key={i} r={r} />)}
                      <div style={{ padding:"10px 0 14px",borderTop:"1px solid rgba(255,255,255,0.04)" }}>
                        <button onClick={()=>setVisaAllaDygnsvila(true)} style={{ background:"none",border:"none",color:"#adc6ff",fontSize:13,fontWeight:500,cursor:"pointer",fontFamily:"inherit",padding:0 }}>Visa alla {filtVila.length} perioder →</button>
                      </div>
                    </>
                  )}
                </div>
              ):vilaPeriod==='år'?(
                /* Årsvy per månad */
                <div style={{ background:"#1c1c1e",borderRadius:12,padding:"4px 20px",border:"1px solid rgba(255,255,255,0.06)" }}>
                  {(()=>{
                    const mån=Array.from({length:12},(_,m)=>{const mv=allVila.filter(r=>r.månad===m);return{m,mv,brott:mv.filter(r=>r.vila<11).length};}).filter(x=>x.mv.length>0);
                    return mån.length===0?<p style={{ padding:"14px 0",margin:0,fontSize:14,color:"#8e8e93" }}>Ingen data</p>:mån.map((x,i)=>{
                      const nm=['Januari','Februari','Mars','April','Maj','Juni','Juli','Augusti','September','Oktober','November','December'][x.m];
                      const exp=vilaÅrExpand===x.m;
                      return (<div key={x.m}>
                        <div onClick={()=>setVilaÅrExpand(exp?null:x.m)} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 0",borderBottom:!exp&&i<mån.length-1?"1px solid rgba(255,255,255,0.04)":"none",cursor:"pointer" }}>
                          <span style={{ fontSize:14,fontWeight:500 }}>{nm}</span>
                          <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                            <span style={{ fontSize:13,color:x.brott>0?"#ff453a":"#8e8e93" }}>{x.mv.length} dagar{x.brott>0?` · ${x.brott} ⚠`:' ✓'}</span>
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
                  {filtVila.length===0?<div style={{ background:"#1c1c1e",borderRadius:12,padding:"14px 20px",border:"1px solid rgba(255,255,255,0.06)" }}><p style={{ margin:0,fontSize:14,color:"#8e8e93" }}>Ingen data för perioden</p></div>:
                  filtVila.map((r,i)=><VilaKort key={i} r={r} />)}
                  <button onClick={()=>setVisaAllaDygnsvila(false)} style={{ width:"100%",marginTop:4,background:"none",border:"none",color:"#8e8e93",fontSize:13,fontWeight:500,cursor:"pointer",fontFamily:"inherit",padding:"8px 0" }}>Dölj detaljer</button>
                </div>
              )}
            </section>

            {/* Veckovila */}
            <section style={{ marginBottom:24 }}>
              <h3 style={secHead}>Veckovila</h3>
              {!visaAllaVeckovila?(
                <div style={{ background:"#1c1c1e",borderRadius:12,padding:"4px 20px",border:"1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 0" }}>
                    <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                      <span style={{ fontSize:14,color:vvHarProblem?"#ff453a":"#34c759" }}>{vvHarProblem?"⚠":"✓"}</span>
                      <span style={{ fontSize:14,color:"#fff" }}>{vvHarProblem?"Problem med veckovila":"Veckovila uppfylld"}</span>
                    </div>
                    <button onClick={()=>setVisaAllaVeckovila(true)} style={{ background:"none",border:"none",color:"#adc6ff",fontSize:13,fontWeight:500,cursor:"pointer",fontFamily:"inherit",padding:0 }}>Visa alla →</button>
                  </div>
                </div>
              ):(
                <div>
                  {vvData.map((v,i)=>{
                    const fVH2=(h:number)=>{const hh=Math.floor(h);const mm=Math.round((h-hh)*60);return mm>0?`${hh}h ${mm}min`:`${hh}h`;};
                    const fDv=(d:string)=>{const dt=new Date(d);return `${dagNamn[dt.getDay()].slice(0,3)} ${dt.getDate()} ${månNamn2[dt.getMonth()]}`;};
                    if(v.pågår) return (
                      <div key={i} style={{ background:"#1c1c1e",borderRadius:12,padding:"16px 18px",marginBottom:8,border:"1px solid rgba(255,255,255,0.06)" }}>
                        <p style={{ margin:0,fontSize:13,color:"#8e8e93" }}>Vecka {v.veckoNr} — pågår</p>
                      </div>
                    );
                    const ok=v.h>=36;
                    return (
                    <div key={i} style={{ background:"#1c1c1e",borderRadius:12,padding:"16px 18px",marginBottom:8,border:`1px solid ${ok?"rgba(255,255,255,0.06)":"rgba(255,69,58,0.2)"}` }}>
                      <p style={{ margin:"0 0 4px",fontSize:13,fontWeight:600,color:"#8e8e93" }}>Vecka {v.veckoNr}</p>
                      <p style={{ margin:"0 0 2px",fontSize:13,color:"#8e8e93" }}><span style={{textTransform:"capitalize"}}>{fDv(v.slutDatum)}</span> {v.slutTid} → <span style={{textTransform:"capitalize"}}>{fDv(v.startDatum)}</span> {v.startTid}</p>
                      <div style={{ display:"flex",alignItems:"center",gap:6,marginTop:8 }}>
                        {!ok&&<span style={{ color:"#ff453a",fontSize:13 }}>⚠</span>}
                        <span style={{ fontSize:14,fontWeight:600,color:ok?"#34c759":"#ff453a" }}>Veckovila: {fVH2(v.h)}</span>
                        {ok&&<span style={{ color:"#34c759",fontSize:13 }}>✓</span>}
                        {!ok&&<span style={{ fontSize:12,color:"#ff453a" }}>(kräver 36h)</span>}
                      </div>
                      {v.anledning&&<p style={{ margin:"6px 0 0",fontSize:12,color:"#8e8e93" }}>{v.anledning}</p>}
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
                    <p style={{ margin:0,fontSize:28,fontWeight:700,color:"#fff" }}>{Math.round(totMin/60*10)/10}h <span style={{ fontSize:14,fontWeight:400,color:"#8e8e93" }}>extra tid totalt</span></p>
                    <p style={{ margin:"6px 0 0",fontSize:13,color:"#8e8e93" }}>{senaste30.length} aktiviteter över {arbDagar30} arbetsdagar</p>
                  </div>
                </section>
                {/* Per typ */}
                {stats.length === 0 ? (
                  <Card><p style={{ margin:0,fontSize:14,color:C.label,textAlign:"center" }}>Ingen extra tid registrerad senaste 30 dagarna</p></Card>
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
                            <span className="material-symbols-outlined" style={{ color:"#adc6ff",fontSize:22 }}>{aktIcon(s.typ)}</span>
                            <div style={{ flex:1 }}>
                              <p style={{ margin:0,fontSize:15,fontWeight:600,color:"#fff" }}>{aktLabel(s.typ)}</p>
                              <p style={{ margin:"2px 0 0",fontSize:12,color:C.label }}>{pct}% av dagarna · snitt {fmt(s.medel)}</p>
                            </div>
                            <span style={{ fontSize:15,fontWeight:600,color:"#fff" }}>{Math.round(s.minTot/60*10)/10}h</span>
                          </div>
                          {/* Bar */}
                          <div style={{ height:4,background:"rgba(255,255,255,0.06)",borderRadius:2,overflow:"hidden",marginBottom:6 }}>
                            <div style={{ height:"100%",width:`${Math.min(100,pct)}%`,background:"#adc6ff",borderRadius:2 }}/>
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
                          const färger = ["#adc6ff","#34c759","#ff9f0a","#ff453a","#bf5af2","#64d2ff"];
                          return <div key={s.typ} title={aktLabel(s.typ)} style={{ width:`${w}%`,background:färger[i%färger.length] }}/>;
                        })}
                      </div>
                      <div style={{ display:"flex",flexWrap:"wrap",gap:8,marginTop:12 }}>
                        {stats.map((s,i) => {
                          const färger = ["#adc6ff","#34c759","#ff9f0a","#ff453a","#bf5af2","#64d2ff"];
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

  /* ─── LÖNEUNDERLAG ─── */
  if(steg==="lön"){
    const timlon = gsAvtal?.timlon_kr ?? 185;
    const overtidKrPerTim = gsAvtal?.overtid_vardag_kr ?? 54.94;
    const frikm2 = gsAvtal?.km_grans_per_dag ?? 60;
    const kmErs2 = gsAvtal?.km_ersattning_kr ?? 27.50;
    const trakHel = gsAvtal?.traktamente_hel_kr ?? 300;

    // Filtrera historik på aktuell månad
    const nu = new Date();
    const lönePeriod = `${nu.getFullYear()}-${String(nu.getMonth()+1).padStart(2,"0")}`;
    const månadsHistorik = historik.filter(d => d.datum && d.datum.startsWith(lönePeriod));

    // Extra tid filtrerad på månad
    const månadsExtraTid = extraTidData.filter(e => e.datum && e.datum.startsWith(lönePeriod));
    const extraTidMin = månadsExtraTid.reduce((a,e) => a + (e.minuter || 0), 0);
    const debiterbarExtraTid = månadsExtraTid.filter(e => e.debiterbar);

    // Beräkna från faktiska dagar i filtrerad historik + extra tid
    const arbetsdagar = månadsHistorik.length || 21;
    const jobbadMin2 = månadsHistorik.reduce((a,d) => a + (d.arbetad_min || 0), 0) + extraTidMin;
    const extraTidH = Math.round(extraTidMin/60*10)/10;
    const jobbadH = månadsHistorik.length > 0 || extraTidMin > 0 ? Math.round(jobbadMin2/60*10)/10 : 0;
    const målH = arbetsdagar * 8;
    const övH = Math.max(0, jobbadH - målH);
    const övKr = Math.round(övH * overtidKrPerTim);
    const totalKm = månadsHistorik.reduce((a,d) => a + (d.km_totalt || d.km_morgon || 0) + (d.km_kvall || 0), 0);
    const löneErsKm = Math.max(0, totalKm - frikm2*arbetsdagar);
    const löneErsKr = Math.round(löneErsKm * kmErs2 / 10); // kmErs2 är kr/mil, dela med 10 för kr/km
    const trakDagar = månadsHistorik.filter(d => d.traktamente).length;
    const trakKr = trakDagar * trakHel;
    const redigeringar = Object.entries(redDagar);

    const skickaLön = async () => {
      setLönSparar(true);
      setLönFel("");
      try {
        const underlag = {
          medarbetare_id: medarbetare.id,
          namn: medarbetare.namn,
          maskin_id: medarbetare.maskin_id,
          maskin: maskinNamn || '',
          period: lönePeriod,
          arbetsdagar,
          mal_timmar: målH,
          jobbade_timmar: jobbadH,
          overtid_timmar: övH,
          overtid_kr: övKr,
          total_km: totalKm,
          ersattnings_km: löneErsKm,
          korkostnad_kr: löneErsKr,
          traktamente_dagar: trakDagar,
          traktamente_kr: trakKr,
          redigeringar: redigeringar.map(([datum,v])=>({datum,anledning:v.anl})),
          skickat_av: medarbetare.namn,
          skickat_tidpunkt: new Date().toISOString(),
          status: "inskickat",
        };
        const { error } = await supabase.from("loneunderlag").upsert(underlag);
        if(error) throw error;
        setLönSkickat(true);
        setLönSparar(false);
      } catch(e) {
        setLönFel("Kunde inte spara — kontrollera anslutningen.");
        setLönSparar(false);
      }
    };

    // Build weekly breakdown from historik — filtered to current month
    const månadsPrefix = lönePeriod; // "YYYY-MM"
    const löneRödaDagar = getRödaDagar(nu.getFullYear());
    const veckoData: Record<number, { dagar: {datum:string;min:number;rödDag?:string}[]; sumH:number; helglönH:number }> = {};
    historik.filter(d => d.datum && d.datum.startsWith(månadsPrefix)).forEach(d => {
      const date = new Date(d.datum);
      const dayOfYear = Math.floor((date.getTime() - new Date(date.getFullYear(),0,1).getTime()) / 86400000);
      const weekNum = Math.ceil((dayOfYear + new Date(date.getFullYear(),0,1).getDay()) / 7);
      if(!veckoData[weekNum]) veckoData[weekNum] = { dagar:[], sumH:0, helglönH:0 };
      const m = d.arbetad_min || 0;
      veckoData[weekNum].dagar.push({ datum:d.datum, min:m });
      veckoData[weekNum].sumH += m/60;
    });
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
      // Lägg till röd dag om den inte redan finns som arbetsdag
      if(!veckoData[weekNum].dagar.find(x=>x.datum===k)){
        veckoData[weekNum].dagar.push({datum:k,min:0,rödDag:rödNamn});
      }
      // Helglön: röd dag på vardag
      const dow=dt.getDay();
      if(dow!==0&&dow!==6) veckoData[weekNum].helglönH+=8;
    }
    // Sort dagar within each week
    Object.values(veckoData).forEach(w=>w.dagar.sort((a,b)=>a.datum.localeCompare(b.datum)));
    const sortedWeeks = Object.entries(veckoData).sort(([a],[b]) => Number(a)-Number(b));
    const totalHelglönH = Object.values(veckoData).reduce((a,w)=>a+w.helglönH,0);
    const totalHelglönDagar = Math.round(totalHelglönH/8);

    // Build objekt/maskin aggregation — filtered to current month
    const maskinAgg: Record<string,{namn:string;maskin:string;dagar:number}> = {};
    månadsHistorik.forEach(d => {
      if(!d.maskin_id) return;
      const key = d.maskin_id + (d.objekt_id||'');
      if(!maskinAgg[key]) {
        const objNamn = d.objekt_id ? (objektLista.find(o=>o.id===d.objekt_id)?.namn || '') : '';
        const mNamn = maskinNamnMap[d.maskin_id] || d.maskin_id;
        maskinAgg[key] = { namn:objNamn, maskin:mNamn, dagar:0 };
      }
      maskinAgg[key].dagar++;
    });
    const objektEntries = Object.values(maskinAgg).sort((a,b) => b.dagar-a.dagar);

    const bottomNav = (
      <nav style={{ position:"fixed",bottom:0,left:0,width:"100%",height:80,display:"flex",justifyContent:"space-around",alignItems:"center",padding:"0 16px 8px",background:"rgba(31,31,31,0.7)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",zIndex:50,borderRadius:"16px 16px 0 0",boxShadow:"0 -4px 40px rgba(226,226,226,0.06)" }}>
        {[
          {icon:"today",label:"Dag",action:()=>setSteg("morgon"),active:false},
          {icon:"calendar_today",label:"Kalender",action:()=>setSteg("kalender"),active:false},
          {icon:"payments",label:"Löneunderlag",action:()=>{},active:true},
          {icon:"settings",label:"Inställningar",action:()=>setSteg("inst"),active:false},
        ].map(n=>(
          <button key={n.label} onClick={n.action} style={{ display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",color:n.active?"#adc6ff":"#8b90a0",background:n.active?"#1f1f1f":"none",border:"none",cursor:"pointer",fontFamily:"inherit",borderRadius:12,height:56,width:64,padding:0 }}>
            <span className="material-symbols-outlined" style={{ fontSize:24,marginBottom:2,fontVariationSettings:n.active?"'FILL' 1":"'FILL' 0" }}>{n.icon}</span>
            <span style={{ fontSize:10,fontWeight:n.active?600:500 }}>{n.label}</span>
          </button>
        ))}
      </nav>
    );

    // ─── DETALJER-VY ───
    if(lönVy==='detaljer') {
      const dagNamn = ['söndag','måndag','tisdag','onsdag','torsdag','fredag','lördag'];
      const månNamn = ['jan','feb','mar','apr','maj','jun','jul','aug','sep','okt','nov','dec'];
      return (
        <div style={{ minHeight:"100vh",background:"#131313",color:"#e2e2e2",fontFamily:"'Inter',-apple-system,sans-serif",WebkitFontSmoothing:"antialiased" }}>
          <style>{css}</style>
          <header style={{ position:"fixed",top:0,width:"100%",zIndex:50,background:"rgba(19,19,19,0.7)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",display:"flex",alignItems:"center",padding:"0 16px",height:64 }}>
            <button onClick={()=>setLönVy('översikt')} style={{ background:"none",border:"none",cursor:"pointer",padding:"8px 12px 8px 8px",fontFamily:"inherit",display:"flex",alignItems:"center",gap:4 }}>
              <span className="material-symbols-outlined" style={{ color:"#adc6ff",fontSize:20 }}>chevron_left</span>
              <span style={{ color:"#adc6ff",fontSize:15,fontWeight:500 }}>Löneunderlag</span>
            </button>
            <div style={{ flex:1,display:"flex",alignItems:"center",justifyContent:"flex-end",gap:8 }}>
              <span className="material-symbols-outlined" style={{ color:"#adc6ff",cursor:"pointer",fontSize:20 }}>chevron_left</span>
              <span style={{ fontSize:15,fontWeight:600,color:"#e2e2e2" }}>{månadsNamn()}</span>
              <span className="material-symbols-outlined" style={{ color:"#adc6ff",cursor:"pointer",fontSize:20 }}>chevron_right</span>
            </div>
          </header>

          <main style={{ paddingTop:80,paddingBottom:128,padding:"80px 16px 128px",maxWidth:640,margin:"0 auto" }}>

            {/* Timmar per vecka */}
            <section style={{ marginBottom:32 }}>
              <h2 style={{ ...secHead,marginBottom:16,marginLeft:4 }}>Timmar per vecka</h2>
              <div style={{ display:"flex",flexDirection:"column",gap:16 }}>
                {sortedWeeks.map(([weekNum, week]) => {
                  const firstDay = week.dagar.sort((a,b)=>a.datum.localeCompare(b.datum))[0];
                  const lastDay = week.dagar[week.dagar.length-1];
                  const fd = firstDay ? new Date(firstDay.datum) : null;
                  const ld = lastDay ? new Date(lastDay.datum) : null;
                  const rangeStr = fd && ld ? `(${fd.getDate()}-${ld.getDate()} ${månNamn[fd.getMonth()]})` : '';
                  return (
                    <div key={weekNum} style={{ background:"#1c1c1e",borderRadius:12,padding:20 }}>
                      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:16 }}>
                        <h3 style={{ margin:0,fontSize:15,fontWeight:600,color:"#e2e2e2" }}>Vecka {weekNum} <span style={{ color:"#8b90a0",fontWeight:400,fontSize:14 }}>{rangeStr}</span></h3>
                        <div style={{ display:"flex",alignItems:"baseline",gap:4 }}>
                          <span style={{ fontSize:24,fontWeight:700,color:"#adc6ff" }}>{Math.round(week.sumH*10)/10}{week.helglönH>0?` + ${week.helglönH}`:''}</span>
                          <span style={{ fontSize:12,color:"#8b90a0" }}>tim{week.helglönH>0?' (inkl helglön)':''}</span>
                        </div>
                      </div>
                      <div style={{ display:"flex",flexDirection:"column",gap:12 }}>
                        {week.dagar.map(dag => {
                          const dt = new Date(dag.datum);
                          const h = Math.round(dag.min/60*10)/10;
                          const dagLabel = dagNamn[dt.getDay()].charAt(0).toUpperCase()+dagNamn[dt.getDay()].slice(1)+' '+dt.getDate()+' '+månNamn[dt.getMonth()];
                          if(dag.rödDag) {
                            const dow=dt.getDay();
                            const ärVardag=dow!==0&&dow!==6;
                            return (
                            <div key={dag.datum} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid rgba(255,255,255,0.03)" }}>
                              <span style={{ fontSize:14,color:"#ff453a" }}>{dagLabel}</span>
                              <span style={{ fontSize:13,fontWeight:500,color:ärVardag?"#ff453a":"#636366" }}>{dag.rödDag}{ärVardag?' — Helglön 8h':''}</span>
                            </div>
                          );}
                          return (
                            <div key={dag.datum} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid rgba(255,255,255,0.03)" }}>
                              <span style={{ fontSize:14 }}>{dagLabel}</span>
                              <div style={{ display:"flex",alignItems:"center",gap:12 }}>
                                <span style={{ fontSize:14,fontWeight:500 }}>{h} tim</span>
                                <div style={{ width:6,height:6,borderRadius:"50%",background:"#fff" }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                {sortedWeeks.length===0&&<p style={{ color:"#8b90a0",fontSize:14,padding:20 }}>Ingen data för perioden</p>}
              </div>
            </section>

            {/* Körning */}
            <section style={{ marginBottom:32 }}>
              <h2 style={{ ...secHead,marginBottom:16,marginLeft:4 }}>Körning</h2>
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:16 }}>
                <div style={{ gridColumn:"1/-1",background:"#1c1c1e",borderRadius:12,padding:20,display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                  <div><p style={{ fontSize:12,color:"#8b90a0",margin:"0 0 4px" }}>Total körning</p><p style={{ fontSize:20,fontWeight:600,margin:0 }}>{totalKm} km</p></div>
                  <div style={{ textAlign:"right" }}><p style={{ fontSize:12,color:"#8b90a0",margin:"0 0 4px" }}>Ersättning</p><p style={{ fontSize:20,fontWeight:700,color:"#adc6ff",margin:0 }}>{löneErsKr} kr</p></div>
                </div>
                <div style={{ background:"#1c1c1e",borderRadius:12,padding:16,border:"1px solid rgba(255,255,255,0.03)" }}>
                  <p style={{ fontSize:12,color:"#8b90a0",margin:"0 0 4px" }}>Ersättningsgrundande</p><p style={{ fontSize:18,fontWeight:500,margin:0 }}>{löneErsKm} km</p>
                </div>
                <div style={{ background:"#1c1c1e",borderRadius:12,padding:16,border:"1px solid rgba(255,255,255,0.03)" }}>
                  <p style={{ fontSize:12,color:"#8b90a0",margin:"0 0 4px" }}>Pris/km</p><p style={{ fontSize:18,fontWeight:500,margin:0 }}>{kmErs2} kr</p>
                </div>
              </div>
            </section>

            {/* Objekt och maskin */}
            <section>
              <h2 style={{ ...secHead,marginBottom:16,marginLeft:4 }}>Objekt och maskin</h2>
              <div style={{ display:"flex",flexDirection:"column",gap:12 }}>
                {objektEntries.map((o,i) => (
                  <div key={i} style={{ background:"#1c1c1e",borderRadius:12,padding:20,display:"flex",alignItems:"center",gap:16 }}>
                    <div style={{ width:40,height:40,borderRadius:"50%",background:"rgba(75,142,255,0.2)",display:"flex",alignItems:"center",justifyContent:"center" }}>
                      <span className="material-symbols-outlined" style={{ color:"#adc6ff",fontSize:20 }}>precision_manufacturing</span>
                    </div>
                    <div>
                      <p style={{ margin:0,fontSize:14,fontWeight:500 }}>{o.namn ? `${o.namn} / ${o.maskin}` : o.maskin}</p>
                      <p style={{ margin:"2px 0 0",fontSize:12,color:"#8b90a0" }}>{o.dagar} {o.dagar===1?'dag':'dagar'}</p>
                    </div>
                  </div>
                ))}
                {objektEntries.length===0&&<p style={{ color:"#8b90a0",fontSize:14,padding:20 }}>Inga objekt denna period</p>}
              </div>
            </section>

            {/* Extra tid per aktivitet */}
            {månadsExtraTid.length>0&&(()=>{
              type AggExtra = { typ:string; minTot:number; deb:boolean; antal:number; poster:any[] };
              const grupper = new Map<string, AggExtra>();
              for(const e of månadsExtraTid) {
                const key = (e.aktivitet_typ || 'annat') + '|' + (e.debiterbar ? '1' : '0');
                if(!grupper.has(key)) grupper.set(key, { typ: e.aktivitet_typ || 'annat', minTot:0, deb: !!e.debiterbar, antal:0, poster:[] });
                const g = grupper.get(key)!;
                g.minTot += e.minuter||0;
                g.antal++;
                g.poster.push(e);
              }
              const grupperArr = Array.from(grupper.values()).sort((a,b)=>b.minTot-a.minTot);
              return (
                <section style={{ marginBottom:32 }}>
                  <h2 style={{ ...secHead,marginBottom:16,marginLeft:4 }}>Extra tid per aktivitet</h2>
                  <div style={{ background:"#1c1c1e",borderRadius:12,padding:"4px 20px",marginBottom:12 }}>
                    {grupperArr.map((g,i) => {
                      const h = Math.floor(g.minTot/60), m = g.minTot%60;
                      const tidStr = h > 0 ? `${h} tim${m > 0 ? ' ' + m + ' min' : ''}` : `${m} min`;
                      return (
                        <div key={i} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 0",borderBottom:i<grupperArr.length-1?"1px solid rgba(255,255,255,0.04)":"none" }}>
                          <div style={{ display:"flex",alignItems:"center",gap:10,flex:1,minWidth:0 }}>
                            <span className="material-symbols-outlined" style={{ color:g.deb?"#ff9f0a":"#8e8e93",fontSize:18 }}>{aktIcon(g.typ)}</span>
                            <span style={{ fontSize:14,color:"#fff" }}>{aktLabel(g.typ)}{g.deb?'':''}</span>
                            {g.deb&&<span style={{ fontSize:10,fontWeight:700,color:"#ff9f0a",letterSpacing:"0.05em" }}>DEB</span>}
                          </div>
                          <span style={{ fontSize:14,fontWeight:600,color:"#fff" }}>{tidStr}</span>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })()}

            {/* Debiterbar tid — detaljerad lista */}
            {debiterbarExtraTid.length>0&&(
              <section style={{ marginBottom:32 }}>
                <h2 style={{ ...secHead,marginBottom:16,marginLeft:4 }}>Debiterbar tid (detaljer)</h2>
                <div style={{ display:"flex",flexDirection:"column",gap:12 }}>
                  {debiterbarExtraTid.map((e,i) => {
                    const objNamn = e.objekt_id ? (objektLista.find(o=>o.id===e.objekt_id)?.namn || e.objekt_id) : '–';
                    const h = Math.floor((e.minuter||0)/60), m = (e.minuter||0)%60;
                    const tidStr = h > 0 ? `${h} tim ${m > 0 ? m + ' min' : ''}` : `${m} min`;
                    return (
                      <div key={i} style={{ background:"#1c1c1e",borderRadius:12,padding:20,display:"flex",alignItems:"flex-start",gap:16 }}>
                        <div style={{ width:40,height:40,borderRadius:"50%",background:"rgba(255,149,0,0.15)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
                          <span className="material-symbols-outlined" style={{ color:"#ff9f0a",fontSize:20 }}>{aktIcon(e.aktivitet_typ)}</span>
                        </div>
                        <div style={{ flex:1,minWidth:0 }}>
                          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:4 }}>
                            <p style={{ margin:0,fontSize:14,fontWeight:600 }}>{aktLabel(e.aktivitet_typ)} · {objNamn}</p>
                            <span style={{ fontSize:14,fontWeight:600,flexShrink:0,marginLeft:8 }}>{tidStr}</span>
                          </div>
                          <p style={{ margin:0,fontSize:12,color:"#8b90a0" }}>{e.datum}{e.aktivitet_text ? ` · ${e.aktivitet_text}` : (e.kommentar ? ` · ${e.kommentar}` : '')}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </main>
          {bottomNav}
        </div>
      );
    }

    // ─── ÖVERSIKT-VY ───
    return (
      <div style={{ minHeight:"100vh",background:"#000",color:"#e2e2e2",fontFamily:"'Inter',-apple-system,sans-serif",WebkitFontSmoothing:"antialiased",display:"flex",flexDirection:"column" }}>
        <style>{css}</style>

        {/* Header */}
        <header style={{ position:"fixed",top:0,width:"100%",zIndex:50,background:"rgba(0,0,0,0.8)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",display:"flex",justifyContent:"space-between",alignItems:"center",padding:"0 24px",height:64 }}>
          <div style={{ display:"flex",alignItems:"center",gap:16 }}>
            <button onClick={()=>{setSteg("morgon");setLönVy('översikt');}} style={{ background:"none",border:"none",cursor:"pointer",padding:8,borderRadius:"50%" }}>
              <span className="material-symbols-outlined" style={{ color:"#adc6ff" }}>chevron_left</span>
            </button>
            <h1 style={{ margin:0,fontSize:18,fontWeight:600,color:"#e2e2e2",letterSpacing:"-0.02em" }}>{månadsNamn()}</h1>
            <button onClick={()=>{}} style={{ background:"none",border:"none",cursor:"pointer",padding:8,borderRadius:"50%" }}>
              <span className="material-symbols-outlined" style={{ color:"#adc6ff" }}>chevron_right</span>
            </button>
          </div>
          <span className="material-symbols-outlined" style={{ color:"#adc6ff" }}>calendar_month</span>
        </header>

        <main style={{ paddingTop:96,paddingBottom:192,padding:"96px 16px 192px",maxWidth:448,margin:"0 auto",width:"100%" }}>

          {/* Summary Card */}
          <section style={{ background:"#1c1c1e",borderRadius:12,padding:24,marginBottom:32,boxShadow:"0 4px 40px rgba(0,0,0,0.4)" }}>
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20 }}>
              <p style={{ margin:0,fontSize:13,fontWeight:500,color:"#8b90a0" }}>Status</p>
              {lönSkickat ? (
                <span style={{ display:"inline-flex",alignItems:"center",padding:"4px 10px",borderRadius:20,background:"rgba(52,199,89,0.1)",color:C.green,fontSize:11,fontWeight:600,border:"1px solid rgba(52,199,89,0.2)",letterSpacing:"0.05em",textTransform:"uppercase" }}>Skickat</span>
              ) : (
                <span style={{ display:"inline-flex",alignItems:"center",padding:"4px 10px",borderRadius:20,background:"rgba(255,149,0,0.1)",color:C.orange,fontSize:11,fontWeight:600,border:"1px solid rgba(255,149,0,0.2)",letterSpacing:"0.05em",textTransform:"uppercase" }}>Ej skickat</span>
              )}
            </div>
            <div style={{ display:"flex",flexDirection:"column",gap:16,paddingTop:8 }}>
              {[
                ["Jobbat",`${jobbadH} tim`],
                ["Mål",`${målH} tim`],
                ...(övH > 0 ? [["Övertid",`${övH} tim`]] : []),
                ...(extraTidH > 0 ? [["Extra tid",`${extraTidH} tim`]] : []),
                ["Traktamente",`${trakDagar} dagar`],
                ...(totalHelglönH>0?[["Helglön",`${totalHelglönDagar} dagar (${totalHelglönH}h)`]]:[]),
                ["Körersättning",`${löneErsKr} kr`],
              ].map(([l,v])=>(
                <div key={l as string} style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                  <span style={{ fontSize:15,color:"#e2e2e2" }}>{l}</span>
                  <span style={{ fontSize:17,fontWeight:600,color:"#fff" }}>{v}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Se detaljer-länk */}
          <div style={{ padding:"0 4px",marginBottom:32 }}>
            <button onClick={()=>setLönVy('detaljer')} style={{ display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",background:"none",border:"none",cursor:"pointer",padding:"4px 0",fontFamily:"inherit" }}>
              <span style={{ fontSize:15,fontWeight:500,color:"#adc6ff" }}>Se detaljer</span>
              <span className="material-symbols-outlined" style={{ color:"#adc6ff",fontSize:18 }}>arrow_forward</span>
            </button>
          </div>

          {/* Fel */}
          {lönFel&&(
            <div style={{ background:"rgba(255,59,48,0.08)",borderRadius:12,padding:"12px 16px",marginBottom:16,border:"1px solid rgba(255,59,48,0.2)" }}>
              <p style={{ margin:0,fontSize:14,color:C.red }}>{lönFel}</p>
            </div>
          )}

          {/* Action */}
          <div style={{ paddingTop:32 }}>
            {!lönSkickat?(
              <button onClick={skickaLön} disabled={lönSparar} style={{ width:"100%",height:56,background:"#1c1c1e",color:"#fff",border:"none",borderRadius:12,fontSize:18,fontWeight:700,cursor:"pointer",fontFamily:"inherit",opacity:lönSparar?0.6:1,boxShadow:"0 4px 40px rgba(0,0,0,0.4)" }}>
                {lönSparar?"Sparar...":"Skicka löneunderlag"}
              </button>
            ):(
              <button disabled style={{ width:"100%",height:56,background:C.green,color:"#fff",border:"none",borderRadius:12,fontSize:18,fontWeight:700,fontFamily:"inherit" }}>
                ✓ Skickat
              </button>
            )}
            <p style={{ textAlign:"center",fontSize:13,color:"#8b90a0",margin:"12px 0 0" }}>Skickas till din chef</p>
          </div>
        </main>
        {bottomNav}
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
    <div style={shell}><style>{css}</style>
      <div style={topBar}>
        <div style={{ display:"flex",alignItems:"center",gap:14 }}>
          <BackBtn onClick={()=>setSteg("morgon")}/>
          <h1 style={{ margin:0,fontSize:26,fontWeight:700 }}>Inställningar</h1>
        </div>
      </div>
      <div style={{ flex:1,paddingTop:16,paddingBottom:100,overflowY:"auto" }}>
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
        {btBil&&<div style={{ background:"rgba(52,199,89,0.08)",borderRadius:10,padding:"10px 14px",display:"flex",alignItems:"center",gap:8 }}>
          <div style={{ width:8,height:8,borderRadius:"50%",background:C.green,flexShrink:0 }}/>
          <p style={{ margin:0,fontSize:13,color:C.green,fontWeight:500 }}>{btBil} ansluten</p>
        </div>}

        <Card onClick={()=>setSteg("avtal")} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:24 }}>
          <div>
            <p style={{ margin:0,fontSize:16,fontWeight:500 }}>Mitt avtal</p>
            <p style={{ margin:"2px 0 0",fontSize:13,color:C.label }}>{gsAvtal?.namn || 'GS-avtalet'}</p>
          </div>
          <ChevronRight/>
        </Card>

        {/* Påminnelser */}
        <div style={{ marginTop:32 }}><Label>Påminnelser</Label></div>
        {(() => {
          const uppdatera = async (field: string, value: any) => {
            await supabase.from("medarbetare").update({ [field]: value }).eq("id", medarbetare.id);
            setMedarbetare((m: any) => ({ ...m, [field]: value }));
            setSparatToast(true); setTimeout(() => setSparatToast(false), 1800);
          };

          const togglePush = async (on: boolean) => {
            await uppdatera("push_aktiv", on);
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
            <div onClick={onClick} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 0",borderBottom:`1px solid ${C.line}`,cursor:onClick?"pointer":"default" }}>
              <div>
                <p style={{ margin:0,fontSize:16,fontWeight:500,color:"#fff" }}>{rubrik}</p>
                {undertext && <p style={{ margin:"2px 0 0",fontSize:13,color:C.label }}>{undertext}</p>}
              </div>
              <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                {value && <span style={{ fontSize:15,fontWeight:600,color:"#fff" }}>{value}</span>}
                {right || (onClick && <ChevronRight/>)}
              </div>
            </div>
          );

          const Toggle = ({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) => (
            <div onClick={()=>onChange(!on)}
              style={{ width:51,height:31,borderRadius:16,background:on?C.green:"rgba(120,120,128,0.3)",cursor:"pointer",position:"relative",transition:"background 0.2s",flexShrink:0 }}>
              <div style={{ width:27,height:27,borderRadius:"50%",background:"#fff",position:"absolute",top:2,left:on?22:2,transition:"left 0.2s",boxShadow:"0 2px 4px rgba(0,0,0,0.2)" }}/>
            </div>
          );

          const OptionGrid = ({ opts, selected, onPick, cols=4 }: any) => (
            <div style={{ display:"grid",gridTemplateColumns:`repeat(${cols},1fr)`,gap:6,padding:"10px 0 14px" }}>
              {opts.map((o: any) => {
                const valt = o.v === selected;
                return (
                  <button key={o.l} onClick={()=>onPick(o.v)}
                    style={{ background:valt?"rgba(173,198,255,0.12)":"rgba(255,255,255,0.04)",border:valt?"1px solid rgba(173,198,255,0.3)":"1px solid rgba(255,255,255,0.06)",borderRadius:10,padding:"10px 4px",color:valt?"#adc6ff":"#fff",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit" }}>
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
                  <p style={{ margin:0,fontSize:16,fontWeight:500,color:"#fff" }}>Daglig påminnelse</p>
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
                  <p style={{ margin:0,fontSize:16,fontWeight:500,color:"#fff" }}>Push-notiser</p>
                  <p style={{ margin:"2px 0 0",fontSize:13,color:C.label }}>{pushOn ? (pushEnhetsNamn ? `Aktiverad · ${pushEnhetsNamn.slice(0,40)}` : 'Aktiverad ✓') : 'Avstängd'}</p>
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
      {sparatToast&&<div style={{ position:"fixed",bottom:100,left:"50%",transform:"translateX(-50%)",background:"#1c1c1e",border:"1px solid rgba(255,255,255,0.1)",borderRadius:12,padding:"10px 20px",fontSize:14,fontWeight:500,color:"#fff",animation:"fadeUp 0.3s ease",zIndex:100 }}>Sparat</div>}
      <BottomNavBar aktiv="inst" onNav={s=>setSteg(s)} />
    </div>
  );}


  /* ─── MITT AVTAL ─── */
  if(steg==="avtal") return (
    <div style={shell}><style>{css}</style>
      <div style={topBar}>
        <div style={{ display:"flex",alignItems:"center",gap:14 }}>
          <BackBtn onClick={()=>setSteg("inst")}/>
          <div>
            <h1 style={{ margin:0,fontSize:26,fontWeight:700 }}>Mitt avtal</h1>
            <p style={{ margin:"4px 0 0",fontSize:13,color:C.label }}>{gsAvtal?.namn || 'Skogsavtalet 2025-2027'}</p>
          </div>
        </div>
      </div>
      <div style={{ flex:1,overflowY:"auto",paddingTop:16,paddingBottom:100 }}>
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
                  <span style={{ fontSize:14,color:C.label,flex:1 }}>{l}</span>
                  <span style={{ fontSize:14,fontWeight:600,textAlign:"right",maxWidth:"55%",marginLeft:12 }}>{v}</span>
                </div>
              ))}
            </Card>
          </div>
        ))}
        <button onClick={()=>window.open('/avtal/skogsavtalet-2025-2027.pdf','_blank')} style={{ width:"100%",height:48,background:"#2a2a2a",border:"none",borderRadius:12,color:"#fff",fontSize:15,fontWeight:600,cursor:"pointer",fontFamily:"inherit",marginBottom:16 }}>
          Läs hela avtalet →
        </button>
        <div style={{ background:"rgba(10,132,255,0.08)",borderRadius:14,padding:"14px 16px",marginBottom:24,border:"1px solid rgba(10,132,255,0.15)" }}>
          <p style={{ margin:0,fontSize:13,color:C.blue,fontWeight:500 }}>Värdena hämtas från Supabase och uppdateras automatiskt om avtalet ändras.</p>
        </div>
      </div>
    </div>
  );

  /* ─── KALENDER ─── */

  /* ─── STOPPURS (tid på objekt under dag) ─── */
  if(steg==="stoppurs") return (
    <ExtraTidSkärm
      initial={extra[0]||null}
      objekt={objektLista}
      harBefintlig={extra.length>0}
      onSpara={e=>{setExtra([e]);setSteg("dag");}}
      onTaBort={()=>{setExtra([]);setSteg("dag");}}
      onAvbryt={()=>setSteg("dag")}
    />
  );





  /* ─── FRÅNVARO ─── */
  if(steg==="bekräftaFrånvaro") return (
    <div style={shell}><style>{css}</style>
      <div style={topBar}><p style={{ margin:0,fontSize:15,color:C.label }}>{datumStr}</p></div>
      <div style={mid}>
        <div style={{ width:80,height:80,borderRadius:24,background:"rgba(255,255,255,0.08)",display:"flex",alignItems:"center",justifyContent:"center",marginBottom:28,animation:"scalePop 0.4s ease" }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
            <path d={dagTyp==="sjuk"?"M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15v-4H7l5-8v4h4l-5 8z":"M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"} fill="#8e8e93"/>
          </svg>
        </div>
        <h1 style={{ fontSize:28,fontWeight:700,margin:"0 0 10px" }}>{dagTyp==="sjuk"?"Krya på dig":dagTyp==="atk"?"ATK-dag":dagTyp==="semester"?"Semester":"Hoppas barnet mår bättre"}</h1>
        <p style={{ fontSize:16,color:C.label }}>{dagTyp==="sjuk"?"Sjukanmälan":dagTyp==="atk"?"ATK":dagTyp==="semester"?"Semester":"VAB"} registreras för {datumStr}</p>
      </div>
      <div style={bottom}>
        <button style={btn.primary} onClick={async()=>{
          await supabase.from("arbetsdag").upsert({
            medarbetare_id:medarbetare.id,
            datum:new Date().toISOString().split("T")[0],
            dagtyp:dagTyp,
            bekraftad:true,
            bekraftad_tid:new Date().toISOString(),
          });
          setSteg("klarFrånvaro");
        }}>Bekräfta</button>
        <button style={{ ...btn.textBack, marginTop:2 }} onClick={()=>setSteg("morgon")}>Ångra och gå tillbaka</button>
      </div>
    </div>
  );

  if(steg==="klarFrånvaro") return (
    <div style={shell}><style>{css}</style>
      <div style={topBar}><p style={{ margin:0,fontSize:15,color:C.label }}>{datumStr}</p></div>
      <div style={mid}>
        <div style={{ animation:"scalePop 0.4s ease",marginBottom:28 }}><CheckCircle/></div>
        <h1 style={{ fontSize:28,fontWeight:700,margin:"0 0 10px" }}>Registrerat</h1>
        <p style={{ fontSize:16,color:C.label }}>{dagTyp==="sjuk"?"Sjukanmälan":dagTyp==="atk"?"ATK":dagTyp==="semester"?"Semester":"VAB"} för {datumStr}</p>
      </div>
      <div style={bottom}><button style={btn.secondary} onClick={()=>setSteg("morgon")}>Tillbaka</button></div>
    </div>
  );

  /* ─── MANUELL DAG ─── */
  if(steg==="manuellDag"){
    const titlar: Record<string,string>={service:"Service",utbildning:"Utbildning",annat:"Annat arbete",möte:"Möte"};
    const platsh={service:"Kommentar",utbildning:"Kommentar",annat:"Kommentar"};
    return (
      <div style={shell}><style>{css}</style>
        <div style={topBar}><div style={{ display:"flex",alignItems:"center",gap:14 }}><BackBtn onClick={()=>setSteg("morgon")}/><h1 style={{ margin:0,fontSize:24,fontWeight:700 }}>{titlar[dagTyp]}</h1></div></div>
        <div style={{ flex:1,paddingTop:20,overflowY:"auto" }}>
          <div style={{ marginBottom:24 }}>
            <Label>Vad gör du?</Label>
            <input placeholder={platsh[dagTyp]} value={mBesk} onChange={e=>setMBesk(e.target.value)} style={input}/>
          </div>
          <TimePicker value={mStart} onChange={setMStart} label="Starttid"/>
          <div style={{ background:"rgba(52,199,89,0.07)",borderRadius:12,padding:"12px 16px" }}>
            <p style={{ margin:0,fontSize:14,color:C.green,fontWeight:500 }}>Sluttid och rast fyller du i när dagen är slut</p>
          </div>
        </div>
        <div style={bottom}>
          <button style={{ ...btn.primary,opacity:mBesk?1:0.35 }} disabled={!mBesk}
            onClick={()=>{setStart(mStart);setSlut("");setSteg("manuellPågår");}}>
            Starta arbetet
          </button>
        </div>
      </div>
    );
  }

  if(steg==="manuellPågår") return (
    <div style={shell}><style>{css}</style>
      <div style={{ ...topBar,display:"flex",justifyContent:"space-between",alignItems:"flex-start" }}>
        <p style={{ margin:0,fontSize:15,color:C.label }}>{datumStr}</p>
        <button onClick={()=>setSteg("morgon")} style={{ width:36,height:36,borderRadius:10,background:"rgba(255,255,255,0.1)",border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center" }}>
          <svg width="16" height="12" viewBox="0 0 16 12" fill="none"><path d="M0 1h16M0 6h16M0 11h16" stroke="#fff" strokeWidth="1.8" strokeLinecap="round"/></svg>
        </button>
      </div>
      <div style={mid}>
        <div style={{ width:10,height:10,borderRadius:"50%",background:C.blue,marginBottom:28,animation:"pulseDot 2s infinite" }}/>
        <p style={{ fontSize:72,fontWeight:600,margin:0,letterSpacing:"-3px" }}>{start}</p>
        <p style={{ fontSize:16,color:C.label,margin:"10px 0 24px" }}>Arbetsdag startad</p>
        <div style={{ background:"rgba(255,255,255,0.06)",borderRadius:12,padding:"12px 24px" }}>
          <p style={{ margin:0,fontSize:15,fontWeight:600 }}>{mBesk}</p>
        </div>
      </div>
      <div style={bottom}>
        <button style={btn.secondary} onClick={()=>{setKmM({km:72});setKmK({km:72});setSteg("manuellKväll");}}>Avsluta dagen →</button>
      </div>
    </div>
  );

  if(steg==="manuellKväll") return (
    <div style={shell}><style>{css}</style>
      <div style={topBar}><div style={{ display:"flex",alignItems:"center",gap:14 }}><BackBtn onClick={()=>setSteg("manuellPågår")}/><h1 style={{ margin:0,fontSize:24,fontWeight:700 }}>Avsluta dagen</h1></div></div>
      <div style={{ flex:1,paddingTop:20,overflowY:"auto" }}>
        <Card style={{ marginBottom:24 }}><p style={{ margin:0,fontSize:14,color:C.label }}>Startade</p><p style={{ margin:"4px 0 0",fontSize:20,fontWeight:600 }}>{start}</p></Card>
        <TimePicker value={mSlut} onChange={setMSlut} label="Sluttid"/>
        <MinPicker  value={mRast} onChange={setMRast} label="Rast"/>
        <div style={{ textAlign:"center",padding:20,background:"rgba(52,199,89,0.07)",borderRadius:14,marginBottom:24 }}>
          <Label>Arbetstid</Label>
          <p style={{ margin:0,fontSize:36,fontWeight:700,color:C.green }}>{fmt(Math.max(0,tim(start,mSlut)-mRast))}</p>
        </div>
      </div>
      <div style={bottom}>
        <button style={btn.primary} onClick={()=>{setSlut(mSlut);setRast(mRast);setSteg("morgon");}}>Spara och fortsätt</button>
      </div>
    </div>
  );

  /* ─── REDIGERA HISTORIK ─── */
  if(steg==="redigera"&&redDag){
    const redArbMin = Math.max(0, tim(redStart,redSlut)-redRast);
    const harÄndrat = redStart!==(redDag.start||"00:00")||redSlut!==(redDag.slut||"00:00")||redRast!==(redDag.rast||0)||redKm!==(redDag.km||0)||(redObjektId&&redObjektId!==(redDag.objekt_id||null));

    if(redVy==="tid") return (
      <div style={shell}><style>{css}</style>
        <div style={topBar}><div style={{ display:"flex",alignItems:"center",gap:14 }}><BackBtn onClick={()=>setRedVy("översikt")}/><h1 style={{ margin:0,fontSize:24,fontWeight:700 }}>Ändra arbetstid</h1></div></div>
        <div style={{ flex:1,overflowY:"auto",paddingTop:24 }}>

          {/* Start, Slut, Rast — iOS-stil scroll-wheels */}
          <div style={{ background:C.card,borderRadius:16,padding:"20px 16px",marginBottom:16,display:"flex",flexDirection:"column",gap:18 }}>
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
                <span style={{ fontSize:14,color:C.label,fontWeight:600 }}>min</span>
              </div>
            </div>
          </div>

          {/* Resultat */}
          <div style={{ textAlign:"center",padding:"18px 20px",background:"rgba(52,199,89,0.07)",borderRadius:14 }}>
            <p style={{ margin:"0 0 4px",fontSize:12,fontWeight:700,color:C.label,textTransform:"none",letterSpacing:"0" }}>Arbetstid</p>
            <p style={{ margin:0,fontSize:44,fontWeight:700,color:C.green }}>{fmt(redArbMin)}</p>
          </div>
        </div>
        <div style={bottom}><button style={btn.primary} onClick={()=>setRedVy("översikt")}>Klar</button></div>
      </div>
    );

    if(redVy==="km") return (
      <div style={shell}><style>{css}</style>
        <div style={topBar}><div style={{ display:"flex",alignItems:"center",gap:14 }}><BackBtn onClick={()=>setRedVy("översikt")}/><h1 style={{ margin:0,fontSize:24,fontWeight:700 }}>Ändra körning</h1></div></div>
        <div style={{ flex:1,paddingTop:20 }}>
          <KmPicker value={redKm} onChange={setRedKm} label="Totalt"/>
          <div style={{ textAlign:"center",padding:20,background:"rgba(52,199,89,0.07)",borderRadius:14 }}>
            <Label>Körning</Label>
            <p style={{ margin:0,fontSize:44,fontWeight:700,color:C.green }}>{redKm} km</p>
            {redKmBerakning!=null&&redKmBerakning>0&&<p style={{ margin:"4px 0 0",fontSize:12,color:"#8e8e93" }}>Beräknat: {redKmBerakning} km (vägavstånd)</p>}
            {(()=>{ const över=Math.max(0,redKm-frikm); const mil=över>0?Math.ceil(över/10):0; const kr=Math.round(mil*fardtidPerMil*100)/100;
              return över>0
                ? <p style={{ margin:"8px 0 0",fontSize:15,color:C.green,fontWeight:600 }}>Färdtidsersättning: {över} km över {frikm} km = {mil} påbörjade mil × {fardtidPerMil.toString().replace('.',',')} kr = {kr.toFixed(2).replace('.',',')} kr</p>
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
      <div style={shell}><style>{css}</style>
        <div style={topBar}>
          <div style={{ display:"flex",alignItems:"center",gap:14 }}>
            <BackBtn onClick={()=>setSteg("kalender")}/>
            <div>
              <p style={{ margin:0,fontSize:13,color:C.blue,fontWeight:600 }}>Redigerad</p>
              <h1 style={{ margin:"4px 0 0",fontSize:26,fontWeight:700 }}>{redDatumDisplay}</h1>
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
                <span style={{ fontSize:15,color:C.label }}>{l}</span>
                <span style={{ fontSize:15,fontWeight:600,color:"#fff" }}>{v}</span>
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
                <span style={{ fontSize:15,color:C.label }}>{l}</span>
                <span style={{ fontSize:15,fontWeight:500,color:"rgba(0,0,0,0.35)",textDecoration:"line-through" }}>{v}</span>
              </div>
            ))}
          </Card>

          {sparadRed.anl&&(
            <div style={{ marginTop:20 }}>
              <Label>Anledning</Label>
              <Card><p style={{ margin:0,fontSize:15 }}>{sparadRed.anl}</p></Card>
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
      <div style={shell}><style>{css}</style>
        <div style={topBar}>
          <div style={{ display:"flex",alignItems:"center",gap:14 }}>
            <BackBtn onClick={()=>setSteg("kalender")}/>
            <div>
              <p style={{ margin:0,fontSize:13,color:C.label }}>{redMånadDisplay}</p>
              <h1 style={{ margin:"4px 0 0",fontSize:26,fontWeight:700 }}>{redDatumDisplay}</h1>
            </div>
          </div>
        </div>
        {(()=>{
          const harData = !!(redDag?.start_tid);
          return (<>
        <div style={{ flex:1,overflowY:"auto",paddingTop:8 }}>
          {!harData&&redStart==="00:00"&&redSlut==="00:00"&&redRast===0?(
            <Card style={{ padding:"24px 20px",textAlign:"center" as const }}>
              <p style={{ margin:"0 0 4px",fontSize:15,color:C.label }}>Ingen data från MOM</p>
              <p style={{ margin:0,fontSize:13,color:"#636366" }}>Lägg till arbetstid och körning manuellt</p>
            </Card>
          ):!harData?(
            <Card style={{ padding:"4px 20px" }}>
              <div onClick={()=>setRedVy("tid")} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 0",borderBottom:`1px solid ${C.line}`,cursor:"pointer" }}>
                <span style={{ fontSize:16,color:C.label }}>Arbetstid</span>
                <div style={{ display:"flex",alignItems:"center",gap:10 }}>
                  <span style={{ fontSize:16,fontWeight:600,color:C.orange }}>{fmt(redArbMin)}</span>
                  <ChevronRight/>
                </div>
              </div>
              <div onClick={()=>setRedVy("km")} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 0",cursor:"pointer" }}>
                <span style={{ fontSize:16,color:C.label }}>Körning</span>
                <div style={{ display:"flex",alignItems:"center",gap:10 }}>
                  <span style={{ fontSize:16,fontWeight:600,color:redKm>0?C.orange:C.ink }}>{redKm} km</span>
                  <ChevronRight/>
                </div>
              </div>
            </Card>
          ):(
            <Card style={{ padding:"4px 20px" }}>
              <div onClick={()=>setRedVy("tid")} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 0",borderBottom:`1px solid ${C.line}`,cursor:"pointer" }}>
                <span style={{ fontSize:16,color:C.label }}>Arbetstid</span>
                <div style={{ display:"flex",alignItems:"center",gap:10 }}>
                  <span style={{ fontSize:16,fontWeight:600,color:(redStart!==(redDag.start||"00:00")||redSlut!==(redDag.slut||"00:00")||redRast!==(redDag.rast||0))?C.orange:C.ink }}>{fmt(redArbMin)}</span>
                  <ChevronRight/>
                </div>
              </div>
              {/* Maskin — klickbar */}
              <div onClick={()=>setVisaRedMaskinVäljare(true)} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 0",borderBottom:`1px solid ${C.line}`,cursor:"pointer" }}>
                <span style={{ fontSize:16,color:C.label }}>Maskin</span>
                <div style={{ display:"flex",alignItems:"center",gap:10 }}>
                  <span style={{ fontSize:16,fontWeight:500,color:"#fff" }}>{(()=>{const m=redMaskinId?maskinNamnMap[redMaskinId]:null; return m||redDag.maskin_namn||redDag.maskin_id||"—";})()}</span>
                  <ChevronRight/>
                </div>
              </div>
              {/* Start + Slut */}
              {[
                ["Start", tidKort(redDag.start_tid)],
                ["Slut", tidKort(redDag.slut_tid)],
              ].map(([l,v])=>(
                <div key={l} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 0",borderBottom:`1px solid ${C.line}` }}>
                  <span style={{ fontSize:16,color:C.label }}>{l}</span>
                  <span style={{ fontSize:16,fontWeight:500,color:"#fff" }}>{v}</span>
                </div>
              ))}
              {/* Rast — klickbar */}
              <div onClick={()=>setVisaRedRastPicker(true)} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 0",borderBottom:`1px solid ${C.line}`,cursor:"pointer" }}>
                <span style={{ fontSize:16,color:C.label }}>Rast</span>
                <div style={{ display:"flex",alignItems:"center",gap:10 }}>
                  <span style={{ fontSize:16,fontWeight:500,color:redRast!==(redDag.rast_min||0)?"#ff9f0a":"#fff" }}>{redRast} min</span>
                  <ChevronRight/>
                </div>
              </div>
              {/* Objekt — klickbar */}
              <div onClick={()=>setVisaRedObjektVäljare(true)} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 0",borderBottom:`1px solid ${C.line}`,cursor:"pointer" }}>
                <span style={{ fontSize:16,color:C.label }}>Objekt</span>
                <div style={{ display:"flex",alignItems:"center",gap:10 }}>
                  <span style={{ fontSize:16,fontWeight:500,color:"#fff" }}>{(()=>{const o=redObjektId?objektLista.find(x=>x.id===redObjektId):null; return o?o.namn:(formatObjektNamn(redDag.objekt_namn)||redDag.objekt_id||"—");})()}</span>
                  <ChevronRight/>
                </div>
              </div>
              {redDag.extra>0&&(
                <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 0",borderBottom:redDag.trak?`1px solid ${C.line}`:"none" }}>
                  <span style={{ fontSize:16,color:C.label }}>Extra tid</span>
                  <span style={{ fontSize:16,fontWeight:600 }}>{redDag.extra} min</span>
                </div>
              )}
              {redDag.trak&&(
                <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 0" }}>
                  <span style={{ fontSize:16,color:C.label }}>Traktamente</span>
                  <span style={{ fontSize:16,fontWeight:600 }}>{gsAvtal?.traktamente_hel_kr ?? 300} kr</span>
                </div>
              )}
            </Card>
          )}

          {/* Körning — separat kort med morgon/kväll/total (eller segment-kedja) + färdtidsersättning */}
          {redDag?.start_tid&&(()=>{
            const över = Math.max(0, redKm - frikm);
            const mil  = över>0 ? Math.ceil(över/10) : 0;
            const kr   = Math.round(mil*fardtidPerMil*100)/100;
            const segs = redKmChain || [];
            const harFlerObjekt = segs.length > 2;

            // Radformat gemensamt för både 1-objekt- och multi-objekt-vyerna
            const rad = (label: string, value: string, bold=false) => (
              <div key={label} style={{ display:"flex",justifyContent:"space-between",padding:"6px 0" }}>
                <span style={{ color:"#fff",fontSize:15,fontWeight:bold?600:400 }}>{label}</span>
                <span style={{ color:"#fff",fontSize:bold?17:15,fontWeight:bold?700:600 }}>{value}</span>
              </div>
            );

            return (
              <Card onClick={()=>setRedVy("km")} style={{ padding:"16px 20px" }}>
                <p style={{ margin:"0 0 10px",fontSize:13,color:"rgba(255,255,255,0.6)",fontWeight:500 }}>Körning</p>

                {harFlerObjekt ? (
                  // Multi-objekt: visa varje segment som egen rad
                  segs.map((s, i) => {
                    const label = i === 0            ? `Morgon (→ ${s.toLabel})`
                                : i === segs.length-1 ? `Kväll (${s.fromLabel} →)`
                                :                       `Flytt (${s.fromLabel} → ${s.toLabel})`;
                    return rad(label, `${s.km} km`);
                  })
                ) : segs.length === 2 ? (
                  // 1-objekt via chain: segment[0] = morgon, segment[1] = kväll
                  <>{rad("Morgon", `${segs[0].km} km`)}{rad("Kväll", `${segs[1].km} km`)}</>
                ) : (
                  // Fallback: DB-split eller redKm/2
                  (()=>{
                    const harSplit = (redDag.km_morgon||0) > 0 || (redDag.km_kvall||0) > 0;
                    const morgonVisa = harSplit ? (redDag.km_morgon||0) : Math.round(redKm/2);
                    const kvallVisa  = harSplit ? (redDag.km_kvall||0)  : redKm - Math.round(redKm/2);
                    return <>{rad("Morgon", `${morgonVisa} km`)}{rad("Kväll", `${kvallVisa} km`)}</>;
                  })()
                )}

                <div style={{ borderTop:"1px solid rgba(255,255,255,0.1)",marginTop:6,paddingTop:10 }}>
                  {rad("Totalt", `${redKm} km`, true)}
                </div>
                {redKmBerakning!=null&&(
                  <p style={{ margin:"8px 0 0",fontSize:12,color:"rgba(255,255,255,0.4)" }}>Beräknat vägavstånd</p>
                )}
                {över>0&&(
                  <div style={{ borderTop:"1px solid rgba(255,255,255,0.1)",marginTop:10,paddingTop:10 }}>
                    <div style={{ display:"flex",justifyContent:"space-between",padding:"6px 0" }}>
                      <span style={{ color:"rgba(255,255,255,0.6)",fontSize:15 }}>Färdtidsersättning</span>
                      <span style={{ color:"#fff",fontSize:15,fontWeight:600 }}>{kr.toFixed(2).replace('.',',')} kr</span>
                    </div>
                    <p style={{ margin:"2px 0 0",fontSize:12,color:"rgba(255,255,255,0.4)" }}>
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
          {!harData&&redStart==="00:00"&&redSlut==="00:00"&&redRast===0?(
            <button style={btn.primary} onClick={()=>setRedVy("tid")}>Lägg till manuellt</button>
          ):harÄndrat?(
            <button
              style={{ ...btn.primary,opacity:!redAnl?0.35:1 }}
              disabled={!redAnl}
              onClick={async ()=>{
                try {
                  // arbetad_min + km_totalt är generated columns — räknas från rast_min
                  // resp. km_morgon+km_kvall. Splittar redKm jämt mellan morgon/kväll.
                  const halvKm = Math.round(redKm / 2);
                  const { error } = await supabase.from("arbetsdag").upsert({
                    medarbetare_id: medarbetare.id,
                    datum: redDag.datum,
                    start_tid: redStart, slut_tid: redSlut, rast_min: redRast,
                    km_morgon: halvKm, km_kvall: redKm - halvKm,
                    objekt_id: redObjektId || redDag.objekt_id || null,
                    maskin_id: redMaskinId || redDag.maskin_id || null,
                    redigerad: true,
                    redigerad_anl: redAnl, redigerad_tid: new Date().toISOString(),
                  }, { onConflict: 'medarbetare_id,datum' });
                  if(error) throw error;
                  setRedDagar(r=>({...r,[redDag.datum]:{start:redStart,slut:redSlut,rast:redRast,km:redKm,anl:redAnl}}));
                  setSteg("kalender");
                } catch(e) {
                  alert("Kunde inte spara — kontrollera anslutningen.");
                }
              }}>
              {harData?"Spara ändring":"Spara"}
            </button>
          ):(
            <button style={btn.secondary} onClick={()=>setSteg("kalender")}>Tillbaka</button>
          )}
        </div>
          </>);
        })()}

        {/* Objektväljare för redigering */}
        {visaRedObjektVäljare&&(
          <div style={{ position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.8)",zIndex:100,display:"flex",alignItems:"flex-end",justifyContent:"center" }}>
            <div style={{ background:"#1c1c1e",borderRadius:"16px 16px 0 0",width:"100%",maxWidth:500,maxHeight:"70vh",display:"flex",flexDirection:"column" }}>
              <div style={{ padding:"16px 20px",borderBottom:"1px solid rgba(255,255,255,0.06)",display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                <h3 style={{ margin:0,fontSize:17,fontWeight:600 }}>Välj objekt</h3>
                <button onClick={()=>setVisaRedObjektVäljare(false)} style={{ background:"none",border:"none",color:"#8e8e93",fontSize:14,cursor:"pointer",fontFamily:"inherit" }}>Stäng</button>
              </div>
              <div style={{ flex:1,overflowY:"auto",padding:"8px 0" }}>
                {objektLista.map(o=>(
                  <button key={o.id} onClick={()=>{setRedObjektId(o.id);setVisaRedObjektVäljare(false);}} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",width:"100%",padding:"14px 20px",background:"none",border:"none",borderBottom:"1px solid rgba(255,255,255,0.04)",cursor:"pointer",fontFamily:"inherit",textAlign:"left" }}>
                    <div>
                      <p style={{ margin:0,fontSize:15,fontWeight:500,color:"#fff" }}>{o.namn}</p>
                      {o.ägare&&<p style={{ margin:"2px 0 0",fontSize:12,color:"#8e8e93" }}>{o.ägare}</p>}
                    </div>
                    {redObjektId===o.id&&<div style={{ width:20,height:20,borderRadius:"50%",background:"#adc6ff",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}><svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l3 3L9 1" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg></div>}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Maskinväljare */}
        {visaRedMaskinVäljare&&(
          <div style={{ position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.8)",zIndex:100,display:"flex",alignItems:"flex-end",justifyContent:"center" }}>
            <div style={{ background:"#1c1c1e",borderRadius:"16px 16px 0 0",width:"100%",maxWidth:500,maxHeight:"70vh",display:"flex",flexDirection:"column" }}>
              <div style={{ padding:"16px 20px",borderBottom:"1px solid rgba(255,255,255,0.06)",display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                <h3 style={{ margin:0,fontSize:17,fontWeight:600 }}>Välj maskin</h3>
                <button onClick={()=>setVisaRedMaskinVäljare(false)} style={{ background:"none",border:"none",color:"#8e8e93",fontSize:14,cursor:"pointer",fontFamily:"inherit" }}>Stäng</button>
              </div>
              <div style={{ flex:1,overflowY:"auto",padding:"8px 0" }}>
                {Object.entries(maskinNamnMap).map(([mid,namn])=>(
                  <button key={mid} onClick={()=>{setRedMaskinId(mid);setVisaRedMaskinVäljare(false);}} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",width:"100%",padding:"14px 20px",background:"none",border:"none",borderBottom:"1px solid rgba(255,255,255,0.04)",cursor:"pointer",fontFamily:"inherit",textAlign:"left" }}>
                    <div>
                      <p style={{ margin:0,fontSize:15,fontWeight:500,color:"#fff" }}>{namn}</p>
                      <p style={{ margin:"2px 0 0",fontSize:12,color:"#8e8e93" }}>{mid}</p>
                    </div>
                    {redMaskinId===mid&&<div style={{ width:20,height:20,borderRadius:"50%",background:"#adc6ff",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}><svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l3 3L9 1" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg></div>}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Rast-picker — centrerad iOS-stil wheel */}
        {visaRedRastPicker&&(
          <div onClick={()=>setVisaRedRastPicker(false)} style={{ position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.7)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center" }}>
            <div onClick={e=>e.stopPropagation()} style={{ background:"#1c1c1e",borderRadius:16,padding:24,width:240 }}>
              <p style={{ margin:"0 0 16px",fontSize:13,fontWeight:600,color:"#8e8e93",textAlign:"center" }}>Rast</p>
              <div style={{ display:"flex",justifyContent:"center",alignItems:"center",gap:8 }}>
                <Wheel value={redRast} onChange={setRedRast} min={0} max={120} step={5}/>
                <span style={{ fontSize:14,color:"#8e8e93",fontWeight:600 }}>min</span>
              </div>
              <button onClick={()=>setVisaRedRastPicker(false)} style={{ width:"100%",marginTop:16,height:44,background:"rgba(255,255,255,0.08)",border:"none",borderRadius:10,color:"#fff",fontSize:15,fontWeight:600,cursor:"pointer",fontFamily:"inherit" }}>Klar</button>
            </div>
          </div>
        )}
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
      // Kolla data FÖRST — oavsett helg eller vardag
      if(dag?.start_tid) return "ok";
      if(dag) return "saknas";
      // Sedan röda dagar och helger
      if(rödaDagar[k]) return "röd";
      const date=new Date(kalÅr,kalMånad,d);
      const dow=date.getDay();
      if(dow===0||dow===6) return "weekend";
      if(date<idag) return "saknas";
      return "tom";
    };

    const dotFärg: Record<string,string> = {ok:"#fff",saknas:"#ff9f0a"};

    return (
      <div style={{ minHeight:"100vh",background:"#000",color:"#e2e2e2",fontFamily:"'Inter',-apple-system,sans-serif",WebkitFontSmoothing:"antialiased",display:"flex",flexDirection:"column" }}>
        <style>{css}</style>

        {/* Header — sticky nav with month + arrows */}
        <header style={{ position:"sticky",top:0,background:"#131313",zIndex:50,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 24px",height:64 }}>
          <button onClick={()=>kanBakåt&&navigera(-1)} style={{ background:"none",border:"none",cursor:"pointer",opacity:kanBakåt?1:0.3,padding:4 }}>
            <span className="material-symbols-outlined" style={{ color:"#adc6ff" }}>chevron_left</span>
          </button>
          <h1 style={{ margin:0,fontSize:18,fontWeight:600,letterSpacing:"-0.02em",color:"#adc6ff" }}>{kalMånadLabel}</h1>
          <button onClick={()=>kanFramåt&&navigera(1)} style={{ background:"none",border:"none",cursor:"pointer",opacity:kanFramåt?1:0.3,padding:4 }}>
            <span className="material-symbols-outlined" style={{ color:"#adc6ff" }}>chevron_right</span>
          </button>
        </header>

        <main style={{ flex:1,padding:"0 16px 128px",overflowY:"auto" }}>

          {/* Extra-tid summa för månaden */}
          {(() => {
            const månExtraMin = Object.entries(extraDagData)
              .filter(([d])=>d.startsWith(`${kalÅr}-${String(kalMånad+1).padStart(2,'0')}`))
              .reduce((a,[,arr])=>a + arr.reduce((s:number,e:any)=>s+(e.minuter||0),0), 0);
            return månExtraMin > 0 ? (
              <p style={{ margin:"8px 4px 0",fontSize:12,color:"#34c759",fontWeight:600 }}>+ {Math.round(månExtraMin/60*10)/10}h extra (utöver maskin)</p>
            ) : null;
          })()}

          {/* Summary card */}
          <section style={{ marginTop:16,marginBottom:32 }}>
            <div style={{ background:"#1c1c1e",borderRadius:12,padding:24 }}>
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:"24px 0" }}>
                {[
                  ["Arbetsdagar",`${arbetsdagar} dagar`],
                  ["Mål",`${målH} tim`],
                  ["Jobbat",`${jobbadH} tim`],
                  ["Körning",`${totalKm.toLocaleString('sv-SE')} km`],
                  ["Km med ersättning",`${ersKm.toLocaleString('sv-SE')} km`],
                ].map(([label,val])=>(
                  <div key={label as string} style={{ display:"flex",flexDirection:"column" }}>
                    <span style={{ color:"#8b90a0",fontSize:11,fontWeight:500,letterSpacing:"0.05em",textTransform:"uppercase" as const }}>{label}</span>
                    <span style={{ color:"#e2e2e2",fontSize:20,fontWeight:600 }}>{val}</span>
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
                <div key={v} style={{ color:"#8b90a0",fontSize:12,fontWeight:600 }}>{v}</div>
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
                const klickbar=s==="ok"||s==="saknas";
                const datum=`${kalÅr}-${String(kalMånad+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
                const erRedigerad=!!redDagar[datum]&&typeof redDagar[datum]==="object";
                const helgNamn = rödaDagar[k] || '';
                const harExtra = (extraDagData[datum]||[]).length > 0;
                const klickbarMedExtra = klickbar || harExtra;

                return (
                  <div key={i}
                    onClick={()=>{ if(klickbarMedExtra){
                      // Om det finns extra-tid: visa tidslinje. Annars normal redigering.
                      if(harExtra) {
                        setTidslinjeDatum(datum);
                        setSteg("tidslinje");
                        return;
                      }
                      const d2=dagData[k];
                      setRedDag({...d2,datum});
                      setRedStart(d2?.start_tid||"00:00");
                      setRedSlut(d2?.slut_tid||"00:00");
                      setRedRast(d2?.rast_min||0);
                      setRedKm(d2?.km_totalt||0);
                      setRedKmBerakning(null); // nollställs; fylls av useEffect nedan
                      setRedAnl("");
                      setRedObjektId(d2?.objekt_id||null);
                      setRedMaskinId(d2?.maskin_id||null);
                      setRedVy("översikt");
                      setSteg("redigera");
                    } }}
                    style={{ position:"relative",display:"flex",flexDirection:"column",alignItems:"center",cursor:klickbarMedExtra?"pointer":"default",padding:"8px 0" }}>
                    {/* Ring: idag=blå, redigerad=gul, idag har prioritet */}
                    {isToday && <div style={{ position:"absolute",top:4,width:36,height:36,border:"2px solid #adc6ff",borderRadius:"50%" }} />}
                    {erRedigerad && !isToday && <div style={{ position:"absolute",top:4,width:36,height:36,border:"2px solid #f5c518",borderRadius:"50%" }} />}
                    <span style={{
                      fontSize:15,
                      fontWeight: isToday ? 700 : 500,
                      color: s==="röd" ? "#FF3B30" : "#fff",
                      position:"relative",zIndex:1,
                      lineHeight:"36px",
                    }}>{d}</span>
                    {/* Helgdag namn */}
                    {helgNamn && <span style={{ fontSize:8,color:s==="röd"?"#FF3B30":"#8b90a0",marginTop:1,lineHeight:1.2,maxWidth:44,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{helgNamn}</span>}
                    {/* Status dot: bekräftad=vit, saknas=röd, + grön punkt om extra tid */}
                    {((s==="ok"||s==="saknas")&&!helgNamn)||harExtra?(
                      <div style={{ display:"flex",gap:3,marginTop:4 }}>
                        {(s==="ok"||s==="saknas")&&!helgNamn&&(
                          <div style={{ width:4,height:4,borderRadius:"50%",background:dotFärg[s] }}/>
                        )}
                        {harExtra&&(
                          <div style={{ width:4,height:4,borderRadius:"50%",background:"#34c759" }}/>
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
                <div style={{ width:12,height:12,borderRadius:"50%",background:"#fff" }} />
                <span style={{ fontSize:14,fontWeight:500,color:"#e2e2e2" }}>Bekräftad</span>
              </div>
              <div style={{ display:"flex",alignItems:"center",gap:16 }}>
                <div style={{ width:12,height:12,borderRadius:"50%",background:"#ff9f0a" }} />
                <span style={{ fontSize:14,fontWeight:500,color:"#e2e2e2" }}>Saknas</span>
              </div>
              <div style={{ display:"flex",alignItems:"center",gap:16 }}>
                <div style={{ width:12,height:12,borderRadius:"50%",background:"#34c759" }} />
                <span style={{ fontSize:14,fontWeight:500,color:"#e2e2e2" }}>Extra tid (klicka för tidslinje)</span>
              </div>
              <div style={{ display:"flex",alignItems:"center",gap:16 }}>
                <div style={{ width:20,height:20,border:"2px solid #f5c518",borderRadius:"50%" }} />
                <span style={{ fontSize:14,fontWeight:500,color:"#e2e2e2" }}>Redigerad</span>
              </div>
              <div style={{ display:"flex",alignItems:"center",gap:16 }}>
                <div style={{ width:20,height:20,border:"2px solid #adc6ff",borderRadius:"50%" }} />
                <span style={{ fontSize:14,fontWeight:500,color:"#e2e2e2" }}>Idag</span>
              </div>
            </div>
          </section>
        </main>

        {/* Bottom nav */}
        <nav style={{ position:"fixed",bottom:0,left:0,width:"100%",zIndex:50,display:"flex",justifyContent:"space-around",alignItems:"center",padding:"12px 16px 24px",background:"rgba(31,31,31,0.7)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",borderRadius:"16px 16px 0 0",boxShadow:"0 -4px 20px rgba(0,0,0,0.5)" }}>
          {[
            {icon:"today",label:"Dag",action:()=>setSteg("morgon"),active:false},
            {icon:"calendar_month",label:"Kalender",action:()=>{},active:true},
            {icon:"payments",label:"Löneunderlag",action:()=>setSteg("lön"),active:false},
            {icon:"settings",label:"Inställningar",action:()=>setSteg("inst"),active:false},
          ].map(n=>(
            <button key={n.label} onClick={n.action} style={{
              display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
              color:n.active?"#adc6ff":"#8b90a0",
              background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",
            }}>
              <span className="material-symbols-outlined" style={{ fontSize:24,marginBottom:4,fontVariationSettings:n.active?"'FILL' 1":"'FILL' 0" }}>{n.icon}</span>
              <span style={{ fontSize:11,fontWeight:n.active?600:500 }}>{n.label}</span>
            </button>
          ))}
        </nav>
      </div>
    );
  }

  /* ─── MÅNADSSAMMANFATTNING ─── */
  /* ─── KLAR ─── */
  if(steg==="klar") return (
    <div style={shell}><style>{css}</style>
      <div style={topBar}><p style={{ margin:0,fontSize:15,color:C.label }}>{datumStr}</p></div>
      <div style={mid}>
        <div style={{ animation:"scalePop 0.5s ease",marginBottom:32 }}><CheckCircle size={88}/></div>
        <h1 style={{ fontSize:34,fontWeight:700,margin:"0 0 10px",animation:"fadeUp 0.4s ease 0.15s both" }}>Tack, {förnamn}</h1>
        <p style={{ fontSize:18,color:C.label,margin:0,animation:"fadeUp 0.4s ease 0.25s both" }}>Ha en bra kväll</p>
      </div>
      <div style={bottom}></div>
    </div>
  );

  return null;
}
