"use client";
import React, { useState, useEffect, useRef, useMemo, CSSProperties, ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { uppdateraVerifierat, upsertVerifierat, raderaVerifierat, SPARA_FEL } from "@/lib/supabase-save";
import { extraMinPerDag, arbetadTidInklExtra } from "@/lib/arbetstid";
import { arDagAvslutad } from "@/lib/arbetsdagStall";
import { ersattningsMilDag } from "@/lib/kmErsattning";
import { ymdLokal } from "@/lib/datumLokal";
import { getRödaDagar } from "@/lib/roda-dagar";
import { formatObjektNamn } from "@/utils/formatObjektNamn";
import { vilaTrosklarFromAvtal } from "@/lib/gs-avtal";
import { isoVecka, type VilaTrosklar } from "@/lib/vilobrott";
import { FRANVARO_VAL, FRANVARO_UNDERRAD, FRANVARO_RUBRIK, FRANVARO_DAGTYPER_ALLA, arFranvaroDagtyp } from "@/lib/franvaro";
import { SKARP_START, franGolv, foreSkarpStart } from "@/lib/skarpStart";
import { AKTIVITETER, EXTRA_ARBETE_TYPER, aktLabel, aktIcon, type AktivitetTyp } from "@/lib/aktiviteter";
import PeriodForm, { type PeriodVarden } from "./PeriodForm";
import { hamtaAktuellaVilobrott, hamtaVilobrottForPeriod, analyseraOchSpara, type VilobrottRad } from "@/lib/vilobrott-storage";
import { harledGap, valideraSegment, klassificeraPeriod, periodMin } from "@/lib/dagsegment";
import { skaFragaBrandrisk, obMinuter, fmtOb, arTidigVardag } from "@/lib/ob";
import { loneartLabel, loneartEnhet, fmtMangd } from "@/lib/lonesystem/lonearter";
import PdfLasare from "@/app/planering/PdfLasare";
// Designvärden — EN källa (lib/design/tokens.ts). Dagsvyn är piloten: den
// importerar härifrån och skriver inga egna literaler. Övriga flikar (Min tid,
// Lön, Kalender, Redigera) använder ännu den lokala TYPE-skalan nedan och
// rättas när de rörs.
import { TYP, VIKT, IKON, FONT, AVSTAND, RADIE, FARG, KNAPP, KORT, RAD, INAKTIV, TRAFFYTA, RORELSE, designCss } from "@/lib/design/tokens";
import Tillstand from "@/components/design/Tillstand";
import { useRaknaUppVarde } from "@/lib/design/raknaUpp";

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
// Sidmarginal ur tokens (16) — förr 20 här och 16 i Dag/Kalender, så innehållet
// hoppade 4 px i sidled vid varje vybyte.
const shell: CSSProperties  = { minHeight:"100vh", background:"#000", ...T, display:"flex", flexDirection:"column" as const, padding:`0 ${AVSTAND.sidmarginal}px`, boxSizing:"border-box" as const, width:"100%" };
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

/* ── Extra-aktiviteter — listan bor i lib/aktiviteter (delad med PeriodForm) ── */
/** Visningstroskel for synk-avvikelsen: fraga foraren bara nar skillnaden i
 * arbetad tid >= detta (min). Admin ser alla oavsett. En plats. */
const SYNK_AVVIKELSE_TROSKEL_MIN = 30;
const segInput: CSSProperties = { width:"100%",boxSizing:"border-box",padding:"12px 14px",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:10,color:"#fff",fontSize:16,fontFamily:"inherit" };

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
        // Lön = egen flik (beslut 2026-09-10): månadens spec, PDF och godkännande
        // ska hittas blint. Förr en "flik" inuti Min tid som lyste fel i navet.
        {icon:"receipt_long",key:"lön",label:"Lön"},
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
  // Föraren väljer aktivt att bekräfta fast dagen fortfarande ser pågående ut
  // (stall-detektionen har inte slagit till). Ingen ska låsas ute.
  const [bekraftaÄndå, setBekraftaÄndå] = useState(false);
  const [ändring,setÄ]     = useState(null);
  const [betald,setBetald] = useState(0);
  const [trak,  setTrak]   = useState<{summa:number}|null>(null);
  const [trakÖppen, setTrakÖppen] = useState(false);
  const [dagTyp,setDagTyp] = useState("normal");
  const [hemadress, setHemadress] = useState("");
  const [redigHem, setRedigHem] = useState("");
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
  // Km-källa för den beräknade siffran: 'beraknad' = riktig vägberäkning
  // (route_cache/ORS), 'fallback' = haversine × 1,4 (fågelvägen, OSÄKER),
  // null = ej beräknat. 'saknarKoord' = något objekt saknar koordinat, då
  // går km inte att beräkna alls. Föraren ska se skillnaden.
  const [redKmKälla, setRedKmKälla] = useState<'beraknad'|'fallback'|null>(null);
  const [redKmSaknarKoord, setRedKmSaknarKoord] = useState(false);
  // Varifrån objektets koordinat kom (för ärlig källmärkning): maskin-GPS,
  // objektets egen koordinat eller larmkoordinat.
  const [redKmKoordKälla, setRedKmKoordKälla] = useState<'maskin'|'objekt'|'larm'|null>(null);
  const [redAnl,   setRedAnl]   = useState("");
  const [redVy,    setRedVy]    = useState("översikt");
  const [sparadKvittens, setSparadKvittens] = useState(false); // diskret "Sparat"-kvittens i redigera-vyn
  const [synkMin,  setSynkMin]  = useState<number|null>(null); // justerbar min i synk-avvikelsekortet
  const [redDagar, setRedDagar] = useState<Record<string, {start:string;slut:string;rast:number;km:number;anl:string}>>({});
  // Godkänd-status per period (YYYY-MM -> status) — hämtas från loneunderlag
  // så "Godkänd" överlever omladdning; inte en sessionsflagga.
  const [lönStatusPerPeriod, setLönStatusPerPeriod] = useState<Record<string,string>>({});
  const [lönBekräfta, setLönBekräfta] = useState(false);
  const [lönOffset, setLönOffset] = useState(0);
  const [lönVy, setLönVy] = useState<'översikt'|'detaljer'>('översikt');
  const [obRetroÖppen, setObRetroÖppen] = useState(false); // tysta retroaktiv-raden i månadsvyn
  const [sparatToast, setSparatToast] = useState(false);
  const [igårKopierat, setIgårKopierat] = useState(false);
  const [pamOpen, setPamOpen] = useState<null | 'obekraftad' | 'pagaende' | 'dagligTid'>(null);
  const [pushEnhetsNamn, setPushEnhetsNamn] = useState<string | null>(null);
  const [visaÖvrigt, setVisaÖvrigt] = useState(false);
  const [efterStoppSheet, setEfterStoppSheet] = useState<any | null>(null);
  // PERIODFORMULÄRET (components/arbetsrapport/PeriodForm) — ett formulär, tre
  // ingångar. 'ny' = lägg till period för ett datum (systemet avgör segment/
  // extra_tid mot passet); 'redigera' = befintlig extra_tid-post (tider,
  // aktivitet, objekt, faktureras, kommentar, ta bort).
  const [periodForm, setPeriodForm] = useState<null | { lage: 'ny' | 'redigera'; datum: string; rad?: any; varden: PeriodVarden; pass: { start_tid: string | null; slut_tid: string | null } | null }>(null);
  const [periodSparar, setPeriodSparar] = useState(false);
  const [periodFel, setPeriodFel] = useState<string | null>(null);
  const [heldagsMeddelande, setHeldagsMeddelande] = useState<{text:string;icon?:string;typ:string}|null>(null);
  const [bekräftelseVisa, setBekräftelseVisa] = useState(false);
  const [visaTiderSheet, setVisaTiderSheet] = useState(false);
  const [visaKmSheet, setVisaKmSheet] = useState(false);
  const [extraTidData, setExtraTidData] = useState<any[]>([]);
  const [årsData, setÅrsData] = useState<any[]>([]);
  const [lönSparar, setLönSparar] = useState(false);
  const [lönFel, setLönFel] = useState("");
  const [kalÅr, setKalÅr] = useState(new Date().getFullYear());
  const [kalMånad, setKalMånad] = useState(new Date().getMonth());
  const [dagData, setDagData] = useState<Record<string, any>>({});
  // Godkänd ledighet expanderad till datum (datum -> typ). Frånvaro visas i
  // kalendern så en ledig dag inte ser ut som en tom dag (ledighet_ansokningar
  // är helt frånkopplad från arbetsdag). "Arbete vinner" avgörs vid render.
  const [ledighetDagar, setLedighetDagar] = useState<Record<string, string>>({});

  // temp states för ändra tid/km
  const [tS,setTS]=useState("06:12"),[tE,setTE]=useState("16:45"),[tR,setTR]=useState(30);
  const [tMK,setTMK]=useState(72),[tKK,setTKK]=useState(75);
  const [anledn,setAnledn]=useState("");

  // manuell dag
  const [mStart,setMStart]=useState(()=>nuKlock5()),[mSlut,setMSlut]=useState(()=>nuKlock5()),[mRast,setMRast]=useState(0),[mBesk,setMBesk]=useState("");

  // historik redigering
  const [redDag,setRedDag]=useState(null);
  // Dagsegment — tid MÄRKT inom en inloggad dag (brandvakt, markägare), redan
  // betald, annoteras bara för fakturering. SKILD från extra_tid (som lönen adderar).
  const [dagSegment, setDagSegment] = useState<any[]>([]);
  const [segÖppen, setSegÖppen] = useState(false);
  const [segForm, setSegForm] = useState<null | { start: string; slut: string; typ: AktivitetTyp; deb: boolean; kommentar: string; fromSynk?: boolean; fromTidigarelagd?: boolean }>(null);
  const [segFel, setSegFel] = useState<string | null>(null);

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
  // Förarens tidsspecifikation för vald månad — SAMMA beräkning som Fortnox-
  // exporten (/api/lon/min-manad → lib/lonesystem/loneunderlag). Räknas vid varje
  // öppning; inget cachas. Ersätter den lokala månadsberäkningen som fanns här
  // förr (två sanningar om samma månad).
  const [minManad, setMinManad] = useState<{ arbetsmanad: string; laddar: boolean; fel: string | null; data: any | null }>({ arbetsmanad: "", laddar: false, fel: null, data: null });
  // PDF:en öppnas INNE i appen (PdfLasare) — aldrig ny flik/nedladdning som slänger
  // ut föraren ur den installerade appen. Han bläddrar först, delar/sparar sedan.
  const [specPdf, setSpecPdf] = useState<{ url: string; titel: string; filnamn: string } | null>(null);
  useEffect(() => {
    if (steg !== "lön" || !medarbetare?.id) return;
    const ref = new Date();
    const d = new Date(ref.getFullYear(), ref.getMonth() + lönOffset, 1);
    const arbetsmanad = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    let avbruten = false;
    setMinManad({ arbetsmanad, laddar: true, fel: null, data: null });
    fetch("/api/lon/min-manad", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ arbetsmanad }), cache: "no-store" })
      .then(async r => {
        const j = await r.json().catch(() => ({}));
        if (avbruten) return;
        if (!r.ok || !j.ok) setMinManad({ arbetsmanad, laddar: false, fel: j.error || `Kunde inte läsa specifikationen (HTTP ${r.status})`, data: null });
        else setMinManad({ arbetsmanad, laddar: false, fel: null, data: j.medarbetare });
      })
      .catch(e => { if (!avbruten) setMinManad({ arbetsmanad, laddar: false, fel: e?.message || String(e), data: null }); });
    return () => { avbruten = true; };
  }, [steg, lönOffset, medarbetare?.id]);
  const [dagensObjekt, setDagensObjekt] = useState<string | null>(null);
  const [valtObjektId, setValtObjektId] = useState<string | null>(null);
  const [visaObjektVäljare, setVisaObjektVäljare] = useState(false);
  const [redObjektId, setRedObjektId] = useState<string | null>(null);
  const [redMaskinId, setRedMaskinId] = useState<string | null>(null);
  const [visaRedObjektVäljare, setVisaRedObjektVäljare] = useState(false);
  const [visaRedMaskinVäljare, setVisaRedMaskinVäljare] = useState(false);
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
  // Vad orsaksflödet ska göra när sista orsaken är sparad: skriva under DEN
  // dag som startade flödet (Dag-vyn: idag via bekraftaDagen; Redigera: vald
  // dag) och gå tillbaka dit föraren kom ifrån. null = Dag-vyn (idag).
  const [bekraftaMål, setBekraftaMål] = useState<{ datum: string; skriv: () => Promise<boolean>; tillbaka: "morgon" | "redigera" } | null>(null);
  // Felrad i Redigera-vyn — ersätter window.alert (app-egna dialoger).
  const [redFel, setRedFel] = useState<string | null>(null);
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
  const [kmSummary, setKmSummary] = useState<{totalKm:number;ersattningsKm:number;ersattningsMil:number}|null>(null);
  const [maskinNamn, setMaskinNamn] = useState<string | null>(null);
  const [maskinNamnMap, setMaskinNamnMap] = useState<Record<string, string>>({});

  // Extra-aktiviteter — pågående + ny aktivitet
  const [pagaendeAktiviteter, setPagaendeAktiviteter] = useState<any[]>([]);
  const [stoppaSlutTid, setStoppaSlutTid] = useState(nuKlock());
  const [stoppaTarget, setStoppaTarget] = useState<any>(null);
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
        hamtaAktuellaVilobrott(med.data.id, 30)
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
    // Hämta maskinnamn-lookup. NAMNET föraren känner igen ("Wisent2015",
    // "Ponsse Scorpion") bor i maskiner.namn; dim_maskin.modell är
    // tillverkarens kod ("810E") och bara en reserv när namn saknas.
    // Ett maskinnamn i hela appen: dim_maskin.visningsnamn (admin) vinner, sedan
    // maskiner.namn (maskin-service), sedan modell/tillverkare, sist id.
    Promise.all([
      supabase.from("dim_maskin").select("maskin_id, visningsnamn, tillverkare, modell"),
      supabase.from("maskiner").select("maskin_id, namn"),
    ]).then(([dim, mask]) => {
      const m: Record<string, string> = {};
      for(const r of dim.data || []) m[r.maskin_id] = r.modell || r.tillverkare || r.maskin_id;
      for(const r of mask.data || []) if (r.namn) m[r.maskin_id] = r.namn;
      for(const r of dim.data || []) { const v = (r.visningsnamn || "").trim(); if (v) m[r.maskin_id] = v; }
      setMaskinNamnMap(m);
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

  // km-beräkning när kvällsvyn öppnas → /api/km/berakna-dag (DELADE helpern:
  // dagensPlatser + full koordinat-fallback + samma vakt som nattjobbet). Ersätter
  // den tidigare direkta /api/routing-vägen (enbart obj.lat/lng, ingen fallback-
  // kedja) — EN beräkningsmodell för alla ytor. Persisterar km direkt så det finns
  // vid bekräftelse, inte "dagen efter". Best-effort: fel visas aldrig som hårt fel.
  useEffect(() => {
    if (steg !== "kväll") return;
    if (!medarbetare?.id) return;
    const idagKey = new Date().toISOString().split('T')[0];
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/km/berakna-dag', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ medarbetare_id: medarbetare.id, datum: idagKey }),
        });
        const j = await r.json();
        if (cancelled) return;
        if (j?.status === 'skrev') {
          setKmBerakning((j.km_morgon || 0) + (j.km_kvall || 0));
          if (kmM == null) setKmM({ km: j.km_morgon });
          if (kmK == null) setKmK({ km: j.km_kvall });
        } else {
          // hoppad (km redan satt / forare / ingen koordinat) → ingen auto-gissning
          setKmBerakning(null);
        }
      } catch { if (!cancelled) setKmBerakning(null); }
    })();
    return () => { cancelled = true; };
  }, [steg, medarbetare?.id, valtObjektId, dagData]);

  // Hämta km-kedja för en specifik dag när kalenderns redigera-vy öppnas.
  // /api/km-chain bygger hem → obj1 → obj2 → ... → hem från arbetsdag-raderna
  // och returnerar varje segment. Idag finns alltid 1 objekt per dag (UNIQUE
  // constraint), men infrastrukturen stödjer flera.
  useEffect(() => {
    if (steg !== "redigera" || !redDag) return;
    if (!medarbetare?.id || !redDag.datum) return;
    setRedKmChain(null);
    setRedKmBerakning(null);
    setRedKmKälla(null);
    setRedKmSaknarKoord(false);
    setRedKmKoordKälla(null);
    let cancelled = false;
    // Persistera km vid ÖPPNING (DELADE helpern) så en oberäknad 0-km-dag fylls
    // direkt — inte "dagen efter när någon öppnar kalendern". Best-effort;
    // uppdaterar fälten om något skrevs (annars hoppad: redigerad/forare/km satt).
    const rDatum: string = (redDag as any).datum;
    fetch('/api/km/berakna-dag', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ medarbetare_id: medarbetare.id, datum: rDatum }),
    }).then(r => r.json()).then(j => {
      if (cancelled || j?.status !== 'skrev') return;
      const tot = (j.km_morgon || 0) + (j.km_kvall || 0);
      setRedKm(tot);
      setRedDag((d:any) => d ? { ...d, km_morgon: j.km_morgon, km_kvall: j.km_kvall, km_totalt: tot, km_kalla: 'auto' } : d);
      setDagData(dd => ({ ...dd, [rDatum]: { ...(dd[rDatum]||{}), km_morgon: j.km_morgon, km_kvall: j.km_kvall, km_totalt: tot, km_kalla: 'auto' } }));
    }).catch(() => {});
    fetch(`/api/km-chain?medarbetare_id=${encodeURIComponent(medarbetare.id)}&datum=${redDag.datum}`)
      .then(r => r.json())
      .then(j => {
        if (cancelled || !j?.ok) return;
        const segs = j.segments || [];
        setRedKmChain(segs);
        // Modell B: det ersättningsgrundande talet = morgon + kväll (hem→första
        // + sista→hem), aldrig kedjans fulla dagsrutt (som på en flyttdag även
        // räknar körningen mellan objekten). km_totalt får aldrig bli något
        // annat än km_morgon + km_kvall.
        setRedKmBerakning(j.kmErsattningsgrund ?? null);
        // km-chain avgör ärligt om dagen har ett objekt som KRÄVER koordinat men
        // saknar den (flytt/service med kraver_koordinat=false räknas inte som
        // saknad) — samma regel som koordinatlarmet.
        const platser: string[] = j.platser || [];
        const koord = j.objektKoord || {};
        setRedKmSaknarKoord(!!j.saknarKoord);
        // Varifrån koordinaten kom — visa den SVAGASTE källan som användes
        // (larm > objekt > maskin) så etiketten är ärlig när minst ett ben
        // föll tillbaka på larmkoordinaten.
        const källor = platser.map((oid: string) => koord[oid]?.kalla).filter(Boolean);
        setRedKmKoordKälla(
          källor.includes('larm') ? 'larm'
          : källor.includes('objekt') ? 'objekt'
          : källor.includes('maskin') ? 'maskin' : null
        );
        // Källa: 'fallback' om NÅGOT segment är fågelvägen (haversine), annars
        // 'beraknad' (route_cache/ORS = riktig vägberäkning). Tom kedja = null.
        setRedKmKälla(segs.length === 0 ? null
          : segs.some((s: any) => s.source === 'fallback') ? 'fallback' : 'beraknad');
        // INTE setRedKm här. Det beräknade talet är ett FÖRSLAG (redKmBerakning)
        // som Körning-kortet visar med en "Använd"-knapp; skrevs det in i redKm
        // slog harÄndrat till och en bekräftad dag såg ändrad ut av att öppnas.
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
    hamtaAktuellaVilobrott(medarbetare.id, 30)
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
        setKmSummary({ totalKm: j.totalKm, ersattningsKm: j.ersattningsKm, ersattningsMil: j.ersattningsMil ?? 0 });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [steg, medarbetare?.id, kalÅr, kalMånad]);

  // Godkänd ledighet för månaden → expandera start–slut till datum-map.
  // status='godkänd' (med ä) — bara beviljad frånvaro visas, aldrig väntande.
  useEffect(() => {
    if (steg !== "kalender" || !medarbetare?.id) return;
    const förstadag = ymdLokal(new Date(kalÅr, kalMånad, 1));
    const sistadag = ymdLokal(new Date(kalÅr, kalMånad + 1, 0));
    let cancelled = false;
    supabase.from('ledighet_ansokningar')
      .select('typ, startdatum, slutdatum')
      .eq('medarbetare_id', medarbetare.id)
      .eq('status', 'godkänd')
      .lte('startdatum', sistadag).gte('slutdatum', förstadag)
      .then(({ data }) => {
        if (cancelled) return;
        const karta: Record<string, string> = {};
        for (const l of (data || [])) {
          const start = new Date(l.startdatum + 'T00:00:00');
          const slut = new Date(l.slutdatum + 'T00:00:00');
          for (let dt = new Date(start); dt <= slut; dt.setDate(dt.getDate() + 1)) {
            const iso = ymdLokal(dt);
            if (iso >= förstadag && iso <= sistadag) karta[iso] = (l.typ || 'ledig');
          }
        }
        setLedighetDagar(karta);
      });
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
    let initialDone = false;

    // Slut-rutan är VILLKORSBASERAD, inte förändringsbaserad: timvisa
    // MOM-filer sätter slut_tid redan på morgonen och skjuter den framåt
    // varje timme — "slut_tid blev satt" betyder inte längre "dagen är slut".
    // Och efter dagens SISTA fil kommer inget nytt event, så en förändrings-
    // lyssnare kan aldrig fånga avslutet. Villkoret (stall-detektionen i
    // arDagAvslutad) utvärderas varje poll; localStorage-vakten ger en
    // visning per dag.
    const kollaSlutRuta = async (row: any) => {
      if (localStorage.getItem(slutKey)) return false;
      if (!row.slut_tid || !arDagAvslutad(today, row.slut_tid)) return false;
      const maskin = maskinNamnMap[row.maskin_id] || row.maskin_id || '';
      const objNamn = objektLista.find((o: any) => o.id === row.objekt_id)?.namn || row.objekt_id || '';
      const startTid = row.start_tid ? row.start_tid.slice(0, 5) : '';
      const slutTid = row.slut_tid.slice(0, 5);
      // Dagstotal = maskintid + dagens extra tid. Hämtas färskt här (inte
      // ur extraTidData-state) — effekten har stale closure på state.
      const { data: dagensExtra } = await supabase.from('extra_tid')
        .select('minuter').eq('medarbetare_id', medarbetare.id).eq('datum', today);
      const extraMinIdag = (dagensExtra || []).reduce((a: number, e: any) => a + (e.minuter || 0), 0);
      const totMin = (row.arbetad_min || 0) + extraMinIdag;
      const tid = `${Math.floor(totMin / 60)}h ${totMin % 60}min`;
      setArbetsdagToast({ typ: 'slut', maskin, objekt: objNamn, start: startTid, slut: slutTid, tid });
      localStorage.setItem(slutKey, '1');
      setTimeout(() => setArbetsdagToast(null), 10000);
      // Ingen klient-push längre: dagsslut-notisen ägs av servern
      // (mom-import köar i notis_kö, flush-cronen skickar). In-app-rutan
      // ovan behålls; den är poängen när man är inne.
      return true;
    };

    const poll = async () => {
      const { data } = await supabase.from('arbetsdag')
        .select('id, maskin_id, objekt_id, start_tid, slut_tid, arbetad_min')
        .eq('medarbetare_id', medarbetare.id)
        .eq('datum', today);
      if (!data) return;

      if (!initialDone) {
        knownIds = new Set(data.map((r: any) => r.id));
        initialDone = true;
        // Öppnas appen efter att dagen redan stallat ska rutan visas direkt,
        // inte först vid nästa poll.
        for (const row of data) { if (await kollaSlutRuta(row)) break; }
        return;
      }

      for (const row of data) {
        const maskin = maskinNamnMap[row.maskin_id] || row.maskin_id || '';
        const objNamn = objektLista.find((o: any) => o.id === row.objekt_id)?.namn || row.objekt_id || '';
        const startTid = row.start_tid ? row.start_tid.slice(0, 5) : '';

        // Ny rad → start-notis + auto-stoppa pågående extra-aktiviteter
        if (!knownIds.has(row.id) && !localStorage.getItem(startKey)) {
          knownIds.add(row.id);
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
                const min = Math.max(0, minutDiff(o.start_tid, startSec));
                // Bakgrundspoll — ingen alert; re-fetchen nedan visar sanningen om stängningen inte gick igenom.
                // Ingen tyst radering av korta poster (regel 2026-09-09): en post föraren
                // inte vill ha tar hen bort själv, synligt, i periodformuläret.
                // minuter är INTE genererad — räknas om här.
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

        // Dagen ser avslutad ut (stall) → slut-ruta, en gång per dag
        if (await kollaSlutRuta(row)) return;

        knownIds.add(row.id);
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
    // visar kalender-data (redigera). Slipp att köra varje gång
    // morgon/mintid/inst-state ändras.
    if (steg !== 'kalender' && steg !== 'redigera' && steg !== 'morgon') return;
    // LOKALT datum, inte toISOString — annars flyttas midnatt bakåt ett dygn i
    // UTC+2 och sista dagen i månaden faller ur frågan (kalenderprick + hela
    // månadsaggregatet tappade sin sista dag). Se lib/datumLokal.
    const förstadag = ymdLokal(new Date(kalÅr, kalMånad, 1));
    const sistadag = ymdLokal(new Date(kalÅr, kalMånad + 1, 0));
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
  // Långt datum för hälsningsraden: "måndag 7 september"
  const datumLångt=`${["söndag","måndag","tisdag","onsdag","torsdag","fredag","lördag"][idag.getDay()]} ${idag.getDate()} ${["januari","februari","mars","april","maj","juni","juli","augusti","september","oktober","november","december"][idag.getMonth()]}`;

  const frikm = gsAvtal?.km_grans_per_dag ?? 60;
  // Ingen kr-beräkning i appen: mil är mängden, satsen äger Fortnox. (fardtidPerMil/ersKr
  // räknades här men visades aldrig — död kod som bröt principen. Borttagen.)
  const arbMin = Math.max(0,tim(start,slut)-rast);
  const totKm  = (kmM?.km||0)+(kmK?.km||0);
  // Maskinpassets tal räknar upp när MOM-filen flyttar slut_tid under dagen —
  // hoppar inte (RORELSE.tal). Hookarna ligger här, före alla steg-returer.
  const arbMinVisad = useRaknaUppVarde(arbMin);
  const totKmVisad  = useRaknaUppVarde(totKm);
  const ersKm  = Math.max(0,totKm-frikm);                          // km över gränsen
  const milPåbörjade = ersattningsMilDag(totKm, frikm);            // påbörjade mil (delad lib)
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

  // Öppna redigera-vyn för en dag — EN väg för ALLA dagar (med eller utan
  // extra tid). Tidigare fanns den här setupen duplicerad i dagcellen och i
  // "glömde bekräfta"-bannern, och extra-tid-dagar routades i stället till
  // en avskalad tidslinje utan redigering/bekräfta — inkonsekvensen som var
  // buggen. Nu ser varje dag likadan ut.
  // ── Dagsegment: ladda, öppna formulär, spara, ta bort ──
  const laddaDagSegment = async (datum: string) => {
    if (!medarbetare?.id) { setDagSegment([]); return; }
    const { data } = await supabase.from('arbetsdag_segment')
      .select('*').eq('medarbetare_id', medarbetare.id).eq('datum', datum)
      .order('start_tid', { ascending: true });
    setDagSegment(data || []);
  };
  // Synk-kortets och tidigarelagd-kortets ingång till periodformuläret (samma
  // formulär som allt annat — se oppnaPeriodNy nedan; gap:et fylls i som förslag).
  const öppnaSegForm = (opts?: { gap?: { start: string; slut: string }; typ?: AktivitetTyp; fromSynk?: boolean; fromTidigarelagd?: boolean }) => {
    const rd: any = redDag;
    if (!rd?.datum) return;
    setSegÖppen(true);
    oppnaPeriodNy(rd.datum, { ...opts, typ: opts?.typ || 'markagare' });
  };
  const taBortSegment = async (id: string) => {
    const { error } = await supabase.from('arbetsdag_segment').delete().eq('id', id);
    if (error) { alert('Kunde inte ta bort perioden.'); return; }
    setDagSegment(d => d.filter((x:any) => x.id !== id));
  };

  const öppnaRedigera = (datum: string) => {
    const d2 = dagData[datum];
    setRedDag({ ...(d2 || {}), datum });
    setRedStart(d2?.start_tid || "00:00");
    setRedSlut(d2?.slut_tid || "00:00");
    setRedRast(d2?.rast_min || 0);
    setRedKm(d2?.km_totalt || 0);
    setRedKmBerakning(null);
    setRedAnl("");
    setRedObjektId(d2?.objekt_id || null);
    setRedMaskinId(d2?.maskin_id || null);
    setSparadKvittens(false);
    setSegÖppen(false); setSegForm(null); setSegFel(null);
    laddaDagSegment(datum);
    setRedVy("översikt");
    setSteg("redigera");
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
      // Skriv ALDRIG lokal tom-värde över synkad/beräknad data. maskin_id
      // och km kom från synken (rätt maskin ur skiftet, beräknat vägavstånd)
      // och fanns inte i lokal state — bekräftelsen NULL:ade/nollade dem
      // tidigare. maskin_id: behåll dagens faktiska maskin, fall tillbaka på
      // förarens default bara om dagen saknar maskin (annars felattribution
      // för multi-maskin-förare). km: skriv inte 0 över ett befintligt värde.
      km_morgon: kmM?.km ?? idagArb?.km_morgon ?? 0,
      km_kvall: kmK?.km ?? idagArb?.km_kvall ?? 0,
      maskin_id: idagArb?.maskin_id || medarbetare.maskin_id || null,
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

  // EN Bekräfta-väg för Dag OCH Redigera. Förr hade bara Dag-vyn för-checken —
  // Redigeras Bekräfta skrev under en dag utan att fråga om vilobrott, så
  // samma dag kunde bekräftas med eller utan orsak beroende på var man stod.
  //
  //   1. Analysera [datum-7, datum] (klippt mot skarp start; bara om fönstret
  //      ligger inom årsData — annars skulle en tom dagslista RADERA obesvarade
  //      brott i fönstret, se analyseraOchSpara).
  //   2. Obesvarade brott i fönstret → orsaksflödet; `skriv` körs när sista
  //      orsaken sparats (sparaOrsakOchFortsätt), och vyn går till `tillbaka`.
  //   3. Inga brott → `skriv` direkt.
  // För-check-fel blockerar aldrig: då skrivs dagen ändå (som förr i Dag-vyn).
  const bekraftaMedForcheck = async (
    datum: string,
    skriv: () => Promise<boolean>,
    tillbaka: "morgon" | "redigera",
  ): Promise<void> => {
    if (medarbetare?.id && trosklar) {
      const fromDt = new Date(datum + "T00:00:00"); fromDt.setDate(fromDt.getDate() - 7);
      const fromIso = franGolv(ymdLokal(fromDt));
      const toIso = datum;
      const årStart = `${new Date().getFullYear()}-01-01`;
      try {
        if (fromIso >= årStart && toIso >= fromIso) {
          const dagar = årsData.filter(r => r.datum >= fromIso && r.datum <= toIso);
          await analyseraOchSpara(medarbetare.id, dagar, trosklar, fromIso, toIso);
        }
        // Läs fönstret direkt — hamtaAktuellaVilobrott (14 d) räcker inte för
        // en äldre dag i Redigera. Dag-vyns gula rader uppdateras separat.
        const [iFonster, nyaAktuella] = await Promise.all([
          hamtaVilobrottForPeriod(medarbetare.id, fromIso, toIso),
          hamtaAktuellaVilobrott(medarbetare.id),
        ]);
        setAktuellaVilobrott(nyaAktuella);
        const obesvarade = iFonster.filter(b => !b.besvarat_av_forare);
        if (obesvarade.length > 0) {
          // Frys kön — bygg INTE om från re-fetchad aktuellaVilobrott under flödet
          setVilobrottKö(obesvarade);
          setVilobrottIdx(0);
          setVilobrottOrsakVal(null);
          setVilobrottOrsakFritext("");
          setBekraftaMål({ datum, skriv, tillbaka });
          setSteg("vilobrottOrsak");
          return;
        }
      } catch (err) {
        console.error("Vilo-för-check misslyckades:", err);
      }
    }
    await skriv();
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
      // Sista brottet — skriv under den dag som startade flödet (bekraftaMål;
      // Dag-vyn = idag via bekraftaDagen). Om guarden blockerar (tomma tider)
      // går vi tillbaka till vyn där felmeddelandet syns under Bekräfta-
      // knappen. Orsak-svaret är redan persistat i DB så det går inte
      // förlorat — föraren fixar tiderna och bekräftar igen.
      const mål = bekraftaMål;
      if (mål) await mål.skriv(); else await bekraftaDagen();
      setBekraftaMål(null);
      setVilobrottKö([]);
      setVilobrottIdx(0);
      setVilobrottOrsakVal(null);
      setVilobrottOrsakFritext("");
      setSteg(mål?.tillbaka ?? "morgon");
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

  // INGEN TIMER, INGEN BANNER (beslut 2026-09-09): extra tid är två klockslag.
  // Trycket noterar starten, "Avsluta" noterar slutet — sedan öppnas period-
  // formuläret med båda tiderna redigerbara. En öppen post (slut_tid null) från
  // idag visas i kort 2 på Dag; från en tidigare dag i Redigera för den dagen
  // ("Sluttid saknas") och som väntar-rad — den kan aldrig mer bli föräldralös.
  const aktivTimer = pagaendeAktiviteter[0];
  const timerBanner: ReactNode = null;

  const periodVardenFran = (rad: any): PeriodVarden => ({
    start: (rad?.start_tid || '').slice(0, 5),
    slut: (rad?.slut_tid || '').slice(0, 5),
    typ: (rad?.aktivitet_typ as AktivitetTyp) || 'annat',
    deb: !!rad?.debiterbar,
    kommentar: rad?.kommentar || '',
    objektId: rad?.objekt_id || null,
  });
  const passFor = (datum: string) => {
    const d: any = dagData[datum];
    return d ? { start_tid: d.start_tid || null, slut_tid: d.slut_tid || null } : null;
  };
  /** Öppna en befintlig extra_tid-post för redigering (tider, aktivitet, objekt, faktureras, ta bort). */
  const oppnaPeriodRedigera = (rad: any) => {
    setPeriodFel(null);
    setPeriodForm({ lage: 'redigera', datum: rad.datum, rad, varden: periodVardenFran(rad), pass: passFor(rad.datum) });
  };
  /** Öppna ett tomt formulär för ett datum (lägg till i efterhand / Redigera "Lägg till period"). */
  const oppnaPeriodNy = (datum: string, opts?: { gap?: { start: string; slut: string }; typ?: AktivitetTyp; fromSynk?: boolean; fromTidigarelagd?: boolean }) => {
    const typ = opts?.typ || 'annat';
    setPeriodFel(null);
    setSegForm(opts?.fromSynk || opts?.fromTidigarelagd ? { start: '', slut: '', typ, deb: false, kommentar: '', fromSynk: opts?.fromSynk, fromTidigarelagd: opts?.fromTidigarelagd } : null);
    setPeriodForm({
      lage: 'ny', datum, pass: passFor(datum),
      varden: { start: opts?.gap?.start || '', slut: opts?.gap?.slut || '', typ, deb: AKTIVITETER.find(a => a.typ === typ)?.debDefault ?? false, kommentar: '', objektId: null },
    });
  };
  /** "Avsluta" på Dag: sluttiden noteras (ingen tyst radering av korta poster), sedan formuläret. */
  const avslutaExtra = async (rad: any) => {
    const nuT = nuKlock() + ":00";
    const min = Math.max(0, minutDiff(rad.start_tid, nuT));
    // minuter är INTE genererad — räknas om vid varje tidsändring.
    const res = await uppdateraVerifierat(supabase, "extra_tid", { slut_tid: nuT, minuter: min }, { id: rad.id }, "*");
    if (!res.ok) { setBekraftaFel(res.fel); return; }
    setBekraftaFel(null);
    const uppdaterad = res.rows[0];
    setPagaendeAktiviteter(arr => arr.filter(x => x.id !== rad.id));
    setExtraTidData(arr => arr.map(x => x.id === rad.id ? uppdaterad : x));
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(60);
    oppnaPeriodRedigera(uppdaterad);
  };
  const stangPeriodForm = () => { setPeriodForm(null); setPeriodFel(null); setSegForm(null); };
  const speglaExtra = (rad: any) => {
    const byt = (x: any) => x.id === rad.id ? rad : x;
    setExtraTidData(d => d.some(x => x.id === rad.id) ? d.map(byt) : [rad, ...d]);
    setExtraDagData(m => {
      const datum = rad.datum;
      if (!datum) return m;
      const lista = m[datum] || [];
      return { ...m, [datum]: lista.some((x: any) => x.id === rad.id) ? lista.map(byt) : [rad, ...lista] };
    });
    if (!rad.slut_tid) setPagaendeAktiviteter(arr => arr.some(x => x.id === rad.id) ? arr : [...arr, rad]);
    else setPagaendeAktiviteter(arr => arr.filter(x => x.id !== rad.id));
  };
  const sparaPeriod = async () => {
    if (!periodForm || !medarbetare?.id) return;
    const v = periodForm.varden;
    const min = periodMin(v.start, v.slut);
    if (!v.start || !v.slut || min <= 0) { setPeriodFel('Sluttiden måste vara efter starttiden.'); return; }
    setPeriodSparar(true);
    try {
      if (periodForm.lage === 'redigera') {
        // Befintlig extra_tid-post: förblir extra_tid. minuter räknas om — INTE genererad.
        const payload = {
          start_tid: v.start + ':00', slut_tid: v.slut + ':00', minuter: min,
          aktivitet_typ: v.typ, objekt_id: v.objektId, debiterbar: v.deb, kommentar: v.kommentar.trim() || null,
        };
        const res = await uppdateraVerifierat(supabase, "extra_tid", payload, { id: periodForm.rad.id }, "*");
        if (!res.ok) { setPeriodFel(res.fel); return; }
        speglaExtra(res.rows[0] || { ...periodForm.rad, ...payload });
        stangPeriodForm();
        return;
      }
      // NY period: systemet avgör mot passet — inne = segment (redan betald,
      // märks bara), utanför = extra_tid (läggs till). Samma regel som förr.
      const rd: any = dagData[periodForm.datum] || null;
      const pass = periodForm.pass || { start_tid: null, slut_tid: null };
      const dagExtra = (extraTidData || []).filter((e: any) => e.datum === periodForm.datum && e.slut_tid);
      const befintliga = [
        ...(periodForm.datum === (redDag as any)?.datum ? dagSegment : []).map((x: any) => ({ start_tid: x.start_tid, slut_tid: x.slut_tid })),
        ...dagExtra.map((e: any) => ({ start_tid: e.start_tid, slut_tid: e.slut_tid })),
      ];
      const lage = klassificeraPeriod({ start: v.start, slut: v.slut }, pass);
      if (lage === 'korsar') { setPeriodFel(`Perioden korsar maskinpassets gräns (${(pass.start_tid || '').slice(0, 5)}–${(pass.slut_tid || '').slice(0, 5)}). Dela upp den.`); return; }
      if (lage === 'inne') {
        const val = valideraSegment({ start: v.start, slut: v.slut }, pass, befintliga);
        if (!val.ok) { setPeriodFel(val.fel); return; }
        const { data, error } = await supabase.from('arbetsdag_segment').insert({
          medarbetare_id: medarbetare.id, datum: periodForm.datum,
          start_tid: v.start, slut_tid: v.slut,
          aktivitet_typ: v.typ, debiterbar: v.deb,
          kommentar: v.kommentar.trim() || null,
          kalla: (segForm?.fromSynk || segForm?.fromTidigarelagd) ? 'synk' : 'forare',
        }).select().single();
        if (error || !data) { setPeriodFel((error as any)?.code === '23P01' ? 'Perioden överlappar en du redan märkt.' : SPARA_FEL); return; }
        const nyaSegment = [...dagSegment, data].sort((x: any, y: any) => (x.start_tid || '').localeCompare(y.start_tid || ''));
        setDagSegment(nyaSegment);
        // Tidigarelagd-start: segmentet ÄR kvittensen. Rör aldrig start_tid.
        if (segForm?.fromTidigarelagd && rd?.tidigarelagd_start && !rd.tidigarelagd_start.kvitterad) {
          const nyTL = { ...rd.tidigarelagd_start, kvitterad: new Date().toISOString(), val: 'markt_segment', aktivitet: v.typ, segment_id: data.id };
          const res = await uppdateraVerifierat(supabase, 'arbetsdag', { tidigarelagd_start: nyTL }, { id: rd.id });
          if (res.ok) setRedDag((d: any) => ({ ...d, tidigarelagd_start: nyTL }));
        }
        // Synk-omriktning: kvittera avvikelsen när inget odäckt gap återstår.
        if (segForm?.fromSynk && rd?.synk_avvikelse && !rd.synk_avvikelse.kvitterad) {
          const kvarGap = harledGap(rd.synk_avvikelse).filter(g =>
            !nyaSegment.some((x: any) => x.start_tid.slice(0, 5) < g.slut && g.start < x.slut_tid.slice(0, 5)));
          if (kvarGap.length === 0) {
            const nyAvv = { ...rd.synk_avvikelse, kvitterad: new Date().toISOString(), val: 'markt_segment', aktivitet: v.typ, segment_id: data.id };
            const res = await uppdateraVerifierat(supabase, 'arbetsdag', { synk_avvikelse: nyAvv }, { id: rd.id });
            if (res.ok) setRedDag((d: any) => ({ ...d, synk_avvikelse: nyAvv }));
          }
        }
      } else {
        const val = valideraSegment({ start: v.start, slut: v.slut }, { start_tid: null, slut_tid: null }, befintliga);
        if (!val.ok) { setPeriodFel(val.fel); return; }
        const kalla = lage === 'utanfor_fore' ? 'morgon' : lage === 'utanfor_efter' ? 'kvall' : 'under_dagen';
        const { data, error } = await supabase.from('extra_tid').insert({
          medarbetare_id: medarbetare.id, datum: periodForm.datum,
          start_tid: v.start + ':00', slut_tid: v.slut + ':00',
          minuter: min, // INTE genererad
          aktivitet_typ: v.typ, objekt_id: v.objektId, debiterbar: v.deb,
          kommentar: v.kommentar.trim() || null, kalla,
        }).select().single();
        if (error || !data) { setPeriodFel(SPARA_FEL); return; }
        speglaExtra(data);
      }
      if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(60);
      stangPeriodForm();
    } finally {
      setPeriodSparar(false);
    }
  };
  // Ta bort — VERIFIERAT (0 träffade rader = ärligt fel, aldrig tyst "borttaget").
  const taBortPeriod = async () => {
    if (!periodForm?.rad) return;
    const id = periodForm.rad.id;
    const res = await raderaVerifierat(supabase, "extra_tid", { id });
    if (!res.ok) { setPeriodFel(res.fel); return; }
    setExtraTidData(d => d.filter(x => x.id !== id));
    setExtraDagData(m => {
      const datum = periodForm.rad.datum;
      if (!datum || !m[datum]) return m;
      return { ...m, [datum]: m[datum].filter((x: any) => x.id !== id) };
    });
    setPagaendeAktiviteter(arr => arr.filter(x => x.id !== id));
    stangPeriodForm();
  };
  const periodDatumText = (datum: string) => {
    const d = new Date(datum + 'T00:00:00');
    return `${["söndag","måndag","tisdag","onsdag","torsdag","fredag","lördag"][d.getDay()]} ${d.getDate()} ${["januari","februari","mars","april","maj","juni","juli","augusti","september","oktober","november","december"][d.getMonth()]}`;
  };

  // DELAD UI (renderas i både Dag-vyn och Redigera): periodformuläret.
  const efterStoppUI = periodForm ? (
    <PeriodForm
      rubrik={periodForm.lage === 'ny' ? 'Lägg till period' : 'Extra arbete'}
      datumText={periodDatumText(periodForm.datum)}
      varden={periodForm.varden}
      onAndra={v => setPeriodForm(f => f ? { ...f, varden: v } : f)}
      pass={periodForm.pass}
      klassificera={periodForm.lage === 'ny'}
      fel={periodFel}
      sparar={periodSparar}
      onSpara={sparaPeriod}
      onTaBort={periodForm.lage === 'redigera' ? taBortPeriod : undefined}
      onAvbryt={stangPeriodForm}
      objektNamn={periodForm.varden.objektId ? (objektLista.find(o => o.id === periodForm.varden.objektId)?.namn || periodForm.varden.objektId) : null}
      renderObjektValjare={(valtId, onValj) => (
        <ObjektValjarLista objekt={objektLista} valtId={valtId} onVälj={o => onValj(o ? o.id : null)} tillåtInget />
      )}
    />
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
      // Backar dit flödet startade (Dag eller Redigera). Redan-besvarade brott
      // är sparade i DB — föraren förlorar ingenting. Dagen förblir obekräftad.
      const tillbaka = bekraftaMål?.tillbaka ?? "morgon";
      setBekraftaMål(null);
      setVilobrottKö([]);
      setVilobrottIdx(0);
      setVilobrottOrsakVal(null);
      setVilobrottOrsakFritext("");
      setSteg(tillbaka);
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

  /* ─── TIDSLINJE PENSIONERAD ─── En dag ska se likadan ut oavsett extra tid.
     Extra-tid-dagar routas nu (via öppnaRedigera) till samma redigera-vy som
     alla andra dagar, där maskinpasset redigeras och extra-posterna listas
     under "Loggad tid". Den gamla read-only-tidslinjen kunde varken redigera
     tider eller bekräfta dagen — det var buggen. Blocket är borttaget. */

  /* ─── HEM (morgon/dag/meny unified) ─── */
  /* PILOTEN för designtokens (lib/design/tokens.ts). Formen är bestämd av
     Martin efter jämförelse av alla varianter: den KORTBASERADE var bäst,
     problemet var antalet kort. Morgonen är därför TRE kort —
       1. tillstånd + maskin + plats + "Starta arbetspass"
       2. Extra arbete
       3. Frånvaro
     — med hälsning och datum överst, och ett "vad som väntar"-kort ovanför
     hälsningen BARA när det finns något att säga. Rent = skärmen börjar med
     hälsningen. Kort 1 och dagssammanfattningen ritas inuti EN <Tillstand>
     så bytet väntar → pågår → avslutad → bekräftad tonar över på samma plats.
     Inga literaler här — allt ur tokens. */
  if(steg==="morgon"||steg==="dag"||steg==="meny") {
    const DAG_HUVUD = 64;   // fast rubrikrad överst (layoutmått, inte typ/avstånd)
    const idagArb: any = dagData[idagKey];
    const extraFärdiga = (extraTidData || []).filter((e: any) => e.datum === idagKey && e.slut_tid);
    const harMaskinPass = !!idagArb?.slut_tid;
    const redanBekräftad = !!idagArb?.bekraftad;
    const varBekräftad   = !!idagArb?.bekraftad_tid;
    const ändradSedan    = varBekräftad && !redanBekräftad;
    // PÅGÅR-LÄGE: timvisa MOM-filer sätter slut_tid redan på morgonen och
    // skjuter den framåt varje timme — "slut_tid finns" betyder inte längre
    // "dagen är slut". Tills stall-detektionen slagit till visas dagen som
    // löpande utan bekräfta-knapp; länken låter föraren bekräfta ändå.
    const dagPågår = harMaskinPass && !redanBekräftad && !bekraftaÄndå
      && !arDagAvslutad(idagKey, idagArb?.slut_tid);
    const visaTillstand = !redanBekräftad && !harMaskinPass;
    const visaSammanfattning = harMaskinPass || extraFärdiga.length > 0;
    const tillstandNyckel = [
      visaTillstand ? (isWorking ? 'pagar' : 'vantar') : '-',
      visaSammanfattning ? (redanBekräftad ? 'bekraftad' : dagPågår ? 'pagar-kort' : 'avslutad') : '-',
    ].join('|');

    /* En rad i ett kort: etikett vänster, värde höger, pil om tryckbar. */
    const kortRad = (label: string, value: ReactNode, onClick?: () => void, sista?: boolean) => (
      <div key={label} onClick={onClick}
        style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:AVSTAND.s, minHeight:TRAFFYTA.min, padding:`${AVSTAND.s}px 0`, borderBottom: sista ? "none" : `1px solid ${FARG.linje}`, cursor:onClick?"pointer":"default" }}>
        <span style={{ ...TYP.meta, color:FARG.text2, flexShrink:0 }}>{label}</span>
        <div style={{ display:"flex", alignItems:"center", gap:AVSTAND.xs, minWidth:0 }}>
          <span style={{ ...TYP.listtitel, ...TNUM, color:FARG.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{value}</span>
          {onClick && <span className="material-symbols-outlined" style={{ fontSize:IKON.text, color:FARG.text3, flexShrink:0 }}>chevron_right</span>}
        </div>
      </div>
    );

    /* Varningskort — ikon i statusfärg + ord. Färgen bär aldrig ensam. */
    const varningsKort = (nyckel: string, ikon: string, farg: string, text: string, under?: string, onClick?: () => void) => (
      <div key={nyckel} onClick={onClick} className="tona-in"
        style={{ ...KORT, display:"flex", alignItems:"center", gap:AVSTAND.s, marginBottom:AVSTAND.m, cursor:onClick?"pointer":"default" }}>
        <span className="material-symbols-outlined" style={{ fontSize:IKON.rad, color:farg, flexShrink:0 }}>{ikon}</span>
        <div style={{ flex:1, minWidth:0 }}>
          <p style={{ margin:0, ...TYP.listtitel, color:FARG.text }}>{text}</p>
          {under && <p style={{ margin:`${AVSTAND.xs}px 0 0`, ...TYP.meta, color:FARG.text2, ...TNUM }}>{under}</p>}
        </div>
        {onClick && <span className="material-symbols-outlined" style={{ fontSize:IKON.text, color:FARG.text3, flexShrink:0 }}>chevron_right</span>}
      </div>
    );

    /* KORT 1 — tillstånd, maskin, plats, start. Väntar: klocka + "Väntar på
       maskin". Passet går (innan första timfilen satt slut_tid): grön puls +
       det faktiska klockslaget systemet registrerat. */
    const tillstandKort = (() => {
      const typ = idagArb?.dagtyp;
      const startKort = idagArb?.start_tid?.slice(0,5) || '—';
      const rubrik = !isWorking
        ? 'Väntar på maskin'
        : (typ && FRANVARO_RUBRIK[typ])
          ? FRANVARO_RUBRIK[typ]
          : `Arbetsdagen startade ${startKort}`;
      const under = !isWorking
        ? 'Startar automatiskt vid inloggning'
        : (typ && typ !== 'normal' && typ !== 'Produktion')
          ? `Startad ${(idagArb?.start_tid||'').slice(0,5)}`
          : 'Avslutas automatiskt vid utloggning från maskinen';
      // Maskinens NAMN ur maskiner-tabellen ("Wisent2015"), aldrig koden
      // ("810E") — maskinNamnMap föredrar maskiner.namn. Förarens maskin
      // först; saknas den (admin, vikarie) maskinen på senaste arbetsdagen.
      const maskinIdVisa = idagArb?.maskin_id || medarbetare?.maskin_id || historik.find(d => d.maskin_id)?.maskin_id || null;
      const maskinText = (idagArb?.maskin_id ? maskinNamnMap[idagArb.maskin_id] : null) || maskinNamn || (maskinIdVisa ? (maskinNamnMap[maskinIdVisa] || maskinIdVisa) : null);
      const vObj = valtObjektId ? objektLista.find(o=>o.id===valtObjektId) : null;
      // Objektet FYLLS AV IMPORTEN när första MOM-filen landat; innan dess kan
      // föraren välja själv (valtObjektId följer med i dagens rad).
      const objText = (isWorking && idagArb?.objekt_id)
        ? (objektLista.find(o => o.id === idagArb?.objekt_id)?.namn || idagArb?.objekt_id)
        : (idagArb?.objekt_namn || vObj?.namn || null);
      return (
        <section>
          <div style={KORT}>
            <div style={{ display:"flex", alignItems:"center", gap:AVSTAND.s }}>
              {isWorking
                ? <span className="puls" style={{ width:AVSTAND.s, height:AVSTAND.s, borderRadius:RADIE.cirkel, background:FARG.gron, flexShrink:0 }} />
                : <span className="material-symbols-outlined" style={{ fontSize:IKON.rad, color:FARG.text2, flexShrink:0 }}>schedule</span>}
              <h2 style={{ margin:0, ...TYP.rubrik, ...TNUM, color:FARG.text }}>{rubrik}</h2>
            </div>
            <p style={{ margin:`${AVSTAND.xs}px 0 ${AVSTAND.s}px`, ...TYP.meta, ...TNUM, color:FARG.text2 }}>{under}</p>
            {kortRad("Maskin", maskinText || "Ingen inloggad")}
            {objText
              ? kortRad("Plats", objText, isWorking ? undefined : ()=>setVisaObjektVäljare(true), true)
              : kortRad("Plats", "Välj objekt", ()=>setVisaObjektVäljare(true), true)}
            {/* Vägen in för den som kör en maskin utan filer — fylld sekundär,
                inte kontur, inte textlänk. Passet går → "Avsluta pass" tertiär. */}
            {!isWorking ? (
              <button onClick={async ()=>{
                const nuT = nuKlock();
                if (!medarbetare?.id) { console.warn('[Starta arbetspass] medarbetare saknas'); return; }
                const res = await upsertVerifierat(supabase, "arbetsdag", {
                  medarbetare_id: medarbetare.id,
                  datum: idagKey,
                  start_tid: nuT + ":00",
                  maskin_id: medarbetare.maskin_id || null,
                  objekt_id: valtObjektId || null,
                  // arbetad_min är generated (slut_tid - start_tid - rast_min) — sätts ej manuellt
                }, { onConflict: 'medarbetare_id,datum', select: "*" });
                if (!res.ok) { setBekraftaFel(res.fel); return; }
                setBekraftaFel(null);
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
              }} style={{ ...KNAPP.sekundar, marginTop:AVSTAND.m }}>
                <span className="material-symbols-outlined" style={{ fontSize:IKON.text }}>play_circle</span>
                Starta arbetspass
              </button>
            ) : (
              <div style={{ marginTop:AVSTAND.s }}>
                <button onClick={async ()=>{
                  const nuT = nuKlock();
                  // Verifiera FÖRE lokal state — ett pass som inte avslutades i DB får inte se avslutat ut
                  const res = await uppdateraVerifierat(supabase, "arbetsdag", { slut_tid: nuT + ":00" }, { id: idagArb?.id });
                  if (!res.ok) { setBekraftaFel(res.fel); return; } // felet visas i vyn, aldrig window.alert
                  setBekraftaFel(null);
                  setSlut(nuT); setSlutÄndrad(true);
                  setDagData(d => ({ ...d, [idagKey]: { ...d[idagKey], slut_tid: nuT + ":00" } }));
                  if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(50);
                  synkaVilobrott(idagKey);
                }} style={KNAPP.tertiar}>
                  <span className="material-symbols-outlined" style={{ fontSize:IKON.text }}>stop_circle</span>
                  Avsluta pass
                </button>
              </div>
            )}
            {bekraftaFel && (
              <p style={{ margin:`${AVSTAND.s}px 0 0`, ...TYP.meta, color:FARG.rod }}>{bekraftaFel}</p>
            )}
          </div>
        </section>
      );
    })();

    /* DAGSSAMMANFATTNINGEN — kortet med det stora talet, villkorade rader och
       en knapp. Strukturen är oförändrad; värdena kommer ur tokens. */
    const sammanfattningKort = (() => {
      if (!visaSammanfattning) return null;
      const bekräftadTidKort = idagArb?.bekraftad_tid
        ? new Date(idagArb.bekraftad_tid).toLocaleTimeString('sv-SE',{hour:'2-digit',minute:'2-digit'})
        : '';
      const dagNamnLång = ["Söndag","Måndag","Tisdag","Onsdag","Torsdag","Fredag","Lördag"][idag.getDay()];
      const månNamnLång = ["januari","februari","mars","april","maj","juni","juli","augusti","september","oktober","november","december"][idag.getMonth()];
      const typPrefix = idagArb?.dagtyp && FRANVARO_RUBRIK[idagArb.dagtyp] ? FRANVARO_RUBRIK[idagArb.dagtyp] : '';
      const datumRubrik = typPrefix
        ? `${typPrefix} — ${dagNamnLång} ${idag.getDate()} ${månNamnLång}`
        : `${dagNamnLång} ${idag.getDate()} ${månNamnLång}`;
      const dagObjId = valtObjektId || idagArb?.objekt_id || null;
      const dagObjNamn = dagObjId ? (objektLista.find(o => o.id === dagObjId)?.namn || dagObjId) : '';
      const maskinNamnLång = maskinNamn || maskinNamnMap[medarbetare?.maskin_id] || medarbetare?.maskin_id || '';
      const helKr  = gsAvtal?.traktamente_hel_kr  ?? 300;
      const halvKr = gsAvtal?.traktamente_halv_kr ?? 150;
      const harKm = totKm > 0 || (kmBerakning != null && kmBerakning > 0);
      const harKmBlock = harKm && harMaskinPass;
      const harObjBlock = !!(dagObjNamn || maskinNamnLång) && harMaskinPass;
      const linjeUnder = (aktiv: boolean): CSSProperties => aktiv
        ? { paddingBottom:AVSTAND.s, borderBottom:`1px solid ${FARG.linje}`, marginBottom:AVSTAND.s }
        : {};
      const sammanRad = (label: string, value: string, onClick?: () => void) => kortRad(label, value, onClick, true);
      const öppnaTider = () => { setTS(start); setTE(slut); setTR(rast); setVisaTiderSheet(true); };
      const öppnaKm    = () => { setTMK(kmM?.km||0); setTKK(kmK?.km||0); setVisaKmSheet(true); };
      const talBlock = (under: ReactNode, fotnot: ReactNode, onClick?: () => void, linje?: boolean) => (
        <div onClick={onClick} style={{ textAlign:"center", padding:`${AVSTAND.l}px 0`, cursor:onClick?"pointer":"default", ...linjeUnder(!!linje) }}>
          <p style={{ margin:`0 0 ${AVSTAND.s}px`, ...TYP.meta, color:FARG.text2 }}>Maskinpass</p>
          <p style={{ margin:0, ...TYP.tal, color:FARG.text }}>{fmt(Math.round(arbMinVisad))}</p>
          <p style={{ margin:`${AVSTAND.s}px 0 0`, ...TYP.meta, ...TNUM, color:FARG.text2 }}>{under}</p>
          <p style={{ margin:`${AVSTAND.xs}px 0 0`, ...TYP.meta, color:FARG.text3 }}>{fotnot}</p>
          {(()=>{
            const exMinIdag = extraTidData.filter(e => e.datum === idagKey).reduce((a,e) => a + (e.minuter||0), 0);
            return exMinIdag > 0 ? (
              <p style={{ margin:`${AVSTAND.xs}px 0 0`, ...TYP.meta, ...TNUM, color:FARG.text2 }}>+ {fmt(exMinIdag)} extra arbete · totalt {fmt(arbMin + exMinIdag)} idag</p>
            ) : null;
          })()}
        </div>
      );

      if (dagPågår) {
        return (
          <section>
            <div style={KORT}>
              <p style={{ margin:0, ...TYP.listtitel, color:FARG.text }}>{datumRubrik}</p>
              <div style={{ display:"flex", alignItems:"center", gap:AVSTAND.xs, marginTop:AVSTAND.xs }}>
                <span className="puls" style={{ width:AVSTAND.s, height:AVSTAND.s, borderRadius:RADIE.cirkel, background:FARG.gron, display:"inline-block" }} />
                <span style={{ ...TYP.meta, ...TNUM, color:FARG.gron }}>Arbetsdagen startade {start}</span>
              </div>
              {talBlock(
                <>{start} → pågår{rast ? ` · rast ${rast} min` : ''}</>,
                'Hittills — uppdateras när nya maskinfiler kommer',
              )}
              <div style={{ display:"flex", justifyContent:"center" }}>
                <button onClick={()=>setBekraftaÄndå(true)} style={KNAPP.tertiar}>
                  Dagen är inte avslutad än — bekräfta ändå
                </button>
              </div>
            </div>
          </section>
        );
      }
      return (
        <section>
          <div style={KORT}>
            <p style={{ margin:0, ...TYP.listtitel, color:FARG.text }}>{datumRubrik}</p>
            {redanBekräftad && (
              <div style={{ display:"flex", alignItems:"center", gap:AVSTAND.xs, marginTop:AVSTAND.xs }}>
                <span className="material-symbols-outlined" style={{ fontSize:IKON.text, color:FARG.gron }}>check_circle</span>
                <span style={{ ...TYP.meta, ...TNUM, color:FARG.gron }}>Bekräftad{bekräftadTidKort?` kl ${bekräftadTidKort}`:''}</span>
              </div>
            )}
            {ändradSedan && (
              <div style={{ display:"flex", alignItems:"center", gap:AVSTAND.xs, marginTop:AVSTAND.xs }}>
                <span className="material-symbols-outlined" style={{ fontSize:IKON.text, color:FARG.orange }}>edit</span>
                <span style={{ ...TYP.meta, color:FARG.orange }}>Ändrad — ej bekräftad</span>
              </div>
            )}
            {/* Hjälte: Maskinpass — hela blocket öppnar Ändra tider. Siffran är
                passets tid (start→slut−rast). Extra tid är egna poster; dagens
                TOTAL visas som dämpad rad när extra finns. */}
            {harMaskinPass && talBlock(
              <>{start} → {slut} · rast {rast} min <span className="material-symbols-outlined" style={{ fontSize:IKON.text, color:FARG.text3, verticalAlign:"middle" }}>chevron_right</span></>,
              'Rast = tid markerad som Meal break i maskinen',
              öppnaTider,
              harObjBlock || harKmBlock,
            )}
            {harObjBlock&&(
              <div style={linjeUnder(harKmBlock)}>
                {maskinNamnLång && sammanRad("Maskin", maskinNamnLång)}
                {(()=>{
                  // Flera objekt per dag (Hössjömåla + Flytt etc.) — en rad var.
                  const objLista = idagArb?.objekt_lista || [];
                  if (objLista.length > 1) {
                    return objLista.map((o:any, i:number) => {
                      const tidStr = o.start_tid && o.slut_tid
                        ? ` (${o.start_tid.slice(0,5)}–${o.slut_tid.slice(0,5)})`
                        : o.arbetad_min ? ` (${fmt(o.arbetad_min)})` : '';
                      return (
                        <div key={o.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:AVSTAND.s, padding:`${AVSTAND.s}px 0` }}>
                          <span style={{ ...TYP.meta, color:FARG.text2 }}>{i === 0 ? "Objekt" : ""}</span>
                          <span style={{ ...TYP.listtitel, ...TNUM, color:FARG.text, textAlign:"right" as const }}>
                            {o.objekt_namn || o.objekt_id}
                            <span style={{ ...TYP.meta, ...TNUM, color:FARG.text2 }}>{tidStr}</span>
                          </span>
                        </div>
                      );
                    });
                  }
                  return dagObjNamn ? sammanRad("Objekt", dagObjNamn) : null;
                })()}
              </div>
            )}
            {/* Körning — bara för maskinpass. Talet räknar upp när km fylls i. */}
            {harMaskinPass && (
              <div style={linjeUnder(true)}>
                {sammanRad("Körning", `${Math.round(totKmVisad)} km`, öppnaKm)}
                {milPåbörjade > 0 && sammanRad("Reseersättning", `${milPåbörjade} påbörjade mil`)}
              </div>
            )}
            {/* Extra tid-rader för idag — klickbara för att redigera typ/objekt/deb/kommentar. */}
            {(()=>{
              const extraIdag = (extraTidData || [])
                .filter((e: any) => e.datum === idagKey && e.slut_tid)
                .sort((a: any, b: any) => (a.start_tid||'').localeCompare(b.start_tid||''));
              if (extraIdag.length === 0) return null;
              const arbSt = idagArb?.start_tid;
              const arbEn = idagArb?.slut_tid;
              const prefixFör = (e: any): string => {
                if (arbSt && e.slut_tid && e.slut_tid <= arbSt) return "Morgon";
                if (arbEn && e.start_tid && e.start_tid >= arbEn) return "Kväll";
                return "Extra";
              };
              return (
                <div style={linjeUnder(true)}>
                  {extraIdag.map((e: any) => {
                    const typLabel = e.aktivitet_typ ? aktLabel(e.aktivitet_typ) : '';
                    const tidStr = `${(e.start_tid||'').slice(0,5)}–${(e.slut_tid||'').slice(0,5)}`;
                    const värde = `${typLabel?typLabel+' ':''}${tidStr} (${fmt(e.minuter||0)})`;
                    return (
                      <div key={e.id} onClick={()=>oppnaPeriodRedigera(e)} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:AVSTAND.s, minHeight:TRAFFYTA.min, padding:`${AVSTAND.s}px 0`, cursor:"pointer" }}>
                        <span style={{ ...TYP.meta, color:FARG.text2, flexShrink:0 }}>{prefixFör(e)}</span>
                        <div style={{ display:"flex", alignItems:"center", gap:AVSTAND.xs, minWidth:0 }}>
                          <span style={{ ...TYP.listtitel, ...TNUM, color:FARG.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{värde}</span>
                          <span className="material-symbols-outlined" style={{ fontSize:IKON.text, color:FARG.text3, flexShrink:0 }}>chevron_right</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
            {harMaskinPass && (
              <div onClick={()=>setTrakÖppen(v=>!v)} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:AVSTAND.s, minHeight:TRAFFYTA.min, padding:`${AVSTAND.s}px 0`, cursor:"pointer" }}>
                <span style={{ ...TYP.meta, color:FARG.text2 }}>Traktamente</span>
                <div style={{ display:"flex", alignItems:"center", gap:AVSTAND.xs }}>
                  <span style={{ ...TYP.listtitel, color:FARG.text }}>{trak?.summa ? "Heldag" : "Inget"}</span>
                  <span className="material-symbols-outlined" style={{ fontSize:IKON.text, color:FARG.text3, transform:trakÖppen?"rotate(90deg)":"none", transition:`transform ${RORELSE.tryck}ms ${RORELSE.kurva}` }}>chevron_right</span>
                </div>
              </div>
            )}
            {harMaskinPass && trakÖppen&&(
              <div className="tona-in" style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:AVSTAND.s, marginTop:AVSTAND.s }}>
                {/* Mängder, inte kronor: Inget / Halv / Hel. Beloppet äger Fortnox (#377). */}
                {[{k:'inget',l:'Inget',v:null},{k:'halv',l:'Halv',v:{summa:halvKr}},{k:'hel',l:'Hel',v:{summa:helKr}}].map(opt=>{
                  const valt = opt.v === null ? !trak : (trak?.summa === (opt.v as any)?.summa);
                  return (
                    <button key={opt.k} onClick={async ()=>{
                      setTrakÖppen(false);
                      if (idagArb?.id) {
                        const bryterBekräftelse = !!idagArb?.bekraftad;
                        const payload: any = { traktamente: !!opt.v };
                        if (bryterBekräftelse) payload.bekraftad = false;
                        const res = await uppdateraVerifierat(supabase, "arbetsdag", payload, { id: idagArb.id });
                        if (!res.ok) { setBekraftaFel(res.fel); return; } // trak-valet rörs inte — DB och UI ska aldrig glida isär
                        setBekraftaFel(null);
                        if (bryterBekräftelse) setDagData(d => ({ ...d, [idagKey]: { ...d[idagKey], bekraftad: false, traktamente: !!opt.v } }));
                        else setDagData(d => ({ ...d, [idagKey]: { ...d[idagKey], traktamente: !!opt.v } }));
                      }
                      setTrak(opt.v as any); setTrakÄndrad(true);
                    }}
                      // Valt = fyllning + fet text + bock. Färgen bär aldrig ensam.
                      style={{ ...KNAPP.sekundar, padding:0, background:valt?FARG.fyllning:"transparent", color:valt?FARG.text:FARG.text2, ...TYP.meta, fontWeight:valt?VIKT.halvfet:VIKT.normal, gap:AVSTAND.xs }}>
                      {valt && <span className="material-symbols-outlined" style={{ fontSize:IKON.text }}>check</span>}
                      {opt.l}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          {/* Brandrisk-OB — frågan VID BEKRÄFTELSEN. Villkor: vardag + start < 05:30
              + obesvarad. Blockerar ALDRIG bekräftelsen — obesvarad förblir null. */}
          {(() => {
            const dag = { datum: idagKey, start_tid: idagArb?.start_tid, brandrisk_beordrad: idagArb?.brandrisk_beordrad ?? null };
            const fråga = skaFragaBrandrisk(dag);
            const obMin = obMinuter(dag);
            if (!fråga && obMin <= 0) return null;
            const svara = async (val: boolean) => {
              if (!idagArb?.id) return;
              const res = await uppdateraVerifierat(supabase, 'arbetsdag', { brandrisk_beordrad: val }, { id: idagArb.id });
              if (!res.ok) { setBekraftaFel(res.fel); return; }
              setBekraftaFel(null);
              setDagData(d => ({ ...d, [idagKey]: { ...(d[idagKey]||{}), brandrisk_beordrad: val } }));
              if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(60);
            };
            if (fråga) return (
              <div style={{ ...KORT, marginTop:AVSTAND.m }}>
                <div style={{ display:"flex", alignItems:"center", gap:AVSTAND.s }}>
                  <span className="material-symbols-outlined" style={{ fontSize:IKON.rad, color:FARG.orange }}>local_fire_department</span>
                  <span style={{ ...TYP.listtitel, ...TNUM, color:FARG.text }}>Tidig start · {(idagArb?.start_tid||'').slice(0,5)}</span>
                </div>
                <p style={{ margin:`${AVSTAND.s}px 0 ${AVSTAND.m}px`, ...TYP.text, color:FARG.text }}>Började du tidigt på grund av brandrisk?</p>
                <div style={{ display:"flex", gap:AVSTAND.s }}>
                  <button onClick={()=>svara(true)} style={KNAPP.sekundar}>Ja</button>
                  <button onClick={()=>svara(false)} style={KNAPP.sekundar}>Nej</button>
                </div>
              </div>
            );
            return (
              <div style={{ marginTop:AVSTAND.m, display:"flex", alignItems:"center", gap:AVSTAND.s, color:FARG.orange }}>
                <span className="material-symbols-outlined" style={{ fontSize:IKON.text }}>local_fire_department</span>
                <span style={{ ...TYP.meta, ...TNUM }}>Brandrisk · {fmtOb(obMin)} OB</span>
              </div>
            );
          })()}
          {/* Skärmens ENDA primära: Bekräfta dagen. Bekräftad dag → sekundär "Ändra rapport". */}
          {harMaskinPass && pagaendeAktiviteter.length===0 && (redanBekräftad ? (
            <button onClick={()=>setVisaTiderSheet(false)} style={{ ...KNAPP.sekundar, marginTop:AVSTAND.l }}>
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
                  const min = Math.max(0, minutDiff(p.start_tid, nuTS));
                  // Ingen tyst radering av korta poster — föraren tar bort själv i
                  // periodformuläret. minuter är INTE genererad — räknas om här.
                  const res = await uppdateraVerifierat(supabase, "extra_tid", { slut_tid: nuTS, minuter: min }, { id: p.id });
                  if (!res.ok) { setBekraftaFel(res.fel); return; } // felet visas under knappen
                }
                if (pagaendeAktiviteter.length > 0) setPagaendeAktiviteter([]);

                // För-check + skrivning — SAMMA funktion som Redigeras Bekräfta.
                await bekraftaMedForcheck(idagKey, bekraftaDagen, "morgon");
              }}
              style={{ ...KNAPP.primar, marginTop:AVSTAND.l }}>
              {ändradSedan ? "Bekräfta igen" : "Bekräfta dagen"}
            </button>
          ))}
          {/* Guard-felmeddelande — visas om bekraftaDagen blockerade pga tomma tider */}
          {bekraftaFel && (
            <p style={{ margin:`${AVSTAND.s}px 0 0`, ...TYP.meta, color:FARG.rod, textAlign:"center" }}>{bekraftaFel}</p>
          )}
        </section>
      );
    })();

    /* VAD SOM VÄNTAR — eget kort ÖVERST, ovanför hälsningen. Varje rad visas
       BARA när den har något att säga; är allt i ordning finns kortet inte.
       Ordning: vilobrott (RÖD — du behöver VETA innan du startar passet),
       obekräftade dagar (ORANGE — du kan åtgärda), brandriskfrågor (ORANGE).
       Fönster räknade i prod av Martin: obekräftade 7 dagar (äldre är
       importerade maskindagar från före appen, de bekräftas aldrig),
       brandrisk 30 dagar, vilobrott 30 dagar. Tryck leder dit man åtgärdar.
       Källorna är de befintliga: årsData (Kalendern), skaFragaBrandrisk
       (Sammanställningens retro-fråga), vilobrott-tabellen (Vila-fliken). */
    const dagarSedan = (n: number) => { const d = new Date(idagKey + 'T00:00:00'); d.setDate(d.getDate() - n); return ymdLokal(d); };
    // Fönstren klipps mot SKARP START (lib/skarpStart): golvet hindrar att ett
    // vidgat fönster någonsin drar in dagar före 2026-08-01 (735 obekräftade).
    const fran7 = franGolv(dagarSedan(7)), fran30 = franGolv(dagarSedan(30));
    const fmtDatumKort = (iso: string) => {
      const d = new Date(iso + 'T00:00:00');
      return `${d.getDate()} ${["jan","feb","mar","apr","maj","jun","jul","aug","sep","okt","nov","dec"][d.getMonth()]}`;
    };
    const fmtTim = (h: number) => (Math.round(h * 10) / 10).toLocaleString('sv-SE');
    const obekraftade: string[] = (årsData || [])
      .filter((d: any) => d.datum && d.datum >= fran7 && d.datum < idagKey && !d.bekraftad
        && (d.start_tid || d.slut_tid || arFranvaroDagtyp(d.dagtyp)))
      .map((d: any) => d.datum as string)
      .sort();
    const brandriskObesvarade = (årsData || [])
      .filter((d: any) => d.datum && d.datum >= fran30 && d.datum < idagKey
        && skaFragaBrandrisk({ datum: d.datum, start_tid: d.start_tid, brandrisk_beordrad: d.brandrisk_beordrad ?? null }));
    // Dygnsvila räknas mellan slut_tid dag N och start_tid dag N+1 — den kan
    // alltså INTE räknas före dagens pass börjat. Det som visas är lagrade
    // brott: dygnsvilan från i natt syns först när dagens start finns.
    const vilobrottObesvarade = aktuellaVilobrott.filter(b => !b.besvarat_av_forare && b.datum >= fran30);
    type VantarRad = { nyckel: string; text: string; farg: string; onClick: () => void };
    const vantarRader: VantarRad[] = [];
    for (const b of vilobrottObesvarade) {
      const nar = b.typ === 'veckovila'
        ? `vecka ${isoVecka(new Date(b.datum + 'T00:00:00')).vecka}`
        : (b.datum === igårKey ? 'i natt' : fmtDatumKort(b.datum));
      vantarRader.push({ nyckel:`vila-${b.id}`, farg:FARG.rod,
        text:`${b.typ === 'dygnsvila' ? 'Dygnsvila' : 'Veckovila'} ${fmtTim(Number(b.vila_h))} tim av ${fmtTim(Number(b.krav_h))} · ${nar}`,
        onClick:()=>{ setMinTidFlik('vila'); setSteg('mintid'); } });
    }
    if (obekraftade.length === 1) {
      vantarRader.push({ nyckel:'bekr', farg:FARG.orange, text:`${fmtDatumKort(obekraftade[0])} väntar på bekräftelse`, onClick:()=>öppnaRedigera(obekraftade[0]) });
    } else if (obekraftade.length > 1) {
      vantarRader.push({ nyckel:'bekr', farg:FARG.orange, text:`${obekraftade.length} dagar väntar på bekräftelse`, onClick:()=>setSteg('kalender') });
    }
    if (brandriskObesvarade.length > 0) {
      vantarRader.push({ nyckel:'brand', farg:FARG.orange,
        text: brandriskObesvarade.length === 1 ? '1 brandriskfråga obesvarad' : `${brandriskObesvarade.length} brandriskfrågor obesvarade`,
        onClick:()=>setSteg('lön') });
    }
    // Extra arbete från en tidigare dag utan sluttid — leder till Redigera för
    // den dagen där posten kan fyllas i eller tas bort. Aldrig mer föräldralös.
    for (const e of (extraTidData || []).filter((x: any) => x.start_tid && !x.slut_tid && x.datum && x.datum < idagKey && x.datum >= fran30)) {
      vantarRader.push({ nyckel:`extra-oppen-${e.id}`, farg:FARG.orange,
        text:`Extra arbete utan sluttid · ${fmtDatumKort(e.datum)}`,
        onClick:()=>öppnaRedigera(e.datum) });
    }

    /* Kort med rubrik + underrad + pil (kort 2 och 3). */
    const kortKnapp = (rubrik: string, under: string, onClick: () => void, oppen?: boolean) => (
      <button onClick={onClick}
        style={{ ...KORT, width:"100%", display:"flex", alignItems:"center", justifyContent:"space-between", gap:AVSTAND.s, border:"none", cursor:"pointer", fontFamily:"inherit", textAlign:"left", color:FARG.text }}>
        <div style={{ minWidth:0 }}>
          <p style={{ margin:0, ...TYP.listtitel, color:FARG.text }}>{rubrik}</p>
          <p style={{ margin:`${AVSTAND.xs}px 0 0`, ...TYP.meta, color:FARG.text2 }}>{under}</p>
        </div>
        <span className="material-symbols-outlined" style={{ fontSize:IKON.rad, color:FARG.text3, flexShrink:0, transform:oppen?"rotate(90deg)":"none", transition:`transform ${RORELSE.tryck}ms ${RORELSE.kurva}` }}>chevron_right</span>
      </button>
    );

    return (
    <div style={{ minHeight:"100vh", background:FARG.bg, color:FARG.text, fontFamily:FONT, WebkitFontSmoothing:"antialiased", display:"flex", flexDirection:"column" }}>
      <style>{css}{designCss}</style>{timerBanner}

      {/* Rubrikraden */}
      <header style={{ position:"fixed", top:0, width:"100%", height:DAG_HUVUD, background:"rgba(0,0,0,0.8)", backdropFilter:"blur(12px)", WebkitBackdropFilter:"blur(12px)", zIndex:50, display:"flex", justifyContent:"center", alignItems:"center", padding:`0 ${AVSTAND.sidmarginal}px`, boxSizing:"border-box" }}>
        <span style={{ ...TYP.listtitel, color:FARG.text }}>Dag</span>
      </header>

      <main style={{ paddingTop:DAG_HUVUD + AVSTAND.xxl, paddingBottom:SCROLL_BOTTOM, paddingLeft:AVSTAND.sidmarginal, paddingRight:AVSTAND.sidmarginal, flex:1, width:"100%", boxSizing:"border-box" }}>

        {/* VAD SOM VÄNTAR — ovanför hälsningen, bara när något finns. */}
        {vantarRader.length > 0 && (
          <section className="tona-in" style={{ ...KORT, paddingTop:AVSTAND.xs, paddingBottom:AVSTAND.xs, marginBottom:AVSTAND.l }}>
            {vantarRader.map((r, i) => (
              <button key={r.nyckel} onClick={r.onClick}
                style={{ ...KNAPP.tertiar, display:"flex", width:"100%", justifyContent:"space-between", gap:AVSTAND.s, ...TYP.text, color:FARG.text, borderBottom: i === vantarRader.length - 1 ? "none" : `1px solid ${FARG.linje}`, textAlign:"left" }}>
                <span style={{ display:"flex", alignItems:"center", gap:AVSTAND.s, minWidth:0 }}>
                  <span style={{ width:AVSTAND.s, height:AVSTAND.s, borderRadius:RADIE.cirkel, background:r.farg, flexShrink:0 }} />
                  <span style={{ ...TNUM, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{r.text}</span>
                </span>
                <span className="material-symbols-outlined" style={{ fontSize:IKON.text, color:FARG.text3, flexShrink:0 }}>chevron_right</span>
              </button>
            ))}
          </section>
        )}

        {/* Timer-varningar: 3h-påminnelse (orange) och 12h-varning (röd) */}
        {pagaendeAktiviteter.map(p => {
          const sek = sekDiff(p.start_tid);
          if (sek > 12*3600) return varningsKort(`varn-${p.id}`, 'warning', FARG.rod, 'Timer igång sedan igår', `Startad ${(p.start_tid||'').slice(0,5)} — glömd att stoppa?`);
          if (sek > 3*3600) return varningsKort(`pam-${p.id}`, 'schedule', FARG.orange, `Timer igång sedan ${(p.start_tid||'').slice(0,5)} — glömt stoppa?`);
          return null;
        })}

        {/* Hälsning + datum överst, som i originalet. */}
        <p style={{ margin:`0 0 ${AVSTAND.l}px`, ...TYP.meta, color:FARG.text2 }}>{hälsning()} · {datumLångt}</p>

        {/* DAGENS TILLSTÅND — kort 1 (väntar/pågår) och dagssammanfattningen
            (avslutad/bekräftad) tonar över på samma plats med reserverad höjd. */}
        <Tillstand nyckel={tillstandNyckel}>
          {visaTillstand && tillstandKort}
          {sammanfattningKort}
        </Tillstand>

        {/* KORT 2 — Extra arbete. Två klockslag, ingen timer: trycket noterar
            starten, "Avsluta" noterar slutet och öppnar periodformuläret där
            båda tiderna kan rättas och posten tas bort. "Lägg till i efterhand"
            öppnar samma formulär tomt. */}
        {!idagArb?.bekraftad && (aktivTimer ? (
          <section style={{ ...KORT, marginTop:AVSTAND.m }}>
            <p style={{ margin:0, ...TYP.listtitel, color:FARG.text }}>Extra arbete</p>
            <p style={{ margin:`${AVSTAND.xs}px 0 0`, ...TYP.meta, ...TNUM, color:FARG.text2 }}>
              {aktLabel(aktivTimer.aktivitet_typ)} · sedan {(aktivTimer.start_tid||'').slice(0,5)}
            </p>
            <button onClick={()=>avslutaExtra(aktivTimer)} style={{ ...KNAPP.sekundar, marginTop:AVSTAND.m }}>
              <span className="material-symbols-outlined" style={{ fontSize:IKON.text }}>stop_circle</span>
              Avsluta
            </button>
            <div style={{ display:"flex", justifyContent:"center", marginTop:AVSTAND.xs }}>
              <button onClick={()=>oppnaPeriodRedigera(aktivTimer)} style={KNAPP.tertiar}>Ändra starttid eller ta bort</button>
            </div>
          </section>
        ) : (
          <div style={{ marginTop:AVSTAND.m }}>
            {kortKnapp('Extra arbete', 'Reservdelar, service, brandkontroll', async ()=>{
              const startTid = nuKlock();
              const { data, error } = await supabase.from("extra_tid").insert({
                medarbetare_id: medarbetare.id,
                datum: idagKey,
                start_tid: startTid + ":00",
                slut_tid: null,
                minuter: 0,
                kalla: 'morgon',
              }).select().single();
              if (error || !data) { setBekraftaFel(SPARA_FEL); return; }
              setBekraftaFel(null);
              setPagaendeAktiviteter(p => [...p, data]);
              setExtraTidData(d => [data, ...d]);
              if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(80);
            })}
            <div style={{ display:"flex", justifyContent:"center" }}>
              <button onClick={()=>oppnaPeriodNy(idagKey)} style={KNAPP.tertiar}>
                <span className="material-symbols-outlined" style={{ fontSize:IKON.text }}>schedule</span>
                Lägg till i efterhand
              </button>
            </div>
          </div>
        ))}

        {/* KORT 3 — Frånvaro. Underraden visar vad som finns utan att trycka;
            tryck fäller ut valen (lib/franvaro äger listan). sjuk/vab/
            föräldraledig skrivs till arbetsdag.dagtyp — oplanerad frånvaro
            idag, bekräftas direkt. Planerad ledighet ansöks i Ledighet-vyn. */}
        {!isWorking && !idagArb?.bekraftad && (
          <section style={{ marginTop:AVSTAND.m }}>
            {kortKnapp('Frånvaro', FRANVARO_UNDERRAD, ()=>setVisaÖvrigt(v=>!v), visaÖvrigt)}
            {visaÖvrigt && (
              <div className="tona-in" style={{ display:"flex", flexDirection:"column", gap:AVSTAND.s, marginTop:AVSTAND.s }}>
                {FRANVARO_VAL.map(s=>(
                  <button key={s.id} onClick={async ()=>{
                    const nuIso = new Date().toISOString();
                    // Heldagstyp: bekräftas direkt, ingen tid krävs.
                    const payload: any = {
                      medarbetare_id: medarbetare.id,
                      datum: idagKey,
                      dagtyp: s.id,
                      bekraftad: true,
                      bekraftad_tid: nuIso,
                    };
                    const res = await upsertVerifierat(supabase, "arbetsdag", payload, { onConflict: 'medarbetare_id,datum', select: "*" });
                    if (!res.ok) { setBekraftaFel(res.fel); return; }
                    setBekraftaFel(null);
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
                      setHeldagsMeddelande({ typ: s.id, text: s.meddelande, icon: s.ikon });
                      setTimeout(() => setHeldagsMeddelande(null), 2500);
                    }
                  }}
                    style={{ ...KNAPP.sekundar, justifyContent:"flex-start", padding:`0 ${AVSTAND.l}px` }}>
                    <span className="material-symbols-outlined" style={{ fontSize:IKON.text, color:FARG.text2 }}>{s.ikon}</span>
                    {s.label}
                  </button>
                ))}
              </div>
            )}
            {bekraftaFel && !visaTillstand && (
              <p style={{ margin:`${AVSTAND.s}px 0 0`, ...TYP.meta, color:FARG.rod }}>{bekraftaFel}</p>
            )}
          </section>
        )}

        {/* Objektväljare — sheet */}
        {visaObjektVäljare&&(
          <div className="tona-opacity" style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:100, display:"flex", alignItems:"flex-end", justifyContent:"center" }}>
            <div className="sheet-upp" style={{ background:FARG.kort, borderRadius:`${RADIE.sheet}px ${RADIE.sheet}px 0 0`, width:"100%", maxWidth:520, maxHeight:"70vh", display:"flex", flexDirection:"column" }}>
              <div style={{ padding:`${AVSTAND.l}px`, borderBottom:`1px solid ${FARG.linje}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <h3 style={{ margin:0, ...TYP.rubrik, color:FARG.text }}>Välj objekt</h3>
                <button onClick={()=>setVisaObjektVäljare(false)} style={KNAPP.lank}>Stäng</button>
              </div>
              <div style={{ flex:1, overflowY:"auto" }}>
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

      {/* "Vad gjorde du?"-sheeten + objektväljare — delad UI, se efterStoppUI */}
      {efterStoppUI}

      {/* Sheet: Ändra tider */}
      {visaTiderSheet && (()=>{
        const tAm = Math.max(0, tim(tS, tE) - tR);
        const stäng = () => setVisaTiderSheet(false);
        const ändrat = tS !== start || tE !== slut || tR !== rast;
        const sektionsRubrik = (text: string, andrad: boolean) => (
          <span style={{ ...TYP.micro, display:"block", textAlign:"center", marginBottom:AVSTAND.xs, color:andrad?FARG.orange:FARG.text2 }}>{text}{andrad ? ' · ändrad' : ''}</span>
        );
        return (
          <div onClick={stäng} className="tona-opacity" style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:1500, display:"flex", alignItems:"flex-end", justifyContent:"center" }}>
            <div onClick={e=>e.stopPropagation()} className="sheet-upp"
              style={{ width:"100%", maxWidth:520, background:FARG.kort, borderRadius:`${RADIE.sheet}px ${RADIE.sheet}px 0 0`, padding:`${AVSTAND.s}px ${AVSTAND.l}px calc(${AVSTAND.xl}px + env(safe-area-inset-bottom))`, maxHeight:"92vh", overflowY:"auto" }}>
              <div style={{ display:"flex", justifyContent:"center", padding:`${AVSTAND.xs}px 0 ${AVSTAND.m}px` }}>
                <div style={{ width:36, height:AVSTAND.xs, borderRadius:RADIE.rad, background:FARG.fyllning }} />
              </div>
              <p style={{ margin:`0 0 ${AVSTAND.l}px`, ...TYP.rubrik, color:FARG.text }}>Ändra tider</p>
              <div style={{ background:FARG.upphojt, borderRadius:RADIE.kort, padding:`${AVSTAND.l}px ${AVSTAND.m}px`, display:"flex", flexDirection:"column", gap:AVSTAND.l }}>
                <div>
                  {sektionsRubrik('Start', tS!==start)}
                  <TimePicker value={tS} onChange={setTS}/>
                </div>
                <div style={{ borderTop:`1px solid ${FARG.linje}`, paddingTop:AVSTAND.m }}>
                  {sektionsRubrik('Slut', tE!==slut)}
                  <TimePicker value={tE} onChange={setTE}/>
                </div>
                <div style={{ borderTop:`1px solid ${FARG.linje}`, paddingTop:AVSTAND.m }}>
                  {sektionsRubrik('Rast', tR!==rast)}
                  <div style={{ display:"flex", justifyContent:"center", alignItems:"center", gap:AVSTAND.s }}>
                    <Wheel value={tR} onChange={setTR} min={0} max={120} step={5}/>
                    <span style={{ ...TYP.meta, color:FARG.text2 }}>min</span>
                  </div>
                </div>
              </div>
              <div style={{ marginTop:AVSTAND.l, padding:`${AVSTAND.l}px`, background:FARG.upphojt, borderRadius:RADIE.kort, display:"flex", justifyContent:"space-between", alignItems:"baseline" }}>
                <span style={{ ...TYP.meta, color:FARG.text2 }}>Maskinpass</span>
                <span style={{ ...TYP.rubrik, ...TNUM, color:FARG.text }}>{fmt(tAm)}</span>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 2fr", gap:AVSTAND.s, marginTop:AVSTAND.l }}>
                <button onClick={stäng} style={{ ...KNAPP.lank, display:"flex", width:"100%" }}>Avbryt</button>
                <button
                  onClick={async ()=>{
                    if (ändrat) {
                      if (idagArb?.id) {
                        // Om dagen var bekräftad, rasera bekräftelsen så status visar "Ändrad".
                        // Verifiera skrivningen FÖRE lokal state — tider är lönedata,
                        // ett "Spara" som inte nådde DB får inte se sparat ut.
                        const bryterBekräftelse = !!idagArb?.bekraftad;
                        const payload: any = { start_tid: tS + ":00", slut_tid: tE ? tE + ":00" : null, rast_min: tR };
                        if (bryterBekräftelse) payload.bekraftad = false;
                        const res = await uppdateraVerifierat(supabase, "arbetsdag", payload, { id: idagArb.id });
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
                  style={KNAPP.primar}>
                  Spara
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Sheet: Ändra km */}
      {visaKmSheet && (()=>{
        const ny = tMK + tKK;
        const över = Math.max(0, ny - frikm);
        const mil = över > 0 ? Math.ceil(över/10) : 0;
        const stäng = () => setVisaKmSheet(false);
        const KmInput = ({label, value, onChange}: {label: string; value: number; onChange: (v:number)=>void}) => (
          <div style={{ flex:1, background:FARG.upphojt, borderRadius:RADIE.kort, padding:`${AVSTAND.l}px` }}>
            <p style={{ margin:`0 0 ${AVSTAND.s}px`, ...TYP.meta, color:FARG.text2 }}>{label}</p>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:AVSTAND.s }}>
              <button onClick={()=>onChange(Math.max(0, value-10))} style={{ ...KNAPP.sekundar, width:TRAFFYTA.min, padding:0, ...TYP.rubrik }}>−</button>
              <span style={{ ...TYP.tal, color:FARG.text }}>{value}</span>
              <button onClick={()=>onChange(Math.min(999, value+10))} style={{ ...KNAPP.sekundar, width:TRAFFYTA.min, padding:0, ...TYP.rubrik }}>+</button>
            </div>
            <p style={{ margin:`${AVSTAND.xs}px 0 0`, textAlign:"center", ...TYP.meta, color:FARG.text2 }}>km</p>
          </div>
        );
        return (
          <div onClick={stäng} className="tona-opacity" style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:1500, display:"flex", alignItems:"flex-end", justifyContent:"center" }}>
            <div onClick={e=>e.stopPropagation()} className="sheet-upp"
              style={{ width:"100%", maxWidth:520, background:FARG.kort, borderRadius:`${RADIE.sheet}px ${RADIE.sheet}px 0 0`, padding:`${AVSTAND.s}px ${AVSTAND.l}px calc(${AVSTAND.xl}px + env(safe-area-inset-bottom))`, maxHeight:"85vh", overflowY:"auto" }}>
              <div style={{ display:"flex", justifyContent:"center", padding:`${AVSTAND.xs}px 0 ${AVSTAND.m}px` }}>
                <div style={{ width:36, height:AVSTAND.xs, borderRadius:RADIE.rad, background:FARG.fyllning }} />
              </div>
              <p style={{ margin:`0 0 ${AVSTAND.l}px`, ...TYP.rubrik, color:FARG.text }}>Ändra km</p>
              <div style={{ display:"flex", gap:AVSTAND.s }}>
                <KmInput label="Morgon" value={tMK} onChange={setTMK}/>
                <KmInput label="Kväll"  value={tKK} onChange={setTKK}/>
              </div>
              <div style={{ marginTop:AVSTAND.l, padding:`${AVSTAND.l}px`, background:FARG.upphojt, borderRadius:RADIE.kort }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline" }}>
                  <span style={{ ...TYP.meta, color:FARG.text2 }}>Totalt</span>
                  <span style={{ ...TYP.rubrik, ...TNUM, color:FARG.text }}>{ny} km</span>
                </div>
                {över > 0
                  ? <p style={{ margin:`${AVSTAND.s}px 0 0`, ...TYP.meta, ...TNUM, color:FARG.text }}>Reseersättning: {över} km över {frikm} km = {mil} påbörjade mil</p>
                  : <p style={{ margin:`${AVSTAND.s}px 0 0`, ...TYP.meta, ...TNUM, color:FARG.text2 }}>Ingen färdtidsersättning (≤ {frikm} km)</p>
                }
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 2fr", gap:AVSTAND.s, marginTop:AVSTAND.l }}>
                <button onClick={stäng} style={{ ...KNAPP.lank, display:"flex", width:"100%" }}>Avbryt</button>
                <button
                  onClick={async ()=>{
                    if (idagArb?.id) {
                      const bryterBekräftelse = !!idagArb?.bekraftad;
                      // km_kalla='forare': föraren har satt km själv → helpern/
                      // nattjobbet rör den ALDRIG igen, inte ens om den är 0.
                      const payload: any = { km_morgon: tMK, km_kvall: tKK, km_kalla: 'forare' };
                      if (bryterBekräftelse) payload.bekraftad = false;
                      const res = await uppdateraVerifierat(supabase, "arbetsdag", payload, { id: idagArb.id });
                      if (!res.ok) { alert(res.fel); return; } // sheet:en står kvar
                      setDagData(d => ({ ...d, [idagKey]: { ...d[idagKey], km_morgon: tMK, km_kvall: tKK, km: tMK+tKK, km_totalt: tMK+tKK, ...(bryterBekräftelse ? { bekraftad: false } : {}) } }));
                    }
                    setKmM({km:tMK}); setKmK({km:tKK});
                    stäng();
                  }}
                  style={KNAPP.primar}>
                  Spara
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Heldagstyp-meddelande (Sjuk/VAB) — auto-stänger efter 2.5 s */}
      {heldagsMeddelande && (
        <div className="tona-opacity" style={{ position:"fixed", inset:0, background:FARG.bg, zIndex:2100, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:`${AVSTAND.xl}px` }}>
          {heldagsMeddelande.icon && (
            <span className="material-symbols-outlined tona-in" style={{ fontSize:IKON.stor, color:FARG.text, marginBottom:AVSTAND.xl }}>{heldagsMeddelande.icon}</span>
          )}
          <p style={{ margin:`0 0 ${AVSTAND.l}px`, ...TYP.titel, color:FARG.text, textAlign:"center" }}>{heldagsMeddelande.text}</p>
          <p style={{ margin:0, ...TYP.meta, color:FARG.text2 }}>
            {["Söndag","Måndag","Tisdag","Onsdag","Torsdag","Fredag","Lördag"][idag.getDay()]} {idag.getDate()} {["januari","februari","mars","april","maj","juni","juli","augusti","september","oktober","november","december"][idag.getMonth()]}
          </p>
        </div>
      )}

      {/* Bekräftelse-overlay efter Bekräfta dagen ✓ */}
      {bekräftelseVisa && (
        <div className="tona-opacity" style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", zIndex:2000, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}>
          <div className="tona-in" style={{ width:120, height:120, borderRadius:RADIE.cirkel, background:FARG.gron, display:"flex", alignItems:"center", justifyContent:"center" }}>
            <svg width="56" height="56" viewBox="0 0 52 52">
              <path d="M14 27 L23 36 L38 18" stroke={FARG.text} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" strokeDasharray="60" style={{ animation:`checkDraw ${RORELSE.tal}ms ${RORELSE.byte}ms both ${RORELSE.kurva}` }}/>
            </svg>
          </div>
          <p style={{ margin:`${AVSTAND.xxl}px 0 0`, ...TYP.titel, color:FARG.text }}>Dagen bekräftad</p>
        </div>
      )}
    </div>
    );
  }

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
    // EN veckonummerdefinition i hela appen: ISO (lib/vilobrott isoVecka). Förr
    // fanns tre — samma dagar kunde heta vecka 41 här och 42 i Sammanställningen.
    const veckoNr = isoVecka(nu).vecka;
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

    // MÅNADEN RÄKNAS INTE HÄR LÄNGRE. Förr fanns en lokal månadsberäkning
    // (timmar minus 8 × vardagar) parallellt med Sammanställningens spec
    // (beraknaLoneunderlag, per dag och avtal) — de kunde aldrig bli lika. Nu
    // är Månaden en länk till Sammanställningen; Idag/Veckan/Övertid-året
    // stannar som rådata. (Kvartalsblocket var död kod och är borttaget.)
    const rödaDagar2 = getRödaDagar(nu.getFullYear());

    // År — övertid beräknad per månad (årstaket är ett kalenderårsbegrepp och
    // får inte golvas — se lib/skarpStart)
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
    // Övertidstaket ur AVTALET (gs_avtal.max_overtid_ar) — inte hårdkodat 250
    // på fem ställen. Varningsnivåerna: nära = inom 50 h, över = inom 20 h.
    const övertidTak = Number(gsAvtal?.max_overtid_ar ?? 250);
    const årsKvar = Math.max(0, Math.round((övertidTak-årsÖvH)*10)/10);
    const årsNiva: 'ok'|'nara'|'over' = årsÖvH > övertidTak-20 ? 'over' : årsÖvH > övertidTak-50 ? 'nara' : 'ok';
    // Färgen förstärker ett ORD — den bär aldrig ensam (skogsystem-design).
    const årsFarg = årsNiva==='over' ? FARG.rod : årsNiva==='nara' ? FARG.orange : FARG.gron;
    const årsOrd = årsNiva==='over' ? `${årsKvar} tim kvar till taket` : årsNiva==='nara' ? `nära taket · ${årsKvar} tim kvar` : `god marginal · ${årsKvar} tim kvar`;
    // Vilovarningar visas på ETT ställe för handling — Dag-vyn (där bekräftelsen
    // sker) — och i Vila-fliken för historik. Inte här också (var tredje kopian).
    // Övertidsvarningarna som låg här sa samma sak som Övertid-kortet nedan.

    return (
      <div style={{ minHeight:"100vh",background:FARG.bg,color:FARG.text,fontFamily:FONT,WebkitFontSmoothing:"antialiased",paddingBottom:AVSTAND.xxl }}>
        <style>{css}</style>{timerBanner}
        <header style={{ position:"fixed",top:HEADER_TOP,width:"100%",zIndex:50,background:"rgba(0,0,0,0.8)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",display:"flex",flexDirection:"column",padding:`0 ${AVSTAND.sidmarginal}px`,paddingTop:AVSTAND.l }}>
          <h1 style={{ margin:`0 0 ${AVSTAND.m}px`,...TYP.titel,color:FARG.text }}>Min tid</h1>
          <div style={{ display:"flex",gap:0,background:FARG.linje,borderRadius:RADIE.rad,padding:AVSTAND.xs,marginBottom:AVSTAND.m,overflowX:"auto" }}>
            {([['översikt','Översikt'],['saldon','Saldon'],['vila','Vila'],['monster','Mönster']] as const).map(([k,l])=>(
              <button key={k} onClick={()=>setMinTidFlik(k)} style={{ flex:1, minHeight:TRAFFYTA.min, padding:`0 ${AVSTAND.s}px`, borderRadius:RADIE.rad, border:"none", ...TYP.meta, fontWeight:minTidFlik===k?VIKT.halvfet:VIKT.normal, cursor:"pointer", fontFamily:"inherit", background:minTidFlik===k?FARG.fyllning:"transparent", color:minTidFlik===k?FARG.text:FARG.text2, whiteSpace:"nowrap" }}>{l}</button>
            ))}
          </div>
        </header>

        <main style={{ paddingTop:AVSTAND.xxl,paddingLeft:AVSTAND.sidmarginal,paddingRight:AVSTAND.sidmarginal,paddingBottom:SCROLL_BOTTOM }}>

          {minTidFlik==='översikt'&&<>
          {/* VECKAN — ETT tal per vy: veckans timmar som hjälte i kortets huvud,
              staplarna som stöd i grå fyllning (blått betyder bara "navigerar").
              Förr stod samma tal i diagrammet (utan total) OCH som rad i Summering. */}
          <section style={{ marginBottom:AVSTAND.xl }}>
            <h3 style={{ margin:`0 0 ${AVSTAND.s}px`, ...TYP.micro, color:FARG.text2 }}>Vecka {veckoNr}</h3>
            <div style={KORT}>
              <div style={{ display:"flex", alignItems:"baseline", justifyContent:"space-between", gap:AVSTAND.s }}>
                <span style={{ ...TYP.tal, color:FARG.text }}>{(Math.round(veckoTot*10)/10).toLocaleString('sv-SE')}<span style={{ ...TYP.meta, color:FARG.text2 }}> tim</span></span>
                <span style={{ ...TYP.meta, ...TNUM, color:FARG.text2 }}>av {veckoMålH} tim</span>
              </div>
              <div style={{ display:"flex", alignItems:"flex-end", justifyContent:"space-between", height:96, gap:AVSTAND.xs, marginTop:AVSTAND.m }}>
                {veckoDagar.map(d=>(
                  <div key={d.datum} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", height:"100%" }}>
                    <div style={{ flex:1, display:"flex", alignItems:"flex-end", width:"100%" }}>
                      <div style={{ width:"100%", height:`${d.h>0?Math.max(8,d.h/maxH*100):8}%`, background:d.h>0?FARG.fyllning:FARG.linje, borderRadius:RADIE.rad, transition:`height ${RORELSE.byte}ms ${RORELSE.kurva}` }} />
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display:"flex", justifyContent:"space-between", marginTop:AVSTAND.xs }}>
                {veckoDagar.map(d=>(
                  <div key={d.datum+'l'} style={{ flex:1, textAlign:"center" }}>
                    <span style={{ ...TYP.micro, ...TNUM, color:d.h>0?FARG.text2:FARG.text3 }}>{d.h>0 ? d.h.toLocaleString('sv-SE') : (d as any).dagKort}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Summering — bara rådata som inte finns någon annanstans. Månaden är
              en LÄNK till Sammanställningen (specen är enda sanningen om
              månadens timmar och övertid); "Året totalt" är borttagen. */}
          <section style={{ marginBottom:AVSTAND.xl }}>
            <h3 style={{ margin:`0 0 ${AVSTAND.s}px`, ...TYP.micro, color:FARG.text2 }}>Summering</h3>
            <div style={{ ...KORT, paddingTop:0, paddingBottom:0 }}>
              {idagH>0 && (
                <div style={{ ...RAD, justifyContent:"space-between" }}>
                  <span style={{ ...TYP.meta, color:FARG.text2 }}>Idag</span>
                  <span style={{ ...TYP.listtitel, ...TNUM, color:FARG.text }}>{idagH.toLocaleString('sv-SE')} tim</span>
                </div>
              )}
              <div style={{ ...RAD, justifyContent:"space-between" }}>
                <span style={{ ...TYP.meta, color:FARG.text2 }}>Veckan</span>
                <span style={{ ...TYP.listtitel, ...TNUM, color:FARG.text }}>{(Math.round(veckoTot*10)/10).toLocaleString('sv-SE')} tim <span style={{ ...TYP.meta, color:FARG.text2 }}>av {veckoMålH}</span></span>
              </div>
              <button onClick={()=>setSteg('lön')} style={{ ...KNAPP.tertiar, display:"flex", width:"100%", justifyContent:"space-between", borderBottom:"none", ...TYP.meta }}>
                <span style={{ color:FARG.text2 }}>Månaden</span>
                <span style={{ display:"flex", alignItems:"center", gap:AVSTAND.xs, color:FARG.bla }}>Se lönespecen<span className="material-symbols-outlined" style={{ fontSize:IKON.text }}>chevron_right</span></span>
              </button>
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
              <section style={{ marginBottom:AVSTAND.xl }}>
                <h3 style={{ margin:`0 0 ${AVSTAND.s}px`, ...TYP.micro, color:FARG.text2 }}>Semester</h3>
                <div style={{ background:FARG.kort,borderRadius:RADIE.kort,padding:AVSTAND.xl,border:`1px solid ${FARG.linje}` }}>
                  {laddar?(
                    <p style={{ margin:0,...TYP.meta,color:FARG.text2 }}>Hämtar saldo…</p>
                  ):fel?(<>
                    <p style={{ margin:0,...TYP.meta,color:FARG.orange }}>Kunde inte hämta saldo</p>
                    <button onClick={()=>setFortnoxSaldoStatus('idle')}
                      style={{ marginTop:AVSTAND.m,padding:`${AVSTAND.m}px ${AVSTAND.l}px`,background:FARG.linje,border:`1px solid ${FARG.linje}`,borderRadius:RADIE.rad,color:FARG.text,...TYP.meta,cursor:"pointer",fontFamily:"inherit" }}>
                      Försök igen
                    </button>
                  </>):tom?(
                    <p style={{ margin:0,...TYP.meta,color:FARG.text2 }}>Inget saldo registrerat</p>
                  ):(<>
                    {/* Hjälte: dagar kvar — flikens hela poäng, samma mönster
                        som Dag-vyns Total och kalenderns månadskort. */}
                    <div style={{ textAlign:"center",padding:`${AVSTAND.s}px 0 ${AVSTAND.xs}px` }}>
                      <p style={{ margin:0,...TYP.tal,color:FARG.text,...TNUM }}>
                        {semKvar}
                        <span style={{ ...TYP.meta,color:FARG.text2,marginLeft:AVSTAND.s }}>dagar kvar</span>
                      </p>
                      <div style={{ height:4,background:FARG.linje,borderRadius:RADIE.rad,marginTop:AVSTAND.l,overflow:"hidden" }}>
                        <div style={{ height:"100%",width:`${semPct}%`,background:FARG.bla,borderRadius:RADIE.rad }} />
                      </div>
                    </div>
                    <div style={{ borderTop:`1px solid ${FARG.linje}`,marginTop:AVSTAND.l,paddingTop:AVSTAND.s }}>
                      {[
                        ["Betalda",`${betalda} dagar`],
                        ["Sparade",`${sparade} dagar`],
                        ["Obetalda",`${obetalda} dagar`],
                        ["Uttagna",`${uttagna} dagar`],
                      ].map(([l,v])=>(
                        <div key={l as string} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:`${AVSTAND.s}px 0` }}>
                          <span style={{ ...TYP.meta,color:FARG.text2 }}>{l}</span>
                          <span style={{ ...TYP.listtitel,color:FARG.text,...TNUM }}>{v}</span>
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
              <section style={{ marginBottom:AVSTAND.xl }}>
                <h3 style={{ margin:`0 0 ${AVSTAND.s}px`, ...TYP.micro, color:FARG.text2 }}>ATK</h3>
                {/* Saldo */}
                <div style={{ background:FARG.kort,borderRadius:RADIE.kort,padding:AVSTAND.xl,border:`1px solid ${FARG.linje}`,marginBottom:AVSTAND.m }}>
                  {laddar?(
                    <p style={{ margin:0,...TYP.meta,color:FARG.text2 }}>Hämtar saldo…</p>
                  ):fel?(<>
                    <p style={{ margin:0,...TYP.meta,color:FARG.orange }}>Kunde inte hämta saldo</p>
                    <button onClick={()=>setFortnoxSaldoStatus('idle')}
                      style={{ marginTop:AVSTAND.m,padding:`${AVSTAND.m}px ${AVSTAND.l}px`,background:FARG.linje,border:`1px solid ${FARG.linje}`,borderRadius:RADIE.rad,color:FARG.text,...TYP.meta,cursor:"pointer",fontFamily:"inherit" }}>
                      Försök igen
                    </button>
                  </>):tom?(
                    <p style={{ margin:0,...TYP.meta,color:FARG.text2 }}>Inget saldo registrerat</p>
                  ):(<>
                    <div style={{ display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:atkTimmar!=null?16:0 }}>
                      <span style={{ ...TYP.rubrik,color:FARG.text,...TNUM }}>{atkKr.toLocaleString('sv-SE')} <span style={{ ...TYP.meta,color:FARG.text2 }}>kr</span></span>
                    </div>
                    {atkTimmar!=null&&(
                      <div style={{ display:"flex",justifyContent:"space-between" }}>
                        <span style={{ ...TYP.meta,color:FARG.text2 }}>Motsvarar</span>
                        <span style={{ ...TYP.meta,fontWeight:VIKT.halvfet,color:FARG.text }}>{atkTimmar}h ({atkDagar} dagar)</span>
                      </div>
                    )}
                  </>)}
                </div>

                {/* ATK-val — beror på datum */}
                {föreValperiod&&(
                  <div style={{ background:FARG.kort,borderRadius:RADIE.kort,padding:AVSTAND.xl,border:`1px solid ${FARG.linje}` }}>
                    <p style={{ margin:0,...TYP.meta,color:FARG.text2 }}>ATK-val öppnar 1 maj</p>
                  </div>
                )}

                {efterValperiod&&harValt&&(
                  <div style={{ background:FARG.kort,borderRadius:RADIE.kort,padding:AVSTAND.l,border:`1px solid ${FARG.linje}` }}>
                    <div style={{ display:"flex",alignItems:"center",gap:AVSTAND.s }}>
                      <span className="material-symbols-outlined" style={{ fontSize:IKON.text,color:FARG.gron }}>check_circle</span>
                      <span style={{ ...TYP.meta,color:FARG.text }}>
                        Ditt val: {atkValSparat.val==='ledig'?'Ledig tid':atkValSparat.val==='kontant'?'Pengar':'Pension'}
                      </span>
                    </div>
                  </div>
                )}

                {/* Valfönstret stängt utan val: säg det ärligt och lugnt —
                    föraren kan inget göra förrän nästa fönster, ingen varning
                    och inget "kontakta chef". */}
                {efterValperiod&&!harValt&&(
                  <div style={{ background:FARG.kort,borderRadius:RADIE.kort,padding:AVSTAND.l,border:`1px solid ${FARG.linje}` }}>
                    <p style={{ margin:0,...TYP.meta,color:FARG.text2 }}>Inget val registrerat i år · nästa ATK-val öppnar 1 maj</p>
                  </div>
                )}

                {iValperiod&&harValt&&(
                  <div style={{ background:FARG.kort,borderRadius:RADIE.kort,padding:AVSTAND.l,border:`1px solid ${FARG.linje}` }}>
                    <div style={{ display:"flex",alignItems:"center",gap:AVSTAND.s }}>
                      <span className="material-symbols-outlined" style={{ fontSize:IKON.text,color:FARG.gron }}>check</span>
                      <span style={{ ...TYP.meta,color:FARG.text }}>
                        {atkValSparat.val==='ledig'?`Du valde ledig tid${atkDagar!=null?`: ${atkDagar} dagar`:''}`:atkValSparat.val==='kontant'?`Utbetalas juni ${årNu2}: ≈ ${atkKr.toLocaleString('sv-SE')} kr`:`Avsatt till pension: ≈ ${atkKr.toLocaleString('sv-SE')} kr`}
                      </span>
                    </div>
                  </div>
                )}

                {/* Valfönstret öppet: en handling, inte en varning. */}
                {iValperiod&&!harValt&&(
                  <div style={{ background:FARG.kort,borderRadius:RADIE.kort,padding:AVSTAND.xl,border:`1px solid ${FARG.linje}` }}>
                    <p style={{ margin:`0 0 ${AVSTAND.l}px`,...TYP.listtitel,color:FARG.text }}>Gör ditt ATK-val {årNu2}</p>
                    <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:AVSTAND.s,marginBottom:AVSTAND.l }}>
                      {([
                        {k:'ledig' as const,label:'Ledig tid',sub:atkDagar!=null?`= ${atkDagar} dagar`:''},
                        {k:'kontant' as const,label:'Pengar',sub:`≈ ${atkKr.toLocaleString('sv-SE')} kr`,sub2:'före skatt'},
                        {k:'pension' as const,label:'Pension',sub:`≈ ${atkKr.toLocaleString('sv-SE')} kr`,sub2:'till pension'},
                      ]).map(o=>(
                        <button key={o.k} onClick={()=>setAtkVal(o.k)} style={{ background:atkVal===o.k?FARG.upphojt:FARG.linje,border:atkVal===o.k?`1px solid ${FARG.linje}`:`1px solid ${FARG.linje}`,borderRadius:RADIE.rad,padding:`${AVSTAND.l}px ${AVSTAND.s}px`,cursor:"pointer",fontFamily:"inherit",textAlign:"center" }}>
                          <p style={{ margin:0,...TYP.meta,fontWeight:VIKT.halvfet,color:atkVal===o.k?FARG.bla:FARG.text }}>{o.label}</p>
                          <p style={{ margin:`${AVSTAND.xs}px 0 0`,...TYP.meta,color:FARG.text2 }}>{o.sub}</p>
                          {'sub2' in o&&<p style={{ margin:`${AVSTAND.xs}px 0 0`,...TYP.micro,color:FARG.text3 }}>{(o as any).sub2}</p>}
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
                      style={{ width:"100%",height:48,background:atkVal?FARG.bla:FARG.linje,border:"none",borderRadius:RADIE.kort,color:atkVal?FARG.text:FARG.text3,...TYP.text,fontWeight:VIKT.halvfet,cursor:atkVal?"pointer":"default",fontFamily:"inherit",opacity:atkVal?1:0.5 }}>
                      Bekräfta val
                    </button>
                  </div>
                )}
              </section>
            );
          })()}

          </>}

          {minTidFlik==='översikt'&&<>
          {/* Övertid året — taket ur avtalet; färgen förstärker ett ord. */}
          <section style={{ marginBottom:AVSTAND.xl }}>
            <h3 style={{ margin:`0 0 ${AVSTAND.s}px`, ...TYP.micro, color:FARG.text2 }}>Övertid {nu.getFullYear()}</h3>
            <div style={KORT}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:AVSTAND.s }}>
                <span style={{ ...TYP.rubrik, ...TNUM, color:FARG.text }}>{årsÖvH.toLocaleString('sv-SE')} tim</span>
                <span style={{ ...TYP.meta, ...TNUM, color:FARG.text2 }}>av {övertidTak} tim</span>
              </div>
              <div style={{ height:AVSTAND.xs, background:FARG.linje, borderRadius:RADIE.rad, overflow:"hidden" }}>
                <div style={{ height:"100%", width:`${Math.min(100, övertidTak > 0 ? årsÖvH/övertidTak*100 : 0)}%`, background:årsFarg, borderRadius:RADIE.rad, transition:`width ${RORELSE.tal}ms ${RORELSE.kurva}` }} />
              </div>
              <p style={{ margin:`${AVSTAND.s}px 0 0`, ...TYP.meta, ...TNUM, color:årsFarg }}>{årsOrd}</p>
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
            // `brott` = ett brott finns i vilobrott-TABELLEN för perioden. Tabellen
            // avgör status; den lokalt räknade vilan visar bara timmarna. Förr kunde
            // kortet lysa grönt medan tabellen hade ett brott i samma fönster.
            const SammanfattningsKort = ({label, vilaH, kravH, saknas, brott}:{label:string;vilaH:number;kravH:number;saknas?:boolean;brott?:boolean}) => {
              const st = brott ? 'brott' : vilaNiva(vilaH, kravH);
              const farg = st==='brott' ? '#ff453a' : st==='nara' ? '#ff9f0a' : '#30d158';
              return (
                <div style={{ background:FARG.kort,borderRadius:RADIE.kort,padding:`${AVSTAND.l}px ${AVSTAND.l}px`,border:`1px solid ${FARG.linje}` }}>
                  <p style={{ margin:`0 0 ${AVSTAND.s}px`,...TYP.meta,color:FARG.text2 }}>{label}</p>
                  {saknas ? (
                    <p style={{ margin:0,...TYP.meta,color:FARG.text2 }}>Ingen vila registrerad än</p>
                  ) : (<>
                    <p style={{ margin:0,...TYP.rubrik,fontWeight:VIKT.fet,color:FARG.text,...TNUM }}>{fmtStor(vilaH)}</p>
                    <p style={{ margin:`${AVSTAND.s}px 0 0`,...TYP.meta,fontWeight:VIKT.halvfet,color:farg,display:"flex",alignItems:"center",gap:AVSTAND.xs }}>
                      <span className="material-symbols-outlined" style={{ fontSize:IKON.text }}>{st==='brott'?'warning':'check'}</span>
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
                  style={{ background:FARG.kort,borderRadius:RADIE.kort,padding:`${AVSTAND.l}px ${AVSTAND.l}px`,marginBottom:AVSTAND.s,border:`1px solid ${ok?FARG.linje:FARG.upphojt}`,cursor: b ? "pointer" : "default" }}>
                  <p style={{ margin:`0 0 ${AVSTAND.s}px`,...TYP.listtitel,color:FARG.text,textTransform:"capitalize" }}>{fD(d1)}</p>
                  <p style={{ margin:`0 0 ${AVSTAND.xs}px`,...TYP.meta,color:FARG.text2 }}>Slutade kl {r.slutTid}</p>
                  <p style={{ margin:`0 0 ${AVSTAND.m}px`,...TYP.meta,color:FARG.text2 }}>Startade igen: <span style={{ textTransform:"capitalize" }}>{fD(d2)}</span> kl {r.startTid}</p>
                  <div style={{ display:"flex",alignItems:"center",gap:AVSTAND.s }}>
                    {!ok&&<span className="material-symbols-outlined" style={{ color:FARG.rod,fontSize:IKON.text }}>warning</span>}
                    <span style={{ ...TYP.meta,fontWeight:VIKT.halvfet,color:ok?FARG.gron:FARG.rod,...TNUM }}>Dygnsvila: {fmtVilaH(r.vila)}</span>
                    {ok&&<span className="material-symbols-outlined" style={{ color:FARG.gron,fontSize:IKON.text }}>check</span>}
                    {!ok&&<span style={{ ...TYP.meta,color:FARG.rod }}>(kräver {krav_h}h)</span>}
                  </div>
                  {r.anledning&&<p style={{ margin:`${AVSTAND.s}px 0 0`,...TYP.meta,color:FARG.text2 }}>{r.anledning}</p>}
                  {expanderad && b && (
                    <div style={{ marginTop:AVSTAND.m,paddingTop:AVSTAND.m,borderTop:`1px solid ${FARG.linje}` }}>
                      {b.besvarat_av_forare ? (
                        <p style={{ margin:0,...TYP.meta,color:FARG.text2 }}>
                          Besvarat: {orsakLabel(b.orsak)}{b.orsak_fritext ? ` · ${b.orsak_fritext}` : ''}
                          {b.kompensation_h != null && ` · ${Number(b.kompensation_h)}h kompensation${b.kompensation_uttagen ? ' (uttagen)' : ''}`}
                        </p>
                      ) : (
                        <p style={{ margin:0,...TYP.meta,color:FARG.orange }}>Inte besvarat — bekräfta dagen för att ange orsak</p>
                      )}
                    </div>
                  )}
                </div>
              );
            };

            return (<>
            {/* Sammanfattning: faktiska siffror — föraren ser SIN vila, inte bara "uppfylld" */}
            <section style={{ marginBottom:AVSTAND.xl }}>
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:AVSTAND.m }}>
                <SammanfattningsKort label="Senaste dygnsvila" vilaH={senasteVilaRad?.vila ?? 0} kravH={krav_h} saknas={!senasteVilaRad} brott={!!senasteVilaRad && !!brottForRad(senasteVilaRad)} />
                <SammanfattningsKort label={`Veckovila (${veckoFonsterDagar} dagar)`} vilaH={veckoLangstaH} kravH={veckoKravH} saknas={!harVeckoData} brott={vvHarProblem} />
              </div>
            </section>

            {/* Dygnsvila */}
            <section style={{ marginBottom:AVSTAND.xl }}>
              <h3 style={{ margin:`0 0 ${AVSTAND.s}px`, ...TYP.micro, color:FARG.text2 }}>Dygnsvila</h3>
              <div style={{ display:"flex",gap:0,marginBottom:AVSTAND.l,background:FARG.linje,borderRadius:RADIE.rad,padding:AVSTAND.xs }}>
                {([['7d','7 dagar'],['30d','30 dagar'],['månad','Månad'],['år','År']] as const).map(([k,l])=>(
                  <button key={k} onClick={()=>{setVilaPeriod(k);setVisaAllaDygnsvila(false);}} style={{ flex:1,padding:`${AVSTAND.s}px 0`,borderRadius:RADIE.rad,border:"none",...TYP.meta,fontWeight:VIKT.halvfet,cursor:"pointer",fontFamily:"inherit",background:vilaPeriod===k?FARG.fyllning:"transparent",color:vilaPeriod===k?FARG.text:FARG.text2 }}>{l}</button>
                ))}
              </div>
              {vilaPeriod==='månad'&&(
                <div style={{ display:"flex",alignItems:"center",justifyContent:"center",gap:AVSTAND.l,marginBottom:AVSTAND.l }}>
                  <button onClick={()=>setVilaMånad(m=>(m-1+12)%12)} style={{ background:"none",border:"none",cursor:"pointer",padding:AVSTAND.xs }}><span className="material-symbols-outlined" style={{ color:FARG.bla,fontSize:IKON.rad }}>chevron_left</span></button>
                  <span style={{ ...TYP.listtitel,color:FARG.text,minWidth:120,textAlign:"center",textTransform:"capitalize" }}>{periodLabel}</span>
                  <button onClick={()=>setVilaMånad(m=>(m+1)%12)} style={{ background:"none",border:"none",cursor:"pointer",padding:AVSTAND.xs }}><span className="material-symbols-outlined" style={{ color:FARG.bla,fontSize:IKON.rad }}>chevron_right</span></button>
                </div>
              )}

              {/* Default: kompakt eller problem */}
              {!visaAllaDygnsvila&&vilaPeriod!=='år'?(
                <div style={{ background:FARG.kort,borderRadius:RADIE.kort,padding:`${AVSTAND.xs}px ${AVSTAND.xl}px`,border:`1px solid ${FARG.linje}` }}>
                  {!harProblem?(
                    <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:`${AVSTAND.l}px 0` }}>
                      {/* Siffrorna bor i sammanfattnings-korten ovanför — här bara vägen till detaljerna */}
                      <span style={{ ...TYP.meta,color:FARG.text2,...TNUM }}>{filtVila.length} {filtVila.length===1?'viloperiod':'viloperioder'} {periodLabel}</span>
                      <button onClick={()=>setVisaAllaDygnsvila(true)} style={{ background:"none",border:"none",color:FARG.bla,...TYP.meta,fontWeight:VIKT.normal,cursor:"pointer",fontFamily:"inherit",padding:0 }}>Se alla nätter →</button>
                    </div>
                  ):(
                    <>
                      {brott.map((r,i)=><VilaKort key={i} r={r} />)}
                      <div style={{ padding:`${AVSTAND.m}px 0 ${AVSTAND.l}px`,borderTop:`1px solid ${FARG.linje}` }}>
                        <button onClick={()=>setVisaAllaDygnsvila(true)} style={{ background:"none",border:"none",color:FARG.bla,...TYP.meta,fontWeight:VIKT.normal,cursor:"pointer",fontFamily:"inherit",padding:0 }}>Se alla {filtVila.length} nätter →</button>
                      </div>
                    </>
                  )}
                </div>
              ):vilaPeriod==='år'?(
                /* Årsvy per månad */
                <div style={{ background:FARG.kort,borderRadius:RADIE.kort,padding:`${AVSTAND.xs}px ${AVSTAND.xl}px`,border:`1px solid ${FARG.linje}` }}>
                  {(()=>{
                    // Brott ur TABELLEN (samma sanning som Dag-vyn och listan ovan) — inte
                    // en lokal jämförelse mot hårdkodade 11 h.
                    const mån=Array.from({length:12},(_,m)=>{const mv=allVila.filter(r=>r.månad===m);return{m,mv,brott:mv.filter(r=>!!brottForRad(r)).length};}).filter(x=>x.mv.length>0);
                    return mån.length===0?<p style={{ padding:`${AVSTAND.l}px 0`,margin:0,...TYP.meta,color:FARG.text2 }}>Ingen data</p>:mån.map((x,i)=>{
                      const nm=['Januari','Februari','Mars','April','Maj','Juni','Juli','Augusti','September','Oktober','November','December'][x.m];
                      const exp=vilaÅrExpand===x.m;
                      return (<div key={x.m}>
                        <div onClick={()=>setVilaÅrExpand(exp?null:x.m)} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:`${AVSTAND.l}px 0`,borderBottom:!exp&&i<mån.length-1?`1px solid ${FARG.linje}`:"none",cursor:"pointer" }}>
                          <span style={{ ...TYP.listtitel }}>{nm}</span>
                          <div style={{ display:"flex",alignItems:"center",gap:AVSTAND.s }}>
                            <span style={{ fontSize:IKON.text,color:x.brott>0?FARG.rod:FARG.text2,display:"inline-flex",alignItems:"center",gap:AVSTAND.xs }}>{x.mv.length} dagar{x.brott>0?` · ${x.brott}`:''}<span className="material-symbols-outlined" style={{ fontSize:IKON.text }}>{x.brott>0?'warning':'check'}</span></span>
                            <span className="material-symbols-outlined" style={{ fontSize:IKON.text,color:FARG.text2,transform:exp?"rotate(180deg)":"",transition:`transform ${RORELSE.byte}ms ${RORELSE.kurva}` }}>expand_more</span>
                          </div>
                        </div>
                        {exp&&<div style={{ padding:`${AVSTAND.s}px 0` }}>{x.mv.map((r,j)=><VilaKort key={j} r={r} />)}</div>}
                      </div>);
                    });
                  })()}
                </div>
              ):(
                /* Expanderad lista med kort */
                <div>
                  {filtVila.length===0?<div style={{ background:FARG.kort,borderRadius:RADIE.kort,padding:`${AVSTAND.l}px ${AVSTAND.xl}px`,border:`1px solid ${FARG.linje}` }}><p style={{ margin:0,...TYP.meta,color:FARG.text2 }}>Ingen data för perioden</p></div>:
                  filtVila.map((r,i)=><VilaKort key={i} r={r} />)}
                  <button onClick={()=>setVisaAllaDygnsvila(false)} style={{ width:"100%",marginTop:AVSTAND.xs,background:"none",border:"none",color:FARG.text2,...TYP.meta,fontWeight:VIKT.normal,cursor:"pointer",fontFamily:"inherit",padding:`${AVSTAND.s}px 0` }}>Dölj detaljer</button>
                </div>
              )}
            </section>

            {/* Veckovila — rullande fönster från DB:n. Inga ISO-vecka-grupperingar. */}
            <section style={{ marginBottom:AVSTAND.xl }}>
              <h3 style={{ margin:`0 0 ${AVSTAND.s}px`, ...TYP.micro, color:FARG.text2 }}>Veckovila</h3>
              {periodLaddar ? (
                <div style={{ background:FARG.kort,borderRadius:RADIE.kort,padding:`${AVSTAND.l}px ${AVSTAND.xl}px`,border:`1px solid ${FARG.linje}` }}>
                  <p style={{ margin:0,...TYP.meta,color:FARG.text2 }}>Laddar viloperioder…</p>
                </div>
              ) : !visaAllaVeckovila?(
                <div style={{ background:FARG.kort,borderRadius:RADIE.kort,padding:`${AVSTAND.xs}px ${AVSTAND.xl}px`,border:`1px solid ${FARG.linje}` }}>
                  <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:`${AVSTAND.l}px 0` }}>
                    {/* Aktuell veckovila-siffra bor i sammanfattnings-kortet ovanför —
                        den här sektionen redovisar BROTT i vald period */}
                    <div style={{ display:"flex",alignItems:"center",gap:AVSTAND.s }}>
                      {vvHarProblem&&<span className="material-symbols-outlined" style={{ fontSize:IKON.text,color:FARG.rod }}>warning</span>}
                      <span style={{ ...TYP.meta,color:vvHarProblem?FARG.text:FARG.text2 }}>{vvHarProblem?`${dbVeck.length} brott mot veckovila`:`Inga brott ${periodLabel}`}</span>
                    </div>
                    {dbVeck.length>0 && <button onClick={()=>setVisaAllaVeckovila(true)} style={{ background:"none",border:"none",color:FARG.bla,...TYP.meta,fontWeight:VIKT.normal,cursor:"pointer",fontFamily:"inherit",padding:0 }}>Visa alla →</button>}
                  </div>
                </div>
              ):(
                <div>
                  {dbVeck.length===0 ? (
                    <div style={{ background:FARG.kort,borderRadius:RADIE.kort,padding:`${AVSTAND.l}px ${AVSTAND.xl}px`,border:`1px solid ${FARG.linje}` }}>
                      <p style={{ margin:0,...TYP.meta,color:FARG.text2 }}>Inga brott i perioden</p>
                    </div>
                  ) : dbVeck.map(b => {
                    const dt = new Date(b.datum);
                    const expanderad = vilaKortExpanded === b.id;
                    return (
                      <div key={b.id}
                        onClick={() => setVilaKortExpanded(expanderad ? null : b.id)}
                        style={{ background:FARG.kort,borderRadius:RADIE.kort,padding:`${AVSTAND.l}px ${AVSTAND.l}px`,marginBottom:AVSTAND.s,border:`1px solid ${FARG.linje}`,cursor:"pointer" }}>
                        <p style={{ margin:`0 0 ${AVSTAND.xs}px`,...TYP.meta,fontWeight:VIKT.halvfet,color:FARG.text,textTransform:"capitalize" }}>{fD(dt)}</p>
                        <p style={{ margin:`0 0 ${AVSTAND.s}px`,...TYP.meta,color:FARG.text2 }}>{b.beskrivning}</p>
                        <div style={{ display:"flex",alignItems:"center",gap:AVSTAND.s }}>
                          <span className="material-symbols-outlined" style={{ color:FARG.rod,fontSize:IKON.text }}>warning</span>
                          <span style={{ ...TYP.meta,fontWeight:VIKT.halvfet,color:FARG.rod,...TNUM }}>Veckovila: {fmtVilaH(Number(b.vila_h))}</span>
                          <span style={{ ...TYP.meta,color:FARG.rod }}>(kräver {Number(b.krav_h)}h)</span>
                        </div>
                        {expanderad && (
                          <div style={{ marginTop:AVSTAND.m,paddingTop:AVSTAND.m,borderTop:`1px solid ${FARG.linje}` }}>
                            {b.besvarat_av_forare ? (
                              <p style={{ margin:0,...TYP.meta,color:FARG.text2 }}>
                                Besvarat: {orsakLabel(b.orsak)}{b.orsak_fritext ? ` · ${b.orsak_fritext}` : ''}
                                {b.kompensation_h != null && ` · ${Number(b.kompensation_h)}h kompensation${b.kompensation_uttagen ? ' (uttagen)' : ''}`}
                              </p>
                            ) : (
                              <p style={{ margin:0,...TYP.meta,color:FARG.orange }}>Inte besvarat — bekräfta dagen för att ange orsak</p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <div style={{ padding:`${AVSTAND.m}px 0 ${AVSTAND.l}px`,borderTop:`1px solid ${FARG.linje}` }}>
                    <button onClick={()=>setVisaAllaVeckovila(false)} style={{ background:"none",border:"none",color:FARG.text2,...TYP.meta,fontWeight:VIKT.normal,cursor:"pointer",fontFamily:"inherit",padding:0 }}>Dölj detaljer</button>
                  </div>
                </div>
              )}
            </section>

            {/* Export + Löneunderlag */}
            <section style={{ paddingTop:AVSTAND.l,borderTop:`1px solid ${FARG.linje}`,display:"flex",flexDirection:"column",gap:AVSTAND.m }}>
              <button onClick={exportPDF} style={{ display:"flex",alignItems:"center",gap:AVSTAND.s,width:"100%",background:"none",border:"none",padding:`${AVSTAND.m}px 0`,cursor:"pointer",fontFamily:"inherit" }}>
                <span className="material-symbols-outlined" style={{ color:FARG.text2,fontSize:IKON.text }}>print</span>
                <span style={{ ...TYP.text,fontWeight:VIKT.normal,color:FARG.text2 }}>Exportera PDF →</span>
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
                <section style={{ marginBottom:AVSTAND.xl }}>
                  <h3 style={{ margin:`0 0 ${AVSTAND.s}px`, ...TYP.micro, color:FARG.text2 }}>Senaste 30 dagarna</h3>
                  <div style={{ background:FARG.kort,borderRadius:RADIE.kort,padding:AVSTAND.xl,border:`1px solid ${FARG.linje}` }}>
                    <p style={{ margin:0,...TYP.rubrik,color:FARG.text,...TNUM }}>{Math.round(totMin/60*10)/10}h <span style={{ ...TYP.meta,color:FARG.text2 }}>extra tid totalt</span></p>
                    <p style={{ margin:`${AVSTAND.s}px 0 0`,...TYP.meta,color:FARG.text2 }}>{senaste30.length} aktiviteter över {arbDagar30} arbetsdagar</p>
                  </div>
                </section>
                {/* Per typ */}
                {stats.length === 0 ? (
                  <Card><p style={{ margin:0,...TYP.meta,color:FARG.text2,textAlign:"center" }}>Ingen extra tid registrerad senaste 30 dagarna</p></Card>
                ) : (
                  <section>
                    <h3 style={{ margin:`0 0 ${AVSTAND.s}px`, ...TYP.micro, color:FARG.text2 }}>Per aktivitet</h3>
                    {stats.map(s => {
                      const pct = Math.round(s.antal/arbDagar30*100);
                      const kallEntries: [string, number][] = Object.entries(s.kall) as [string, number][];
                      const dominantKall = kallEntries.sort((a,b)=>b[1]-a[1])[0];
                      const kallText = dominantKall && dominantKall[1]>0
                        ? (dominantKall[0]==='morgon'?'oftast på morgonen':dominantKall[0]==='kvall'?'oftast på kvällen':'oftast under dagen')
                        : '';
                      return (
                        <Card key={s.typ} style={{ padding:`${AVSTAND.l}px ${AVSTAND.l}px` }}>
                          <div style={{ display:"flex",alignItems:"center",gap:AVSTAND.m,marginBottom:AVSTAND.s }}>
                            <span className="material-symbols-outlined" style={{ color:FARG.bla,fontSize:IKON.rad }}>{aktIcon(s.typ)}</span>
                            <div style={{ flex:1 }}>
                              <p style={{ margin:0,...TYP.listtitel,color:FARG.text }}>{aktLabel(s.typ)}</p>
                              <p style={{ margin:`${AVSTAND.xs}px 0 0`,...TYP.meta,color:FARG.text2 }}>{pct}% av dagarna · snitt {fmt(s.medel)}</p>
                            </div>
                            <span style={{ ...TYP.listtitel,color:FARG.text }}>{Math.round(s.minTot/60*10)/10}h</span>
                          </div>
                          {/* Bar */}
                          <div style={{ height:4,background:FARG.linje,borderRadius:RADIE.rad,overflow:"hidden",marginBottom:AVSTAND.s }}>
                            <div style={{ height:"100%",width:`${Math.min(100,pct)}%`,background:FARG.bla,borderRadius:RADIE.rad }}/>
                          </div>
                          <p style={{ margin:0,...TYP.meta,color:FARG.text2 }}>
                            {s.antal} gånger{s.deb>0?` · ${s.deb} debiterbar${s.deb>1?'a':''}`:''}{kallText?` · ${kallText}`:''}
                          </p>
                        </Card>
                      );
                    })}
                    {/* Stapeldiagram fördelning */}
                    <h3 style={{ margin:`0 0 ${AVSTAND.s}px`, ...TYP.micro, color:FARG.text2,marginTop:AVSTAND.xl }}>Fördelning</h3>
                    <div style={{ background:FARG.kort,borderRadius:RADIE.kort,padding:AVSTAND.xl,border:`1px solid ${FARG.linje}` }}>
                      <div style={{ display:"flex",height:24,borderRadius:RADIE.rad,overflow:"hidden" }}>
                        {stats.map((s,i) => {
                          const w = totMin>0 ? (s.minTot/totMin*100) : 0;
                          const färger = [FARG.bla,FARG.gron,FARG.orange,FARG.rod,FARG.skordare,FARG.skotare];
                          return <div key={s.typ} title={aktLabel(s.typ)} style={{ width:`${w}%`,background:färger[i%färger.length] }}/>;
                        })}
                      </div>
                      <div style={{ display:"flex",flexWrap:"wrap",gap:AVSTAND.s,marginTop:AVSTAND.m }}>
                        {stats.map((s,i) => {
                          const färger = [FARG.bla,FARG.gron,FARG.orange,FARG.rod,FARG.skordare,FARG.skotare];
                          return (
                            <div key={s.typ} style={{ display:"flex",alignItems:"center",gap:AVSTAND.s }}>
                              <div style={{ width:10,height:10,borderRadius:RADIE.rad,background:färger[i%färger.length] }}/>
                              <span style={{ ...TYP.micro,color:FARG.text2 }}>{aktLabel(s.typ)}</span>
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

    // Extra tid-POSTERNA för listan i detaljer. Summan kommer ur specen (extra_h).
    const månadsExtraTid = extraTidData.filter(e => e.datum && e.datum.startsWith(lönePeriod));

    // Månadens summor kommer ur specifikationen (/api/lon/min-manad = samma
    // beräkning som Fortnox-exporten). INGEN lokal månadsberäkning längre —
    // två sanningar om samma månad är precis det som rensats bort. Även
    // dagräkningen och bekräftelse-gaten läser specens dagar; historik är bara
    // reserv tills specen laddat (gaten kräver ändå en laddad spec).
    const spec = minManad.arbetsmanad === lönePeriod && !minManad.laddar ? minManad.data : null;
    const arbetsdagar = spec ? Number(spec.arbetsdagar) : månadsHistorik.length;
    const specLaddar = minManad.arbetsmanad !== lönePeriod || minManad.laddar;
    const specFel = minManad.arbetsmanad === lönePeriod ? minManad.fel : null;
    const jobbadH = spec ? Math.round((Number(spec.timlon_h) + Number(spec.overtid_h)) * 10) / 10 : 0;
    const extraTidH = spec ? Number(spec.extra_h) : 0;
    const totalKm = spec ? (spec.dagar as any[]).reduce((a: number, d: any) => a + (d.km_totalt || 0), 0) : 0;
    const trakDagar = spec ? (spec.dagar as any[]).filter((d: any) => d.traktamente).length : 0;
    const redigeringar = Object.entries(redDagar);

    // Brandrisk-OB: månadens summa kommer ur specen (spec.ob.timmar). Här bara den
    // tysta retroaktiv-listan för obesvarade tidiga vardagsmorgnar — läses ur
    // årsData (hela året) så gamla dagar utanför 60-dagars-historiken också fångas.
    // Ingen nag; ligger kvar med ja/nej tills den besvaras. Bor i "Saknas"-blocket.
    // SAMMA fönster som Dag-vyns väntar-rad: 30 dagar, klippt mot skarp start.
    // Förr räknades hela året här medan Dag-vyn räknade 30 dagar — samma fråga,
    // två svar. Nu en sanning (lib/skarpStart).
    const brandriskFran = franGolv(ymdLokal(new Date(Date.now() - 30 * 86400_000)));
    const obObesDagar = (årsData || []).filter((d: any) => d.datum && d.datum >= brandriskFran && d.brandrisk_beordrad == null && arTidigVardag({ datum: d.datum, start_tid: d.start_tid, brandrisk_beordrad: null }))
      .sort((a: any, b: any) => b.datum.localeCompare(a.datum));
    const svaraBrandriskRetro = async (d: any, val: boolean) => {
      if (!d.id) return;
      const res = await uppdateraVerifierat(supabase, 'arbetsdag', { brandrisk_beordrad: val }, { id: d.id });
      if (!res.ok) { alert(res.fel); return; }
      setÅrsData(a => a.map((x: any) => x.datum === d.datum ? { ...x, brandrisk_beordrad: val } : x));
      setHistorik(h => h.map((x: any) => x.datum === d.datum ? { ...x, brandrisk_beordrad: val } : x));
      setDagData(dd => ({ ...dd, [d.datum]: { ...(dd[d.datum] || {}), brandrisk_beordrad: val } }));
    };

    // Frånvaro per dagtyp (rad visas bara om typen förekommer)
    const FRANVARO_TYPER: [string,string][] = [['sjuk','Sjukfrånvaro'],['vab','VAB'],['foraldraledig','Föräldraledig'],['semester','Semester'],['atk','ATK']];
    const frånvaroRader = FRANVARO_TYPER
      .map(([typ,label]) => [label, månadsHistorik.filter(d => d.dagtyp === typ).length] as [string,number])
      .filter(([,n]) => n > 0);

    // Bekräftelse-gaten — själva poängen med kontrollsteget: ALLA dagar måste
    // vara bekräftade innan månaden kan godkännas. Ingen "skicka ändå" — lön
    // är för viktigt för halvgranskad rådata. Räknas ur specens dagar — samma
    // tal som visas, samma tal som styr knappen.
    const obekräftadeDagar = spec
      ? (spec.dagar as any[]).filter((d: any) => !d.bekraftad).length
      : månadsHistorik.filter(d => !d.bekraftad).length;

    const periodStatus = lönStatusPerPeriod[lönePeriod] || null;
    const ärGodkänd = !!periodStatus;
    // Godkännandet skriver månadens summor — de måste komma ur en laddad spec.
    const kanGodkänna = arbetsdagar > 0 && obekräftadeDagar === 0 && !ärGodkänd && !!spec;

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
    // ISO-vecka — EN definition i hela appen (lib/vilobrott isoVecka).
    const veckoNrFör = (datum: string) => isoVecka(new Date(datum + 'T00:00:00')).vecka;
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

    const bottomNav = <BottomNavBar aktiv="lön" onNav={s=>setSteg(s)} />;

    // ─── DETALJER-VY ───
    if(lönVy==='detaljer') {
      const dagNamn = ['söndag','måndag','tisdag','onsdag','torsdag','fredag','lördag'];
      const månNamn = ['jan','feb','mar','apr','maj','jun','jul','aug','sep','okt','nov','dec'];
      return (
        <div style={{ minHeight:"100vh",background:FARG.bg,color:FARG.text,fontFamily:FONT,WebkitFontSmoothing:"antialiased" }}>
          <style>{css}</style>{timerBanner}
          <header style={{ position:"fixed",top:HEADER_TOP,width:"100%",zIndex:50,background:"rgba(0,0,0,0.8)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",display:"flex",alignItems:"center",padding:`0 ${AVSTAND.l}px`,height:64 }}>
            <button onClick={()=>setLönVy('översikt')} style={{ background:"none",border:"none",cursor:"pointer",padding:`${AVSTAND.s}px ${AVSTAND.m}px ${AVSTAND.s}px ${AVSTAND.s}px`,fontFamily:"inherit",display:"flex",alignItems:"center",gap:AVSTAND.xs }}>
              <span className="material-symbols-outlined" style={{ color:FARG.bla,fontSize:IKON.rad }}>chevron_left</span>
              <span style={{ color:FARG.bla,...TYP.text,fontWeight:VIKT.normal }}>Sammanställning</span>
            </button>
            <div style={{ flex:1,display:"flex",alignItems:"center",justifyContent:"flex-end",gap:AVSTAND.s }}>
              <button onClick={stegLönBak} disabled={!kanLönBak} style={{ background:"none",border:"none",cursor:kanLönBak?"pointer":"default",padding:AVSTAND.xs,opacity:kanLönBak?1:0.3 }}>
                <span className="material-symbols-outlined" style={{ color:FARG.bla,fontSize:IKON.rad }}>chevron_left</span>
              </button>
              <span style={{ ...TYP.listtitel,color:FARG.text,textTransform:"capitalize" }}>{lönMånadsLabel}</span>
              <button onClick={stegLönFram} disabled={!kanLönFram} style={{ background:"none",border:"none",cursor:kanLönFram?"pointer":"default",padding:AVSTAND.xs,opacity:kanLönFram?1:0.3 }}>
                <span className="material-symbols-outlined" style={{ color:FARG.bla,fontSize:IKON.rad }}>chevron_right</span>
              </button>
            </div>
          </header>

          <main style={{ paddingTop:AVSTAND.xxl,paddingBottom:AVSTAND.xxl,padding:`${AVSTAND.xxl}px ${AVSTAND.l}px ${AVSTAND.xxl}px`,maxWidth:640,margin:"0 auto" }}>

            {/* Brandrisk-retroraden bor numera i Sammanställningens "Saknas"-block. */}

            {/* Timmar per vecka — veckan som hjälte, staplar visar dagsrytmen */}
            <section style={{ marginBottom:AVSTAND.xxl }}>
              <h2 style={{ margin:`0 0 ${AVSTAND.s}px`, ...TYP.micro, color:FARG.text2,marginBottom:AVSTAND.l,marginLeft:AVSTAND.xs }}>Timmar per vecka</h2>
              <div style={{ display:"flex",flexDirection:"column",gap:AVSTAND.l }}>
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
                    <div key={weekNum} style={{ background:FARG.kort,borderRadius:RADIE.kort,padding:AVSTAND.xl }}>
                      {/* Veckan som hjälte: micro-label + stor totalsiffra, dagarna lugna under */}
                      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:AVSTAND.l }}>
                        <div>
                          <p style={{ margin:`0 0 ${AVSTAND.xs}px`,...TYP.micro,color:FARG.text2 }}>Vecka {weekNum}</p>
                          <p style={{ margin:0,...TYP.meta,color:FARG.text3,...TNUM }}>{rangeStr}</p>
                        </div>
                        <div style={{ display:"flex",alignItems:"baseline",gap:AVSTAND.xs }}>
                          <span style={{ ...TYP.rubrik,fontWeight:VIKT.fet,color:FARG.text,...TNUM }}>{fmtTim(week.sumH)}</span>
                          <span style={{ ...TYP.meta,color:FARG.text2 }}>tim</span>
                        </div>
                      </div>
                      <div style={{ display:"flex",flexDirection:"column",gap:AVSTAND.m }}>
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
                            <div key={dag.datum} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:`${AVSTAND.s}px 0`,borderBottom:`1px solid ${FARG.linje}` }}>
                              <span style={{ ...TYP.meta,color:FARG.rod }}>{dagLabel} · {dag.rödDag}</span>
                              <span style={{ ...TYP.meta,color:FARG.text3 }}>—</span>
                            </div>
                          );}
                          return (
                            <div key={dag.datum} style={{ padding:`${AVSTAND.s}px 0`,borderBottom:`1px solid ${FARG.linje}` }}>
                              <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:AVSTAND.s }}>
                                <span style={{ ...TYP.meta,color:rödNamn?FARG.rod:undefined }}>{dagLabel}{rödNamn?` · ${rödNamn}`:''}</span>
                                <span style={{ ...TYP.listtitel,...TNUM }}>{fmtTim(h)} tim</span>
                              </div>
                              {/* Delad stapel: mörk grön = maskinarbete, ljus grön = extra tid.
                                  Dag utan extra = bara mörk. Skalad mot veckans längsta dag (totalt). */}
                              <div style={{ height:4,borderRadius:RADIE.rad,background:FARG.linje,overflow:"hidden",display:"flex" }}>
                                {dag.min>0&&<div style={{ height:"100%",background:FARG.gron,width:`${Math.round(dag.min/maxMin*100)}%` }} />}
                                {dag.extraMin>0&&<div style={{ height:"100%",background:FARG.gron,width:`${Math.round(dag.extraMin/maxMin*100)}%` }} />}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                  });
                })()}
                {sortedWeeks.length===0&&<p style={{ color:FARG.text2,...TYP.meta,padding:AVSTAND.xl }}>Ingen data för perioden</p>}
                {/* Förklaringsrad för delade staplar */}
                {sortedWeeks.length>0&&(
                  <div style={{ display:"flex",gap:AVSTAND.l,padding:`${AVSTAND.xs}px ${AVSTAND.xs}px 0` }}>
                    <span style={{ display:"inline-flex",alignItems:"center",gap:AVSTAND.s,...TYP.meta,color:FARG.text2 }}>
                      <span style={{ width:10,height:4,borderRadius:RADIE.rad,background:FARG.gron }} />Maskinarbete
                    </span>
                    <span style={{ display:"inline-flex",alignItems:"center",gap:AVSTAND.s,...TYP.meta,color:FARG.text2 }}>
                      <span style={{ width:10,height:4,borderRadius:RADIE.rad,background:FARG.gron }} />Extra tid
                    </span>
                  </div>
                )}
              </div>
            </section>

            {/* Körning-kortet är borta: milen står redan som löneart 821 i "Går till
                lönen" (med förklaringen som underrad) och per dag i Dag för dag. */}

            {/* Objekt denna månad — objektnamnet störst (det man känner igen),
                dagarna som tal, stapel visar fördelningen, maskinen lugn underrad */}
            <section>
              <h2 style={{ margin:`0 0 ${AVSTAND.s}px`, ...TYP.micro, color:FARG.text2,marginBottom:AVSTAND.l,marginLeft:AVSTAND.xs }}>Objekt denna månad</h2>
              <div style={{ display:"flex",flexDirection:"column",gap:AVSTAND.m }}>
                {(()=>{
                  const maxDagar = Math.max(...objektEntries.map(o=>o.dagar), 1);
                  return objektEntries.map((o,i) => (
                    <div key={i} style={{ background:FARG.kort,borderRadius:RADIE.kort,padding:`${AVSTAND.l}px ${AVSTAND.l}px` }}>
                      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"baseline",gap:AVSTAND.m,marginBottom:AVSTAND.s }}>
                        <p style={{ margin:0,...TYP.listtitel,color:FARG.text,minWidth:0 }}>{o.namn || (maskinNamnMap[o.maskinId] || o.maskinId)}</p>
                        <p style={{ margin:0,flexShrink:0 }}>
                          <span style={{ ...TYP.text,fontWeight:VIKT.fet,color:FARG.text,...TNUM }}>{o.dagar}</span>
                          <span style={{ ...TYP.meta,color:FARG.text2,marginLeft:AVSTAND.xs }}>{o.dagar===1?'dag':'dagar'}</span>
                        </p>
                      </div>
                      {/* Stapel: objektets dagar relativt objektet med flest */}
                      <div style={{ height:4,borderRadius:RADIE.rad,background:FARG.linje,overflow:"hidden" }}>
                        <div style={{ height:"100%",borderRadius:RADIE.rad,background:FARG.gron,width:`${Math.round(o.dagar/maxDagar*100)}%` }} />
                      </div>
                      {o.namn && <p style={{ margin:`${AVSTAND.s}px 0 0`,...TYP.meta,color:FARG.text2,...TNUM }}>{o.maskinId}</p>}
                    </div>
                  ));
                })()}
                {objektEntries.length===0&&<p style={{ color:FARG.text2,...TYP.meta,padding:AVSTAND.xl }}>Inga objekt denna månad</p>}
              </div>
            </section>

            {/* Extra tid — arbetstid UTANFÖR maskinen: när maskindatorn är av
                registrerar MOM inget, så tiden läggs in manuellt för att ge lön.
                En del kan dessutom faktureras. INGA kronor — Fortnox räknar belopp. */}
            <section style={{ margin:`${AVSTAND.xxl}px 0` }}>
              <h2 style={{ margin:`0 0 ${AVSTAND.s}px`, ...TYP.micro, color:FARG.text2,marginBottom:AVSTAND.l,marginLeft:AVSTAND.xs }}>Extra tid</h2>
              {månadsExtraTid.length===0 ? (
                <div style={{ background:FARG.kort,borderRadius:RADIE.kort,padding:`${AVSTAND.l}px ${AVSTAND.xl}px` }}>
                  <p style={{ margin:0,...TYP.meta,color:FARG.text2 }}>Ingen extra tid registrerad denna månad</p>
                </div>
              ) : (()=>{
                const fmtTid = (min:number) => { const h=Math.floor(min/60), m=min%60; return h>0?`${h} tim${m>0?` ${m} min`:''}`:`${m} min`; };
                const fmtDecKomma = (min:number) => (Math.round(min/60*10)/10).toString().replace('.',',');
                const fakturerbarMin = månadsExtraTid.filter(e=>e.debiterbar).reduce((a,e)=>a+(e.minuter||0),0);
                const poster = [...månadsExtraTid].sort((a,b)=>(b.datum||'').localeCompare(a.datum||''));
                const aktNamn = (e:any) => e.aktivitet_text || (e.aktivitet_typ ? aktLabel(e.aktivitet_typ) : null) || e.kommentar || 'Extra arbete';
                return (
                <div style={{ background:FARG.kort,borderRadius:RADIE.kort,padding:`${AVSTAND.xs}px ${AVSTAND.xl}px` }}>
                  {/* Hjälte: får jag lön för all min tid? */}
                  {/* Hjälten läser SPECEN (extra_h) — samma tal som "varav extra tid" på översikten. */}
                  <div style={{ textAlign:"center",padding:`${AVSTAND.l}px 0 ${AVSTAND.l}px`,borderBottom:`1px solid ${FARG.linje}` }}>
                    <p style={{ margin:0,...TYP.tal,color:FARG.text,...TNUM }}>{extraTidH.toLocaleString('sv-SE')} <span style={{ ...TYP.rubrik,color:FARG.text2,fontWeight:VIKT.halvfet }}>tim</span></p>
                    <p style={{ margin:`${AVSTAND.s}px 0 0`,...TYP.meta,color:FARG.text2 }}>arbete när maskinen var avstängd</p>
                  </div>
                  {/* Stödrad: arbetsgivarfrågan — vad kan faktureras? */}
                  <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:`${AVSTAND.l}px 0`,borderBottom:`1px solid ${FARG.linje}` }}>
                    <span style={{ ...TYP.text,color:FARG.text }}>Varav fakturerbart</span>
                    <span style={{ ...TYP.listtitel,color:fakturerbarMin>0?FARG.gron:FARG.text2,...TNUM }}>{fmtDecKomma(fakturerbarMin)} tim</span>
                  </div>
                  {/* Poster — grön prick = fakturerbar */}
                  {poster.map((e,i)=>(
                    <div key={e.id||i} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",gap:AVSTAND.m,padding:`${AVSTAND.m}px 0`,borderBottom:i<poster.length-1?`1px solid ${FARG.linje}`:"none" }}>
                      <div style={{ display:"flex",alignItems:"center",gap:AVSTAND.s,minWidth:0,flex:1 }}>
                        {e.debiterbar&&<span style={{ width:7,height:7,borderRadius:RADIE.cirkel,background:FARG.gron,flexShrink:0 }} />}
                        <div style={{ minWidth:0 }}>
                          <p style={{ margin:0,...TYP.meta,color:FARG.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{aktNamn(e)}</p>
                          <p style={{ margin:`${AVSTAND.xs}px 0 0`,...TYP.micro,color:FARG.text3,...TNUM }}>{e.datum}</p>
                        </div>
                      </div>
                      <span style={{ ...TYP.listtitel,color:FARG.text,flexShrink:0,...TNUM }}>{fmtTid(e.minuter||0)}</span>
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
      <div style={{ minHeight:"100vh",background:FARG.bg,color:FARG.text,fontFamily:FONT,WebkitFontSmoothing:"antialiased",display:"flex",flexDirection:"column" }}>
        <style>{css}</style>{timerBanner}

        {/* Header */}
        {/* Header: månad + pilar (44 px, blå = navigerar). Kalenderikonen som inte
            gick att trycka på är borta. */}
        <header style={{ position:"fixed", top:HEADER_TOP, width:"100%", zIndex:50, background:"rgba(0,0,0,0.8)", backdropFilter:"blur(20px)", WebkitBackdropFilter:"blur(20px)", display:"flex", justifyContent:"center", alignItems:"center", padding:`0 ${AVSTAND.sidmarginal}px`, height:64 }}>
          <div style={{ display:"flex", alignItems:"center", gap:AVSTAND.s }}>
            <button onClick={stegLönBak} disabled={!kanLönBak} style={{ ...KNAPP.lank, width:TRAFFYTA.min, justifyContent:"center", ...(kanLönBak ? {} : INAKTIV) }}>
              <span className="material-symbols-outlined" style={{ fontSize:IKON.rad }}>chevron_left</span>
            </button>
            <h1 style={{ margin:0, ...TYP.listtitel, color:FARG.text, textTransform:"capitalize", minWidth:120, textAlign:"center" }}>{lönMånadsLabel}</h1>
            <button onClick={stegLönFram} disabled={!kanLönFram} style={{ ...KNAPP.lank, width:TRAFFYTA.min, justifyContent:"center", ...(kanLönFram ? {} : INAKTIV) }}>
              <span className="material-symbols-outlined" style={{ fontSize:IKON.rad }}>chevron_right</span>
            </button>
          </div>
        </header>

        <main style={{ paddingTop:AVSTAND.xxl,paddingBottom:AVSTAND.xxl,padding:`${AVSTAND.xxl}px ${AVSTAND.l}px ${AVSTAND.xxl}px`,maxWidth:448,margin:"0 auto",width:"100%" }}>

          {/* TIDSSPECIFIKATION — exakt det som går till lönen, ur SAMMA beräkning som
              Fortnox-exporten (/api/lon/min-manad). MÄNGDER, aldrig kronor: föraren
              kontrollerar timmar och mil mot sitt lönebesked, Fortnox äger satserna. */}
          {ärGodkänd && (
            <div style={{ display:"flex",justifyContent:"center",marginBottom:AVSTAND.m }}>
              <span style={{ display:"inline-flex",alignItems:"center",gap:AVSTAND.xs,padding:`${AVSTAND.xs}px ${AVSTAND.m}px`,borderRadius:RADIE.kort,background:FARG.upphojt,color:FARG.gron,...TYP.meta,fontWeight:VIKT.halvfet,border:`1px solid ${FARG.linje}` }}>
                <span className="material-symbols-outlined" style={{ fontSize:IKON.text }}>check</span>
                Godkänd
              </span>
            </div>
          )}

          {specFel && (
            <div style={{ background:FARG.upphojt,border:`1px solid ${FARG.linje}`,borderRadius:RADIE.kort,padding:`${AVSTAND.m}px ${AVSTAND.l}px`,marginBottom:AVSTAND.l }}>
              <p style={{ margin:0,...TYP.meta,color:FARG.rod }}>Kunde inte läsa tidsspecifikationen: {specFel}</p>
            </div>
          )}
          {specLaddar && !specFel && (
            <div style={{ background:FARG.kort,borderRadius:RADIE.kort,padding:`${AVSTAND.l}px ${AVSTAND.xl}px`,marginBottom:AVSTAND.l }}>
              <p style={{ margin:0,...TYP.meta,color:FARG.text2 }}>Räknar månaden…</p>
            </div>
          )}

          {spec && (() => {
            const dagNamnKort = ['sön','mån','tis','ons','tor','fre','lör'];
            const fmtHm = (min: number) => { const h = Math.floor(min/60), mm = min%60; return mm ? `${h}:${String(mm).padStart(2,'0')}` : `${h}:00`; };
            const ovrigaVarn: string[] = (spec.varningar || []).filter((v: string) => !/saknar typ|ej bekräftade/i.test(v));
            const harSaknas = obekräftadeDagar > 0 || obObesDagar.length > 0 || (spec.synk?.length ?? 0) > 0 || (spec.ledighetskollision?.length ?? 0) > 0 || (spec.maskin_utan_typ?.length ?? 0) > 0 || ovrigaVarn.length > 0;
            return (
              <>
                {/* Går till lönen */}
                <section style={{ background:FARG.kort,borderRadius:RADIE.kort,padding:`${AVSTAND.xs}px ${AVSTAND.xl}px`,marginBottom:AVSTAND.l }}>
                  <div style={{ textAlign:"center",padding:`${AVSTAND.l}px 0 ${AVSTAND.l}px`,borderBottom:`1px solid ${FARG.linje}` }}>
                    <p style={{ margin:`0 0 ${AVSTAND.s}px`,...TYP.meta,color:FARG.text2 }}>Går till lönen</p>
                    <p style={{ margin:0,...TYP.tal,color:FARG.text,...TNUM }}>
                      {jobbadH.toLocaleString('sv-SE')} <span style={{ ...TYP.rubrik,color:FARG.text2,fontWeight:VIKT.halvfet }}>tim</span>
                    </p>
                    <p style={{ margin:`${AVSTAND.s}px 0 0`,...TYP.meta,color:FARG.text2,...TNUM }}>
                      {spec.arbetsdagar} arbetsdagar{extraTidH > 0 ? ` · varav extra tid ${extraTidH.toLocaleString('sv-SE')} tim` : ''}
                    </p>
                  </div>
                  {(spec.rader as any[]).map((r: any, i: number, arr: any[]) => (
                    <div key={r.SalaryCode + i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:`${AVSTAND.m}px 0`, borderBottom:`1px solid ${FARG.linje}`, gap:AVSTAND.m }}>
                      <span style={{ ...TYP.text, color:FARG.text }}>
                        {loneartLabel(r.SalaryCode)} <span style={{ ...TYP.micro, color:FARG.text3 }}>{r.SalaryCode}</span>
                        {/* Reseersättning: förklaringen som underrad — förr ett eget kort i detaljer */}
                        {String(r.SalaryCode) === '821' && <span style={{ display:"block", ...TYP.meta, ...TNUM, color:FARG.text2 }}>påbörjade mil över fri pendling {spec.km_grans} km/dag</span>}
                      </span>
                      <span style={{ ...TYP.listtitel, ...TNUM, color:FARG.text, whiteSpace:"nowrap" }}>{fmtMangd(r.Number)} <span style={{ ...TYP.meta, color:FARG.text2 }}>{loneartEnhet(r.SalaryCode)}</span></span>
                    </div>
                  ))}
                  {spec.rader.length === 0 && (
                    <p style={{ margin:0,padding:`${AVSTAND.l}px 0`,...TYP.meta,color:FARG.text2 }}>Inga lönerader den här månaden.</p>
                  )}
                  <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:`${AVSTAND.l}px 0`,gap:AVSTAND.m }}>
                    <span style={{ ...TYP.text,color:FARG.text }}>Brandrisk-OB <span style={{ ...TYP.micro,color:FARG.text3 }}>löneart ej fastställd</span></span>
                    <span style={{ ...TYP.listtitel, ...TNUM, color:spec.ob.timmar > 0 ? FARG.orange : FARG.text2, whiteSpace:"nowrap" }}>{fmtMangd(spec.ob.timmar)} <span style={{ ...TYP.meta, color:FARG.text2 }}>tim</span></span>
                  </div>
                </section>

                {/* De två vanligaste handlingarna DIREKT under talet — förr låg de under
                    en lista på upp till 22 dagar. PDF = sekundär, Se detaljer = länk. */}
                <button type="button"
                  onClick={()=>setSpecPdf({
                    url: `/api/lon/min-manad/pdf?arbetsmanad=${encodeURIComponent(lönePeriod)}`,
                    titel: `Tidsspecifikation ${lönMånadsLabel}`,
                    filnamn: `tidsspecifikation-${lönePeriod}-${(medarbetare?.namn || 'medarbetare').toLowerCase().replace(/[^a-z0-9åäö]+/gi,'-')}.pdf`,
                  })}
                  style={{ ...KNAPP.sekundar, marginBottom:AVSTAND.s }}>
                  <span className="material-symbols-outlined" style={{ fontSize:IKON.text }}>picture_as_pdf</span>
                  Öppna som PDF
                </button>
                <div style={{ display:"flex", justifyContent:"center", marginBottom:AVSTAND.l }}>
                  <button onClick={()=>setLönVy('detaljer')} style={KNAPP.lank}>
                    Se detaljer<span className="material-symbols-outlined" style={{ fontSize:IKON.text }}>chevron_right</span>
                  </button>
                </div>

                {/* Saknas — det föraren själv kan fixa */}
                {harSaknas && (
                  <section style={{ background:FARG.upphojt,border:`1px solid ${FARG.linje}`,borderRadius:RADIE.kort,padding:`${AVSTAND.xs}px ${AVSTAND.l}px`,marginBottom:AVSTAND.l }}>
                    <p style={{ margin:`${AVSTAND.l}px 0 ${AVSTAND.xs}px`,...TYP.micro,color:FARG.orange }}>Saknas — du kan fixa det</p>
                    {obekräftadeDagar > 0 && (
                      <div style={{ padding:`${AVSTAND.m}px 0`,borderBottom:`1px solid ${FARG.linje}` }}>
                        <p style={{ margin:0,...TYP.text,color:FARG.text }}>{obekräftadeDagar} {obekräftadeDagar === 1 ? 'dag är inte bekräftad' : 'dagar är inte bekräftade'}</p>
                        <p style={{ margin:`${AVSTAND.xs}px 0 0`,...TYP.meta,color:FARG.text2 }}>Tiden är med i underlaget men ingen har granskat den. Bekräfta i Kalender.</p>
                      </div>
                    )}
                    {obObesDagar.length > 0 && (
                      <div style={{ padding:`${AVSTAND.m}px 0`,borderBottom:`1px solid ${FARG.linje}` }}>
                        <div onClick={()=>setObRetroÖppen(o=>!o)} style={{ display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer" }}>
                          <p style={{ margin:0,...TYP.text,color:FARG.text }}>{obObesDagar.length} tidig{obObesDagar.length===1?' dag':'a dagar'} väntar på brandrisk-svar</p>
                          <span className="material-symbols-outlined" style={{ fontSize:IKON.rad,color:FARG.text2,transform:obRetroÖppen?"rotate(90deg)":"none",transition:`transform ${RORELSE.byte}ms ${RORELSE.kurva}` }}>chevron_right</span>
                        </div>
                        {obRetroÖppen && obObesDagar.map((d:any, i:number) => (
                          <div key={d.datum} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:`${AVSTAND.m}px 0 0`,gap:AVSTAND.m }}>
                            <span style={{ ...TYP.meta,color:FARG.text,...TNUM }}>{d.datum} · {(d.start_tid||'').slice(0,5)}</span>
                            <div style={{ display:"flex",gap:AVSTAND.s }}>
                              <button onClick={()=>svaraBrandriskRetro(d,true)} style={{ ...KNAPP.sekundar, width:"auto", padding:`0 ${AVSTAND.l}px` }}>Ja</button>
                              <button onClick={()=>svaraBrandriskRetro(d,false)} style={{ ...KNAPP.sekundar, width:"auto", padding:`0 ${AVSTAND.l}px` }}>Nej</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {(spec.synk as any[]).map((s: any, i: number) => (
                      <div key={`syn${i}`} style={{ padding:`${AVSTAND.m}px 0`,borderBottom:`1px solid ${FARG.linje}` }}>
                        <p style={{ margin:0,...TYP.text,color:FARG.text,...TNUM }}>{s.datum}: {s.diff_min} min oförklarad tidsavvikelse</p>
                        <p style={{ margin:`${AVSTAND.xs}px 0 0`,...TYP.meta,color:FARG.text2,...TNUM }}>Du sa {s.bekraftat}, maskinen {s.maskinen}. Öppna dagen i Kalender och förklara.</p>
                      </div>
                    ))}
                    {(spec.ledighetskollision as any[]).map((k: any, i: number) => (
                      <p key={`led${i}`} style={{ margin:0,padding:`${AVSTAND.m}px 0`,...TYP.meta,color:FARG.text,borderBottom:`1px solid ${FARG.linje}`,...TNUM }}>{k.datum}: godkänd ledighet ({k.typ}) och {fmtHm(k.arbetad_min)} arbete samma dag</p>
                    ))}
                    {(spec.maskin_utan_typ as string[]).map((mid: string) => (
                      <p key={mid} style={{ margin:0,padding:`${AVSTAND.m}px 0`,...TYP.meta,color:FARG.rod,borderBottom:`1px solid ${FARG.linje}` }}>Maskin {mid} saknar typ i registret — premielön räknas inte. Säg till Martin.</p>
                    ))}
                    {ovrigaVarn.map((v: string, i: number) => (
                      <p key={`v${i}`} style={{ margin:0,padding:`${AVSTAND.m}px 0`,...TYP.meta,color:FARG.text2 }}>{v}</p>
                    ))}
                    <div style={{ height:8 }} />
                  </section>
                )}

                {/* Dag för dag — tidrapporten */}
                <section style={{ background:FARG.kort,borderRadius:RADIE.kort,padding:`${AVSTAND.xs}px ${AVSTAND.l}px`,marginBottom:AVSTAND.l }}>
                  <p style={{ margin:`${AVSTAND.l}px 0 ${AVSTAND.s}px`,...TYP.micro,color:FARG.text2 }}>Dag för dag</p>
                  {(spec.dagar as any[]).map((d: any, i: number, arr: any[]) => {
                    const dt = new Date(`${d.datum}T12:00:00`);
                    const flagg = !d.bekraftad;
                    return (
                      <div key={d.id} style={{ padding:`${AVSTAND.s}px 0`,borderBottom:i < arr.length-1 ? `1px solid ${FARG.linje}` : "none" }}>
                        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"baseline",gap:AVSTAND.m }}>
                          <span style={{ ...TYP.meta,color:flagg ? FARG.orange : FARG.text,...TNUM }}>{dagNamnKort[dt.getDay()]} {dt.getDate()}/{dt.getMonth()+1} · {(d.start_tid||'').slice(0,5) || '–'}–{(d.slut_tid||'').slice(0,5) || '–'}{d.rast_min != null ? ` · rast ${d.rast_min}` : ''}</span>
                          <span style={{ ...TYP.meta,color:FARG.text,fontWeight:VIKT.halvfet,...TNUM,whiteSpace:"nowrap" }}>{fmtHm(d.arbetad_min)}{d.extra_min ? <span style={{ color:FARG.gron,fontWeight:VIKT.normal }}> +{fmtHm(d.extra_min)}</span> : null}</span>
                        </div>
                        <div style={{ display:"flex",justifyContent:"space-between",gap:AVSTAND.m,marginTop:AVSTAND.xs }}>
                          <span style={{ ...TYP.meta,color:FARG.text2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{(d.objekt as string[]).join(', ') || (d.dagtyp && d.dagtyp !== 'normal' ? d.dagtyp : '—')}</span>
                          <span style={{ ...TYP.meta,color:FARG.text2,whiteSpace:"nowrap",...TNUM }}>
                            {d.ersattningsmil ? `${d.ersattningsmil} mil` : ''}{d.ob_min > 0 ? `${d.ersattningsmil ? ' · ' : ''}OB ${fmtOb(d.ob_min)}` : ''}{flagg ? `${d.ersattningsmil || d.ob_min ? ' · ' : ''}ej bekräftad` : ''}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  {spec.dagar.length === 0 && <p style={{ margin:0,padding:`${AVSTAND.m}px 0 ${AVSTAND.l}px`,...TYP.meta,color:FARG.text2 }}>Inga arbetsdagar den här månaden.</p>}
                  <div style={{ height:6 }} />
                </section>

              </>
            );
          })()}

          {/* Gate-kortet är borta: "N dagar är inte bekräftade — Bekräfta i Kalender"
              står redan i Saknas-blocket, och knappen nedan är ändå inaktiv. */}
          {spec && arbetsdagar === 0 && (
            <div style={{ ...KORT, marginBottom:AVSTAND.l }}>
              <p style={{ margin:0, ...TYP.meta, color:FARG.text2 }}>Inga arbetsdagar den här månaden — inget att skicka.</p>
            </div>
          )}

          {/* Fel */}
          {lönFel&&(
            <div style={{ background:FARG.upphojt,borderRadius:RADIE.kort,padding:`${AVSTAND.m}px ${AVSTAND.l}px`,marginBottom:AVSTAND.l,border:`1px solid ${FARG.linje}` }}>
              <p style={{ margin:0,...TYP.meta,color:FARG.rod }}>{lönFel}</p>
            </div>
          )}

          {/* Action — gaten styr: obekräftade dagar (eller tom månad) = inaktiv knapp */}
          <div style={{ paddingTop:AVSTAND.xl }}>
            {ärGodkänd ? (
              /* Status, inte knapp: grön prick + ordet. Förr en fylld grön 56 px-knapp. */
              <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:AVSTAND.s, minHeight:TRAFFYTA.min }}>
                <span className="material-symbols-outlined" style={{ fontSize:IKON.text, color:FARG.gron }}>check_circle</span>
                <span style={{ ...TYP.listtitel, color:FARG.text }}>Godkänd</span>
              </div>
            ) : (
              /* Skärmens ENDA primära. */
              <button onClick={()=>{ if(kanGodkänna && !lönSparar) setLönBekräfta(true); }} disabled={!kanGodkänna || lönSparar}
                style={{ ...KNAPP.primar, ...(kanGodkänna && !lönSparar ? {} : INAKTIV) }}>
                {lönSparar?"Sparar…":"Godkänn och skicka"}
              </button>
            )}
            <p style={{ textAlign:"center", ...TYP.meta, color:FARG.text2, margin:`${AVSTAND.m}px 0 0` }}>Fortnox räknar lönen — appen skickar bara rådatan</p>
          </div>
        </main>
        {bottomNav}

        {/* Tidsspecifikationen som PDF — in-app läsvy med Dela / spara */}
        {specPdf && <PdfLasare signedUrl={specPdf.url} titel={specPdf.titel} delaFilnamn={specPdf.filnamn} onClose={()=>setSpecPdf(null)} />}

        {/* Bekräftelsedialog innan inskickning */}
        {lönBekräfta && (
          <div onClick={()=>setLönBekräfta(false)} style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:AVSTAND.xl }}>
            <div onClick={e=>e.stopPropagation()} style={{ width:"100%",maxWidth:360,background:FARG.kort,borderRadius:RADIE.kort,padding:`${AVSTAND.xl}px ${AVSTAND.xl}px`,border:`1px solid ${FARG.linje}` }}>
              <p style={{ margin:`0 0 ${AVSTAND.s}px`,...TYP.rubrik,color:FARG.text,textAlign:"center" }}>Godkänn {lönMånadsLabel}?</p>
              <p style={{ margin:`0 0 ${AVSTAND.xl}px`,...TYP.meta,color:FARG.text2,textAlign:"center",lineHeight:1.4 }}>
                Du intygar att månadens tider och dagar stämmer. Sammanställningen låses och lämnas till lönehanteringen. Det går inte att ångra.
              </p>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 2fr", gap:AVSTAND.s }}>
                <button onClick={()=>setLönBekräfta(false)} style={{ ...KNAPP.lank, display:"flex", width:"100%" }}>
                  Avbryt
                </button>
                <button onClick={async ()=>{ setLönBekräfta(false); await godkännMånad(); }} disabled={lönSparar} style={KNAPP.primar}>
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
    // Hemadress sparas VERIFIERAT till DB — tidigare satte den bara lokal state
    // + "Sparat"-toast utan att skriva någonstans (samma #162-bugg som togs bort
    // för Bluetooth-fältet). "Sparat" visas nu bara om raden faktiskt träffades.
    // OBS: km-beräkningen använder hem_lat/hem_lng (koordinater), inte adress-
    // texten — se flaggan om geokodning. Texten sparas ärligt oavsett.
    const autoSave = async (field: 'hem', val: string) => {
      if(field==='hem' && val && val!==hemadress){
        const res = await uppdateraVerifierat(supabase, "medarbetare", { hemadress: val }, { id: medarbetare.id });
        if(!res.ok){ alert(res.fel); return; }
        setHemadress(val);
        setMedarbetare((m:any)=>({ ...m, hemadress: val }));
        setSparatToast(true); setTimeout(()=>setSparatToast(false),2000);
      }
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
            ["Max övertid",`${gsAvtal?.max_overtid_ar??250} tim/år`],
          ]},
          // Kr-satser (övertid, OB, färdmedel, färdtid) borttagna — satser ägs av
          // lönesystemet/Fortnox, inte appen. Färdmedelsersättningen (27,50 kr/mil)
          // skickades dessutom aldrig i exporten = ett löfte systemet inte höll.
          // Km-gränsen är en MÄNGD (km/dag) och står kvar.
          {rubrik:"Färdmedel & färdtid",rader:[
            ["Km-gräns",`${gsAvtal?.km_grans_per_dag??60} km/dag`],
          ]},
          {rubrik:"ATK",rader:[
            ["Avsättning",`${gsAvtal?.atk_procent??3.62}% (uttagsår ${gsAvtal?.atk_period??'2025-2026'})`],
            ["Nästa period",`${gsAvtal?.atk_procent_nasta??3.92}%`],
            ["Ledig tid",`${gsAvtal?.atk_ledig_tim??65.2} tim/år`],
            ["Pension-tillägg","+20%"],
          ]},
          // Traktamente-belopp (kr) borttagna — beloppen ägs av lönesystemet.
          // Föraren markerar hel/halvdag i dagsvyn; kronorna räknas i Fortnox.
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
    // REGEL: EN BERÄKNING SOM VISAS ÄR ETT FÖRSLAG, INTE EN ÄNDRING. BARA NÅGOT
    // FÖRAREN RÖRT GÖR DAGEN SMUTSIG.
    // harÄndrat får därför bara jämföra förarens fält (redStart/redSlut/redRast/
    // redKm/redObjektId) mot databasens rad. Ingenting som räknas fram vid
    // öppning (km-chain, berakna-dag, synk) får skrivas in i de fälten — de
    // landar i redKmBerakning & co och visas som förslag som föraren själv får
    // ta. Bugg 2026-09-09: km-chain skrev sitt tal i redKm → harÄndrat slog
    // till → "Bekräftad kl 15:20" byttes mot "Anledning till ändring" fast
    // föraren bara TITTAT på dagen. Samma mönster som debDefault och de tre
    // km-implementationerna: något beräknat FÖR VISNING togs för något GJORT.
    const harÄndrat = redStart!==redStartOrig||redSlut!==redSlutOrig||redRast!==redRastOrig||redKm!==redKmOrig||(redObjektId&&redObjektId!==(redDag.objekt_id||null));

    // Underskriften för DEN HÄR dagen. Körs via bekraftaMedForcheck — samma
    // för-check (vilobrott → orsak) som Dag-vyns Bekräfta. Förr skrev Redigera
    // under direkt, utan att fråga.
    const skrivUnderRedDag = async (): Promise<boolean> => {
      const nuIso = new Date().toISOString();
      const res = await uppdateraVerifierat(supabase, "arbetsdag",
        { bekraftad: true, bekraftad_tid: nuIso },
        { medarbetare_id: medarbetare.id, datum: redDag.datum });
      if (!res.ok) { setRedFel(res.fel); return false; }
      setRedFel(null);
      setRedDag((d:any) => ({ ...d, bekraftad: true, bekraftad_tid: nuIso }));
      setDagData(dd => ({ ...dd, [redDag.datum]: { ...(dd[redDag.datum]||{}), bekraftad: true, bekraftad_tid: nuIso, status: 'ok' } }));
      if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(120);
      return true;
    };
    // Km ändras på ETT ställe: morgon/kväll-sheeten. (Den gamla "Ändra körning"-
    // vyn med ett totalt-hjul är borttagen — den kunde inte sätta splitten.)
    const öppnaRedKmSheet = () => {
      const harSplit = (redDag.km_morgon||0) > 0 || (redDag.km_kvall||0) > 0;
      const m = harSplit ? (redDag.km_morgon||0) : Math.round(redKm/2);
      const k = harSplit ? (redDag.km_kvall||0)  : redKm - Math.round(redKm/2);
      setRedTmpKmM(m); setRedTmpKmK(k);
      setVisaRedKmSheet(true);
    };
    const tillbakaKnapp = (
      <div style={{ display:"flex", justifyContent:"center" }}>
        <button style={KNAPP.lank} onClick={()=>setSteg("kalender")}>Tillbaka</button>
      </div>
    );
    const bekraftadRad = (tidFmt: string | null) => (
      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:AVSTAND.s, minHeight:TRAFFYTA.min }}>
        <span className="material-symbols-outlined" style={{ fontSize:IKON.text, color:FARG.gron }}>check_circle</span>
        <span style={{ ...TYP.listtitel, ...TNUM, color:FARG.text }}>Bekräftad{tidFmt?` kl ${tidFmt}`:''}</span>
      </div>
    );
    const felRad = redFel ? <p style={{ margin:0, ...TYP.meta, color:FARG.rod, textAlign:"center" }}>{redFel}</p> : null;

    if(redVy==="tid") return (
      <div style={shell}><style>{css}</style>{timerBanner}
        <div style={topBar}><div style={{ display:"flex",alignItems:"center",gap:AVSTAND.l }}><BackBtn onClick={()=>setRedVy("översikt")}/><h1 style={{ margin:0,...TYP.titel }}>Ändra arbetstid</h1></div></div>
        <div style={{ flex:1,overflowY:"auto",paddingTop:AVSTAND.xl }}>

          {/* Start, Slut, Rast — iOS-stil scroll-wheels */}
          <div style={{ background:FARG.kort,borderRadius:RADIE.kort,padding:`${AVSTAND.xl}px ${AVSTAND.l}px`,marginBottom:AVSTAND.l,display:"flex",flexDirection:"column",gap:AVSTAND.l }}>
            <div>
              <span style={{ margin:`0 0 ${AVSTAND.s}px`, ...TYP.micro,display:"block",textAlign:"center",marginBottom:AVSTAND.s,color:redStart!==(redDag.start||"00:00")?FARG.orange:FARG.text2 }}>Start</span>
              <TimePicker value={redStart} onChange={setRedStart}/>
            </div>
            <div style={{ borderTop:`1px solid ${FARG.linje}`,paddingTop:AVSTAND.l }}>
              <span style={{ margin:`0 0 ${AVSTAND.s}px`, ...TYP.micro,display:"block",textAlign:"center",marginBottom:AVSTAND.s,color:redSlut!==(redDag.slut||"00:00")?FARG.orange:FARG.text2 }}>Slut</span>
              <TimePicker value={redSlut} onChange={setRedSlut}/>
            </div>
            <div style={{ borderTop:`1px solid ${FARG.linje}`,paddingTop:AVSTAND.l }}>
              <span style={{ margin:`0 0 ${AVSTAND.s}px`, ...TYP.micro,display:"block",textAlign:"center",marginBottom:AVSTAND.s,color:redRast!==(redDag.rast||0)?FARG.orange:FARG.text2 }}>Rast</span>
              <div style={{ display:"flex",justifyContent:"center",alignItems:"center",gap:AVSTAND.s,marginBottom:AVSTAND.xxl }}>
                <Wheel value={redRast} onChange={setRedRast} min={0} max={120} step={5}/>
                <span style={{ ...TYP.meta,color:FARG.text2,fontWeight:VIKT.halvfet }}>min</span>
              </div>
            </div>
          </div>

          {/* Resultat */}
          <div style={{ textAlign:"center",padding:`${AVSTAND.l}px ${AVSTAND.xl}px`,background:FARG.upphojt,borderRadius:RADIE.kort }}>
            <p style={{ margin:`0 0 ${AVSTAND.xs}px`,...TYP.micro,fontWeight:VIKT.halvfet,color:FARG.text2 }}>Arbetstid</p>
            <p style={{ margin:0,...TYP.tal,color:FARG.gron,...TNUM }}>{fmt(redArbMin)}</p>
          </div>
        </div>
        <div style={{ ...bottom, alignItems:"center" }}><button style={KNAPP.lank} onClick={()=>setRedVy("översikt")}>Klar</button></div>
      </div>
    );

    const månNamnKort = ['jan','feb','mar','apr','maj','jun','jul','aug','sep','okt','nov','dec'];
    const redDatumDisplay = (() => { const p = redDag.datum?.split('-'); if(!p||p.length<3) return redDag.datum; return `${parseInt(p[2])} ${månNamnKort[parseInt(p[1])-1]}`; })();
    const redMånadDisplay = (() => { const p = redDag.datum?.split('-'); if(!p||p.length<2) return ''; const m=parseInt(p[1])-1; const månader=['januari','februari','mars','april','maj','juni','juli','augusti','september','oktober','november','december']; return `${månader[m]} ${p[0]}`; })();
    const tidKort = (t: string|null|undefined) => t ? t.slice(0,5) : '—';
    // BUGG (fixad): en dag som just sparats i Redigera fick förr en egen
    // "Redigerad"-vy (sparade värden + överstrukna MOM-original) UTAN Bekräfta —
    // dagen gick inte att skriva under förrän appen laddats om. Den grenen är
    // borta: en redigerad dag är samma huvudvy som alla andra, och "Spara
    // ändring" byter själv till "Bekräfta dagen" på samma knappplats.

    return (
      <div style={shell}><style>{css}</style>{timerBanner}
        <div style={topBar}>
          <div style={{ display:"flex",alignItems:"center",gap:AVSTAND.l }}>
            <BackBtn onClick={()=>setSteg("kalender")}/>
            <div>
              <p style={{ margin:0,...TYP.meta,color:FARG.text2 }}>{redMånadDisplay}</p>
              <h1 style={{ margin:`${AVSTAND.xs}px 0 0`,...TYP.titel }}>
                {arFranvaroDagtyp(redDag?.dagtyp) ? `${FRANVARO_RUBRIK[redDag.dagtyp]} — ${redDatumDisplay}` : redDatumDisplay}
              </h1>
            </div>
          </div>
        </div>
        {(()=>{
          // Heldagstyp (sjuk/vab/föräldraledig — lib/franvaro) får en minimal vy —
          // ingen arbetstid/körning, bara statusmeddelande + bekräftad-rad.
          if (arFranvaroDagtyp(redDag?.dagtyp)) {
            const bekraftadRedan = !!redDag?.bekraftad;
            const bekraftadTidFmt = redDag?.bekraftad_tid
              ? new Date(redDag.bekraftad_tid).toLocaleTimeString('sv-SE',{hour:'2-digit',minute:'2-digit'})
              : null;
            const meddelande = redDag.dagtyp === 'sjuk'
              ? { icon: 'sick' as string | null, text: 'Krya på dig!' }
              : { icon: null as string | null, text: 'VAB registrerad' };
            return (<>
              <div style={{ flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:`${AVSTAND.xxl}px ${AVSTAND.xl}px` }}>
                {meddelande.icon && (
                  <span className="material-symbols-outlined" style={{ fontSize:IKON.stor,color:FARG.text,marginBottom:AVSTAND.xl }}>{meddelande.icon}</span>
                )}
                <p style={{ margin:0,...TYP.titel,color:FARG.text,textAlign:"center" }}>{meddelande.text}</p>
              </div>
              <div style={bottom}>
                {felRad}
                {bekraftadRedan ? bekraftadRad(bekraftadTidFmt) : (
                  <button style={KNAPP.primar} onClick={()=>bekraftaMedForcheck(redDag.datum, skrivUnderRedDag, "redigera")}>
                    Bekräfta dagen
                  </button>
                )}
                {tillbakaKnapp}
              </div>
            </>);
          }
          const harData = !!(redDag?.start_tid);
          const extraTidForDag = (extraTidData || [])
            .filter((e:any) => e.datum === redDag.datum && e.slut_tid)
            .sort((a:any,b:any) => (a.start_tid||'').localeCompare(b.start_tid||''));
          // Öppna poster (slut_tid saknas) för den här dagen — syns som "Sluttid
          // saknas" i periodlistan så de kan rättas eller tas bort. Det var så de
          // tre föräldralösa null-raderna uppstod: aldrig synliga någonstans.
          const extraOppnaForDag = (extraTidData || [])
            .filter((e:any) => e.datum === (redDag as any).datum && e.start_tid && !e.slut_tid);
          const harExtra = extraTidForDag.length > 0 || extraOppnaForDag.length > 0;
          const prefixFörExtra = (e: any): string => {
            const arbSt = redDag?.start_tid;
            const arbEn = redDag?.slut_tid;
            if (arbSt && e.slut_tid && e.slut_tid <= arbSt) return "Morgon";
            if (arbEn && e.start_tid && e.start_tid >= arbEn) return "Kväll";
            return "Extra";
          };
          return (<>
        <div style={{ flex:1,overflowY:"auto",paddingTop:AVSTAND.s }}>
          {(() => {
            // Maskintiden skiljer sig fran det foraren bekraftade (synk_avvikelse).
            // Fragar bara nar skillnaden i ARBETAD tid >= troskeln. Forarens tider
            // andras ALDRIG av kortet - han valjer VAD tiden som inte var maskin var,
            // vilket blir en extra_tid-post. Kvittensen bor i jsonb-faltet.
            const rd: any = redDag;
            const a = rd?.synk_avvikelse;
            if (!a || a.kvitterad) return null;
            if (segForm?.fromSynk) return null; // synk-formuläret öppet — göm kortet
            const confArb = Math.max(0, tim(a.bekraftad_start, a.bekraftad_slut) - (a.bekraftad_rast_min || 0));
            const momArb  = Math.max(0, tim(a.mom_start, a.mom_slut) - (a.mom_rast_min || 0));
            const delta = confArb - momArb;
            if (delta < SYNK_AVVIKELSE_TROSKEL_MIN) return null;
            const avvDatum = (() => { const _p = String(rd.datum || "").split("-"); return _p.length === 3 ? `${+_p[2]} ${månNamnKort[+_p[1]-1]}` : String(rd.datum || ""); })();
            const vibrera = () => { if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(80); };
            const hoppaÖver = async () => {
              const nyAvv = { ...a, kvitterad: new Date().toISOString(), val: 'hoppad', aktivitet: null };
              const res = await uppdateraVerifierat(supabase, 'arbetsdag', { synk_avvikelse: nyAvv }, { id: rd.id });
              if (!res.ok) { setRedFel(res.fel); return; }
              setRedDag((d:any) => ({ ...d, synk_avvikelse: nyAvv })); vibrera();
            };
            const uppdateraTider = async () => {
              const res = await uppdateraVerifierat(supabase, 'arbetsdag',
                { start_tid: a.mom_start, slut_tid: a.mom_slut, rast_min: a.mom_rast_min, redigerad: true, synk_avvikelse: null },
                { id: rd.id });
              if (!res.ok) { setRedFel(res.fel); return; }
              setRedDag((d:any) => ({ ...d, start_tid: a.mom_start, slut_tid: a.mom_slut, rast_min: a.mom_rast_min, redigerad: true, synk_avvikelse: null }));
              setDagData(dd => ({ ...dd, [rd.datum]: { ...(dd[rd.datum]||{}), start_tid: a.mom_start, slut_tid: a.mom_slut, rast_min: a.mom_rast_min, redigerad: true, synk_avvikelse: null } }));
              setSynkMin(null); vibrera();
            };
            // Var icke-maskintiden fanns — härlett ur avvikelsen (gap före/efter
            // maskinpasset via delade libben). Redan täckta gap (segment finns)
            // filtreras bort så kortet driver dig till nästa omärkta period.
            const gaps = harledGap(a).filter(g =>
              !dagSegment.some((x:any) => x.start_tid.slice(0,5) < g.slut && g.start < x.slut_tid.slice(0,5)));
            const nästaGap = gaps[0];
            return (
              <Card style={{ padding:`${AVSTAND.l}px ${AVSTAND.xl}px`,border:`1px solid ${FARG.linje}`,marginBottom:AVSTAND.l }}>
                <div style={{ display:"flex",alignItems:"center",gap:AVSTAND.s,marginBottom:AVSTAND.l }}>
                  <span className="material-symbols-outlined" style={{ fontSize:IKON.rad,color:FARG.orange }}>schedule</span>
                  <span style={{ margin:`0 0 ${AVSTAND.s}px`, ...TYP.micro,color:FARG.text }}>Maskintiden skiljer sig · {avvDatum}</span>
                </div>
                <div style={{ display:"flex",gap:AVSTAND.m,marginBottom:AVSTAND.l }}>
                  <div style={{ flex:1 }}>
                    <p style={{ margin:`0 0 ${AVSTAND.xs}px`,...TYP.meta,color:FARG.text2 }}>Du sa</p>
                    <p style={{ margin:0,...TYP.meta,color:FARG.text,...TNUM }}>{a.bekraftad_start}-{a.bekraftad_slut}, {a.bekraftad_rast_min} min rast</p>
                    <p style={{ margin:`${AVSTAND.xs}px 0 0`,...TYP.meta,fontWeight:VIKT.fet,color:FARG.gron,...TNUM }}>{fmt(confArb)}</p>
                  </div>
                  <div style={{ flex:1 }}>
                    <p style={{ margin:`0 0 ${AVSTAND.xs}px`,...TYP.meta,color:FARG.text2 }}>Maskinen sager</p>
                    <p style={{ margin:0,...TYP.meta,color:FARG.text,...TNUM }}>{a.mom_start}-{a.mom_slut}, {a.mom_rast_min} min rast</p>
                    <p style={{ margin:`${AVSTAND.xs}px 0 0`,...TYP.meta,fontWeight:VIKT.fet,color:FARG.text2,...TNUM }}>{fmt(momArb)}</p>
                  </div>
                </div>
                {nästaGap ? (<>
                  <p style={{ margin:`0 0 ${AVSTAND.xs}px`,...TYP.text,color:FARG.text }}>
                    Du var inloggad <b style={TNUM}>{nästaGap.start}–{nästaGap.slut}</b> ({fmt(nästaGap.minuter)}) utan att maskinen gick.
                  </p>
                  <p style={{ margin:`0 0 ${AVSTAND.m}px`,...TYP.meta,color:FARG.text2 }}>
                    Tiden är redan betald — märk vad du gjorde så den kan faktureras. Väljer du en aktivitet öppnas perioden ifylld.
                  </p>
                  <div style={{ display:"flex",flexWrap:"wrap",gap:AVSTAND.s,marginBottom:AVSTAND.l }}>
                    {EXTRA_ARBETE_TYPER.map(t => {
                      const akt = AKTIVITETER.find(x=>x.typ===t)!;
                      return (
                        <button key={t} onClick={()=>öppnaSegForm({ gap: nästaGap, typ: t, fromSynk: true })}
                          style={{ display:"flex",alignItems:"center",gap:AVSTAND.s,padding:`${AVSTAND.s}px ${AVSTAND.m}px`,background:FARG.linje,border:"none",borderRadius:RADIE.rad,color:FARG.text,...TYP.meta,cursor:"pointer",fontFamily:"inherit" }}>
                          <span className="material-symbols-outlined" style={{ fontSize:IKON.text }}>{akt.icon}</span>{akt.label}
                        </button>
                      );
                    })}
                  </div>
                </>) : (
                  <p style={{ margin:`0 0 ${AVSTAND.m}px`,...TYP.text,color:FARG.text }}>{fmt(delta)} var inte maskintid.</p>
                )}
                <button onClick={uppdateraTider} style={{ ...KNAPP.tertiar, display:"flex", width:"100%",marginBottom:AVSTAND.s }}>Det var fel — använd maskinens tider</button>
                <button onClick={hoppaÖver} style={{ width:"100%",padding:AVSTAND.m,background:"none",border:"none",color:FARG.text2,...TYP.meta,cursor:"pointer",fontFamily:"inherit" }}>Hoppa över</button>
              </Card>
            );
          })()}
          {(() => {
            // Maskinstart: föraren angav en start > 30 min FÖRE maskinens login
            // (tidigarelagd_start). Tiden ändras ALDRIG — angiven tid styr fortsatt
            // arbetsdag/lön. Kortet frågar bara VAD perioden var → arbetsdag_segment
            // (redan betald, aldrig extra_tid). Kvittensen bor i jsonb-fältet;
            // täcks gapet redan av ett segment (rebuild kan ha nollat kvittensen)
            // göms kortet ändå.
            const rd: any = redDag;
            const tl = rd?.tidigarelagd_start;
            if (!tl || tl.kvitterad) return null;
            if (segForm?.fromTidigarelagd) return null; // formuläret öppet — göm kortet
            const täckt = dagSegment.some((x:any) =>
              x.start_tid.slice(0,5) < tl.maskin_start && tl.angiven_start < x.slut_tid.slice(0,5));
            if (täckt) return null;
            const avvDatum = (() => { const _p = String(rd.datum || "").split("-"); return _p.length === 3 ? `${+_p[2]} ${månNamnKort[+_p[1]-1]}` : String(rd.datum || ""); })();
            const vibrera = () => { if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(80); };
            const hoppaÖver = async () => {
              const nyTL = { ...tl, kvitterad: new Date().toISOString(), val: 'hoppad', aktivitet: null };
              const res = await uppdateraVerifierat(supabase, 'arbetsdag', { tidigarelagd_start: nyTL }, { id: rd.id });
              if (!res.ok) { setRedFel(res.fel); return; }
              setRedDag((d:any) => ({ ...d, tidigarelagd_start: nyTL })); vibrera();
            };
            const gap = { start: tl.angiven_start, slut: tl.maskin_start };
            return (
              <Card style={{ padding:`${AVSTAND.l}px ${AVSTAND.xl}px`,border:`1px solid ${FARG.linje}`,marginBottom:AVSTAND.l }}>
                <div style={{ display:"flex",alignItems:"center",gap:AVSTAND.s,marginBottom:AVSTAND.l }}>
                  <span className="material-symbols-outlined" style={{ fontSize:IKON.rad,color:FARG.orange }}>schedule</span>
                  <span style={{ margin:`0 0 ${AVSTAND.s}px`, ...TYP.micro,color:FARG.text }}>Maskinstart · {avvDatum}</span>
                </div>
                <div style={{ display:"flex",gap:AVSTAND.m,marginBottom:AVSTAND.l }}>
                  <div style={{ flex:1 }}>
                    <p style={{ margin:`0 0 ${AVSTAND.xs}px`,...TYP.meta,color:FARG.text2 }}>Du angav</p>
                    <p style={{ margin:0,...TYP.text,fontWeight:VIKT.fet,color:FARG.text,...TNUM }}>{tl.angiven_start}</p>
                  </div>
                  <div style={{ flex:1 }}>
                    <p style={{ margin:`0 0 ${AVSTAND.xs}px`,...TYP.meta,color:FARG.text2 }}>Maskinen startade</p>
                    <p style={{ margin:0,...TYP.text,fontWeight:VIKT.fet,color:FARG.text,...TNUM }}>{tl.maskin_start}</p>
                  </div>
                </div>
                <p style={{ margin:`0 0 ${AVSTAND.xs}px`,...TYP.text,color:FARG.text }}>
                  Perioden <b style={TNUM}>{tl.angiven_start}–{tl.maskin_start}</b> ({fmt(tl.gap_min)}) ligger i din dag och är redan betald. Vad var den?
                </p>
                <p style={{ margin:`0 0 ${AVSTAND.m}px`,...TYP.meta,color:FARG.text2 }}>
                  Väljer du en aktivitet öppnas perioden ifylld. Du kan markera den som debiterbar.
                </p>
                <div style={{ display:"flex",flexWrap:"wrap",gap:AVSTAND.s,marginBottom:AVSTAND.l }}>
                  {EXTRA_ARBETE_TYPER.map(t => {
                    const akt = AKTIVITETER.find(x=>x.typ===t)!;
                    return (
                      <button key={t} onClick={()=>öppnaSegForm({ gap, typ: t, fromTidigarelagd: true })}
                        style={{ display:"flex",alignItems:"center",gap:AVSTAND.s,padding:`${AVSTAND.s}px ${AVSTAND.m}px`,background:FARG.linje,border:"none",borderRadius:RADIE.rad,color:FARG.text,...TYP.meta,cursor:"pointer",fontFamily:"inherit" }}>
                        <span className="material-symbols-outlined" style={{ fontSize:IKON.text }}>{akt.icon}</span>{akt.label}
                      </button>
                    );
                  })}
                </div>
                <button onClick={hoppaÖver} style={{ width:"100%",padding:AVSTAND.m,background:"none",border:"none",color:FARG.text2,...TYP.meta,cursor:"pointer",fontFamily:"inherit" }}>Hoppa över</button>
              </Card>
            );
          })()}
          {!harData&&redStart==="00:00"&&redSlut==="00:00"&&redRast===0&&!harExtra?(
            <Card style={{ padding:`${AVSTAND.xl}px ${AVSTAND.xl}px`,textAlign:"center" as const }}>
              {/* Ärligt tomt: varken maskinpass eller loggad extra-tid. */}
              <p style={{ margin:`0 0 ${AVSTAND.xs}px`,...TYP.meta,color:FARG.text }}>Ingen data för den här dagen</p>
              <p style={{ margin:0,...TYP.meta,color:FARG.text }}>Lägg till arbetstid och körning manuellt</p>
            </Card>
          ):!harData&&!harExtra?(
            <Card style={{ padding:`${AVSTAND.xs}px ${AVSTAND.xl}px` }}>
              <div onClick={()=>setRedVy("tid")} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:`${AVSTAND.l}px 0`,borderBottom:`1px solid ${FARG.linje}`,cursor:"pointer" }}>
                <span style={{ ...TYP.text,color:FARG.text }}>Arbetstid</span>
                <div style={{ display:"flex",alignItems:"center",gap:AVSTAND.m }}>
                  <span style={{ ...TYP.text,fontWeight:VIKT.halvfet,color:FARG.orange }}>{fmt(redArbMin)}</span>
                  <ChevronRight/>
                </div>
              </div>
              <div onClick={öppnaRedKmSheet} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:`${AVSTAND.l}px 0`,cursor:"pointer" }}>
                <span style={{ ...TYP.text,color:FARG.text }}>Körning</span>
                <div style={{ display:"flex",alignItems:"center",gap:AVSTAND.m }}>
                  <span style={{ ...TYP.text,fontWeight:VIKT.halvfet,color:redKm>0?FARG.orange:FARG.text }}>{redKm} km</span>
                  <ChevronRight/>
                </div>
              </div>
            </Card>
          ):!harData?(
            /* Extra-tid finns men inget maskinpass: konstatera det lugnt —
               säg ALDRIG "ingen data" när den loggade tiden listas nedanför.
               Samma ärlighetsprincip som Saldon-tillstånden. */
            <Card style={{ padding:`${AVSTAND.l}px ${AVSTAND.xl}px`,textAlign:"center" as const }}>
              <p style={{ margin:0,...TYP.meta,color:FARG.text2 }}>Ingen maskindata den här dagen</p>
            </Card>
          ):(
            <Card style={{ padding:`${AVSTAND.xs}px ${AVSTAND.xl}px` }}>
              {/* Hjälte: Total arbetstid — hela blocket klickbart, öppnar Ändra
                  arbetstid (start/slut/rast-hjulen). Ersätter Arbetstid/Rast/Total-
                  raderna; orange stödrad när tiderna ändrats men inte sparats. */}
              <div onClick={()=>setRedVy("tid")} style={{ textAlign:"center",padding:`${AVSTAND.l}px 0 ${AVSTAND.l}px`,cursor:"pointer",borderBottom:`1px solid ${FARG.linje}` }}>
                {/* "Maskinpass" — siffran är passets tid; extra tid listas nedan
                    och dagens total visas som dämpad rad när extra finns */}
                <p style={{ margin:`0 0 ${AVSTAND.s}px`,...TYP.meta,color:FARG.text2 }}>Maskinpass</p>
                <p style={{ margin:0,...TYP.tal,color:FARG.text,...TNUM }}>{fmt(redArbMin)}</p>
                <p style={{ margin:`${AVSTAND.s}px 0 0`,...TYP.meta,color:(redStart!==redStartOrig||redSlut!==redSlutOrig||redRast!==redRastOrig)?FARG.orange:FARG.text2,...TNUM }}>
                  {redStart.slice(0,5)} → {redSlut.slice(0,5)} · rast {redRast} min
                  <span className="material-symbols-outlined" style={{ fontSize:IKON.text,color:FARG.fyllning,verticalAlign:"-2px",marginLeft:AVSTAND.xs }}>chevron_right</span>
                </p>
                <p style={{ margin:`${AVSTAND.s}px 0 0`,...TYP.meta,color:FARG.text3 }}>Rast = tid markerad som Meal break i maskinen</p>
                {(()=>{
                  const exMinDag = extraTidForDag.reduce((a:number,e:any) => a + (e.minuter||0), 0);
                  return exMinDag > 0 ? (
                    <p style={{ margin:`${AVSTAND.s}px 0 0`,...TYP.meta,color:FARG.text2,...TNUM }}>+ {fmt(exMinDag)} extra arbete · totalt {fmt(redArbMin + exMinDag)}</p>
                  ) : null;
                })()}
              </div>
              {/* Maskin — klickbar */}
              <div onClick={()=>setVisaRedMaskinVäljare(true)} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:`${AVSTAND.l}px 0`,borderBottom:`1px solid ${FARG.linje}`,cursor:"pointer" }}>
                <span style={{ ...TYP.text,color:FARG.text }}>Maskin</span>
                <div style={{ display:"flex",alignItems:"center",gap:AVSTAND.m }}>
                  <span style={{ ...TYP.listtitel,color:FARG.text }}>{(()=>{const m=redMaskinId?maskinNamnMap[redMaskinId]:null; return m||redDag.maskin_namn||redDag.maskin_id||"—";})()}</span>
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
                      <div key={o.id} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:`${AVSTAND.l}px 0`,borderBottom:`1px solid ${FARG.linje}` }}>
                        <span style={{ ...TYP.text,color:FARG.text }}>{i === 0 ? "Objekt" : ""}</span>
                        <span style={{ ...TYP.listtitel,color:FARG.text,textAlign:"right" as const }}>
                          {o.objekt_namn || o.objekt_id}
                          <span style={{ color:FARG.text2,...TYP.meta }}>{tidStr}</span>
                        </span>
                      </div>
                    );
                  });
                }
                return (
                  <div onClick={()=>setVisaRedObjektVäljare(true)} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:`${AVSTAND.l}px 0`,borderBottom:`1px solid ${FARG.linje}`,cursor:"pointer" }}>
                    <span style={{ ...TYP.text,color:FARG.text }}>Objekt</span>
                    <div style={{ display:"flex",alignItems:"center",gap:AVSTAND.m }}>
                      <span style={{ ...TYP.listtitel,color:FARG.text }}>{(()=>{const o=redObjektId?objektLista.find(x=>x.id===redObjektId):null; return o?o.namn:(formatObjektNamn(redDag.objekt_namn)||redDag.objekt_id||"—");})()}</span>
                      <ChevronRight/>
                    </div>
                  </div>
                );
              })()}
              {/* Körning — EN rad i huvudkortet, öppnar morgon/kväll-sheeten. Förr ett
                  eget kort med morgon/kväll/totalt/källa/ersättning, plus en "Extra
                  tid N min"-rad här som sa samma sak som periodlistan nedanför. */}
              {(()=>{
                const över = Math.max(0, redKm - frikm);
                const mil  = över>0 ? Math.ceil(över/10) : 0;
                const segs = redKmChain || [];
                // Källmärkning — visa ärligt vad siffran ÄR. Beräknat men inte
                // taget = ett FÖRSLAG föraren själv trycker in; först då blir dagen
                // ändrad (harÄndrat) — aldrig av att den öppnas.
                const forslag = redKmBerakning != null && redKmBerakning > 0 && redKm === 0 && !redKmSaknarKoord;
                const egen = !forslag && redKmBerakning != null && redKm !== redKmBerakning;
                const kalla = forslag ? null
                  : egen ? { text: "Egen uppgift", farg: FARG.text2 }
                  : redKmSaknarKoord ? { text: "Objektet saknar koordinat — går inte att beräkna. Fyll i själv.", farg: FARG.orange }
                  : redKmKälla === 'fallback' ? { text: "Osäker uppskattning (fågelvägen × 1,4) — kontrollera.", farg: FARG.orange }
                  : redKmKälla === 'beraknad' ? { text: `Beräknat vägavstånd${redKmKoordKälla === 'maskin' ? ' från maskinens position' : redKmKoordKälla === 'objekt' ? ' från objektets koordinat' : redKmKoordKälla === 'larm' ? ' från objektets larmkoordinat' : ''}`, farg: FARG.text2 }
                  : null;
                const delar = segs.length >= 2
                  ? segs.map((s, i) => `${i === 0 ? 'Morgon' : i === segs.length-1 ? 'Kväll' : 'Flytt'} ${s.km}`).join(' · ')
                  : null;
                return (
                  <div style={{ borderBottom:(redDag as any).trak?`1px solid ${FARG.linje}`:"none", paddingBottom:(redDag as any).trak?AVSTAND.s:0 }}>
                    <div onClick={öppnaRedKmSheet} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", minHeight:TRAFFYTA.min, padding:`${AVSTAND.m}px 0 ${AVSTAND.xs}px`, cursor:"pointer" }}>
                      <span style={{ ...TYP.text, color:FARG.text }}>Körning</span>
                      <div style={{ display:"flex", alignItems:"center", gap:AVSTAND.s }}>
                        <span style={{ ...TYP.listtitel, ...TNUM, color:FARG.text }}>{redKm} km</span>
                        <ChevronRight/>
                      </div>
                    </div>
                    {forslag && (
                      <button onClick={()=>setRedKm(redKmBerakning)} style={{ ...KNAPP.tertiar, gap:AVSTAND.xs }}>
                        <span className="material-symbols-outlined" style={{ fontSize:IKON.text }}>add</span>
                        <span style={{ ...TNUM }}>Använd beräknat {redKmBerakning} km{redKmKälla === 'fallback' ? ' (osäkert, fågelvägen)' : ' (vägavstånd)'}</span>
                      </button>
                    )}
                    {(delar || kalla || över > 0) && (
                      <p style={{ margin:0, ...TYP.meta, ...TNUM, color:kalla?.farg ?? FARG.text2 }}>
                        {[delar, kalla?.text, över > 0 ? `${mil} påbörjade mil (${över} km över ${frikm})` : null].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </div>
                );
              })()}
              {redDag.trak&&(
                <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:`${AVSTAND.l}px 0` }}>
                  <span style={{ ...TYP.text,color:FARG.text }}>Traktamente</span>
                  <span style={{ ...TYP.text,fontWeight:VIKT.halvfet,color:FARG.text }}>Heldag</span>
                </div>
              )}
            </Card>
          )}

          {/* Perioder utöver maskinen — EN lista, oavsett tabell. Systemet
              avgör: period INOM dagens fönster → arbetsdag_segment (redan
              betald, märks bara). Period UTANFÖR → extra_tid (läggs till, ger
              ersättning). Föraren säger bara "jag gjorde det här mellan de här
              klockslagen" — samma formulär, samma knappar. */}
          {redDag && (harData || dagSegment.length > 0 || harExtra) && (() => {
            const pass = { start_tid: (redDag as any).start_tid || null, slut_tid: (redDag as any).slut_tid || null };
            const perioder: any[] = [
              ...dagSegment.map((sg:any) => ({ kind:'segment', id:sg.id, start:(sg.start_tid||'').slice(0,5), slut:(sg.slut_tid||'').slice(0,5), typ:sg.aktivitet_typ, deb:sg.debiterbar, kommentar:sg.kommentar, kalla:sg.kalla })),
              ...extraTidForDag.map((e:any) => ({ kind:'extra', id:e.id, start:(e.start_tid||'').slice(0,5), slut:(e.slut_tid||'').slice(0,5), typ:e.aktivitet_typ, deb:e.debiterbar, kommentar:e.kommentar, minuter:e.minuter||0, raw:e })),
              ...extraOppnaForDag.map((e:any) => ({ kind:'extra', oppen:true, id:e.id, start:(e.start_tid||'').slice(0,5), slut:'', typ:e.aktivitet_typ, deb:e.debiterbar, kommentar:e.kommentar, minuter:0, raw:e })),
            ].sort((a,b)=>a.start.localeCompare(b.start));
            const antal = perioder.length;
            const öppen = segÖppen || antal > 0;
            const formLage = segForm ? klassificeraPeriod({ start: segForm.start, slut: segForm.slut }, pass) : null;
            const formMin = segForm ? periodMin(segForm.start, segForm.slut) : 0;
            return (
            <div style={{ marginTop:AVSTAND.l }}>
              <Card style={{ padding:`${AVSTAND.xs}px ${AVSTAND.xl}px` }}>
                <div onClick={()=>setSegÖppen(o=>!o)} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:`${AVSTAND.l}px 0`,cursor:"pointer",borderBottom: öppen ? `1px solid ${FARG.linje}` : "none",minHeight:44 }}>
                  <span style={{ ...TYP.text,color:FARG.text }}>Var du iväg en del av dagen?</span>
                  <div style={{ display:"flex",alignItems:"center",gap:AVSTAND.m }}>
                    {antal>0 && <span style={{ ...TYP.meta,color:FARG.orange }}>{antal} st</span>}
                    <span className="material-symbols-outlined" style={{ fontSize:IKON.rad,color:FARG.text2,transform: öppen?"rotate(90deg)":"none",transition:`transform ${RORELSE.byte}ms ${RORELSE.kurva}` }}>chevron_right</span>
                  </div>
                </div>

                {öppen && perioder.map((p:any, i:number) => (
                  <div key={p.kind+p.id}
                    onClick={p.kind==='extra' ? () => oppnaPeriodRedigera(p.raw) : undefined}
                    style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:`${AVSTAND.m}px 0`,borderBottom: (i<antal-1||!!segForm) ? `1px solid ${FARG.linje}` : "none",gap:AVSTAND.m,cursor: p.kind==='extra'?"pointer":"default" }}>
                    <div style={{ minWidth:0 }}>
                      <span style={{ ...TYP.text,color:FARG.text }}>{aktLabel(p.typ)}</span>
                      {p.kind==='extra' && <span style={{ marginLeft:AVSTAND.s,...TYP.meta,fontWeight:VIKT.halvfet,color:FARG.gron,...TNUM }}>+{fmt(p.minuter)}</span>}
                      {p.deb && <span style={{ marginLeft:AVSTAND.s,...TYP.meta,color:FARG.gron }}>faktureras</span>}
                      {p.kind==='segment' && p.kalla==='synk' && <span style={{ marginLeft:AVSTAND.s,...TYP.meta,color:FARG.text2 }}>via maskinavvikelse</span>}
                      <div style={{ ...TYP.meta, color: p.oppen ? FARG.orange : FARG.text2, ...TNUM }}>{p.oppen ? `${p.start} – sluttid saknas · fyll i eller ta bort` : `${p.start}–${p.slut}${p.kind==='extra' ? ' · läggs till' : ''}`}{p.kommentar?` · ${p.kommentar}`:''}</div>
                    </div>
                    {p.kind==='segment'
                      ? <button onClick={()=>taBortSegment(p.id)} style={{ background:"none",border:"none",color:FARG.text2,cursor:"pointer",width:44,height:44,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"inherit",flexShrink:0 }}>
                          <span className="material-symbols-outlined" style={{ fontSize:IKON.rad }}>delete</span>
                        </button>
                      : <ChevronRight/>}
                  </div>
                ))}

                {/* "Lägg till period" öppnar PERIODFORMULÄRET — samma formulär som
                    Dag-vyns Extra arbete och "Lägg till i efterhand". Det inbäddade
                    segmentformuläret är borta: ett formulär, tre ingångar. */}
                {öppen && (
                  <button onClick={()=>oppnaPeriodNy((redDag as any).datum)} style={{ ...KNAPP.tertiar, display:"flex", width:"100%", justifyContent:"flex-start" }}>
                    <span className="material-symbols-outlined" style={{ fontSize:IKON.text }}>add</span>Lägg till period
                  </button>
                )}
              </Card>
            </div>
            );
          })()}

          {/* Körning-kortet är borta — körningen är en rad i huvudkortet ovan. */}

          {/* Anledning — visas om något ändrats */}
          {harÄndrat&&(
            <div style={{ marginTop:AVSTAND.l }}>
              <Label>{harData?"Anledning till ändring":"Kommentar"} <span style={{ color:FARG.rod }}>*</span></Label>
              <input
                placeholder="Kommentar"
                value={redAnl}
                onChange={e=>setRedAnl(e.target.value)}
                style={{ width:"100%",padding:`${AVSTAND.l}px ${AVSTAND.l}px`,...TYP.text,border:"none",borderRadius:RADIE.kort,background:FARG.kort,outline:"none",boxShadow:"none",fontFamily:"inherit",color:FARG.text }}
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
            const erHelDag = arFranvaroDagtyp(redDag?.dagtyp);
            const harExtra = (extraTidData || []).some((e:any) => e.datum === redDag.datum && e.slut_tid);
            const kanBekrafta = !bekraftadRedan && (harSlut || erHelDag || (harExtra && !harStart));
            const passPågår = harStart && !harSlut && !erHelDag;
            if (!harData && redStart==="00:00" && redSlut==="00:00" && redRast===0) {
              return (<>{felRad}<button style={KNAPP.primar} onClick={()=>setRedVy("tid")}>Lägg till manuellt</button>{tillbakaKnapp}</>);
            }
            if (harÄndrat) {
              return (<>
                {felRad}
                <button
                  style={{ ...KNAPP.primar, ...(!redAnl ? INAKTIV : {}) }}
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
                      // SAMMA REGEL SOM KM-SHEETEN OCH ÄNDRA TIDER: en ändring på en
                      // bekräftad dag bryter bekräftelsen — underskriften gäller det
                      // som stod där när föraren skrev under. Har föraren rört km
                      // äger hen värdet (km_kalla='forare', inkl. medveten 0).
                      const bryterBekräftelse = !!(redDag as any)?.bekraftad;
                      const kmÄndrad = redKm !== redKmOrig;
                      const res = await upsertVerifierat(supabase, "arbetsdag", {
                        medarbetare_id: medarbetare.id,
                        datum: redDag.datum,
                        start_tid: redStart, slut_tid: redSlut, rast_min: redRast,
                        km_morgon: kmMorg, km_kvall: kmKvall,
                        ...(kmÄndrad ? { km_kalla: 'forare' } : {}),
                        objekt_id: redObjektId || redDag.objekt_id || null,
                        maskin_id: redMaskinId || redDag.maskin_id || null,
                        redigerad: true,
                        redigerad_anl: redAnl, redigerad_tid: new Date().toISOString(),
                        ...(bryterBekräftelse ? { bekraftad: false, bekraftad_tid: null } : {}),
                      }, { onConflict: 'medarbetare_id,datum' });
                      if (!res.ok) throw new Error(res.fel);
                      setRedDagar(r=>({...r,[redDag.datum]:{start:redStart,slut:redSlut,rast:redRast,km:redKm,anl:redAnl}}));
                      // STANNA i vyn: spegla de sparade värdena i redDag/dagData så
                      // harÄndrat blir false → samma knappplats visar nu "Bekräfta
                      // dagen". Rätta → spara → bekräfta, utan att lämna dagen.
                      // redigerad förblir true (både rättad OCH underskriven).
                      const sparad = {
                        start_tid: redStart, slut_tid: redSlut, rast_min: redRast,
                        km_morgon: kmMorg, km_kvall: kmKvall, km_totalt: kmMorg + kmKvall,
                        ...(kmÄndrad ? { km_kalla: 'forare' } : {}),
                        objekt_id: redObjektId || (redDag as any).objekt_id || null,
                        maskin_id: redMaskinId || (redDag as any).maskin_id || null,
                        redigerad: true,
                        ...(bryterBekräftelse ? { bekraftad: false, bekraftad_tid: null } : {}),
                      };
                      setRedDag((d:any) => ({ ...d, ...sparad }));
                      setDagData(dd => ({ ...dd, [(redDag as any).datum]: { ...(dd[(redDag as any).datum]||{}), ...sparad } }));
                      setRedFel(null);
                      setSparadKvittens(true);
                      if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(60);
                      setTimeout(() => setSparadKvittens(false), 4000);
                    } catch(e) {
                      setRedFel(SPARA_FEL);
                    }
                  }}>
                  {harData?"Spara ändring":"Spara"}
                </button>
                {tillbakaKnapp}
              </>);
            }
            // Ingen ändring gjord. Bekräfta-knapp visas bara för dagar där
            // passet är avslutat (eller saknas). Pågående pass visar väntetext.
            if (kanBekrafta) {
              return (<>
                {felRad}
                {sparadKvittens && (
                  <div style={{ ...TYP.meta, color:FARG.gron, textAlign:"center", display:"flex", alignItems:"center", justifyContent:"center", gap:AVSTAND.xs }}>
                    <span className="material-symbols-outlined" style={{ fontSize:IKON.text }}>check_circle</span>
                    Sparat — tryck Bekräfta för att skriva under
                  </div>
                )}
                {/* SAMMA väg som Dag-vyns Bekräfta: för-check → ev. orsak → underskrift. */}
                <button style={KNAPP.primar} onClick={()=>bekraftaMedForcheck(redDag.datum, skrivUnderRedDag, "redigera")}>
                  Bekräfta dagen
                </button>
                {tillbakaKnapp}
              </>);
            }
            if (passPågår) {
              return (<>
                <p style={{ margin:0, ...TYP.meta, color:FARG.text2, textAlign:"center" }}>Pass pågår — kan bekräftas efter avslut</p>
                {tillbakaKnapp}
              </>);
            }
            if (bekraftadRedan) {
              return (<>{bekraftadRad(bekraftadTidFmt)}{tillbakaKnapp}</>);
            }
            return tillbakaKnapp;
          })()}
        </div>
          </>);
        })()}

        {/* "Vad gjorde du?"-sheeten — delad UI så Loggad tid-raderna ovan
            faktiskt öppnar redigering även för historiska dagar */}
        {efterStoppUI}

        {/* Objektväljare för redigering */}
        {visaRedObjektVäljare&&(
          <div style={{ position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.8)",zIndex:100,display:"flex",alignItems:"flex-end",justifyContent:"center" }}>
            <div style={{ background:FARG.bg,borderRadius:`${RADIE.sheet}px ${RADIE.sheet}px 0 0`,width:"100%",maxWidth:500,maxHeight:"70vh",display:"flex",flexDirection:"column" }}>
              <div style={{ padding:`${AVSTAND.l}px ${AVSTAND.xl}px`,borderBottom:`1px solid ${FARG.linje}`,display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                <h3 style={{ margin:0,...TYP.rubrik }}>Välj objekt</h3>
                <button onClick={()=>setVisaRedObjektVäljare(false)} style={{ background:"none",border:"none",color:FARG.text2,...TYP.meta,cursor:"pointer",fontFamily:"inherit" }}>Stäng</button>
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
            <div style={{ background:FARG.kort,borderRadius:`${RADIE.sheet}px ${RADIE.sheet}px 0 0`,width:"100%",maxWidth:500,maxHeight:"70vh",display:"flex",flexDirection:"column" }}>
              <div style={{ padding:`${AVSTAND.l}px ${AVSTAND.xl}px`,borderBottom:`1px solid ${FARG.linje}`,display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                <h3 style={{ margin:0,...TYP.rubrik }}>Välj maskin</h3>
                <button onClick={()=>setVisaRedMaskinVäljare(false)} style={{ background:"none",border:"none",color:FARG.text2,...TYP.meta,cursor:"pointer",fontFamily:"inherit" }}>Stäng</button>
              </div>
              <div style={{ flex:1,overflowY:"auto",padding:`${AVSTAND.s}px 0` }}>
                {Object.entries(maskinNamnMap).map(([mid,namn])=>(
                  <button key={mid} onClick={()=>{setRedMaskinId(mid);setVisaRedMaskinVäljare(false);}} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",width:"100%",padding:`${AVSTAND.l}px ${AVSTAND.xl}px`,background:"none",border:"none",borderBottom:`1px solid ${FARG.linje}`,cursor:"pointer",fontFamily:"inherit",textAlign:"left" }}>
                    <div>
                      <p style={{ margin:0,...TYP.listtitel,color:FARG.text }}>{namn}</p>
                      <p style={{ margin:`${AVSTAND.xs}px 0 0`,...TYP.meta,color:FARG.text2 }}>{mid}</p>
                    </div>
                    {redMaskinId===mid&&<span className="material-symbols-outlined" style={{ fontSize:IKON.rad, color:FARG.text }}>check</span>}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* (Rast-pickern som ingen kunde öppna är borttagen — rasten ändras i
            Ändra arbetstid tillsammans med start/slut.) */}

        {/* Km-sheet — bottom sheet för att ändra morgon/kväll-km. Öppnas från Körning-raden. */}
        {visaRedKmSheet && (()=>{
          const ny = redTmpKmM + redTmpKmK;
          const över = Math.max(0, ny - frikm);
          const mil = över > 0 ? Math.ceil(över/10) : 0;
          const stäng = () => setVisaRedKmSheet(false);
          // ± i 44 px (skillen: maskinen skakar). Förr 36.
          const KmInp = ({label, value, onChange}: {label: string; value: number; onChange: (v:number)=>void}) => (
            <div style={{ flex:1, background:FARG.upphojt, borderRadius:RADIE.kort, padding:`${AVSTAND.m}px ${AVSTAND.l}px` }}>
              <p style={{ margin:`0 0 ${AVSTAND.s}px`, ...TYP.meta, color:FARG.text2 }}>{label}</p>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                <button onClick={()=>onChange(Math.max(0, value-10))} style={{ ...KNAPP.sekundar, width:TRAFFYTA.min, padding:0, borderRadius:RADIE.rad, ...TYP.rubrik }}>−</button>
                <span style={{ ...TYP.tal, color:FARG.text }}>{value}</span>
                <button onClick={()=>onChange(Math.min(999, value+10))} style={{ ...KNAPP.sekundar, width:TRAFFYTA.min, padding:0, borderRadius:RADIE.rad, ...TYP.rubrik }}>+</button>
              </div>
              <p style={{ margin:`${AVSTAND.xs}px 0 0`, textAlign:"center", ...TYP.meta, color:FARG.text2 }}>km</p>
            </div>
          );
          return (
            <div onClick={stäng} className="tona-opacity" style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", zIndex:1500, display:"flex", alignItems:"flex-end", justifyContent:"center" }}>
              <div onClick={e=>e.stopPropagation()} className="sheet-upp"
                style={{ width:"100%", maxWidth:560, background:FARG.kort, borderRadius:`${RADIE.sheet}px ${RADIE.sheet}px 0 0`, padding:`${AVSTAND.s}px ${AVSTAND.l}px ${AVSTAND.xl}px`, maxHeight:"85vh", overflowY:"auto" }}>
                <div style={{ display:"flex", justifyContent:"center", padding:`${AVSTAND.xs}px 0 ${AVSTAND.m}px` }}>
                  <div style={{ width:40, height:AVSTAND.xs, borderRadius:RADIE.rad, background:FARG.fyllning }} />
                </div>
                <p style={{ margin:`0 0 ${AVSTAND.l}px`, ...TYP.rubrik, color:FARG.text }}>Ändra km</p>
                <div style={{ display:"flex", gap:AVSTAND.s }}>
                  <KmInp label="Morgon" value={redTmpKmM} onChange={setRedTmpKmM}/>
                  <KmInp label="Kväll"  value={redTmpKmK} onChange={setRedTmpKmK}/>
                </div>
                <div style={{ marginTop:AVSTAND.l, display:"flex", justifyContent:"space-between", alignItems:"baseline" }}>
                  <span style={{ ...TYP.meta, color:FARG.text2 }}>Totalt</span>
                  <span style={{ ...TYP.rubrik, ...TNUM, color:FARG.text }}>{ny} km</span>
                </div>
                <p style={{ margin:`${AVSTAND.xs}px 0 0`, ...TYP.meta, ...TNUM, color:FARG.text2 }}>
                  {över > 0 ? `${mil} påbörjade mil (${över} km över ${frikm})` : `Ingen reseersättning (högst ${frikm} km)`}
                </p>
                {felRad}
                <div style={{ display:"grid", gridTemplateColumns:"1fr 2fr", gap:AVSTAND.s, marginTop:AVSTAND.l }}>
                  <button onClick={stäng} style={{ ...KNAPP.lank, display:"flex", width:"100%" }}>
                    Avbryt
                  </button>
                  <button
                    onClick={async () => {
                      // Skriv till DB först om raden finns (samma beteende som
                      // dag-vyns km-sheet), lokal state efter verifierad skrivning.
                      // Bryter bekräftelse vid ändring.
                      if (redDag?.id) {
                        const bryterBekräftelse = !!redDag?.bekraftad;
                        // km_kalla='forare': föraren äger km-värdet (inkl. medveten 0).
                        const payload: any = { km_morgon: redTmpKmM, km_kvall: redTmpKmK, km_kalla: 'forare', redigerad: true, redigerad_tid: new Date().toISOString() };
                        if (bryterBekräftelse) { payload.bekraftad = false; payload.bekraftad_tid = null; }
                        const res = await uppdateraVerifierat(supabase, "arbetsdag", payload, { id: redDag.id });
                        if (!res.ok) {
                          setRedFel(res.fel);
                          return;
                        }
                        setRedFel(null);
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
                    style={KNAPP.primar}>
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

    // Total jobbad tid denna månad = maskintid + extra tid (#188 — samma
    // definition som alla andra vyer, via lib/arbetstid). Hjälten, progress-
    // stapeln och "av X tim" bygger alla på samma totalMin.
    const månadsPrefix = `${kalÅr}-${String(kalMånad+1).padStart(2,'0')}`;
    const månadsExtra = Object.entries(extraDagData)
      .filter(([d]) => d.startsWith(månadsPrefix))
      .flatMap(([datum, arr]) => (arr as any[]).map(e => ({ datum, minuter: e.minuter })));
    const månadsDagRader = Object.entries(dagData)
      .filter(([k]) => k.startsWith(månadsPrefix));
    const { totalMin: jobbadMin, extraMin: månExtraMin } = arbetadTidInklExtra(
      månadsDagRader.map(([, d]: any) => ({ arbetad_min: d.arbMin || 0 })),
      månadsExtra,
    );
    const jobbadH = Math.round(jobbadMin / 60 * 10) / 10;
    // Jobbade dagar = arbetsdagar med maskinpass ELLER extra tid — bara talet,
    // ingen vardags-nämnare (täljare alla jobbade dagar, nämnare bara vardagar
    // gav "25 av 23"). Frånvarodagar (lib/franvaro) räknas aldrig som jobbade;
    // de syns per dag i rutnätet och i Löns Saknas-block. Körning står i Lön.
    const jobbadeSet = new Set<string>();
    for (const [datum, d] of månadsDagRader as [string, any][]) {
      if ((FRANVARO_DAGTYPER_ALLA as readonly string[]).includes(String(d.dagtyp || '').toLowerCase())) continue;
      if ((d.arbMin || 0) > 0) jobbadeSet.add(datum);
    }
    for (const e of månadsExtra) if ((e.minuter || 0) > 0) jobbadeSet.add(e.datum);
    const jobbadeDagar = jobbadeSet.size;

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
      if (dag?.dagtyp === 'foraldraledig') return 'vab'; // samma orange prick som VAB
      if (dag?.bekraftad) return 'ok';
      // Före skarp start: ingen åtgärdsprick (orange) — dagen visas, räknas
      // inte. Grön för bekräftade står kvar (lib/skarpStart).
      if (dag) return foreSkarpStart(k) ? 'tom' : 'saknas';
      if (rödaDagar[k]) return 'röd';
      const date = new Date(kalÅr, kalMånad, d);
      const dow = date.getDay();
      if (dow === 0 || dow === 6) return 'weekend';
      return 'tom';
    };

    // Prickar: statusfärg bara som prick bredvid ett ord (statusförklaringen).
    // Extra tid är INTE en status → grå prick (blått betyder "navigerar").
    // Synk-avvikelse = "titta på dagen" → orange, samma som obekräftad.
    const dotFärg: Record<string,string> = {
      ok:FARG.gron,        // bekräftad
      saknas:FARG.orange,  // data finns men ej bekräftat
      sjuk:FARG.rod,
      vab:FARG.orange,
    };
    const extraPrickFärg = FARG.text2;
    const synkPrickFärg = FARG.orange;
    // (Ingen useRaknaUpp här — vyn ligger bakom ett villkor, hooks får inte det.)
    const månadHjälte = jobbadH;

    return (
      <div style={{ minHeight:"100vh", background:FARG.bg, color:FARG.text, fontFamily:FONT, WebkitFontSmoothing:"antialiased", display:"flex", flexDirection:"column" }}>
        <style>{css}</style>{timerBanner}

        {/* Header — månad + pilar (44 px, blå = navigerar). Rubriken var blå
            fast den inte gick att trycka på. */}
        <header style={{ position:"sticky", top:HEADER_TOP, background:"rgba(0,0,0,0.8)", backdropFilter:"blur(20px)", WebkitBackdropFilter:"blur(20px)", zIndex:50, display:"flex", alignItems:"center", justifyContent:"space-between", padding:`0 ${AVSTAND.sidmarginal}px`, height:64 }}>
          <button onClick={()=>kanBakåt&&navigera(-1)} style={{ ...KNAPP.lank, width:TRAFFYTA.min, justifyContent:"center", ...(kanBakåt ? {} : INAKTIV) }}>
            <span className="material-symbols-outlined" style={{ fontSize:IKON.rad }}>chevron_left</span>
          </button>
          <h1 style={{ margin:0, ...TYP.listtitel, color:FARG.text, textTransform:"capitalize" }}>{kalMånadLabel}</h1>
          <button onClick={()=>kanFramåt&&navigera(1)} style={{ ...KNAPP.lank, width:TRAFFYTA.min, justifyContent:"center", ...(kanFramåt ? {} : INAKTIV) }}>
            <span className="material-symbols-outlined" style={{ fontSize:IKON.rad }}>chevron_right</span>
          </button>
        </header>

        <main style={{ flex:1, padding:`0 ${AVSTAND.sidmarginal}px ${SCROLL_BOTTOM}px`, overflowY:"auto" }}>

          {/* Månadskortet: ETT tal (jobbat av mål) + jobbade dagar. Progress-
              stapeln, "varav extra tid", dagtypsraderna och körningen är borta —
              de sa samma sak som Lön (specen) eller rutnätet. */}
          <section style={{ marginTop:AVSTAND.l, marginBottom:AVSTAND.xl }}>
            <div style={KORT}>
              <p style={{ margin:`0 0 ${AVSTAND.s}px`, ...TYP.meta, color:FARG.text2 }}>Jobbat i {kalMånadNamn}</p>
              <p style={{ margin:0, ...TYP.tal, color:FARG.text }}>
                {månadHjälte.toLocaleString('sv-SE')}
                <span style={{ ...TYP.meta, ...TNUM, color:FARG.text2, marginLeft:AVSTAND.xs }}>av {målH} tim</span>
              </p>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:AVSTAND.m, paddingTop:AVSTAND.m, borderTop:`1px solid ${FARG.linje}` }}>
                <span style={{ ...TYP.meta, color:FARG.text2 }}>Jobbade dagar</span>
                <span style={{ ...TYP.listtitel, ...TNUM, color:FARG.text }}>{jobbadeDagar}</span>
              </div>
            </div>
          </section>

          {/* Calendar grid */}
          <section style={{ marginBottom:AVSTAND.xxl }}>
            {/* Weekday headers */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", textAlign:"center", marginBottom:AVSTAND.l }}>
              {veckar.map(v=>(
                <div key={v} style={{ color:FARG.text2, ...TYP.micro }}>{v}</div>
              ))}
            </div>

            {/* Day cells */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:`${AVSTAND.xl}px 0`, textAlign:"center" }}>
              {cells.map((d,i)=>{
                if(!d) return <div key={i} style={{ padding:`${AVSTAND.s}px 0`, ...INAKTIV, opacity:0.2 }}>{(() => {
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
                const helgNamn = rödaDagar[k] || '';
                const harExtra = (extraDagData[datum]||[]).length > 0;
                // Ohanterad synk-avvikelse (bekraftad dag vars maskintider byggts
                // om) → amber prick, upptackbart utan att oppna dagen.
                const _sh = historik.find((x:any)=>x.datum===datum);
                // Amber synk-prick bara från skarp start (lib/skarpStart) — före golvet visas dagen, larmas inte.
                const synkOhanterad = !!_sh?.synk_avvikelse && !_sh.synk_avvikelse.kvitterad && !foreSkarpStart(datum);
                // Ledig dag: godkänd ledighet OCH inget arbete/frånvaro-prick och
                // ingen extra tid ("arbete vinner"). Egen visuell klass (ton +
                // typ-etikett), aldrig en ny prickfärg.
                const ledTyp = ledighetDagar[datum];
                const ärLedig = !!ledTyp && !dotFärg[s] && !harExtra;
                const ledEtikett = !ärLedig ? '' : ledTyp==='semester'?'Sem':ledTyp==='sjuk'?'Sjuk':ledTyp==='vab'?'VAB':ledTyp==='foraldraledig'?'FL':'Ledig';

                return (
                  <div key={i}
                    onClick={()=>öppnaRedigera(datum)}
                    style={{ position:"relative", display:"flex", flexDirection:"column", alignItems:"center", cursor:"pointer", padding:`${AVSTAND.s}px 0`, minHeight:TRAFFYTA.min, ...(ärLedig?{ background:FARG.linje, borderRadius:RADIE.rad }:{}) }}>
                    {/* Ring: idag = vit ring (inte blå — blått navigerar). Den gula
                        "redigerad"-ringen är borta: att en dag rättats är ingen status
                        föraren ska agera på. */}
                    {isToday && <div style={{ position:"absolute", top:AVSTAND.xs, width:36, height:36, border:`2px solid ${FARG.text}`, borderRadius:RADIE.cirkel }} />}
                    <span style={{
                      ...TYP.text, ...TNUM,
                      fontWeight: isToday ? VIKT.fet : VIKT.normal,
                      color: s==="röd" ? FARG.rod : FARG.text,
                      position:"relative", zIndex:1,
                      lineHeight:"36px",
                    }}>{d}</span>
                    {/* Helgdag namn / ledig-etikett: micro-steget, aldrig egna storlekar */}
                    {helgNamn && <span style={{ ...TYP.micro, color:s==="röd"?FARG.rod:FARG.text2, maxWidth:44, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{helgNamn}</span>}
                    {ärLedig && <span style={{ ...TYP.micro, color:FARG.text2 }}>{ledEtikett}</span>}
                    {/* Status dot: bekräftad=grön, saknas=orange, + grå punkt för extra tid.
                        Visas även på helgdagar — helgtexten döljer inte pricken. */}
                    {(dotFärg[s]||harExtra||synkOhanterad)?(
                      <div style={{ display:"flex", gap:AVSTAND.xs, marginTop:AVSTAND.xs }}>
                        {dotFärg[s]&&(
                          <div style={{ width:AVSTAND.xs, height:AVSTAND.xs, borderRadius:RADIE.cirkel, background:dotFärg[s] }}/>
                        )}
                        {harExtra&&(
                          <div style={{ width:AVSTAND.xs, height:AVSTAND.xs, borderRadius:RADIE.cirkel, background:extraPrickFärg }}/>
                        )}
                        {synkOhanterad&&(
                          <div style={{ width:AVSTAND.xs, height:AVSTAND.xs, borderRadius:RADIE.cirkel, background:synkPrickFärg }}/>
                        )}
                      </div>
                    ):null}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Statusförklaring — EN rad, prick + ord. Förr sex rader med egna
              storlekar (12/20 px-prickar, ringar, 8 px-text). */}
          <section style={{ display:"flex", flexWrap:"wrap", justifyContent:"center", gap:`${AVSTAND.s}px ${AVSTAND.l}px`, paddingTop:AVSTAND.l, borderTop:`1px solid ${FARG.linje}` }}>
            {([
              ["Bekräftad", FARG.gron],
              ["Obekräftad", FARG.orange],
              ["Extra tid", FARG.text2],
              ["Frånvaro", FARG.rod],
            ] as [string, string][]).map(([ord, farg]) => (
              <span key={ord} style={{ display:"inline-flex", alignItems:"center", gap:AVSTAND.xs, ...TYP.meta, color:FARG.text2 }}>
                <span style={{ width:AVSTAND.s, height:AVSTAND.s, borderRadius:RADIE.cirkel, background:farg, display:"inline-block" }} />{ord}
              </span>
            ))}
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
