// Var står maskinen? — och hur långt är det dit? Ren logik; läsningen ligger i useHamtaData.
//
// Maskinens position är den NYASTE av tre källor, med sin källa och sin ålder utskrivna:
//   gps     maskinens eget GPS-spår (detalj_gps_spar, eller hyttspår från appen på maskindatorn)
//   plats   senast kända plats ur flytt/produktion/maskin_position (senastePlats.ts) — H8E har datorn avstängd under
//           transport, 810E rapporteras för hand: där är platsen ett "senast känt", inte en mätning
// Nyast vinner, inte "GPS före allt": en maskin som flyttats efter sin sista GPS-punkt står där flytten lämnade den.
//
// Äldre än 3 dygn är OSÄKER: den visas ändå (en bortgömd position är också en lögn) men märks, och sorteras inte som en
// färsk. Saknas position helt är maskinen kvar i listan utan avstånd — föraren får peka ut var den står.

import { haversine } from '@/utils/geo';
import { rimligGpsPunkt } from '@/app/maskinflytt/senastePlats';

export const OSAKER_EFTER_MS = 3 * 24 * 3600 * 1000;

export type PosKalla = 'gps' | 'plats';

export interface Punkt { lat: number; lng: number }
export interface KandidatPos extends Punkt {
  /** Verkligt ögonblick (ms sedan epoch) — null när källan bara har ett datum utan klockslag. */
  tidMs: number | null;
  kalla: PosKalla;
  /** Källans egen text om platsen ("Bågskyttebanan RP") — GPS-punkter har ingen. */
  namn?: string | null;
  objektId?: string | null;
  platsId?: string | null;
  /** Källan själv varnar (äldre än 30 dygn): räknas alltid som osäker. */
  osaker?: boolean;
}
export interface MaskinPos extends KandidatPos { osaker: boolean }

/** Nyast vinner. Punkter utanför Norden (null-ön, trasiga fixar) räknas aldrig; tid saknas = äldst. */
export function valjMaskinPos(kandidater: readonly (KandidatPos | null)[], nuMs: number): MaskinPos | null {
  const giltiga = kandidater.filter((k): k is KandidatPos => !!k && rimligGpsPunkt(k.lat, k.lng));
  if (!giltiga.length) return null;
  const nyast = [...giltiga].sort((a, b) => (b.tidMs ?? -Infinity) - (a.tidMs ?? -Infinity))[0];
  const gammal = nyast.tidMs == null || nuMs - nyast.tidMs > OSAKER_EFTER_MS;
  return { ...nyast, osaker: gammal || !!nyast.osaker };
}

export interface MaskinMedPos {
  maskin_id: string;
  namn: string;
  maskin_typ: string | null;
  slag: 'skordare' | 'skotare' | null;
  pos: MaskinPos | null;
}

export interface MaskinRad extends MaskinMedPos {
  /** Fågelväg i km från lastbilen (eller telefonen) — null när maskinen eller utgångspunkten saknar position. */
  km: number | null;
}

/** Närmast först. Maskiner utan avstånd sist, på namn — aldrig gömda. Osäkra positioner sorteras på samma avstånd
 *  men märks i raden; en osäker position får inte tränga undan en färsk som står lika långt bort. */
export function sorteraMaskiner(maskiner: readonly MaskinMedPos[], fran: Punkt | null): MaskinRad[] {
  const rader: MaskinRad[] = maskiner.map(m => ({
    ...m,
    km: fran && m.pos ? haversine(fran.lat, fran.lng, m.pos.lat, m.pos.lng) : null,
  }));
  return rader.sort((a, b) => {
    if (a.km != null && b.km != null) return (a.km - b.km) || (Number(a.pos!.osaker) - Number(b.pos!.osaker)) || a.namn.localeCompare(b.namn, 'sv');
    if (a.km != null) return -1;
    if (b.km != null) return 1;
    return a.namn.localeCompare(b.namn, 'sv');
  });
}

/** "8,7 km" / "48 km" — fågelväg, avrundad; under 10 km med en decimal. Listan skriver inget "≈": fotnoten säger att det är fågelväg. */
export function avstandKort(km: number): string {
  return km < 10 ? `${(Math.round(km * 10) / 10).toLocaleString('sv-SE')} km` : `${Math.round(km)} km`;
}

const MAN = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

/** Datum utan klockslag: "7 okt". */
export function datumText(isoDatum: string): string {
  const [, m, d] = isoDatum.slice(0, 10).split('-').map(Number);
  return `${d} ${MAN[m - 1]}`;
}

/** "Plats osäker · senast 31 aug" — tidsraden i maskinlistan. Visas BARA när positionen är osäker; utan tid står bara "Plats osäker". */
export function osakerRad(pos: MaskinPos): string {
  if (pos.tidMs == null) return 'Plats osäker';
  const d = Object.fromEntries(new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', day: 'numeric', month: 'numeric' }).formatToParts(new Date(pos.tidMs)).map(p => [p.type, p.value]));
  return `Plats osäker · senast ${Number(d.day)} ${MAN[Number(d.month) - 1]}`;
}
