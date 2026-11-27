// Lasscykeln: halveringen, viktningen och de tre talen.
//
// FACIT ÄR PROD 2026-11-18 (SQL-funktionen `skotar_lass_cykel`, volymviktat):
//
//   trakt         lass  cykel  ÷2   hem  vid avl.  ytterst
//   Skälviken       85   1477  739   660      250      416
//   Arvidstorp      22   1032  516   465      243      285
//   Steglehylte     16    917  458   292      150      187
//   Vällust         20    905  452   320      276      185
//   Mölleryd        38    453  227   138      180      142
//
// Skälvikens fågelväg till stamhögarna är 377 m, hemresan 660, cykel ÷ 2 = 739.
// De tre talen är tre tolkningar av samma körning, och den här filen vaktar att
// de inte blandas ihop.
import { describe, it, expect } from 'vitest';
import {
  CYKEL, SKAL_TEXT, cykelTillAvstandsLass, sammanstallCykel,
  type LassCykel,
} from './lassCykel';
import { valjLassKalla, lassMedStracka } from './lassAvstand';
import { skotAvstandKr } from '@/lib/ekonomi/acord';

const PRIS = [{ grundavstand_m: 200, kr_per_100m: 4, giltig_fran: null, giltig_till: null }];

const rad = (o: Partial<LassCykel> = {}): LassCykel => ({
  lassId: 'L1', voNummer: '11271860', maskinId: 'A130743', datum: '2026-11-02',
  volym: 20, cykelM: 1000, punkter: 120, vidAvlaggetM: 200,
  hemMedLassM: 400, ytterstM: 350, skal: 'ok', ...o,
});

describe('cykeln → lass som bär tillägg', () => {
  it('avståndet är UT TILL VIRKET, inte halva cykeln', () => {
    // Beslut Martin 2026-11-25: tillägget betalar transporten mellan virket
    // och avlägget. Halva cykeln (738,5) räknar in sortering vid avlägget och
    // körning mellan högarna, som är betalda i kubikpriset.
    const [l] = cykelTillAvstandsLass([rad({ cykelM: 1477, ytterstM: 416 })]);
    expect(l.avstandM).toBe(416);
  });

  it('halveras INTE — talet är redan enkel väg', () => {
    // Fågelvägen från avlägget till den yttersta punkten är enkel väg i sig.
    // En halvering här hade gett 208 m, under grundavståndet, alltså 0 kr.
    const [l] = cykelTillAvstandsLass([rad({ cykelM: 1477, ytterstM: 416 })]);
    expect(l.avstandM).toBeGreaterThan(400);
  });

  it('lass utan cykel bär 0 kr men räknas som lass', () => {
    const lass = cykelTillAvstandsLass([
      rad({ lassId: 'A', skal: 'forsta_lasset', cykelM: null, volym: 18 }),
      rad({ lassId: 'B', skal: 'ok', cykelM: 1000, volym: 20 }),
    ]);
    expect(lass[0].avstandM).toBeNull();
    expect(lass[0].volym).toBe(18);
    // Det bärande lasset är bara B, men båda väger när källorna jämförs.
    expect(lassMedStracka(valjLassKalla(lass))).toHaveLength(1);
    expect(valjLassKalla(lass)).toHaveLength(2);
  });

  it('ett lass märkt ok men utan mätt avstånd bär ändå 0 kr', () => {
    // Skulle SQL:en någon gång svara ok med null (den gör det inte), är noll
    // kronor rätt svar — aldrig NaN eller 0 meter.
    const [l] = cykelTillAvstandsLass([rad({ skal: 'ok', cykelM: null, ytterstM: null })]);
    expect(l.avstandM).toBeNull();
    expect(skotAvstandKr('2026-11-02', l.avstandM ?? 0, l.volym, PRIS)).toBe(0);
  });
});

describe('sammanställningen för granskningen', () => {
  it('Skälvikens facit: 1477 → 739 enkel väg', () => {
    // Tre lass med samma volym ger samma viktade snitt som ett.
    const s = sammanstallCykel([
      rad({ lassId: 'A', cykelM: 1477, hemMedLassM: 660, vidAvlaggetM: 250, ytterstM: 416 }),
      rad({ lassId: 'B', cykelM: 1477, hemMedLassM: 660, vidAvlaggetM: 250, ytterstM: 416 }),
      rad({ lassId: 'C', cykelM: 1477, hemMedLassM: 660, vidAvlaggetM: 250, ytterstM: 416 }),
    ]);
    expect(s.cykelM).toBeCloseTo(1477, 0);
    expect(s.enkelVagM).toBeCloseTo(738.5, 1);
    expect(s.hemMedLassM).toBeCloseTo(660, 0);
    expect(s.vidAvlaggetM).toBeCloseTo(250, 0);
    expect(s.ytterstM).toBeCloseTo(416, 0);
  });

  it('VIKTAT PÅ VOLYM, aldrig snitt av snitt', () => {
    // Ett 60 m³-lass 1200 m och tre 10 m³-lass 200 m.
    // Snitt av snitt: (1200 + 200·3) / 4 = 450. Viktat: (1200·60 + 200·30) / 90 = 866,7.
    const s = sammanstallCykel([
      rad({ lassId: 'A', cykelM: 1200, volym: 60 }),
      rad({ lassId: 'B', cykelM: 200, volym: 10 }),
      rad({ lassId: 'C', cykelM: 200, volym: 10 }),
      rad({ lassId: 'D', cykelM: 200, volym: 10 }),
    ]);
    expect(s.cykelM).toBeCloseTo(866.67, 1);
    expect(s.cykelM).not.toBeCloseTo(450, 0);
  });

  it('bara lass MED cykel väger i snittet, men volymen syns ändå', () => {
    const s = sammanstallCykel([
      rad({ lassId: 'A', cykelM: 1000, volym: 20 }),
      rad({ lassId: 'B', cykelM: 1000, volym: 20 }),
      rad({ lassId: 'C', cykelM: 1000, volym: 20 }),
      rad({ lassId: 'D', skal: 'fonster_for_langt', cykelM: null, volym: 100 }),
    ]);
    expect(s.cykelM).toBeCloseTo(1000, 0);
    expect(s.volym).toBe(160);
    expect(s.volymMedCykel).toBe(60);
    expect(s.medCykel).toBe(3);
    expect(s.lass).toBe(4);
  });

  it('under MIN_LASS är snittet null — aldrig ett tal ur två lass', () => {
    const s = sammanstallCykel([rad({ lassId: 'A' }), rad({ lassId: 'B' })]);
    expect(CYKEL.MIN_LASS).toBe(3);
    expect(s.cykelM).toBeNull();
    expect(s.enkelVagM).toBeNull();
    expect(s.medCykel).toBe(2);
  });

  it('inga lass alls ger null, inte 0 meter', () => {
    const s = sammanstallCykel([]);
    expect(s.cykelM).toBeNull();
    expect(s.enkelVagM).toBeNull();
    expect(s.lass).toBe(0);
    expect(s.utan).toEqual({});
  });

  it('volym 0 på alla lass ger null, inte division med noll', () => {
    const s = sammanstallCykel([
      rad({ lassId: 'A', volym: 0 }), rad({ lassId: 'B', volym: 0 }), rad({ lassId: 'C', volym: 0 }),
    ]);
    expect(s.cykelM).toBeNull();
  });

  it('räknar varför lass saknar cykel — varje orsak har en text', () => {
    const s = sammanstallCykel([
      rad({ lassId: 'A', skal: 'forsta_lasset', cykelM: null }),
      rad({ lassId: 'B', skal: 'fonster_for_langt', cykelM: null }),
      rad({ lassId: 'C', skal: 'fonster_for_langt', cykelM: null }),
      rad({ lassId: 'D', skal: 'ok', cykelM: 1000 }),
    ]);
    expect(s.utan).toEqual({ forsta_lasset: 1, fonster_for_langt: 2 });
    for (const orsak of Object.keys(s.utan)) {
      expect(SKAL_TEXT[orsak as keyof typeof SKAL_TEXT]).toBeTruthy();
    }
  });

  it('en orsak som inte finns står inte i listan — ingen 0-rad', () => {
    const s = sammanstallCykel([
      rad({ lassId: 'A' }), rad({ lassId: 'B' }), rad({ lassId: 'C' }),
    ]);
    expect(s.utan).toEqual({});
  });

  it('en delsumma som inte går att läsa drar inte ner snittet', () => {
    // Två lass har hemresan, ett saknar den: snittet räknas på de två.
    const s = sammanstallCykel([
      rad({ lassId: 'A', hemMedLassM: 600 }),
      rad({ lassId: 'B', hemMedLassM: 600 }),
      rad({ lassId: 'C', hemMedLassM: null }),
    ]);
    expect(s.hemMedLassM).toBeCloseTo(600, 0);
    expect(s.cykelM).toBeCloseTo(1000, 0);
  });
});

describe('priset', () => {
  it('Skälviken: 414 m ger 12 kr/m³fub, halva cykeln 739 hade gett 24', () => {
    // FACIT: Martin satt 450 m för hand och Vida betalade 12 kr/m³fub.
    // 414 (det mätta avståndet ut) ligger i samma prissteg. Halva cykeln hade
    // dubblat tillägget mot det han fakturerade.
    expect(skotAvstandKr('2026-11-02', 414, 1, PRIS)).toBe(12);
    expect(skotAvstandKr('2026-11-02', 450, 1, PRIS)).toBe(12);
    expect(skotAvstandKr('2026-11-02', 739, 1, PRIS)).toBe(24);
  });
});

describe('zonen som skiljer landningsarbete från skotning', () => {
  it('AVLAGG_ZON_M är 60 m och måste stämma med SQL', () => {
    expect(CYKEL.AVLAGG_ZON_M).toBe(60);
  });
});
