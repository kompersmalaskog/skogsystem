// Baudrate för serial-GPS (Web Serial) — valbar per enhet, sparas i localStorage.
//
// Varför: Rottnes Quectel-mottagare (GpsGate → Eltima COM20/21) skickar GGA/RMC + GSV/GSA för GP/GL/GA/PQ varje sekund —
// mer än 4800 baud hinner med. Kön byggdes upp och appen fick positioner 2,5 h gamla. En virtuell COM-port (Eltima) tar
// emot vilken baudrate som helst men STRYPER leveransen till den: därför kan flera baudrates ge giltiga meningar, och
// den HÖGSTA som fungerar är den som inte släpar. En riktig UART kräver rätt baudrate (fel ger skräp utan giltig checksumma).
//
//   Fast val (4800/9600/38400/115200): porten öppnas alltid med den.
//   Auto: vid portval provas baudraterna HÖGST FÖRST tills giltiga meningar kommer — den första som ger dem vinner och
//         sparas som "hittad". Utan hittad baudrate används 4800 (dagens beteende) tills porten valts om.
//
// Rena funktioner + tunna localStorage-omslag (tål blockerad lagring). Ingen koppling till gpsKalla → testbar för sig.

export const BAUDRATER = [4800, 9600, 38400, 115200] as const;
export const BAUD_STANDARD = 4800;
/** Provordning vid Auto: högst först (se ovan). */
export const BAUD_PROVORDNING: readonly number[] = [...BAUDRATER].reverse();

export const BAUD_NYCKEL = 'gps-serial-baud';              // 'auto' | '4800' | '9600' | '38400' | '115200'
export const BAUD_HITTAD_NYCKEL = 'gps-serial-baud-hittad'; // senaste baudrate Auto hittade

export type BaudVal = 'auto' | 4800 | 9600 | 38400 | 115200;

const arBaud = (n: number): n is 4800 | 9600 | 38400 | 115200 => (BAUDRATER as readonly number[]).includes(n);

/** Sparad sträng → val. Saknas/ogiltigt → 'auto' (nya portval provar automatiskt); en enhet utan hittad baudrate kör ändå 4800. */
export function tolkaBaudVal(raw: string | null | undefined): BaudVal {
  if (raw == null || raw === '' || raw === 'auto') return 'auto';
  const n = Number(raw);
  return arBaud(n) ? n : 'auto';
}

/** Sparad hittad baudrate → tal, eller null om den saknas/är ogiltig. */
export function tolkaHittadBaud(raw: string | null | undefined): number | null {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return arBaud(n) ? n : null;
}

/** Baudrate porten ska öppnas med: fast val → det; Auto → den hittade, annars 4800 (som före den här funktionen). */
export function baudAttOppnaMed(val: BaudVal, hittad: number | null): number {
  if (val !== 'auto') return val;
  return hittad != null ? hittad : BAUD_STANDARD;
}

function lagring(): Storage | null {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}

export function hamtaBaudVal(): BaudVal {
  try { return tolkaBaudVal(lagring()?.getItem(BAUD_NYCKEL)); } catch { return 'auto'; }
}
export function sattBaudVal(val: BaudVal): void {
  try { lagring()?.setItem(BAUD_NYCKEL, String(val)); } catch { /* blockerad lagring → valet gäller bara den här sessionen (ingen krasch) */ }
}
export function hamtaHittadBaud(): number | null {
  try { return tolkaHittadBaud(lagring()?.getItem(BAUD_HITTAD_NYCKEL)); } catch { return null; }
}
export function sattHittadBaud(n: number | null): void {
  try {
    const l = lagring();
    if (!l) return;
    if (n == null) l.removeItem(BAUD_HITTAD_NYCKEL); else l.setItem(BAUD_HITTAD_NYCKEL, String(n));
  } catch { /* */ }
}

/** Effektiv baudrate JUST NU (läser enhetens sparade val). Används vid varje port.open. */
export function effektivBaud(): number {
  return baudAttOppnaMed(hamtaBaudVal(), hamtaHittadBaud());
}
