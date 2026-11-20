// Delade typer för fördelningsvyn (speglar lib/hpr/vy.ts:s API-svar).
export interface LengthPile { lenLower: number; actualM3: number; orderedM3: number; }
export interface MatrisRuta { diaLower: number; lenLower: number; deviationM3: number; farga: boolean; }
export interface ProduktVy {
  productKey: string;
  namn: string | null;
  gradePct: number | null;
  gradeAutomatic: number | null;
  totalVolumeM3: number;
  logCount: number;
  forcedCutSharePct: number;
  /** Volymen maskinen kapade själv — det talen bedöms på. */
  volymAutoM3: number;
  /** Maskinens kap utanför beställt i m³. null = ingen grad. */
  utanforM3: number | null;
  headline: string | null;
  mening: string | null;
  /** Kapat mot beställt per längd, maskinens egna kap. */
  vältor: LengthPile[];
  guide: { klen: string | null; grov: string | null };
  matris: MatrisRuta[];
  färgadeRutor: number;
}
export interface ObjektVy {
  objectKey: string;
  objektNamn: string | null;
  status: "active" | "completed";
  lastFileAt: string | null;
  dagarSedanFil: number | null;
  lage: 1 | 2;
  gradePct: number | null;
  volymM3: number;
  mening: string | null;
  headline: string | null;
  trend: { from: number; to: number } | null;
  /** Utanför beställt i m³ på maskinens egna kap. null = ingen grad; saknas = kort räknat före VY_VERSION 3. */
  utanforM3?: number | null;
  bedomdM3?: number;
  produkter: ProduktVy[];
  /** Siffrorna är från förra filen; en färsk räknas just nu. */
  uppdateras?: boolean;
}

/** Listans kort (vymodellen utan produkternas detaljer). */
export type ObjektKort = Omit<ObjektVy, "produkter"> & { produkter?: ProduktVy[] };

/** Objekt som aldrig räknats — står med namn tills kortet är klart. */
export interface VantandeObjekt { objectKey: string; objektNamn: string | null; status: "active" | "completed"; }
