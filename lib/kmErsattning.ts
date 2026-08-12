// ─────────────────────────────────────────────────────────────
// Reseersättning — EN sanning för hur MÄNGD ersättning räknas.
//
// PRINCIP: appen räknar MÄNGDER (mil), Fortnox äger SATSEN (kr/mil). En
// avtalshöjning ska aldrig kräva en deploy. Den här filen räknar bara antal mil
// — aldrig kronor.
//
// Delas av kalendern, arbetsrapportens per-dag-vy OCH löneexporten så att alla
// tre säger EXAKT samma sak. Tidigare hade de tre olika formler (160 km / ~17
// mil / 32 mil för samma månad): exporten dubblade felaktigt med *2 (km_totalt
// är REDAN tur+retur = km_morgon + km_kvall) och hårdkodade gränsen 60 i stället
// för avtalets km_grans_per_dag. Samma mönster som datumLokal.ts löste för TZ.
//
// AVRUNDNING (⚠ EJ AVTALSVERIFIERAD ÄNNU): "påbörjad mil" tillämpas PER DAG
// (ceil per dag, summeras) — inte på månadssumman. Skillnaden är verklig: en dag
// med 2 km över gränsen blir en hel mil (Stefan juli = 17 mil per dag vs 16 på
// månadssumman). Regeln kommer från en MIGRATIONSKOMMENTAR ("ersättning per
// påbörjad mil"), INTE ur avtalstexten — Martin stämmer av per dag vs månad med
// löneansvarig. Byt HÄR om svaret blir månadssumma (ändra ersattningsMilDag →
// summera km först, ceil sedan) så följer alla tre konsumenterna med. EN plats.
// ─────────────────────────────────────────────────────────────

export const KM_GRANS_DEFAULT = 60; // fri pendling km/dag om gs_avtal.km_grans_per_dag saknas

/** Km över fri-pendlingsgränsen en given dag (aldrig negativt). km = dagens
 *  km_totalt (tur+retur). */
export function ersattningsKmDag(dagKm: number | null | undefined, grans: number): number {
  return Math.max(0, (dagKm || 0) - grans);
}

/** Påbörjade ersättningsmil en given dag: km över gränsen avrundat UPP till hel
 *  mil (påbörjad mil). 0 om inget över gränsen. */
export function ersattningsMilDag(dagKm: number | null | undefined, grans: number): number {
  const km = ersattningsKmDag(dagKm, grans);
  return km > 0 ? Math.ceil(km / 10) : 0;
}

/** Summa påbörjade ersättningsmil över flera dagars km_totalt. */
export function ersattningsMil(dagarKm: (number | null | undefined)[], grans: number): number {
  return dagarKm.reduce<number>((s, km) => s + ersattningsMilDag(km, grans), 0);
}
