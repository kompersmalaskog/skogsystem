/**
 * Hur långt maskinerna KÖRDE — talet, inte linjen.
 *
 * RÅDATA, aldrig ritningen. `korsparLinjer` jämnar ut spåret för att det ska
 * se rent ut på kartan, och den utjämningen kortar linjen till 69–85 % av det
 * maskinen verkligen körde (uppmätt, se `lib/korspar`). Ett tal räknat på
 * ritningen hade alltså sagt att skotaren kört en femtedel kortare än hon
 * gjorde — och det är ett tal som går till kund. Här mäts punkterna som de kom
 * ur hytten.
 *
 * Steg längre än `KORSPAR.BRYT_M` räknas inte: där har appen varit av eller
 * maskinen stått på trailern, och sträckan mellan de två punkterna är inte
 * körd. Samma gräns bryter linjen på kartan, så tal och bild håller ihop.
 *
 * KLIPPNINGEN görs INNAN: anroparen skickar spåret som redan klippts mot
 * trakten + marginalen (`klippSparMotTrakt`), så resan hem aldrig räknas med.
 */
import { metersBetween, type LngLat } from '@/lib/geoMat';
import { KORSPAR } from '@/lib/korspar';
import { delaUtanfor, type Koord, type LinjeFeature } from '@/lib/korsparKlart';

export type LatLng = { lat: number; lng: number };

export type KordStracka = {
  /** Skotarens körning, meter. */
  skotareM: number;
  /** Skördarens körning, meter. null när skördaren inte har något spår här. */
  skordareM: number | null;
  /** Av skotarens körning: den som INTE låg i skördarens stråk. null utan skördarspår. */
  utanforM: number | null;
};

/** Längd längs en linje, utan stegen som är längre än brytgränsen. */
function langd(linje: readonly LngLat[]): number {
  let m = 0;
  for (let i = 1; i < linje.length; i++) {
    const steg = metersBetween(linje[i - 1], linje[i]);
    if (steg <= KORSPAR.BRYT_M) m += steg;
  }
  return m;
}

const summa = (linjer: readonly (readonly LngLat[])[]): number =>
  linjer.reduce((s, l) => s + langd(l), 0);

/**
 * @param skotare  Skotarens körspår, RÅA punkter, klippta mot trakten.
 * @param skordare Skördarens detsamma. Tom lista = inget spår.
 */
export function kordStracka(
  skotare: readonly (readonly LatLng[])[],
  skordare: readonly (readonly LatLng[])[],
): KordStracka | null {
  const sk = skotare.filter((l) => l.length > 1).map((l) => l.map((p) => [p.lng, p.lat] as LngLat));
  const sd = skordare.filter((l) => l.length > 1).map((l) => l.map((p) => [p.lng, p.lat] as LngLat));
  if (sk.length === 0) return null;

  const skotareM = summa(sk);
  if (sd.length === 0) return { skotareM, skordareM: null, utanforM: null };

  // Utanför stråket: SAMMA funktion som kartan i hytten delar med (8 m), så
  // talet och bilden aldrig kan säga olika. Att den körs på rådata och inte på
  // de ritade linjerna gör ingen skillnad för REGELN — bara för längden.
  const feature = (c: Koord[]): LinjeFeature =>
    ({ type: 'Feature', geometry: { type: 'LineString', coordinates: c }, properties: {} });
  const ute = delaUtanfor(sk.map((l) => feature(l as Koord[])), sd as Koord[][]);

  return {
    skotareM,
    skordareM: summa(sd),
    utanforM: summa(ute.map((f) => f.geometry.coordinates as LngLat[])),
  };
}
