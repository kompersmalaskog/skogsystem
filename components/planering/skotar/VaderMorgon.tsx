'use client';

// Väder för skotaren: morgonkortet (högst ett per dag, bara om något gäller) och kommande dagar i ⓘ-kortet.

import React from 'react';
import { AVSTAND, FARG, TNUM, TYP } from '@/lib/design/tokens';
import type { Morgonkort, VaderDag } from '@/lib/skotarLass/vader';
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

/** Kommande dagar bakom ⓘ: regn (mm) och temperatur. Inga data → en rad som säger det, aldrig en tom ruta. */
export function VaderLista({ dagar, laddar }: { dagar: readonly VaderDag[]; laddar: boolean }) {
  return (
    <div data-testid="vader-lista">
      <div style={{ ...smaRubrik, marginBottom: AVSTAND.s }}>Väder</div>
      {dagar.length === 0 ? (
        <div style={meta}>{laddar ? 'Hämtar väder…' : 'Väder saknas just nu.'}</div>
      ) : dagar.map((d) => (
        <div key={d.datum} style={{ display: 'flex', justifyContent: 'space-between', gap: AVSTAND.m, minHeight: 36, alignItems: 'center', ...TYP.text }}>
          <span>{dagText(d.datum)}</span>
          <span style={{ ...TNUM, color: FARG.text2 }}>
            {d.regnMm != null ? (d.regnMm >= 1 ? `${Math.round(d.regnMm)} mm` : 'torrt') : ''}
            {d.tempMax != null ? `  ${Math.round(d.tempMin ?? d.tempMax)}–${Math.round(d.tempMax)}°` : ''}
          </span>
        </div>
      ))}
    </div>
  );
}
