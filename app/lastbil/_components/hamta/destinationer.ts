// "Vart ska <maskin>?" — trakter som väntar på maskinens typ överst, sedan övriga aktiva trakter, sedan platser.
// Avslutade trakter göms men går att hitta via sök (skotaren hämtar ibland det sista virket från en avslutad trakt).
//
// "Väntar på maskinen": en skördare väntas på trakter där ingen skördare står eller där den här maskinen är planerad;
// en skotare på trakter där ingen skotare står eller där den här maskinen är planerad. Står en ANNAN maskin av samma typ
// på trakten är den inte "väntande" för den här — den hamnar under övriga. Appen gissar inget mer än så.

import { maskinSlag } from '@/lib/maskinNamn';
import { haversine } from '@/utils/geo';

export interface DestObjekt {
  id: string;
  namn: string;
  vo_nummer: string | null;
  dim_objekt_id: string | null;
  status: string | null;
  lat: number | null;
  lng: number | null;
  larmkoordinat_lat: number | null;
  larmkoordinat_lng: number | null;
  larmkoordinat_bekraftad: boolean | null;
  skordare_maskin_id: string | null;
  skotare_maskin_id: string | null;
}

export const DEST_OBJEKT_FALT =
  'id, namn, vo_nummer, dim_objekt_id, status, lat, lng, larmkoordinat_lat, larmkoordinat_lng, larmkoordinat_bekraftad, skordare_maskin_id, skotare_maskin_id';

export interface DestPlats { id: string; namn: string; typ: string; lat: number | null; lng: number | null }

export type DestRad =
  | { typ: 'objekt'; objekt: DestObjekt; sub: string; grupp: DestGrupp }
  | { typ: 'plats'; plats: DestPlats; sub: string; grupp: 'platser' };

export type DestGrupp = 'vantar' | 'ovriga' | 'platser' | 'avslutade';

export const GRUPP_RUBRIK: Record<DestGrupp, string> = {
  vantar: 'Väntar på maskinen', ovriga: 'Andra trakter', platser: 'Platser', avslutade: 'Avslutade trakter',
};

const PLATS_TYP: Record<string, string> = { verkstad: 'Verkstad', uppstallning: 'Uppställning', gard: 'Gård', kund: 'Kund', annat: 'Annat' };

const arAktiv = (s: string | null | undefined) => s === 'pagaende' || s === 'planerad' || s === 'oplanerad';
const statusText = (s: string | null) => (s === 'pagaende' ? 'Pågår' : s === 'oplanerad' ? 'Oplanerad' : s === 'planerad' ? 'Planerad' : 'Avslutad');

/** Koordinaten maskinen ska köras till: bekräftad larmkoordinat (avlägget), annars trakten. null = saknas, då väljs punkten på kartan. */
export function destKoordinat(o: Pick<DestObjekt, 'lat' | 'lng' | 'larmkoordinat_lat' | 'larmkoordinat_lng' | 'larmkoordinat_bekraftad'>): { lat: number; lng: number; kalla: 'larmkoordinat' | 'objekt' } | null {
  if (o.larmkoordinat_bekraftad && o.larmkoordinat_lat != null && o.larmkoordinat_lng != null) {
    return { lat: o.larmkoordinat_lat, lng: o.larmkoordinat_lng, kalla: 'larmkoordinat' };
  }
  if (o.lat != null && o.lng != null) return { lat: o.lat, lng: o.lng, kalla: 'objekt' };
  return null;
}

export function rangordnaDestinationer(
  objekt: readonly DestObjekt[],
  platser: readonly DestPlats[],
  maskin: { maskin_id: string; maskin_typ: string | null } | null,
  sok: string,
): DestRad[] {
  const slag = maskinSlag(maskin?.maskin_typ);
  const t = sok.trim().toLowerCase();
  const traffar = (namn: string, vo?: string | null) => !t || namn.toLowerCase().includes(t) || (vo ?? '').toLowerCase().includes(t);
  const platsAv = (o: DestObjekt) => (slag === 'skordare' ? o.skordare_maskin_id : slag === 'skotare' ? o.skotare_maskin_id : null);

  const rader: DestRad[] = [];
  for (const o of objekt) {
    if (!traffar(o.namn, o.vo_nummer)) continue;
    if (!arAktiv(o.status)) {
      // Avslutade syns bara när man söker.
      if (t) rader.push({ typ: 'objekt', objekt: o, sub: `${o.vo_nummer ?? '—'} · Avslutad`, grupp: 'avslutade' });
      continue;
    }
    const redan = platsAv(o);
    const planerad = !!maskin && redan === maskin.maskin_id;
    const vantar = !!slag && (planerad || !redan);
    const sub = planerad
      ? `Planerad för den här maskinen · ${statusText(o.status)}`
      : `${o.vo_nummer ?? '—'} · ${statusText(o.status)}${redan && !planerad ? ' · maskin finns redan' : ''}`;
    rader.push({ typ: 'objekt', objekt: o, sub, grupp: vantar ? 'vantar' : 'ovriga' });
  }
  for (const p of platser) {
    if (traffar(p.namn)) rader.push({ typ: 'plats', plats: p, sub: PLATS_TYP[p.typ] ?? 'Plats', grupp: 'platser' });
  }

  const ordning: Record<DestGrupp, number> = { vantar: 0, ovriga: 1, platser: 2, avslutade: 3 };
  const namnAv = (r: DestRad) => (r.typ === 'objekt' ? r.objekt.namn : r.plats.namn);
  const planeradHar = (r: DestRad) => (r.typ === 'objekt' && maskin && platsAv(r.objekt) === maskin.maskin_id ? 0 : 1);
  return rader.sort((a, b) =>
    ordning[a.grupp] - ordning[b.grupp]
    || planeradHar(a) - planeradHar(b)
    || namnAv(a).localeCompare(namnAv(b), 'sv'));
}

export interface NaraPlats { namn: string; objektId: string | null; platsId: string | null }

/** Trakten/platsen en punkt ligger vid (inom `radieKm`), annars null — "står på Bågskyttebanan RP". Aktiva trakter går före
 *  avslutade på i stort sett lika avstånd; en punkt utan något i närheten får inget namn (aldrig en gissning). */
export function narmastePlats(
  p: { lat: number; lng: number },
  objekt: readonly DestObjekt[],
  platser: readonly DestPlats[],
  radieKm = 1.5,
): NaraPlats | null {
  let bast: (NaraPlats & { km: number }) | null = null;
  const kolla = (rad: NaraPlats, lat: number | null, lng: number | null, aktiv: boolean) => {
    if (lat == null || lng == null) return;
    const km = haversine(p.lat, p.lng, lat, lng) + (aktiv ? 0 : 0.05);
    if (km <= radieKm && (!bast || km < bast.km)) bast = { ...rad, km };
  };
  for (const o of objekt) {
    const k = destKoordinat(o);
    kolla({ namn: o.namn, objektId: o.id, platsId: null }, k?.lat ?? null, k?.lng ?? null, arAktiv(o.status));
  }
  for (const pl of platser) kolla({ namn: pl.namn, objektId: null, platsId: pl.id }, pl.lat, pl.lng, true);
  if (!bast) return null;
  const { namn, objektId, platsId } = bast as NaraPlats;
  return { namn, objektId, platsId };
}
