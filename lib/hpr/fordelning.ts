/**
 * fordelning.ts — utfall mot fördelningsmål ur parsad hpr-data.
 *
 * Modellen (verifierad mot Opti5G-fil):
 *  - Fördelningsmålen är radnormerade: varje diameterklass' mål summerar
 *    till 100 % och avser andel av RADENS volym (DistributionCategory
 *    "Volume of logs") eller antal ("Number of logs").
 *  - Avvikelse = utfall% − mål%, i %-enheter inom raden.
 *  - Grönt-tröskeln är produktens MAXDeviation ur filen — hårdkodas inte.
 *  - Fördelningsgrad = Σ min(utfall, mål) / Σ mål, viktad med radens volym.
 *
 * Två grader beräknas alltid:
 *  - total: alla stockar
 *  - automatic: enbart CuttingReason "Automatic" — vad optimeraren
 *    åstadkom på det virke den fick bestämma över. Skillnaden mot total
 *    är skogens/tvångskapens bidrag till missen.
 */

import { HprProduct, HprLog, classify, pickDiameter } from "./hpr-parser";

export interface CellOutcome {
  diaLower: number;
  lenLower: number;
  targetPct: number;
  actualPct: number;
  deviationPp: number; // procentenheter
  deviationM3: number; // samma avvikelse i kubik: dev% x radvolym / 100
  exceeds: boolean; // |deviation| > maxDeviation och mål > 0
  rowVolumeM3: number; // för volymtröskel i UI:t
}

export interface DistributionResult {
  productKey: string;
  productName: string | null;
  basis: "volume" | "count";
  maxDeviation: number;
  logCount: number;
  totalVolumeM3: number;
  gradePct: number | null; // null om ingen data
  cells: CellOutcome[];
  headline: string | null; // "210 mm: för lite 368 cm (−19)" — största volymviktade miss
}

export interface ProductDistribution {
  total: DistributionResult;
  automaticOnly: DistributionResult;
  forcedCutSharePct: number; // andel stockar med manuellt/tvingat kap
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function compute(
  p: HprProduct,
  logs: HprLog[],
  label: string
): DistributionResult {
  const basis: "volume" | "count" =
    p.distributionCategory === "Volume of logs" ? "volume" : "count";
  const maxDev = p.maxDeviation ?? 4;

  const targets = new Map<string, number>();
  const cellKeys = new Set<string>();
  for (const c of p.cells) {
    const k = `${c.diaLower}:${c.lenLower}`;
    targets.set(k, c.distribution);
    cellKeys.add(k);
  }

  // Summera per cell
  const cellAmount = new Map<string, number>();
  const rowAmount = new Map<number, number>();
  let totalVolume = 0;
  let n = 0;
  for (const log of logs) {
    const dia = pickDiameter(p, log);
    if (dia == null) continue;
    const d = classify(dia, p.diaLimits, p.diaMax);
    const l = classify(log.lengthCm, p.lenLimits, p.lenMax);
    if (d == null || l == null) continue;
    const amount = basis === "volume" ? log.volPriceM3 ?? 0 : 1;
    cellAmount.set(`${d}:${l}`, (cellAmount.get(`${d}:${l}`) ?? 0) + amount);
    rowAmount.set(d, (rowAmount.get(d) ?? 0) + amount);
    totalVolume += log.volPriceM3 ?? 0;
    n++;
  }

  const cells: CellOutcome[] = [];
  let gradeNum = 0;
  let gradeDen = 0;
  let worst: { score: number; text: string } | null = null;

  for (const d of p.diaLimits) {
    const row = rowAmount.get(d) ?? 0;
    if (row === 0) continue;
    for (const l of p.lenLimits) {
      const k = `${d}:${l}`;
      if (!cellKeys.has(k)) continue;
      const target = targets.get(k) ?? 0;
      const actual = (100 * (cellAmount.get(k) ?? 0)) / row;
      const dev = actual - target;
      const exceeds = target > 0 && Math.abs(dev) > maxDev;
      cells.push({
        diaLower: d,
        lenLower: l,
        targetPct: round1(target),
        actualPct: round1(actual),
        deviationPp: round1(dev),
        deviationM3: round1((dev / 100) * row),
        exceeds,
        rowVolumeM3: round1(row),
      });
      gradeNum += (Math.min(actual, target) / 100) * row;
      gradeDen += (target / 100) * row;
      if (exceeds) {
        const score = Math.abs(dev) * row; // volymviktad allvarlighet
        if (!worst || score > worst.score) {
          const dir = dev < 0 ? "för lite" : "för mycket";
          worst = {
            score,
            text: `${d} mm: ${dir} ${l} cm (${dev > 0 ? "+" : ""}${Math.round(dev)})`,
          };
        }
      }
    }
  }

  return {
    productKey: p.productKey,
    productName: p.name ? `${p.name} (${label})` : label,
    basis,
    maxDeviation: maxDev,
    logCount: n,
    totalVolumeM3: round1(totalVolume),
    gradePct: gradeDen > 0 ? round1((100 * gradeNum) / gradeDen) : null,
    cells,
    headline: worst?.text ?? null,
  };
}

/** Beräkna fördelning för en produkt. Returnerar null om produkten saknar fördelningsmål. */
export function computeDistribution(
  p: HprProduct,
  allLogs: HprLog[]
): ProductDistribution | null {
  if (!p.distributionAllowed || p.cells.length === 0) return null;
  const logs = allLogs.filter((l) => l.productKey === p.productKey);
  if (logs.length === 0) return null;
  const auto = logs.filter((l) => l.cuttingReason === "Automatic");
  return {
    total: compute(p, logs, "alla kap"),
    automaticOnly: compute(p, auto, "enbart automatiska kap"),
    forcedCutSharePct: round1((100 * (logs.length - auto.length)) / logs.length),
  };
}

// ---------- Tillägg: kubikvyerna (slutdesignen) ----------

export interface LengthPile {
  lenLower: number;   // cm
  actualM3: number;   // kapat
  orderedM3: number;  // beställt = summan över rader av (mål% × radvolym)
}

/** "Träffar vi längderna?" — vältorna i kubik, aggregerat över alla diametrar. */
export function computeLengthPiles(p: HprProduct, allLogs: HprLog[]): LengthPile[] {
  const logs = allLogs.filter((l) => l.productKey === p.productKey);
  const rowVol = new Map<number, number>();
  const cellVol = new Map<string, number>();
  for (const log of logs) {
    const dia = pickDiameter(p, log);
    if (dia == null) continue;
    const d = classify(dia, p.diaLimits, p.diaMax);
    const l = classify(log.lengthCm, p.lenLimits, p.lenMax);
    if (d == null || l == null) continue;
    const v = log.volPriceM3 ?? 0;
    rowVol.set(d, (rowVol.get(d) ?? 0) + v);
    cellVol.set(`${d}:${l}`, (cellVol.get(`${d}:${l}`) ?? 0) + v);
  }
  const targets = new Map<string, number>();
  for (const c of p.cells) targets.set(`${c.diaLower}:${c.lenLower}`, c.distribution);
  return p.lenLimits
    .map((len) => {
      let actual = 0, ordered = 0;
      for (const d of p.diaLimits) {
        actual += cellVol.get(`${d}:${len}`) ?? 0;
        ordered += ((targets.get(`${d}:${len}`) ?? 0) / 100) * (rowVol.get(d) ?? 0);
      }
      return { lenLower: len, actualM3: Math.round(actual), orderedM3: Math.round(ordered) };
    })
    .filter((pile) => pile.actualM3 > 0 || pile.orderedM3 > 0);
}

export interface ForcedCutGuide {
  klen: { lenLower: number; deficitM3: number } | null;
  grov: { lenLower: number; deficitM3: number } | null;
  grovBoundaryMm: number;
}

/**
 * "Vid fel på trädet" — per grovleksgrupp: längdklassen med störst
 * volymunderskott just nu (deviationM3 < 0 = saknas).
 */
export function computeForcedCutGuide(
  result: DistributionResult,
  grovBoundaryMm = 310
): ForcedCutGuide {
  const pick = (cells: CellOutcome[]) => {
    const byLen = new Map<number, number>();
    for (const c of cells)
      byLen.set(c.lenLower, (byLen.get(c.lenLower) ?? 0) + c.deviationM3);
    let best: { lenLower: number; deficitM3: number } | null = null;
    for (const [len, dev] of byLen)
      if (dev < 0 && (!best || dev < best.deficitM3))
        best = { lenLower: len, deficitM3: Math.round(-dev) };
    return best;
  };
  return {
    klen: pick(result.cells.filter((c) => c.diaLower < grovBoundaryMm)),
    grov: pick(result.cells.filter((c) => c.diaLower >= grovBoundaryMm)),
    grovBoundaryMm,
  };
}
