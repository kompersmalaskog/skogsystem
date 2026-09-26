// Automatisk app-uppdatering (#PR). Förare trycker inte på "Ladda om"-rutan (Stefans iPad körde samma
// kod i en vecka). När en ny version finns ska appen ladda om SIG SJÄLV vid ett ofarligt tillfälle:
//  - körvyn öppen men inga nya GPS-punkter på 10 min, ELLER
//  - vid lokalt dagsbyte (appen öppen över midnatt), ELLER
//  - planeringsvyn öppen utan interaktion på 5 min.
// Före omladdning: hyttspår-bufferten flushas + ackumuleringen stoppas → ingen punkt i flykt tappas.
// Rutan behålls för den som vill uppdatera direkt (components/VersionChecker delar dessa hjälpare).

export const BUILD_SHA = process.env.NEXT_PUBLIC_BUILD_SHA || 'dev';
export const KORVY_GPS_IDLE_MS = 10 * 60 * 1000;   // körvy: inga nya GPS-punkter på 10 min = ofarligt
export const PLAN_IDLE_MS = 5 * 60 * 1000;         // planeringsvy: ingen interaktion på 5 min = ofarligt

// ── Version: hämta serverns SHA, jämför, ladda om med cache-bust (identiskt med VersionChecker). ──
export async function hamtaServerVersion(): Promise<string | null> {
  try {
    const r = await fetch('/api/version', { cache: 'no-store' });   // no-store = förbi webview-cachen
    if (!r.ok) return null;
    const j = await r.json();
    return typeof j?.version === 'string' && j.version ? j.version : null;
  } catch {
    return null;   // offline → gissa aldrig att versionen är gammal
  }
}

export function arNyVersion(serverSha: string | null): boolean {
  return !!serverSha && serverSha !== BUILD_SHA && BUILD_SHA !== 'dev' && serverSha !== 'dev';
}

/** Rensa cache + byt URL (?v=) så webview:en TVINGAS hämta nytt dokument. location.reload() har buggat
 *  i installerade iOS-appar (serverade samma cachade dokument → loop). Ny URL kan den inte cache-matcha. */
export async function laddaOmMedCacheBust(serverSha: string | null): Promise<void> {
  try {
    if (typeof caches !== 'undefined') {
      const ks = await caches.keys();
      await Promise.all(ks.map((k) => caches.delete(k)));
    }
  } catch { /* ignorera */ }
  try {
    const u = new URL(window.location.href);
    u.searchParams.set('v', (serverSha || '').slice(0, 12));
    window.location.replace(u.toString());
  } catch {
    window.location.reload();
  }
}

// ── Beslut: ska appen auto-uppdatera NU? Ren funktion → testbar. Returnerar anledningen eller null. ──
export interface AutoUppdateringsLage {
  nyVersion: boolean;
  korvyActive: boolean;
  nu: number;
  sistaGpsTs: number | null;     // körvy: senaste ACCEPTERADE GPS-punktens tid (null = inga punkter än)
  sistaInteraktionTs: number;    // planeringsvy: senaste användarinteraktion
  sessionStartDatum: string;     // lokalt datum (Europe/Stockholm) vid sid-laddning
  nuvarandeDatum: string;        // dagens lokala datum
}

export type AutoAnledning = 'dagsbyte' | 'korvy-gps-idle' | 'plan-idle';

export function skaAutoUppdatera(l: AutoUppdateringsLage): AutoAnledning | null {
  if (!l.nyVersion) return null;
  // Dagsbyte gäller BÅDA vyer: appen har varit öppen över midnatt.
  if (l.nuvarandeDatum !== l.sessionStartDatum) return 'dagsbyte';
  if (l.korvyActive) {
    // Körvy: ofarligt bara när inga nya GPS-punkter kommit på 10 min (inget pass i flykt).
    const gpsIdle = l.sistaGpsTs == null || l.nu - l.sistaGpsTs >= KORVY_GPS_IDLE_MS;
    return gpsIdle ? 'korvy-gps-idle' : null;
  }
  // Planeringsvy (ej körvy → ingen hyttspår-loggning): ofarligt efter 5 min utan interaktion.
  return l.nu - l.sistaInteraktionTs >= PLAN_IDLE_MS ? 'plan-idle' : null;
}
