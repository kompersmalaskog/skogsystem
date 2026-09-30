'use client';
// Per-maskin kö/rutt för /oversikt-v2 (SLUTLIG). FÖRSLAG, aldrig order.
//
// SKÖRDARE: nästa = förmannens kö (maskin_ko), punkt. Ingen gissning. Avslutade döljs.
//           Tom kö → 'inget planerat'. Hela kön ritas som numrerad rutt (1 → 2 → …).
// SKOTARE:  automatiskt dit virket ligger, FILTRERAT på dim_maskin.skotar_roll
//           (slutavverkning | gallring | allt) mot objekt.typ. Specialist vinner sin typ,
//           'allt' tar resten (deconflict). Manuell maskin_ko-rad på en skotare slår automatiken.
//           Framförhållning: 1:a (fast) + 2:a (troligt — kan ändras).
//
// Ren logik, Node-importerbar (dry-run kör exakt samma fn): ingen supabase-import.

import { paBackenKvar } from '@/lib/skotat';
import type { OversiktObjekt, MaskinKoItem } from '../oversikt/oversikt-types';
import { STATUS_AVSLUTADE } from '../oversikt/oversikt-types';
import type { PlatsForslag } from '../maskinflytt/senastePlats';
import type { SkordAggV2 } from './skord-data';

export type MaskinTyp = 'skordare' | 'skotare';
export type SkotarRoll = 'slutavverkning' | 'gallring' | 'allt';
export interface Koordinat { lat: number; lng: number }

export type MaskinRad = {
  maskin_id: string;
  visningsnamn?: string | null;
  modell?: string | null;
  tillverkare?: string | null;
  typ?: string | null;
  maskin_typ?: string | null;
  aktiv_till?: string | null;
  skotar_roll?: string | null;
};

/** En post i kön/rutten. `troligt` = skotarens 2:a (kan ändras). */
export interface KoPost { objekt: OversiktObjekt; troligt: boolean }

export interface MaskinForslag {
  maskinId: string;
  typ: MaskinTyp;
  koordinat: Koordinat | null;    // maskinens position (senastePlats)
  positionAlder: number | null;
  nuObjekt: OversiktObjekt | null; // objektet maskinen står på nu
  ko: KoPost[];                    // ordnad kö/rutt: [1:a, 2:a, …]. nästa = ko[0].
  manuellKo: boolean;             // skotare med manuell maskin_ko (override av automatiken)
  skal: string;
}

const TROSKEL_BACKEN = 30;   // m³fub — libets golv (~2 lass)
const TROSKEL_LEGAT = 45;    // dgr
const VIKT = { liggetid: 0.4, volym: 0.35, narhet: 0.25 };

function dagarSedan(tidpunkt: string): number {
  const dag = tidpunkt.length <= 10 ? tidpunkt : new Date(tidpunkt).toLocaleDateString('sv-SE');
  const then = new Date(`${dag}T00:00:00`);
  const nu = new Date();
  return Math.round((new Date(nu.getFullYear(), nu.getMonth(), nu.getDate()).getTime() - then.getTime()) / 86400000);
}

export function arSkotare(m: MaskinRad): boolean {
  const t = `${m.maskin_typ ?? ''} ${m.typ ?? ''}`.toLowerCase();
  return t.includes('forward') || t.includes('skot');
}
export function maskinAktiv(m: MaskinRad, todayISO: string): boolean {
  return !m.aktiv_till || m.aktiv_till >= todayISO;
}
function normalisera(varden: number[]): (v: number) => number {
  const min = Math.min(...varden), max = Math.max(...varden);
  if (!Number.isFinite(min) || !Number.isFinite(max) || max === min) return () => 0.5;
  return (v: number) => (v - min) / (max - min);
}
/** Objektets typ matchar skotarens roll? 'allt' tar allt; annars måste typ === roll. */
function rollMatchar(roll: string | null | undefined, o: OversiktObjekt): boolean {
  if (roll === 'allt') return true;
  if (roll === 'slutavverkning' || roll === 'gallring') return o.typ === roll;
  return false; // ingen roll satt → ingen auto
}

interface Kand { o: OversiktObjekt; koord: Koordinat; backen: number; backenPalitlig: boolean; legatDagar: number | null }

export function beraknaForslag(args: {
  maskiner: MaskinRad[];
  objekt: OversiktObjekt[];
  maskinKo: MaskinKoItem[];
  skord: Record<string, SkordAggV2>;
  positions: Map<string, PlatsForslag>;
  avstandKm: (a: Koordinat, b: Koordinat) => number | null;
}): Map<string, MaskinForslag> {
  const { maskiner, objekt, maskinKo, skord, positions, avstandKm } = args;
  const objById = new Map<string, OversiktObjekt>(objekt.map((o) => [o.id, o]));
  const avAvslutat = (o: OversiktObjekt) => STATUS_AVSLUTADE.includes(o.status);

  const lageFor = (m: MaskinRad) => {
    const pos = positions.get(m.maskin_id);
    return { koordinat: pos?.koordinat ?? null, nuObjektId: pos?.objektId ?? null, alder: pos?.tidpunkt ? dagarSedan(pos.tidpunkt) : null };
  };
  const nuObjektFor = (m: MaskinRad) => { const id = positions.get(m.maskin_id)?.objektId; return id ? objById.get(id) ?? null : null; };

  // Kön ur maskin_ko: ordnad, ej avslutade (döljs), med koordinat, ej nuvarande objekt.
  const koUr = (maskinId: string, nuId: string | null): OversiktObjekt[] =>
    maskinKo.filter((k) => k.maskin_id === maskinId).sort((a, b) => a.ordning - b.ordning)
      .map((k) => objById.get(k.objekt_id))
      .filter((o): o is OversiktObjekt => !!o && !avAvslutat(o) && o.lat != null && o.lng != null && o.id !== nuId);

  const out = new Map<string, MaskinForslag>();
  const set = (m: MaskinRad, typ: MaskinTyp, ko: KoPost[], manuellKo: boolean, skal: string) => {
    const lage = lageFor(m);
    out.set(m.maskin_id, { maskinId: m.maskin_id, typ, koordinat: lage.koordinat, positionAlder: lage.alder, nuObjekt: nuObjektFor(m), ko, manuellKo, skal });
  };

  // ── SKÖRDARE: förmannens kö, punkt ──
  for (const m of maskiner.filter((x) => !arSkotare(x))) {
    const nuId = lageFor(m).nuObjektId;
    const ko = koUr(m.maskin_id, nuId).map((o) => ({ objekt: o, troligt: false }));
    set(m, 'skordare', ko, false, ko.length ? `Förmannens kö (${ko.length} objekt)` : 'Inget i kön — inget planerat');
  }

  // ── SKOTARE ──
  const skotare = maskiner.filter((m) => arSkotare(m));
  // Enriched skotarkandidater (backen ≥ golv, ej avslutat, bolag, koordinat, ≤45 dgr eller FPR-täckt).
  const kand: Kand[] = [];
  for (const o of objekt) {
    if (o.lat == null || o.lng == null || !o.bolag || avAvslutat(o)) continue;
    const agg = o.vo_nummer ? skord[o.vo_nummer] : undefined;
    const skotat = agg?.skotat ?? null;
    const backen = paBackenKvar(agg?.skordat ?? 0, skotat, agg?.egenSkotning ?? false);
    if (backen < TROSKEL_BACKEN) continue;
    const legatDagar = agg?.sista ? dagarSedan(agg.sista) : null;
    if (legatDagar == null || (legatDagar > TROSKEL_LEGAT && skotat == null)) continue;
    kand.push({ o, koord: { lat: o.lat, lng: o.lng }, backen, backenPalitlig: skotat != null, legatDagar });
  }

  const rankadFor = (m: MaskinRad, koord: Koordinat | null, taken: Set<string>): Kand[] => {
    const mina = kand.filter((k) => rollMatchar(m.skotar_roll, k.o) && !taken.has(k.o.id));
    if (!mina.length) return [];
    const nB = normalisera(mina.map((k) => k.backen));
    const nL = normalisera(mina.map((k) => k.legatDagar ?? 0));
    const avstV = mina.map((k) => (koord ? avstandKm(koord, k.koord) : null)).filter((d): d is number => d != null);
    const nA = avstV.length ? normalisera(avstV) : () => 0.5;
    const poang = (k: Kand) => { const d = koord ? avstandKm(koord, k.koord) : null; const narhet = d != null ? 1 - nA(d) : 0.3; return VIKT.liggetid * nL(k.legatDagar ?? 0) + VIKT.volym * nB(k.backen) + VIKT.narhet * narhet; };
    return [...mina].sort((a, b) => poang(b) - poang(a));
  };

  // Manuell kö slår automatiken. Manuellt köade objekt är "tagna" även för auto-deconflict.
  const auto: MaskinRad[] = [];
  const taken = new Set<string>();
  for (const m of skotare) {
    const nuId = lageFor(m).nuObjektId;
    const manuell = koUr(m.maskin_id, nuId);
    if (manuell.length) { set(m, 'skotare', manuell.map((o) => ({ objekt: o, troligt: false })), true, `Manuell kö (${manuell.length} objekt)`); for (const o of manuell) taken.add(o.id); }
    else auto.push(m);
  }

  // Deconflict: specialister (roll ≠ 'allt') först, sedan 'allt'; närmast egen topp-pick först.
  const toppDist = (m: MaskinRad) => { const koord = lageFor(m).koordinat; const r = rankadFor(m, koord, taken); const d = koord && r[0] ? avstandKm(koord, r[0].koord) : null; return d ?? Infinity; };
  const specialister = auto.filter((m) => m.skotar_roll && m.skotar_roll !== 'allt').sort((a, b) => toppDist(a) - toppDist(b));
  const allt = auto.filter((m) => m.skotar_roll === 'allt').sort((a, b) => toppDist(a) - toppDist(b));
  const utanRoll = auto.filter((m) => !m.skotar_roll);
  const ordning = [...specialister, ...allt];
  // Pass 1: 1:a per maskin (fast, deconflictad). Pass 2: 2:a (troligt) — utesluter ALLA 1:or,
  // så en dämpad 2:a aldrig dubblerar någon annans fasta 1:a. 2:or får överlappa varandra.
  const forsta = new Map<string, Kand>();
  for (const m of ordning) {
    const rankad = rankadFor(m, lageFor(m).koordinat, taken);
    if (rankad[0]) { forsta.set(m.maskin_id, rankad[0]); taken.add(rankad[0].o.id); }
  }
  for (const m of ordning) {
    const f = forsta.get(m.maskin_id);
    const andra = rankadFor(m, lageFor(m).koordinat, taken)[0]; // taken = alla 1:or
    const ko: KoPost[] = [];
    if (f) ko.push({ objekt: f.o, troligt: false });
    if (andra) ko.push({ objekt: andra.o, troligt: true });
    set(m, 'skotare', ko, false, f ? `Auto (${m.skotar_roll}) — ${Math.round(f.backen)} m³, ${f.legatDagar} d` : `Ingen ${m.skotar_roll}-backen att skota`);
  }
  for (const m of utanRoll) set(m, 'skotare', [], false, 'Ingen skotar_roll satt');

  return out;
}
