// Maskinen blir maskin av sig själv — webbläsarens regler (rena, testbara). Själva anropet bor i klient.ts, utlösaren i MaskinKontoProvider.
//
// En enhet är en RIKTIG MASKINDATOR när alla fyra stämmer:
//   1. webbläsaren har Web Serial (Chrome på en dator — aldrig en telefon eller iPad),
//   2. maskinens GPS är ansluten: serial-flaggan (en port har testats och gett rader) eller en port webbläsaren redan beviljat,
//   3. enheten vet vilken maskin den är (enhet_maskin_id, valt i "Vilken maskin är det här?"),
//   4. det är inte testläget ("Testa som maskin", /maskin?som=…) och inte inloggningen.
// Bara då, och bara för en inloggad förare/admin, ber appen servern om maskinens konto. Alla andra enheter berörs aldrig.

export const AUTO_PAUS_NYCKEL = 'maskin_auto_paus_till_v1'
/** Efter "Logga ut maskinen" (nödfallet) byter enheten inte till maskinkontot igen på så här lång tid, så att en person kan logga in som sig själv. */
export const AUTO_PAUS_MS = 30 * 60 * 1000

export function lasAutoPaus(): number {
  try { return typeof localStorage === 'undefined' ? 0 : Number(localStorage.getItem(AUTO_PAUS_NYCKEL)) || 0 } catch { return 0 }
}
export function sattAutoPaus(till: number | null): void {
  try {
    if (typeof localStorage === 'undefined') return
    if (till === null) localStorage.removeItem(AUTO_PAUS_NYCKEL); else localStorage.setItem(AUTO_PAUS_NYCKEL, String(till))
  } catch { /* */ }
}

export type AutoIndata = {
  /** medarbetare.roll för den som är inloggad. */
  roll: string | null | undefined
  pathname: string
  harWebSerial: boolean
  /** gps-serial-vald */
  serialFlagga: boolean
  /** navigator.serial.getPorts().length */
  beviljadePortar: number
  enhetMaskinId: string | null
  /** Pausen efter "Logga ut maskinen" (ms-tidpunkt, 0 = ingen). */
  pausTill: number
  nu: number
}

/** Sidor där enheten aldrig byter: testläget (/maskin), inloggningen och inbjudan. */
export const arUndantagenSokvag = (path: string): boolean =>
  path === '/maskin' || path.startsWith('/maskin/') || path === '/login' || path.startsWith('/login/') || path === '/valkommen' || path.startsWith('/valkommen/')

/** Ska den här enheten be om maskinens konto? Sant bara för en riktig maskindator med en inloggad förare/admin. */
export function skaBlimaMaskin(a: AutoIndata): boolean {
  if (a.roll !== 'forare' && a.roll !== 'admin') return false
  if (arUndantagenSokvag(a.pathname)) return false
  if (!a.harWebSerial) return false
  if (!a.serialFlagga && !(a.beviljadePortar > 0)) return false
  if (!a.enhetMaskinId || !a.enhetMaskinId.trim()) return false
  if (a.pausTill > a.nu) return false
  return true
}
