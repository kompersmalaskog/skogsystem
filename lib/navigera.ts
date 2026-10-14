// Navigering till ett objekt — EN väg för objektlistans km-knapp och objektinfons "Vägbeskrivning" (samma som dagens "Navigera").
// Google Maps vägbeskrivning mot objektets koordinat, i en ny flik/app.

export function navigeringsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

export function harKoordinat(o: { lat?: number | null; lng?: number | null } | null | undefined): o is { lat: number; lng: number } {
  return !!o && typeof o.lat === 'number' && typeof o.lng === 'number' && Number.isFinite(o.lat) && Number.isFinite(o.lng) && !(o.lat === 0 && o.lng === 0);
}

/** Startar navigeringen. false = objektet saknar koordinat (inget öppnades). */
export function startaNavigering(o: { lat?: number | null; lng?: number | null } | null | undefined, oppna: (url: string) => void = (u) => { window.open(u, '_blank'); }): boolean {
  if (!harKoordinat(o)) return false;
  oppna(navigeringsUrl(o.lat, o.lng));
  return true;
}
