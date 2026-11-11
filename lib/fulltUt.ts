/**
 * APPEN ANVÄNDS FULLT UT FRÅN 2027 (Martin 2026-11-11: "vi håller på att bygga appen och ska börja använda den fullt ut nästa år").
 *
 * Före 1 januari 2027 (svensk tid) skickar appen inga påminnelser om det som "ska göras":
 *   - arbetsmiljön (årshjulet, Behöver dig, märken — lib/arbetsmiljo/start.ts)
 *   - månadens stickprov i egenkontrollen (dras inte av cronen, pushen skickas inte)
 *   - "N flyttar väntar på godkännande" i Lastbilen (måndagspushen)
 * Vyerna fungerar som vanligt. Det som HÄNDER (larm, besök, stopp, tillbud, ledighet, lön) gäller alltid.
 *
 * Ändra året HÄR och ingen annanstans.
 */
export const FULLT_UT_AR = 2027;

/** Har appen börjat användas fullt ut? Svenskt år, så nyårsnatten räknas rätt. */
export function fulltUt(nu: Date | number = new Date()): boolean {
  const ar = Number(new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric' }).format(new Date(nu)));
  return ar >= FULLT_UT_AR;
}
