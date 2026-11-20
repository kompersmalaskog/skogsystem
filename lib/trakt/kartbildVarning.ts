// Importvarning när zipens kartbild saknas eller inte kommer med (ingen kartbild_url / kartbild_bounds).
//
// Brokamåla 1:5 V importerades 2026-07-01 utan bild och utan bounds, och ingen märkte det förrän 2026-10-19: uppladdningsfelet loggades bara
// i konsolen (`console.error`) och ingen varning skrevs. Utan bounds (och utan Vidas geometri, som zip-leveranser inte har) kan egenkontrollens
// karta inte placera objektets markeringar — se lib/egenkontrollOrigo.ts. Varningen hamnar i objekt.import_varningar och syns där importen syns.
//
// Gäller BARA zip-leveransen: envz-leveransen har aldrig en georefererad JPG (den har TK-PDF:er och geometri), så där är "ingen bild" det väntade och
// ingen varning ges. Ge ALDRIG envz-objekt bounds härledda ur traktgränsen för att slippa varningen — det flyttar varje befintlig markering
// (zoom 15 mot 16), se lib/egenkontrollOrigo.ts.

export interface KartbildUtfall {
  envz: boolean;
  /** Zipen innehöll en .jpg. */
  harJpg: boolean;
  /** Den uppladdade bildens path (null = ingen bild laddades upp). */
  kartbild_url: string | null;
  kartbild_bounds: unknown;
  /** Varför det gick snett, om något fel fångades (uppladdning, georeferens, bildstorlek). */
  fel: string | null;
}

/** Texten som ska in i import_varningar, eller null när allt är som det ska (eller när det är envz). */
export function kartbildVarning(u: KartbildUtfall): string | null {
  if (u.envz) return null;
  if (u.kartbild_url && u.kartbild_bounds) return null;
  const orsak = !u.harJpg ? 'zipen innehåller ingen kartbild (JPG)' : (u.fel ?? 'orsaken är okänd');
  const foljd = u.kartbild_url
    ? 'Bilden laddades upp men saknar kartbild_bounds, så den kan inte läggas på kartan och egenkontrollens karta kan inte placera objektets markeringar.'
    : u.kartbild_bounds
      ? 'Kartbild_bounds sattes, så markeringarna kan placeras, men bilden finns inte att visa.'
      : 'Objektet har ingen kartbild och inga kartbild_bounds, så egenkontrollens karta kan inte placera objektets markeringar.';
  return `Kartbild: ${orsak}. ${foljd}`;
}
