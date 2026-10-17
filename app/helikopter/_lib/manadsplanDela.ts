// Dela månadsplanen: PDF (A4 stående, ljus bakgrund) via pdf-lib — samma väg som månadsfacit (manadsfacitDela.ts) — och PNG av samma A4-sida
// via canvas. Båda ritas av EN funktion (ritaPlan) mot ett litet Ritare-gränssnitt, så sidan i PDF och bild aldrig kan skilja sig.
// Delning och nedladdning: delaFil i veckolageDela.ts. Laddas dynamiskt från ManadsplanVy — pdf-lib ska inte ligga i sidans bundle.
import { MANAD_NAMN } from './format'
import type { PlanModell } from './manadsplan'
import { delaFil, type DelaResultat } from './veckolageDela'

type Rgb = [number, number, number]
/** y räknas från sidans överkant; text sätts med versalernas överkant vid y. */
interface Ritare {
  text(s: string, x: number, y: number, storlek: number, fet: boolean, farg: Rgb): void
  bredd(s: string, storlek: number, fet: boolean): number
  rekt(x: number, y: number, b: number, h: number, r: number, farg: Rgb): void
}

const A4 = { b: 595.28, h: 841.89 }
const MARG = 48

/** Standardfonterna klarar WinAnsi. Hårt mellanslag → mellanslag; övrigt utanför Latin-1 → '?'. */
function san(s: string): string {
  return s.replace(/[  ]/g, ' ').replace(/[^ -ÿ–—‘’“”…]/g, '?')
}

/** Ljus palett: vit sida, text #111, sekundär #8e8e93, kort #f2f2f7, spår #e5e5ea — som månadsfacit. */
const PAL = {
  text: [17, 17, 17] as Rgb, sek: [142, 142, 147] as Rgb, kort: [242, 242, 247] as Rgb, spar: [229, 229, 234] as Rgb,
  block: [209, 209, 214] as Rgb,
  // Orange på vit sida: tokenens orange är ljus för det mörka gränssnittet; här en mörkare (samma ton) så smal text går att läsa.
  orange: [214, 116, 0] as Rgb,
}
const ton = (t: 'normal' | 'orange' | 'muted'): Rgb => (t === 'orange' ? PAL.orange : t === 'muted' ? PAL.sek : PAL.text)

const STEG = { titel: 28, rubrik: 17, text: 12, meta: 11, micro: 9 }

/** Kapar en text med … så den ryms i `max`. */
function kapa(r: Ritare, s: string, storlek: number, fet: boolean, max: number): string {
  if (r.bredd(s, storlek, fet) <= max) return s
  let t = s
  while (t.length > 1 && r.bredd(`${t}…`, storlek, fet) > max) t = t.slice(0, -1)
  return `${t.trimEnd()}…`
}

/** Bryter en text på mellanslag så varje rad ryms i `max`. */
function bryt(r: Ritare, s: string, storlek: number, fet: boolean, max: number): string[] {
  const ut: string[] = []
  let rad = ''
  for (const ord of s.split(' ')) {
    const prov = rad ? `${rad} ${ord}` : ord
    if (rad && r.bredd(prov, storlek, fet) > max) { ut.push(rad); rad = ord } else rad = prov
  }
  if (rad) ut.push(rad)
  return ut
}

/** Ritar hela sidan; returnerar y där innehållet slutar (före sidfoten). Kastar om det inte ryms. */
export function ritaPlan(r: Ritare, m: PlanModell, helgEllerRod: (iso: string) => boolean): number {
  const B = A4.b - 2 * MARG
  let y = MARG

  // 1. Rubrik och undertitel.
  r.text(m.rubrik, MARG, y, STEG.titel, true, PAL.text)
  y += STEG.titel + 6
  r.text(m.undertitel, MARG, y, STEG.meta, false, PAL.sek)
  y += STEG.meta + 22

  // 2. Svarsrad (samma text som Planering).
  const avv = m.svar.avvikelse
  r.text(avv ? `! ${m.svar.rubrik}` : m.svar.rubrik, MARG, y, STEG.rubrik, true, avv ? PAL.orange : PAL.sek)
  y += STEG.rubrik + 6
  if (m.svar.rad) {
    for (const rad of bryt(r, m.svar.rad, STEG.text, false, B)) { r.text(rad, MARG, y, STEG.text, false, PAL.sek); y += STEG.text + 3 }
  }
  y += 18

  // 3. MOT BESTÄLLNING — två kolumner (slutavverkning | gallring).
  r.text('MOT BESTÄLLNING', MARG, y, STEG.micro, true, PAL.sek)
  y += STEG.micro + 8
  const GAP = 16
  const kolB = (B - GAP) / 2
  const PAD = 12
  const kolHojd = (s: PlanModell['spar'][number]) => PAD + STEG.text + 4 + STEG.text + (s.andel != null ? 10 : 0) + 8 + s.trakter.reduce((h, t) => h + STEG.meta + 3 + (t.saknarPrognos ? STEG.micro + 3 : 0), 0) + (s.saknasText ? STEG.meta + 3 : 0) + PAD
  const hojd = Math.max(...m.spar.map(kolHojd), 0)
  m.spar.forEach((s, i) => {
    const x0 = MARG + i * (kolB + GAP)
    r.rekt(x0, y, kolB, hojd, 12, PAL.kort)
    const xa = x0 + PAD, xb = x0 + kolB - PAD
    let yy = y + PAD
    r.text(s.namn, xa, yy, STEG.text, true, PAL.text)
    yy += STEG.text + 4
    r.text(s.summaText, xa, yy, STEG.text, false, s.orange ? PAL.orange : PAL.text)
    yy += STEG.text
    if (s.andel != null) {
      yy += 4
      r.rekt(xa, yy, xb - xa, 6, 3, PAL.spar)
      if (s.andel > 0) r.rekt(xa, yy, Math.max(6, (xb - xa) * s.andel), 6, 3, s.orange ? PAL.orange : PAL.sek)
      yy += 6
    }
    yy += 8
    for (const t of s.trakter) {
      const vol = t.volymText
      const vb = r.bredd(vol, STEG.meta, false)
      r.text(kapa(r, t.namn, STEG.meta, false, xb - xa - vb - 6), xa, yy, STEG.meta, false, PAL.text)
      r.text(vol, xb - vb, yy, STEG.meta, false, PAL.sek)
      yy += STEG.meta + 3
      if (t.saknarPrognos) { r.text('saknar prognos', xa, yy, STEG.micro, false, PAL.orange); yy += STEG.micro + 3 }
    }
    if (s.saknasText) r.text(s.saknasText, xa, yy, STEG.meta, false, PAL.orange)
  })
  y += hojd + 22

  // 4. MASKINER — dagarna i kolumner, trakterna som block, klar-datum till höger.
  r.text('MASKINER', MARG, y, STEG.micro, true, PAL.sek)
  y += STEG.micro + 8
  const NAMN = 78, KLAR = 52
  const rutB = B - NAMN - KLAR
  const dagB = rutB / Math.max(m.dagar.length, 1)
  const dagTal = Math.min(7, Math.max(5, dagB * 0.62))
  const RAD_H = 24
  const huvH = 20
  r.rekt(MARG, y, B, huvH + RAD_H * m.maskiner.length, 8, PAL.kort)
  m.dagar.forEach((iso, i) => {
    const x = MARG + NAMN + i * dagB
    const helg = helgEllerRod(iso)
    if (helg) r.rekt(x, y + huvH, dagB, RAD_H * m.maskiner.length, 0, PAL.spar)
    const dag = String(Number(iso.slice(8)))
    const b = r.bredd(dag, dagTal, iso === m.idagIso)
    r.text(dag, x + (dagB - b) / 2, y + 6, dagTal, iso === m.idagIso, helg ? PAL.orange : PAL.sek)
    if (iso.slice(8) === '01') {
      const mn = (MANAD_NAMN[Number(iso.slice(5, 7)) - 1] ?? '').slice(0, 3)
      r.text(mn, x, y + 6 - dagTal - 2, dagTal, false, PAL.sek)
    }
  })
  m.maskiner.forEach((mk, ri) => {
    const ry = y + huvH + ri * RAD_H
    r.text(kapa(r, mk.namn, STEG.meta, true, NAMN - 12), MARG + 8, ry + (RAD_H - STEG.meta * 0.76) / 2 - 1, STEG.meta, true, PAL.text)
    for (const s of mk.segment) {
      const a = m.dagar.findIndex(d => d >= s.fran)
      const e = m.dagar.filter(d => d <= s.till).length - 1
      if (a === -1 || e < a) continue
      const bx = MARG + NAMN + a * dagB + 1
      const bb = (e - a + 1) * dagB - 2
      r.rekt(bx, ry + 4, bb, RAD_H - 8, 3, s.ton === 'orange' ? PAL.orange : PAL.block)
      if (s.text) r.text(kapa(r, s.text, 7.5, false, bb - 4), bx + 3, ry + (RAD_H - 7.5 * 0.76) / 2 - 1, 7.5, false, PAL.text)
    }
    const kt = mk.klar.text
    const kb = r.bredd(kt, STEG.meta, mk.klar.ton === 'orange')
    r.text(kt, MARG + B - 8 - kb, ry + (RAD_H - STEG.meta * 0.76) / 2 - 1, STEG.meta, mk.klar.ton === 'orange', ton(mk.klar.ton))
  })
  // Dagens kolumn: en tunn ram.
  const idagIdx = m.dagar.indexOf(m.idagIso)
  if (idagIdx >= 0) {
    const x = MARG + NAMN + idagIdx * dagB
    r.rekt(x, y + huvH, 0.8, RAD_H * m.maskiner.length, 0, PAL.text)
    r.rekt(x + dagB - 0.8, y + huvH, 0.8, RAD_H * m.maskiner.length, 0, PAL.text)
  }
  y += huvH + RAD_H * m.maskiner.length + 22

  // 5. ATT GÖRA.
  if (m.attGora.length > 0) {
    r.text('ATT GÖRA', MARG, y, STEG.micro, true, PAL.sek)
    y += STEG.micro + 8
    for (const rad of m.attGora) {
      for (const del of bryt(r, rad, STEG.text, false, B)) { r.text(del, MARG, y, STEG.text, false, PAL.text); y += STEG.text + 3 }
      y += 5
    }
  }
  return y
}

/** Sidfoten, centrerad längst ner (bryts bara mellan delarna). */
function ritaSidfot(r: Ritare, m: PlanModell, ytterY: number): void {
  const delar = m.sidfot.split(' · ')
  const rader: string[] = []
  for (const del of delar) {
    const sist = rader.length - 1
    if (sist >= 0 && r.bredd(`${rader[sist]} · ${del}`, STEG.micro, false) <= A4.b - 2 * MARG) rader[sist] = `${rader[sist]} · ${del}`
    else rader.push(del)
  }
  let yy = A4.h - MARG - rader.length * (STEG.micro + 3)
  if (ytterY > yy - 8) throw new Error('Månadsplan: innehållet ryms inte på en A4-sida')
  for (const rad of rader) { r.text(rad, (A4.b - r.bredd(rad, STEG.micro, false)) / 2, yy, STEG.micro, false, PAL.sek); yy += STEG.micro + 3 }
}

export async function delaManadsplan(m: PlanModell, helgEllerRod: (iso: string) => boolean, slag: 'pdf' | 'bild'): Promise<DelaResultat> {
  const blob = slag === 'pdf'
    ? new Blob([(await skapaManadsplanPdf(m, helgEllerRod)).slice().buffer as ArrayBuffer], { type: 'application/pdf' })
    : await skapaManadsplanBild(m, helgEllerRod)
  return delaFil(blob, `${m.filnamn}.${slag === 'pdf' ? 'pdf' : 'png'}`, `Månadsplan ${m.rubrik}`)
}

// ── PDF ──────────────────────────────────────────────────────────────────────
export async function skapaManadsplanPdf(m: PlanModell, helgEllerRod: (iso: string) => boolean): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  doc.setTitle(`Månadsplan ${m.rubrik}`)
  doc.setProducer('Skogsystem')
  const normal = await doc.embedFont(StandardFonts.Helvetica)
  const fet = await doc.embedFont(StandardFonts.HelveticaBold)
  const sida = doc.addPage([A4.b, A4.h])
  const c = (f: Rgb) => rgb(f[0] / 255, f[1] / 255, f[2] / 255)
  const r: Ritare = {
    bredd: (s, storlek, f) => (f ? fet : normal).widthOfTextAtSize(san(s), storlek),
    text: (s, x, y, storlek, f, farg) => { sida.drawText(san(s), { x, y: A4.h - y - storlek * 0.76, size: storlek, font: f ? fet : normal, color: c(farg) }) },
    rekt: (x, y, b, h, rad, farg) => {
      if (rad <= 0) { sida.drawRectangle({ x, y: A4.h - y - h, width: b, height: h, color: c(farg) }); return }
      const rr = Math.min(rad, b / 2, h / 2)
      const k = rr * 0.5523
      const d = `M ${rr} 0 H ${b - rr} C ${b - rr + k} 0 ${b} ${rr - k} ${b} ${rr} V ${h - rr} C ${b} ${h - rr + k} ${b - rr + k} ${h} ${b - rr} ${h} H ${rr} C ${rr - k} ${h} 0 ${h - rr + k} 0 ${h - rr} V ${rr} C 0 ${rr - k} ${rr - k} 0 ${rr} 0 Z`
      sida.drawSvgPath(d, { x, y: A4.h - y, color: c(farg) })
    },
  }
  const slut = ritaPlan(r, m, helgEllerRod)
  ritaSidfot(r, m, slut)
  return doc.save()
}

// ── PNG (samma A4-sida, 2×) ──────────────────────────────────────────────────
const FONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', Helvetica, Arial, system-ui, sans-serif"
const SKALA = 2

export async function skapaManadsplanBild(m: PlanModell, helgEllerRod: (iso: string) => boolean): Promise<Blob> {
  const cv = document.createElement('canvas')
  cv.width = Math.round(A4.b * SKALA)
  cv.height = Math.round(A4.h * SKALA)
  const ctx = cv.getContext('2d')
  if (!ctx) throw new Error('Canvas saknas')
  ctx.scale(SKALA, SKALA)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, A4.b, A4.h)
  const css = (f: Rgb) => `rgb(${f[0]}, ${f[1]}, ${f[2]})`
  const font = (storlek: number, f: boolean) => { ctx.font = `${f ? 700 : 400} ${storlek}px ${FONT}` }
  const r: Ritare = {
    bredd: (s, storlek, f) => { font(storlek, f); return ctx.measureText(s).width },
    text: (s, x, y, storlek, f, farg) => { font(storlek, f); ctx.fillStyle = css(farg); ctx.textBaseline = 'alphabetic'; ctx.fillText(s, x, y + storlek * 0.76) },
    rekt: (x, y, b, h, rad, farg) => {
      ctx.fillStyle = css(farg)
      ctx.beginPath()
      if (rad > 0 && typeof ctx.roundRect === 'function') ctx.roundRect(x, y, b, h, Math.min(rad, b / 2, h / 2))
      else ctx.rect(x, y, b, h)
      ctx.fill()
    },
  }
  const slut = ritaPlan(r, m, helgEllerRod)
  ritaSidfot(r, m, slut)
  return new Promise((res, rej) => cv.toBlob(b => (b ? res(b) : rej(new Error('Kunde inte skapa PNG'))), 'image/png'))
}
