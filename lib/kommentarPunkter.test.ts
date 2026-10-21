import { describe, it, expect } from 'vitest';
import { arNumrerad, kommentarPunkter } from './kommentarPunkter';

describe('kommentarPunkter — varje radbrytning är en punkt', () => {
  it('en rad → en punkt, ingen numrering', () => {
    expect(kommentarPunkter('Lämna kantzon mot sjön')).toEqual(['Lämna kantzon mot sjön']);
    expect(arNumrerad(kommentarPunkter('Lämna kantzon mot sjön'))).toBe(false);
  });
  it('två eller fler rader → numrerade', () => {
    const p = kommentarPunkter('Kör inte i kanten\nLämna tallarna\nHusruin i nordöstra delen');
    expect(p).toEqual(['Kör inte i kanten', 'Lämna tallarna', 'Husruin i nordöstra delen']);
    expect(arNumrerad(p)).toBe(true);
  });
  it('tomma rader och blanksteg ignoreras (också \\r\\n från Vida) — två rader med en tom emellan är två punkter', () => {
    expect(kommentarPunkter('avverkning av frötallar.\r\nLämn kantzon mot sjön. Lämna enstaka utspridda tallar.')).toHaveLength(2);
    expect(kommentarPunkter('  A  \n\n   \n B \r\n')).toEqual(['A', 'B']);
    expect(kommentarPunkter('\n\n')).toEqual([]);
    expect(arNumrerad(kommentarPunkter('A\n\n\nB'))).toBe(true);
  });
  it('appen delar ALDRIG upp en mening själv: punkt, komma och semikolon på en rad ger EN punkt', () => {
    const rad = 'Lämn kantzon mot sjön. Lämna enstaka utspridda tallar; spara 10 per ha, husruin i nordöstra delen.';
    expect(kommentarPunkter(rad)).toEqual([rad]);
  });
  it('null och undefined är inga punkter', () => {
    expect(kommentarPunkter(null)).toEqual([]);
    expect(kommentarPunkter(undefined)).toEqual([]);
  });
});
