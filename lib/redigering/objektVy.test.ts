import { describe, it, expect } from 'vitest';
import { objektLage, metaRad, kallaText, uppgiftRader, saknadeUtanForslag, maskinRader, kortDatum, specialTecken, skotatLage } from './objektVy';

const IDAG = new Date('2026-10-23T12:00:00');
// sv-SE skriver tusental med hårt mellanslag.
const sp = (t: string) => t.replace(/\u00a0|\u202f/g, ' ');

describe('objektLage — var står objektet?', () => {
  it('skotning kvar säger hur mycket som ligger på backen (Husjönäs i skissen)', () => {
    const l = objektLage({ skordat: 678, skotat: 590, skordningAvslutad: '2026-10-14' });
    expect(l).toEqual({ svar: 'Skotning kvar', mening: '88 m³ ligger på backen av 678 skördade.', klart: false });
  });
  it('pågår med båda talen', () => {
    expect(objektLage({ skordat: 1401, skotat: 900 }).svar).toBe('Pågår');
    expect(sp(objektLage({ skordat: 1401, skotat: 900 }).mening)).toBe('1 401 m³ skördat · 900 m³ skotat.');
  });
  it('klart när båda är avslutade, med datumet', () => {
    const l = objektLage({ skordat: 1687, skotat: 1689, skordningAvslutad: '2026-10-10', skotningAvslutad: '2026-10-17' });
    expect(l.svar).toBe('Klart');
    expect(l.klart).toBe(true);
    expect(sp(l.mening)).toMatch(/1 687 m³ skördat, 1 689 m³ skotat\. Klart 17 okt/);
  });
  it('status avslutat räcker', () => {
    expect(objektLage({ skordat: 10, skotat: 10, status: 'avslutat' }).svar).toBe('Klart');
  });
  it('inget från maskinerna: inte påbörjat', () => {
    expect(objektLage({ skordat: 0, skotat: 0, status: 'planerad' })).toMatchObject({ svar: 'Inte påbörjat', mening: 'Inget har kommit från maskinerna än.' });
  });
  it('vi skotar inte (egen skotning) och skördningen är klar: klart', () => {
    expect(objektLage({ skordat: 300, skotat: 0, skordningAvslutad: '2026-09-01', annanSkotar: true }).svar).toBe('Klart');
  });
  it('extern skördning: skotning kvar tills skotningen är klar', () => {
    expect(objektLage({ skordat: 0, skotat: 200, externSkordning: true }).svar).toBe('Skotning kvar');
  });
});

describe('källan under fältet', () => {
  it('trakten först, härlett i ord, och emot när trakten säger annat', () => {
    expect(kallaText('Vida', null, 'trakt')).toBe('från trakten');
    expect(kallaText('Slutavverkning', null, 'härlett: namnet, skördarens fil')).toBe('från namnet, skördarens fil');
    expect(kallaText('Rp', 'Rp', undefined)).toBe('samma som trakten');
    expect(kallaText('Au', 'Rp', 'trakt')).toBe('trakten säger Rp');
    expect(kallaText('Anna', null, null)).toBeNull();
    expect(kallaText('', 'Rp', null)).toBeNull();
  });
});

describe('uppgiftRader', () => {
  it('bara ifyllda fält som gäller; avtalsform med ord; åtgärd bara på gallring', () => {
    const r = uppgiftRader({ huvudtyp: 'Slutavverkning', avtalsform: 'Rp', bolag: 'Vida', atgard: 'Föryngring', vo_nummer: '11124938', auto_ifyllt: { bolag: 'trakt' } }, { avtalsform: 'Rp' });
    expect(r.map(x => x.nyckel)).toEqual(['huvudtyp', 'avtalsform', 'bolag', 'vo_nummer']);
    expect(r.find(x => x.nyckel === 'avtalsform')).toMatchObject({ varde: 'Rotpost (Rp)', kalla: 'samma som trakten', emot: false });
    expect(r.find(x => x.nyckel === 'bolag')!.kalla).toBe('från trakten');
  });
  it('privat: ingen avtalsform', () => {
    const r = uppgiftRader({ huvudtyp: 'Slutavverkning', bolag: 'Privat', avtalsform: 'Au' }, null);
    expect(r.map(x => x.nyckel)).toEqual(['huvudtyp', 'bolag']);
  });
  it('trakten säger emot markägaren', () => {
    const r = uppgiftRader({ skogsagare: 'Anna' }, { markagare: 'Bertil' });
    expect(r[0]).toMatchObject({ kalla: 'trakten säger Bertil', emot: true });
  });
});

describe('saknadeUtanForslag', () => {
  it('namn, åtgärd (gallring), markägare — aldrig inköpare (Martin 2026-10-24)', () => {
    expect(saknadeUtanForslag({ huvudtyp: 'Gallring', bolag: 'Vida' }).map(x => x.nyckel)).toEqual(['object_name', 'atgard', 'skogsagare']);
    expect(saknadeUtanForslag({ object_name: 'X', huvudtyp: 'Slutavverkning', bolag: 'Privat', skogsagare: 'A' })).toEqual([]);
  });
});

describe('maskinRader', () => {
  it('volym bara när maskinen är ensam om sin typ', () => {
    const r = maskinRader([
      { maskinId: 'G', modell: 'Giant', typ: 'skordare', antalFiler: 6, senasteData: '2026-10-14' },
      { maskinId: 'W', modell: 'Wisent', typ: 'skotare', antalFiler: 1, senasteData: null },
      { maskinId: 'E', modell: 'Elefant', typ: 'skotare', antalFiler: 2 },
    ], 678, 590);
    expect(r[0]).toMatchObject({ titel: 'Giant', hoger: '678 m³' });
    expect(r[0].under).toMatch(/^Skördare · 6 filer · t\.o\.m\. 14 okt/);
    expect(r[1]).toMatchObject({ under: 'Skotare · 1 fil', hoger: null });
  });
});

describe('småsaker', () => {
  it('metaRad och kortDatum', () => {
    expect(metaRad({ huvudtyp: 'Slutavverkning', bolag: 'Vida', vo_nummer: '11124938 ' })).toBe('Slutavverkning · Vida · VO 11124938');
    expect(kortDatum('2026-10-14', IDAG)).toBe('14 okt');
    expect(kortDatum('2025-03-02', IDAG)).toBe('2 mar 2025');
  });
  it('specialTecken: VF, storm, vindfälle — aldrig när det redan är special', () => {
    expect(specialTecken({ avtalsform: 'VF/Bark' })).toBe('Avtalsformen är vindfälle.');
    expect(specialTecken({ object_name: 'Stensjömåla VF' })).toMatch(/vindfälle/);
    expect(specialTecken({ object_name: 'Stormfällt Ryd' })).toMatch(/storm/);
    expect(specialTecken({ object_name: 'Stensjömåla VF', special: true })).toBeNull();
    expect(specialTecken({ object_name: 'Mölleryd RP' })).toBeNull();
    expect(specialTecken({ object_name: 'Björsamåla special vid hus mm' })).toBe('Namnet säger special.');
  });
});

describe('skotatLage — skotat ska vara det skördaren avverkat', () => {
  const bas = { skordat: 31.4, skotat: 0, manuell: 0, skordningAvslutad: '2026-10-14' };
  it('förslag när skördningen är klar och lassen säger mindre', () => {
    expect(skotatLage(bas)).toEqual({ typ: 'forslag', skotat: 0, skordat: 31 });
  });
  it('inget medan skördningen pågår, när det stämmer, eller när någon annan skotar', () => {
    expect(skotatLage({ ...bas, skordningAvslutad: null })).toBeNull();
    expect(skotatLage({ ...bas, skotat: 31 })).toBeNull();
    expect(skotatLage({ ...bas, annanSkotar: true })).toBeNull();
    expect(skotatLage({ ...bas, risjobb: true })).toBeNull();
  });
  it('satt för hand visas som det är', () => {
    expect(skotatLage({ ...bas, manuell: 31 })).toEqual({ typ: 'satt', varde: 31 });
  });
});
