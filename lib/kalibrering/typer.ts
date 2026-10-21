/**
 * TYPER FÖR KALIBRERINGSVYN — flyttade ur app/kalibrering/page.tsx (2026-10), oförändrade.
 * Formerna speglar tabellerna och /api/kalibrering/*-svaren; vyn och räknarna delar dem här.
 */
import type { VariabelStat } from './statistik';

export type { VariabelStat };

// === Tabellerna (Supabase) ===
export interface FaktKalibrering {
  id: number;
  datum: string;
  maskin_id: string;
  operator_id: string | null;
  tradslag: string;
  antal_kontrollstammar: number;
  antal_kontrollstockar: number;
  langd_avvikelse_snitt_cm: number;
  langd_avvikelse_min_cm: number;
  langd_avvikelse_max_cm: number;
  dia_avvikelse_snitt_mm: number;
  dia_avvikelse_min_mm: number;
  dia_avvikelse_max_mm: number;
  status: string;
  filnamn: string;
  skapad_tid: string;
  object_name?: string | null;
}

export interface DetaljKontrollStock {
  id: number;
  maskin_id: string;
  kontroll_datum: string;
  stam_nummer: number;
  stock_nummer: number;
  maskin_langd_cm: number;
  maskin_toppdia_mm: number;
  operator_langd_cm: number;
  operator_toppdia_mm: number;
  langd_avvikelse_cm: number;
  dia_avvikelse_mm: number;
  filnamn: string;
  skapad_tid: string;
  maskin_volym_sub: number | null;
  operator_volym_sub: number | null;
  volym_avvikelse: number | null;
  latitude: number | null;
  longitude: number | null;
  objekt_id: string | null;
  // Mätpunkter längs stocken (ControlLogDiameter). Toppdiametern ovan är
  // EN punkt vid kapsnittet — dessa är de övriga, och alla ingår i
  // diameterstatistiken (lib/kalibrering/diameterpunkter).
  matpunkter?: { position_cm: number; diameter_maskin_mm: number | null; diameter_operator_mm: number | null }[] | null;
}

/** Senaste-kortets stockar: hela raden + mätpunkterna längs stocken, så
 *  stock-arket kan visa att toppen bara är ETT av flera diametermått. */
export const STOCK_SELECT =
  '*, matpunkter:detalj_kontroll_stock_matpunkt(position_cm,diameter_maskin_mm,diameter_operator_mm)';

export interface KalibHistorik {
  id: number;
  datum: string;
  maskin_id: string;
  operator_id: string | null;
  tradslag: string;
  orsak: string;
  beskrivning: string;
  langd_justering_mm: number | null;
  dia_justering_mm: number | null;
  position_cm: number | null;
  filnamn: string;
  skapad_tid: string;
  typ: string;
}

export type AlleMaskin = { maskin_id: string; tillverkare: string | null; modell: string | null; visningsnamn: string | null; aktiv_till: string | null };

// === Profilbedömning (/api/kalibrering/bedomning) ===
export type KravRow = {
  variabel: string; metrik: string; riktning: string;
  tolerans: number | null; mal: number; golv: number; enhet: string; larm_min_matt: number | null;
};
/** "Hjälpte åtgärden?" — före/efter senaste förar-markören (speglar AtgardEffekt i
 *  bedomning/route.ts). fore/efter är null under grinden (30 mått per sida). */
export type AtgardEffekt = {
  datum: string; text: string;
  fore: VariabelStat | null; efter: VariabelStat | null;
  forTidigt: boolean; nFore: number; nEfter: number;
  kalibreringarEfter: string[];
};
export type BedomningResp = {
  ok: true; maskin_id: string; profil: string | null;
  fonster: { fran: string; till: string; dagar: number } | null;
  diameter: VariabelStat | null; langd: VariabelStat | null; trosklar: KravRow[];
  atgard?: AtgardEffekt | null;
};

// === Diagnos (/api/kalibrering/diagnos) ===
export type DiagKlass = {
  klass: string; min: number; max: number; n: number;
  traffPct: number | null;
  standardavv: number | null; // spridning i 90-dagarsfönstret ("Flaxar den?")
  systMonthly: { manad: string; systematik: number; n: number }[];
  plateauShare: number | null; plateauN: number;
  // Trend "Läget" — hela historiken per månad.
  traffMonthly: { manad: string; traffPct: number; n: number }[];
  plateauMonthly: { manad: string; share: number; n: number }[];
  // "Flaxar den?" — RÅA summor per månad; std aggregeras exakt per period
  // (std är inte viktbart som träff%: √(Σsumsq/Σn − (Σsum/Σn)²)).
  spridMonthly: { manad: string; n: number; sum: number; sumsq: number }[];
};
export type DiagMarkor = { datum: string; kalla: 'reparation' | 'kalibrering' | 'atgard'; text: string };
export type DiagnosResp = {
  ok: true; maskin_id: string; profil: string | null; golvDia: number | null;
  fonster: { fran: string; till: string; dagar: number } | null;
  klasser: DiagKlass[];
  plateauMonthly: { manad: string; share: number; n: number }[];
  markorer: DiagMarkor[];
};

// === Objekt (/api/kalibrering/objekt) ===
export type ObjektStat = { object_name: string; maskin_id: string | null; n: number; traffPct: number; systematisk: number; standardavv: number; grovPct: number | null; fran: string; till: string };
export type MaskinInfo = { profil: string | null; golvDia: number | null; traffPctTotal: number | null; n: number; trosklar: KravRow[] };
export type ObjektData = { objekt: ObjektStat[]; maskiner: Record<string, MaskinInfo> };

// === Rapport per trädslag (/api/kalibrering/tradslag) ===
export type TradslagStat = { tradslag: string; diameter: VariabelStat; langd: VariabelStat };
export type TradslagData = { profil: string | null; trosklar: KravRow[]; tradslag: TradslagStat[] };

// === Kalender (/api/kalibrering/kalender) ===
export type CalDagstatus = 'komplett' | 'saknas' | 'varning' | 'inaktiv';
export type CalKontroll = { id: number; tradslag: string | null; status: string; filnamn: string | null };
export type CalMaskin = {
  maskin_id: string;
  tillverkare: string | null;
  modell: string | null;
  status: CalDagstatus;
  volym_m3sub: number;
  huvudtyp: string | null;
  huvudtyp_okand: boolean;
  trosklar: { min_volym_m3sub: number };
  kontroller: CalKontroll[];
};
export type CalDag = { datum: string; veckodag: number; status: CalDagstatus; maskiner: CalMaskin[] };
export type CalSammanfattning = { produktionsdagar: number; kompletta: number; saknas: number; varningar: number; okand_huvudtyp_dagar: number };
export type CalResponse = { manad: string; dagar: CalDag[]; sammanfattning: CalSammanfattning };
