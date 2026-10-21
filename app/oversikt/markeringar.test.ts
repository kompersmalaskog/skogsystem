import { describe, expect, it } from 'vitest';
import { LINJE_NAMN, SYMBOL_NAMN, YTA } from '../../lib/larm/grupper';
import { SUB_LABEL, markeringNamn, prettifySub } from './markeringar';

// Översikten har ingen egen namntabell för det som redan har ett namn: menyn, kartan, larmkortet och Översikten säger samma sak.
describe('Översiktens etiketter = appens namn', () => {
  it('Kulturlämning, inte Kulturminne (och Kulturstubbe heter också Kulturlämning)', () => {
    expect(markeringNamn({ type: 'culturemonument' })).toBe('Kulturlämning');
    expect(markeringNamn({ type: 'culturestump' })).toBe('Kulturlämning');
  });
  it('varje symboltyp ger exakt SYMBOL_NAMN', () => {
    for (const [typ, namn] of Object.entries(SYMBOL_NAMN)) expect(markeringNamn({ type: typ }), typ).toBe(namn);
  });
  it('El-ledning, Evighetsträd och Naturhörna — inte Kraftledning, Eternitträd, Naturhörn', () => {
    expect(markeringNamn({ type: 'powerline' })).toBe('El-ledning');
    expect(markeringNamn({ type: 'eternitytree' })).toBe('Evighetsträd');
    expect(markeringNamn({ type: 'naturecorner' })).toBe('Naturhörna');
  });
  it('varje yta ger YTA[...].namn och wet är Fuktig mark som symbol men Blött som yta', () => {
    for (const [typ, y] of Object.entries(YTA)) expect(markeringNamn({ zoneType: typ }), typ).toBe(y.namn);
    expect(markeringNamn({ type: 'wet' })).toBe('Fuktig mark');
    expect(markeringNamn({ zoneType: 'wet' })).toBe('Blött');
    expect(markeringNamn({ zoneType: 'noentry' })).toBe('Ej framkomlig');
  });
  it('linjer: Stenmur ur LINJE_NAMN, övriga ur den lilla tabellen, okänt prettifieras (aldrig dolt)', () => {
    for (const [typ, namn] of Object.entries(LINJE_NAMN)) expect(markeringNamn({ lineType: typ }), typ).toBe(namn);
    expect(markeringNamn({ lineType: 'mainRoad' })).toBe('Basväg');
    expect(markeringNamn({ lineType: 'nyLinjeTyp' })).toBe(prettifySub('nyLinjeTyp'));
    expect(markeringNamn({ zoneType: 'naturecorner' })).toBe('Naturhörna');   // gammal data med fel slag får ändå appens namn
    expect(markeringNamn(null)).toBe('Markering');
  });
  it('SUB_LABEL har inga gamla namn kvar', () => {
    const alla = Object.values(SUB_LABEL);
    for (const gammalt of ['Kulturminne', 'Eternitträd', 'Naturhörn', 'Kraftledning', 'Blöt mark', 'Kör ej']) expect(alla, gammalt).not.toContain(gammalt);
  });
});
