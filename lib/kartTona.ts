// Tona in kartlager: sätt opaciteten till 0 utan övergång, och låt den sedan glida upp till sitt vanliga värde.
// Används för objektets lager (traktgränsen) som laddas EFTER att kartan syns — de ska tona in, inte poppa upp.
// Tar kartan som parameter (MapLibre-lik) och en schemaläggare, så det kan enhetstestas utan webbläsare.

export interface TonaLager { id: string; prop: 'line-opacity' | 'fill-opacity' | 'circle-opacity' | 'text-opacity'; till: number }

export function tonaInLager(
  map: any,
  lager: TonaLager[],
  ms = 700,
  nasta: (f: () => void) => void = (f) => { if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => requestAnimationFrame(f)); else setTimeout(f, 32); },
): number {
  let n = 0;
  const satta: TonaLager[] = [];
  for (const l of lager) {
    try {
      if (!map.getLayer(l.id)) continue;
      map.setPaintProperty(l.id, l.prop + '-transition', { duration: 0, delay: 0 });
      map.setPaintProperty(l.id, l.prop, 0);
      satta.push(l); n++;
    } catch { /* ett lager som inte går att tona hoppas över — det syns bara direkt */ }
  }
  if (satta.length === 0) return 0;
  // Två bildrutor senare: slå på övergången och släpp upp till slutvärdet. (En ruta räcker inte — MapLibre
  // måste hinna rita 0:an, annars hoppar övergången över startvärdet.)
  nasta(() => {
    for (const l of satta) {
      try {
        if (!map.getLayer(l.id)) continue;
        map.setPaintProperty(l.id, l.prop + '-transition', { duration: ms, delay: 0 });
        map.setPaintProperty(l.id, l.prop, l.till);
      } catch { /* */ }
    }
  });
  return n;
}

/** Traktgränsens lager (snitsel + tappyta) — de som syns direkt när objektet öppnas. Slutvärdena = lagrens egna. */
export const TRAKTGRANS_LAGER: TonaLager[] = [
  { id: 'trakt-gr-fill', prop: 'fill-opacity', till: 0.05 },
  { id: 'trakt-gr-casing', prop: 'line-opacity', till: 1 },
  { id: 'trakt-gr-line', prop: 'line-opacity', till: 1 },
  { id: 'trakt-gr-stripe', prop: 'line-opacity', till: 1 },
];
