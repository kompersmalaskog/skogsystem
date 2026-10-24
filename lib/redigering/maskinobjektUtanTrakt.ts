// MASKINOBJEKT UTAN TRAKT (Martin 2026-10-24: "den måste bli mycket enklare, vyn just nu är jätte rörig").
//
// Den gamla vyn Matchning visade 78 maskinobjekt "utan planering" med tre stora knappar på varje. 77 av dem var
// avslutade jobb från tiden innan planeringen fanns, och Mölleryd stod överst fast den var kopplad (vyn kände bara VO-
// likhet, inte extra nummer). Dessutom skrev Koppla över objekt.dim_objekt_id — en trakt med skördarens OCH skotarens
// maskinobjekt kunde bara peka på ett.
//
// Nu: ett maskinobjekt som en maskin kört på de senaste 30 dagarna är en fråga i Behöver dig ("Vilken trakt hör det
// till?"), samma ark som maskinfilerna. Äldre ligger tyst bakom raden "Äldre maskinfiler". Koppla = maskinobjektets
// nummer blir ett EXTRA nummer på trakten (samma väg som filerna) — ingenting skrivs över.

import { arAktuell } from './filerUtanObjekt';
import type { AltNummerRad } from '@/lib/objektNummer';

export interface MaskinobjektRad {
  objektId: string;
  namn: string | null;
  voNummer: string | null;
  senasteAktivitet: string | null;
  skordatM3: number;
  skotatM3: number;
  maskiner?: { id: string; modell: string | null }[];
  maskinModell?: string | null;
}

/** Bara nummer som extra nummer-tabellen tar emot (siffror) kan kopplas härifrån. */
export const KAN_KOPPLAS = /^\d+$/;

const norm = (s: unknown) => String(s ?? '').trim();

/**
 * Dela maskinobjekten: frågor nu (kört inom 30 dagar, nummer som går att koppla) och hur många som ligger tysta.
 * Bort helt: de vars nummer redan är ett extra nummer på en trakt (de är kopplade — Mölleryd) och de vars nummer
 * redan står som en maskinfil utan objekt (samma sak ska inte frågas två gånger).
 */
export function delaMaskinobjekt(
  rader: readonly MaskinobjektRad[],
  alias: readonly AltNummerRad[],
  filIdent: ReadonlySet<string>,
  idag: Date,
): { aktuella: MaskinobjektRad[]; tysta: MaskinobjektRad[] } {
  const extra = new Set(alias.filter(a => !a.maskin_id).map(a => norm(a.nummer)));
  const aktuella: MaskinobjektRad[] = [];
  const tysta: MaskinobjektRad[] = [];
  for (const r of rader) {
    const vo = norm(r.voNummer);
    if (vo && (extra.has(vo) || filIdent.has(vo))) continue;
    if (KAN_KOPPLAS.test(vo) && arAktuell(r.senasteAktivitet, idag)) aktuella.push(r);
    else tysta.push(r);
  }
  const senast = (a: MaskinobjektRad, b: MaskinobjektRad) => norm(b.senasteAktivitet).localeCompare(norm(a.senasteAktivitet));
  return { aktuella: aktuella.sort(senast), tysta: tysta.sort(senast) };
}

/** "300 m³ skotat", "8 m³ skördat · 8 m³ skotat", eller null. */
export function mangdText(r: Pick<MaskinobjektRad, 'skordatM3' | 'skotatM3'>): string | null {
  const d = [
    r.skordatM3 > 0 ? `${Math.round(r.skordatM3).toLocaleString('sv-SE')} m³ skördat` : null,
    r.skotatM3 > 0 ? `${Math.round(r.skotatM3).toLocaleString('sv-SE')} m³ skotat` : null,
  ].filter(Boolean);
  return d.length ? d.join(' · ') : null;
}

/** Maskinernas namn: "Giant, Elefant 26". */
export function maskinText(r: MaskinobjektRad): string {
  const m = (r.maskiner ?? []).map(x => x.modell || x.id).filter(Boolean);
  return m.length ? m.join(', ') : (r.maskinModell || 'Maskin');
}

/** Raden som skrivs till objekt_alt_nummer. null = numret går inte att koppla härifrån. */
export function altNummerForMaskinobjekt(r: MaskinobjektRad, objektUuid: string): { objekt_id: string; nummer: string; maskin_id: null; kalla: 'manuell'; filnamn: null } | null {
  const vo = norm(r.voNummer);
  if (!KAN_KOPPLAS.test(vo)) return null;
  return { objekt_id: objektUuid, nummer: vo, maskin_id: null, kalla: 'manuell', filnamn: null };
}
