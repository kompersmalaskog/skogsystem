// Flygfotot till markägarrapportens PDF: samma ortofoto som sidans karta (Lantmäteriet via /api/wms-proxy), för
// exakt den ruta PDF:en ritar. Proxyn ger PNG; bilden görs om till JPEG här (en PNG över en A4-ruta blir flera MB).
//
// Hämtas i RUTOR om högst 512 px: hela kartan i en bild är ~1000 × 1300 px, och ett ortofoto i PNG den storleken kan
// bli större än vad en serverfunktion får svara med (Vercel ~4,5 MB) eller ta längre än proxyns 11 s. Rutorna är lika
// stora som kartans egna, ritas ihop på en canvas och blir EN JPEG. Faller en ruta blir det inget foto alls (null) —
// aldrig ett foto med hål; PDF:en ritar då prickarna och säger att fotot saknas.
import type { HamtaFlygfoto } from './pdf';

const JPEG_KVALITET = 0.82;
export const RUTA_MAX_PX = 512;
const SAMTIDIGA = 4;

/** Delar en bild på bredd × hojd px i rutor om högst RUTA_MAX_PX, med var rutas bbox (EPSG:3857). */
export function delaIRutor(ruta: [number, number, number, number], bredd: number, hojd: number) {
  const [minX, minY, maxX, maxY] = ruta;
  const nx = Math.ceil(bredd / RUTA_MAX_PX);
  const ny = Math.ceil(hojd / RUTA_MAX_PX);
  const ut: { x: number; y: number; b: number; h: number; bbox: [number, number, number, number] }[] = [];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const x = Math.round((i * bredd) / nx), x2 = Math.round(((i + 1) * bredd) / nx);
      const y = Math.round((j * hojd) / ny), y2 = Math.round(((j + 1) * hojd) / ny);
      // Bildens y växer nedåt, kartans norrut: rad 0 är norra kanten.
      ut.push({
        x, y, b: x2 - x, h: y2 - y,
        bbox: [
          minX + ((maxX - minX) * x) / bredd, maxY - ((maxY - minY) * y2) / hojd,
          minX + ((maxX - minX) * x2) / bredd, maxY - ((maxY - minY) * y) / hojd,
        ],
      });
    }
  }
  return ut;
}

export const hamtaFlygfoto: HamtaFlygfoto = async (ruta, bredd, hojd) => {
  const c = document.createElement('canvas');
  c.width = bredd;
  c.height = hojd;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  const rutor = delaIRutor(ruta, bredd, hojd);
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
  if (fel) return null;
  const jpg = await new Promise<Blob | null>(res => c.toBlob(res, 'image/jpeg', JPEG_KVALITET));
  return jpg ? new Uint8Array(await jpg.arrayBuffer()) : null;
};
