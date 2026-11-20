'use client';

// Väder för skotaren: morgonkortet (högst ett per dag, bara om något gäller) och kommande dagar i ⓘ-kortet.

import React from 'react';
import { AVSTAND, FARG, TNUM, TYP } from '@/lib/design/tokens';
import { vaderIkon, type Morgonkort, type VaderDag, type VaderIkon } from '@/lib/skotarLass/vader';
import { knappPrimar, meta, smaRubrik } from './stil';

export function MorgonKortVy({ kort, onOk }: { kort: Morgonkort; onOk: () => void }) {
  return (
    <div data-testid="morgonkort" role="dialog" aria-label="Idag"
      style={{ position: 'fixed', left: AVSTAND.l, right: AVSTAND.l, top: '30%', zIndex: 330, maxWidth: 480, margin: '0 auto', background: FARG.kort, color: FARG.text, borderRadius: 16, border: `1px solid ${FARG.linje}`, padding: AVSTAND.l, fontFamily: 'inherit' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.m }}>
        {kort.rader.map((r) => (<div key={r} style={{ ...TYP.rubrik }}>{r}</div>))}
      </div>
      <button type="button" data-testid="morgonkort-ok" onClick={onOk} style={{ ...knappPrimar, width: '100%', marginTop: AVSTAND.l }}>OK</button>
    </div>
  );
}

const DAG = ['sön', 'mån', 'tis', 'ons', 'tor', 'fre', 'lör'];
const MAN = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const dagText = (iso: string) => { const d = new Date(`${iso}T12:00:00Z`); return `${DAG[d.getUTCDay()]} ${d.getUTCDate()} ${MAN[d.getUTCMonth()]}`; };
const dygnEfter = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
/** "Idag", "I morgon", annars veckodag och datum. */
export function vaderDagText(datum: string, idag: string | null): string {
  if (idag && datum === idag) return 'Idag';
  if (idag && datum === dygnEfter(idag, 1)) return 'I morgon';
  return dagText(datum);
}

/** Enkla linjeikoner i textfärgen (ingen egen färg) – 24 × 24, samma streckvikt som övriga ikoner i skotarläget. */
export function VaderIkonBild({ ikon }: { ikon: VaderIkon | null }) {
  if (!ikon) return <span aria-hidden="true" style={{ width: 24, height: 24, display: 'inline-block' }} />;
  const moln = <path d="M7 18h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7.2 9.2 4.4 4.4 0 0 0 7 18Z" />;
  return (
    <svg data-testid={`vader-ikon-${ikon}`} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ikon === 'sol' && <><circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" /></>}
      {ikon === 'halvklart' && <><circle cx="8.5" cy="8.5" r="3" /><path d="M8.5 2.5v1M2.5 8.5h1M4.3 4.3l.7.7M12.7 4.3 12 5" /><path d="M9 19h8.5a3.5 3.5 0 0 0 .4-6.97A4.6 4.6 0 0 0 9.4 12 3.5 3.5 0 0 0 9 19Z" /></>}
      {ikon === 'moln' && moln}
      {ikon === 'dimma' && <><path d="M4 9h16M6 13h12M4 17h16" /></>}
      {ikon === 'regn' && <>{moln}<path d="M9 21l1-2M13 21l1-2M17 21l1-2" /></>}
      {ikon === 'snoblandat' && <>{moln}<path d="M9 20.5v.01M13 20.5v.01M17 20.5v.01M11 22.5v.01M15 22.5v.01" strokeWidth="2.4" /></>}
      {ikon === 'aska' && <>{moln}<path d="m12.5 15-2 3h3l-2 3" /></>}
    </svg>
  );
}

/** Väder för trakten, de närmaste dagarna, under ⓘ: dag · ikon · temperatur · nederbörd (mm). Inga data → en rad som säger det, aldrig en tom ruta. */
export function VaderLista({ dagar, laddar, idag = null }: { dagar: readonly VaderDag[]; laddar: boolean; idag?: string | null }) {
  return (
    <div data-testid="vader-lista">
      <div style={{ ...smaRubrik, marginBottom: AVSTAND.s }}>Väder</div>
      {dagar.length === 0 ? (
        <div style={meta}>{laddar ? 'Hämtar väder…' : 'Väder saknas just nu.'}</div>
      ) : dagar.map((d) => (
        <div key={d.datum} data-testid="vader-dag" style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m, minHeight: 44, ...TYP.text }}>
          <span style={{ flex: 1, minWidth: 0 }}>{vaderDagText(d.datum, idag)}</span>
          <span style={{ color: FARG.text2, display: 'inline-flex' }}><VaderIkonBild ikon={vaderIkon(d.symbol)} /></span>
          <span data-testid="vader-temp" style={{ ...TNUM, color: FARG.text2, minWidth: 64, textAlign: 'right' }}>
            {d.tempMax != null ? `${Math.round(d.tempMin ?? d.tempMax)}–${Math.round(d.tempMax)}°` : '–'}
          </span>
          <span data-testid="vader-mm" style={{ ...TNUM, minWidth: 52, textAlign: 'right' }}>
            {d.regnMm != null ? `${d.regnMm < 0.5 ? 0 : Math.round(d.regnMm)} mm` : '–'}
          </span>
        </div>
      ))}
    </div>
  );
}
