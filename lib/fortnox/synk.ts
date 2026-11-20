// Delad synk-logik för Fortnox-cronen (sync-vouchers, framöver ev. sync-invoices).

// Söndagsnatt = full årssynk. Bokföringen släpar — sent bokförda verifikat
// bär gamla transaktionsdatum och faller utanför det inkrementella
// 14-dagarsfönstret för alltid. Veckofullen fångar dem (max 7 dagars släp,
// acceptabelt för månadsnivå-vinstvyn). UTC eftersom Vercel-cronen kör
// 02:00 UTC — söndag 02 UTC är söndag morgon även svensk tid.
export function arFullSynkNatt(nu: Date): boolean {
  return nu.getUTCDay() === 0;
}

// Fortnox rate-limit är ~25 anrop per 5 sekunder per token. Detaljhämtningen
// körs därför i fönster om 20 parallella anrop som fyller ut till minst 5 s —
// marginal under limiten, men ~7× snabbare än sekventiellt (~330 ms/anrop).
export const FORTNOX_FONSTER_ANROP = 20;
export const FORTNOX_FONSTER_MS = 5000;
