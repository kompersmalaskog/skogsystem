// Flygfotot bakom kartan "Var gallrades det?" — samma ortofoto som planeringens och markägarrapportens karta
// (Lantmäteriet via /api/wms-proxy, lagret lm_ortofoto), hämtat i rutor om högst 512 px (`delaIRutor`).
// Faller en ruta blir det inget foto alls ('fel'), aldrig ett foto med hål; kartan ritas då utan foto och säger det.
import { delaIRutor } from './markagarrapport/flygfoto';

/** Bildens längsta sida i px. Kartan visas högst ~520 px bred; dubbel upplösning räcker för skarpa skärmar. */
export const FOTO_MAX_PX = 1024;
const SAMTIDIGA = 4;

/** EPSG:4326 → EPSG:3857 (Web Mercator), projektionen Lantmäteriets WMS svarar i. */
export function tillMercator(lng: number, lat: number): [number, number] {
  const x = (lng * 20037508.34) / 180;
  const sin = Math.sin((lat * Math.PI) / 180);
  return [x, ((Math.log((1 + sin) / (1 - sin)) / 2) * 20037508.34) / Math.PI];
}

/** Bildens storlek i px för en karta med `bredd` × `hojd` rutor: längsta sidan FOTO_MAX_PX, samma form som kartan. */
export function fotoStorlek(bredd: number, hojd: number): { b: number; h: number } {
  const s = FOTO_MAX_PX / Math.max(bredd, hojd);
  return { b: Math.max(1, Math.round(bredd * s)), h: Math.max(1, Math.round(hojd * s)) };
}

export type Flygfoto = { bild: HTMLCanvasElement } | 'fel' | 'ejStod';

/**
 * Hämtar flygfotot för kartans ruta ([minLng, minLat, maxLng, maxLat]). 'ejStod' = ingen canvas (jsdom, gamla
 * webbläsare) — då hämtas ingenting och inget fel visas. Kartans egen projektion är lokal meter; över en trakt
 * (några hundra meter) skiljer den sig från Web Mercator med under en promille, så fotot sträcks över hela rutan.
 */
export async function hamtaFlygfoto(lnglat: [number, number, number, number], b: number, h: number): Promise<Flygfoto> {
  const c = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  const ctx = c?.getContext?.('2d');
  if (!c || !ctx || typeof createImageBitmap !== 'function') return 'ejStod';
  c.width = b;
  c.height = h;
  const [minX, minY] = tillMercator(lnglat[0], lnglat[1]);
  const [maxX, maxY] = tillMercator(lnglat[2], lnglat[3]);
  const rutor = delaIRutor([minX, minY, maxX, maxY], b, h);
  let fel = false;
  let nasta = 0;
  const arbetare = async () => {
    while (!fel && nasta < rutor.length) {
      const r = rutor[nasta++];
      try {
        const svar = await fetch(`/api/wms-proxy?layer=lm_ortofoto&bbox=${r.bbox.join(',')}&width=${r.b}&height=${r.h}`);
        const blob = svar.ok ? await svar.blob() : null;
        if (!blob || !blob.type.startsWith('image/')) { fel = true; return; }
        const bild = await createImageBitmap(blob);
        ctx.drawImage(bild, r.x, r.y, r.b, r.h);
        bild.close?.();
      } catch { fel = true; return; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(SAMTIDIGA, rutor.length) }, arbetare));
  return fel ? 'fel' : { bild: c };
}
