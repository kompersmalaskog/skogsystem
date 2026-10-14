// Kartans svep till ett valt objekt (planeringsvyn): välj ett objekt i listan (rad eller prick), eller låt Planering öppna senaste objektet direkt →
// kartan sveper mjukt (≈ 1 s, ingen studs) in så att objektets TRAKTGRÄNS fyller kartan med lite marginal. Saknas traktgräns: in på objektets koordinat på
// samma nivå som när objektet öppnas från början (objektStartKamera). Bara planeringsvyn — körvyn och /maskin har sina egna kameror och rörs inte.
//
// TRAKTGRÄNSEN är L_TRAKTDEL (traktytorna) — inte alla features. Förut zoomade geometri-effekten över ALLA features (fastighet, bestånd …), och en leverans
// med en stor eller avlägsen fastighetsyta gav en regional zoom där trakten blev en fläck (Bågskyttebanan).
//
// LUTNINGEN (50°) behålls som i objektets vanliga öppningsvy; marginalen är därför större i sidled (64 px) — MapLibres fitBounds räknar platt, och i lutad vy
// växer den närmare kanten (uppmätt: en 300×430 m trakt på en 390 px bred telefon hamnar 23 px från skärmkanten, aldrig utanför).

export const FLYG_MS = 1000;
export const FLYG_MAX_ZOOM = 17;
export const FLYG_PITCH = 50;
/** Marginal kring trakten: toppen rymmer objektpillen, botten kontrollerna, sidorna lutningens tillväxt. */
export const FLYG_PADDING = { top: 96, bottom: 72, left: 64, right: 64 } as const;

/** Mjuk inbromsning (ease-out cubic): rör sig snabbt först och landar utan att skjuta över. 0→0, 1→1, aldrig över 1. */
export const flygEasing = (t: number): number => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

export type Gran = [[number, number], [number, number]];
export interface StartKamera { lat: number; lng: number; zoom: number }

/** Sydväst–nordost runt traktgränsen (L_TRAKTDEL-ytorna) ur objektets geometri. null om traktgräns saknas. */
export function traktGrans(fc: { features?: any[] } | null | undefined): Gran | null {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  const scan = (c: any): void => {
    if (!Array.isArray(c)) return;
    if (typeof c[0] === 'number' && typeof c[1] === 'number') {
      if (c[0] < minLng) minLng = c[0]; if (c[0] > maxLng) maxLng = c[0];
      if (c[1] < minLat) minLat = c[1]; if (c[1] > maxLat) maxLat = c[1];
    } else for (const x of c) scan(x);
  };
  for (const f of fc?.features ?? []) {
    if (f?.properties?._lager === 'L_TRAKTDEL' && f?.geometry?.coordinates) scan(f.geometry.coordinates);
  }
  return Number.isFinite(minLng) ? [[minLng, minLat], [maxLng, maxLat]] : null;
}

/**
 * Var och på vilken nivå objektet öppnas från början (utan traktgräns): kartbildens mitt på zoom 15, annars objektets koordinat på zoom 16. Samma regel som
 * planeringsvyns startcentrering (flyttad hit ordagrant så att svepet och öppningen aldrig glider isär).
 */
export function objektStartKamera(obj: any): StartKamera | null {
  if (!obj) return null;
  const b = obj.kartbild_bounds;
  if (b && Array.isArray(b) && Array.isArray(b[0]) && Array.isArray(b[1]) && b[0][0] != null && b[1][0] != null) {
    return { lat: (b[0][0] + b[1][0]) / 2, lng: (b[0][1] + b[1][1]) / 2, zoom: 15 };
  }
  if (obj.lat != null && obj.lng != null) return { lat: obj.lat, lng: obj.lng, zoom: 16 };
  return null;
}

/** Sveper kartan till objektet. Returnerar vad som gjordes: 'trakt' (fitBounds), 'punkt' (koordinat), eller null (varken gräns eller koordinat — kameran rörs inte). */
export function flygTillObjekt(map: any, o: { gran: Gran | null; start: StartKamera | null }): 'trakt' | 'punkt' | null {
  try {
    if (o.gran) {
      map.fitBounds(o.gran, { padding: FLYG_PADDING, duration: FLYG_MS, maxZoom: FLYG_MAX_ZOOM, pitch: FLYG_PITCH, bearing: 0, easing: flygEasing });
      return 'trakt';
    }
    if (o.start) {
      map.easeTo({ center: [o.start.lng, o.start.lat], zoom: o.start.zoom, pitch: FLYG_PITCH, bearing: 0, duration: FLYG_MS, easing: flygEasing });
      return 'punkt';
    }
  } catch { /* kartan är inte redo / borta */ }
  return null;
}
