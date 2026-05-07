// Prismatris från dim_sortiment_pris (lower-threshold-modell, en rad per
// sortiment × längd-tröskel × dimensions-tröskel).
//
// Pris-uppslag för en stock: hitta största (langd_min_cm, dia_min_mm) som inte
// överskrider stockens (langd_cm, toppdia_ub_mm). Implementerat som DESC-sortering
// i array + första matchande iteration — undviker DB-query i hot path.
//
// Massa-referenspris och Gran-timmer-snittpris räknas båda från avverkningens
// EGNA stocks (volymviktat snitt med getPrisForStock per stock), inte från
// prislistans aritmetiska snitt.

import type { SupabaseClient } from '@supabase/supabase-js';
import { isBmav } from './detect';

/** dim_sortiment_grupp har systematiska dataintegritetsproblem (NULL-mappningar
 *  på vissa Kubb/Timmer-rader). Härled grupp från sortimentnamnets prefix om
 *  DB-värdet saknas. Sortimentnamn följer "Timmer:/Kubb:/Massa:/Energi:"-mönstret. */
export function harledGrupp(
  namn: string | null | undefined,
  dbValue: string | null | undefined,
): string | null {
  if (dbValue) return dbValue;
  if (!namn) return null;
  if (namn.startsWith('Timmer:')) return 'Timmer';
  if (namn.startsWith('Kubb:')) return 'Kubb';
  if (namn.startsWith('Massa:') || namn.startsWith('Massaved:')) return 'Massa';
  if (namn.startsWith('Energi:')) return 'Energi';
  return null;
}

export interface PrismatrisRow {
  langd_min_cm: number;
  dia_min_mm: number;
  pris_per_m3: number;
}

/** sortiment_id → DESC-sorterad array av (langd_min, dia_min, pris) */
export type Prismatris = Map<string, PrismatrisRow[]>;

export interface DetaljStockRow {
  stock_key: string;
  maskin_id: string;
  sortiment_id: string | null;
  sortiment_namn: string | null;
  volym_m3sub: number;
  langd_cm: number | null;
  toppdia_ub_mm: number | null;
  filnamn: string | null;
  stam_tradslag?: string;
}

/** Ladda prismatrisen för givna sortiment_ids — en query, returnerar pre-sorterad Map. */
export async function loadPrismatris(
  supabase: SupabaseClient,
  sortimentIds: string[],
): Promise<Prismatris> {
  const out: Prismatris = new Map();
  if (sortimentIds.length === 0) return out;

  const { data, error } = await supabase
    .from('dim_sortiment_pris')
    .select('sortiment_id, langd_min_cm, dia_min_mm, pris_per_m3')
    .in('sortiment_id', sortimentIds);
  if (error) throw error;

  for (const r of data ?? []) {
    const arr = out.get(r.sortiment_id) ?? [];
    arr.push({
      langd_min_cm: Number(r.langd_min_cm),
      dia_min_mm: Number(r.dia_min_mm),
      pris_per_m3: Number(r.pris_per_m3),
    });
    out.set(r.sortiment_id, arr);
  }
  // DESC på (langd_min, dia_min) — första matchande i getPrisForStock blir då
  // största tröskeln som inte överskrider stockens dimensioner.
  out.forEach((arr) => {
    arr.sort((a: PrismatrisRow, b: PrismatrisRow) => {
      if (b.langd_min_cm !== a.langd_min_cm) return b.langd_min_cm - a.langd_min_cm;
      return b.dia_min_mm - a.dia_min_mm;
    });
  });
  return out;
}

/** Find largest (langd_min, dia_min) ≤ (stocken). Returnerar null om ingen träff. */
export function getPrisForStock(
  prismatris: Prismatris,
  sortimentId: string | null | undefined,
  langdCm: number | null | undefined,
  diaUbMm: number | null | undefined,
): number | null {
  if (!sortimentId || langdCm == null || diaUbMm == null) return null;
  const arr = prismatris.get(sortimentId);
  if (!arr) return null;
  for (const row of arr) {
    if (row.langd_min_cm <= langdCm && row.dia_min_mm <= diaUbMm) {
      return row.pris_per_m3;
    }
  }
  return null;
}

/** Volymviktat massa-snittpris per maskin från avverkningens EGNA Bmav-stocks. */
export function massaRefPerMaskin(
  stocks: DetaljStockRow[],
  prismatris: Prismatris,
): Map<string, number> {
  const acc = new Map<string, { volym: number; vardad: number }>();
  for (const s of stocks) {
    if (!isBmav(s.sortiment_namn)) continue;
    const pris = getPrisForStock(prismatris, s.sortiment_id, s.langd_cm, s.toppdia_ub_mm);
    if (pris == null || pris <= 0) continue;
    const a = acc.get(s.maskin_id) ?? { volym: 0, vardad: 0 };
    a.volym += s.volym_m3sub;
    a.vardad += s.volym_m3sub * pris;
    acc.set(s.maskin_id, a);
  }
  const out = new Map<string, number>();
  acc.forEach((v, m) => { if (v.volym > 0) out.set(m, v.vardad / v.volym); });
  return out;
}

/** Volymviktat Gran-timmer-snittpris per maskin från avverkningens EGNA stocks
 *  som matchar (trädslag GRAN, grupp Timmer, toppdia 180–300 mm). */
export function timmerSnittGranPerMaskin(
  stocks: DetaljStockRow[],
  prismatris: Prismatris,
  gruppById: Map<string, string | null>,
): Map<string, number> {
  const acc = new Map<string, { volym: number; vardad: number }>();
  for (const s of stocks) {
    if (s.stam_tradslag !== 'GRAN') continue;
    if (!s.sortiment_id) continue;
    if (harledGrupp(s.sortiment_namn, gruppById.get(s.sortiment_id)) !== 'Timmer') continue;
    if (s.toppdia_ub_mm == null) continue;
    if (s.toppdia_ub_mm < 180 || s.toppdia_ub_mm > 300) continue;
    const pris = getPrisForStock(prismatris, s.sortiment_id, s.langd_cm, s.toppdia_ub_mm);
    if (pris == null || pris <= 0) continue;
    const a = acc.get(s.maskin_id) ?? { volym: 0, vardad: 0 };
    a.volym += s.volym_m3sub;
    a.vardad += s.volym_m3sub * pris;
    acc.set(s.maskin_id, a);
  }
  const out = new Map<string, number>();
  acc.forEach((v, m) => { if (v.volym > 0) out.set(m, v.vardad / v.volym); });
  return out;
}
