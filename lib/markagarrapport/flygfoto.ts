// Flygfotot till markägarrapportens PDF: samma ortofoto som sidans karta (Lantmäteriet via /api/wms-proxy), för
// exakt den ruta PDF:en ritar. Proxyn ger PNG; den görs om till JPEG här (en PNG över en A4-ruta blir flera MB).
import type { HamtaFlygfoto } from './pdf';

const JPEG_KVALITET = 0.82;

export const hamtaFlygfoto: HamtaFlygfoto = async (ruta, bredd, hojd) => {
  const url = `/api/wms-proxy?layer=lm_ortofoto&bbox=${ruta.join(',')}&width=${bredd}&height=${hojd}`;
  const svar = await fetch(url);
  if (!svar.ok) return null;
  const blob = await svar.blob();
  if (!blob.type.startsWith('image/')) return null;
  const bild = await createImageBitmap(blob);
  const c = document.createElement('canvas');
  c.width = bild.width;
  c.height = bild.height;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(bild, 0, 0);
  bild.close?.();
  const jpg = await new Promise<Blob | null>(res => c.toBlob(res, 'image/jpeg', JPEG_KVALITET));
  return jpg ? new Uint8Array(await jpg.arrayBuffer()) : null;
};
