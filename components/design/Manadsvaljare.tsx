'use client';
// Månadsväljare: ‹ Oktober 2026 ›. Samma form som Lastbilens periodrad (chevron_left / etikett / chevron_right, 44 px träffyta),
// som egen komponent så ingen vy ritar den på nytt. Etiketten är `TYP.listtitel`; en spärrad riktning är `INAKTIV`.
import { INAKTIV, KNAPP, IKON, TRAFFYTA, TYP, FARG } from '@/lib/design/tokens';
import Ikon from './Ikon';

type Props = {
  etikett: string;
  onBakat: () => void;
  onFramat: () => void;
  kanBakat?: boolean;
  kanFramat?: boolean;
};

export default function Manadsvaljare({ etikett, onBakat, onFramat, kanBakat = true, kanFramat = true }: Props) {
  const steg = { ...KNAPP.lank, width: TRAFFYTA.min, justifyContent: 'center' } as const;
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <button type="button" aria-label="Förra månaden" disabled={!kanBakat} onClick={onBakat} style={{ ...steg, ...(kanBakat ? null : INAKTIV) }}>
        <Ikon namn="chevron_left" storlek={IKON.rad} farg="inherit" />
      </button>
      <span style={{ ...TYP.listtitel, color: FARG.text }} aria-live="polite">{etikett}</span>
      <button type="button" aria-label="Nästa månad" disabled={!kanFramat} onClick={onFramat} style={{ ...steg, ...(kanFramat ? null : INAKTIV) }}>
        <Ikon namn="chevron_right" storlek={IKON.rad} farg="inherit" />
      </button>
    </div>
  );
}
