'use client';

// RADEN SOM SÄGER ATT RUNDAN ÄR KLAR, med avslutet bredvid.
//
// VARFÖR DEN FINNS (prod 2026-11-13): tre rundor stod färdiggångna och aldrig avslutade — Ulfsnäs 22 av 22 sedan
// 28 aug, Rävemåla 25 av 25 sedan 17 okt, Krokshult 11 av 11 sedan 19 okt. Noll punkter och noll provytor kvar,
// ingenting som spärrade. Man svarar i dockan, huvudets tal byter från "1 kvar" till "Klart", och sedan händer
// ingenting: Avsluta-knappen ligger i hel-läget, bakom ett drag uppåt som inget ber om. Avslutet är det som gör
// rapporten till Vida, så en runda som inte avslutas är en runda som aldrig lämnade telefonen.
//
// VAR DEN LIGGER: ovanför arket, i arkets kolumn — SAMMA plats och SAMMA höjd som Ångra-kvittot, aldrig i dockan.
// Rundvyns hårdaste regel är att inget tryckbart får flytta sig under fingret (PR 4b, 0 px mätt i Chromium), och
// dockan växer inte här. Regeln för när den visas är ren och testad: visaAvslutaRad i lib/egenkontrollAvsluta.ts.
//
// EN KNAPP, VIT: avslutet är det enda man kan göra här, och vitt är appens primärknapp. Blått betyder navigera eller
// avbryta och används aldrig för en handling som skriver. Bekräftelsen är oförändrad — raden öppnar samma dialog som
// knappen i hel-läget, med samma konsekvens i klartext ("Rundan låses och kan inte ändras").

import { AVSTAND, FARG, KNAPP, RADIE, TRAFFYTA, TYP } from '@/lib/design/tokens';
import { AVSLUTA_RAD_RUBRIK } from './format';

export type AvslutaRadProps = {
  onAvsluta: () => void;
  /** Sant medan avslutet skrivs: knappen är avstängd så ett andra tryck aldrig kan skicka två avslut. */
  avslutar?: boolean;
};

export default function AvslutaRad({ onAvsluta, avslutar }: AvslutaRadProps) {
  return (
    <div
      data-testid="avsluta-rad"
      style={{
        // Måtten är Ångra-kvittots, rad för rad: samma höjd och samma marginal mot Centrera-knappen, så att ingenting
        // rör sig när den ena ersätter den andra i samma spår.
        pointerEvents: 'auto', flex: 1, minWidth: 0, marginRight: TRAFFYTA.min + AVSTAND.s, display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', gap: AVSTAND.s, minHeight: TRAFFYTA.primar, padding: `0 ${AVSTAND.s}px 0 ${AVSTAND.l}px`,
        borderRadius: RADIE.knapp, background: FARG.kort, color: FARG.text, ...TYP.text,
      }}
    >
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{AVSLUTA_RAD_RUBRIK}</span>
      <button
        type="button"
        onClick={onAvsluta}
        disabled={avslutar}
        data-testid="avsluta-rad-knapp"
        style={{ ...KNAPP.primar, minHeight: TRAFFYTA.min, padding: `0 ${AVSTAND.l}px`, flexShrink: 0, whiteSpace: 'nowrap', ...(avslutar ? { opacity: 0.4 } : {}) }}
      >
        Avsluta
      </button>
    </div>
  );
}
