// Förarvyns/översiktens baskarta — nedtonad Lantmäteriet-RASTER (nyckellös).
//
// Källa: Lantmäteriets publika minkarta-WMS, lagret `topowebbkartan_nedtonad`
// — exakt samma nyckellösa tjänstefamilj som planeringsvyns LM-overlays redan
// använder (hojdmodell/ortofoto). Ingen API-nyckel. Tiles hämtas via vår egen
// /api/forarkarta-proxy (caching + host-validering).
//
// Kartan är redan grå/dämpad (designad som bakgrund); en lätt raster-avmättnad
// ovanpå gör grunden riktigt tyst så att status-markörer + rutt är det enda
// med stark färg. Platt 2D (ingen tilt) sätts i kart-initen i OversiktKarta.tsx.
//
// (Framtida uppgradering: byt till Lantmäteriets keyade VEKTOR-produkt
// "Topografi Visning, vector tiles" för skarp app-känsla + sanktionerade villkor.)

export const FORARKARTA_ATTRIBUTION = '© Lantmäteriet';

/** MapLibre StyleSpecification (löst typad — kartan använder window.maplibregl). */
export function buildForarkartaStyle(): any {
  return {
    version: 8,
    sources: {
      lm: {
        type: 'raster',
        // MapLibre fyller {bbox-epsg-3857} per ruta; proxyn bygger WMS-GetMap.
        tiles: ['/api/forarkarta?bbox={bbox-epsg-3857}&w=256&h=256'],
        tileSize: 256,
        // CC-BY kräver synlig attribution; sätts även explicit i kart-initen.
        attribution: FORARKARTA_ATTRIBUTION,
      },
    },
    layers: [
      // Ljus grund bakom rastret (syns innan tiles laddat / vid glapp).
      { id: 'bg', type: 'background', paint: { 'background-color': '#ECEDE7' } },
      {
        id: 'lm-bas', type: 'raster', source: 'lm',
        paint: {
          // Lätt avmättnad ovanpå den redan nedtonade kartan → riktigt lugn
          // grund. Behåller svaga färgledtrådar (vatten/skog) för orientering.
          'raster-saturation': -0.35,
          'raster-contrast': -0.05,
        },
      },
    ],
  };
}
