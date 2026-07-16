import proj4 from 'proj4';

/**
 * Larmkoordinat ur Vidas traktdirektiv (TD-PDF).
 *
 * Vida anger larmkoordinaten i SWEREF99 TM. VIKTIGT om textens layout: i den
 * extraherade texten står TALEN före etiketterna, och etiketterna i OMVÄND
 * ordning mot talen:
 *
 *     Larmkoordinat:
 *     6269316 484312          <- northing, easting
 *     Öst/Väst   Nord/Syd     <- etiketterna står tvärtom
 *
 * Att mappa på etikett-ordning ger därför FEL punkt (verifierat: omkastad
 * ordning landar på 3.0/61.0 — Indiska oceanen). Vi tolkar i stället på
 * MAGNITUD, vilket är entydigt: northing (6,0–7,8 M) och easting (200 k–1 M)
 * överlappar inte. Det är dessutom robust mot mellanslag, radbrytningar och
 * omkastade kolumner.
 *
 * Funktionerna returnerar ALDRIG en gissad punkt. Misslyckas något steg får
 * anroparen ett skäl att visa — tyst tomt är inte ett giltigt utfall.
 */

// SWEREF99 TM = UTM zon 33N på GRS80
proj4.defs('EPSG:3006', '+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');

// SWEREF99 TM-intervall för Sverige
const NORTHING_MIN = 6_000_000;
const NORTHING_MAX = 7_800_000;
const EASTING_MIN = 200_000;
const EASTING_MAX = 1_000_000;

// WGS84-box för Sverige — sista spärren mot orimliga punkter
const LAT_MIN = 55;
const LAT_MAX = 70;
const LNG_MIN = 10;
const LNG_MAX = 25;

export interface LarmkoordinatTdResultat {
  ok: boolean;
  lat?: number;
  lng?: number;
  northing?: number;
  easting?: number;
  skal?: string;
}

/** Tolka SWEREF-talen på magnitud — aldrig på etikett-ordning. */
export function tolkaSweref(tal: number[]): { northing: number; easting: number } | null {
  const n = tal.filter((v) => v >= NORTHING_MIN && v <= NORTHING_MAX);
  const e = tal.filter((v) => v >= EASTING_MIN && v <= EASTING_MAX);
  if (n.length < 1 || e.length < 1) return null;
  return { northing: n[0], easting: e[0] };
}

/** SWEREF99 TM (EPSG:3006) → WGS84. X = easting, Y = northing — ordningen är kritisk. */
export function swerefTillWgs84(easting: number, northing: number): { lat: number; lng: number } {
  const ut = proj4('EPSG:3006', 'EPSG:4326', [easting, northing]) as number[];
  return { lat: ut[1], lng: ut[0] };
}

/** Plocka larmkoordinaten ur traktdirektivets text. */
export function larmkoordinatFranTdText(txt: string): LarmkoordinatTdResultat {
  if (!txt || txt.trim().length < 50) {
    return { ok: false, skal: 'Ingen text i traktdirektivet (inskannad bild?)' };
  }
  const i = txt.search(/Larmkoordinat/i);
  if (i < 0) return { ok: false, skal: 'Hittade ingen larmkoordinat i traktdirektivet' };

  const fonster = txt.slice(i, i + 160);
  const tal = (fonster.match(/\d{5,8}/g) || []).map(Number);
  const t = tolkaSweref(tal);
  if (!t) return { ok: false, skal: 'Kunde inte läsa båda SWEREF-talen vid larmkoordinaten' };

  const { lat, lng } = swerefTillWgs84(t.easting, t.northing);
  if (!(lat > LAT_MIN && lat < LAT_MAX && lng > LNG_MIN && lng < LNG_MAX)) {
    return { ok: false, skal: 'Koordinaten hamnade utanför Sverige — förkastad' };
  }
  return { ok: true, lat, lng, northing: t.northing, easting: t.easting };
}
