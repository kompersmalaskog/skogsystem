'use client';

import { useMemo, useState } from 'react';
import { AVSTAND, FARG, IKON, RADIE, TYP } from '@/lib/design/tokens';
import type { PlatsKandidat } from './usePlatsData';

const MAX_TRAFFAR = 8;

/**
 * Välj en plats (trakt eller flyttplats) för Från/Till. Ingen ny skärm och inget ark ovanpå ark: fältet fäller
 * ut en sökruta med träffar på plats, och ett val fäller ihop det igen. "Okänd plats" tömmer valet.
 */
export default function PlatsVal({ etikett, objektId, platsId, platser, onVal }: {
  etikett: string; objektId: string | null; platsId: string | null; platser: readonly PlatsKandidat[];
  onVal: (v: { objekt: string | null; plats: string | null }) => void;
}) {
  const [oppen, setOppen] = useState(false);
  const [sok, setSok] = useState('');
  const vald = platser.find(p => (p.slag === 'objekt' ? p.id === objektId : p.id === platsId)) ?? null;
  const namn = vald?.namn ?? (objektId || platsId ? 'Okänt namn (platsen finns inte i listan)' : 'Okänd plats');

  const traffar = useMemo(() => {
    const q = sok.trim().toLocaleLowerCase('sv');
    if (!q) return platser.filter(p => p.slag === 'plats').slice(0, MAX_TRAFFAR);
    return platser.filter(p => p.namn.toLocaleLowerCase('sv').includes(q)).slice(0, MAX_TRAFFAR);
  }, [sok, platser]);

  const rad = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: AVSTAND.m, width: '100%', minHeight: 44, padding: `${AVSTAND.s}px ${AVSTAND.m}px`, background: 'none', border: 'none', textAlign: 'left' as const, color: FARG.text, font: 'inherit', cursor: 'pointer' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.xs }}>
      <span style={{ ...TYP.micro, color: FARG.text2 }}>{etikett}</span>
      <button type="button" aria-expanded={oppen} aria-label={`${etikett}: ${namn}`} onClick={() => setOppen(o => !o)}
        style={{ ...rad, background: FARG.fyllning, borderRadius: RADIE.rad, ...TYP.text }}>
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: vald || !(objektId || platsId) ? FARG.text : FARG.orange }}>{namn}</span>
        <span className="material-symbols-outlined" aria-hidden style={{ fontSize: IKON.text, color: FARG.text2 }}>{oppen ? 'expand_less' : 'expand_more'}</span>
      </button>
      {oppen && (
        <div style={{ background: FARG.fyllning, borderRadius: RADIE.rad, overflow: 'hidden' }}>
          <input autoFocus value={sok} onChange={e => setSok(e.target.value)} placeholder="Sök trakt eller plats" aria-label={`Sök ${etikett.toLocaleLowerCase('sv')}`}
            style={{ ...TYP.text, width: '100%', boxSizing: 'border-box', minHeight: 44, padding: `${AVSTAND.s}px ${AVSTAND.m}px`, background: FARG.upphojt, color: FARG.text, border: 'none', fontFamily: 'inherit' }} />
          <div role="listbox" aria-label={`Träffar ${etikett.toLocaleLowerCase('sv')}`}>
            {traffar.map(p => (
              <button key={`${p.slag}:${p.id}`} type="button" role="option" aria-selected={vald?.id === p.id && vald?.slag === p.slag}
                onClick={() => { onVal(p.slag === 'objekt' ? { objekt: p.id, plats: null } : { objekt: null, plats: p.id }); setOppen(false); setSok(''); }}
                style={rad}>
                <span style={{ ...TYP.text, minWidth: 0 }}>{p.namn}</span>
                <span style={{ ...TYP.meta, color: FARG.text2, flexShrink: 0 }}>{p.slag === 'plats' ? 'plats' : 'trakt'}</span>
              </button>
            ))}
            {traffar.length === 0 && <p style={{ ...TYP.meta, color: FARG.text2, margin: 0, padding: AVSTAND.m }}>Ingen träff på "{sok.trim()}".</p>}
            {!sok.trim() && <p style={{ ...TYP.meta, color: FARG.text2, margin: 0, padding: `${AVSTAND.xs}px ${AVSTAND.m}px ${AVSTAND.s}px` }}>Skriv för att söka bland trakterna.</p>}
            <button type="button" onClick={() => { onVal({ objekt: null, plats: null }); setOppen(false); setSok(''); }} style={{ ...rad, color: FARG.text2, borderTop: `1px solid ${FARG.linje}` }}>
              <span style={TYP.text}>Okänd plats</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
