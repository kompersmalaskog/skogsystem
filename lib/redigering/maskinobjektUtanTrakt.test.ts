import { describe, it, expect } from 'vitest';
import { delaMaskinobjekt, altNummerForMaskinobjekt, mangdText, maskinText, type MaskinobjektRad } from './maskinobjektUtanTrakt';

// Prod 2026-10-24: 78 maskinobjekt "utan planering" i den gamla vyn Matchning; 77 avslutade, 3 körda senaste 30 dagarna.
const IDAG = new Date(2026, 9, 24);
const rad = (o: Partial<MaskinobjektRad>): MaskinobjektRad => ({ objektId: 'x', namn: null, voNummer: null, senasteAktivitet: null, skordatM3: 0, skotatM3: 0, ...o });

const MOLLERYD = rad({ objektId: '11166477', namn: 'Mölleryd RP J-Hus -25', voNummer: '11166477', senasteAktivitet: '2026-10-21', skordatM3: 900 });
const NY = rad({ objektId: '11299001', namn: 'Hult Au', voNummer: '11299001', senasteAktivitet: '2026-10-20', skotatM3: 120 });
const GAMMAL = rad({ objektId: '11100001', namn: 'Gamla', voNummer: '11100001', senasteAktivitet: '2026-06-02', skordatM3: 400 });
const KONSTIG = rad({ objektId: 'A130743_7', namn: 'Tjuvön GROT', voNummer: '_280826-124507', senasteAktivitet: '2026-10-22', skotatM3: 300 });
const SOM_FIL = rad({ objektId: '11271849', namn: 'Bågskyttebanan', voNummer: '11271849', senasteAktivitet: '2026-10-22' });

describe('maskinobjekt utan trakt', () => {
  const alias = [{ objekt_id: 'mol', nummer: '11166477', maskin_id: null }];
  const ut = delaMaskinobjekt([MOLLERYD, NY, GAMMAL, KONSTIG, SOM_FIL], alias, new Set(['11271849']), IDAG);

  it('kopplad via extra nummer (Mölleryd) syns inte alls — inget falsklarm', () => {
    expect([...ut.aktuella, ...ut.tysta].map(r => r.objektId)).not.toContain('11166477');
  });
  it('kört de senaste 30 dagarna och ett nummer som går att koppla = en fråga', () => {
    expect(ut.aktuella.map(r => r.objektId)).toEqual(['11299001']);
  });
  it('gammalt eller nummer som inte går att koppla ligger tyst', () => {
    expect(ut.tysta.map(r => r.objektId)).toEqual(['A130743_7', '11100001']);
  });
  it('samma nummer som en maskinfil utan objekt frågas inte två gånger', () => {
    expect([...ut.aktuella, ...ut.tysta].map(r => r.objektId)).not.toContain('11271849');
  });
  it('koppla skriver ett extra nummer, aldrig något annat; konstiga nummer går inte', () => {
    expect(altNummerForMaskinobjekt(NY, 'uuid-1')).toEqual({ objekt_id: 'uuid-1', nummer: '11299001', maskin_id: null, kalla: 'manuell', filnamn: null });
    expect(altNummerForMaskinobjekt(KONSTIG, 'uuid-1')).toBeNull();
  });
  it('texterna', () => {
    expect(mangdText(rad({ skordatM3: 8.4, skotatM3: 8 }))).toBe('8 m³ skördat · 8 m³ skotat');
    expect(mangdText(rad({}))).toBeNull();
    expect(maskinText(rad({ maskiner: [{ id: 'A', modell: 'Giant' }, { id: 'B', modell: null }] }))).toBe('Giant, B');
  });
});
