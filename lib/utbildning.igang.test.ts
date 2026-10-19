// "I ordning" fick aldrig betyda "ingen är kopplad".
//
// utbildning_status ger en rad per person utbildningen gäller. Noll rader betyder
// att ingen är vald — utbildningen kan varken saknas eller gå ut. Prod 2026-10-19:
// fyra av åtta utbildningar stod så, bland dem Motorsågskörkort AB och
// Röjsågskörkort RA (lagkrav, sanktionsavgift per anställd), och vyn räknade dem
// som i ordning och vek ihop dem bakom en grå rad.
import { describe, it, expect } from 'vitest';
import { arIgang, kravtypRang, omfattningText, KRAVTYP_ORDNING } from './utbildning';

describe('arIgang', () => {
  it('noll rader = ingen är kopplad = inte igång', () => {
    expect(arIgang([])).toBe(false);
  });

  it('minst en rad = utbildningen gäller någon', () => {
    expect(arIgang([{}])).toBe(true);
    expect(arIgang([{}, {}, {}])).toBe(true);
  });
});

describe('kravtypRang', () => {
  it('lagkrav före certifiering före beställarkrav', () => {
    expect(kravtypRang('lag')).toBeLessThan(kravtypRang('certifiering'));
    expect(kravtypRang('certifiering')).toBeLessThan(kravtypRang('bestallare'));
  });

  it('följer KRAVTYP_ORDNING, så ordningen bara finns på ETT ställe', () => {
    const ur_rang = [...KRAVTYP_ORDNING].sort((a, b) => kravtypRang(a) - kravtypRang(b));
    expect(ur_rang).toEqual(KRAVTYP_ORDNING);
  });

  it('okänd kravtyp hamnar sist, aldrig först', () => {
    const okand = kravtypRang('nagot_nytt' as never);
    for (const k of KRAVTYP_ORDNING) expect(kravtypRang(k)).toBeLessThan(okand);
  });
});

describe('omfattningText', () => {
  it('ingen vald sägs i ord — inte som en nolla bland andra siffror', () => {
    expect(omfattningText(false, 0)).toBe('ingen vald');
  });

  it('räknar personer när några är valda', () => {
    expect(omfattningText(false, 1)).toBe('1 person');
    expect(omfattningText(false, 4)).toBe('4 personer');
  });

  it('gäller alla är sitt eget svar', () => {
    expect(omfattningText(true, 0)).toBe('gäller alla');
  });
});
