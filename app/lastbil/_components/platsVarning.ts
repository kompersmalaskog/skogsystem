// Ett valt ställe som ligger långt från där bilen faktiskt var: en varning med avståndet, aldrig en spärr
// (koordinaterna är mätta och rörs inte av en rättning).

import { avstandKm, type PlatsData } from './usePlatsData';

/** Längre än så från där bilen lämnade/hämtade maskinen: valet kan vara fel, och sheeten säger det. */
export const VARNA_OVER_KM = 2;

type Val = { objekt: string | null; plats: string | null };

/** "Tjuvön AU 2026 ligger 112 km från där bilen lämnade maskinen. Stämmer valet?" — eller null. */
export function platsVarning(
  valt: Val, fore: Val, punkt: { lat: number | null; lng: number | null }, ord: string, data: PlatsData | null,
): string | null {
  if (!data || punkt.lat == null || punkt.lng == null) return null;
  if (valt.objekt === fore.objekt && valt.plats === fore.plats) return null;
  const k = data.platser.find(x => (x.slag === 'objekt' ? x.id === valt.objekt : x.id === valt.plats));
  if (!k || k.lat == null || k.lng == null) return null;
  const km = avstandKm({ lat: punkt.lat, lng: punkt.lng }, { lat: k.lat, lng: k.lng });
  return km > VARNA_OVER_KM ? `${k.namn} ligger ${Math.round(km).toLocaleString('sv-SE')} km från ${ord}. Stämmer valet?` : null;
}
