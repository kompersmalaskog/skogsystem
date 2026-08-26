// Mätvyns punkter — var Martin ska ställa sig.
//
// LOTTAT, INTE RUTNÄT. Ett rutnät riskerar att hamna i takt med stickvägarna:
// ligger punkterna med jämnt avstånd kan de systematiskt falla i vägarna eller
// systematiskt mellan dem, och då mäter man vägnätet i stället för beståndet.
// Slumpen har ingen sådan periodicitet.
//
// LOTTAS EN GÅNG. Det finns med avsikt ingen väg att lotta om. Kan man trycka
// tills lägena ser bra ut är slumpen borta och man mäter sin egen känsla.
// Samma regel som egenkontrollens provytor, och av samma skäl.
//
// ÅTERANVÄNDER lottaProvytor, med en skillnad som är värd att förstå:
// egenkontrollen KRÄVER att punkten ligger inom 10 m från en avverkad stam,
// för den ska bedöma där maskinen faktiskt gick. Mätvyn mäter det KVARVARANDE
// beståndet över hela trakten, och ett sådant krav skulle dra punkterna mot
// stickvägarna — precis det rutnätet skulle riskera. Därför skickas en tom
// stamlista, vilket stänger av stamkontrollen.

import { kartOrigoFranBounds } from '../kartkoordinater';
import { avstandM, lottaProvytor, riktning, type LatLng, type LottadYta } from '../provytor';
import { supabase } from '../supabase';

/** Tio punkter per trakt. lottaProvytor håller 30 m mellan punkter och 20 m
 *  från traktgränsen — strängare än de 20 m mätmetoden kräver. */
export const ANTAL_PUNKTER = 10;

export type Matpunkt = LottadYta;

export type PunktResultat =
  | { status: 'ok'; punkter: Matpunkt[] }
  | { status: 'ingen_grans' }
  | { status: 'inget_origo' }
  | { status: 'for_liten' }
  | { status: 'fel'; meddelande: string };

/**
 * Lottar punkterna för en trakt.
 *
 * Varje misslyckande har sin EGEN status. En tom lista kan betyda tre helt
 * olika saker — ingen traktgräns ritad, ingen kartbild att räkna origo ur,
 * eller ett skifte för litet för att rymma tio punkter — och vyn måste kunna
 * säga vilket. "Kunde inte lotta" utan orsak lämnar Martin utan nästa steg.
 */
export async function lottaMatpunkter(objektId: string): Promise<PunktResultat> {
  const { data: objekt, error: objFel } = await supabase
    .from('objekt')
    .select('id, areal, kartbild_bounds, vo_nummer')
    .eq('id', objektId)
    .maybeSingle();
  if (objFel) return { status: 'fel', meddelande: objFel.message };
  if (!objekt) return { status: 'fel', meddelande: 'Objektet hittades inte.' };

  const origo = kartOrigoFranBounds(objekt as Parameters<typeof kartOrigoFranBounds>[0]);
  if (!origo) return { status: 'inget_origo' };

  // Traktgränsen, inte kartbild_bounds. Bounds är bildens hörn; gränsen är
  // marken. Samma distinktion som egenkontrollen gör.
  const { data: markeringar, error: markFel } = await supabase
    .from('planering_markeringar')
    .select('data')
    .eq('objekt_id', objektId)
    .order('marker_id', { ascending: true });
  if (markFel) return { status: 'fel', meddelande: markFel.message };

  const paths = ((markeringar ?? []) as { data: Record<string, unknown> | null }[])
    .filter((m) => m.data && (m.data as Record<string, unknown>).lineType === 'boundary')
    .map((m) => (m.data as { path?: { x: number; y: number }[] }).path)
    .filter((p): p is { x: number; y: number }[] => Array.isArray(p) && p.length >= 3);

  if (paths.length === 0) return { status: 'ingen_grans' };

  // Tom stamlista: mätvyn ska inte dra punkterna mot stickvägarna. Se filhuvudet.
  const punkter = lottaProvytor(paths, origo, ANTAL_PUNKTER, []);
  if (punkter.length === 0) return { status: 'for_liten' };
  return { status: 'ok', punkter };
}

/** Förklaringen till varför inga punkter kunde läggas ut. Vyn ska aldrig visa
 *  en tom lista utan att säga vad som saknas och vem som fixar det. */
export function forklaring(status: PunktResultat['status']): string {
  switch (status) {
    case 'ingen_grans':
      return 'Trakten saknar inritad gräns. Rita traktgränsen i planeringsvyn först — utan den vet mätvyn inte var beståndet slutar.';
    case 'inget_origo':
      return 'Trakten saknar kartbild. Punkterna räknas ut ur kartans hörn, så utan kartbild går de inte att placera.';
    case 'for_liten':
      return 'Inget skifte är stort nog för mätpunkter. Punkterna hålls 20 m från gränsen och 30 m från varandra, och det får inte plats här.';
    default:
      return 'Punkterna kunde inte lottas.';
  }
}

export type PunktMedAvstand = Matpunkt & {
  avstand_m: number | null;
  kompass: string | null;
};

/**
 * Punkterna med avstånd och väderstreck från nuvarande position.
 *
 * Väderstreck i ORD, inte gradtal. GPS under krontak är 5-15 m, och en
 * bäring med en decimals precision från ett läge som är plus minus tio meter
 * ger ett falskt intryck av exakthet. "Nordost, 40 m" är lika användbart och
 * ljuger inte. Samma linje som gå-vyn i egenkontrollen.
 */
export function medAvstand(punkter: Matpunkt[], min: LatLng | null): PunktMedAvstand[] {
  return punkter.map((p) => ({
    ...p,
    avstand_m: min ? Math.round(avstandM(min, { lat: p.lat, lng: p.lng })) : null,
    kompass: min ? riktning(min, { lat: p.lat, lng: p.lng }) : null,
  }));
}

/** Under detta är sista biten ögat, inte telefonen. Samma tröskel som gå-vyn. */
export const FRAMME_M = 15;
