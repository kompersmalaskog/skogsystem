// FÄLLNINGSCIRKELN — 30 m runt skördaren (= trädlängd). Ren och testbar; hooken useFallning och sidan kopplar den till kartan.
//
//   Neutral och svag när inget skyddsvärt finns inom 30 m.
//   Tar gruppens färg när något man inte får fälla på ligger inom 30 m:
//     Röd:  El-ledning, Kraftledning (Vida), Varning
//     Brun: Kulturminne, Kulturstubbe, Kulturmiljö, Fornlämning (egen, Vidas RAÄ)
//     Grön: Stenmur, Hänsyn (egen och Vidas), Nyckelbiotop, Naturhörna, Evighetsträd
//   Punkter räknas på avståndet, linjer och ytor på NÄRMASTE punkt (en yta man står i har avstånd 0). Flera samtidigt: Röd före Brun/Grön, annars närmast.
//   Objekten som orsakar färgen lyser upp på kartan. Cirkeln är TYST: inget ljud, inget kort, ingen kvittering. Evighetsträd räknas här fast det inte larmar.
//   Blå, Lila och Mörk (och Brant, Ej framkomlig, Högstubbe) påverkar inte cirkeln.

import { avstandPunktM, avstandTillLinjeM, avstandTillYtaM, narRuta, type LatLon } from './geo';
import { FALLNING_LINJE, FALLNING_SYMBOL, FALLNING_VIDA, FALLNING_YTA, GRUPPER, LINJE_NAMN, VIDA, symbolNamn, ytaDef, type FallningGrupp } from './grupper';
import { vidaSlag } from './objekt';

export const FALLNING_M = 30;
/** Neutral cirkel: vit och svag. */
export const FALLNING_NEUTRAL_FARG = '#ffffff';
export const FALLNING_NEUTRAL_OPACITET = 0.3;
export const FALLNING_FARG_OPACITET = 0.95;

export type FallningGeometri = { type: 'Point' | 'LineString' | 'Polygon' | 'MultiPolygon' | 'MultiLineString' | 'MultiPoint'; coordinates: any };

export interface FallningKandidat {
  id: string;
  namn: string;
  grupp: FallningGrupp;
  /** Meter till närmaste punkt (0 = positionen ligger i ytan). */
  avstandM: number;
  geometri: FallningGeometri | null;
}

export interface FallningUtfall {
  /** null = inget skyddsvärt inom radien: cirkeln är neutral. */
  grupp: FallningGrupp | null;
  /** Cirkelns färg: gruppens, annars neutral vit. */
  farg: string;
  opacitet: number;
  /** Objekten i den vinnande gruppen inom radien (närmast först) — lyser upp på kartan. */
  orsaker: FallningKandidat[];
}

export const NEUTRAL: FallningUtfall = { grupp: null, farg: FALLNING_NEUTRAL_FARG, opacitet: FALLNING_NEUTRAL_OPACITET, orsaker: [] };

/** Röd före Brun/Grön. Brun och Grön är lika viktiga: närmast avgör (se bedomFallning). */
const prio = (g: FallningGrupp): number => (g === 'fara' ? 0 : 1);

export function bedomFallning(kandidater: readonly FallningKandidat[], radieM = FALLNING_M): FallningUtfall {
  const inom = kandidater.filter((k) => Number.isFinite(k.avstandM) && k.avstandM <= radieM).sort((a, b) => a.avstandM - b.avstandM);
  if (inom.length === 0) return NEUTRAL;
  const vinnare = inom.reduce((best, k) => (prio(k.grupp) < prio(best.grupp) ? k : best), inom[0]);
  return {
    grupp: vinnare.grupp,
    farg: GRUPPER[vinnare.grupp].farg,
    opacitet: FALLNING_FARG_OPACITET,
    orsaker: inom.filter((k) => k.grupp === vinnare.grupp),
  };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Kandidaterna: sidans markeringar och Vidas geometri → avstånd
// ---------------------------------------------------------------------------------------------------------------------------------

type Pos = [number, number];
const tillLatLon = (c: Pos): LatLon => ({ lat: c[1], lon: c[0] });
const punkt = (ll: LatLon): Pos => [ll.lon, ll.lat];

export interface FallningIn {
  pos: LatLon;
  markers: readonly any[];
  svgToLatLon: (x: number, y: number) => LatLon;
  vida: { features?: any[] } | null;
}

export function fallningKandidater(inp: FallningIn): FallningKandidat[] {
  const { pos } = inp;
  const ut: FallningKandidat[] = [];

  for (const m of inp.markers) {
    if (m.isMarker && typeof m.x === 'number' && typeof m.y === 'number') {
      const grupp = FALLNING_SYMBOL[m.type];
      if (!grupp) continue;
      const ll = inp.svgToLatLon(m.x, m.y);
      ut.push({ id: String(m.id), namn: symbolNamn(m.type), grupp, avstandM: avstandPunktM(pos, ll), geometri: { type: 'Point', coordinates: punkt(ll) } });
    } else if (m.isLine && m.path?.length > 1) {
      const grupp = FALLNING_LINJE[m.lineType];
      if (!grupp) continue;
      const linje: LatLon[] = m.path.map((p: any) => inp.svgToLatLon(p.x, p.y));
      ut.push({ id: String(m.id), namn: LINJE_NAMN[m.lineType] ?? 'Linje', grupp, avstandM: avstandTillLinjeM(pos, linje), geometri: { type: 'LineString', coordinates: linje.map(punkt) } });
    } else if (m.isZone && m.path?.length > 2) {
      const grupp = FALLNING_YTA[m.zoneType];
      if (!grupp) continue;
      const ring: LatLon[] = m.path.map((p: any) => inp.svgToLatLon(p.x, p.y));
      ut.push({
        id: String(m.id), namn: ytaDef(m.zoneType)?.namn ?? 'Yta', grupp, avstandM: avstandTillYtaM(pos, [ring]),
        geometri: { type: 'Polygon', coordinates: [[...ring.map(punkt), punkt(ring[0])]] },
      });
    }
  }

  (inp.vida?.features ?? []).forEach((f, i) => {
    const g = f?.geometry;
    const slag = vidaSlag(f?.properties, g?.type);
    if (!slag || !g) return;
    const grupp = FALLNING_VIDA[slag];
    const lager = String(f.properties?._lager ?? 'okant');
    const id = `vida:${lager}:${i}`;
    const namn = VIDA[slag].namn;
    let avstandM = Infinity;
    if (g.type === 'Polygon' || g.type === 'MultiPolygon') {
      const polys: Pos[][][] = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
      for (const p of polys) {
        const ringar = p.map((r) => r.map(tillLatLon));
        if (!narRuta(pos, ringar[0] ?? [], FALLNING_M + 5)) continue;   // billig förkoll: långt bort räknas inte
        avstandM = Math.min(avstandM, avstandTillYtaM(pos, ringar));
      }
    } else if (g.type === 'LineString' || g.type === 'MultiLineString') {
      const linjer: Pos[][] = g.type === 'LineString' ? [g.coordinates] : g.coordinates;
      for (const l of linjer) {
        const ll = l.map(tillLatLon);
        if (!narRuta(pos, ll, FALLNING_M + 5)) continue;
        avstandM = Math.min(avstandM, avstandTillLinjeM(pos, ll));
      }
    } else if (g.type === 'Point' || g.type === 'MultiPoint') {
      const punkter: Pos[] = g.type === 'Point' ? [g.coordinates] : g.coordinates;
      for (const c of punkter) avstandM = Math.min(avstandM, avstandPunktM(pos, tillLatLon(c)));
    }
    if (Number.isFinite(avstandM)) ut.push({ id, namn, grupp, avstandM, geometri: g });
  });

  return ut;
}
