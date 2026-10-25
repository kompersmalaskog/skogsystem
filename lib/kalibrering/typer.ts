/**
 * TYPER FÖR KALIBRERINGSVYN — flyttade ur app/kalibrering/page.tsx (2026-10), oförändrade.
 * Formerna speglar tabellerna och /api/kalibrering/*-svaren; vyn och räknarna delar dem här.
 */
import type { GreppRad } from './greppTid';
import type { PunktBesked } from './forslag';
import type { GreppSteg, Kort } from './forslagKort';
import type { GrovlekRad } from './grovlek';
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
  /** Vädret vid skörd (SMHI via importen). null/saknas = väder inte hämtat — aldrig "uppehåll". */
  weather_at_harvest?: VaderJson;
}

/** Vädret kontrollen gjordes i — fälten är null när SMHI inte gav något. */
export type VaderJson = {
  temperature_c?: number | null;
  precipitation_mm?: number | null;
  snowfall_cm?: number | null;
  wind_speed_ms?: number | null;
  is_freezing?: boolean;
} | null;

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
  beskrivning: string | null;
  langd_justering_mm: number | null;
  /** Rotstockens längdjustering (LengthCalibrationAdjustmentButtLog). null = filen sa inget, aldrig 0. */
  langd_justering_rot_mm: number | null;
  dia_justering_mm: number | null;
  /** true = omkalibrering efter reparation ("Repair of measurement system"): värdena är INTE en justering i mm. Visa via
   *  lib/kalibrering/historik (justeringsText), aldrig rått. Saknas fältet (migrationen ej körd) avgör orsaken där. */
  omkalibrering?: boolean;
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
/** En rad i Åtgärder: en markör (förarens åtgärd eller en reparation av mätsystemet) med träffen före och efter. `efter` räknas fram till nästa markör. */
export type AtgardPost = AtgardEffekt & { kalla: 'atgard' | 'reparation' | 'kalibrering' };
export type BedomningResp = {
  ok: true; maskin_id: string; profil: string | null;
  fonster: { fran: string; till: string; dagar: number } | null;
  diameter: VariabelStat | null; langd: VariabelStat | null; trosklar: KravRow[];
  atgard?: AtgardEffekt | null;
  /** Alla markörer med före/efter, nyast sist. Saknas hos en äldre server. */
  atgarder?: AtgardPost[];
};

/** Vad /api/kalibrering/kontroller säger om en kontroll: när den mättes (svensk tid) och hur stammen valdes. */
export type KontrollTid = {
  /** Första och sista operatörsmätningen i filen — en fil kan bära stammar från flera dagar. null när tiden saknas. */
  forsta: { dag: string; klockslag: string } | null;
  sista: { dag: string; klockslag: string } | null;
  /** Filens urvalstexter ur HQC (stem_selection), utan dubbletter. */
  urval: string[];
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

// === Per grovlek (/api/kalibrering/grovlek) ===
/** En stam per månad och grovlek, med trädslag och kontroll — rutnätet räknas i klienten (lib/kalibrering/grovlek). `tolerans` = kravprofilens ±mm. */
export type GrovlekResp = { ok: true; maskin_id: string; tolerans: number; rader: GrovlekRad[] };

// === Greppet (/api/kalibrering/grepp) ===
/**
 * Maskinens egna stamprofiler, alla stammar, summerade per månad, trädslag och grovlek. `kvar` > 0 = några objekt ligger efter (tabellen är en cache som cron-jobbet
 * räknar om objekt för objekt när importen läst in nya stammar; läsningen räknar aldrig) — vyn säger "Räknas om". `tillganglig: false` = migrationen är inte körd.
 */
export type GreppResp = {
  ok: true; maskin_id: string; tillganglig: boolean; orsak?: 'migration';
  rader: GreppRad[]; kvar: number; stammarTotalt: number; stammarRaknade: number;
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

// === Justeringsförslag (/api/kalibrering/forslag) ===
/**
 * Kortet "Gör så här" (`kort`: ETT nästa steg i en ordning appen håller själv) och detaljen bakom det: besked per trädslag och punkt på diameterkurvan.
 * `senasteAndring` = den senaste ändringen som flyttat fönstret (förslagen räknas på stammar klavade efter den). `greppLast` = false när greppet inte gick att
 * läsa (cachen saknas eller läsfel): kortet kan då inte säga "inget att göra" om knivar och valsar, och vyn säger det.
 */
export type ForslagResp = {
  ok: true; maskin_id: string; idag: string;
  kort: Kort; punkter: PunktBesked[]; grepp: GreppSteg[];
  greppLast: boolean;
  senasteAndring: { datum: string; slag: 'tryck' | 'byte' | 'omkalibrering' | 'kurva' | 'kalibrering' } | null;
  /** Stammar som räknats (alla trädslag och grovlekar, efter fönstret). */
  stammar: number;
};
