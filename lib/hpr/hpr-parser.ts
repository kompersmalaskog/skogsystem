/**
 * hpr-parser.ts — StanForD 2010 (.hpr) → typad data för fördelningsuppföljning.
 *
 * Verifierad mot Ponsse Opti5G 3.1.12, HarvestedProduction v3.6.
 * Enheter enligt filhuvudet: diameter mm, längd cm, volym m3.
 *
 * Körs server-side (Node-runtime, INTE edge — filerna är 20–50 MB och
 * fast-xml-parser bygger hela trädet i minnet).
 */

import { XMLParser } from "fast-xml-parser";

// ---------- Typer ----------

export interface MatrixCell {
  diaLower: number; // mm, klassens undre gräns
  lenLower: number; // cm, klassens undre gräns
  price: number;
  distribution: number; // mål, tolkas enligt product.distributionCategory
  limitation: number;
  buckingCriteria: string | null;
}

export interface HprProduct {
  productKey: string;
  name: string | null;
  group: string | null; // t.ex. "Timmer", "Massa"
  speciesGroupKey: string | null;
  classified: boolean; // false för oklassade produkter (ingen matris)
  diaClassCategory: string | null; // "Top" | "Mid" | ...
  diameterUnderBark: boolean; // true → ub, false → ob
  diaLimits: number[]; // sorterade undre gränser, mm
  diaMax: number | null; // exklusiv övre gräns, mm
  lenLimits: number[]; // sorterade undre gränser, cm
  lenMax: number | null; // exklusiv övre gräns, cm
  distributionAllowed: boolean;
  distributionCategory: string | null; // "Volume of logs" | "Number of logs"
  maxDeviation: number | null; // grönt-tröskel, %-enheter — läses ur filen
  cells: MatrixCell[];
}

export interface HprLog {
  stemKey: string;
  logKey: string;
  productKey: string;
  harvestDate: string | null; // ISO, från stammen
  lengthCm: number;
  diaTopObMm: number | null;
  diaTopUbMm: number | null;
  volPriceM3: number | null; // logVolumeCategory "m3 (price)"
  volSobM3: number | null;
  volSubM3: number | null;
  cuttingReason: string; // "Automatic" | "Other manual" | ...
}

export interface HprValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
  logCount: number;
  logsPerProduct: Record<string, number>;
  unclassifiable: number; // stockar som inte träffar någon matriscell trots klassad produkt
}

export interface HprParseResult {
  fileMeta: {
    creationDate: string | null;
    machineKey: string | null;
    machineOwner: string | null;
    objectKey: string | null;
    objectUserId: string | null;
    objectName: string | null;
  };
  products: HprProduct[];
  logs: HprLog[];
  validation: HprValidation;
}

// ---------- Hjälpare ----------

const asArray = <T>(x: T | T[] | undefined | null): T[] =>
  x == null ? [] : Array.isArray(x) ? x : [x];

const num = (x: unknown): number | null => {
  if (x == null || x === "") return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
};

const text = (x: unknown): string | null => {
  if (x == null) return null;
  if (typeof x === "object" && "#text" in (x as any)) return String((x as any)["#text"]);
  return String(x);
};

/**
 * Klassa ett värde mot sorterade undre gränser. null = utanför matrisen.
 * MAX tolkas INKLUSIVT — verifierat mot Opti5G-data där maskinen
 * automatiskt kapar stockar på exakt LengthClassMAX.
 */
export function classify(
  value: number,
  lowerLimits: number[],
  maxInclusive: number | null
): number | null {
  if (lowerLimits.length === 0) return null;
  if (value < lowerLimits[0]) return null;
  if (maxInclusive != null && value > maxInclusive) return null;
  // binärsökning: sista gräns <= value
  let lo = 0,
    hi = lowerLimits.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lowerLimits[mid] <= value) lo = mid;
    else hi = mid - 1;
  }
  return lowerLimits[lo];
}

/** Vilken uppmätt diameter ska matrisen prissättas mot? Styrs av produktdefinitionen. */
export function pickDiameter(p: HprProduct, log: HprLog): number | null {
  // Ponsse-filerna vi sett använder Top-klassning; utöka här om Mid/Butt dyker upp.
  if (p.diaClassCategory && p.diaClassCategory !== "Top") return null;
  return p.diameterUnderBark ? log.diaTopUbMm : log.diaTopObMm;
}

// ---------- Parser ----------

export function parseHpr(xml: string | Buffer): HprParseResult {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    parseTagValue: false, // vi konverterar själva — undviker att "090" blir 90 etc.
    trimValues: true,
  });
  const doc = parser.parse(xml);
  const root = doc.HarvestedProduction;
  if (!root) throw new Error("Inte en HarvestedProduction-fil (.hpr)");

  const errors: string[] = [];
  const warnings: string[] = [];

  // Enhetskontrakt — allt nedströms antar mm/cm/m3.
  if (root["@_diameterUnit"] !== "mm")
    errors.push(`Oväntad diameterUnit: ${root["@_diameterUnit"]} (förväntade mm)`);
  if (root["@_lengthUnit"] !== "cm")
    errors.push(`Oväntad lengthUnit: ${root["@_lengthUnit"]} (förväntade cm)`);
  if (root["@_volumeUnit"] !== "m3")
    warnings.push(`Oväntad volumeUnit: ${root["@_volumeUnit"]}`);

  const machine = asArray(root.Machine)[0] ?? {};
  const obj = asArray(machine.ObjectDefinition)[0] ?? {};

  const fileMeta = {
    creationDate: text(root.HarvestedProductionHeader?.CreationDate),
    machineKey: text(machine.MachineKey),
    machineOwner: text(machine.MachineOwner?.BusinessName),
    objectKey: text(obj.ObjectKey),
    objectUserId: text(obj.ObjectUserID),
    objectName: text(obj.ObjectName),
  };

  // --- Produkter ---
  const products: HprProduct[] = [];
  for (const pd of asArray(machine.ProductDefinition)) {
    const key = text(pd.ProductKey);
    if (!key) continue;
    const cpd = pd.ClassifiedProductDefinition;
    if (!cpd) {
      products.push({
        productKey: key, name: null, group: null, speciesGroupKey: null,
        classified: false, diaClassCategory: null, diameterUnderBark: false,
        diaLimits: [], diaMax: null, lenLimits: [], lenMax: null,
        distributionAllowed: false, distributionCategory: null, maxDeviation: null,
        cells: [],
      });
      continue;
    }

    const dd = cpd.DiameterDefinition ?? {};
    const dc = dd.DiameterClasses ?? {};
    const diaLimits = asArray(dc.DiameterClass)
      .map((c: any) => num(c.DiameterClassLowerLimit))
      .filter((n): n is number => n != null)
      .sort((a, b) => a - b);
    const ld = cpd.LengthDefinition ?? {};
    const lenLimits = asArray(ld.LengthClass)
      .map((c: any) => num(c.LengthClassLowerLimit))
      .filter((n): n is number => n != null)
      .sort((a, b) => a - b);

    const ldd = cpd.LengthDistributionDefinition ?? {};
    const cells: MatrixCell[] = asArray(cpd.ProductMatrixes?.ProductMatrixItem).map(
      (it: any) => ({
        diaLower: num(it["@_diameterClassLowerLimit"]) ?? NaN,
        lenLower: num(it["@_lengthClassLowerLimit"]) ?? NaN,
        price: num(it.Price) ?? 0,
        distribution: num(it.Distribution) ?? 0,
        limitation: num(it.Limitation) ?? 0,
        buckingCriteria: text(it.BuckingCriteria),
      })
    );

    products.push({
      productKey: key,
      name: text(cpd.ProductName),
      group: text(cpd.ProductGroupName),
      speciesGroupKey: text(cpd.SpeciesGroupKey),
      classified: true,
      diaClassCategory: dc["@_diameterClassCategory"] ?? null,
      diameterUnderBark:
        String(text(dd.DiameterUnderBark) ?? "").toLowerCase() === "true",
      diaLimits,
      diaMax: num(dc.DiameterClassMAX),
      lenLimits,
      lenMax: num(ld.LengthClassMAX),
      distributionAllowed:
        String(text(ldd.DistributionAllowed) ?? "").toLowerCase() === "true",
      distributionCategory: text(ldd.DistributionCategory),
      maxDeviation: num(ldd.MAXDeviation),
      cells,
    });
  }
  const byKey = new Map(products.map((p) => [p.productKey, p]));

  // --- Stockar (Stem → SingleTreeProcessedStem → Log) ---
  const logs: HprLog[] = [];
  let unclassifiable = 0;
  let unclassifiableAuto = 0;
  for (const stem of asArray(machine.Stem)) {
    const stemKey = text(stem.StemKey) ?? "";
    const harvestDate = text(stem.HarvestDate);
    for (const st of asArray(stem.SingleTreeProcessedStem)) {
      for (const lg of asArray(st.Log)) {
        const lm = asArray(lg.LogMeasurement)[0] ?? {};
        const diameters: Record<string, number | null> = {};
        for (const d of asArray(lm.LogDiameter)) {
          const cat = d["@_logDiameterCategory"];
          if (cat) diameters[cat] = num(text(d));
        }
        const vols: Record<string, number | null> = {};
        for (const v of asArray(lg.LogVolume)) {
          const cat = v["@_logVolumeCategory"];
          if (cat) vols[cat] = num(text(v));
        }
        const log: HprLog = {
          stemKey,
          logKey: text(lg.LogKey) ?? "",
          productKey: text(lg.ProductKey) ?? "",
          harvestDate,
          lengthCm: num(text(lm.LogLength)) ?? NaN,
          diaTopObMm: diameters["Top ob"] ?? null,
          diaTopUbMm: diameters["Top ub"] ?? null,
          volPriceM3: vols["m3 (price)"] ?? null,
          volSobM3: vols["m3sob"] ?? null,
          volSubM3: vols["m3sub"] ?? null,
          cuttingReason:
            text(lg.CuttingCategory?.CuttingReason) ?? "Unknown",
        };
        logs.push(log);

        // Validering: klassade produkter ska kunna placera stocken i en cell
        const p = byKey.get(log.productKey);
        if (p?.classified && p.cells.length > 0) {
          const dia = pickDiameter(p, log);
          const d = dia == null ? null : classify(dia, p.diaLimits, p.diaMax);
          const l = classify(log.lengthCm, p.lenLimits, p.lenMax);
          if (d == null || l == null) {
            unclassifiable++;
            if (log.cuttingReason === "Automatic") unclassifiableAuto++;
          }
        }
      }
    }
  }

  const logsPerProduct: Record<string, number> = {};
  for (const l of logs)
    logsPerProduct[l.productKey] = (logsPerProduct[l.productKey] ?? 0) + 1;

  if (logs.length === 0) errors.push("Inga stockar i filen");
  if (unclassifiableAuto > 0)
    errors.push(
      `${unclassifiableAuto} AUTOMATISKT kapade stockar utanför klassgränserna — trolig bugg i klasslogik eller enheter`
    );
  if (unclassifiable - unclassifiableAuto > 0)
    warnings.push(
      `${unclassifiable - unclassifiableAuto} manuellt kapade stockar utanför matrisen (överlängder m.m. — förväntat)`
    );

  return {
    fileMeta,
    products,
    logs,
    validation: {
      ok: errors.length === 0,
      errors,
      warnings,
      logCount: logs.length,
      logsPerProduct,
      unclassifiable,
    },
  };
}
