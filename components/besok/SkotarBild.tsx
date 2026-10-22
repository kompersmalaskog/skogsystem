// Bilden i skotararket: skotaren uppifrån med det röda området bakom den (döda vinkeln) och mellan skotaren och virkeshögen. Ritad i målbildsstil (ren SVG, inga filer som laddas).
// Färg bär inte ensam: de röda ytorna har också streckning och ordet "Döda vinkeln".

import React from 'react';
import { FARG } from '@/lib/design/tokens';

const ROD = FARG.rod;

export default function SkotarBild() {
  return (
    <svg viewBox="0 0 360 230" role="img" aria-label="Skotaren uppifrån: röda områden bakom skotaren och mellan skotaren och virkeshögen" style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 12, background: '#1b2a17' }}>
      <defs>
        <pattern id="besok-skotare-streck" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="9" stroke={ROD} strokeWidth="2.2" opacity="0.85" />
        </pattern>
      </defs>
      {/* skogsväg */}
      <rect x="0" y="92" width="360" height="62" fill="#4a4237" />
      <line x1="0" y1="123" x2="360" y2="123" stroke="#6b6254" strokeWidth="1.5" strokeDasharray="10 8" />
      {/* virkeshögen (uppe vid vägkanten) */}
      <g>
        <rect x="150" y="28" width="150" height="46" rx="6" fill="#8a6a3f" />
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <circle key={i} cx={162 + i * 18} cy={43} r="7" fill="#a98250" />)}
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <circle key={i} cx={171 + i * 18} cy={59} r="7" fill="#9a7445" />)}
        <text x="225" y="20" textAnchor="middle" fontSize="13" fontWeight="600" fill="#fff">Virkeshög</text>
      </g>
      {/* röda områden: mellan skotaren och högen, och bakom skotaren */}
      <rect x="150" y="74" width="150" height="26" fill={ROD} opacity="0.28" />
      <rect x="150" y="74" width="150" height="26" fill="url(#besok-skotare-streck)" />
      <rect x="20" y="96" width="62" height="54" rx="4" fill={ROD} opacity="0.28" />
      <rect x="20" y="96" width="62" height="54" rx="4" fill="url(#besok-skotare-streck)" />
      {/* skotaren: lastbädd bak, hytt fram (åt höger), kran */}
      <g>
        <rect x="88" y="100" width="92" height="46" rx="5" fill="#2e7d32" stroke="#0b1d0c" strokeWidth="2" />
        {[0, 1, 2, 3].map((i) => <line key={i} x1={100 + i * 22} y1="104" x2={100 + i * 22} y2="142" stroke="#0b1d0c" strokeWidth="2" opacity="0.6" />)}
        <rect x="186" y="104" width="50" height="38" rx="8" fill="#e0b84a" stroke="#0b1d0c" strokeWidth="2" />
        <rect x="214" y="109" width="16" height="28" rx="4" fill="#1b2a17" opacity="0.85" />
        <text x="204" y="128" textAnchor="middle" fontSize="11" fontWeight="600" fill="#0b1d0c">Hytt</text>
        <line x1="176" y1="112" x2="244" y2="82" stroke="#0b1d0c" strokeWidth="5" strokeLinecap="round" />
        <circle cx="244" cy="82" r="5" fill="#0b1d0c" />
      </g>
      {/* backriktning */}
      <g stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <line x1="150" y1="174" x2="60" y2="174" />
        <polyline points="72,164 60,174 72,184" />
      </g>
      <text x="105" y="196" textAnchor="middle" fontSize="13" fontWeight="600" fill="#fff">Backar</text>
      <text x="51" y="90" textAnchor="middle" fontSize="13" fontWeight="700" fill="#fff">Döda vinkeln</text>
    </svg>
  );
}
