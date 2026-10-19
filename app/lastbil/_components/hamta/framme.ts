// "Framme på LBC" tryckt långt från basen: kontrollen som frågar innan rundan stängs.
//
// Bakgrund (2026-10, dubbelrundorna 20 aug, 28 aug, 1 sep): föraren tryckte "Framme" med bilen
// fortfarande ute. Rundan stängdes, bilen körde vidare, och cron:en öppnade en ny runda (en
// "fortsättning") — två rundor för en körning. Kedjeregeln i lib/lastbilRunda.ts gör att det inte
// längre blir dubbelräknat, men rundan är ändå stängd för tidigt. Det här är orsaken: en fråga
// innan, så att rundan inte stängs av misstag. Appen föreslår, föraren avgör.
//
// Bilens position är lastbilens egen (lastbil_logg, Scania) — aldrig förarens telefon, som kan sitta
// i en annan bil. Basen är densamma som cron:en använder (lastbil.hemmabas_*).
//
// Kan vi INTE avgöra var bilen står (ingen position, för gammal position, läsfel, ingen bas) frågar
// vi inte: en fråga på osäker grund vore en spärr som kan fela åt andra hållet, och föraren ska
// aldrig hindras från att stänga sin runda av att ett läsfel inträffat. Då gäller som förut.

import { supabase } from '@/lib/supabase';
import { haversine } from '@/utils/geo';

/** Längre bort än så (fågelväg) och minst basens egen radie → vi frågar. */
export const VARNA_OVER_KM = 2;
/** Äldre position än så säger ingenting om var bilen står nu. */
export const POSITION_MAX_ALDER_MIN = 30;

export interface Bas { lat: number; lng: number; radie_km: number }
export interface BilPosition { lat: number; lng: number; tidpunkt: string }

export type FrammeBedomning =
  | { lage: 'ok'; km: number }
  | { lage: 'langt'; km: number }
  | { lage: 'okant'; orsak: 'ingen_bil' | 'lasfel' | 'ingen_position' | 'gammal_position' | 'ingen_bas' };

const tal = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** Ren bedömning: bilen, basen och klockan in — svaret ut. */
export function bedomFramme(bil: BilPosition | null, bas: Bas | null, nu: Date = new Date()): FrammeBedomning {
  if (!bas) return { lage: 'okant', orsak: 'ingen_bas' };
  if (!bil) return { lage: 'okant', orsak: 'ingen_position' };
  const alderMin = (nu.getTime() - Date.parse(bil.tidpunkt)) / 60000;
  if (!Number.isFinite(alderMin) || alderMin > POSITION_MAX_ALDER_MIN) return { lage: 'okant', orsak: 'gammal_position' };
  const km = haversine(bil.lat, bil.lng, bas.lat, bas.lng);
  return km > Math.max(VARNA_OVER_KM, bas.radie_km) ? { lage: 'langt', km } : { lage: 'ok', km };
}

/** Läser bilens senaste position och basen, och bedömer. Kastar aldrig: fel ger 'okant'. */
export async function kontrolleraFramme(vin: string | null, nu: Date = new Date()): Promise<FrammeBedomning> {
  if (!vin) return { lage: 'okant', orsak: 'ingen_bil' };
  try {
    const [bilRes, posRes] = await Promise.all([
      supabase.from('lastbil').select('hemmabas_lat, hemmabas_lng, hemmabas_radie_m').eq('vin', vin).maybeSingle(),
      supabase.from('lastbil_logg').select('lat, lng, tidpunkt').eq('vin', vin).order('tidpunkt', { ascending: false }).limit(1),
    ]);
    if (bilRes.error || posRes.error) return { lage: 'okant', orsak: 'lasfel' };
    const bLat = tal(bilRes.data?.hemmabas_lat), bLng = tal(bilRes.data?.hemmabas_lng);
    const bas: Bas | null = bLat != null && bLng != null
      ? { lat: bLat, lng: bLng, radie_km: (tal(bilRes.data?.hemmabas_radie_m) ?? 300) / 1000 } : null;
    const p = posRes.data?.[0];
    const pLat = tal(p?.lat), pLng = tal(p?.lng);
    const bil: BilPosition | null = p && pLat != null && pLng != null && p.tidpunkt ? { lat: pLat, lng: pLng, tidpunkt: p.tidpunkt } : null;
    return bedomFramme(bil, bas, nu);
  } catch {
    return { lage: 'okant', orsak: 'lasfel' };
  }
}

/** "1,4 km" under 10 km, annars hela km. */
export function fmtAvstandKm(km: number): string {
  return km < 10 ? `${(Math.round(km * 10) / 10).toLocaleString('sv-SE')} km` : `${Math.round(km)} km`;
}
