import { describe, expect, it } from 'vitest';
import { traktKortBetydelse, vidaLinjeKort, VIDA_FORKLARING } from './symboler';
import { VIDA, larmRegelText } from './larm/grupper';
import { byggTraktKort } from './traktGeometri';

describe('traktKortBetydelse — vad ett Vida-objekt betyder på kortet', () => {
  it('Vidas Kraftledning: Fara, larmar alltid, meningen ur teckenförklaringens tabell', () => {
    const k = vidaLinjeKort('Kraftledning');
    const b = traktKortBetydelse({ kategori: 'linje', grupp: k.grupp, forklaring: k.forklaring });
    expect(b).toMatchObject({ grupp: 'fara', forklaring: VIDA_FORKLARING.kraftledning, forbjuden: false, ikon: { kalla: 'linje', typ: 'kraftledning' } });
    expect(larmRegelText({ grupp: b.grupp, forbjuden: b.forbjuden })).toBe('Larmar alltid');
  });
  it('Vidas basväg är Info och larmar inte', () => {
    const k = vidaLinjeKort('Basväg');
    const b = traktKortBetydelse({ kategori: 'linje', grupp: k.grupp, forklaring: k.forklaring });
    expect(b.grupp).toBe('info');
    expect(larmRegelText({ grupp: b.grupp })).toBe('Larmar inte');
  });
  it('hänsynsyta, nyckelbiotop och fornlämning kommer ur VIDA — förbjudna att köra in i, alltså "Larmar alltid"', () => {
    for (const [kategori, slag] of [['hansyn', 'hansynsyta'], ['nyckelbiotop', 'nyckelbiotop'], ['lamning', 'raa_yta']] as const) {
      const b = traktKortBetydelse({ kategori });
      expect(b.grupp, kategori).toBe(VIDA[slag].grupp);
      expect(b.forbjuden, kategori).toBe(true);
      expect(b.forklaring, kategori).toBeTruthy();
      expect(larmRegelText({ grupp: b.grupp, forbjuden: b.forbjuden }), kategori).toBe('Larmar alltid');
    }
  });
  it('avlägg är Info, traktdelen har ingen mening — ingen påhittad grupp', () => {
    expect(traktKortBetydelse({ kategori: 'punkt' }).grupp).toBe('info');
    expect(traktKortBetydelse({ kategori: 'traktdel' })).toMatchObject({ grupp: 'info', forklaring: null, forbjuden: false });
    expect(traktKortBetydelse({ kategori: 'okand' }).grupp).toBe('info');
  });
  it('varje kategori som byggTraktKort ger har en betydelse', () => {
    for (const props of [{ _lager: 'L_TRAKTDEL' }, { _lager: 'L_TILLAGGSYTOR' }, { _lager: 'L_TILLAGGSPUNKTER' }, { _lager: 'SV_SKS_NYCKELBIOTOP_101' }, { _lager: 'L_RAA_POLY_101' }]) {
      const kort = byggTraktKort(props);
      expect(() => traktKortBetydelse(kort)).not.toThrow();
    }
  });
});
