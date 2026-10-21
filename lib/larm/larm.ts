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
//   Ljudet och kortet kommer en gång per närmande. Lämnar man radien (+ marginal) och kommer tillbaka larmar det igen.
//
//   FLERA LARM SAMTIDIGT: ALLTID ETT stort kort — det viktigaste (förbjuden yta, sedan Röd, sedan övrigt; inom samma nivå närmast först).
//   Under det, i samma kort, en liten rad: ett till larm = "+ <Namn> · <kommentar>  <meter> m", två eller fler = "+N till". Aldrig flera stora kort.
//   Passerat/lämnat → nästa flyttar upp. "Sett" gäller det stora: det sjunker till den lilla raden och nästa som inte kvitterats under den här
//   passagen flyttar upp (Röd tystas inte av Sett, men får inte längre stå överst när något annat väntar på kvittering).
//   Det stora larmets objekt PULSERAR på kartan (lib/larm/pulsKarta); objektet i "+"-raden lyser i sin färg utan att pulsera.
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
  /** Symboltyp / linjetyp / yttyp / Vidas lager — ikonen i kortet hämtas ur symbolkällan med den (lib/symboler). */
  typ?: string;
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
  /** Föraren har inte kvitterat just det här innehållet än: första gången visar kortet den lilla målbilden. */
  okvitterad: boolean;
}

/** Det som står i den lilla raden under det stora kortet (nästa larm). */
export interface LarmNasta {
  id: string;
  kalla: LarmKalla;
  typ?: string;
  grupp: FargGrupp;
  farg: string;
  namn: string;
  /** Markeringens kommentar (symbol/linje) eller "inne i ytan" (yta). */
  text: string | null;
  /** Meter. Null för ytor. */
  avstandM: number | null;
}

/** Ringens roll: `stor` = det stora kortets objekt (pulserar), `nasta` = objektet i "+"-raden (lyser, pulserar inte), `ovrig` = övriga inom 40 m (som förut). */
export type RingRoll = 'stor' | 'nasta' | 'ovrig';
export interface LarmRing { id: string; kalla: LarmKalla; grupp: FargGrupp; farg: string; steg: Steg; kvitterad: boolean; roll: RingRoll }
export type LarmLjud = 'nara' | 'mycket_nara';

export interface LarmUtfall {
  state: LarmState;
  kort: LarmKort | null;
  /** Resten av de larm som pågår, i rangordning (det första flyttar upp när det stora är passerat). Tom = inget under kortet. */
  fler: LarmNasta[];
  /** Den smala raden längst ner: "Sett <Namn>" — alltid för det STORA kortet. Null när ingen kvittering behövs. */
  settRad: { id: string; namn: string; farg: string } | null;
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

/** Vem vinner det stora kortet? Röd före förbjuden yta före övrigt (Martin 2026-10-20: Röd är faran), därefter närmast. */
function prio(o: LarmObjekt): number {
  if (o.grupp === 'fara' && !o.forbjuden) return 0;
  if (o.forbjuden) return 1;
  return 2;
}

type Rangbar = { o: LarmObjekt; sett?: boolean; kvitterad?: boolean; steg?: Steg };

/** Röd inom 15 m ligger ALLTID överst — kvitterad eller inte (kvittensen tar bort knappen, inte kortet). */
const arMycketNaraRod = (a: Rangbar) => a.steg === 'mycket_nara' && a.o.grupp === 'fara' && !a.o.forbjuden;

/** En kvitterad Röd (databasen) och allt som fått "Sett" i den här passagen får sjunka — utom Röd inom 15 m. Förbjuden yta sjunker bara av Sett. */
const harSjunkit = (a: Rangbar) => !!a.sett || (!!a.kvitterad && a.o.grupp === 'fara' && !a.o.forbjuden);

/**
 * Rangordningen: Röd inom 15 m först (alltid), sedan det som kvitterats sist, Röd → förbjuden yta → övrigt, inom samma nivå närmast först.
 */
export function rangordna<T extends Rangbar>(aktiva: readonly T[]): T[] {
  return [...aktiva].sort((a, b) =>
    Number(!arMycketNaraRod(a)) - Number(!arMycketNaraRod(b))
    || Number(harSjunkit(a) && !arMycketNaraRod(a)) - Number(harSjunkit(b) && !arMycketNaraRod(b))
    || prio(a.o) - prio(b.o)
    || (a.o.avstandM ?? 0) - (b.o.avstandM ?? 0));
}

function kortText(o: LarmObjekt): string | null {
  return o.kalla === 'yta' ? (o.forbjuden ? 'Du är inne i ytan, kör inte här' : 'Du är inne i ytan') : (o.kommentar || null);
}

const VIBRATION: Record<LarmLjud, number[]> = { nara: [30, 50, 30], mycket_nara: [80, 40, 80] };
const VIBRATION_YTA = [100, 50, 100];

export function stegaLarm(inp: { objekt: readonly LarmObjekt[]; kvitt: KvittensKarta; forareId: string | null; state: LarmState }): LarmUtfall {
  const nyaSteg: Record<string, Steg> = {};
  const nyaSett: Record<string, true> = {};
  const ringar: LarmRing[] = [];
  const aktiva: { o: LarmObjekt; steg: Steg; kvitterad: boolean; sett: boolean }[] = [];
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
    aktiva.push({ o, steg, kvitterad, sett: !!inp.state.sett[o.id] });
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

  const rang = rangordna(aktiva);
  const vinnare = rang[0] ?? null;
  const ovriga = rang.slice(1);
  let kort: LarmKort | null = null;
  let settRad: LarmUtfall['settRad'] = null;
  if (vinnare) {
    const o = vinnare.o;
    kort = {
      id: o.id, kalla: o.kalla, typ: o.typ, grupp: o.grupp, farg: GRUPPER[o.grupp].farg, namn: o.namn,
      text: kortText(o),
      avstandM: o.kalla === 'yta' ? null : Math.round(o.avstandM ?? 0),
      bearing: o.bearing ?? null,
      pulserar: vinnare.steg === 'mycket_nara',
      forbjuden: !!o.forbjuden,
      okvitterad: !vinnare.kvitterad && !vinnare.sett,
    };
  }
  // "✓ Sett <Namn>" gäller första OKVITTERADE i rangordningen: det stora kortet, eller — när en kvitterad Röd inom 15 m ligger överst utan knapp — första i +-raden.
  const sett = rang.find((x) => harSettRad(x.o) && !x.kvitterad && !nyaSett[x.o.id]);
  if (sett) settRad = { id: sett.o.id, namn: sett.o.namn, farg: GRUPPER[sett.o.grupp].farg };
  const fler: LarmNasta[] = ovriga.map(({ o }) => ({
    id: o.id, kalla: o.kalla, typ: o.typ, grupp: o.grupp, farg: GRUPPER[o.grupp].farg, namn: o.namn,
    text: o.kalla === 'yta' ? 'inne i ytan' : (o.kommentar || null),
    avstandM: o.kalla === 'yta' ? null : Math.round(o.avstandM ?? 0),
  }));
  // Ringarnas roll: det stora kortets objekt pulserar; objektet i "+"-raden (bara när raden är en enda, namngiven) lyser utan puls; övriga som förut.
  const nastaId = fler.length === 1 ? fler[0].id : null;
  for (const r of ringar) r.roll = r.id === vinnare?.o.id ? 'stor' : r.id === nastaId ? 'nasta' : 'ovrig';
  return { state: { steg: nyaSteg, sett: nyaSett }, kort, fler, settRad, ringar, ljud, vibration };
}

/** Föraren tryckte "Sett": raden försvinner under den här passagen. Röd och förbjudna ytor larmar ändå vidare. */
export function markeraSett(state: LarmState, id: string): LarmState {
  return { steg: state.steg, sett: { ...state.sett, [id]: true } };
}
