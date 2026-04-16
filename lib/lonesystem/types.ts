/**
 * Gemensamma typer för lönesystem-integration.
 */

export type SystemTyp = "fortnox" | "visma" | "hogia" | "kontek" | "crona" | "agda" | "csv";

export const SYSTEM_LABELS: Record<SystemTyp, string> = {
  fortnox: "Fortnox",
  visma:   "Visma Lön",
  hogia:   "Hogia",
  kontek:  "Kontek",
  crona:   "Crona Lön",
  agda:    "Agda PS",
  csv:     "CSV-export",
};

export type ExternEmployee = {
  externt_id: string;
  namn: string;
  anstallningsnummer?: string;
};

/**
 * En rad i löneunderlaget som ska skickas till lönesystemet.
 * intern_typ-koderna mappas till externa löneartkoder via
 * lonesystem_artikelmappning innan utskick.
 */
export type LonespecRad = {
  medarbetare_id: string;
  anstallningsnummer: string;
  period: string; // YYYY-MM
  poster: { intern_typ: string; antal: number; belopp_kr: number; beskrivning?: string }[];
};

export type Koppling = {
  id: string;
  system_typ: SystemTyp;
  api_client_id: string | null;
  api_client_secret: string | null;
  access_token: string | null;
  refresh_token: string | null;
  token_utgar: string | null;
  aktiv: boolean;
  senast_synkad: string | null;
};

export interface LonesystemAdapter {
  systemTyp: SystemTyp;

  /** Bygg OAuth-URL för att starta anslutning. Kasta om systemet inte använder OAuth. */
  buildAuthUrl(state: string, redirectUri: string): string;

  /** Växla auth-code mot access/refresh-tokens. */
  exchangeCode(code: string, redirectUri: string): Promise<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
  }>;

  /** Förnya access-token via refresh-token. */
  refreshToken(): Promise<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
  }>;

  /** Testa att kopplingen fungerar. */
  testConnection(): Promise<{ ok: boolean; meddelande: string }>;

  /** Hämta lista över anställda i lönesystemet. */
  getEmployees(): Promise<ExternEmployee[]>;

  /** Skicka löneunderlag till systemet. */
  sendPayrollData(period: string, rader: LonespecRad[]): Promise<{
    ok: boolean;
    meddelande: string;
    skickade: number;
  }>;
}

export class NotImplementedError extends Error {
  constructor(systemTyp: SystemTyp, metod: string) {
    super(`${SYSTEM_LABELS[systemTyp]}: ${metod} är inte implementerat ännu.`);
    this.name = "NotImplementedError";
  }
}
