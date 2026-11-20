// Hämta-flödets tillstånd. Det sparas på enheten (localStorage) efter varje steg: föraren lämnar appen för kartappen, och en iOS-app
// som varit i bakgrunden laddas ofta om från noll. Utkastet är bara VAR i flödet man är — flytten och dagen ligger i databasen.
// Ett utkast äldre än 12 timmar gäller inte (en dag är slut), och ett som inte går att tolka gäller inte heller.

export type Steg = 'val' | 'kor' | 'dest' | 'hem';

export interface ValdPlats {
  namn: string;
  lat: number | null;
  lng: number | null;
  objektId: string | null;
  platsId: string | null;
  kalla: 'larmkoordinat' | 'objekt' | 'flyttplats' | 'karta';
  verkstad: boolean;
}

export interface Utkast {
  steg: Steg;
  /** När flödet startade — flyttens starttid (klockan startar när maskinen väljs). */
  start: string;
  maskinId: string | null;
  extern: { namn: string; kund: string } | null;
  /** Föraren pekade själv ut var maskinen står (maskinen saknade position, eller positionen var fel). */
  hamtPlats: ValdPlats | null;
  navKor: boolean;
  flyttId: string | null;
  lassatTid: string | null;
  dest: ValdPlats | null;
  navDest: boolean;
  lossad: { tid: string; namn: string } | null;
  /** Kartappen öppnad på Vägen hem — då är Klar skärmens primärknapp. */
  navHem: boolean;
}

export const UTKAST_NYCKEL = 'lastbil_hamta_v1';
export const UTKAST_MAX_ALDER_MS = 12 * 3600 * 1000;

export function nyttUtkast(start: string): Utkast {
  return { steg: 'val', start, maskinId: null, extern: null, hamtPlats: null, navKor: false, flyttId: null, lassatTid: null, dest: null, navDest: false, lossad: null, navHem: false };
}

const STEG: readonly Steg[] = ['val', 'kor', 'dest', 'hem'];

export function tolkaUtkast(raw: string | null, nuMs: number): Utkast | null {
  if (!raw) return null;
  try {
    const j = JSON.parse(raw);
    const u = j?.utkast;
    const sparad = Date.parse(j?.sparad);
    if (!u || !STEG.includes(u.steg) || typeof u.start !== 'string' || !Number.isFinite(sparad) || nuMs - sparad > UTKAST_MAX_ALDER_MS) return null;
    // Ett utkast som kom längre än "val" måste veta vilken maskin det gäller.
    if (u.steg !== 'val' && !u.maskinId && !u.extern) return null;
    return { ...nyttUtkast(u.start), ...u };
  } catch { return null; }
}

export function lasUtkast(nuMs = Date.now()): Utkast | null {
  try { return tolkaUtkast(localStorage.getItem(UTKAST_NYCKEL), nuMs); } catch { return null; }
}
export function sparaUtkast(u: Utkast, nuMs = Date.now()): void {
  try { localStorage.setItem(UTKAST_NYCKEL, JSON.stringify({ utkast: u, sparad: new Date(nuMs).toISOString() })); } catch { /* utan lagring överlever inte flödet en omladdning */ }
}
export function rensaUtkast(): void {
  try { localStorage.removeItem(UTKAST_NYCKEL); } catch { /* ingenting att rensa */ }
}

/** Adressen som öppnar flödet. Ett tryck på "Hämta en maskin" skriver den; omladdningen landar då i flödet igen. */
export function lasHamtaUrl(search: string): boolean {
  return new URLSearchParams(search).get('hamta') === '1';
}
