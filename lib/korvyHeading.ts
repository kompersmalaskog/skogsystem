// Effektiv heading (bearing) för körvyns kartrotation OCH riktningskonen på pricken.
//
// Regel (maskindator-fixen): enhetens kompass (deviceorientation) finns inte på PC.
// När GPS-källan är serial ELLER kompassen inte levererar → använd GPS-KURSEN
// (gpsKalla.kurs, ur NMEA VTG/RMC). Annars (telefon med aktiv kompass) → kompassen.
// Faller till 0 (norr upp) när ingen källa finns ännu.
//
// deviceHeading lämnas ORÖRD (ej normaliserad) i kompass-grenen — den är en ackumulerad
// "smooth heading" (kortaste-vägen) och normalisering skulle rycka i rotationen.
// gpsKurs förväntas redan normaliserad (0–360) av den som matar den.

export function valjKorvyHeading(opts: {
  serialAktiv: boolean;
  kompassAktiv: boolean;
  gpsKurs: number | null;
  deviceHeading: number;
}): number {
  const { serialAktiv, kompassAktiv, gpsKurs, deviceHeading } = opts;
  if (serialAktiv || !kompassAktiv) {
    return gpsKurs != null ? gpsKurs : (deviceHeading || 0);
  }
  return deviceHeading || 0;
}
