// Tar ut granen ur loggan (public/logo.png) och skriver den som en VIT siluett med genomskinlig bakgrund
// → public/gran-vit.png. Används av väntskärmen (components/maskin/StartSkarmar.tsx): allt grått/vitt på svart.
//
// Loggan har färgad gran (grön/röd/gul/blå) över svart text. Granen skiljs från texten på färgmättnad
// (svart text har ingen) — så "Å"-ringen och bokstäverna intill granens fot följer inte med.
//
// Kör:  node scripts/gran-fran-logga.mjs          (skriver public/gran-vit.png, 168 px hög = 56 px × 3 för retina)
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const rot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOJD_UT = 168;

const { data, info } = await sharp(path.join(rot, 'public/logo.png')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H, channels: C } = info;

// Granens område i loggan (grovt rutnät runt granen; själva urvalet görs på färgmättnad).
const X0 = 700, X1 = 1220, Y0 = 40, Y1 = 600;

const alfa = new Uint8Array(W * H);
let minX = W, maxX = 0, minY = H, maxY = 0;
for (let y = Y0; y < Y1; y++) {
  for (let x = X0; x < X1; x++) {
    const i = (y * W + x) * C;
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3] / 255;
    // Mot VIT/genomskinlig bakgrund: hur långt från vitt (max över kanalerna) = täckning; mättnad = skillnad mellan kanalerna.
    const kroma = Math.max(r, g, b) - Math.min(r, g, b);
    const franVitt = Math.max(255 - r, 255 - g, 255 - b);
    // Färgad pixel (gran) ELLER kantpixel som är en blandning av färg och bakgrund.
    const tackning = a * Math.min(1, franVitt / 190);
    const arGran = kroma >= 20;
    const v = arGran ? Math.round(255 * tackning) : 0;
    alfa[y * W + x] = v;
    if (v > 40) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
}
console.log('granens ram i loggan:', { minX, maxX, minY, maxY, bredd: maxX - minX + 1, hojd: maxY - minY + 1 });

// Vit bild + alfa = täckningen, beskuren till granens ram (2 px marginal).
const M = 2;
const bw = maxX - minX + 1 + 2 * M, bh = maxY - minY + 1 + 2 * M;
const ut = Buffer.alloc(bw * bh * 4, 255);
for (let y = 0; y < bh; y++) {
  for (let x = 0; x < bw; x++) {
    const sx = minX - M + x, sy = minY - M + y;
    ut[(y * bw + x) * 4 + 3] = (sx >= 0 && sy >= 0 && sx < W && sy < H) ? alfa[sy * W + sx] : 0;
  }
}
const png = await sharp(ut, { raw: { width: bw, height: bh, channels: 4 } })
  .resize({ height: HOJD_UT, kernel: 'lanczos3' })
  .png({ compressionLevel: 9 })
  .toBuffer();
await sharp(png).toFile(path.join(rot, 'public/gran-vit.png'));
const m = await sharp(png).metadata();
console.log('skrev public/gran-vit.png', m.width + '×' + m.height, png.length + ' byte');
