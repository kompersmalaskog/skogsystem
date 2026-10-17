import { describe, it, expect } from 'vitest';
import { kundForslag, kundFranTrakt, kundKallaText, kundKravUppfyllt, KUND_KRAV_TEXT } from './kundForslag';

describe('kundFranTrakt — bolaget, eller markägaren när bolaget är Privat', () => {
  it('Vida → Vida (från traktens bolag)', () => {
    expect(kundFranTrakt({ bolag: 'Vida', markagare: 'Åke Svensson' })).toEqual({ namn: 'Vida', kalla: 'bolag' });
  });
  it('Vida Energi är ett eget bolag, inte Vida', () => {
    expect(kundFranTrakt({ bolag: 'Vida Energi', markagare: 'Åke' })).toEqual({ namn: 'Vida Energi', kalla: 'bolag' });
  });
  it('Privat → markägaren', () => {
    expect(kundFranTrakt({ bolag: 'Privat', markagare: 'Lisa Andersson' })).toEqual({ namn: 'Lisa Andersson', kalla: 'markagare' });
    expect(kundFranTrakt({ bolag: ' privat ', markagare: ' Lisa ' })).toEqual({ namn: 'Lisa', kalla: 'markagare' });
  });
  it('Privat utan markägare → inget förslag (ingen gissning)', () => {
    expect(kundFranTrakt({ bolag: 'Privat', markagare: null })).toBeNull();
    expect(kundFranTrakt({ bolag: 'Privat', markagare: '  ' })).toBeNull();
  });
  it('saknat bolag → inget förslag, även om markägare finns (privat eller inte går inte att veta)', () => {
    expect(kundFranTrakt({ bolag: null, markagare: 'Åke' })).toBeNull();
    expect(kundFranTrakt({ bolag: '  ', markagare: 'Åke' })).toBeNull();
    expect(kundFranTrakt({ bolag: undefined, markagare: undefined })).toBeNull();
    expect(kundFranTrakt(null)).toBeNull();
  });
});

describe('kundForslag — Till först, annars Från', () => {
  const vida = { bolag: 'Vida', markagare: 'A' };
  const privat = { bolag: 'Privat', markagare: 'Lisa' };
  const utan = { bolag: null, markagare: 'X' };
  it('Till vinner när den ger ett förslag', () => expect(kundForslag(privat, vida)).toEqual({ namn: 'Lisa', kalla: 'markagare' }));
  it('Till utan förslag → Från', () => expect(kundForslag(utan, vida)).toEqual({ namn: 'Vida', kalla: 'bolag' }));
  it('Till är en flyttplats (null) → Från', () => expect(kundForslag(null, privat)).toEqual({ namn: 'Lisa', kalla: 'markagare' }));
  it('ingen ände ger något → null', () => expect(kundForslag(utan, null)).toBeNull());
});

describe('källtexten och kravet', () => {
  it('"Vida · från traktens bolag" / "<namn> · markägare"', () => {
    expect(kundKallaText({ namn: 'Vida', kalla: 'bolag' })).toBe('Vida · från traktens bolag');
    expect(kundKallaText({ namn: 'Lisa Andersson', kalla: 'markagare' })).toBe('Lisa Andersson · markägare');
  });
  it('kravet gäller bara när flytten faktureras', () => {
    expect(KUND_KRAV_TEXT).toBe('Välj kund — den här flytten faktureras');
    expect(kundKravUppfyllt(true, '')).toBe(false);
    expect(kundKravUppfyllt(true, '  ')).toBe(false);
    expect(kundKravUppfyllt(true, null)).toBe(false);
    expect(kundKravUppfyllt(true, 'Vida')).toBe(true);
    expect(kundKravUppfyllt(false, '')).toBe(true);
  });
});
