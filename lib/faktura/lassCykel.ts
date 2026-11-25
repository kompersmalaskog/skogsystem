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
// PRISET RÄKNAS PÅ AVSTÅNDET TILL VIRKET — `ytterstM` (Martin 2026-11-25)
//
// Tillägget betalar TRANSPORTEN mellan virket och avlägget. Halveringen av en
// cykel finns bara för att man inte vetat vilken del av körningen som var
// transport; med hyttspåret vet vi det, och då ska talet vara avståndet, inte
// en halverad totalsumma.
//
// Uppmätt i prod 2026-11-25 (volymviktat, lass med mätt cykel):
//
//   trakt              ytterst   cykel ÷ 2   vid avlägget/lass
//   Skälviken  (70)     414 m      739 m        251 m
//   Mölleryd   (33)     142        227          179
//   Edestad    (28)     367        557          169
//   Bondeskog  (21)     484        599          187
//   Arvidstorp (19)     285        516          243
//   Krokshult  (18)     141        248          181
//
// VARFÖR INTE HALVA CYKELN: den räknar in körningen VID avlägget — sortering
// och läggning, 169–251 m per lass, på Mölleryd 39 % av hela cykeln. Det
// arbetet är redan betalt i kubikpriset, och transporttillägget ska inte
// betala det en andra gång.
//
// VARFÖR INTE "TRANSPORTVÄGEN" (cykel − avlägget, delat på två): den räknar
// fortfarande in plockningen — körningen mellan högarna medan lasset fylls.
// Också lastning, också redan betald.
//
// FACIT, DET SOM AVGJORDE: på de två trakter där Martin satt avståndet för
// hand och Vida betalat fakturan ger `ytterstM` samma pris som hans eget tal:
//
//   Skälviken  handsatt 450 m → 12 kr/m³fub   ytterst 414 m → 12 kr   20 956 kr
//   Edestad    handsatt 350 m →  8 kr/m³fub   ytterst 367 m →  8 kr    4 708 kr
//
// Halva cykeln ger 41 912 resp. 9 416 kr på samma trakter — 24 och 16 kr/m³fub
// i stället för 12 och 8. Transportvägen 34 927 resp. 7 062 (20 och 12 kr).
// Ingen av dem reproducerar en enda av fakturorna; `ytterstM` reproducerar
// båda. Talen är kontrollräknade mot prod och låsta i
// lib/faktura/lassAvstand.test.ts ("facit").
//
// ÄRLIGT OM SVAGHETEN: `ytterstM` är fågelvägen, och maskinen följer en väg —
// talet är alltså något kortare än den körda sträckan. Men det mäts till
// lassets YTTERSTA punkt, inte till virkets tyngdpunkt, vilket drar åt andra
// hållet. De två felen pekar mot varandra, och facit visar att nettot landar
// där Martins egna mätningar landade. Tycker han att talet är fel på en trakt
// sätter han `skotavstand_manuell` — appen föreslår, människan godkänner.
//
// OPTIS LASS KAN INTE MÄTAS SÅ: `fakt_lass` har bara `korstracka_m` (hela
// cykeln) och inget spår per lass, så de bär halva cykeln som förut — alltså
// ett något för högt tal. Det syns i granskningen (källan per rad). Av de åtta
// trakter som mättes 2026-11-25 vinner Opti EN dag på EN trakt (Mölleryd
// 20 okt, halva cykeln 155 m — under grundavståndet, så 0 kr åt båda hållen).
// Från och med att appen började fakturera har varje trakt app-lass.
// ─────────────────────────────────────────────────────────────────────────
//
// `enkelVagM` (cykel ÷ 2) räknas fortfarande fram och visas i granskningen som
// jämförelse. HALVERINGEN SKER PÅ ETT STÄLLE: `skotningsavstandM`
// (lib/skotningsavstand). SQL-funktionen returnerar hela cykeln, aldrig halva.
//
// KÄND BEGRÄNSNING, mätt 2026-11-18: 30 av 106 skotarspår i `hyttspar` saknar
// `maskin_id`. Funktionen joinar på maskin, så ett sådant spår matchar inget
// lass och punkterna tappas — lasset blir `inga_punkter` och räknas inte i
// traktens avståndssnitt. Det
// drabbar INGEN trakt i dag: alla 13 trakter med maskinlösa spår har noll
// bekräftade lass (spåren är från september, lassrapporteringen började 20
// oktober). Att gissa maskin ur objektet vore att gissa, och `inga_punkter`
// syns i granskningen, så det är försiktigt och inte tyst. Börjar det hända på
// en trakt med lass: mät om, och lös det i importen — inte med en gissning här.

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
 * Cykeln → lass som kan bära tillägg, med AVSTÅNDET TILL VIRKET i meter.
 *
 * Talet är `ytterstM` — längsta avståndet från lossningen under cykeln, alltså
 * enkel väg redan, ingen halvering. Se blocket högst upp i filen för varför
 * det och inte halva cykeln.
 *
 * Ett lass utan cykel får `avstandM: null` och bidrar med 0 kr, men följer med
 * i listan: det kördes, och ska väga när Opti och appen jämförs
 * (`valjLassKalla`). Noll hade sett ut som ett mätt kort avstånd.
 */
export function cykelTillAvstandsLass(rader: LassCykel[]): AvstandsLass[] {
  return rader.map(r => ({
    datum: r.datum,
    maskinId: r.maskinId,
    // INVARIANT: avståndet gäller bara när spåret gav en körning. `ytterstM`
    // och `cykelM` räknas ur samma punkter, så en cykel på noll med ett
    // avstånd över noll kan inte uppstå i verkligheten — men skulle den göra
    // det är spåret trasigt, och då är 0 kr rätt svar. Hellre inget tal än
    // ett som vilar på en rad som säger emot sig själv.
    avstandM: r.skal === 'ok'
      && r.cykelM != null && r.cykelM > 0
      && r.ytterstM != null && r.ytterstM > 0
      ? r.ytterstM
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
