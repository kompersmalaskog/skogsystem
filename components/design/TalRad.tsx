'use client';
// TalRad: ett tal som SVARAR PÅ NÅGOT. Etiketten till vänster (TYP.listtitel), talfältet med enhet till höger, och en rad under som räknar om medan
// man skriver — "379 inlagt · 621 kvar". Man ser vad ändringen betyder, inte bara vad den är, och behöver aldrig stänga arket för att se om talet räckte.
//
// Falt (etikett OVANPÅ fältet) är för ett fält i ett formulär. TalRad är för en rad där etiketten ÄR sakens namn ("Gallring") och fältet är dess tal;
// den ersätter inte Falt. Färgen på raden under är aldrig ensam: orden (kvar / fylld / över) står alltid i texten.
//   dampad — normaltillståndet (till exempel "kvar": ingen har gjort något fel)
//   gron   — klart eller mer än klart
//   orange — bara när något kräver en hand
import { useId, type ReactNode } from 'react';
import { AVSTAND, FARG, RAD, RADIE, TNUM, TYP } from '@/lib/design/tokens';

export type TalRadTon = 'dampad' | 'gron' | 'orange';
const TON: Record<TalRadTon, string> = { dampad: FARG.text2, gron: FARG.gron, orange: FARG.orange };

type Props = {
  etikett: string;
  value: string;
  onChange: (v: string) => void;
  enhet?: string;
  /** Raden under fältet. Utelämnad = ingen rad. */
  under?: ReactNode;
  underTon?: TalRadTon;
  inputMode?: 'numeric' | 'decimal';
  sista?: boolean;
  /** Test- och spårnyckel på raden. */
  attr?: Record<string, string>;
};

export default function TalRad({ etikett, value, onChange, enhet, under, underTon = 'dampad', inputMode = 'numeric', sista, attr }: Props) {
  const id = useId();
  const underId = `${id}-under`;
  const harUnder = under != null && under !== '';
  return (
    <div style={{ borderBottom: sista ? 'none' : RAD.borderBottom, padding: `${AVSTAND.s}px 0` }} {...attr}>
      <div style={{ ...RAD, borderBottom: 'none', padding: 0 }}>
        <label htmlFor={id} style={{ flex: 1, minWidth: 0, ...TYP.listtitel, color: FARG.text, overflowWrap: 'anywhere' }}>{etikett}</label>
        <input
          id={id} value={value} onChange={e => onChange(e.target.value)} inputMode={inputMode} autoComplete="off" aria-describedby={harUnder ? underId : undefined}
          style={{ width: '8em', flexShrink: 0, boxSizing: 'border-box', minHeight: RAD.minHeight, background: FARG.fyllning, border: 'none', outline: 'none', borderRadius: RADIE.rad, color: FARG.text, ...TYP.listtitel, ...TNUM, textAlign: 'right', padding: `0 ${AVSTAND.m}px`, fontFamily: 'inherit', colorScheme: 'dark' }}
        />
        {enhet && <span style={{ ...TYP.meta, color: FARG.text2, flexShrink: 0 }}>{enhet}</span>}
      </div>
      {harUnder && <div id={underId} role="status" aria-live="polite" data-talrad-under="" data-ton={underTon} style={{ ...TYP.meta, ...TNUM, color: TON[underTon], marginTop: AVSTAND.xs }}>{under}</div>}
    </div>
  );
}
