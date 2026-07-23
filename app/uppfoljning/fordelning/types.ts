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
  headline: string | null;
  mening: string | null;
  vältor: LengthPile[];
  vältorTwist: string | null;
  ansvar: { totalt: number; manuella: number; automatiskAndel: number };
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
  produkter: ProduktVy[];
}
