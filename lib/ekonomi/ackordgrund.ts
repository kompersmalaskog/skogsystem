// Ackordgrundens AUTO-delvärden — EN definition, delad av ekonomins
// per-objekt-jämförelse (lib/ekonomi/objektJamforelse) och redigeringens
// auto-visning i Ackordgrund-fälten. Redigeringen får ALDRIG visa ett
// auto-värde som skiljer sig från vad Mot ackord/Per klass räknar på —
// därför bor uträkningarna här och ingen annanstans.
//
// Funktionerna är RENA (rader in, värde ut). null = ingen data, aldrig en
// påhittad nolla. hamtaAckordgrundAuto är redigeringens fetch-ingång
// (VO-gruppens objekt-id:n — gruppens fakta är objektets fakta).

import { supabase } from '@/lib/supabase';
import { g15Sek } from '@/lib/g15';
import { skotningsavstandM } from '@/lib/skotningsavstand';

/** Medelstam = total volym / totala stammar. null utan stammar. */
export function medelstamAuto(vol: number, stammar: number): number | null {
  return stammar > 0 ? vol / stammar : null;
}

/** Antal distinkta sortimentgrupper (null-grupper räknas inte). */
export function sortimentgrupperAuto(
  sortRader: { sortiment_id: string }[],
  gruppMap: Record<string, string | null>,
): number {
  const grupper = new Set<string>();
  for (const r of sortRader) {
    const g = gruppMap[r.sortiment_id];
    if (g) grupper.add(g);
  }
  return grupper.size;
}

/** Volymviktat SKOTNINGSAVSTÅND ur faktiska lass (enkelriktat — korstracka_m
 *  är tur och retur, se lib/skotningsavstand). null utan lassvolym. */
export function skotavstandVagtAuto(
  lassRader: { korstracka_m: number | null; volym_m3sub: number | null }[],
): number | null {
  let viktat = 0, vol = 0;
  for (const r of lassRader) {
    const v = Number(r.volym_m3sub) || 0;
    viktat += skotningsavstandM(r.korstracka_m) * v;
    vol += v;
  }
  return vol > 0 ? viktat / vol : null;
}

/** G15-timmar = g15Sek-summa / 3600 — per definition samma timmar som
 *  timpengForTidRows räknar (samma g15Sek per rad). */
export function g15TimmarAuto(
  tidRader: { processing_sek: number | null; terrain_sek: number | null; other_work_sek?: number | null }[],
): number {
  return tidRader.reduce((s, r) => s + g15Sek(r.processing_sek, r.terrain_sek, r.other_work_sek), 0) / 3600;
}

export type AckordgrundAuto = {
  medelstam: number | null;
  sortimentgrupper: number;      // 0 = inga grupper (äkta värde, inte "saknas")
  skotavstand: number | null;
  g15Skordare: number | null;    // null = inga tidrader alls för rollen
  g15Skotare: number | null;
};

/** Hämtar och räknar auto-värdena för ett objekt (VO-gruppens id:n).
 *  Hela objektets historik — samma omfång som ekonomins beräkning. */
export async function hamtaAckordgrundAuto(objektIds: string[]): Promise<AckordgrundAuto> {
  const tomt: AckordgrundAuto = { medelstam: null, sortimentgrupper: 0, skotavstand: null, g15Skordare: null, g15Skotare: null };
  if (objektIds.length === 0) return tomt;

  const [prodRes, lassRes, tidRes, sortRes, gruppRes, maskinRes] = await Promise.all([
    supabase.from('fakt_produktion').select('volym_m3sub, stammar').in('objekt_id', objektIds),
    supabase.from('fakt_lass').select('korstracka_m, volym_m3sub').in('objekt_id', objektIds),
    supabase.from('fakt_tid').select('maskin_id, processing_sek, terrain_sek, other_work_sek').in('objekt_id', objektIds),
    supabase.from('fakt_sortiment').select('sortiment_id').in('objekt_id', objektIds),
    supabase.from('dim_sortiment_grupp').select('sortiment_id, grupp'),
    supabase.from('dim_maskin').select('maskin_id, maskin_typ'),
  ]);
  for (const res of [prodRes, lassRes, tidRes, sortRes, gruppRes, maskinRes]) {
    if (res.error) throw new Error('Kunde inte läsa ackordgrund: ' + res.error.message);
  }

  const prod = prodRes.data || [];
  const vol = prod.reduce((s, r: any) => s + (Number(r.volym_m3sub) || 0), 0);
  const stammar = prod.reduce((s, r: any) => s + (Number(r.stammar) || 0), 0);

  const gruppMap: Record<string, string | null> = {};
  for (const g of (gruppRes.data || [])) gruppMap[g.sortiment_id] = g.grupp;
  const typMap: Record<string, string | null> = {};
  for (const m of (maskinRes.data || [])) typMap[m.maskin_id] = m.maskin_typ;

  const tid = tidRes.data || [];
  const skordarTid = tid.filter((r: any) => typMap[r.maskin_id] === 'Harvester');
  const skotarTid = tid.filter((r: any) => typMap[r.maskin_id] === 'Forwarder');

  return {
    medelstam: medelstamAuto(vol, stammar),
    sortimentgrupper: sortimentgrupperAuto(sortRes.data || [], gruppMap),
    skotavstand: skotavstandVagtAuto(lassRes.data || []),
    g15Skordare: skordarTid.length ? g15TimmarAuto(skordarTid as any) : null,
    g15Skotare: skotarTid.length ? g15TimmarAuto(skotarTid as any) : null,
  };
}
