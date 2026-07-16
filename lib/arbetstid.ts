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
