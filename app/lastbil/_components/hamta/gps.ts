// Förarens egen position (telefonens GPS) — för lastningspunkten, lossningspunkten och som reserv när bilens position saknas.
// Samma regler som förarflödet hade: pengapunkter (Lassa/Lassat av) kräver en NY mätning, aldrig en cachad.

export interface Pos { lat: number; lng: number; accuracy: number; tid: number }

/** En GPS-fix som promise. `farsk` tvingar en ny mätning (maximumAge 0). Avvisar vid nekad behörighet eller timeout. */
export function getGps(farsk = false): Promise<Pos> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      reject(new Error('GPS stöds inte i den här webbläsaren'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, tid: p.timestamp }),
      e => reject(new Error(e.code === 1 ? 'Platsåtkomst nekad — tillåt i webbläsarens inställningar' : e.message)),
      { enableHighAccuracy: true, maximumAge: farsk ? 0 : 60000, timeout: farsk ? 25000 : 15000 },
    );
  });
}

/** Hur gammal en "färsk" fix får vara. iOS-PWA ignorerar ibland maximumAge:0 och lämnar en gammal cachad punkt (gav tillkörning 0 /
 *  fel fakturerbar 2026-07-24), därför verifieras tidsstämpeln och en gammal fix avvisas efter ett nytt försök. */
export const FARSK_MAX_ALDER_MS = 15000;

/** Färsk fix för pengapunkter. Kastar hellre ett ärligt fel än att returnera en position från 40 minuter sedan. */
export async function getFarskGps(): Promise<Pos> {
  let p = await getGps(true);
  if (Date.now() - p.tid > FARSK_MAX_ALDER_MS) {
    p = await getGps(true);
    if (Date.now() - p.tid > FARSK_MAX_ALDER_MS) throw new Error('GPS gav en gammal cachad position — gå ut i det fria och tryck igen');
  }
  return p;
}
