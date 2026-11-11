// HUR LÅNGT HAR SKÖRDAREN KOMMIT — per område och för hela trakten (Martin och Oskar 2026-11-11: "ska det gallras 20 ha vill han veta att han
// gallrat 18, så vet han att han är färdig på onsdag", och högstubbar/evighetsträd "per område och hela trakten").
//
// Visas BARA under objektets namn (ⓘ-kortet i maskinläget) — inget nytt på kartan (Kartan – grundregler: fast på skärmen bara namn, ⓘ och +).
//
// REGLER
//  - Ett område = en av kartans numrerade ytor: Vidas traktdelar och egna traktgränser (en "Justera gräns"-kopia ersätter sin Vida-del). Sidan bygger listan.
//  - Gallrat = skördarens körspår (RÅDATA) med 10 m buffert, klippt mot områdets gräns — exakt samma räkning som "Avverkat X av Y ha" (lib/avverkadAreal).
//    Samma mark körd två gånger räknas en gång. Hela trakten = summan av områdena, så raderna alltid går att räkna ihop.
//  - KLART = minst 95 % av områdets yta (KLART_ANDEL): spåret når sällan ut i varje hörn av gränsen, och ett område som aldrig blir "klart" vore lögn åt andra hållet.
//    Kvar och klar-dag räknas mot samma 95 %.
//  - Tempo = ha per dag ur de senaste dagarna med körspår (samma regel som skotarens "Klar ~onsdag": lib/skotarLass/kvar snittPerDag + klarDatum,
//    minst två dagar, hela dagar före idag i första hand). Utan underlag: ingen dag — aldrig en gissning.
//  - Högstubbar och evighetsträd per område: de markeringar som står inne i området, kravet räknat på OMRÅDETS areal (bara certifierat; lib/miljokrav).
//    Hela trakten använder samma tal som pillen (alla markeringar, kravet på objektets areal), så de två aldrig säger olika.

import { avverkadAreaM2, type Punkt } from './avverkadAreal';
import { EVIGHETSTRAD_PER_HA, HOGSTUBBAR_PER_HA, kravAntal } from './miljokrav';
import { klarDatum, snittPerDag, type LassDag } from './skotarLass/kvar';

export const KLART_ANDEL = 0.95;
/** "N nu" räknas först när så här mycket av området är gallrat — annars står "1 nu" så fort man kört in (Martin 2026-11-11: en påminnelse, inget tjat). */
export const NU_FRAN_HA = 0.2;
const JORDRADIE_M = 6371008.8;

export interface Omrade { id: string; namn: string; ring: Punkt[] }
export interface SparDag { datum: string; segment: Punkt[][] }
export interface MiljoMarkering { type?: string | null; antal?: number | null; lng: number; lat: number }

export interface Raknare {
  antal: number;
  /** Kravet på hela området (certifierat), annars null. */
  krav: number | null;
  /** Hur många som borde stå för det som är gallrat hittills (golv; 0 under NU_FRAN_HA); null utan krav. */
  borde: number | null;
  /** borde − antal, aldrig under 0: "2 nu" i pillen. */
  nu: number;
}

/** Hur många borde stå för gallrat yta: golvet av ha × per ha, aldrig över hela områdets krav, 0 innan NU_FRAN_HA är gallrat. */
export function bordeFor(gallratHa: number, perHa: number, krav: number | null): number | null {
  if (krav == null) return null;
  if (!(gallratHa >= NU_FRAN_HA)) return 0;
  return Math.min(krav, Math.floor(gallratHa * perHa + 1e-9));
}
const raknare = (antal: number, krav: number | null, gallratHa: number, perHa: number): Raknare => {
  const borde = bordeFor(gallratHa, perHa, krav);
  return { antal, krav, borde, nu: borde == null ? 0 : Math.max(0, borde - antal) };
};
export interface OmradeRad {
  id: string;
  namn: string;
  ring: Punkt[];
  arealHa: number;
  gallratHa: number;
  klart: boolean;
  hogstubbar: Raknare;
  evighetstrad: Raknare;
}
export interface Framsteg {
  omraden: OmradeRad[];
  arealHa: number;
  gallratHa: number;
  /** 0..1 av hela arealen (stapeln under namnet). */
  andel: number;
  /** Kvar till KLART_ANDEL av hela arealen. */
  kvarHa: number;
  klart: boolean;
  harSpar: boolean;
  /** ha per dag, null = för lite underlag. */
  tempoHaPerDag: number | null;
  /** ISO-datum, null = okänt. */
  klarDatum: string | null;
}

/** Ytan inom en ring i hektar (lokal projektion runt ringens mitt; fel under en promille för en trakt). */
export function ringArealHa(ring: readonly Punkt[]): number {
  const r = ring.filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
  if (r.length < 3) return 0;
  let lat0 = 0, lng0 = 0;
  for (const p of r) { lat0 += p[1]; lng0 += p[0]; }
  lat0 /= r.length; lng0 /= r.length;
  const rad = Math.PI / 180;
  const kx = JORDRADIE_M * Math.cos(lat0 * rad) * rad, ky = JORDRADIE_M * rad;
  let s = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const xi = (r[i][0] - lng0) * kx, yi = (r[i][1] - lat0) * ky;
    const xj = (r[j][0] - lng0) * kx, yj = (r[j][1] - lat0) * ky;
    s += xj * yi - xi * yj;
  }
  return Math.abs(s) / 2 / 10000;
}

export function punktIRing(lng: number, lat: number, ring: readonly Punkt[]): boolean {
  let inne = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (((yi > lat) !== (yj > lat)) && (lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi)) inne = !inne;
  }
  return inne;
}

const antalAv = (m: MiljoMarkering) => (typeof m.antal === 'number' && Number.isFinite(m.antal) && m.antal > 0 ? m.antal : 1);
const arHogstubbe = (t: string | null | undefined) => t === 'highstump';
const arEvighet = (t: string | null | undefined) => t === 'eternitytree' || t === 'naturecorner';   // samma som lib/miljokrav raknaMiljo

/** Området en punkt står i (första träffen), annars null. */
export function omradeVid<T extends { ring: Punkt[] }>(omraden: readonly T[], lng: number, lat: number): T | null {
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return omraden.find((o) => o.ring.length >= 3 && punktIRing(lng, lat, o.ring)) ?? null;
}

export function beraknaFramsteg(i: {
  omraden: readonly Omrade[];
  /** Skördarens körspår per dag (rådata). */
  spar: readonly SparDag[];
  /** Spår från den här maskinen som inte nått servern än — hör till idag. */
  liveSegment?: Punkt[][];
  idag: string;
  markeringar: readonly MiljoMarkering[];
  certifierat: boolean;
}): Framsteg {
  const omraden = i.omraden.filter((o) => o.ring.length >= 3 && ringArealHa(o.ring) > 0);
  const dagar = new Map<string, Punkt[][]>();
  for (const d of i.spar) if (d.datum <= i.idag) dagar.set(d.datum, [...(dagar.get(d.datum) ?? []), ...d.segment]);
  if (i.liveSegment?.some((s) => s.length > 0)) dagar.set(i.idag, [...(dagar.get(i.idag) ?? []), ...i.liveSegment]);
  const allaSeg = Array.from(dagar.values()).flat();
  const harSpar = allaSeg.some((s) => s.length > 0);

  const rader: OmradeRad[] = omraden.map((o) => {
    const arealHa = ringArealHa(o.ring);
    const gallratHa = harSpar ? Math.min(arealHa, avverkadAreaM2(allaSeg, { ringar: [o.ring] }) / 10000) : 0;
    const inne = i.markeringar.filter((m) => Number.isFinite(m.lng) && Number.isFinite(m.lat) && punktIRing(m.lng, m.lat, o.ring));
    const hs = inne.filter((m) => arHogstubbe(m.type)).reduce((s, m) => s + antalAv(m), 0);
    const ev = inne.filter((m) => arEvighet(m.type)).reduce((s, m) => s + antalAv(m), 0);
    return {
      id: o.id, namn: o.namn, ring: o.ring, arealHa, gallratHa,
      klart: arealHa > 0 && gallratHa >= arealHa * KLART_ANDEL,
      hogstubbar: raknare(hs, i.certifierat ? kravAntal(arealHa, HOGSTUBBAR_PER_HA) : null, gallratHa, HOGSTUBBAR_PER_HA),
      evighetstrad: raknare(ev, i.certifierat ? kravAntal(arealHa, EVIGHETSTRAD_PER_HA) : null, gallratHa, EVIGHETSTRAD_PER_HA),
    };
  });
  const arealHa = rader.reduce((s, r) => s + r.arealHa, 0);
  const gallratHa = rader.reduce((s, r) => s + r.gallratHa, 0);
  const malHa = arealHa * KLART_ANDEL;
  const kvarHa = Math.max(0, malHa - gallratHa);

  // Tempo: hur mycket NY yta varje dag gav (kumulativt över alla områden, så samma mark två dagar räknas den första dagen).
  const ringar = omraden.map((o) => o.ring);
  const perDag: LassDag[] = [];
  let summa: Punkt[][] = [];
  let fore = 0;
  for (const datum of Array.from(dagar.keys()).sort()) {
    summa = [...summa, ...(dagar.get(datum) ?? [])];
    const nu = ringar.length ? avverkadAreaM2(summa, { ringar }) / 10000 : 0;
    const ny = nu - fore;
    fore = nu;
    if (ny > 0.01) perDag.push({ datum, m3: ny });   // LassDag bär "m3" — här hektar; samma regler som skotarens klar-dag
  }
  const tempo = snittPerDag(perDag, i.idag);
  const klart = arealHa > 0 && kvarHa <= 0;
  return {
    omraden: rader, arealHa, gallratHa,
    andel: arealHa > 0 ? Math.max(0, Math.min(1, gallratHa / arealHa)) : 0,
    kvarHa, klart, harSpar,
    tempoHaPerDag: tempo,
    klarDatum: !klart && tempo ? klarDatum(kvarHa, tempo, i.idag) : null,
  };
}
