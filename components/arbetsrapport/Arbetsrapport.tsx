"use client";
import React, { useState, useEffect, CSSProperties, ReactNode } from "react";
import { supabase } from "@/lib/supabase";

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

const getRödaDagar = (år: number): Record<string, string> => {
  const a = år % 19, b = Math.floor(år/100), c = år % 100;
  const d = Math.floor(b/4), e = b % 4;
  const f = Math.floor((b+8)/25), g = Math.floor((b-f+1)/3);
  const h = (19*a+b-d-g+15) % 30;
  const i = Math.floor(c/4), k = c % 4;
  const l = (32+2*e+2*i-h-k) % 7;
  const m = Math.floor((a+11*h+22*l)/451);
  const månad = Math.floor((h+l-7*m+114)/31);
  const dag = ((h+l-7*m+114) % 31) + 1;
  const påsk = new Date(år, månad-1, dag);
  const addD = (dt: Date, n: number) => { const r = new Date(dt); r.setDate(r.getDate()+n); return r; };
  const fm = (dt: Date) => dt.toISOString().slice(0,10);
  return {
    [`${år}-01-01`]: 'Nyårsdagen',
    [`${år}-01-06`]: 'Trettondedag jul',
    [fm(addD(påsk,-2))]: 'Långfredag',
    [fm(påsk)]: 'Påskdagen',
    [fm(addD(påsk,1))]: 'Annandag påsk',
    [`${år}-05-01`]: 'Första maj',
    [fm(addD(påsk,39))]: 'Kristi himmelsfärd',
    [`${år}-06-06`]: 'Nationaldagen',
    [fm(addD(påsk,49))]: 'Pingstdagen',
    [`${år}-12-24`]: 'Julafton',
    [`${år}-12-25`]: 'Juldagen',
    [`${år}-12-26`]: 'Annandag jul',
    [`${år}-12-31`]: 'Nyårsafton',
  };
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

/* Drum-roller */
const Drum = ({ value, onChange, min=0, max=59, pad=2 }: { value: number; onChange: (v: number) => void; min?: number; max?: number; pad?: number }) => (
  <div style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:6 }}>
    <button style={{ width:52,height:40,background:"rgba(255,255,255,0.08)",border:"none",borderRadius:10,fontSize:16,cursor:"pointer",color:"#fff" }} onClick={()=>onChange(value===max?min:value+1)}>▲</button>
    <div style={{ width:60,height:52,background:"rgba(255,255,255,0.06)",borderRadius:12,fontSize:30,fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff" }}>{String(value).padStart(pad,"0")}</div>
    <button style={{ width:52,height:40,background:"rgba(255,255,255,0.08)",border:"none",borderRadius:10,fontSize:16,cursor:"pointer",color:"#fff" }} onClick={()=>onChange(value===min?max:value-1)}>▼</button>
  </div>
);

const TimePicker = ({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) => {
  const [h,m] = value.split(":").map(Number);
  return (
    <div style={{ marginBottom:28 }}>
      <Label style={{ textAlign:"center" }}>{label}</Label>
      <div style={{ display:"flex",justifyContent:"center",alignItems:"center",gap:10 }}>
        <Drum value={h} onChange={v=>onChange(`${String(v).padStart(2,"0")}:${String(m).padStart(2,"0")}`)} max={23}/>
        <span style={{ fontSize:28,fontWeight:300,color:C.label }}>:</span>
        <Drum value={m} onChange={v=>onChange(`${String(h).padStart(2,"0")}:${String(v).padStart(2,"0")}`)} max={59}/>
      </div>
    </div>
  );
};

const MinPicker = ({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) => {
  const h=Math.floor(value/60),m=value%60;
  return (
    <div style={{ marginBottom:28 }}>
      <Label style={{ textAlign:"center" }}>{label}</Label>
      <div style={{ display:"flex",justifyContent:"center",alignItems:"center",gap:10 }}>
        <Drum value={h} onChange={v=>onChange(v*60+m)} min={0} max={8} pad={1}/>
        <span style={{ fontSize:13,color:C.label,fontWeight:600 }}>tim</span>
        <span style={{ fontSize:28,fontWeight:300,color:C.label }}>:</span>
        <Drum value={m} onChange={v=>onChange(h*60+v)} max={59}/>
        <span style={{ fontSize:13,color:C.label,fontWeight:600 }}>min</span>
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

  const h=Math.floor(min/60),m=min%60;

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

          {/* Tid-väljare */}
          <section style={{ background:"#1c1c1e",borderRadius:16,padding:24,border:"1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ display:"flex",justifyContent:"center",alignItems:"center",gap:32,padding:"16px 0" }}>
              {/* Timmar */}
              <div style={{ display:"flex",flexDirection:"column",alignItems:"center" }}>
                <button onClick={()=>setMin(min+60)} style={{ background:"none",border:"none",cursor:"pointer",padding:4,color:"#8e8e93" }}>
                  <span className="material-symbols-outlined" style={{ fontSize:28 }}>keyboard_arrow_up</span>
                </button>
                <span style={{ fontSize:32,fontWeight:700,color:"#fff",padding:"8px 0" }}>{String(h).padStart(2,"0")}</span>
                <button onClick={()=>setMin(Math.max(0,min-60))} style={{ background:"none",border:"none",cursor:"pointer",padding:4,color:"#8e8e93" }}>
                  <span className="material-symbols-outlined" style={{ fontSize:28 }}>keyboard_arrow_down</span>
                </button>
              </div>
              <span style={{ fontSize:16,color:"#8e8e93",fontWeight:400 }}>tim</span>
              {/* Minuter */}
              <div style={{ display:"flex",flexDirection:"column",alignItems:"center" }}>
                <button onClick={()=>setMin(min+5)} style={{ background:"none",border:"none",cursor:"pointer",padding:4,color:"#8e8e93" }}>
                  <span className="material-symbols-outlined" style={{ fontSize:28 }}>keyboard_arrow_up</span>
                </button>
                <span style={{ fontSize:32,fontWeight:700,color:"#fff",padding:"8px 0" }}>{String(m).padStart(2,"0")}</span>
                <button onClick={()=>setMin(Math.max(0,min-5))} style={{ background:"none",border:"none",cursor:"pointer",padding:4,color:"#8e8e93" }}>
                  <span className="material-symbols-outlined" style={{ fontSize:28 }}>keyboard_arrow_down</span>
                </button>
              </div>
              <span style={{ fontSize:16,color:"#8e8e93",fontWeight:400 }}>min</span>
            </div>
            <div style={{ marginTop:16,paddingTop:16,borderTop:"1px solid rgba(255,255,255,0.04)",textAlign:"center" }}>
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
  const [kmM,   setKmM]    = useState(null);
  const [kmK,   setKmK]    = useState(null);
  const [extra, setExtra]  = useState([]);
  const [start, setStart]  = useState("06:12");
  const [slut,  setSlut]   = useState("16:45");
  const [rast,  setRast]   = useState(30);
  const [ändring,setÄ]     = useState(null);
  const [betald,setBetald] = useState(0);
  const [trak,  setTrak]   = useState(null);
  const [dagTyp,setDagTyp] = useState("normal");
  const [avvikelseKm,  setAvvikelseKm]  = useState(0);
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
  const [redAnl,   setRedAnl]   = useState("");
  const [redVy,    setRedVy]    = useState("översikt");
  const [redDagar, setRedDagar] = useState<Record<string, {start:string;slut:string;rast:number;km:number;anl:string}>>({});
  const [lönSkickat, setLönSkickat] = useState(false);
  const [lönVy, setLönVy] = useState<'översikt'|'detaljer'>('översikt');
  const [sparatToast, setSparatToast] = useState(false);
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
  const [mStart,setMStart]=useState("07:00"),[mSlut,setMSlut]=useState("16:00"),[mRast,setMRast]=useState(30),[mBesk,setMBesk]=useState("");

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
  const [minTidFlik, setMinTidFlik] = useState<'översikt'|'saldon'|'vila'|'lön'>('översikt');
  const [atkVal, setAtkVal] = useState<'ledig'|'kontant'|'pension'|null>(null);
  const [atkValSparat, setAtkValSparat] = useState<any>(null);
  const [maskinNamn, setMaskinNamn] = useState<string | null>(null);
  const [maskinNamnMap, setMaskinNamnMap] = useState<Record<string, string>>({});

  useEffect(() => {
    Promise.all([
      supabase.auth.getUser().then(({ data: { user } }) =>
        user?.email
          ? supabase.from("medarbetare").select("*").eq("epost", user.email).single()
          : supabase.from("medarbetare").select("*").limit(1).single()
      ),
      supabase.from("gs_avtal").select("*").order("giltigt_fran",{ascending:false}).limit(1).single(),
      supabase.from("dim_objekt").select("objekt_id, object_name, vo_nummer, skogsagare").order("object_name"),
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
        // Fetch extra_tid for löneunderlag
        supabase.from("extra_tid").select("*").eq("medarbetare_id", med.data.id).order("datum",{ascending:false}).limit(60)
          .then(res => { if(res.data) setExtraTidData(res.data); });
      }
      if(avt.data) setGsAvtal(avt.data);
      if(obj.data) setObjektLista(obj.data.map(o => ({id:o.objekt_id, namn:o.object_name||o.objekt_id, ägare:o.skogsagare||''})));
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

        // Ny rad → start-notis
        if (!knownIds.has(row.id) && !localStorage.getItem(startKey)) {
          knownIds.add(row.id);
          knownSlut[row.id] = row.slut_tid || null;
          setArbetsdagToast({ typ: 'start', maskin, objekt: objNamn, start: startTid });
          localStorage.setItem(startKey, '1');
          setTimeout(() => setArbetsdagToast(null), 10000);
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
  }, [medarbetare, kalÅr, kalMånad, maskinNamnMap, objektLista]);

  const idag=new Date();
  const datumStr=`${["Sön","Mån","Tis","Ons","Tor","Fre","Lör"][idag.getDay()]} ${idag.getDate()} ${["jan","feb","mar","apr","maj","jun","jul","aug","sep","okt","nov","dec"][idag.getMonth()]}`;

  const frikm = gsAvtal?.km_grans_per_dag ?? 120;
  const kmErs = gsAvtal?.km_ersattning_kr ?? 2.90;
  const arbMin = Math.max(0,tim(start,slut)-rast);
  const totKm  = (kmM?.km||0)+(kmK?.km||0);
  const ersKm  = Math.max(0,totKm-frikm);
  const ersKr  = ersKm*kmErs;
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
    // Kolla dygnsvila: senaste arbetsdag med slut_tid
    const senaste = [...årsData].filter(r=>r.slut_tid).sort((a,b)=>b.datum.localeCompare(a.datum))[0];
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
        setSteg("kväll");
      }}
      onTaBort={()=>{setExtra([]);setSteg("kväll");}}
      onAvbryt={()=>setSteg("kväll")}
    />
  );

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
            setSteg("kväll");
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

        {/* Hero */}
        <section style={{ marginBottom:40,animation:"fadeUp 0.5s ease both" }}>
          <h1 style={{ fontSize:32,fontWeight:700,letterSpacing:"-0.02em",color:"#fff",margin:"0 0 4px" }}>{hälsning()}, {förnamn}</h1>
          <p style={{ margin:0,fontSize:15,color:"#8e8e93" }}>{datumStr}</p>
        </section>

        {/* Shift Status Card */}
        <section style={{ background:"#1c1c1e",borderRadius:12,padding:24,marginBottom:32,position:"relative",overflow:"hidden",animation:"fadeUp 0.5s ease 0.05s both" }}>
          <div style={{ display:"flex",alignItems:"center",gap:12,marginBottom:16 }}>
            {isWorking && <div style={{ width:8,height:8,borderRadius:"50%",background:"#adc6ff",boxShadow:"0 0 8px #adc6ff",flexShrink:0,animation:"pulseDot 2s infinite" }} />}
            <h2 style={{ margin:0,color:"#fff",fontWeight:600,fontSize:17 }}>
              {isWorking ? `Pågående sedan ${dagData[idagKey]?.start_tid?.slice(0,5) || '—'}` : 'Inget pass registrerat'}
            </h2>
          </div>
          <p style={{ fontSize:14,color:"#8e8e93",margin:"0 0 24px",lineHeight:1.6 }}>
            {isWorking ? 'Avslutas automatiskt vid utloggning från maskinen' : 'Startar automatiskt när maskinen loggar in'}
          </p>
          <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between" }}>
            {isWorking ? (
              <button onClick={()=>setSteg("kväll")} style={{ fontSize:14,fontWeight:500,color:"#ff453a",background:"none",border:"none",cursor:"pointer",padding:0,fontFamily:"inherit" }}>
                Avsluta pass
              </button>
            ) : (
              <button onClick={()=>{setStart(new Date().toLocaleTimeString('sv-SE',{hour:'2-digit',minute:'2-digit'}));setSteg("manuellDag");}} style={{ fontSize:14,fontWeight:500,color:"#adc6ff",background:"none",border:"none",cursor:"pointer",padding:0,fontFamily:"inherit" }}>
                Starta manuellt
              </button>
            )}
            <span className="material-symbols-outlined" style={{ color:"rgba(194,198,214,0.3)",fontSize:24 }}>precision_manufacturing</span>
          </div>
        </section>

        {/* Löneunderlag-notis */}
        {månadsKlar&&!lönSkickat&&(
          <div onClick={()=>setSteg("lön")} style={{ background:"rgba(255,149,0,0.08)",border:"1px solid rgba(255,149,0,0.25)",borderRadius:12,padding:16,marginBottom:24,cursor:"pointer",animation:"fadeUp 0.4s ease" }}>
            <p style={{ margin:"0 0 6px",fontSize:13,fontWeight:500,color:C.orange }}>Månaden är slut</p>
            <p style={{ margin:"0 0 8px",fontSize:15,fontWeight:600,color:"#fff" }}>Granska löneunderlaget för {månadsNamn()}</p>
            <span style={{ fontSize:14,color:"#adc6ff",fontWeight:500 }}>Öppna →</span>
          </div>
        )}

        {/* Frånvaro */}
        <section style={{ animation:"fadeUp 0.5s ease 0.1s both",marginBottom:32 }}>
          <h3 style={secHead}>Frånvaro</h3>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
            {[
              {id:"sjuk",label:"Sjukfrånvaro",icon:"medical_services"},
              {id:"vab",label:"VAB",icon:"child_care"},
            ].map(s=>(
              <button key={s.id} onClick={()=>{setDagTyp(s.id);setSteg("bekräftaFrånvaro");}} style={{ height:56,background:"#1c1c1e",borderRadius:12,border:"1px solid rgba(255,255,255,0.06)",display:"flex",alignItems:"center",justifyContent:"center",gap:10,padding:"0 16px",cursor:"pointer",fontFamily:"inherit" }}>
                <span className="material-symbols-outlined" style={{ color:"#8e8e93",fontSize:20 }}>{s.icon}</span>
                <span style={{ color:"#fff",fontWeight:600,fontSize:15 }}>{s.label}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Arbete utan maskin */}
        <section style={{ animation:"fadeUp 0.5s ease 0.15s both" }}>
          <h3 style={secHead}>Arbete utan maskin</h3>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
            {[
              {id:"utbildning",label:"Utbildning",icon:"school"},
              {id:"service",label:"Service",icon:"build"},
              {id:"möte",label:"Möte",icon:"groups"},
              {id:"annat",label:"Annat arbete",icon:"more_horiz"},
            ].map(s=>(
              <button key={s.id} onClick={()=>{setDagTyp(s.id);setSteg("manuellDag");}} style={{ height:56,background:"#1c1c1e",borderRadius:12,border:"1px solid rgba(255,255,255,0.06)",display:"flex",alignItems:"center",justifyContent:"center",gap:10,padding:"0 16px",cursor:"pointer",fontFamily:"inherit" }}>
                <span className="material-symbols-outlined" style={{ color:"#8e8e93",fontSize:20 }}>{s.icon}</span>
                <span style={{ color:"#fff",fontWeight:600,fontSize:15 }}>{s.label}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Maskin & objekt metadata */}
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
        </section>}

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
    </div>
  );

  /* ─── AVVIKELSE – GPS märkte längre rutt ─── */
  if(steg==="avvikelse"){
    const normalKm = 72;
    const faktiskKm = normalKm + avvikelseKm;
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

          {/* GPS-avvikelse-kort */}
          <div style={{ background:"rgba(255,149,0,0.08)",borderRadius:16,padding:"18px 20px",marginBottom:20,border:"1px solid rgba(255,149,0,0.2)" }}>
            <p style={{ margin:"0 0 12px",fontSize:12,fontWeight:700,color:C.orange,textTransform:"none",letterSpacing:"0" }}>GPS märkte längre rutt</p>
            <div style={{ display:"flex",justifyContent:"space-between",marginBottom:8 }}>
              <span style={{ fontSize:15,color:C.label }}>Normalrutt hem → maskin</span>
              <span style={{ fontSize:15,fontWeight:600 }}>{normalKm} km</span>
            </div>
            <div style={{ display:"flex",justifyContent:"space-between",marginBottom:12 }}>
              <span style={{ fontSize:15,color:C.label }}>Faktisk körning idag</span>
              <span style={{ fontSize:15,fontWeight:600,color:C.orange }}>{faktiskKm} km</span>
            </div>
            <div style={{ height:1,background:"rgba(255,149,0,0.15)",marginBottom:12 }}/>
            <div style={{ display:"flex",justifyContent:"space-between" }}>
              <span style={{ fontSize:15,fontWeight:600 }}>Extra</span>
              <span style={{ fontSize:15,fontWeight:700,color:C.orange }}>+{avvikelseKm} km</span>
            </div>
          </div>

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
    const veckoDagar: {datum:string;dag:string;h:number}[] = [];
    let veckoTot = 0;
    for(let i=0;i<7;i++){
      const d=new Date(veckStart); d.setDate(veckStart.getDate()+i);
      const k=d.toISOString().split('T')[0];
      const ad=årsData.find(r=>r.datum===k);
      const h=ad ? Math.round((ad.arbetad_min||0)/60*10)/10 : 0;
      veckoTot+=h;
      veckoDagar.push({datum:k,dag:dagNamn[d.getDay()],dagKort:dagKort[d.getDay()],h});
    }
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
      const k=dt.toISOString().split('T')[0];
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
        const k=dt.toISOString().split('T')[0];
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
        const k=dt.toISOString().split('T')[0];
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
          <div style={{ display:"flex",gap:0,background:"rgba(255,255,255,0.06)",borderRadius:8,padding:2,marginBottom:12 }}>
            {([['översikt','Översikt'],['saldon','Saldon'],['vila','Vila'],['lön','Löneunderlag']] as const).map(([k,l])=>(
              <button key={k} onClick={()=>{if(k==='lön'){setSteg('lön');return;}setMinTidFlik(k);}} style={{ flex:1,padding:"7px 0",borderRadius:6,border:"none",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",background:minTidFlik===k?"rgba(255,255,255,0.12)":"transparent",color:minTidFlik===k?"#fff":"#8e8e93" }}>{l}</button>
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
                {label:"Veckan",val:`${Math.round(veckoTot*10)/10}h`,sub:`av 40h`},
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
            const semTotalt = medarbetare?.semester_dagar ?? 25;
            const semSparat = medarbetare?.semester_sparat ?? 0;
            // Intjäningsår: 1 apr förra året → 31 mar i år (eller aktuellt)
            const årNu=nu.getFullYear();
            const ijStart = nu.getMonth()>=3 ? `${årNu}-04-01` : `${årNu-1}-04-01`;
            const semAnvänt = årsData.filter(d=>d.datum>=ijStart&&d.dag_typ==='semester').length;
            const semKvar = semTotalt + semSparat - semAnvänt;
            const semPct = semTotalt>0?Math.min(100,semAnvänt/(semTotalt+semSparat)*100):0;
            return (
              <section style={{ marginBottom:24 }}>
                <h3 style={secHead}>Semester</h3>
                <div style={{ background:"#1c1c1e",borderRadius:12,padding:20,border:"1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:12 }}>
                    <span style={{ fontSize:28,fontWeight:700,color:"#fff" }}>{semKvar} <span style={{ fontSize:14,fontWeight:400,color:"#8e8e93" }}>dagar kvar</span></span>
                  </div>
                  <div style={{ height:4,background:"rgba(255,255,255,0.06)",borderRadius:2,marginBottom:12,overflow:"hidden" }}>
                    <div style={{ height:"100%",width:`${semPct}%`,background:"#adc6ff",borderRadius:2 }} />
                  </div>
                  <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
                    {[
                      ["Totalt",`${semTotalt} dagar`],
                      ...(semSparat>0?[["Sparat från förra året",`${semSparat} dagar`]]:[]),
                      ["Använt",`${semAnvänt} dagar`],
                    ].map(([l,v])=>(
                      <div key={l as string} style={{ display:"flex",justifyContent:"space-between" }}>
                        <span style={{ fontSize:13,color:"#8e8e93" }}>{l}</span>
                        <span style={{ fontSize:13,fontWeight:600,color:"#fff" }}>{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            );
          })()}

          {/* ATK */}
          {(()=>{
            const atkTotalt = medarbetare?.atk_timmar ?? Math.round((årsMin/60)*(gsAvtal?.atk_faktor??0.03)*10)/10;
            const atkAnväntDagar = årsData.filter(d=>d.dag_typ==='atk').length;
            const atkAnväntH = atkAnväntDagar * 8;
            const atkKvar = Math.round((atkTotalt-atkAnväntH)*10)/10;
            const atkPct = atkTotalt>0?Math.min(100,atkAnväntH/atkTotalt*100):0;
            const atkDagar = Math.round(atkKvar/8*10)/10;
            const timlon2 = gsAvtal?.timlon_kr ?? 185;
            const atkKr = Math.round(atkKvar*timlon2);
            const årNu2 = nu.getFullYear();
            const harValt = !!atkValSparat;
            return (
              <section style={{ marginBottom:24 }}>
                <h3 style={secHead}>ATK</h3>
                {/* Saldo */}
                <div style={{ background:"#1c1c1e",borderRadius:12,padding:20,border:"1px solid rgba(255,255,255,0.06)",marginBottom:harValt?0:12 }}>
                  <div style={{ display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:12 }}>
                    <span style={{ fontSize:28,fontWeight:700,color:"#fff" }}>{atkKvar}h <span style={{ fontSize:14,fontWeight:400,color:"#8e8e93" }}>kvar</span></span>
                  </div>
                  <div style={{ height:4,background:"rgba(255,255,255,0.06)",borderRadius:2,marginBottom:12,overflow:"hidden" }}>
                    <div style={{ height:"100%",width:`${atkPct}%`,background:"#adc6ff",borderRadius:2 }} />
                  </div>
                  <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
                    {[["Totalt",`${atkTotalt}h`],["Använt",`${atkAnväntH}h`]].map(([l,v])=>(
                      <div key={l as string} style={{ display:"flex",justifyContent:"space-between" }}>
                        <span style={{ fontSize:13,color:"#8e8e93" }}>{l}</span>
                        <span style={{ fontSize:13,fontWeight:600,color:"#fff" }}>{v}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Val — efter bekräftelse */}
                {harValt&&(
                  <div style={{ background:"#1c1c1e",borderRadius:12,padding:16,marginTop:8,border:"1px solid rgba(52,199,89,0.2)" }}>
                    <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                      <span style={{ color:"#34c759",fontSize:14 }}>✓</span>
                      <span style={{ fontSize:14,color:"#fff" }}>
                        {atkValSparat.val==='ledig'?`Du valde ledig tid: ${atkDagar} dagar`:atkValSparat.val==='kontant'?`Utbetalas juni ${årNu2}: ≈ ${atkKr.toLocaleString('sv-SE')} kr`:`Avsatt till pension: ≈ ${atkKr.toLocaleString('sv-SE')} kr`}
                      </span>
                    </div>
                  </div>
                )}

                {/* Val — ej gjort */}
                {!harValt&&(
                  <div style={{ background:"#1c1c1e",borderRadius:12,padding:20,border:"1px solid rgba(255,159,10,0.25)" }}>
                    <p style={{ margin:"0 0 16px",fontSize:14,fontWeight:600,color:"#ff9f0a" }}>Välj för ditt ATK {årNu2}</p>
                    <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:16 }}>
                      {([
                        {k:'ledig' as const,label:'Ledig tid',sub:`= ${atkDagar} dagar`},
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
                        const row={medarbetare_id:medarbetare.id,period:String(årNu2),val:atkVal,timmar:atkKvar,belopp:atkVal!=='ledig'?atkKr:null,datum_valt:new Date().toISOString(),status:'bekräftad'};
                        await supabase.from("atk_val").upsert(row);
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
                if(ad?.dag_typ==='sjuk'&&!delar.includes('Sjuk')) delar.push('Sjuk');
                else if(ad?.dag_typ==='vab'&&!delar.includes('VAB')) delar.push('VAB');
                else if(ad?.dag_typ==='semester'&&!delar.includes('Semester')) delar.push('Semester');
                else if(ad?.dag_typ==='atk'&&!delar.includes('ATK')) delar.push('ATK');
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

        </main>
        <BottomNavBar aktiv="mintid" onNav={s=>setSteg(s)} />
      </div>
    );
  }

  /* ─── LÖNEUNDERLAG ─── */
  if(steg==="lön"){
    const timlon = gsAvtal?.timlon_kr ?? 185;
    const otFaktor = gsAvtal?.overtid_faktor ?? 1.5;
    const frikm2 = gsAvtal?.km_grans_per_dag ?? 120;
    const kmErs2 = gsAvtal?.km_ersattning_kr ?? 2.90;
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
    const övKr = Math.round(övH * timlon * otFaktor);
    const totalKm = månadsHistorik.reduce((a,d) => a + (d.km_totalt || d.km_morgon || 0) + (d.km_kvall || 0), 0);
    const löneErsKm = Math.max(0, totalKm - frikm2*arbetsdagar);
    const löneErsKr = Math.round(löneErsKm * kmErs2);
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
    const veckoData: Record<number, { dagar: {datum:string;min:number}[]; sumH:number }> = {};
    historik.filter(d => d.datum && d.datum.startsWith(månadsPrefix)).forEach(d => {
      const date = new Date(d.datum);
      // ISO week: getDay()=0 is Sun, we want Mon=1
      const dayOfYear = Math.floor((date.getTime() - new Date(date.getFullYear(),0,1).getTime()) / 86400000);
      const weekNum = Math.ceil((dayOfYear + new Date(date.getFullYear(),0,1).getDay()) / 7);
      if(!veckoData[weekNum]) veckoData[weekNum] = { dagar:[], sumH:0 };
      const m = d.arbetad_min || 0;
      veckoData[weekNum].dagar.push({ datum:d.datum, min:m });
      veckoData[weekNum].sumH += m/60;
    });
    const sortedWeeks = Object.entries(veckoData).sort(([a],[b]) => Number(a)-Number(b));

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
                          <span style={{ fontSize:24,fontWeight:700,color:"#adc6ff" }}>{Math.round(week.sumH*10)/10}</span>
                          <span style={{ fontSize:12,color:"#8b90a0" }}>tim</span>
                        </div>
                      </div>
                      <div style={{ display:"flex",flexDirection:"column",gap:12 }}>
                        {week.dagar.sort((a,b)=>a.datum.localeCompare(b.datum)).map(dag => {
                          const dt = new Date(dag.datum);
                          const h = Math.round(dag.min/60*10)/10;
                          return (
                            <div key={dag.datum} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid rgba(255,255,255,0.03)" }}>
                              <span style={{ fontSize:14 }}>{dagNamn[dt.getDay()].charAt(0).toUpperCase()+dagNamn[dt.getDay()].slice(1)} {dt.getDate()} {månNamn[dt.getMonth()]}</span>
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

            {/* Debiterbar tid */}
            {debiterbarExtraTid.length>0&&(
              <section style={{ marginBottom:32 }}>
                <h2 style={{ ...secHead,marginBottom:16,marginLeft:4 }}>Debiterbar tid</h2>
                <div style={{ display:"flex",flexDirection:"column",gap:12 }}>
                  {debiterbarExtraTid.map((e,i) => {
                    const objNamn = e.objekt_id ? (objektLista.find(o=>o.id===e.objekt_id)?.namn || e.objekt_id) : '–';
                    const h = Math.floor((e.minuter||0)/60), m = (e.minuter||0)%60;
                    const tidStr = h > 0 ? `${h} tim ${m > 0 ? m + ' min' : ''}` : `${m} min`;
                    return (
                      <div key={i} style={{ background:"#1c1c1e",borderRadius:12,padding:20,display:"flex",alignItems:"flex-start",gap:16 }}>
                        <div style={{ width:40,height:40,borderRadius:"50%",background:"rgba(255,149,0,0.15)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
                          <span className="material-symbols-outlined" style={{ color:"#ff9f0a",fontSize:20 }}>receipt_long</span>
                        </div>
                        <div style={{ flex:1,minWidth:0 }}>
                          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:4 }}>
                            <p style={{ margin:0,fontSize:14,fontWeight:600 }}>{objNamn}</p>
                            <span style={{ fontSize:14,fontWeight:600,flexShrink:0,marginLeft:8 }}>{tidStr}</span>
                          </div>
                          <p style={{ margin:0,fontSize:12,color:"#8b90a0" }}>{e.datum}{e.kommentar ? ` · ${e.kommentar}` : ''}</p>
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
          <BackBtn onClick={()=>setSteg("morgon")}/>
          <div>
            <h1 style={{ margin:0,fontSize:26,fontWeight:700 }}>Mitt avtal</h1>
            <p style={{ margin:"4px 0 0",fontSize:13,color:C.label }}>{gsAvtal?.namn || 'GS-avtalet'}</p>
          </div>
        </div>
      </div>
      <div style={{ flex:1,overflowY:"auto",paddingTop:16 }}>
        {[
          {rubrik:"Arbetstid",rader:[["Ordinarie arbetstid","40 tim / vecka"],["Månadsschema","Beräknas per kalendermånad"]]},
          {rubrik:"Övertid",rader:[["Övertid vardagar",`+ ${Math.round(((gsAvtal?.overtid_faktor ?? 1.5)-1)*100)}% av timlön`],["Övertid helg / röd dag","+ 100% av timlön"],["Max övertid / år","200 timmar"]]},
          {rubrik:"Körersättning",rader:[["Gräns",`${gsAvtal?.km_grans_per_dag ?? 120} km / dag (tur & retur)`],["Ersättning över gränsen",`${gsAvtal?.km_ersattning_kr ?? 2.90} kr / km`]]},
          {rubrik:"Traktamente",rader:[["Heldagstraktamente",`${gsAvtal?.traktamente_hel_kr ?? 300} kr / dag skattefritt`],["Halvdagstraktamente",`${gsAvtal?.traktamente_halv_kr ?? 150} kr / dag skattefritt`]]},
          {rubrik:"ATK",rader:[["Intjäning","Baserat på jobbade timmar"],["Utbetalning","En gång per kvartal"]]},
          {rubrik:"Semester",rader:[["Semesterdagar","25 dagar / år"],["Intjäningsår","1 april – 31 mars"]]},
        ].map(({rubrik,rader})=>(
          <div key={rubrik} style={{ marginBottom:20 }}>
            <Label>{rubrik}</Label>
            <Card style={{ padding:"4px 20px" }}>
              {rader.map(([l,v],i,arr)=>(
                <div key={l} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"13px 0",borderBottom:i<arr.length-1?`1px solid ${C.line}`:"none" }}>
                  <span style={{ fontSize:15,color:C.label }}>{l}</span>
                  <span style={{ fontSize:15,fontWeight:600,textAlign:"right",maxWidth:"55%" }}>{v}</span>
                </div>
              ))}
            </Card>
          </div>
        ))}
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

  /* ─── KVÄLL AVVIKELSE – GPS märkte längre hemkörning ─── */
  if(steg==="kvällAvvikelse"){
    const normalKm = 75;
    const faktiskKm = 98;
    const avvKm = faktiskKm - normalKm;
    const typer = [
      {id:"reservdelar", label:"Hämta reservdelar"},
      {id:"objekt",      label:"Kollat på ett objekt"},
      {id:"annat",       label:"Annat"},
    ];

    if(kvAvVäljer) return (
      <div style={shell}><style>{css}</style>
        <div style={topBar}><div style={{ display:"flex",alignItems:"center",gap:14 }}><BackBtn onClick={()=>setKvAvVäljer(false)}/><h1 style={{ margin:0,fontSize:24,fontWeight:700 }}>Välj objekt</h1></div></div>
        <div style={{ flex:1,paddingTop:16 }}>
          {objektLista.map(o=>(
            <Card key={o.id} onClick={()=>{setKvAvObj(o);setKvAvVäljer(false);}} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",background:kvAvObj?.id===o.id?"rgba(0,122,255,0.06)":C.card }}>
              <div><p style={{ margin:0,fontSize:16,fontWeight:600 }}>{o.namn}</p><p style={{ margin:"3px 0 0",fontSize:13,color:C.label }}>{o.ägare}</p></div>
              {kvAvObj?.id===o.id&&<div style={{ width:22,height:22,borderRadius:"50%",background:C.blue,display:"flex",alignItems:"center",justifyContent:"center" }}><svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l3 3L9 1" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg></div>}
            </Card>
          ))}
        </div>
      </div>
    );

    return (
      <div style={darkShell}><style>{css}</style>
        <div style={topBar}>
          <h1 style={{ margin:"0 0 6px",fontSize:26,fontWeight:700 }}>{hälsning()}, {förnamn}</h1>
          <p style={{ margin:0,fontSize:15,color:C.darkLabel }}>Du är nästan klar för dagen</p>
        </div>

        <div style={{ flex:1,overflowY:"auto",paddingTop:8 }}>
          {/* GPS-avvikelse-kort */}
          <div style={{ background:"rgba(255,149,0,0.1)",borderRadius:16,padding:"18px 20px",marginBottom:20,border:"1px solid rgba(255,149,0,0.25)" }}>
            <p style={{ margin:"0 0 12px",fontSize:12,fontWeight:700,color:C.orange,textTransform:"none",letterSpacing:"0" }}>GPS märkte längre hemkörning</p>
            <div style={{ display:"flex",justifyContent:"space-between",marginBottom:8 }}>
              <span style={{ fontSize:15,color:C.darkLabel }}>Normalrutt maskin → hem</span>
              <span style={{ fontSize:15,fontWeight:600 }}>{normalKm} km</span>
            </div>
            <div style={{ display:"flex",justifyContent:"space-between",marginBottom:12 }}>
              <span style={{ fontSize:15,color:C.darkLabel }}>Faktisk körning idag</span>
              <span style={{ fontSize:15,fontWeight:600,color:C.orange }}>{faktiskKm} km</span>
            </div>
            <div style={{ height:1,background:"rgba(255,149,0,0.2)",marginBottom:12 }}/>
            <div style={{ display:"flex",justifyContent:"space-between" }}>
              <span style={{ fontSize:15,fontWeight:600 }}>Extra</span>
              <span style={{ fontSize:15,fontWeight:700,color:C.orange }}>+{avvKm} km</span>
            </div>
          </div>

          <Label style={{ color:C.darkLabel }}>Vad gjorde du på vägen hem?</Label>
          {typer.map(t=>(
            <div key={t.id} onClick={()=>setKvAvTyp(t.id)}
              style={{ background:kvAvTyp===t.id?"rgba(0,122,255,0.15)":C.darkCard,borderRadius:14,padding:"16px 18px",marginBottom:8,cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",border:kvAvTyp===t.id?"1px solid rgba(0,122,255,0.3)":"1px solid rgba(255,255,255,0.06)" }}>
              <span style={{ fontSize:16,fontWeight:500 }}>{t.label}</span>
              {kvAvTyp===t.id
                ?<div style={{ width:22,height:22,borderRadius:"50%",background:C.blue,display:"flex",alignItems:"center",justifyContent:"center" }}><svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l3 3L9 1" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
                :<div style={{ width:22,height:22,borderRadius:"50%",border:"1.5px solid rgba(255,255,255,0.15)" }}/>
              }
            </div>
          ))}

          {kvAvTyp&&<>
            <div style={{ marginTop:16,marginBottom:12 }}>
              <Label style={{ color:C.darkLabel }}>Kommentar</Label>
              <input
                placeholder="Kommentar"
                value={kvAvBesk} onChange={e=>setKvAvBesk(e.target.value)}
                style={{ width:"100%",padding:"15px 16px",fontSize:16,border:"none",borderRadius:12,background:"rgba(255,255,255,0.08)",outline:"none",fontFamily:"inherit",color:"#fff" }}/>
            </div>

            <div style={{ background:C.darkCard,borderRadius:14,padding:"14px 18px",marginBottom:kvAvDeb?8:0,display:"flex",justifyContent:"space-between",alignItems:"center",border:"1px solid rgba(255,255,255,0.06)" }}>
              <div>
                <p style={{ margin:0,fontSize:16,fontWeight:600 }}>Debiterbar</p>
                <p style={{ margin:"2px 0 0",fontSize:13,color:C.darkLabel }}>Faktureras kunden</p>
              </div>
              <div onClick={()=>{setKvAvDeb(v=>!v);if(kvAvDeb)setKvAvObj(null);}}
                style={{ width:51,height:31,borderRadius:16,background:kvAvDeb?C.green:"rgba(120,120,128,0.3)",cursor:"pointer",position:"relative",transition:"background 0.2s" }}>
                <div style={{ width:27,height:27,borderRadius:"50%",background:"#fff",position:"absolute",top:2,left:kvAvDeb?22:2,transition:"left 0.2s",boxShadow:"0 2px 4px rgba(0,0,0,0.2)" }}/>
              </div>
            </div>

            {kvAvDeb&&<div onClick={()=>setKvAvVäljer(true)} style={{ background:C.darkCard,borderRadius:14,padding:"14px 18px",marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center",border:"1px solid rgba(255,255,255,0.06)",cursor:"pointer" }}>
              <div>
                <p style={{ margin:0,fontSize:16,fontWeight:600 }}>Objekt</p>
                <p style={{ margin:"2px 0 0",fontSize:13,color:kvAvObj?C.blue:C.darkLabel }}>{kvAvObj?kvAvObj.namn:"Välj objekt"}</p>
              </div>
              <ChevronRight light/>
            </div>}
          </>}
        </div>

        <div style={bottom}>
          <button
            style={{ ...btn.primary,opacity:(kvAvTyp&&kvAvBesk&&(!kvAvDeb||kvAvObj))?1:0.35 }}
            disabled={!kvAvTyp||!kvAvBesk||(kvAvDeb&&!kvAvObj)}
            onClick={()=>{
              if(kvAvDeb&&kvAvObj) setExtra(e=>[...e,{besk:kvAvBesk,min:60,deb:true,obj:kvAvObj}]);
              setSteg("kväll");
            }}>
            Vidare till kvällssammanfattning
          </button>
        </div>
      </div>
    );
  }

  /* ─── KVÄLL ─── */
  if(steg==="kväll") return (
    <div style={shell}><style>{css}</style>
      <div style={topBar} />

      <div style={{ flex:1,display:"flex",flexDirection:"column",justifyContent:"center",overflowY:"auto",paddingBottom:100 }}>

        {/* Sammanfattningskort */}
        <div style={{ background:"#1c1c1e",borderRadius:16,padding:24,border:"1px solid rgba(255,255,255,0.06)" }}>
          <p style={{ margin:"0 0 6px",fontSize:44,fontWeight:800,color:"#fff",lineHeight:1 }}>{fmt(arbMin)}</p>
          <p style={{ margin:0,fontSize:16,color:"#8e8e93" }}>{start} – {slut} · {rast} min rast</p>
          {totKm>0&&(
            <div style={{ paddingTop:16,marginTop:16,borderTop:"1px solid rgba(255,255,255,0.06)" }}>
              <p style={{ margin:0,fontSize:20,fontWeight:600,color:"#fff" }}>{totKm} km</p>
              {ersKm>0&&<p style={{ margin:"4px 0 0",fontSize:13,color:C.green }}>+{ersKm} km · {ersKr.toFixed(0)} kr ersättning</p>}
            </div>
          )}
          {extra.length>0&&(
            <div style={{ paddingTop:16,marginTop:16,borderTop:"1px solid rgba(255,255,255,0.06)" }}>
              <p style={{ margin:0,fontSize:14,color:"#8e8e93" }}>Extra tid: <span style={{ color:"#fff",fontWeight:600 }}>{fmt(totEx)}</span></p>
            </div>
          )}
          {trak&&(
            <div style={{ paddingTop:16,marginTop:extra.length>0?0:16,borderTop:extra.length>0?"none":"1px solid rgba(255,255,255,0.06)" }}>
              <p style={{ margin:0,fontSize:14,color:"#8e8e93" }}>Traktamente: <span style={{ color:"#fff",fontWeight:600 }}>{trak.summa} kr</span></p>
            </div>
          )}
          {ändring&&<p style={{ margin:"12px 0 0",fontSize:13,fontWeight:600,color:C.orange }}>Arbetstid ändrad</p>}
        </div>

        {/* Bekräfta */}
        <button onClick={async ()=>{
          await supabase.from("arbetsdag").upsert({
            medarbetare_id: medarbetare.id,
            datum: new Date().toISOString().split("T")[0],
            start_tid: start, slut_tid: slut, rast_min: rast,
            arbetad_min: arbMin + totEx,
            extra_tid_min: totEx,
            km_morgon: kmM?.km ?? 0, km_kvall: kmK?.km ?? 0,
            maskin_id: medarbetare.maskin_id,
            objekt_id: valtObjektId || dagData[idagKey]?.objekt_id || null,
            traktamente: trak, bekraftad: true,
            bekraftad_tid: new Date().toISOString(),
          });
          setSteg("klar");
          setTimeout(()=>setSteg("morgon"),3000);
        }} style={{ width:"100%",height:60,background:"#34c759",color:"#fff",border:"none",borderRadius:14,fontSize:19,fontWeight:700,cursor:"pointer",fontFamily:"inherit",marginTop:32 }}>
          Bekräfta
        </button>

        {/* Tidigast start imorgon */}
        {slut&&(()=>{
          const [sh,sm]=(slut as string).split(':').map(Number);
          const _nu=new Date();
          const tidigast=new Date(_nu.getFullYear(),_nu.getMonth(),_nu.getDate(),sh,sm);
          tidigast.setHours(tidigast.getHours()+11);
          const tid=`${String(tidigast.getHours()).padStart(2,'0')}:${String(tidigast.getMinutes()).padStart(2,'0')}`;
          if(tidigast.getHours()>=5&&tidigast.getHours()<=9) return (
            <p style={{ margin:"16px 0 0",fontSize:13,color:"#8e8e93",textAlign:"center" }}>Du kan starta maskinen tidigast kl {tid} imorgon för att hålla dygnsviolan</p>
          );
          return null;
        })()}

        {/* Länkrader */}
        <div style={{ display:"flex",flexDirection:"column",marginTop:24 }}>
          {[
            {label:"Ändra arbetstid",action:()=>{setTS(start);setTE(slut);setTR(rast);setAnledn("");setSteg("äTid");}},
            {label:"Ändra körning",action:()=>{setTMK(kmM?.km||0);setTKK(kmK?.km||0);setAnledn("");setSteg("äKm");}},
            {label:extra.length>0?"Ändra extra tid":"Lägg till fler aktiviteter",action:()=>setSteg("extraTid")},
            {label:trak?"Ändra traktamente":"Lägg till traktamente",action:()=>setSteg("traktamente")},
          ].map(l=>(
            <button key={l.label} onClick={l.action} style={{ display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",background:"none",border:"none",borderBottom:"1px solid rgba(255,255,255,0.04)",color:"#8e8e93",fontSize:16,fontWeight:500,cursor:"pointer",fontFamily:"inherit",padding:"16px 0",textAlign:"left" }}>
              <span>{l.label}</span>
              <span className="material-symbols-outlined" style={{ fontSize:18,color:"rgba(255,255,255,0.15)" }}>chevron_right</span>
            </button>
          ))}
        </div>
      </div>

      <BottomNavBar aktiv="morgon" onNav={s=>setSteg(s)} />
    </div>
  );

  /* ─── ÄNDRA ARBETSTID ─── */
  if(steg==="äTid"){
    const tAm=Math.max(0,tim(tS,tE)-tR),ä=tS!==start||tE!==slut||tR!==rast;
    const TimeCol = ({label,value,onUp,onDown,changed}:{label:string;value:string;onUp:()=>void;onDown:()=>void;changed:boolean}) => (
      <div style={{ display:"flex",flexDirection:"column",alignItems:"center" }}>
        <span style={{ ...secHead,marginBottom:16,color:changed?C.orange:"#8e8e93" }}>{label}</span>
        <div style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:4 }}>
          <button onClick={onUp} style={{ background:"none",border:"none",cursor:"pointer",padding:4,color:"#8e8e93" }}>
            <span className="material-symbols-outlined" style={{ fontSize:30 }}>keyboard_arrow_up</span>
          </button>
          <div style={{ fontSize:36,fontWeight:700,color:"#fff",letterSpacing:"-0.03em" }}>{value}</div>
          <button onClick={onDown} style={{ background:"none",border:"none",cursor:"pointer",padding:4,color:"#8e8e93" }}>
            <span className="material-symbols-outlined" style={{ fontSize:30 }}>keyboard_arrow_down</span>
          </button>
        </div>
      </div>
    );
    const [sH,sM]=tS.split(":").map(Number),[eH,eM]=tE.split(":").map(Number);
    const pad=(n:number)=>String(n).padStart(2,"0");
    return (
      <div style={{ minHeight:"100vh",background:"#000",color:"#e2e2e2",fontFamily:"'Inter',-apple-system,sans-serif",WebkitFontSmoothing:"antialiased",display:"flex",flexDirection:"column" }}>
        <style>{css}</style>
        {/* Header */}
        <header style={{ position:"fixed",top:0,width:"100%",zIndex:50,background:"rgba(0,0,0,0.8)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",display:"flex",alignItems:"center",padding:"0 16px",height:64 }}>
          <button onClick={()=>setSteg("kväll")} style={{ background:"none",border:"none",cursor:"pointer",padding:4 }}>
            <span className="material-symbols-outlined" style={{ color:"#34c759" }}>arrow_back</span>
          </button>
          <h1 style={{ margin:"0 16px",fontSize:18,fontWeight:700,color:"#fff",letterSpacing:"-0.02em" }}>Arbetstid</h1>
        </header>

        <main style={{ flex:1,paddingTop:96,paddingLeft:16,paddingRight:16,paddingBottom:120,maxWidth:512,margin:"0 auto",width:"100%" }}>

          {/* Time Picker Card */}
          <div style={{ background:"#1c1c1e",borderRadius:16,padding:24,marginBottom:24,border:"1px solid rgba(255,255,255,0.04)",boxShadow:"0 4px 24px rgba(0,0,0,0.4)" }}>
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8 }}>
              {/* Start — H : M */}
              <div style={{ display:"flex",flexDirection:"column",alignItems:"center" }}>
                <span style={{ ...secHead,marginBottom:12,color:tS!==start?C.orange:"#8e8e93" }}>Start</span>
                <div style={{ display:"flex",alignItems:"center",gap:2 }}>
                  <div style={{ display:"flex",flexDirection:"column",alignItems:"center" }}>
                    <button onClick={()=>{const h=(sH+1)%24;setTS(`${pad(h)}:${pad(sM)}`);}} style={{ background:"none",border:"none",cursor:"pointer",padding:2,color:"#8e8e93" }}><span className="material-symbols-outlined" style={{ fontSize:24 }}>keyboard_arrow_up</span></button>
                    <span style={{ fontSize:28,fontWeight:700,color:"#fff",width:28,textAlign:"center" }}>{pad(sH)}</span>
                    <button onClick={()=>{const h=(sH-1+24)%24;setTS(`${pad(h)}:${pad(sM)}`);}} style={{ background:"none",border:"none",cursor:"pointer",padding:2,color:"#8e8e93" }}><span className="material-symbols-outlined" style={{ fontSize:24 }}>keyboard_arrow_down</span></button>
                  </div>
                  <span style={{ fontSize:20,color:"#636366",fontWeight:300 }}>:</span>
                  <div style={{ display:"flex",flexDirection:"column",alignItems:"center" }}>
                    <button onClick={()=>{const m=(sM+1)%60;setTS(`${pad(sH)}:${pad(m)}`);}} style={{ background:"none",border:"none",cursor:"pointer",padding:2,color:"#8e8e93" }}><span className="material-symbols-outlined" style={{ fontSize:24 }}>keyboard_arrow_up</span></button>
                    <span style={{ fontSize:28,fontWeight:700,color:"#fff",width:28,textAlign:"center" }}>{pad(sM)}</span>
                    <button onClick={()=>{const m=(sM-1+60)%60;setTS(`${pad(sH)}:${pad(m)}`);}} style={{ background:"none",border:"none",cursor:"pointer",padding:2,color:"#8e8e93" }}><span className="material-symbols-outlined" style={{ fontSize:24 }}>keyboard_arrow_down</span></button>
                  </div>
                </div>
              </div>
              {/* Slut — H : M */}
              <div style={{ display:"flex",flexDirection:"column",alignItems:"center",borderLeft:"1px solid rgba(255,255,255,0.05)",borderRight:"1px solid rgba(255,255,255,0.05)" }}>
                <span style={{ ...secHead,marginBottom:12,color:tE!==slut?C.orange:"#8e8e93" }}>Slut</span>
                <div style={{ display:"flex",alignItems:"center",gap:2 }}>
                  <div style={{ display:"flex",flexDirection:"column",alignItems:"center" }}>
                    <button onClick={()=>{const h=(eH+1)%24;setTE(`${pad(h)}:${pad(eM)}`);}} style={{ background:"none",border:"none",cursor:"pointer",padding:2,color:"#8e8e93" }}><span className="material-symbols-outlined" style={{ fontSize:24 }}>keyboard_arrow_up</span></button>
                    <span style={{ fontSize:28,fontWeight:700,color:"#fff",width:28,textAlign:"center" }}>{pad(eH)}</span>
                    <button onClick={()=>{const h=(eH-1+24)%24;setTE(`${pad(h)}:${pad(eM)}`);}} style={{ background:"none",border:"none",cursor:"pointer",padding:2,color:"#8e8e93" }}><span className="material-symbols-outlined" style={{ fontSize:24 }}>keyboard_arrow_down</span></button>
                  </div>
                  <span style={{ fontSize:20,color:"#636366",fontWeight:300 }}>:</span>
                  <div style={{ display:"flex",flexDirection:"column",alignItems:"center" }}>
                    <button onClick={()=>{const m=(eM+1)%60;setTE(`${pad(eH)}:${pad(m)}`);}} style={{ background:"none",border:"none",cursor:"pointer",padding:2,color:"#8e8e93" }}><span className="material-symbols-outlined" style={{ fontSize:24 }}>keyboard_arrow_up</span></button>
                    <span style={{ fontSize:28,fontWeight:700,color:"#fff",width:28,textAlign:"center" }}>{pad(eM)}</span>
                    <button onClick={()=>{const m=(eM-1+60)%60;setTE(`${pad(eH)}:${pad(m)}`);}} style={{ background:"none",border:"none",cursor:"pointer",padding:2,color:"#8e8e93" }}><span className="material-symbols-outlined" style={{ fontSize:24 }}>keyboard_arrow_down</span></button>
                  </div>
                </div>
              </div>
              {/* Rast — 5 min steg */}
              <div style={{ display:"flex",flexDirection:"column",alignItems:"center" }}>
                <span style={{ ...secHead,marginBottom:12,color:tR!==rast?C.orange:"#8e8e93" }}>Rast</span>
                <div style={{ display:"flex",flexDirection:"column",alignItems:"center" }}>
                  <button onClick={()=>setTR(Math.min(120,tR+5))} style={{ background:"none",border:"none",cursor:"pointer",padding:2,color:"#8e8e93" }}><span className="material-symbols-outlined" style={{ fontSize:24 }}>keyboard_arrow_up</span></button>
                  <span style={{ fontSize:28,fontWeight:700,color:"#fff" }}>{tR}</span>
                  <span style={{ fontSize:10,color:"#8e8e93",marginTop:-2 }}>min</span>
                  <button onClick={()=>setTR(Math.max(0,tR-5))} style={{ background:"none",border:"none",cursor:"pointer",padding:2,color:"#8e8e93" }}><span className="material-symbols-outlined" style={{ fontSize:24 }}>keyboard_arrow_down</span></button>
                </div>
              </div>
            </div>
          </div>

          {/* Total */}
          <div style={{ borderRadius:16,padding:32,marginBottom:32,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",textAlign:"center",background:"rgba(52,199,89,0.1)" }}>
            <span style={{ fontSize:11,fontWeight:600,letterSpacing:"0.15em",textTransform:"uppercase",color:"#34c759",opacity:0.8,marginBottom:8 }}>Total arbetstid</span>
            <div style={{ fontSize:40,fontWeight:800,color:"#34c759",letterSpacing:"-0.03em" }}>{fmt(tAm)}</div>
          </div>

          {/* Kommentar */}
          {ä&&<div style={{ marginBottom:32 }}>
            <label style={{ ...secHead,display:"block",marginBottom:8,marginLeft:4 }}>Kommentar</label>
            <input placeholder="Kommentar till ändring" value={anledn} onChange={e=>setAnledn(e.target.value)}
              style={{ width:"100%",height:56,background:"#1c1c1e",border:"1px solid rgba(255,255,255,0.05)",borderRadius:12,padding:"0 16px",color:"#fff",fontSize:16,outline:"none",fontFamily:"inherit",boxSizing:"border-box" }}/>
          </div>}
        </main>

        {/* Fixed Save */}
        <div style={{ width:"100%",padding:"0 16px 24px",boxSizing:"border-box",marginTop:"auto" }}>
          <button style={{ width:"100%",height:56,background:"#34c759",color:"#fff",border:"none",borderRadius:14,fontSize:18,fontWeight:700,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 4px 20px rgba(52,199,89,0.2)",opacity:(ä&&!anledn)?0.35:1 }}
            disabled={ä&&!anledn}
            onClick={()=>{if(ä){setStart(tS);setSlut(tE);setRast(tR);setÄ(anledn);}setSteg("kväll");}}>
            {ä?"Spara":"Tillbaka"}
          </button>
        </div>
      </div>
    );
  }

  /* ─── ÄNDRA KM ─── */
  if(steg==="äKm"){
    const ny=tMK+tKK,ä=tMK!==(kmM?.km||0)||tKK!==(kmK?.km||0);
    const KmDigits = ({value,onChange,label}:{value:number;onChange:(v:number)=>void;label:string}) => {
      const h=Math.floor(value/100),t=Math.floor((value%100)/10),e=value%10;
      const Dig = ({v,add}:{v:number;add:number}) => (
        <div style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:4 }}>
          <button onClick={()=>onChange(Math.min(999,value+add))} style={{ background:"none",border:"none",cursor:"pointer",padding:4,color:"#636366",fontSize:28,fontFamily:"inherit",lineHeight:1 }}>
            <span className="material-symbols-outlined" style={{ fontSize:30 }}>expand_less</span>
          </button>
          <span style={{ fontSize:36,fontWeight:700,color:"#fff",letterSpacing:"-0.03em",width:32,textAlign:"center" }}>{v}</span>
          <button onClick={()=>onChange(Math.max(0,value-add))} style={{ background:"none",border:"none",cursor:"pointer",padding:4,color:"#636366",fontSize:28,fontFamily:"inherit",lineHeight:1 }}>
            <span className="material-symbols-outlined" style={{ fontSize:30 }}>expand_more</span>
          </button>
        </div>
      );
      return (
        <section style={{ marginBottom:40 }}>
          <h2 style={{ ...secHead,marginBottom:16,marginLeft:4 }}>{label}</h2>
          <div style={{ background:"#1c1c1e",borderRadius:16,padding:24,border:"0.5px solid rgba(255,255,255,0.06)" }}>
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:32 }}>
              <Dig v={h} add={100}/><Dig v={t} add={10}/><Dig v={e} add={1}/>
            </div>
            <div style={{ marginTop:16,textAlign:"center" }}>
              <span style={{ ...secHead,margin:0 }}>km</span>
            </div>
          </div>
        </section>
      );
    };
    return (
      <div style={{ minHeight:"100vh",background:"#000",color:"#e2e2e2",fontFamily:"'Inter',-apple-system,sans-serif",WebkitFontSmoothing:"antialiased",display:"flex",flexDirection:"column",paddingBottom:160 }}>
        <style>{css}</style>
        {/* Header */}
        <header style={{ position:"fixed",top:0,width:"100%",zIndex:50,background:"rgba(0,0,0,0.8)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",display:"flex",alignItems:"center",padding:"0 16px",height:56 }}>
          <button onClick={()=>setSteg("kväll")} style={{ background:"none",border:"none",cursor:"pointer",padding:4 }}>
            <span className="material-symbols-outlined" style={{ color:"#34c759" }}>arrow_back</span>
          </button>
          <h1 style={{ flex:1,textAlign:"center",margin:0,fontSize:20,fontWeight:600,color:"#fff",letterSpacing:"-0.02em" }}>Körning</h1>
          <div style={{ width:24 }}/>
        </header>

        <main style={{ marginTop:80,padding:"0 20px",flex:1 }}>
          <KmDigits value={tMK} onChange={setTMK} label="Morgon"/>
          <KmDigits value={tKK} onChange={setTKK} label="Kväll"/>

          {/* Totalt */}
          <section>
            <h2 style={{ ...secHead,marginBottom:16,marginLeft:4 }}>Totalt</h2>
            <div style={{ background:"rgba(52,199,89,0.1)",borderRadius:16,border:"1px solid rgba(52,199,89,0.2)",padding:32,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center" }}>
              <div style={{ fontSize:44,fontWeight:800,color:"#34c759",letterSpacing:"-0.03em" }}>{ny} km</div>
              <p style={{ margin:"8px 0 0",fontSize:11,fontWeight:700,letterSpacing:"0.15em",textTransform:"uppercase",color:"rgba(52,199,89,0.6)" }}>Dagens körsträcka</p>
              {ny>frikm&&<p style={{ margin:"8px 0 0",fontSize:14,color:"#34c759",fontWeight:600 }}>+{ny-frikm} km ger ersättning</p>}
            </div>
          </section>

          {ä&&<div style={{ marginTop:24 }}>
            <Label>Anledning <span style={{ color:C.red }}>*</span></Label>
            <input placeholder="Kommentar" value={anledn} onChange={e=>setAnledn(e.target.value)} style={input}/>
          </div>}
        </main>

        {/* Spara — fixed */}
        <div style={{ position:"fixed",bottom:0,left:0,width:"100%",padding:"16px 20px 36px",zIndex:40,boxSizing:"border-box",background:"linear-gradient(to top,#000 60%,transparent)" }}>
          <button style={{ width:"100%",height:56,background:"#34c759",color:"#fff",border:"none",borderRadius:14,fontSize:18,fontWeight:700,cursor:"pointer",fontFamily:"inherit",opacity:(ä&&!anledn)?0.35:1 }}
            disabled={ä&&!anledn}
            onClick={()=>{if(ä){setKmM({km:tMK});setKmK({km:tKK});}setSteg("kväll");}}>
            {ä?"Spara":"Tillbaka"}
          </button>
        </div>

      </div>
    );
  }

  /* ─── TRAKTAMENTE ─── */
  if(steg==="traktamente") {
    const helKr = gsAvtal?.traktamente_hel_kr ?? 300;
    const halvKr = gsAvtal?.traktamente_halv_kr ?? 150;
    const backTo = isWorking?"kväll":"morgon";
    return (
    <div style={shell}><style>{css}</style>
      <div style={topBar}><div style={{ display:"flex",alignItems:"center",gap:14 }}><BackBtn onClick={()=>setSteg(backTo)}/><h1 style={{ margin:0,fontSize:24,fontWeight:700 }}>Traktamente</h1></div></div>
      <div style={{ flex:1,paddingTop:16 }}>
        <p style={{ margin:"0 0 24px",fontSize:14,color:C.label }}>Skattefritt enligt Skatteverket</p>

        {/* Heldagstraktamente */}
        <Card onClick={()=>{setTrak({summa:helKr,typ:'hel'});setSteg(backTo);}}
          style={{ display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",border:trak?.typ==='hel'?"1px solid rgba(52,199,89,0.3)":"1px solid rgba(255,255,255,0.06)",background:trak?.typ==='hel'?"rgba(52,199,89,0.06)":"#1c1c1e" }}>
          <div>
            <p style={{ margin:0,fontSize:16,fontWeight:600 }}>Heldagstraktamente</p>
            <p style={{ margin:"3px 0 0",fontSize:13,color:C.label }}>Övernattning, borta hela dagen</p>
          </div>
          <p style={{ margin:0,fontSize:20,fontWeight:700 }}>{helKr} kr</p>
        </Card>

        {/* Halvdagstraktamente */}
        <Card onClick={()=>{setTrak({summa:halvKr,typ:'halv'});setSteg(backTo);}}
          style={{ display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",border:trak?.typ==='halv'?"1px solid rgba(52,199,89,0.3)":"1px solid rgba(255,255,255,0.06)",background:trak?.typ==='halv'?"rgba(52,199,89,0.06)":"#1c1c1e" }}>
          <div>
            <p style={{ margin:0,fontSize:16,fontWeight:600 }}>Halvdagstraktamente</p>
            <p style={{ margin:"3px 0 0",fontSize:13,color:C.label }}>Borta mer än 6 timmar</p>
          </div>
          <p style={{ margin:0,fontSize:20,fontWeight:700 }}>{halvKr} kr</p>
        </Card>

        {trak&&<button onClick={()=>{setTrak(null);setSteg(backTo);}} style={{ ...btn.textBack,marginTop:16,color:C.red }}>Ta bort traktamente</button>}
      </div>
      <BottomNavBar aktiv="morgon" onNav={s=>setSteg(s)} />
    </div>
  );}

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
            dag_typ:dagTyp,
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
    const titlar={service:"Service / Haveri",utbildning:"Utbildning",annat:"Annat arbete"};
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
            Starta dagen
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
        <button style={btn.primary} onClick={()=>{setSlut(mSlut);setRast(mRast);setSteg("kväll");}}>Spara och fortsätt</button>
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

          {/* Alla tre pickers på en rad */}
          {(()=>{ const [rH,rM]=redStart.split(":").map(Number),[rEH,rEM]=redSlut.split(":").map(Number); const p2=(n:number)=>String(n).padStart(2,"0"); return (
          <div style={{ background:C.card,borderRadius:16,padding:"20px 16px",marginBottom:16 }}>
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8 }}>
              {/* Start — H : M */}
              <div style={{ display:"flex",flexDirection:"column",alignItems:"center" }}>
                <span style={{ ...secHead,marginBottom:12,color:redStart!==(redDag.start||"00:00")?C.orange:"#8e8e93" }}>Start</span>
                <div style={{ display:"flex",alignItems:"center",gap:2 }}>
                  <div style={{ display:"flex",flexDirection:"column",alignItems:"center" }}>
                    <button onClick={()=>setRedStart(`${p2((rH+1)%24)}:${p2(rM)}`)} style={{ background:"none",border:"none",cursor:"pointer",padding:2,color:"#8e8e93" }}><span className="material-symbols-outlined" style={{ fontSize:24 }}>keyboard_arrow_up</span></button>
                    <span style={{ fontSize:28,fontWeight:700,color:"#fff",width:28,textAlign:"center" }}>{p2(rH)}</span>
                    <button onClick={()=>setRedStart(`${p2((rH-1+24)%24)}:${p2(rM)}`)} style={{ background:"none",border:"none",cursor:"pointer",padding:2,color:"#8e8e93" }}><span className="material-symbols-outlined" style={{ fontSize:24 }}>keyboard_arrow_down</span></button>
                  </div>
                  <span style={{ fontSize:20,color:"#636366",fontWeight:300 }}>:</span>
                  <div style={{ display:"flex",flexDirection:"column",alignItems:"center" }}>
                    <button onClick={()=>setRedStart(`${p2(rH)}:${p2((rM+1)%60)}`)} style={{ background:"none",border:"none",cursor:"pointer",padding:2,color:"#8e8e93" }}><span className="material-symbols-outlined" style={{ fontSize:24 }}>keyboard_arrow_up</span></button>
                    <span style={{ fontSize:28,fontWeight:700,color:"#fff",width:28,textAlign:"center" }}>{p2(rM)}</span>
                    <button onClick={()=>setRedStart(`${p2(rH)}:${p2((rM-1+60)%60)}`)} style={{ background:"none",border:"none",cursor:"pointer",padding:2,color:"#8e8e93" }}><span className="material-symbols-outlined" style={{ fontSize:24 }}>keyboard_arrow_down</span></button>
                  </div>
                </div>
              </div>
              {/* Slut — H : M */}
              <div style={{ display:"flex",flexDirection:"column",alignItems:"center",borderLeft:"1px solid rgba(255,255,255,0.05)",borderRight:"1px solid rgba(255,255,255,0.05)" }}>
                <span style={{ ...secHead,marginBottom:12,color:redSlut!==(redDag.slut||"00:00")?C.orange:"#8e8e93" }}>Slut</span>
                <div style={{ display:"flex",alignItems:"center",gap:2 }}>
                  <div style={{ display:"flex",flexDirection:"column",alignItems:"center" }}>
                    <button onClick={()=>setRedSlut(`${p2((rEH+1)%24)}:${p2(rEM)}`)} style={{ background:"none",border:"none",cursor:"pointer",padding:2,color:"#8e8e93" }}><span className="material-symbols-outlined" style={{ fontSize:24 }}>keyboard_arrow_up</span></button>
                    <span style={{ fontSize:28,fontWeight:700,color:"#fff",width:28,textAlign:"center" }}>{p2(rEH)}</span>
                    <button onClick={()=>setRedSlut(`${p2((rEH-1+24)%24)}:${p2(rEM)}`)} style={{ background:"none",border:"none",cursor:"pointer",padding:2,color:"#8e8e93" }}><span className="material-symbols-outlined" style={{ fontSize:24 }}>keyboard_arrow_down</span></button>
                  </div>
                  <span style={{ fontSize:20,color:"#636366",fontWeight:300 }}>:</span>
                  <div style={{ display:"flex",flexDirection:"column",alignItems:"center" }}>
                    <button onClick={()=>setRedSlut(`${p2(rEH)}:${p2((rEM+1)%60)}`)} style={{ background:"none",border:"none",cursor:"pointer",padding:2,color:"#8e8e93" }}><span className="material-symbols-outlined" style={{ fontSize:24 }}>keyboard_arrow_up</span></button>
                    <span style={{ fontSize:28,fontWeight:700,color:"#fff",width:28,textAlign:"center" }}>{p2(rEM)}</span>
                    <button onClick={()=>setRedSlut(`${p2(rEH)}:${p2((rEM-1+60)%60)}`)} style={{ background:"none",border:"none",cursor:"pointer",padding:2,color:"#8e8e93" }}><span className="material-symbols-outlined" style={{ fontSize:24 }}>keyboard_arrow_down</span></button>
                  </div>
                </div>
              </div>
              {/* Rast — 5 min steg */}
              <div style={{ display:"flex",flexDirection:"column",alignItems:"center" }}>
                <span style={{ ...secHead,marginBottom:12,color:redRast!==(redDag.rast||0)?C.orange:"#8e8e93" }}>Rast</span>
                <div style={{ display:"flex",flexDirection:"column",alignItems:"center" }}>
                  <button onClick={()=>setRedRast(Math.min(120,redRast+5))} style={{ background:"none",border:"none",cursor:"pointer",padding:2,color:"#8e8e93" }}><span className="material-symbols-outlined" style={{ fontSize:24 }}>keyboard_arrow_up</span></button>
                  <span style={{ fontSize:28,fontWeight:700,color:"#fff" }}>{redRast}</span>
                  <span style={{ fontSize:10,color:"#8e8e93",marginTop:-2 }}>min</span>
                  <button onClick={()=>setRedRast(Math.max(0,redRast-5))} style={{ background:"none",border:"none",cursor:"pointer",padding:2,color:"#8e8e93" }}><span className="material-symbols-outlined" style={{ fontSize:24 }}>keyboard_arrow_down</span></button>
                </div>
              </div>
            </div>
          </div>
          ); })()}

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
            {redKm>frikm&&<p style={{ margin:"8px 0 0",fontSize:15,color:C.green,fontWeight:600 }}>+{redKm-frikm} km ger ersättning</p>}
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
                  <span style={{ fontSize:16,fontWeight:500,color:"#fff" }}>{(()=>{const o=redObjektId?objektLista.find(x=>x.id===redObjektId):null; return o?o.namn:(redDag.objekt_namn||redDag.objekt_id||"—");})()}</span>
                  <ChevronRight/>
                </div>
              </div>
              <div onClick={()=>setRedVy("km")} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 0",borderBottom:redDag.extra>0?`1px solid ${C.line}`:"none",cursor:"pointer" }}>
                <span style={{ fontSize:16,color:C.label }}>Körning</span>
                <div style={{ display:"flex",alignItems:"center",gap:10 }}>
                  <span style={{ fontSize:16,fontWeight:600,color:redKm!==redDag.km?C.orange:C.ink }}>{redKm} km</span>
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
                  const { error } = await supabase.from("arbetsdag").upsert({
                    medarbetare_id: medarbetare.id,
                    datum: redDag.datum,
                    start_tid: redStart, slut_tid: redSlut, rast_min: redRast,
                    arbetad_min: Math.max(0, tim(redStart,redSlut)-redRast),
                    km_totalt: redKm, objekt_id: redObjektId || redDag.objekt_id || null, maskin_id: redMaskinId || redDag.maskin_id || null, redigerad: true,
                    redigerad_anl: redAnl, redigerad_tid: new Date().toISOString(),
                  });
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

        {/* Rast-picker — centrerad */}
        {visaRedRastPicker&&(
          <div onClick={()=>setVisaRedRastPicker(false)} style={{ position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.7)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center" }}>
            <div onClick={e=>e.stopPropagation()} style={{ background:"#1c1c1e",borderRadius:16,padding:24,width:240 }}>
              <p style={{ margin:"0 0 16px",fontSize:13,fontWeight:600,color:"#8e8e93",textAlign:"center" }}>Rast</p>
              <div style={{ display:"flex",flexDirection:"column",alignItems:"center" }}>
                <button onClick={()=>setRedRast(Math.min(120,redRast+5))} style={{ background:"none",border:"none",cursor:"pointer",padding:4,color:"#8e8e93" }}>
                  <span className="material-symbols-outlined" style={{ fontSize:28 }}>keyboard_arrow_up</span>
                </button>
                <span style={{ fontSize:36,fontWeight:700,color:"#fff",padding:"4px 0" }}>{redRast}</span>
                <span style={{ fontSize:11,color:"#8e8e93",marginTop:-4,marginBottom:4 }}>min</span>
                <button onClick={()=>setRedRast(Math.max(0,redRast-5))} style={{ background:"none",border:"none",cursor:"pointer",padding:4,color:"#8e8e93" }}>
                  <span className="material-symbols-outlined" style={{ fontSize:28 }}>keyboard_arrow_down</span>
                </button>
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
    const totalKm = Object.values(dagData).reduce((a: number, d: any) => a + (d.km_morgon || 0) + (d.km_kvall || 0) + (d.km_totalt || d.km || 0), 0);
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

          {/* Summary card */}
          <section style={{ marginTop:16,marginBottom:32 }}>
            <div style={{ background:"#1c1c1e",borderRadius:12,padding:24 }}>
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:"24px 0" }}>
                {[
                  ["Arbetsdagar",`${arbetsdagar} dagar`],
                  ["Mål",`${målH} tim`],
                  ["Jobbat",`${jobbadH} tim`],
                  ["Körning",`${totalKm} km`],
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

                return (
                  <div key={i}
                    onClick={()=>{ if(klickbar){
                      const d2=dagData[k];
                      setRedDag({...d2,datum});
                      setRedStart(d2?.start_tid||"00:00");
                      setRedSlut(d2?.slut_tid||"00:00");
                      setRedRast(d2?.rast_min||0);
                      setRedKm(d2?.km_totalt||0);
                      setRedAnl("");
                      setRedObjektId(d2?.objekt_id||null);
                      setRedMaskinId(d2?.maskin_id||null);
                      setRedVy("översikt");
                      setSteg("redigera");
                    } }}
                    style={{ position:"relative",display:"flex",flexDirection:"column",alignItems:"center",cursor:klickbar?"pointer":"default",padding:"8px 0" }}>
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
                    {/* Status dot: bekräftad=vit, saknas=röd */}
                    {(s==="ok"||s==="saknas")&&!helgNamn&&(
                      <div style={{ width:4,height:4,borderRadius:"50%",background:dotFärg[s],marginTop:4 }}/>
                    )}
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
