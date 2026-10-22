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

// Martin 2026-10-22: ingen Sett på fara. Instruktionskortet ska då vänta så länge en Röd larmar (inte på en knapp som inte finns) och komma först när man passerat.
describe('mot den riktiga larmmotorn: Röd (fara) har ingen Sett — instruktionen väntar tills den passerats', () => {
  const rod = (id: string, avstandM: number | null, extra: Record<string, unknown> = {}) => ({ id, kalla: 'symbol' as const, grupp: 'fara' as const, namn: 'El-ledning', hash: 'h', avstandM, ...extra });
  const hyta = (id: string, avstandM: number | null) => ({ id, kalla: 'yta' as const, grupp: 'natur' as const, namn: 'Hänsyn', hash: 'hy', forbjuden: true, avstandM, inne: true });
  // Samma uttryck som sidan (app/planering/page.tsx): det stora kortet ELLER en Röd i "+"-raden håller platsen.
  const holler = (r: ReturnType<typeof stegaLarm>) =>
    larmHallerPlatsen({ harKort: !!r.kort, vantarPaSett: !!r.settRad, arFara: r.kort?.grupp === 'fara' || r.fler.some((x) => x.grupp === 'fara') });
  const kor = (objekt: any[], state = TOMT_LARM) => stegaLarm({ objekt, kvitt: new Map(), forareId: 'f', state });

  it('El-ledning inom 40 m: ingen Sett-rad, men larmet håller platsen — instruktionen blockeras', () => {
    const r = kor([rod('e', 20)]);
    expect(r.settRad).toBeNull();
    expect(holler(r)).toBe(true);
    expect(instruktionBlockerad({ larmVisas: holler(r), lossningVisas: false })).toBe(true);
  });
  it('passerat (utom radien): larmet släpper, instruktionen får platsen', () => {
    const inne = kor([rod('e', 20)]);
    const ute = kor([rod('e', 80)], inne.state);
    expect(ute.kort).toBeNull();
    expect(holler(ute)).toBe(false);
    expect(instruktionBlockerad({ larmVisas: holler(ute), lossningVisas: false })).toBe(false);
  });
  it('en Röd i "+"-raden under en förbjuden hänsynsyta: efter Sett på ytan står Röd kvar och håller platsen (ingen instruktion ovanpå en fara)', () => {
    const y = hyta('h', null);
    const e = rod('e', 25);
    let r = kor([y, e]);
    expect(r.kort?.namn).toBe('El-ledning');            // Röd vinner det stora kortet
    r = kor([y, e], markeraSett(r.state, 'h'));
    expect(r.fler.map((f) => f.namn)).toEqual(['Hänsyn']);
    expect(holler(r)).toBe(true);
  });
  it('Ej framkomlig (Röd och förbjuden yta): ingen Sett-rad, håller platsen medan man är inne', () => {
    const ej = { id: 'ej', kalla: 'yta' as const, grupp: 'fara' as const, namn: 'Ej framkomlig', hash: 'h', forbjuden: true, avstandM: null, inne: true };
    const r = kor([ej]);
    expect(r.settRad).toBeNull();
    expect(holler(r)).toBe(true);
  });
  it('stort kort = förbjuden hänsynsyta, Röd (Ej framkomlig) i "+"-raden: efter Sett på ytan finns ingen Sett-rad kvar men Röd håller platsen', () => {
    const y = hyta('h', null);
    const ej = { id: 'ej', kalla: 'yta' as const, grupp: 'fara' as const, namn: 'Ej framkomlig', hash: 'h2', forbjuden: true, avstandM: null, inne: true };
    let r = kor([y, ej]);
    expect(r.kort?.id).toBe('h');                         // lika nivå (förbjuden yta): första i listan
    expect(r.fler.map((f) => f.id)).toEqual(['ej']);
    expect(r.settRad?.id).toBe('h');
    r = kor([y, ej], markeraSett(r.state, 'h'));
    expect(r.kort?.id).toBe('ej');                        // den setta hänsynsytan sjunker, Röd tar det stora kortet
    expect(r.settRad).toBeNull();
    expect(holler(r)).toBe(true);
  });
});
