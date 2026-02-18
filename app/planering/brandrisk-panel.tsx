"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { fetchSmhiFwi, generateTestData, type SmhiBrandriskData } from "../../lib/smhi-brandrisk";

// === MCF Color System ===
const MCF_COLORS: Record<number, string> = {
  0: "#8E8E93", 1: "#007AFF", 2: "#34C759",
  3: "#FFD60A", 4: "#FF9F0A", 5: "#FF453A", 6: "#AF52DE",
};

const MCF_RGB: Record<number, [number, number, number]> = {
  1: [0,122,255], 2: [52,199,89], 3: [255,214,10],
  4: [255,159,10], 5: [255,69,58], 6: [175,82,222],
};

interface McfText {
  name: string;
  short: string;
  desc: string;
  fwi: string;
}

const MCF_TEXTS: Record<number, McfText> = {
  1: { name: "Mycket liten skogsbrandsrisk", short: "Mycket liten", desc: "I de flesta skogstyper kan inte brand starta eller sprida sig med öppna lågor", fwi: "FWI < 5" },
  2: { name: "Liten skogsbrandsrisk", short: "Liten", desc: "I vissa skogstyper kan det vara svårt för en brand att sprida sig", fwi: "FWI 5–11" },
  3: { name: "Måttlig skogsbrandsrisk", short: "Måttlig", desc: "Vegetationen brinner med olika spridningshastighet beroende på typ och torka", fwi: "FWI 12–16" },
  4: { name: "Stor skogsbrandsrisk", short: "Stor", desc: "Påtaglig risk för brandspridning, brand sprider sig normalt i de flesta vegetationstyper", fwi: "FWI 17–21 · Samråd krävs" },
  5: { name: "Mycket stor skogsbrandsrisk", short: "Mycket stor", desc: "En brand kommer att utveckla sig mycket snabbt och häftigt. Toppbränder kan förekomma", fwi: "FWI 22–27" },
  6: { name: "Extremt stor skogsbrandsrisk", short: "Extrem", desc: "Markens ytskikt extremt torrt. Antändningsrisken mycket stor, brand utvecklas explosivt. Stor risk för toppbrand", fwi: "FWI 28+ · Ofta eldningsförbud" },
};

const OPACITY: Record<number, number> = { 1: 0.25, 2: 0.4, 3: 0.55, 4: 0.7, 5: 0.85, 6: 0.95 };
const R_BOOST: Record<number, number> = { 1: 0, 2: 0, 3: 4, 4: 9, 5: 14, 6: 18 };
const GLOW_BLUR: Record<number, number> = { 1: 0, 2: 0, 3: 2, 4: 5, 5: 9, 6: 14 };
const GLOW_OPACITY: Record<number, number> = { 1: 0, 2: 0, 3: 0.25, 4: 0.45, 5: 0.65, 6: 0.85 };
const BAR_GLOW: Record<number, string> = {
  3: "0 0 6px rgba(255,214,10,0.25)",
  4: "0 0 10px rgba(255,159,10,0.35), 0 0 3px rgba(255,159,10,0.2)",
  5: "0 0 14px rgba(255,69,58,0.4), 0 0 4px rgba(255,69,58,0.25)",
  6: "0 0 18px rgba(175,82,222,0.5), 0 0 5px rgba(175,82,222,0.3)",
};

const SAMRAD_STEPS: { title: string; desc: string }[] = [
  { title: "Kontakta arbetsledare/uppdragsgivare", desc: "Innan arbete påbörjas eller fortsätter. Gäller markberedning, avverkning och annan verksamhet som kan orsaka gnistbildning" },
  { title: "Gemensam riskbedömning", desc: "Bedöm lokal terräng, vindförhållanden, markfuktighet och bränsletyp. Prognosen visar generellt läge – lokala förhållanden kan avvika" },
  { title: "Beslut", desc: "Genomföra arbetet, anpassa (t.ex. byta trakt, ändra tider, begränsa verksamhet) eller stoppa helt" },
  { title: "Dokumentera", desc: "Anteckna bedömning och beslut. Arbetsgivaren ansvarar enligt AML 1977:1160" },
  { title: "Säkerställ beredskap", desc: "Släckutrustning ska finnas tillgänglig. Förare ska ha kommunikation och veta utrymningsväg" },
];

interface DocItem { title: string; sub: string; url: string; }
interface DocGroup { group: string; items: DocItem[]; }

const DOCS: DocGroup[] = [
  { group: "Riktlinjer", items: [
    { title: "Branschgemensamma riktlinjer – Brand", sub: "Skogforsk (2022) · PDF", url: "https://www.skogforsk.se/cd_20221011125609/contentassets/6c848836ec104a4ea436c11051b3d9f2/riskhantering-avseende-brand-22-09-05.pdf" },
    { title: "Fördjupande information v2", sub: "Skogforsk · PDF", url: "https://www.skogforsk.se/cd_20220513142539/contentassets/bffdbb5eaf7246a485f73011e47c6ef5/riskhantering-avseende-brand--fordjupande-information--version-2-utskriftsformat.pdf" },
    { title: "Skogforsk – Förebyggande arbete mot brand", sub: "skogforsk.se", url: "https://www.skogforsk.se/brandrisk" },
  ]},
  { group: "Prognoser och data", items: [
    { title: "MCF Brandriskprognoser", sub: "mcf.se", url: "https://www.mcf.se/brandriskprognoser/" },
    { title: "SMHI Brandrisk skog och mark", sub: "smhi.se", url: "https://www.smhi.se/vader/varningar-och-brandrisk/brandrisk-skog-och-mark" },
  ]},
  { group: "Lagstiftning", items: [
    { title: "Arbetsmiljölagen (AML 1977:1160)", sub: "riksdagen.se", url: "https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/arbetsmiljolag-19771160_sfs-1977-1160/" },
    { title: "Lag om skydd mot olyckor (LSO 2003:778)", sub: "riksdagen.se", url: "https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/lag-2003778-om-skydd-mot-olyckor_sfs-2003-778/" },
    { title: "Förordning om skydd mot olyckor (FSO 2003:789)", sub: "riksdagen.se · §7 eldningsförbud", url: "https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/forordning-2003789-om-skydd-mot-olyckor_sfs-2003-789/" },
  ]},
  { group: "Övrig brandsäkerhet", items: [
    { title: "SBF 127:17 – Regler för brandskydd", sub: "Brandskyddsföreningen", url: "https://www.brandskyddsforeningen.se/webbshop/normer-och-regelverk/sbf-12717-regler-for-brandskydd-pa-arbetsfordon-skogs-anlaggningsmaskiner/" },
  ]},
];

// === SVG helpers ===
function p2c(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = (deg - 90) * Math.PI / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

// === FireClock Component ===
function FireClock({ hourlyIdx, nowHour, nowMinute }: { hourlyIdx: number[]; nowHour: number; nowMinute?: number }) {
  const timeLabel = nowMinute !== undefined ? `${nowHour.toString().padStart(2, '0')}:${nowMinute.toString().padStart(2, '0')}` : 'NU';
  const CX = 155, CY = 155, R_OUT = 135, R_IN = 92, GAP = 1.2;
  const segments = [];
  const labels: Record<number, string> = { 0: "00", 3: "03", 6: "06", 9: "09", 12: "12", 15: "15", 18: "18", 21: "21" };

  for (let h = 0; h < 24; h++) {
    const s = h * 15 + GAP / 2, e = (h + 1) * 15 - GAP / 2;
    const idx = hourlyIdx[h] || 1;
    const [r, g, b] = MCF_RGB[idx] || MCF_RGB[1];
    const rOut = R_OUT + (R_BOOST[idx] || 0);
    const [ox1, oy1] = p2c(CX, CY, rOut, s);
    const [ox2, oy2] = p2c(CX, CY, rOut, e);
    const [ix2, iy2] = p2c(CX, CY, R_IN, e);
    const [ix1, iy1] = p2c(CX, CY, R_IN, s);
    segments.push(
      <path key={h} d={`M${ox1},${oy1} A${rOut},${rOut} 0 0,1 ${ox2},${oy2} L${ix2},${iy2} A${R_IN},${R_IN} 0 0,0 ${ix1},${iy1} Z`}
        fill={`rgba(${r},${g},${b},${OPACITY[idx] || 0.25})`}
        filter={idx >= 3 ? `url(#glow${idx})` : undefined} />
    );
  }

  const nowIdx = hourlyIdx[nowHour] || 1;
  const nowRout = R_OUT + (R_BOOST[nowIdx] || 0);
  const nowDeg = nowHour * 15;
  const [mx, my] = p2c(CX, CY, nowRout, nowDeg);
  const [tx1, ty1] = p2c(CX, CY, nowRout + 2, nowDeg);
  const [tx2, ty2] = p2c(CX, CY, nowRout + 9, nowDeg);
  const [nx, ny] = p2c(CX, CY, nowRout + 22, nowDeg);

  return (
    <svg viewBox="-15 -15 340 340" style={{ width: "100%", height: "100%" }}>
      <defs>
        {[3,4,5,6].map(lvl => {
          const [r,g,b] = MCF_RGB[lvl];
          return (
            <filter key={lvl} id={`glow${lvl}`} x="-50%" y="-50%" width="200%" height="200%">
              <feFlood floodColor={`rgb(${r},${g},${b})`} floodOpacity={GLOW_OPACITY[lvl]} result="color" />
              <feComposite in="color" in2="SourceGraphic" operator="in" result="colored" />
              <feGaussianBlur in="colored" stdDeviation={GLOW_BLUR[lvl]} result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          );
        })}
      </defs>
      {segments}
      <circle cx={CX} cy={CY} r={R_IN - 5} fill="rgba(0,0,0,0.8)" />
      {Object.entries(labels).map(([h, label]) => {
        const hi = parseInt(h), deg = hi * 15;
        const [x, y] = p2c(CX, CY, R_OUT + 24, deg);
        const isKey = [0,6,12,18].includes(hi);
        return <text key={h} x={x} y={y + 4} textAnchor="middle" fill={isKey ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.25)"}
          fontSize={isKey ? 12 : 10} fontWeight={isKey ? 600 : 400} fontFamily="-apple-system, sans-serif">{label}</text>;
      })}
      {Array.from({ length: 24 }, (_, h) => {
        const deg = h * 15, major = h % 6 === 0;
        const [x1, y1] = p2c(CX, CY, R_IN - 5, deg);
        const [x2, y2] = p2c(CX, CY, R_IN - (major ? 14 : 9), deg);
        return <line key={`t${h}`} x1={x1} y1={y1} x2={x2} y2={y2}
          stroke={major ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.06)"}
          strokeWidth={major ? 1.5 : 0.75} />;
      })}
      <circle cx={mx} cy={my} r={10} fill="rgba(255,255,255,0.08)" />
      <circle cx={mx} cy={my} r={5} fill="#fff" />
      <circle cx={mx} cy={my} r={2} fill="#000" />
      <line x1={tx1} y1={ty1} x2={tx2} y2={ty2} stroke="#fff" strokeWidth={2} strokeLinecap="round" />
      <rect x={nx - 18} y={ny - 8} width={36} height={16} rx={4} fill="rgba(255,255,255,0.18)" />
      <text x={nx} y={ny + 4} textAnchor="middle" fill="#fff" fontSize={10} fontWeight={700} fontFamily="-apple-system, sans-serif">{timeLabel}</text>
      <circle cx={mx} cy={my} r={5} fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth={1.5}>
        <animate attributeName="r" from="5" to="14" dur="2s" repeatCount="indefinite" />
        <animate attributeName="stroke-opacity" from="0.5" to="0" dur="2s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

// === Collapsible Component ===
function Collapsible({ title, children, borderTop = true }: { title: string; children: React.ReactNode; borderTop?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderTop: borderTop ? "1px solid rgba(255,255,255,0.04)" : "none", marginTop: borderTop ? 12 : 0 }}>
      <div onClick={() => setOpen(!open)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0 0", cursor: "pointer", fontSize: 12, color: "rgba(255,255,255,0.35)", fontWeight: 500 }}>
        <span>{title}</span>
        <span style={{ fontSize: 16, color: "rgba(255,255,255,0.2)", transition: "transform 0.2s", transform: open ? "rotate(90deg)" : "none" }}>&#x203A;</span>
      </div>
      {open && <div style={{ paddingTop: 12 }}>{children}</div>}
    </div>
  );
}

// === Main Props ===
interface BrandriskPanelProps {
  lat: number;
  lon: number;
  eldningsforbud: boolean;
  onEldningsforbudChange: (val: boolean) => void;
  testMode: number | null;
  // Samråd + persistence props (passed through from page.tsx)
  brandSamrad: {
    beredskapsniva: 'normal' | 'hojd';
    atgarder: string[];
    blotMarkUndantag: boolean;
    uppdragsgivareNamn: string;
    uppdragsgivareTel: string;
    kortider: string;
    datum: string;
    kvitterad: boolean;
  };
  onSamradChange: (samrad: any) => void;
  brandKontakter: {
    uppdragsgivareNamn: string; uppdragsgivareTel: string;
    forsakringsbolag: string; forsakringsnummer: string;
    raddningstjanstNamn: string; raddningstjanstTel: string;
  };
  onKontakterChange: (kontakter: any) => void;
  brandTillbud: { datum: string; beskrivning: string; atgard: string; lat: number; lon: number; photoData: string; rapporteradTill: string; }[];
  brandNewTillbud: { datum: string; beskrivning: string; atgard: string; rapporteradTill: string; photoData: string; };
  onNewTillbudChange: (tillbud: any) => void;
  onSaveTillbud: () => void;
  brandEfterkontroll: { datum: string; noteringar: string; kvitterad: boolean; };
  onEfterkontrollChange: (ek: any) => void;
  brandBrandvakt: { namn: string; starttid: string; sluttid: string; noteringar: string; };
  onBrandvaktChange: (bv: any) => void;
  onSaveBrandvakt: () => void;
  brandUtrustning: boolean[];
  onUtrustningChange: (u: boolean[]) => void;
  brandNearbyWater: { name: string; dist: number; lat: number; lon: number }[];
  brandNearbyFireStation: { name: string; dist: number; lat: number; lon: number }[];
  brandLarmTillfart: string;
  onLarmTillfartChange: (v: string) => void;
  brandLarmChecklista: boolean[];
  onLarmChecklistaChange: (v: boolean[]) => void;
  mapCenter: { lat: number; lng: number };
  onStatusChange?: (status: { status: 'idle' | 'loading' | 'done' | 'error'; currentFwi: number; currentIdx: number }) => void;
}

const REFRESH_INTERVAL = 30 * 60 * 1000; // 30 min

export default function BrandriskPanel(props: BrandriskPanelProps) {
  const {
    lat, lon, eldningsforbud, onEldningsforbudChange, testMode,
    brandSamrad, onSamradChange,
    brandKontakter, onKontakterChange,
    brandTillbud, brandNewTillbud, onNewTillbudChange, onSaveTillbud,
    brandEfterkontroll, onEfterkontrollChange,
    brandBrandvakt, onBrandvaktChange, onSaveBrandvakt,
    brandUtrustning, onUtrustningChange,
    brandNearbyWater, brandNearbyFireStation,
    brandLarmTillfart, onLarmTillfartChange,
    brandLarmChecklista, onLarmChecklistaChange,
    mapCenter,
    onStatusChange,
  } = props;

  const [data, setData] = useState<SmhiBrandriskData | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [isTestFallback, setIsTestFallback] = useState(false);
  const [activeDay, setActiveDay] = useState(0);
  const refreshRef = useRef<NodeJS.Timeout | null>(null);
  const lastFetchRef = useRef<string>('');

  const nowHour = new Date().getHours();
  const nowMinute = new Date().getMinutes();
  const barWidths: Record<number, string> = { 1: "17%", 2: "33%", 3: "50%", 4: "67%", 5: "83%", 6: "100%" };
  const wxColor: Record<string, string> = { vdry: "rgba(255,69,58,0.4)", dry: "rgba(255,159,10,0.45)" };

  const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: '13px', outline: 'none', boxSizing: 'border-box' };
  const secStyle: React.CSSProperties = { marginTop: '24px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '20px' };
  const headStyle: React.CSSProperties = { fontSize: '11px', fontWeight: '600', color: '#fff', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '12px' };
  const summaryStyle: React.CSSProperties = { ...headStyle, cursor: 'pointer', listStyle: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0' };
  const textStyle: React.CSSProperties = { fontSize: '13px', color: 'rgba(255,255,255,0.5)', lineHeight: '1.7' };
  const linkStyle: React.CSSProperties = { fontSize: '13px', color: '#60a5fa', textDecoration: 'none' };

  const fetchData = useCallback(async () => {
    if (testMode !== null) {
      const testData = generateTestData(testMode);
      setData(testData);
      setStatus('done');
      setIsTestFallback(false);
      onStatusChange?.({ status: 'done', currentFwi: testData.currentFwi, currentIdx: testData.currentIdx });
      return;
    }

    const fetchKey = `${lat.toFixed(2)}_${lon.toFixed(2)}`;
    if (fetchKey === lastFetchRef.current && data && status === 'done') return;

    setStatus('loading');
    onStatusChange?.({ status: 'loading', currentFwi: 0, currentIdx: 0 });
    try {
      const result = await fetchSmhiFwi(lat, lon);
      setData(result);
      setStatus('done');
      setIsTestFallback(false);
      lastFetchRef.current = fetchKey;
      onStatusChange?.({ status: 'done', currentFwi: result.currentFwi, currentIdx: result.currentIdx });
      console.log('[Brandrisk] Data hämtad:', result.currentIdx, 'FWI:', result.currentFwi);
    } catch (err) {
      console.error('[Brandrisk] API-fel:', err);
      // Fallback to test data
      const fallback = generateTestData(3);
      setData(fallback);
      setStatus('done');
      setIsTestFallback(true);
      onStatusChange?.({ status: 'done', currentFwi: fallback.currentFwi, currentIdx: fallback.currentIdx });
    }
  }, [lat, lon, testMode, data, status]);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [lat, lon, testMode]);

  // Auto-refresh every 30 min
  useEffect(() => {
    if (testMode !== null) return;
    refreshRef.current = setInterval(() => {
      lastFetchRef.current = ''; // Force refetch
      fetchData();
    }, REFRESH_INTERVAL);
    return () => { if (refreshRef.current) clearInterval(refreshRef.current); };
  }, [testMode]);

  // Loading state
  if (status === 'loading' && !data) {
    return (
      <div style={{ padding: '12px' }}>
        <div style={{ background: '#000', borderRadius: '20px', padding: '60px 24px', textAlign: 'center' }}>
          <div style={{ display: 'inline-block', width: '24px', height: '24px', border: '2.5px solid rgba(255,255,255,0.1)', borderTopColor: '#FF9F0A', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: '16px' }} />
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', fontWeight: 500 }}>Hämtar brandriskdata...</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', marginTop: 6 }}>SMHI fwif1g API</div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const currentIdx = data.currentIdx;
  const currentFwi = data.currentFwi;
  const peakIdx = data.peakIdx;
  const peakFwi = data.peakFwi;
  const peakHour = data.peakHour;
  const showSystem = currentIdx >= 3 || eldningsforbud || testMode !== null;

  // Sort daily so today is always first
  const sortedDaily = (() => {
    const todayStr = new Date().toISOString().split('T')[0];
    const todayIdx = data.daily.findIndex(d => d.date === todayStr);
    return todayIdx > 0
      ? [...data.daily.slice(todayIdx), ...data.daily.slice(0, todayIdx)]
      : data.daily;
  })();

  // Active day's hourly data for the fire clock
  const activeDayData = sortedDaily[activeDay];
  const clockHourlyIdx = activeDayData?.hourlyIdx || data.todayHourlyIdx;
  const clockLabel = activeDayData?.dayName || 'Idag';
  const clockDate = activeDayData ? new Date(activeDayData.date).toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'short' }) : '';

  // Find wind/humidity note for the active day
  const windHumNote = activeDayData ? (() => {
    const peakEntries = clockHourlyIdx.map((idx, h) => ({ idx, h })).filter(e => e.idx >= 3);
    if (peakEntries.length === 0) return null;
    const startH = peakEntries[0].h;
    const endH = peakEntries[peakEntries.length - 1].h;
    const windPart = activeDayData.windLevel ? activeDayData.wind.split(' ').slice(1).join(' ') : '';
    const humPart = activeDayData.humLevel ? activeDayData.humidity.toLowerCase() : '';
    const parts = [windPart && `Vind ${windPart}`, humPart && humPart].filter(Boolean);
    if (parts.length === 0) return null;
    return `${parts.join(' + ')} driver risken kl ${startH.toString().padStart(2, '0')}–${endH.toString().padStart(2, '0')}`;
  })() : null;

  // Lowest risk info for clock center
  const lowestHours = clockHourlyIdx.map((idx, h) => ({ idx, h }));
  const lowestIdx = Math.min(...clockHourlyIdx.filter(i => i > 0));
  const lowestPeriod = lowestHours.filter(e => e.idx === lowestIdx);
  const lowestStart = lowestPeriod.length > 0 ? lowestPeriod[0].h : 0;
  const lowestEnd = lowestPeriod.length > 0 ? lowestPeriod[lowestPeriod.length - 1].h : 5;

  const highestIdx = Math.max(...clockHourlyIdx);
  const highestPeriod = lowestHours.filter(e => e.idx === highestIdx);
  const highestStart = highestPeriod.length > 0 ? highestPeriod[0].h : 12;
  const highestEnd = highestPeriod.length > 0 ? highestPeriod[highestPeriod.length - 1].h : 17;

  const updatedTime = new Date(data.updatedAt).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });

  const atgardsAlternativ = [
    'Anpassat körsätt', 'Avgränsat arbetsområde', 'Brandvakt utsedd',
    'Byte av trakt', 'Demonterade slirskydd', 'Efterkontroll planerad',
    'Förstärkt släckutrustning', 'Tidsanpassad körning', 'Avstå arbete',
  ];
  const utrustLabels = [
    'Avverkningsmaskiner: 2 st 9L skum/vätskesläckare',
    'Markberedning: 6 st 9L skum/vätskesläckare',
    'Kratta och spade medförs',
    'Larmkoordinat i traktdirektiv',
  ];
  const larmLabels = [
    'Risk för personskada?',
    'Position med koordinater',
    'Brandens omfattning och spridningsriktning',
    'Vad hotas i brandens närområde?',
    'Lämplig tillfartsväg',
  ];

  return (
    <div style={{ padding: '12px' }}>
      <div style={{ background: '#000', color: '#fff', fontFamily: "-apple-system, 'SF Pro Display', 'Helvetica Neue', sans-serif", maxWidth: 430, margin: '0 auto', WebkitFontSmoothing: 'antialiased' }}>

        {/* TESTLÄGE banner */}
        {(testMode !== null || isTestFallback) && (
          <div style={{ background: 'rgba(234,179,8,0.2)', border: '2px solid #eab308', borderRadius: 12, padding: '12px 16px', marginBottom: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#eab308' }}>
              {testMode !== null ? `TESTLÄGE – simulerad brandrisk (FWI ${testMode})` : 'TESTLÄGE – kunde inte hämta data'}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(234,179,8,0.7)', marginTop: 4 }}>
              {testMode !== null ? 'Data nedan är simulerad. Avsluta via Inställningar.' : 'Visar simulerad data. Försök igen senare.'}
            </div>
          </div>
        )}

        {/* LAGER 1: GLANCE */}
        <div style={{ padding: '8px 24px 0', textAlign: 'center' }}>
          <div style={{ fontSize: 17, fontWeight: 600 }}>Brandrisk</div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 24px' }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.6)' }}>
            {data.location}
          </div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)' }}>Uppdaterad {updatedTime}</div>
        </div>

        {/* Eldningsförbud */}
        {eldningsforbud && (
          <div style={{ margin: '8px 16px 0', padding: '12px 16px', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,69,58,0.08)', border: '1px solid rgba(255,69,58,0.2)' }}>
            <div style={{ fontSize: 18, flexShrink: 0 }}>&#x1F525;</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: MCF_COLORS[5] }}>Eldningsförbud råder</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 1 }}>Beslut av räddningstjänsten</div>
            </div>
          </div>
        )}

        {/* Current + Peak */}
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: 32, padding: '20px 24px 8px' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', fontWeight: 500, letterSpacing: 0.5, marginBottom: 4 }}>JUST NU KL {nowHour.toString().padStart(2, '0')}</div>
            <div style={{ fontSize: 44, fontWeight: 700, letterSpacing: -2, lineHeight: 1, color: MCF_COLORS[currentIdx] }}>{currentIdx}</div>
            <div style={{ fontSize: 11, marginTop: 6, fontWeight: 600, color: MCF_COLORS[currentIdx] }}>{MCF_TEXTS[currentIdx]?.short || ''} brandrisk</div>
            <div style={{ fontSize: 10, marginTop: 2, color: 'rgba(255,255,255,0.3)' }}>FWI {currentFwi}</div>
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.12)', paddingBottom: 14 }}>&rarr;</div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', fontWeight: 500, letterSpacing: 0.5, marginBottom: 4 }}>DAGENS TOPP KL {peakHour.toString().padStart(2, '0')}</div>
            <div style={{ fontSize: 44, fontWeight: 700, letterSpacing: -2, lineHeight: 1, color: MCF_COLORS[peakIdx] }}>{peakIdx}</div>
            <div style={{ fontSize: 11, marginTop: 6, fontWeight: 600, color: MCF_COLORS[peakIdx] }}>{MCF_TEXTS[peakIdx]?.short || ''} brandrisk</div>
            <div style={{ fontSize: 10, marginTop: 2, color: 'rgba(255,255,255,0.3)' }}>FWI {peakFwi}</div>
          </div>
        </div>

        {/* Eldningsförbud toggle */}
        <div style={{ margin: '8px 16px', padding: '10px 16px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 13, color: '#fff', fontWeight: 500 }}>Råder eldningsförbud?</div>
          <div style={{ display: 'flex', gap: 6, padding: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 12, width: 120 }}>
            {[true, false].map(val => (
              <button key={String(val)} onClick={() => onEldningsforbudChange(val)}
                style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', background: eldningsforbud === val ? (val ? '#ef4444' : 'rgba(255,255,255,0.3)') : 'transparent', color: eldningsforbud === val ? (val ? '#fff' : '#000') : 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: eldningsforbud === val ? 700 : 500, cursor: 'pointer' }}>
                {val ? 'Ja' : 'Nej'}
              </button>
            ))}
          </div>
        </div>

        {/* LAGER 2: PLANERING - Fire Clock */}
        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 20, margin: '12px 16px 10px', padding: '24px 16px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 16, textAlign: 'left', paddingLeft: 4 }}>
            Brandriskklocka – {clockLabel} {clockDate && `${clockDate}`}
          </div>
          <div style={{ position: 'relative', width: 320, height: 320, margin: '0 auto' }}>
            <FireClock hourlyIdx={clockHourlyIdx} nowHour={activeDay === 0 ? nowHour : 12} nowMinute={activeDay === 0 ? nowMinute : undefined} />
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none' }}>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', fontWeight: 500, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 2 }}>Lägre beräknad risk</div>
              <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.5, color: MCF_COLORS[lowestIdx] || MCF_COLORS[1] }}>
                {lowestStart.toString().padStart(2, '0')}–{lowestEnd.toString().padStart(2, '0')}
              </div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginBottom: 8 }}>Nivå {lowestIdx} · {MCF_TEXTS[lowestIdx]?.short || ''}</div>
              <div style={{ width: 30, height: 1, background: 'rgba(255,255,255,0.06)', margin: '6px auto 8px' }} />
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', fontWeight: 500, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 2 }}>Högst beräknad risk</div>
              <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.5, color: MCF_COLORS[highestIdx] || MCF_COLORS[4] }}>
                {highestStart.toString().padStart(2, '0')}–{highestEnd.toString().padStart(2, '0')}
              </div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>Nivå {highestIdx} · {MCF_TEXTS[highestIdx]?.short || ''}</div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
            {[1,2,3,4,5,6].map(i => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, color: 'rgba(255,255,255,0.35)' }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: MCF_COLORS[i], flexShrink: 0 }} />{i}
              </div>
            ))}
          </div>

          {/* Day selector */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginTop: 16 }}>
            {sortedDaily.slice(0, 7).map((d, i) => (
              <button key={i} onClick={() => setActiveDay(i)} style={{ padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500, color: activeDay === i ? '#fff' : 'rgba(255,255,255,0.3)', background: activeDay === i ? 'rgba(255,255,255,0.08)' : 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                {d.dayName}
              </button>
            ))}
          </div>

          {windHumNote && (
            <div style={{ marginTop: 14, fontSize: 12, color: 'rgba(255,255,255,0.2)' }}>{windHumNote}</div>
          )}
        </div>

        {/* VECKA - Week forecast with bars */}
        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 16, margin: '0 16px 10px', padding: '18px 20px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 14 }}>Vecka – högsta nivå per dag</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {sortedDaily.map((d, i) => (
              <div key={i}>
                <div style={{ display: 'flex', alignItems: 'center', padding: '12px 0', gap: 12, ...(i === 0 ? { background: 'rgba(255,255,255,0.03)', margin: '0 -20px', padding: '12px 20px', borderRadius: 10 } : {}) }}>
                  <div style={{ width: 32, fontSize: 14, fontWeight: 500, color: i === 0 ? '#fff' : 'rgba(255,255,255,0.5)', flexShrink: 0 }}>{d.dayName}</div>
                  <div style={{ flex: 1, height: 28, background: 'rgba(255,255,255,0.03)', borderRadius: 8, overflow: 'hidden', position: 'relative' }}>
                    <div style={{ height: '100%', width: barWidths[d.fwiIndex] || '17%', background: MCF_COLORS[d.fwiIndex], borderRadius: 8, display: 'flex', alignItems: 'center', paddingLeft: 10, gap: 6, boxShadow: BAR_GLOW[d.fwiIndex] || 'none' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(0,0,0,0.7)' }}>{d.fwiIndex}</span>
                      {d.fwiIndex > 1 && <span style={{ fontSize: 11, fontWeight: 500, color: 'rgba(0,0,0,0.5)' }}>{MCF_TEXTS[d.fwiIndex]?.short || ''}</span>}
                    </div>
                  </div>
                  <div style={{ width: 70, flexShrink: 0, textAlign: 'right', fontSize: 12, color: 'rgba(255,255,255,0.3)', fontWeight: 500, lineHeight: 1.3 }}>
                    FWI <span style={{ fontWeight: 700, color: 'rgba(255,255,255,0.55)' }}>{d.fwi}</span><br />
                    <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.15)', fontWeight: 400 }}>topp kl {d.peakHour}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, padding: '2px 0 0 44px', fontSize: 10, color: 'rgba(255,255,255,0.18)' }}>
                  <span style={{ color: wxColor[d.windLevel] || 'inherit' }}>{d.wind}</span>
                  <span>{d.temp}</span>
                  <span style={{ color: wxColor[d.humLevel] || 'inherit' }}>{d.humidity}</span>
                  {d.rain && <span style={{ color: 'rgba(52,199,89,0.45)', background: 'rgba(52,199,89,0.06)', padding: '0 4px', borderRadius: 3 }}>Regn</span>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* LAGER 3: FÖRDJUPNING */}
        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 16, margin: '0 16px 10px', padding: '18px 20px' }}>
          <Collapsible title="Vad betyder nivåerna?" borderTop={false}>
            {[1,2,3,4,5,6].map(i => (
              <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 0', alignItems: 'flex-start', borderBottom: i < 6 ? '1px solid rgba(255,255,255,0.03)' : 'none' }}>
                <div style={{ width: 24, height: 24, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'rgba(0,0,0,0.7)', flexShrink: 0, marginTop: 1, background: MCF_COLORS[i] }}>{i}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2, color: MCF_COLORS[i] }}>{MCF_TEXTS[i].name}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', lineHeight: 1.4 }}>{MCF_TEXTS[i].desc}</div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.18)', marginTop: 3, fontWeight: 500 }}>{MCF_TEXTS[i].fwi}</div>
                </div>
              </div>
            ))}
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.12)', paddingTop: 10, textAlign: 'center' }}>Källa: MCF (Brandrisk Ute) · SMHI · Skogforsk</div>
          </Collapsible>

          <Collapsible title="Samrådsrutin vid nivå 4 eller högre">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '10px 0' }}>
              {SAMRAD_STEPS.map((s, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(255,159,10,0.12)', color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>{i + 1}</div>
                  <div style={{ flex: 1, fontSize: 12, lineHeight: 1.5 }}>
                    <strong style={{ color: 'rgba(255,255,255,0.5)', display: 'block', fontWeight: 600, marginBottom: 1 }}>{s.title}</strong>
                    <span style={{ color: 'rgba(255,255,255,0.25)' }}>{s.desc}</span>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.12)', paddingTop: 10, textAlign: 'center' }}>Källa: Skogforsk – Branschgemensamma riktlinjer för riskhantering avseende brand (2022)</div>
          </Collapsible>

          <Collapsible title="Källor och dokument">
            <div style={{ padding: '8px 0' }}>
              {DOCS.map((group, gi) => (
                <div key={gi}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, color: 'rgba(255,255,255,0.9)', padding: gi === 0 ? '0 0 6px' : '14px 0 6px' }}>{group.group}</div>
                  {group.items.map((doc, di) => (
                    <a key={di} href={doc.url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', textDecoration: 'none', borderBottom: di < group.items.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none', color: '#60a5fa' }}>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: 12, fontWeight: 500, color: '#60a5fa' }}>{doc.title}</span>
                        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 1 }}>{doc.sub}</span>
                      </div>
                      <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 16, flexShrink: 0 }}>&#x203A;</span>
                    </a>
                  ))}
                </div>
              ))}
            </div>
          </Collapsible>
        </div>

        {/* === OPERATIONAL SECTIONS (from old panel) === */}

        {/* Samråd brandrisk (vid nivå 4 eller testläge) */}
        {(currentIdx >= 4 || testMode !== null) && (
          <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 16, margin: '0 16px 10px', padding: '18px 20px' }}>
            <details open>
              <summary style={summaryStyle}>
                <span>Samråd brandrisk</span>
                {brandSamrad.kvitterad ? <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: 0, textTransform: 'none' as const, color: '#22c55e' }}>Kvitterat</span> : <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.2)' }}>&#x203A;</span>}
              </summary>
              <div style={{ marginTop: 12 }}>
                <div style={textStyle}>Enligt Skogforsks branschgemensamma riktlinjer (2022) krävs samråd mellan uppdragstagare och uppdragsgivare vid FWI &#x2265; 4.</div>
                {/* Beredskapsnivå */}
                <div style={{ marginTop: 16, fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>Beredskapsnivå</div>
                <div style={{ display: 'flex', gap: 6, padding: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 12, marginBottom: 16 }}>
                  {(['normal', 'hojd'] as const).map(niva => (
                    <button key={niva} onClick={() => onSamradChange({ ...brandSamrad, beredskapsniva: niva })}
                      style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: 'none', background: brandSamrad.beredskapsniva === niva ? (niva === 'hojd' ? '#eab308' : '#22c55e') : 'transparent', color: brandSamrad.beredskapsniva === niva ? '#000' : 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: brandSamrad.beredskapsniva === niva ? 700 : 500, cursor: 'pointer' }}>
                      {niva === 'normal' ? 'Normal' : 'Höjd'}
                    </button>
                  ))}
                </div>
                {/* Åtgärder */}
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>Beslutade åtgärder</div>
                <div style={{ marginBottom: 16 }}>
                  {atgardsAlternativ.map((atg, i) => (
                    <div key={i} onClick={() => onSamradChange({ ...brandSamrad, atgarder: brandSamrad.atgarder.includes(atg) ? brandSamrad.atgarder.filter((a: string) => a !== atg) : [...brandSamrad.atgarder, atg] })}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <div style={{ width: 18, height: 18, borderRadius: 4, border: `1.5px solid ${brandSamrad.atgarder.includes(atg) ? '#22c55e' : 'rgba(255,255,255,0.15)'}`, background: brandSamrad.atgarder.includes(atg) ? 'rgba(34,197,94,0.12)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {brandSamrad.atgarder.includes(atg) && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3"><path d="M5 13l4 4L19 7" /></svg>}
                      </div>
                      <span style={{ fontSize: 13, color: brandSamrad.atgarder.includes(atg) ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.6)', textDecoration: brandSamrad.atgarder.includes(atg) ? 'line-through' : 'none', lineHeight: 1.4 }}>{atg}</span>
                    </div>
                  ))}
                  {brandSamrad.atgarder.includes('Tidsanpassad körning') && (
                    <input type="text" placeholder="Vilka timmar?" value={brandSamrad.kortider} onChange={e => onSamradChange({ ...brandSamrad, kortider: e.target.value })} style={{ ...inputStyle, marginTop: 8 }} />
                  )}
                </div>
                {/* Blöt mark undantag */}
                <div style={{ background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.2)', borderRadius: 12, padding: 14, marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 12, color: '#60a5fa', fontWeight: 500 }}>Arbete sker enbart på blöt mark (myr/sumpskog)</span>
                    <div style={{ display: 'flex', gap: 6, padding: 3, background: 'rgba(255,255,255,0.05)', borderRadius: 10, width: 100 }}>
                      {[true, false].map(val => (
                        <button key={String(val)} onClick={() => onSamradChange({ ...brandSamrad, blotMarkUndantag: val })}
                          style={{ flex: 1, padding: '6px 0', borderRadius: 7, border: 'none', background: brandSamrad.blotMarkUndantag === val ? '#60a5fa' : 'transparent', color: brandSamrad.blotMarkUndantag === val ? '#000' : 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: brandSamrad.blotMarkUndantag === val ? 700 : 500, cursor: 'pointer' }}>
                          {val ? 'Ja' : 'Nej'}
                        </button>
                      ))}
                    </div>
                  </div>
                  {brandSamrad.blotMarkUndantag && (
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6 }}>
                      Dokumentera att maskinen håller sig inom markerat blött område. Band/slirskydd behålls – krävs för bärighet. GPS-spår verifieras mot blöta zoner.
                    </div>
                  )}
                </div>
                {/* Uppdragsgivare */}
                <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 6 }}>Uppdragsgivare kontaktad</div>
                    <input type="text" placeholder="Namn" value={brandSamrad.uppdragsgivareNamn} onChange={e => onSamradChange({ ...brandSamrad, uppdragsgivareNamn: e.target.value })} style={inputStyle} />
                  </div>
                  <div style={{ width: 140, flexShrink: 0 }}>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 6 }}>Telefon</div>
                    <input type="tel" placeholder="07X-XXX XX XX" value={brandSamrad.uppdragsgivareTel} onChange={e => onSamradChange({ ...brandSamrad, uppdragsgivareTel: e.target.value })} style={inputStyle} />
                  </div>
                </div>
                {/* Datum + kvittera */}
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
                  <div style={{ width: 200, flexShrink: 0 }}>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 6 }}>Datum & tid</div>
                    <input type="datetime-local" value={brandSamrad.datum} onChange={e => onSamradChange({ ...brandSamrad, datum: e.target.value })} style={{ ...inputStyle, colorScheme: 'dark' }} />
                  </div>
                  <button onClick={() => onSamradChange({ ...brandSamrad, kvitterad: !brandSamrad.kvitterad })}
                    style={{ flex: 1, padding: 14, borderRadius: 12, border: 'none', background: brandSamrad.kvitterad ? 'rgba(34,197,94,0.15)' : '#22c55e', color: brandSamrad.kvitterad ? '#22c55e' : '#000', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                    {brandSamrad.kvitterad ? 'Kvitterat \u2713' : 'Kvittera samråd'}
                  </button>
                </div>
              </div>
            </details>
          </div>
        )}

        {/* Utrustning */}
        {showSystem && (
          <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 16, margin: '0 16px 10px', padding: '18px 20px' }}>
            <details>
              <summary style={summaryStyle}>
                <span>Utrustning</span>
                <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: 0, textTransform: 'none' as const, color: brandUtrustning.every(Boolean) ? '#22c55e' : 'rgba(255,255,255,0.3)' }}>{brandUtrustning.filter(Boolean).length}/{brandUtrustning.length}</span>
              </summary>
              <div style={{ marginTop: 12 }}>
                <div style={{ ...textStyle, marginBottom: 12 }}>Källa: Brandskyddsföreningens SBF 127</div>
                {utrustLabels.map((label, i) => (
                  <div key={i} onClick={() => { const n = [...brandUtrustning]; n[i] = !n[i]; onUtrustningChange(n); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <div style={{ width: 18, height: 18, borderRadius: 4, border: `1.5px solid ${brandUtrustning[i] ? '#22c55e' : 'rgba(255,255,255,0.15)'}`, background: brandUtrustning[i] ? 'rgba(34,197,94,0.12)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {brandUtrustning[i] && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3"><path d="M5 13l4 4L19 7" /></svg>}
                    </div>
                    <span style={{ fontSize: 13, color: brandUtrustning[i] ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.6)', textDecoration: brandUtrustning[i] ? 'line-through' : 'none', lineHeight: 1.4 }}>{label}</span>
                  </div>
                ))}
              </div>
            </details>
          </div>
        )}

        {/* Närmaste vatten */}
        {showSystem && (
          <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 16, margin: '0 16px 10px', padding: '18px 20px' }}>
            <details>
              <summary style={summaryStyle}>
                <span>Närmaste vatten</span>
                <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.2)' }}>&#x203A;</span>
              </summary>
              <div style={{ marginTop: 12 }}>
                {brandNearbyWater.length === 0 && <div style={textStyle}>Söker...</div>}
                {brandNearbyWater.map((w, i) => (
                  <a key={i} href={`https://www.google.com/maps/dir/?api=1&destination=${w.lat},${w.lon}`} target="_blank" rel="noopener noreferrer"
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', textDecoration: 'none' }}>
                    <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>{'\u{1F4A7}'} {w.name}</span>
                    <span style={linkStyle}>{w.dist < 1000 ? `${w.dist}m` : `${(w.dist / 1000).toFixed(1)} km`} &rarr;</span>
                  </a>
                ))}
              </div>
            </details>
          </div>
        )}

        {/* Närmaste brandstation */}
        {showSystem && (
          <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 16, margin: '0 16px 10px', padding: '18px 20px' }}>
            <details>
              <summary style={summaryStyle}>
                <span>Närmaste brandstation</span>
                <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.2)' }}>&#x203A;</span>
              </summary>
              <div style={{ marginTop: 12 }}>
                {brandNearbyFireStation.length === 0 && <div style={textStyle}>Söker...</div>}
                {brandNearbyFireStation.map((s, i) => (
                  <a key={i} href={`https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lon}`} target="_blank" rel="noopener noreferrer"
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', textDecoration: 'none' }}>
                    <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>{'\u{1F692}'} {s.name}</span>
                    <span style={linkStyle}>{(s.dist / 1000).toFixed(1)} km (~{Math.round(s.dist / 1000 / 60 * 60)} min) &rarr;</span>
                  </a>
                ))}
              </div>
            </details>
          </div>
        )}

        {/* Larmkoordinat & mötesplats */}
        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 16, margin: '0 16px 10px', padding: '18px 20px' }}>
          <details>
            <summary style={summaryStyle}>
              <span>Larmkoordinat & mötesplats</span>
              <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.2)' }}>&#x203A;</span>
            </summary>
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#fff', fontFamily: 'monospace', marginBottom: 4 }}>
                {mapCenter.lat.toFixed(4)}°N, {mapCenter.lng.toFixed(4)}°E
              </div>
              <button onClick={() => navigator.clipboard?.writeText(`${mapCenter.lat.toFixed(6)}, ${mapCenter.lng.toFixed(6)}`)}
                style={{ fontSize: 12, color: '#60a5fa', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 12 }}>
                Kopiera koordinater
              </button>
              <div style={{ ...textStyle, marginBottom: 12 }}>Ge denna position vid larm till 112</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 6 }}>Tillfartsväg</div>
              <textarea value={brandLarmTillfart} onChange={e => onLarmTillfartChange(e.target.value)} placeholder="Beskriv bästa tillfartsväg..."
                style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} />
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 16, marginBottom: 8 }}>Vid larm – förmedla</div>
              {larmLabels.map((label, i) => (
                <div key={i} onClick={() => { const n = [...brandLarmChecklista]; n[i] = !n[i]; onLarmChecklistaChange(n); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', cursor: 'pointer' }}>
                  <div style={{ width: 16, height: 16, borderRadius: 3, border: `1.5px solid ${brandLarmChecklista[i] ? '#22c55e' : 'rgba(255,255,255,0.15)'}`, background: brandLarmChecklista[i] ? 'rgba(34,197,94,0.12)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {brandLarmChecklista[i] && <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3"><path d="M5 13l4 4L19 7" /></svg>}
                  </div>
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.4 }}>{label}</span>
                </div>
              ))}
            </div>
          </details>
        </div>

        {/* Kontakter */}
        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 16, margin: '0 16px 10px', padding: '18px 20px' }}>
          <details>
            <summary style={summaryStyle}>
              <span>Kontakter</span>
              <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.2)' }}>&#x203A;</span>
            </summary>
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[
                { label: 'Uppdragsgivare', nameKey: 'uppdragsgivareNamn', telKey: 'uppdragsgivareTel' },
                { label: 'Försäkringsbolag', nameKey: 'forsakringsbolag', telKey: 'forsakringsnummer' },
                { label: 'Lokal räddningstjänst', nameKey: 'raddningstjanstNamn', telKey: 'raddningstjanstTel' },
              ].map(({ label, nameKey, telKey }) => (
                <div key={nameKey}>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 6 }}>{label}</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input type="text" placeholder="Namn" value={(brandKontakter as any)[nameKey]} onChange={e => onKontakterChange({ ...brandKontakter, [nameKey]: e.target.value })} style={{ ...inputStyle, flex: 1 }} />
                    <div style={{ position: 'relative', width: 160 }}>
                      <input type="tel" placeholder={telKey === 'forsakringsnummer' ? 'Nummer' : 'Telefon'} value={(brandKontakter as any)[telKey]} onChange={e => onKontakterChange({ ...brandKontakter, [telKey]: e.target.value })} style={inputStyle} />
                      {(brandKontakter as any)[telKey] && telKey !== 'forsakringsnummer' && (
                        <a href={`tel:${(brandKontakter as any)[telKey]}`} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 16, textDecoration: 'none' }}>{'\u{1F4DE}'}</a>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </details>
        </div>

        {/* Rapportera brandtillbud */}
        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 16, margin: '0 16px 10px', padding: '18px 20px' }}>
          <details>
            <summary style={summaryStyle}>
              <span>Rapportera brandtillbud</span>
              <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.2)' }}>&#x203A;</span>
            </summary>
            <div style={{ marginTop: 12 }}>
              <div style={textStyle}>Alla brandtillbud oavsett storlek ska rapporteras till uppdragsgivare (Skogforsk).</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
                <input type="datetime-local" value={brandNewTillbud.datum} onChange={e => onNewTillbudChange({ ...brandNewTillbud, datum: e.target.value })} style={{ ...inputStyle, colorScheme: 'dark' }} />
                <textarea placeholder="Vad hände?" value={brandNewTillbud.beskrivning} onChange={e => onNewTillbudChange({ ...brandNewTillbud, beskrivning: e.target.value })} style={{ ...inputStyle, minHeight: 50, resize: 'vertical' }} />
                <textarea placeholder="Åtgärd vidtagen" value={brandNewTillbud.atgard} onChange={e => onNewTillbudChange({ ...brandNewTillbud, atgard: e.target.value })} style={{ ...inputStyle, minHeight: 50, resize: 'vertical' }} />
                <input type="text" placeholder="Rapporterad till (namn)" value={brandNewTillbud.rapporteradTill} onChange={e => onNewTillbudChange({ ...brandNewTillbud, rapporteradTill: e.target.value })} style={inputStyle} />
                <button onClick={onSaveTillbud}
                  style={{ padding: 14, borderRadius: 12, border: 'none', background: '#60a5fa', color: '#000', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                  Spara tillbud
                </button>
              </div>
              {brandTillbud.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginBottom: 8 }}>Tidigare tillbud</div>
                  {brandTillbud.map((t, i) => (
                    <div key={i} style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <span style={{ color: 'rgba(255,255,255,0.6)' }}>{new Date(t.datum).toLocaleDateString('sv-SE')}</span> – {t.beskrivning.slice(0, 50)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </details>
        </div>

        {/* Brandvaktslogg */}
        {brandSamrad.atgarder.includes('Brandvakt utsedd') && (
          <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 16, margin: '0 16px 10px', padding: '18px 20px' }}>
            <details>
              <summary style={summaryStyle}>
                <span>Brandvaktslogg</span>
                <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.2)' }}>&#x203A;</span>
              </summary>
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <input type="text" placeholder="Brandvaktens namn" value={brandBrandvakt.namn} onChange={e => onBrandvaktChange({ ...brandBrandvakt, namn: e.target.value })} style={inputStyle} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>Start</div>
                    <input type="datetime-local" value={brandBrandvakt.starttid} onChange={e => onBrandvaktChange({ ...brandBrandvakt, starttid: e.target.value })} style={{ ...inputStyle, colorScheme: 'dark' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>Slut</div>
                    <input type="datetime-local" value={brandBrandvakt.sluttid} onChange={e => onBrandvaktChange({ ...brandBrandvakt, sluttid: e.target.value })} style={{ ...inputStyle, colorScheme: 'dark' }} />
                  </div>
                </div>
                <textarea placeholder="Noteringar" value={brandBrandvakt.noteringar} onChange={e => onBrandvaktChange({ ...brandBrandvakt, noteringar: e.target.value })} style={{ ...inputStyle, minHeight: 50, resize: 'vertical' }} />
                <button onClick={onSaveBrandvakt}
                  style={{ padding: 14, borderRadius: 12, border: 'none', background: '#60a5fa', color: '#000', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                  Spara brandvaktslogg
                </button>
              </div>
            </details>
          </div>
        )}

        {/* Efterkontroll */}
        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 16, margin: '0 16px 10px', padding: '18px 20px' }}>
          <details>
            <summary style={summaryStyle}>
              <span>Efterkontroll</span>
              {brandEfterkontroll.kvitterad ? <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: 0, textTransform: 'none' as const, color: '#22c55e' }}>Utförd &#x2713;</span> : <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.2)' }}>&#x203A;</span>}
            </summary>
            <div style={{ marginTop: 12 }}>
              <div style={textStyle}>Trakten ska avsynas efter avslutat arbete (Skogforsk).</div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginTop: 14 }}>
                <div style={{ width: 200, flexShrink: 0 }}>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 6 }}>Datum & tid</div>
                  <input type="datetime-local" value={brandEfterkontroll.datum} onChange={e => onEfterkontrollChange({ ...brandEfterkontroll, datum: e.target.value })} style={{ ...inputStyle, colorScheme: 'dark' }} />
                </div>
                <button onClick={() => onEfterkontrollChange({ ...brandEfterkontroll, kvitterad: !brandEfterkontroll.kvitterad })}
                  style={{ flex: 1, padding: 14, borderRadius: 12, border: 'none', background: brandEfterkontroll.kvitterad ? 'rgba(34,197,94,0.15)' : '#22c55e', color: brandEfterkontroll.kvitterad ? '#22c55e' : '#000', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                  {brandEfterkontroll.kvitterad ? 'Utförd \u2713' : 'Efterkontroll utförd'}
                </button>
              </div>
              <textarea placeholder="Noteringar" value={brandEfterkontroll.noteringar} onChange={e => onEfterkontrollChange({ ...brandEfterkontroll, noteringar: e.target.value })} style={{ ...inputStyle, marginTop: 10, minHeight: 50, resize: 'vertical' }} />
            </div>
          </details>
        </div>

        {/* Footer */}
        <div style={{ margin: '8px 16px 32px', fontSize: 10, color: 'rgba(255,255,255,0.35)', lineHeight: 1.6, textAlign: 'center' }}>
          Beslutsstöd. Prognoser: SMHI. Brandbeteende: MCF. Riktlinjer: Skogforsk (2022). Bedöm alltid lokalt. Arbetsgivaren ansvarar (AML 1977:1160).
        </div>
      </div>
    </div>
  );
}
