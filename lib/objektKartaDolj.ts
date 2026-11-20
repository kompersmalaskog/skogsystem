// Objektlistan öppen: det valda objektets markeringar (symboler, linjer, zoner, pilar, etiketter, traktgräns, högar, spår …) göms så att BARA prickarna
// syns — annars dominerar t.ex. avläggets gula fyrkant kartan när den zoomat ut. De kommer tillbaka när listan stängs eller ett objekt väljs.
//
// ÖVERSIKTEN ÄR SAMMA KARTA VARJE GÅNG (Martin 2026-11-17: "översikten går på lagerna … samma hela tiden"). Förut låg underlagen från Lager-menyn
// (markfuktighet, skuggning, WMS-lagren) och användarens egen bakgrund kvar: ett påslaget underlag blev ett blått brus över hela länet och dränkte
// prickarna. Nu syns BARA: bakgrunden `bg`, Lantmäteriets karta (`OVERSIKT_KARTA`, tänds och får standardstyrkan — ljus, med ortnamn), prickarna
// (objlista-*) och förarens egen position (maskin-*, gps-*). Allt annat som är synligt göms — också flygfoto, topokarta, OSM, Ritad, skuggning och
// varje WMS-underlag; det som redan var dolt rörs inte. Förra synligheten och kartans förra styrka sparas och återställs exakt: användarens lager,
// kartval och reglage ändras aldrig. `dolj()` kan anropas om och om igen (vid 'styledata': lager som skapas eller tänds medan listan är öppen göms
// också) — den skriver aldrig över ett sparat värde. Samma mönster som körvyns lager-whitelist (page.tsx).
import { kartBasPaint } from './kartBas';

export const OVERSIKT_KARTA = 'lm-layer';
/** Översiktskartans utseende: Karta i standardstyrka, oavsett användarens reglage. */
export const OVERSIKT_PAINT: Readonly<Record<string, number>> = kartBasPaint('lantmateriet');

export const BAS_LAGER: readonly string[] = ['bg', OVERSIKT_KARTA];
export const BEHALL_PREFIX: readonly string[] = ['objlista-', 'maskin-', 'gps-'];

export const arBehalld = (id: string): boolean => BAS_LAGER.includes(id) || BEHALL_PREFIX.some((p) => id.startsWith(p));

export interface LagerDoljare { dolj: () => number; aterstall: () => number }

export function skapaLagerDoljare(map: any): LagerDoljare {
  const sparad = new Map<string, string>();
  const sparadPaint = new Map<string, unknown>();
  const dolj = () => {
    let antal = 0;
    let lager: any[] = [];
    try { lager = map.getStyle()?.layers ?? []; } catch { return 0; }
    if (map.getLayer?.(OVERSIKT_KARTA)) {
      try {
        const vis = map.getLayoutProperty(OVERSIKT_KARTA, 'visibility') ?? 'visible';
        if (vis !== 'visible') { if (!sparad.has(OVERSIKT_KARTA)) sparad.set(OVERSIKT_KARTA, vis); map.setLayoutProperty(OVERSIKT_KARTA, 'visibility', 'visible'); }
        for (const [k, v] of Object.entries(OVERSIKT_PAINT)) {
          const nu = map.getPaintProperty?.(OVERSIKT_KARTA, k);
          if (nu === v) continue;
          if (!sparadPaint.has(k)) sparadPaint.set(k, nu);
          map.setPaintProperty?.(OVERSIKT_KARTA, k, v);
        }
      } catch { /* lagret försvann */ }
    }
    for (const l of lager) {
      const id: string = l.id;
      if (arBehalld(id)) continue;
      let vis: string | undefined;
      try { vis = map.getLayoutProperty(id, 'visibility'); } catch { continue; }
      if (vis === 'none') continue;                                  // redan dolt (av oss eller av vyn): rör inte
      if (!sparad.has(id)) sparad.set(id, vis ?? 'visible');
      try { map.setLayoutProperty(id, 'visibility', 'none'); antal++; } catch { /* lagret försvann */ }
    }
    return antal;
  };
  const aterstall = () => {
    let antal = 0;
    sparad.forEach((vis, id) => {
      try { if (map.getLayer(id)) { map.setLayoutProperty(id, 'visibility', vis); antal++; } } catch { /* kartan är borta */ }
    });
    sparad.clear();
    sparadPaint.forEach((v, k) => { try { if (map.getLayer(OVERSIKT_KARTA)) map.setPaintProperty?.(OVERSIKT_KARTA, k, v); } catch { /* kartan är borta */ } });
    sparadPaint.clear();
    return antal;
  };
  return { dolj, aterstall };
}
