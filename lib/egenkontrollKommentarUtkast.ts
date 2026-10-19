// Rundans kommentar medan den skrivs. Skrivs vid stenmuren, ofta utan tackning och med appen som kan laddas om:
// texten som inte hunnit sparas far inte forsvinna. Sparas lokalt per runda tills den ar sparad pa riktigt.
//
// Lagret ar ETT utkast per runda och bara ett UTKAST: servern ar sanningen. Ett utkast som ar identiskt med det
// som redan star pa servern ar inget utkast (arUtkast), och ett lasfel i lagret ar "inget utkast", aldrig ett fel
// som stoppar rundan (privat lage, full disk).

const NYCKEL = (rundaId: string) => `egenkontroll_kommentar_utkast_${rundaId}`;

type Lager = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function lager(l?: Lager): Lager | null {
  if (l) return l;
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

export function lasUtkast(rundaId: string, l?: Lager): string | null {
  try { return lager(l)?.getItem(NYCKEL(rundaId)) ?? null; } catch { return null; }
}

export function sparaUtkast(rundaId: string, text: string, l?: Lager): void {
  try { lager(l)?.setItem(NYCKEL(rundaId), text); } catch { /* privat lage: utkastet ligger kvar i minnet */ }
}

export function rensaUtkast(rundaId: string, l?: Lager): void {
  try { lager(l)?.removeItem(NYCKEL(rundaId)); } catch { /* ignoreras */ }
}

/** Ett utkast ar bara ett utkast om det skiljer sig fran det sparade (blanksteg i kanterna raknas inte). */
export function arUtkast(utkast: string | null, sparad: string | null): utkast is string {
  if (utkast === null) return false;
  return utkast.trim() !== (sparad ?? '').trim();
}
