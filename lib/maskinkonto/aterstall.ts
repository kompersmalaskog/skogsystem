// Maskinen som maskin — dit man kommer EFTER en låsning (Martin i H8 2026-11-22: efter Arbetsrapport och tillbaka till kartan blev appen helskärm
// i stället för halv karta + maskinlådan som innan).
//
//   Planeringsvyn skriver vid varje ändring hur maskindatorn ser ut (`maskin_planering_lage_v1`): ligger maskinlådan över kartan eller är det körvyn?
//   När någon ska låsa upp (`oppnaVemArDu`) kopieras det till `maskin_atervand_v1` — "så här såg maskinen ut INNAN upplåsningen". Låsningen
//   (kartan, Lås, 10 minuter) läser det och går tillbaka dit; är lådan inte det som var öppet går den till kartan som förut (körvyn där man var).
//
// Detta rör ALDRIG sessionerna: låsningens utloggning av personen (lib/maskinkonto/klient `aterMaskin`) är oförändrad och sker före allt detta.
// Inga personuppgifter lagras här — bara om lådan var öppen.

export const PLANERING_LAGE_NYCKEL = 'maskin_planering_lage_v1'
export const ATERVAND_NYCKEL = 'maskin_atervand_v1'
/** Ett sparat läge äldre än så här gäller inte (en enhet som stått över natten ska inte öppna en låda från i går). */
export const ATERVAND_MAX_MS = 12 * 60 * 60 * 1000

export type PlaneringLage = { menyOppen: boolean; tid: number }
export type Atervand = { menyOppen: boolean }

function las(nyckel: string): PlaneringLage | null {
  try {
    if (typeof localStorage === 'undefined') return null
    const r = localStorage.getItem(nyckel)
    if (!r) return null
    const j = JSON.parse(r) as Partial<PlaneringLage>
    return typeof j.menyOppen === 'boolean' && typeof j.tid === 'number' ? { menyOppen: j.menyOppen, tid: j.tid } : null
  } catch { return null }
}
function skriv(nyckel: string, v: PlaneringLage | null): void {
  try {
    if (typeof localStorage === 'undefined') return
    if (v === null) localStorage.removeItem(nyckel); else localStorage.setItem(nyckel, JSON.stringify(v))
  } catch { /* */ }
}
const farsk = (l: PlaneringLage | null, nu: number): l is PlaneringLage => !!l && nu - l.tid >= 0 && nu - l.tid < ATERVAND_MAX_MS

/** Planeringsvyn (maskinläge) säger hur maskindatorn ser ut just nu. null = vyn lämnades: inget läge att minnas. */
export const sattPlaneringLage = (menyOppen: boolean | null, nu = Date.now()): void =>
  skriv(PLANERING_LAGE_NYCKEL, menyOppen === null ? null : { menyOppen, tid: nu })

/** Någon ska låsa upp: minns hur maskinen såg ut innan (eller glöm ett gammalt minne om planeringsvyn inte var uppe). */
export function minnsLageForeUpplasning(nu = Date.now()): void {
  const l = las(PLANERING_LAGE_NYCKEL)
  skriv(ATERVAND_NYCKEL, farsk(l, nu) ? { menyOppen: l.menyOppen, tid: nu } : null)
}

/** Läser och TAR BORT minnet (det gäller en låsning). */
export function tagAtervand(nu = Date.now()): Atervand | null {
  const l = las(ATERVAND_NYCKEL)
  skriv(ATERVAND_NYCKEL, null)
  return farsk(l, nu) ? { menyOppen: l.menyOppen } : null
}
export const glomAtervand = (): void => skriv(ATERVAND_NYCKEL, null)

/** Dit låsningen går: kartan, med maskinlådan öppen om den var det innan upplåsningen. Parametern ?maskinmeny=1 öppnar lådan direkt (planeringsvyn). */
export const kartaEfterLasning = (a: Atervand | null): string => (a?.menyOppen ? '/planering?maskinmeny=1' : '/planering')
