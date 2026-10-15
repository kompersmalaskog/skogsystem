import { describe, expect, it } from 'vitest';
import { aterstallMarkering, borttagenText, BORTTAGEN_MS } from './borttagenKvitto';

describe('borttagenKvitto', () => {
  it('Ångra-raden står i 5 s', () => expect(BORTTAGEN_MS).toBe(5000));
  it('texten säger vad som togs bort', () => {
    expect(borttagenText({ id: 1, isMarker: true })).toBe('Symbol borttagen');
    expect(borttagenText({ id: 2, isLine: true })).toBe('Linje borttagen');
    expect(borttagenText({ id: 3, isZone: true })).toBe('Yta borttagen');
    expect(borttagenText(undefined)).toBe('Symbol borttagen');
  });
  it('Ångra lägger tillbaka markeringen med allt den bar (kommentar, foto)', () => {
    const m: { id: number; comment?: string; photoPath?: string } = { id: 5, comment: 'Knäckt gran', photoPath: 'a/b.jpg' };
    expect(aterstallMarkering<{ id: number; comment?: string; photoPath?: string }>([{ id: 1 }], m)).toEqual([{ id: 1 }, m]);
  });
  it('dubbeltryck på Ångra ger ingen dubblett (tal-id mot text-id)', () => {
    const m = { id: 5 };
    const en = aterstallMarkering([], m);
    expect(aterstallMarkering(en, { id: '5' } as any)).toHaveLength(1);
  });
});
