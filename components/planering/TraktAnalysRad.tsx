'use client';

// TRAKTANALYS PÅ EN RAD (Kortet del 2, 2026-10-21). Förut stod sju kontroller under varandra på varje Vida-ytas kort, nästan alltid "Ingen träff" sju gånger.
// Nu är svaret EN rad: "✓ Traktanalys: inget hittat · 7 kontroller ›". Träffar (och kontroller som inte gick att köra) visas utfällda direkt, och ett tryck
// på raden fäller ut alla sju. "Inget hittat" sägs bara när alla sju faktiskt kördes: en kontroll som FELADE är aldrig "ingen träff".

import React, { useState } from 'react';
import { AVSTAND, FARG, IKON, TRAFFYTA, TYP, VIKT } from '@/lib/design/tokens';

export type KontrollLage = 'traff' | 'ingen' | 'osaker';

export interface Kontroll {
  type: string;
  label: string;
  lage: KontrollLage;
  traffar: { name: string; details?: string | null }[];
}

export type AnalysStatus = 'laddar' | 'fel' | 'klar';

/** Radens text och läge — ren funktion (testas utan rendering). */
export function analysSammanfattning(kontroller: Kontroll[]): { ikon: '✓' | '●' | '!'; text: string; farg: 'dam' | 'rod' | 'orange' } {
  const antal = kontroller.length;
  const traffar = kontroller.reduce((s, k) => s + (k.lage === 'traff' ? Math.max(1, k.traffar.length) : 0), 0);
  const osakra = kontroller.filter((k) => k.lage === 'osaker').length;
  if (traffar > 0) return { ikon: '●', text: `Traktanalys: ${traffar} träff${traffar > 1 ? 'ar' : ''} · ${antal} kontroller`, farg: 'rod' };
  if (osakra > 0) return { ikon: '!', text: `Traktanalys: ${osakra} ${osakra > 1 ? 'kontroller' : 'kontroll'} kunde inte köras · ${antal} kontroller`, farg: 'orange' };
  return { ikon: '✓', text: `Traktanalys: inget hittat · ${antal} kontroller`, farg: 'dam' };
}

export function TraktAnalysRad({ status, kontroller }: { status: AnalysStatus; kontroller: Kontroll[] }) {
  const [alla, setAlla] = useState(false);
  if (status === 'laddar') return <div data-testid="traktanalys-rad" style={{ ...TYP.text, color: FARG.text2 }}>Traktanalys: analyserar…</div>;
  if (status === 'fel') return <div data-testid="traktanalys-rad" style={{ ...TYP.text, color: FARG.orange }}>Traktanalys: kunde inte köras – försök igen.</div>;
  const sam = analysSammanfattning(kontroller);
  const farg = sam.farg === 'rod' ? FARG.rod : sam.farg === 'orange' ? FARG.orange : FARG.text;
  // Träffar och kontroller som inte gick att köra visas utfällda direkt; ett tryck på raden fäller ut resten.
  const synliga = alla ? kontroller : kontroller.filter((k) => k.lage !== 'ingen');
  return (
    <div data-testid="traktanalys" style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
      <button type="button" data-testid="traktanalys-rad" aria-expanded={alla} onClick={() => setAlla((v) => !v)} className="press-dim"
        style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s, minHeight: TRAFFYTA.min, width: '100%', padding: 0, border: 'none', background: 'transparent', color: farg, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', ...TYP.text }}>
        <span aria-hidden style={{ flexShrink: 0, width: AVSTAND.l, textAlign: 'center', fontWeight: VIKT.fet }}>{sam.ikon}</span>
        <span style={{ flex: 1, minWidth: 0 }}>{sam.text}</span>
        <span className="material-symbols-outlined" aria-hidden style={{ flexShrink: 0, fontSize: IKON.rad, color: FARG.text2, transform: alla ? 'rotate(90deg)' : 'none' }}>chevron_right</span>
      </button>
      {synliga.length > 0 && (
        <div data-testid="traktanalys-kontroller" style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s, paddingLeft: AVSTAND.xl }}>
          {synliga.map((k) => {
            const symFarg = k.lage === 'traff' ? FARG.rod : k.lage === 'osaker' ? FARG.orange : FARG.text3;
            const status = k.lage === 'traff' ? `${k.traffar.length || 1} träff${k.traffar.length > 1 ? 'ar' : ''}` : k.lage === 'osaker' ? 'Kunde inte kontrollera' : 'Ingen träff';
            return (
              <div key={k.type} data-testid="traktanalys-kontroll" data-lage={k.lage} style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.xs }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: AVSTAND.s, ...TYP.text }}>
                  <span aria-hidden style={{ color: symFarg, fontWeight: VIKT.fet, width: AVSTAND.m, textAlign: 'center', flexShrink: 0 }}>{k.lage === 'traff' ? '●' : k.lage === 'osaker' ? '!' : '–'}</span>
                  <span style={{ flex: 1, color: FARG.text }}>{k.label}</span>
                  <span style={{ ...TYP.meta, color: k.lage === 'ingen' ? FARG.text2 : symFarg }}>{status}</span>
                </div>
                {k.lage === 'traff' && k.traffar.map((h, i) => (
                  <div key={i} style={{ ...TYP.meta, color: FARG.text2, paddingLeft: AVSTAND.l }}>
                    {h.name}{h.details ? <span style={{ color: FARG.text3 }}> · {h.details}</span> : null}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default TraktAnalysRad;
