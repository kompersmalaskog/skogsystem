import type { LedighetStatus, LedighetTyp } from './tema';

export interface Ansokan {
  id: string;
  medarbetare_id: string;
  anvandare_id: string; // visningsnamn (äldre rader: förnamn, nya: fullt namn)
  typ: LedighetTyp;
  startdatum: string;
  slutdatum: string;
  status: LedighetStatus;
  kommentar: string | null;
  skapad_at: string;
  /** Bara typ 'inarbetad' (skoftning §5 mom 4): den röda vardag som arbetades i stället. */
  ersatter_datum?: string | null;
  /** Deldag: frånvaron började/slutade mitt på dagen (sjuk från 11:30). */
  fran_tid?: string | null;
  till_tid?: string | null;
}

export interface Saldo {
  semester_dagar_kvar: number | null; // NULL = admin har inte satt värde ännu
  atk_timmar_kvar: number | null;     // NULL = kopplas via Fortnox
  kalla: 'manuell' | 'fortnox';
  uppdaterad_at: string;
}
