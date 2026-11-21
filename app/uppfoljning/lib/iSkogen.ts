// "Ligger i skogen": allt virke som skördas eller ligger kvar, oavsett typ och
// skotare, med hur länge det legat sedan skördaren blev klar. EN regel för
// kortet, listan och detaljvyn.
//
// "Skördaren klar" = sista dagen skördaren fällde på trakten (sistaAvverkning,
// MAX(fakt_produktion.datum)). Det är samma dag som appens avslut sätter
// (avslut_ur_maskindata använder maskinens sista dag på objektet) och samma
// ankare som liggetiden i detaljvyn. dim_objekt.end_date används medvetet INTE:
// den raden blandar maskiner (Skälviken bar skördningens slut på skotarens rad).
//
// Rena funktioner — klockan skickas in, så de går att testa.
import type { UppfoljningObjekt } from './transform';
import { liggetidDagar } from './liggetid';

const DAG = 864e5;

/** Hur länge de klara trakterna visas under "Framme vid avlägget". */
export const KLARA_VISAS_DAGAR = 30;

export type SkogLage =
  | { lage: 'skordas' }
  | { lage: 'vantar'; dagar: number }
  | { lage: 'skotas'; dagar: number }
  | { lage: 'okant' }; // skördaren klar men inget avverkningsdatum — skrivs ut ärligt

export type SkogRad = { o: UppfoljningObjekt; lage: SkogLage; kvarM3: number };
export type KlarRad = { o: UppfoljningObjekt; dagar: number | null; framme: string };

function dagarMellan(fran: string, till: string): number {
  return Math.max(0, Math.round((Date.parse(till.slice(0, 10)) - Date.parse(fran.slice(0, 10))) / DAG));
}

/** Läget för en trakt som har virke kvar. skordas = skördaren kör fortfarande. */
export function skogLage(o: UppfoljningObjekt, skordas: boolean, nu: number): SkogLage {
  if (skordas) return { lage: 'skordas' };
  if (!o.sistaAvverkning) return { lage: 'okant' };
  const dagar = liggetidDagar(o.sistaAvverkning, nu);
  return o.volymSkotare > 0 ? { lage: 'skotas', dagar } : { lage: 'vantar', dagar };
}

function dagarAv(l: SkogLage): number {
  return l.lage === 'vantar' || l.lage === 'skotas' ? l.dagar : -1;
}

/**
 * Listan. `pagar` = trakter med virke kvar (samma urval som "Per skotare",
 * utan risjobb); `avslutade` = färdigskotade. Egen skotning tas aldrig med —
 * markägaren skotar, det är inte vårt väntande virke.
 * Ordning: längst legat först, trakter där skördaren kör sist. Klara: senast
 * framme först.
 */
export function iSkogen(
  pagar: UppfoljningObjekt[],
  avslutade: UppfoljningObjekt[],
  arSkordas: (o: UppfoljningObjekt) => boolean,
  kvarM3: (o: UppfoljningObjekt) => number,
  nu: number,
): { rader: SkogRad[]; klara: KlarRad[] } {
  const rader = pagar
    .filter(o => !o.egenSkotning)
    .map(o => ({ o, lage: skogLage(o, arSkordas(o), nu), kvarM3: kvarM3(o) }))
    .sort((a, b) => dagarAv(b.lage) - dagarAv(a.lage) || a.o.namn.localeCompare(b.o.namn, 'sv'));

  const idag = new Date(nu).toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' });
  const grans = new Date(Date.parse(idag) - KLARA_VISAS_DAGAR * DAG).toISOString().slice(0, 10);
  const klara = avslutade
    .filter(o => !o.egenSkotning)
    .map(o => {
      const framme = o.skotareLastDate || o.skotareSlut;
      return framme ? { o, framme: framme.slice(0, 10), dagar: o.sistaAvverkning ? dagarMellan(o.sistaAvverkning, framme) : null } : null;
    })
    .filter((r): r is KlarRad => r != null && r.framme >= grans)
    .sort((a, b) => b.framme.localeCompare(a.framme));

  return { rader, klara };
}

/** Kortets tal: det som legat längst (null = inget har legat än, bara skörd). */
export function langstLegat(rader: SkogRad[]): number | null {
  const d = rader.map(r => dagarAv(r.lage)).filter(n => n >= 0);
  return d.length > 0 ? Math.max(...d) : null;
}

export const dagOrd = (n: number) => (n === 1 ? 'dag' : 'dagar');

// ── Trakten: tre steg från stubbe till avlägg ───────────────────────────────

export type Steg = { slag: 'skordare' | 'vantan' | 'skotare'; rubrik: string; under: string };

export type StegIndata = {
  skordarDagar: string[];      // dagar med produktion (prodSkordarePerDag)
  skordareStart: string | null;
  sistaAvverkning: string | null;
  skordareKlar: boolean;       // skördningen är klar (uppfoljningStatus.skKlar)
  lassDagar: string[];         // dagar med lass (lassPerDag)
  skotareStart: string | null;
  skotareLastDate: string | null;
  skotningKlar: boolean;
  egenSkotning: boolean;
};

const MAN = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
/** "28 okt" — egna månadsnamn: Intl ger "okt." med punkt i vissa miljöer. */
export const kortDatum = (d: string) => `${Number(d.slice(8, 10))} ${MAN[Number(d.slice(5, 7)) - 1]}`;
const kort = kortDatum;
function spann(a: string, b: string): string {
  if (a === b) return kort(a);
  const [ka, kb] = [kort(a), kort(b)];
  const samMan = a.slice(0, 7) === b.slice(0, 7);
  return samMan ? `${ka.split(' ')[0]}–${kb}` : `${ka} – ${kb}`;
}
const inkl = (a: string, b: string) => dagarMellan(a, b) + 1;

/** Första och sista dag i perioden (skördarens första dag → sista lasset, eller idag). Null = inget att räkna på. */
export function period(i: StegIndata, idag: string): { fran: string; till: string } | null {
  const fran = [...i.skordarDagar].sort()[0] ?? i.skordareStart?.slice(0, 10) ?? null;
  if (!fran) return null;
  const sistaLass = [...i.lassDagar].sort().at(-1) ?? i.skotareLastDate?.slice(0, 10) ?? null;
  const till = i.skotningKlar && sistaLass ? sistaLass : idag;
  return till >= fran ? { fran, till } : null;
}

export function stegFor(i: StegIndata, idag: string): Steg[] {
  const ut: Steg[] = [];
  const skFran = [...i.skordarDagar].sort()[0] ?? i.skordareStart?.slice(0, 10) ?? null;
  const skTill = i.sistaAvverkning?.slice(0, 10) ?? [...i.skordarDagar].sort().at(-1) ?? null;
  if (skFran && skTill) {
    ut.push(i.skordareKlar
      ? { slag: 'skordare', rubrik: 'Skördaren fällde', under: `${spann(skFran, skTill)} · ${inkl(skFran, skTill)} ${dagOrd(inkl(skFran, skTill))}` }
      : { slag: 'skordare', rubrik: 'Skördaren fäller', under: `sedan ${kort(skFran)} · ${inkl(skFran, idag)} ${dagOrd(inkl(skFran, idag))}` });
  }
  if (i.egenSkotning) return ut;
  const lass = [...i.lassDagar].sort();
  const stFran = lass[0] ?? i.skotareStart?.slice(0, 10) ?? null;
  const stTill = lass.at(-1) ?? i.skotareLastDate?.slice(0, 10) ?? null;
  if (i.skordareKlar && skTill && !(stFran && stFran <= skTill)) {
    // Skotaren började medan skördaren körde → ingen väntan att visa.
    const vant = stFran ? dagarMellan(skTill, stFran) - 1 : dagarMellan(skTill, idag);
    if (!stFran) ut.push({ slag: 'vantan', rubrik: 'Virket väntar', under: `${vant} ${dagOrd(vant)} · skotaren har inte börjat` });
    else if (vant > 0) ut.push({ slag: 'vantan', rubrik: 'Virket väntade', under: `${vant} ${dagOrd(vant)}` });
  }
  if (stFran) {
    ut.push(i.skotningKlar && stTill
      ? { slag: 'skotare', rubrik: 'Skotaren körde', under: `${spann(stFran, stTill)} · ${inkl(stFran, stTill)} ${dagOrd(inkl(stFran, stTill))}` }
      : { slag: 'skotare', rubrik: 'Skotaren kör', under: `sedan ${kort(stFran)}` });
  }
  return ut;
}
