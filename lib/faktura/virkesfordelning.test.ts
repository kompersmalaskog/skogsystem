// "Var låg virket?" — fördelningen av traktens volym på avstånd från avlägget.
//
// FACIT är Skälviken i prod 2026-11-25: databasen räknade samma rutor med
// samma algoritm, och TypeScript måste ge samma tal. Går de isär är ett av
// dem fel, och rapporten skulle säga något annat än underlaget.
import { describe, it, expect } from 'vitest';
import { virkesfordelning, RUTA_M, type Stam } from './virkesfordelning';
import {
  SKALVIKEN_AVLAGG, SKALVIKEN_FACIT, SKALVIKEN_RUTOR,
} from './__fixtures__/skalviken_virke_2026-11-25';

describe('FACIT: Skälviken ur prod', () => {
  const f = virkesfordelning(SKALVIKEN_RUTOR, [SKALVIKEN_AVLAGG])!;

  it('samma klasser och samma m³fub som databasen räknade', () => {
    expect(f.klasser.map(k => ({ fran: k.fran, m3fub: k.m3fub }))).toEqual(SKALVIKEN_FACIT);
  });

  it('summan är traktens skördade volym — samma tal fakturan räknar på', () => {
    expect(f.summaM3fub).toBe(1746);
    // Och den går att räkna ihop ur raderna: en total som inte stämmer med
    // sina delar läses som ett räknefel, mitt framför inköparen.
    expect(f.klasser.reduce((s, k) => s + k.m3fub, 0)).toBe(f.summaM3fub);
  });

  it('andelarna summerar till 100, aldrig 99 eller 101', () => {
    expect(f.klasser.reduce((s, k) => s + k.andel, 0)).toBe(100);
  });

  it('... också när avrundningen drar isär', () => {
    // Skälvikens egna tal råkar gå jämnt upp också med vanlig avrundning, så
    // facit ensamt vaktar inte regeln. Tre lika delar gör det: 33,33 % var
    // blir 33+33+33 = 99 med Math.round, och en tabell vars procent slutar på
    // 99 läses som ett räknefel mitt framför inköparen.
    const dLat = RUTA_M / 111320;
    const avlagg = { lat: 56.2850, lng: 15.3750 };
    const tre = virkesfordelning([
      { lat: 56.2850 + dLat * 2, lng: 15.3750, volym: 10 },   // ~50 m
      { lat: 56.2850 + dLat * 8, lng: 15.3750, volym: 10 },   // ~160 m
      { lat: 56.2850 + dLat * 14, lng: 15.3750, volym: 10 },  // ~280 m
    ], [avlagg])!;
    expect(tre.klasser.map(k => k.andel)).toEqual([34, 33, 33]);
    expect(tre.klasser.reduce((s, k) => s + k.andel, 0)).toBe(100);
  });

  it('201 rutor bakom talen', () => {
    expect(f.rutor).toBe(201);
  });

  it('etiketterna läses som intervall, med tankstreck', () => {
    expect(f.klasser.map(k => k.etikett)).toEqual([
      'under 100 m', '100–200 m', '200–300 m', '300–400 m', '400–500 m', '500–600 m',
    ]);
  });
});

describe('rutläggningen', () => {
  /** Grader per 20 m på Skälvikens latitud. */
  const dLat = RUTA_M / 111320;

  it('stammar i samma ruta blir EN ruta med summerad volym', () => {
    // Tre stammar inom några meter: en ruta, 6 m³fub.
    const nara: Stam[] = [
      { lat: 56.2850, lng: 15.3750, volym: 1 },
      { lat: 56.28501, lng: 15.37501, volym: 2 },
      { lat: 56.28502, lng: 15.375015, volym: 3 },
    ];
    const f = virkesfordelning(nara, [{ lat: 56.2850, lng: 15.3750 }])!;
    expect(f.rutor).toBe(1);
    expect(f.summaM3fub).toBe(6);
  });

  it('stammar 100 m isär hamnar i olika rutor och olika klasser', () => {
    const avlagg = { lat: 56.2850, lng: 15.3750 };
    const f = virkesfordelning([
      { lat: 56.2850 + dLat * 2, lng: 15.3750, volym: 10 },   // ~50 m
      { lat: 56.2850 + dLat * 13, lng: 15.3750, volym: 20 },  // ~260 m
    ], [avlagg])!;
    expect(f.klasser.map(k => k.fran)).toEqual([0, 200]);
    expect(f.klasser.map(k => k.m3fub)).toEqual([10, 20]);
  });

  it('en stam räknas från NÄRMASTE avlägg, inte det första', () => {
    // Stammen ligger 20 m från avlägg B men ~550 m från A.
    const a = { lat: 56.2900, lng: 15.3750 };
    const b = { lat: 56.2850, lng: 15.3750 };
    const stam: Stam = { lat: 56.2850 + dLat, lng: 15.3750, volym: 5 };
    expect(virkesfordelning([stam], [a, b])!.klasser[0].fran).toBe(0);
    // Med bara A hamnar samma virke fem klasser bort.
    expect(virkesfordelning([stam], [a])!.klasser[0].fran).toBe(500);
  });
});

describe('ärligt när underlaget saknas', () => {
  it('utan avlägg finns ingen fördelning — aldrig en tabell av nollor', () => {
    expect(virkesfordelning([{ lat: 56.285, lng: 15.375, volym: 1 }], [])).toBeNull();
  });

  it('utan stammar med volym likaså', () => {
    const a = [{ lat: 56.285, lng: 15.375 }];
    expect(virkesfordelning([], a)).toBeNull();
    expect(virkesfordelning([{ lat: 56.285, lng: 15.375, volym: 0 }], a)).toBeNull();
  });

  it('stammar utan plats eller volym räknas inte, och antalet SÄGS', () => {
    const f = virkesfordelning([
      { lat: 56.285, lng: 15.375, volym: 4 },
      { lat: NaN, lng: 15.375, volym: 9 },
      { lat: 56.285, lng: 15.375, volym: NaN },
      { lat: 56.285, lng: 15.375, volym: -1 },
    ], [{ lat: 56.285, lng: 15.375 }])!;
    expect(f.summaM3fub).toBe(4);
    expect(f.utan).toBe(3);
  });

  it('virke längre bort än 900 m samlas i en sista rad', () => {
    const avlagg = { lat: 56.2850, lng: 15.3750 };
    const f = virkesfordelning([
      { lat: 56.2850 + (RUTA_M / 111320) * 60, lng: 15.3750, volym: 7 }, // ~1 200 m
    ], [avlagg])!;
    expect(f.klasser[0].etikett).toBe('900 m och längre');
  });
});
