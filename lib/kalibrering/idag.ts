// KONTROLLER IDAG — Martin 2026-11-18: "man ska helst vara ute och kontrollera längden två gånger om dagen så det stämmer".
// En rad i Läget › Kontrollerna: "Idag · 1 av 2". Bara information och en påminnelse i färg — ingen push, ingen spärr.
// Räknar kontrollmätningar (HQC-filer med egna stockar, samma lista som Kontroller), aldrig en enskild stock: en stock som föraren
// mäter med måttbandet utan att göra en kontroll i maskinen kommer aldrig till appen.
// Dagen = när operatören mätte (svensk tid, `KontrollTid.sista.dag`); saknas tiden gäller filens datum.
import type { FaktKalibrering, KontrollTid } from './typer';
import { svenskDag } from './matdon';

export const KONTROLLER_PER_DAG = 2;
/** Från det här klockslaget (svensk tid, vardag) är "ingen kontroll än" orange. */
export const FORSTA_SENAST_H = 11;
/** Från det här klockslaget (svensk tid, vardag) är "färre än två" orange. */
export const ANDRA_SENAST_H = 14;

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
  const sen = vardag && ((antal === 0 && timme >= FORSTA_SENAST_H) || (antal < KONTROLLER_PER_DAG && timme >= ANDRA_SENAST_H));
  const under = antal >= KONTROLLER_PER_DAG ? null : sen ? (antal === 0 ? 'Ingen kontroll än idag' : 'Dags för en till') : null;
  return { antal, text: `${Math.min(antal, 99)} av ${KONTROLLER_PER_DAG}`, under, sen };
}
