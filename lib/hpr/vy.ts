/**
 * vy.ts — fördelningsvyns beräkningslager. Tar ett objekts samlade data
 * (ObjektData) och bygger vymodellen: läge (1/2/3), mening i skogsspråk,
 * vältor, ansvarskort, guide, matris och trend.
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
  headline: string | null; // teknisk rubrik ur fordelning.ts
  mening: string | null; // genererad skogsspråksmening (null = spretigt/tyst)
  vältor: LengthPile[];
  vältorTwist: string | null;
  ansvar: { totalt: number; manuella: number; automatiskAndel: number };
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

/** Twistmening: vältorna träffar längderna men diameterfördelningen är fel. */
function twist(d: DistributionResult, piles: LengthPile[]): string | null {
  // Träffar vältorna? (kapat nära beställt på längdnivå) men finns radavvikelser?
  const vältorTräffar = piles.every((p) => {
    const bas = Math.max(p.orderedM3, 1);
    return Math.abs(p.actualM3 - p.orderedM3) / bas <= 0.1;
  });
  const radavvikelse = d.cells.some((c) => c.exceeds && Math.abs(c.deviationM3) >= 3);
  if (!vältorTräffar || !radavvikelse) return null;
  return "Men i långvältorna ligger fel virke: för många klena, för få grova. Vältan ser rätt ut från sidan — sågverket ser den från ändarna.";
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
  const piles = computeLengthPiles(p, data.stockar);
  const guide = computeForcedCutGuide(d);
  const manuella = Math.round((d.logCount * dist.forcedCutSharePct) / 100);

  return {
    productKey: p.productKey,
    namn: p.name,
    gradePct: d.gradePct,
    gradeAutomatic: dist.automaticOnly.gradePct,
    totalVolumeM3: d.totalVolumeM3,
    logCount: d.logCount,
    forcedCutSharePct: dist.forcedCutSharePct,
    headline: d.headline,
    mening: skogsmening(d),
    vältor: piles,
    vältorTwist: twist(d, piles),
    ansvar: {
      totalt: d.logCount,
      manuella,
      automatiskAndel: dist.automaticOnly.gradePct ?? 0,
    },
    guide: {
      // Visa bara när underskottet är minst 3 m³ (samma tröskel som matrisen).
      klen: guide.klen && guide.klen.deficitM3 >= 3
        ? `Klena stockar → sträck mot ${guide.klen.lenLower} cm (saknas ${guide.klen.deficitM3} m³)` : null,
      grov: guide.grov && guide.grov.deficitM3 >= 3
        ? `Grova stockar → sträck mot ${guide.grov.lenLower} cm (saknas ${guide.grov.deficitM3} m³)` : null,
    },
    matris: matris(d),
    färgadeRutor: d.cells.filter((c) => c.exceeds && Math.abs(c.deviationM3) >= 3).length,
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
  const grade = dom.gradePct ?? 0;
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
    produkter,
  };
}
