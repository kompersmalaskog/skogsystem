'use client';

import { AVSTAND, FARG, IKON, RAD, TNUM, TRAFFYTA, TYP } from '@/lib/design/tokens';
import { rundaMarkningar, rundaRubrik, rundaTidRad, rundaUnder, type Farg } from './rundaText';
import type { Runda } from './rundor';

export const MARKNING_FARG: Record<Farg, string> = { orange: FARG.orange, gron: FARG.gron, dampad: FARG.text2 };

/**
 * EN rad per runda, alltid tryckbar — också Övrig körning (60 % av milen; den var en streckad,
 * otryckbar summarad i de gamla vyerna). Två rader text och ETT tal: rad 1 "datum · tid" med km till höger,
 * rad 2 "Maskin · Från → Till" (flytt) eller "Övrig körning" — klipps med … på en rad, namnen kortas aldrig.
 * Diesel, förare och fakturerbart ligger i arket. En avvikelse (pågår, avbruten, överlappar) får en rad till.
 */
export default function RundaRad({ runda, sista, onOppna }: { runda: Runda; sista: boolean; onOppna: (r: Runda) => void }) {
  const markningar = rundaMarkningar(runda);
  return (
    <button type="button" onClick={() => onOppna(runda)} data-runda={runda.id}
      style={{ ...RAD, width: '100%', minHeight: TRAFFYTA.min, background: 'none', border: 'none', borderBottom: sista ? 'none' : RAD.borderBottom, textAlign: 'left', color: FARG.text, font: 'inherit', cursor: 'pointer', padding: `${AVSTAND.m}px 0` }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...TYP.listtitel, color: FARG.text }}>{rundaTidRad(runda)}</div>
        <div data-runda-rad2 style={{ ...TYP.meta, color: FARG.text2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {[rundaRubrik(runda), rundaUnder(runda)].filter(Boolean).join(' · ')}
        </div>
        {markningar.length > 0 && (
          <div style={{ ...TYP.meta }}>
            {markningar.map((m, i) => (
              <span key={m.text} style={{ color: MARKNING_FARG[m.farg] }}>{i > 0 ? ' · ' : ''}{m.text}</span>
            ))}
          </div>
        )}
      </div>
      <div style={{ textAlign: 'right', ...TNUM }}>
        <div style={{ ...TYP.listtitel, color: FARG.text }}>{runda.km != null ? `${runda.km.toLocaleString('sv-SE')} km` : '–'}</div>
      </div>
      <span className="material-symbols-outlined" aria-hidden style={{ fontSize: IKON.text, color: FARG.text3 }}>chevron_right</span>
    </button>
  );
}
