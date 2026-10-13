// Ritade linjer och ytor (planeringsvyn + körvyn): vad ett TRYCK ger och vad som SPARAS.
//
// Regel (beslutad): ett tryck = EXAKT en punkt, där man tryckte. Ingen mellanpunkt, ingen dubblett, ingen utjämning.
// Utjämning finns bara för hyttspår (lib/sparJamning.ts) — aldrig för ritade markeringar.
//
// Två fel gav tidigare "runda" ytor och 25–33 punkter på fyra tryck (kodbevis i lib/ritaPunkter.test.ts):
//  (a) På en pekskärm kommer varje tryck som touchstart/touchend OCH som den emulerade musen (mousedown/mouseup) efteråt.
//      Ritverktyget lyssnade på båda → varje hörn lades till två gånger.
//  (b) Vid sparning kördes Chaikin-utjämning (corner-cutting, 2 varv) på alla ritade markeringar utom gallringszoner.
//      Ett hörn som trycktes EN gång kapades till en kurva; ett dubblerat hörn överlevde (Chaikin behåller en punkt som står
//      två gånger) men fick sex mellanpunkter på den raka linjen — därav 33 punkter på 4 hörn.

export type LngLat = [number, number];

/** Efter en touch-händelse ignoreras den emulerade musen så här länge (webbläsarna skickar den inom ~300 ms; marginal för seg enhet). */
export const EMULERAD_MUS_MS = 1000;
/** Två tryck inom så här många skärm-px OCH så här kort tid är samma tryck (dubbelhändelse eller dubbelklick), aldrig två hörn. */
export const DUBBELTRYCK_PX = 4;
export const DUBBELTRYCK_MS = 800;

/** Musen som webbläsaren emulerar efter ett touch-tryck: kommer kort efter touchstart/touchend och är samma tryck igen. */
export function arEmuleradMus(nu: number, senasteTouchMs: number): boolean {
  return senasteTouchMs > 0 && nu - senasteTouchMs < EMULERAD_MUS_MS;
}

export type TryckPunkt = { x: number; y: number; tid: number };

/** Samma tryck igen? (skärmpixlar + tid). Kvarstående skydd om en dubbelhändelse ändå skulle slinka igenom. */
export function arDubbeltryck(foregaende: TryckPunkt | null, nytt: TryckPunkt): boolean {
  if (!foregaende) return false;
  if (nytt.tid - foregaende.tid > DUBBELTRYCK_MS) return false;
  return Math.hypot(nytt.x - foregaende.x, nytt.y - foregaende.y) <= DUBBELTRYCK_PX;
}

/** Tar bort punkter som står på EXAKT samma plats som föregående. Rör aldrig något annat (ingen toleranströskel). */
export function utanDubbletter(coords: LngLat[]): LngLat[] {
  const ut: LngLat[] = [];
  for (const c of coords) {
    const sist = ut[ut.length - 1];
    if (sist && sist[0] === c[0] && sist[1] === c[1]) continue;
    ut.push(c);
  }
  return ut;
}

/**
 * Det som sparas när ritningen är klar. Punkterna är exakt de man tryckte (eller frihandsdragets förenklade punkter).
 * stang=true (ytor): första punkten läggs sist så ringen är sluten → n tryck sparas som n + 1 punkter.
 * stang=false (linjer): n tryck sparas som n punkter.
 */
export function slutaRitning(coords: LngLat[], stang: boolean): LngLat[] {
  const rena = utanDubbletter(coords);
  if (!stang || rena.length === 0) return rena;
  const f = rena[0];
  const s = rena[rena.length - 1];
  if (rena.length > 1 && f[0] === s[0] && f[1] === s[1]) return rena;   // redan sluten (frihandsdrag som snäppte till startpunkten)
  return [...rena, f];
}
