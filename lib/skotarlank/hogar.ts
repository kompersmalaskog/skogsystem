// Skotarlänken: produktionshögarna som det ligger kvar i dem, per trädslag. Ren funktion — ingen databas, ingen karta.
//
// SAMMA högar och SAMMA avdrag som planeringsvyn, i samma ordning:
//   1. klustraStammar (lib/produktionshogar) på skördarens stammar, i id-ordning som planeringen läser dem
//   2. draAvUttagFranHogar (lib/skotat): planerarens skotning_uttag (polygon + legacy)
//   3. hogarKvar + medMarkeringar (lib/skotarHogarKvar): appens skotarlass och förarnas "Tagen"/"Ligger kvar"
//
// Avdragen räknas per SORTIMENT (det lassen och uttagen bär). Trädslaget fås genom att klustra samma stammar en gång till med
// trädslaget i nyckeln: klustringen beror bara på stammarnas läge och ordning, så hög i ena körningen är hög i i den andra.
// Kvar per trädslag = det trädslagets volym i sortimentet × andelen av sortimentet som ligger kvar i högen.

import { klustraStammar, type HogStam } from '@/lib/produktionshogar';
import { draAvUttagFranHogar, type UttagRad } from '@/lib/skotat';
import { hogarKvar, medMarkeringar, type HogIn, type HogMarkering } from '@/lib/skotarHogarKvar';
import { tradslagFarg, tradslagLabel } from '@/lib/tradslag';
import type { Lass } from '@/lib/skotarLass/typer';

export type Stam = { lat: number; lng: number; volym: number; tradslag: string; sortiment: string | null };

export type HogTradslag = { namn: string; m3: number; farg: string };
export type SkotarHog = {
  lng: number;
  lat: number;
  /** m³fub kvar i högen (summan av trädslagen, avrundad till en decimal). */
  m3: number;
  /** störst först */
  tradslag: HogTradslag[];
  /** färgen = det trädslag som ligger mest av */
  farg: string;
};
export type HogarSvar = { hogar: SkotarHog[]; kvar: HogTradslag[]; kvarM3: number; skordatM3: number };

const SEP = '\u0001';
const OKANT_SORT = '(okänt sortiment)';
const sortNamn = (s: string | null) => (s && s.trim() ? s : OKANT_SORT);

/** Högarna med det som ligger kvar. Tomma högar (under 0,05 m³) finns inte med. */
export function skotarHogar(stammar: readonly Stam[], uttag: readonly UttagRad[], lass: readonly Lass[], markeringar: readonly HogMarkering[]): HogarSvar {
  const bas: HogStam[] = stammar.map((s) => ({ lat: s.lat, lng: s.lng, total_volym: s.volym, tradslag: tradslagLabel(s.tradslag), sortiment: sortNamn(s.sortiment) }));
  const perSort = klustraStammar(bas);
  const perTsSort = klustraStammar(bas.map((s) => ({ ...s, sortiment: `${s.tradslag}${SEP}${s.sortiment}` })));
  if (perSort.length !== perTsSort.length) throw new Error('högarna gick inte att para ihop');

  // 2. Planerarens uttag — högarna bär sitt index så att de går att para ihop efteråt (tömda högar försvinner ur listan).
  const features = perSort.map((k, i) => ({
    geometry: { coordinates: [k.lng, k.lat] },
    properties: { i, volym: k.volym, sortimentVolymJson: JSON.stringify(k.sortimentVolym) },
  }));
  const efterUttag = draAvUttagFranHogar(features, [...uttag]);

  // 3. Lassen och förarnas markeringar.
  const hogIn: HogIn[] = efterUttag.map((f) => ({ lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], sortimentVolym: JSON.parse(f.properties.sortimentVolymJson || '{}') }));
  const kvar = medMarkeringar(hogIn, hogarKvar(hogIn, lass), markeringar);

  const total = new Map<string, number>();
  const hogar: SkotarHog[] = [];
  efterUttag.forEach((f, j) => {
    const i = f.properties.i as number;
    const fore = perSort[i].sortimentVolym;
    const delar = perTsSort[i].sortimentVolym;
    const per = new Map<string, number>();
    for (const [nyckel, v] of Object.entries(delar)) {
      const [ts, sort] = nyckel.split(SEP);
      const andel = fore[sort] > 0 ? Math.max(0, Math.min(1, (kvar[j].kvar[sort] ?? 0) / fore[sort])) : 0;
      per.set(ts, (per.get(ts) ?? 0) + v * andel);
    }
    for (const [ts, v] of per) total.set(ts, (total.get(ts) ?? 0) + v);
    const tradslag = [...per].map(([namn, v]) => ({ namn, m3: Math.round(v * 10) / 10, farg: tradslagFarg(namn) })).filter((t) => t.m3 > 0).sort((a, b) => b.m3 - a.m3);
    const m3 = Math.round(tradslag.reduce((s, t) => s + t.m3, 0) * 10) / 10;
    if (m3 < 0.05) return;
    hogar.push({ lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], m3, tradslag, farg: tradslag[0].farg });
  });

  // Hela trakten: hela m³ per trädslag, summan av de avrundade (raderna går att räkna ihop).
  const kvarRader = [...total].map(([namn, v]) => ({ namn, m3: Math.round(v), farg: tradslagFarg(namn) })).filter((t) => t.m3 > 0).sort((a, b) => b.m3 - a.m3);
  const skordat = stammar.reduce((s, x) => s + (x.volym || 0), 0);
  return { hogar, kvar: kvarRader, kvarM3: kvarRader.reduce((s, t) => s + t.m3, 0), skordatM3: Math.round(skordat) };
}
