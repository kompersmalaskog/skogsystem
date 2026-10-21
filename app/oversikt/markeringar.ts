import { LINJE_NAMN, SYMBOL_NAMN, YTA } from '../../lib/larm/grupper';

/* ── Delad klassning + humanisering av planering_markeringar ──
   EN källa för både Karta-fliken (OversiktKarta) och Objekt-fliken
   (OversiktObjektLista → ObjektDetalj) — så samma objekt ser likadant ut i båda.
   Semantiken ligger i data: type/zoneType/lineType/arrowType (se brief). */

export type FaraNiva = 'fara' | 'hansyn';               // markör/banner-nivå
export type MarkLevel = 'fara' | 'hansyn' | 'ovrigt';   // alla markeringar i kortlistan

export const FARA_SUBTYPER = new Set(['powerline', 'warning']);
export const HANSYN_SUBTYPER = new Set([
  'eternitytree', 'naturecorner', 'protected', 'fornlamning',
  'culture', 'culturemonument', 'highstump',
]);

/* NAMNEN bor i EN källa (lib/larm/grupper: SYMBOL_NAMN, YTA, LINJE_NAMN) — samma som menyn, kartan och larmkortet. Här finns bara det som
   saknas där (basväg, stickväg, traktgräns, pilar …). En egen etikett för något som redan har ett namn är förbjuden (vakt: markeringar.test.ts). */
export const OVRIGA_ETIKETTER: Record<string, string> = {
  boundary: 'Traktgräns', mainRoad: 'Basväg', nature: 'Naturvärde', stickvag: 'Stickväg',
  sideRoadRed: 'Stickväg', sideRoadYellow: 'Stickväg', sideRoadBlue: 'Stickväg',
  fellingdirection: 'Fällriktning', drivedirection: 'Körriktning',
};

/** Namnet på en markering, avgjort av VAD den är (symbol, yta eller linje) — `wet` är Fuktig mark som symbol men Blött som yta. */
export function markeringNamn(data: any): string {
  if (!data || typeof data !== 'object') return 'Markering';
  // Först tabellen för det slag markeringen är; saknas nyckeln där (gammal data med fel slag) gäller de andra tabellerna — aldrig ett eget namn.
  if (data.type) return SYMBOL_NAMN[data.type] ?? subLabel(String(data.type));
  if (data.zoneType) return YTA[data.zoneType]?.namn ?? subLabel(String(data.zoneType));
  if (data.lineType) return LINJE_NAMN[data.lineType] ?? subLabel(String(data.lineType));
  if (data.arrowType) return subLabel(String(data.arrowType));
  return 'Markering';
}

/** Etikett för en subtyp när bara subtypen är känd (symbol före yta före linje). Föredra `markeringNamn(data)`. */
export const SUB_LABEL: Record<string, string> = { ...OVRIGA_ETIKETTER, ...Object.fromEntries(Object.entries(YTA).map(([k, v]) => [k, v.namn])), ...LINJE_NAMN, ...SYMBOL_NAMN };

/* Sista utväg när vi saknar en svensk etikett — så inget filtreras bort tyst. */
export function prettifySub(sub: string): string {
  const s = sub.replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Svensk etikett för en subtyp — SUB_LABEL först, annars prettify. */
export function subLabel(sub: string): string {
  return SUB_LABEL[sub] || prettifySub(sub);
}

export function markeringSub(data: any): string | null {
  if (!data || typeof data !== 'object') return null;
  return data.type || data.zoneType || data.lineType || data.arrowType || null;
}

export function classifyMarkering(data: any): MarkLevel {
  const sub = markeringSub(data);
  if (sub && FARA_SUBTYPER.has(sub)) return 'fara';
  if (sub && HANSYN_SUBTYPER.has(sub)) return 'hansyn';
  return 'ovrigt';   // visa allt — inget filtreras bort tyst
}
