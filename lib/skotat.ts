// ─────────────────────────────────────────────────────────────────────────────
// ÄGARSKAP: skotat-regeln ägs av uppföljning/skotare-sessionen. Ska en annan
// session (t.ex. #412-spåret) ändra hur skotad volym räknas — resolveSkotareVolym,
// objektSkotat eller paBackenKvar — koordineras det HIT först, aldrig parallellt.
// Två parallella skotat-implementationer (#412 vs #435) uppstod en gång och fick
// förenas i #437; den här filen är den ENDA sanningen efter det.
// ─────────────────────────────────────────────────────────────────────────────
//
// Objektets skotade volym — EN regel, delad av uppföljningens LISTA (useUppfoljningList),
// uppföljningens DETALJ (transform.ts) och översikten (OversiktPage.skordMap). Ändra bara
// HÄR, aldrig i en vy för sig — de tre vyerna får ALDRIG räkna skotat olika.
//
// Regel (bekräftad av Martin 2026-08-19):
//  1. Objekt-nivå-manuell (skotare_objekt_manuell med maskin_id IS NULL) = användarens avslut
//     (skotad_volym_manuell) → TRUMFAR ALLT. (Grot/ris lagras ALDRIG här — det bor i dim_objekt
//     som risskotning/grot_hamtad + egna risjobb-objekt_id — så grot kan inte läcka in hit.)
//  2. Annars PER MASKIN: per (objekt, maskin) delas den manuella raden + mätt lass upp i
//     EGEN skotning (räknas) och OMLASTNING (räknas ALDRIG mot objektets skotade total) via
//     resolveSkotareVolym(). En manuell rad för maskin X (ofta filfri JD810E) TRUMFAR maskin X:s
//     lass — aldrig dubbelräkna samma maskin. Objektets skotat = Σ över maskinerna av EGEN.
//
// Skotat = null (okänt, ≠ 0) hanteras av anroparen: ingen lass OCH ingen manuell → null.

/**
 * En rå skotare_objekt_manuell-rad (maskin_id SATT), så mycket som EN-regeln behöver för att
 * skilja EGEN skotning (räknas) från OMLASTNING (räknas aldrig). Anroparen skickar hela raden.
 */
export interface SkotareManuellRad {
  /** EGEN skotning (räknas mot skotad total). Primär källa. */
  volym_egen_skotning?: number | null;
  /** OMLASTNING (räknas ALDRIG mot skotad total; visas som arbete). */
  volym_omlastning?: number | null;
  /** Äldre helhets-volym — läs-fallback när de två nya fälten saknas. */
  volym_m3?: number | null;
  /** Äldre boolean: hela radens volym är omlastning (fallback-tolkning). */
  ar_omlastning?: boolean | null;
}

/**
 * EN plats för uppdelningen per (objekt, maskin): given den råa manuella raden (eller null) och
 * den MÄTTA lass-volymen (SUM fakt_lass.volym_m3sub), returnera { egen, omlastning }.
 *   egen (RÄKNAS)        = volym_egen_skotning ?? (ar_omlastning ? 0 : (volym_m3 ?? max(0, mätt − (volym_omlastning ?? 0))))
 *   omlastning (EXKLUD.) = volym_omlastning     ?? (ar_omlastning ? (volym_m3 ?? mätt) : 0)
 * Ingen rad (null) → egen = mätt, omlastning = 0 (ren lass-maskin, bakåtkompatibelt).
 */
export function resolveSkotareVolym(
  rad: SkotareManuellRad | null,
  matt: number,
): { egen: number; omlastning: number } {
  const m = Math.max(0, Number(matt) || 0);
  const egenExpl = rad?.volym_egen_skotning;
  const omlExpl = rad?.volym_omlastning;
  const legacy = rad?.volym_m3;
  const arOml = !!rad?.ar_omlastning;

  const omlastning = omlExpl ?? (arOml ? (legacy ?? m) : 0);
  const egen = egenExpl ?? (arOml ? 0 : (legacy ?? Math.max(0, m - (omlExpl ?? 0))));
  return { egen: Number(egen) || 0, omlastning: Number(omlastning) || 0 };
}

export interface SkotatInput {
  /** maskin_id → summerad lass-volym (m³fub) på objektet (ur fakt_lass, per maskin). */
  lassPerMaskin: Map<string, number>;
  /** maskin_id → RÅ skotare_objekt_manuell-rad (maskin_id SATT). Löses via resolveSkotareVolym. */
  manuellRadPerMaskin: Map<string, SkotareManuellRad>;
  /** skotare_objekt_manuell med maskin_id IS NULL (objekt-nivå); null om ingen. Trumfar allt. */
  manuellObjektNiva: number | null;
}

export interface SkotatResult {
  /** Total skotad volym (m³fub). */
  skotat: number;
  /** Objekt-nivå-manuell finns → skotaren räknas KLAR (force i skotarTillstand/uppföljningens badge). */
  harManuellAvslut: boolean;
}

/** Objektets skotade volym enligt den delade regeln ovan. Se SkotatInput för källorna. */
export function objektSkotat(i: SkotatInput): SkotatResult {
  if (i.manuellObjektNiva != null) {
    return { skotat: i.manuellObjektNiva, harManuellAvslut: true };
  }
  const maskiner = new Set<string>([...i.lassPerMaskin.keys(), ...i.manuellRadPerMaskin.keys()]);
  let skotat = 0;
  for (const m of maskiner) {
    const rad = i.manuellRadPerMaskin.get(m) ?? null;
    const matt = i.lassPerMaskin.get(m) ?? 0;
    // EGEN skotning räknas (manuell trumfar maskinens lass); OMLASTNING räknas ALDRIG.
    skotat += resolveSkotareVolym(rad, matt).egen;
  }
  return { skotat, harManuellAvslut: false };
}


// Virke KVAR på backen = vårt väntande skotararbete. Egen skotning (säljaren/markägaren skotar
// själv) → det är INTE vårt jobb → aldrig på vår backe (0). Delad av båda vyerna så egen_skotning
// exkluderas identiskt ur alla på-backen-summor (header, per-maskin, uppföljningens lista).
export function paBackenKvar(skordat: number, skotat: number | null, egenSkotning: boolean): number {
  if (egenSkotning) return 0;
  return Math.max(0, skordat - (skotat ?? 0));
}


// ─────────────────────────────────────────────────────────────────────────────
// PER-HÖG "KVAR" — sortiment-volym som återstår på HPR-högarna efter skotning_uttag.
// EN plats: pie-ikonerna (loadHogar) OCH kommande skotarvyns stråk-etiketter läser SAMMA
// beräkning, aldrig var sin kopia (det var tre inline-kopior tidigare). Rena funktioner
// (ingen karta/DOM) — anroparen gör pie-ikon-generering + setData efteråt. Logiken är
// FLYTTAD verbatim ur loadHogar (kanoniskt) resp. spar-handlarna (optimistiskt).
// ─────────────────────────────────────────────────────────────────────────────

/** En hög-feature, så mycket som avdraget behöver: [lng,lat] + sortiment→volym-JSON + total. */
export interface HogFeatureKvar {
  geometry: { coordinates: number[]; [k: string]: any };
  properties: { volym: number; sortimentVolymJson?: string; [k: string]: any };
  [k: string]: any;
}

/** En skotning_uttag-rad så mycket som avdraget läser. `tradslag` bär sortimentet. */
export interface UttagRad {
  tradslag: string;
  volym: number;
  polygon_coords?: number[][] | null;
}

/** Point-in-polygon (ray casting). Delad av avdraget och GROT-filtret. */
export function punktIPolygon(pt: [number, number], poly: number[][]): boolean {
  let inside = false;
  const [px, py] = pt;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Djupkopia av en hög-feature — avdraget muterar ALDRIG originalet. */
function kopieraHog<H extends HogFeatureKvar>(h: H): H {
  return { ...h, geometry: { ...h.geometry, coordinates: [...h.geometry.coordinates] }, properties: { ...h.properties } };
}

/**
 * KANONISK "kvar": givet HPR-högarna (original) och ALLA skotning_uttag-rader, returnera
 * högarna med volym/sortimentVolymJson reducerade; tömda högar (rest ≤ 0.01) borttagna.
 * Polygon-uttag drar av PROPORTIONELLT per sortiment inom sin polygon; legacy-uttag (utan
 * polygon_coords) proportionellt per sortiment över alla kvarvarande. Verbatim ur loadHogar.
 */
export function draAvUttagFranHogar<H extends HogFeatureKvar>(hogar: H[], uttag: UttagRad[]): H[] {
  let filteredHogar = hogar.map(kopieraHog);
  if (!uttag || uttag.length === 0) return filteredHogar;

  const polyUttag = uttag.filter(u => u.polygon_coords && Array.isArray(u.polygon_coords) && u.polygon_coords.length >= 3);
  const legacyUttag = uttag.filter(u => !u.polygon_coords || !Array.isArray(u.polygon_coords) || u.polygon_coords.length < 3);

  // === Polygon-baserat avdrag: proportionellt per polygon ===
  if (polyUttag.length > 0) {
    const polyGroups: { poly: number[][]; sortVol: Record<string, number> }[] = [];
    const seen = new Map<string, number>();
    for (const u of polyUttag) {
      const polyKey = JSON.stringify(u.polygon_coords);
      let idx = seen.get(polyKey);
      if (idx === undefined) {
        idx = polyGroups.length;
        seen.set(polyKey, idx);
        polyGroups.push({ poly: u.polygon_coords as number[][], sortVol: {} });
      }
      polyGroups[idx].sortVol[u.tradslag] = (polyGroups[idx].sortVol[u.tradslag] || 0) + u.volym;
    }
    for (const grp of polyGroups) {
      const totalInPoly: Record<string, number> = {};
      for (const h of filteredHogar) {
        const [hLng, hLat] = h.geometry.coordinates;
        if (!punktIPolygon([hLng, hLat], grp.poly)) continue;
        const sv: Record<string, number> = JSON.parse(h.properties.sortimentVolymJson || '{}');
        for (const [sort, vol] of Object.entries(sv)) totalInPoly[sort] = (totalInPoly[sort] || 0) + (vol as number);
      }
      const newFiltered: H[] = [];
      for (const h of filteredHogar) {
        const [hLng, hLat] = h.geometry.coordinates;
        if (!punktIPolygon([hLng, hLat], grp.poly)) { newFiltered.push(h); continue; }
        const sv: Record<string, number> = JSON.parse(h.properties.sortimentVolymJson || '{}');
        let newTotal = 0;
        const newSv: Record<string, number> = {};
        for (const [sort, vol] of Object.entries(sv)) {
          const uttaget = grp.sortVol[sort] || 0;
          const totalSort = totalInPoly[sort] || 1;
          const fraction = (vol as number) / totalSort;
          const avdrag = uttaget * fraction;
          const rest = Math.max(0, (vol as number) - avdrag);
          if (rest > 0.001) newSv[sort] = rest;
          newTotal += rest;
        }
        if (newTotal > 0.01) {
          h.properties.volym = Math.round(newTotal * 100) / 100;
          h.properties.sortimentVolymJson = JSON.stringify(newSv);
          newFiltered.push(h);
        }
      }
      filteredHogar = newFiltered;
    }
  }

  // === Legacy avdrag (utan polygon_coords): proportionellt per sortiment ===
  if (legacyUttag.length > 0) {
    const uttagMap: Record<string, number> = {};
    legacyUttag.forEach(u => { uttagMap[u.tradslag] = (uttagMap[u.tradslag] || 0) + u.volym; });
    const totalPerSort: Record<string, number> = {};
    filteredHogar.forEach(h => {
      const sv: Record<string, number> = JSON.parse(h.properties.sortimentVolymJson || '{}');
      for (const [sort, vol] of Object.entries(sv)) totalPerSort[sort] = (totalPerSort[sort] || 0) + (vol as number);
    });
    const newFiltered: H[] = [];
    for (const h of filteredHogar) {
      const sv: Record<string, number> = JSON.parse(h.properties.sortimentVolymJson || '{}');
      let newTotal = 0;
      const newSv: Record<string, number> = {};
      for (const [sort, vol] of Object.entries(sv)) {
        const uttaget = uttagMap[sort] || 0;
        const totalSort = totalPerSort[sort] || 1;
        const fraction = (vol as number) / totalSort;
        const avdrag = uttaget * fraction;
        const rest = Math.max(0, (vol as number) - avdrag);
        if (rest > 0.001) newSv[sort] = rest;
        newTotal += rest;
      }
      if (newTotal > 0.01) {
        h.properties.volym = Math.round(newTotal * 100) / 100;
        h.properties.sortimentVolymJson = JSON.stringify(newSv);
        newFiltered.push(h);
      }
    }
    filteredHogar = newFiltered;
  }

  return filteredHogar;
}

/**
 * OPTIMISTISK inkrementell uppdatering direkt efter "Spara uttag": givet NUVARANDE (redan
 * avdragna) högar, den nyss sparade polygonen och de KRYSSADE sortimenten, dra bort de
 * sortimenten HELT ur högar inuti polygonen. Transient UI-feedback (loadHogar skriver om
 * kanoniskt via reload/realtime strax efter). Verbatim ur de två spar-handlarna.
 */
export function draAvSparatSortiment<H extends HogFeatureKvar>(hogar: H[], polygon: number[][], kryssadeSortiment: Set<string>): H[] {
  const newFeatures: H[] = [];
  for (const h of hogar) {
    const [hLng, hLat] = h.geometry.coordinates;
    if (!punktIPolygon([hLng, hLat], polygon)) { newFeatures.push(kopieraHog(h)); continue; }
    const sv: Record<string, number> = JSON.parse(h.properties.sortimentVolymJson || '{}');
    const newSv: Record<string, number> = {};
    for (const [sort, vol] of Object.entries(sv)) {
      if (kryssadeSortiment.has(sort)) continue; // dra av helt — detta sortiment sparades som uttag
      newSv[sort] = vol as number;
    }
    const rest = Object.values(newSv).reduce((s, v) => s + v, 0);
    if (rest <= 0.01) continue; // högen försvinner
    const kopia = kopieraHog(h);
    kopia.properties.volym = Math.round(rest * 100) / 100;
    kopia.properties.sortimentVolymJson = JSON.stringify(newSv);
    newFeatures.push(kopia);
  }
  return newFeatures;
}
