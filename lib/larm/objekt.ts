// Bygger larmobjekt (lib/larm/larm) av det sidan har: egna symboler, egna linjer och ytor, och Vidas geometri.
// Rena funktioner: positionen och koordinaterna kommer in, avstånd och "inne" räknas här.

import { arInnePolygon, avstandPunktM, avstandTillLinjeM, narRuta, type LatLon } from './geo';
import { LARMFRIA_SYMBOLER, LINJE_NAMN, VIDA, gruppForLinje, gruppForSymbol, ytaDef, type VidaSlag } from './grupper';
import { innehallHash, type LarmObjekt } from './larm';
import { vidaNycklar } from '../vidaNycklar';
import { arHansynsyta } from '../vidaYtaTyp';

/** Riktning i grader medurs från norr, från a till b. */
export function bearingM(a: LatLon, b: LatLon): number {
  const dx = (b.lon - a.lon) * Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180);
  const dy = b.lat - a.lat;
  return ((Math.atan2(dx, dy) * 180 / Math.PI) + 360) % 360;
}

/**
 * Högstubbe och Evighetsträd larmar aldrig — varken prickarna föraren sätter med pillräknaren eller planerarens symboler av samma typ
 * (`LARMFRIA_SYMBOLER`). Naturhörna larmar som övrig Natur. Dessutom larmar aldrig en symbol föraren själv just satt i den här sessionen.
 */
export function arUndantagen(typ: string | undefined, sattDennaSession: boolean): boolean {
  return sattDennaSession || (!!typ && LARMFRIA_SYMBOLER.includes(typ));
}

export interface SymbolIn { id: string | number; type?: string; comment?: string; lat: number; lon: number }

export function symbolObjekt(m: SymbolIn, namn: string, pos: LatLon, sattDennaSession: boolean): LarmObjekt {
  const p = { lat: m.lat, lon: m.lon };
  return {
    id: String(m.id), kalla: 'symbol', grupp: gruppForSymbol(m.type), namn, typ: m.type,
    hash: innehallHash({ type: m.type, comment: m.comment }), kommentar: m.comment || null,
    avstandM: avstandPunktM(pos, p), bearing: bearingM(pos, p), undantagen: arUndantagen(m.type, sattDennaSession),
  };
}

export interface LinjeIn { id: string | number; lineType?: string; comment?: string; koordinater: readonly LatLon[] }

/** Egen ritad linje i en grupp (Stenmur). Övriga linjer larmar inte. */
export function linjeObjekt(l: LinjeIn, pos: LatLon): LarmObjekt | null {
  const grupp = gruppForLinje(l.lineType);
  if (!grupp) return null;
  return {
    id: String(l.id), kalla: 'linje', grupp, namn: LINJE_NAMN[l.lineType as string] ?? 'Linje', typ: l.lineType,
    hash: innehallHash({ type: l.lineType, comment: l.comment }), kommentar: l.comment || null,
    avstandM: avstandTillLinjeM(pos, l.koordinater),
  };
}

export interface YtaIn { id: string | number; zoneType?: string; comment?: string; ring: readonly LatLon[] }

/** Egen ritad yta. Gallringszonen och okända typer är ingen varningsyta. */
export function ytaObjekt(y: YtaIn, pos: LatLon, risaInne?: boolean): LarmObjekt | null {
  const d = ytaDef(y.zoneType);
  if (!d) return null;
  return {
    id: String(y.id), kalla: 'yta', grupp: d.grupp, namn: d.namn, typ: y.zoneType, forbjuden: d.forbjuden,
    hash: innehallHash({ type: y.zoneType, comment: y.comment }), kommentar: y.comment || null,
    avstandM: null, inne: risaInne ?? arInnePolygon(pos, [y.ring]),
  };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Vidas geometri (objekt_geometri, GeoJSON i WGS84)
// ---------------------------------------------------------------------------------------------------------------------------------

type Pos = [number, number];
const tillLatLon = (c: Pos): LatLon => ({ lat: c[1], lon: c[0] });
const ringLL = (r: Pos[]): LatLon[] => r.map(tillLatLon);

/** Vilket larmslag är en Vida-feature? null = inget som larmar (traktgräns, avlägg, larmpunkt, basväg …). */
export function vidaSlag(props: Record<string, any> | null | undefined, geomTyp: string | undefined): VidaSlag | null {
  const lager = String(props?._lager ?? '');
  const typ = String(props?._typ ?? '');
  const flb = String(props?.FLBESKR ?? '').toLowerCase();
  const yta = geomTyp === 'Polygon' || geomTyp === 'MultiPolygon';
  const linje = geomTyp === 'LineString' || geomTyp === 'MultiLineString';
  const punkt = geomTyp === 'Point' || geomTyp === 'MultiPoint';
  // Vidas fria ytkod (TYP 71 "Övrigt") är ingen hänsyn: inget zonlarm (lib/vidaYtaTyp).
  if (yta && arHansynsyta(props)) return 'hansynsyta';
  if (lager === 'SV_SKS_NYCKELBIOTOP_101' && yta) return 'nyckelbiotop';
  if (lager === 'L_RAA_POLY_101' && yta) return 'raa_yta';
  if (lager === 'L_RAA_POINT_101' && punkt) return 'raa_punkt';
  if (lager === 'L_RAA_LINE_101' && linje) return 'raa_punkt';          // RAÄ-linjer behandlas som Kultur (tills kvitterat)
  if (typ === 'linje' && linje && flb.includes('kraftled')) return 'kraftledning';
  return null;
}

/**
 * Alla Vida-features som larmar, med id `vida:<lager>:<index>` (index = featurens plats i samlingen). Pos filtrerar bort det som är långt bort.
 * `kommentarer` = vår kommentar per Vida-objekt (nyckel ur lib/vidaNycklar → text, ur objekt_yta_anteckning): visas i larmkortet och ingår i hashen, så en
 * kvittens gäller inte längre när kommentaren ändrats. Vidas egen data ändras aldrig.
 */
export function vidaObjekt(fc: { features?: any[] } | null | undefined, pos: LatLon, marginM = 60, kommentarer: Readonly<Record<string, string>> = {}): LarmObjekt[] {
  const ut: LarmObjekt[] = [];
  const nycklar = vidaNycklar(fc?.features);
  (fc?.features ?? []).forEach((f, i) => {
    const g = f?.geometry;
    const slag = vidaSlag(f?.properties, g?.type);
    if (!slag || !g) return;
    const d = VIDA[slag];
    const lager = String(f.properties?._lager ?? 'okant');
    const id = `vida:${lager}:${i}`;
    const nyckel = nycklar[i];
    const komm = ((nyckel && kommentarer[nyckel]) || '').trim();
    const bas = { id, grupp: d.grupp, namn: d.namn, typ: slag, hash: innehallHash({ type: slag, comment: komm }), kommentar: (komm || null) as string | null };
    if (g.type === 'Polygon' || g.type === 'MultiPolygon') {
      const polys: Pos[][][] = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
      let inne = false;
      for (const p of polys) {
        const ringar = p.map(ringLL);
        if (!narRuta(pos, ringar[0] ?? [], marginM)) continue;
        if (arInnePolygon(pos, ringar)) { inne = true; break; }
      }
      ut.push({ ...bas, kalla: 'yta', forbjuden: d.forbjuden, avstandM: null, inne });
    } else if (g.type === 'LineString' || g.type === 'MultiLineString') {
      const linjer: Pos[][] = g.type === 'LineString' ? [g.coordinates] : g.coordinates;
      let min = Infinity;
      for (const l of linjer) {
        const ll = ringLL(l);
        if (!narRuta(pos, ll, marginM)) continue;
        min = Math.min(min, avstandTillLinjeM(pos, ll));
      }
      ut.push({ ...bas, kalla: 'linje', avstandM: min });
    } else if (g.type === 'Point' || g.type === 'MultiPoint') {
      const punkter: Pos[] = g.type === 'Point' ? [g.coordinates] : g.coordinates;
      let min = Infinity, nar: LatLon | null = null;
      for (const c of punkter) { const p = tillLatLon(c); const dd = avstandPunktM(pos, p); if (dd < min) { min = dd; nar = p; } }
      ut.push({ ...bas, kalla: 'symbol', avstandM: min, bearing: nar ? bearingM(pos, nar) : null });
    }
  });
  return ut;
}
