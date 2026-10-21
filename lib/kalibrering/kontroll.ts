/**
 * EN KONTROLL, EN STAM, EN STOCK — beräkningarna bakom kontroll-, stam- och stockarken. Flyttade ur
 * app/kalibrering/page.tsx (där de låg inne i klick-callbacken openKontrollFull), oförändrade.
 *
 * REGEL (genom hela vyn): "klavad" = operatören har mätt. Ett oklavat värde (NULL/0) har ingen avvikelse
 * och får aldrig räknas som "inom tolerans".
 */
import type { StockRow } from '@/app/api/kalibrering/kontroll/route';
import type { DetaljKontrollStock } from './typer';
import { dec, fmtAvvikelse } from './format';
import { avvikelseTon, TON_RANK, type ToneToken } from './bedomning';

/** Operatören har mätt längden (NULL/0 = ej klavad). */
export const lenKlavad = (s: { operator_langd_cm: number | null }): boolean =>
  s.operator_langd_cm != null && s.operator_langd_cm !== 0;

/** Avvikelse med störst belopp (tecknet behålls); tom lista → 0. */
const storstAvvik = (varden: number[]): number =>
  varden.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a), 0);

/** Mätpunkter där både maskin och operatör har ett värde: avvikelse (maskin − operatör) per punkt. */
const matpunktAvvik = (s: { matpunkter: { diameter_maskin_mm: number | null; diameter_operator_mm: number | null }[] }): number[] =>
  s.matpunkter
    .filter((m) => m.diameter_maskin_mm != null && m.diameter_operator_mm != null)
    .map((m) => (m.diameter_maskin_mm as number) - (m.diameter_operator_mm as number));

// === Kontrollarket: fördelningen av stockarna ===
export type StockSvarm = { id: number; stam_nummer: number; stock_nummer: number; sLen: number; sDia: number; lenKl: boolean; diaKl: boolean };

/** Per-stock fördelning — delas av svärmen (visuellt) och totalsiffrorna. sDia = max-absolut över mätpunkter + toppen
 *  (utan den missar man fel som bara dyker upp i ett enskilt mätställe på en annars samlad stock). */
export const stockFordelning = (stockar: StockRow[]): StockSvarm[] =>
  stockar.map((s) => {
    const lenKl = lenKlavad(s);
    const mpA = matpunktAvvik(s);
    const diaKl = mpA.length > 0 || (s.operator_toppdia_mm != null && s.operator_toppdia_mm !== 0);
    const sLen = lenKl ? (s.langd_avvikelse_cm ?? 0) : 0;
    const sDia = diaKl ? storstAvvik([...mpA, s.dia_avvikelse_mm ?? 0]) : 0;
    return { id: s.id, stam_nummer: s.stam_nummer, stock_nummer: s.stock_nummer, sLen, sDia, lenKl, diaKl };
  });

const statusLabel = (klavade: number, utanfor: number, ejKlavade: number, total: number): string => {
  if (klavade === 0) return `${total} ej klavade`;
  const bas = utanfor === 0 ? `Alla ${klavade} inom tolerans` : `${utanfor} av ${klavade} utanför`;
  return ejKlavade > 0 ? `${bas} · ${ejKlavade} ej klavade` : bas;
};

export type KontrollSumma = {
  lenKlavade: StockSvarm[]; diaKlavade: StockSvarm[];
  lenStatusTone: 'ok' | 'bad'; diaStatusTone: 'ok' | 'bad';
  /** Längd visar TRÄFFPROCENT (andel klavade inom ±tol) — stocken kapas. null utan klavade stockar. */
  lenTraff: number | null;
  lenLabel: string; diaLabel: string;
};
/** Status-raderna räknar enskilda stockar utanför tolerans — snittet kan se OK ut även när flera stockar är dåliga.
 *  Räknar BARA på klavade stockar. Toleranserna kommer ur maskinens kravprofil (tolFranProfil). */
export const kontrollSumma = (stockDist: StockSvarm[], tolDia: number, tolLen: number): KontrollSumma => {
  const lenKlavade = stockDist.filter((e) => e.lenKl);
  const diaKlavade = stockDist.filter((e) => e.diaKl);
  const utanforLen = lenKlavade.filter((e) => Math.abs(e.sLen) > tolLen).length;
  const utanforDia = diaKlavade.filter((e) => Math.abs(e.sDia) > tolDia).length;
  const ejKlavadeLen = stockDist.length - lenKlavade.length;
  const ejKlavadeDia = stockDist.length - diaKlavade.length;
  return {
    lenKlavade, diaKlavade,
    lenStatusTone: utanforLen === 0 ? 'ok' : 'bad',
    diaStatusTone: utanforDia === 0 ? 'ok' : 'bad',
    lenTraff: lenKlavade.length > 0 ? Math.round((100 * (lenKlavade.length - utanforLen)) / lenKlavade.length) : null,
    lenLabel: statusLabel(lenKlavade.length, utanforLen, ejKlavadeLen, stockDist.length),
    diaLabel: statusLabel(diaKlavade.length, utanforDia, ejKlavadeDia, stockDist.length),
  };
};

/** Svärm-position: avvikelse → procent. Klipp till [4,96] så pricken aldrig sitter på kanten även vid extrema värden. */
export const swarmX = (val: number, max: number): number => {
  const clipped = Math.max(-max, Math.min(max, val));
  const pct = ((clipped + max) / (max * 2)) * 100;
  return Math.max(4, Math.min(96, pct));
};
/** Deterministisk vertikal jitter — hash på (stam·100+stock) så samma stock alltid hamnar på samma höjd. */
export const swarmY = (e: { stam_nummer: number; stock_nummer: number }): number => {
  const h = (e.stam_nummer * 100 + e.stock_nummer) * 37;
  return 24 + (h % 52);
};

/** Stem-val + mätare tas från första stocken (enhetlig per fil i praktiken). */
export const stamValOchMatare = (stockar: StockRow[]): { selText: string | null; measurer: string | null } => {
  const fs = stockar[0];
  const selText =
    fs?.stem_selection === 'Randomly selected stem' ? 'Slumpvald stam'
    : fs?.stem_selection === 'Manually by operator selected stem' ? 'Vald av operatör'
    : fs?.stem_selection ?? null;
  return { selText, measurer: fs?.measurer_name ?? null };
};

/** Väderstripen: temperatur, nederbörd (snö/regn/uppehåll) och vind — null-värden utelämnas. */
export const vaderText = (w: { snowfall_cm?: number | null; precipitation_mm?: number | null }): string => {
  const snow = w.snowfall_cm ?? 0;
  const rain = w.precipitation_mm ?? 0;
  const hasSnow = snow > 0;
  const hasRain = !hasSnow && rain > 0;
  return hasSnow ? `${dec(snow, 1)} cm snö` : hasRain ? `${dec(rain, 1)} mm` : 'Uppehåll';
};

// === Stocklistan i kontrollarket ===
export type StockRadVarde = {
  lenKl: boolean; sLen: number; sLenTon: ToneToken;
  diaKl: boolean; sDia: number; sDiaTon: ToneToken;
  /** Raden bär varningen: dess ton = värsta måttet (delad skala). */
  worstTon: ToneToken;
};
export const stockRadVarde = (s: StockRow): StockRadVarde => {
  const lenKl = lenKlavad(s);
  const sLen = s.langd_avvikelse_cm ?? 0;
  const sLenTon: ToneToken = lenKl ? avvikelseTon(sLen, 'len') : 'ok';
  const mpAvvik = matpunktAvvik(s);
  const diaKl = mpAvvik.length > 0 || (s.operator_toppdia_mm != null && s.operator_toppdia_mm !== 0);
  const sDia = storstAvvik([...mpAvvik, s.dia_avvikelse_mm ?? 0]);
  const sDiaTon: ToneToken = diaKl ? avvikelseTon(sDia, 'dia') : 'ok';
  const worstTon: ToneToken = TON_RANK[sDiaTon] >= TON_RANK[sLenTon] ? sDiaTon : sLenTon;
  return { lenKl, sLen, sLenTon, diaKl, sDia, sDiaTon, worstTon };
};

// === Stamvyn: planområden (resten av stamvyn bor i ./stam) ===
export type Plan = { startCm: number; endCm: number; lengthCm: number; diameterMm: number };

/** Planområden i den täta diameterprofilen — Skogforsks grunddefinition: icke-minskande sträcka ≥ 30 cm.
 *  För varje punkt i går j framåt så länge dia[j] >= dia[j-1]; sträckan [i, j-1] är planområde om längden ≥ 30. */
export const findPlanomraden = (profile: { position_cm: number; diameter_mm: number }[]): Plan[] => {
  const sorted = profile.slice().sort((a, b) => a.position_cm - b.position_cm);
  if (sorted.length <= 1) return [];
  const out: Plan[] = [];
  let i = 0;
  while (i < sorted.length - 1) {
    let j = i + 1;
    while (j < sorted.length && sorted[j].diameter_mm >= sorted[j - 1].diameter_mm) {
      j++;
    }
    const startCm = sorted[i].position_cm;
    const endCm = sorted[j - 1].position_cm;
    const length = endCm - startCm;
    if (length >= 30) {
      out.push({ startCm, endCm, lengthCm: length, diameterMm: sorted[i].diameter_mm });
    }
    i = j;
  }
  return out;
};

// === Stockarket (från stamvyn) ===
export type StockDiagnos = { tone: 'ok' | 'warn' | 'bad'; text: string } | null;
export type MatpunktAvvik = { position_cm: number; avvikelse: number; mVal: number; oVal: number };

export type StockDetalj = {
  sLen: number; lenKlavad: boolean; diaKlavad: boolean; sLenBad: boolean;
  mpAvvik: MatpunktAvvik[]; hasMp: boolean;
  maxAvvik: number; maxAvvikPos: number | null;
  minPos: number; maxPos: number;
  diagnos: StockDiagnos;
};

/** Y-skala för lollipop: ±8 mm → 10–90 %, klampat till 8–92 % så markörens ring + etikett får plats vid kanten. */
export const yPctFor = (avvik: number): number => {
  const clamped = Math.max(-8, Math.min(8, avvik));
  const raw = 50 - (clamped / 8) * 40;
  return Math.max(8, Math.min(92, raw));
};
/** X-skala: 15–85 % mellan första och sista mätpunktens position. */
export const xPctFor = (pos: number, mp: MatpunktAvvik[]): number => {
  const minPos = mp.length ? mp[0].position_cm : 0;
  const maxPos = mp.length ? mp[mp.length - 1].position_cm : 1;
  const range = maxPos - minPos || 1;
  return mp.length === 1 ? 50 : 15 + ((pos - minPos) / range) * 70;
};

/** Diagnos baserad på riktnings-konsensus. En mening, mänskligt språk. Outlier = |avvikelse| > 4 mm (Skogforsks branschstandard). */
export const stockDiagnos = (mpAvvik: MatpunktAvvik[]): StockDiagnos => {
  if (mpAvvik.length === 0) return null;
  const outliers = mpAvvik.filter((p) => Math.abs(p.avvikelse) > 4);
  if (outliers.length === 0) {
    return { tone: 'ok', text: 'Mätningen är samlad, inom tolerans.' };
  }
  if (outliers.length === 1) {
    const o = outliers[0];
    return {
      tone: 'warn',
      text:
        `Punkten ${fmtAvvikelse(o.avvikelse, 'mm')} mm vid ${o.position_cm} cm sticker ut. ` +
        `Annars samlat. Kontrollera anliggning vid den grovleken.`,
    };
  }
  const signs = outliers.map((o) => Math.sign(o.avvikelse));
  const allSame = signs.every((s) => s === signs[0]);
  if (allSame) {
    const avg = outliers.reduce((a, o) => a + o.avvikelse, 0) / outliers.length;
    const dir = avg > 0 ? 'grovt' : 'smalt';
    return {
      tone: 'bad',
      text:
        `Drar systematiskt åt ${dir} — ${Math.round(Math.abs(avg))} mm i snitt på ` +
        `${outliers.length} av ${mpAvvik.length} punkter. Tyder på kalibreringsfel — ` +
        `men bekräfta med fler stammar innan du justerar.`,
    };
  }
  return {
    tone: 'bad',
    text:
      `Spretigt — ${outliers.length} av ${mpAvvik.length} punkter pekar olika håll. ` +
      `Tyder på mekaniskt problem (givare/mäthjul/anliggning). ` +
      `Kalibrering hjälper inte mot spridning.`,
  };
};

export const stockDetalj = (s: StockRow, tolLen: number): StockDetalj => {
  const sLen = s.langd_avvikelse_cm ?? 0;
  const mpAvvik: MatpunktAvvik[] = s.matpunkter
    .filter((m) => m.diameter_maskin_mm != null && m.diameter_operator_mm != null)
    .map((m) => ({
      position_cm: m.position_cm,
      avvikelse: (m.diameter_maskin_mm as number) - (m.diameter_operator_mm as number),
      mVal: m.diameter_maskin_mm as number,
      oVal: m.diameter_operator_mm as number,
    }))
    .sort((a, b) => a.position_cm - b.position_cm);
  const hasMp = mpAvvik.length > 0;
  const topAvvik = s.dia_avvikelse_mm ?? 0;
  // Max-avvikelse (med tecken) över mätpunkter + topp
  type DiaEntry = { avvik: number; pos: number | null };
  const allEntries: DiaEntry[] = hasMp
    ? [...mpAvvik.map((p) => ({ avvik: p.avvikelse, pos: p.position_cm as number | null })), { avvik: topAvvik, pos: null }]
    : [{ avvik: topAvvik, pos: null }];
  const maxEntry = allEntries.reduce((a, b) => (Math.abs(b.avvik) > Math.abs(a.avvik) ? b : a));
  return {
    sLen,
    lenKlavad: lenKlavad(s),
    diaKlavad: hasMp || (s.operator_toppdia_mm != null && s.operator_toppdia_mm !== 0),
    sLenBad: Math.abs(sLen) > tolLen,
    mpAvvik, hasMp,
    maxAvvik: maxEntry.avvik, maxAvvikPos: maxEntry.pos,
    minPos: hasMp ? mpAvvik[0].position_cm : 0,
    maxPos: hasMp ? mpAvvik[mpAvvik.length - 1].position_cm : 1,
    diagnos: stockDiagnos(mpAvvik),
  };
};

// === Stockarket från Senaste-fliken (en rad ur detalj_kontroll_stock) ===
export type SenasteStock = {
  lenKlavad: boolean; diaKlavad: boolean;
  lenTon: ToneToken; diaTon: ToneToken;
  opLen: string; opDia: string;
  badgeText: (t: ToneToken) => string;
  maskinW: number; maskinH: number; operatorW: number; operatorH: number;
  /** Mätpunkter längs stocken (maskinvärde finns), sorterade på position. */
  mps: NonNullable<DetaljKontrollStock['matpunkter']>;
};
export const senasteStockVarde = (stock: DetaljKontrollStock): SenasteStock => {
  const lenKl = stock.operator_langd_cm != null && stock.operator_langd_cm !== 0;
  const diaKl = stock.operator_toppdia_mm != null && stock.operator_toppdia_mm !== 0;
  return {
    lenKlavad: lenKl, diaKlavad: diaKl,
    // Utan operatörsvärde finns ingen avvikelse och ingen dom — säg "Ej klavad", inte "Inom".
    lenTon: lenKl ? avvikelseTon(stock.langd_avvikelse_cm, 'len') : 'ok',
    diaTon: diaKl ? avvikelseTon(stock.dia_avvikelse_mm, 'dia') : 'ok',
    opLen: lenKl ? `${stock.operator_langd_cm} cm` : '–',
    opDia: diaKl ? `${stock.operator_toppdia_mm} mm` : '–',
    badgeText: (t) => (t === 'ok' ? 'Inom' : t === 'cold' ? 'Under' : 'Utanför'),
    maskinW: Math.max(180, stock.maskin_langd_cm * 0.7),
    maskinH: Math.max(28, stock.maskin_toppdia_mm * 0.22),
    operatorW: Math.max(180, stock.operator_langd_cm * 0.7),
    operatorH: Math.max(28, stock.operator_toppdia_mm * 0.22),
    mps: (stock.matpunkter ?? [])
      .filter((m) => m.diameter_maskin_mm != null)
      .sort((a, b) => a.position_cm - b.position_cm),
  };
};

/** Senaste-fliken: antal stockar utanför tolerans (delad skala: dia ±4 mm, längd ±2 cm) och total längd. */
export const senasteSumma = (stockar: DetaljKontrollStock[]): { totalLen: number; utanfor: number } => ({
  totalLen: stockar.reduce((a, s) => a + s.maskin_langd_cm, 0),
  utanfor: stockar.filter(
    (s) => avvikelseTon(s.dia_avvikelse_mm ?? 0, 'dia') !== 'ok' || avvikelseTon(s.langd_avvikelse_cm ?? 0, 'len') !== 'ok',
  ).length,
});
