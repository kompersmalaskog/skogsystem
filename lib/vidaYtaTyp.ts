// VIDAS FRIA YTKODER I L_TILLAGGSYTOR — vilka som INTE är hänsyn (Martin 2026-10-22, Hålabäck au 2025).
//
// Importen märker alla ytor i lagret L_TILLAGGSYTOR `_typ: 'hänsynsyta'`, och allt som läser `_typ` har därför tagit dem för hänsyn: grön snedstreckad yta, zonlarm "kör inte
// in", hänsynsmålbild, med i hänsynsräkningen. Men TYP-koden avgör inte vad som ska göras — TYP 71 ("Övrigt") är en FRI kod och betydelsen står bara i ATGARD. På Hålabäck står
// där "avverkning av frötallar. Lämna kantzon mot sjön …": det är där det SKA avverkas. Därför är TYP 71 en neutral yta: tunn streckad kant, ingen fyllning, inget larm, ingen
// målbild och inte med i hänsynsräkningen. Vidas ATGARD visas som instruktion som förut.
//
// EN funktion avgör — kartlager, larm, kort, räkningar och importen använder den, ingen egen jämförelse av koden. Ändras `_typ` i importen räcker det inte: redan lagrad data
// (objekt_geometri) har `_typ: 'hänsynsyta'` på dessa ytor och läses som den är.

/** TYP-koder i L_TILLAGGSYTOR som är fria ("Övrigt") — ingen hänsyn. */
export const OVRIGA_YTKODER: readonly string[] = ['71'];

/** Är featuren en neutral "Övrigt"-yta (Vidas TYP 71 i tilläggsytorna)? Koden lagras som text ("71") i dbf:en men tas även som tal. */
export function arOvrigYta(props: Record<string, unknown> | null | undefined): boolean {
  if (!props) return false;
  if (String(props._lager ?? '') !== 'L_TILLAGGSYTOR') return false;
  return OVRIGA_YTKODER.includes(String(props.TYP ?? '').trim());
}

/** Är featuren en hänsynsyta — en tilläggsyta (`_typ: 'hänsynsyta'`) som INTE är en fri kod? */
export const arHansynsyta = (props: Record<string, unknown> | null | undefined): boolean =>
  !!props && String(props._typ ?? '') === 'hänsynsyta' && !arOvrigYta(props);
