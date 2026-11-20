// "+ Ny plats" i flyttens Från/Till-väljare (Martin 2026-11-16: "man skulle kunna skriva in själv var den hamnade").
//
// Man skriver bara namnet; positionen tas från där BILEN stod när den lastade (Från) eller lossade (Till), så platsen har en
// position precis som en trakt — kartan, maskinens resa och nästa "Hämta en maskin" vet var maskinen står. Platsen sparas som
// en flyttplats (typ 'annat') och finns i listan nästa gång. Fri text utan position byggs medvetet INTE.

import { supabase } from '@/lib/supabase';
import type { PlatsKandidat } from './usePlatsData';

export interface Position { lat: number; lng: number }

/** Namnet att erbjuda som ny plats, eller null: tom sökning, eller en trakt/plats med exakt det namnet finns redan. */
export function nyPlatsNamn(sok: string, platser: readonly PlatsKandidat[]): string | null {
  const namn = sok.trim().replace(/\s+/g, ' ');
  if (namn.length < 2) return null;
  const q = namn.toLocaleLowerCase('sv');
  return platser.some(p => p.namn.trim().toLocaleLowerCase('sv') === q) ? null : namn;
}

export function giltigPosition(lat: number | null | undefined, lng: number | null | undefined): Position | null {
  return lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0) ? { lat, lng } : null;
}

export async function skapaFlyttplats(namn: string, pos: Position | null, av: string):
  Promise<{ ok: true; plats: PlatsKandidat } | { ok: false; fel: string }> {
  const { data, error } = await (supabase.from('flyttplats')
    .insert({ namn, typ: 'annat', lat: pos?.lat ?? null, lng: pos?.lng ?? null, skapad_av: av || null, aktiv: true })
    .select('id, namn, typ, lat, lng').single() as any);
  if (error || !data) return { ok: false, fel: error?.message ?? 'Platsen sparades inte' };
  return { ok: true, plats: { slag: 'plats', id: data.id, namn: data.namn, lat: data.lat ?? null, lng: data.lng ?? null, sub: data.typ ?? 'annat' } };
}
