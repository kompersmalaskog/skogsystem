// ² och ³ i en PDF.
//
// Uppmätt 2026-11-25 i en renderad PDF: pdf-lib ritar INTE tecknen med
// StandardFonts.Helvetica — de hamnar i filen men glyfen blir ett tomrum på
// papperet ("1 746 m fub"). Ritaren delar därför texten och ritar siffran
// mindre och lyft. Testerna vaktar kontraktet den delningen vilar på.
import { describe, it, expect } from 'vitest';
import { breddUtanKerning, delaUpphojt, harUpphojt, UPP_LYFT, UPP_SKALA } from './upphojtPdf';

describe('delningen', () => {
  it('m³fub blir tre delar, och trean är märkt upphöjd', () => {
    expect(delaUpphojt('m³fub')).toEqual([
      { text: 'm', upp: false },
      { text: '3', upp: true },
      { text: 'fub', upp: false },
    ]);
  });

  it('TECKNET LÄMNAS ALDRIG KVAR — det ritas inte av Helvetica', () => {
    // Går tecknet vidare till drawText blir det ett tomrum på papperet, och
    // en inköpare läser "1 746 m fub". Ingen del får innehålla ² eller ³.
    for (const s of ['m³fub', 'm² och m³', '³', 'kr/m³fub']) {
      for (const d of delaUpphojt(s)) expect(d.text).not.toMatch(/[²³]/);
    }
  });

  it('² blir en tvåa, ³ en trea', () => {
    expect(delaUpphojt('m²').map(d => d.text).join('')).toBe('m2');
    expect(delaUpphojt('m³').map(d => d.text).join('')).toBe('m3');
  });

  it('text utan upphöjt är EN del — ingen onödig uppdelning', () => {
    expect(delaUpphojt('414 m')).toEqual([{ text: '414 m', upp: false }]);
    expect(delaUpphojt('')).toEqual([]);
  });

  it('flera upphöjda i samma sträng delas var för sig', () => {
    expect(delaUpphojt('m² · m³').filter(d => d.upp).map(d => d.text)).toEqual(['2', '3']);
  });

  it('tecknet först eller sist ger inga tomma delar', () => {
    expect(delaUpphojt('³fub')).toEqual([{ text: '3', upp: true }, { text: 'fub', upp: false }]);
    expect(delaUpphojt('m³')).toEqual([{ text: 'm', upp: false }, { text: '3', upp: true }]);
  });

  it('harUpphojt känner igen båda tecknen och inget annat', () => {
    expect(harUpphojt('1 746 m³fub')).toBe(true);
    expect(harUpphojt('7,28 m²')).toBe(true);
    expect(harUpphojt('414 m')).toBe(false);
    expect(harUpphojt('m3fub')).toBe(false);
  });
});

describe('måtten', () => {
  it('siffran är mindre än texten och lyft över baslinjen', () => {
    // Utan båda ser "m3fub" ut som ett skrivfel i stället för en enhet.
    expect(UPP_SKALA).toBeGreaterThan(0.4);
    expect(UPP_SKALA).toBeLessThan(0.8);
    expect(UPP_LYFT).toBeGreaterThan(0.15);
    expect(UPP_LYFT).toBeLessThan(0.5);
  });
});

describe('breddUtanKerning — mät som du ritar', () => {
  it('pdf-lib MÄTER med kerning men RITAR utan: skillnaden är verklig', async () => {
    const { PDFDocument, StandardFonts } = await import('pdf-lib');
    const f = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica);

    // "Va" har ett kerningpar i Helvetica: mätningen drar ihop, ritningen inte.
    const mattMedKerning = f.widthOfTextAtSize('Va', 9);
    const ritad = breddUtanKerning(f, 'Va', 9);
    expect(ritad).toBeGreaterThan(mattMedKerning);

    // Raden ur Bondeskogs skotningsrapport 2026-11-25. Felet var 3,105 pt —
    // ett helt mellanslag — och trean i "354 m³fub" hamnade mitt i m:et.
    const rad = 'Varje lass är mätt med GPS i skotarhytten. Snittet är viktat på '
      + 'volym: 21 av 28 lass har mätt körspår, 354 m';
    expect(breddUtanKerning(f, rad, 9) - f.widthOfTextAtSize(rad, 9)).toBeCloseTo(3.105, 2);
  });

  it('en sträng utan kerningpar mäts lika på båda sätten', async () => {
    const { PDFDocument, StandardFonts } = await import('pdf-lib');
    const f = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica);
    for (const s of ['354', '579 m', '']) {
      expect(breddUtanKerning(f, s, 9)).toBeCloseTo(f.widthOfTextAtSize(s, 9), 6);
    }
  });

  it('bredden växer med storleken och är noll för tom text', async () => {
    const { PDFDocument, StandardFonts } = await import('pdf-lib');
    const f = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica);
    expect(breddUtanKerning(f, '', 9)).toBe(0);
    expect(breddUtanKerning(f, 'm³fub', 18)).toBeCloseTo(breddUtanKerning(f, 'm³fub', 9) * 2, 6);
  });
});
