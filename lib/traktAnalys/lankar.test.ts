import { describe, it, expect } from 'vitest';
import { traktAnalysLank } from './lankar';

describe('traktAnalysLank', () => {
  it('djuplänk: föreskrifter för vatten och reservat, annars "Visa området"', () => {
    expect(traktAnalysLank('vattenskydd', 'https://x.se/vs/12')).toEqual({ url: 'https://x.se/vs/12', text: 'Föreskrifter' });
    expect(traktAnalysLank('naturreservat', 'https://x.se/nr/3')?.text).toBe('Föreskrifter');
    expect(traktAnalysLank('fornlamning', 'https://raa.se/1')?.text).toBe('Visa området');
  });
  it('utan adress: reservlänk per kontroll, och texten säger att man får leta själv', () => {
    expect(traktAnalysLank('natura2000')?.text).toBe('Sök i Skyddad natur');
    expect(traktAnalysLank('nyckelbiotop')?.text).toBe('Sök hos Skogsstyrelsen');
    expect(traktAnalysLank('biotopskydd', 'https://www.skogsstyrelsen.se/skogensparlor')?.text).toBe('Sök hos Skogsstyrelsen');
  });
  it('fornlämning och Skog & historia utan adress har ingen länk', () => {
    expect(traktAnalysLank('fornlamning')).toBeNull();
    expect(traktAnalysLank('skogochhistoria', '')).toBeNull();
  });
});
