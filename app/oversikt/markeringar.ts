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

export const SUB_LABEL: Record<string, string> = {
  // Faror
  powerline: 'Kraftledning', warning: 'Varning',
  // Hänsyn
  eternitytree: 'Eternitträd', naturecorner: 'Naturhörn', protected: 'Skyddat område',
  fornlamning: 'Fornlämning', culture: 'Kulturmiljö', culturemonument: 'Kulturminne',
  highstump: 'Högstubbe',
  // Övrigt — punkter
  manualfelling: 'Manuell fällning', steep: 'Brant', culturestump: 'Kulturstubbe',
  bridge: 'Bro', landing: 'Avlägg', corduroy: 'Kavelbro', ditch: 'Dike',
  windfall: 'Vindfälle', brashpile: 'Rishög', road: 'Väg', trail: 'Stig',
  turningpoint: 'Vändplats',
  // Övrigt — zoner
  wet: 'Blöt mark', noentry: 'Kör ej',
  // Övrigt — linjer
  boundary: 'Traktgräns', mainRoad: 'Basväg', nature: 'Naturvärde', stickvag: 'Stickväg',
  backRoadRed: 'Basväg', backRoadYellow: 'Basväg', backRoadBlue: 'Basväg',
  sideRoadRed: 'Stickväg', sideRoadYellow: 'Stickväg', sideRoadBlue: 'Stickväg',
  // Övrigt — pilar
  fellingdirection: 'Fällriktning', drivedirection: 'Körriktning',
};

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
