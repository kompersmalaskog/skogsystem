// ² och ³ i en PDF — ritade, inte skrivna.
//
// VARFÖR: pdf-lib ritar inte ² och ³ med StandardFonts.Helvetica. Tecknen
// finns i WinAnsi och hamnar i filen (pdftotext läser "m³fub"), men glyfen
// blir ett TOMRUM på papperet — uppmätt 2026-11-25 i en renderad PDF.
// Markägarrapporten har därför skrivit "1 746 m fub" till markägare sedan den
// byggdes, och den delade `sanera` byter dem numera mot vanliga siffror.
//
// "m3fub" är ärligt men ser hemmagjort ut i ett underlag som går till en
// inköpare. Så i stället för att skriva tecknet RITAS det: siffran i mindre
// storlek, lyft över baslinjen. Det är ritarens jobb, inte textens — modellen
// skriver m³fub som vanligt och vet ingenting om det här.

/** Storlek på den upphöjda siffran, som andel av textstorleken. */
export const UPP_SKALA = 0.62;
/** Hur högt över baslinjen den sitter, som andel av textstorleken. */
export const UPP_LYFT = 0.33;

export type Upphojtdel = {
  /** Texten att rita. En upphöjd del är redan en vanlig siffra ('2'/'3'). */
  text: string;
  upp: boolean;
};

/**
 * Delar en sträng i vanliga och upphöjda bitar.
 *
 * Den upphöjda bitens text är redan omskriven till en vanlig siffra, så
 * anroparen kan köra sin vanliga sanering på varje del utan att den slår
 * tillbaka tecknet till '?' eller tappar det.
 */
export function delaUpphojt(s: string): Upphojtdel[] {
  const ut: Upphojtdel[] = [];
  let bit = '';
  for (const t of s) {
    if (t === '²' || t === '³') {
      if (bit) ut.push({ text: bit, upp: false });
      bit = '';
      ut.push({ text: t === '²' ? '2' : '3', upp: true });
    } else {
      bit += t;
    }
  }
  if (bit) ut.push({ text: bit, upp: false });
  return ut;
}

/** true när strängen har något att rita upphöjt. */
export function harUpphojt(s: string): boolean {
  return /[²³]/.test(s);
}

/**
 * Bredden av en sträng SÅ SOM pdf-lib RITAR DEN — summan av glyfbredderna,
 * utan kerning.
 *
 * `font.widthOfTextAtSize` räknar IN kerningparen ur fontens AFM-tabell, men
 * `page.drawText` ritar strängen som ett enda textobjekt UTAN kerning. De två
 * säger alltså inte samma sak, och felet växer med radens längd.
 *
 * Det märks inte på en vanlig rad (den ritas i ett svep), men det förstör varje
 * plats där nästa bit ritas EFTER den förra: en rad med m³fub ritas i tre
 * drawText (text · upphöjd siffra · text), och var och en läggs på den MÄTTA
 * bredden. Uppmätt i Bondeskogs skotningsrapport 2026-11-25: raden
 * "… har mätt körspår, 354 m" mäter 423,567 pt men ritas 426,672 pt bred —
 * 3,105 pt (ett mellanslag) — så trean i "354 m³fub" hamnade mitt i m:et,
 * medan den andra m³fub på samma rad (kortare del, mindre kerning) såg rätt ut.
 *
 * Gäller också högerställd text och radbrytning: mäter man smalare än man
 * ritar hamnar höger kant utanför och en rad kan bli för lång.
 *
 * Regeln: mät som du ritar. Varje PDF-ritare som positionerar text i flera
 * drawText ska använda den här, aldrig `widthOfTextAtSize` på hela strängen.
 */
export function breddUtanKerning(
  font: { widthOfTextAtSize: (s: string, storlek: number) => number },
  text: string,
  storlek: number,
): number {
  let b = 0;
  for (const tecken of text) b += font.widthOfTextAtSize(tecken, storlek);
  return b;
}
