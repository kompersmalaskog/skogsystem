"use client";
// Brandriskpanelen (omtag 2026-11-16, Martin: "så lätt att ett barn förstår det direkt"). Första skärmen är FYRA saker: svaret en gång, veckan som en rad
// prickar, "Gör så här" (bara det som gäller vid nivån) och "Om det börjar brinna". Allt annat ligger bakom Mer. Allt på lib/design/tokens och components/design — orden, färgerna och reglerna bor i
// lib/brandriskVy.ts. Ingen beräkning och ingen hämtning är ändrad: samma SMHI-data (fwif1g) och samma props som förut.

import React, { useState, useEffect, useRef, useCallback } from "react";
import { fetchSmhiFwi, type SmhiBrandriskData } from "../../lib/smhi-brandrisk";
import { AVSTAND, FARG, FONT, IKON, KNAPP, KORT, RADIE, TNUM, TRAFFYTA, TYP } from "@/lib/design/tokens";
import Sektion from "@/components/design/Sektion";
import Rad from "@/components/design/Rad";
import Falt from "@/components/design/Falt";
import Ikon from "@/components/design/Ikon";
import { DAGNAMN, NIVA, NIVAER, arLag, brandSvar, gorSaHar, idagForst, nivaFarg, nivaKort, nivaSiffra, svarRad } from "@/lib/brandriskVy";

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



const UTRUSTNING = [
  'Avverkningsmaskiner: 2 st 9 l skum- eller vätskesläckare',
  'Markberedning: 6 st 9 l skum- eller vätskesläckare',
  'Kratta och spade finns med',
  'Larmkoordinat står i traktdirektivet',
];
const VID_LARM = [
  'Finns risk för personskada?',
  'Var det brinner, med koordinater',
  'Hur stor branden är och åt vilket håll den sprider sig',
  'Vad som hotas nära branden',
  'Vilken väg räddningstjänsten ska ta',
];
const KONTAKTER = [
  { etikett: 'Uppdragsgivare', namn: 'uppdragsgivareNamn', tel: 'uppdragsgivareTel', telEtikett: 'Telefon' },
  { etikett: 'Försäkringsbolag', namn: 'forsakringsbolag', tel: 'forsakringsnummer', telEtikett: 'Försäkringsnummer' },
  { etikett: 'Lokal räddningstjänst', namn: 'raddningstjanstNamn', tel: 'raddningstjanstTel', telEtikett: 'Telefon' },
] as const;

const tt = (h: number) => h.toString().padStart(2, '0');
const faltStil: React.CSSProperties = { width: '100%', boxSizing: 'border-box', minHeight: TRAFFYTA.min, padding: `${AVSTAND.m}px ${AVSTAND.l}px`, background: FARG.fyllning, border: 'none', outline: 'none', borderRadius: RADIE.rad, color: FARG.text, ...TYP.text, fontFamily: 'inherit', colorScheme: 'dark' };
const etikettStil: React.CSSProperties = { display: 'block', ...TYP.meta, color: FARG.text2, marginBottom: AVSTAND.xs };

function Prick({ niva, stor }: { niva: number; stor?: boolean }) {
  const d = stor ? AVSTAND.l : AVSTAND.m;
  return <span aria-hidden="true" style={{ display: 'inline-block', flexShrink: 0, width: d, height: d, borderRadius: RADIE.cirkel, background: nivaFarg(niva) }} />;
}

/** En rad som fälls ut på plats. En i taget (panelen håller vilken). */
function Utfall({ id, oppen, onVaxla, titel, hoger, sista, children }: { id: string; oppen: string | null; onVaxla: (id: string) => void; titel: string; hoger?: React.ReactNode; sista?: boolean; children: React.ReactNode }) {
  const ar = oppen === id;
  return (
    <div data-testid={`brand-${id}`}>
      <Rad titel={titel} hoger={hoger} onTryck={() => onVaxla(id)} sista={sista && !ar} attr={{ 'aria-expanded': String(ar), 'data-testid': `brand-rad-${id}` }} />
      {ar && <div data-testid={`brand-inne-${id}`} style={{ padding: `${AVSTAND.m}px 0 ${AVSTAND.l}px`, borderBottom: sista ? 'none' : `1px solid ${FARG.linje}` }}>{children}</div>}
    </div>
  );
}

/** En punkt att bocka av: ring tom eller fylld — formen bär, inte färgen. */
function Bock({ pa, text, onTryck }: { pa: boolean; text: string; onTryck: () => void }) {
  return (
    <button type="button" role="checkbox" aria-checked={pa} onClick={onTryck}
      style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m, width: '100%', minHeight: TRAFFYTA.min, padding: `${AVSTAND.xs}px 0`, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', color: FARG.text, ...TYP.text }}>
      <Ikon namn={pa ? 'check_circle' : 'radio_button_unchecked'} fylld={pa} farg={pa ? FARG.text : FARG.text3} />
      <span style={{ flex: 1, minWidth: 0 }}>{text}</span>
    </button>
  );
}

function Brytare({ pa, onVaxla, etikett }: { pa: boolean; onVaxla: () => void; etikett: string }) {
  return (
    <button type="button" role="switch" aria-checked={pa} aria-label={etikett} data-testid="brand-eldningsforbud" onClick={onVaxla}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', minWidth: TRAFFYTA.min + AVSTAND.s, minHeight: TRAFFYTA.min, padding: 0, background: 'none', border: 'none', cursor: 'pointer' }}>
      <span style={{ position: 'relative', width: TRAFFYTA.primar, height: AVSTAND.xl + AVSTAND.xs, borderRadius: AVSTAND.l, background: pa ? FARG.rod : FARG.text3 }}>
        <span style={{ position: 'absolute', top: 2, left: pa ? TRAFFYTA.primar - AVSTAND.xl - 2 : 2, width: AVSTAND.xl, height: AVSTAND.xl, borderRadius: RADIE.cirkel, background: FARG.text }} />
      </span>
    </button>
  );
}

// === Main Props ===
interface BrandriskPanelProps {
  lat: number;
  lon: number;
  eldningsforbud: boolean;
  onEldningsforbudChange: (val: boolean) => void;
  // Persistence props (passed through from page.tsx)
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
  brandUtrustning: boolean[];
  onUtrustningChange: (u: boolean[]) => void;
  objektNamn?: string;
  koordFranObjekt: boolean; // true = prognosen gäller objektet, false = kartans mitt (fallback)
  larmLat: string;
  larmLng: string;
  larmBeskrivning: string;
  larmKalla: 'td' | 'egen' | null;
  larmBekraftad: boolean;
  brandLarmChecklista: boolean[];
  onLarmChecklistaChange: (v: boolean[]) => void;
  onStatusChange?: (status: { status: 'idle' | 'loading' | 'done' | 'error'; currentFwi: number; currentIdx: number }) => void;
}

const REFRESH_INTERVAL = 30 * 60 * 1000; // 30 min

export default function BrandriskPanel(props: BrandriskPanelProps) {
  const {
    lat, lon, eldningsforbud, onEldningsforbudChange,
    brandKontakter, onKontakterChange,
    brandTillbud, brandNewTillbud, onNewTillbudChange, onSaveTillbud,
    brandEfterkontroll, onEfterkontrollChange,
    brandUtrustning, onUtrustningChange,
    objektNamn, koordFranObjekt,
    larmLat, larmLng, larmBeskrivning, larmKalla, larmBekraftad,
    brandLarmChecklista, onLarmChecklistaChange,
    onStatusChange,
  } = props;

  const [data, setData] = useState<SmhiBrandriskData | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [activeDay, setActiveDay] = useState(0);
  const [selectedHour, setSelectedHour] = useState<number | null>(null);
  const [oppen, setOppen] = useState<string | null>(null);
  const [vy, setVy] = useState<'start' | 'brinner' | 'mer'>('start');
  const [kopierat, setKopierat] = useState(false);
  const refreshRef = useRef<NodeJS.Timeout | null>(null);
  const lastFetchRef = useRef<string>('');
  const vaxla = (id: string) => setOppen((o) => (o === id ? null : id));

  const fetchData = useCallback(async () => {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      // Ogiltig position (objektet saknar koordinat / kartan inte klar) — hämta aldrig,
      // krascha aldrig på toFixed. Panelen visar tomt tills en giltig position finns.
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
      lastFetchRef.current = fetchKey;
      onStatusChange?.({ status: 'done', currentFwi: result.currentFwi, currentIdx: result.currentIdx });
      console.log('[Brandrisk] Data hämtad:', result.currentIdx, 'FWI:', result.currentFwi);
    } catch (err) {
      console.error('[Brandrisk] API-fel:', err);
      // ÄRLIGT FELLÄGE. Gissa aldrig en brandrisk: ett påhittat värde kan ligga LÄGRE än
      // verkligheten och få en förare att tro att det går bra att köra. Hellre ingen
      // siffra alls än en falsk. Tomt betyder tomt.
      setData(null);
      setStatus('error');
      onStatusChange?.({ status: 'error', currentFwi: 0, currentIdx: 0 });
    }
  }, [lat, lon, data, status]);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [lat, lon]);

  // Auto-refresh every 30 min
  useEffect(() => {
    refreshRef.current = setInterval(() => {
      lastFetchRef.current = ''; // Force refetch
      fetchData();
    }, REFRESH_INTERVAL);
    return () => { if (refreshRef.current) clearInterval(refreshRef.current); };
  }, []);

  const rot: React.CSSProperties = { padding: `${AVSTAND.l}px ${AVSTAND.sidmarginal}px ${AVSTAND.xxl}px`, background: FARG.bg, color: FARG.text, fontFamily: FONT, WebkitFontSmoothing: 'antialiased' };

  if (status === 'loading' && !data) {
    return <div style={rot}><div data-testid="brand-laser" style={{ ...KORT, ...TYP.text, color: FARG.text2 }}>Hämtar brandrisken …</div></div>;
  }

  // Felläge — SMHI svarade inte. Visa ALDRIG en gissad siffra.
  if (status === 'error') {
    return (
      <div style={rot}>
        <div data-testid="brand-fel" style={KORT}>
          <div style={{ ...TYP.listtitel }}>Kunde inte hämta brandrisken</div>
          <div style={{ ...TYP.text, color: FARG.text2, margin: `${AVSTAND.xs}px 0 ${AVSTAND.l}px` }}>Ingen nivå visas. Appen gissar aldrig en brandrisk. Kolla täckningen och försök igen.</div>
          <button type="button" onClick={() => { lastFetchRef.current = ''; fetchData(); }} style={KNAPP.sekundar}>Försök igen</button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const nu = new Date();
  const nuTimme = nu.getHours();
  const dagar = idagForst(data.daily, nu.toISOString().split('T')[0]).slice(0, 5);
  const idagTimmar = dagar[0]?.hourlyIdx?.length ? dagar[0].hourlyIdx : data.todayHourlyIdx;
  const idag = activeDay === 0;
  const valdDag = dagar[activeDay] ?? dagar[0];
  const timmar = idag ? idagTimmar : (valdDag?.hourlyIdx ?? []);
  // Svaret gäller nu (idag) eller dagens topp (en annan dag). "Gör så här" följer dagens TOPP: det som krävs i eftermiddag ska vara med från morgonen.
  const visadNiva = idag ? data.currentIdx : (valdDag?.fwiIndex ?? data.currentIdx);
  const toppNiva = Math.max(visadNiva, valdDag?.fwiIndex ?? 0);
  const svar = brandSvar(timmar, { idag, nuTimme, nuNiva: data.currentIdx });
  const gor = gorSaHar(toppNiva, eldningsforbud);
  const dagOrd = (i: number) => (i === 0 ? 'Idag' : (DAGNAMN[dagar[i]?.dayName] ?? dagar[i]?.dayName ?? ''));
  const uppdaterad = new Date(data.updatedAt).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
  const utrustningKlar = brandUtrustning.filter(Boolean).length;
  const harLarm = !!(larmLat && larmLng);
  const tillbaka = (
    <button type="button" data-testid="brand-tillbaka" onClick={() => { setVy('start'); setOppen(null); }} style={{ ...KNAPP.lank, marginBottom: AVSTAND.s }}>‹ Brandrisk</button>
  );
  const grupp: React.CSSProperties = { ...KORT, paddingTop: 0, paddingBottom: 0, marginTop: AVSTAND.m };

  // ── OM DET BÖRJAR BRINNA ──
  if (vy === 'brinner') {
    return (
      <div style={rot} data-testid="brand-vy-brinner">
        {tillbaka}
        <h2 style={{ margin: `0 0 ${AVSTAND.l}px`, ...TYP.titel }}>Ring 112</h2>
        <div style={{ ...KORT, marginBottom: AVSTAND.xl }}>
          {harLarm ? (
            <>
              <div style={etikettStil}>Hit ska räddningstjänsten</div>
              <div data-testid="brand-koordinat" style={{ ...TYP.rubrik, ...TNUM }}>{larmLat}°N, {larmLng}°E</div>
              {!larmBekraftad && <div style={{ ...TYP.meta, marginTop: AVSTAND.xs, color: FARG.orange }}>Platsen är inte kontrollerad på plats</div>}
              {larmBeskrivning && <div style={{ ...TYP.text, marginTop: AVSTAND.s, whiteSpace: 'pre-wrap' }}>{larmBeskrivning}</div>}
              <div style={{ display: 'flex', gap: AVSTAND.s, marginTop: AVSTAND.m }}>
                <button type="button" style={KNAPP.sekundar} onClick={() => { navigator.clipboard?.writeText(`${larmLat}, ${larmLng}`).then(() => setKopierat(true)).catch(() => {}); }}>{kopierat ? 'Kopierat' : 'Kopiera'}</button>
                <a href={`https://www.google.com/maps/dir/?api=1&destination=${larmLat},${larmLng}`} target="_blank" rel="noopener noreferrer" style={{ ...KNAPP.sekundar, textDecoration: 'none' }}>Visa vägen</a>
              </div>
            </>
          ) : (
            <div style={{ ...TYP.text, color: FARG.orange }}>Larmkoordinaten är inte satt för den här trakten.</div>
          )}
        </div>
        <Sektion rubrik="Säg det här">
          {VID_LARM.map((text, i) => <Bock key={i} pa={!!brandLarmChecklista[i]} text={text} onTryck={() => { const n = [...brandLarmChecklista]; n[i] = !n[i]; onLarmChecklistaChange(n); }} />)}
        </Sektion>
      </div>
    );
  }

  // ── MER ──
  if (vy === 'mer') {
    return (
      <div style={rot} data-testid="brand-vy-mer">
        {tillbaka}
        <div style={{ ...grupp, marginTop: 0, marginBottom: AVSTAND.xl }}>
          <Utfall id="timmar" oppen={oppen} onVaxla={vaxla} titel={`${dagOrd(activeDay)} timme för timme`}>
            <div data-testid="brand-band" style={{ position: 'relative', paddingTop: AVSTAND.l + AVSTAND.xs }}>
              {idag && <div aria-hidden="true" style={{ position: 'absolute', top: 0, left: `${((nuTimme + 0.5) / 24) * 100}%`, transform: 'translateX(-50%)', ...TYP.meta, color: FARG.text, whiteSpace: 'nowrap' }}>nu ▾</div>}
              <div style={{ display: 'flex', gap: AVSTAND.xs / 2, borderRadius: RADIE.rad, overflow: 'hidden' }}>
                {timmar.map((niva, h) => (
                  <button key={h} type="button" aria-label={`kl ${tt(h)}: ${nivaKort(niva)} brandrisk`} aria-pressed={selectedHour === h} onClick={() => setSelectedHour(selectedHour === h ? null : h)}
                    style={{ flex: 1, minWidth: 0, height: TRAFFYTA.min, padding: 0, border: 'none', cursor: 'pointer', background: nivaFarg(niva), opacity: selectedHour === null || selectedHour === h ? 1 : 0.4 }} />
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: AVSTAND.xs, ...TYP.meta, ...TNUM, color: FARG.text2 }}><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div>
            </div>
            <div data-testid="brand-timme" style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s, marginTop: AVSTAND.m, ...TYP.text, color: selectedHour === null ? FARG.text2 : FARG.text }}>
              {selectedHour === null ? 'Tryck på en timme.' : <><Prick niva={timmar[selectedHour]} />Kl {tt(selectedHour)}: {nivaKort(timmar[selectedHour]).toLowerCase()} brandrisk</>}
            </div>
            {valdDag && <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.s }}>{valdDag.temp} · vind {valdDag.wind} · {valdDag.humidity.toLowerCase()}{valdDag.rain ? ' · regn' : ''}</div>}
          </Utfall>
          <Rad titel="Eldningsförbud" under={eldningsforbud ? 'Råder nu' : 'Slå på om kommunen har förbud'} pil={false} hoger={<Brytare pa={eldningsforbud} onVaxla={() => onEldningsforbudChange(!eldningsforbud)} etikett="Eldningsförbud" />} />
          <Utfall id="utrustning" oppen={oppen} onVaxla={vaxla} titel="Utrustning" hoger={<span style={{ ...TYP.meta, color: FARG.text2 }}>{utrustningKlar} av {brandUtrustning.length}</span>}>
            {UTRUSTNING.map((text, i) => <Bock key={i} pa={!!brandUtrustning[i]} text={text} onTryck={() => { const n = [...brandUtrustning]; n[i] = !n[i]; onUtrustningChange(n); }} />)}
          </Utfall>
          <Utfall id="kontakter" oppen={oppen} onVaxla={vaxla} titel="Kontakter">
            {KONTAKTER.map((k) => {
              const namn = (brandKontakter as Record<string, string>)[k.namn] ?? '';
              const tel = (brandKontakter as Record<string, string>)[k.tel] ?? '';
              return (
                <div key={k.namn}>
                  <Falt etikett={k.etikett} value={namn} onChange={(v) => onKontakterChange({ ...brandKontakter, [k.namn]: v })} placeholder="Namn" />
                  <Falt etikett={k.telEtikett} typ={k.telEtikett === 'Telefon' ? 'tel' : 'text'} value={tel} onChange={(v) => onKontakterChange({ ...brandKontakter, [k.tel]: v })}
                    stod={tel && k.telEtikett === 'Telefon' ? <a href={`tel:${tel}`} style={{ color: FARG.bla, textDecoration: 'none' }}>Ring {tel}</a> : undefined} />
                </div>
              );
            })}
          </Utfall>
          <Utfall id="tillbud" oppen={oppen} onVaxla={vaxla} titel="Rapportera tillbud" hoger={brandTillbud.length ? <span style={{ ...TYP.meta, color: FARG.text2 }}>{brandTillbud.length} sparade</span> : undefined}>
            <div style={{ ...TYP.text, color: FARG.text2, marginBottom: AVSTAND.l }}>Alla brandtillbud ska rapporteras till uppdragsgivaren, hur små de än är.</div>
            <label style={etikettStil}>När hände det?</label>
            <input type="datetime-local" value={brandNewTillbud.datum} onChange={(e) => onNewTillbudChange({ ...brandNewTillbud, datum: e.target.value })} style={{ ...faltStil, marginBottom: AVSTAND.l }} />
            <label style={etikettStil}>Vad hände?</label>
            <textarea value={brandNewTillbud.beskrivning} onChange={(e) => onNewTillbudChange({ ...brandNewTillbud, beskrivning: e.target.value })} rows={2} style={{ ...faltStil, resize: 'vertical', marginBottom: AVSTAND.l }} />
            <label style={etikettStil}>Vad gjorde ni?</label>
            <textarea value={brandNewTillbud.atgard} onChange={(e) => onNewTillbudChange({ ...brandNewTillbud, atgard: e.target.value })} rows={2} style={{ ...faltStil, resize: 'vertical', marginBottom: AVSTAND.l }} />
            <Falt etikett="Rapporterat till" value={brandNewTillbud.rapporteradTill} onChange={(v) => onNewTillbudChange({ ...brandNewTillbud, rapporteradTill: v })} placeholder="Namn" />
            <button type="button" data-testid="brand-spara-tillbud" onClick={onSaveTillbud} style={KNAPP.primar}>Spara tillbud</button>
            {brandTillbud.length > 0 && (
              <div style={{ marginTop: AVSTAND.l }}>
                <div style={etikettStil}>Tidigare tillbud</div>
                {brandTillbud.map((t, i) => <div key={i} style={{ ...TYP.text, padding: `${AVSTAND.s}px 0`, borderTop: `1px solid ${FARG.linje}` }}><span style={{ color: FARG.text2 }}>{new Date(t.datum).toLocaleDateString('sv-SE')}</span> · {t.beskrivning}</div>)}
              </div>
            )}
          </Utfall>
          <Utfall id="efterkontroll" oppen={oppen} onVaxla={vaxla} titel="Efterkontroll" hoger={<span style={{ ...TYP.meta, color: FARG.text2 }}>{brandEfterkontroll.kvitterad ? 'Gjord' : 'Inte gjord'}</span>}>
            <div style={{ ...TYP.text, color: FARG.text2, marginBottom: AVSTAND.l }}>Gå över trakten när arbetet är slut och se att inget glöder.</div>
            <label style={etikettStil}>När?</label>
            <input type="datetime-local" value={brandEfterkontroll.datum} onChange={(e) => onEfterkontrollChange({ ...brandEfterkontroll, datum: e.target.value })} style={{ ...faltStil, marginBottom: AVSTAND.l }} />
            <label style={etikettStil}>Anteckning</label>
            <textarea value={brandEfterkontroll.noteringar} onChange={(e) => onEfterkontrollChange({ ...brandEfterkontroll, noteringar: e.target.value })} rows={2} style={{ ...faltStil, resize: 'vertical', marginBottom: AVSTAND.l }} />
            <button type="button" data-testid="brand-efterkontroll-knapp" onClick={() => onEfterkontrollChange({ ...brandEfterkontroll, kvitterad: !brandEfterkontroll.kvitterad })} style={brandEfterkontroll.kvitterad ? KNAPP.sekundar : KNAPP.primar}>
              {brandEfterkontroll.kvitterad ? 'Ångra – inte gjord' : 'Efterkontrollen är gjord'}
            </button>
          </Utfall>
          <Utfall id="nivaer" oppen={oppen} onVaxla={vaxla} titel="Vad betyder nivåerna?">
            {NIVAER.map((n) => (
              <div key={n} style={{ display: 'flex', gap: AVSTAND.m, padding: `${AVSTAND.s}px 0` }}>
                <span style={{ paddingTop: AVSTAND.xs }}><Prick niva={n} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={TYP.listtitel}>{nivaSiffra(n)} · {NIVA[n].kort}</div>
                  <div style={{ ...TYP.text, color: FARG.text2 }}>{NIVA[n].text}</div>
                </div>
              </div>
            ))}
            <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.s }}>Just nu: nivå {nivaSiffra(data.currentIdx)}, FWI {data.currentFwi}. FWI är SMHI:s mått på hur lätt det brinner.</div>
          </Utfall>
          <Utfall id="kallor" oppen={oppen} onVaxla={vaxla} sista titel="Källor och dokument">
            {DOCS.map((g) => (
              <div key={g.group} style={{ marginBottom: AVSTAND.m }}>
                <div style={etikettStil}>{g.group}</div>
                {g.items.map((doc) => (
                  <a key={doc.url} href={doc.url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s, minHeight: TRAFFYTA.min, padding: `${AVSTAND.xs}px 0`, textDecoration: 'none' }}>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', ...TYP.text, color: FARG.bla }}>{doc.title}</span>
                      <span style={{ display: 'block', ...TYP.meta, color: FARG.text2 }}>{doc.sub}</span>
                    </span>
                    <Ikon namn="open_in_new" storlek={IKON.text} farg={FARG.text3} />
                  </a>
                ))}
              </div>
            ))}
          </Utfall>
        </div>
        <div style={{ ...TYP.meta, color: FARG.text2, margin: `0 ${AVSTAND.xs}px` }}>Prognos från SMHI · uppdaterad {uppdaterad}. Bedöm alltid själv på plats.</div>
      </div>
    );
  }

  // ── FÖRSTA SKÄRMEN: fyra saker ──
  return (
    <div style={rot} data-testid="brand-vy-start">
      <header data-testid="brand-svar" data-niva={visadNiva}>
        {(!idag || !(koordFranObjekt && objektNamn)) && <div data-testid="brand-ovan" style={{ ...TYP.meta, color: FARG.text2, marginBottom: AVSTAND.xs }}>{[idag ? null : dagOrd(activeDay), koordFranObjekt && objektNamn ? null : 'Gäller kartans mitt'].filter(Boolean).join(' · ')}</div>}
        <h2 style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m, margin: 0, ...TYP.titel }}><Prick niva={visadNiva} stor />{nivaKort(visadNiva)} brandrisk</h2>
        <div data-testid="brand-svar-rad" style={{ ...TYP.text, marginTop: AVSTAND.s, color: arLag(toppNiva) ? FARG.text2 : FARG.text }}>{svarRad(toppNiva, svar)}</div>
        {eldningsforbud && <div data-testid="brand-forbud-rad" style={{ marginTop: AVSTAND.s, ...TYP.listtitel, color: FARG.rod }}>Eldningsförbud råder</div>}
      </header>

      <div data-testid="brand-vecka" style={{ ...KORT, display: 'flex', padding: `${AVSTAND.xs}px ${AVSTAND.xs}px`, marginTop: AVSTAND.l }}>
        {dagar.map((d, i) => {
          const vald = activeDay === i;
          return (
            <button key={d.date} type="button" data-testid={`brand-dag-${i}`} data-niva={d.fwiIndex} aria-pressed={vald} aria-label={`${dagOrd(i)}: ${nivaKort(d.fwiIndex)} brandrisk`}
              onClick={() => { setActiveDay(i); setSelectedHour(null); }}
              style={{ flex: 1, minWidth: 0, minHeight: TRAFFYTA.primar + AVSTAND.l, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: AVSTAND.s, padding: 0, border: 'none', borderRadius: RADIE.rad, cursor: 'pointer', fontFamily: 'inherit', background: vald ? FARG.upphojt : 'none', color: vald || !arLag(d.fwiIndex) ? FARG.text : FARG.text2, ...TYP.meta }}>
              <Prick niva={d.fwiIndex} stor />
              {i === 0 ? 'Idag' : d.dayName}
            </button>
          );
        })}
      </div>

      {gor.length > 0 && (
        <section aria-label="Gör så här" data-testid="brand-gor" style={{ marginTop: AVSTAND.xl }}>
          <h3 style={{ ...TYP.micro, color: FARG.text2, margin: `0 0 ${AVSTAND.xs}px ${AVSTAND.xs}px` }}>Gör så här</h3>
          <div style={{ ...KORT, paddingTop: 0, paddingBottom: 0 }}>
            {gor.map((text, i) => <Rad key={text} titel={text} sista={i === gor.length - 1} />)}
          </div>
        </section>
      )}

      <div style={{ ...grupp, marginTop: AVSTAND.xl }}>
        <Rad sista titel={<span style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s }}><Ikon namn="local_fire_department" farg={FARG.rod} />Om det börjar brinna</span>} hoger={<span style={{ ...TYP.meta, color: FARG.text2 }}>112</span>} onTryck={() => setVy('brinner')} attr={{ 'data-testid': 'brand-rad-brinner' }} />
      </div>
      <div style={grupp}>
        <Rad sista titel="Mer" onTryck={() => setVy('mer')} attr={{ 'data-testid': 'brand-rad-mer' }} />
      </div>
    </div>
  );
}
