/**
 * Arbetad tid = maskintid + extra tid — EN definition för hela appen.
 *
 * arbetsdag.arbetad_min innehåller BARA maskintid (verifierat mot MOM:
 * extra_tid-posterna ligger utanför passets fönster). Extra tid är arbete
 * när maskindatorn var av — arbetstid rakt av, ingen viktning
 * (M+L-beslut 2026-07-16: en jobbad timme är en jobbad timme).
 *
 * ALLA summeringar av arbetstid ska gå via de här funktionerna så att
 * varje vy/export räknar identiskt. Ställen som redan räknade rätt innan
 * filen fanns (månadssammanställningens hjälte i Arbetsrapport.tsx och
 * admin-LonFlikens totaler) migreras hit UTAN resultatändring — de får
 * inte "fixas" en gång till (dubbelräkning).
 */

export type ExtraTidPost = { datum?: string | null; minuter?: number | null };
export type ArbetsdagMin = { datum?: string | null; arbetad_min?: number | null };

/** Summa extra-minuter per datum (YYYY-MM-DD) — för dag- och veckonivå
 *  (staplar, dagrader, notiser). Poster utan datum ignoreras. */
export function extraMinPerDag(extraPoster: ExtraTidPost[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const e of extraPoster || []) {
    if (!e?.datum) continue;
    map.set(e.datum, (map.get(e.datum) || 0) + (e.minuter || 0));
  }
  return map;
}

/**
 * SCHEMAT — vardagar (mån–fre) som inte är röda dagar × timmar per dag, för
 * datumen fran..till (inklusive, YYYY-MM-DD). EN definition för Min tids
 * veckorad ("av 40"), årsvyns markering per månad och övertidskortets
 * "kalenderns vardagar × 8". Det är ett SCHEMA — vad en vanlig period
 * innehåller — INTE lönens ordinarie (som är arbetade dagar × 8, se
 * lib/lonesystem/loneberakning). Därför visas det aldrig som "av" på
 * månadsraden: en månad med semester eller sjukdom ser då ut att sakna timmar.
 */
export function schemaTimmar(
  fran: string,
  till: string,
  arRodDag: (datum: string) => boolean,
  timmarPerDag = 8,
): number {
  const [fy, fm, fd] = fran.split("-").map(Number);
  const [ty, tm, td] = till.split("-").map(Number);
  const d = new Date(fy, fm - 1, fd);
  const slut = new Date(ty, tm - 1, td);
  let dagar = 0;
  while (d.getTime() <= slut.getTime()) {
    const dow = d.getDay();
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (dow !== 0 && dow !== 6 && !arRodDag(k)) dagar++;
    d.setDate(d.getDate() + 1);
  }
  return dagar * timmarPerDag;
}

/** Total arbetad tid i minuter = maskintid (arbetad_min) + extra tid.
 *  Delarna returneras separat så vyer kan särredovisa (delade staplar,
 *  "varav extra tid"-rader) utan att räkna om själva. */
export function arbetadTidInklExtra(
  dagar: ArbetsdagMin[],
  extraPoster: ExtraTidPost[],
): { totalMin: number; maskinMin: number; extraMin: number } {
  const maskinMin = (dagar || []).reduce((a, d) => a + (d?.arbetad_min || 0), 0);
  const extraMin = (extraPoster || []).reduce((a, e) => a + (e?.minuter || 0), 0);
  return { totalMin: maskinMin + extraMin, maskinMin, extraMin };
}
