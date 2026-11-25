// Produktionshögarna i skotningsrapporten — SAMMA högar som i appen.
//
// MARTIN 2026-11-25: "inga röda högar dom ska vara som appen titta dom".
// Rapporten ritade en liten RÖD prick per stam (egenkontrollens stammoln).
// Rött betyder fara i hela appen, och en inköpare som ser hundratals röda
// prickar läser inte "här låg virket" — han läser att något är fel.
//
// I appen är högarna klustrade (10 m), färgade efter TRÄDSLAG i hela färger
// och stora efter volym. Den här filen återanvänder appens egna funktioner —
// `klustraStammar` (lib/produktionshogar) och `hogTradslagFarger`
// (lib/tradslag) — så kartan på papperet och kartan i hytten aldrig kan
// visa olika högar. Ingen egen klustring, ingen egen palett.
//
// Ren funktion: ingen karta, ingen databas, ingen pdf-lib.
import { klustraStammar, type HogStam } from '@/lib/produktionshogar';
import { hogTradslagFarger } from '@/lib/tradslag';

export type RapportHog = {
  lat: number;
  lng: number;
  /** m³fub i högen. */
  volym: number;
  /** Dominerande trädslagets färg (appens `hogTradslagFarger`). */
  farg: string;
  /** Blandad hög: det näst största trädslagets färg — ritas som en halv skiva. */
  farg2: string | null;
};

/**
 * Minsta och största radie på papperet (pt). En hög på 0,2 m³ ska synas, och
 * en på 15 m³ får inte svälja grannarna — skalan är kvadratroten, så AREAN
 * växer med volymen (ögat läser area, inte radie).
 */
export const HOG_MIN_PT = 0.9;
export const HOG_MAX_PT = 3.4;

/** Radien för en hög, mot trakten största hög. */
export function hogRadiePt(volym: number, storsta: number): number {
  if (!(volym > 0) || !(storsta > 0)) return HOG_MIN_PT;
  const andel = Math.sqrt(Math.min(volym, storsta) / storsta);
  return HOG_MIN_PT + (HOG_MAX_PT - HOG_MIN_PT) * andel;
}

/**
 * Stammarna → högar med appens färger.
 *
 * Stammar utan plats eller utan volym räknas inte som en hög (de kan inte
 * färgas eller storlekssättas ärligt), men de ligger kvar i `virkesfordelning`
 * som räknar tabellen "Var låg virket?" — där är positionen det enda som
 * behövs.
 */
export function rapportHogar(stammar: readonly HogStam[]): RapportHog[] {
  const dugliga = stammar.filter(s => Number.isFinite(s.lat) && Number.isFinite(s.lng));
  return klustraStammar(dugliga)
    .filter(k => k.volym > 0)
    .map(k => {
      const f = hogTradslagFarger(k.tradslagCount);
      return { lat: k.lat, lng: k.lng, volym: k.volym, farg: f.farg, farg2: f.farg2 };
    });
}

/** Största högens volym — skalan alla radier mäts mot. */
export function storstaHog(hogar: readonly RapportHog[]): number {
  let m = 0;
  for (const h of hogar) if (h.volym > m) m = h.volym;
  return m;
}
