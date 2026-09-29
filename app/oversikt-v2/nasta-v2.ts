'use client';
// Per-maskin "nu" + "nästa" för /oversikt-v2 — bygger Kandidat[] och kör
// lib/nastaObjekt.foreslaNasta. FÖRSLAG, aldrig order (feedback_app_underlag_inte_order).
//
// Ren logik: all data injiceras (objekt, kö, skörd, faror, positioner, avståndsfunktion).
// Avstånd = haversine här (snabbt, för rangordning); komponenten hämtar OSRM-körväg för
// den valda sträckans km-etikett separat — samma mönster som "Härnäst närmast".
//
// Skördare: förmannens kö-val (första planerade objektet i maskinens maskin_ko) om det
//           finns, annars libet (närmaste planerade utan öppen fara).
// Skotare:  libets backen-viktade förslag, med deconflict så två skotare aldrig får samma
//           hög — närmast vinner, den andra får sin näst bästa.

import {
  foreslaNasta, type Kandidat, type MaskinLage, type MaskinTyp, type AvstandKm,
  type Koordinat, type Konfidens,
} from '@/lib/nastaObjekt';
import { paBackenKvar } from '@/lib/skotat';
import { getMaskinTyp } from '../oversikt/oversikt-utils';
import type { OversiktObjekt, Maskin, MaskinKoItem } from '../oversikt/oversikt-types';
import { dagarSedan, type PlatsForslag } from '../maskinflytt/senastePlats';
import type { SkordAggV2 } from './skord-data';

export interface MaskinForslag {
  maskinId: string;
  typ: MaskinTyp;                 // 'skordare' | 'skotare'
  koordinat: Koordinat | null;    // maskinens position (senastePlats, objekt-nivå)
  positionAlder: number | null;   // positionssignalens ålder i dagar
  nuObjekt: OversiktObjekt | null; // objektet maskinen står på nu
  nasta: OversiktObjekt | null;    // föreslaget nästa objekt (km beräknas separat)
  skal: string;                    // motivering (ur libet eller "Förmannens kö")
  konfidens: Konfidens;
}

export function beraknaForslag(args: {
  maskiner: Maskin[];
  objekt: OversiktObjekt[];
  maskinKo: MaskinKoItem[];
  skord: Record<string, SkordAggV2>;
  oppenFaraByObjId: Set<string>;      // objekt.id med ≥1 fara-markering
  positions: Map<string, PlatsForslag>;
  avstandKm: AvstandKm;               // haversine (from, to) => km
}): Map<string, MaskinForslag> {
  const { maskiner, objekt, maskinKo, skord, oppenFaraByObjId, positions, avstandKm } = args;

  const objById = new Map<string, OversiktObjekt>(objekt.map((o) => [o.id, o]));

  // Kandidat[] — alla objekt med koordinat, berikade med skörd/skotat + fara.
  const kandidater: Kandidat[] = [];
  for (const o of objekt) {
    if (o.lat == null || o.lng == null) continue;
    const agg = o.vo_nummer ? skord[o.vo_nummer] : undefined;
    const skordat = agg?.skordat ?? 0;
    const skotat = agg?.skotat ?? null;
    const egenSkotning = agg?.egenSkotning ?? false;
    kandidater.push({
      key: o.id,
      namn: o.namn,
      status: o.status,
      koordinat: { lat: o.lat, lng: o.lng },
      skordat,
      backen: paBackenKvar(skordat, skotat, egenSkotning),
      backenPalitlig: skotat != null,             // har skotdata ⇒ backen går att lita på
      legatDagar: agg?.sista ? dagarSedan(agg.sista) : null,
      skordareIds: [],
      attKora: o.status === 'planerad',
      oppenFara: oppenFaraByObjId.has(o.id),
      grotDeadline: o.grot_deadline ?? null,
      egenSkotning,
    });
  }

  const lageFor = (m: Maskin): MaskinLage => {
    const pos = positions.get(m.maskin_id);
    return {
      maskinId: m.maskin_id,
      typ: getMaskinTyp(m.typ) === 'skotare' ? 'skotare' : 'skordare',
      koordinat: pos?.koordinat ?? null,
      nuvarandeObjektKey: pos?.objektId ?? null,
      positionAlderDagar: pos?.tidpunkt ? dagarSedan(pos.tidpunkt) : null,
    };
  };
  const nuObjektFor = (m: Maskin): OversiktObjekt | null => {
    const pos = positions.get(m.maskin_id);
    return pos?.objektId ? objById.get(pos.objektId) ?? null : null;
  };

  // Förmannens val (skördare): första planerade objektet i maskinens kö med koordinat.
  const formansVal = (maskinId: string): OversiktObjekt | null => {
    const ko = maskinKo.filter((k) => k.maskin_id === maskinId).sort((a, b) => a.ordning - b.ordning);
    for (const k of ko) {
      const o = objById.get(k.objekt_id);
      if (o && o.status === 'planerad' && o.lat != null && o.lng != null) return o;
    }
    return null;
  };

  const out = new Map<string, MaskinForslag>();

  // ── Skördare ──
  for (const m of maskiner.filter((x) => getMaskinTyp(x.typ) !== 'skotare')) {
    const lage = lageFor(m);
    const val = formansVal(m.maskin_id);
    if (val) {
      out.set(m.maskin_id, {
        maskinId: m.maskin_id, typ: 'skordare', koordinat: lage.koordinat,
        positionAlder: lage.positionAlderDagar, nuObjekt: nuObjektFor(m),
        nasta: val, skal: 'Förmannens kö', konfidens: 'hog',
      });
    } else {
      const f = foreslaNasta(lage, kandidater, avstandKm, []);
      out.set(m.maskin_id, {
        maskinId: m.maskin_id, typ: 'skordare', koordinat: lage.koordinat,
        positionAlder: lage.positionAlderDagar, nuObjekt: nuObjektFor(m),
        nasta: f.vald ? objById.get(f.vald.key) ?? null : null, skal: f.skal, konfidens: f.konfidens,
      });
    }
  }

  // ── Skotare (deconflict: närmast vinner en delad hög) ──
  const skotare = maskiner.filter((m) => getMaskinTyp(m.typ) === 'skotare');
  const ordnad = skotare
    .map((m) => {
      const lage = lageFor(m);
      const f0 = foreslaNasta(lage, kandidater, avstandKm, []);
      const d = lage.koordinat && f0.vald?.koordinat ? avstandKm(lage.koordinat, f0.vald.koordinat) : null;
      return { m, lage, d: d ?? Infinity };
    })
    .sort((a, b) => a.d - b.d);

  const taken: string[] = [];
  for (const { m, lage } of ordnad) {
    const f = foreslaNasta(lage, kandidater, avstandKm, taken);
    const nasta = f.vald ? objById.get(f.vald.key) ?? null : null;
    if (f.vald) taken.push(f.vald.key);
    out.set(m.maskin_id, {
      maskinId: m.maskin_id, typ: 'skotare', koordinat: lage.koordinat,
      positionAlder: lage.positionAlderDagar, nuObjekt: nuObjektFor(m),
      nasta, skal: f.skal, konfidens: f.konfidens,
    });
  }

  return out;
}
