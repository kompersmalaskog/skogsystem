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
`;

const C = {
  bg:"#f2f2f7", card:"#ffffff", label:"#8e8e93", text:"#1c1c1e",
  line:"rgba(60,60,67,0.12)", blue:"#007aff", green:"#34c759",
  red:"#ff3b30", orange:"#ff9500", ink:"#1c1c1e",
  dark:"#1c1c1e", darkCard:"rgba(255,255,255,0.08)", darkLabel:"rgba(255,255,255,0.4)",
};
const T = { fontFamily:'-apple-system,"SF Pro Display","SF Pro Text",sans-serif', color:C.text };
const shell: CSSProperties  = { minHeight:"100vh", background:C.bg, ...T, display:"flex", flexDirection:"column" as const, padding:"0 20px" };
const darkShell: CSSProperties = { ...shell, background:C.dark, color:"#fff" };
const topBar: CSSProperties = { paddingTop:56, paddingBottom:12 };
const mid: CSSProperties    = { flex:1, display:"flex", flexDirection:"column" as const, justifyContent:"center", alignItems:"center", textAlign:"center" as const };
const bottom: CSSProperties = { paddingBottom:36, display:"flex", flexDirection:"column" as const, gap:10 };

const btn = {
  primary:   { width:"100%", padding:"17px 24px", background:C.ink,   color:"#fff", border:"none", borderRadius:14, fontSize:17, fontWeight:600, cursor:"pointer" },
  green:     { width:"100%", padding:"17px 24px", background:C.green, color:"#fff", border:"none", borderRadius:14, fontSize:17, fontWeight:600, cursor:"pointer" },
  secondary: { width:"100%", padding:"17px 24px", background:C.card,  color:C.ink,  border:"none", borderRadius:14, fontSize:17, fontWeight:600, cursor:"pointer", boxShadow:"0 1px 3px rgba(0,0,0,0.08)" },
  ghost:     { width:"100%", padding:"14px 24px", background:"transparent", color:C.blue, border:`1.5px solid ${C.blue}`, borderRadius:14, fontSize:15, fontWeight:600, cursor:"pointer" },
  danger:    { width:"100%", padding:"17px 24px", background:"transparent", color:C.red, border:`1.5px solid ${C.red}`, borderRadius:14, fontSize:17, fontWeight:600, cursor:"pointer" },
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

/* ── Sub-komponenter ── */
const BackBtn = ({ onClick, light = false }: { onClick: () => void; light?: boolean }) => (
  <button onClick={onClick} style={{ width:40,height:40,borderRadius:12,background:light?"rgba(255,255,255,0.14)":"rgba(0,0,0,0.06)",border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
    <svg width="9" height="16" viewBox="0 0 9 16" fill="none"><path d="M8 1L1 8L8 15" stroke={light?"#fff":C.ink} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
  </button>
);

const Label = ({ children, style }: { children: ReactNode; style?: CSSProperties }) => (
  <p style={{ margin:"0 0 8px",fontSize:13,fontWeight:600,color:C.label,textTransform:"uppercase",letterSpacing:"0.6px",...style }}>{children}</p>
);

const Card = ({ children, style, onClick }: { children?: ReactNode; onClick?: () => void; style?: CSSProperties }) => (
  <div onClick={onClick} style={{ background:C.card,borderRadius:16,padding:"18px 20px",marginBottom:10,boxShadow:"0 1px 4px rgba(0,0,0,0.06)",cursor:onClick?"pointer":"default",...style }}>{children}</div>
);

const ChevronRight = ({ light = false }: { light?: boolean }) => (
  <svg width="8" height="14" viewBox="0 0 8 14" fill="none">
    <path d="M1 1l6 6-6 6" stroke={light?"rgba(255,255,255,0.3)":C.label} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
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
    <button style={{ width:52,height:40,background:C.card,border:"none",borderRadius:10,fontSize:16,cursor:"pointer",color:C.ink,boxShadow:"0 1px 3px rgba(0,0,0,0.08)" }} onClick={()=>onChange(value===max?min:value+1)}>▲</button>
    <div style={{ width:60,height:52,background:"#f2f2f7",borderRadius:12,fontSize:30,fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center",color:C.ink }}>{String(value).padStart(pad,"0")}</div>
    <button style={{ width:52,height:40,background:C.card,border:"none",borderRadius:10,fontSize:16,cursor:"pointer",color:C.ink,boxShadow:"0 1px 3px rgba(0,0,0,0.08)" }} onClick={()=>onChange(value===min?max:value-1)}>▼</button>
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
      <button style={{ width:44,height:40,background:C.card,border:"none",borderRadius:10,fontSize:16,cursor:"pointer",color:C.ink,boxShadow:"0 1px 3px rgba(0,0,0,0.08)" }} onClick={()=>onChange(Math.min(999,value+add))}>▲</button>
      <div style={{ width:48,height:52,background:"#f2f2f7",borderRadius:12,fontSize:28,fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center",color:C.ink }}>{v}</div>
      <button style={{ width:44,height:40,background:C.card,border:"none",borderRadius:10,fontSize:16,cursor:"pointer",color:C.ink,boxShadow:"0 1px 3px rgba(0,0,0,0.08)" }} onClick={()=>onChange(Math.max(0,value-add))}>▼</button>
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
          <Card key={o.id} onClick={()=>{setObj(o);setVäljer(false);}} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",background:obj?.id===o.id?"rgba(0,122,255,0.06)":C.card,border:obj?.id===o.id?`1px solid rgba(0,122,255,0.2)`:"none" }}>
            <div>
              <p style={{ margin:0,fontSize:16,fontWeight:600 }}>{o.namn}</p>
              <p style={{ margin:"3px 0 0",fontSize:13,color:C.label }}>{o.ägare}</p>
            </div>
            {obj?.id===o.id
              ? <div style={{ width:22,height:22,borderRadius:"50%",background:C.blue,display:"flex",alignItems:"center",justifyContent:"center" }}><svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l3 3L9 1" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
              : <ChevronRight/>
            }
          </Card>
        ))}
      </div>
    </div>
  );

  return (
    <div style={shell}>
      <style>{css}</style>
      <div style={topBar}>
        <div style={{ display:"flex",alignItems:"center",gap:14 }}>
          <BackBtn onClick={onAvbryt}/>
          <h1 style={{ margin:0,fontSize:24,fontWeight:700 }}>Extra tid</h1>
        </div>
      </div>
      <div style={{ flex:1,overflowY:"auto",paddingTop:8 }}>

        {/* Debiterbar toggle */}
        <Card style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6 }}>
          <div>
            <p style={{ margin:0,fontSize:16,fontWeight:600 }}>Debiterbar</p>
            <p style={{ margin:"2px 0 0",fontSize:13,color:C.label }}>Faktureras kunden</p>
          </div>
          <div onClick={()=>{setDeb(v=>!v); if(deb)setObj(null);}}
            style={{ width:51,height:31,borderRadius:16,background:deb?C.green:"rgba(120,120,128,0.2)",cursor:"pointer",position:"relative",transition:"background 0.2s" }}>
            <div style={{ width:27,height:27,borderRadius:"50%",background:"#fff",position:"absolute",top:2,left:deb?22:2,transition:"left 0.2s",boxShadow:"0 2px 4px rgba(0,0,0,0.2)" }}/>
          </div>
        </Card>

        {/* Objekt – visas bara om debiterbar */}
        {deb && (
          <Card onClick={()=>setVäljer(true)} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6 }}>
            <div>
              <p style={{ margin:0,fontSize:16,fontWeight:600 }}>Objekt</p>
              <p style={{ margin:"2px 0 0",fontSize:13,color:obj?C.blue:C.label }}>{obj?obj.namn:"Välj objekt"}</p>
            </div>
            <ChevronRight/>
          </Card>
        )}

        {/* Tid */}
        <div style={{ background:C.card,borderRadius:16,padding:"18px 20px",marginBottom:6,boxShadow:"0 1px 4px rgba(0,0,0,0.06)" }}>
          <MinPicker value={min} onChange={setMin} label="Tid"/>
          <div style={{ textAlign:"center",marginTop:-8 }}>
            <p style={{ margin:0,fontSize:32,fontWeight:700,color:C.green }}>{fmt(min)}</p>
          </div>
        </div>

        {/* Beskrivning */}
        <Card>
          <Label>Vad gjorde du?</Label>
          <input
            placeholder="Kommentar"
            value={besk}
            onChange={e=>setBesk(e.target.value)}
            style={{ width:"100%",padding:"12px 14px",fontSize:16,border:"1px solid rgba(0,0,0,0.08)",borderRadius:10,outline:"none",background:"#f9f9f9",fontFamily:"inherit" }}
          />
        </Card>
      </div>

      <div style={bottom}>
        <button
          style={{ ...btn.primary, opacity:besk&&(!deb||obj)?1:0.35 }}
          disabled={!besk||(!(!deb||obj))}
          onClick={()=>onSpara({min,besk,deb,obj})}
        >
          Spara
        </button>
        {harBefintlig && <button style={btn.danger} onClick={onTaBort}>Ta bort extra tid</button>}
        <button style={btn.secondary} onClick={onAvbryt}>Avbryt</button>
      </div>
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
  const [maskinNamn, setMaskinNamn] = useState<string | null>(null);

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
        supabase.from("arbetsdag").select("*").eq("medarbetare_id", med.data.id).order("datum",{ascending:false}).limit(10)
          .then(res => { if(res.data) setHistorik(res.data); });
      }
      if(avt.data) setGsAvtal(avt.data);
      if(obj.data) setObjektLista(obj.data.map(o => ({id:o.objekt_id, namn:o.object_name||o.objekt_id, ägare:o.skogsagare||''})));
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
              start: r.start_tid || '06:00',
              slut: r.slut_tid || '16:00',
              rast: r.rast_min || 30,
            };
          }
          setDagData(map);
        }
      });
  }, [medarbetare, kalÅr, kalMånad]);

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
  const isWorking = !!dagData[idagKey];
  const förnamn = medarbetare?.namn?.split(' ')[0] || '';

  const input = { width:"100%",padding:"15px 16px",fontSize:16,border:"none",borderRadius:12,background:C.card,outline:"none",boxShadow:"0 1px 3px rgba(0,0,0,0.08)",fontFamily:"inherit" };

  // Loading fallback
  if(!medarbetare) return (
    <div style={shell}>
      <style>{css}</style>
      <div style={{ flex:1,display:"flex",alignItems:"center",justifyContent:"center" }}>
        <p style={{ fontSize:17,color:C.label }}>Laddar...</p>
      </div>
    </div>
  );

  // Extra tid – en skärm
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

  /* ─── MORGON ─── */
  if(steg==="morgon") return (
    <div style={shell}>
      <style>{css}</style>
      <div style={{ ...topBar, display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
        <div>
          <p style={{ margin:0,fontSize:15,color:C.label,fontWeight:500 }}>{datumStr}</p>
        </div>
        {/* Synlig meny-knapp — inte gömd bakom datumklick */}
        <button onClick={()=>setSteg("meny")} style={{ width:36,height:36,borderRadius:10,background:månadsKlar&&!lönSkickat?"rgba(255,149,0,0.12)":"rgba(0,0,0,0.06)",border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",position:"relative",animation:månadsKlar&&!lönSkickat?"menuPulse 1.5s ease-in-out infinite":"none" }}>
          <svg width="16" height="12" viewBox="0 0 16 12" fill="none">
            <path d="M0 1h16M0 6h16M0 11h16" stroke={månadsKlar&&!lönSkickat?C.orange:C.ink} strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
          {månadsKlar&&!lönSkickat&&(
            <div style={{ position:"absolute",top:6,right:6,width:7,height:7,borderRadius:"50%",background:C.orange,border:"1.5px solid #f2f2f7" }}/>
          )}
        </button>
      </div>

      <div style={{ flex:1,display:"flex",flexDirection:"column",justifyContent:"center" }}>
        <div style={{ animation:"fadeUp 0.5s ease both" }}>
          <h1 style={{ fontSize:34,fontWeight:700,letterSpacing:"-0.5px",margin:"0 0 6px" }}>God morgon, {förnamn}</h1>
          <p style={{ margin:"0 0 32px",fontSize:16,color:C.label }}>Kör försiktigt till jobbet</p>
        </div>

        {/* Notis om löneunderlag — visas när månaden är slut och underlaget ej skickat */}
        {månadsKlar&&!lönSkickat&&(
          <div onClick={()=>setSteg("lön")} style={{ background:"rgba(255,149,0,0.08)",border:`1px solid rgba(255,149,0,0.25)`,borderRadius:14,padding:"16px",marginBottom:16,cursor:"pointer",animation:"fadeUp 0.4s ease" }}>
            <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:6 }}>
              <div style={{ width:8,height:8,borderRadius:"50%",background:C.orange,flexShrink:0 }}/>
              <p style={{ margin:0,fontSize:13,fontWeight:700,color:C.orange,textTransform:"uppercase",letterSpacing:"0.5px" }}>Månaden är slut</p>
            </div>
            <p style={{ margin:"0 0 10px",fontSize:15,fontWeight:600,color:C.ink }}>Granska och godkänn löneunderlaget för {månadsNamn()}</p>
            <div style={{ display:"flex",alignItems:"center",gap:6 }}>
              <span style={{ fontSize:14,color:C.orange,fontWeight:500 }}>Öppna löneunderlag</span>
              <svg width="6" height="10" viewBox="0 0 9 16" fill="none"><path d="M1 1L8 8L1 15" stroke={C.orange} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
          </div>
        )}

        <Card style={{ background:C.dark,color:"#fff",animation:"fadeUp 0.5s ease 0.1s both" }}>
          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start" }}>
            <div>
              <p style={{ margin:"0 0 6px",fontSize:13,color:"rgba(255,255,255,0.4)",fontWeight:500 }}>{dagensObjekt || maskinNamn || 'Aktuellt objekt'}</p>
              <p style={{ margin:0,fontSize:42,fontWeight:600,letterSpacing:"-1px" }}>{vader?.temp !== undefined ? `${vader.temp}°` : '...'}</p>
              <p style={{ margin:"4px 0 0",fontSize:15,color:"rgba(255,255,255,0.55)" }}>{vader ? symbolText(vader.symbol) : 'Hämtar väder...'}</p>
            </div>
          </div>
        </Card>

        {kmM&&<Card style={{ display:"flex",alignItems:"center",gap:12,animation:"fadeUp 0.3s ease" }}>
          <div style={{ width:10,height:10,borderRadius:"50%",background:C.green }}/>
          <span style={{ fontSize:15,color:C.green,fontWeight:500 }}>Körning loggas · {kmM.km} km</span>
        </Card>}
      </div>

      <div style={bottom}>
        <p style={{ margin:"0 0 4px",fontSize:13,color:C.label,textAlign:"center" }}>Appen registrerar automatiskt vid inloggning på maskinen</p>
      </div>
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
          <h1 style={{ margin:"0 0 6px",fontSize:26,fontWeight:700 }}>God morgon, {förnamn}</h1>
          <p style={{ margin:0,fontSize:15,color:C.label }}>Du loggade in på maskinen</p>
        </div>

        <div style={{ flex:1,overflowY:"auto",paddingTop:8 }}>

          {/* GPS-avvikelse-kort */}
          <div style={{ background:"rgba(255,149,0,0.08)",borderRadius:16,padding:"18px 20px",marginBottom:20,border:"1px solid rgba(255,149,0,0.2)" }}>
            <p style={{ margin:"0 0 12px",fontSize:12,fontWeight:700,color:C.orange,textTransform:"uppercase",letterSpacing:"1px" }}>GPS märkte längre rutt</p>
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
                style={{ width:"100%",padding:"15px 16px",fontSize:16,border:"none",borderRadius:12,background:C.card,outline:"none",boxShadow:"0 1px 3px rgba(0,0,0,0.08)",fontFamily:"inherit" }}/>
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

  /* ─── MENY ─── */
  if(steg==="meny") return (
    <div style={shell}>
      <style>{css}</style>
      <div style={topBar}>
        <div style={{ display:"flex",alignItems:"center",gap:14 }}>
          <BackBtn onClick={()=>setSteg(isWorking?"dag":"morgon")}/>
          <div>
            <p style={{ margin:0,fontSize:13,color:C.label }}>{datumStr}</p>
            <h1 style={{ margin:"4px 0 0",fontSize:26,fontWeight:700 }}>Välj dagtyp</h1>
          </div>
        </div>
      </div>
      <div style={{ flex:1,overflowY:"auto",paddingTop:16 }}>
        <Label>Idag</Label>
        {[
          {id:"sjuk",label:"Sjukfrånvaro"},
          {id:"vab",label:"VAB"},
          {id:"service",label:"Service / Haveri"},
          {id:"annat",label:"Annat arbete"},
          {id:"utbildning",label:"Utbildning"},
        ].map(item=>(
          <Card key={item.id} onClick={()=>{setDagTyp(item.id);setSteg(item.id==="sjuk"||item.id==="vab"?"bekräftaFrånvaro":"manuellDag");}} style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
            <span style={{ fontSize:16,fontWeight:500 }}>{item.label}</span>
            <ChevronRight/>
          </Card>
        ))}
        <Card onClick={()=>setSteg("traktamente")} style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
          <div>
            <p style={{ margin:0,fontSize:16,fontWeight:500 }}>Traktamente</p>
            <p style={{ margin:"2px 0 0",fontSize:13,color:C.label }}>{gsAvtal?.traktamente_hel_kr ?? 300} kr / dag</p>
          </div>
          <ChevronRight/>
        </Card>
        <div style={{ marginTop:24 }}><Label>Kalender</Label></div>
        <Card onClick={()=>setSteg("kalender")} style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
          <div>
            <p style={{ margin:0,fontSize:16,fontWeight:500 }}>{månadsNamn()}</p>
            <p style={{ margin:"2px 0 0",fontSize:13,color:C.label }}>1 dag saknas · 18 bekräftade</p>
          </div>
          <ChevronRight/>
        </Card>
        <div style={{ marginTop:24 }}><Label>Löneunderlag</Label></div>
        <Card onClick={()=>setSteg("lön")} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",background:lönSkickat?"rgba(52,199,89,0.06)":månadsKlar?"rgba(255,149,0,0.08)":C.card,border:lönSkickat?"1px solid rgba(52,199,89,0.2)":månadsKlar?"1px solid rgba(255,149,0,0.25)":"none",animation:månadsKlar&&!lönSkickat?"menuPulse 1.5s ease-in-out infinite":"none" }}>
          <div>
            <p style={{ margin:0,fontSize:16,fontWeight:500,color:månadsKlar&&!lönSkickat?C.orange:C.ink }}>{månadsNamn()}</p>
            <p style={{ margin:"2px 0 0",fontSize:13,color:lönSkickat?C.green:månadsKlar?C.orange:C.label }}>{lönSkickat?"Skickat till chef":månadsKlar?"Väntar på godkännande":"Ej skickat"}</p>
          </div>
          <ChevronRight/>
        </Card>
        <div style={{ marginTop:24 }}><Label>Övrigt</Label></div>
        <Card onClick={()=>setSteg("inst")} style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
          <div>
            <p style={{ margin:0,fontSize:16,fontWeight:500 }}>Inställningar</p>
            <p style={{ margin:"2px 0 0",fontSize:13,color:hemadress?C.label:C.orange }}>{hemadress||"Hemadress saknas"}</p>
          </div>
          <ChevronRight/>
        </Card>
        <Card onClick={()=>setSteg("avtal")} style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
          <div>
            <p style={{ margin:0,fontSize:16,fontWeight:500 }}>Mitt avtal</p>
            <p style={{ margin:"2px 0 0",fontSize:13,color:C.label }}>{gsAvtal?.namn || 'GS-avtalet'}</p>
          </div>
          <ChevronRight/>
        </Card>
      </div>
    </div>
  );

  /* ─── LÖNEUNDERLAG ─── */
  if(steg==="lön"){
    const timlon = gsAvtal?.timlon_kr ?? 185;
    const otFaktor = gsAvtal?.overtid_faktor ?? 1.5;
    const frikm2 = gsAvtal?.km_grans_per_dag ?? 120;
    const kmErs2 = gsAvtal?.km_ersattning_kr ?? 2.90;
    const trakHel = gsAvtal?.traktamente_hel_kr ?? 300;

    // Beräkna från faktiska dagar i historik
    const arbetsdagar = historik.length || 21;
    const jobbadMin2 = historik.reduce((a,d) => a + (d.arbetad_min || 0), 0);
    const jobbadH = historik.length > 0 ? Math.round(jobbadMin2/60*10)/10 : 0;
    const målH = arbetsdagar * 8;
    const övH = Math.max(0, jobbadH - målH);
    const övKr = Math.round(övH * timlon * otFaktor);
    const totalKm = historik.reduce((a,d) => a + (d.km_totalt || d.km_morgon || 0) + (d.km_kvall || 0), 0);
    const löneErsKm = Math.max(0, totalKm - frikm2*arbetsdagar);
    const löneErsKr = Math.round(löneErsKm * kmErs2);
    const trakDagar = historik.filter(d => d.traktamente).length;
    const trakKr = trakDagar * trakHel;
    const redigeringar = Object.entries(redDagar);
    const nu = new Date();
    const lönePeriod = `${nu.getFullYear()}-${String(nu.getMonth()+1).padStart(2,"0")}`;

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

    return (
      <div style={shell}><style>{css}</style>
        <div style={topBar}>
          <div style={{ display:"flex",alignItems:"center",gap:14 }}>
            <BackBtn onClick={()=>setSteg("meny")}/>
            <div>
              <p style={{ margin:0,fontSize:13,color:C.label }}>Löneunderlag</p>
              <h1 style={{ margin:"4px 0 0",fontSize:26,fontWeight:700 }}>{månadsNamn()}</h1>
            </div>
          </div>
        </div>

        <div style={{ flex:1,overflowY:"auto",paddingTop:8 }}>

          {/* Status */}
          {lönSkickat&&(
            <div style={{ background:"rgba(52,199,89,0.08)",borderRadius:12,padding:"14px 16px",marginBottom:16,border:"1px solid rgba(52,199,89,0.2)",display:"flex",alignItems:"center",gap:10 }}>
              <div style={{ width:8,height:8,borderRadius:"50%",background:C.green,flexShrink:0 }}/>
              <p style={{ margin:0,fontSize:14,fontWeight:600,color:C.green }}>Skickat till chef</p>
            </div>
          )}

          <Label>Arbetstid</Label>
          <Card style={{ padding:"4px 20px",marginBottom:20 }}>
            {[
              ["Arbetsdagar",`${arbetsdagar} dagar`],
              ["Mål",`${målH} tim`],
              ["Jobbat",`${jobbadH} tim`,jobbadH>=målH?C.green:C.orange],
              ["Övertid",`${övH} tim`,övH>0?C.orange:C.ink],
            ].map(([l,v,c],i,arr)=>(
              <div key={l} style={{ display:"flex",justifyContent:"space-between",padding:"12px 0",borderBottom:i<arr.length-1?`1px solid ${C.line}`:"none" }}>
                <span style={{ fontSize:15,color:C.label }}>{l}</span>
                <span style={{ fontSize:15,fontWeight:600,color:c||C.ink }}>{v}</span>
              </div>
            ))}
          </Card>

          <Label>Körersättning</Label>
          <Card style={{ padding:"4px 20px",marginBottom:20 }}>
            {[
              ["Total körning",`${totalKm} km`],
              ["Km utan ersättning",`${(frikm2*arbetsdagar)} km`],
              ["Ersättningsgrundande",`${löneErsKm} km`,löneErsKm>0?C.green:C.ink],
            ].map(([l,v,c],i,arr)=>(
              <div key={l} style={{ display:"flex",justifyContent:"space-between",padding:"12px 0",borderBottom:i<arr.length-1?`1px solid ${C.line}`:"none" }}>
                <span style={{ fontSize:15,color:C.label }}>{l}</span>
                <span style={{ fontSize:15,fontWeight:600,color:c||C.ink }}>{v}</span>
              </div>
            ))}
          </Card>

          <Label>Traktamente</Label>
          <Card style={{ padding:"4px 20px",marginBottom:20 }}>
            <div style={{ display:"flex",justifyContent:"space-between",padding:"12px 0" }}>
              <span style={{ fontSize:15,color:C.label }}>Dagar</span>
              <span style={{ fontSize:15,fontWeight:600 }}>{trakDagar} dagar</span>
            </div>
          </Card>

          {/* Redigeringar */}
          {/* Objekt */}
          <Label>Objekt</Label>
          <Card style={{ padding:"4px 20px",marginBottom:20 }}>
            {(() => {
              // arbetsdag har ingen objekt_id — visa maskin istället
              const maskinMap: Record<string,number> = {};
              historik.forEach(d => { if(d.maskin_id) maskinMap[d.maskin_id] = (maskinMap[d.maskin_id]||0)+1; });
              const maskinEntries = Object.entries(maskinMap).sort((a,b) => b[1]-a[1]);
              if(maskinEntries.length === 0) return (
                <div style={{ padding:"12px 0" }}>
                  <p style={{ margin:0,fontSize:14,color:C.label }}>Inga objekt denna period</p>
                </div>
              );
              return maskinEntries.map(([mid, dagarCount], i) => (
                  <div key={mid} style={{ padding:"12px 0",borderBottom:i<maskinEntries.length-1?`1px solid ${C.line}`:"none" }}>
                    <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start" }}>
                      <div>
                        <p style={{ margin:0,fontSize:15,fontWeight:600 }}>{mid === medarbetare?.maskin_id && maskinNamn ? maskinNamn : mid}</p>
                      </div>
                      <span style={{ fontSize:14,fontWeight:600,color:C.label,whiteSpace:"nowrap",marginLeft:8 }}>{dagarCount} dagar</span>
                    </div>
                  </div>
              ));
            })()}
          </Card>

          {/* Frånvaro */}
          {[
            {typ:"Sjukfrånvaro", dagar:2, kommentar:""},
            {typ:"Utbildning", dagar:1, kommentar:"Motorsågskörkort"},
          ].length>0&&(
            <>
              <Label>Frånvaro</Label>
              <Card style={{ padding:"4px 20px",marginBottom:20 }}>
                {[
                  {typ:"Sjukfrånvaro", dagar:2, kommentar:""},
                  {typ:"Utbildning", dagar:1, kommentar:"Motorsågskörkort"},
                ].map(({typ,dagar,kommentar},i,arr)=>(
                  <div key={typ} style={{ padding:"12px 0",borderBottom:i<arr.length-1?`1px solid ${C.line}`:"none" }}>
                    <div style={{ display:"flex",justifyContent:"space-between" }}>
                      <span style={{ fontSize:15,fontWeight:600 }}>{typ}</span>
                      <span style={{ fontSize:15,fontWeight:600 }}>{dagar} {dagar===1?"dag":"dagar"}</span>
                    </div>
                    {kommentar&&<p style={{ margin:"4px 0 0",fontSize:13,color:C.label }}>{kommentar}</p>}
                  </div>
                ))}
              </Card>
            </>
          )}

          {redigeringar.length>0&&(
            <>
              <Label>Redigerade dagar</Label>
              <Card style={{ padding:"4px 20px",marginBottom:20 }}>
                {redigeringar.map(([datum,v],i,arr)=>(
                  <div key={datum} style={{ padding:"12px 0",borderBottom:i<arr.length-1?`1px solid ${C.line}`:"none" }}>
                    <div style={{ display:"flex",justifyContent:"space-between" }}>
                      <span style={{ fontSize:15,fontWeight:600 }}>{datum}</span>
                      <span style={{ fontSize:13,color:C.blue }}>Redigerad</span>
                    </div>
                    {v.anl&&<p style={{ margin:"4px 0 0",fontSize:13,color:C.label }}>{v.anl}</p>}
                  </div>
                ))}
              </Card>
            </>
          )}

          {lönFel&&(
            <div style={{ background:"rgba(255,59,48,0.08)",borderRadius:12,padding:"12px 16px",marginBottom:16,border:"1px solid rgba(255,59,48,0.2)" }}>
              <p style={{ margin:0,fontSize:14,color:C.red }}>{lönFel}</p>
            </div>
          )}
        </div>

        <div style={bottom}>
          {!lönSkickat?(
            <button style={{ ...btn.primary,opacity:lönSparar?0.6:1 }} onClick={skickaLön} disabled={lönSparar}>
              {lönSparar?"Sparar...":"Skicka till chef"}
            </button>
          ):(
            <button style={{ ...btn.primary,background:C.green }} disabled>
              ✓ Skickat
            </button>
          )}
          <button style={btn.secondary} onClick={()=>setSteg("meny")}>Stäng</button>
        </div>
      </div>
    );
  }

  /* ─── INSTÄLLNINGAR ─── */
  if(steg==="inst") return (
    <div style={shell}><style>{css}</style>
      <div style={topBar}>
        <div style={{ display:"flex",alignItems:"center",gap:14 }}>
          <BackBtn onClick={()=>setSteg("meny")}/>
          <h1 style={{ margin:0,fontSize:26,fontWeight:700 }}>Inställningar</h1>
        </div>
      </div>
      <div style={{ flex:1,paddingTop:16 }}>
        <Label>Hemadress</Label>
        <Card style={{ marginBottom:6 }}>
          <p style={{ margin:"0 0 10px",fontSize:13,color:C.label }}>Används för att beräkna körersättning</p>
          <input
            value={redigHem||hemadress}
            onChange={e=>setRedigHem(e.target.value)}
            onFocus={()=>{ if(!redigHem) setRedigHem(hemadress); }}
            style={{ width:"100%",padding:"13px 14px",fontSize:16,border:`1px solid ${C.line}`,borderRadius:10,outline:"none",background:"#f9f9f9",fontFamily:"inherit" }}
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
            placeholder="T.ex. Min bil"
            style={{ width:"100%",padding:"13px 14px",fontSize:16,border:`1px solid ${C.line}`,borderRadius:10,outline:"none",background:"#f9f9f9",fontFamily:"inherit" }}
          />
        </Card>
        <div style={{ background:"rgba(52,199,89,0.07)",borderRadius:10,padding:"10px 14px",display:"flex",alignItems:"center",gap:8 }}>
          <div style={{ width:8,height:8,borderRadius:"50%",background:C.green,flexShrink:0 }}/>
          <p style={{ margin:0,fontSize:13,color:C.green,fontWeight:500 }}>{btBil} ansluten</p>
        </div>
        <div style={{ marginTop:40, paddingTop:20, borderTop:`1px solid ${C.line}` }}>
          <button
            onClick={async ()=>{ await supabase.auth.signOut(); window.location.href='/login'; }}
            style={{ width:"100%",padding:"14px 0",borderRadius:12,border:"none",background:"rgba(239,68,68,0.12)",color:"#ef4444",fontSize:16,fontWeight:600,fontFamily:"inherit",cursor:"pointer" }}
          >
            Logga ut
          </button>
        </div>
      </div>
      <div style={bottom}>
        <button style={{ ...btn.primary,opacity:(redigHem&&redigHem!==hemadress)||(redigBt&&redigBt!==btBil)?1:0.35 }}
          disabled={!(redigHem&&redigHem!==hemadress)&&!(redigBt&&redigBt!==btBil)}
          onClick={()=>{ if(redigHem)setHemadress(redigHem); if(redigBt)setBtBil(redigBt); setRedigHem(""); setRedigBt(""); setSteg("meny"); }}>
          Spara
        </button>
        <button style={btn.secondary} onClick={()=>{ setRedigHem(""); setSteg("meny"); }}>Avbryt</button>
      </div>
    </div>
  );

  /* ─── MITT AVTAL ─── */
  if(steg==="avtal") return (
    <div style={shell}><style>{css}</style>
      <div style={topBar}>
        <div style={{ display:"flex",alignItems:"center",gap:14 }}>
          <BackBtn onClick={()=>setSteg("meny")}/>
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
        <div style={{ background:"rgba(0,122,255,0.06)",borderRadius:14,padding:"14px 16px",marginBottom:24,border:"1px solid rgba(0,122,255,0.12)" }}>
          <p style={{ margin:0,fontSize:13,color:C.blue,fontWeight:500 }}>Värdena hämtas från Supabase och uppdateras automatiskt om avtalet ändras.</p>
        </div>
      </div>
    </div>
  );

  /* ─── KALENDER ─── */

  if(steg==="dag") return (
    <div style={shell}>
      <style>{css}</style>
      <div style={{ ...topBar,display:"flex",justifyContent:"space-between",alignItems:"flex-start" }}>
        <p style={{ margin:0,fontSize:15,color:C.label }}>{datumStr}</p>
        <button onClick={()=>setSteg("meny")} style={{ width:36,height:36,borderRadius:10,background:"rgba(0,0,0,0.06)",border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center" }}>
          <svg width="16" height="12" viewBox="0 0 16 12" fill="none"><path d="M0 1h16M0 6h16M0 11h16" stroke={C.ink} strokeWidth="1.8" strokeLinecap="round"/></svg>
        </button>
      </div>
      <div style={mid}>
        <div style={{ width:10,height:10,borderRadius:"50%",background:C.green,marginBottom:28,animation:"pulseDot 2s infinite" }}/>
        <p style={{ fontSize:72,fontWeight:600,margin:0,letterSpacing:"-3px" }}>{start}</p>
        <p style={{ fontSize:16,color:C.label,margin:"10px 0 28px" }}>Inloggad på maskin</p>
        <div style={{ background:"rgba(52,199,89,0.1)",borderRadius:12,padding:"12px 24px",marginBottom:24 }}>
          <p style={{ margin:0,fontSize:15,fontWeight:600,color:C.green }}>{maskinNamn || 'Aktuellt objekt'}</p>
        </div>

      </div>
      <div style={bottom}>
        <p style={{ margin:"0 0 4px",fontSize:13,color:C.label,textAlign:"center" }}>Appen registrerar automatiskt vid utloggning från maskinen</p>
      </div>
    </div>
  );

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
          <h1 style={{ margin:"0 0 6px",fontSize:26,fontWeight:700 }}>God kväll, {förnamn}</h1>
          <p style={{ margin:0,fontSize:15,color:C.darkLabel }}>Du är nästan klar för dagen</p>
        </div>

        <div style={{ flex:1,overflowY:"auto",paddingTop:8 }}>
          {/* GPS-avvikelse-kort */}
          <div style={{ background:"rgba(255,149,0,0.1)",borderRadius:16,padding:"18px 20px",marginBottom:20,border:"1px solid rgba(255,149,0,0.25)" }}>
            <p style={{ margin:"0 0 12px",fontSize:12,fontWeight:700,color:C.orange,textTransform:"uppercase",letterSpacing:"1px" }}>GPS märkte längre hemkörning</p>
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
            style={{ ...btn.green,opacity:(kvAvTyp&&kvAvBesk&&(!kvAvDeb||kvAvObj))?1:0.35,boxShadow:"0 4px 20px rgba(52,199,89,0.3)" }}
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
    <div style={darkShell}>
      <style>{css}</style>
      <div style={{ ...topBar,display:"flex",justifyContent:"space-between",alignItems:"flex-start" }}>
        <div>
          <p style={{ margin:0,fontSize:15,color:C.darkLabel }}>{ datumStr}</p>
          <h1 style={{ margin:"6px 0 0",fontSize:28,fontWeight:700 }}>God kväll, {förnamn}</h1>
        </div>
        <button onClick={()=>setSteg("meny")} style={{ width:36,height:36,borderRadius:10,background:"rgba(255,255,255,0.1)",border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",marginTop:6 }}>
          <svg width="16" height="12" viewBox="0 0 16 12" fill="none"><path d="M0 1h16M0 6h16M0 11h16" stroke="#fff" strokeWidth="1.8" strokeLinecap="round"/></svg>
        </button>
      </div>

      <div style={{ flex:1,overflowY:"auto",paddingTop:8,paddingBottom:16 }}>

        {/* Arbetstid */}
        <div onClick={()=>{setTS(start);setTE(slut);setTR(rast);setAnledn("");setSteg("äTid");}}
          style={{ background:ändring?"rgba(255,149,0,0.1)":C.darkCard,borderRadius:16,padding:"18px 20px",marginBottom:10,cursor:"pointer",border:`1px solid ${ändring?"rgba(255,149,0,0.3)":"rgba(255,255,255,0.08)"}` }}>
          <p style={{ margin:"0 0 10px",fontSize:12,fontWeight:700,color:C.darkLabel,textTransform:"uppercase",letterSpacing:"1.5px" }}>Arbetstid</p>
          <p style={{ margin:0,fontSize:36,fontWeight:700 }}>{fmt(arbMin)}</p>
          <p style={{ margin:"6px 0 0",fontSize:14,color:C.darkLabel }}>{start} – {slut} · {rast} min rast</p>
          {ändring&&<p style={{ margin:"8px 0 0",fontSize:13,fontWeight:600,color:C.orange }}>Ändrad</p>}
        </div>

        {/* Körning */}
        <div onClick={()=>{setTMK(kmM?.km||0);setTKK(kmK?.km||0);setAnledn("");setSteg("äKm");}}
          style={{ background:C.darkCard,borderRadius:16,padding:"18px 20px",marginBottom:10,cursor:"pointer",border:"1px solid rgba(255,255,255,0.08)" }}>
          <p style={{ margin:"0 0 10px",fontSize:12,fontWeight:700,color:C.darkLabel,textTransform:"uppercase",letterSpacing:"1.5px" }}>Körning</p>
          {totKm>0?<>
            <p style={{ margin:0,fontSize:36,fontWeight:700 }}>{totKm} km</p>
            {ersKm>0&&<p style={{ margin:"6px 0 0",fontSize:14,fontWeight:600,color:C.green }}>+{ersKm} km · {ersKr.toFixed(0)} kr ersättning</p>}
          </>:<p style={{ margin:0,fontSize:18,color:"rgba(255,255,255,0.3)" }}>Ingen körning</p>}
        </div>

        {/* Extra tid */}
        {extra.length>0?(
          <div onClick={()=>setSteg("extraTid")}
            style={{ background:"rgba(0,122,255,0.12)",borderRadius:16,padding:"18px 20px",marginBottom:10,cursor:"pointer",border:"1px solid rgba(0,122,255,0.25)" }}>
            <p style={{ margin:"0 0 10px",fontSize:12,fontWeight:700,color:C.darkLabel,textTransform:"uppercase",letterSpacing:"1.5px" }}>Extra tid</p>
            <p style={{ margin:0,fontSize:36,fontWeight:700 }}>{fmt(totEx)}</p>
            <p style={{ margin:"6px 0 0",fontSize:14,color:C.darkLabel }}>{extra.map(e=>e.besk).join(", ")}</p>
          </div>
        ):(
          /* Lägg till extra tid — tydlig knapp, inte gömd bakom datum */
          <button onClick={()=>setSteg("extraTid")}
            style={{ width:"100%",background:"rgba(255,255,255,0.05)",border:"1.5px dashed rgba(255,255,255,0.15)",borderRadius:16,padding:"16px 20px",marginBottom:10,cursor:"pointer",textAlign:"left",color:"rgba(255,255,255,0.4)",fontSize:15,fontWeight:500 }}>
            + Lägg till extra tid
          </button>
        )}

        {/* Traktamente */}
        {trak?(
          <div onClick={()=>setSteg("traktamente")}
            style={{ background:"rgba(52,199,89,0.1)",borderRadius:16,padding:"18px 20px",marginBottom:10,cursor:"pointer",border:"1px solid rgba(52,199,89,0.2)" }}>
            <p style={{ margin:"0 0 10px",fontSize:12,fontWeight:700,color:C.darkLabel,textTransform:"uppercase",letterSpacing:"1.5px" }}>Traktamente</p>
            <p style={{ margin:0,fontSize:36,fontWeight:700 }}>{trak.summa} kr</p>
            <p style={{ margin:"6px 0 0",fontSize:14,color:C.darkLabel }}>Heldag · skattefritt</p>
          </div>
        ):(
          <button onClick={()=>setSteg("traktamente")}
            style={{ width:"100%",background:"rgba(255,255,255,0.05)",border:"1.5px dashed rgba(255,255,255,0.15)",borderRadius:16,padding:"16px 20px",marginBottom:10,cursor:"pointer",textAlign:"left",color:"rgba(255,255,255,0.4)",fontSize:15,fontWeight:500 }}>
            + Lägg till traktamente
          </button>
        )}

        {/* Totalt */}
        <div style={{ background:"rgba(52,199,89,0.1)",borderRadius:16,padding:"20px",marginTop:4,border:"1px solid rgba(52,199,89,0.18)" }}>
          <p style={{ margin:"0 0 6px",fontSize:12,fontWeight:700,color:C.darkLabel,textTransform:"uppercase",letterSpacing:"1.5px" }}>Totalt idag</p>
          <p style={{ margin:0,fontSize:44,fontWeight:700,color:C.green }}>{fmt(totMin)}</p>
        </div>
      </div>

      <div style={bottom}>
        <button style={{ ...btn.green,boxShadow:"0 4px 20px rgba(52,199,89,0.3)" }} onClick={async ()=>{
          await supabase.from("arbetsdag").upsert({
            medarbetare_id: medarbetare.id,
            datum: new Date().toISOString().split("T")[0],
            start_tid: start, slut_tid: slut, rast_min: rast,
            km_morgon: kmM?.km ?? 0, km_kvall: kmK?.km ?? 0,
            maskin_id: medarbetare.maskin_id,
            traktamente: trak, bekraftad: true,
            bekraftad_tid: new Date().toISOString(),
          });
          setSteg("klar");
        }}>
          Allt stämmer
        </button>
      </div>
    </div>
  );

  /* ─── ÄNDRA ARBETSTID ─── */
  if(steg==="äTid"){
    const tAm=Math.max(0,tim(tS,tE)-tR),ä=tS!==start||tE!==slut||tR!==rast;
    return (
      <div style={shell}><style>{css}</style>
        <div style={topBar}><div style={{ display:"flex",alignItems:"center",gap:14 }}><BackBtn onClick={()=>setSteg("kväll")}/><h1 style={{ margin:0,fontSize:24,fontWeight:700 }}>Arbetstid</h1></div></div>
        <div style={{ flex:1,overflowY:"auto",paddingTop:24 }}>

          <div style={{ background:C.card,borderRadius:16,padding:"20px 16px",marginBottom:16,boxShadow:"0 1px 4px rgba(0,0,0,0.06)" }}>
            <div style={{ display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:8 }}>

              {/* Start */}
              <div style={{ flex:1,textAlign:"center" }}>
                <p style={{ margin:"0 0 10px",fontSize:11,fontWeight:700,color:tS!==start?C.orange:C.label,textTransform:"uppercase",letterSpacing:"1px" }}>Start</p>
                {(()=>{ const [h,m]=tS.split(":").map(Number); return (
                  <div style={{ display:"flex",justifyContent:"center",alignItems:"center",gap:4 }}>
                    <Drum value={h} onChange={v=>setTS(`${String(v).padStart(2,"0")}:${String(m).padStart(2,"0")}`)} max={23}/>
                    <span style={{ fontSize:22,fontWeight:300,color:C.label }}>:</span>
                    <Drum value={m} onChange={v=>setTS(`${String(h).padStart(2,"0")}:${String(v).padStart(2,"0")}`)} max={59}/>
                  </div>
                ); })()}
              </div>

              <div style={{ width:1,background:C.line,alignSelf:"stretch",marginTop:28 }}/>

              {/* Slut */}
              <div style={{ flex:1,textAlign:"center" }}>
                <p style={{ margin:"0 0 10px",fontSize:11,fontWeight:700,color:tE!==slut?C.orange:C.label,textTransform:"uppercase",letterSpacing:"1px" }}>Slut</p>
                {(()=>{ const [h,m]=tE.split(":").map(Number); return (
                  <div style={{ display:"flex",justifyContent:"center",alignItems:"center",gap:4 }}>
                    <Drum value={h} onChange={v=>setTE(`${String(v).padStart(2,"0")}:${String(m).padStart(2,"0")}`)} max={23}/>
                    <span style={{ fontSize:22,fontWeight:300,color:C.label }}>:</span>
                    <Drum value={m} onChange={v=>setTE(`${String(h).padStart(2,"0")}:${String(v).padStart(2,"0")}`)} max={59}/>
                  </div>
                ); })()}
              </div>

              <div style={{ width:1,background:C.line,alignSelf:"stretch",marginTop:28 }}/>

              {/* Rast */}
              <div style={{ flex:1,textAlign:"center" }}>
                <p style={{ margin:"0 0 10px",fontSize:11,fontWeight:700,color:tR!==rast?C.orange:C.label,textTransform:"uppercase",letterSpacing:"1px" }}>Rast</p>
                {(()=>{ const m=tR%60; return (
                  <div style={{ display:"flex",justifyContent:"center",alignItems:"center",gap:4 }}>
                    <Drum value={m} onChange={v=>setTR(v)} max={59}/>
                    <span style={{ fontSize:11,color:C.label,fontWeight:600 }}>min</span>
                  </div>
                ); })()}
              </div>
            </div>
          </div>

          <div style={{ textAlign:"center",padding:"18px 20px",background:ä?"rgba(52,199,89,0.07)":"#f2f2f7",borderRadius:14,marginBottom:16 }}>
            <p style={{ margin:"0 0 4px",fontSize:12,fontWeight:700,color:C.label,textTransform:"uppercase",letterSpacing:"1px" }}>Total arbetstid</p>
            <p style={{ margin:0,fontSize:48,fontWeight:700,color:ä?C.green:C.ink }}>{fmt(tAm)}</p>
          </div>

          {ä&&<div style={{ marginBottom:20 }}>
            <Label>Anledning <span style={{ color:C.red }}>*</span></Label>
            <input placeholder="Kommentar" value={anledn} onChange={e=>setAnledn(e.target.value)} style={input}/>
          </div>}
        </div>
        <div style={bottom}>
          <button style={{ ...btn.primary,opacity:(ä&&!anledn)?0.35:1 }} disabled={ä&&!anledn}
            onClick={()=>{if(ä){setStart(tS);setSlut(tE);setRast(tR);setÄ(anledn);}setSteg("kväll");}}>
            {ä?"Spara ändring":"Tillbaka"}
          </button>
        </div>
      </div>
    );
  }

  /* ─── ÄNDRA KM ─── */
  if(steg==="äKm"){
    const ny=tMK+tKK,ä=tMK!==(kmM?.km||0)||tKK!==(kmK?.km||0);
    return (
      <div style={shell}><style>{css}</style>
        <div style={topBar}><div style={{ display:"flex",alignItems:"center",gap:14 }}><BackBtn onClick={()=>setSteg("kväll")}/><h1 style={{ margin:0,fontSize:24,fontWeight:700 }}>Körning</h1></div></div>
        <div style={{ flex:1,paddingTop:20 }}>
          <KmPicker value={tMK} onChange={setTMK} label="Morgon"/>
          <KmPicker value={tKK} onChange={setTKK} label="Kväll"/>
          <div style={{ textAlign:"center",padding:24,background:"rgba(52,199,89,0.07)",borderRadius:16,marginBottom:24 }}>
            <Label>Totalt</Label>
            <p style={{ margin:0,fontSize:48,fontWeight:700,color:C.green }}>{ny} km</p>
            {ny>frikm&&<p style={{ margin:"8px 0 0",fontSize:15,color:C.green,fontWeight:600 }}>+{ny-frikm} km ger ersättning</p>}
          </div>
          {ä&&<div style={{ marginBottom:20 }}>
            <Label>Anledning <span style={{ color:C.red }}>*</span></Label>
            <input placeholder="Kommentar" value={anledn} onChange={e=>setAnledn(e.target.value)} style={input}/>
          </div>}
        </div>
        <div style={bottom}>
          <button style={{ ...btn.primary,opacity:(ä&&!anledn)?0.35:1 }} disabled={ä&&!anledn}
            onClick={()=>{if(ä){setKmM({km:tMK});setKmK({km:tKK});}setSteg("kväll");}}>
            {ä?"Spara":"Tillbaka"}
          </button>
        </div>
      </div>
    );
  }

  /* ─── TRAKTAMENTE ─── */
  if(steg==="traktamente") return (
    <div style={shell}><style>{css}</style>
      <div style={topBar}><div style={{ display:"flex",alignItems:"center",gap:14 }}><BackBtn onClick={()=>setSteg(isWorking?"kväll":"meny")}/><h1 style={{ margin:0,fontSize:24,fontWeight:700 }}>Traktamente</h1></div></div>
      <div style={mid}>
        <p style={{ margin:"0 0 4px",fontSize:72,fontWeight:700,letterSpacing:"-3px" }}>{gsAvtal?.traktamente_hel_kr ?? 300}</p>
        <p style={{ margin:"0 0 6px",fontSize:22,color:C.label,fontWeight:300 }}>kr per dag</p>
        <p style={{ margin:"0 0 32px",fontSize:14,color:C.label }}>Skattefritt enligt Skatteverket</p>
        <div style={{ background:"rgba(52,199,89,0.08)",borderRadius:14,padding:"12px 24px" }}>
          <p style={{ margin:0,fontSize:14,color:C.green,fontWeight:600 }}>Heldagstraktamente</p>
        </div>
      </div>
      <div style={bottom}>
        {!trak
          ?<button style={btn.primary} onClick={()=>{setTrak({summa:gsAvtal?.traktamente_hel_kr ?? 300});setSteg(isWorking?"kväll":"meny");}}>Lägg till</button>
          :<button style={btn.danger}  onClick={()=>{setTrak(null);      setSteg(isWorking?"kväll":"meny");}}>Ta bort</button>
        }
      </div>
    </div>
  );

  /* ─── FRÅNVARO ─── */
  if(steg==="bekräftaFrånvaro") return (
    <div style={shell}><style>{css}</style>
      <div style={topBar}><p style={{ margin:0,fontSize:15,color:C.label }}>{datumStr}</p></div>
      <div style={mid}>
        <div style={{ width:80,height:80,borderRadius:24,background:"#f2f2f7",display:"flex",alignItems:"center",justifyContent:"center",marginBottom:28,animation:"scalePop 0.4s ease" }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
            <path d={dagTyp==="sjuk"?"M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15v-4H7l5-8v4h4l-5 8z":"M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"} fill={C.label}/>
          </svg>
        </div>
        <h1 style={{ fontSize:28,fontWeight:700,margin:"0 0 10px" }}>{dagTyp==="sjuk"?"Krya på dig":"Hoppas barnet mår bättre"}</h1>
        <p style={{ fontSize:16,color:C.label }}>{dagTyp==="sjuk"?"Sjukanmälan":"VAB"} registreras för {datumStr}</p>
      </div>
      <div style={bottom}>
        <button style={btn.primary} onClick={()=>setSteg("klarFrånvaro")}>Bekräfta</button>
        <button style={btn.secondary} onClick={()=>setSteg("meny")}>Avbryt</button>
      </div>
    </div>
  );

  if(steg==="klarFrånvaro") return (
    <div style={shell}><style>{css}</style>
      <div style={topBar}><p style={{ margin:0,fontSize:15,color:C.label }}>{datumStr}</p></div>
      <div style={mid}>
        <div style={{ animation:"scalePop 0.4s ease",marginBottom:28 }}><CheckCircle/></div>
        <h1 style={{ fontSize:28,fontWeight:700,margin:"0 0 10px" }}>Registrerat</h1>
        <p style={{ fontSize:16,color:C.label }}>{dagTyp==="sjuk"?"Sjukanmälan":"VAB"} för {datumStr}</p>
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
        <div style={topBar}><div style={{ display:"flex",alignItems:"center",gap:14 }}><BackBtn onClick={()=>setSteg("meny")}/><h1 style={{ margin:0,fontSize:24,fontWeight:700 }}>{titlar[dagTyp]}</h1></div></div>
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
        <button onClick={()=>setSteg("meny")} style={{ width:36,height:36,borderRadius:10,background:"rgba(0,0,0,0.06)",border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center" }}>
          <svg width="16" height="12" viewBox="0 0 16 12" fill="none"><path d="M0 1h16M0 6h16M0 11h16" stroke={C.ink} strokeWidth="1.8" strokeLinecap="round"/></svg>
        </button>
      </div>
      <div style={mid}>
        <div style={{ width:10,height:10,borderRadius:"50%",background:C.blue,marginBottom:28,animation:"pulseDot 2s infinite" }}/>
        <p style={{ fontSize:72,fontWeight:600,margin:0,letterSpacing:"-3px" }}>{start}</p>
        <p style={{ fontSize:16,color:C.label,margin:"10px 0 24px" }}>Arbetsdag startad</p>
        <div style={{ background:"rgba(0,0,0,0.05)",borderRadius:12,padding:"12px 24px" }}>
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
    const harÄndrat = redStart!==(redDag.start||"06:00")||redSlut!==(redDag.slut||"16:00")||redRast!==(redDag.rast||30)||redKm!==redDag.km;

    if(redVy==="tid") return (
      <div style={shell}><style>{css}</style>
        <div style={topBar}><div style={{ display:"flex",alignItems:"center",gap:14 }}><BackBtn onClick={()=>setRedVy("översikt")}/><h1 style={{ margin:0,fontSize:24,fontWeight:700 }}>Ändra arbetstid</h1></div></div>
        <div style={{ flex:1,overflowY:"auto",paddingTop:24 }}>

          {/* Alla tre pickers på en rad */}
          <div style={{ background:C.card,borderRadius:16,padding:"20px 16px",marginBottom:16,boxShadow:"0 1px 4px rgba(0,0,0,0.06)" }}>
            <div style={{ display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:8 }}>

              {/* Start */}
              <div style={{ flex:1,textAlign:"center" }}>
                <p style={{ margin:"0 0 10px",fontSize:11,fontWeight:700,color:redStart!==(redDag.start||"06:00")?C.orange:C.label,textTransform:"uppercase",letterSpacing:"1px" }}>Start</p>
                {(()=>{ const [h,m]=redStart.split(":").map(Number); return (
                  <div style={{ display:"flex",justifyContent:"center",alignItems:"center",gap:4 }}>
                    <Drum value={h} onChange={v=>setRedStart(`${String(v).padStart(2,"0")}:${String(m).padStart(2,"0")}`)} max={23}/>
                    <span style={{ fontSize:22,fontWeight:300,color:C.label }}>:</span>
                    <Drum value={m} onChange={v=>setRedStart(`${String(h).padStart(2,"0")}:${String(v).padStart(2,"0")}`)} max={59}/>
                  </div>
                ); })()}
              </div>

              <div style={{ width:1,background:C.line,alignSelf:"stretch",marginTop:28 }}/>

              {/* Slut */}
              <div style={{ flex:1,textAlign:"center" }}>
                <p style={{ margin:"0 0 10px",fontSize:11,fontWeight:700,color:redSlut!==(redDag.slut||"16:00")?C.orange:C.label,textTransform:"uppercase",letterSpacing:"1px" }}>Slut</p>
                {(()=>{ const [h,m]=redSlut.split(":").map(Number); return (
                  <div style={{ display:"flex",justifyContent:"center",alignItems:"center",gap:4 }}>
                    <Drum value={h} onChange={v=>setRedSlut(`${String(v).padStart(2,"0")}:${String(m).padStart(2,"0")}`)} max={23}/>
                    <span style={{ fontSize:22,fontWeight:300,color:C.label }}>:</span>
                    <Drum value={m} onChange={v=>setRedSlut(`${String(h).padStart(2,"0")}:${String(v).padStart(2,"0")}`)} max={59}/>
                  </div>
                ); })()}
              </div>

              <div style={{ width:1,background:C.line,alignSelf:"stretch",marginTop:28 }}/>

              {/* Rast */}
              <div style={{ flex:1,textAlign:"center" }}>
                <p style={{ margin:"0 0 10px",fontSize:11,fontWeight:700,color:redRast!==(redDag.rast||30)?C.orange:C.label,textTransform:"uppercase",letterSpacing:"1px" }}>Rast</p>
                {(()=>{ const h=Math.floor(redRast/60),m=redRast%60; return (
                  <div style={{ display:"flex",justifyContent:"center",alignItems:"center",gap:4 }}>
                    <Drum value={m} onChange={v=>setRedRast(h*60+v)} max={59}/>
                    <span style={{ fontSize:11,color:C.label,fontWeight:600 }}>min</span>
                  </div>
                ); })()}
              </div>
            </div>
          </div>

          {/* Resultat */}
          <div style={{ textAlign:"center",padding:"18px 20px",background:"rgba(52,199,89,0.07)",borderRadius:14 }}>
            <p style={{ margin:"0 0 4px",fontSize:12,fontWeight:700,color:C.label,textTransform:"uppercase",letterSpacing:"1px" }}>Arbetstid</p>
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

    const sparadRed: {start:string;slut:string;rast:number;km:number;anl:string} | undefined = redDagar[redDag.datum];

    if(sparadRed && redVy==="översikt") return (
      <div style={shell}><style>{css}</style>
        <div style={topBar}>
          <div style={{ display:"flex",alignItems:"center",gap:14 }}>
            <BackBtn onClick={()=>setSteg("kalender")}/>
            <div>
              <p style={{ margin:0,fontSize:13,color:C.blue,fontWeight:600 }}>Redigerad</p>
              <h1 style={{ margin:"4px 0 0",fontSize:26,fontWeight:700 }}>{redDag.datum}</h1>
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
                <span style={{ fontSize:15,fontWeight:600,color:C.blue }}>{v}</span>
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
              <p style={{ margin:0,fontSize:13,color:C.label }}>{månadsNamn()}</p>
              <h1 style={{ margin:"4px 0 0",fontSize:26,fontWeight:700 }}>{redDag.datum}</h1>
            </div>
          </div>
        </div>
        <div style={{ flex:1,overflowY:"auto",paddingTop:8 }}>
          {redDag.status==="saknas"&&(
            <div style={{ background:"rgba(255,149,0,0.08)",borderRadius:12,padding:"14px 16px",marginBottom:16,border:"1px solid rgba(255,149,0,0.2)" }}>
              <p style={{ margin:0,fontSize:14,fontWeight:600,color:C.orange }}>Rapport saknas — fyll i och bekräfta</p>
            </div>
          )}

          {/* Klickbara rader */}
          <Card style={{ padding:"4px 20px" }}>
            <div onClick={()=>setRedVy("tid")} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 0",borderBottom:`1px solid ${C.line}`,cursor:"pointer" }}>
              <span style={{ fontSize:16,color:C.label }}>Arbetstid</span>
              <div style={{ display:"flex",alignItems:"center",gap:10 }}>
                <span style={{ fontSize:16,fontWeight:600,color:(redStart!==(redDag.start||"06:00")||redSlut!==(redDag.slut||"16:00")||redRast!==(redDag.rast||30))?C.orange:C.ink }}>{fmt(redArbMin)}</span>
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

          {/* Anledning — visas bara om något ändrats */}
          {harÄndrat&&(
            <div style={{ marginTop:16 }}>
              <Label>Anledning till ändring <span style={{ color:C.red }}>*</span></Label>
              <input
                placeholder="Kommentar"
                value={redAnl}
                onChange={e=>setRedAnl(e.target.value)}
                style={{ width:"100%",padding:"15px 16px",fontSize:16,border:"none",borderRadius:12,background:C.card,outline:"none",boxShadow:"0 1px 3px rgba(0,0,0,0.08)",fontFamily:"inherit" }}
              />
            </div>
          )}
        </div>
        <div style={bottom}>
          <button
            style={{ ...btn.primary,opacity:harÄndrat&&!redAnl?0.35:1 }}
            disabled={harÄndrat&&!redAnl}
            onClick={async ()=>{
              if(harÄndrat) {
                setRedDagar(r=>({...r,[redDag.datum]:{start:redStart,slut:redSlut,rast:redRast,km:redKm,anl:redAnl}}));
                await supabase.from("arbetsdag").upsert({
                  medarbetare_id: medarbetare.id,
                  datum: redDag.datum,
                  start_tid: redStart, slut_tid: redSlut, rast_min: redRast,
                  km_totalt: redKm, redigerad: true,
                  redigerad_anl: redAnl, redigerad_tid: new Date().toISOString(),
                });
              }
              setSteg("kalender");
            }}>
            {redDag.status==="saknas"?"Bekräfta dag":harÄndrat?"Spara ändring":"Tillbaka"}
          </button>
        </div>
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

    const dagBg={
      ok:"rgba(52,199,89,0.12)",
      saknas:"rgba(255,149,0,0.15)",
      röd:"rgba(255,59,48,0.08)",
      tom:"rgba(0,0,0,0.03)",
      weekend:"transparent",
    };
    const dagTextFärg={
      ok:C.ink, saknas:C.orange, röd:C.red,
      tom:"rgba(0,0,0,0.2)", weekend:"rgba(0,0,0,0.18)",
    };
    const dotFärg={ok:C.green,saknas:C.orange};

    return (
      <div style={shell}><style>{css}</style>
        <div style={topBar}>
          <div style={{ display:"flex",alignItems:"center",gap:14,marginBottom:20 }}>
            <div style={{ flex:1,display:"flex",alignItems:"center",justifyContent:"space-between" }}>
              <button onClick={()=>kanBakåt&&navigera(-1)} style={{ width:36,height:36,borderRadius:10,background:"rgba(0,0,0,0.06)",border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",opacity:kanBakåt?1:0.3 }}>
                <svg width="8" height="14" viewBox="0 0 9 16" fill="none"><path d="M8 1L1 8L8 15" stroke={C.ink} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
              <h1 style={{ margin:0,fontSize:22,fontWeight:700 }}>{kalMånadLabel}</h1>
              <button onClick={()=>kanFramåt&&navigera(1)} style={{ width:36,height:36,borderRadius:10,background:"rgba(0,0,0,0.06)",border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",opacity:kanFramåt?1:0.3 }}>
                <svg width="8" height="14" viewBox="0 0 9 16" fill="none"><path d="M1 1L8 8L1 15" stroke={C.ink} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
            </div>
            <button onClick={()=>setSteg("meny")} style={{ width:36,height:36,borderRadius:10,background:"rgba(0,0,0,0.06)",border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 1l12 12M13 1L1 13" stroke={C.ink} strokeWidth="2" strokeLinecap="round"/></svg>
            </button>
          </div>
          <div style={{ display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4,marginBottom:4 }}>
            {veckar.map(v=>(
              <div key={v} style={{ textAlign:"center",fontSize:11,fontWeight:700,color:C.label,letterSpacing:"0.5px",padding:"4px 0" }}>{v}</div>
            ))}
          </div>
        </div>

        <div style={{ flex:1,overflowY:"auto",paddingBottom:24 }}>
          <div style={{ display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4 }}>
            {cells.map((d,i)=>{
              if(!d) return <div key={i}/>;
              const s=statusFärg(d);
              const isToday=d===nuDat.getDate()&&kalMånad===nuDat.getMonth()&&kalÅr===nuDat.getFullYear();
              const k=dagKey(d);
              const klickbar=s==="ok"||s==="saknas";
              const datum=`${d} ${new Date(kalÅr,kalMånad,1).toLocaleString('sv-SE',{month:'short'})}`;
              const erRedigerad=!!redDagar[datum]&&typeof redDagar[datum]==="object";
              return (
                <div key={i}
                  onClick={()=>{ if(klickbar){
                    const d2=dagData[k];
                    setRedDag({...d2,datum});
                    setRedStart(d2?.start||"06:00");
                    setRedSlut(d2?.slut||"16:00");
                    setRedRast(d2?.rast||30);
                    setRedKm(d2?.km||0);
                    setRedAnl("");
                    setRedVy("översikt");
                    setSteg("redigera");
                  } }}
                  title={rödaDagar[k]||""}
                  style={{ aspectRatio:"1",borderRadius:12,background:isToday?C.ink:dagBg[s]||"transparent",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",cursor:klickbar?"pointer":"default",border:s==="röd"?`1px solid rgba(255,59,48,0.2)`:"2px solid transparent",position:"relative" }}>
                  <div style={{ position:"relative",display:"flex",alignItems:"center",justifyContent:"center" }}>
                    {erRedigerad&&<div style={{ position:"absolute",width:28,height:28,borderRadius:"50%",border:`2px solid ${C.blue}` }}/>}
                    <span style={{ fontSize:15,fontWeight:isToday||s==="röd"?700:500,color:isToday?"#fff":dagTextFärg[s]||C.ink }}>{d}</span>
                  </div>
                  {(s==="ok"||s==="saknas")&&!erRedigerad&&(
                    <div style={{ width:4,height:4,borderRadius:"50%",background:dotFärg[s],marginTop:2 }}/>
                  )}
                  {erRedigerad&&(
                    <div style={{ width:4,height:4,borderRadius:"50%",background:C.blue,marginTop:2 }}/>
                  )}
                  {s==="röd"&&(
                    <div style={{ width:4,height:4,borderRadius:"50%",background:C.red,marginTop:2 }}/>
                  )}
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div style={{ display:"flex",gap:14,justifyContent:"center",marginTop:20,flexWrap:"wrap" }}>
            {[[C.green,"Bekräftad"],[C.orange,"Saknas"],[C.red,"Röd dag"],[C.blue,"Redigerad"],[C.ink,"Idag"]].map(([c,l])=>(
              <div key={l} style={{ display:"flex",alignItems:"center",gap:5 }}>
                <div style={{ width:7,height:7,borderRadius:"50%",background:c }}/>
                <span style={{ fontSize:11,color:C.label,fontWeight:500 }}>{l}</span>
              </div>
            ))}
          </div>

          {/* Månadssammanfattning */}
          <div style={{ margin:"16px 0 0",background:C.card,borderRadius:16,padding:"18px 20px",boxShadow:"0 1px 4px rgba(0,0,0,0.06)" }}>
            <p style={{ margin:"0 0 14px",fontSize:13,fontWeight:700,color:C.label,textTransform:"uppercase",letterSpacing:"0.8px" }}>Sammanfattning</p>
            {[
              ["Arbetsdagar",`${arbetsdagar} dagar`],
              ["Mål",`${målH} tim`],
              ["Jobbat",`${jobbadH} tim`, jobbadH>=målH?C.green:C.orange],
              ["Körning",`${totalKm} km`],
              ...(övH>0?[["Övertid",`${övH} tim`,C.orange]]:[]),
            ].map(([l,v,c],i,arr)=>(
              <div key={l} style={{ display:"flex",justifyContent:"space-between",padding:"10px 0",borderBottom:i<arr.length-1?`1px solid ${C.line}`:"none" }}>
                <span style={{ fontSize:15,color:C.label }}>{l}</span>
                <span style={{ fontSize:15,fontWeight:600,color:c||C.ink }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
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
        <div style={{ marginTop:40,background:"rgba(255,149,0,0.07)",borderRadius:14,padding:"16px 20px",animation:"fadeUp 0.4s ease 0.35s both",border:"1px solid rgba(255,149,0,0.12)" }}>
          <p style={{ margin:0,fontSize:15,fontWeight:600,color:C.orange }}>Kör försiktigt hem · Skymning</p>
        </div>
      </div>
      <div style={bottom}></div>
    </div>
  );

  return null;
}
