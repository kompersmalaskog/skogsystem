'use client';

// OBJEKTLISTAN i planeringsvyn — ersätter den gamla "Välj objekt"-sidan. Ett ark nerifrån under 900 px och en panel från höger från 900 px
// (samma regel och samma rörelse som plus-arket: lib/plusArk.plusLage, lib/hooks/useSkarmLage, RORELSE.byte). Ingen egen sida: kartan ligger kvar
// bakom (ingen mörk bakgrund), × / Esc / tryck på kartan stänger.
//
//   Sökfält överst · Pågår (grön prick) · Planerade · Oplanerade (grå prick) · "Avslutade (N)" som en rad längst ner som öppnar dem i samma ark.
//   Grupperna utgår från objekt.status (lib/objektVal). Alla typer visas, även GROT och energiklippning.
//   Raden: namn (fet) och under den typ · källa · m³. Tryck på raden = öppna objektet. Knappen till höger (bil + avstånd) startar navigeringen.
//
// Utan valt objekt (första gången / objektet borttaget) är listan det enda som finns: `kanStangas=false` → ingen ×, inget stängs.
// Ren presentation + datahämtning; vad ett val GÖR (öppna objektet, flytta kartan) avgör sidan.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { hamtaEnGpsFix } from '@/lib/gpsKalla';
import { AVSTAND, FARG, RADIE, RORELSE, TNUM, TRAFFYTA, TYP, medSafeBotten } from '@/lib/design/tokens';
import { PANEL_BREDD_PX } from '@/lib/plusArk';
import { useSkarmLage } from '@/lib/hooks/useSkarmLage';
import { fagelKm, grupperaObjekt, kmText, radMeta, type ListObjekt } from '@/lib/objektVal';
import { harKoordinat } from '@/lib/navigera';

export type ListaObjekt = ListObjekt & Record<string, any>;

export interface ObjektListaProps {
  oppen: boolean;
  /** false = inget objekt är valt och inget finns bakom listan: ingen ×, Esc och tryck utanför stänger inte */
  kanStangas: boolean;
  /** det öppna objektet (markeras i listan) */
  valtId: string | null;
  onValj: (o: ListaObjekt) => void;
  /** km-knappen: samma navigering som objektinfons Vägbeskrivning */
  onNavigera: (o: ListaObjekt) => void;
  onStang: () => void;
}

const FORSTA_KLICK_SPARR_MS = 350;       // ett spöktryck från knappen som öppnade listan ska inte stänga den direkt
const ANTAL_VAGAVSTAND = 30;             // så många närmaste objekt får vägavstånd (OSRM, ett i taget)
const FALLBACK_POS = { lat: 56.40, lng: 14.70 };   // verksamhetens mitt när ingen GPS-fix finns (som den gamla väljaren)

// Vägavstånd (km) per objekt och ungefärlig position — överlever att listan stängs och öppnas.
const vagCache = new Map<string, number>();
const posNyckel = (p: { lat: number; lng: number }) => `${p.lat.toFixed(2)},${p.lng.toFixed(2)}`;

const Kryss = () => (
  <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={FARG.text2} strokeWidth="2.6" strokeLinecap="round"><path d="M6 6 L18 18" /><path d="M18 6 L6 18" /></svg>
);
const Pil = ({ vanster = false }: { vanster?: boolean }) => (
  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={vanster ? FARG.bla : FARG.text3} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d={vanster ? 'M15 6 L9 12 L15 18' : 'M9 6 L15 12 L9 18'} />
  </svg>
);
const Bil = () => (
  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={FARG.text} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 16 L6.6 11 C6.9 10.1 7.7 9.5 8.6 9.5 H15.4 C16.3 9.5 17.1 10.1 17.4 11 L19 16" /><rect x="3.5" y="16" width="17" height="4" rx="1.5" />
    <circle cx="7.5" cy="18" r="0.6" fill={FARG.text} /><circle cx="16.5" cy="18" r="0.6" fill={FARG.text} />
  </svg>
);

export default function ObjektLista({ oppen, kanStangas, valtId, onValj, onNavigera, onStang }: ObjektListaProps) {
  const lage = useSkarmLage(oppen);
  const [inne, setInne] = useState(false);
  const [utglidet, setUtglidet] = useState(!oppen);   // monterad stängd (sidan lämnar den monterad) → inget i DOM från början
  const [sok, setSok] = useState('');
  const [visaAvslutade, setVisaAvslutade] = useState(false);
  const [objekt, setObjekt] = useState<ListaObjekt[]>([]);
  const [laddar, setLaddar] = useState(true);
  const [fel, setFel] = useState(false);
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [vag, setVag] = useState<Record<string, number>>({});
  const oppnadTid = useRef(0);
  const stangRef = useRef(onStang);
  stangRef.current = onStang;

  // Varje öppning börjar rent: tom sökning, aktiva objekt (inte Avslutade), rörelsen in från kanten.
  useEffect(() => {
    if (!oppen) return;
    oppnadTid.current = Date.now();
    setSok('');
    setVisaAvslutade(false);
    setUtglidet(false);
    const minskad = typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (minskad) { setInne(true); return; }
    setInne(false);
    const id = requestAnimationFrame(() => setInne(true));
    return () => cancelAnimationFrame(id);
  }, [oppen]);

  // Utglidningen klar → ta bort ur DOM.
  useEffect(() => {
    if (oppen) return;
    setInne(false);
    const minskad = typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const t = setTimeout(() => setUtglidet(true), minskad ? 0 : RORELSE.byte + 50);
    return () => clearTimeout(t);
  }, [oppen]);

  // Esc stänger (inte ovanpå appens egen bekräftelsedialog, och inte när listan är det enda som finns).
  useEffect(() => {
    if (!oppen || !kanStangas) return;
    const tangent = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('[role="dialog"][aria-modal="true"]')) { e.preventDefault(); stangRef.current(); }
    };
    window.addEventListener('keydown', tangent);
    return () => window.removeEventListener('keydown', tangent);
  }, [oppen, kanStangas]);

  // Objekten hämtas vid varje öppning (färsk status); det som redan finns visas under tiden.
  useEffect(() => {
    if (!oppen) return;
    let avbruten = false;
    (async () => {
      const { data, error } = await supabase.from('objekt').select('*').order('namn', { ascending: true });
      if (avbruten) return;
      if (error) { console.error('Objektlistan:', error); setFel(true); }
      else { setObjekt((data as ListaObjekt[]) || []); setFel(false); }
      setLaddar(false);
    })();
    return () => { avbruten = true; };
  }, [oppen]);

  // Positionen via GPS-källan (delad hub) — aldrig navigator.geolocation direkt (maskindatorn ger IP-position). Ingen fix → verksamhetens mitt.
  useEffect(() => {
    if (!oppen || pos) return;
    let avbruten = false;
    hamtaEnGpsFix(10000).then((fix) => {
      if (avbruten) return;
      setPos(fix && fix.giltig && fix.lat != null && fix.lng != null ? { lat: fix.lat, lng: fix.lng } : FALLBACK_POS);
    });
    return () => { avbruten = true; };
  }, [oppen, pos]);

  // Vägavstånd (OSRM) till de närmaste aktiva objekten, ett i taget. Fågelvägen visas med ~ tills vägavståndet kommit.
  useEffect(() => {
    if (!oppen || !pos || objekt.length === 0) return;
    let avbruten = false;
    const pk = posNyckel(pos);
    const kandidater = objekt
      .filter((o) => harKoordinat(o) && !['avslutat', 'klar'].includes(String(o.status ?? '').toLowerCase()))
      .sort((a, b) => fagelKm(pos.lat, pos.lng, a.lat!, a.lng!) - fagelKm(pos.lat, pos.lng, b.lat!, b.lng!))
      .slice(0, ANTAL_VAGAVSTAND);
    const fran: Record<string, number> = {};
    for (const o of kandidater) { const c = vagCache.get(`${o.id}@${pk}`); if (c != null) fran[o.id] = c; }
    if (Object.keys(fran).length) setVag((v) => ({ ...v, ...fran }));
    (async () => {
      for (const o of kandidater) {
        if (avbruten) break;
        if (vagCache.has(`${o.id}@${pk}`)) continue;
        try {
          const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${pos.lng},${pos.lat};${o.lng},${o.lat}?overview=false`);
          const d = await res.json();
          if (avbruten) break;
          const m = d?.routes?.[0]?.distance;
          if (typeof m === 'number') {
            const km = Math.round(m / 100) / 10;
            vagCache.set(`${o.id}@${pk}`, km);
            setVag((v) => ({ ...v, [o.id]: km }));
          }
        } catch { /* fågelvägen står kvar */ }
      }
    })();
    return () => { avbruten = true; };
  }, [oppen, pos, objekt]);

  const avstandKm = (o: ListaObjekt): number | null =>
    vag[o.id] ?? (pos && harKoordinat(o) ? fagelKm(pos.lat, pos.lng, o.lat!, o.lng!) : null);
  const grupper = useMemo(
    () => grupperaObjekt(objekt, { sok, avstandKm }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- avstandKm läser vag/pos som är med
    [objekt, sok, vag, pos],
  );
  const finnsNagot = objekt.length > 0;
  const aktivaAntal = grupper.pagar.length + grupper.planerade.length + grupper.oplanerade.length;

  // Hooks är klara — nu får vi returnera tidigt. Stängd och utglidet = ingenting i DOM.
  if (!oppen && utglidet) return null;

  const glidInne = oppen && inne;
  const rad = (o: ListaObjekt, prick: 'gron' | 'gra') => {
    const meta = radMeta(o);
    const km = avstandKm(o);
    const arVag = vag[o.id] != null;
    const kmTxt = kmText(km, !arVag);
    const nav = harKoordinat(o);
    const aktuell = o.id === valtId;
    return (
      <div
        key={o.id}
        role="button"
        tabIndex={0}
        data-testid={`objekt-rad-${o.id}`}
        aria-current={aktuell ? 'true' : undefined}
        aria-label={`${o.namn ?? 'Objekt'}${meta ? `, ${meta}` : ''}`}
        onClick={() => onValj(o)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onValj(o); } }}
        className="press-row"
        style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m, minHeight: TRAFFYTA.primar + AVSTAND.l, padding: `${AVSTAND.s}px ${AVSTAND.l}px`, cursor: 'pointer',
          borderBottom: `1px solid ${FARG.linje}`, background: aktuell ? FARG.tonad : 'transparent' }}
      >
        <span aria-hidden="true" data-testid={`objekt-prick-${prick}`} style={{ width: AVSTAND.s + 2, height: AVSTAND.s + 2, borderRadius: RADIE.cirkel, flexShrink: 0, background: prick === 'gron' ? FARG.gron : FARG.text3 }} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', ...TYP.listtitel, color: FARG.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.namn ?? 'Namnlöst objekt'}</span>
          {meta && <span style={{ display: 'block', ...TYP.meta, color: FARG.text2, overflowWrap: 'anywhere', ...TNUM }}>{meta}</span>}   {/* radbryts hellre än klipper volymen */}
        </span>
        {nav && kmTxt && (
          <button
            type="button"
            data-testid={`objekt-km-${o.id}`}
            aria-label={`Vägbeskrivning till ${o.namn ?? 'objektet'}, ${kmTxt}`}
            onClick={(e) => { e.stopPropagation(); onNavigera(o); }}
            onKeyDown={(e) => e.stopPropagation()}
            style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.xs + AVSTAND.xs / 2, flexShrink: 0, minHeight: TRAFFYTA.min, padding: `0 ${AVSTAND.m}px`, border: 'none', borderRadius: RADIE.knapp,
              background: FARG.fyllning, color: FARG.text, fontFamily: 'inherit', cursor: 'pointer', ...TYP.meta, fontWeight: 600, ...TNUM, touchAction: 'manipulation' }}
          >
            <Bil />{kmTxt}
          </button>
        )}
      </div>
    );
  };

  const gruppRubrik = (id: string, txt: string) => (
    <div data-testid={`objekt-grupp-${id}`} style={{ ...TYP.micro, color: FARG.text2, padding: `${AVSTAND.l}px ${AVSTAND.l}px ${AVSTAND.s}px` }}>{txt}</div>
  );

  const tomText = laddar && !finnsNagot ? 'Hämtar objekt…'
    : fel && !finnsNagot ? 'Listan gick inte att hämta. Kontrollera nätet och öppna den igen.'
    : !finnsNagot ? 'Inga objekt ännu. De dyker upp här när Vida levererat dem eller när du startat ett jobb.'
    : null;

  const rubrik = (
    <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: AVSTAND.s, padding: `0 ${AVSTAND.l}px ${AVSTAND.s}px` }}>
      {visaAvslutade && (
        <button type="button" aria-label="Tillbaka till listan" data-testid="objekt-lista-tillbaka" onClick={() => setVisaAvslutade(false)}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: TRAFFYTA.min, height: TRAFFYTA.min, marginLeft: -AVSTAND.s, border: 'none', background: 'none', cursor: 'pointer' }}><Pil vanster /></button>
      )}
      <h2 style={{ flex: 1, margin: 0, ...TYP.rubrik, color: FARG.text }}>{visaAvslutade ? 'Avslutade' : 'Välj objekt'}</h2>
      {kanStangas && (
        <button type="button" aria-label="Stäng" data-testid="objekt-lista-stang" onClick={onStang}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: TRAFFYTA.min, height: TRAFFYTA.min, borderRadius: RADIE.cirkel, border: 'none', background: FARG.upphojt, cursor: 'pointer' }}><Kryss /></button>
      )}
    </div>
  );

  const innehall = (
    <>
      {rubrik}
      <div style={{ flexShrink: 0, padding: `0 ${AVSTAND.l}px ${AVSTAND.s}px` }}>
        <input
          type="search"
          inputMode="search"
          data-testid="objekt-lista-sok"
          aria-label="Sök objekt"
          placeholder="Sök objekt"
          value={sok}
          onChange={(e) => setSok(e.target.value)}
          style={{ width: '100%', boxSizing: 'border-box', minHeight: TRAFFYTA.min, padding: `0 ${AVSTAND.m}px`, border: 'none', borderRadius: RADIE.rad, background: FARG.upphojt, color: FARG.text, fontFamily: 'inherit', ...TYP.text, outline: 'none' }}
        />
      </div>
      <div data-testid="objekt-lista-innehall" style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain', paddingBottom: medSafeBotten(AVSTAND.l) }}>
        {tomText ? (
          <div style={{ ...TYP.meta, color: FARG.text2, textAlign: 'center', padding: `${AVSTAND.xxl}px ${AVSTAND.l}px` }}>{tomText}</div>
        ) : visaAvslutade ? (
          grupper.avslutade.length === 0
            ? <div style={{ ...TYP.meta, color: FARG.text2, textAlign: 'center', padding: `${AVSTAND.xxl}px ${AVSTAND.l}px` }}>{sok.trim() ? `Inget avslutat objekt matchar "${sok.trim()}".` : 'Inga avslutade objekt.'}</div>
            : grupper.avslutade.map((o) => rad(o, 'gra'))
        ) : (
          <>
            {grupper.pagar.length > 0 && <>{gruppRubrik('pagar', 'Pågår')}{grupper.pagar.map((o) => rad(o, 'gron'))}</>}
            {grupper.planerade.length > 0 && <>{gruppRubrik('planerade', 'Planerade')}{grupper.planerade.map((o) => rad(o, 'gra'))}</>}
            {grupper.oplanerade.length > 0 && <>{gruppRubrik('oplanerade', 'Oplanerade')}{grupper.oplanerade.map((o) => rad(o, 'gra'))}</>}
            {aktivaAntal === 0 && (
              <div style={{ ...TYP.meta, color: FARG.text2, textAlign: 'center', padding: `${AVSTAND.xl}px ${AVSTAND.l}px` }}>
                {sok.trim() ? `Inget objekt matchar "${sok.trim()}".` : 'Inga aktiva objekt. Avslutade finns längst ner.'}
              </div>
            )}
            {grupper.avslutade.length > 0 && (
              <div
                role="button"
                tabIndex={0}
                data-testid="objekt-lista-avslutade"
                onClick={() => setVisaAvslutade(true)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setVisaAvslutade(true); } }}
                className="press-row"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: TRAFFYTA.primar + AVSTAND.s, padding: `0 ${AVSTAND.l}px`, marginTop: AVSTAND.s, borderTop: `1px solid ${FARG.linje}`, cursor: 'pointer', ...TYP.listtitel, color: FARG.text }}
              >
                <span>Avslutade <span style={{ color: FARG.text2, fontWeight: 400, ...TNUM }}>({grupper.avslutade.length})</span></span>
                <Pil />
              </div>
            )}
          </>
        )}
      </div>
    </>
  );

  const ram: React.CSSProperties = lage === 'panel'
    ? {
        top: `calc(env(safe-area-inset-top, 0px) + ${AVSTAND.s}px)`, right: AVSTAND.s, bottom: `calc(env(safe-area-inset-bottom, 0px) + ${AVSTAND.s}px)`,
        width: `min(${PANEL_BREDD_PX}px, calc(100vw - ${2 * AVSTAND.s}px))`, paddingTop: AVSTAND.l, borderRadius: RADIE.sheet, border: `1px solid ${FARG.linje}`,
        transform: glidInne ? 'translateX(0)' : `translateX(calc(100% + ${2 * AVSTAND.s}px))`,
      }
    : {
        left: 0, right: 0, bottom: 0, height: '85%', maxHeight: '100%', paddingTop: AVSTAND.l, borderRadius: `${RADIE.sheet}px ${RADIE.sheet}px 0 0`, borderTop: `1px solid ${FARG.linje}`,
        transform: glidInne ? 'translateY(0)' : 'translateY(100%)',
      };
  const minskadRorelse = typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  return (
    <>
      {oppen && kanStangas && (
        <div data-testid="objekt-lista-bakgrund" onClick={() => { if (Date.now() - oppnadTid.current < FORSTA_KLICK_SPARR_MS) return; onStang(); }} style={{ position: 'fixed', inset: 0, zIndex: 640 }} />
      )}
      <div
        role="dialog"
        aria-label="Välj objekt"
        data-testid="objekt-lista"
        data-lage={lage}
        data-oppen={oppen ? '1' : '0'}
        aria-hidden={oppen ? undefined : true}
        style={{ position: 'fixed', zIndex: 650, boxSizing: 'border-box', background: FARG.kort, color: FARG.text, fontFamily: 'inherit', display: 'flex', flexDirection: 'column', overscrollBehavior: 'contain',
          pointerEvents: oppen ? 'auto' : 'none', transition: minskadRorelse ? 'none' : `transform ${RORELSE.byte}ms ${RORELSE.kurva}`, ...ram }}
      >
        {innehall}
      </div>
    </>
  );
}
