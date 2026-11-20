'use client';
// Maskinvalet i rubriken: "Giant ▾". Ett tryck fäller ut en liten meny med de aktiva maskinerna (en bock vid den som visas). Det finns inget
// "Alla maskiner" — en sammanslagen bedömning av flera maskiner är ingen Vida-bedömning. Med EN aktiv maskin finns inget att välja: bara namnet.
import { useEffect, useRef, useState } from 'react';
import Ikon from '@/components/design/Ikon';
import { AVSTAND, FARG, IKON, RADIE, TRAFFYTA, TYP } from '@/lib/design/tokens';
import { maskinNamn } from '@/lib/kalibrering/ordlista';
import type { AlleMaskin } from '@/lib/kalibrering/typer';

export default function MaskinMeny({ maskiner, valdId, onVal }: { maskiner: AlleMaskin[]; valdId: string | null; onVal: (id: string) => void }) {
  const [oppen, setOppen] = useState(false);
  const rot = useRef<HTMLDivElement>(null);
  const vald = maskiner.find(m => m.maskin_id === valdId);
  const namn = vald ? maskinNamn(vald) : valdId ?? '';
  const kanValja = maskiner.length > 1;

  useEffect(() => {
    if (!oppen) return;
    const stang = (e: Event) => { if (!rot.current?.contains(e.target as Node)) setOppen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOppen(false); };
    document.addEventListener('pointerdown', stang);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', stang); document.removeEventListener('keydown', esc); };
  }, [oppen]);

  if (!kanValja) {
    return <h1 style={{ margin: 0, ...TYP.rubrik, color: FARG.text }} data-maskin-namn="">{namn}</h1>;
  }
  return (
    <div ref={rot} style={{ position: 'relative', display: 'inline-block' }} data-maskin-meny="">
      <button type="button" aria-haspopup="menu" aria-expanded={oppen} onClick={() => setOppen(o => !o)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: AVSTAND.xs, minHeight: TRAFFYTA.min, padding: 0, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', color: FARG.text, ...TYP.rubrik }}>
        <span>{namn}</span>
        <Ikon namn="expand_more" storlek={IKON.rad} farg={FARG.text2} />
      </button>
      {oppen && (
        <div role="menu" aria-label="Välj maskin"
          style={{ position: 'absolute', top: '100%', left: 0, zIndex: 40, minWidth: 220, padding: `${AVSTAND.xs}px 0`, background: FARG.upphojt, borderRadius: RADIE.kort, overflow: 'hidden' }}>
          {maskiner.map(m => {
            const ar = m.maskin_id === valdId;
            return (
              <button key={m.maskin_id} type="button" role="menuitemradio" aria-checked={ar} onClick={() => { setOppen(false); if (!ar) onVal(m.maskin_id); }}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: AVSTAND.l, width: '100%', minHeight: TRAFFYTA.min, padding: `0 ${AVSTAND.l}px`, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', color: FARG.text, textAlign: 'left', ...TYP.text }}>
                <span>{maskinNamn(m)}</span>
                {ar && <Ikon namn="check" storlek={IKON.rad} farg={FARG.text} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
