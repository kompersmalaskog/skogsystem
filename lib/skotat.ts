// Objektets skotade volym — EN regel, delad av uppföljningen (useUppfoljningList) och
// översikten (OversiktPage.skordMap). Ändra bara HÄR, aldrig i en vy för sig.
//
// Regel (bekräftad av Martin 2026-08-19):
//  1. Objekt-nivå-manuell (skotare_objekt_manuell med maskin_id IS NULL) = användarens avslut
//     / grot-automatik → TRUMFAR ALLT.
//  2. Annars PER MASKIN: en manuell rad för maskin X är UTFÖRD SKOTNING (ofta filfri JD810E som
//     registrerar volym + G15 per maskin) och TRUMFAR maskin X:s lass — aldrig dubbelräkna samma
//     maskin (Björn: lass 682 + manuell 950 → 950, inte 1632). Objektets skotat = Σ över maskinerna
//     av (manuell om satt för maskinen, annars maskinens lass).
//
// Skotat = null (okänt, ≠ 0) hanteras av anroparen: ingen lass OCH ingen manuell → null.

export interface SkotatInput {
  /** maskin_id → summerad lass-volym (m³fub) på objektet (ur fakt_lass, per maskin). */
  lassPerMaskin: Map<string, number>;
  /** maskin_id → summerad manuell skotad volym (skotare_objekt_manuell, maskin_id SATT). */
  manuellPerMaskin: Map<string, number>;
  /** skotare_objekt_manuell med maskin_id IS NULL (objekt-nivå); null om ingen. Trumfar allt. */
  manuellObjektNiva: number | null;
}

export interface SkotatResult {
  /** Total skotad volym (m³fub). */
  skotat: number;
  /** Objekt-nivå-manuell finns → skotaren räknas KLAR (force i skotarTillstand/uppföljningens badge). */
  harManuellAvslut: boolean;
}

/** Objektets skotade volym enligt den delade regeln ovan. Se SkotatInput för källorna. */
export function objektSkotat(i: SkotatInput): SkotatResult {
  if (i.manuellObjektNiva != null) {
    return { skotat: i.manuellObjektNiva, harManuellAvslut: true };
  }
  const maskiner = new Set<string>([...i.lassPerMaskin.keys(), ...i.manuellPerMaskin.keys()]);
  let skotat = 0;
  for (const m of maskiner) {
    const manuell = i.manuellPerMaskin.get(m);
    // Manuell trumfar maskinens lass (aldrig addera samma maskin); annars maskinens lass.
    skotat += manuell != null ? manuell : (i.lassPerMaskin.get(m) || 0);
  }
  return { skotat, harManuellAvslut: false };
}
