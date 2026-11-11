import { describe, expect, it } from 'vitest';
import {
  andrad, autoGiltigTill, dagarTill, etikettText, giltig, lageFor, sortera, startFalt, svar, type Behorighet, type Person,
} from './behorighet';

const IDAG = '2026-11-11';
const plus = (dagar: number) => new Date(Date.UTC(2026, 10, 11 + dagar)).toISOString().slice(0, 10);

const b = (p: Partial<Behorighet> = {}): Behorighet => ({
  typId: 't-syn', seKrav: '3.1.1', namn: 'SYN avverkning', giltighetManader: 60,
  bevisId: 'b1', kursdatum: '2024-01-10', giltigTill: plus(400), intygPath: null, uppladdadSe: false, ...p,
});
const person = (namn: string, ...bs: Behorighet[]): Person => ({ id: namn, namn, behorigheter: bs });

describe('läget räknas vid läsning', () => {
  it('89 dagar kvar är gult, 91 dagar är OK, 90 räknas in', () => {
    expect(lageFor(b({ giltigTill: plus(89) }), IDAG)).toEqual({ lage: 'snart', dagar: 89 });
    expect(lageFor(b({ giltigTill: plus(91) }), IDAG).lage).toBe('ok');
    expect(lageFor(b({ giltigTill: plus(90) }), IDAG).lage).toBe('snart');
  });
  it('går ut idag är inte utgånget, igår är det', () => {
    expect(lageFor(b({ giltigTill: IDAG }), IDAG).lage).toBe('snart');
    expect(lageFor(b({ giltigTill: plus(-1) }), IDAG).lage).toBe('utgangen');
  });
  it('utan intyg saknas det; utan utgångsdatum är det OK', () => {
    expect(lageFor(b({ bevisId: null, giltigTill: null }), IDAG).lage).toBe('saknas');
    expect(lageFor(b({ giltigTill: null }), IDAG).lage).toBe('ok');
  });
  it('dagarna räknas över sommartidsbytet', () => {
    expect(dagarTill('2027-03-29', '2027-03-27')).toBe(2);
  });
});

describe('etiketten säger det i ord', () => {
  it('OK är bara namnet, annars namn och vad som är fel', () => {
    expect(etikettText(b(), IDAG).text).toBe('SYN');
    expect(etikettText(b({ seKrav: '3.1.10', giltigTill: plus(40) }), IDAG).text).toBe('HLR · 40 dagar');
    expect(etikettText(b({ seKrav: '3.1.9', bevisId: null }), IDAG).text).toBe('ADR · saknas');
    expect(etikettText(b({ giltigTill: plus(-3) }), IDAG).text).toBe('SYN · utgången');
    expect(etikettText(b({ giltigTill: plus(1) }), IDAG).text).toBe('SYN · 1 dag');
    expect(etikettText(b({ seKrav: '3.1.8', bevisId: null }), IDAG).text).toBe('Naturvärde · saknas');
  });
});

describe('sortering', () => {
  it('utgånget överst, sedan saknas, sedan går ut snart, sedan alfabetiskt', () => {
    const lista = sortera([
      person('Åke', b()), person('Bo', b()),
      person('Snart', b({ giltigTill: plus(10) })),
      person('Saknas', b({ bevisId: null })),
      person('Utgången', b({ giltigTill: plus(-1) })),
    ], IDAG);
    expect(lista.map(p => p.namn)).toEqual(['Utgången', 'Saknas', 'Snart', 'Bo', 'Åke']);
  });
});

describe('svaret överst', () => {
  it('alla är behöriga', () => {
    expect(svar([person('A', b()), person('B', b())], IDAG)).toEqual({ rubrik: 'Alla är behöriga', avvikelse: false });
  });
  it('går ut snart', () => {
    expect(svar([person('A', b({ giltigTill: plus(5) }), b({ giltigTill: plus(50) }))], IDAG).rubrik).toBe('2 intyg går ut snart');
  });
  it('utgånget går före, resten står under', () => {
    const s = svar([person('A', b({ giltigTill: plus(-5) }), b({ giltigTill: plus(5) }), b({ bevisId: null }))], IDAG);
    expect(s.rubrik).toBe('1 intyg har gått ut');
    expect(s.rad).toBe('1 saknas · 1 går ut snart');
  });
  it('inga intyg alls är det tomma läget', () => {
    const s = svar([person('A', b({ bevisId: null })), person('B', b({ bevisId: null }))], IDAG);
    expect(s.rubrik).toBe('Inga intyg än');
    expect(s.rad).toBe('Tryck på en förare och fota kursintyget.');
  });
});

describe('giltig till fylls i som databasen räknar', () => {
  it('kursdatum + 5 år, och HLR + 2 år', () => {
    expect(autoGiltigTill('2026-03-15', 60)).toBe('2031-03-15');
    expect(autoGiltigTill('2026-03-15', 24)).toBe('2028-03-15');
  });
  it('skottdagen kläms till 28 februari, som i Postgres', () => {
    expect(autoGiltigTill('2024-02-29', 60)).toBe('2029-02-28');
  });
  it('utan datum eller utan utgång: tomt', () => {
    expect(autoGiltigTill('', 60)).toBe('');
    expect(autoGiltigTill('2026-01-01', null)).toBe('');
  });
});

describe('Spara är grå tills något ändrats', () => {
  it('orört formulär är inte ändrat; varje fält räknas', () => {
    const x = b();
    expect(andrad(x, startFalt(x))).toBe(false);
    expect(andrad(x, { ...startFalt(x), uppladdadSe: true })).toBe(true);
    expect(andrad(x, { ...startFalt(x), nyttFoto: true })).toBe(true);
    expect(andrad(x, { ...startFalt(x), kursdatum: '2025-01-01' })).toBe(true);
  });
  it('kursdatum krävs, och giltig till får inte ligga före det', () => {
    const x = b({ bevisId: null, kursdatum: null, giltigTill: null });
    expect(giltig({ ...startFalt(x), nyttFoto: true })).toBe(false);
    expect(giltig({ ...startFalt(x), kursdatum: '2026-01-01', giltigTill: '2031-01-01' })).toBe(true);
    expect(giltig({ ...startFalt(x), kursdatum: '2026-01-01', giltigTill: '2025-01-01' })).toBe(false);
  });
});
