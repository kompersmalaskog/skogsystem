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

/** DB-radtyp för lonesystem_koppling (matchar Supabase-schemat). */
export type Koppling = {
  id: string;
  system_typ: SystemTyp;
  access_token: string | null;
  refresh_token: string | null;
  token_utgar: string | null;
  aktiv: boolean;
  senast_synkad: string | null;
  skapad: string | null;
};
