import { describe, expect, it } from 'vitest';
import { byggVy, jamforKravNr, kurser, status, utbRader, type Krav, type UtbLage } from './krav';

const k = (o: Partial<Krav> = {}): Krav => ({
  kravNr: '1.1.1', namn: 'Korrekta företagsuppgifter', sektionNr: 1, sektion: 'Företagsansvar', gallerOss: 'Ja',
  underlag: 'u', hurOfta: 'h', varFinns: 'v', klar: false, uppladdadSe: false, gallerNu: true, kalla: null, ...o,
});
const u = (o: Partial<UtbLage> = {}): UtbLage => ({ typId: 't', antal: 7, giltiga: 7, medIntyg: 7, uppladdade: 7, ...o });

describe('status för ett krav som bockas av för hand', () => {
  it('inte klar = Saknas, också när bara SE-bocken är satt', () => {
    expect(status(k())).toBe('saknas');
    expect(status(k({ uppladdadSe: true }))).toBe('saknas');
  });
  it('klar men inte uppladdat = Inte uppladdat hos SE; båda = Klart', () => {
    expect(status(k({ klar: true }))).toBe('ej_uppladdat');
    expect(status(k({ klar: true, uppladdadSe: true }))).toBe('klart');
  });
});

describe('status för ett krav som räknas ur Utbildning', () => {
  const hlr = k({ kravNr: '3.1.10', kalla: 'utbildning', klar: true, uppladdadSe: true });
  it('bockarna i cert_krav räknas aldrig — bara Utbildning', () => {
    expect(status(hlr, u({ giltiga: 5 }))).toBe('saknas');
    expect(status(hlr, undefined)).toBe('saknas');
  });
  it('alla giltiga men ett intyg inte uppladdat = Inte uppladdat hos SE', () => {
    expect(status(hlr, u({ uppladdade: 6 }))).toBe('ej_uppladdat');
    expect(status(hlr, u())).toBe('klart');
  });
  it('ingen berörs: klart bara för "Om aktuellt"', () => {
    const ingen = u({ antal: 0, giltiga: 0, medIntyg: 0, uppladdade: 0 });
    expect(status(k({ kravNr: '3.1.9', kalla: 'utbildning', gallerOss: 'Om aktuellt' }), ingen)).toBe('klart');
    expect(status(k({ kravNr: '3.1.8', kalla: 'utbildning' }), ingen)).toBe('saknas');
  });
  it('liggaren: klar när SE-kurserna har sina intyg — övriga utbildningar räknas inte; SE-bocken sätts för hand', () => {
    const l = k({ kravNr: '3.1.11', kalla: 'utbildning' });
    expect(status(l, null, { antal: 4, ok: 3 })).toBe('saknas');
    expect(status(l, null, undefined)).toBe('saknas');
    expect(status(l, null, { antal: 4, ok: 4 })).toBe('ej_uppladdat');
    expect(status({ ...l, uppladdadSe: true }, null, { antal: 4, ok: 4 })).toBe('klart');
    expect(utbRader(l, null, { antal: 4, ok: 3 })).toEqual(['3 av 4 SE-kurser har sina intyg']);
  });
  it('kurser: bara 3.1.1, 3.1.8, 3.1.9 och 3.1.10 som gäller oss; OK = intygen gäller (uppladdningen är kursens egen sak)', () => {
    const kr = [
      k({ kravNr: '3.1.1', kalla: 'utbildning' }), k({ kravNr: '3.1.8', kalla: 'utbildning' }),
      k({ kravNr: '3.1.9', kalla: 'utbildning', gallerOss: 'Om aktuellt' }), k({ kravNr: '3.1.10', kalla: 'utbildning' }),
      k({ kravNr: '2.1.5' }),
    ];
    const ingen = u({ antal: 0, giltiga: 0, medIntyg: 0, uppladdade: 0 });
    expect(kurser(kr, { '3.1.1': u({ uppladdade: 0 }), '3.1.8': u({ giltiga: 6 }), '3.1.9': ingen, '3.1.10': u() })).toEqual({ antal: 4, ok: 3 });
    // ADR avstängd ("Gäller oss just nu" av) räknas inte i liggaren
    expect(kurser(kr.map(x => x.kravNr === '3.1.9' ? { ...x, gallerNu: false } : x), { '3.1.1': u(), '3.1.8': u(), '3.1.10': u() })).toEqual({ antal: 3, ok: 3 });
  });
  it('arkets rader säger läget i ord', () => {
    expect(utbRader(hlr, u({ giltiga: 5, uppladdade: 3 }))).toEqual(['5 av 7 har HLR', '3 av 7 intyg uppladdade hos SE']);
    expect(utbRader(k({ kravNr: '3.1.9', kalla: 'utbildning', gallerOss: 'Om aktuellt' }), u({ antal: 0 }))).toEqual(['Ingen behöver ADR just nu.']);
  });
});

describe('byggVy', () => {
  const krav = [
    k({ kravNr: '1.1.2' }), k({ kravNr: '1.1.1', klar: true, uppladdadSe: true }),
    k({ kravNr: '1.4.1', gallerOss: 'Nej' }),
    k({ kravNr: '2.1.8', sektionNr: 2, sektion: 'SAM & beredskap', gallerOss: 'Om aktuellt' }),
    k({ kravNr: '3.1.10', sektionNr: 3, sektion: 'Kompetens', kalla: 'utbildning' }),
    k({ kravNr: '3.1.9', sektionNr: 3, sektion: 'Kompetens', kalla: 'utbildning' }),
  ];
  const vy = byggVy(krav, { '3.1.10': u(), '3.1.9': u({ giltiga: 6 }) });
  it('räknar bara krav som gäller oss (Ja och Om aktuellt), aldrig Nej', () => {
    expect(vy.kvar).toBe(3);
    expect(vy.rubrik).toBe('3 saker kvar till revisionen');
    expect(vy.sektioner.map(s => [s.nr, s.kvar])).toEqual([[1, 1], [2, 1], [3, 1]]);
    expect(vy.sektioner[0].gallerInte.map(x => x.kravNr)).toEqual(['1.4.1']);
  });
  it('SE:s ordning: 3.1.9 före 3.1.10', () => {
    expect(vy.sektioner[2].rader.map(r => r.krav.kravNr)).toEqual(['3.1.9', '3.1.10']);
    expect(jamforKravNr('3.1.10', '3.1.9')).toBeGreaterThan(0);
  });
  it('"Om aktuellt" med Gäller oss just nu av: räknas inte och ligger under gäller inte', () => {
    const av = byggVy(krav.map(x => x.kravNr === '2.1.8' ? { ...x, gallerNu: false } : x), { '3.1.10': u(), '3.1.9': u({ giltiga: 6 }) });
    expect(av.kvar).toBe(2);
    expect(av.sektioner[1].kvar).toBe(0);
    expect(av.sektioner[1].gallerInte.map(x => x.kravNr)).toEqual(['2.1.8']);
    // gallerNu betyder ingenting för ett 'Ja'-krav
    expect(byggVy([k({ gallerNu: false })], {}).kvar).toBe(1);
  });
  it('en sak kvar och inget kvar', () => {
    expect(byggVy([k()], {}).rubrik).toBe('1 sak kvar till revisionen');
    expect(byggVy([k({ klar: true, uppladdadSe: true }), k({ kravNr: '1.4.1', gallerOss: 'Nej' })], {}).rubrik).toBe('Redo för revisionen');
  });
});
