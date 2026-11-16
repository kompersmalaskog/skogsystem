// Navigering till ett objekt — EN väg för objektlistans km-knapp och objektinfons "Vägbeskrivning" (samma som dagens "Navigera").
// Google Maps vägbeskrivning mot objektets koordinat, i en ny flik/app.

export function navigeringsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

export function harKoordinat(o: { lat?: number | null; lng?: number | null } | null | undefined): o is { lat: number; lng: number } {
  return !!o && typeof o.lat === 'number' && typeof o.lng === 'number' && Number.isFinite(o.lat) && Number.isFinite(o.lng) && !(o.lat === 0 && o.lng === 0);
}

export type NavObjekt = { lat?: number | null; lng?: number | null; larmkoordinat_lat?: number | null; larmkoordinat_lng?: number | null };

/** VART man kör: traktens larmkoordinat (infarten, där räddningen och bilen kommer in) när den finns, annars objektets punkt.
 *  EN regel för bilknappen i Planering, "Kör dit" i Översikten och allt annat som navigerar till ett objekt — så de aldrig
 *  skickar till olika ställen (Martin 2026-11-05). En punkt utan larmkoordinat (egenkontrollens stickprov) går dit den pekar. */
export function navigeringsMal(o: NavObjekt | null | undefined): { lat: number; lng: number } | null {
  if (!o) return null;
  const larm = { lat: o.larmkoordinat_lat, lng: o.larmkoordinat_lng };
  if (harKoordinat(larm)) return larm;
  return harKoordinat(o) ? { lat: o.lat, lng: o.lng } : null;
}

/** Startar navigeringen. false = objektet saknar koordinat (inget öppnades). */
export function startaNavigering(o: NavObjekt | null | undefined, oppna: (url: string) => void = (u) => { window.open(u, '_blank'); }): boolean {
  const mal = navigeringsMal(o);
  if (!mal) return false;
  oppna(navigeringsUrl(mal.lat, mal.lng));
  return true;
}
