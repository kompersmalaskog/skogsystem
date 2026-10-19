// Sidans tillstand -> RapportIndata. RENT: sidan har redan hamtat allt (rundan, punkterna, fotona, provytorna,
// kontextmarkeringarna) och beslutat origot; den har filen satter bara ihop dem, sa att rapporten aldrig kan se
// annat an det rundvyn ser.
//
// ORIGOT AR BESLUTAT AV beslutaOrigo (lib/egenkontrollOrigo.ts) OCH ALLT HAR FOLJER DET. Utan ett betrott origo ritas
// ingen traktgrans och ingen planpunkt far en plats - hellre en karta med farre pinnar an en punkt pa fel plats i en
// rapport till Vida. Ett fynd utan plats star ANDA i listan, markt "plats saknas" (modellen, bilagan).

import type { Egenkontroll, EgenkontrollFoto, EgenkontrollProvyta, EgenkontrollPunkt } from './egenkontroll';
import { punktPlatser } from './egenkontroll';
import { svgToLatLon, type Origo } from './kartkoordinater';
import { kontextFeature } from './egenkontrollkarta';
import type { JamforelseRad, KartMarkering, LatLng, RapportIndata } from './egenkontrollRapport';

type Xy = { x: number; y: number };

export function byggRapportIndata(a: {
  objektNamn: string;
  voNummer: string | null;
  runda: Egenkontroll;
  punkter: EgenkontrollPunkt[];
  observationer: EgenkontrollPunkt[];
  foton: EgenkontrollFoto[];
  provytor: EgenkontrollProvyta[];
  /** Det BETRODDA origot, eller null (beslutaOrigo sa nej). */
  origo: Origo | null;
  /** Gransmarkeringarna som x/y (markeringsGranser). */
  granserXy: Xy[][];
  /** Planeringens markeringar (hamtaKontextmarkeringar), ALLA - ocksa de som blivit kontrollpunkter (basvagarna ar det). null = gick inte att lasa. */
  kontext: { data?: unknown }[] | null;
  stammar: LatLng[] | null;
  antalStammar: number | null;
  hyttspar: RapportIndata['hyttspar'];
  areal: number | null;
  jamforelse?: JamforelseRad[] | null;
}): RapportIndata {
  const platser: Record<string, LatLng | null> = {};
  for (const p of [...a.punkter, ...a.observationer]) {
    const alla = a.origo ? punktPlatser(p, a.origo) : [];
    platser[p.id] = alla.length === 0
      ? null
      : { lat: alla.reduce((s, q) => s + q.lat, 0) / alla.length, lng: alla.reduce((s, q) => s + q.lng, 0) / alla.length };
  }
  const origo = a.origo;

  // Markeringarna ritas bara med ett betrott origo - samma regel som allt annat har. Utan det sags det, tyst forsvinner de aldrig.
  const extraAnmarkningar: string[] = [];
  let markeringar: KartMarkering[] | null = null;
  if (a.kontext !== null) {
    markeringar = [];
    if (!origo) {
      if (a.kontext.length > 0) extraAnmarkningar.push('Planeringens markeringar ritas inte: kartans läge går inte att kontrollera mot Vidas traktgräns.');
    } else {
      for (const rad of a.kontext) {
        const f = kontextFeature(rad.data, origo);
        if (!f) continue;
        const kind = f.properties.kind as string;
        const typ = String(f.properties.typ ?? '');
        const lnglat = (c: [number, number]): LatLng => ({ lat: c[1], lng: c[0] });
        if (kind === 'symbol' && f.geometry.type === 'Point') {
          markeringar.push({ slag: 'symbol', typ, plats: lnglat(f.geometry.coordinates) });
        } else if (kind === 'linje' && f.geometry.type === 'LineString') {
          markeringar.push({ slag: 'linje', typ, punkter: (f.geometry.coordinates as [number, number][]).map(lnglat) });
        } else if (kind === 'zon') {
          const ring = f.geometry.type === 'Polygon' ? (f.geometry.coordinates[0] as [number, number][]) : f.geometry.type === 'LineString' ? (f.geometry.coordinates as [number, number][]) : [];
          if (ring.length >= 2) markeringar.push({ slag: 'zon', typ, punkter: ring.map(lnglat) });
        }
        // Pilar (arbetsriktning) ritas inte i rapporten - de ar instruktioner fore avverkningen.
      }
    }
  }

  return {
    objektNamn: a.objektNamn,
    voNummer: a.voNummer,
    runda: a.runda,
    punkter: a.punkter,
    observationer: a.observationer,
    foton: a.foton,
    provytor: a.provytor,
    platser,
    traktgrans: origo ? a.granserXy.map((ring) => ring.map((q) => svgToLatLon(q.x, q.y, origo))) : [],
    stammar: a.stammar,
    antalStammar: a.antalStammar,
    hyttspar: a.hyttspar,
    markeringar,
    areal: a.areal,
    jamforelse: a.jamforelse ?? null,
    extraAnmarkningar,
  };
}
