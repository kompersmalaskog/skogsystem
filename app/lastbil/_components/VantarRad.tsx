'use client';

import { AVSTAND, FARG, IKON, KNAPP, KORT, TRAFFYTA, TYP } from '@/lib/design/tokens';
import type { VantarLage } from './useVantar';
import type { Pamminnelse } from './vantar';

/**
 * Påminnelsen — som Arbetsrapportens väntar-rad: EN rad, bara när något väntar, bara admin. Trycket
 * leder rakt till listan "Att godkänna". Inget väntar → ingen rad alls (aldrig "0 väntar").
 * Ett läsfel är ett fel (aldrig "inget väntar"): raden säger det och erbjuder Försök igen.
 */
export default function VantarRad({ lage, pamminnelse, onOppna, onForsokIgen }: {
  lage: VantarLage; pamminnelse: Pamminnelse | null; onOppna: (p: Pamminnelse) => void; onForsokIgen: () => void;
}) {
  if (lage.lage === 'fel') {
    return (
      <div role="alert" data-vantar style={{ ...KORT, padding: `${AVSTAND.s}px ${AVSTAND.l}px`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: AVSTAND.m, minHeight: TRAFFYTA.min }}>
        <span style={{ ...TYP.meta, color: FARG.text2 }}>Kunde inte läsa vad som väntar på godkännande</span>
        <button type="button" onClick={onForsokIgen} style={{ ...KNAPP.lank, ...TYP.meta }}>Försök igen</button>
      </div>
    );
  }
  if (lage.lage !== 'klar' || !pamminnelse) return null;
  return (
    <button type="button" data-vantar onClick={() => onOppna(pamminnelse)}
      style={{ ...KORT, width: '100%', padding: `${AVSTAND.s}px ${AVSTAND.l}px`, minHeight: TRAFFYTA.min, display: 'flex', alignItems: 'center', gap: AVSTAND.s, border: 'none', textAlign: 'left', color: FARG.text, font: 'inherit', cursor: 'pointer' }}>
      <span aria-hidden style={{ width: AVSTAND.s, height: AVSTAND.s, borderRadius: '50%', background: FARG.orange, flex: 'none' }} />
      <span style={{ ...TYP.listtitel, color: FARG.text, flex: 1 }}>{pamminnelse.text}</span>
      <span className="material-symbols-outlined" aria-hidden style={{ fontSize: IKON.text, color: FARG.text3 }}>chevron_right</span>
    </button>
  );
}
