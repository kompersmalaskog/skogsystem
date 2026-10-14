// Objektlistan öppen: det valda objektets markeringar (symboler, linjer, zoner, pilar, etiketter, traktgräns, högar, spår …) göms så att BARA prickarna
// syns — annars dominerar t.ex. avläggets gula fyrkant kartan när den zoomat ut. De kommer tillbaka när listan stängs eller ett objekt väljs.
//
// Vad som INTE göms: baskartan (bg, flygfoto, Lantmäteriet, topo, skuggning, WMS-underlag), prickarna (objlista-*) och förarens egen position
// (maskin-*, gps-*). Allt annat som är synligt just nu göms; det som redan var dolt rörs inte. Förra synligheten sparas per lager och återställs
// exakt. `dolj()` kan anropas om och om igen (vid 'styledata': lager som skapas eller tänds medan listan är öppen göms också) — den skriver aldrig
// över en sparad synlighet. Samma mönster som körvyns lager-whitelist (page.tsx), men utan att ändra planeringsvyns egna toggle-val.

export const BAS_LAGER: readonly string[] = [
  'bg', 'osm-layer', 'satellite-layer', 'lm-layer', 'terrain-layer', 'lm-skuggning-layer', 'sks-markfuktighet-layer', 'bg-korvy', 'hillshade-korvy',
];
export const BEHALL_PREFIX: readonly string[] = ['wms-layer-', 'objlista-', 'maskin-', 'gps-'];

export const arBehalld = (id: string): boolean => BAS_LAGER.includes(id) || BEHALL_PREFIX.some((p) => id.startsWith(p));

export interface LagerDoljare { dolj: () => number; aterstall: () => number }

export function skapaLagerDoljare(map: any): LagerDoljare {
  const sparad = new Map<string, string>();
  const dolj = () => {
    let antal = 0;
    let lager: any[] = [];
    try { lager = map.getStyle()?.layers ?? []; } catch { return 0; }
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
    return antal;
  };
  return { dolj, aterstall };
}
