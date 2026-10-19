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
import type { LatLng, RapportIndata } from './egenkontrollRapport';

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
}): RapportIndata {
  const platser: Record<string, LatLng | null> = {};
  for (const p of [...a.punkter, ...a.observationer]) {
    const alla = a.origo ? punktPlatser(p, a.origo) : [];
    platser[p.id] = alla.length === 0
      ? null
      : { lat: alla.reduce((s, q) => s + q.lat, 0) / alla.length, lng: alla.reduce((s, q) => s + q.lng, 0) / alla.length };
  }
  const origo = a.origo;
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
  };
}
