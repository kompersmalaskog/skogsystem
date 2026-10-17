'use client';

// Små delar som "Klar med trakten?"-kortet och vedarket delar: ett val (vald = vit fyllning, aldrig blå), en fältetikett och en text-/siffruta.
// Bara tokens (lib/design/tokens).

import React from 'react';
import { AVSTAND, FARG, RADIE, TNUM, TRAFFYTA, TYP } from '@/lib/design/tokens';

/** Ett val i en rad av val. Vald = vit fyllning med svart text (blått är aldrig vald rad); alltid minst 44 px. */
export function Val({ vald, onTryck, children, testid, ton }: { vald: boolean; onTryck: () => void; children: React.ReactNode; testid?: string; ton?: 'orange' }) {
  return (
    <button type="button" data-testid={testid} aria-pressed={vald} onClick={onTryck} className="press-scale"
      style={{
        minHeight: TRAFFYTA.min, padding: `0 ${AVSTAND.m}px`, borderRadius: RADIE.knapp, border: 'none', cursor: 'pointer', fontFamily: 'inherit', touchAction: 'manipulation',
        background: vald ? FARG.text : FARG.fyllning, color: vald ? FARG.bg : (ton === 'orange' ? FARG.orange : FARG.text), ...TYP.listtitel,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
      {children}
    </button>
  );
}

/** Fältetikett över en ruta. */
export const Etikett = ({ children }: { children: React.ReactNode }) => (
  <div style={{ ...TYP.meta, color: FARG.text2, margin: `${AVSTAND.s}px ${AVSTAND.xs}px ${AVSTAND.xs}px` }}>{children}</div>
);

/**
 * Text- eller siffrafält i kortets stil. `kompakt` = ett tal som redigeras PÅ PLATS (prognoskortet): högerställt, tabellsiffror, smalare marginal,
 * fokus direkt och klart vid Enter/blur — då försvinner fältet och talet står kvar.
 */
export function Falt({ value, onChange, placeholder, label, testid, numeriskt = false, kompakt = false, onKlart }: {
  value: string; onChange: (v: string) => void; placeholder?: string; label: string; testid?: string; numeriskt?: boolean; kompakt?: boolean; onKlart?: () => void;
}) {
  return (
    <input data-testid={testid} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={label} inputMode={numeriskt ? 'decimal' : undefined}
      autoFocus={kompakt} onBlur={onKlart} onKeyDown={onKlart ? (e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); } : undefined}
      style={{ width: '100%', boxSizing: 'border-box', minHeight: TRAFFYTA.min, padding: `0 ${kompakt ? AVSTAND.m : AVSTAND.l}px`, borderRadius: RADIE.rad, border: 'none', background: FARG.fyllning, color: FARG.text, fontFamily: 'inherit', outline: 'none', ...TYP.text, ...(kompakt ? { ...TNUM, textAlign: 'right' as const } : null) }} />
  );
}
