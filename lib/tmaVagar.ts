// Vägvarningen (traktgräns nära väg: band över vägen + ⚠/✓) räknas EN gång per väg och objekt — inte en gång per traktdel och inte en gång per vägsträcka (Martin 2026-11-25, Brokamåla: två gränser längs väg 538 gav
// två röda linjer och två ⚠). Varje traktdel kontrolleras fortfarande för sig (checkBoundaryTma, panelen och traktkortet läser sitt eget resultat), men det som RITAS och räknas är den här sammanställningen:
// en väg får EN ägare (delen som ligger närmast vägen, helst en del som kan visa ⚠, annars lägsta id) och EN linje per vägsträcka (alla delars träffar på samma vägsträcka sammanslagna).
// Färgen (orange/grön/röd) kommer av ägarens riskbedömning och ritas av lib/vagRisk.
// Ren funktion, testad i lib/tmaVagar.test.ts.

export interface LatLon { lat: number; lon: number }
export interface VagTraff {
  name: string;
  type: string;
  ref?: string;
  distance: number;
  category?: string;
  nearbyGeom?: LatLon[];
  closestPoint?: LatLon;
  /** OSM-vägens id och dess hela geometri, samt vilka noder som ligger nära just den här delen — så att flera delars träffar på samma sträcka kan slås ihop. */
  wayId?: number;
  nearbyIdx?: number[];
  wayGeom?: LatLon[];
}
export interface VagKontroll { status: string; roads: VagTraff[] }

export interface Vagvarning {
  nyckel: string;
  namn: string;
  ref?: string;
  /** Kortaste avståndet från någon del. */
  avstand: number;
  /** Delen som äger varningen (det är den vars riskbedömning bestämmer färgen och som får ⚠/✓). */
  agare: string;
  /** Alla delar som ser vägen. */
  delar: string[];
  /** Vägens linjer (bandet ritas över dem): en linje per vägsträcka (OSM-väg), med alla delars nära noder sammanslagna. */
  linjer: LatLon[][];
  /** Alla punkter på linjerna (för närhetskontroll mot ägarens gräns). */
  punkter: LatLon[];
  narmaste?: LatLon;
}

/** Samma väg = samma vägnummer, annars samma namn; en namnlös väg är sin egen OSM-väg. */
export function vagNyckel(h: VagTraff): string {
  const ref = (h.ref || '').toLowerCase().replace(/\s+/g, '');
  if (ref) return `ref:${ref}`;
  const namn = (h.name || '').trim().toLowerCase();
  if (namn && namn !== 'namnlös väg') return `namn:${namn}`;
  if (h.wayId != null) return `way:${h.wayId}`;
  return `typ:${h.type}:${h.closestPoint ? `${h.closestPoint.lat.toFixed(4)},${h.closestPoint.lon.toFixed(4)}` : '?'}`;
}

export function samlaVagvarningar(
  resultat: [string, VagKontroll][],
  kanVisaVarning: (id: string) => boolean,
): { vagar: Vagvarning[]; agareAv: Map<string, Vagvarning[]> } {
  const grupper = new Map<string, { del: string; hit: VagTraff }[]>();
  for (const [id, r] of resultat) {
    if (r.status !== 'done') continue;
    for (const hit of r.roads) {
      const n = vagNyckel(hit);
      const l = grupper.get(n) || [];
      l.push({ del: id, hit });
      grupper.set(n, l);
    }
  }
  const vagar: Vagvarning[] = [];
  const agareAv = new Map<string, Vagvarning[]>();
  for (const [nyckel, traffar] of [...grupper.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    // Ägare: den del som ligger närmast vägen; en del som kan visa ⚠ (en traktgräns-markör) går före en som inte kan; lika → lägsta id.
    const kandidater = traffar.some((t) => kanVisaVarning(t.del)) ? traffar.filter((t) => kanVisaVarning(t.del)) : traffar;
    const agare = kandidater.slice().sort((a, b) => a.hit.distance - b.hit.distance || a.del.localeCompare(b.del))[0];
    const delar = [...new Set(traffar.map((t) => t.del))].sort();
    // Linjer: träffar på samma OSM-väg slås ihop (unionen av nära noder, i vägens egen ordning); en träff utan vägens geometri ritas som den är.
    const perVag = new Map<number, { geom: LatLon[]; idx: Set<number> }>();
    const lösa: LatLon[][] = [];
    for (const { hit } of traffar) {
      if (hit.wayId != null && hit.wayGeom && hit.nearbyIdx) {
        const e = perVag.get(hit.wayId) || { geom: hit.wayGeom, idx: new Set<number>() };
        hit.nearbyIdx.forEach((i) => e.idx.add(i));
        perVag.set(hit.wayId, e);
      } else if (hit.nearbyGeom && hit.nearbyGeom.length >= 2) {
        lösa.push(hit.nearbyGeom);
      }
    }
    const linjer: LatLon[][] = [];
    for (const [, e] of [...perVag.entries()].sort((a, b) => a[0] - b[0])) {
      const l = [...e.idx].sort((a, b) => a - b).map((i) => e.geom[i]).filter(Boolean);
      if (l.length >= 2) linjer.push(l);
    }
    linjer.push(...lösa);
    const v: Vagvarning = {
      nyckel,
      namn: agare.hit.name,
      ref: agare.hit.ref,
      avstand: Math.min(...traffar.map((t) => t.hit.distance)),
      agare: agare.del,
      delar,
      linjer,
      punkter: linjer.flat(),
      narmaste: agare.hit.closestPoint,
    };
    vagar.push(v);
    const lista = agareAv.get(v.agare) || [];
    lista.push(v);
    agareAv.set(v.agare, lista);
  }
  return { vagar, agareAv };
}
