// Skotarläget, del 1: lassrapportering i appen. Typerna delas av detektorn, lassmodellen, kön och vyerna.
//
// Ett LASS är en lossning (eller flera, om samma last läggs på två avlägg). Appen skriver lassen i egna tabeller (skotar_lass*) — aldrig i
// fakt_lass, som Opti-filerna äger — så admin kan jämföra appen mot Opti per trakt.

export type AvlaggKalla = 'vida' | 'egen';

/** Ett avlägg på trakten: Vidas punkt eller en egen avläggsmarkering. `id` är stabil nyckel som sparas på lassdelen. */
export interface Avlagg {
  /** 'vida:<nummer>' eller 'egen:<markeringens id>' */
  id: string;
  /** Visas som "Avlägg <nummer>": Vidas eget nummer, egna avlägg har löpnummer. */
  nummer: string;
  kalla: AvlaggKalla;
  lat: number;
  lng: number;
  /** Skapat med "Lossa här" (eget avlägg): det enda som flyttas mot snittet av lossningarna. Vidas och planerarens avlägg flyttas aldrig. */
  viaLossaHar?: boolean;
}

/** Sortimentsraden i ett lass. `nyckel` är det som grupperar (skördarens namn, städat), `namn` det som visas. */
export interface SortimentRad {
  nyckel: string;
  namn: string;
  /** Hela m³ (ett tryck = 1 m³). Skalat värde läggs aldrig här — förarens värde bevaras. */
  m3: number;
}

/** En lossning inom ett lass. Ett lass har en del; "Lass 7 · del 2" är en andra lossning av samma last. */
export interface LassDel {
  delNr: number;
  avlaggId: string | null;
  avlaggNummer: string | null;
  lossadTid: string;
  lat: number;
  lng: number;
  rader: SortimentRad[];
}

/** Hur mycket maskinen stod på en väg sedan förra lossningen. `vag` är stråkets nyckel; `sek` tid, `andel` 0–1 av tiden på vägar. */
export interface VagTid { vag: string; sek: number; andel: number }

export interface SparPunkt { lat: number; lng: number; tid: string; /** Första punkten efter en lucka i hyttspåret (ingen data dessförinnan). */ lucka?: true }

export type LassStatus =
  | 'foreslaget'      // upptäckt och ifyllt som förra lasset; bekräftar sig självt när lossningen tog slut (stilla ≥ 5 min + utkörd ur zonen)
  | 'vantar_forare'   // föraren måste fylla i eller välja avlägg (första lasset, två avlägg nära varandra, inget avlägg)
  | 'bekraftat'
  | 'struket';

export interface Lass {
  id: string;
  objektId: string;            // objekt.id (uuid)
  voNummer: string | null;
  maskinId: string;
  medarbetareId: string | null;
  lassNummer: number;
  /** Maskinens LOKALA dag (Europe/Stockholm) för första lossningen. */
  datum: string;
  delar: LassDel[];
  status: LassStatus;
  /**
   * Vem som sa ja. 'forare' = föraren trycka Stämmer/Klar. 'planerare' = en planerare har granskat och bekräftat ett lass (se granskning.ts).
   * 'auto' = den GAMLA självbekräftelsen (före 2026-10-21): LÄSES bara från databasen, skrivs aldrig mer — och räknas inte som skotat (lassModell.raknasSomSkotat).
   */
  bekraftadAv: 'auto' | 'forare' | 'planerare' | null;
  bekraftadTid: string | null;
  /** Spårdelen sedan förra lossningen (tunnad). Används för "kvar per väg" i nästa steg. */
  sparPunkter: SparPunkt[];
  vagar: VagTid[];
  skapad: string;
  andrad: string;
}

export interface LatLng { lat: number; lng: number }
