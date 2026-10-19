// Vem faktureras flytten? Ett FÖRSLAG ur trakten — aldrig ett värde som lagras av sig självt. Reglerna står här, på ett
// ställe, så sheeten och testerna läser samma sak:
//   * Till-trakten först, annars Från-trakten (ett ställe som är en flyttplats har ingen kund att föreslå).
//   * Bolaget "Privat" betyder att markägaren är kunden → objekt.markagare. Annars är kunden bolaget (objekt.bolag).
//   * Saknas bolaget gissar vi inte: inget förslag (privat eller bolag går inte att avgöra), och då tittar vi på nästa ände.

export interface TraktKund { bolag: string | null | undefined; markagare: string | null | undefined }
export type KundKalla = 'bolag' | 'markagare';
export interface KundForslag { namn: string; kalla: KundKalla }

const rent = (s: string | null | undefined): string => (s ?? '').trim();

/** Förslaget ur EN trakt, eller null när trakten inte säger något säkert. */
export function kundFranTrakt(t: TraktKund | null | undefined): KundForslag | null {
  if (!t) return null;
  const bolag = rent(t.bolag);
  if (!bolag) return null;
  if (bolag.toLocaleLowerCase('sv') === 'privat') {
    const markagare = rent(t.markagare);
    return markagare ? { namn: markagare, kalla: 'markagare' } : null;
  }
  return { namn: bolag, kalla: 'bolag' };
}

/** Till-trakten först; ger den inget förslag tas Från-trakten. */
export function kundForslag(till: TraktKund | null | undefined, fran: TraktKund | null | undefined): KundForslag | null {
  return kundFranTrakt(till) ?? kundFranTrakt(fran);
}

/** Raden under kunden: varifrån namnet kommer. */
export const kundKallaText = (f: KundForslag): string =>
  f.kalla === 'bolag' ? `${f.namn} · från traktens bolag` : `${f.namn} · markägare`;

/** Kravet när flytten faktureras: någon kund måste vara vald. */
export const KUND_KRAV_TEXT = 'Välj kund — den här flytten faktureras';
export const kundKravUppfyllt = (faktureras: boolean, kund: string | null | undefined): boolean => !faktureras || rent(kund) !== '';
