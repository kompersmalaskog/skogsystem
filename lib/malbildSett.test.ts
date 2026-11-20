// @vitest-environment jsdom
// Avläggets målbild vid första lasset per trakt: vilket lass som räknas som det första, och minnet på enheten.
import { beforeEach, describe, expect, it } from 'vitest';
import { arForstaLassetPaTrakten, harSettAvlaggsmalbild, markeraAvlaggsmalbildSett, MALBILD_AVLAGG_SETT_NYCKEL } from './malbildSett';

const l = (id: string, p: Partial<{ objektId: string; maskinId: string; status: 'foreslaget' | 'vantar_forare' | 'bekraftat' | 'struket' }> = {}) => ({ id, objektId: 'o1', maskinId: 'A030353', status: 'bekraftat' as const, ...p });
beforeEach(() => localStorage.clear());

describe('arForstaLassetPaTrakten', () => {
  it('ensamt lass: det är det första', () => expect(arForstaLassetPaTrakten([l('a', { status: 'foreslaget' })], 'a', 'o1', 'A030353')).toBe(true));
  it('ett tidigare lass på samma trakt och maskin: inte det första', () => expect(arForstaLassetPaTrakten([l('a'), l('b', { status: 'foreslaget' })], 'b', 'o1', 'A030353')).toBe(false));
  it('ett tidigare lass som strukits räknas inte', () => expect(arForstaLassetPaTrakten([l('a', { status: 'struket' }), l('b', { status: 'foreslaget' })], 'b', 'o1', 'A030353')).toBe(true));
  it('lass på en annan trakt eller från en annan maskin räknas inte', () => {
    expect(arForstaLassetPaTrakten([l('a', { objektId: 'o2' }), l('b', { status: 'foreslaget' })], 'b', 'o1', 'A030353')).toBe(true);
    expect(arForstaLassetPaTrakten([l('a', { maskinId: 'A110148' }), l('b', { status: 'foreslaget' })], 'b', 'o1', 'A030353')).toBe(true);
  });
  it('ett väntande lass (obesvarat) räknas som ett tidigare lass', () => expect(arForstaLassetPaTrakten([l('a', { status: 'vantar_forare' }), l('b', { status: 'foreslaget' })], 'b', 'o1', 'A030353')).toBe(false));
});

describe('minnet på enheten', () => {
  it('inget sett från början; markera minns per trakt', () => {
    expect(harSettAvlaggsmalbild('o1')).toBe(false);
    markeraAvlaggsmalbildSett('o1');
    expect(harSettAvlaggsmalbild('o1')).toBe(true);
    expect(harSettAvlaggsmalbild('o2')).toBe(false);
    markeraAvlaggsmalbildSett('o1');
    expect(JSON.parse(localStorage.getItem(MALBILD_AVLAGG_SETT_NYCKEL)!)).toEqual(['o1']);
  });
  it('trasigt minne ger "inte sett" och kraschar aldrig', () => {
    localStorage.setItem(MALBILD_AVLAGG_SETT_NYCKEL, '{trasigt');
    expect(harSettAvlaggsmalbild('o1')).toBe(false);
    expect(() => markeraAvlaggsmalbildSett('o1')).not.toThrow();
    localStorage.setItem(MALBILD_AVLAGG_SETT_NYCKEL, JSON.stringify({ inte: 'en lista' }));
    expect(harSettAvlaggsmalbild('o1')).toBe(false);
  });
  it('avstängt minne (setItem kastar): ingen krasch', () => {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new Error('full'); };
    try { expect(() => markeraAvlaggsmalbildSett('o1')).not.toThrow(); } finally { Storage.prototype.setItem = orig; }
  });
});
