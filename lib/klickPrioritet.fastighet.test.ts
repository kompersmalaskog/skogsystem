import { describe, expect, it } from 'vitest';
import { ALLA_KLICK_LAGER, KLICK_LAGER, kategoriForLager, prioritetsRang, valjKlickKategori } from './klickPrioritet';
import { RAGANG_LAGER } from './fastighetsgransKarta';

// Fastighetsgränsen (rågången) har en egen klickkategori: ett tryck på gränsen öppnar "Fastighetsgräns · X mot Y" — men aldrig före larm, ytnummer, symboler och linjer,
// och före ytan (så en rågång som ligger på traktgränsen går att trycka på). Ritar sidan om tryckytan måste lagrets id stå här.
describe('klickprioritet: fastighetsgränsen', () => {
  it('rågångens tryckyta deltar i prioriteringen, i EN kategori', () => {
    expect(kategoriForLager(RAGANG_LAGER.hit)).toBe('fastighet');
    expect(ALLA_KLICK_LAGER.filter((l) => l === RAGANG_LAGER.hit)).toHaveLength(1);
    expect(KLICK_LAGER.filter((k) => k.lager.includes(RAGANG_LAGER.hit))).toHaveLength(1);
  });
  it('ordningen: larm > ytnummer > symbol > linje > FASTIGHETSGRÄNS > yta', () => {
    expect(['larm', 'yta-nr', 'punkt', 'linje', 'fastighet', 'yta'].map((k) => prioritetsRang(k as any))).toEqual([0, 1, 2, 3, 4, 5]);
    const hit = RAGANG_LAGER.hit;
    expect(valjKlickKategori([hit, 'trakt-gr-fill'])).toBe('fastighet');          // en rågång på traktgränsen går att trycka på
    expect(valjKlickKategori([hit, 'zone-fill'])).toBe('fastighet');
    expect(valjKlickKategori([hit, 'line-hitbox'])).toBe('linje');                 // en basväg som korsar rågången vinner
    expect(valjKlickKategori([hit, 'trakt-linje-hit'])).toBe('linje');
    expect(valjKlickKategori([hit, 'markers-hit'])).toBe('punkt');                // en symbol vid gränsen vinner
    expect(valjKlickKategori([hit, 'yta-nr-hit'])).toBe('yta-nr');
    expect(valjKlickKategori([hit, 'larm-pin-hit'])).toBe('larm');
    expect(valjKlickKategori([hit])).toBe('fastighet');
  });
});
