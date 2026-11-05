// ALLT SYNS, DET NÄRA STARKAST (Martin 2026-11-04, efter Stefan i Giant på Bondeskog: "han såg inte allt vi satt ut").
// I maskinen tittar föraren på Opti och plockar upp appen bara när han undrar något — då ska allt på trakten synas,
// men det som ligger nära maskinen ska vara tydligast. Ingen markering göms längre för att den ligger långt bort.
//
// EN regel för symboler, kör upp-pilar, kommentar-tecken och ytnamn:
//   inom NARA_FULL_M (80 m) → full styrka; längre bort sjunker den jämnt till NARA_GOLV vid NARA_LANGT_M (400 m) och stannar där.
// Fara (röd) är ALLTID full styrka. Vägar, traktgräns och fällningscirkeln rörs inte (de har egna regler).

export const NARA_FULL_M = 80;
export const NARA_LANGT_M = 400;
export const NARA_GOLV = 0.4;

/** Styrkan (opacitet 0..1) för något som ligger `avstandM` från maskinen. Okänt avstånd (ingen GPS än) = full styrka. */
export function narStyrka(avstandM: number | null | undefined, fara = false): number {
  if (fara) return 1;
  if (avstandM == null || !Number.isFinite(avstandM)) return 1;
  if (avstandM <= NARA_FULL_M) return 1;
  if (avstandM >= NARA_LANGT_M) return NARA_GOLV;
  const t = (avstandM - NARA_FULL_M) / (NARA_LANGT_M - NARA_FULL_M);
  return Math.round((1 - t * (1 - NARA_GOLV)) * 1000) / 1000;
}

/** MapLibre-uttryck för ett lager vars features bär `nar` (styrkan) — saknas den gäller full styrka. */
export const NAR_OPACITET: any = ['number', ['get', 'nar'], 1];
