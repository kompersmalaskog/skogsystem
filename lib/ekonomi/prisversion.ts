// Prislistans versionshantering — EN plats. En prisändring raderar ALDRIG:
// den avslutar den gamla raden (giltig_till = igår) och skriver en ny
// (giltig_fran = idag, giltig_till = null). Ekonomin slår upp rätt pris per
// produktionsdag — äldre data räknas med de priser som gällde då.
//
// Funktionerna är flyttade ORDAGRANT ur InstallningarClient (prislistans
// utbrytning, steg 1) — samma semantik, nu delade och mock-testbara.
// RÖR INTE kontraktet: en vy som tyst slutar versionera priser gör att
// ekonomin räknar på fel pris utan att någon ser det.

import type { SupabaseClient } from '@supabase/supabase-js';

export function todayIso() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function yesterdayIso() {
  const d = new Date(); d.setDate(d.getDate() - 1);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Hel uppsättning (acord_priser, acord_traktstorlek): avsluta ALLA öppna
 * rader och skriv hela den nya uppsättningen med dagens datum.
 */
export async function saveAllBracket<T>(
  supabase: SupabaseClient,
  tableName: string,
  rows: T[],
  mapRow: (r: T) => Record<string, any>,
) {
  const today = todayIso(), yest = yesterdayIso();
  const { error: endErr } = await supabase.from(tableName).update({ giltig_till: yest }).is('giltig_till', null);
  if (endErr) return endErr;
  const { error: insErr } = await supabase.from(tableName).insert(
    rows.map(r => ({ ...mapRow(r), giltig_fran: today, giltig_till: null }))
  );
  return insErr;
}

/**
 * En rad per nyckel (maskin_timpris per maskin_id, acord_terrang per namn,
 * acord_ovrigt per nyckel): avsluta radens öppna version och skriv en ny.
 * isNew hoppar över avslutet — det finns ingen gammal rad att stänga.
 */
export async function saveOneByKey(
  supabase: SupabaseClient,
  tableName: string,
  keyCol: string,
  keyVal: string,
  newRow: Record<string, any>,
  isNew: boolean,
) {
  const today = todayIso(), yest = yesterdayIso();
  if (!isNew) {
    const { error } = await supabase.from(tableName).update({ giltig_till: yest }).eq(keyCol, keyVal).is('giltig_till', null);
    if (error) return error;
  }
  const { error } = await supabase.from(tableName).insert({ ...newRow, giltig_fran: today, giltig_till: null });
  return error;
}

/**
 * Formel-config med EN aktiv rad (acord_skotningsavstand, acord_sortiment_
 * tillagg): avsluta bara den aktiva formel-raden (inte ev. gamla bracket-
 * rader — därav not-null-filtret på en obligatorisk formel-kolumn) och
 * skriv en ny. Ordagrant samma flöde som saveAvstand/saveSort hade.
 */
export async function saveFormelConfig(
  supabase: SupabaseClient,
  tableName: string,
  notNullCol: string,
  newRow: Record<string, any>,
) {
  const today = todayIso(), yest = yesterdayIso();
  const { error: endErr } = await supabase.from(tableName)
    .update({ giltig_till: yest })
    .is('giltig_till', null)
    .not(notNullCol, 'is', null);
  if (endErr) return endErr;
  const { error: insErr } = await supabase.from(tableName).insert({
    ...newRow, giltig_fran: today, giltig_till: null,
  });
  return insErr;
}
