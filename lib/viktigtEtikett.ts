// VIKTIGT SOM ETIKETT PÅ KARTAN I KÖRVYN (Martin 2026-11-23). En kommentar med en Viktigt-rad (lib/kartkommentar) ger en gul etikett vid ytan, symbolen eller linjen —
// raden som föraren ska se utan att trycka. Det är ett medvetet undantag från regeln "bara ytnamn och avläggsnummer som fast text på kartan", och det enda: raden är
// kort (högst 60 tecken), gul med ⚠ och aldrig nedtonad — varken av avstånd (lib/narStyrka) eller av "fokus på trakten". Bara körvyn (maskin och skotarläge), inte planeringen.
// Rena delar: var etiketterna står, och lagret. Sidan äger källan och tänder den i körvyn.

import { delar, inrePunkt } from './ytaEtikett';
import { linjeMitt } from './kommentarTecken';
import { linjeGeometriNyckel } from './vidaNycklar';
import { ytaNyckel } from './traktGeometri';

type Pos = [number, number];

export const VIKTIGT_KALLA = 'viktigt-source';
export const VIKTIGT_LAGER = 'viktigt-etikett';
/** Gult (FARG.gul) som literal: kartans stil läser inga tokens. */
export const VIKTIGT_FARG = '#ffd60a';
export const VIKTIGT_HALO = 'rgba(0,0,0,0.92)';

export interface ViktigtKalla {
  /** Nyckel → Viktigt-raden (lib/kartkommentar.viktigtPerNyckel): `marker:<id>`, Vidas `hansyn:…` / `linje:…` / `punkt:…`. */
  viktigt: ReadonlyMap<string, string>;
  /** Egna symboler (punkt). */
  symboler: ReadonlyArray<{ id: string | number; lng: number; lat: number }>;
  /** Egna linjer och ytor, redan i lng/lat. */
  egna: ReadonlyArray<{ id: string | number; slag: 'linje' | 'yta'; coords: Pos[] }>;
  /** Vidas geometri (objekt_geometri). */
  vida?: { features?: any[] } | null;
}

export const viktigtEtikettText = (rad: string): string => `⚠ ${rad}`;

/** Punkterna för etiketterna. `ovan` = symbolens etikett står OVANFÖR symbolen; ytor och linjer har den mitt på. En nyckel ger högst en etikett. */
export function viktigtPunkter(k: ViktigtKalla) {
  const features: Array<{ type: 'Feature'; properties: Record<string, unknown>; geometry: { type: 'Point'; coordinates: Pos } }> = [];
  const sett = new Set<string>();
  const lagg = (p: Pos | null, nyckel: string, ovan: boolean) => {
    const rad = k.viktigt.get(nyckel);
    if (!p || !rad || sett.has(nyckel)) return;
    sett.add(nyckel);
    features.push({ type: 'Feature', properties: { id: nyckel, text: viktigtEtikettText(rad), ovan }, geometry: { type: 'Point', coordinates: p } });
  };
  for (const s of k.symboler) lagg([s.lng, s.lat], `marker:${s.id}`, true);
  for (const e of k.egna) {
    if (e.slag === 'linje') lagg(linjeMitt(e.coords), `marker:${e.id}`, false);
    else if (e.coords.length >= 3) lagg(inrePunkt([e.coords as any]) as unknown as Pos, `marker:${e.id}`, false);
  }
  for (const f of k.vida?.features ?? []) {
    const g = f?.geometry;
    if (!g) continue;
    if (g.type === 'LineString' || g.type === 'MultiLineString') {
      const nyckel = linjeGeometriNyckel(g);
      if (nyckel) lagg(linjeMitt((g.type === 'LineString' ? g.coordinates : g.coordinates[0]) ?? []), nyckel, false);
    } else if (g.type === 'Polygon' || g.type === 'MultiPolygon') {
      const nyckel = ytaNyckel(f.properties);
      const d = nyckel ? delar(g) : [];
      if (nyckel && d.length) lagg(inrePunkt(d[0]) as unknown as Pos, nyckel, false);
    } else if (g.type === 'Point') {
      const nyckel = ytaNyckel(f.properties);
      if (nyckel && Array.isArray(g.coordinates)) lagg([g.coordinates[0], g.coordinates[1]], nyckel, true);
    }
  }
  return { type: 'FeatureCollection' as const, features };
}

/** Lagret: bara text, gul med mörk kant, aldrig nedtonad och aldrig bortvald av kollision (`*-allow-overlap`). Prefixet `viktigt-` står i körvyns whitelist. */
export function viktigtLager(): any {
  return {
    id: VIKTIGT_LAGER, type: 'symbol', source: VIKTIGT_KALLA,
    layout: {
      'text-field': ['get', 'text'],
      'text-size': ['interpolate', ['linear'], ['zoom'], 13, 12, 16, 15, 18, 17],
      'text-font': ['Open Sans Semibold', 'Open Sans Regular', 'Arial Unicode MS Regular'],   // som ytnamnen: kartstilen har inga glyphs, enhetens egen fet text ritas
      'text-max-width': 12,
      'text-anchor': ['case', ['==', ['get', 'ovan'], true], 'bottom', 'center'],
      'text-offset': ['case', ['==', ['get', 'ovan'], true], ['literal', [0, -1.6]], ['literal', [0, 0]]],
      'text-allow-overlap': true, 'text-ignore-placement': true, 'text-optional': false,
      'text-pitch-alignment': 'viewport', 'text-rotation-alignment': 'viewport',
    },
    paint: { 'text-color': VIKTIGT_FARG, 'text-halo-color': VIKTIGT_HALO, 'text-halo-width': 2.4, 'text-opacity': 1 },
  };
}
