/**
 * Delad markör-ikon-källa för planeringsvy (MapLibre symbol-layer) och
 * Cesium 3D Körvy (BillboardGraphics). Lyfts ut från app/planering/page.tsx
 * så att båda vyer renderar exakt samma SVG-glyphs och severity-färger.
 *
 * Användning:
 *   - MapLibre: loadMarkerImageForMaplibre(typeId) → { width, height, data }
 *     som passas till map.addImage('marker-' + typeId, ...).
 *   - Cesium:   loadMarkerCanvas(typeId) → HTMLCanvasElement som passas
 *     direkt till BillboardGraphics({ image: canvas }).
 *
 * Färgen (bg-cirkel) följer FÄRGGRUPPEN (lib/larm/grupper): Röd = Fara, Grön = Natur, Brun = Kultur, Blå = Blött, Lila = Att göra,
 * Mörk = Info. Orange betyder bara tall. Outline alltid vit för synbarhet mot alla bakgrunder.
 */

import { GLYF, GLYF_LINJE_BREDD, SYMBOL_ALIAS, SYMBOL_TYPER, symbolDef, symbolSvg } from './symboler'
import type { SymbolForm } from './larm/grupper'

export const ICON_SIZE = 64

export interface MarkerIconDef {
  id: string
  bg: string
  outline: string
  /** Formen (rundad triangel för Röd, annars cirkel) — gruppens, lib/larm/grupper. */
  form: SymbolForm
}

/** Alla typer som ritas: färg, form och glyf kommer ur EN källa (lib/symboler + lib/larm/grupper). Gamla typer (Kulturstubbe → Kulturlämning, Dike, Stig, Brant) ritas fortfarande — kartan hämtar bilden `marker-<typ>` per markering, så varje gammal typ måste ha en. */
const IKON_IDN: readonly string[] = [...SYMBOL_TYPER, ...Object.keys(SYMBOL_ALIAS), 'default']   // alias (gamla Kulturstubbe) får en egen bild-id, ritad som sin målsymbol

export const markerIconDefs: MarkerIconDef[] = IKON_IDN.map((id) => { const d = symbolDef(id); return { id, bg: d.farg, outline: '#ffffff', form: d.form } })

/** Glyferna som SVG-element (viewBox 0 0 24 24, vita) för den som ritar en egen bakgrund — härledda ur lib/symboler, aldrig en egen kopia. */
export const iconSvgPaths: Record<string, string> = Object.fromEntries(
  Object.entries(GLYF).map(([id, d]) => [id, `<path d="${d}" stroke="#fff" stroke-width="${GLYF_LINJE_BREDD}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`]),
)

/** Hitta icon-def för en typ (faller till 'default' om okänd). */
export function getIconDef(typeId: string | undefined): MarkerIconDef {
  if (typeId) {
    const found = markerIconDefs.find(d => d.id === typeId)
    if (found) return found
  }
  return markerIconDefs.find(d => d.id === 'default')!
}

/** Bygg SVG-string för en markörtyp: formen (cirkel eller rundad triangel) med vit kant och glyfen. */
export function buildMarkerSvg(typeId: string, size: number = ICON_SIZE): string {
  return symbolSvg(typeId, size)
}

/** Fallback: enbart färgad cirkel (om SVG-laddningen misslyckas). */
function makeFallbackCanvas(typeId: string, size: number): HTMLCanvasElement {
  const def = getIconDef(typeId)
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.beginPath()
    ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2)
    ctx.fillStyle = def.bg
    ctx.fill()
    ctx.strokeStyle = def.outline
    ctx.lineWidth = 3
    ctx.stroke()
  }
  return canvas
}

/**
 * Ladda en markörikon som <canvas>. Resolver canvas vid img.onload eller
 * fallback-cirkel vid SVG-fel. Cesium-vyn använder denna direkt som
 * BillboardGraphics.image.
 */
export function loadMarkerCanvas(typeId: string, size: number = ICON_SIZE): Promise<HTMLCanvasElement> {
  return new Promise((resolve) => {
    const svg = buildMarkerSvg(typeId, size)
    const img = new Image()
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d')
        if (ctx) ctx.drawImage(img, 0, 0, size, size)
        resolve(canvas)
      } catch {
        resolve(makeFallbackCanvas(typeId, size))
      }
    }
    img.onerror = () => resolve(makeFallbackCanvas(typeId, size))
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
  })
}

/** MapLibre-format för addImage: { width, height, data }. */
export interface MapLibreImage {
  width: number
  height: number
  data: Uint8Array
}

/** Konvertera canvas till MapLibre's addImage-format. */
export function canvasToMapLibreImage(canvas: HTMLCanvasElement): MapLibreImage | null {
  const ctx = canvas.getContext('2d')
  if (!ctx || canvas.width === 0 || canvas.height === 0) return null
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  return { width: canvas.width, height: canvas.height, data: new Uint8Array(imageData.data.buffer) }
}

/**
 * Combo-helper för MapLibre: ladda + konvertera i ett anrop.
 * Returnerar null om både SVG-laddning och fallback misslyckas.
 */
export async function loadMarkerImageForMaplibre(typeId: string, size: number = ICON_SIZE): Promise<MapLibreImage | null> {
  const canvas = await loadMarkerCanvas(typeId, size)
  return canvasToMapLibreImage(canvas)
}
