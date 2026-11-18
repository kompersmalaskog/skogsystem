// SKOTNINGSAVSTÅNDET UR HYTTSPÅRET — lasscykeln och dess delar.
//
// VARFÖR DEN FINNS (mätt i prod 2026-11-18)
//
// `skotar_lass.spar` saknar utturen. Avståndet från varje lossning till nästa
// lass första spårpunkt är i snitt 279 m på Skälviken (75 av 84 lass fattar mer
// än 50 m), 131 m på Arvidstorp, 43–82 m på de övriga. Punkterna finns i
// `hyttspar`, och SQL-funktionen `skotar_lass_cykel` (migration
// 20261118100350) läser dem — därmed lagas historiken också, utan att något
// skrivs om.
//
// ─────────────────────────────────────────────────────────────────────────
// TRE TAL, TRE TOLKNINGAR — OCH DE SKILJER SIG PÅ EN TRAKT SOM SKÄLVIKEN
//
// Uppmätt på Skälviken (85 app-lass, 1 553 m³, volymviktat):
//
//   377 m   fågelväg till virket (stamhögarna ur detalj_stam)
//   660 m   `hemMedLassM` — körd väg från vändpunkten hem med lasset
//   739 m   `enkelVagM` = cykel 1 477 ÷ 2 — Optis sätt att räkna
//
// På Brokamåla och Tjuvön, de två trakter där Martin satt avståndet för hand,
// SAMMANFALLER fågelväg och cykel ÷ 2 — båda trakterna är långa smala remsor
// (Brokamåla 657 × 176 m, Tjuvön 276 × 159 m), och en jämnt fördelad volym
// längs en sådan ger ~430–450 resp. ~200 m åt båda måtten. Kalibreringen
// (450 mot Opti 455, 200 mot Opti 215) kan därför INTE avgöra vilket mått som
// är Vidas — den säger bara att de råkade vara lika där.
//
// Därför levererar den här filen alla tre, och granskningsarket visar dem.
// Priset räknas på `enkelVagM` (cykel ÷ 2), eftersom det är Martins egna ord
// ("vad skotaren kört, sen får man dela det med 2") och det Vida redan betalt
// på faktura 2026140. Tycker han att talet är för högt mot Vida sätter han
// `skotavstand_manuell` — appen föreslår, människan godkänner.
// ─────────────────────────────────────────────────────────────────────────
//
// HALVERINGEN SKER PÅ ETT STÄLLE: `skotningsavstandM` (lib/skotningsavstand).
// SQL-funktionen returnerar hela cykeln, aldrig halva. Aldrig två gånger.

import { skotningsavstandM } from '@/lib/skotningsavstand';
import type { AvstandsLass } from '@/lib/faktura/lassAvstand';

export const CYKEL = {
  /**
   * Rörelse inom så här nära lossningen är arbete VID avlägget — sortering och
   * läggning, inte skotning. MÅSTE stämma med `avlagg_zon_m` i SQL-funktionen
   * `skotar_lass_cykel`; talet finns på två ställen för att delarna ska gå att
   * förklara i vyn utan ett extra anrop.
   */
  AVLAGG_ZON_M: 60,
  /** Under så många lass är ett snitt inte värt att visa som trakten  snitt. */
  MIN_LASS: 3,
} as const;

/** Varför ett lass inte har någon cykel. `ok` = cykeln är mätt. */
export type CykelSkal =
  | 'ok'
  | 'forsta_lasset'
  | 'fonster_for_langt'
  | 'inga_punkter'
  | 'saknar_lossning'
  /** RPC:n finns inte (migrationen inte körd). Inget tal, aldrig ett gissat. */
  | 'kunde_inte_lasas';

export type LassCykel = {
  lassId: string;
  voNummer: string | null;
  maskinId: string | null;
  datum: string;
  volym: number;
  /** HELA den körda cykeln i meter. null när `skal` inte är 'ok'. */
  cykelM: number | null;
  punkter: number | null;
  /** Körning inom AVLAGG_ZON_M från lossningen — landningsarbete. */
  vidAvlaggetM: number | null;
  /** Från vändpunkten (längst från lossningen) hem, utanför avläggszonen. */
  hemMedLassM: number | null;
  /** Längsta avståndet från lossningen under cykeln. */
  ytterstM: number | null;
  skal: CykelSkal;
};

/** Texten som förklarar ett lass utan cykel. Ingen av dem betyder 0 meter. */
export const SKAL_TEXT: Record<Exclude<CykelSkal, 'ok'>, string> = {
  forsta_lasset: 'första lasset — inget föregående att mäta från',
  fonster_for_langt: 'mer än 3 timmar sedan förra lossningen (natt, rast eller maskinflytt)',
  inga_punkter: 'appen loggade inget spår i fönstret',
  saknar_lossning: 'lasset har ingen lossningstid eller -position',
  kunde_inte_lasas: 'cykeln kunde inte läsas',
};

/**
 * Cykeln → lass som kan bära tillägg, med avståndet som ENKEL VÄG.
 *
 * Ett lass utan cykel får `avstandM: null` och bidrar med 0 kr, men följer med
 * i listan: det kördes, och ska väga när Opti och appen jämförs
 * (`valjLassKalla`). Noll hade sett ut som ett mätt kort avstånd.
 */
export function cykelTillAvstandsLass(rader: LassCykel[]): AvstandsLass[] {
  return rader.map(r => ({
    datum: r.datum,
    maskinId: r.maskinId,
    avstandM: r.skal === 'ok' && r.cykelM != null && r.cykelM > 0
      ? skotningsavstandM(r.cykelM)
      : null,
    volym: r.volym,
    kalla: 'app' as const,
  }));
}

export type CykelSammanstallning = {
  lass: number;
  medCykel: number;
  volym: number;
  /** Volymen bakom talen — resten saknar cykel och räknas inte i snitten. */
  volymMedCykel: number;
  /** Volymviktad hel cykel. null = för få lass eller ingen volym. */
  cykelM: number | null;
  /** cykelM ÷ 2 — det som blir pris. */
  enkelVagM: number | null;
  /** Volymviktad hemresa med lass. Det maskinen körde MED virket. */
  hemMedLassM: number | null;
  /** Volymviktat landningsarbete per lass. Martins förhandlingsunderlag. */
  vidAvlaggetM: number | null;
  /** Volymviktat längsta avstånd från lossningen. */
  ytterstM: number | null;
  /** Hur många lass som saknar cykel, per orsak. Tomma orsaker utelämnas. */
  utan: Partial<Record<Exclude<CykelSkal, 'ok'>, number>>;
};

/**
 * Trakten i siffror, för granskningsarket.
 *
 * VIKTAT PÅ VOLYM, aldrig snitt av snitt: ett 20 m³-lass 600 m bort väger tre
 * gånger ett 7 m³-lass. Samma regel som `snittSkotningsavstandM`.
 */
export function sammanstallCykel(rader: LassCykel[]): CykelSammanstallning {
  const ok = rader.filter(r => r.skal === 'ok' && r.cykelM != null && r.cykelM > 0);
  const volymMedCykel = ok.reduce((s, r) => s + r.volym, 0);

  const viktat = (valj: (r: LassCykel) => number | null): number | null => {
    if (ok.length < CYKEL.MIN_LASS || volymMedCykel <= 0) return null;
    let summa = 0;
    let vikt = 0;
    for (const r of ok) {
      const v = valj(r);
      if (v == null || !Number.isFinite(v)) continue;
      summa += v * r.volym;
      vikt += r.volym;
    }
    return vikt > 0 ? summa / vikt : null;
  };

  const cykelM = viktat(r => r.cykelM);
  const utan: Partial<Record<Exclude<CykelSkal, 'ok'>, number>> = {};
  for (const r of rader) {
    if (r.skal === 'ok' && r.cykelM != null && r.cykelM > 0) continue;
    const s = (r.skal === 'ok' ? 'inga_punkter' : r.skal) as Exclude<CykelSkal, 'ok'>;
    utan[s] = (utan[s] || 0) + 1;
  }

  return {
    lass: rader.length,
    medCykel: ok.length,
    volym: rader.reduce((s, r) => s + r.volym, 0),
    volymMedCykel,
    cykelM,
    enkelVagM: cykelM == null ? null : skotningsavstandM(cykelM),
    hemMedLassM: viktat(r => r.hemMedLassM),
    vidAvlaggetM: viktat(r => r.vidAvlaggetM),
    ytterstM: viktat(r => r.ytterstM),
    utan,
  };
}
