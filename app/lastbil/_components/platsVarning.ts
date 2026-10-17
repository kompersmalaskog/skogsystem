// Ett valt ställe som ligger långt från där bilen faktiskt var, och/eller en sträcka som räknades från den gamla
// trakten: EN mening under raden som ändrats, aldrig en spärr (koordinaterna är mätta och rörs inte av en rättning).

import { avstandKm, type PlatsData } from './usePlatsData';

/** Längre än så från där bilen lämnade/hämtade maskinen: valet kan vara fel, och sheeten säger det. */
export const VARNA_OVER_KM = 2;

type Val = { objekt: string | null; plats: string | null };

/** Valt ställe som ligger för långt från där bilen var: namnet och avståndet. */
export interface PlatsAvstand { namn: string; km: number }

/** Är det valda stället långt från punkten där bilen faktiskt var? Null = nej, eller kan inte avgöras (aldrig en gissning). */
export function platsAvstand(
  valt: Val, fore: Val, punkt: { lat: number | null; lng: number | null }, data: PlatsData | null,
): PlatsAvstand | null {
  if (!data || punkt.lat == null || punkt.lng == null) return null;
  if (valt.objekt === fore.objekt && valt.plats === fore.plats) return null;
  const k = data.platser.find(x => (x.slag === 'objekt' ? x.id === valt.objekt : x.id === valt.plats));
  if (!k || k.lat == null || k.lng == null) return null;
  const km = avstandKm({ lat: punkt.lat, lng: punkt.lng }, { lat: k.lat, lng: k.lng });
  return km > VARNA_OVER_KM ? { namn: k.namn, km } : null;
}

const hela = (km: number) => Math.round(km).toLocaleString('sv-SE');

/**
 * Allt som är värt att säga om en ändrad trakt, som EN text:
 *   "Bjällerhult ligger 6 km från där maskinen lämnades, och sträckan 15 km räknades från Åbogen. Stämmer valet?"
 * `avstand`: de ändrade ändarna som ligger långt från där bilen var (med sitt ord: "där maskinen hämtades" / "där maskinen lämnades"). `koord`: sträckan
 * räknades från de gamla traktpunkterna (`maskin_flytt.koord_kalla = 'objekt'`) — `matt` är den mätta sträckan, `gamla`
 * namnen på de ändrade ändarnas gamla trakter.
 */
export function traktMeddelande(del: {
  avstand: readonly { namn: string; km: number; ord: string }[];
  koord: { matt: number | null; gamla: readonly string[] } | null;
}): string | null {
  const delar = del.avstand.map(a => `${a.namn} ligger ${hela(a.km)} km från ${a.ord}`);
  if (del.koord && del.koord.gamla.length > 0) {
    const sträcka = del.koord.matt != null ? `sträckan ${hela(del.koord.matt)} km` : 'sträckan';
    delar.push(`${sträcka} räknades från ${del.koord.gamla.join(' och ')}`);
  }
  if (delar.length === 0) return null;
  const text = delar.join(', och ');
  return `${text[0].toLocaleUpperCase('sv')}${text.slice(1)}. Stämmer valet?`;
}
