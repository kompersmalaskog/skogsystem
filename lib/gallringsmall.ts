// Låg gallringen rätt? — jämför traktens grundyta och höjd med Vidas gallringsmallar (framtagna med Skogforsk).
// Rena funktioner, inga anrop. Talen kommer ur "Hur mycket står kvar?" (lib/laserKvar.ts): höjden och grundytan före
// ur Skogsstyrelsens laserdata, kvar = före − skördarens uttag.
//
// MALLARNA är avlästa ur Vidas häfte (sidorna 20–21, foto från Martin 2026-10-23) med ögonmått, ca ±0,5 m²/ha och
// ±0,3 m. Per ståndortsindex (T22–T28, G26–G36) och program (svag/hård): punkten där man gallrar (före), punkten
// efter gallringen och slutavverkningen. De streckade linjerna i diagrammen står som `ovre`/`undre`: det övre
// strecket går genom gallringspunkterna ("dags att gallra"), det undre är mallens nedre gräns. Vem som ritat de
// streckade linjerna är inte bekräftat — vyn kallar dem därför bara "mallens gränser".
//
// BONITETEN (ståndortsindex) går inte att hämta automatiskt. Därför jämförs trakten med de mallar vars gallring
// sker vid traktens höjd (±1,5 m); bandet "rätt" är från det hårdaste till det svagaste programmet bland dem.
// Ett mått i bandet är alltså "inom någon av Vidas mallar för den höjden" — mer än så kan inte sägas utan bonitet.

export type Tradslag = 'gran' | 'tall';
export type Program = 'svag' | 'hard';

/** En gallring i ett program: höjd (m), grundyta före och efter (m²/ha). */
export type MallGallring = { h: number; fore: number; efter: number };
export type Mall = {
  si: string;
  tradslag: Tradslag;
  svag: [MallGallring, MallGallring];
  hard: [MallGallring, MallGallring];
  /** Streckade linjerna: [höjd, grundyta]-punkter, stigande höjd. */
  ovre: [number, number][];
  undre: [number, number][];
};

const m = (si: string, tradslag: Tradslag,
  svag: [number, number, number][], hard: [number, number, number][],
  ovre: [number, number][], undre: [number, number][]): Mall => ({
  si, tradslag,
  svag: svag.map(([h, fore, efter]) => ({ h, fore, efter })) as [MallGallring, MallGallring],
  hard: hard.map(([h, fore, efter]) => ({ h, fore, efter })) as [MallGallring, MallGallring],
  ovre, undre,
});

/** Vidas mallar. [höjd, före, efter] för första och andra gallringen per program. */
export const MALLAR: Mall[] = [
  m('T22', 'tall', [[13.6, 21.5, 17], [17.5, 24.5, 19.5]], [[13.6, 21.5, 13.5], [17.4, 22, 15]],
    [[12, 21.5], [16, 24.3], [20, 26.8], [24, 29]], [[12, 15.5], [16, 18], [20, 20], [24, 21.5]]),
  m('T24', 'tall', [[14, 23, 17.5], [18.7, 27.3, 20.5]], [[14, 23, 14.2], [18.5, 23.7, 16.3]],
    [[12, 22.2], [16, 25], [20, 27.8], [24, 30]], [[12, 16.2], [16, 18.6], [20, 20.8], [24, 23]]),
  m('T26', 'tall', [[14, 23.8, 18.2], [18, 25.8, 20]], [[14, 23.8, 14.8], [17.9, 21.3, 15.8]],
    [[12, 23], [16, 26], [20, 28.8], [24.8, 30.8]], [[12, 16.5], [16, 19.3], [20, 21.3], [24.8, 22.5]]),
  m('T28', 'tall', [[14.6, 25, 18.7], [18.8, 27.8, 21.8]], [[14.6, 25, 15.1], [18.7, 23.3, 17]],
    [[12, 23.8], [16, 27], [20, 29.5], [25, 32]], [[12, 17.1], [16, 19.8], [20, 21.8], [25, 24]]),
  m('G26', 'gran', [[13.7, 26, 21], [18.6, 33, 25.5]], [[13.7, 26, 16.8], [17, 25, 19]],
    [[12, 24.5], [16, 29.5], [20, 33], [24.5, 35.5]], [[12, 18.5], [16, 22.5], [20, 25.8], [24.5, 28.8]]),
  m('G28', 'gran', [[14, 26.5, 21], [17.7, 30.5, 24]], [[14, 26.5, 16.8], [17.4, 27, 19]],
    [[12, 24.5], [16, 28.8], [20, 32.5], [24, 35]], [[12, 18.3], [16, 22], [20, 25.5], [24, 28.3]]),
  m('G30', 'gran', [[14, 27.5, 21], [18.1, 32, 24.5]], [[14, 27.5, 17], [18, 28, 19]],
    [[12, 25.3], [16, 29.5], [20, 32.5], [25, 35]], [[12, 19], [16, 22.5], [20, 25.3], [25, 28.3]]),
  m('G32', 'gran', [[14.2, 29.5, 22.5], [18.6, 35, 26]], [[14.2, 29.5, 17.5], [18.4, 31, 20.3]],
    [[12, 26], [16, 30.5], [20, 33.5], [25.8, 36.3]], [[12, 19.5], [16, 23.3], [20, 26.3], [25.8, 30.2]]),
  m('G34', 'gran', [[14.5, 29.8, 22.5], [19.1, 36, 25.5]], [[14.5, 29.8, 17.8], [19, 32, 20]],
    [[12, 26], [16, 30.5], [20, 33.3], [25.5, 35.5]], [[12, 19], [16, 22.5], [20, 25.5], [25.5, 29]]),
  m('G36', 'gran', [[14.6, 31.5, 23.5], [19.3, 40, 27]], [[14.6, 31.5, 18.5], [19.1, 35.2, 21.5]],
    [[12, 26.5], [16, 30.5], [20, 33.5], [25.6, 36.5]], [[12, 20], [16, 23.5], [20, 26.3], [25.6, 30]]),
];

/** Mallar vars gallring ligger inom så många meter från traktens höjd räknas som jämförbara. */
export const HOJD_MARGINAL_M = 1.5;
/** Ett trädslag måste ha minst denna andel av uttaget (volym) för att mallen ska gälla. */
export const MIN_ANDEL_TRADSLAG = 0.6;
/** Gallrat i tid: före får ligga så här mycket under det lägsta "gallra"-värdet / över det högsta. */
export const TIDIGT_MARGINAL = 2;
export const SENT_MARGINAL = 3;
/** Martins tumregel för stammar kvar (st/ha). */
export const TUMREGEL_STAMMAR = { 1: [900, 1200], 2: [500, 600] } as const;

/** Interpolerad grundyta på en streckad linje vid höjden h (klämd till linjens ändar). */
export function linjeVid(punkter: [number, number][], h: number): number {
  if (h <= punkter[0][0]) return punkter[0][1];
  for (let i = 1; i < punkter.length; i++) {
    const [h1, g1] = punkter[i - 1], [h2, g2] = punkter[i];
    if (h <= h2) return g1 + ((g2 - g1) * (h - h1)) / (h2 - h1);
  }
  return punkter[punkter.length - 1][1];
}

/** Trädslaget mallen ska gälla, ur uttagets volym per trädslag. null = blandat (ingen mall gäller). */
export function mallTradslag(tradslag: { namn: string; volym: number }[]): { tradslag: Tradslag; andel: number } | null {
  const total = tradslag.reduce((s, t) => s + t.volym, 0);
  if (total <= 0) return null;
  const summa = (ord: string) => tradslag.filter((t) => t.namn.toLowerCase().includes(ord)).reduce((s, t) => s + t.volym, 0);
  const gran = summa('gran') / total;
  const tall = summa('tall') / total;
  if (gran >= MIN_ANDEL_TRADSLAG) return { tradslag: 'gran', andel: gran };
  if (tall >= MIN_ANDEL_TRADSLAG) return { tradslag: 'tall', andel: tall };
  return null;
}

export type Spann = { mitt: number; lag: number; hog: number };
export type Utfall = 'inom' | 'troligen-inom' | 'hardare' | 'troligen-hardare' | 'svagare' | 'troligen-svagare';
export type Tid = 'i-tid' | 'tidigt' | 'sent';

export type MallSvar =
  | {
      lage: 'ok';
      tradslag: Tradslag;
      gallring: 1 | 2;
      /** De mallar trakten jämförs med, t.ex. ["G28", "G30"]. */
      mallar: string[];
      /** Höjden jämförelsen gjordes vid (mitt). */
      hojd: number;
      /** Rätt grundyta efter gallring enligt Vida: hårdaste–svagaste programmet. */
      efter: { lag: number; hog: number };
      kvar: Spann;
      utfall: Utfall;
      /** Grundytan då mallarna gallrar: hårdaste–svagaste. */
      gallraVid: { lag: number; hog: number };
      fore: Spann;
      tid: Tid;
      /** Mallens streckade gränser vid höjden (lägsta undre, högsta övre bland mallarna). */
      undre: number;
      ovre: number;
    }
  | { lage: 'utanfor'; tradslag: Tradslag; hojd: number; minH: number; maxH: number };

/** Jämför traktens kvar och före med de mallar som gallrar vid traktens höjd. `gallring` = känd (delning), annars
 *  den gallring vars höjd ligger närmast. */
export function bedomMall(ind: {
  tradslag: Tradslag;
  hojd: Spann;
  fore: Spann;
  kvar: Spann;
  gallring?: 1 | 2 | null;
}): MallSvar {
  const mallar = MALLAR.filter((x) => x.tradslag === ind.tradslag);
  const hAlla = mallar.flatMap((x) => [x.svag[0].h, x.svag[1].h, x.hard[0].h, x.hard[1].h]);
  const minH = Math.min(...hAlla), maxH = Math.max(...hAlla);
  const h = ind.hojd.mitt;
  if (h < minH - 2 * HOJD_MARGINAL_M || h > maxH + 2 * HOJD_MARGINAL_M) {
    return { lage: 'utanfor', tradslag: ind.tradslag, hojd: h, minH, maxH };
  }
  const snittH = (k: 0 | 1) => mallar.reduce((s, x) => s + (x.svag[k].h + x.hard[k].h) / 2, 0) / mallar.length;
  const k: 0 | 1 = ind.gallring ? ((ind.gallring - 1) as 0 | 1)
    : Math.abs(h - snittH(0)) <= Math.abs(h - snittH(1)) ? 0 : 1;

  const hMall = (x: Mall) => (x.svag[k].h + x.hard[k].h) / 2;
  let valda = mallar.filter((x) => Math.abs(hMall(x) - h) <= HOJD_MARGINAL_M);
  if (valda.length === 0) {
    const narmast = Math.min(...mallar.map((x) => Math.abs(hMall(x) - h)));
    valda = mallar.filter((x) => Math.abs(hMall(x) - h) === narmast);
  }

  const efter = {
    lag: Math.min(...valda.map((x) => x.hard[k].efter)),
    hog: Math.max(...valda.map((x) => x.svag[k].efter)),
  };
  const gallraVid = {
    lag: Math.min(...valda.map((x) => x.hard[k].fore)),
    hog: Math.max(...valda.map((x) => x.svag[k].fore)),
  };
  return {
    lage: 'ok',
    tradslag: ind.tradslag,
    gallring: (k + 1) as 1 | 2,
    mallar: valda.map((x) => x.si),
    hojd: h,
    efter,
    kvar: ind.kvar,
    utfall: utfallFor(ind.kvar, efter),
    gallraVid,
    fore: ind.fore,
    tid: ind.fore.mitt < gallraVid.lag - TIDIGT_MARGINAL ? 'tidigt'
      : ind.fore.mitt > gallraVid.hog + SENT_MARGINAL ? 'sent' : 'i-tid',
    undre: Math.min(...valda.map((x) => linjeVid(x.undre, h))),
    ovre: Math.max(...valda.map((x) => linjeVid(x.ovre, h))),
  };
}

/** Var kvar ligger mot bandet. "troligen" när spannet (osäkerheten i laserdatan) når över en gräns. */
export function utfallFor(kvar: Spann, band: { lag: number; hog: number }): Utfall {
  if (kvar.mitt < band.lag) return kvar.hog >= band.lag ? 'troligen-hardare' : 'hardare';
  if (kvar.mitt > band.hog) return kvar.lag <= band.hog ? 'troligen-svagare' : 'svagare';
  return kvar.lag < band.lag || kvar.hog > band.hog ? 'troligen-inom' : 'inom';
}

/** Mallarnas namn som ett spann: ["G28", "G30"] → "G28–G30". */
export function mallNamn(si: string[]): string {
  return si.length === 1 ? si[0] : `${si[0]}–${si[si.length - 1]}`;
}
