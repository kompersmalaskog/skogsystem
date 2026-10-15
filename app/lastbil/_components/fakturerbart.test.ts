import { describe, it, expect } from 'vitest';
import { arGodkand, sorteraUnderlag, summeraFakturerbart, underlagStatus, type FaktureratRad, type UnderlagRad } from './fakturerbart';

// De åtta riktiga raderna i fakturaunderlag_flytt (prod 2026-10-15, efter backfill-godkännandet):
// alla status 'aktiv', ingen fakturerad, alla godkända med skapad_tid.
const GODKAND = '2026-09-17T13:27:49Z';
const rad = (km: number | null, o: Partial<FaktureratRad> = {}): FaktureratRad => ({ km, status: 'aktiv', fakturerad_tid: null, godkand_tid: GODKAND, ...o });
const REAL: FaktureratRad[] = [34, 40, 31, 47, 49, 44, 36, 53].map(km => rad(km));

describe('summeraFakturerbart', () => {
  it('de åtta riktiga flyttarna: 334 km, alla hos faktureringen', () => {
    expect(summeraFakturerbart(REAL)).toEqual({ km: 334, antal: 8, hos: 8, fakturerad: 0, struken: 0, utanKm: 0, vantar: 0 });
  });

  it('oktober (36 + 53) = 89 km', () => {
    expect(summeraFakturerbart(REAL.slice(6)).km).toBe(89);
  });

  it('en struken flytt är inte fakturerbar: ingen km, inget antal, men den räknas som struken', () => {
    const r = summeraFakturerbart([...REAL, rad(100, { status: 'struken' })]);
    expect(r.km).toBe(334);
    expect(r.antal).toBe(8);
    expect(r.struken).toBe(1);
  });

  it('fakturerad räknas separat från hos faktureringen', () => {
    const r = summeraFakturerbart([
      rad(50, { fakturerad_tid: '2026-10-09T08:00:00Z' }),
      rad(40),
    ]);
    expect(r).toMatchObject({ antal: 2, hos: 1, fakturerad: 1, km: 90 });
  });

  it('summan är summan av avrundade delar, inte råsumman avrundad', () => {
    // 10,4 + 10,4 + 10,4 = 31,2 → 31 (rå). Avrundade delar: 10 + 10 + 10 = 30, och det är det som visas.
    const rader = [10.4, 10.4, 10.4].map(km => rad(km));
    expect(summeraFakturerbart(rader).km).toBe(30);
  });

  it('en flytt utan km räknas i antal men adderar ingen km (och syns som utanKm)', () => {
    const r = summeraFakturerbart([rad(null), rad(31)]);
    expect(r).toMatchObject({ km: 31, antal: 2, utanKm: 1 });
  });

  it('inga rader → nollor (det är lästa utan fel; ett läsfel hanteras av hooken, aldrig här)', () => {
    expect(summeraFakturerbart([])).toEqual({ km: 0, antal: 0, hos: 0, fakturerad: 0, struken: 0, utanKm: 0, vantar: 0 });
  });
});

describe('godkännandet (migration 20261015150000)', () => {
  it('en OGODKÄND flytt ingår inte i pengatalet — den väntar', () => {
    const r = summeraFakturerbart([...REAL, rad(60, { godkand_tid: null })]);
    expect(r).toMatchObject({ km: 334, antal: 8, hos: 8, vantar: 1 });
  });

  it('en ogodkänd flytt utan km räknas inte heller som "utan km"', () => {
    expect(summeraFakturerbart([rad(null, { godkand_tid: null })])).toMatchObject({ antal: 0, utanKm: 0, vantar: 1, km: 0 });
  });

  it('en struken flytt som aldrig godkänts är struken, inte väntande', () => {
    expect(summeraFakturerbart([rad(60, { godkand_tid: null, status: 'struken' })])).toMatchObject({ struken: 1, vantar: 0, antal: 0 });
  });

  it('en redan fakturerad flytt räknas som godkänd även om godkand_tid saknas', () => {
    expect(arGodkand({ godkand_tid: null, fakturerad_tid: '2026-10-09T08:00:00Z' })).toBe(true);
    expect(arGodkand({ godkand_tid: null, fakturerad_tid: null })).toBe(false);
    expect(arGodkand({ godkand_tid: GODKAND, fakturerad_tid: null })).toBe(true);
  });

  it('underlagStatus: struken > fakturerad > godkänd (hos) > att godkänna', () => {
    const u = (o: Partial<FaktureratRad>) => underlagStatus(rad(10, o));
    expect(u({ status: 'struken', godkand_tid: null })).toBe('struken');
    expect(u({ fakturerad_tid: '2026-10-09T08:00:00Z' })).toBe('fakturerad');
    expect(u({})).toBe('hos');
    expect(u({ godkand_tid: null })).toBe('att_godkanna');
  });

  it('sorteringen: att godkänna överst (ÄLDSTA först), sedan hos, fakturerade, strukna (nyast först)', () => {
    const u = (id: string, datum: string, o: Partial<FaktureratRad> = {}): UnderlagRad => ({
      ...rad(10, o), id, kund: null, datum, maskin: 'M', fran_objekt_id: null, fran_plats_id: null, till_objekt_id: null, till_plats_id: null,
      struken_tid: null, struken_anledning: null, godkand_av: null,
    });
    const sorterat = sorteraUnderlag([
      u('hos-ny', '2026-10-06'), u('stryk', '2026-10-07', { status: 'struken' }), u('vantar-ny', '2026-10-05', { godkand_tid: null }),
      u('fakt', '2026-10-02', { fakturerad_tid: '2026-10-09T08:00:00Z' }), u('vantar-gammal', '2026-09-20', { godkand_tid: null }), u('hos-gammal', '2026-09-01'),
    ]);
    expect(sorterat.map(r => r.id)).toEqual(['vantar-gammal', 'vantar-ny', 'hos-ny', 'hos-gammal', 'fakt', 'stryk']);
  });
});

