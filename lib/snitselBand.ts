/**
 * BANDET ATT GÅ I när man snitslar stickvägar (Martin 2026-11-13: "kan appen rita ut en ny väg 25 meter inåt som man följer — det måste
 * vara så lätt att ett barn förstår"). Appen ritar nästa väg bredvid den förra; man går i bandet i stället för att läsa en siffra.
 *
 * MÅTTET ÄR KANT TILL KANT: 25 m skog ska stå kvar mellan vägarna. Vägen är `bredd` bred, så mitt till mitt = mål + bredd
 * (halva förra vägen + skogen + halva nya vägen). Siffran föraren ser är avståndet mellan kanterna.
 *
 * Rena funktioner i ett plan (x, y i samma enhet som avstånden — sidan räknar om meter till kartans enheter). Det är den GÅNGNA vägen som
 * sparas, aldrig bandet: bandet är ett stöd, och går man runt en sten räknas nästa band från där man faktiskt gick.
 */
export interface Pt { x: number; y: number }

/** Standardbredd på en stickväg (Martin 2026-11-13: "minst 4 meter bred, 4,5 kanske"). */
export const STICKVAG_BREDD_M = 4.5

/** Mitt-till-mitt-avståndet som ger `kantMal` meter skog mellan vägkanterna. */
export function mittAvstand(kantMal: number, bredd: number): number {
  return kantMal + bredd
}
/** Skog mellan vägkanterna när mittlinjerna ligger `mitt` isär. Aldrig under 0, hela meter. */
export function kantAvstand(mitt: number | null, bredd: number): number | null {
  if (mitt == null || !Number.isFinite(mitt)) return null
  return Math.max(0, Math.round(mitt - bredd))
}

const hyp = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)

/** Kortaste avståndet från en punkt till en bruten linje. */
export function avstandTillBana(p: Pt, bana: Pt[]): number {
  if (bana.length === 0) return Infinity
  if (bana.length === 1) return hyp(p, bana[0])
  let min = Infinity
  for (let i = 0; i < bana.length - 1; i++) {
    const a = bana[i], b = bana[i + 1]
    const dx = b.x - a.x, dy = b.y - a.y
    const l2 = dx * dx + dy * dy
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2))
    const d = Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
    if (d < min) min = d
  }
  return min
}

/** Punkter längs banan med högst `steg` emellan (hörnen behålls). */
export function tatBana(bana: Pt[], steg: number): Pt[] {
  if (bana.length < 2 || !(steg > 0)) return bana.slice()
  const ut: Pt[] = [bana[0]]
  for (let i = 0; i < bana.length - 1; i++) {
    const a = bana[i], b = bana[i + 1]
    const n = Math.max(1, Math.ceil(hyp(a, b) / steg))
    for (let k = 1; k <= n; k++) ut.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n })
  }
  return ut
}

/**
 * Banan `d` åt sidan om `bana` (sida 1 = vänster i gångriktningen, -1 = höger), som en eller flera sammanhängande bitar.
 *
 * Varje punkt flyttas vinkelrätt ut. På insidan av en skarp sväng viker sig en sådan linje över sig själv — de punkterna hamnar närmare
 * förra vägen än `d` och tas bort (då skulle skogen mellan vägarna bli för smal). Där punkter tagits bort bryts banan i bitar; bitar kortare
 * än `d` kastas (de är rester i en sväng, inte en väg att gå). På utsidan av en sväng binds benen ihop med en båge.
 */
export function sidoBana(bana: Pt[], d: number, sida: 1 | -1, steg = d / 12): Pt[][] {
  if (bana.length < 2 || !(d > 0)) return []
  const tat = tatBana(bana, steg)
  const tol = d * 0.02
  const bitar: Pt[][] = []
  let nu: Pt[] = []
  const stang = () => { if (nu.length > 1 && banLangd(nu) >= d) bitar.push(nu); nu = [] }
  for (let i = 0; i < tat.length; i++) {
    const a = tat[Math.max(0, i - 1)], b = tat[Math.min(tat.length - 1, i + 1)]
    const dx = b.x - a.x, dy = b.y - a.y
    const l = Math.hypot(dx, dy)
    if (l === 0) continue
    const p = { x: tat[i].x + (-dy / l) * d * sida, y: tat[i].y + (dx / l) * d * sida }
    if (avstandTillBana(p, bana) < d - tol) { stang(); continue }
    // Utsidan av en sväng: de två benens sidolinjer möts inte — gå runt hörnet i en båge på avståndet d, så skogen blir lika bred där.
    if (nu.length && hyp(nu[nu.length - 1], p) > steg * 2) {
      const f = nu[nu.length - 1]
      // Hörnet är den av de två vägpunkterna som båda sidopunkterna ligger d ifrån.
      const fel = (c: Pt) => Math.abs(hyp(c, f) - d) + Math.abs(hyp(c, p) - d)
      const c = fel(tat[i - 1]) <= fel(tat[i]) ? tat[i - 1] : tat[i]
      const a0 = Math.atan2(f.y - c.y, f.x - c.x)
      let da = Math.atan2(p.y - c.y, p.x - c.x) - a0
      while (da > Math.PI) da -= 2 * Math.PI
      while (da < -Math.PI) da += 2 * Math.PI
      const n = Math.ceil((Math.abs(da) * d) / steg)
      for (let k = 1; k < n; k++) {
        const q = { x: c.x + Math.cos(a0 + (da * k) / n) * d, y: c.y + Math.sin(a0 + (da * k) / n) * d }
        if (avstandTillBana(q, bana) >= d - tol) nu.push(q)
      }
    }
    nu.push(p)
  }
  stang()
  return bitar
}

export function banLangd(bana: Pt[]): number {
  let l = 0
  for (let i = 0; i < bana.length - 1; i++) l += hyp(bana[i], bana[i + 1])
  return l
}

export interface SidaUnderlag {
  /** Är punkten inne i trakten? Saknas (ingen traktgräns) räknas allt som inne. */
  inne?: (p: Pt) => boolean
  /** Övriga vägar som redan finns (inte den man mäter mot). */
  andra?: Pt[][]
}
/**
 * Hur bra en sida är, 0–1: andelen av bandet som ligger inne i trakten och där det inte redan går en väg (närmare än 60 % av avståndet).
 * Inget band alls = 0.
 */
export function sidaPoang(bitar: Pt[][], d: number, u: SidaUnderlag = {}): number {
  const pts = bitar.flat()
  if (pts.length === 0) return 0
  let bra = 0
  for (const p of pts) {
    if (u.inne && !u.inne(p)) continue
    if ((u.andra || []).some((v) => avstandTillBana(p, v) < d * 0.6)) continue
    bra++
  }
  return bra / pts.length
}

export interface Band { sida: 1 | -1; bitar: Pt[][]; poang: number }
/**
 * Bandet bredvid `bana`. `vald` = sidan föraren själv valt; annars väljer appen den sida som ligger inne i trakten och saknar väg.
 * Lika bra åt båda håll → vänster (1), alltid samma, så bandet inte hoppar.
 */
export function byggBand(bana: Pt[], d: number, u: SidaUnderlag = {}, vald: 1 | -1 | null = null): Band | null {
  if (bana.length < 2 || !(d > 0)) return null
  const en = (s: 1 | -1): Band => { const bitar = sidoBana(bana, d, s); return { sida: s, bitar, poang: sidaPoang(bitar, d, u) } }
  if (vald) { const b = en(vald); return b.bitar.length ? b : null }
  const v = en(1), h = en(-1)
  if (!v.bitar.length && !h.bitar.length) return null
  return h.poang > v.poang + 0.05 ? h : v.bitar.length ? v : h
}
