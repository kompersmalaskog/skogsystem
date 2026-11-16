"use client";
// Brandriskpanelen (omtag 2026-11-16, Martin: "samma design som resten av appen"). Svaret först, i ord; sedan idag timme för timme, veckan,
// vad vi gör vid den här nivån, och sist förklaringarna. Allt på lib/design/tokens och components/design — orden, färgerna och reglerna bor i
// lib/brandriskVy.ts. Ingen beräkning och ingen hämtning är ändrad: samma SMHI-data (fwif1g) och samma props som förut.

import React, { useState, useEffect, useRef, useCallback } from "react";
import { fetchSmhiFwi, type SmhiBrandriskData } from "../../lib/smhi-brandrisk";
import { AVSTAND, FARG, FONT, IKON, KNAPP, KORT, RADIE, TNUM, TRAFFYTA, TYP } from "@/lib/design/tokens";
import Sektion from "@/components/design/Sektion";
import Rad from "@/components/design/Rad";
import Falt from "@/components/design/Falt";
import Ikon from "@/components/design/Ikon";
import { DAGNAMN, NIVA, NIVAER, arLag, beredskapRubrik, brandSvar, idagForst, nivaFarg, nivaKort, nivaSiffra, visaSamrad, visaUtrustning } from "@/lib/brandriskVy";

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

function Prick({ niva }: { niva: number }) {
  return <span aria-hidden="true" style={{ display: 'inline-block', flexShrink: 0, width: AVSTAND.m, height: AVSTAND.m, borderRadius: RADIE.cirkel, background: nivaFarg(niva) }} />;
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
  const nuNiva = data.currentIdx;
  const dagar = idagForst(data.daily, nu.toISOString().split('T')[0]).slice(0, 7);
  const idagTimmar = dagar[0]?.hourlyIdx?.length ? dagar[0].hourlyIdx : data.todayHourlyIdx;
  const svarIdag = brandSvar(idagTimmar, { idag: true, nuTimme, nuNiva });
  const valdDag = dagar[activeDay] ?? dagar[0];
  const timmar = activeDay === 0 ? idagTimmar : (valdDag?.hourlyIdx ?? []);
  const svarVald = activeDay === 0 ? null : brandSvar(timmar, { idag: false, nuTimme, nuNiva });
  const dagNamn = (i: number) => (i === 0 ? 'Idag' : (DAGNAMN[dagar[i]?.dayName] ?? dagar[i]?.dayName ?? ''));
  const uppdaterad = new Date(data.updatedAt).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
  const utrustningKlar = brandUtrustning.filter(Boolean).length;
  const harLarm = !!(larmLat && larmLng);

  return (
    <div style={rot}>
      {/* SVARET — i ord */}
      <header data-testid="brand-svar" data-niva={nuNiva} style={{ marginBottom: AVSTAND.xl }}>
        <div style={{ ...TYP.meta, color: FARG.text2 }}>{koordFranObjekt && objektNamn ? `${objektNamn} · ` : 'Kartans mitt · '}just nu kl {tt(nuTimme)}</div>
        <h2 style={{ margin: `${AVSTAND.xs}px 0 ${AVSTAND.s}px`, ...TYP.titel }}>{nivaKort(nuNiva)} brandrisk</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s, ...TYP.text }}><Prick niva={nuNiva} />Nivå {nivaSiffra(nuNiva)}</div>
        {eldningsforbud && <div data-testid="brand-forbud-rad" style={{ marginTop: AVSTAND.s, ...TYP.listtitel, color: FARG.rod }}>Eldningsförbud råder</div>}
        {svarIdag && (
          <div style={{ marginTop: AVSTAND.m, padding: AVSTAND.l, background: FARG.upphojt, borderRadius: RADIE.kort }}>
            <div style={TYP.listtitel}>{svarIdag.rubrik}</div>
            <div style={{ ...TYP.text, color: FARG.text2, marginTop: AVSTAND.xs }}>{svarIdag.mening}</div>
          </div>
        )}
      </header>

      {/* TIMME FÖR TIMME */}
      <Sektion rubrik={`${dagNamn(activeDay)} timme för timme`} not={selectedHour === null ? 'Tryck på en timme för att se nivån.' : undefined}>
        <div data-testid="brand-band" style={{ padding: `${AVSTAND.l}px 0` }}>
          {svarVald && <div style={{ ...TYP.text, marginBottom: AVSTAND.m }}>{svarVald.rubrik}. <span style={{ color: FARG.text2 }}>{svarVald.mening}</span></div>}
          <div style={{ position: 'relative', paddingTop: AVSTAND.l + AVSTAND.xs }}>
            {activeDay === 0 && (
              <div aria-hidden="true" style={{ position: 'absolute', top: 0, left: `${((nuTimme + 0.5) / 24) * 100}%`, transform: 'translateX(-50%)', ...TYP.meta, color: FARG.text, whiteSpace: 'nowrap' }}>nu ▾</div>
            )}
            <div style={{ display: 'flex', gap: AVSTAND.xs / 2, borderRadius: RADIE.rad, overflow: 'hidden' }}>
              {timmar.map((niva, h) => (
                <button key={h} type="button" aria-label={`kl ${tt(h)}: ${nivaKort(niva)} brandrisk`} aria-pressed={selectedHour === h} onClick={() => setSelectedHour(selectedHour === h ? null : h)}
                  style={{ flex: 1, minWidth: 0, height: TRAFFYTA.min, padding: 0, border: 'none', cursor: 'pointer', background: nivaFarg(niva), opacity: selectedHour === null || selectedHour === h ? 1 : 0.4 }} />
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: AVSTAND.xs, ...TYP.meta, ...TNUM, color: FARG.text2 }}>
              <span>00</span><span>06</span><span>12</span><span>18</span><span>24</span>
            </div>
          </div>
          {selectedHour !== null && (
            <div data-testid="brand-timme" style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s, marginTop: AVSTAND.m, ...TYP.text }}>
              <Prick niva={timmar[selectedHour]} />Kl {tt(selectedHour)}: {nivaKort(timmar[selectedHour]).toLowerCase()} brandrisk · nivå {nivaSiffra(timmar[selectedHour])}
            </div>
          )}
        </div>
      </Sektion>

      {/* VECKAN */}
      <Sektion rubrik="Veckan" not="Tryck på en dag för att se dess timmar och väder.">
        {dagar.map((d, i) => {
          const vald = activeDay === i;
          return (
            <Rad key={d.date} sista={i === dagar.length - 1} dampad={arLag(d.fwiIndex) && !vald} pil={false}
              titel={<span style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s }}><Prick niva={d.fwiIndex} />{i === 0 ? 'Idag' : d.dayName} · {nivaKort(d.fwiIndex)}{d.rain ? ' · regn' : ''}</span>}
              under={vald ? `${d.temp} · vind ${d.wind} · ${d.humidity.toLowerCase()}` : undefined}
              hoger={<span style={{ ...TYP.meta, color: FARG.text2 }}>topp kl {tt(d.peakHour)}</span>}
              onTryck={() => { setActiveDay(i); setSelectedHour(null); }}
              attr={{ 'data-testid': `brand-dag-${i}`, 'aria-pressed': String(vald), 'data-niva': String(d.fwiIndex) }} />
          );
        })}
      </Sektion>

      {/* VAD GÖR VI */}
      <Sektion rubrik={beredskapRubrik(nuNiva)}>
        <Rad titel="Eldningsförbud" under={eldningsforbud ? 'Råder nu' : 'Slå på om kommunen har förbud'} pil={false} hoger={<Brytare pa={eldningsforbud} onVaxla={() => onEldningsforbudChange(!eldningsforbud)} etikett="Eldningsförbud" />} />
        {visaSamrad(nuNiva) && <Rad titel="Samråd med uppdragsgivaren" under="Krävs vid stor brandrisk. Görs och sparas i Forest Link." attr={{ 'data-testid': 'brand-samrad' }} />}
        {visaUtrustning(nuNiva, eldningsforbud) && (
          <Utfall id="utrustning" oppen={oppen} onVaxla={vaxla} titel="Utrustning" hoger={<span style={{ ...TYP.meta, color: utrustningKlar === brandUtrustning.length ? FARG.gron : FARG.text2 }}>{utrustningKlar} av {brandUtrustning.length}</span>}>
            {UTRUSTNING.map((text, i) => <Bock key={i} pa={!!brandUtrustning[i]} text={text} onTryck={() => { const n = [...brandUtrustning]; n[i] = !n[i]; onUtrustningChange(n); }} />)}
            <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.s }}>Enligt Brandskyddsföreningens SBF 127.</div>
          </Utfall>
        )}
        <Utfall id="larm" oppen={oppen} onVaxla={vaxla} titel="Om det börjar brinna" hoger={<span style={{ ...TYP.meta, color: FARG.text2 }}>Ring 112</span>}>
          {harLarm ? (
            <>
              <div style={etikettStil}>Larmkoordinat</div>
              <div data-testid="brand-koordinat" style={{ ...TYP.rubrik, ...TNUM }}>{larmLat}°N, {larmLng}°E</div>
              <div style={{ ...TYP.meta, marginTop: AVSTAND.xs, color: larmBekraftad ? FARG.text2 : FARG.orange }}>
                {larmKalla === 'td' ? 'Från traktdirektivet' : larmKalla === 'egen' ? 'Egen' : 'Källan är inte angiven'} · {larmBekraftad ? 'kontrollerad på plats' : 'inte kontrollerad på plats'}
              </div>
              <div style={{ display: 'flex', gap: AVSTAND.s, marginTop: AVSTAND.m }}>
                <button type="button" style={KNAPP.sekundar} onClick={() => { navigator.clipboard?.writeText(`${larmLat}, ${larmLng}`).then(() => setKopierat(true)).catch(() => {}); }}>{kopierat ? 'Kopierat' : 'Kopiera'}</button>
                <a href={`https://www.google.com/maps/dir/?api=1&destination=${larmLat},${larmLng}`} target="_blank" rel="noopener noreferrer" style={{ ...KNAPP.sekundar, textDecoration: 'none' }}>Visa vägen</a>
              </div>
              {larmBeskrivning && (<><div style={{ ...etikettStil, marginTop: AVSTAND.l }}>Tillfartsväg</div><div style={{ ...TYP.text, whiteSpace: 'pre-wrap' }}>{larmBeskrivning}</div></>)}
            </>
          ) : (
            <div style={{ ...TYP.text, color: FARG.orange }}>Larmkoordinaten är inte satt. Den sätts under Mer › Trakt.</div>
          )}
          <div style={{ ...etikettStil, marginTop: AVSTAND.l }}>Säg det här när du ringer</div>
          {VID_LARM.map((text, i) => <Bock key={i} pa={!!brandLarmChecklista[i]} text={text} onTryck={() => { const n = [...brandLarmChecklista]; n[i] = !n[i]; onLarmChecklistaChange(n); }} />)}
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
        <Utfall id="efterkontroll" oppen={oppen} onVaxla={vaxla} sista titel="Efterkontroll" hoger={<span style={{ ...TYP.meta, color: brandEfterkontroll.kvitterad ? FARG.gron : FARG.text2 }}>{brandEfterkontroll.kvitterad ? 'Gjord' : 'Inte gjord'}</span>}>
          <div style={{ ...TYP.text, color: FARG.text2, marginBottom: AVSTAND.l }}>Gå över trakten när arbetet är slut och se att inget glöder.</div>
          <label style={etikettStil}>När?</label>
          <input type="datetime-local" value={brandEfterkontroll.datum} onChange={(e) => onEfterkontrollChange({ ...brandEfterkontroll, datum: e.target.value })} style={{ ...faltStil, marginBottom: AVSTAND.l }} />
          <label style={etikettStil}>Anteckning</label>
          <textarea value={brandEfterkontroll.noteringar} onChange={(e) => onEfterkontrollChange({ ...brandEfterkontroll, noteringar: e.target.value })} rows={2} style={{ ...faltStil, resize: 'vertical', marginBottom: AVSTAND.l }} />
          <button type="button" data-testid="brand-efterkontroll-knapp" onClick={() => onEfterkontrollChange({ ...brandEfterkontroll, kvitterad: !brandEfterkontroll.kvitterad })} style={brandEfterkontroll.kvitterad ? KNAPP.sekundar : KNAPP.primar}>
            {brandEfterkontroll.kvitterad ? 'Ångra – inte gjord' : 'Efterkontrollen är gjord'}
          </button>
        </Utfall>
      </Sektion>

      {/* MER */}
      <Sektion rubrik="Mer" not={`Prognos från SMHI · uppdaterad ${uppdaterad}. Bedöm alltid själv på plats.`}>
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
          <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.s }}>Just nu: FWI {data.currentFwi}. FWI är SMHI:s mått på hur lätt det brinner.</div>
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
      </Sektion>
    </div>
  );
}
