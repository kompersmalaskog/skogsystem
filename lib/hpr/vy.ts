/**
 * vy.ts — fördelningsvyns beräkningslager. Tar ett objekts samlade data
 * (ObjektData) och bygger vymodellen: läge (1/2/3), mening i skogsspråk,
 * längdstaplar, guide, matris och trend.
 * Apteringen bedöms på MASKINENS egna kap (Automatic): förarens kortningar
 * vid fel på trädet är rätt aptering, inte en miss (Martin 2026-10-21).
 *
 * ALLT räknas ur logs/matrix_cells (via fordelning.ts) — aldrig ur snapshots.
 * Designkontraktet styr: tystnadsregeln (OK är tyst), m³ är valutan, mening
 * först i arbetets språk, spretigt mönster → ingen mening (hellre tyst).
 */
import type { HprProduct } from "./hpr-parser";
import type { ObjektData } from "./objekt-data";
import {
  computeDistribution,
  computeLengthPiles,
  computeForcedCutGuide,
  type DistributionResult,
  type LengthPile,
  type CellOutcome,
} from "./fordelning";

export type Lage = 1 | 2; // 1 = inom mål (tyst), 2 = avvikelse
const GRADE_TROSKEL = 85; // fördelningsgrad ≥ tröskel + inga färgrutor = läge 1
const GROV_MM = 310;

export interface MatrisRuta {
  diaLower: number;
  lenLower: number;
  deviationM3: number; // avrundat, med tecken
  farga: boolean; // exceeds OCH |m³| ≥ 3
}

export interface ProduktVy {
  productKey: string;
  namn: string | null;
  gradePct: number | null;
  gradeAutomatic: number | null;
  totalVolumeM3: number;
  logCount: number;
  forcedCutSharePct: number;
  /** Volymen maskinen kapade själv (CuttingReason Automatic) — det talen bedöms på. */
  volymAutoM3: number;
  /** Maskinens kap utanför beställt i m³: (100 − gradeAutomatic) % av volymAutoM3. null = ingen grad. */
  utanforM3: number | null;
  headline: string | null; // teknisk rubrik ur fordelning.ts (alla kap)
  /** En mening i skogsspråk om maskinens största miss (null = inget sticker ut). */
  mening: string | null;
  /** Kapat mot beställt per längd — BARA maskinens egna kap. */
  vältor: LengthPile[];
  /** När föraren måste korta (fel på trädet): längden som saknas mest på vältan, alla kap. */
  guide: { klen: string | null; grov: string | null };
  matris: MatrisRuta[];
  färgadeRutor: number;
}

export interface ObjektVy {
  objectKey: string;
  objektNamn: string | null;
  status: "active" | "completed";
  lastFileAt: string | null;
  dagarSedanFil: number | null;
  lage: Lage;
  // Objektkortets bärande siffra = dominerande produktens (störst volym) grad
  gradePct: number | null;
  volymM3: number;
  mening: string | null;
  headline: string | null;
  trend: { from: number; to: number } | null; // ↑ från 84,1 när ≥2 snapshots
  /** Utanför beställt i m³, BARA på maskinens egna kap: (100 − gradeAutomatic) % av
   *  volymen maskinen kapade, summerat över produkter med grad. Förarens kortningar
   *  (fel på trädet) är rätt aptering och räknas inte som miss (Martin 2026-10-21).
   *  null = ingen produkt har grad. */
  utanforM3: number | null;
  /** Volymen utanforM3 räknas mot: maskinens egna kap i produkter med grad. */
  bedomdM3: number;
  produkter: ProduktVy[]; // en per produkt med fördelningsmål, störst volym först
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** m³ formaterad med komma (svensk decimal). */
export function m3(n: number): string {
  return `${round1(n).toString().replace(".", ",")} m³`;
}

/**
 * Genererad läge 2-mening i skogsspråk, härledd ur SAMMA cell som rubriken
 * (headline) — den volymviktat största missen. Så mening och rubrik säger
 * aldrig emot varandra. Ingen färgad cell → null (tyst, men då är objektet
 * inte i läge 2 heller). Meningen namnger den enskilt största missen i
 * arbetets språk (klen/grov, kort/lång, saknas/för mycket) — aldrig
 * procentenheter som huvudbudskap.
 */
function skogsmening(d: DistributionResult): string | null {
  const färg = d.cells.filter((c) => c.exceeds && Math.abs(c.deviationM3) >= 3);
  if (färg.length === 0) return null;

  // Samma urval som fordelning.ts headline: största |dev%| × radvolym.
  const värst = färg.reduce((b, c) =>
    Math.abs(c.deviationPp) * c.rowVolumeM3 > Math.abs(b.deviationPp) * b.rowVolumeM3 ? c : b
  );

  const längder = Array.from(new Set(d.cells.map((c) => c.lenLower))).sort((a, b) => a - b);
  const längdmedian = längder[Math.floor(längder.length / 2)];
  const grov = värst.diaLower >= GROV_MM;
  const lång = värst.lenLower >= längdmedian;
  const saknas = värst.deviationM3 < 0;

  const nyckel = (grov ? "grov" : "klen") + (lång ? "Lång" : "Kort");
  const map: Record<string, [string, string]> = {
    // [saknas-mening, för-mycket-mening]
    klenKort: ["Det saknas klena korta stockar", "Det kapas för många klena korta stockar"],
    klenLång: ["Det saknas klena långa stockar — de klena kapas för kort", "Det kapas för många klena långa stockar"],
    grovKort: ["Det saknas grova korta stockar", "Grovt timmer kapas för kort — för många grova korta stockar"],
    grovLång: ["Det saknas grova långa stockar — grovt timmer kapas för kort", "Det kapas för många grova långa stockar"],
  };
  return map[nyckel][saknas ? 0 : 1];
}

function matris(d: DistributionResult): MatrisRuta[] {
  return d.cells.map((c: CellOutcome) => ({
    diaLower: c.diaLower,
    lenLower: c.lenLower,
    deviationM3: Math.round(c.deviationM3),
    farga: c.exceeds && Math.abs(c.deviationM3) >= 3,
  }));
}

function produktVy(p: HprProduct, data: ObjektData): ProduktVy | null {
  const dist = computeDistribution(p, data.stockar);
  if (!dist) return null;
  const d = dist.total;
  const a = dist.automaticOnly; // maskinens egna kap — det apteringen bedöms på
  const auto = data.stockar.filter((l) => l.cuttingReason === "Automatic");
  const piles = computeLengthPiles(p, auto);
  const guide = computeForcedCutGuide(d); // vad som saknas på vältan, alla kap

  return {
    productKey: p.productKey,
    namn: p.name,
    gradePct: d.gradePct,
    gradeAutomatic: dist.automaticOnly.gradePct,
    totalVolumeM3: d.totalVolumeM3,
    logCount: d.logCount,
    forcedCutSharePct: dist.forcedCutSharePct,
    volymAutoM3: a.totalVolumeM3,
    utanforM3: a.gradePct == null ? null : round1(((100 - a.gradePct) / 100) * a.totalVolumeM3),
    headline: d.headline,
    mening: skogsmening(a),
    vältor: piles,
    guide: {
      // Visa bara när underskottet är minst 3 m³ (samma tröskel som matrisen).
      klen: guide.klen && guide.klen.deficitM3 >= 3
        ? `Klena stockar → ${guide.klen.lenLower} cm` : null,
      grov: guide.grov && guide.grov.deficitM3 >= 3
        ? `Grova stockar → ${guide.grov.lenLower} cm` : null,
    },
    matris: matris(a),
    färgadeRutor: a.cells.filter((c) => c.exceeds && Math.abs(c.deviationM3) >= 3).length,
  };
}

/**
 * Utanför beställt i m³ för ett objekt, på maskinens egna kap: (100 − gradeAutomatic) %
 * av volymen maskinen kapade, rundat per produkt och sedan summerat (summan är summan
 * av delarna). Produkter utan grad räknas inte, varken i talet eller i volymen.
 */
export function utanforBestallt(
  produkter: Pick<ProduktVy, "gradeAutomatic" | "volymAutoM3">[]
): { utanforM3: number | null; bedomdM3: number } {
  const graderade = produkter.filter((p) => p.gradeAutomatic != null);
  if (!graderade.length) return { utanforM3: null, bedomdM3: 0 };
  return {
    utanforM3: round1(graderade.reduce((sum, p) => sum + round1(((100 - p.gradeAutomatic!) / 100) * p.volymAutoM3), 0)),
    bedomdM3: round1(graderade.reduce((sum, p) => sum + p.volymAutoM3, 0)),
  };
}

export interface Snapshot {
  computed_at: string;
  product_key: string;
  grade_total_pct: number | null;
}

/**
 * Bygg objektets vymodell. status/lastFileAt kommer ur harvest_objects,
 * snapshots (revisionsspår) används BARA för trendpilen, aldrig för siffran.
 */
export function byggObjektVy(
  data: ObjektData,
  meta: { objektNamn: string | null; status: "active" | "completed"; lastFileAt: string | null },
  snapshots: Snapshot[],
  nu: Date
): ObjektVy | null {
  const distProdukter = data.produkter.filter((p) => p.distributionAllowed);
  const produkter = distProdukter
    .map((p) => produktVy(p, data))
    .filter((v): v is ProduktVy => v != null)
    .sort((a, b) => b.totalVolumeM3 - a.totalVolumeM3);
  if (produkter.length === 0) return null;

  const dom = produkter[0]; // dominerande produkt = objektkortets bärande siffra
  const anyColored = produkter.some((p) => p.färgadeRutor > 0);
  const grade = dom.gradeAutomatic ?? 0;
  const lage: Lage = grade >= GRADE_TROSKEL && !anyColored ? 1 : 2;

  // Trend: dominerande produktens tidigare snapshot mot senaste.
  const domSnaps = snapshots
    .filter((s) => s.product_key === dom.productKey && s.grade_total_pct != null)
    .sort((a, b) => a.computed_at.localeCompare(b.computed_at));
  let trend: { from: number; to: number } | null = null;
  if (domSnaps.length >= 2) {
    const from = domSnaps[domSnaps.length - 2].grade_total_pct!;
    const to = dom.gradePct ?? from;
    if (Math.abs(to - from) >= 0.1) trend = { from: round1(from), to: round1(to) };
  }

  const dagarSedanFil = meta.lastFileAt
    ? Math.floor((nu.getTime() - new Date(meta.lastFileAt).getTime()) / 86400000)
    : null;

  const { utanforM3, bedomdM3 } = utanforBestallt(produkter);

  return {
    objectKey: data.objectKey,
    objektNamn: meta.objektNamn,
    status: meta.status,
    lastFileAt: meta.lastFileAt,
    dagarSedanFil,
    lage,
    gradePct: dom.gradePct,
    volymM3: produkter.reduce((s, p) => s + p.totalVolumeM3, 0),
    mening: lage === 2 ? dom.mening : null,
    headline: lage === 2 ? dom.headline : null,
    trend,
    utanforM3,
    bedomdM3,
    produkter,
  };
}
