'use client';
// Maskinfiltret överst på alla flikar utom Objekt (som är maskinoberoende): en rad som visar vald maskin och öppnar maskinarket.
import Ikon from '@/components/design/Ikon';
import { FARG, IKON } from '@/lib/design/tokens';
import { FALT_KNAPP } from './delar';

export default function MaskinFilter({ etikett, onTryck }: { etikett: string; onTryck: () => void }) {
  return (
    <button type="button" onClick={onTryck} style={FALT_KNAPP} aria-haspopup="dialog">
      <Ikon namn="tune" storlek={IKON.rad} farg={FARG.text} />
      <span style={{ flex: 1, minWidth: 0, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{etikett}</span>
      <Ikon namn="expand_more" storlek={IKON.rad} farg={FARG.text2} />
    </button>
  );
}
