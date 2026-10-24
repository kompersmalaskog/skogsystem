import { describe, it, expect } from 'vitest';
import {
  dimIdsForJobb, forvantat, inknappningsText, kanHaEgenSkotning, kortDatum, lageText, maskinRader, slaIhopMaskiner, voLage, type MaskinSpar,
} from './startaJobbLage';

const giant: MaskinSpar = { maskinId: 'PONS20SDJAA270231', namn: 'Giant', roll: 'skordare', forsta: '2026-10-05T13:29:28' };
const wisent: MaskinSpar = { maskinId: 'A030353', namn: 'Wisent', roll: 'skotare', forsta: '2026-10-06T15:08:41' };

describe('voLage — läget står i text och räknas aldrig ut av läsaren', () => {
  it('avslutat är klart, även med maskindata', () => {
    expect(voLage({ status: 'avslutat', maskiner: [giant] })).toBe('klar');
  });
  it('maskindata gör numret taget, oavsett status', () => {
    expect(voLage({ status: 'planerad', maskiner: [giant] })).toBe('tagen');
    expect(voLage({ status: 'pagaende', maskiner: [wisent] })).toBe('tagen');
  });
  it('startat utan data är ett eget läge (något gick snett vid inknappningen)', () => {
    expect(voLage({ status: 'pagaende', maskiner: [] })).toBe('ingen_data');
    expect(voLage({ status: 'skotning', maskiner: [] })).toBe('ingen_data');
  });
  it('annars ledigt', () => {
    expect(voLage({ status: 'planerad', maskiner: [] })).toBe('ledig');
    expect(voLage({ status: 'oplanerad', maskiner: [] })).toBe('ledig');
    expect(voLage({ status: null, maskiner: [] })).toBe('ledig');
  });
});

describe('lageText', () => {
  it('taget: maskinerna och första dagen', () => {
    expect(lageText('tagen', [wisent, giant], 2026)).toBe('Tagen · Giant + Wisent · sedan 5 okt');
  });
  it('taget utan datum: inget "sedan"', () => {
    expect(lageText('tagen', [{ ...giant, forsta: null }], 2026)).toBe('Tagen · Giant');
  });
  it('de andra lägena', () => {
    expect(lageText('ledig', [], 2026)).toBe('Ledig · inte inknappad i någon maskin');
    expect(lageText('ingen_data', [], 2026)).toBe('Startad — ingen maskin har skickat data');
    expect(lageText('klar', [giant], 2026)).toBe('Klar');
  });
});

describe('vad jobbet väntar sig', () => {
  it('GROT och energiklippning: en maskin', () => {
    expect(forvantat('grot', false)).toBe('en_maskin');
    expect(forvantat('energiklippning', true)).toBe('en_maskin');
    expect(inknappningsText('en_maskin')).toBe('Knappa in numret i maskinen');
  });
  it('egen skotning: bara skördaren', () => {
    expect(forvantat('slutavverkning', true)).toBe('bara_skordare');
    expect(inknappningsText('bara_skordare')).toBe('Knappa in numret i skördaren');
  });
  it('vanligt virkesjobb: båda', () => {
    expect(forvantat('gallring', false)).toBe('skordare_och_skotare');
    expect(forvantat(null, null)).toBe('skordare_och_skotare');
    expect(inknappningsText('skordare_och_skotare')).toBe('Knappa in numret i båda maskinerna');
  });
  it('egen skotning går bara att välja på virkesjobb', () => {
    expect(kanHaEgenSkotning('slutavverkning')).toBe(true);
    expect(kanHaEgenSkotning('gallring')).toBe(true);
    expect(kanHaEgenSkotning('grot')).toBe(false);
    expect(kanHaEgenSkotning('energiklippning')).toBe(false);
  });
});

describe('maskinRader', () => {
  it('saknad skotare sägs', () => {
    const r = maskinRader('skordare_och_skotare', [giant], 2026);
    expect(r.map((x) => x.titel)).toEqual(['Giant', 'Skotare']);
    expect(r[0].under).toBe('Skördare · första data 5 okt');
    expect(r[1]).toEqual({ titel: 'Skotare', under: 'Ingen skotare har skickat data än', saknas: true });
  });
  it('egen skotning: skotaren väntas inte och är inget som saknas', () => {
    const r = maskinRader('bara_skordare', [giant], 2026);
    expect(r[1]).toEqual({ titel: 'Skotare', under: 'Egen skotning — inga filer väntas', saknas: false });
  });
  it('GROT: en rad, eller en saknad', () => {
    expect(maskinRader('en_maskin', [wisent], 2026).map((x) => x.titel)).toEqual(['Wisent']);
    expect(maskinRader('en_maskin', [], 2026)[0].saknas).toBe(true);
  });
  it('ingen skördare än sägs också', () => {
    const r = maskinRader('skordare_och_skotare', [], 2026);
    expect(r.filter((x) => x.saknas).map((x) => x.titel)).toEqual(['Skördare', 'Skotare']);
  });
});

describe('slaIhopMaskiner', () => {
  it('en maskin en gång, tidigaste datumet, skördare först', () => {
    const r = slaIhopMaskiner([wisent, { ...giant, forsta: '2026-10-09' }, giant]);
    expect(r.map((m) => m.namn)).toEqual(['Giant', 'Wisent']);
    expect(r[0].forsta).toBe('2026-10-05T13:29:28');
  });
});

describe('kortDatum', () => {
  it('samma år utan år, annat år med', () => {
    expect(kortDatum('2026-10-23', 2026)).toBe('23 okt');
    expect(kortDatum('2025-03-01T08:00', 2026)).toBe('1 mar 2025');
    expect(kortDatum(null, 2026)).toBeNull();
    expect(kortDatum('trasigt', 2026)).toBeNull();
  });
});

describe('dimIdsForJobb — alla vägar maskindatan når jobbet', () => {
  it('dim_objekt_id och extra nummer (k-nummer blir MASKIN_nyckel)', () => {
    const ids = dimIdsForJobb({ vo: 'P-1024', dimObjektId: 'PONS20SDJAA270231_132', alt: [{ nummer: 'k185', maskin_id: 'A030353' }, { nummer: '11251460', maskin_id: null }] });
    expect(ids).toContain('PONS20SDJAA270231_132');
    expect(ids).toContain('A030353_185');
    expect(ids).toContain('11251460');
  });
  it('P-1023: data via dim_objekt_id fast inget maskinobjekt bär VO:t', () => {
    expect(dimIdsForJobb({ vo: 'P-1023', dimObjektId: '880808', alt: [] })).toEqual(['880808']);
  });
});
