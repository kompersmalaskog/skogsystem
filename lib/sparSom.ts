// "SPARA SOM …" — en uppritad/uppmätt figur (Klar i körvyns Mät/Rita) blir en VANLIG markering, precis som planeringens egna
// finishLineFromCoords / finishZoneFromCoords gör den: samma form i planering_markeringar, synlig för alla på objektet.
//
//   zon   → { id, zoneType, path, isZone: true }                       (path = sluten ring av SVG-punkter)
//   linje → { id, lineType, path, isLine: true }
//   yta   → { id, isLine: true, lineType: 'boundary', nummer, path }    (= "eget område", som planeringens Nytt område)
//
// TABELLEN NEDAN är den enda platsen som säger vilken markeringstyp varje val blir. Det är tre gissningar jag inte kan
// verifiera mot någon specifikation — ändra här, inte i vyn:
//   Hänsyn   → zonen 'protected' (planeringen kallar den Naturvård)
//   Linje    → 'trail' (Stig/Led: neutral vit streckad — den enda linjetypen utan färgbetydelse)
//   Yta      → eget område (traktgräns-markering med nummer; tappbar, numrerad, kan få anteckning/foto/röst i ytkortet)
// och Stickväg delas i tre val eftersom färgen (röd/gul/blå) är data: det är bandfärgen på stickvägen ute i skogen.

export type FigurTyp = 'linje' | 'yta';

export type SparSomId = 'blott' | 'hansyn' | 'brant' | 'yta' | 'stickvag-rod' | 'stickvag-gul' | 'stickvag-bla' | 'linje';

export type MarkeringsMal =
  | { slag: 'zon'; zoneType: string }
  | { slag: 'linje'; lineType: string }
  | { slag: 'eget-omrade' };

export interface SparSomVal {
  id: SparSomId;
  etikett: string;
  /** Vilken sorts figur valet gäller: en linje (≥ 2 punkter) eller en yta (≥ 3 punkter). */
  figur: FigurTyp;
  mal: MarkeringsMal;
}

export const SPARA_SOM: readonly SparSomVal[] = [
  { id: 'blott',        etikett: 'Blött',          figur: 'yta',   mal: { slag: 'zon', zoneType: 'wet' } },
  { id: 'hansyn',       etikett: 'Hänsyn',         figur: 'yta',   mal: { slag: 'zon', zoneType: 'protected' } },
  { id: 'brant',        etikett: 'Brant',          figur: 'yta',   mal: { slag: 'zon', zoneType: 'steep' } },
  { id: 'yta',          etikett: 'Yta',            figur: 'yta',   mal: { slag: 'eget-omrade' } },
  { id: 'stickvag-rod', etikett: 'Stickväg röd',   figur: 'linje', mal: { slag: 'linje', lineType: 'sideRoadRed' } },
  { id: 'stickvag-gul', etikett: 'Stickväg gul',   figur: 'linje', mal: { slag: 'linje', lineType: 'sideRoadYellow' } },
  { id: 'stickvag-bla', etikett: 'Stickväg blå',   figur: 'linje', mal: { slag: 'linje', lineType: 'sideRoadBlue' } },
  { id: 'linje',        etikett: 'Linje',          figur: 'linje', mal: { slag: 'linje', lineType: 'trail' } },
];

/** De val som passar figuren (en yta kan inte bli en stickväg och tvärtom). */
export const valForFigur = (figur: FigurTyp): SparSomVal[] => SPARA_SOM.filter((v) => v.figur === figur);

/** Så många punkter krävs för att figuren ska gå att spara. */
export const minPunkter = (figur: FigurTyp): number => (figur === 'yta' ? 3 : 2);

export type LngLat = [number, number];
export type SvgPunkt = { x: number; y: number };

/** Slut ringen (första punkten sist) — som planeringen gör för zoner och områden. Redan sluten ring lämnas orörd. */
function slutenRing(coords: LngLat[]): LngLat[] {
  const f = coords[0], l = coords[coords.length - 1];
  return f && l && (f[0] !== l[0] || f[1] !== l[1]) ? [...coords, [f[0], f[1]]] : coords.slice();
}

/**
 * Bygg markeringen. `tillSvg` är sidans latLonToSvg (samma omvandling som all annan markering). `nummer` behövs bara för
 * Yta (eget område: nästa lediga nummer). Returnerar null om för få punkter — ingenting sparas av en halv figur.
 */
export function byggFigurMarkering(
  val: SparSomVal,
  coords: LngLat[],
  id: number,
  tillSvg: (lat: number, lng: number) => SvgPunkt,
  nummer?: number,
): Record<string, unknown> | null {
  const punkter = coords.filter((c) => Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1]));
  if (punkter.length < minPunkter(val.figur)) return null;
  const sv = (c: LngLat) => tillSvg(c[1], c[0]);
  if (val.mal.slag === 'zon') {
    return { id, zoneType: val.mal.zoneType, path: slutenRing(punkter).map(sv), isZone: true };
  }
  if (val.mal.slag === 'linje') {
    return { id, lineType: val.mal.lineType, path: punkter.map(sv), isLine: true };
  }
  return { id, isLine: true, lineType: 'boundary', nummer, path: slutenRing(punkter).map(sv) };
}
