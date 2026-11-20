// Beslutslogik för nattstädningen av föräldralösa markeringsfoton. Ren funktion → enhetstestbar;
// själva I/O:t (list/remove) ligger i app/api/cron/stada-markering-foton/route.ts.
//
// En fil i markering-foton är föräldralös när INGEN planering_markeringar-rad refererar den via
// data.photoPath OCH den är äldre än MIN_ALDER_DAGAR. Åldersgränsen finns för att:
//   - en uppladdning landar i Storage före raden (autospar-debounce, offline-kö i fält)
//   - Ångra på en raderad markering ska kunna ge tillbaka fotot
// Appen raderar aldrig filer själv (lib/markeringFoto.ts) — detta är den enda vägen.

export const MIN_ALDER_DAGAR = 7;
/** Skyddstak per körning — en bugg ska aldrig kunna tömma bucketen på en natt. */
export const MAX_RADERA_PER_KORNING = 200;

export interface BucketFil {
  /** Hel sökväg: {objekt_id}/{fil} */
  sokvag: string;
  /** Senaste skrivning (max av created_at/updated_at), ms sedan epoch; null = okänt */
  senastMs: number | null;
}

export interface StadBeslut {
  /** Filer som SKA raderas (högst MAX_RADERA_PER_KORNING) */
  radera: string[];
  /** Föräldralösa men för nya, eller utan känd ålder → sparas */
  forNya: string[];
  /** Föräldralösa utöver taket — tas nästa natt */
  overTak: number;
  /** Filer som en rad refererar */
  refererade: number;
}

export function valjForaldralosa(filer: BucketFil[], refererade: Set<string>, nuMs: number, minAlderDagar = MIN_ALDER_DAGAR): StadBeslut {
  const grans = nuMs - minAlderDagar * 86400 * 1000;
  const radera: string[] = [];
  const forNya: string[] = [];
  let overTak = 0;
  let refCount = 0;
  for (const f of filer) {
    if (refererade.has(f.sokvag)) { refCount++; continue; }
    // Okänd ålder räknas som ny: radera aldrig på gissning.
    if (f.senastMs === null || f.senastMs >= grans) { forNya.push(f.sokvag); continue; }
    if (radera.length >= MAX_RADERA_PER_KORNING) { overTak++; continue; }
    radera.push(f.sokvag);
  }
  return { radera, forNya, overTak, refererade: refCount };
}
