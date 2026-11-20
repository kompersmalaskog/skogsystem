// Påminnelsen i Lastbilen: "2 flyttar väntar på godkännande" — som Arbetsrapportens väntar-rad.
// Visas BARA när något väntar, bara för admin, och trycket leder rakt till "Att godkänna".
//
// Det som väntar läses över ALLA perioder (en flytt som väntat sedan september ska inte döljas av
// att man står i oktober). Trycket går till äldsta månaden med något som väntar — äldsta först, sedan
// nästa tills allt är godkänt, som Arbetsrapportens väntande dagar.
//
// Rena funktioner: all text och alla val byggs här så de går att testa.

import { manadForDatum, periodInnehaller, type Manad, type Period } from './period';

export interface VantandeRad { id: string; datum: string | null }

export interface Pamminnelse {
  /** Hur många flyttar raden räknar. */
  antal: number;
  /** Månaden trycket leder till (äldsta med något som väntar), eller null om inget datum går att läsa. */
  mal: Manad | null;
  text: string;
}

/**
 * @param rader   alla ogodkända aktiva flyttar
 * @param visadPeriod  perioden Fakturering-fliken redan visar, eller null på andra flikar. Där listan
 *                redan visar det som väntar i perioden räknas bara det som väntar UTANFÖR den — annars
 *                skulle raden peka på det man redan tittar på.
 */
export function pamminnelse(rader: readonly VantandeRad[], visadPeriod: Period | null): Pamminnelse | null {
  const raknade = visadPeriod ? rader.filter(r => !periodInnehaller(visadPeriod, r.datum)) : [...rader];
  if (raknade.length === 0) return null;
  const manader = raknade
    .map(r => manadForDatum(r.datum))
    .filter((m): m is Manad => m != null)
    .sort((a, b) => a.ar * 12 + a.man - (b.ar * 12 + b.man));
  const n = raknade.length;
  const bas = `${n} ${n === 1 ? 'flytt väntar' : 'flyttar väntar'} på godkännande`;
  return { antal: n, mal: manader[0] ?? null, text: visadPeriod ? `${bas} i en annan period` : bas };
}
