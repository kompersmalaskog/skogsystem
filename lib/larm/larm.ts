// LARMLOGIKEN för körvyn och skotarläget — ren och testbar. Typen avgör vad som larmar (lib/larm/grupper), ingen inställning per markering.
//
//   Röd (Fara)          larmar alltid. Kvittering sparas som bevis men tystar inte: larmet kommer nästa gång.
//   Grön, Brun, Blå     larmar tills FÖRAREN kvitterat (samma innehåll). Efter det: inget ljud, inget kort, bara ring i gruppens färg när man är nära.
//   Lila, Mörk          larmar aldrig.
//   Förbjudna ytor      (Hänsyn, Nyckelbiotop, Fornlämning, Ej framkomlig) larmar ALLTID vid inkörning, även kvitterade.
//
//   Inom 40 m: symbolen och ringen lyser i gruppens färg, kort överst med namn och meter, ETT ljud.
//   Inom 15 m, bara Röd: kortet pulserar och ett andra, tydligare ljud.
//   Ingen knapp i kortet. Kortet försvinner av sig självt när man passerat eller lämnat ytan.
//
//   FLERA LARM SAMTIDIGT: ETT stort kort — det viktigaste (Röd före övriga grupper, inom en grupp närmast först; en förbjuden yta efter Röd).
//   Under det en liten rad i samma kort: nästa larm ("+ Namn · kommentar  18 m"), eller "+N till" när fler än ett väntar. Aldrig flera stora kort.
//   Det som föraren redan sagt Sett till (eller kvitterat tidigare) sjunker: nästa okvitterade flyttar upp. Det stora larmets objekt pulserar på
//   kartan (roll 'stor'), objektet i +-raden lyser utan att pulsera (roll 'plus'), övriga inom 40 m som förut (roll 'ovrig').
//   Ljudet och kortet kommer en gång per närmande. Lämnar man radien (+ marginal) och kommer tillbaka larmar det igen.
//
// Kvittensen gäller bara den förare som kvitterat (`forareId`). En annan förare får fullt larm.

import { GRUPPER, type FargGrupp } from './grupper';

export const NARA_M = 40;
export const MYCKET_NARA_M = 15;
/** Lämnar radien först vid radie + marginal, så GPS-brus vid kanten inte ger ett nytt ljud. */
export const HYSTERES_NARA_M = 10;
export const HYSTERES_MYCKET_NARA_M = 5;

export type LarmKalla = 'symbol' | 'linje' | 'yta';
export type Steg = 'ute' | 'nara' | 'mycket_nara';

export interface LarmObjekt {
  /** Markeringens id (Vidas geometri: `vida:<lager>:<index>`). Kvittensen är knuten till det. */
  id: string;
  kalla: LarmKalla;
  grupp: FargGrupp;
  namn: string;
  /** Hash av typ + kommentar. Ändras innehållet gäller en gammal kvittens inte längre. */
  hash: string;
  /** Yta man inte får köra in i: larmar alltid vid inkörning. */
  forbjuden?: boolean;
  /** Symbol/linje: avstånd i meter (till närmaste punkt). Ytor: null. */
  avstandM: number | null;
  /** Yta: positionen ligger inne i ytan. */
  inne?: boolean;
  bearing?: number | null;
  kommentar?: string | null;
  typ?: string;
  /** Förarens egna prickar (pillräknaren) och symboler han själv just satt: larmar aldrig. */
  undantagen?: boolean;
}

export interface Kvittens { hash: string; forareId: string; tid?: string }
export type KvittensKarta = ReadonlyMap<string, Kvittens>;

export interface LarmState {
  steg: Readonly<Record<string, Steg>>;
  /** Kvitterat under den här passagen (Röd och förbjudna ytor tystas inte, men raden ska ändå försvinna). Nollas när man lämnat. */
  sett: Readonly<Record<string, true>>;
}
export const TOMT_LARM: LarmState = { steg: {}, sett: {} };

export interface LarmKort {
  id: string;
  kalla: LarmKalla;
  grupp: FargGrupp;
  farg: string;
  namn: string;
  /** Underrad: ytans "Du är inne i ytan …" eller markeringens kommentar. */
  text: string | null;
  /** Meter som räknas ner live. Null för ytor. */
  avstandM: number | null;
  bearing: number | null;
  /** Inom 15 m (bara Röd): kortet pulserar. */
  pulserar: boolean;
  forbjuden: boolean;
}

/** Vilken roll ringen har bland samtidiga larm: 'stor' = kortets objekt (pulserar), 'plus' = objektet i +-raden (lyser), 'ovrig' = som förut. */
export type RingRoll = 'stor' | 'plus' | 'ovrig';
export interface LarmRing { id: string; kalla: LarmKalla; grupp: FargGrupp; farg: string; steg: Steg; kvitterad: boolean; roll: RingRoll }

/** Raden under det stora kortet. */
export interface LarmNastaRad { id: string; grupp: FargGrupp; farg: string; namn: string; text: string | null; avstandM: number | null }
/** Nästa larm: exakt ett → namngivet i `rad`; flera → bara `fler` ("+2 till"). */
export interface LarmNasta { rad: LarmNastaRad | null; fler: number }
export type LarmLjud = 'nara' | 'mycket_nara';

export interface LarmUtfall {
  state: LarmState;
  kort: LarmKort | null;
  /** De andra larmen som är aktiva just nu (under det stora kortet). Null när bara ett larm är aktivt. */
  nasta: LarmNasta | null;
  /** Den smala raden längst ner: "Sett <Namn>". Null när ingen kvittering behövs. */
  settRad: { id: string; namn: string } | null;
  ringar: LarmRing[];
  /** ETT ljud: det tydligaste som utlöstes i det här steget. */
  ljud: LarmLjud | null;
  /** Mönster för telefonens vibration (maskindatorn vibrerar inte — ljudet måste räcka ensamt). */
  vibration: number[] | null;
}

/** Hash av typ + kommentar (djb2 → base36). */
export function innehallHash(m: { type?: string; comment?: string }): string {
  const s = `${m.type ?? ''}|${m.comment ?? ''}`;
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Har DEN HÄR föraren kvitterat just det här innehållet? Annan förare, annan hash eller ingen förare ger false. */
export function arKvitterad(o: Pick<LarmObjekt, 'id' | 'hash'>, kvitt: KvittensKarta, forareId: string | null): boolean {
  if (!forareId) return false;
  const k = kvitt.get(o.id);
  return !!k && k.forareId === forareId && k.hash === o.hash;
}

/** Larmar objektet (kort + ljud) givet kvitteringen? */
export function larmar(o: LarmObjekt, kvitterad: boolean): boolean {
  if (o.undantagen) return false;
  if (o.forbjuden) return true;
  const regel = GRUPPER[o.grupp].larm;
  if (regel === 'aldrig') return false;
  if (regel === 'alltid') return true;
  return !kvitterad;
}

/** Visar objektet en ring i gruppens färg när man är nära? Alla larmgrupper, även kvitterade. */
export function harRing(o: LarmObjekt): boolean {
  return !o.undantagen && (o.forbjuden === true || GRUPPER[o.grupp].larm !== 'aldrig');
}

/** Får objektet en "Sett"-rad? Röd, Grön, Brun, Blå (och förbjudna ytor). Lila och Mörk: aldrig. */
export function harSettRad(o: LarmObjekt): boolean {
  return larmar({ ...o, undantagen: false }, false) && !o.undantagen;
}

function nastaSteg(o: LarmObjekt, prev: Steg): Steg {
  if (o.kalla === 'yta') return o.inne ? 'nara' : 'ute';
  const d = o.avstandM;
  if (d == null || !Number.isFinite(d)) return 'ute';
  const fara = o.grupp === 'fara';
  const nara = prev === 'ute' ? d <= NARA_M : d <= NARA_M + HYSTERES_NARA_M;
  if (!nara) return 'ute';
  if (fara && (prev === 'mycket_nara' ? d <= MYCKET_NARA_M + HYSTERES_MYCKET_NARA_M : d <= MYCKET_NARA_M)) return 'mycket_nara';
  return 'nara';
}

/** Vilket larm är viktigast? Röd före övriga grupper, sedan förbjuden yta, sedan övrigt; inom samma nivå närmast först. */
function prio(o: LarmObjekt): number {
  if (o.grupp === 'fara') return 0;
  if (o.forbjuden) return 1;
  return 2;
}

const kortText = (o: LarmObjekt): string | null =>
  o.kalla === 'yta' ? (o.forbjuden ? 'Du är inne i ytan, kör inte här' : 'Du är inne i ytan') : (o.kommentar || null);

const VIBRATION: Record<LarmLjud, number[]> = { nara: [30, 50, 30], mycket_nara: [80, 40, 80] };
const VIBRATION_YTA = [100, 50, 100];

export function stegaLarm(inp: { objekt: readonly LarmObjekt[]; kvitt: KvittensKarta; forareId: string | null; state: LarmState }): LarmUtfall {
  const nyaSteg: Record<string, Steg> = {};
  const nyaSett: Record<string, true> = {};
  const ringar: LarmRing[] = [];
  const aktiva: { o: LarmObjekt; steg: Steg; kvitterad: boolean; klar: boolean }[] = [];
  let ljud: LarmLjud | null = null;
  let vibration: number[] | null = null;

  for (const o of inp.objekt) {
    if (o.undantagen) continue;
    const prev = inp.state.steg[o.id] ?? 'ute';
    const steg = nastaSteg(o, prev);
    if (steg === 'ute') continue;                         // lämnat radien: steg och "sett" glöms, så nästa närmande larmar igen
    nyaSteg[o.id] = steg;
    if (inp.state.sett[o.id]) nyaSett[o.id] = true;
    const kvitterad = arKvitterad(o, inp.kvitt, inp.forareId);
    if (harRing(o) && o.kalla !== 'yta') ringar.push({ id: o.id, kalla: o.kalla, grupp: o.grupp, farg: GRUPPER[o.grupp].farg, steg, kvitterad, roll: 'ovrig' });
    if (!larmar(o, kvitterad)) continue;
    aktiva.push({ o, steg, kvitterad, klar: kvitterad || !!nyaSett[o.id] });
    // Ljud en gång per närmande: första gången objektet kommer in, och en gång till när Röd kommer inom 15 m.
    if (prev === 'ute' && steg === 'nara') {
      if (ljud !== 'mycket_nara') ljud = 'nara';
      vibration = vibration ?? (o.kalla === 'yta' ? VIBRATION_YTA : VIBRATION.nara);
    }
    if (steg === 'mycket_nara' && prev !== 'mycket_nara') {
      ljud = 'mycket_nara';
      vibration = VIBRATION.mycket_nara;
    }
  }

  // Det som föraren redan kvitterat (Sett nu, eller tidigare) sjunker: nästa okvitterade flyttar upp. Är allt kvitterat står det viktigaste kvar.
  aktiva.sort((a, b) => Number(a.klar) - Number(b.klar) || prio(a.o) - prio(b.o) || (a.o.avstandM ?? 0) - (b.o.avstandM ?? 0));
  const vinnare = aktiva[0] ?? null;
  let kort: LarmKort | null = null;
  let nasta: LarmNasta | null = null;
  let settRad: LarmUtfall['settRad'] = null;
  if (vinnare) {
    const o = vinnare.o;
    kort = {
      id: o.id, kalla: o.kalla, grupp: o.grupp, farg: GRUPPER[o.grupp].farg, namn: o.namn,
      text: kortText(o),
      avstandM: o.kalla === 'yta' ? null : Math.round(o.avstandM ?? 0),
      bearing: o.bearing ?? null,
      pulserar: vinnare.steg === 'mycket_nara',
      forbjuden: !!o.forbjuden,
    };
    if (harSettRad(o) && !vinnare.klar) settRad = { id: o.id, namn: o.namn };
    const rest = aktiva.slice(1);
    if (rest.length === 1) {
      const n = rest[0].o;
      nasta = { rad: { id: n.id, grupp: n.grupp, farg: GRUPPER[n.grupp].farg, namn: n.namn, text: kortText(n), avstandM: n.kalla === 'yta' ? null : Math.round(n.avstandM ?? 0) }, fler: 0 };
    } else if (rest.length > 1) {
      nasta = { rad: null, fler: rest.length };
    }
    const plusId = nasta?.rad?.id;
    for (const r of ringar) r.roll = r.id === o.id ? 'stor' : r.id === plusId ? 'plus' : 'ovrig';
  }
  return { state: { steg: nyaSteg, sett: nyaSett }, kort, nasta, settRad, ringar, ljud, vibration };
}

/** Föraren tryckte "Sett": raden försvinner under den här passagen. Röd och förbjudna ytor larmar ändå vidare. */
export function markeraSett(state: LarmState, id: string): LarmState {
  return { steg: state.steg, sett: { ...state.sett, [id]: true } };
}
