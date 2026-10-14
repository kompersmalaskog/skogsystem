import { describe, it, expect } from 'vitest';
import { harledTyp, typKort, typLabel } from './typ';
import { objektHuvudtyp } from '../objektPlats';

describe('GROT skrivs med versaler i visningen — lagrade värden är oförändrade', () => {
  it('lång och kort etikett: GROT', () => {
    expect(typLabel('grot')).toBe('GROT');
    expect(typKort('grot')).toBe('GROT');
  });
  it('övriga typer är som förut', () => {
    expect(typLabel('slutavverkning')).toBe('Slutavverkning');
    expect(typLabel('gallring')).toBe('Gallring');
    expect(typLabel('energiklippning')).toBe('Energiklippning');
    expect(typLabel(null)).toBe('Typ okänd');
    expect(typKort('slutavverkning')).toBe('Slutavv.');
    expect(typKort('energiklippning')).toBe('Energi');
  });
  it('typnyckeln och den lagrade huvudtypen är fortfarande gemener resp. "Grot" — bara etiketten ändrades', () => {
    expect(objektHuvudtyp({ typ: 'grot' })).toBe('grot');
    expect(harledTyp(true, null)).toBe('grot');
    expect(harledTyp(null, 'Grot')).toBe('grot');          // dim_objekt.huvudtyp 'Grot' tolkas som förut
  });
});
