"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { fetchSmhiFwi, generateTestData, type SmhiBrandriskData } from "../../lib/smhi-brandrisk";

// === MCF Color System ===
const MCF_COLORS: Record<number, string> = {
  0: "#8E8E93", 1: "#007AFF", 2: "#34C759",
  3: "#FFD60A", 4: "#FF9F0A", 5: "#FF453A", 6: "#AF52DE",
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

const MCF_BAND_BG: Record<number, string> = {
  0: 'rgba(142,142,147,0.15)',
  1: 'rgba(0,122,255,0.3)',
  2: 'rgba(52,199,89,0.4)',
  3: 'rgba(255,214,10,0.55)',
  4: 'rgba(255,159,10,0.7)',
  5: 'rgba(255,69,58,0.85)',
  6: 'rgba(175,82,222,0.95)',
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
  objektNamn?: string;
  koordFranObjekt: boolean; // true = prognosen gäller objektet, false = kartans mitt (fallback)
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
    objektNamn, koordFranObjekt,
    brandLarmTillfart, onLarmTillfartChange,
    brandLarmChecklista, onLarmChecklistaChange,
    mapCenter,
    onStatusChange,
  } = props;

  const [data, setData] = useState<SmhiBrandriskData | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [isTestFallback, setIsTestFallback] = useState(false);
  const [devSimulating, setDevSimulating] = useState(false);
  const realDataRef = useRef<SmhiBrandriskData | null>(null);
  const [activeDay, setActiveDay] = useState(0);
  const [selectedHour, setSelectedHour] = useState<number | null>(null);
  const refreshRef = useRef<NodeJS.Timeout | null>(null);
  const lastFetchRef = useRef<string>('');

  const nowHour = new Date().getHours();
  const nowMinute = new Date().getMinutes();
  const barWidths: Record<number, string> = { 1: "17%", 2: "33%", 3: "50%", 4: "67%", 5: "83%", 6: "100%" };
  const wxColor: Record<string, string> = { vdry: "rgba(255,69,58,0.4)", dry: "rgba(255,159,10,0.45)" };

  const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: '13px', outline: 'none', boxSizing: 'border-box' };
  const secStyle: React.CSSProperties = { marginTop: '24px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '20px' };
  const headStyle: React.CSSProperties = { fontSize: '17px', fontWeight: 600, color: '#fff', marginBottom: '12px' };
  const summaryStyle: React.CSSProperties = { ...headStyle, cursor: 'pointer', listStyle: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0' };
  const textStyle: React.CSSProperties = { fontSize: '13px', color: '#8e8e93', lineHeight: '1.7' };

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
          <div style={{ fontSize: 15, color: '#8e8e93', fontWeight: 500 }}>Hämtar brandriskdata...</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)', marginTop: 6 }}>SMHI fwif1g API</div>
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

  // Active day's hourly data
  const activeDayData = sortedDaily[activeDay];
  const clockHourlyIdx = activeDayData?.hourlyIdx || data.todayHourlyIdx;

  // Peak timing — longest contiguous block at peak level (handles non-contiguous peaks correctly)
  const activePeakIdx = Math.max(...clockHourlyIdx.filter(i => i > 0));
  const peakBlocks: { start: number; end: number; len: number }[] = [];
  let _blockStart = -1;
  for (let _h = 0; _h <= 24; _h++) {
    const atPeak = _h < 24 && clockHourlyIdx[_h] === activePeakIdx;
    if (atPeak && _blockStart === -1) _blockStart = _h;
    if (!atPeak && _blockStart !== -1) { peakBlocks.push({ start: _blockStart, end: _h - 1, len: _h - _blockStart }); _blockStart = -1; }
  }
  const longestPeakBlock = peakBlocks.length > 0 ? peakBlocks.reduce((a, b) => b.len > a.len ? b : a) : { start: 12, end: 14 };
  const activePeakStart = longestPeakBlock.start;
  const activePeakEnd = longestPeakBlock.end;

  const dagsdelsFras = activePeakStart >= 6 && activePeakStart <= 11 ? 'på förmiddagen'
    : activePeakStart >= 12 && activePeakStart <= 13 ? 'runt lunch'
    : activePeakStart >= 14 && activePeakStart <= 17 ? 'efter lunch'
    : activePeakStart >= 18 && activePeakStart <= 21 ? 'på kvällen'
    : '';
  const peakKl = `kl ${activePeakStart.toString().padStart(2, '0')} till ${activePeakEnd.toString().padStart(2, '0')}`;
  const peakEndKl = `kl ${activePeakEnd.toString().padStart(2, '0')}`;

  // Klartext: koherent rad 1 (rubrik) + rad 2 (underrad). Fem lägen — "farligast senare"
  // används BARA när toppen faktiskt ligger framåt (C/D/E). Är vi i toppen nu (A/A′)
  // byter rad 1 till "just nu" och rad 2 säger när det lättar — kan aldrig motsäga varandra.
  const curShort = MCF_TEXTS[currentIdx]?.short || '';
  const peakShort = MCF_TEXTS[activePeakIdx]?.short || '';
  const farligastRubrik = dagsdelsFras ? `Farligast ${dagsdelsFras} – ${peakKl}` : `Farligast ${peakKl}`;
  const peakStillComing = activeDay === 0 && clockHourlyIdx.some((idx, h) => h >= nowHour && idx === activePeakIdx);

  let klartextRubrik: string;
  let lugnesmening: string;

  if (activeDay !== 0) {
    // Läge E — annan dag (ingen "just nu")
    klartextRubrik = farligastRubrik;
    lugnesmening = `Väntad topp: ${peakShort.toLowerCase()} brandrisk ${dagsdelsFras || peakKl}.`;
  } else if (currentIdx >= activePeakIdx) {
    // Läge A / A′ — vi är i toppen nu
    if (activePeakEnd >= 21) {
      klartextRubrik = 'Farligast just nu';
      lugnesmening = `${curShort} brandrisk – håller i sig kvällen ut.`;
    } else if (activePeakEnd > nowHour) {
      klartextRubrik = `Farligast just nu – till ${peakEndKl}`;
      lugnesmening = `${curShort} brandrisk. Lättar efter ${peakEndKl}.`;
    } else {
      klartextRubrik = `${curShort} brandrisk just nu`;
      lugnesmening = `Som högst ${peakKl} idag.`;
    }
  } else if (!peakStillComing) {
    // Läge B — toppen passerad, avtagande
    klartextRubrik = dagsdelsFras ? `Lugnare nu – toppen var ${dagsdelsFras}` : `Lugnare nu – toppen var ${peakKl}`;
    lugnesmening = `${curShort} brandrisk just nu, avtagande.`;
  } else if (activePeakIdx - currentIdx >= 2) {
    // Läge C — topp kvar, stor uppgång
    klartextRubrik = farligastRubrik;
    lugnesmening = `Lugnt nu (${curShort.toLowerCase()}). Stiger till ${peakShort.toLowerCase()} ${dagsdelsFras || peakKl}.`;
  } else {
    // Läge D — topp kvar, nära
    klartextRubrik = farligastRubrik;
    lugnesmening = `Just nu ${curShort.toLowerCase()} brandrisk – stiger snart till ${peakShort.toLowerCase()}.`;
  }

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
      <style>{`.btn-press{transition:transform 0.1s ease}.btn-press:active{transform:scale(0.96)}`}</style>
      <div style={{ background: '#000', color: '#fff', fontFamily: "-apple-system, 'SF Pro Display', 'Helvetica Neue', sans-serif", maxWidth: 430, margin: '0 auto', WebkitFontSmoothing: 'antialiased' }}>

        {/* TESTLÄGE banner */}
        {(testMode !== null || isTestFallback) && (
          <div style={{ background: 'rgba(255,214,10,0.2)', border: '2px solid #FFD60A', borderRadius: 12, padding: '12px 16px', marginBottom: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#FFD60A' }}>
              {testMode !== null ? `TESTLÄGE – simulerad brandrisk (FWI ${testMode})` : 'TESTLÄGE – kunde inte hämta data'}
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,214,10,0.85)', marginTop: 4 }}>
              {testMode !== null ? 'Data nedan är simulerad. Avsluta via Inställningar.' : 'Visar simulerad data.'}
            </div>
            {isTestFallback && testMode === null && (
              <button className="btn-press" type="button" onClick={() => { lastFetchRef.current = ''; fetchData(); }} style={{ marginTop: 10, padding: '8px 18px', borderRadius: 10, border: 'none', background: '#0a84ff', color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer', minHeight: 40 }}>Försök igen</button>
            )}
          </div>
        )}

        {/* LAGER 1: GLANCE */}
        <div style={{ padding: '8px 24px 0', textAlign: 'center' }}>
          <div style={{ fontSize: 17, fontWeight: 600 }}>Brandrisk</div>
        </div>

        <div style={{ padding: '6px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: '#8e8e93', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {objektNamn ? `${objektNamn} – ` : ''}{data.location}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', flexShrink: 0 }}>Uppdaterad {updatedTime}</div>
          </div>
          {!koordFranObjekt && (
            <div style={{ fontSize: 11, color: '#FF9F0A', marginTop: 3 }}>Position: kartans mitt (objektet saknar koordinat)</div>
          )}
        </div>

        {/* Eldningsförbud */}
        {eldningsforbud && (
          <div style={{ margin: '8px 16px 0', padding: '12px 16px', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,69,58,0.08)', border: '1px solid rgba(255,69,58,0.2)' }}>
            <div style={{ fontSize: 18, flexShrink: 0 }}>&#x1F525;</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: MCF_COLORS[5] }}>Eldningsförbud råder</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 1 }}>Beslut av räddningstjänsten</div>
            </div>
          </div>
        )}

        {/* HERO — dominant current risk */}
        <div style={{ textAlign: 'center', padding: '20px 24px 16px' }}>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.25)', fontWeight: 500, marginBottom: 8 }}>
            JUST NU · KL {nowHour.toString().padStart(2, '0')}
          </div>
          <div style={{ fontSize: 64, fontWeight: 700, letterSpacing: -3, lineHeight: 1, color: MCF_COLORS[currentIdx] }}>
            {currentIdx}
          </div>
          <div style={{ fontSize: 17, marginTop: 8, fontWeight: 600, color: MCF_COLORS[currentIdx] }}>
            {MCF_TEXTS[currentIdx]?.short || ''} brandrisk
          </div>
          <div style={{ fontSize: 13, marginTop: 6, color: 'rgba(255,255,255,0.3)' }}>
            FWI {currentFwi}
            {currentIdx !== peakIdx && (
              <> · Idag topp kl {peakHour.toString().padStart(2, '0')}: nivå {peakIdx} (FWI {peakFwi})</>
            )}
          </div>
        </div>

        {/* VECKA - Week forecast with bars */}
        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 16, margin: '0 16px 10px', padding: '18px 20px' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.3)', marginBottom: 14 }}>Vecka – högsta nivå per dag</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {sortedDaily.map((d, i) => (
              <div key={i}>
                <div style={{ display: 'flex', alignItems: 'center', padding: '12px 0', gap: 12, ...(i === 0 ? { background: 'rgba(255,255,255,0.03)', margin: '0 -20px', padding: '12px 20px', borderRadius: 10 } : {}) }}>
                  <div style={{ width: 32, fontSize: 15, fontWeight: 500, color: i === 0 ? '#fff' : '#8e8e93', flexShrink: 0 }}>{d.dayName}</div>
                  <div style={{ flex: 1, height: 28, background: 'rgba(255,255,255,0.03)', borderRadius: 8, overflow: 'hidden', position: 'relative' }}>
                    <div style={{ height: '100%', width: barWidths[d.fwiIndex] || '17%', background: MCF_COLORS[d.fwiIndex], borderRadius: 8, display: 'flex', alignItems: 'center', paddingLeft: 10, gap: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(0,0,0,0.7)' }}>{d.fwiIndex}</span>
                      {d.fwiIndex > 1 && <span style={{ fontSize: 11, fontWeight: 500, color: 'rgba(0,0,0,0.5)' }}>{MCF_TEXTS[d.fwiIndex]?.short || ''}</span>}
                    </div>
                  </div>
                  <div style={{ width: 70, flexShrink: 0, textAlign: 'right', fontSize: 12, color: 'rgba(255,255,255,0.3)', fontWeight: 500, lineHeight: 1.3 }}>
                    FWI <span style={{ fontWeight: 700, color: '#8e8e93' }}>{d.fwi}</span><br />
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.15)', fontWeight: 400 }}>topp kl {d.peakHour}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, padding: '2px 0 0 44px', fontSize: 11, color: 'rgba(255,255,255,0.18)' }}>
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
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', lineHeight: 1.4 }}>{MCF_TEXTS[i].desc}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.18)', marginTop: 3, fontWeight: 500 }}>{MCF_TEXTS[i].fwi}</div>
                </div>
              </div>
            ))}
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.12)', paddingTop: 10, textAlign: 'center' }}>Källa: MCF (Brandrisk Ute) · SMHI · Skogforsk</div>
          </Collapsible>

          <Collapsible title="Samrådsrutin vid nivå 4 eller högre">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '10px 0' }}>
              {SAMRAD_STEPS.map((s, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(255,159,10,0.12)', color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>{i + 1}</div>
                  <div style={{ flex: 1, fontSize: 12, lineHeight: 1.5 }}>
                    <strong style={{ color: '#8e8e93', display: 'block', fontWeight: 600, marginBottom: 1 }}>{s.title}</strong>
                    <span style={{ color: 'rgba(255,255,255,0.25)' }}>{s.desc}</span>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.12)', paddingTop: 10, textAlign: 'center' }}>Källa: Skogforsk – Branschgemensamma riktlinjer för riskhantering avseende brand (2022)</div>
          </Collapsible>

          <Collapsible title="Källor och dokument">
            <div style={{ padding: '8px 0' }}>
              {DOCS.map((group, gi) => (
                <div key={gi}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.9)', padding: gi === 0 ? '0 0 6px' : '14px 0 6px' }}>{group.group}</div>
                  {group.items.map((doc, di) => (
                    <a key={di} href={doc.url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', textDecoration: 'none', borderBottom: di < group.items.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none', color: '#0a84ff' }}>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: 12, fontWeight: 500, color: '#0a84ff' }}>{doc.title}</span>
                        <span style={{ fontSize: 11, color: '#8e8e93', marginTop: 1 }}>{doc.sub}</span>
                      </div>
                      <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 16, flexShrink: 0 }}>&#x203A;</span>
                    </a>
                  ))}
                </div>
              ))}
            </div>
          </Collapsible>
        </div>

        {/* LAGER 2: TIDSBAND */}
        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 20, margin: '12px 16px 10px', padding: '20px 16px 16px' }}>
          <div style={{ fontSize: 15, fontWeight: 500, color: '#fff', marginBottom: 4 }}>🔥 {klartextRubrik}</div>
          <div style={{ fontSize: 13, color: '#8e8e93', marginBottom: 16 }}>{lugnesmening}</div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginBottom: 16 }}>
            {sortedDaily.slice(0, 7).map((d, i) => (
              <button key={i} onClick={() => { setActiveDay(i); setSelectedHour(null); }}
                style={{ padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500, color: activeDay === i ? '#fff' : 'rgba(255,255,255,0.3)', background: activeDay === i ? 'rgba(255,255,255,0.08)' : 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                {d.dayName}
              </button>
            ))}
          </div>
          <div style={{ position: 'relative' }}>
            <div style={{ display: 'flex', gap: 2, borderRadius: 8, overflow: 'hidden' }}>
              {clockHourlyIdx.map((idx, h) => {
                const isNow = activeDay === 0 && h === nowHour;
                return (
                  <div key={h} onClick={() => setSelectedHour(selectedHour === h ? null : h)}
                    style={{ flex: 1, height: 34, background: MCF_BAND_BG[idx] || MCF_BAND_BG[1], cursor: 'pointer', boxSizing: 'border-box', boxShadow: isNow ? 'inset 0 0 0 2px rgba(255,255,255,0.9)' : 'none' }}
                  />
                );
              })}
            </div>
            {activeDay === 0 && (
              <div style={{ position: 'absolute', top: '100%', marginTop: 2, left: `${(nowHour + 0.5) / 24 * 100}%`, transform: 'translateX(-50%)', fontSize: 8, color: '#8e8e93', lineHeight: 1, pointerEvents: 'none' }}>▲</div>
            )}
          </div>
          <div style={{ display: 'flex', marginTop: 14 }}>
            {[
              { label: 'Natt', hours: 6, startH: 0 },
              { label: 'Morgon', hours: 6, startH: 6 },
              { label: 'Lunch', hours: 2, startH: 12 },
              { label: 'Eftermiddag', hours: 4, startH: 14 },
              { label: 'Kväll', hours: 6, startH: 18 },
            ].map(({ label, hours, startH }) => {
              const isCurrent = activeDay === 0 && nowHour >= startH && nowHour < startH + hours;
              return (
                <div key={label} style={{ flex: hours, textAlign: 'center', fontSize: 10, letterSpacing: -0.2, color: isCurrent ? '#8e8e93' : 'rgba(255,255,255,0.2)', fontWeight: isCurrent ? 500 : 400, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', padding: '0 2px', boxSizing: 'border-box' }}>
                  {label}
                </div>
              );
            })}
          </div>
          <div style={{ position: 'relative', height: 16, marginTop: 2 }}>
            {[0, 6, 12, 18, 23].map(h => (
              <div key={h} style={{ position: 'absolute', ...(h === 23 ? { right: 0 } : { left: `${(h / 24) * 100}%`, transform: h === 0 ? 'none' : 'translateX(-50%)' }), fontSize: 11, color: 'rgba(255,255,255,0.2)', whiteSpace: 'nowrap' }}>
                kl {h.toString().padStart(2, '0')}
              </div>
            ))}
          </div>
          {selectedHour !== null && (
            <div style={{ marginTop: 10, textAlign: 'center', fontSize: 13, color: '#fff', background: 'rgba(255,255,255,0.08)', borderRadius: 10, padding: '8px 12px' }}>
              kl {selectedHour.toString().padStart(2, '0')}: {MCF_TEXTS[clockHourlyIdx[selectedHour]]?.short || ''} brandrisk (nivå {clockHourlyIdx[selectedHour]})
            </div>
          )}
        </div>

        {/* === BEREDSKAP-avdelare — skiljer daglig prognos (ovan) från admin (nedan) === */}
        <div style={{ margin: '28px 16px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 2, color: '#8e8e93' }}>BEREDSKAP</span>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', textAlign: 'center', marginTop: 6 }}>Vid förhöjd risk · en gång per objekt</div>
        </div>

        {/* Eldningsförbud toggle */}
        <div style={{ margin: '8px 16px', padding: '10px 16px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 13, color: '#fff', fontWeight: 500 }}>Råder eldningsförbud?</div>
          <div style={{ display: 'flex', gap: 6, padding: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 12, width: 120 }}>
            {[true, false].map(val => (
              <button key={String(val)} onClick={() => onEldningsforbudChange(val)}
                style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', background: eldningsforbud === val ? (val ? '#ff453a' : 'rgba(255,255,255,0.3)') : 'transparent', color: eldningsforbud === val ? (val ? '#fff' : '#000') : '#8e8e93', fontSize: 12, fontWeight: eldningsforbud === val ? 700 : 500, cursor: 'pointer' }}>
                {val ? 'Ja' : 'Nej'}
              </button>
            ))}
          </div>
        </div>

        {/* === OPERATIONAL SECTIONS (from old panel) === */}

        {/* Samråd brandrisk (vid nivå 4 eller testläge) */}
        {(currentIdx >= 4 || testMode !== null) && (
          <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 16, margin: '0 16px 10px', padding: '18px 20px' }}>
            <details open>
              <summary style={summaryStyle}>
                <span>Samråd brandrisk</span>
                {brandSamrad.kvitterad ? <span style={{ fontSize: 12, fontWeight: 500, textTransform: 'none' as const, color: '#30d158' }}>Kvitterat</span> : <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.2)' }}>&#x203A;</span>}
              </summary>
              <div style={{ marginTop: 12 }}>
                <div style={textStyle}>Enligt Skogforsks branschgemensamma riktlinjer (2022) krävs samråd mellan uppdragstagare och uppdragsgivare vid FWI &#x2265; 4.</div>
                {/* Beredskapsnivå */}
                <div style={{ marginTop: 16, fontSize: 12, color: '#8e8e93', marginBottom: 8 }}>Beredskapsnivå</div>
                <div style={{ display: 'flex', gap: 6, padding: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 12, marginBottom: 16 }}>
                  {(['normal', 'hojd'] as const).map(niva => (
                    <button key={niva} onClick={() => onSamradChange({ ...brandSamrad, beredskapsniva: niva })}
                      style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: 'none', background: brandSamrad.beredskapsniva === niva ? (niva === 'hojd' ? '#FFD60A' : '#30d158') : 'transparent', color: brandSamrad.beredskapsniva === niva ? '#000' : '#8e8e93', fontSize: 12, fontWeight: brandSamrad.beredskapsniva === niva ? 700 : 500, cursor: 'pointer' }}>
                      {niva === 'normal' ? 'Normal' : 'Höjd'}
                    </button>
                  ))}
                </div>
                {/* Åtgärder */}
                <div style={{ fontSize: 12, color: '#8e8e93', marginBottom: 8 }}>Beslutade åtgärder</div>
                <div style={{ marginBottom: 16 }}>
                  {atgardsAlternativ.map((atg, i) => (
                    <div key={i} onClick={() => onSamradChange({ ...brandSamrad, atgarder: brandSamrad.atgarder.includes(atg) ? brandSamrad.atgarder.filter((a: string) => a !== atg) : [...brandSamrad.atgarder, atg] })}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <div style={{ width: 18, height: 18, borderRadius: 4, border: `1.5px solid ${brandSamrad.atgarder.includes(atg) ? '#30d158' : 'rgba(255,255,255,0.15)'}`, background: brandSamrad.atgarder.includes(atg) ? 'rgba(34,197,94,0.12)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {brandSamrad.atgarder.includes(atg) && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#30d158" strokeWidth="3"><path d="M5 13l4 4L19 7" /></svg>}
                      </div>
                      <span style={{ fontSize: 13, color: brandSamrad.atgarder.includes(atg) ? 'rgba(255,255,255,0.3)' : '#8e8e93', textDecoration: brandSamrad.atgarder.includes(atg) ? 'line-through' : 'none', lineHeight: 1.4 }}>{atg}</span>
                    </div>
                  ))}
                  {brandSamrad.atgarder.includes('Tidsanpassad körning') && (
                    <input type="text" placeholder="Vilka timmar?" value={brandSamrad.kortider} onChange={e => onSamradChange({ ...brandSamrad, kortider: e.target.value })} style={{ ...inputStyle, marginTop: 8 }} />
                  )}
                </div>
                {/* Blöt mark undantag */}
                <div style={{ background: 'rgba(10,132,255,0.08)', border: '1px solid rgba(10,132,255,0.2)', borderRadius: 12, padding: 14, marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 12, color: '#0a84ff', fontWeight: 500 }}>Arbete sker enbart på blöt mark (myr/sumpskog)</span>
                    <div style={{ display: 'flex', gap: 6, padding: 3, background: 'rgba(255,255,255,0.05)', borderRadius: 10, width: 100 }}>
                      {[true, false].map(val => (
                        <button key={String(val)} onClick={() => onSamradChange({ ...brandSamrad, blotMarkUndantag: val })}
                          style={{ flex: 1, padding: '6px 0', borderRadius: 7, border: 'none', background: brandSamrad.blotMarkUndantag === val ? '#0a84ff' : 'transparent', color: brandSamrad.blotMarkUndantag === val ? '#000' : '#8e8e93', fontSize: 11, fontWeight: brandSamrad.blotMarkUndantag === val ? 700 : 500, cursor: 'pointer' }}>
                          {val ? 'Ja' : 'Nej'}
                        </button>
                      ))}
                    </div>
                  </div>
                  {brandSamrad.blotMarkUndantag && (
                    <div style={{ fontSize: 12, color: '#8e8e93', lineHeight: 1.6 }}>
                      Dokumentera att maskinen håller sig inom markerat blött område. Band/slirskydd behålls – krävs för bärighet. GPS-spår verifieras mot blöta zoner.
                    </div>
                  )}
                </div>
                {/* Uppdragsgivare */}
                <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, color: '#8e8e93', marginBottom: 6 }}>Uppdragsgivare kontaktad</div>
                    <input type="text" placeholder="Namn" value={brandSamrad.uppdragsgivareNamn} onChange={e => onSamradChange({ ...brandSamrad, uppdragsgivareNamn: e.target.value })} style={inputStyle} />
                  </div>
                  <div style={{ width: 140, flexShrink: 0 }}>
                    <div style={{ fontSize: 12, color: '#8e8e93', marginBottom: 6 }}>Telefon</div>
                    <input type="tel" placeholder="07X-XXX XX XX" value={brandSamrad.uppdragsgivareTel} onChange={e => onSamradChange({ ...brandSamrad, uppdragsgivareTel: e.target.value })} style={inputStyle} />
                  </div>
                </div>
                {/* Datum + kvittera */}
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
                  <div style={{ width: 200, flexShrink: 0 }}>
                    <div style={{ fontSize: 12, color: '#8e8e93', marginBottom: 6 }}>Datum & tid</div>
                    <input type="datetime-local" value={brandSamrad.datum} onChange={e => onSamradChange({ ...brandSamrad, datum: e.target.value })} style={{ ...inputStyle, colorScheme: 'dark' }} />
                  </div>
                  <button className="btn-press" onClick={() => onSamradChange({ ...brandSamrad, kvitterad: !brandSamrad.kvitterad })}
                    style={{ flex: 1, padding: 14, borderRadius: 14, border: 'none', background: brandSamrad.kvitterad ? 'rgba(34,197,94,0.15)' : '#30d158', color: brandSamrad.kvitterad ? '#30d158' : '#000', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
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
                <span style={{ fontSize: 12, fontWeight: 500, textTransform: 'none' as const, color: brandUtrustning.every(Boolean) ? '#30d158' : 'rgba(255,255,255,0.3)' }}>{brandUtrustning.filter(Boolean).length}/{brandUtrustning.length}</span>
              </summary>
              <div style={{ marginTop: 12 }}>
                <div style={{ ...textStyle, marginBottom: 12 }}>Källa: Brandskyddsföreningens SBF 127</div>
                {utrustLabels.map((label, i) => (
                  <div key={i} onClick={() => { const n = [...brandUtrustning]; n[i] = !n[i]; onUtrustningChange(n); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <div style={{ width: 18, height: 18, borderRadius: 4, border: `1.5px solid ${brandUtrustning[i] ? '#30d158' : 'rgba(255,255,255,0.15)'}`, background: brandUtrustning[i] ? 'rgba(34,197,94,0.12)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {brandUtrustning[i] && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#30d158" strokeWidth="3"><path d="M5 13l4 4L19 7" /></svg>}
                    </div>
                    <span style={{ fontSize: 13, color: brandUtrustning[i] ? 'rgba(255,255,255,0.3)' : '#8e8e93', textDecoration: brandUtrustning[i] ? 'line-through' : 'none', lineHeight: 1.4 }}>{label}</span>
                  </div>
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
              <button className="btn-press" onClick={() => navigator.clipboard?.writeText(`${mapCenter.lat.toFixed(6)}, ${mapCenter.lng.toFixed(6)}`)}
                style={{ fontSize: 12, color: '#0a84ff', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 12 }}>
                Kopiera koordinater
              </button>
              <div style={{ ...textStyle, marginBottom: 12 }}>Ge denna position vid larm till 112</div>
              <div style={{ fontSize: 12, color: '#8e8e93', marginBottom: 6 }}>Tillfartsväg</div>
              <textarea value={brandLarmTillfart} onChange={e => onLarmTillfartChange(e.target.value)} placeholder="Beskriv bästa tillfartsväg..."
                style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} />
              <div style={{ fontSize: 12, color: '#8e8e93', marginTop: 16, marginBottom: 8 }}>Vid larm – förmedla</div>
              {larmLabels.map((label, i) => (
                <div key={i} onClick={() => { const n = [...brandLarmChecklista]; n[i] = !n[i]; onLarmChecklistaChange(n); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', cursor: 'pointer' }}>
                  <div style={{ width: 16, height: 16, borderRadius: 3, border: `1.5px solid ${brandLarmChecklista[i] ? '#30d158' : 'rgba(255,255,255,0.15)'}`, background: brandLarmChecklista[i] ? 'rgba(34,197,94,0.12)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {brandLarmChecklista[i] && <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#30d158" strokeWidth="3"><path d="M5 13l4 4L19 7" /></svg>}
                  </div>
                  <span style={{ fontSize: 12, color: '#8e8e93', lineHeight: 1.4 }}>{label}</span>
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
                  <div style={{ fontSize: 12, color: '#8e8e93', marginBottom: 6 }}>{label}</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input type="text" placeholder="Namn" value={(brandKontakter as any)[nameKey]} onChange={e => onKontakterChange({ ...brandKontakter, [nameKey]: e.target.value })} style={{ ...inputStyle, flex: 1 }} />
                    <div style={{ position: 'relative', width: 160 }}>
                      <input type="tel" placeholder={telKey === 'forsakringsnummer' ? 'Nummer' : 'Telefon'} value={(brandKontakter as any)[telKey]} onChange={e => onKontakterChange({ ...brandKontakter, [telKey]: e.target.value })} style={inputStyle} />
                      {(brandKontakter as any)[telKey] && telKey !== 'forsakringsnummer' && (
                        <a className="btn-press" href={`tel:${(brandKontakter as any)[telKey]}`} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 16, textDecoration: 'none' }}>{'\u{1F4DE}'}</a>
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
                <button className="btn-press" onClick={onSaveTillbud}
                  style={{ padding: 14, borderRadius: 14, border: 'none', background: '#0a84ff', color: '#000', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
                  Spara tillbud
                </button>
              </div>
              {brandTillbud.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginBottom: 8 }}>Tidigare tillbud</div>
                  {brandTillbud.map((t, i) => (
                    <div key={i} style={{ fontSize: 12, color: '#8e8e93', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <span style={{ color: '#8e8e93' }}>{new Date(t.datum).toLocaleDateString('sv-SE')}</span> – {t.beskrivning.slice(0, 50)}
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
                    <div style={{ fontSize: 12, color: '#8e8e93', marginBottom: 4 }}>Start</div>
                    <input type="datetime-local" value={brandBrandvakt.starttid} onChange={e => onBrandvaktChange({ ...brandBrandvakt, starttid: e.target.value })} style={{ ...inputStyle, colorScheme: 'dark' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, color: '#8e8e93', marginBottom: 4 }}>Slut</div>
                    <input type="datetime-local" value={brandBrandvakt.sluttid} onChange={e => onBrandvaktChange({ ...brandBrandvakt, sluttid: e.target.value })} style={{ ...inputStyle, colorScheme: 'dark' }} />
                  </div>
                </div>
                <textarea placeholder="Noteringar" value={brandBrandvakt.noteringar} onChange={e => onBrandvaktChange({ ...brandBrandvakt, noteringar: e.target.value })} style={{ ...inputStyle, minHeight: 50, resize: 'vertical' }} />
                <button className="btn-press" onClick={onSaveBrandvakt}
                  style={{ padding: 14, borderRadius: 14, border: 'none', background: '#0a84ff', color: '#000', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
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
              {brandEfterkontroll.kvitterad ? <span style={{ fontSize: 12, fontWeight: 500, textTransform: 'none' as const, color: '#30d158' }}>Utförd &#x2713;</span> : <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.2)' }}>&#x203A;</span>}
            </summary>
            <div style={{ marginTop: 12 }}>
              <div style={textStyle}>Trakten ska avsynas efter avslutat arbete (Skogforsk).</div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginTop: 14 }}>
                <div style={{ width: 200, flexShrink: 0 }}>
                  <div style={{ fontSize: 12, color: '#8e8e93', marginBottom: 6 }}>Datum & tid</div>
                  <input type="datetime-local" value={brandEfterkontroll.datum} onChange={e => onEfterkontrollChange({ ...brandEfterkontroll, datum: e.target.value })} style={{ ...inputStyle, colorScheme: 'dark' }} />
                </div>
                <button className="btn-press" onClick={() => onEfterkontrollChange({ ...brandEfterkontroll, kvitterad: !brandEfterkontroll.kvitterad })}
                  style={{ flex: 1, padding: 14, borderRadius: 14, border: 'none', background: brandEfterkontroll.kvitterad ? 'rgba(34,197,94,0.15)' : '#30d158', color: brandEfterkontroll.kvitterad ? '#30d158' : '#000', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
                  {brandEfterkontroll.kvitterad ? 'Utförd \u2713' : 'Efterkontroll utförd'}
                </button>
              </div>
              <textarea placeholder="Noteringar" value={brandEfterkontroll.noteringar} onChange={e => onEfterkontrollChange({ ...brandEfterkontroll, noteringar: e.target.value })} style={{ ...inputStyle, marginTop: 10, minHeight: 50, resize: 'vertical' }} />
            </div>
          </details>
        </div>

        {/* Dev test toggle */}
        {process.env.NODE_ENV === 'development' && testMode === null && (
          <div style={{ margin: '0 16px 8px', textAlign: 'center' }}>
            <button className="btn-press"
              onClick={() => {
                if (devSimulating) {
                  // Restore real data
                  if (realDataRef.current) {
                    setData(realDataRef.current);
                    onStatusChange?.({ status: 'done', currentFwi: realDataRef.current.currentFwi, currentIdx: realDataRef.current.currentIdx });
                  }
                  setIsTestFallback(false);
                  setDevSimulating(false);
                } else {
                  // Save real data and switch to simulated
                  realDataRef.current = data;
                  const simulated = generateTestData(5);
                  setData(simulated);
                  setIsTestFallback(true);
                  setDevSimulating(true);
                  onStatusChange?.({ status: 'done', currentFwi: simulated.currentFwi, currentIdx: simulated.currentIdx });
                }
              }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, color: devSimulating ? '#FFD60A' : 'rgba(255,255,255,0.15)', padding: '6px 12px' }}
            >
              {devSimulating ? 'Avsluta simulering' : 'Simulera hög risk'}
            </button>
          </div>
        )}

        {/* Footer */}
        <div style={{ margin: '8px 16px 32px', fontSize: 12, color: 'rgba(255,255,255,0.35)', lineHeight: 1.6, textAlign: 'center' }}>
          Beslutsstöd. Prognoser: SMHI. Brandbeteende: MCF. Riktlinjer: Skogforsk (2022). Bedöm alltid lokalt. Arbetsgivaren ansvarar (AML 1977:1160).
        </div>
      </div>
    </div>
  );
}
