/**
 * ARBETSMILJÖN BÖRJAR 2027 (Martin 2026-11-11: "vi håller på att bygga appen och ska börja använda den fullt ut nästa år").
 *
 * Fram till 1 januari 2027 (svensk tid) säger appen inte att något i arbetsmiljön ska göras eller är sent:
 * ingen påminnelse om årshjulet, inga rader i Behöver dig, inget märke och inget "N saker behöver dig" för
 * riskbedömning, skyddsrond, årshjul, maskinkoll, introduktion, Så gör vi och kemikalier. Vyerna fungerar som vanligt.
 *
 * Det som HÄNDER gäller alltid, också före start: en maskin som ska stå, Något är fel, tillbud och olyckor (med
 * påminnelsen om anmälan), "Lagat" till den som rapporterade och säkerhetsblad som saknas för något nyköpt.
 *
 * Ändra startåret HÄR och ingen annanstans.
 */

export const ARBETSMILJO_START_AR = 2027;

/** Har arbetsmiljön börjat räknas? Svenskt år, så nyårsnatten räknas rätt. */
export function arbetsmiljoIgang(nu: Date = new Date()): boolean {
  const ar = Number(new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric' }).format(nu));
  return ar >= ARBETSMILJO_START_AR;
}

/** Texten som står där appen annars hade sagt att något är sent. */
export const BORJAR_TEXT = `Börjar januari ${ARBETSMILJO_START_AR}`;
