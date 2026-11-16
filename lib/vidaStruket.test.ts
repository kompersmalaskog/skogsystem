import { describe, it, expect } from 'vitest';
import { strykDelar, lasStruket, vaxlaStruken, vidaMedStreck, giltigVidaText, struketText } from './vidaStruket';

// Prod 2026-11-05: Bondeskog AU 2026 — markägaren ska inte ha kvar några tallar utöver evighetsträden.
const BONDESKOG = 'Säljaren behåller lövet.3 m. kolla hur många tallar vi ska lämna.';

describe('strykDelar — delar som går att stryka var för sig', () => {
  it('Bondeskog: tre delar, så att bara tallarna kan strykas', () => {
    expect(strykDelar(BONDESKOG)).toEqual(['Säljaren behåller lövet.', '3 m.', 'kolla hur många tallar vi ska lämna.']);
  });
  it('delar aldrig mellan siffror, i en webbadress eller efter en förkortning', () => {
    expect(strykDelar('Version 1.2 gäller')).toEqual(['Version 1.2 gäller']);
    expect(strykDelar('Se www.vida.se/trakt för mer.')).toEqual(['Se www.vida.se/trakt för mer.']);
    expect(strykDelar('Spara ca. 10 träd per ha, t.ex. ekar.')).toEqual(['Spara ca. 10 träd per ha, t.ex. ekar.']);
  });
  it('en text utan punkt är en del', () => expect(strykDelar('Fornåkrar enligt karta')).toEqual(['Fornåkrar enligt karta']));
});

describe('stryka och ta tillbaka', () => {
  const nu = '2026-11-05T17:50:00Z';
  it('ett tryck stryker, ett till tar tillbaka; matchar oavsett mellanslag och versaler', () => {
    const en = vaxlaStruken([], 'kolla hur många tallar vi ska lämna.', 'Martin', nu);
    expect(en).toEqual([{ del: 'kolla hur många tallar vi ska lämna.', av: 'Martin', at: nu }]);
    expect(vaxlaStruken(en, 'Kolla  hur många tallar vi ska lämna.', 'Martin', nu)).toEqual([]);
  });
  it('det strukna står kvar med sitt streck; det som gäller går till hytten', () => {
    const s = vaxlaStruken([], 'kolla hur många tallar vi ska lämna.', 'Martin', nu);
    const delar = vidaMedStreck(BONDESKOG, s)[0];
    expect(delar.map((d) => !!d.struken)).toEqual([false, false, true]);
    expect(giltigVidaText(BONDESKOG, s)).toBe('Säljaren behåller lövet. 3 m.');
    expect(giltigVidaText(BONDESKOG, [])).toBe(BONDESKOG);
  });
  it('allt struket → ingen text till hytten', () => {
    const s = ['Säljaren behåller lövet.', '3 m.', 'kolla hur många tallar vi ska lämna.'].reduce((a, d) => vaxlaStruken(a, d, null, nu), [] as ReturnType<typeof lasStruket>);
    expect(giltigVidaText(BONDESKOG, s)).toBe('');
  });
  it('Vida ändrar texten → det gamla strecket matchar inget (hellre inget streck än fel streck)', () => {
    const s = vaxlaStruken([], 'kolla hur många tallar vi ska lämna.', 'Martin', nu);
    expect(giltigVidaText('Lämna 20 tallar per ha.', s)).toBe('Lämna 20 tallar per ha.');
  });
  it('lasStruket tål skräp; texten under strecket', () => {
    expect(lasStruket(null)).toEqual([]);
    expect(lasStruket([{ del: 'x', at: nu }, { del: '' }, 'skräp'])).toEqual([{ del: 'x', av: null, at: nu }]);
    expect(struketText({ del: 'x', av: 'Martin', at: nu })).toBe('Struket 5 nov av Martin');
  });
});
