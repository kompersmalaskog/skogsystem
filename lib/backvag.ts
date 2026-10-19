// BACKVÄG: en EGENSKAP på en befintlig väg, ingen ny vägtyp. Man kör in på vägen men måste backa ut, för att det finns ett hinder i ena änden
// (sten, brant backe, blött). Vägen behåller sin färg och sitt utseende — färgen är snitslet i skogen och rörs inte. Det enda som läggs till är ett
// tvärstreck (⊣) i hinderänden, i vägens egen färg med mörk kant.
//
// Lagring: ett fält `backvag` på markeringen (JSONB i planering_markeringar.data, precis som `farg` och `nummer` på basvägen) — ingen migration.
//   backvag: { ande: 'start' | 'slut', orsak?: 'sten' | 'brant' | 'blott' | 'annat' }
//   `ande` räknas längs väg-linjens ritriktning: 'start' = första punkten, 'slut' = sista. Ritas vägen om åt andra hållet byter ändarna plats.
//   Saknas fältet (allt som ritades före backväg) är vägen en vanlig väg.
//
// Bara information: backväg påverkar inte Kvar, Klar-dag, Väg klar eller något annat som räknas.
//
// Rena funktioner — används av planeringsvyn (kort + karta), kartstilen (egenkontrollens karta) och kortets text.

export type BackvagAnde = 'start' | 'slut';
export type BackvagOrsak = 'sten' | 'brant' | 'blott' | 'annat';
export interface Backvag { ande: BackvagAnde; orsak?: BackvagOrsak }

/** Orsakerna i den ordning de visas. Valfri, EN åt gången, inget fritextfält. */
export const BACKVAG_ORSAKER: ReadonlyArray<{ id: BackvagOrsak; namn: 'Sten' | 'Brant' | 'Blött' | 'Annat' }> = [
  { id: 'sten', namn: 'Sten' },
  { id: 'brant', namn: 'Brant' },
  { id: 'blott', namn: 'Blött' },
  { id: 'annat', namn: 'Annat' },
];
export const BACKVAG_ANDAR: ReadonlyArray<{ id: BackvagAnde; namn: 'Början' | 'Slutet' }> = [
  { id: 'start', namn: 'Början' },
  { id: 'slut', namn: 'Slutet' },
];

export const arBackvagAnde = (v: unknown): v is BackvagAnde => v === 'start' || v === 'slut';
export const arBackvagOrsak = (v: unknown): v is BackvagOrsak => v === 'sten' || v === 'brant' || v === 'blott' || v === 'annat';

/** Vilka linjetyper är vägar: basväg, stickväg och backväg-typerna (alla i röd/gul/blå). Naturvård, dike, stig, stenmur och traktgräns är inga vägar. */
export const VAG_LINJETYPER: readonly string[] = [
  'mainRoad',
  'sideRoadRed', 'sideRoadYellow', 'sideRoadBlue',
  'backRoadRed', 'backRoadYellow', 'backRoadBlue',
];
export const arVagTyp = (lineType: unknown): boolean => typeof lineType === 'string' && VAG_LINJETYPER.includes(lineType);

/** Läser `backvag` ur en markering. Okänt eller trasigt → null (en vanlig väg): aldrig ett påhittat hinder. */
export function lasBackvag(markering: unknown): Backvag | null {
  const v = (markering as { backvag?: unknown } | null | undefined)?.backvag;
  if (!v || typeof v !== 'object') return null;
  const { ande, orsak } = v as { ande?: unknown; orsak?: unknown };
  if (!arBackvagAnde(ande)) return null;
  return arBackvagOrsak(orsak) ? { ande, orsak } : { ande };
}

/** Sätter eller tar bort backväg på en markering (null = vanlig väg igen: fältet tas bort, som före backväg). Rör inget annat. */
export function medBackvag<T extends object>(m: T, bv: Backvag | null): T {
  if (bv) return { ...m, backvag: bv.orsak ? { ande: bv.ande, orsak: bv.orsak } : { ande: bv.ande } };
  const { backvag: _bort, ...utan } = m as T & { backvag?: unknown };
  return utan as unknown as T;
}

/** Slår på backväg. Hindret förvalt i SLUTET: vägen ritas in från vägnätet, så hindret är i regel längst in (syns direkt på kartan och går att byta). */
export const BACKVAG_FORVALD_ANDE: BackvagAnde = 'slut';

export const backvagOrsakNamn = (orsak: unknown): string | null => BACKVAG_ORSAKER.find((o) => o.id === orsak)?.namn ?? null;

/** Kortets rubrik: "Backväg – backa ut". */
export const BACKVAG_TITEL = 'Backväg – backa ut';

/** "Backväg – backa ut" eller "Backväg – backa ut · Sten". */
export function backvagText(bv: Backvag | null | undefined): string | null {
  if (!bv) return null;
  const orsak = backvagOrsakNamn(bv.orsak);
  return orsak ? `${BACKVAG_TITEL} · ${orsak}` : BACKVAG_TITEL;
}

// ---------------------------------------------------------------------------
// Tvärstreckets färg och läge
// ---------------------------------------------------------------------------

/** Vilken färg tvärstrecket får = vägens egen: röd, gul, blå, eller Blå/gul (basväg utan färg: blå med gula streck). */
export type BackvagStreckFarg = 'red' | 'yellow' | 'blue' | 'blagul';
export const BACKVAG_STRECK_FARGER: readonly BackvagStreckFarg[] = ['red', 'yellow', 'blue', 'blagul'];

export function backvagStreckFarg(lineType: unknown, farg?: unknown): BackvagStreckFarg {
  const t = typeof lineType === 'string' ? lineType : '';
  if (t === 'mainRoad') return farg === 'red' || farg === 'yellow' || farg === 'blue' ? farg : 'blagul';
  if (t.endsWith('Red')) return 'red';
  if (t.endsWith('Yellow')) return 'yellow';
  if (t.endsWith('Blue')) return 'blue';
  return 'blagul';
}

type LngLat = [number, number];
const RAD = Math.PI / 180;

/** Riktningen i grader medurs från norr, från a till b (lokal plan approximation — räcker för en ikons vinkel). */
function riktning(a: LngLat, b: LngLat): number {
  const dx = (b[0] - a[0]) * Math.cos(((a[1] + b[1]) / 2) * RAD);
  const dy = b[1] - a[1];
  return ((Math.atan2(dx, dy) / RAD) + 360) % 360;
}
function avstandM(a: LngLat, b: LngLat): number {
  const dx = (b[0] - a[0]) * 111320 * Math.cos(((a[1] + b[1]) / 2) * RAD);
  const dy = (b[1] - a[1]) * 110540;
  return Math.hypot(dx, dy);
}

/** Hur långt från änden grannpunkten ska ligga för att ge en pålitlig riktning (tätt liggande punkter ger brus). */
const MIN_GRANNE_M = 2;

export interface BackvagStreck {
  /** Änden där hindret är. */
  punkt: LngLat;
  /** Riktningen UT ur vägen i änden, grader medurs från norr. Ikonen (en vågrät stapel) roteras med den, så den hamnar tvärs över vägen. */
  riktning: number;
}

/**
 * Var tvärstrecket ska sitta: i vägens ände, vinkelrätt mot vägens riktning där. Riktningen tas mot den närmaste punkten som ligger minst 2 m bort
 * (inte mot en dubblettpunkt), annars mot den längst bort liggande. Under två punkter → null.
 */
export function backvagStreck(koordinater: ReadonlyArray<LngLat>, ande: BackvagAnde): BackvagStreck | null {
  if (koordinater.length < 2) return null;
  const rad = ande === 'start' ? koordinater : [...koordinater].reverse();   // rad[0] = hinderänden
  const andpunkt = rad[0];
  let granne = rad[1];
  for (let i = 1; i < rad.length; i++) {
    granne = rad[i];
    if (avstandM(andpunkt, rad[i]) >= MIN_GRANNE_M) break;
  }
  if (avstandM(andpunkt, granne) === 0) return null;   // alla punkter på samma ställe: ingen riktning
  return { punkt: andpunkt, riktning: riktning(granne, andpunkt) };
}

/** En GeoJSON-feature för tvärstrecket (en punkt med ikon, riktning och vägens färg). Null om vägen inte är backväg eller saknar giltig geometri. */
export function backvagFeature(
  markering: { id?: unknown; lineType?: unknown; farg?: unknown; backvag?: unknown },
  koordinater: ReadonlyArray<LngLat>,
): { type: 'Feature'; properties: { id: unknown; lineType: string; streck: BackvagStreckFarg; riktning: number }; geometry: { type: 'Point'; coordinates: LngLat } } | null {
  if (!arVagTyp(markering.lineType)) return null;
  const bv = lasBackvag(markering);
  if (!bv) return null;
  const s = backvagStreck(koordinater, bv.ande);
  if (!s) return null;
  return {
    type: 'Feature',
    properties: { id: markering.id, lineType: String(markering.lineType), streck: backvagStreckFarg(markering.lineType, markering.farg), riktning: Math.round(s.riktning * 10) / 10 },
    geometry: { type: 'Point', coordinates: s.punkt },
  };
}
