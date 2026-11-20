// RÖTAN PÅ EN TRAKT, ur rotkapssimuleringen (sim_rotkap, raden för 3,0 m — beraknas av berakna_rotkap.py efter import).
//
// Rotkap = maskinen kapade bort en rotbit med röta. "Kvar efter första biten" = stammar där en enda rotbit inte räckte: maskinen kapade
// igen, eftersom rötan fortsatte uppåt (grupp 2 i simuleringen: kedjan av rotkap har mer än en bit). Andelen räknas på stammarna med
// rotkap OCH sågstock (stammar = grupp1 + grupp2) — de enda där simuleringen ser kedjan.
// "Vanligt" = samma andel över alla trakter med simulering (summa mot summa, aldrig snitt av snitt), trakten själv inte medräknad.

export type RotkapRad = {
  objekt_id: string; stammar_objekt: number; stammar: number; grupp2_stammar: number; utan_sagstock: number; utan_kurva: number;
};
export type Rota = {
  /** Stammar där maskinen kapade bort röta (rotkap), alla — också de utan sågstock eller kurva. */
  medRotkap: number;
  /** Alla stammar på trakten. */
  stammar: number;
  /** Stammar där rötan fanns kvar efter första biten, och hur många de räknas på. */
  kvar: number;
  kvarAv: number;
  /** Andel 0–1 av kvarAv; null när inga stammar har rotkap med sågstock. */
  kvarAndel: number | null;
  /** Samma andel över alla andra trakter; null när underlag saknas. */
  kvarVanligt: number | null;
};

export function rotaFor(objektId: string, rader: RotkapRad[]): Rota | null {
  const r = rader.find(x => x.objekt_id === objektId);
  if (!r) return null;
  const andra = rader.filter(x => x.objekt_id !== objektId);
  const sumAv = andra.reduce((a, x) => a + x.stammar, 0);
  return {
    medRotkap: r.stammar + r.utan_sagstock + r.utan_kurva,
    stammar: r.stammar_objekt,
    kvar: r.grupp2_stammar,
    kvarAv: r.stammar,
    kvarAndel: r.stammar > 0 ? r.grupp2_stammar / r.stammar : null,
    kvarVanligt: sumAv > 0 ? andra.reduce((a, x) => a + x.grupp2_stammar, 0) / sumAv : null,
  };
}
