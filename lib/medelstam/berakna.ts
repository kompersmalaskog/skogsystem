// UTFALL PER MEDELSTAM — räkningen bakom /affarsuppfoljning/medelstam.
//
// Frågan: vid en given medelstam, hur stor del av volymen blir timmer, kubb och
// massaved? Svaret räknas ur utfall_objekt (ett objekt = en rad, förberäknad
// efter import) — aldrig live över detalj_stock.
//
// FÖNSTRET. Objekten inom ±15 % av den inskrivna medelstammen (0,47 → 0,40–0,54; 0,06 → 0,051–0,069).
// Relativt, för båda typerna: gallringens medelstammar ligger tätt (0,03–0,37, medianen 0,06) och ett fast
// ±0,05 rymde 22 av 26 gallringar. Andelen är VOLYMVÄGD: summan av objektens timmervolym delad med summan av
// deras volym (kvot av summor) — inte medianen av deras procenttal. Ett
// objekt på 80 m³ ska inte väga lika som ett på 2 000. Färre än tre objekt i
// fönstret ger inget tal alls (`forFa`), för ett snitt av ett eller två
// objekt är ett objekts utfall, inte ett förväntat utfall.
//
// RÖTAN. Samma definition som stämplingsvyn (rot20: andel stammar ≥ 20 cm vars
// första stock är massaved) och samma förval, medianen över våra
// slutavverkningar. Röta flyttar volym från timmer till kubb/massaved, och
// objekten i ett fönster har olika röta, så fönstrets snitt hänger delvis på
// vilka objekt som råkar ligga där. Därför skattas lutningen över ALLA
// slutavverkningar — andel ~ a + b1·ms + b2·ms² + b3·röta, minsta kvadrat — och
// fönstrets tal flyttas från fönstrets egen rötaandel till den valda:
//
//     andel_vald = fönstrets viktade andel + b3 · (röta_vald − röta_fönster)
//
// Utan objektens rot20 (läsrätt saknas, gallring, för få) görs ingen
// justering och det står på skärmen — talet är då fönstrets rena snitt.
//
// LÖVDOMINERADE OBJEKT. Ett objekt där löv är mer än hälften av volymen (utfall_objekt.lov_pct > 50) följer inte
// medelstammen — arten avgör utfallet, inte stamstorleken — och hålls utanför fönster, spann, röta-lutning och kurva.
// "Vildt timkörning" (65 % löv, 95 % massaved vid 0,28) sänkte annars spannet för barrbestånd från 33–56 till 3–56 %.
// Aldrig tyst: delaUrval returnerar de utelämnade, och skärmen listar dem med namn och löv-andel. Okänd löv-andel
// (lov = null, raden ännu inte omräknad) räknas INTE som lövdominerad.
//
// KURVAN. En stapel per objekt, sorterade på medelstam. `planarUt` svarar på
// om timmerandelen slutar stiga: segmenterad regression (volymvägd) med fri
// lutning över brytpunkten. Svaret är ett av tre — planar / stiger fortfarande
// / oklart — och meningen på skärmen byggs av siffrorna här. Ett tal som inte
// räknats fram skrivs inte.

export const FONSTER_REL = 0.15;      // halva fönstret som andel av vald medelstam, båda typerna
export const MIN_OBJEKT = 3;          // färre i fönstret → inget tal
export const MIN_STAMMAR = 200;       // objekt med färre stammar är med inte alls (samma tröskel som förut)
export const ROT_MAX = 0.6;           // objekt över detta räknas inte in i röta-lutningen (extremer, t.ex. timkörning)
export const ROT_MIN_STAMMAR20 = 150; // rot20 över färre stammar än så är för osäkert för lutningen
export const MIN_ROTOBJEKT = 20;      // färre objekt med röta → ingen lutning skattas
export const LOV_GRANS = 0.5;         // löv över denna andel av volymen → lövdominerat, utanför kalkylen
export const KURV_MIN_OBJEKT = 12;    // färre objekt → ingen brytpunkt söks
export const KURV_MIN_SIDA = 5;       // minst så många objekt på varje sida om brytpunkten
export const KURV_MIN_OVER = 8;       // färre objekt över brytpunkten → kurvan sägs varken planera ut eller stiga

export type Typ = 'Slutavverkning' | 'Gallring';
export const TYPER: Typ[] = ['Slutavverkning', 'Gallring'];

export type Sortiment = 'timmer' | 'kubb' | 'massa' | 'ovrigt';
export const SORTIMENT: Sortiment[] = ['timmer', 'kubb', 'massa', 'ovrigt'];
export const SORTIMENT_NAMN: Record<Sortiment, string> = {
  timmer: 'Timmer', kubb: 'Kubb', massa: 'Massaved', ovrigt: 'Övrigt',
};
/** Rubriktalet per typ: det sortiment som följer medelstammen. Gallringens timmer är under 3 % i 18 av 26 objekt, så där är det massaved som rör sig. */
export const RUBRIKTAL: Record<Typ, Sortiment> = { Slutavverkning: 'timmer', Gallring: 'massa' };

/** Procent av objektets volym (utan hemved). Summerar till 100. */
export type Andelar = Record<Sortiment, number>;
export type Spann = Record<Sortiment, [number, number]>;

export type Objekt = {
  id: string;
  namn: string | null;
  typ: Typ;
  forsta: string | null;
  stammar: number;
  volym: number;            // m³sub utan hemved
  timmer: number;           // m³
  kubb: number;             // m³ — kubb och klentimmer
  massa: number;            // m³
  medelstam: number;        // m³/stam
  rot20: number | null;     // 0–1, bara slutavverkning och bara när läsrätt finns
  stammar20: number | null;
  lov: number | null;       // m³ löv (björk m.fl.) av volym; null = ännu inte räknad
};

// ── Lövdominerade objekt ────────────────────────────────────────────────

/** Mer än LOV_GRANS av volymen är löv. Exakt på gränsen räknas som med. null (ej räknad) räknas som med. */
export function arLovdominerat(o: Pick<Objekt, 'volym' | 'lov'>): boolean {
  return o.lov != null && o.volym > 0 && o.lov / o.volym > LOV_GRANS + 1e-12;
}

/** Delar objekten i dem som är med i kalkylen och dem som är utanför — de senare redovisas, de göms inte. */
export function delaUrval(alla: Objekt[]): { med: Objekt[]; utanfor: Objekt[] } {
  const utanfor = alla.filter(arLovdominerat);
  return { med: alla.filter(o => !arLovdominerat(o)), utanfor };
}

// ── Tolkning och format ─────────────────────────────────────────────────

/** "0,47", "0.47", " 0,5 " → tal. Allt annat, och orimliga värden, → null. */
export function tolkaMedelstam(s: string): number | null {
  const t = s.replace(/\s/g, '').replace(',', '.');
  if (!t || !/^\d*\.?\d*$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0.02 && n <= 3 ? n : null;
}

/** Hela procent som summerar till exakt 100 (största resten). Delarna avrundas först — totalen får aldrig bli 99 eller 101. */
export function heltalTill100(a: Andelar): Andelar {
  const golv = SORTIMENT.map(s => Math.floor(Math.max(0, a[s])));
  let kvar = 100 - golv.reduce((x, y) => x + y, 0);
  const ordning = SORTIMENT.map((s, i) => ({ i, rest: Math.max(0, a[s]) - golv[i] }))
    .sort((x, y) => y.rest - x.rest || x.i - y.i);
  for (let k = 0; kvar > 0 && k < ordning.length; k++, kvar--) golv[ordning[k].i] += 1;
  return Object.fromEntries(SORTIMENT.map((s, i) => [s, golv[i]])) as Andelar;
}

// ── Andelar ─────────────────────────────────────────────────────────────

export function andelarAv(o: Pick<Objekt, 'volym' | 'timmer' | 'kubb' | 'massa'>): Andelar {
  const v = o.volym > 0 ? o.volym : 1;
  const timmer = (100 * o.timmer) / v, kubb = (100 * o.kubb) / v, massa = (100 * o.massa) / v;
  return { timmer, kubb, massa, ovrigt: Math.max(0, 100 - timmer - kubb - massa) };
}

/** Volymvägd: summan av delen delad med summan av volymen. Aldrig ett snitt av procenttal. */
export function viktad(objs: Objekt[]): Andelar | null {
  const v = objs.reduce((s, o) => s + o.volym, 0);
  if (!(v > 0)) return null;
  return andelarAv({
    volym: v,
    timmer: objs.reduce((s, o) => s + o.timmer, 0),
    kubb: objs.reduce((s, o) => s + o.kubb, 0),
    massa: objs.reduce((s, o) => s + o.massa, 0),
  });
}

/** Lägsta och högsta objektsandel per sortiment. Spannet får aldrig döljas. */
export function spannAv(objs: Objekt[]): Spann | null {
  if (!objs.length) return null;
  const per = objs.map(andelarAv);
  return Object.fromEntries(SORTIMENT.map(s => [s, [Math.min(...per.map(a => a[s])), Math.max(...per.map(a => a[s]))]])) as Spann;
}

export function fonsterObjekt(alla: Objekt[], m: number, rel: number = FONSTER_REL): Objekt[] {
  return alla.filter(o => Math.abs(o.medelstam - m) <= rel * m + 1e-9).sort((a, b) => a.medelstam - b.medelstam);
}

// ── Minsta kvadrat ──────────────────────────────────────────────────────

/** Löser A·x = b (Gauss-Jordan med delvis pivotering). null om singulär. */
function los(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((r, i) => r[n] / r[i]);
}

function invers(A: number[][]): number[][] | null {
  const n = A.length;
  const kol = Array.from({ length: n }, (_, j) => los(A, Array.from({ length: n }, (_, i) => (i === j ? 1 : 0))));
  if (kol.some(k => k == null)) return null;
  return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (kol[j] as number[])[i]));
}

/** Viktad minsta kvadrat. Ger koefficienter, deras standardfel och SSE. */
export function vagdMinstaKvadrat(X: number[][], y: number[], w: number[]) {
  const p = X[0].length, n = X.length;
  const XtWX = Array.from({ length: p }, () => new Array<number>(p).fill(0));
  const XtWy = new Array<number>(p).fill(0);
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < p; a++) {
      XtWy[a] += w[i] * X[i][a] * y[i];
      for (let b = 0; b < p; b++) XtWX[a][b] += w[i] * X[i][a] * X[i][b];
    }
  }
  const beta = los(XtWX, XtWy);
  const inv = invers(XtWX);
  if (!beta || !inv) return null;
  let sse = 0;
  for (let i = 0; i < n; i++) {
    const e = y[i] - X[i].reduce((s, x, a) => s + x * beta[a], 0);
    sse += w[i] * e * e;
  }
  const s2 = n > p ? sse / (n - p) : NaN;
  return { beta, se: inv.map((r, i) => Math.sqrt(Math.max(0, s2 * r[i]))), sse, n };
}

// ── Röta ────────────────────────────────────────────────────────────────

/** Procentenheter per 1,0 i rötaandel (alltså per 100 procentenheter röta), per sortiment. */
export type Lutning = { koef: Record<Sortiment, number>; n: number };

/**
 * Lutningen på röta över alla slutavverkningar med rot20: andel ~ 1 + ms + ms² + röta.
 * Obetald minsta kvadrat (varje objekt en observation) — lutningen ska beskriva hur
 * objekt skiljer sig åt, inte låta de största avgöra. Extremer och tunna rot20 utesluts.
 * Övrigt får den lutning som håller summan på 100.
 */
export function rotaLutning(alla: Objekt[]): Lutning | null {
  const R = alla.filter(o => o.typ === 'Slutavverkning' && o.rot20 != null && o.rot20 <= ROT_MAX
    && (o.stammar20 ?? 0) >= ROT_MIN_STAMMAR20);
  if (R.length < MIN_ROTOBJEKT) return null;
  const X = R.map(o => [1, o.medelstam, o.medelstam * o.medelstam, o.rot20 as number]);
  const w = R.map(() => 1);
  const koef: Partial<Record<Sortiment, number>> = {};
  for (const s of ['timmer', 'kubb', 'massa'] as const) {
    const fit = vagdMinstaKvadrat(X, R.map(o => andelarAv(o)[s]), w);
    if (!fit) return null;
    koef[s] = fit.beta[3];
  }
  koef.ovrigt = -((koef.timmer as number) + (koef.kubb as number) + (koef.massa as number));
  return { koef: koef as Record<Sortiment, number>, n: R.length };
}

/** Median av rot20 över objekten (förvalet, som i stämplingsvyn). */
export function rotaMedian(alla: Objekt[]): number | null {
  const v = alla.filter(o => o.typ === 'Slutavverkning' && o.rot20 != null).map(o => o.rot20 as number).sort((a, b) => a - b);
  if (!v.length) return null;
  const h = v.length >> 1;
  return v.length % 2 ? v[h] : (v[h - 1] + v[h]) / 2;
}

// ── Utfallet vid en medelstam ───────────────────────────────────────────

export type Utfall = {
  m: number;
  fran: number; till: number;
  fonster: number;           // halva fönstrets bredd som andel av m (0,15 = ±15 %)
  objekt: Objekt[];          // fönstrets objekt, sorterade på medelstam
  n: number;
  forFa: boolean;            // färre än MIN_OBJEKT — inget tal
  volym: number;             // fönstrets summa, m³
  ra: Andelar | null;        // fönstrets viktade andelar, ojusterade
  andel: Andelar | null;     // det som visas: ra, eller ra flyttad till vald röta
  spann: Spann | null;       // lägsta–högsta objekt, per sortiment
  rotFonster: number | null; // fönstrets rötaandel (volymvägd), om objekten har rot20
  rotVald: number | null;
  rotJusterad: boolean;
};

export function utfall(alla: Objekt[], m: number, rotVald: number | null = null, lutning: Lutning | null = null, rel: number = FONSTER_REL): Utfall {
  const objekt = fonsterObjekt(alla, m, rel);
  const n = objekt.length;
  const bas: Utfall = {
    m, fran: m * (1 - rel), till: m * (1 + rel), fonster: rel, objekt, n, forFa: n < MIN_OBJEKT, volym: objekt.reduce((s, o) => s + o.volym, 0),
    ra: null, andel: null, spann: null, rotFonster: null, rotVald, rotJusterad: false,
  };
  if (bas.forFa) return bas;
  const ra = viktad(objekt);
  if (!ra) return { ...bas, forFa: true };
  const spann = spannAv(objekt);

  // Fönstrets egen röta: volymvägd över de objekt som har rot20. Behövs minst MIN_OBJEKT.
  const medRot = objekt.filter(o => o.rot20 != null);
  const rotFonster = medRot.length >= MIN_OBJEKT
    ? medRot.reduce((s, o) => s + (o.rot20 as number) * o.volym, 0) / medRot.reduce((s, o) => s + o.volym, 0)
    : null;

  let andel = ra, rotJusterad = false;
  if (lutning && rotVald != null && rotFonster != null) {
    const d = rotVald - rotFonster;
    const j = Object.fromEntries(SORTIMENT.map(s => [s, Math.max(0, ra[s] + lutning.koef[s] * d)])) as Andelar;
    const sum = SORTIMENT.reduce((s, k) => s + j[k], 0);
    andel = Object.fromEntries(SORTIMENT.map(s => [s, (100 * j[s]) / sum])) as Andelar;   // håller summan på 100 efter klippet
    rotJusterad = true;
  }
  return { ...bas, ra, andel, spann, rotFonster, rotJusterad };
}

// ── Kurvan ──────────────────────────────────────────────────────────────

export type KurvPunkt = { objekt: Objekt; andel: Andelar };

/** Ett streck per objekt, sorterat på medelstam. */
export function kurva(alla: Objekt[]): KurvPunkt[] {
  return [...alla].sort((a, b) => a.medelstam - b.medelstam || a.id.localeCompare(b.id)).map(o => ({ objekt: o, andel: andelarAv(o) }));
}

export type Platå =
  | { slag: 'planar'; sortiment: Sortiment; brytpunkt: number; nivaOver: Andelar; spannOver: [number, number]; nOver: number; lutningUnder: number }
  | { slag: 'forandras'; sortiment: Sortiment; riktning: 'stiger' | 'sjunker'; brytpunkt: number; lutningOver: number; osakerhet: number; lutningUnder: number; nOver: number }
  | { slag: 'oklart'; sortiment: Sortiment; skal: 'fa-objekt' | 'osakert'; brytpunkt: number | null; nOver: number; lutningOver: number | null; osakerhet: number | null };

/**
 * Var slutar andelen av ett sortiment (timmer för slutavverkning, massaved för gallring) förändras med
 * medelstammen? Segmenterad regression, volymvägd, fri lutning över brytpunkten. Brytpunkten söks i steg
 * om 0,005 mellan 20:e och 85:e percentilen.
 *
 *   planar     — lutningen över har ett konfidensintervall (±2 standardfel) som rymmer noll, är högst hälften
 *                av lutningen under (till beloppet), och lutningen under är tydligt skild från noll.
 *   forandras  — lutningen över är tydligt skild från noll (intervallet rymmer inte noll): kurvan stiger
 *                eller sjunker fortfarande.
 *   oklart     — allt annat: för få objekt (färre än KURV_MIN_OVER över brytpunkten), eller så osäkert att
 *                man inte kan säga det ena eller andra.
 *
 * Lutningarna redovisas som procentenheter per 0,1 m³/stam.
 */
export function planarUt(alla: Objekt[], sortiment: Sortiment = 'timmer'): Platå {
  const P = alla.filter(o => o.volym > 0).sort((a, b) => a.medelstam - b.medelstam);
  const fa = (brytpunkt: number | null, nOver: number, lutningOver: number | null, osakerhet: number | null): Platå =>
    ({ slag: 'oklart', sortiment, skal: 'fa-objekt', brytpunkt, nOver, lutningOver, osakerhet });
  if (P.length < KURV_MIN_OBJEKT) return fa(null, 0, null, null);
  const ms = P.map(o => o.medelstam), y = P.map(o => andelarAv(o)[sortiment]), w = P.map(o => o.volym);
  const pct = (q: number) => ms[Math.min(ms.length - 1, Math.floor(q * (ms.length - 1)))];
  type Passning = { b: number; sse: number; beta: number[]; se: number[] };
  let best: Passning | null = null;
  for (let b = pct(0.2); b <= pct(0.85) + 1e-9; b += 0.005) {
    const over = ms.filter(x => x > b).length, under = ms.length - over;
    if (over < KURV_MIN_SIDA || under < KURV_MIN_SIDA) continue;
    const fit = vagdMinstaKvadrat(ms.map(x => [1, Math.min(x, b), Math.max(x - b, 0)]), y, w);
    if (fit && (!best || fit.sse < best.sse)) best = { b, sse: fit.sse, beta: fit.beta, se: fit.se };
  }
  if (!best) return fa(null, 0, null, null);

  const over = P.filter(o => o.medelstam > best!.b);
  const lutU = best.beta[1] * 0.1, seU = best.se[1] * 0.1;
  const lutO = best.beta[2] * 0.1, seO = best.se[2] * 0.1;
  const brytpunkt = Math.round(best.b * 100) / 100;
  if (over.length < KURV_MIN_OVER) return fa(brytpunkt, over.length, lutO, 2 * seO);
  if (Math.abs(lutO) - 2 * seO > 0) {
    return { slag: 'forandras', sortiment, riktning: lutO > 0 ? 'stiger' : 'sjunker', brytpunkt, lutningOver: lutO, osakerhet: 2 * seO, lutningUnder: lutU, nOver: over.length };
  }
  if (Math.abs(lutO) <= 0.5 * Math.abs(lutU) && Math.abs(lutU) - 2 * seU > 0) {
    const niva = viktad(over) as Andelar;
    const sp = spannAv(over) as Spann;
    return { slag: 'planar', sortiment, brytpunkt, nivaOver: niva, spannOver: sp[sortiment], nOver: over.length, lutningUnder: lutU };
  }
  return { slag: 'oklart', sortiment, skal: 'osakert', brytpunkt, nOver: over.length, lutningOver: lutO, osakerhet: 2 * seO };
}
