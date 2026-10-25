// Mutationskontroll för justeringsförslagen och kortet "Gör så här" (2026-10-25): varje regel ändras, EN i taget, och ett test ska bli rött.
// Motorn: scripts/mutationsmotor.mjs. Kör:  node scripts/mutationskontroll-forslag.mjs   (EN tung körning åt gången)
import { kor } from "./mutationsmotor.mjs";

const F = "lib/kalibrering/forslag.ts";
const K = "lib/kalibrering/forslagKort.ts";
const M = "lib/kalibrering/forslagMarkorer.ts";
const G = "lib/kalibrering/grovlek.ts";
const H = "lib/kalibrering/historik.ts";
const R = "app/api/kalibrering/forslag/route.ts";
const C = "components/kalibrering/GorSaHar.tsx";
const A = "lib/kalibrering/atgarder.ts";

const TESTER = [
  "lib/kalibrering/historik","lib/kalibrering/forslag", "lib/kalibrering/grovlek.test.ts", "lib/kalibrering/atgarder.test.ts", "app/api/kalibrering/forslag", "components/kalibrering/GorSaHar.render.test.tsx"];

const mutationer = [
  // ── reglerna per punkt ──
  ["minst 10 stammar blir 9", "MIN_STAMMAR: 10,", "MIN_STAMMAR: 9,", F],
  ["minst 10 stammar blir 11", "MIN_STAMMAR: 10,", "MIN_STAMMAR: 11,", F],
  ["toleransen 1,5 blir 2", "TOLERANS_MM: 1.5,", "TOLERANS_MM: 2,", F],
  ["toleransen 1,5 blir 1", "TOLERANS_MM: 1.5,", "TOLERANS_MM: 1,", F],
  ["spridningsgränsen 4,5 blir 5,5", "SPRIDNING_MM: 4.5,", "SPRIDNING_MM: 5.5,", F],
  ["spridningsgränsen 4,5 blir 3,5", "SPRIDNING_MM: 4.5,", "SPRIDNING_MM: 3.5,", F],
  ["gränsen för Låt vara är < i stället för ≤", "Math.abs(st.snitt) <= FORSLAG.TOLERANS_MM", "Math.abs(st.snitt) < FORSLAG.TOLERANS_MM", F],
  ["samma sida om noll godtar att intervallet rör noll", "const sammaSida = st.lo > 0 || st.hi < 0;", "const sammaSida = st.lo >= 0 || st.hi <= 0;", F],
  ["osäkerheten ignoreras (alltid samma sida)", "const sammaSida = st.lo > 0 || st.hi < 0;", "const sammaSida = true;", F],
  ["Klava mer och Justera byter plats", "n < FORSLAG.MIN_STAMMAR ? 'klava' : 'justera'", "n < FORSLAG.MIN_STAMMAR ? 'justera' : 'klava'", F],
  ["förslaget avrundas uppåt (2,6 → 3) i stället för nedåt", "export const nedatMm = (x: number): number => Math.trunc(x);", "export const nedatMm = (x: number): number => Math.round(x);", F],
  ["förslagets tecken är fel (sänk blir höj)", "const andring = besked === 'justera' && spak === 'kurva' ? -nedatMm(st.snitt) : null;", "const andring = besked === 'justera' && spak === 'kurva' ? nedatMm(st.snitt) : null;", F],
  ["stor spridning bedöms också under 10 stammar", "const stor = n >= FORSLAG.MIN_STAMMAR && st.sd != null && st.sd > FORSLAG.SPRIDNING_MM;", "const stor = st.sd != null && st.sd > FORSLAG.SPRIDNING_MM;", F],
  ["Båda (trycket först) blir bara kurvan", "besked === 'justera' ? (stor ? 'bada' : 'kurva') : stor ? 'tryck' : null", "besked === 'justera' ? 'kurva' : stor ? 'tryck' : null", F],
  ["stor spridning utan stort fel ger ingen tryckåtgärd", "besked === 'justera' ? (stor ? 'bada' : 'kurva') : stor ? 'tryck' : null", "besked === 'justera' ? (stor ? 'bada' : 'kurva') : null", F],
  ["t-värdet är 1,96 för alla antal (för litet för få stammar)", "  if (df < 1) return Infinity;\n  if (df >= 120) return 1.96;", "  if (df < 1) return Infinity;\n  return 1.96;", F],
  ["en stam räknas som flera (osäkerheten räknas på mätpunkter)", "const b = beskedFor(valda.map(s => s.summa / s.n));", "const b = beskedFor(valda.flatMap(s => Array.from({ length: s.n }, () => s.summa / s.n)));", F],
  ["stammens medelfel räknas som summa (inte medel)", "const b = beskedFor(valda.map(s => s.summa / s.n));", "const b = beskedFor(valda.map(s => s.summa));", F],
  ["stammar efter idag räknas", "s.dag >= fran && s.dag <= idag)", "s.dag >= fran)", F],
  ["fönstret har inget tak bakåt", "const tak = new Date(new Date(`${idag}T00:00:00Z`).getTime() - FORSLAG.FONSTER_MAX_DAGAR * 86400000).toISOString().slice(0, 10);", "const tak = '0000-00-00';", F],
  ["en ändring gäller bara första trädslaget (alla trädslag)", "andringar.filter(a => galler(a, tradslag, klass))", "andringar", F],
  ["ändringar ignoreras helt (ingen fönsterstart)", "andringar.filter(a => galler(a, tradslag, klass))", "[]", F],
  // ── fysisk stam ──
  ["stamnumret i stället för skördetiden som stamidentitet", "export const stamNyckel = (s: Pick<StockRad, 'harvest_date' | 'filnamn' | 'stam_nummer'>): string => s.harvest_date ?? `${s.filnamn}|${s.stam_nummer}`;", "export const stamNyckel = (s: Pick<StockRad, 'harvest_date' | 'filnamn' | 'stam_nummer'>): string => `${s.filnamn}|${s.stam_nummer}`;", G],
  ["dubbletter av samma fysiska stock räknas flera gånger", "const stock = new Map(fysiskaStockar(stockar).map(s => [s.id, s]));\n  const rader = new Map<string, ForslagStam>();", "const stock = new Map(stockar.map(s => [s.id, s]));\n  const rader = new Map<string, ForslagStam>();", F],
  // ── markörer ──
  ["tryck känns inte igen i förarens text", "if (/tryck/i.test(t)) return { slag: 'tryck' };", "", M],
  ["en kalibrering samma dag räknas efter (borde vara före)", "export const forstaDagEfter = (a: Andring): string => (a.samtidig ? a.datum : plusDagar(a.datum, 1));", "export const forstaDagEfter = (a: Andring): string => a.datum;", M],
  ["en åtgärd i appen samma dag räknas före (borde vara efter)", "export const forstaDagEfter = (a: Andring): string => (a.samtidig ? a.datum : plusDagar(a.datum, 1));", "export const forstaDagEfter = (a: Andring): string => plusDagar(a.datum, 1);", M],
  ["en kalibrering med värde 0 räknas som ändring", "rad.dia_justering_mm != null && rad.dia_justering_mm !== 0", "rad.dia_justering_mm != null", H],
  ["en omkalibrering flyttar inte fönstret", "if (slag === 'omkalibrering') ut.push({ datum: dag(h.datum), slag: 'omkalibrering', tradslag: null, klass: null, samtidig: false });", "if (slag === 'omkalibrering') { /* ignoreras */ }", M],
  ["en tryckändring gäller bara första trädslaget", "ut.push({ datum: dag(a.datum), slag: t.slag, tradslag: null, klass: null, samtidig: true });", "ut.push({ datum: dag(a.datum), slag: t.slag, tradslag: 'Gran', klass: null, samtidig: true });", M],
  ["kurvmarkörens minustecken läses som plus", "const mm = Number(k[3].replace('−', '-'));", "const mm = Number(k[3].replace('−', ''));", M],
  // ── kortet ──
  ["grepptröskeln 6 blir 3", "export const GREPP_STEG_PP = 6;", "export const GREPP_STEG_PP = 3;", K],
  ["grepptröskeln 6 blir 10", "export const GREPP_STEG_PP = 6;", "export const GREPP_STEG_PP = 10;", K],
  ["greppet jämförs mot en månad som inte är förra månaden", "rutnat.perioder[i - 1] !== stegManad(rutnat.perioder[i], -1)", "false", K],
  ["en gammal greppökning räknas", "if (rutnat.perioder[i] < nyast) continue;", "", K],
  ["en minskning av greppet räknas som ökning", "const pp = nu.pct - forra.pct;", "const pp = Math.abs(nu.pct - forra.pct);", K],
  ["Kolla-steget kvitteras av ett svar FÖRE orsaken", "const svaratEfter = (datum: string) => kollat.some(k => k >= datum);", "const svaratEfter = (datum: string) => kollat.length > 0;", K],
  ["Kolla visas aldrig", "if (greppAtt.length > 0 || spridning.length > 0) steg.push({ slag: 'kolla', id: 'kolla', grepp: greppAtt, spridning });", "", K],
  ["tryckstegets räkning slutar inte (kurvan visas efter trycket)", "    steg.push({ slag: 'tryck', id: 'tryck', punkter: tryckPunkter });\n    return { lage: 'steg', steg, vantaTill: null };", "    steg.push({ slag: 'tryck', id: 'tryck', punkter: tryckPunkter });", K],
  ["veckans väntan är inte 7 dagar", "VECKA_DAGAR: 7,", "VECKA_DAGAR: 1,", F],
  ["veckans väntan släpper igenom kurvan", "if (!veckaGar) for (const [tradslag, lista] of kurvor)", "for (const [tradslag, lista] of kurvor)", K],
  ["Klava visar fel punkt (minst stammar i stället för flest)", "if (!nu || p.stammar > nu.stammar) perArt.set(p.tradslag, p);", "if (!nu || p.stammar < nu.stammar) perArt.set(p.tradslag, p);", K],
  ["Ändra-steget säger Höj när maskinen mäter för grovt", "`${alla[0] < 0 ? 'Sänk' : 'Höj'} ${art}", "`${alla[0] < 0 ? 'Höj' : 'Sänk'} ${art}", K],
  // ── rutten ──
  ["rutten kräver ingen inloggning", "const vakt = await kravInloggad();\n  if (!vakt.ok) return vakt.res;\n", "", R],
  ["kolla-svar läses inte (Klart tar inte bort steget)", "return s === \"kontroll\" || s === \"byte\";", "return s === \"byte\";", R],
  ["historiken ignoreras", "historik: (hist.data ?? []) as unknown as HistorikMarkorRad[],", "historik: [],", R],
  // ── kortets knappar ──
  ["Klart sparar bytet", "case 'kolla': return [svar === 'bytte' ? BYTE_TEXT : KONTROLL_TEXT];", "case 'kolla': return [BYTE_TEXT];", C],
  ["Jag har ändrat sparar inget på Ändra-steget", "case 'kurva': return steg.punkter.map(p => kurvaText(p.tradslag, p.punkt, p.andringMm));", "case 'kurva': return [];", C],
  ["tryckknappen sparar kurvmarkörer", "case 'tryck': return [TRYCK_TEXT];", "case 'tryck': return [];", C],
  // ── samma greppsignal på flera maskiner ──
  ["en annan månad räknas som samma", "x.tradslag === g.tradslag && x.manad === g.manad", "x.tradslag === g.tradslag", K],
  ["ett annat trädslag räknas som samma", "x.tradslag === g.tradslag && x.manad === g.manad", "x.manad === g.manad", K],
  ["\"Samma på\" visas utan att någon annan har det", "const med = grepp.filter(g => (g.samma?.length ?? 0) > 0);", "const med = grepp;", K],
  ["orsaken i raden saknas", "const ORSAK = 'troligen kyla och bark, inte din maskin.';", "const ORSAK = '';", K],
  ["raden kommer inte med i kortet", "...(samma ? [samma] : [])", "", K],
  ["rutten läser inte de andra skördarna", "      grepp = markeraSamma(grepp, andra);", "", R],
  ["rutten räknar den egna maskinen som en annan", "if (m.maskin_id === maskinId) continue;", "", R],
  // ── Åtgärder: kalibreringar bryter inte efter-perioden för förarens åtgärd ──
  ["en kalibrering avgränsar förarens åtgärds efter-period", "(m.kalla === 'kalibrering' || x.kalla !== 'kalibrering')", "true", A],
];

kor({ filer: [...new Set(mutationer.map(m => m[3]))], tester: TESTER, standardFil: F, mutationer });
