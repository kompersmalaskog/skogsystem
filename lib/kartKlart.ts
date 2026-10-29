// DET SOM ÄR KLART BLIR GRÅTT (Kartan lugnare, 2026-10-24). Samma princip som resten av appen: status visas med STYRKA, inte med en egen färg — full färg är det som
// är kvar, grått och svagare är det som är gjort. Det här är bara det som FINNS som status idag; ingen ny status hittas på:
//
//   • Skotad yta  = polygonerna föraren ritat med "Markera utkört" (skotning_uttag.polygon_coords) → BARA en tunn grå kant, ingen fyllning (Martin 2026-10-27: inne i trakten ska
//                   flygfotot synas i full skärpa — en grå yta gråar ner fotot och gör trakten mörkare än skogen utanför).
//   • En AVSLUTAD trakt ritas i sina vanliga färger (Martin 2026-10-29: basvägen blå/gul, spåren lila/turkos) — en hel trakt i grått gick inte att läsa i efterhand.
//
//   • Klar väg    = en väg i KÖRORDNINGEN som maskinen kört (`korKlar` på vägens markering, lib/korordning) → vägen ritas grå, samma grå och samma styrka som en klar trakt
//                   (lib/korordningKarta: `korFarg`, `KOR_OPACITET`). Den blir grå av sig själv, ingen knapp.
//
// Fara, larm och fällningscirkel rörs aldrig av detta.
import { FARG } from './design/tokens';

/** Grått för det som är klart: appens sekundära textgrå (inte en ny färg). */
export const KLART_FARG = FARG.text2;
/** Linjer (vägar, maskinspår) i grått: svagare än det som är kvar, men fortfarande läsbara — skotaren följer fortfarande spåren. */
export const KLART_LINJE_OPACITET = 0.6;
/** Skotad yta: bara en tunn kant (ingen fyllning — fotot inne i trakten ska aldrig gråas ner). */
export const KLART_YTA_KANT_BREDD = 1.5;
export const KLART_YTA_KANT_OPACITET = 0.55;

export const KLART_KALLA = 'klart-yta-source';
export const KLART_KANT_LAGER = 'klart-yta-line';

/** En väg är klar när maskinen kört den: `korKlar` är då tiden den blev körd. */
export const arVagKlar = (korKlar: unknown): boolean => typeof korKlar === 'string' && korKlar.length > 0;


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


/** Tomma ytor — kartans källa när det inte finns något skotat. */
export const INGA_YTOR: YtaSamling = { type: 'FeatureCollection', features: [] };
