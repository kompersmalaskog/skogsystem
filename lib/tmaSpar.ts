// TMA-bedömningar (riskfrågor + samråd per traktgräns) → tabellen tma_assessments, utan att skriva över sparat.
//
// Före: en effekt på [tmaRisk, tmaSamrad, tmaResults] upsertade en rad per gräns (10 kolumner) vid öppning (när rader fanns),
// vid varje ändring OCH vid varje ändring av tmaResults (ett asynkront vägkontroll-resultat). road_name/road_speed/road_type/
// distance_to_road kom ur tmaResults → NULL medan kontrollen laddade eller felade → sparad väginfo skrevs över med NULL.
// Ett läsfel räknades som laddat: `samrad_data` blev `{}` och raderade ett sparat (kvitterat) samråd. State för förra objektet
// låg kvar (sattes bara om DB hade data) och kunde skrivas till nästa objekts gräns-id:n.
//
// Nu: baslinje per gräns = dess användarkolumner (risk_answers, risk_level, samrad_data) direkt efter laddning. Bara gränser vars
// kolumner ändrats skrivs, och bara de ändrade kolumnerna. Vägkolumnerna utlöser aldrig en skrivning och skrivs aldrig som NULL —
// de följer bara med när de faktiskt finns (kontrollen klar med en väg).
//
// Rena funktioner → enhetstestbara.
import { andradeKolumner, type Kolumner } from './autosparBaslinje';

export interface TmaSamrad {
  fallare: string;
  tmaBil: boolean | null;
  checkboxes: boolean[];
  datum: string;
  kvitterad: boolean;
  kvitteradDatum: string;
}
export type TmaRiskSvar = (boolean | null)[];
export interface TmaDbRad { boundary_id: string; risk_answers?: unknown; samrad_data?: unknown }

export const TMA_STD_RISK: TmaRiskSvar = [null, null, null, null, null, null, null];
export const TMA_STD_CHECKBOXES: boolean[] = [false, false, false, false, false, false];

/** Sparade rader → formulärvärden. Sätts ALLTID (även tomt) så inget ligger kvar från föregående objekt. `idag` = 'YYYY-MM-DD'. */
export function tmaVardenFranRader(rader: TmaDbRad[], idag: string): { risk: Record<string, TmaRiskSvar>; samrad: Record<string, TmaSamrad> } {
  const risk: Record<string, TmaRiskSvar> = {};
  const samrad: Record<string, TmaSamrad> = {};
  for (const row of rader || []) {
    if (row.risk_answers) risk[row.boundary_id] = row.risk_answers as TmaRiskSvar;
    if (row.samrad_data && typeof row.samrad_data === 'object') {
      const sd = row.samrad_data as any;
      samrad[row.boundary_id] = {
        fallare: sd.fallare || '',
        tmaBil: sd.tmaBil ?? null,
        checkboxes: sd.checkboxes || TMA_STD_CHECKBOXES,
        datum: sd.datum || idag,
        kvitterad: sd.kvitterad || false,
        kvitteradDatum: sd.kvitteradDatum || '',
      };
    }
  }
  return { risk, samrad };
}

/** Risknivå ur de sju frågorna (null tills alla är besvarade; vind-svar höjer ett steg). Oförändrad logik. */
export function tmaRisknivå(risk: TmaRiskSvar): 'low' | 'medium' | 'high' | null {
  const answeredCount = risk.filter((v) => v !== null).length;
  const jaCount = risk.filter((v) => v === true).length;
  const windBoost = risk[4] === true ? 1 : 0;
  const baseLevel = answeredCount < 7 ? null : (jaCount >= 3 || risk[1] === true) ? 'high' : jaCount >= 1 ? 'medium' : 'low';
  return baseLevel === null ? null : windBoost > 0 ? (baseLevel === 'low' ? 'medium' : 'high') : baseLevel;
}

/** Användarkolumnerna för en gräns (det som kan "ändras"). */
export function tmaKolumner(risk: TmaRiskSvar | undefined, samrad: TmaSamrad | undefined): Kolumner {
  const r = risk || TMA_STD_RISK;
  return { risk_answers: r, risk_level: tmaRisknivå(r), samrad_data: samrad || {} };
}

export type TmaBaslinje = Map<string, Kolumner>;

/** Baslinje = kolumnerna för varje gräns som finns i det inlästa formuläret. */
export function tmaBaslinjeFran(risk: Record<string, TmaRiskSvar>, samrad: Record<string, TmaSamrad>): TmaBaslinje {
  const bas: TmaBaslinje = new Map();
  for (const id of Array.from(new Set([...Object.keys(risk), ...Object.keys(samrad)]))) bas.set(id, tmaKolumner(risk[id], samrad[id]));
  return bas;
}

export interface TmaSkrivning {
  boundaryId: string;
  /** gränsen finns inte i baslinjen (användaren har just besvarat/fyllt i den) → alla tre kolumnerna skapas */
  ny: boolean;
  kolumner: Kolumner;
  /** de nya kolumnvärdena, att lägga in i baslinjen när sparningen landat */
  nu: Kolumner;
}

/** Vilka gränser ska skrivas nu? Muterar inte baslinjen. */
export function tmaAttSkriva(bas: TmaBaslinje, risk: Record<string, TmaRiskSvar>, samrad: Record<string, TmaSamrad>): TmaSkrivning[] {
  const ut: TmaSkrivning[] = [];
  for (const id of Array.from(new Set([...Object.keys(risk), ...Object.keys(samrad)]))) {
    const nu = tmaKolumner(risk[id], samrad[id]);
    const b = bas.get(id);
    if (!b) { ut.push({ boundaryId: id, ny: true, kolumner: nu, nu }); continue; }
    const andrat = andradeKolumner(b, nu);
    if (Object.keys(andrat).length > 0) ut.push({ boundaryId: id, ny: false, kolumner: andrat, nu });
  }
  return ut;
}

/** Vägkolumnerna ur en KLAR vägkontroll — aldrig NULL-värden för "ingen väg ännu". Tomt objekt när kontrollen inte är klar. */
export function tmaVagKolumner(res: { status: string; roads: { ref?: string; name: string; maxspeed?: number; type?: string; distance?: number }[] } | undefined): Kolumner {
  if (!res || res.status !== 'done' || res.roads.length === 0) return {};
  const v = res.roads[0];
  return {
    road_name: v.ref ? `${v.ref} · ${v.name}` : v.name,
    road_speed: v.maxspeed || null,
    road_type: v.type || null,
    distance_to_road: v.distance || null,
  };
}
