import { describe, expect, it } from 'vitest';
import { skotarBevis, skotarBevisPerMaskin, skotarUtesluten, type SkotarIndata, type SkotarPos } from './skotarpos';

// Lasset 22 okt 2026: lastat vid (56,2264 / 14,6999) kl 13:10 svensk tid (11:10Z), lossat vid LBC/en trakt 56,50 / 15,10 kl 15:40.
const LAST = { lat: 56.2264, lng: 14.6999 };
const LOSS = { lat: 56.5, lng: 15.1 };
const iso = (min: number) => new Date(Date.parse('2026-10-22T11:10:00Z') + min * 60_000).toISOString();
const INDATA = (arTrakt = true): SkotarIndata => ({
  lassning: { tid: iso(0), ...LAST }, lossning: { tid: iso(150), ...LOSS }, lossningArTrakt: arTrakt,
});
/** En position på så här många meter norr om punkten. */
const norr = (p: { lat: number; lng: number }, m: number) => ({ lat: p.lat + m / 111_195, lng: p.lng });
const pos = (maskin_id: string, min: number, p: { lat: number; lng: number }): SkotarPos => ({ maskin_id, tid: iso(min), ...p });

describe('avgång — senaste position före lastningen', () => {
  it('Wisent 22 okt: sista lasset 757 m från lastplatsen kl 12:48 (svensk tid)', () => {
    const b = skotarBevis([pos('W', -22, norr(LAST, 757))], INDATA());
    expect(b.avgang).toEqual({ avstandM: 757, dag: '2026-10-22', kl: '12:48', annanDag: false });
    expect(skotarUtesluten(b)).toBe(false);
  });
  it('gränser: 1 000 m räknas, 1 100 m inte (och är inte heller "långt")', () => {
    expect(skotarBevis([pos('W', -10, norr(LAST, 990))], INDATA()).avgang).toBeTruthy();
    const b = skotarBevis([pos('W', -10, norr(LAST, 1_100))], INDATA());
    expect(b.avgang).toBeUndefined();
    expect(b.langt).toBeUndefined();
  });
  it('bara den SENASTE positionen före lastningen gäller', () => {
    const b = skotarBevis([pos('W', -300, norr(LAST, 200)), pos('W', -30, norr(LAST, 3_000))], INDATA());
    expect(b.avgang).toBeUndefined();
  });
  it('12 timmar bakåt, inte längre', () => {
    expect(skotarBevis([pos('W', -12 * 60, norr(LAST, 100))], INDATA()).avgang).toBeTruthy();
    expect(skotarBevis([pos('W', -12 * 60 - 5, norr(LAST, 100))], INDATA()).avgang).toBeUndefined();
  });
  it('dagen står med när positionen är från en annan dag än lastningen', () => {
    expect(skotarBevis([pos('W', -20, norr(LAST, 100))], INDATA()).avgang).toMatchObject({ annanDag: false });
    // Lastning 22 okt 07:00 svensk tid (05:00Z); position 21 okt 18:40 svensk tid = 12 h 20 min innan → utanför fönstret; 16:40 → 14 h. Använd 22:40.
    const s = skotarBevis([pos('W', 0, norr(LAST, 100))].map(p => ({ ...p, tid: '2026-10-21T20:40:00Z' })), { ...INDATA(), lassning: { tid: '2026-10-22T05:00:00Z', ...LAST } });
    expect(s.avgang).toMatchObject({ dag: '2026-10-21', kl: '22:40', annanDag: true });
  });
});

describe('uteslutning — långt borta och kvar', () => {
  it('Elefant 22 okt: senaste lasset 42 km från lastplatsen → utesluten', () => {
    const b = skotarBevis([pos('E', -40, { lat: 56.252, lng: 15.377 })], INDATA());
    expect(b.langt).toMatchObject({ nar: 'fore', avstandM: 41_937 });
    expect(skotarUtesluten(b)).toBe(true);
  });
  it('5 km är gränsen: 4 900 m är varken avgång eller långt, 5 100 m är långt', () => {
    expect(skotarUtesluten(skotarBevis([pos('E', -10, norr(LAST, 4_900))], INDATA()))).toBe(false);
    expect(skotarUtesluten(skotarBevis([pos('E', -10, norr(LAST, 5_100))], INDATA()))).toBe(true);
  });
  it('position efter lastningen ≤ 1 km från lastplatsen = stannade kvar → utesluten', () => {
    const b = skotarBevis([pos('W', -20, norr(LAST, 300)), pos('W', 45, norr(LAST, 400))], INDATA());
    expect(b.kvar).toMatchObject({ avstandM: 400, kl: '13:55' });
    expect(b.avgang).toBeTruthy();
    expect(skotarUtesluten(b)).toBe(true);
  });
  it('position under transporten > 5 km från lastplatsen och inte vid lossplatsen = utesluten', () => {
    const b = skotarBevis([pos('E', 60, { lat: 56.75, lng: 14.2 })], INDATA());
    expect(b.langt).toMatchObject({ nar: 'under' });
  });
  it('… men en position vid lossplatsen under transporten (maskinen på bilen, lossade i förväg) utesluter inte', () => {
    const b = skotarBevis([pos('W', 149, norr(LOSS, 200))], INDATA());
    expect(b.langt).toBeUndefined();
    expect(b.kvar).toBeUndefined();
  });
  it('saknas lossplatsens koordinat prövas inte "under transporten" (ingen gissning)', () => {
    const b = skotarBevis([pos('E', 60, { lat: 56.75, lng: 14.2 })], { ...INDATA(), lossning: { tid: iso(150), lat: null, lng: null } });
    expect(b.langt).toBeUndefined();
  });
});

describe('ankomst — första position efter lossningen', () => {
  it('≤ 1 km från lossplatsen inom 36 h, när lossplatsen är en trakt', () => {
    const b = skotarBevis([pos('W', 150 + 9 * 60, norr(LOSS, 250))], INDATA(true));
    expect(b.ankomst).toMatchObject({ avstandM: 250, annanDag: true });
  });
  it('lossplatsen är verkstad/LBC: ingen ankomst, hur nära positionen än är', () => {
    expect(skotarBevis([pos('W', 200, norr(LOSS, 50))], INDATA(false)).ankomst).toBeUndefined();
  });
  it('bara den FÖRSTA positionen räknas; 36 h-gränsen gäller', () => {
    expect(skotarBevis([pos('W', 200, norr(LOSS, 5_000)), pos('W', 300, norr(LOSS, 50))], INDATA()).ankomst).toBeUndefined();
    expect(skotarBevis([pos('W', 150 + 36 * 60 + 5, norr(LOSS, 50))], INDATA()).ankomst).toBeUndefined();
  });
});

describe('ingen position = inget skäl, åt något håll', () => {
  it('tomt in → tomt ut', () => {
    expect(skotarBevis([], INDATA())).toEqual({});
  });
  it('positioner utan koordinat eller med trasig tid ignoreras', () => {
    const trasig: SkotarPos[] = [{ maskin_id: 'W', tid: 'inte en tid', lat: 56.2, lng: 14.7 }, { maskin_id: 'W', tid: iso(-10), lat: NaN, lng: 14.7 }];
    expect(skotarBevis(trasig, INDATA())).toEqual({});
  });
  it('saknas lastplatsens koordinat sägs inget om avgång, kvar eller långt', () => {
    const b = skotarBevis([pos('W', -10, norr(LAST, 100)), pos('W', 20, norr(LAST, 100))], { ...INDATA(), lassning: { tid: iso(0), lat: null, lng: null } });
    expect(b).toEqual({});
  });
  it('per maskin: en maskin utan positioner får ett tomt bevis', () => {
    const m = skotarBevisPerMaskin([pos('W', -22, norr(LAST, 757))], ['W', 'E'], INDATA());
    expect(m.get('W')?.avgang).toBeTruthy();
    expect(m.get('E')).toEqual({});
  });
});
