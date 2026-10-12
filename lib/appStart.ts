// App-start: vad gör en enhet när appen öppnas? Rent beslut (testbart) — sidoeffekterna (omdirigering, frågeskärmen)
// ligger i components/AppStartVakt.tsx.
//
// Före: startsidan "/" visade alltid appens meny. En maskindator utan vald maskin (dagens hyttspår har maskin_id null)
// hamnade i ett läge där ingenting kunde starta, och maskinvalet låg djupt i planering → Inställningar → GPS-källa.
//
//   maskin vald på enheten                       → /planering i maskinläge (startsekvensen tar över)
//   serial-GPS (eller sparad GPS-port), ingen maskin → helskärmsfråga "Vilken maskin är det här?"
//   annars (telefon, vanlig dator)                → appens meny, som idag

export type AppStart =
  | { typ: 'planering' }
  | { typ: 'fraga-maskin' }
  | { typ: 'meny' };

/** Query-parameter som tvingar fram appens meny ("Till appen") utan att startbeslutet omdirigerar. */
export const MENY_PARAM = 'meny';
/** sessionStorage: appen har startats i det här fönstret (en app-START är första laddningen, inte varje sidbyte). */
export const START_SETT_NYCKEL = 'app_start_sett_v1';
/** sessionStorage: användaren har själv valt appens meny i den här sessionen → startbeslutet lämnar dem ifred. */
export const MENY_VALD_NYCKEL = 'app_meny_vald_v1';
/** sessionStorage: användaren hoppade över maskinfrågan i den här sessionen (frågar igen nästa app-start). */
export const FRAGA_HOPPAD_NYCKEL = 'maskin_fraga_hoppad_v1';

/** Har enheten serial-GPS? Flaggan (`gps-serial-vald`, sätts när en port valts) ELLER en port webbläsaren redan
 *  beviljat oss (`navigator.serial.getPorts()` — bara portar användaren själv valt, aldrig COM6/COM7). */
export function harSerialGps(a: { flagga: boolean; beviljadePortar: number }): boolean {
  return !!a.flagga || a.beviljadePortar > 0;
}

/** Själva beslutet. `fragaHoppad` = användaren tryckte "Till appen" på frågan i den här sessionen. */
export function avgorAppStart(a: {
  enhetMaskinId: string | null | undefined;
  serialGps: boolean;
  fragaHoppad?: boolean;
}): AppStart {
  if (a.enhetMaskinId && a.enhetMaskinId.trim()) return { typ: 'planering' };
  if (a.serialGps && !a.fragaHoppad) return { typ: 'fraga-maskin' };
  return { typ: 'meny' };
}

/** Ska startbeslutet tas på den här sidan just nu?
 *   "/"        — alltid (startsidan), utom när användaren själv bett om menyn.
 *   "/oversikt" — bara vid app-START: manifestets start_url är /oversikt, så en installerad app (t.ex. maskindatorns
 *                 "Installera på skrivbordet") öppnar den och aldrig "/". Någon som navigerar dit mitt i en session
 *                 ska få översikten.
 *  Övriga sidor: aldrig (en bokmärkt /planering sköter sin egen fråga). */
export function startbeslutGaller(a: {
  pathname: string;
  menyParam: boolean;
  menyValdISessionen: boolean;
  appStartSettRedan: boolean;
}): boolean {
  if (a.menyParam || a.menyValdISessionen) return false;
  if (a.pathname === '/') return true;
  if (a.pathname === '/oversikt') return !a.appStartSettRedan;
  return false;
}

/** Vad vakten visar medan den arbetar. `sedanMs` = tid sedan steget började.
 *  INVARIANT (testad): ren svart skärm förekommer aldrig i ≥ 1 s — därefter gran/text eller en felskärm. */
export type VaktSteg = 'inte-aktuellt' | 'avgor' | 'omdirigerar' | 'fraga' | 'fel';
export type VaktVy = 'inget' | 'svart' | 'svart-med-gran' | 'fraga' | 'fel';

/** Hur länge vi väntar på att /planering ska ta över innan vi säger det som det är. */
export const OMDIRIGERA_MAX_MS = 8000;
const SVART_UTAN_INNEHALL_MS = 1000;

export function vaktVy(steg: VaktSteg, sedanMs: number): VaktVy {
  if (steg === 'inte-aktuellt') return 'inget';
  if (steg === 'fraga') return 'fraga';
  if (steg === 'fel') return 'fel';
  // 'avgor' / 'omdirigerar': svart är OK en kort stund, sedan måste något synas.
  if (steg === 'omdirigerar' && sedanMs >= OMDIRIGERA_MAX_MS) return 'fel';
  return sedanMs < SVART_UTAN_INNEHALL_MS ? 'svart' : 'svart-med-gran';
}
