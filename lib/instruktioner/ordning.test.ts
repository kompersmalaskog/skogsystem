import { describe, expect, it } from 'vitest';
import { avlaggsradLedig, instruktionBlockerad, larmHallerPlatsen } from './ordning';
import { markeraSett, stegaLarm, TOMT_LARM } from '../larm/larm';

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

describe('larmHallerPlatsen — larmet väntar på Sett, en Fara skyms aldrig', () => {
  it('inget larmkort → ingen blockering', () => { expect(larmHallerPlatsen({ harKort: false, vantarPaSett: false, arFara: false })).toBe(false); });
  it('larmkort som väntar på Sett blockerar', () => { expect(larmHallerPlatsen({ harKort: true, vantarPaSett: true, arFara: false })).toBe(true); });
  it('larmkort som redan setts (står kvar inne i ytan) blockerar inte', () => { expect(larmHallerPlatsen({ harKort: true, vantarPaSett: false, arFara: false })).toBe(false); });
  it('en Fara blockerar alltid, även efter Sett', () => { expect(larmHallerPlatsen({ harKort: true, vantarPaSett: false, arFara: true })).toBe(true); });
});

describe('mot den riktiga larmmotorn: hänsynsyta inne i ytan', () => {
  const yta = (grupp: 'natur' | 'fara', forbjuden: boolean) => ({ id: 'y', kalla: 'yta' as const, grupp, namn: 'Hänsyn', hash: 'h', forbjuden, avstandM: null, inne: true });
  const holler = (o: ReturnType<typeof yta>, medSett: boolean) => {
    let r = stegaLarm({ objekt: [o], kvitt: new Map(), forareId: 'f', state: TOMT_LARM });
    if (medSett) r = stegaLarm({ objekt: [o], kvitt: new Map(), forareId: 'f', state: markeraSett(r.state, 'y') });
    return larmHallerPlatsen({ harKort: !!r.kort, vantarPaSett: !!r.settRad, arFara: r.kort?.grupp === 'fara' });
  };
  it('förbjuden yta: larmet har platsen tills Sett — sedan får instruktionen den, fast larmkortet står kvar', () => {
    expect(holler(yta('natur', true), false)).toBe(true);
    expect(holler(yta('natur', true), true)).toBe(false);
  });
  it('en fara-yta: larmet behåller platsen även efter Sett', () => {
    expect(holler(yta('fara', false), false)).toBe(true);
    expect(holler(yta('fara', false), true)).toBe(true);
  });
});
