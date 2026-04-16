import type { LonesystemAdapter, Koppling, SystemTyp } from "./types";
import { FortnoxAdapter } from "./fortnox";
import {
  VismaAdapter, HogiaAdapter, KontekAdapter,
  CronaAdapter, AgdaAdapter, CsvAdapter,
} from "./stubs";

export function getAdapter(koppling: Koppling): LonesystemAdapter {
  switch (koppling.system_typ) {
    case "fortnox": return new FortnoxAdapter(koppling);
    case "visma":   return new VismaAdapter(koppling);
    case "hogia":   return new HogiaAdapter(koppling);
    case "kontek":  return new KontekAdapter(koppling);
    case "crona":   return new CronaAdapter(koppling);
    case "agda":    return new AgdaAdapter(koppling);
    case "csv":     return new CsvAdapter(koppling);
  }
}

export const IMPLEMENTERADE: SystemTyp[] = ["fortnox", "csv"];

export * from "./types";
