// LarmKort.okvitterad: styr den lilla målbilden i larmkortet ("första gången"). Sann tills föraren kvitterat just det här innehållet.
import { describe, expect, it } from 'vitest';
import { innehallHash, stegaLarm, TOMT_LARM, markeraSett, type LarmObjekt } from './larm';

const o = (p: Partial<LarmObjekt> = {}): LarmObjekt => ({ id: 'y1', kalla: 'yta', grupp: 'natur', namn: 'Hänsyn', typ: 'protected', hash: innehallHash({ type: 'protected', comment: '' }), forbjuden: true, avstandM: null, inne: true, ...p });
const kor = (objekt: LarmObjekt[], kvitt = new Map<string, any>(), state = TOMT_LARM) => stegaLarm({ objekt, kvitt, forareId: 'f1', state });

describe('LarmKort.okvitterad', () => {
  it('ett larm som ingen kvitterat: okvitterad', () => expect(kor([o()]).kort!.okvitterad).toBe(true));
  it('efter kvittering (samma innehåll): inget kort alls — en varning per hinder (2026-11-16)', () => {
    const k = new Map([['y1', { hash: o().hash, forareId: 'f1' }]]);
    const u = kor([o()], k);
    expect(u.kort).toBeNull(); expect(u.passage).toMatchObject({ sedd: true });
  });
  it('ändrat innehåll (ny kommentar) gör kvitteringen ogiltig: okvitterad igen', () => {
    const k = new Map([['y1', { hash: o().hash, forareId: 'f1' }]]);
    expect(kor([o({ hash: innehallHash({ type: 'protected', comment: 'Ny kommentar' }) })], k).kort!.okvitterad).toBe(true);
  });
  it('en annan förares kvittering räknas inte', () => {
    const k = new Map([['y1', { hash: o().hash, forareId: 'f2' }]]);
    expect(kor([o()], k).kort!.okvitterad).toBe(true);
  });
  it('"Sett" under den här passagen: inte okvitterad', () => {
    const forsta = kor([o()]);
    const sett = kor([o()], new Map(), markeraSett(forsta.state, 'y1'));
    expect(sett.kort).toBeNull();   // förbjuden yta: kortet blir den lilla raden
    // ett vanligt hinder står kvar under passagen, men räknas inte längre som okvitterat
    const s = o({ id: 's1', kalla: 'symbol', forbjuden: false, inne: undefined, avstandM: 20, typ: 'culturemonument', grupp: 'kultur' });
    const a = kor([s]);
    expect(kor([s], new Map(), markeraSett(a.state, 's1')).kort!.okvitterad).toBe(false);
  });
});
