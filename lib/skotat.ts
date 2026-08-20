// ─────────────────────────────────────────────────────────────────────────────
// ÄGARSKAP: skotat-regeln ägs av uppföljning/skotare-sessionen. Ska en annan
// session (t.ex. #412-spåret) ändra hur skotad volym räknas — resolveSkotareVolym,
// objektSkotat eller paBackenKvar — koordineras det HIT först, aldrig parallellt.
// Två parallella skotat-implementationer (#412 vs #435) uppstod en gång och fick
// förenas i #437; den här filen är den ENDA sanningen efter det.
// ─────────────────────────────────────────────────────────────────────────────
//
// Objektets skotade volym — EN regel, delad av uppföljningens LISTA (useUppfoljningList),
// uppföljningens DETALJ (transform.ts) och översikten (OversiktPage.skordMap). Ändra bara
// HÄR, aldrig i en vy för sig — de tre vyerna får ALDRIG räkna skotat olika.
//
// Regel (bekräftad av Martin 2026-08-19):
//  1. Objekt-nivå-manuell (skotare_objekt_manuell med maskin_id IS NULL) = användarens avslut
//     (skotad_volym_manuell) → TRUMFAR ALLT. (Grot/ris lagras ALDRIG här — det bor i dim_objekt
//     som risskotning/grot_hamtad + egna risjobb-objekt_id — så grot kan inte läcka in hit.)
//  2. Annars PER MASKIN: per (objekt, maskin) delas den manuella raden + mätt lass upp i
//     EGEN skotning (räknas) och OMLASTNING (räknas ALDRIG mot objektets skotade total) via
//     resolveSkotareVolym(). En manuell rad för maskin X (ofta filfri JD810E) TRUMFAR maskin X:s
//     lass — aldrig dubbelräkna samma maskin. Objektets skotat = Σ över maskinerna av EGEN.
//
// Skotat = null (okänt, ≠ 0) hanteras av anroparen: ingen lass OCH ingen manuell → null.

/**
 * En rå skotare_objekt_manuell-rad (maskin_id SATT), så mycket som EN-regeln behöver för att
 * skilja EGEN skotning (räknas) från OMLASTNING (räknas aldrig). Anroparen skickar hela raden.
 */
export interface SkotareManuellRad {
  /** EGEN skotning (räknas mot skotad total). Primär källa. */
  volym_egen_skotning?: number | null;
  /** OMLASTNING (räknas ALDRIG mot skotad total; visas som arbete). */
  volym_omlastning?: number | null;
  /** Äldre helhets-volym — läs-fallback när de två nya fälten saknas. */
  volym_m3?: number | null;
  /** Äldre boolean: hela radens volym är omlastning (fallback-tolkning). */
  ar_omlastning?: boolean | null;
}

/**
 * EN plats för uppdelningen per (objekt, maskin): given den råa manuella raden (eller null) och
 * den MÄTTA lass-volymen (SUM fakt_lass.volym_m3sub), returnera { egen, omlastning }.
 *   egen (RÄKNAS)        = volym_egen_skotning ?? (ar_omlastning ? 0 : (volym_m3 ?? max(0, mätt − (volym_omlastning ?? 0))))
 *   omlastning (EXKLUD.) = volym_omlastning     ?? (ar_omlastning ? (volym_m3 ?? mätt) : 0)
 * Ingen rad (null) → egen = mätt, omlastning = 0 (ren lass-maskin, bakåtkompatibelt).
 */
export function resolveSkotareVolym(
  rad: SkotareManuellRad | null,
  matt: number,
): { egen: number; omlastning: number } {
  const m = Math.max(0, Number(matt) || 0);
  const egenExpl = rad?.volym_egen_skotning;
  const omlExpl = rad?.volym_omlastning;
  const legacy = rad?.volym_m3;
  const arOml = !!rad?.ar_omlastning;

  const omlastning = omlExpl ?? (arOml ? (legacy ?? m) : 0);
  const egen = egenExpl ?? (arOml ? 0 : (legacy ?? Math.max(0, m - (omlExpl ?? 0))));
  return { egen: Number(egen) || 0, omlastning: Number(omlastning) || 0 };
}

export interface SkotatInput {
  /** maskin_id → summerad lass-volym (m³fub) på objektet (ur fakt_lass, per maskin). */
  lassPerMaskin: Map<string, number>;
  /** maskin_id → RÅ skotare_objekt_manuell-rad (maskin_id SATT). Löses via resolveSkotareVolym. */
  manuellRadPerMaskin: Map<string, SkotareManuellRad>;
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
  const maskiner = new Set<string>([...i.lassPerMaskin.keys(), ...i.manuellRadPerMaskin.keys()]);
  let skotat = 0;
  for (const m of maskiner) {
    const rad = i.manuellRadPerMaskin.get(m) ?? null;
    const matt = i.lassPerMaskin.get(m) ?? 0;
    // EGEN skotning räknas (manuell trumfar maskinens lass); OMLASTNING räknas ALDRIG.
    skotat += resolveSkotareVolym(rad, matt).egen;
  }
  return { skotat, harManuellAvslut: false };
}


// Virke KVAR på backen = vårt väntande skotararbete. Egen skotning (säljaren/markägaren skotar
// själv) → det är INTE vårt jobb → aldrig på vår backe (0). Delad av båda vyerna så egen_skotning
// exkluderas identiskt ur alla på-backen-summor (header, per-maskin, uppföljningens lista).
export function paBackenKvar(skordat: number, skotat: number | null, egenSkotning: boolean): number {
  if (egenSkotning) return 0;
  return Math.max(0, skordat - (skotat ?? 0));
}
