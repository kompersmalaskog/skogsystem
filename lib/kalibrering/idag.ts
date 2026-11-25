// KONTROLLER IDAG — EN kontrollstam om dagen (Martin 2026-11-25; ersätter "två om dagen" från 2026-11-18).
// En rad i Läget › Kontrollerna: "Idag · Gjord" / "Inte än". Bara information och en påminnelse i färg — ingen push, ingen spärr.
// Räknar kontrollmätningar (HQC-filer med egna stockar, samma lista som Kontroller), aldrig en enskild stock: en stock som föraren
// mäter med måttbandet utan att göra en kontroll i maskinen kommer aldrig till appen.
// Dagen = när operatören mätte (svensk tid, `KontrollTid.sista.dag`); saknas tiden gäller filens datum.
import type { FaktKalibrering, KontrollTid } from './typer';
import { svenskDag } from './matdon';

export const KONTROLLER_PER_DAG = 1;
/** Från det här klockslaget (svensk tid, vardag) är "ingen kontroll än" orange. */
export const FORSTA_SENAST_H = 11;

const sthlm = (nu: Date) => {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Stockholm', weekday: 'short', hour: '2-digit', hourCycle: 'h23' })
    .formatToParts(nu);
  return { veckodag: p.find(x => x.type === 'weekday')?.value ?? '', timme: Number(p.find(x => x.type === 'hour')?.value ?? 0) };
};

export type KontrollerIdag = { antal: number; text: string; under: string | null; sen: boolean };

export function kontrollerIdag(alla: FaktKalibrering[], tider: Record<string, KontrollTid> | null, nu: Date): KontrollerIdag {
  const idag = svenskDag(nu.toISOString());
  const antal = alla.filter(k => (tider?.[k.filnamn]?.sista?.dag ?? k.datum.slice(0, 10)) === idag).length;
  const { veckodag, timme } = sthlm(nu);
  const vardag = veckodag !== 'Sat' && veckodag !== 'Sun';
  const gjord = antal >= KONTROLLER_PER_DAG;
  const sen = vardag && !gjord && timme >= FORSTA_SENAST_H;
  return { antal, text: gjord ? 'Gjord' : 'Inte än', under: sen ? 'Ingen kontroll än idag' : null, sen };
}
