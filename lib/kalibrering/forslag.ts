/**
 * JUSTERINGSFÖRSLAG — per trädslag och punkt på diameterkurvan (100, 150, 200, 250, 300+): vad säger klavningen, och vad ska göras?
 *
 * Appen föreslår, föraren godkänner, och appen skriver aldrig till maskinen. HQC-filerna innehåller inte maskinens kurva (bara en justeringspunkt per
 * block), så ett förslag är alltid en ÄNDRING från maskinens nuvarande läge: "sänk 3 mm vid 200", aldrig "sätt 197".
 *
 * ALLT RÄKNAS MED STAMMAR SOM ENHET. En stam ger ETT värde till sin punkt (medelfelet maskin − klave över stammens mätpunkter i grovleken); punkten är
 * medelvärdet över stammarna och osäkerheten räknas på stammarnas spridning (t-intervall, 95 %). Mätpunkterna på en stam hänger ihop, så 40 punkter
 * på en lång stam är inte 40 oberoende mätningar. Stammen känns igen på fysisk identitet som i Per grovlek (skördetiden, dubbletter bort — `fysiskaStockar`),
 * så förslagen stämmer även om dubblettrensningen i databasen inte är komplett.
 *
 * BESKED PER PUNKT (`punktBesked`):
 *   Låt vara = medelfelet är inom ±1,5 mm.
 *   Vänta    = felet är större men osäkerheten korsar noll (för få eller för spridda stammar för att veta åt vilket håll).
 *   Klava mer = hela osäkerheten på samma sida om noll, men färre än 10 stammar.
 *   Justera  = minst 10 stammar, hela osäkerheten på samma sida om noll, och felet större än 1,5 mm.
 *
 * KURVA ELLER TRYCK (`spak`): med minst 10 stammar visar spridningen MELLAN stammar vad som är fel.
 *   Fel åt ett håll med normal spridning → kurvan ("Justera kurvan").
 *   Stor spridning (över 4,5 mm) → trycket ("Höj trycket"): kurvan kan inte rätta ett fel som skiftar från stam till stam.
 *   Båda → trycket FÖRST. En tryckändring flyttar kurvan (juli 2026), så en kalibrering före tryckändringen blir fel efteråt.
 *
 * Förslaget är felet avrundat NEDÅT till hela mm (2,6 → 2): hellre ett steg för lite än att gå förbi.
 *
 * Allt här är rent — inga anrop, ingen färg. Rutten (api/kalibrering/forslag) hämtar underlaget och kortet (forslagKort) sätter ihop stegen.
 */
import type { DiaPunkt } from './diameterpunkter';
import { stamNyckel, fysiskaStockar, grovlekKlass, GROVLEK_KLASSER, type GrovlekKlass, type StockRad } from './grovlek';
import { PUNKTER, galler, forstaDagEfter, punktAv, type Andring } from './forslagMarkorer';
import { tradslagLabel } from '@/lib/tradslag';

export const FORSLAG = {
  /** Så många stammar behövs i en punkt för att ett Justera ska gälla (färre = Klava mer). */
  MIN_STAMMAR: 10,
  /** Fel inom så här många mm räknas som rätt: Låt vara. */
  TOLERANS_MM: 1.5,
  /** Spridning mellan stammar över så här många mm = trycket, inte kurvan. */
  SPRIDNING_MM: 4.5,
  /** Veckan efter en tryckändring görs ingen kalibrering. */
  VECKA_DAGAR: 7,
  /** Fönstret börjar vid senaste ändringen, men aldrig längre bakåt än så här (äldre klavningar säger inget om maskinen idag). */
  FONSTER_MAX_DAGAR: 120,
} as const;

/** En stam i en grovlek: medelfelet maskin − klave över stammens mätpunkter i klassen, och dagen kontrollen gjordes. */
export type ForslagStam = { tradslag: string; klass: GrovlekKlass; stam: string; dag: string; n: number; summa: number };

type Stock = StockRad & { filnamn: string };

/**
 * Stammarna per grovlek: en rad per fysisk stam och grovlek (operatörens diameter, som i Per grovlek). Saknar kontrollen trädslag hamnar stammen utan rad —
 * vi gissar inte. `dag` är den tidigaste kontrolldagen stammens stockar finns i.
 */
export function byggForslagStammar(args: { stockar: Stock[]; punkter: DiaPunkt[]; filTradslag: Map<string, string> }): ForslagStam[] {
  const { stockar, punkter, filTradslag } = args;
  const stock = new Map(fysiskaStockar(stockar).map(s => [s.id, s]));
  const rader = new Map<string, ForslagStam>();
  for (const p of punkter) {
    const s = stock.get(p.stockId);
    if (!s) continue;
    const tr = filTradslag.get(s.filnamn);
    if (!tr) continue;
    const klass = grovlekKlass(p.operator_mm);
    const tradslag = tradslagLabel(tr);
    const stam = stamNyckel(s);
    const nyckel = `${tradslag}|${klass}|${stam}`;
    const dag = String(s.kontroll_datum).slice(0, 10);
    let r = rader.get(nyckel);
    if (!r) { r = { tradslag, klass, stam, dag, n: 0, summa: 0 }; rader.set(nyckel, r); }
    if (dag < r.dag) r.dag = dag;
    r.n++; r.summa += p.avvik;
  }
  return Array.from(rader.values());
}

// === Statistik med stammar som enhet ===
/** Tvåsidigt 95 %-t-värde per frihetsgrad. Mellanliggande grader avrundas NEDÅT till närmaste tabellpost (större t = mer försiktigt). */
const T95: [number, number][] = [
  [1, 12.706], [2, 4.303], [3, 3.182], [4, 2.776], [5, 2.571], [6, 2.447], [7, 2.365], [8, 2.306], [9, 2.262], [10, 2.228],
  [11, 2.201], [12, 2.179], [13, 2.16], [14, 2.145], [15, 2.131], [16, 2.12], [17, 2.11], [18, 2.101], [19, 2.093], [20, 2.086],
  [25, 2.06], [30, 2.042], [40, 2.021], [60, 2.0], [120, 1.98],
];
export const t95 = (df: number): number => {
  if (df < 1) return Infinity;
  if (df >= 120) return 1.96;
  let t = T95[0][1];
  for (const [d, v] of T95) { if (df >= d) t = v; else break; }
  return t;
};

export type Osakerhet = { snitt: number; sd: number | null; lo: number; hi: number };

/** Medelvärde, spridning mellan stammarna och 95 %-intervallet för medelvärdet. Under två stammar finns ingen spridning och intervallet är oändligt. */
export function stamStatistik(medelfel: number[]): Osakerhet | null {
  const n = medelfel.length;
  if (n === 0) return null;
  const snitt = medelfel.reduce((a, b) => a + b, 0) / n;
  if (n < 2) return { snitt, sd: null, lo: -Infinity, hi: Infinity };
  const sd = Math.sqrt(medelfel.reduce((a, x) => a + (x - snitt) ** 2, 0) / (n - 1));
  const halv = t95(n - 1) * (sd / Math.sqrt(n));
  return { snitt, sd, lo: snitt - halv, hi: snitt + halv };
}

// === Besked per punkt ===
export type Besked = 'justera' | 'klava' | 'vanta' | 'latavara';
/** Vad som är fel: kurvan, trycket, eller båda (trycket först). null = inget är fel. */
export type Spak = 'kurva' | 'tryck' | 'bada' | null;

export type PunktBesked = {
  tradslag: string;
  klass: GrovlekKlass;
  /** 100, 150, 200, 250 eller 300+ — som förarna läser kurvan. */
  punkt: string;
  stammar: number;
  /** Medelfel maskin − klave i mm. Positivt = maskinen mäter grövre än klaven. */
  snittMm: number;
  /** Spridning mellan stammarna i mm; null under två stammar. */
  sdMm: number | null;
  /** 95 %-intervall för medelfelet; null = obegränsat (under två stammar finns ingen spridning, och JSON har inget oändligt). */
  lo: number | null;
  hi: number | null;
  besked: Besked;
  spak: Spak;
  /** Ändringen av kurvan i mm (−3 = sänk 3), avrundad nedåt mot noll. null om besked inte är Justera, eller trycket ska först. */
  andringMm: number | null;
  /** Hur många stammar som fattas för 10. 0 när det finns nog. */
  saknas: number;
  /** Första dag vars stammar räknas (efter senaste ändringen som gäller punkten). */
  fonsterFran: string;
};

/** Avrundat nedåt till hela mm, bort från "för mycket": 2,6 → 2, −2,6 → −2. */
export const nedatMm = (x: number): number => Math.trunc(x);

/** Beskedet för en punkt ur stammarnas medelfel. Rent: se filens huvud för reglerna. */
export function beskedFor(medelfel: number[]): Pick<PunktBesked, 'stammar' | 'snittMm' | 'sdMm' | 'lo' | 'hi' | 'besked' | 'spak' | 'andringMm' | 'saknas'> | null {
  const st = stamStatistik(medelfel);
  if (!st) return null;
  const n = medelfel.length;
  const stor = n >= FORSLAG.MIN_STAMMAR && st.sd != null && st.sd > FORSLAG.SPRIDNING_MM;
  const sammaSida = st.lo > 0 || st.hi < 0;
  const inom = Math.abs(st.snitt) <= FORSLAG.TOLERANS_MM;
  const besked: Besked = inom ? 'latavara' : !sammaSida ? 'vanta' : n < FORSLAG.MIN_STAMMAR ? 'klava' : 'justera';
  // Stor spridning är trycket, oavsett om felet i medel är stort (en punkt kan vara rätt i snitt och ändå slira från stam till stam).
  const spak: Spak = besked === 'justera' ? (stor ? 'bada' : 'kurva') : stor ? 'tryck' : null;
  const andring = besked === 'justera' && spak === 'kurva' ? -nedatMm(st.snitt) : null;
  return {
    stammar: n, snittMm: st.snitt, sdMm: st.sd, lo: Number.isFinite(st.lo) ? st.lo : null, hi: Number.isFinite(st.hi) ? st.hi : null, besked, spak,
    andringMm: andring === 0 ? null : andring, saknas: Math.max(FORSLAG.MIN_STAMMAR - n, 0),
  };
}

/**
 * Alla punkter för alla trädslag med underlag. För varje (trädslag, grovlek) räknas bara stammar klavade efter senaste ändring som gäller den punkten
 * (`andringar`) och högst `FONSTER_MAX_DAGAR` bakåt från `idag`. Trädslag × grovlek utan en enda stam får ingen rad.
 */
export function punktBesked(args: { stammar: ForslagStam[]; andringar: Andring[]; idag: string }): PunktBesked[] {
  const { stammar, andringar, idag } = args;
  const tak = new Date(new Date(`${idag}T00:00:00Z`).getTime() - FORSLAG.FONSTER_MAX_DAGAR * 86400000).toISOString().slice(0, 10);
  const trädslag = Array.from(new Set(stammar.map(s => s.tradslag)));
  const ut: PunktBesked[] = [];
  for (const tradslag of trädslag) {
    for (const klass of GROVLEK_KLASSER) {
      const fran = andringar.filter(a => galler(a, tradslag, klass)).reduce((m, a) => (forstaDagEfter(a) > m ? forstaDagEfter(a) : m), tak);
      const valda = stammar.filter(s => s.tradslag === tradslag && s.klass === klass && s.dag >= fran && s.dag <= idag);
      const b = beskedFor(valda.map(s => s.summa / s.n));
      if (!b) continue;
      ut.push({ tradslag, klass, punkt: punktAv(klass), fonsterFran: fran, ...b });
    }
  }
  const rang = (t: string) => { const i = ['Gran', 'Tall', 'Björk'].indexOf(t); return i < 0 ? 9 : i; };
  return ut.sort((a, b) => rang(a.tradslag) - rang(b.tradslag) || a.tradslag.localeCompare(b.tradslag) || GROVLEK_KLASSER.indexOf(a.klass) - GROVLEK_KLASSER.indexOf(b.klass));
}

/** Grovleken i mm som den läses: "250–299 mm", "under 150 mm", "300 mm och grövre". */
export const klassIOrd = (klass: GrovlekKlass): string => {
  const p = PUNKTER.find(x => x.klass === klass)!;
  return p.till == null ? `${p.fran} mm och grövre` : p.fran === 0 ? `under ${p.till + 1} mm` : `${p.fran}–${p.till} mm`;
};
