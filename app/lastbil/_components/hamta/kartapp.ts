// Kartappen: Hämta-flödet har ingen egen navigering, den öppnar förarens kartapp mot maskinens (eller trakten) koordinat.
//
// Apple Kartor finns bara på Apple-enheter, så valet "Apple Kartor | Google Maps" erbjuds bara där. Överallt annars är det
// Google Maps (djuplänken öppnar appen om den finns, annars webben). Valet sparas PER ENHET i localStorage — en förare som
// bytt till Google Maps ska inte behöva välja om vid nästa maskin. Går lagringen inte att läsa (privat läge) gäller
// standarden, aldrig ett fel.

export type Kartapp = 'apple' | 'google';

export const KARTAPPAR: readonly { id: Kartapp; namn: string }[] = [
  { id: 'apple', namn: 'Apple Kartor' },
  { id: 'google', namn: 'Google Maps' },
];

export const KARTAPP_NYCKEL = 'lastbil_kartapp_v1';

/** iPhone, iPad (även iPadOS som uppger sig som Mac) — dvs. enheter där Apple Kartor finns. */
export function arAppleEnhet(ua: string, beroringspunkter = 0): boolean {
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && beroringspunkter > 1);
}

/** Standardvalet: Apple Kartor på Apple-enheter, annars Google Maps. */
export function standardKartapp(ua: string, beroringspunkter = 0): Kartapp {
  return arAppleEnhet(ua, beroringspunkter) ? 'apple' : 'google';
}

function enhet(): { ua: string; punkter: number } {
  if (typeof navigator === 'undefined') return { ua: '', punkter: 0 };
  return { ua: navigator.userAgent ?? '', punkter: navigator.maxTouchPoints ?? 0 };
}

/** Finns valet "Apple Kartor" på den här enheten? Annars visas ingen väljare. */
export function kanValjaKartapp(): boolean {
  const e = enhet();
  return arAppleEnhet(e.ua, e.punkter);
}

/** Enhetens val: det sparade, annars standarden. Ett sparat "apple" på en enhet utan Apple Kartor räknas inte. */
export function lasKartapp(): Kartapp {
  const e = enhet();
  const std = standardKartapp(e.ua, e.punkter);
  try {
    const v = localStorage.getItem(KARTAPP_NYCKEL);
    if (v === 'google') return 'google';
    if (v === 'apple' && arAppleEnhet(e.ua, e.punkter)) return 'apple';
  } catch { /* lagring otillgänglig — standarden gäller */ }
  return std;
}

export function sparaKartapp(k: Kartapp): void {
  try { localStorage.setItem(KARTAPP_NYCKEL, k); } catch { /* ingen lagring — valet gäller bara den här gången */ }
}

/** Djuplänken som startar vägbeskrivning (bil) till koordinaten. */
export function kartLank(app: Kartapp, lat: number, lng: number): string {
  const p = `${lat.toFixed(6)},${lng.toFixed(6)}`;
  return app === 'apple'
    ? `maps://?daddr=${p}&dirflg=d`
    : `https://www.google.com/maps/dir/?api=1&destination=${p}&travelmode=driving`;
}

/** Länkattribut: webblänkar öppnas i ny flik, `maps://` lämnar appen själv. */
export function lankAttr(url: string): { href: string; target?: string; rel?: string } {
  return url.startsWith('http') ? { href: url, target: '_blank', rel: 'noopener noreferrer' } : { href: url };
}
