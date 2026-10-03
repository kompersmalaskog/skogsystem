// MÄTNING av startsekvensen: när hände varje steg, i ms sedan navigeringen (performance.now). Gör "hur länge var det svart?"
// till ett MÄTT tal i stället för en känsla — läs `window.__MASKINSTART` i konsolen (eller raden "[maskin-start]" som
// loggas när svart släpps och när kameran landat). Första anropet per steg gäller; senare ignoreras (effekter kör om).

export type StartSteg =
  | 'sekvensStart'      // maskinläget bekräftat, sekvensen startar
  | 'positionKand'      // maskinens position känd (senast känd eller fix)
  | 'objektValt'        // objektet öppnat → kartan monteras
  | 'kartaLaddad'       // MapLibre 'load' (stil + första rutor)
  | 'kartaRedo'         // kartan målad (idle) → SVART TONAR UT — det här är "svart-tiden"
  | 'flygStart'
  | 'landat';

export interface StartMatning { marks: Partial<Record<StartSteg, number>>; svartMs: number | null; totalMs: number | null }

type Host = { __MASKINSTART?: StartMatning };
const host = (): Host => (typeof window !== 'undefined' ? (window as unknown as Host) : ({} as Host));

function nu(): number { return Math.round(typeof performance !== 'undefined' ? performance.now() : Date.now()); }

export function lasStartMatning(): StartMatning {
  const h = host();
  return (h.__MASKINSTART ??= { marks: {}, svartMs: null, totalMs: null });
}

/** Märk ett steg (första gången). Loggar en rad när svart släpps och när kameran landat. Returnerar tiden eller null om redan satt. */
export function markeraStart(steg: StartSteg, klocka: () => number = nu): number | null {
  const m = lasStartMatning();
  if (m.marks[steg] != null) return null;
  const t = klocka();
  m.marks[steg] = t;
  if (steg === 'kartaRedo') m.svartMs = t;
  if (steg === 'landat') m.totalMs = t;
  if (steg === 'kartaRedo' || steg === 'landat') {
    try { console.info(`[maskin-start] ${steg === 'kartaRedo' ? 'SVART SLUT' : 'LANDAT'} efter ${t} ms (sedan navigering)`, JSON.stringify(m.marks)); } catch { /* */ }
  }
  return t;
}

/** Bara för test. */
export function aterstallStartMatning(): void { const h = host(); delete h.__MASKINSTART; }
