import { describe, expect, it } from 'vitest';
import { avlaggsradLedig, instruktionBlockerad } from './ordning';

describe('instruktionBlockerad — lossning och larm går före', () => {
  it('ingen blockerar → instruktionen får platsen', () => { expect(instruktionBlockerad({ larmVisas: false, lossningVisas: false })).toBe(false); });
  it('larm blockerar', () => { expect(instruktionBlockerad({ larmVisas: true, lossningVisas: false })).toBe(true); });
  it('lossningskortet blockerar', () => { expect(instruktionBlockerad({ larmVisas: false, lossningVisas: true })).toBe(true); });
  it('båda blockerar', () => { expect(instruktionBlockerad({ larmVisas: true, lossningVisas: true })).toBe(true); });
});

describe('avlaggsradLedig — väntar tills instruktionen fått Sett', () => {
  it('ledigt och ingen instruktion väntar → raden får visas', () => { expect(avlaggsradLedig({ ledigtUtanInstruktion: true, instruktionVantar: false })).toBe(true); });
  it('en instruktion väntar (visas nu eller väntar på larm/lossning) → raden väntar', () => { expect(avlaggsradLedig({ ledigtUtanInstruktion: true, instruktionVantar: true })).toBe(false); });
  it('något annat ligger nertill → raden väntar som förut', () => { expect(avlaggsradLedig({ ledigtUtanInstruktion: false, instruktionVantar: false })).toBe(false); });
});
