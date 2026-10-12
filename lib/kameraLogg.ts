// KAMERALOGG (testfliken /maskin?som=): varje kamerarörelse med tid, argument, kartans läge FÖRE och startsekvensens fas.
// Syftet är kodbevis — "vad tog över kameran efter flyTo?" — så Martin (eller jag) kan läsa svaret i konsolen/`window.__KAMERA`
// i stället för att gissa. Bara anrop på toppnivå loggas (flyTo som internt anropar easeTo blir EN rad), och varje
// `moveend` loggas med om det var en riktig gest (`gest: true`) eller kod.
// Installeras bara i testfliken; ren (tar kartan som parameter) så den kan enhetstestas med en fejk-karta.

export const KAMERA_METODER = [
  'jumpTo', 'easeTo', 'flyTo', 'fitBounds', 'setCenter', 'setZoom', 'panTo', 'zoomTo', 'zoomIn', 'zoomOut',
  'setBearing', 'setPitch', 'rotateTo', 'resetNorth', 'snapToNorth', 'fitScreenCoordinates', 'panBy',
] as const;

export interface KameraLage { lng: number; lat: number; zoom: number; pitch: number; bearing: number; padTop: number }
export interface KameraPost {
  t: number;                     // ms sedan navigeringen (performance.now)
  m?: string;                    // kamerametod
  a?: unknown;                   // argument (kompakta, avrundade)
  fore?: KameraLage;             // kartans läge FÖRE anropet
  fas?: string | null;           // startsekvensens fas just då
  st?: string[];                 // översta anropsramarna (läsbara i dev, chunk-rader i prod)
  h?: 'moveend';                 // händelse i stället för anrop
  efter?: KameraLage;            // kartans läge vid moveend
  gest?: boolean;                // moveend orsakad av en riktig användargest
}

const rund = (n: number, d = 4) => +n.toFixed(d);

function lage(map: any): KameraLage {
  const c = map.getCenter();
  return { lng: rund(c.lng), lat: rund(c.lat), zoom: rund(map.getZoom(), 2), pitch: rund(map.getPitch(), 1), bearing: rund(map.getBearing(), 1), padTop: rund(map.getPadding?.().top ?? 0, 0) };
}

/** Kompakta, JSON-säkra argument: tal avrundas, funktioner/element utelämnas. */
export function kompakta(v: unknown, djup = 0): unknown {
  if (typeof v === 'number') return rund(v);
  if (v == null || typeof v !== 'object') return typeof v === 'function' ? '[fn]' : v;
  if (djup > 3) return '[…]';
  if (Array.isArray(v)) return v.map((x) => kompakta(x, djup + 1));
  const ut: Record<string, unknown> = {};
  for (const k of Object.keys(v as Record<string, unknown>)) ut[k] = kompakta((v as Record<string, unknown>)[k], djup + 1);
  return ut;
}

export function installeraKameraLogg(
  map: any,
  opts: { fas?: () => string | null; logg?: KameraPost[]; konsol?: boolean; nu?: () => number } = {},
): () => void {
  const logg = opts.logg ?? (((typeof window !== 'undefined' ? (window as any) : {}) as any).__KAMERA ??= []) as KameraPost[];
  if (typeof window !== 'undefined' && !opts.logg) (window as any).__KAMERA = logg;
  const nu = opts.nu ?? (() => Math.round(typeof performance !== 'undefined' ? performance.now() : Date.now()));
  const skrivKonsol = opts.konsol !== false;
  const original: Record<string, any> = {};
  let djup = 0;
  const push = (p: KameraPost) => { logg.push(p); if (logg.length > 400) logg.shift(); };

  for (const namn of KAMERA_METODER) {
    const f = map[namn];
    if (typeof f !== 'function') continue;
    original[namn] = f;
    map[namn] = function (this: any, ...args: unknown[]) {
      if (djup === 0) {
        const st = (new Error().stack || '').split('\n').slice(2, 5).map((s) => s.trim().replace(/^at /, '').slice(0, 120));
        const post: KameraPost = { t: nu(), m: namn, a: kompakta(args), fore: lage(map), fas: opts.fas ? opts.fas() : null, st };
        push(post);
        if (skrivKonsol) { try { console.info('[kamera]', JSON.stringify({ t: post.t, m: post.m, a: post.a, fas: post.fas })); } catch { /* */ } }
      }
      djup++;
      try { return f.apply(map, args); } finally { djup--; }
    };
  }
  const onMoveEnd = (e: any) => push({ t: nu(), h: 'moveend', efter: lage(map), gest: !!(e && e.originalEvent), fas: opts.fas ? opts.fas() : null });
  map.on?.('moveend', onMoveEnd);

  return () => {
    for (const namn of Object.keys(original)) map[namn] = original[namn];
    map.off?.('moveend', onMoveEnd);
  };
}
