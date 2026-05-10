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
 * Severity-färg-mappning (bg-cirkel) sker via markerIconDefs:
 *   protect (grön #30d158): eternitytree, naturecorner, culturemonument
 *   danger  (röd #ff453a):  powerline, manualfelling, warning, steep
 *   info    (mörk grå #1c1c1e med vit ikon): allt övrigt
 * Outline alltid vit för synbarhet mot alla bakgrunder.
 */

export const ICON_SIZE = 64

export interface MarkerIconDef {
  id: string
  bg: string
  outline: string
}

export const markerIconDefs: MarkerIconDef[] = [
  // protect (grön)
  { id: 'eternitytree',    bg: '#30d158', outline: '#ffffff' },
  { id: 'naturecorner',    bg: '#30d158', outline: '#ffffff' },
  { id: 'culturemonument', bg: '#30d158', outline: '#ffffff' },
  // danger (röd)
  { id: 'powerline',       bg: '#ff453a', outline: '#ffffff' },
  { id: 'manualfelling',   bg: '#ff453a', outline: '#ffffff' },
  { id: 'warning',         bg: '#ff453a', outline: '#ffffff' },
  { id: 'steep',           bg: '#ff453a', outline: '#ffffff' },
  // info (mörk grå)
  { id: 'culturestump',    bg: '#1c1c1e', outline: '#ffffff' },
  { id: 'highstump',       bg: '#1c1c1e', outline: '#ffffff' },
  { id: 'landing',         bg: '#1c1c1e', outline: '#ffffff' },
  { id: 'brashpile',       bg: '#1c1c1e', outline: '#ffffff' },
  { id: 'windfall',        bg: '#1c1c1e', outline: '#ffffff' },
  { id: 'road',            bg: '#1c1c1e', outline: '#ffffff' },
  { id: 'turningpoint',    bg: '#1c1c1e', outline: '#ffffff' },
  { id: 'ditch',           bg: '#1c1c1e', outline: '#ffffff' },
  { id: 'bridge',          bg: '#1c1c1e', outline: '#ffffff' },
  { id: 'corduroy',        bg: '#1c1c1e', outline: '#ffffff' },
  { id: 'wet',             bg: '#1c1c1e', outline: '#ffffff' },
  { id: 'trail',           bg: '#1c1c1e', outline: '#ffffff' },
  { id: 'default',         bg: '#1c1c1e', outline: '#ffffff' },
]

/** SVG-glyph-paths per markörtyp (viewBox 0 0 24 24, vit stroke/fill). */
export const iconSvgPaths: Record<string, string> = {
  'eternitytree': '<path d="M12 3 Q4 6 4 12 Q4 16 12 16 Q20 16 20 12 Q20 6 12 3Z" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><line x1="12" y1="16" x2="12" y2="22" stroke="#fff" stroke-width="2" stroke-linecap="round"/><path d="M9 22 Q12 20 15 22" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/>',
  'naturecorner': '<circle cx="8" cy="10" r="4" stroke="#fff" stroke-width="2" fill="none"/><circle cx="16" cy="10" r="4" stroke="#fff" stroke-width="2" fill="none"/><circle cx="12" cy="7" r="3" stroke="#fff" stroke-width="2" fill="none"/><path d="M3 20 Q12 16 21 20" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/><line x1="8" y1="14" x2="8" y2="17" stroke="#fff" stroke-width="2" stroke-linecap="round"/><line x1="16" y1="14" x2="16" y2="17" stroke="#fff" stroke-width="2" stroke-linecap="round"/>',
  'culturemonument': '<text x="12" y="17" text-anchor="middle" font-size="16" font-weight="bold" font-family="Arial, sans-serif" fill="#fff">R</text>',
  'culturestump': '<path d="M8 22 L8 14 Q8 11 12 11 Q16 11 16 14 L16 22" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 14 Q10 10 12 12 Q14 10 16 14" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/><text x="12" y="19" text-anchor="middle" font-size="7" font-weight="bold" font-family="Arial, sans-serif" fill="#fff">R</text>',
  'highstump': '<path d="M9 22 L9 8 Q9 5 12 5 Q15 5 15 8 L15 22" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 8 L8 4 L10 6 L12 3 L14 6 L16 4 L15 8" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><line x1="5" y1="22" x2="5" y2="10" stroke="#fff" stroke-width="1.5" stroke-dasharray="3,3" stroke-linecap="round"/><path d="M4 10 L6 10" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/><path d="M4 22 L6 22" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/>',
  'landing': '<ellipse cx="6" cy="18" rx="4" ry="2" stroke="#fff" stroke-width="2" fill="none"/><ellipse cx="14" cy="18" rx="4" ry="2" stroke="#fff" stroke-width="2" fill="none"/><ellipse cx="18" cy="18" rx="4" ry="2" stroke="#fff" stroke-width="2" fill="none"/><ellipse cx="10" cy="13" rx="4" ry="2" stroke="#fff" stroke-width="2" fill="none"/><ellipse cx="14" cy="13" rx="4" ry="2" stroke="#fff" stroke-width="2" fill="none"/><ellipse cx="12" cy="8" rx="4" ry="2" stroke="#fff" stroke-width="2" fill="none"/>',
  'brashpile': '<path d="M4 20 Q4 14 8 12 Q6 10 8 8 Q10 6 12 8 Q14 6 16 8 Q18 10 16 12 Q20 14 20 20 Z" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><line x1="10" y1="10" x2="8" y2="5" stroke="#fff" stroke-width="2" stroke-linecap="round"/><line x1="14" y1="10" x2="16" y2="4" stroke="#fff" stroke-width="2" stroke-linecap="round"/><line x1="12" y1="12" x2="12" y2="6" stroke="#fff" stroke-width="2" stroke-linecap="round"/>',
  'windfall': '<path d="M3 17 L5 14 L4 12 L6 13 L5 10" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><line x1="5" y1="15" x2="21" y2="9" stroke="#fff" stroke-width="3" stroke-linecap="round"/><path d="M9 14 L7 18" stroke="#fff" stroke-width="2" stroke-linecap="round"/><path d="M13 12 L11 17" stroke="#fff" stroke-width="2" stroke-linecap="round"/><path d="M17 10 L15 15" stroke="#fff" stroke-width="2" stroke-linecap="round"/>',
  'manualfelling': '<line x1="5" y1="22" x2="13" y2="9" stroke="#fff" stroke-width="3.5" stroke-linecap="round"/><path d="M11 11 L13 6 Q19 3 18 8 Q20 10 17 12 L13 10 Z" fill="#fff" stroke="#fff" stroke-width="1" stroke-linejoin="round"/>',
  'powerline': '<path d="M13 2 L3 14 L10 14 L10 22 L21 10 L14 10 Z" fill="#fff"/>',
  'road': '<path d="M8 22 L11 2" stroke="#fff" stroke-width="2" stroke-linecap="round"/><path d="M16 22 L13 2" stroke="#fff" stroke-width="2" stroke-linecap="round"/><line x1="12" y1="20" x2="12" y2="15" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/><line x1="12" y1="12" x2="12" y2="7" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/><line x1="12" y1="5" x2="12" y2="2" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>',
  'turningpoint': '<circle cx="12" cy="12" r="7" stroke="#fff" stroke-width="2" fill="none"/><path d="M12 5 A7 7 0 1 1 5 12" stroke="#fff" stroke-width="2.5" fill="none" stroke-linecap="round"/><path d="M5 8 L5 12 L9 12" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  'ditch': '<path d="M2 8 L8 16 L16 16 L22 8" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 14 Q12 12 15 14" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/><line x1="2" y1="8" x2="2" y2="5" stroke="#fff" stroke-width="2" stroke-linecap="round"/><line x1="22" y1="8" x2="22" y2="5" stroke="#fff" stroke-width="2" stroke-linecap="round"/>',
  'bridge': '<path d="M2 17 L6 22 L18 22 L22 17" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 20 Q12 18 16 20" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/><rect x="4" y="11" width="16" height="4" rx="1" fill="#fff"/><line x1="6" y1="15" x2="6" y2="19" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/><line x1="18" y1="15" x2="18" y2="19" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>',
  'corduroy': '<line x1="3" y1="8" x2="21" y2="8" stroke="#fff" stroke-width="3.5" stroke-linecap="round"/><line x1="3" y1="12" x2="21" y2="12" stroke="#fff" stroke-width="3.5" stroke-linecap="round"/><line x1="3" y1="16" x2="21" y2="16" stroke="#fff" stroke-width="3.5" stroke-linecap="round"/><path d="M12 3 L12 5 M10 4 L12 2 L14 4" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 21 L12 19 M10 20 L12 22 L14 20" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
  'wet': '<path d="M12 3 Q7 10 7 14 Q7 19 12 19 Q17 19 17 14 Q17 10 12 3Z" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 22 Q7 19 11 22 Q15 25 19 22" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/>',
  'steep': '<path d="M3 20 L12 5 L21 20 Z" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><line x1="7" y1="16" x2="17" y2="16" stroke="#fff" stroke-width="2" stroke-linecap="round"/><line x1="9" y1="12" x2="15" y2="12" stroke="#fff" stroke-width="2" stroke-linecap="round"/>',
  'trail': '<ellipse cx="6" cy="19" rx="2.2" ry="3.5" fill="#fff"/><ellipse cx="4.5" cy="14.5" rx="0.9" ry="1.1" fill="#fff"/><ellipse cx="5.8" cy="14" rx="0.8" ry="1" fill="#fff"/><ellipse cx="7" cy="14.2" rx="0.7" ry="0.9" fill="#fff"/><ellipse cx="8" cy="14.8" rx="0.6" ry="0.8" fill="#fff"/><ellipse cx="14" cy="12" rx="2.2" ry="3.5" fill="#fff"/><ellipse cx="12.5" cy="7.5" rx="0.9" ry="1.1" fill="#fff"/><ellipse cx="13.8" cy="7" rx="0.8" ry="1" fill="#fff"/><ellipse cx="15" cy="7.2" rx="0.7" ry="0.9" fill="#fff"/><ellipse cx="16" cy="7.8" rx="0.6" ry="0.8" fill="#fff"/><ellipse cx="20" cy="5" rx="1.8" ry="2.8" fill="#fff"/><ellipse cx="18.8" cy="1.8" rx="0.7" ry="0.8" fill="#fff"/><ellipse cx="19.8" cy="1.5" rx="0.6" ry="0.7" fill="#fff"/>',
  'warning': '<path d="M12 3 L22 21 L2 21 Z" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><line x1="12" y1="9" x2="12" y2="14" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/><circle cx="12" cy="17" r="1.2" fill="#fff"/>',
  'default': '<circle cx="12" cy="12" r="4" fill="#fff"/>',
}

/** Hitta icon-def för en typ (faller till 'default' om okänd). */
export function getIconDef(typeId: string | undefined): MarkerIconDef {
  if (typeId) {
    const found = markerIconDefs.find(d => d.id === typeId)
    if (found) return found
  }
  return markerIconDefs.find(d => d.id === 'default')!
}

/** Bygg SVG-string för en markörtyp (cirkel-bakgrund + ikon-glyph). */
export function buildMarkerSvg(typeId: string, size: number = ICON_SIZE): string {
  const def = getIconDef(typeId)
  const svgInner = iconSvgPaths[typeId] ?? iconSvgPaths['default']
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${size/2}" cy="${size/2}" r="${size/2 - 2}" fill="${def.bg}" stroke="${def.outline}" stroke-width="3"/>
    <g transform="translate(${(size - 36) / 2}, ${(size - 36) / 2}) scale(1.5)">${svgInner}</g>
  </svg>`
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
