// Förhandsbeskedet i sheeten "Flytten": vad en rättning kommer att göra, i klartext, INNAN man trycker Spara.
// Räknas i klienten med SAMMA regel som databasens fakturerbar_effektiv (lib/flytt/fakturerbar.ts + den gemensamma
// testtabellen), så beskedet och det som sedan händer aldrig kan skilja sig åt.

import { fakturerbarEffektiv } from './fakturerbar';

export interface ForeFlytt {
  typ: string;
  /** Mätt/rutt-km på flytten (maskin_flytt.flytt_km) — det som regeln räknar på. Aldrig det justerade fakturakm. */
  km: number | null;
  /** Som flytten är fakturerbar NU (maskin_flytt.fakturerbar). */
  fakturerbar: boolean;
  maskinId: string | null;
  externMaskin: string | null;
}

export interface NyFlytt {
  typ: string;
  /** Det manuella valet efter rättningen: true/false går före regeln, null följer den. */
  manuell: boolean | null;
  maskinId: string | null;
  externMaskin: string | null;
}

/** Radens rader, i den ordning de ska stå. Tom lista = inget att säga. */
export function forhandsbesked(fore: ForeFlytt, ny: NyFlytt, nyMaskinNamn: string | null): string[] {
  const rader: string[] = [];
  const nyFakt = fakturerbarEffektiv(ny.typ, fore.km, ny.manuell);
  if (fore.fakturerbar && !nyFakt) rader.push('Blir inte fakturerbar — underlaget stryks');
  if (!fore.fakturerbar && nyFakt) rader.push('Blir fakturerbar — hamnar under Att godkänna');

  const byteMaskin = ny.maskinId !== fore.maskinId || (ny.externMaskin ?? '') !== (fore.externMaskin ?? '');
  if (byteMaskin) {
    if (ny.maskinId && fore.maskinId) rader.push(`Positionen följer med till ${nyMaskinNamn ?? 'den nya maskinen'}`);
    else rader.push('Positionen följer inte med vid byte till eller från en annan maskin — kolla kartan efteråt');
  }
  return rader;
}
