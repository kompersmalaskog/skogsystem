'use client';

import { useState } from 'react';
import Ark from '@/components/design/Ark';
import { AVSTAND, FARG, INAKTIV, KNAPP, RADIE, TNUM, TYP } from '@/lib/design/tokens';
import type { UnderlagRad } from './fakturerbart';

/**
 * Stämmer något inte: stryk flytten med anledning. Stryka = MÄRKA, aldrig radera (flytten finns kvar i
 * Flyttloggens data, och under Strukna med sin anledning). Arket ÄR bekräftelsen — knappen är grå
 * tills en anledning står där.
 */
export default function StrykArk({ rad, maskin, stracka, datum, sparar, fel, onStryk, onStang }: {
  rad: UnderlagRad; maskin: string; stracka: string; datum: string; sparar: boolean; fel: string | null;
  onStryk: (anledning: string) => void; onStang: () => void;
}) {
  const [anledning, setAnledning] = useState('');
  const klar = anledning.trim().length > 0 && !sparar;
  return (
    <Ark rubrik="Stryk flytten" onStang={onStang}
      fot={(
        <>
          {fel && <p role="alert" style={{ ...TYP.meta, color: FARG.rod, margin: 0 }}>{fel}</p>}
          <button type="button" disabled={!klar} onClick={() => onStryk(anledning)}
            style={{ ...KNAPP.destruktiv, justifyContent: 'center', width: '100%', ...(klar ? {} : INAKTIV) }}>
            {sparar ? 'Stryker …' : 'Stryk flytten'}
          </button>
        </>
      )}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.m }}>
        <div>
          <div style={{ ...TYP.listtitel, color: FARG.text }}>{maskin}</div>
          <div style={{ ...TYP.meta, color: FARG.text2 }}>{stracka}</div>
          <div style={{ ...TYP.meta, ...TNUM, color: FARG.text2 }}>
            {datum}{rad.kund ? ` · Kund: ${rad.kund}` : ''} · {rad.km != null ? `${Math.round(rad.km).toLocaleString('sv-SE')} km` : 'km saknas i datan'}
          </div>
        </div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.xs }}>
          <span style={{ ...TYP.micro, color: FARG.text2 }}>Varför stryks flytten?</span>
          <textarea value={anledning} onChange={e => setAnledning(e.target.value)} rows={3} autoFocus
            placeholder="t.ex. dubblett, fel maskin, flyttades aldrig"
            style={{ ...TYP.text, color: FARG.text, background: FARG.fyllning, border: 'none', borderRadius: RADIE.rad, padding: AVSTAND.m, resize: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }} />
        </label>
        <p style={{ ...TYP.meta, color: FARG.text2, margin: 0 }}>
          En struken flytt går aldrig till faktureringen. Den ligger kvar under Strukna med anledningen.
        </p>
      </div>
    </Ark>
  );
}
