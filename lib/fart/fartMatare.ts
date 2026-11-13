/**
 * Fartmätaren (Martin 2026-11-13: "kartan är jävligt seg i maskinen om man byter lager"). Dold för förarna: slås på med ?fart=1 i adressen
 * (sparas på enheten, ?fart=0 stänger av) och visar efter varje lagerbyte TRE tal, så vi ser vad som faktiskt är trögt innan vi bygger om något:
 *   sidan    = från trycket tills sidan ritat om sig (appens egen räkning)
 *   rutorna  = därefter tills kartan hämtat och ritat alla rutor (nätet och servern)
 *   ritningen = den långsammaste bildrutan under tiden (maskinens grafik)
 * Rena funktioner här; mätningen i webbläsaren ligger i components/planering/FartMatare.tsx.
 */
export const FART_NYCKEL = 'fart_matare_v1'
/** Kartan som aldrig blir klar räknas som så här lång — vi väntar inte för evigt. */
export const FART_MAX_MS = 30_000
/** Ett tryck äldre än så här hör inte till lagerbytet (bytet kom av något annat). */
export const TRYCK_MAX_MS = 3_000

/** ?fart=1 slår på och sparar, ?fart=0 stänger av; annars gäller det sparade. Tål att minnet inte går att nå. */
export function fartPa(sok: string, minne: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null): boolean {
  let val: string | null = null
  try { val = new URLSearchParams(sok).get('fart') } catch { /* */ }
  try {
    if (val === '1') { minne?.setItem(FART_NYCKEL, '1'); return true }
    if (val === '0') { minne?.removeItem(FART_NYCKEL); return false }
    return minne?.getItem(FART_NYCKEL) === '1'
  } catch { return val === '1' }
}

/** Vad som byttes, i ord: "Bakgrund: Karta" eller "Markfuktighet på". Flera lager på en gång: det första + antalet. */
export function vadAndrades(
  fore: { bakgrund: string; lager: Record<string, boolean | undefined> },
  efter: { bakgrund: string; lager: Record<string, boolean | undefined> },
  namn: (id: string) => string,
): string | null {
  if (fore.bakgrund !== efter.bakgrund) return `Bakgrund: ${namn(efter.bakgrund)}`
  const andrade = Array.from(new Set([...Object.keys(fore.lager), ...Object.keys(efter.lager)])).filter((k) => !!fore.lager[k] !== !!efter.lager[k]).sort()
  if (andrade.length === 0) return null
  const forsta = `${namn(andrade[0])} ${efter.lager[andrade[0]] ? 'på' : 'av'}`
  return andrade.length === 1 ? forsta : `${forsta} + ${andrade.length - 1} till`
}

export interface Hamtning { namn: string; start: number; langd: number }
/** Är det här en kartruta (och inte appens egna anrop)? Vår proxy, bakgrundens rutor (/api/forarkarta), WMS-anrop och z/x/y-rutor. */
export function arKartruta(url: string): boolean {
  return /wms-proxy|\/api\/forarkarta\?|[?&]bbox=|service=wm[st]s?|\/\d{1,2}\/\d+\/\d+(\.\w+)?(\?|$)/i.test(url)
}

export interface Matning {
  vad: string
  /** ms från trycket tills sidan ritat om sig; null = inget tryck att räkna från. */
  sidanMs: number | null
  /** ms därefter tills kartan var klar; null = kartan blev aldrig klar inom FART_MAX_MS. */
  rutornaMs: number | null
  rutor: number
  /** Den långsammaste rutan, ms (0 när inga rutor hämtades). */
  langstaRutaMs: number
  /** Den långsammaste bildrutan under bytet, ms. */
  langstaBildrutaMs: number
}

export function sammanfatta(i: { vad: string; tryck: number | null; ritad: number; klar: number | null; hamtningar: readonly Hamtning[]; bildrutor: readonly number[] }): Matning {
  const fran = i.tryck != null && i.ritad - i.tryck <= TRYCK_MAX_MS ? i.tryck : null
  const rutor = i.hamtningar.filter((h) => arKartruta(h.namn) && h.start >= (fran ?? i.ritad) - 1)
  let langstaBild = 0
  for (let k = 1; k < i.bildrutor.length; k++) langstaBild = Math.max(langstaBild, i.bildrutor[k] - i.bildrutor[k - 1])
  return {
    vad: i.vad,
    sidanMs: fran == null ? null : Math.round(i.ritad - fran),
    rutornaMs: i.klar == null ? null : Math.max(0, Math.round(i.klar - i.ritad)),
    rutor: rutor.length,
    langstaRutaMs: Math.round(rutor.reduce((m, h) => Math.max(m, h.langd), 0)),
    langstaBildrutaMs: Math.round(langstaBild),
  }
}

/** "0,4 s" / "120 ms" — korta tal som går att läsa på en skärmbild. */
export function tidText(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1).replace('.', ',')} s` : `${Math.round(ms)} ms`
}

/** Raden som visas: tre tal i ord. */
export function matningRader(m: Matning): { sidan: string; rutorna: string; ritningen: string } {
  return {
    sidan: m.sidanMs == null ? 'Sidan: –' : `Sidan: ${tidText(m.sidanMs)}`,
    rutorna: m.rutornaMs == null ? `Rutorna: över ${FART_MAX_MS / 1000} s · ${m.rutor} st`
      : m.rutor === 0 ? `Rutorna: ${tidText(m.rutornaMs)} · inga hämtades`
      : `Rutorna: ${tidText(m.rutornaMs)} · ${m.rutor} st · långsammaste ${tidText(m.langstaRutaMs)}`,
    ritningen: `Ritningen: långsammaste bildruta ${tidText(m.langstaBildrutaMs)}`,
  }
}
