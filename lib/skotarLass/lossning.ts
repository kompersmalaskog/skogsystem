// Lossningsdetektorn: ser ur GPS-fixarna när skotaren lossar vid ett avlägg. Ren funktion — inga timers, inga beroenden.
//
// En lossning = maskinen står still (inom STILLA_RADIE_M från där den stannade) i minst STILLA_S sekunder, och står inom
// AVLAGG.RADIE_M från ett avlägg. Detektorn matas med VARJE fix (inte hyttspåret: spåret släpper medvetet punkter som ligger nära
// varandra, och stillastående är precis det vi mäter).
//
// Tre utfall ur ett stillastående:
//   • vid ett avlägg + lastat sedan förra lossningen (eller första lossningen)  → NYTT LASS
//   • vid ett annat avlägg utan att ha lastat emellan                          → DEL 2 av samma lass ("Lass 7 · del 2")
//   • vid samma avlägg utan att ha lastat emellan                              → samma lossning igen (ignoreras)
//   • långt stillastående utanför alla avlägg, bort från skördarens spår        → fråga "Nytt avlägg här?"
// "Har lastat" = maskinen har stått still en stund UTANFÖR alla avlägg (kranarbete) eller kört långt från förra lossningen.
import { avstand } from './geo';
import { AVLAGG, traffaAvlagg, type AvlaggTraff } from './avlagg';
import type { Avlagg, LatLng } from './typer';

export const LOSSNING = {
  /** Stilla så här länge vid ett avlägg = lossning. */
  STILLA_S: 30,
  /** Inom så här långt från där maskinen stannade räknas den som stilla (GPS-brus 3–5 m, kranen rör inte maskinen). */
  STILLA_RADIE_M: 10,
  /** Stilla så här länge utanför alla avlägg = en lastningspaus (kranarbete). */
  LASTNING_STILLA_S: 45,
  /** …eller kört så här långt bort från förra lossningen (ett andra avlägg 100–300 m bort är fortfarande samma last). */
  LASTNING_AVSTAND_M: 400,
  /** "Nytt avlägg här?" kräver ett längre stopp än en lastningspaus… */
  NYTT_AVLAGG_STILLA_S: 90,
  /** …en bit från skördarens spår (lastning sker på stickvägen)… */
  NYTT_AVLAGG_FRAN_SPAR_M: 25,
  /** …och en bit från förra lossningen. */
  NYTT_AVLAGG_FRAN_FORRA_M: 150,
  /** En fråga som avvisats ställs inte igen inom så här långt. */
  FRAGA_SPARR_M: 60,
  /** Glapp i fixarna längre än så → stillastående räknas om från nästa fix (vi vet inte vad som hänt). */
  MAX_GLAPP_S: 90,
  /** Har maskinen lämnat avlägget och gått så här lång tid sedan lossningen har den hunnit lasta (även om lastningen skedde nära avlägget). */
  LASTNING_TID_S: 240,
} as const;

export interface DetektorFix extends LatLng { ts: number }

export interface SenasteLossning { lat: number; lng: number; ts: number; avlaggId: string | null }

export interface DetektorState {
  /** Där nuvarande stillastående började. */
  anker: DetektorFix | null;
  sistaTs: number | null;
  lossningUtlost: boolean;
  fragaUtlost: boolean;
  lastatPausRaknad: boolean;
  senaste: SenasteLossning | null;
  lastat: boolean;
  /** Maskinen har varit utanför avläggets radie sedan förra lossningen. */
  lamnat: boolean;
  avvisadeFragor: LatLng[];
}

export const nyDetektor = (senaste: SenasteLossning | null = null): DetektorState => ({
  anker: null, sistaTs: null, lossningUtlost: false, fragaUtlost: false, lastatPausRaknad: false,
  senaste, lastat: false, lamnat: false, avvisadeFragor: [],
});

export type LossningsTyp = 'nytt_lass' | 'ny_del' | 'upprepning';

export type Handelse =
  | { typ: 'lossning'; lossning: LossningsTyp; ts: number; lat: number; lng: number; traff: AvlaggTraff }
  | { typ: 'nytt_avlagg_fraga'; ts: number; lat: number; lng: number };

export interface DetektorKontext {
  avlagg: readonly Avlagg[];
  /** Avstånd (m) från fixen till närmaste skördarspår. undefined = okänt → "Nytt avlägg här?" ställs inte. */
  avstandTillSpar?: number;
}

/** Ett steg: nästa tillstånd och högst en händelse. */
export function stegaDetektor(s: DetektorState, fix: DetektorFix, ctx: DetektorKontext): { state: DetektorState; handelse: Handelse | null } {
  let st: DetektorState = { ...s, avvisadeFragor: s.avvisadeFragor };
  const glapp = s.sistaTs != null && (fix.ts - s.sistaTs) / 1000 > LOSSNING.MAX_GLAPP_S;
  st.sistaTs = fix.ts;

  // Har maskinen lastat sedan förra lossningen? (avståndet räknas på varje fix)
  const forraLossning = st.senaste;
  if (forraLossning) {
    const bort = avstand(fix, forraLossning);
    if (!st.lamnat && bort > AVLAGG.RADIE_M) st = { ...st, lamnat: true };
    if (!st.lastat && (bort >= LOSSNING.LASTNING_AVSTAND_M || (st.lamnat && (fix.ts - forraLossning.ts) / 1000 >= LOSSNING.LASTNING_TID_S))) st = { ...st, lastat: true };
  }

  // Rör sig maskinen? Nytt ankare, nollställ utlösta flaggor.
  if (!st.anker || glapp || avstand(fix, st.anker) > LOSSNING.STILLA_RADIE_M) {
    return { state: { ...st, anker: { lat: fix.lat, lng: fix.lng, ts: fix.ts }, lossningUtlost: false, fragaUtlost: false, lastatPausRaknad: false }, handelse: null };
  }

  const stillaS = (fix.ts - st.anker.ts) / 1000;
  const ank = st.anker;
  const traff = traffaAvlagg(ank, ctx.avlagg);

  // Kranarbete utanför alla avlägg = maskinen lastar (en gång per stillastående).
  if (!traff.narmaste && stillaS >= LOSSNING.LASTNING_STILLA_S && !st.lastatPausRaknad) {
    st = { ...st, lastatPausRaknad: true, lastat: st.senaste ? true : st.lastat };
  }

  // 1) Lossning vid ett avlägg.
  if (traff.narmaste && stillaS >= LOSSNING.STILLA_S && !st.lossningUtlost) {
    const forra = st.senaste;
    let lossning: LossningsTyp = 'nytt_lass';
    if (forra && !st.lastat) lossning = forra.avlaggId === traff.narmaste.id ? 'upprepning' : 'ny_del';
    const nySenaste: SenasteLossning = lossning === 'upprepning' && forra
      ? forra
      : { lat: ank.lat, lng: ank.lng, ts: ank.ts, avlaggId: traff.narmaste.id };
    return {
      state: { ...st, lossningUtlost: true, senaste: nySenaste, lastat: lossning === 'upprepning' ? st.lastat : false, lamnat: lossning === 'upprepning' ? st.lamnat : false },
      handelse: { typ: 'lossning', lossning, ts: ank.ts, lat: ank.lat, lng: ank.lng, traff },
    };
  }

  // 2) "Nytt avlägg här?" — långt stopp utanför alla avlägg, bort från skördarens spår och från förra lossningen.
  if (!traff.narmaste && stillaS >= LOSSNING.NYTT_AVLAGG_STILLA_S && !st.fragaUtlost
      && ctx.avstandTillSpar != null && ctx.avstandTillSpar >= LOSSNING.NYTT_AVLAGG_FRAN_SPAR_M
      && (!st.senaste || avstand(ank, st.senaste) >= LOSSNING.NYTT_AVLAGG_FRAN_FORRA_M)
      && !st.avvisadeFragor.some((p) => avstand(p, ank) <= LOSSNING.FRAGA_SPARR_M)) {
    return { state: { ...st, fragaUtlost: true }, handelse: { typ: 'nytt_avlagg_fraga', ts: ank.ts, lat: ank.lat, lng: ank.lng } };
  }

  return { state: st, handelse: null };
}

/** Föraren valde ett annat avlägg än det närmaste: nästa jämförelse ("samma avlägg igen?") ska gå mot det valda. */
export function sattSenasteAvlagg(s: DetektorState, avlaggId: string | null): DetektorState {
  return s.senaste ? { ...s, senaste: { ...s.senaste, avlaggId } } : s;
}

/** Föraren svarade Nej på "Nytt avlägg här?" — fråga inte om samma plats igen. */
export function avvisaFraga(s: DetektorState, plats: LatLng): DetektorState {
  return { ...s, avvisadeFragor: [...s.avvisadeFragor, { lat: plats.lat, lng: plats.lng }] };
}

/** Föraren skapade ett nytt avlägg på platsen (Ja): lossningen räknas som ett nytt lass om maskinen lastat, annars del 2. */
export function lossningVidNyttAvlagg(s: DetektorState, plats: DetektorFix, avlaggId: string): { state: DetektorState; lossning: LossningsTyp } {
  const lossning: LossningsTyp = s.senaste && !s.lastat ? 'ny_del' : 'nytt_lass';
  return {
    state: { ...s, lossningUtlost: true, senaste: { lat: plats.lat, lng: plats.lng, ts: plats.ts, avlaggId }, lastat: false, lamnat: false },
    lossning,
  };
}

export const LOSSNING_AVLAGG_RADIE_M = AVLAGG.RADIE_M;
