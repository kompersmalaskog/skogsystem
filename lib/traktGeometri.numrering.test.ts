import { describe, it, expect } from 'vitest';
import { numreraObjekt } from './traktGeometri';

// En bit = en Vida-traktdel (partKey '<TRDEL_ID>:<del>'); centroid bestämmer ordningen N→S, V→Ö.
const bit = (partKey: string, lat: number, lng: number) => ({ partKey, centroid: { lat, lng } });
const eget = (id: number, nummer?: number | null, fromVidaTd?: string | null) => ({ id, nummer: nummer ?? null, fromVidaTd: fromVidaTd ?? null });

describe('numreraObjekt — när får en yta en siffra på kartan?', () => {
  it('Östra-Höka som den ligger i prod: EN Vida-del, inga hänsyn-nummer, inga egna områden → ingen siffra (en ensam yta ÄR trakten)', () => {
    const n = numreraObjekt({ hansynLopnr: [], bitar: [bit('132976:0', 56.2, 14.9)], granser: [] });
    expect(n.visaBitNummer).toBe(false);
    expect(n.visaGransNummer).toBe(false);
  });

  it('KODBEVIS (felet 2026-10-06): Östra-Höka + ETT nyritat område = två ytor → BÅDA får siffra (Vida-delen 1, området 2)', () => {
    const n = numreraObjekt({ hansynLopnr: [], bitar: [bit('132976:0', 56.2, 14.9)], granser: [eget(1700000000000)] });
    expect(n.visaBitNummer).toBe(true);
    expect(n.visaGransNummer).toBe(true);
    expect(n.bitNr.get('132976:0')).toBe(1);
    expect(n.gransNr.get('1700000000000')).toBe(2);
    expect(n.nastaGransNr).toBe(3);
  });

  it('tre ytor (en del + två områden): siffrorna 1, 2, 3 i ordning', () => {
    const n = numreraObjekt({ hansynLopnr: [], bitar: [bit('a:0', 56.2, 14.9)], granser: [eget(10), eget(20)] });
    expect(n.visaGransNummer).toBe(true);
    expect([n.bitNr.get('a:0'), n.gransNr.get('10'), n.gransNr.get('20')]).toEqual([1, 2, 3]);
  });

  it('inga delar och ETT eget område → ingen siffra; TVÅ egna områden → siffror', () => {
    expect(numreraObjekt({ hansynLopnr: [], bitar: [], granser: [eget(1)] }).visaGransNummer).toBe(false);
    const tva = numreraObjekt({ hansynLopnr: [], bitar: [], granser: [eget(1), eget(2)] });
    expect(tva.visaGransNummer).toBe(true);
    expect([tva.gransNr.get('1'), tva.gransNr.get('2')]).toEqual([1, 2]);
  });

  it('två Vida-delar → siffror redan utan egna områden, N→S sedan V→Ö', () => {
    const n = numreraObjekt({ hansynLopnr: [], bitar: [bit('syd:0', 56.1, 14.9), bit('nord:0', 56.3, 14.9)], granser: [] });
    expect(n.visaBitNummer).toBe(true);
    expect([n.bitNr.get('nord:0'), n.bitNr.get('syd:0')]).toEqual([1, 2]);
  });

  it('har objektet Vidas hänsyn-nummer visas siffror även för EN yta (Vidas nummer är facit)', () => {
    const n = numreraObjekt({ hansynLopnr: [1, 2], bitar: [bit('a:0', 56.2, 14.9)], granser: [] });
    expect(n.visaBitNummer).toBe(true);
    expect(n.bitNr.get('a:0')).toBe(3);   // vidaMax + 1
  });

  it('Hålabäck au 2025 (prod): hänsyn 1–5 + tre delar → delarna 6, 7, 8 och nästa lediga område 9', () => {
    const n = numreraObjekt({
      hansynLopnr: [1, 2, 3, 4, 5],
      bitar: [bit('131940:0', 56.357, 15.051), bit('131966:0', 56.353, 15.0505), bit('131966:1', 56.353, 15.0597)],
      granser: [],
    });
    expect(Array.from(n.bitNr.entries())).toEqual([['131940:0', 6], ['131966:0', 7], ['131966:1', 8]]);
    expect(n.visaBitNummer).toBe(true);
    expect(n.nastaGransNr).toBe(9);
  });

  it('en "Justera gräns"-kopia av den enda delen är SAMMA yta (ärver numret, räknas inte som egen) → fortfarande ensam yta', () => {
    const n = numreraObjekt({ hansynLopnr: [], bitar: [bit('a:0', 56.2, 14.9)], granser: [eget(5, null, 'a:0')] });
    expect(n.visaBitNummer).toBe(false);
    expect(n.gransNr.get('5')).toBe(n.bitNr.get('a:0'));
  });

  it('en kopia + ett nyritat område = två ytor → siffror', () => {
    const n = numreraObjekt({ hansynLopnr: [], bitar: [bit('a:0', 56.2, 14.9)], granser: [eget(5, null, 'a:0'), eget(6)] });
    expect(n.visaGransNummer).toBe(true);
    expect(n.gransNr.get('6')).toBe(2);
  });

  it('ett lagrat nummer på området vinner (redigerbart) och kolliderar inte med delarnas', () => {
    const n = numreraObjekt({ hansynLopnr: [], bitar: [bit('a:0', 56.2, 14.9)], granser: [eget(9, 7)] });
    expect(n.gransNr.get('9')).toBe(7);
    expect(n.visaGransNummer).toBe(true);
  });
});
