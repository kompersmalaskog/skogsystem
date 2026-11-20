'use client';

// Överst i avläggskortet för skotare: vad som skotats HIT. Under en avdelare ("Från Vida") ligger kortets vanliga innehåll, oförändrat —
// bara flyttat ned. Visas både för Vidas avlägg och för egna.

import React from 'react';
import { AVSTAND, FARG, TNUM, TYP } from '@/lib/design/tokens';
import { klockslag, type AvlaggSkotat } from '@/lib/skotarLass/avlaggStat';
import { meta, smaRubrik } from './stil';
import { SortimentNamn } from './SortimentNamn';

export function AvlaggSkotatSektion({ nummer, objektNamn, stat, kalla }: { nummer: string; objektNamn: string; stat: AvlaggSkotat; kalla: 'vida' | 'egen' }) {
  return (
    <div data-testid="avlagg-skotat" style={{ marginBottom: AVSTAND.m }}>
      <div style={{ ...TYP.rubrik }}>Avlägg {nummer} · skotat hit <span style={TNUM}>{Math.round(stat.m3)} m³</span></div>
      <div style={{ ...meta, marginTop: AVSTAND.xs }}>{objektNamn}</div>
      {stat.antalLass > 0 ? (
        <>
          <div style={{ marginTop: AVSTAND.m, display: 'flex', flexDirection: 'column', gap: AVSTAND.xs }}>
            {stat.perSortiment.map((s) => (
              <div key={s.nyckel} style={{ display: 'flex', justifyContent: 'space-between', gap: AVSTAND.m, ...TYP.text }}>
                <SortimentNamn namn={s.namn} /><span style={TNUM}>{Math.round(s.m3)} m³</span>
              </div>
            ))}
          </div>
          <div style={{ ...meta, marginTop: AVSTAND.m, ...TNUM }}>
            {stat.antalLass} lass{stat.senast ? ` · senast ${klockslag(stat.senast)}` : ''}
          </div>
        </>
      ) : (
        <div style={{ ...meta, marginTop: AVSTAND.m }}>Inget skotat hit än.</div>
      )}
      {/* Under avdelaren ligger kortets vanliga innehåll, oförändrat. Vidas avlägg märks "Från Vida"; ett eget avlägg har bara linjen. */}
      <div style={{ marginTop: AVSTAND.l, paddingTop: AVSTAND.m, borderTop: `1px solid ${FARG.linje}`, ...smaRubrik }}>{kalla === 'vida' ? 'Från Vida' : ''}</div>
    </div>
  );
}
