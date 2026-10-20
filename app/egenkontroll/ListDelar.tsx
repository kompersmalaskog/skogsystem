'use client';

// Byggstenarna för egenkontrollens lista (PR 5). Allt mått, färg och typ ur lib/design/tokens — inga egna literaler.
//
// Formen: ett KORT överst som är ett beslut, sedan månadens dragna objekt, sedan tre kategorier med ETT ord var (Påbörjade, Klara) och
// under dem länken till allt annat. Får en kategori inget eget ord finns den inte. En rad = en sak: namn, en rad meta, en bilknapp.

import React from 'react';
import Ikon from '@/components/design/Ikon';
import { AVSTAND, FARG, FONT, IKON, KORT, RADIE, ROT_MIN_HOJD, TNUM, TRAFFYTA, TYP, VIKT, designCss, KOLUMN_CSS, kolumnRot } from '@/lib/design/tokens';
import { harKoordinat } from '@/lib/navigera';
import { kmText } from '@/lib/objektVal';
import { anmarkningsText, kortDatum } from './format';
import { vantatText } from '@/lib/egenkontrollStickprov';
import type { VantandeRad } from '@/lib/egenkontroll';

/** Luft sist, över bottennavigationen. */
const BOTTEN_LUFT = AVSTAND.xxl * 4;

export function ListRot({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: ROT_MIN_HOJD,
        ...kolumnRot(),
        background: FARG.bg,
        color: FARG.text,
        fontFamily: FONT,
        WebkitFontSmoothing: 'antialiased',
        padding: `${AVSTAND.l}px ${AVSTAND.sidmarginal}px ${BOTTEN_LUFT}px`,
        boxSizing: 'border-box',
      }}
    >
      <style>{designCss}{KOLUMN_CSS}</style>
      {children}
    </div>
  );
}

export const Bil = () => (
  <svg aria-hidden="true" width={IKON.text} height={IKON.text} viewBox="0 0 24 24" fill="none" stroke={FARG.text} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 16 L6.6 11 C6.9 10.1 7.7 9.5 8.6 9.5 H15.4 C16.3 9.5 17.1 10.1 17.4 11 L19 16" /><rect x="3.5" y="16" width="17" height="4" rx="1.5" />
    <circle cx="7.5" cy="18" r="0.6" fill={FARG.text} /><circle cx="16.5" cy="18" r="0.6" fill={FARG.text} />
  </svg>
);

/** Det en rad behöver. VantandeRad (lib/egenkontroll) uppfyller det. */
export type RadData = Pick<VantandeRad, 'objekt_id' | 'namn' | 'avslutat' | 'rundstatus' | 'lat' | 'lng' | 'typ' | 'areal' | 'antalPunkter' | 'klarDatum' | 'antalAvvikelser' | 'antalBattre'>;

/** Avståndet till en rad: km + om det bara är fågelväg (visas då med ~). null = inget känt avstånd. */
export type Avstand = { km: number; ungefar: boolean } | null;

/** Raden under namnet: status · avstånd · väntetid. Aldrig "N av M" — den siffran hör hemma inne i rundan. */
export function radMeta(r: RadData, avstand: Avstand, nu: Date = new Date()): string {
  const delar: string[] = [];
  if (r.rundstatus === 'pagaende') delar.push('Påbörjad');
  if (r.rundstatus === 'klar') {
    delar.push(`Klar ${r.klarDatum ? kortDatum(r.klarDatum) : 'datum saknas'} — ${anmarkningsText(r.antalAvvikelser, r.antalBattre)}`);
  }
  if (avstand && r.rundstatus !== 'klar') delar.push(kmText(avstand.km, avstand.ungefar));
  if (r.rundstatus !== 'klar') delar.push(vantatText(r.avslutat, nu));
  return delar.join(' · ');
}

/** Bilknappen: tryck startar navigeringen (lib/navigera — samma som objektlistan). Stoppar trycket så raden inte öppnas. */
export function BilKnapp({ r, avstand, onNavigera }: { r: RadData; avstand: Avstand; onNavigera: (r: RadData) => void }) {
  if (!harKoordinat(r)) return null;
  const txt = avstand ? kmText(avstand.km, avstand.ungefar) : '';
  return (
    <button
      type="button"
      data-testid={`bil-${r.objekt_id}`}
      aria-label={`Vägbeskrivning till ${r.namn}${txt ? `, ${txt}` : ''}`}
      onClick={(e) => { e.stopPropagation(); onNavigera(r); }}
      onKeyDown={(e) => e.stopPropagation()}
      style={{
        display: 'flex', alignItems: 'center', gap: AVSTAND.xs, flexShrink: 0, minHeight: TRAFFYTA.min, padding: `0 ${AVSTAND.m}px`, border: 'none',
        borderRadius: RADIE.knapp, background: FARG.fyllning, color: FARG.text, fontFamily: 'inherit', cursor: 'pointer', ...TYP.meta, fontWeight: VIKT.halvfet, ...TNUM,
        touchAction: 'manipulation',
      }}
    >
      <Bil />{txt}
    </button>
  );
}

export function Objektrad({ r, avstand, onOppna, onNavigera, sista }: {
  r: RadData; avstand: Avstand; onOppna: (r: RadData) => void; onNavigera: (r: RadData) => void; sista?: boolean;
}) {
  const meta = radMeta(r, avstand);
  return (
    <div
      role="button"
      tabIndex={0}
      data-testid={`rad-${r.objekt_id}`}
      aria-label={`${r.namn}${meta ? `, ${meta}` : ''}`}
      onClick={() => onOppna(r)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOppna(r); } }}
      className="press-row"
      style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.inuti, minHeight: TRAFFYTA.primar + AVSTAND.l, padding: `${AVSTAND.s}px 0`, cursor: 'pointer', borderBottom: sista ? 'none' : `1px solid ${FARG.linje}` }}
    >
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', ...TYP.listtitel, color: r.rundstatus === 'klar' ? FARG.text2 : FARG.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.namn}</span>
        {meta && <span style={{ display: 'block', ...TYP.meta, color: FARG.text2, overflowWrap: 'anywhere', ...TNUM }}>{meta}</span>}
      </span>
      <BilKnapp r={r} avstand={avstand} onNavigera={onNavigera} />
    </div>
  );
}

/** En grupp av rader i ett kort (rubrik ovanför kortet, aldrig inuti). */
export function RadKort({ rubrik, hogerText, children, testid }: { rubrik: string; hogerText?: string; children: React.ReactNode; testid: string }) {
  return (
    <section aria-label={rubrik} data-testid={testid} style={{ marginBottom: AVSTAND.xl }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: `0 ${AVSTAND.xs}px ${AVSTAND.xs}px` }}>
        <h3 style={{ ...TYP.micro, color: FARG.text2, margin: 0 }}>{rubrik}</h3>
        {hogerText && <span style={{ ...TYP.micro, color: FARG.text2 }}>{hogerText}</span>}
      </div>
      <div style={{ ...KORT, paddingTop: 0, paddingBottom: 0 }}>{children}</div>
    </section>
  );
}

/** Dämpad text under en grupp: klusterraden, förklaringen, dragningstiden. */
export function Not({ children, testid }: { children: React.ReactNode; testid?: string }) {
  return <p data-testid={testid} style={{ ...TYP.meta, color: FARG.text2, margin: `${AVSTAND.xs}px ${AVSTAND.xs}px 0` }}>{children}</p>;
}

/** En kategori med ETT ord och ett antal: "Påbörjade (8) ›". Öppnar sin lista. */
export function Kategorirad({ ord, antal, onOppna, sista }: { ord: string; antal?: number; onOppna: () => void; sista?: boolean }) {
  return (
    <button
      type="button"
      data-testid={`kategori-${ord.toLowerCase().replace(/\s+/g, '-')}`}
      onClick={onOppna}
      className="press-row"
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', minHeight: TRAFFYTA.primar, padding: `${AVSTAND.s}px 0`, border: 'none', background: 'none',
        color: FARG.text, fontFamily: 'inherit', ...TYP.listtitel, textAlign: 'left', cursor: 'pointer', borderBottom: sista ? 'none' : `1px solid ${FARG.linje}`,
      }}
    >
      <span>{ord}{antal != null && <span style={{ color: FARG.text2, ...TNUM }}> ({antal})</span>}</span>
      <Ikon namn="chevron_right" farg={FARG.text3} />
    </button>
  );
}

/** Tillbaka till huvudlistan (inuti sidan). Blått = navigerar. */
export function TillbakaRad({ onTillbaka }: { onTillbaka: () => void }) {
  return (
    <button
      type="button"
      data-testid="tillbaka"
      onClick={onTillbaka}
      style={{ display: 'inline-flex', alignItems: 'center', gap: AVSTAND.xs, minHeight: TRAFFYTA.min, marginLeft: -AVSTAND.s, padding: 0, border: 'none', background: 'none', color: FARG.bla, fontFamily: 'inherit', ...TYP.text, cursor: 'pointer' }}
    >
      <Ikon namn="chevron_left" storlek={IKON.rad} farg={FARG.bla} />Egenkontroll
    </button>
  );
}

/** Typväljare under "Starta på ett annat objekt" — visas bara när det finns mer än en typ. */
export function Typval({ typer, vald, onVal }: { typer: { id: string; etikett: string; antal: number }[]; vald: string; onVal: (id: string) => void }) {
  return (
    <div role="tablist" style={{ display: 'flex', gap: AVSTAND.s, margin: `0 0 ${AVSTAND.l}px` }}>
      {typer.map((t) => {
        const aktiv = t.id === vald;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={aktiv}
            data-testid={`typ-${t.id}`}
            onClick={() => onVal(t.id)}
            style={{
              flex: 1, minHeight: TRAFFYTA.min, border: 'none', borderRadius: RADIE.knapp, fontFamily: 'inherit', ...TYP.meta, fontWeight: VIKT.halvfet, cursor: 'pointer',
              background: aktiv ? FARG.text : FARG.fyllning, color: aktiv ? FARG.bg : FARG.text,
            }}
          >
            {t.etikett} <span style={TNUM}>{t.antal}</span>
          </button>
        );
      })}
    </div>
  );
}
