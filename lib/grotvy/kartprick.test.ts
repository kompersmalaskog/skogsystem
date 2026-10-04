import { describe, it, expect } from 'vitest';
import { bradskandeFor } from './kartprick';
import { arForsenad } from './lista';
import { dagarMellan, FORSENAD_TEXT } from './format';

const IDAG = '2026-10-04';
/** En rad så som byggGrotLista räknar den: dagarTillSenast = hela dagar från idag till datumet. */
const rad = (senast: string | null) => ({ senast, dagarTillSenast: senast ? dagarMellan(IDAG, senast) : null });

describe('bradskandeFor — vem som får den stora prickens datumskylt på kartan', () => {
  it('utan markägarens datum: ingen brådska — pricken är som förut', () => {
    expect(bradskandeFor(rad(null), IDAG)).toBeNull();
    expect(bradskandeFor({ senast: '', dagarTillSenast: null }, IDAG)).toBeNull();
    // även om en dagräkning skulle finnas utan datum (byggGrotLista ger det aldrig) är svaret "ingen skylt", inte "försenad"
    expect(bradskandeFor({ senast: null, dagarTillSenast: -2 }, IDAG)).toBeNull();
    expect(bradskandeFor({ senast: '', dagarTillSenast: 3 }, IDAG)).toBeNull();
  });

  it('datum som inte har passerat: skylten är datumet, kort och utan punkt', () => {
    expect(bradskandeFor(rad('2026-10-05'), IDAG)).toEqual({ typ: 'senast', text: '5 okt' });
    expect(bradskandeFor(rad('2026-10-11'), IDAG)).toEqual({ typ: 'senast', text: '11 okt' });
    expect(bradskandeFor(rad('2026-12-24'), IDAG)).toEqual({ typ: 'senast', text: '24 dec' });
  });

  it('SAMMA dag är inte försenad (det blir det först i morgon) — precis som på raden', () => {
    expect(bradskandeFor(rad('2026-10-04'), IDAG)).toEqual({ typ: 'senast', text: '4 okt' });
  });

  it('passerat datum: ordet "försenad", samma ord som listraden', () => {
    expect(bradskandeFor(rad('2026-10-03'), IDAG)).toEqual({ typ: 'forsenad', text: 'försenad' });
    expect(bradskandeFor(rad('2026-09-01'), IDAG)?.text).toBe(FORSENAD_TEXT);
    expect(bradskandeFor(rad('2025-12-31'), IDAG)?.typ).toBe('forsenad');
  });

  it('året skrivs aldrig på skylten — inte ens för ett datum nästa år', () => {
    expect(bradskandeFor(rad('2027-02-03'), IDAG)).toEqual({ typ: 'senast', text: '3 feb' });
  });

  it('är försenad exakt när raden är det (arForsenad) — kartan har ingen egen gräns', () => {
    for (let d = -4; d <= 4; d++) {
      const senast = new Date(Date.UTC(2026, 9, 4 + d)).toISOString().slice(0, 10);
      const r = rad(senast);
      expect(bradskandeFor(r, IDAG)?.typ === 'forsenad').toBe(arForsenad(r));
      expect(bradskandeFor(r, IDAG)).not.toBeNull(); // varje datum ger en skylt, passerat eller inte
    }
  });

  it('ett datum utan beräknad dagräkning går inte att bedöma → ingen brådska hellre än en gissning', () => {
    expect(bradskandeFor({ senast: '2026-10-05', dagarTillSenast: null }, IDAG)).toBeNull();
  });

  it('ett värde som inte är ett datum ger ingen tom skylt', () => {
    expect(bradskandeFor({ senast: 'inte-ett-datum', dagarTillSenast: 3 }, IDAG)).toBeNull();
  });

  it('ett datum långt fram är ändå brådskande — kartan har ingen egen "snart"-gräns', () => {
    expect(bradskandeFor(rad('2026-12-24'), IDAG)).toEqual({ typ: 'senast', text: '24 dec' }); // 81 dagar fram
    expect(bradskandeFor(rad('2027-10-04'), IDAG)).toEqual({ typ: 'senast', text: '4 okt' });  // ett år fram
  });
});
