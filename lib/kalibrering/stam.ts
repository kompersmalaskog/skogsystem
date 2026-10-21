/**
 * STAMVYN — räknandet bakom "Stam N" i kontrollarket: diameterprofilen rot → topp (maskinens mått mot klavens), fältet mellan linjerna,
 * svaret i klartext, stockraderna och sammanfattningen av planområdena. Vyn (components/kalibrering/StamArk + StamProfil) ritar, den räknar inte.
 *
 * REGLER (som i resten av kalibreringsvyn):
 *  - "klavad" = operatören har mätt. Ett värde som är NULL/0 har ingen avvikelse och räknas aldrig som "inom tolerans".
 *  - Avvikelse = maskin − operatör. Positivt = maskinen mäter GROVARE än klaven.
 *  - Färg bara på det som ligger utanför toleransen (tol, ur maskinens kravprofil), och talet står alltid bredvid.
 */
import type { StockRow } from '@/app/api/kalibrering/kontroll/route';
import { dec, fmtAvvikelse } from './format';
import { stockRadVarde, type Plan } from './kontroll';

/** Färgen i stamvyn: orange = maskinen mäter grövre än klaven, blå = klentare, ok = inom toleransen (ingen färg). Bara riktningen — hur
 *  mycket säger talet bredvid. (Kontrollarkets stockrader har ett extra steg, röd över tol + 2; stamvyn har det inte.) */
export type FaltTon = 'ok' | 'hi' | 'cold';

/** Ton för en diameteravvikelse mot toleransen ur maskinens kravprofil. Samma gräns överallt i stamvyn: fält, prickar, tal och stockrader. */
export const stamTon = (avvik: number, tol: number): FaltTon => (avvik > tol ? 'hi' : avvik < -tol ? 'cold' : 'ok');
const faltTon = stamTon;

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

/** Maskinens och klavens mått längs hela stammen: mätpunkterna på varje stock plus toppen vid kapsnittet. Stockarna läggs rot → topp. */
export const stamGeometri = (stamStockar: StockRow[]): StamGeometri => {
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

// === Linjerna och fältet mellan dem ===
export type KlaveBit = { posCm: number; klave: number };

/** Klavens linje i sammanhängande bitar: en lucka (punkt utan klavmått) bryter linjen i stället för att dras rakt över. */
export const klaveBitar = (punkter: StamPunkt[]): KlaveBit[][] => {
  const bitar: KlaveBit[][] = [];
  let nu: KlaveBit[] = [];
  for (const p of punkter) {
    if (p.klave == null) {
      if (nu.length) bitar.push(nu);
      nu = [];
    } else {
      nu.push({ posCm: p.posCm, klave: p.klave });
    }
  }
  if (nu.length) bitar.push(nu);
  return bitar;
};

export type FaltBit = { x0: number; x1: number; m0: number; m1: number; k0: number; k1: number; ton: FaltTon };

/** Fältet mellan maskinens och klavens linje, delat där skillnaden passerar noll eller ±tolerans — varje bit har EN ton, så färgen
 *  börjar och slutar exakt där skillnaden går utanför toleransen. */
export const stamFalt = (punkter: StamPunkt[], tol: number): FaltBit[] => {
  const ut: FaltBit[] = [];
  for (let i = 0; i + 1 < punkter.length; i++) {
    const a = punkter[i], b = punkter[i + 1];
    if (a.klave == null || b.klave == null || b.posCm <= a.posCm) continue;
    const d0 = a.maskin - a.klave, d1 = b.maskin - b.klave;
    const ts = [0, 1];
    if (d1 !== d0) {
      for (const niva of [0, tol, -tol]) {
        const t = (niva - d0) / (d1 - d0);
        if (t > 0 && t < 1) ts.push(t);
      }
    }
    ts.sort((x, y) => x - y);
    const lerp = (v0: number, v1: number, t: number) => v0 + (v1 - v0) * t;
    for (let j = 0; j + 1 < ts.length; j++) {
      const ta = ts[j], tb = ts[j + 1];
      if (tb - ta < 1e-9) continue;
      ut.push({
        x0: lerp(a.posCm, b.posCm, ta), x1: lerp(a.posCm, b.posCm, tb),
        m0: lerp(a.maskin, b.maskin, ta), m1: lerp(a.maskin, b.maskin, tb),
        k0: lerp(a.klave, b.klave, ta), k1: lerp(a.klave, b.klave, tb),
        ton: faltTon(lerp(d0, d1, (ta + tb) / 2), tol),
      });
    }
  }
  return ut;
};

export type StamEtikett = { posCm: number; maskin: number; avvik: number; ton: 'hi' | 'cold' };

/** Talen som står i diagrammet: den största avvikelsen i varje sammanhängande stycke utanför toleransen (högst `max`, störst först behålls). */
export const stamEtiketter = (punkter: StamPunkt[], tol: number, max = 6): StamEtikett[] => {
  const grupper: StamEtikett[] = [];
  let nu: StamEtikett | null = null;
  for (const p of punkter) {
    if (p.avvik == null) { nu = null; continue; }
    const ton = faltTon(p.avvik, tol);
    if (ton === 'ok') { nu = null; continue; }
    if (nu && nu.ton === ton) {
      if (Math.abs(p.avvik) > Math.abs(nu.avvik)) { nu.posCm = p.posCm; nu.maskin = p.maskin; nu.avvik = p.avvik; }
    } else {
      nu = { posCm: p.posCm, maskin: p.maskin, avvik: p.avvik, ton };
      grupper.push(nu);
    }
  }
  return grupper.sort((a, b) => Math.abs(b.avvik) - Math.abs(a.avvik)).slice(0, max).sort((a, b) => a.posCm - b.posCm);
};

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

// === Planområden i vardagsord ===
/** "Fastnade på 8 ställen, mest i rotändan." Null när stammen saknar tät profil (då vet vi inget — vi säger ingenting). */
export const planSammanfattning = (planer: Plan[], harProfil: boolean, totalCm: number): string | null => {
  if (!harProfil) return null;
  if (planer.length === 0) return 'Mätningen fastnade ingenstans.';
  const plats = planer.map(p => stamPlats((p.startCm + p.endCm) / 2, totalCm));
  if (planer.length === 1) return `Fastnade på ett ställe, ${PLATS_ORD[plats[0]]}.`;
  const antal = { rot: 0, mitt: 0, topp: 0 };
  for (const p of plats) antal[p]++;
  const rangordnad = (Object.keys(antal) as (keyof typeof antal)[]).sort((a, b) => antal[b] - antal[a]);
  const [forst, andra] = rangordnad;
  const tydlig = antal[forst] > antal[andra] && antal[forst] / planer.length >= 0.5;
  return `Fastnade på ${planer.length} ställen, ${tydlig ? PLATS_MEST[forst] : 'utspridda längs stammen'}.`;
};

/** Vilka stockar ett planområde ligger på, som text: "Stock 2" eller "Stock 2–3". */
export const planStockText = (p: Plan, g: StamGeometri): string => {
  const traffade: number[] = [];
  g.stockNr.forEach((nr, i) => {
    if (g.granserCm[i] < p.endCm && g.granserCm[i + 1] > p.startCm) traffade.push(nr);
  });
  if (traffade.length === 0) return '';
  return traffade.length === 1 ? `Stock ${traffade[0]}` : `Stock ${traffade[0]}–${traffade[traffade.length - 1]}`;
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
  ton: FaltTon;
  /** "+8" eller null när stocken inte är klavad. */
  avvikText: string | null;
};

export const stamStockRader = (stamStockar: StockRow[], tol: number): StamStockRad[] => {
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
      ton: v.diaKl ? stamTon(v.sDia, tol) : 'ok',
      avvikText: v.diaKl ? fmtAvvikelse(v.sDia, 'mm') : null,
    };
    start += langd;
    return rad;
  });
};
