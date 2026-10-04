'use client';

// Sortimentstapeln: hur ett objekts (eller ett fönsters) volym fördelar sig på timmer, kubb,
// massaved och övrigt. Färgerna är SORTIMENTFARG (lib/design/tokens.ts) — en ljushetsskala där
// mörkast är mest värt, skild från status. Se skogsystem-design-skillen, "Sortimentfärger".
//
// Färgen bär aldrig ensam: stapeln har en textalternativ-rad (role="img"), raderna under har prick +
// ord + tal, och kurvan har en teckenförklaring. Timmerfärgen ligger nära den svarta sidans ton,
// därför ramen runt stapeln och de ljusare grannarna — segmenten skiljs åt av ljushet, inte av nyans.

import type { ReactNode } from 'react';
import { SORTIMENTFARG, RADIE } from '@/lib/design/tokens';
import { DAMPAD, TEXT, LINJE } from '@/components/Ytform';
import { SORTIMENT, SORTIMENT_NAMN, type Andelar, type Sortiment } from '@/lib/medelstam/berakna';

/** Färgen för ett sortiment ur skalan. */
export const sortimentFarg = (s: Sortiment) => SORTIMENTFARG[s];

/** En enda stapel med hela fördelningen. Delarna är utgångspunkten: bredd = andel. */
export function Sortimentstapel({ andel, hela }: { andel: Andelar; hela: Andelar }) {
  const alt = SORTIMENT.map(s => `${SORTIMENT_NAMN[s].toLowerCase()} ${hela[s]} %`).join(', ');
  return (
    <div role="img" aria-label={`Fördelning av volymen: ${alt}`}
      style={{ margin: '14px 0 0', height: 16, borderRadius: RADIE.stapel, overflow: 'hidden', display: 'flex',
               border: LINJE, boxSizing: 'border-box' }}>
      {SORTIMENT.map(s => (
        <div key={s} style={{ width: `${Math.max(0, andel[s])}%`, background: SORTIMENTFARG[s], flexShrink: 0 }} />
      ))}
    </div>
  );
}

/** Teckenförklaring i en rad: ruta + ord, i skalans ordning (mest värt först). */
export function Teckenforklaring() {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', marginTop: 12 }}>
      {SORTIMENT.map(s => (
        <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 11, color: DAMPAD, minHeight: 20 }}>
          <span aria-hidden style={{ width: 12, height: 12, borderRadius: RADIE.stapel, background: SORTIMENTFARG[s], border: LINJE, boxSizing: 'border-box' }} />
          {SORTIMENT_NAMN[s]}
        </span>
      ))}
    </div>
  );
}

/** Teckenförklaringen med talet intill varje ord: "Timmer 41 %". För ytor där stapeln är hela fördelningen och inga rader följer. */
export function TeckenforklaringMedAndel({ hela }: { hela: Andelar }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', marginTop: 12 }}>
      {SORTIMENT.map(s => (
        <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: s === 'ovrigt' ? DAMPAD : TEXT, minHeight: 24 }}>
          <span aria-hidden style={{ width: 12, height: 12, borderRadius: RADIE.stapel, background: SORTIMENTFARG[s], border: LINJE, boxSizing: 'border-box' }} />
          {SORTIMENT_NAMN[s]} <span style={{ fontWeight: 600 }}>{hela[s]} %</span>
        </span>
      ))}
    </div>
  );
}

/** "Vad posterna består av" — en budkalkyl måste säga det, synligt och inte bakom en länk. Samma ord som stämplingsvyn. */
export function VadPosternaBestarAv({ extra }: { extra?: ReactNode }) {
  const fet = { color: TEXT, fontWeight: 600 } as const;
  return (
    <div style={{ margin: '16px 16px 0', fontSize: 12, color: DAMPAD, lineHeight: 1.6 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: TEXT, marginBottom: 4 }}>Vad posterna består av</div>
      <div><b style={fet}>Timmer</b> — sågtimmer enligt maskinens sortiment.</div>
      <div><b style={fet}>Kubb</b> — kubb och klentimmer. Klentimmer går till såg som kubb och räknas därför hit.</div>
      <div><b style={fet}>Massaved</b> — massaved.</div>
      <div><b style={fet}>Övrigt</b> — energived, avkap och stockar maskinen inte sorterat.</div>
      <div style={{ marginTop: 4 }}>
        Hemved ingår i inget tal: det är virke som går till markägaren. Volymerna är m³fub, skördarmätt under bark,
        inte m³sk som stämplingsrapporten anger.
      </div>
      {extra}
    </div>
  );
}
