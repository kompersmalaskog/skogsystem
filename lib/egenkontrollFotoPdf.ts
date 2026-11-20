// Fotonoteringar i bilagan: linjer, punkter, pilspetsar och etiketter ritade OVANPÅ ett foto (PDF, pdf-lib). Delar modell och
// etikettplacering med skärmens fotoyta (lib/egenkontrollFotoEtikett.ts) — EN planering, så etiketten ligger där man lade den.
//
// Bara "så här blev det" (arMedIRapport): modellen släpper inget annat hit, men ritaren filtrerar också — en skulle-notering ritas aldrig,
// vem som än skickar in den. Etiketten är 3,2 % av fotots uppritade bredd i textstorlek (Martin 2026-10-21) och klämmer sin förskjutning
// mot PDF-rutan (som aldrig är större än skärmens, se egenkontrollFotoEtikett.ts).

import type { PDFFont, PDFPage } from 'pdf-lib';
import { arMedIRapport } from './egenkontrollNotering';
import {
  FOTO_ETIKETT_PAD_EM, FOTO_ETIKETT_PDF_ANDEL, FOTO_ETIKETT_RADHOJD_EM, FOTO_FORM, ledarlinje, pilspets, planeraFotoEtiketter, type FotoNoteringForm,
} from './egenkontrollFotoEtikett';

type PdfLib = typeof import('pdf-lib');

/** En notering på ett foto, som rapportmodellen bär den. Samma form som skärmen planerar med (+ avsikten, som alltid är 'blev'). */
export type FotoNotering = FotoNoteringForm & { avsikt: 'blev' };

const SIDHOJD = 841.89;
const SVART = '#111111';

const hex = (lib: PdfLib, f: string) => lib.rgb(parseInt(f.slice(1, 3), 16) / 255, parseInt(f.slice(3, 5), 16) / 255, parseInt(f.slice(5, 7), 16) / 255);

/**
 * Ritar noteringarna på ett foto som redan är ritat i `ruta` (sidans pt, toppbaserade: x, top, b, h). Returnerar antalet ritade etiketter.
 * `ruta` ÄR bilden (inte layoutens ruta runt den): u, v och förskjutningar är relativa till den.
 */
export function ritaFotoNoteringar(
  lib: PdfLib,
  sida: PDFPage,
  fonter: { normal: PDFFont },
  ruta: { x: number; top: number; b: number; h: number },
  noteringar: FotoNotering[],
  san: (s: string) => string,
): number {
  const lista = noteringar.filter(arMedIRapport);
  if (lista.length === 0 || ruta.b <= 0 || ruta.h <= 0) return 0;
  const bildHojd = ruta.h / ruta.b;
  const k = ruta.b;                       // bildbredder -> pt
  const SVG = { x: 0, y: SIDHOJD } as const;
  const farg = hex(lib, SVART);
  const vit = lib.rgb(1, 1, 1);
  const pt = (x: number, y: number) => ({ x: ruta.x + x * k, y: ruta.top + y * k });
  const delar = (n: FotoNotering) => n.punkter.map(([u, v]) => pt(u, v * bildHojd));

  // Klipp mot bilden: inget ritas utanför fotot.
  sida.pushOperators(lib.pushGraphicsState(), lib.rectangle(ruta.x, SIDHOJD - ruta.top - ruta.h, ruta.b, ruta.h), lib.clip(), lib.endPath());

  // 1. Formerna.
  for (const n of lista) {
    const pts = delar(n);
    if (n.typ === 'punkt' || pts.length < 2) {
      const a = pts[0];
      if (!a) continue;
      const r = FOTO_FORM.punktR * k;
      sida.drawSvgPath(
        `M ${(a.x + r).toFixed(2)} ${a.y.toFixed(2)} A ${r} ${r} 0 1 0 ${(a.x - r).toFixed(2)} ${a.y.toFixed(2)} A ${r} ${r} 0 1 0 ${(a.x + r).toFixed(2)} ${a.y.toFixed(2)} Z`,
        { ...SVG, color: farg, borderColor: vit, borderWidth: FOTO_FORM.punktKant * k },
      );
      continue;
    }
    const bana = pts.map((q, i) => `${i === 0 ? 'M' : 'L'} ${q.x.toFixed(2)} ${q.y.toFixed(2)}`).join(' ');
    sida.drawSvgPath(bana, { ...SVG, borderColor: vit, borderWidth: FOTO_FORM.linjeKant * k, borderOpacity: 0.9 });
    sida.drawSvgPath(bana, { ...SVG, borderColor: farg, borderWidth: FOTO_FORM.linjeBredd * k });
    if (n.pil) {
      const sp = pilspets(pts, FOTO_FORM.pilLang * k, FOTO_FORM.pilBred * k, 0.5);
      if (sp) {
        sida.drawSvgPath(
          `M ${sp[0].x.toFixed(2)} ${sp[0].y.toFixed(2)} L ${sp[1].x.toFixed(2)} ${sp[1].y.toFixed(2)} L ${sp[2].x.toFixed(2)} ${sp[2].y.toFixed(2)} Z`,
          { ...SVG, color: farg, borderColor: vit, borderWidth: FOTO_FORM.punktKant * k },
        );
      }
    }
  }

  // 2. Etiketterna överst — samma planering som skärmen, med PDF:ens egen textandel.
  const plan = planeraFotoEtiketter(lista, bildHojd, FOTO_ETIKETT_PDF_ANDEL);
  const storlek = FOTO_ETIKETT_PDF_ANDEL * k;
  let ritade = 0;
  for (const n of lista) {
    const p = plan.get(n.id);
    if (!p) continue;
    const led = ledarlinje(p.rekt, p.ankare);
    if (led) {
      const a = pt(led[0].x, led[0].y), b = pt(led[1].x, led[1].y);
      const bana = `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} L ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
      sida.drawSvgPath(bana, { ...SVG, borderColor: vit, borderWidth: FOTO_FORM.linjeKant * k * 0.8, borderOpacity: 0.9 });
      sida.drawSvgPath(bana, { ...SVG, borderColor: farg, borderWidth: FOTO_FORM.linjeBredd * k * 0.6 });
    }
    const x0 = ruta.x + p.rekt.x0 * k, y0 = ruta.top + p.rekt.y0 * k, x1 = ruta.x + p.rekt.x1 * k, y1 = ruta.top + p.rekt.y1 * k;
    const r = FOTO_FORM.etikettRundning * storlek;
    const bana = `M ${x0 + r} ${y0} L ${x1 - r} ${y0} Q ${x1} ${y0} ${x1} ${y0 + r} L ${x1} ${y1 - r} Q ${x1} ${y1} ${x1 - r} ${y1} L ${x0 + r} ${y1} Q ${x0} ${y1} ${x0} ${y1 - r} L ${x0} ${y0 + r} Q ${x0} ${y0} ${x0 + r} ${y0} Z`;
    sida.drawSvgPath(bana, { ...SVG, color: farg, borderColor: vit, borderWidth: FOTO_FORM.etikettKant * storlek });
    p.rader.forEach((rad, i) => {
      sida.drawText(san(rad), {
        x: x0 + FOTO_ETIKETT_PAD_EM * storlek,
        y: SIDHOJD - (y0 + FOTO_ETIKETT_PAD_EM * storlek + FOTO_ETIKETT_RADHOJD_EM * storlek * 0.5 + storlek * 0.32 + i * FOTO_ETIKETT_RADHOJD_EM * storlek),
        size: storlek, font: fonter.normal, color: vit,
      });
    });
    ritade += 1;
  }
  sida.pushOperators(lib.popGraphicsState());
  return ritade;
}
