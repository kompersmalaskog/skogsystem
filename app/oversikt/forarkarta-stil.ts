// Förarvyns/översiktens baskarta — egen, versionerad, nedtonad MapLibre-
// vektorstil mot Lantmäteriets öppna "Topografi Visning, vector tiles".
// Mål: en tyst, ljus grund där status-markörer + rutt är det enda med stark
// färg. Platt 2D (ingen tilt) sätts i kart-initen i OversiktKarta.tsx.
//
// Källa serveras via /api/forarkarta — en server-side-proxy som injicerar
// API-nyckeln. Nyckeln finns ALDRIG i klientkoden; stilen pekar bara på vår
// egen route.
//
// === FÖRSTA PASS (scaffolding) ===
// Renderar BARA grund-geografi (mark, vatten, vägar) i dämpade toner. Allt
// brus är gömt genom att helt enkelt UTELÄMNAS: inga vägnamn, ingen POI/
// fornlämning, ingen kraftledning, inga byggnader, inga höjdkurvor, inga
// admingränser. Det ger en stil som laddar utan glyph-/sprite-beroenden.
//
// Tonas mot LM:s LIVE-schema när nyckeln finns (mapslab-exemplet är 2+ år
// gammalt — manér/attribut kan ha ändrats). Då läggs till:
//   • stora ortnamn (source-layer `text`, filtrerat på bebyggelse) för orientering
//   • svag skogston (särskilj skog/öppen mark i `mark` via attribut)
//   • filtrera vägar till ENBART huvudvägar (motorväg/allmän väg)

export const FORARKARTA_ATTRIBUTION = '© Lantmäteriet';

// Ljus, lågmättad palett — håller grunden tyst så status-färgerna poppar.
const C = {
  bg:        '#ECEDE7', // mjuk varmgrå-vit bakgrund
  land:      '#E6E8E0', // svag markyta
  water:     '#C7D4DA', // dämpad blågrå (vatten)
  waterLine: '#AEC0C8', // vattendrag-linje
  road:      '#D7D4CA', // tunna, dämpade vägar
};

/** MapLibre StyleSpecification (löst typad — kartan använder window.maplibregl). */
export function buildForarkartaStyle(): any {
  return {
    version: 8,
    sources: {
      lm: {
        type: 'vector',
        // Proxy injicerar nyckeln server-side. {z}/{x}/{y} fylls av MapLibre.
        tiles: ['/api/forarkarta?kind=tile&z={z}&x={x}&y={y}'],
        minzoom: 0,
        maxzoom: 16,
        // CC-BY kräver synlig attribution; sätts även explicit i kart-initen.
        attribution: FORARKARTA_ATTRIBUTION,
      },
    },
    // Inga glyphs/sprite i första pass — inga text-/ikon-lager ännu.
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': C.bg } },

      // Mark — en enda svag yta. (Skog/öppen mark särskiljs i live-tuning.)
      {
        id: 'mark', type: 'fill', source: 'lm', 'source-layer': 'mark',
        paint: { 'fill-color': C.land, 'fill-opacity': 0.9 },
      },

      // Vatten — dämpad blågrå yta + tunn linje (hydrografi). Orientering.
      {
        id: 'vatten', type: 'fill', source: 'lm', 'source-layer': 'hydrografi',
        paint: { 'fill-color': C.water },
      },
      {
        id: 'vatten-linje', type: 'line', source: 'lm', 'source-layer': 'hydrografi',
        paint: {
          'line-color': C.waterLine,
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.4, 14, 1.2],
        },
      },

      // Vägar — tunna, dämpade. Första pass: alla vägar svaga (tonas till
      // enbart huvudvägar mot live-schemat).
      {
        id: 'vagar', type: 'line', source: 'lm', 'source-layer': 'kommunikation',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': C.road,
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.5, 12, 1.2, 16, 3],
        },
      },
    ],
  };
}
