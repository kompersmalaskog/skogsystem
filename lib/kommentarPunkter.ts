// KOMMENTARER SOM PUNKTER (Martin 2026-10-21). Varje radbrytning i en kommentar är en egen punkt. Appen delar ALDRIG upp en mening själv — bara förarens/planerarens/Vidas
// egna radbrytningar räknas. Tomma rader ignoreras. En rad blir ren text (ingen siffra), två eller fler blir numrerade 1, 2, 3.
// Samma regel för Vidas text (traktdirektivet) som för egna kommentarer.

/** Raderna i en kommentar: delade på radbrytning (\n, \r\n, \r), trimmade, utan tomma rader. */
export function kommentarPunkter(text: string | null | undefined): string[] {
  return String(text ?? '')
    .split(/\r\n|\r|\n/)
    .map((rad) => rad.trim())
    .filter((rad) => rad.length > 0);
}

/** Numreras bara när det finns fler än en punkt. */
export const arNumrerad = (punkter: readonly string[]): boolean => punkter.length >= 2;

/**
 * Vidas traktdirektiv har inga radbrytningar — det är en lång löptext. Delas vid meningsslut: punkt (eller ! ?), mellanslag, versal. Bara för Vidas direktiv; egna kommentarer
 * delas aldrig så (bara på radbrytning). Ger texten som EN punkt när det inte finns något meningsslut att dela vid, och delar aldrig mitt i en mening ("ca 50-70 tallar", "t.ex. ekar").
 * Finns radbrytningar i texten gäller de först (varje rad delas sedan för sig).
 */
export function vidaMeningar(text: string | null | undefined): string[] {
  return kommentarPunkter(text).flatMap((rad) =>
    rad.split(/(?<=[.!?])\s+(?=[A-ZÅÄÖ])/).map((m) => m.trim()).filter((m) => m.length > 0));
}
