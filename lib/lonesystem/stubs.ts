/**
 * Stub-adaptrar för lönesystem som inte är implementerade ännu.
 * Kasta NotImplementedError så UI:t kan visa ett tydligt meddelande.
 */

import type { LonesystemAdapter, Koppling, SystemTyp } from "./types";
import { NotImplementedError, SYSTEM_LABELS } from "./types";

class StubAdapter implements LonesystemAdapter {
  constructor(public systemTyp: SystemTyp, _koppling: Koppling) {}

  buildAuthUrl(): string { throw new NotImplementedError(this.systemTyp, "buildAuthUrl"); }
  exchangeCode(): Promise<any> { throw new NotImplementedError(this.systemTyp, "exchangeCode"); }
  refreshToken(): Promise<any> { throw new NotImplementedError(this.systemTyp, "refreshToken"); }

  async testConnection() {
    return { ok: false, meddelande: `${SYSTEM_LABELS[this.systemTyp]} är inte implementerat ännu.` };
  }

  async getEmployees() { throw new NotImplementedError(this.systemTyp, "getEmployees"); return []; }

  async sendPayrollData() {
    return { ok: false, meddelande: `${SYSTEM_LABELS[this.systemTyp]} är inte implementerat ännu.`, skickade: 0 };
  }
}

export class VismaAdapter  extends StubAdapter { constructor(k: Koppling) { super("visma", k); } }
export class HogiaAdapter  extends StubAdapter { constructor(k: Koppling) { super("hogia", k); } }
export class KontekAdapter extends StubAdapter { constructor(k: Koppling) { super("kontek", k); } }
export class CronaAdapter  extends StubAdapter { constructor(k: Koppling) { super("crona", k); } }
export class AgdaAdapter   extends StubAdapter { constructor(k: Koppling) { super("agda", k); } }

/**
 * CSV-export fungerar utan extern integration — UI hanterar nedladdning lokalt.
 * Adaptern är därför en no-op men returnerar ok så "anslutet" kan visas.
 */
export class CsvAdapter implements LonesystemAdapter {
  systemTyp = "csv" as const;
  constructor(_koppling: Koppling) {}
  buildAuthUrl(): string { throw new Error("CSV-export kräver ingen anslutning."); }
  async exchangeCode() { throw new Error("CSV-export kräver ingen anslutning."); }
  async refreshToken() { throw new Error("CSV-export kräver ingen anslutning."); }
  async testConnection() { return { ok: true, meddelande: "CSV-export är alltid tillgängligt." }; }
  async getEmployees() { return []; }
  async sendPayrollData() { return { ok: false, meddelande: "Använd Exportera CSV-knappen i Löneunderlag.", skickade: 0 }; }
}
