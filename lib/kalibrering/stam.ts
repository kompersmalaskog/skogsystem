/**
 * STAMVYN — räknandet bakom "Stam N" i kontrollarket: avvikelsen (maskin − klave) längs stammen rot → topp, svaret i klartext, stockraderna
 * och sammanfattningen av ställena där greppet släppte (definitionen bor i ./grepp). Vyn (components/kalibrering/StamArk + StamAvvikelse) ritar, den räknar inte.
 *
 * REGLER (som i resten av kalibreringsvyn):
 *  - "klavad" = operatören har mätt. Ett värde som är NULL/0 har ingen avvikelse och räknas aldrig som "inom tolerans".
 *  - Avvikelse = maskin − operatör. Positivt = maskinen mäter GROVARE än klaven.
 *  - Färg bara på det som ligger utanför toleransen (tol, ur maskinens kravprofil), och talet står alltid bredvid.
 *  - Färgen är EXAKT kontrollarkets: `avvikelseTon` i ./bedomning (orange över 4, röd över 6, blå under −4). Ingen egen skala här.
 */
import type { StockRow } from '@/app/api/kalibrering/kontroll/route';
import { avvikelseTon, type ToneToken } from './bedomning';
import { dec, fmtAvvikelse } from './format';
import { GREPP_MIN_CM, type Grepp, type KlavePunkt } from './grepp';
import { stockRadVarde } from './kontroll';

/** Färgen på en avvikelse: kontrollarkets egen funktion (`avvikelseTon`, diameter), inte en kopia — så en stock är orange/röd/blå här om och
 *  bara om den är det i Kontroll. ok = inom ±4 mm (ingen färg). Kravprofilens tolerans (`tol`) styr bandet och räkningen "utanför" (som i
 *  `kontrollSumma`); den är 4 mm för båda profilerna idag. */
export const stamTon = (avvik: number): ToneToken => avvikelseTon(avvik, 'dia');

// === Punkterna längs stammen ===
export type StamPunkt = {
  /** Läge på stammen, cm från rotändan (stockens start + mätpunktens läge på stocken). */
  posCm: number;
  maskin: number;
  /** Klavens mått — null när operatören inte mätt. */
  klave: number | null;
  /** maskin − klave, null när klaven saknas. */
  avvik: number | null;
};

export type StamGeometri = {
  punkter: StamPunkt[];
  /** Stockgränserna längs stammen: 0, slutet på stock 1, … — en mer än antalet stockar. */
  granserCm: number[];
  /** Stockarnas nummer i samma ordning (rot → topp). */
  stockNr: number[];
  totalCm: number;
};

const klavat = (v: number | null | undefined): v is number => v != null && v !== 0;

/** Det stamgeometrin behöver av en stock — `StockRow` duger, och diagnos-rutten bygger samma form ur sina egna läsningar. */
export type StamStock = Pick<StockRow, 'stock_nummer' | 'maskin_langd_cm' | 'maskin_toppdia_mm' | 'operator_toppdia_mm'> & {
  matpunkter: { position_cm: number; diameter_maskin_mm: number | null; diameter_operator_mm: number | null }[];
};

/** Maskinens och klavens mått längs hela stammen: mätpunkterna på varje stock plus toppen vid kapsnittet. Stockarna läggs rot → topp. */
export const stamGeometri = (stamStockar: StamStock[]): StamGeometri => {
  const stockar = stamStockar.slice().sort((a, b) => a.stock_nummer - b.stock_nummer);
  const granserCm: number[] = [0];
  const punkter: StamPunkt[] = [];
  for (const s of stockar) {
    const start = granserCm[granserCm.length - 1];
    const langd = s.maskin_langd_cm ?? 0;
    for (const m of s.matpunkter) {
      if (m.diameter_maskin_mm == null) continue;
      const klave = klavat(m.diameter_operator_mm) ? m.diameter_operator_mm : null;
      punkter.push({ posCm: start + m.position_cm, maskin: m.diameter_maskin_mm, klave, avvik: klave != null ? m.diameter_maskin_mm - klave : null });
    }
    if (s.maskin_toppdia_mm != null && langd > 0) {
      const klave = klavat(s.operator_toppdia_mm) ? s.operator_toppdia_mm : null;
      punkter.push({ posCm: start + langd, maskin: s.maskin_toppdia_mm, klave, avvik: klave != null ? s.maskin_toppdia_mm - klave : null });
    }
    granserCm.push(start + langd);
  }
  punkter.sort((a, b) => a.posCm - b.posCm);
  return { punkter, granserCm, stockNr: stockar.map(s => s.stock_nummer), totalCm: granserCm[granserCm.length - 1] };
};

/** Klavens mått längs stammen (bara där klaven mätt) — det `findGreppSlapp` jämför maskinens profil mot. */
export const klavePunkter = (g: StamGeometri): KlavePunkt[] =>
  g.punkter.filter((p): p is StamPunkt & { klave: number } => p.klave != null).map(p => ({ posCm: p.posCm, klave: p.klave }));

// === Prickarna: avvikelsen per mätpunkt ===
export type StamPrick = {
  /** Läge på stammen, cm från rotändan. */
  posCm: number;
  /** maskin − klave, mm. */
  avvik: number;
  /** Färgen — samma som i Kontroll (`stamTon`). */
  ton: ToneToken;
  /** Utanför bandet ±tol: bara de får färg och tal. */
  utanfor: boolean;
  /** Talet skrivs vid pricken. Två tal på samma sida närmare än `ETIKETT_LUCKA` skriver sig inte ovanpå varandra: det största behålls. */
  etikett: boolean;
  /** Var talet ankras mot pricken. Två tal på samma sida som ligger närmare än `ETIKETT_NARA` skjuts isär (vänstra åt vänster, högra åt höger). */
  ankare: 'start' | 'middle' | 'end';
};

/** Minsta avstånd mellan två tal på samma sida, som andel av stammens längd — närmare än så skriver sig det mindre inte alls (≈ 9 px av 320). */
export const ETIKETT_LUCKA = 0.03;
/** Närmare än så (≈ 24 px av 320) och talen skjuts isär i sidled i stället för att stå ovanpå varandra. */
export const ETIKETT_NARA = 0.09;

/** En prick per mätpunkt där klaven mätt (en punkt utan klavmått har ingen avvikelse och ritas inte). */
export const stamPrickar = (g: StamGeometri, tol: number): StamPrick[] => {
  const ut: StamPrick[] = g.punkter
    .filter((p): p is StamPunkt & { avvik: number } => p.avvik != null)
    .map((p): StamPrick => ({ posCm: p.posCm, avvik: p.avvik, ton: stamTon(p.avvik), utanfor: Math.abs(p.avvik) > tol, etikett: false, ankare: 'middle' }));
  const tagna: StamPrick[] = [];
  for (const p of ut.filter(x => x.utanfor).sort((a, b) => Math.abs(b.avvik) - Math.abs(a.avvik))) {
    const granne = tagna.some(t => Math.sign(t.avvik) === Math.sign(p.avvik) && Math.abs(t.posCm - p.posCm) < ETIKETT_LUCKA * g.totalCm);
    if (!granne) { p.etikett = true; tagna.push(p); }
  }
  // Grannar på samma sida: det vänstra talet åt vänster, det högra åt höger, så de inte ligger ovanpå varandra.
  const medTal = ut.filter(x => x.etikett);
  medTal.forEach((p, i) => {
    const nasta = medTal[i + 1];
    if (nasta && Math.sign(nasta.avvik) === Math.sign(p.avvik) && nasta.posCm - p.posCm < ETIKETT_NARA * g.totalCm) {
      if (p.ankare === 'middle') p.ankare = 'end';
      nasta.ankare = 'start';
    }
  });
  return ut;
};

/** Skalan i mm åt båda hållen (alltid symmetrisk kring noll): största avvikelsen eller 1,5 × toleransen, uppåt till jämnt tal. */
export const stamSkala = (prickar: StamPrick[], tol: number): number =>
  Math.max(4, Math.ceil(Math.max(tol * 1.5, ...prickar.map(p => Math.abs(p.avvik))) / 2) * 2);

// === Svaret i klartext ===
export type StamSvar = {
  rubrik: string;
  /** Raden under rubriken med talen bakom ("8 av 21 mätpunkter ligger utanför ±4 mm …"), null när inget är mätt. */
  tal: string | null;
  /** Antal klavade punkter, antal utanför toleransen, och hur många åt vilket håll. */
  n: number; ut: number; grova: number; klena: number;
};

/** Var på stammen ett läge ligger, i vardagsord: första tredjedelen = rotändan, sista = toppen. */
export const stamPlats = (posCm: number, totalCm: number): 'rot' | 'mitt' | 'topp' => {
  if (totalCm <= 0) return 'mitt';
  const f = posCm / totalCm;
  return f < 1 / 3 ? 'rot' : f > 2 / 3 ? 'topp' : 'mitt';
};
const PLATS_ORD = { rot: 'i rotändan', mitt: 'mitt på stammen', topp: 'i toppen' } as const;
const PLATS_MEST = { rot: 'mest i rotändan', mitt: 'mest mitt på stammen', topp: 'mest i toppen' } as const;

/** Svaret på "hur mäter maskinen längs den här stammen?" — en mening. Räknar bara på punkter där klaven mätt. */
export const stamSvar = (g: StamGeometri, tol: number): StamSvar => {
  const klavade = g.punkter.filter(p => p.avvik != null);
  const n = klavade.length;
  if (n === 0) return { rubrik: 'Klaven mätte inte den här stammen', tal: null, n: 0, ut: 0, grova: 0, klena: 0 };
  const grova = klavade.filter(p => (p.avvik as number) > tol);
  const klena = klavade.filter(p => (p.avvik as number) < -tol);
  const ut = grova.length + klena.length;
  const tolText = `±${dec(tol, 0)} mm`;
  if (ut === 0) {
    return { rubrik: 'Maskinen mäter rätt längs hela stammen', tal: `Alla ${n} mätpunkter ligger inom ${tolText}.`, n, ut, grova: 0, klena: 0 };
  }
  const delar = [grova.length ? `${grova.length} för grovt` : null, klena.length ? `${klena.length} för klent` : null].filter(Boolean).join(', ');
  const tal = `${ut} av ${n} mätpunkter ligger utanför ${tolText} (${delar}).`;
  const minst = Math.min(grova.length, klena.length);
  // Åt båda hållen med mer än ett enstaka avvikande värde: spretigt, inte "grovt" eller "klent".
  if (minst >= 2 || (minst >= 1 && minst / ut >= 0.25)) {
    return { rubrik: 'Maskinen mäter ojämnt — än grovt, än klent', tal, n, ut, grova: grova.length, klena: klena.length };
  }
  const ord = grova.length >= klena.length ? 'grovt' : 'klent';
  const dominerande = grova.length >= klena.length ? grova : klena;
  const andel = dominerande.length / n;
  let rubrik: string;
  if (andel >= 0.75) rubrik = `Maskinen mäter ${ord} längs nästan hela stammen`;
  else if (andel >= 0.4) rubrik = `Maskinen mäter ${ord} på en stor del av stammen`;
  else if (dominerande.length === 1) rubrik = `Maskinen mäter ${ord} i en enda mätpunkt, ${PLATS_ORD[stamPlats(dominerande[0].posCm, g.totalCm)]}`;
  else rubrik = `Maskinen mäter ${ord} på en del av stammen`;
  return { rubrik, tal, n, ut, grova: grova.length, klena: klena.length };
};

// === Ställena där greppet släppte, i vardagsord ===
/** "Greppet släppte på 3 ställen, mest i rotändan." Null när vi inte kan bedöma (ingen tät profil eller för få klavmått) — då säger vi ingenting. */
export const greppSammanfattning = (stallen: Grepp[], kanBedomas: boolean, totalCm: number): string | null => {
  if (!kanBedomas) return null;
  if (stallen.length === 0) return 'Greppet släppte ingenstans.';
  const plats = stallen.map(p => stamPlats((p.startCm + p.endCm) / 2, totalCm));
  if (stallen.length === 1) return `Greppet släppte på ett ställe, ${PLATS_ORD[plats[0]]}.`;
  const antal = { rot: 0, mitt: 0, topp: 0 };
  for (const p of plats) antal[p]++;
  const rangordnad = (Object.keys(antal) as (keyof typeof antal)[]).sort((a, b) => antal[b] - antal[a]);
  const [forst, andra] = rangordnad;
  const tydlig = antal[forst] > antal[andra] && antal[forst] / stallen.length >= 0.5;
  return `Greppet släppte på ${stallen.length} ställen, ${tydlig ? PLATS_MEST[forst] : 'utspridda längs stammen'}.`;
};

/** Vilka stockar ett ställe ligger på, som text: "stock 2" eller "stock 2–3". */
export const greppStockText = (p: { startCm: number; endCm: number }, g: StamGeometri): string => {
  const traffade: number[] = [];
  g.stockNr.forEach((nr, i) => {
    if (g.granserCm[i] < p.endCm && g.granserCm[i + 1] > p.startCm) traffade.push(nr);
  });
  if (traffade.length === 0) return '';
  return traffade.length === 1 ? `stock ${traffade[0]}` : `stock ${traffade[0]}–${traffade[traffade.length - 1]}`;
};

export type GreppRad = {
  /** "2,5–2,8 m · stock 1" — var på stammen. */
  titel: string;
  /** Längden på sträckan, bara när den är längre än den minsta som räknas ("50 cm lång"); annars null. */
  langd: string | null;
  /** Felet stället gav, maskin − klave: "+5 mm". */
  fel: string;
  /** Kontrollarkets färg på felet (`stamTon`): ok inom ±4 mm. */
  ton: ToneToken;
};

/** En rad per ställe: var på stammen och hur mycket fel det gav. */
export const greppRad = (p: Grepp, g: StamGeometri): GreppRad => {
  const stock = greppStockText(p, g);
  return {
    titel: `${dec(p.startCm / 100, 1)}–${dec(p.endCm / 100, 1)} m${stock ? ` · ${stock}` : ''}`,
    langd: p.lengthCm > GREPP_MIN_CM ? `${p.lengthCm} cm lång` : null,
    fel: `${fmtAvvikelse(p.felMm, 'mm')} mm`,
    ton: stamTon(Math.round(p.felMm)),
  };
};

// === Stockraderna ===
export type StamStockRad = {
  id: number;
  stockNr: number;
  /** "Timmer 6,1 m" — sortimentgruppen och längden i klartext, aldrig maskinkoden. */
  titel: string;
  /** "Stock 1 · 0,0–6,1 m" — var på stammen stocken ligger. */
  under: string;
  /** Största diameteravvikelsen (med tecken), och om den är klavad. */
  sDia: number;
  diaKl: boolean;
  /** Raden bär kontrollarkets färg (`stockRadVarde` → `avvikelseTon`) — det är samma värde som Kontroll visar för stocken. */
  ton: ToneToken;
  /** "+8" eller null när stocken inte är klavad. */
  avvikText: string | null;
};

export const stamStockRader = (stamStockar: StockRow[]): StamStockRad[] => {
  const stockar = stamStockar.slice().sort((a, b) => a.stock_nummer - b.stock_nummer);
  let start = 0;
  return stockar.map(s => {
    const langd = s.maskin_langd_cm ?? 0;
    const v = stockRadVarde(s);
    const rad: StamStockRad = {
      id: s.id, stockNr: s.stock_nummer,
      titel: `${s.sortiment_grupp ?? 'Okänt sortiment'} ${s.maskin_langd_cm != null ? `${dec(langd / 100, 1)} m` : '–'}`,
      under: `Stock ${s.stock_nummer} · ${dec(start / 100, 1)}–${dec((start + langd) / 100, 1)} m`,
      sDia: v.sDia, diaKl: v.diaKl,
      ton: v.sDiaTon,
      avvikText: v.diaKl ? fmtAvvikelse(v.sDia, 'mm') : null,
    };
    start += langd;
    return rad;
  });
};
