'use client';
// Per-maskin "nu" + "nästa" för /oversikt-v2 — FÖRSLAG, aldrig order.
//
// Ren logik, Node-importerbar (dry-run kör EXAKT samma beraknaForslag mot live-data):
// ingen supabase-import, inga sidoeffekter. dagarSedan inlinad; PlatsForslag/SkordAggV2
// bara som typer.
//
// Klassificering på dim_maskin.maskin_typ ('Harvester'/'Forwarder'). Kolumnen `typ`
// FINNS INTE på dim_maskin (verifierat 2026-09-29) — gamla getMaskinTyp(m.typ) gav därför
// alla maskiner = skördare, så skotare fick planerade trakter. Nu: arSkotare(maskin_typ).
//
// Deconflict över ALLA maskiner av samma roll (girigt, närmast vinner): ett objekt får
// bara vara nästa för EN maskin. Skördare mot skördare, skotare mot skotare (aldrig
// korsvis — en planerad trakt och en backen-hög är olika objekt ändå).
//
// Exkludering: objekt utan bolag (egen skog / internt, t.ex. "Kompersmåla väggata")
// föreslås aldrig. Det finns INGEN exkludera-flagga i objekt-tabellen (verifierat) —
// bolag=null är signalen för "ej skarpt kundjobb".

import {
  foreslaNasta, type Kandidat, type MaskinLage, type MaskinTyp, type AvstandKm,
  type Koordinat, type Konfidens,
} from '@/lib/nastaObjekt';
import { paBackenKvar } from '@/lib/skotat';
import type { OversiktObjekt, MaskinKoItem } from '../oversikt/oversikt-types';
import type { PlatsForslag } from '../maskinflytt/senastePlats'; // type-only → ingen runtime-import
import type { SkordAggV2 } from './skord-data';

export type MaskinRad = {
  maskin_id: string;
  visningsnamn?: string | null;
  modell?: string | null;
  tillverkare?: string | null;
  typ?: string | null;
  maskin_typ?: string | null;
  aktiv_till?: string | null;
};

/** Hela dagar sedan ett datum/timestamp i lokal tid (inlinad ur senastePlats → modulen är ren). */
function dagarSedan(tidpunkt: string): number {
  const dag = tidpunkt.length <= 10 ? tidpunkt : new Date(tidpunkt).toLocaleDateString('sv-SE');
  const then = new Date(`${dag}T00:00:00`);
  const nu = new Date();
  const idag = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate());
  return Math.round((idag.getTime() - then.getTime()) / 86400000);
}

/** Skotare? Klassas på maskin_typ (Forwarder), med typ som reserv. Harvester/skördare → false. */
export function arSkotare(m: MaskinRad): boolean {
  const t = `${m.maskin_typ ?? ''} ${m.typ ?? ''}`.toLowerCase();
  return t.includes('forward') || t.includes('skot');
}

/** Aktiv (ej avställd/såld) idag? aktiv_till NULL eller >= idag (YYYY-MM-DD). */
export function maskinAktiv(m: MaskinRad, todayISO: string): boolean {
  return !m.aktiv_till || m.aktiv_till >= todayISO;
}

export interface MaskinForslag {
  maskinId: string;
  typ: MaskinTyp;
  koordinat: Koordinat | null;
  positionAlder: number | null;
  nuObjekt: OversiktObjekt | null;
  nasta: OversiktObjekt | null;
  skal: string;
  konfidens: Konfidens;
}

export function beraknaForslag(args: {
  maskiner: MaskinRad[];
  objekt: OversiktObjekt[];
  maskinKo: MaskinKoItem[];
  skord: Record<string, SkordAggV2>;
  oppenFaraByObjId: Set<string>;
  positions: Map<string, PlatsForslag>;
  avstandKm: AvstandKm;
}): Map<string, MaskinForslag> {
  const { maskiner, objekt, maskinKo, skord, oppenFaraByObjId, positions, avstandKm } = args;
  const objById = new Map<string, OversiktObjekt>(objekt.map((o) => [o.id, o]));

  // Kandidater = objekt med koordinat OCH bolag. Utan bolag = egen skog/internt → aldrig förslag.
  const kandidater: Kandidat[] = [];
  for (const o of objekt) {
    if (o.lat == null || o.lng == null) continue;
    if (!o.bolag) continue;
    const agg = o.vo_nummer ? skord[o.vo_nummer] : undefined;
    const skordat = agg?.skordat ?? 0;
    const skotat = agg?.skotat ?? null;
    const egenSkotning = agg?.egenSkotning ?? false;
    kandidater.push({
      key: o.id, namn: o.namn, status: o.status,
      koordinat: { lat: o.lat, lng: o.lng },
      skordat, backen: paBackenKvar(skordat, skotat, egenSkotning),
      backenPalitlig: skotat != null,
      legatDagar: agg?.sista ? dagarSedan(agg.sista) : null,
      skordareIds: [], attKora: o.status === 'planerad',
      oppenFara: oppenFaraByObjId.has(o.id),
      grotDeadline: o.grot_deadline ?? null, egenSkotning,
    });
  }

  const lageFor = (m: MaskinRad): MaskinLage => {
    const pos = positions.get(m.maskin_id);
    return {
      maskinId: m.maskin_id,
      typ: arSkotare(m) ? 'skotare' : 'skordare',
      koordinat: pos?.koordinat ?? null,
      nuvarandeObjektKey: pos?.objektId ?? null,
      positionAlderDagar: pos?.tidpunkt ? dagarSedan(pos.tidpunkt) : null,
    };
  };
  const nuObjektFor = (m: MaskinRad): OversiktObjekt | null => {
    const pos = positions.get(m.maskin_id);
    return pos?.objektId ? objById.get(pos.objektId) ?? null : null;
  };
  // Förmannens val (skördare): första planerade objektet i kön med koordinat + bolag.
  const formansVal = (maskinId: string): OversiktObjekt | null => {
    const ko = maskinKo.filter((k) => k.maskin_id === maskinId).sort((a, b) => a.ordning - b.ordning);
    for (const k of ko) {
      const o = objById.get(k.objekt_id);
      if (o && o.status === 'planerad' && o.lat != null && o.lng != null && o.bolag) return o;
    }
    return null;
  };

  const out = new Map<string, MaskinForslag>();
  const set = (m: MaskinRad, lage: MaskinLage, nasta: OversiktObjekt | null, skal: string, konfidens: Konfidens) =>
    out.set(m.maskin_id, { maskinId: m.maskin_id, typ: lage.typ, koordinat: lage.koordinat, positionAlder: lage.positionAlderDagar, nuObjekt: nuObjektFor(m), nasta, skal, konfidens });

  // Girig deconflict för maskiner av SAMMA roll: den vars topp-pick ligger närmast väljer
  // först, nästa maskin får sin bästa återstående (upptagna-nyckeln växer). initialTaken =
  // objekt redan pinnade (förmannens kö-val).
  const deconflict = (rad: MaskinRad[], initialTaken: string[]) => {
    const taken = [...initialTaken];
    const ordnad = rad
      .map((m) => {
        const lage = lageFor(m);
        const f0 = foreslaNasta(lage, kandidater, avstandKm, taken);
        const d = lage.koordinat && f0.vald?.koordinat ? avstandKm(lage.koordinat, f0.vald.koordinat) : null;
        return { m, lage, d: d ?? Infinity };
      })
      .sort((a, b) => a.d - b.d);
    for (const { m, lage } of ordnad) {
      const f = foreslaNasta(lage, kandidater, avstandKm, taken);
      const nasta = f.vald ? objById.get(f.vald.key) ?? null : null;
      if (f.vald) taken.push(f.vald.key);
      set(m, lage, nasta, f.skal, f.konfidens);
    }
  };

  // ── Skördare: förmannens kö-val pinnas, resten deconflictar mot pinnade + varandra ──
  const pinnade: string[] = [];
  const utanVal: MaskinRad[] = [];
  for (const m of maskiner.filter((x) => !arSkotare(x))) {
    const val = formansVal(m.maskin_id);
    if (val) { set(m, lageFor(m), val, 'Förmannens kö', 'hog'); pinnade.push(val.id); }
    else utanVal.push(m);
  }
  deconflict(utanVal, pinnade);

  // ── Skotare: girig deconflict (foreslaNasta filtrerar backenPalitlig → aldrig planerade) ──
  deconflict(maskiner.filter((m) => arSkotare(m)), []);

  return out;
}
