'use client';

import { AVSTAND, FARG, IKON, KNAPP, KORT, TRAFFYTA, TYP } from '@/lib/design/tokens';
import { lassSaknarText } from '@/lib/lastbil/lass/vantar';
import type { SaknarLage } from './useSaknarMaskin';

/**
 * "1 lass saknar maskin" — EN rad överst på Lastbilen, bara när något väntar och bara för admin (som VantarRad och Arbetsrapportens
 * väntar-rad). Trycket öppnar frågan för det äldsta lasset; när den är besvarad står nästa där. Inget väntar → ingen rad alls
 * (aldrig "0 lass"). Ett läsfel är ett fel (aldrig "inget väntar"): raden säger det och erbjuder Försök igen.
 */
export default function SaknarMaskinRad({ lage, onOppna, onForsokIgen }: { lage: SaknarLage; onOppna: (lassId: string) => void; onForsokIgen: () => void }) {
  if (lage.lage === 'fel') {
    return (
      <div role="alert" data-saknar-maskin style={{ ...KORT, padding: `${AVSTAND.s}px ${AVSTAND.l}px`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: AVSTAND.m, minHeight: TRAFFYTA.min }}>
        <span style={{ ...TYP.meta, color: FARG.text2 }}>Kunde inte läsa vilka lass som saknar maskin</span>
        <button type="button" onClick={onForsokIgen} style={{ ...KNAPP.lank, ...TYP.meta }}>Försök igen</button>
      </div>
    );
  }
  if (lage.lage !== 'klar' || lage.rader.length === 0) return null;
  const forsta = lage.rader[0];
  return (
    <button type="button" data-saknar-maskin onClick={() => onOppna(forsta.id)}
      style={{ ...KORT, width: '100%', padding: `${AVSTAND.s}px ${AVSTAND.l}px`, minHeight: TRAFFYTA.min, display: 'flex', alignItems: 'center', gap: AVSTAND.s, border: 'none', textAlign: 'left', color: FARG.text, font: 'inherit', cursor: 'pointer' }}>
      <span aria-hidden style={{ width: AVSTAND.s, height: AVSTAND.s, borderRadius: '50%', background: FARG.orange, flex: 'none' }} />
      <span style={{ ...TYP.listtitel, color: FARG.text, flex: 1 }}>{lassSaknarText(lage.rader.length)}</span>
      <span className="material-symbols-outlined" aria-hidden style={{ fontSize: IKON.text, color: FARG.text3 }}>chevron_right</span>
    </button>
  );
}
