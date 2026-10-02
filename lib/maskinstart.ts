// Maskindatorns startsekvens (maskinläge): logga → söker GPS → första fix → klar / ingen fix.
// Ren, tidsstyrd tillståndsmaskin (ingen sidoeffekt) så den kan enhetstestas. Sidan (page.tsx)
// renderar overlayen utifrån fasen och matar in nu-tid + när första giltiga fixen kom.

export type StartFas = 'logga' | 'soker' | 'fix' | 'ingenFix' | 'klar';

export const LOGGA_MS = 2000;        // mörk skärm + logga visas alltid först ~2 s (ingen spinner)
export const FIX_TIMEOUT_MS = 30000; // ingen giltig fix på 30 s → "Ingen GPS-fix" (står kvar tills den kommer)
export const FIX_RAD_MS = 5000;      // objekt-raden tonar bort 5 s efter första fix → 'klar'

/** Fas utifrån förfluten tid sedan start och när första giltiga fixen kom (null = ingen än).
 *  - `logga`   : 0–2 s (loggan visas ALLTID först, även om en fix skulle komma under tiden)
 *  - `soker`   : efter loggan, ingen fix än, < 30 s
 *  - `ingenFix`: efter loggan, ingen fix än, ≥ 30 s (kvar tills fix kommer)
 *  - `fix`     : fix har kommit, < 5 s sedan → pricken tänd, kameran glider, objekt-raden visas
 *  - `klar`    : ≥ 5 s sedan fixen → overlay/rad borta, vanlig körvy
 */
export function startFas(o: { startMs: number; nuMs: number; forstaFixMs: number | null }): StartFas {
  const gått = Math.max(0, o.nuMs - o.startMs);
  if (gått < LOGGA_MS) return 'logga';
  if (o.forstaFixMs != null) {
    return (o.nuMs - o.forstaFixMs) >= FIX_RAD_MS ? 'klar' : 'fix';
  }
  return gått >= FIX_TIMEOUT_MS ? 'ingenFix' : 'soker';
}

/** Overlayen är aktiv (ska renderas) i alla faser utom 'klar'. */
export function startOverlaySynlig(fas: StartFas): boolean {
  return fas !== 'klar';
}

/** Nedre radens text per fas. null i 'logga' (bara logga) och 'klar' (borta). Objekt-raden i 'fix'. */
export function startRadText(
  fas: StartFas,
  objekt: { namn?: string | null; m3kvar?: number | null } | null | undefined,
): string | null {
  if (fas === 'soker') return 'Söker GPS';
  if (fas === 'ingenFix') return 'Ingen GPS-fix';
  if (fas === 'fix') {
    const namn = (objekt?.namn || '').trim() || 'Objekt';
    return objekt?.m3kvar != null ? `${namn} – ${Math.round(objekt.m3kvar)} m³ kvar` : namn;
  }
  return null; // logga, klar
}
