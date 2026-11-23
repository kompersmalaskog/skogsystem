// KÖRSPÅR PÅ KARTAN — EN uppsättning lager för de ställen som inte är planeringsvyns egen karta: objektöversikten och skotarlänken (Martin 2026-11-23).
// Samma utseende som planeringen, maskinläget och skotarläget (lib/sparStil kartSpar): skördaren ett lila band i meter, en vit mittlinje där skotaren kört
// i skördarens band, och skotarens eget ljusa band där skördaren INTE kört. Linjerna är lib/korspar: en rensad linje per dag. Planeringsvyn bygger
// sina lager inline (app/planering/page.tsx) med samma kartSpar/MITTLINJE_* — ändras utseendet gör det i lib/sparStil, aldrig här.
import { kartSpar, MITTLINJE_FARG, MITTLINJE_BREDD, MITTLINJE_OPACITET, MITTLINJE_FILTER } from './sparStil';
import { delaKlart, delaUtanfor, type LinjeFeature, type Koord } from './korsparKlart';

export type KorsparRoll = 'skordare' | 'skotare';

const feat = (ls: Koord[][], props: Record<string, unknown> = {}): LinjeFeature[] =>
  ls.filter((c) => c.length >= 2).map((c) => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: c }, properties: { ...props } }));

/**
 * Features som kartan ritar. Skördarens linjer delas i bitar med `klar: true` där skotaren varit (vit mittlinje); skotarens linjer är bara de bitar som
 * ligger utanför skördarens spår (`ute: true`, eget ljust band). Saknas skotarens spår helt är skördarens band bara lila; saknas skördarens spår helt är
 * hela skotarens spår "ute".
 */
export function korsparKallor(skordare: Koord[][], skotare: Koord[][]): Record<KorsparRoll, LinjeFeature[]> {
  return {
    skordare: delaKlart(feat(skordare, { band: 'skordare' }), skotare),
    skotare: delaUtanfor(feat(skotare), skordare),
  };
}

/** Lagrens id för en källa: kant (mjuk ytterkant), band och — bara skördaren — den vita mittlinjen. */
export const korsparLagerId = (prefix: string, roll: KorsparRoll) => ({
  kant: `${prefix}-${roll}-kant`, band: `${prefix}-${roll}`, mitt: `${prefix}-${roll}-mitt`,
});

/**
 * Lagerspecar för en roll, i ritordning (kant, band, mitt). `kalla` är källans id. Skotarens källa har ingen mittlinje (den ritas på skördarens källa).
 * `synlig: false` = lagren läggs till avstängda (objektöversiktens lagerval slår på dem).
 */
export function korsparLager(prefix: string, roll: KorsparRoll, kalla: string, synlig = true): any[] {
  const s = kartSpar('plan', false);
  const id = korsparLagerId(prefix, roll);
  const layout = { 'line-cap': 'round', 'line-join': 'round', visibility: synlig ? 'visible' : 'none' };
  const lager: any[] = [
    { id: id.kant, type: 'line', source: kalla, layout, paint: { 'line-color': s.kantFarg, 'line-opacity': s.kantOpacitet, 'line-width': s.kantBredd, 'line-blur': s.kantSudd } },
    { id: id.band, type: 'line', source: kalla, layout, paint: { 'line-color': s.farg, 'line-opacity': s.opacitet, 'line-width': s.bredd } },
  ];
  if (roll === 'skordare') {
    lager.push({ id: id.mitt, type: 'line', source: kalla, filter: MITTLINJE_FILTER, layout, paint: { 'line-color': MITTLINJE_FARG, 'line-opacity': MITTLINJE_OPACITET, 'line-width': MITTLINJE_BREDD } });
  }
  return lager;
}
