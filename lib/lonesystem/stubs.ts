/**
 * Stub-adaptrar för lönesystem som inte är implementerade ännu.
 * Visma/Hogia/Kontek/Crona/Agda är placeholders.
 * CSV-export hanteras direkt i UI (Löneunderlag-fliken).
 */

import { SYSTEM_LABELS, type SystemTyp } from "./types";

export class NotImplementedError extends Error {
  constructor(systemTyp: SystemTyp, metod: string) {
    super(`${SYSTEM_LABELS[systemTyp]}: ${metod} är inte implementerat ännu.`);
    this.name = "NotImplementedError";
  }
}
