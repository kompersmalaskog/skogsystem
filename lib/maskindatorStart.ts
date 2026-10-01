// Maskindator-start (förarflödet sektion A): när appen öppnas på en maskindator (bunden till en
// maskin via lib/enhetMaskin) avgör vi utan tryck vilket objekt körvyn ska öppna på — utifrån
// GPS-positionen (valjObjektForPosition, #631) och maskinens tilldelning.
//
// Den här filen är BESLUTET (rent, testbart). Sidan (page.tsx) sköter sidoeffekterna: hämta fix,
// öppna körvyn, skriva skotare_/skordare_maskin_id + status, notis, 30 s-timer, auto-byte, 200 m.

export type Roll = 'skordare' | 'skotare';

/** dim_maskin.maskin_typ → roll. Harvester=skördare, Forwarder=skotare. null/okänt → null. */
export function rollAvMaskintyp(maskinTyp: string | null | undefined): Roll | null {
  const t = String(maskinTyp ?? '').toLowerCase();
  if (t.includes('harvester') || t.includes('skörd') || t.includes('skord')) return 'skordare';
  if (t.includes('forward') || t.includes('skotare')) return 'skotare';
  return null;
}

export type StartAtgard =
  // Öppna körvyn direkt och logga (maskinen är tilldelad objektet den står i — A2 — eller
  // "logga ändå" när kortet redan visats en gång utan svar).
  | { typ: 'korvy'; objektId: string; roll: Roll }
  // Öppna körvyn på objektet men visa bekräftelsekortet "Börja skota här?" ovanpå (A3).
  | { typ: 'fraga'; objektId: string; roll: Roll }
  // Ingen färsk fix (A4) eller fix utanför alla objekt → maskinens tilldelade objekt (fallback).
  | { typ: 'tilldelat'; objektId: string; roll: Roll }
  // Inget att öppna automatiskt → visa objektlistan (ingen bunden maskin, ingen position, ingen tilldelning).
  | { typ: 'lista' };

/** Avgör maskindator-startens åtgärd. Rent beslut — inga sidoeffekter.
 *
 *  De fyra startfallen (sektion A) + "frågas en gång":
 *   1. färsk fix, står i tilldelat objekt           → korvy (loggning utan tryck)
 *   2. färsk fix, står i EJ tilldelat objekt         → fraga (bekräftelsekort), om ej redan frågat
 *      2b. samma men kortet redan visat denna session → korvy (logga ändå, ingen ny fråga)
 *   3. ingen färsk fix                               → tilldelat objekt (A4), annars lista
 *   4. färsk fix men utanför alla objekt             → tilldelat objekt, annars lista
 *
 *  Tilldelning (skotare_/skordare_maskin_id === enhetMaskin) är det PERSISTENTA "fråga inte"-skyddet:
 *  en planerar-tilldelning ELLER ett Ja (som skriver tilldelningen) gör att posTilldelad blir true
 *  nästa gång → fall 1 i stället för fall 2. redanFragat är bara sessionens transienta skydd mot att
 *  kortet plöjer upp igen när GPS:en vickar in/ut ur gränsen. */
export function avgorMaskindatorStart(args: {
  enhetRoll: Roll | null;             // maskinens roll (null = ingen maskin bunden → auto-start av)
  harFix: boolean;                    // färsk GPS-fix finns
  posObjektId: string | null;         // objekt vars traktgräns innehåller positionen (null = utanför alla)
  posTilldelad: boolean;              // enhetMaskin tilldelad posObjektId (skördar- eller skotarplatsen)
  tilldelatObjektId: string | null;   // maskinens tilldelade objekt oavsett position (A4-fallback)
  redanFragat: boolean;               // kortet redan visat för posObjektId denna session
}): StartAtgard {
  const { enhetRoll, harFix, posObjektId, posTilldelad, tilldelatObjektId, redanFragat } = args;
  if (!enhetRoll) return { typ: 'lista' };
  if (harFix && posObjektId) {
    if (posTilldelad) return { typ: 'korvy', objektId: posObjektId, roll: enhetRoll };
    if (!redanFragat) return { typ: 'fraga', objektId: posObjektId, roll: enhetRoll };
    return { typ: 'korvy', objektId: posObjektId, roll: enhetRoll };
  }
  if (tilldelatObjektId) return { typ: 'tilldelat', objektId: tilldelatObjektId, roll: enhetRoll };
  return { typ: 'lista' };
}

/** Implicit ja: maskinen har kört ≥ 200 m inne i objektet medan kortet visats → räkna som Ja
 *  (sätt tilldelning + status, stäng kortet). Tröskel i meter, default 200. */
export const IMPLICIT_JA_M = 200;
export function implicitJa(kordMeterInneIObjektet: number, troskel = IMPLICIT_JA_M): boolean {
  return kordMeterInneIObjektet >= troskel;
}
