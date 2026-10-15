// Dela månadsfacit: PDF (A4 stående, ljus bakgrund) via pdf-lib — samma väg som veckoläget (veckolageDela.ts), ren JS som fungerar i iOS-PWA:n —
// och PNG av månadssidan (mörk, 390 px i 2×, alltså 780 px bred) via canvas. Båda ritas ur samma modell (manadsfacit.ts) som sidan.
// Delning och nedladdning: delaFil i veckolageDela.ts. Laddas dynamiskt från ManadsfacitVy — pdf-lib ska inte ligga i sidans bundle.
import { FARG, TYP } from '@/lib/design/tokens'
import { MANAD_NAMN } from './format'
import { IKON_SKORDAT, IKON_SKOTAT, IKON_VIEW } from './manadsfacitIkoner'
import type { FacitModell, FacitSparVy } from './manadsfacit'
import { delaFil, type DelaResultat } from './veckolageDela'

export async function delaManadsfacit(m: FacitModell, slag: 'pdf' | 'bild'): Promise<DelaResultat> {
  const blob = slag === 'pdf'
    ? new Blob([(await skapaManadsfacitPdf(m)).slice().buffer as ArrayBuffer], { type: 'application/pdf' })
    : await skapaManadsfacitBild(m)
  return delaFil(blob, `${m.filnamn}.${slag === 'pdf' ? 'pdf' : 'png'}`, `Månadsfacit ${m.manadNamn} ${m.ar}`)
}

/** "2026-10-15" → "15 okt 2026". */
export function datumText(iso: string): string {
  const [ar, manad, dag] = iso.split('-').map(Number)
  return `${dag} ${(MANAD_NAMN[manad - 1] ?? '').slice(0, 3)} ${ar}`
}

// ── PDF ──────────────────────────────────────────────────────────────────────
const A4 = { b: 595.28, h: 841.89 }
const MARG = 48
/** Typsteg i PDF:en: 64 / 17 / 13 / 11. Vikter 700 / 600 / 400 (Helvetica-Bold för 600 och 700, Helvetica för 400). */
const STEG = { stor: 64, text: 17, meta: 13, micro: 11 }

/** Standardfonterna klarar WinAnsi (å ä ö ³ · – …). Hårt mellanslag → mellanslag; övrigt utanför Latin-1 → '?'. */
function san(s: string): string {
  return s.replace(/[\u00a0\u202f]/g, ' ').replace(/[^\u0020-\u00ff\u2013\u2014\u2018\u2019\u201c\u201d\u2026]/g, '?')
}

export async function skapaManadsfacitPdf(m: FacitModell, datum: string = new Date().toISOString().slice(0, 10)): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  doc.setTitle(`Månadsfacit ${m.manadNamn} ${m.ar}`)
  doc.setProducer('Skogsystem')
  const normal = await doc.embedFont(StandardFonts.Helvetica)
  const fet = await doc.embedFont(StandardFonts.HelveticaBold)
  const sida = doc.addPage([A4.b, A4.h])
  const B = A4.b - 2 * MARG
  const hojdSida = A4.h

  // Ljus palett: vit sida, text #111, sekundär #8e8e93, kort #f2f2f7, mätarspår #e5e5ea, fyllning #8e8e93 / #111.
  const c = (r: number, g: number, b: number) => rgb(r / 255, g / 255, b / 255)
  const FARGER = { text: c(17, 17, 17), sek: c(142, 142, 147), kort: c(242, 242, 247), spar: c(229, 229, 234) }

  type Font = typeof normal
  const bredd = (s: string, storlek: number, font: Font) => font.widthOfTextAtSize(san(s), storlek)
  /** y räknas från sidans överkant; text sätts med överkanten av versalerna vid y. */
  const text = (s: string, x: number, y: number, storlek: number, font: Font, farg: ReturnType<typeof rgb>) => {
    sida.drawText(san(s), { x, y: hojdSida - y - storlek * 0.76, size: storlek, font, color: farg })
  }
  const textHoger = (s: string, xHoger: number, y: number, storlek: number, font: Font, farg: ReturnType<typeof rgb>) => {
    text(s, xHoger - bredd(s, storlek, font), y, storlek, font, farg)
  }
  /** Rundad rektangel som SVG-bana (pdf-lib har ingen radie). (x, y) = övre vänstra hörnet, y nedåt. */
  const rundRekt = (x: number, y: number, b: number, h: number, r: number, farg: ReturnType<typeof rgb>) => {
    const k = r * 0.5523
    const d = `M ${r} 0 H ${b - r} C ${b - r + k} 0 ${b} ${r - k} ${b} ${r} V ${h - r} C ${b} ${h - r + k} ${b - r + k} ${h} ${b - r} ${h} H ${r} C ${r - k} ${h} 0 ${h - r + k} 0 ${h - r} V ${r} C 0 ${r - k} ${r - k} 0 ${r} 0 Z`
    sida.drawSvgPath(d, { x, y: hojdSida - y, color: farg })
  }
  /** Material-ikon (viewBox 0 −960 960 960) i storlek `px`, övre vänstra hörnet vid (x, y). */
  const ikon = (d: string, x: number, y: number, px: number, farg: ReturnType<typeof rgb>) => {
    const skala = px / IKON_VIEW
    sida.drawSvgPath(d, { x, y: hojdSida - y - px, scale: skala, color: farg })
  }

  // 1. Avsändare vänster, mottagare + datum höger.
  let y = MARG
  text('Kompersmåla Skog', MARG, y, STEG.meta, fet, FARGER.text)
  textHoger(m.bolagText ? `Till ${m.bolagText} · ${datumText(datum)}` : datumText(datum), MARG + B, y, STEG.meta, normal, FARGER.sek)
  y += STEG.meta + 36

  // 2. Etikett, stort tal, leveransrad.
  text(`${m.rubrik.toUpperCase()} · MOT BESTÄLLNING`, MARG, y, STEG.micro, fet, FARGER.sek)
  y += STEG.micro + 10
  text(m.procentText, MARG, y, STEG.stor, fet, FARGER.text)
  y += STEG.stor + 12
  text(m.levereratText, MARG, y, STEG.text, normal, FARGER.text)
  y += STEG.text + 28

  // 3. Ett kort per spår.
  const PAD = 16
  const IKON_PX = 18
  const RAD_H = STEG.text + 8 + 6 // etikettrad + glapp + mätare
  const KORT_H = PAD + STEG.text + 14 + RAD_H + 14 + RAD_H + 14 + STEG.meta + PAD
  const sparKort = (s: FacitSparVy) => {
    rundRekt(MARG, y, B, KORT_H, 12, FARGER.kort)
    const x0 = MARG + PAD
    const x1 = MARG + B - PAD
    let yy = y + PAD
    // Titel: "Slutavverkning · 5 000" + " till Vida" i sekundär.
    const titel = `${s.namn} · ${s.bestalltText}`
    text(titel, x0, yy, STEG.text, fet, FARGER.text)
    if (s.bolagText) text(` till ${s.bolagText}`, x0 + bredd(titel, STEG.text, fet), yy, STEG.text, normal, FARGER.sek)
    yy += STEG.text + 14
    const rad = (ikonBana: string, etikett: string, tal: string, procentText: string | undefined, andel: number, fyllning: ReturnType<typeof rgb>) => {
      ikon(ikonBana, x0, yy - 1, IKON_PX, FARGER.sek)
      text(etikett, x0 + IKON_PX + 8, yy, STEG.text, normal, FARGER.text)
      if (procentText) {
        textHoger(procentText, x1, yy + 3, STEG.meta, normal, FARGER.sek)
        textHoger(tal, x1 - bredd(` ${procentText}`, STEG.meta, normal), yy, STEG.text, normal, FARGER.text)
      } else {
        textHoger(tal, x1, yy, STEG.text, normal, FARGER.text)
      }
      const my = yy + STEG.text + 8
      rundRekt(x0, my, x1 - x0, 6, 3, FARGER.spar)
      if (andel > 0) rundRekt(x0, my, Math.max(6, (x1 - x0) * andel), 6, 3, fyllning)
      yy += RAD_H + 14
    }
    rad(IKON_SKORDAT, 'Skördat', s.skordatText, undefined, s.skordatAndel, FARGER.sek)
    rad(IKON_SKOTAT, 'Skotat', s.skotatText, s.skotatProcentText, s.skotatAndel, FARGER.text)
    text(s.klartText, x0, yy, STEG.meta, normal, FARGER.sek)
    y += KORT_H + 12
  }
  m.spar.forEach(sparKort)

  // 4. Veckorna: förklaring och två staplar per vecka.
  if (m.veckor.length > 0) {
    const STAPEL_H = 84
    const kortH = PAD + STEG.meta + 12 + STAPEL_H + 6 + STEG.micro + PAD
    rundRekt(MARG, y, B, kortH, 12, FARGER.kort)
    let lx = MARG + PAD
    const ly = y + PAD
    for (const [bana, namn] of [[IKON_SKORDAT, 'Skördat'], [IKON_SKOTAT, 'Skotat']] as const) {
      ikon(bana, lx, ly - 1, IKON_PX - 2, FARGER.sek)
      text(namn, lx + IKON_PX + 2, ly, STEG.meta, normal, FARGER.sek)
      lx += IKON_PX + 2 + bredd(namn, STEG.meta, normal) + 16
    }
    const max = Math.max(...m.veckor.flatMap(v => [v.skordat, v.skotat]), 1)
    const innerB = B - 2 * PAD
    const kolB = innerB / m.veckor.length
    const stapB = Math.min(14, kolB / 2 - 3)
    const botten = ly + STEG.meta + 12 + STAPEL_H
    m.veckor.forEach((v, i) => {
      const mitt = MARG + PAD + kolB * i + kolB / 2
      const stapel = (varde: number, x: number, farg: ReturnType<typeof rgb>) => {
        const h = Math.max(varde > 0 ? 1.5 : 0, (varde / max) * STAPEL_H)
        if (h > 0) rundRekt(x, botten - h, stapB, h, Math.min(2, h / 2), farg)
      }
      stapel(v.skordat, mitt - stapB - 1.5, FARGER.sek)
      stapel(v.skotat, mitt + 1.5, FARGER.text)
      const bw = bredd(v.etikett, STEG.micro, normal)
      text(v.etikett, mitt - bw / 2, botten + 6, STEG.micro, normal, FARGER.sek)
    })
    y += kortH + 12
  }

  // 5. Sidfot nederst, centrerad.
  const fotY = A4.h - MARG - STEG.micro
  if (y > fotY - 8) throw new Error('Månadsfacit-PDF: innehållet ryms inte på en A4-sida')
  text(m.sidfot, (A4.b - bredd(m.sidfot, STEG.micro, normal)) / 2, fotY, STEG.micro, normal, FARGER.sek)
  return doc.save()
}

// ── PNG (månadssidan, mörk, 390 px × 2) ──────────────────────────────────────
const BILD = { bredd: 390, marg: 16, skala: 2 }
/** Typstegens storlekar ur tokens (TYP.x.fontSize är CSS-typad, inte number). */
const px = (t: { fontSize?: unknown }): number => Number(t.fontSize)
const S = { tal: px(TYP.tal), rubrik: px(TYP.rubrik), text: px(TYP.text), listtitel: px(TYP.listtitel), meta: px(TYP.meta) }
const FONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', Inter, system-ui, sans-serif"

export async function skapaManadsfacitBild(m: FacitModell): Promise<Blob> {
  const c = document.createElement('canvas')
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('Canvas saknas')
  const hojd = ritaBild(ctx, m, false)
  c.width = BILD.bredd * BILD.skala
  c.height = Math.ceil(hojd) * BILD.skala
  ctx.scale(BILD.skala, BILD.skala)
  ritaBild(ctx, m, true)
  return new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('Kunde inte skapa PNG'))), 'image/png'))
}

/** Ritar (eller bara mäter när rita=false) och returnerar höjden i CSS-px. Samma mått som sidan. */
export function ritaBild(ctx: CanvasRenderingContext2D, m: FacitModell, rita: boolean): number {
  const B = BILD.bredd, M = BILD.marg, IB = B - 2 * M
  const PAD = 16
  let y = 0
  const font = (px: number, vikt = 400) => { ctx.font = `${vikt} ${px}px ${FONT}` }
  const text = (s: string, x: number, px: number, vikt: number, farg: string, riktning: CanvasTextAlign = 'left') => {
    font(px, vikt)
    if (rita) { ctx.fillStyle = farg; ctx.textBaseline = 'top'; ctx.textAlign = riktning; ctx.fillText(s, x, y); ctx.textAlign = 'left' }
  }
  const mat = (s: string, px: number, vikt: number) => { font(px, vikt); return ctx.measureText(s).width }
  const rekt = (x: number, yy: number, b: number, h: number, r: number, farg: string) => {
    if (!rita) return
    ctx.fillStyle = farg
    ctx.beginPath()
    if (typeof ctx.roundRect === 'function') ctx.roundRect(x, yy, b, h, r)
    else ctx.rect(x, yy, b, h)
    ctx.fill()
  }
  const ikon = (d: string, x: number, yy: number, px: number, farg: string) => {
    if (!rita) return
    ctx.save()
    ctx.translate(x, yy + px)
    ctx.scale(px / IKON_VIEW, px / IKON_VIEW)
    ctx.fillStyle = farg
    ctx.fill(new Path2D(d))
    ctx.restore()
  }

  if (rita) { ctx.fillStyle = FARG.bg; ctx.fillRect(0, 0, B, 10_000) }

  // Sidhuvud: "September 2026" + "mot beställning", centrerat.
  y = 14
  text(m.rubrik, B / 2, S.rubrik, 700, FARG.text, 'center')
  y += S.rubrik + 6
  text('mot beställning', B / 2, S.meta, 400, FARG.text2, 'center')
  y += S.meta + 24

  // Svaret.
  text(m.procentText, M, S.tal, 700, FARG.text)
  y += S.tal + 8
  text(m.levereratText, M, S.text, 400, FARG.text2)
  y += S.text + 24

  const mataren = (x: number, yy: number, b: number, andel: number, farg: string) => {
    rekt(x, yy, b, 6, 3, FARG.fyllning)
    if (andel > 0) rekt(x, yy, Math.max(6, b * andel), 6, 3, farg)
  }
  const sparKort = (s: FacitSparVy) => {
    const rad = S.text + 8 + 6
    const h = PAD + S.listtitel + 16 + rad + 16 + rad + 16 + S.meta + PAD
    rekt(M, y, IB, h, 12, FARG.kort)
    const x0 = M + PAD, x1 = M + IB - PAD
    const y0 = y
    y = y0 + PAD
    const titel = `${s.namn} · ${s.bestalltText}`
    text(titel, x0, S.listtitel, 600, FARG.text)
    if (s.bolagText) text(` till ${s.bolagText}`, x0 + mat(titel, S.listtitel, 600), S.listtitel, 400, FARG.text2)
    y += S.listtitel + 16
    const rader: [string, string, string, string | undefined, number, string][] = [
      [IKON_SKORDAT, 'Skördat', s.skordatText, undefined, s.skordatAndel, FARG.text2],
      [IKON_SKOTAT, 'Skotat', s.skotatText, s.skotatProcentText, s.skotatAndel, FARG.text],
    ]
    for (const [bana, etikett, tal, pct, andel, farg] of rader) {
      ikon(bana, x0, y - 1, 22, FARG.text2)
      text(etikett, x0 + 22 + 8, S.text, 400, FARG.text)
      if (pct) {
        y += S.text - S.meta - 1 // procenten står på samma baslinje som talet
        text(pct, x1, S.meta, 400, FARG.text2, 'right')
        y -= S.text - S.meta - 1
        text(tal, x1 - mat(` ${pct}`, S.meta, 400), S.text, 400, FARG.text, 'right')
      } else {
        text(tal, x1, S.text, 400, FARG.text, 'right')
      }
      mataren(x0, y + S.text + 8, x1 - x0, andel, farg)
      y += rad + 16
    }
    text(s.klartText, x0, S.meta, 400, FARG.text2)
    y = y0 + h + 12
  }
  m.spar.forEach(sparKort)

  if (m.veckor.length > 0) {
    const STAPEL_H = 120
    const h = PAD + S.meta + 12 + STAPEL_H + 6 + S.meta + PAD
    rekt(M, y, IB, h, 12, FARG.kort)
    const y0 = y
    let lx = M + PAD
    y = y0 + PAD
    for (const [bana, namn] of [[IKON_SKORDAT, 'Skördat'], [IKON_SKOTAT, 'Skotat']] as const) {
      ikon(bana, lx, y - 1, 18, FARG.text2)
      text(namn, lx + 22, S.meta, 400, FARG.text2)
      lx += 22 + mat(namn, S.meta, 400) + 16
    }
    const botten = y0 + PAD + S.meta + 12 + STAPEL_H
    const max = Math.max(...m.veckor.flatMap(v => [v.skordat, v.skotat]), 1)
    const kolB = (IB - 2 * PAD) / m.veckor.length
    m.veckor.forEach((v, i) => {
      const mitt = M + PAD + kolB * i + kolB / 2
      const stapel = (varde: number, x: number, farg: string) => {
        const hh = Math.max(varde > 0 ? 1.5 : 0, (varde / max) * STAPEL_H)
        if (hh > 0) rekt(x, botten - hh, 16, hh, 4, farg)
      }
      stapel(v.skordat, mitt - 18, FARG.text2)
      stapel(v.skotat, mitt + 2, FARG.text)
      y = botten + 6
      text(v.etikett, mitt, S.meta, 400, FARG.text2, 'center')
    })
    y = y0 + h + 12
  }

  // Sidfoten bryts bara mellan delarna (" · "), aldrig mitt i en del.
  y += 4
  const delar = m.sidfot.split(' · ')
  const rader: string[] = []
  for (const del of delar) {
    const sist = rader.length - 1
    if (sist >= 0 && mat(`${rader[sist]} · ${del}`, S.meta, 400) <= IB) rader[sist] = `${rader[sist]} · ${del}`
    else rader.push(del)
  }
  for (const r of rader) { text(r, B / 2, S.meta, 400, FARG.text3, 'center'); y += S.meta + 4 }
  y += 20
  return y
}
