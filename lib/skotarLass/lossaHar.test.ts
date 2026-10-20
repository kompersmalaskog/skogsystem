import { describe, expect, it } from 'vitest';
import { avlaggFlytt, LOSSA_HAR, stoppMitt } from './lossaHar';
import type { Avlagg, Lass } from './typer';

const M = 1 / 111320;
const BAS = { lat: 56.6, lng: 15.8 };
const nord = (m: number) => ({ lat: BAS.lat + m * M, lng: BAS.lng });

describe('stoppMitt — mitten på stoppet', () => {
  const fixar = (nordM: number[], steg = 2) => nordM.map((n, i) => ({ ...nord(n), ts: 1_000_000 + i * steg * 1000 }));
  it('medelvärdet av de senaste 60 s när maskinen står still', () => {
    const f = fixar([100, 104, 100, 104, 100, 104, 100, 104]);
    const nu = f[f.length - 1].ts;
    expect((stoppMitt(f, nu, nord(104)).lat - BAS.lat) / M).toBeCloseTo(102, 5);
  });
  it('fixar äldre än 60 s räknas inte', () => {
    const f = [...fixar([0, 0, 0, 0], 2), ...fixar([100, 100, 100, 100]).map((x) => ({ ...x, ts: x.ts + 300_000 }))];
    const nu = f[f.length - 1].ts;
    expect((stoppMitt(f, nu, nord(100)).lat - BAS.lat) / M).toBeCloseTo(100, 5);
  });
  it('rör sig maskinen (> 25 m) gäller fallback = senaste fixen', () => {
    const f = fixar([0, 10, 20, 30, 40, 50]);
    const nu = f[f.length - 1].ts;
    expect(stoppMitt(f, nu, nord(50))).toEqual(nord(50));
  });
  it('färre än 3 fixar → fallback', () => {
    const f = fixar([0, 1]);
    expect(stoppMitt(f, f[1].ts, nord(7))).toEqual(nord(7));
  });
});

describe('avlaggFlytt — mot snittet av lossningarna, bara för Lossa här-avlägg', () => {
  const avl = (over: Partial<Avlagg> = {}): Avlagg => ({ id: 'egen:1', nummer: '1', kalla: 'egen', ...nord(200), viaLossaHar: true, ...over });
  const lass = (nr: number, nordM: number, status: Lass['status'] = 'bekraftat', avlaggId = 'egen:1'): Lass => ({
    id: `l${nr}`, objektId: 'o', voNummer: '1', maskinId: 'M', medarbetareId: null, lassNummer: nr, datum: '2026-10-20', status, bekraftadAv: status === 'bekraftat' ? 'forare' : null, bekraftadTid: null,
    sparPunkter: [], vagar: [], skapad: '', andrad: '',
    delar: [{ delNr: 1, avlaggId, avlaggNummer: '1', lossadTid: '2026-10-20T07:00:00Z', ...nord(nordM), rader: [{ nyckel: 'a', namn: 'A', m3: 5 }] }],
  });
  it('3 bekräftade lass → snittet', () => {
    const f = avlaggFlytt(avl(), [lass(1, 210), lass(2, 220), lass(3, 230)])!;
    expect(f.antal).toBe(3);
    expect((f.lat - BAS.lat) / M).toBeCloseTo(220, 5);
  });
  it('färre än tre → ingen flytt', () => {
    expect(LOSSA_HAR.MIN_LASS_FOR_FLYTT).toBe(3);
    expect(avlaggFlytt(avl(), [lass(1, 230), lass(2, 230)])).toBeNull();
  });
  it('bara bekräftade räknas (inte struket, inte väntar på föraren, inte förslag)', () => {
    expect(avlaggFlytt(avl(), [lass(1, 230), lass(2, 230), lass(3, 230, 'struket'), lass(4, 230, 'vantar_forare'), lass(5, 230, 'foreslaget')])).toBeNull();
  });
  it('bara lass vid just det här avlägget', () => {
    expect(avlaggFlytt(avl(), [lass(1, 230), lass(2, 230), lass(3, 230, 'bekraftat', 'vida:2')])).toBeNull();
  });
  it('Vidas avlägg, och egna avlägg som inte skapats via Lossa här, flyttas aldrig', () => {
    const l = [lass(1, 230), lass(2, 230), lass(3, 230)];
    expect(avlaggFlytt(avl({ viaLossaHar: false }), l)).toBeNull();
    expect(avlaggFlytt(avl({ viaLossaHar: undefined }), l)).toBeNull();
    expect(avlaggFlytt(avl({ id: 'vida:1', kalla: 'vida' }), l.map((x) => ({ ...x, delar: [{ ...x.delar[0], avlaggId: 'vida:1' }] })))).toBeNull();
  });
  it('snittet inom 8 m från avlägget → ingen flytt (markeringen hoppar inte för varje lass)', () => {
    expect(avlaggFlytt(avl(), [lass(1, 203), lass(2, 205), lass(3, 207)])).toBeNull();
    expect(avlaggFlytt(avl(), [lass(1, 209), lass(2, 209), lass(3, 209)])).not.toBeNull();
  });
  it('efter flytten ligger avlägget på snittet: ingen ny flytt (inga flyttar i loop)', () => {
    const l = [lass(1, 210), lass(2, 220), lass(3, 230)];
    const f = avlaggFlytt(avl(), l)!;
    expect(avlaggFlytt(avl({ lat: f.lat, lng: f.lng }), l)).toBeNull();
  });
});
