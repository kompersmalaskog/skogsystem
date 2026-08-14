'use client';

import React from 'react';
import { C } from './oversikt-types';
import { ff } from './oversikt-styles';
import { formatVolym, relativDag, type SkotarInfo } from './oversikt-utils';

/* Skotarens tillstånd som EN rad under status — symmetriskt med skördarens status.
   Grönt BARA på AKTIV (färsk igång = någon jobbar där nu); en igång-post med gammalt sista-lass
   visas grå med datumet (ärligt att den stannat). Klar/väntar = grått. Färgdisciplin: grön =
   aktivitet (status-axeln, som pågående-markören), aldrig röd/orange här. Renderar inget om null. */
export default function SkotarRad({ info, style }: { info: SkotarInfo | null; style?: React.CSSProperties }) {
  if (!info) return null;
  const aktiv = info.state === 'igang' && info.fersk;
  const label = info.state === 'klar' ? 'Skotare klar' : info.state === 'igang' ? 'Skotare igång' : 'Skotare väntar';
  const detalj = info.state === 'klar' ? ''
    : info.state === 'igang' ? `senaste lass ${relativDag(info.sista)} · ${formatVolym(Math.round(info.kvar))} m³fub kvar`
    : `${formatVolym(Math.round(info.kvar))} m³fub på backen`;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, lineHeight: 1.4, fontFamily: ff, flexWrap: 'wrap', ...style }}>
      <span style={{ width: 7, height: 7, borderRadius: 4, background: aktiv ? C.green : C.t4, flexShrink: 0 }} />
      <span style={{ color: aktiv ? C.green : C.t2, fontWeight: 600 }}>{label}</span>
      {detalj && <span style={{ color: C.t3 }}>· {detalj}</span>}
    </div>
  );
}
