// DET SOM ÄR KLART BLIR GRÅTT (Kartan lugnare, 2026-10-24). Samma princip som resten av appen: status visas med STYRKA, inte med en egen färg — full färg är det som
// är kvar, grått och svagare är det som är gjort. Det här är bara det som FINNS som status idag; ingen ny status hittas på:
//
//   • Skotad yta  = polygonerna föraren ritat med "Markera utkört" (skotning_uttag.polygon_coords) → grå yta med tunn grå kant.
//   • Klar trakt  = objekt.status 'avslutat' (förr även 'klar') → trakten ritas lugnt: vägarna och maskinspåren (avverkad/skotad yta) i grått.
//
// Det finns INGEN status per väg ("Väg klar? Klar / Inte än" är inte byggt än, se CLAUDE.md, skotarläge del 1) — när den kommer är det HÄR den kopplas in
// (`arObjektKlart` / en egen funktion för en enskild väg), och kartan behöver inte ändras. Fara, larm, fällningscirkel och handplacerade pilar rörs aldrig av detta.
import { FARG } from './design/tokens';

/** Grått för det som är klart: appens sekundära textgrå (inte en ny färg). */
export const KLART_FARG = FARG.text2;
/** Linjer (vägar, maskinspår) i grått: svagare än det som är kvar, men fortfarande läsbara — skotaren följer fortfarande spåren. */
export const KLART_LINJE_OPACITET = 0.6;
/** Skotad yta: tunn fyllning och kant. */
export const KLART_YTA_FYLLNING = 0.16;
export const KLART_YTA_KANT_OPACITET = 0.55;

export const KLART_KALLA = 'klart-yta-source';
export const KLART_FYLLNING_LAGER = 'klart-yta-fill';
export const KLART_KANT_LAGER = 'klart-yta-line';

/** Trakten är klar när den är avslutad. (`klar` är det gamla värdet som kan finnas kvar i äldre data.) */
export const arObjektKlart = (status: string | null | undefined): boolean => status === 'avslutat' || status === 'klar';

type Par = [number, number];
export interface YtaFeature { type: 'Feature'; properties: Record<string, never>; geometry: { type: 'Polygon'; coordinates: Par[][] } }
export interface YtaSamling { type: 'FeatureCollection'; features: YtaFeature[] }

const arPar = (p: unknown): p is Par => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]);

/**
 * De sparade skotningsuttagens polygoner som en GeoJSON-samling. Samma polygon kan stå på flera rader (ett uttag per trädslag/sortiment delar polygon) — den ritas en gång.
 * Ogiltiga polygoner (färre än tre hörn, icke-tal) hoppas över; en polygon utan avslutande hörn stängs. Koordinaterna är [lng, lat], som i skotning_uttag.
 */
export function skotadeYtor(uttag: ReadonlyArray<{ polygon_coords?: unknown }> | null | undefined): YtaSamling {
  const sett = new Set<string>();
  const features: YtaFeature[] = [];
  for (const u of uttag ?? []) {
    const c = u?.polygon_coords;
    if (!Array.isArray(c) || c.length < 3 || !c.every(arPar)) continue;
    const ring: Par[] = (c as Par[]).map((p) => [p[0], p[1]]);
    const f = ring[0], l = ring[ring.length - 1];
    if (f[0] !== l[0] || f[1] !== l[1]) ring.push([f[0], f[1]]);
    if (ring.length < 4) continue;
    const nyckel = JSON.stringify(ring);
    if (sett.has(nyckel)) continue;
    sett.add(nyckel);
    features.push({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } });
  }
  return { type: 'FeatureCollection', features };
}

/** Vägar och maskinspår som ritas grå när trakten är klar (färg och styrka tas tillbaka när den inte längre är det). Kanten (casing) bakom vägarna rörs inte. */
export const KLART_LINJELAGER: readonly string[] = [
  'line-mainRoad-base', 'line-sideRoadRed-base', 'line-sideRoadYellow-base', 'line-sideRoadBlue-base',   // vägar (snitselfärg → grå)
  'planspar-skordare-line', 'planspar-skotare-line',                                                      // avverkad och skotad yta = maskinernas spår
];
/** Lager som tonas bort helt när trakten är klar: basvägens gula streck (blå/gul väg blir en vanlig grå linje, inte grå och gul). */
export const KLART_TONAS_BORT: readonly string[] = ['line-mainRoad-stripe'];

/** Tomma ytor — kartans källa när det inte finns något skotat. */
export const INGA_YTOR: YtaSamling = { type: 'FeatureCollection', features: [] };
