// "Är grundkartan målad?" — för startsekvensen: svart ska bara vara tills de FÖRSTA KARTRUTORNA ritats, inte tills allt på
// kartan (terräng-DEM, WMS-överlägg, ikoner) slutat ladda. MapLibres `idle` väntar på ALLT och kommer sent (eller aldrig)
// när något överlägg är långsamt; grundkartans rasterkälla räcker för att kartan ska se ut som en karta.
// Rena funktioner som tar kartan (MapLibre-lik) som parameter → enhetstestbara med en fejk.

/** Grundkartans lager-id:n i stilen (app/planering: mapStyleConfig). Överlägg, terräng och ritlager räknas INTE. */
export const GRUNDKARTA_LAGER = ['lm-layer', 'terrain-layer', 'satellite-layer', 'osm-layer'] as const;

/** Rasterkällorna för de SYNLIGA grundkarte-lagren. */
export function synligaGrundkartaKallor(map: any): string[] {
  const ut = new Set<string>();
  for (const id of GRUNDKARTA_LAGER) {
    try {
      const l = map.getLayer?.(id);
      if (!l) continue;
      const vis = map.getLayoutProperty?.(id, 'visibility');
      if (vis === 'none') continue;
      if (l.source) ut.add(String(l.source));
    } catch { /* */ }
  }
  return Array.from(ut);
}

/** Alla synliga grundkarte-källor färdigladdade? Inga synliga källor (stilen ej klar) → false. */
export function grundkartaLaddad(map: any): boolean {
  try {
    const kallor = synligaGrundkartaKallor(map);
    if (kallor.length === 0) return false;
    return kallor.every((id) => map.isSourceLoaded?.(id) === true);
  } catch { return false; }
}

/** Skiljer sig två kameralägen så att kartan måste hämta nya rutor? (Annars finns redan allt som behövs.) */
export function kameraAndrad(
  a: { lng: number; lat: number; zoom: number; pitch: number; bearing: number },
  b: { lng: number; lat: number; zoom: number; pitch: number; bearing: number },
): boolean {
  return Math.abs(a.zoom - b.zoom) > 0.01 || Math.abs(a.lng - b.lng) > 1e-5 || Math.abs(a.lat - b.lat) > 1e-5
    || Math.abs(a.pitch - b.pitch) > 0.5 || Math.abs(a.bearing - b.bearing) > 0.5;
}

export function kameraLage(map: any): { lng: number; lat: number; zoom: number; pitch: number; bearing: number } {
  const c = map.getCenter();
  return { lng: c.lng, lat: c.lat, zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing() };
}

/** Vänta tills grundkartan är målad. Anropar `klart` EN gång: direkt (nästa bildruta) om kameran INTE ändrats sedan kartans
 *  `load`-händelse (den inträffar först efter "första visuellt kompletta målningen" — rutorna för just den kameran finns redan),
 *  annars när grundkartans sista ruta kommit (`sourcedata`), vid `idle`, eller efter `maxMs`. Returnerar en avbryt-funktion.
 *  OBS: ändrad kamera kräver `andratKamera: true` — `isSourceLoaded` är vakuumt sant innan nya rutor hunnit begäras. */
export function vantaPaGrundkarta(
  map: any,
  opts: { andratKamera: boolean; maxMs: number; klart: () => void; nasta?: (f: () => void) => void; timer?: typeof setTimeout },
): () => void {
  let klar = false;
  const timer = opts.timer ?? setTimeout;
  const nasta = opts.nasta ?? ((f: () => void) => { if (typeof requestAnimationFrame === 'function') requestAnimationFrame(f); else setTimeout(f, 16); });
  const rensa = () => { try { map.off?.('sourcedata', pa); map.off?.('idle', fardig); } catch { /* */ } };
  const fardig = () => { if (klar) return; klar = true; rensa(); opts.klart(); };
  const pa = (e: any) => { if (e && e.isSourceLoaded && grundkartaLaddad(map)) fardig(); };
  map.on?.('sourcedata', pa);
  map.once?.('idle', fardig);
  timer(fardig, opts.maxMs);
  // Initialkameran = översikten → ingenting nytt att hämta: grundkartan är redan målad (load-händelsen väntade på rutorna).
  // Vi kräver INTE att källan rapporterar "laddad": MapLibre hämtar även kringliggande rutor efter load, och de får komma sent.
  if (!opts.andratKamera) nasta(fardig);
  return () => { klar = true; rensa(); };
}
