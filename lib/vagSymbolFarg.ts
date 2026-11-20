// VÄGSYMBOL → VÄGFÄRG (Planeringsvyn, Martin 2026-10-28).
//
// På äldre trakter (Skälviken RP J-Hus -25 m.fl.) satte planeraren VÄGSYMBOLER ("Röd väg", "Gul väg" …) bredvid basvägarna, för att basvägen inte kunde ha
// en färg då. Nu har basvägen `farg` (lib/basvag). Följden i hytten: linjen visas Blå/gul medan symbolen säger röd — två besked om samma väg, och stora svarta
// ringar på en liten trakt. Symbolerna sattes BARA för att vägfärg inte fanns (Martin 2026-10-28).
//
// Därför föreslås de bli vägfärg, på samma sätt som de gröna fällpilarna föreslås bli träd (lib/fallTrad `foreslaTrad`): planeraren ser förslaget på kartan,
// trycker Godkänn — vägarna får färgen och FÖRST DÅ tas exakt de symboler förslaget bygger på bort. "Inte nu" gäller tills trakten byts.
//
// REGLER (rena funktioner, ingen migration — allt är JSONB på markeringarna):
//   • En vägsymbol = `type: 'road'`. Färgen läses ur symbolens text ("Röd väg", "Gul Basväg in …"); står ingen färg, eller två olika, är det ingen färg.
//   • Symbolen hör till NÄRMASTE basväg (lineType 'mainRoad') inom VAGSYMBOL_MAX_M. Längre bort: rörs inte.
//   • Två symboler med OLIKA färg på samma väg: varken vägen eller symbolerna rörs.
//   • Vägen har redan en ANNAN färg: varken vägen eller symbolerna rörs. Samma färg: vägen ändras inte, symbolen tas bort (den säger inget nytt).
//   • Bara basvägar: stickvägarna har färgen i själva linjetypen (sideRoadRed/Yellow/Blue) — en annan färgmodell, de rörs aldrig här.
//   • Vägsymbolen finns kvar i menyn; förslaget rör bara de symboler som redan står på trakten.

import { avstandTillLinjeM, type LatLon } from './larm/geo';
import { type BasvagFarg, medBasvagVal } from './basvag';

export const VAGSYMBOL_TYP = 'road';

/**
 * Hur långt från en basväg en vägsymbol får stå för att räknas till den (m). Skälvikens fyra symboler står 0,2–1,6 m från närmaste basväg och 27–33 m från
 * näst närmaste (prod 2026-10-28) — utom en som står i en korsning (0,6 m mot 2,4 m), där avgör närmast. 25 m fångar en symbol som satts bredvid vägen
 * utan att nå över till grannvägen.
 */
export const VAGSYMBOL_MAX_M = 25;

/** Spökets styrka på kartan: symbolerna förslaget tar bort ritas så här starka medan förslaget står. */
export const VAGSYMBOL_SPOKE_OPACITET = 0.5;

/** Färgen i en symbols text. "Röd väg", "röda vägen", "Gul Basväg in till gallringen" … Ingen färg, eller två OLIKA färger, = null. */
export function fargUrText(text: unknown): BasvagFarg | null {
  if (typeof text !== 'string') return null;
  const t = text.toLowerCase();
  const hittade = new Set<BasvagFarg>();
  if (/(^|[^a-zåäö])(röd|rött|röda)(?![a-zåäö])/.test(t)) hittade.add('red');
  if (/(^|[^a-zåäö])(gul|gult|gula)(?![a-zåäö])/.test(t)) hittade.add('yellow');
  if (/(^|[^a-zåäö])(blå|blått|blåa)(?![a-zåäö])/.test(t)) hittade.add('blue');
  return hittade.size === 1 ? [...hittade][0] : null;
}

export interface VagMarkering {
  id: unknown;
  isMarker?: boolean; type?: string; comment?: string;
  isLine?: boolean; lineType?: string; farg?: unknown; nummer?: unknown;
  x?: number; y?: number; lat?: number; lng?: number;
  path?: ReadonlyArray<{ x?: number; y?: number; lat?: number; lng?: number }>;
}

export const arVagSymbol = (m: VagMarkering | null | undefined): boolean => !!m && m.isMarker === true && m.type === VAGSYMBOL_TYP;
const arBasvag = (m: VagMarkering): boolean => m.isLine === true && m.lineType === 'mainRoad' && Array.isArray(m.path) && m.path.length > 1;

type TillLatLon = (x: number, y: number) => LatLon;
function punkt(p: { x?: number; y?: number; lat?: number; lng?: number }, tillLatLon: TillLatLon): LatLon | null {
  if (typeof p.lat === 'number' && typeof p.lng === 'number') return { lat: p.lat, lon: p.lng };
  if (typeof p.x === 'number' && typeof p.y === 'number') return tillLatLon(p.x, p.y);
  return null;
}

export interface VagForslagRad {
  vagId: string;
  farg: BasvagFarg;
  /** false = vägen har redan den färgen (bara symbolerna tas bort). */
  andras: boolean;
  symbolIdn: string[];
}

export interface VagForslag {
  /** Vägarna som får färg (eller redan har den), i vägnummerordning. */
  vagar: VagForslagRad[];
  /** Exakt de symboler som tas bort vid Godkänn. */
  symbolIdn: string[];
  /** Det som INTE rörs och varför (antal). */
  orort: { utanVag: number; krock: number; annanFarg: number; utanFarg: number };
}

/** Förslaget för trakten: varje vägsymbol till närmaste basväg, och vad som inte rörs. */
export function foreslaVagFarg(markers: readonly VagMarkering[], tillLatLon: TillLatLon, maxM = VAGSYMBOL_MAX_M): VagForslag {
  const vagar = markers.filter(arBasvag).map((m) => ({
    m,
    linje: (m.path ?? []).map((p) => punkt(p, tillLatLon)).filter((p): p is LatLon => p != null),
  })).filter((v) => v.linje.length > 1);

  const orort = { utanVag: 0, krock: 0, annanFarg: 0, utanFarg: 0 };
  const perVag = new Map<string, { m: VagMarkering; fargerna: Set<BasvagFarg>; symbolIdn: string[] }>();

  for (const s of markers) {
    if (!arVagSymbol(s)) continue;
    const farg = fargUrText(s.comment);
    if (!farg) { orort.utanFarg++; continue; }
    const pos = punkt(s, tillLatLon);
    if (!pos) { orort.utanVag++; continue; }
    let bast: { m: VagMarkering; d: number } | null = null;
    for (const v of vagar) {
      const d = avstandTillLinjeM(pos, v.linje);
      if (d <= maxM && (!bast || d < bast.d)) bast = { m: v.m, d };
    }
    if (!bast) { orort.utanVag++; continue; }
    const id = String(bast.m.id);
    const rad = perVag.get(id) ?? { m: bast.m, fargerna: new Set<BasvagFarg>(), symbolIdn: [] };
    rad.fargerna.add(farg);
    rad.symbolIdn.push(String(s.id));
    perVag.set(id, rad);
  }

  const ut: VagForslagRad[] = [];
  for (const [vagId, rad] of perVag) {
    if (rad.fargerna.size > 1) { orort.krock++; continue; }
    const farg = [...rad.fargerna][0];
    const nu = rad.m.farg;
    if (nu != null && nu !== farg) { orort.annanFarg++; continue; }
    ut.push({ vagId, farg, andras: nu !== farg, symbolIdn: rad.symbolIdn });
  }
  const nr = (id: string) => { const m = perVag.get(id)?.m; return typeof m?.nummer === 'number' ? m.nummer : Number.MAX_SAFE_INTEGER; };
  ut.sort((a, b) => nr(a.vagId) - nr(b.vagId) || a.vagId.localeCompare(b.vagId));
  return { vagar: ut, symbolIdn: ut.flatMap((r) => r.symbolIdn), orort };
}

/** Finns det något att föreslå? (Ett förslag som inte ändrar något visas aldrig.) */
export const harVagForslag = (f: VagForslag | null | undefined): f is VagForslag => !!f && f.vagar.length > 0;

/** Frågan och EN rad om det som inte rörs (null när allt rörs). */
export function vagForslagText(f: VagForslag): { fraga: string; orort: string | null } {
  const n = f.vagar.length;
  const fraga = n === 1 ? `Ge vägen färg från symbolen${f.vagar[0].symbolIdn.length > 1 ? 'erna' : ''}?` : `Ge ${n} vägar färg från symbolerna?`;
  const delar: string[] = [];
  const st = (k: number, en: string, flera: string) => `${k} ${k === 1 ? en : flera}`;
  if (f.orort.krock) delar.push(`${st(f.orort.krock, 'väg', 'vägar')} med två färger`);
  if (f.orort.annanFarg) delar.push(`${st(f.orort.annanFarg, 'väg', 'vägar')} som redan har en annan färg`);
  if (f.orort.utanVag) delar.push(`${st(f.orort.utanVag, 'symbol', 'symboler')} långt från vägarna`);
  if (f.orort.utanFarg) delar.push(`${st(f.orort.utanFarg, 'symbol', 'symboler')} utan färg`);
  return { fraga, orort: delar.length ? `Rörs inte: ${delar.join(', ')}.` : null };
}

/** Vägens färg i förslaget (för spöket på kartan): vägens id → färg. */
export const forslagFargPerVag = (f: VagForslag | null | undefined): Map<string, BasvagFarg> => new Map((f?.vagar ?? []).map((r) => [r.vagId, r.farg]));

/** Godkänn: vägarna med ny färg (bara de som ändras) och id:n på symbolerna som tas bort. Rör inget annat på vägen. */
export function tillampaVagForslag<T extends VagMarkering>(markers: readonly T[], f: VagForslag): { andrade: T[]; bortIdn: string[] } {
  const farg = new Map(f.vagar.filter((r) => r.andras).map((r) => [r.vagId, r.farg]));
  const andrade = markers.filter((m) => farg.has(String(m.id))).map((m) => medBasvagVal(m, farg.get(String(m.id))!));
  return { andrade, bortIdn: [...f.symbolIdn] };
}

