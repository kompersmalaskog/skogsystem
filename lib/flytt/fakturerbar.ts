// Fakturerbar-regeln för en flytt — och vad en ändrad typ gör med fakturaunderlaget.
//
// TVÅ implementationer, ett test. Regeln måste hållas där datan ändras: databasen räknar om fakturerbar vid
// varje rättning (`fakturerbar_for` i migration 20261015170000) så en klient som skickar fel flagga aldrig kan
// lämna datan i fel läge, och appen behöver samma regel för att säga vad som kommer hända INNAN man sparar och
// för förarflödet som sätter flaggan när en flytt avslutas. De två hålls ihop av `__fixtures__/fakturerbar_tabell.json`:
// TS-testet kör tabellen mot den här filen, och migrationens kvitto kör samma tabell mot SQL-funktionen (ska ge
// 0 rader). `fakturerbar.test.ts` vaktar att migrationen innehåller exakt tabellens rader.

export type FlyttTyp = 'produktion' | 'service' | 'kunduppdrag' | 'annat';

export const FLYTT_TYPER: readonly FlyttTyp[] = ['produktion', 'service', 'kunduppdrag', 'annat'];
export const FLYTT_TYP_ORD: Record<FlyttTyp, string> = { produktion: 'Produktion', service: 'Service', kunduppdrag: 'Kunduppdrag', annat: 'Annat' };

/** km-gränsen för en produktionsflytt (3 mil). */
export const FAKTURERBAR_KM = 30;

/**
 * produktion = km-gränsen, service = aldrig (egen kostnad), kunduppdrag = alltid (vi kör åt någon annan),
 * annat och okänt = aldrig automatiskt. Saknat km (null) räknas som 0 — aldrig fakturerbart på en gissning.
 */
export function beraknaFakturerbar(typ: string, flyttKm: number | null): boolean {
  if (typ === 'produktion') return (flyttKm ?? 0) >= FAKTURERBAR_KM;
  if (typ === 'kunduppdrag') return true;
  return false;
}
