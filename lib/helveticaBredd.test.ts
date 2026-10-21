// Tabellen mot pdf-libs egen Helvetica: ett tecken i taget ska stämma exakt, och en summa av tecken (utan kerning) får aldrig vara SMALARE än
// pdf-libs mått för hela texten — då är en ruta som räknas ur tabellen alltid minst lika bred som texten i PDF:en.

import { describe, expect, it } from 'vitest';
import { HELVETICA_BREDD, helveticaBreddEm } from './helveticaBredd';

async function pdfFont() {
  const lib = await import('pdf-lib');
  const doc = await lib.PDFDocument.create();
  return doc.embedFont(lib.StandardFonts.Helvetica);
}

describe('helveticaBredd', () => {
  it('varje tecken i tabellen stämmer med pdf-lib', async () => {
    const f = await pdfFont();
    for (const [t, w] of Object.entries(HELVETICA_BREDD)) {
      expect(Math.round(f.widthOfTextAtSize(t, 1000)), `tecknet ${JSON.stringify(t)}`).toBe(w);
    }
  });

  it('täcker hela svenska alfabetet, siffror och tankstreck', () => {
    for (const t of 'abcdefghijklmnopqrstuvwxyzåäöABCDEFGHIJKLMNOPQRSTUVWXYZÅÄÖ0123456789 .,:;!?-–—…()/%') {
      expect(HELVETICA_BREDD[t], `tecknet ${t}`).toBeGreaterThan(0);
    }
  });

  it('en text mäts aldrig smalare än pdf-lib mäter den (kerning kan bara göra den smalare)', async () => {
    const f = await pdfFont();
    for (const s of ['Kulturlämning', 'AVATAR Tyvärr', 'Basvägen skulle gått här.', 'Överfart stenmur — 12 m', 'To WAVE Yo', 'Fornlämning (RAÄ 14:1)']) {
      expect(helveticaBreddEm(s)).toBeGreaterThanOrEqual(f.widthOfTextAtSize(s, 1) - 1e-9);
    }
  });

  it('okänt tecken räknas som 1 em, hellre för brett än för smalt', () => {
    expect(helveticaBreddEm('😀')).toBe(1);
  });
});
