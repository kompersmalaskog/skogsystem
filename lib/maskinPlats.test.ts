import { describe, it, expect } from 'vitest';
import { gpsVinner, slaIhopMedGps, type PlatsLik } from './maskinPlats';
import type { MaskinPosRad } from './maskinerNu';

const plats = (tidpunkt: string, over: Partial<PlatsLik> = {}): PlatsLik =>
  ({ namn: 'Edestad', koordinat: { lat: 56.23, lng: 15.35 }, objektId: 'u-edestad', platsId: null, tidpunkt, kalla: 'produktion', osaker: null, ...over });
const gps = (maskin_id: string, tid: string | null, over: Partial<MaskinPosRad> = {}): MaskinPosRad =>
  ({ maskin_id, roll: 'skordare', objekt_id: 'u-bondeskog', objekt_namn: 'Bondeskog AU 2026', datum: tid ? tid.slice(0, 10) : '2026-11-05', lat: 56.66, lng: 15.36, tid, ...over });

describe('slaIhopMedGps — en plats per maskin, nyast vinner', () => {
  it('Giant 5 nov: GPS på Bondeskog 08:16 slår gårdagens produktion på Edestad', () => {
    const ut = slaIhopMedGps(new Map([['GIANT', plats('2026-11-04')]]), [gps('GIANT', '2026-11-05T08:16:48Z')]);
    expect(ut.get('GIANT')).toMatchObject({ namn: 'Bondeskog AU 2026', objektId: 'u-bondeskog', kalla: 'position', tidpunkt: '2026-11-05T08:16:48Z' });
  });
  it('samma dag: GPS:en vinner över en produktionsdag (som saknar klockslag)', () => {
    expect(gpsVinner('2026-11-05T08:16:48Z', plats('2026-11-05'))).toBe(true);
  });
  it('samma dag: en flytt som avslutades EFTER sista GPS-punkten vinner — maskinen står där lastbilen lämnade den', () => {
    expect(gpsVinner('2026-11-05T07:00:00Z', plats('2026-11-05T10:30:00Z', { kalla: 'flytt' }))).toBe(false);
    expect(gpsVinner('2026-11-05T11:00:00Z', plats('2026-11-05T10:30:00Z', { kalla: 'flytt' }))).toBe(true);
  });
  it('en senare produktionsdag slår en äldre GPS-punkt (appen var avstängd)', () => {
    const ut = slaIhopMedGps(new Map([['H8E', plats('2026-11-05')]]), [gps('H8E', '2026-11-03T14:00:00Z')]);
    expect(ut.get('H8E')).toMatchObject({ namn: 'Edestad', kalla: 'produktion' });
  });
  it('810E utan GPS behåller sin plats; en maskin som bara har GPS kommer med', () => {
    const ut = slaIhopMedGps(new Map([['JD810E', plats('2026-11-04', { namn: 'Vashult' })]]), [gps('WISENT', '2026-11-05T08:16:00Z')]);
    expect(ut.get('JD810E')).toMatchObject({ namn: 'Vashult' });
    expect(ut.get('WISENT')).toMatchObject({ kalla: 'position' });
  });
  it('trasiga GPS-punkter räknas aldrig (null-ön, utanför Norden)', () => {
    const ut = slaIhopMedGps(new Map([['GIANT', plats('2026-11-04')]]), [gps('GIANT', '2026-11-05T08:00:00Z', { lat: 0, lng: 0 }), gps('X', '2026-11-05T08:00:00Z', { lat: 40, lng: 2 })]);
    expect(ut.get('GIANT')).toMatchObject({ kalla: 'produktion' });
    expect(ut.has('X')).toBe(false);
  });
  it('en plats utan koordinat eller tid förlorar alltid mot en GPS-punkt', () => {
    expect(gpsVinner('2026-11-01T08:00:00Z', plats('2026-11-05', { koordinat: null }))).toBe(true);
    expect(gpsVinner('2026-11-01T08:00:00Z', plats('', { tidpunkt: null }))).toBe(true);
  });
});
