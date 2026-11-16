/**
 * VYER OVANPÅ KARTAN I MASKINEN (Martin 2026-11-13). I maskinen är kartan hela appen: den loggar körspåret och larmar för ledningar och
 * ytor. Förut var Arbetsrapporten, Uppföljningen m.fl. egna sidor — gick föraren dit stängdes kartan (inget spår, inga larm), och hemknappen
 * skickade tillbaka till en karta som startade från noll, "som på morgonen".
 *
 * Nu öppnas de vyerna i en ruta OVANPÅ kartan (components/startsida/MaskinVyOvanpa.tsx). Kartan stängs aldrig. Vyn i rutan säger till kartan
 * med ett meddelande när föraren vill hem (→ appens låda) eller till kartan. Rena regler här; inget av det gäller utanför rutan.
 */
export const INBADDAD_KALLA = 'skogsystem-vy-ovanpa'
export type InbaddadMeddelande = { typ: 'hem' } | { typ: 'karta'; href: string }

const sokvag = (href: string): string => href.split('?')[0].split('#')[0]

/** Kartans egna adresser: de öppnas aldrig i rutan (det vore en andra karta) — där stänger man rutan i stället. */
export function arKartLank(href: string): boolean {
  const s = sokvag(href)
  return s === '/planering' || s === '/maskin'
}

/** Ska länken öppnas ovanpå kartan? Bara appens egna sidor — inte kartan själv, inte startsidan, inte inloggningen, inte andra sajter. */
export function oppnasOvanpa(href: string | null | undefined): boolean {
  if (!href || !href.startsWith('/') || href.startsWith('//')) return false
  const s = sokvag(href)
  if (s === '/' || s === '/login' || s === '/valkommen' || s.startsWith('/api/')) return false
  return !arKartLank(href)
}

/** Vad en sida i rutan ska säga till kartan när den hamnar på en viss adress: startsidan = hem, kartan = till kartan, annars inget. */
export function meddelandeForSokvag(pathname: string, search = ''): InbaddadMeddelande | null {
  if (pathname === '/') return { typ: 'hem' }
  if (arKartLank(pathname)) return { typ: 'karta', href: pathname + search }
  return null
}

/** Läser ett meddelande från rutan. Allt som inte är vårt, eller har fel form, är null. */
export function tolkaMeddelande(data: unknown): InbaddadMeddelande | null {
  if (!data || typeof data !== 'object') return null
  const d = data as { kalla?: unknown; typ?: unknown; href?: unknown }
  if (d.kalla !== INBADDAD_KALLA) return null
  if (d.typ === 'hem') return { typ: 'hem' }
  if (d.typ === 'karta' && typeof d.href === 'string' && arKartLank(d.href)) return { typ: 'karta', href: d.href }
  return null
}

/** Körs sidan i rutan ovanpå kartan? Bara en ruta från vår egen app räknas. */
export function arInbaddad(): boolean {
  try {
    return typeof window !== 'undefined' && window.self !== window.top && window.parent.location.origin === window.location.origin
  } catch { return false }
}

/** Säg till kartan. Gör ingenting utanför rutan. */
export function sagTillKartan(m: InbaddadMeddelande): void {
  if (!arInbaddad()) return
  try { window.parent.postMessage({ kalla: INBADDAD_KALLA, ...m }, window.location.origin) } catch { /* kartan är borta */ }
}
