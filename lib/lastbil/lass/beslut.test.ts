import { describe, expect, it } from 'vitest';
import { beslutaLass, kundForLass, flyttTypFor } from './beslut';
import type { DetektLass } from './detektera';
import type { MaskinBedomning } from './maskin';
import type { FunnenPlats } from './plats';

const lass = (o: Partial<DetektLass> = {}): DetektLass => ({
  forstaLastadTid: '2026-10-12T10:20:00Z', sistaLastadTid: '2026-10-12T11:00:00Z', lassningFran: '2026-10-12T10:00:00Z',
  lassningTid: '2026-10-12T10:20:00Z', lossningTid: '2026-10-12T11:30:00Z', lossningTill: '2026-10-12T11:40:00Z',
  lassning: { tidpunkt: '2026-10-12T10:20:00Z', lat: 56.3, lng: 14.9, odometer_m: 1_000_000, saker: true, kalla: 'lastad' },
  lossning: { tidpunkt: '2026-10-12T11:30:00Z', lat: 56.4, lng: 15.0, odometer_m: 1_045_700, saker: true, kalla: 'lastad' },
  tomKg: 24_000, lastadKg: 54_000, lastviktKg: 30_000, km: 45.7, punkter: [], antalPunkter: 3, sammanslagen: false, klar: true, avvisad: null, ...o,
});
const objekt = (o: Partial<FunnenPlats['kandidat']> = {}, avstandM = 300): FunnenPlats => ({
  typ: 'objekt', id: 'o1', namn: 'Bågskyttebanan RP', avstandM,
  kandidat: { typ: 'objekt', id: 'o1', namn: 'Bågskyttebanan RP', lat: 56.4, lng: 15.0, bolag: 'Vida', markagare: null, vo: '11271849', ...o },
});
const verkstad = (): FunnenPlats => ({
  typ: 'plats', id: 'p1', namn: 'Verkstan', avstandM: 100,
  kandidat: { typ: 'plats', id: 'p1', namn: 'Verkstan', lat: 56.4, lng: 15.0, platsTyp: 'verkstad' },
});
const hog: MaskinBedomning = { forslag: 'A130743', sakerhet: 'hog', kandidater: [], konflikt: false };
const medel: MaskinBedomning = { forslag: 'A130743', sakerhet: 'medel', kandidater: [], konflikt: false };

describe('Hög + säkra platser + kund = flytten skapas av sig själv', () => {
  it('Elefant 26, 45,7 km, kund från traktens bolag', () => {
    const b = beslutaLass({ lass: lass(), fran: objekt({ id: 'a' }), till: objekt(), bedomning: hog, manuell: null });
    expect(b).toMatchObject({ autoSkapa: true, kund: 'Vida', fakturerbar: true, flyttTyp: 'produktion', status: 'vantar_maskin', status_orsak: null });
  });
  it('under 30 km faktureras flytten inte och då krävs ingen kund', () => {
    const b = beslutaLass({ lass: lass({ km: 12 }), fran: objekt(), till: objekt({ bolag: null }), bedomning: hog, manuell: null });
    expect(b).toMatchObject({ autoSkapa: true, fakturerbar: false, kund: null });
  });
});

describe('SAKNAD KUND — behandlas som osäker (frågan går ut, ingen flytt)', () => {
  it('fakturerbar flytt till en trakt utan bolag → kund_saknas', () => {
    const b = beslutaLass({ lass: lass(), fran: objekt(), till: objekt({ bolag: null, markagare: null }), bedomning: hog, manuell: null });
    expect(b).toMatchObject({ autoSkapa: false, status: 'vantar_maskin', status_orsak: 'kund_saknas', fakturerbar: true, kund: null });
  });
  it('"Privat" → markägaren är kunden', () => {
    expect(kundForLass(objekt({ bolag: 'Privat', markagare: 'Anna Svensson' }))).toBe('Anna Svensson');
  });
  it('"Privat" utan markägare → ingen kund (ingen gissning)', () => {
    expect(kundForLass(objekt({ bolag: 'Privat', markagare: null }))).toBeNull();
  });
  it('en flyttplats har ingen kund; service faktureras aldrig, så ingen kund krävs', () => {
    expect(kundForLass(verkstad())).toBeNull();
    const b = beslutaLass({ lass: lass({ km: 80 }), fran: objekt(), till: verkstad(), bedomning: hog, manuell: null });
    expect(b).toMatchObject({ flyttTyp: 'service', fakturerbar: false, autoSkapa: true });
    expect(flyttTypFor(verkstad())).toBe('service');
  });
});

describe('Medel / Låg / Okänd skapar aldrig en flytt', () => {
  it.each(['medel', 'lag', 'okand'] as const)('%s → vantar_maskin, ingen automatik', sak => {
    const b = beslutaLass({ lass: lass(), fran: objekt(), till: objekt(), bedomning: { ...medel, sakerhet: sak, forslag: sak === 'okand' ? null : 'A130743' }, manuell: null });
    expect(b).toMatchObject({ autoSkapa: false, status: 'vantar_maskin', status_orsak: 'sakerhet' });
  });
});

describe('osäker plats stoppar automatiken även när maskinen är Hög', () => {
  it('lossningsplatsen osäker (bilen hade kört vidare)', () => {
    const b = beslutaLass({ lass: lass({ lossning: { ...lass().lossning, saker: false } }), fran: objekt(), till: objekt(), bedomning: hog, manuell: null });
    expect(b).toMatchObject({ autoSkapa: false, status_orsak: 'plats_osaker' });
  });
  it('närmaste trakt ligger 5,9 km bort (Kroksjömåla-fallet) → plats_osaker', () => {
    const b = beslutaLass({ lass: lass(), fran: objekt({}, 5_900), till: objekt(), bedomning: hog, manuell: null });
    expect(b).toMatchObject({ autoSkapa: false, status_orsak: 'plats_osaker' });
  });
  it('ingen trakt alls inom räckhåll', () => {
    const b = beslutaLass({ lass: lass(), fran: null, till: objekt(), bedomning: hog, manuell: null });
    expect(b.autoSkapa).toBe(false);
  });
});

describe('matchad_manuell och avvisad', () => {
  const flytt = { id: 'f1', maskin_id: 'A130743', extern_maskin: null, starttid: 'x', hamtad_tid: null, sluttid: null, avbruten: false };
  it('förarens flytt finns → matchad_manuell, aldrig en ny flytt, även om maskinen är Hög', () => {
    const b = beslutaLass({ lass: lass(), fran: objekt(), till: objekt(), bedomning: hog, manuell: { typ: 'match', flytt } });
    expect(b).toMatchObject({ status: 'matchad_manuell', autoSkapa: false });
  });
  it('en påbörjad (avbruten) flytt hindrar inte att lasset blir en egen flytt', () => {
    const b = beslutaLass({ lass: lass(), fran: objekt(), till: objekt(), bedomning: hog, manuell: { typ: 'paborjad', flytt: { ...flytt, avbruten: true } } });
    expect(b.autoSkapa).toBe(true);
  });
  it('avvisat lass (enstaka mätning) blir avvisad med orsaken', () => {
    const b = beslutaLass({ lass: lass({ avvisad: 'enstaka_matning' }), fran: null, till: null, bedomning: hog, manuell: null });
    expect(b).toMatchObject({ status: 'avvisad', status_orsak: 'enstaka_matning', autoSkapa: false });
  });
});
