// Skotarlänken: produktionshögarna som det ligger kvar i dem, per SORTIMENT (Martin 2026-11-06: sortimenten, inte trädslagen). Ren funktion — ingen databas, ingen karta.
//
// SAMMA högar och SAMMA avdrag som planeringsvyn, i samma ordning:
//   1. klustraStammar (lib/produktionshogar) på skördarens stammar, i id-ordning som planeringen läser dem
//   2. draAvUttagFranHogar (lib/skotat): planerarens skotning_uttag (polygon + legacy)
//   3. hogarKvar + medMarkeringar (lib/skotarHogarKvar): appens skotarlass och förarnas "Tagen"/"Ligger kvar"
//
// Avdragen räknas per sortiment (det lassen och uttagen bär), så det som visas är exakt det som räknas.

import { klustraStammar, type HogStam } from '@/lib/produktionshogar';
import { draAvUttagFranHogar, type UttagRad } from '@/lib/skotat';
import { FULL_STYRKA, HOG_PRICK_FARG, hogarIOmrade, hogarKvar, medMarkeringar, type OmradeSvar, REST_ANDEL, REST_M3, REST_STYRKA, type HogIn, type HogMarkering } from '@/lib/skotarHogarKvar';
import { tradslagLabel } from '@/lib/tradslag';
import type { Lass } from '@/lib/skotarLass/typer';

export type Stam = { lat: number; lng: number; volym: number; tradslag: string; sortiment: string | null };

/** Ett sortiment i en hög eller på trakten. `namn` = skördarens sortimentsnamn (nyckeln), `visning` = namnet i klartext ("Kubb · Alvesta"). */
export type HogSortiment = { namn: string; visning: string; m3: number };
export type SkotarHog = {
  lng: number;
  lat: number;
  /** m³fub kvar i högen (summan av sortimenten, avrundad till en decimal). */
  m3: number;
  /** störst först */
  sortiment: HogSortiment[];
  /** prickens färg: samma ljusa som maskinernas skotarläge (HOG_PRICK_FARG.alla) */
  farg: string;
  /** prickens styrka: en hög där lassen tagit huvuddelen är en rest och nästan osynlig, som i skotarläget */
  a: number;
};
export type HogarSvar = { hogar: SkotarHog[]; kvar: HogSortiment[]; kvarM3: number; skordatM3: number };

const OKANT_SORT = '(okänt sortiment)';
const sortNamn = (s: string | null) => (s && s.trim() ? s : OKANT_SORT);
const basStammar = (stammar: readonly Stam[]): HogStam[] =>
  stammar.map((s) => ({ lat: s.lat, lng: s.lng, total_volym: s.volym, tradslag: tradslagLabel(s.tradslag), sortiment: sortNamn(s.sortiment) }));

/** Steg 1–2: högarna per sortiment efter planerarens uttag, som features (samma form som planeringsvyns högar). Varje hög bär sitt index `i`. */
function hogarEfterUttag(perSort: ReturnType<typeof klustraStammar>, uttag: readonly UttagRad[]) {
  const features = perSort.map((k, i) => ({
    geometry: { coordinates: [k.lng, k.lat] },
    properties: { i, volym: k.volym, sortimentVolymJson: JSON.stringify(k.sortimentVolym) },
  }));
  return draAvUttagFranHogar(features, [...uttag]);
}

/**
 * RITA RUNT: det som ligger kvar i högarna inne i ringen, per sortimentgrupp. SAMMA uträkning som skotarlägets "Högar i ett område"
 * (lib/skotarHogarKvar hogarIOmrade) på samma högar som kartan visar.
 */
export function skotarOmrade(stammar: readonly Stam[], uttag: readonly UttagRad[], lass: readonly Lass[], markeringar: readonly HogMarkering[], ring: readonly [number, number][]): OmradeSvar {
  return hogarIOmrade(hogarEfterUttag(klustraStammar(basStammar(stammar)), uttag), lass, markeringar, ring);
}

/** Högarna med det som ligger kvar, per sortiment. Tomma högar (under 0,05 m³) finns inte med. `visa` ger sortimentets namn i klartext. */
export function skotarHogar(stammar: readonly Stam[], uttag: readonly UttagRad[], lass: readonly Lass[], markeringar: readonly HogMarkering[], visa: (namn: string) => string = (n) => n): HogarSvar {
  const efterUttag = hogarEfterUttag(klustraStammar(basStammar(stammar)), uttag);
  const hogIn: HogIn[] = efterUttag.map((f) => ({ lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], sortimentVolym: JSON.parse(f.properties.sortimentVolymJson || '{}') }));
  const kvar = medMarkeringar(hogIn, hogarKvar(hogIn, lass), markeringar);
  const visning = (n: string) => (n === OKANT_SORT ? 'Okänt sortiment' : visa(n) || n);

  const total = new Map<string, number>();
  const hogar: SkotarHog[] = [];
  efterUttag.forEach((f, j) => {
    const sortiment = Object.entries(kvar[j].kvar)
      .map(([namn, v]) => ({ namn, visning: visning(namn), m3: Math.round(Math.max(0, v) * 10) / 10 }))
      .filter((x) => x.m3 > 0).sort((a, b) => b.m3 - a.m3);
    for (const [namn, v] of Object.entries(kvar[j].kvar)) if (v > 0) total.set(namn, (total.get(namn) ?? 0) + v);
    const m3 = Math.round(sortiment.reduce((s, x) => s + x.m3, 0) * 10) / 10;
    if (m3 < 0.05) return;
    // Samma regel som skotarlägets prickar (lib/skotarHogarKvar hogPrickar): det som låg i högen före lassen mot det som ligger kvar.
    const fore0 = Object.values(hogIn[j].sortimentVolym).reduce((s, x) => s + Math.max(0, x), 0);
    const kvar0 = kvar[j].totalt;
    const rest = fore0 - kvar0 > 0.05 && (kvar0 < REST_M3 || kvar0 < fore0 * REST_ANDEL);
    hogar.push({ lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], m3, sortiment, farg: HOG_PRICK_FARG.alla, a: rest ? REST_STYRKA : FULL_STYRKA });
  });

  // Hela trakten: hela m³ per sortiment, summan av de avrundade (raderna går att räkna ihop).
  const kvarRader = [...total].map(([namn, v]) => ({ namn, visning: visning(namn), m3: Math.round(v) })).filter((t) => t.m3 > 0).sort((a, b) => b.m3 - a.m3);
  const skordat = stammar.reduce((s, x) => s + (x.volym || 0), 0);
  return { hogar, kvar: kvarRader, kvarM3: kvarRader.reduce((s, t) => s + t.m3, 0), skordatM3: Math.round(skordat) };
}
