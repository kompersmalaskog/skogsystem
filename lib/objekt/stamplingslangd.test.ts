import { describe, it, expect } from 'vitest';
import { AVVIKELSE_GRANS, M3SK_TILL_M3FUB, avvikelseText, faktorText, jamfor, stamplingsText, tillM3fub } from './stamplingslangd';
import { volymFragor } from './filenGav';

const NB = '\u00a0';

describe('stämplingslängdens tal', () => {
  it('faktorn är en namngiven konstant, 0,83, och syns i texten', () => {
    expect(M3SK_TILL_M3FUB).toBe(0.83);
    expect(faktorText()).toBe('× 0,83');
    expect(tillM3fub(1884, 'm3sk')).toBeCloseTo(1563.72, 2);
    expect(tillM3fub(1560, 'm3fub')).toBe(1560);
  });

  it('1 884 m³sk visas som 1 884 m³sk ≈ 1 564 m³fub; m³fub visas som det är', () => {
    expect(stamplingsText(jamfor(1560, 1884, 'm3sk')!)).toBe(`1${NB}884 m³sk ≈ 1${NB}564 m³fub`);
    expect(stamplingsText(jamfor(1560, 1560, 'm3fub')!)).toBe(`1${NB}560 m³fub`);
  });

  it('avvikelse mer än 15 % är en fråga, 15 % exakt är det inte — mätt mot stämplingslängden i m³fub', () => {
    expect(AVVIKELSE_GRANS).toBe(0.15);
    expect(jamfor(1150, 1000, 'm3fub')!.avviker).toBe(false); // exakt 15 %
    expect(jamfor(1151, 1000, 'm3fub')!.avviker).toBe(true);
    expect(jamfor(850, 1000, 'm3fub')!.avviker).toBe(false);
    expect(jamfor(849, 1000, 'm3fub')!.avviker).toBe(true);
  });

  it('ingen jämförelse utan tal eller giltig enhet; saknad volym avviker inte', () => {
    expect(jamfor(1560, null, null)).toBeNull();
    expect(jamfor(1560, 0, 'm3sk')).toBeNull();
    expect(jamfor(1560, 1884, 'kubik')).toBeNull();
    expect(jamfor(null, 1884, 'm3sk')!.avviker).toBe(false);
  });

  it('Bågskyttebanan: 3 495 m³fub mot 1 884 m³sk avviker 124 % och frågan skriver ut båda talen och faktorn', () => {
    expect(avvikelseText(3495, jamfor(3495, 1884, 'm3sk'))).toBe(
      `Volymen 3${NB}495 m³fub avviker 124 % från stämplingslängden, 1${NB}884 m³sk ≈ 1${NB}564 m³fub (× 0,83). Kontrollera vilket tal som stämmer.`);
  });

  it('volymFragor: orimlig volym och avvikelse är två olika frågor; rättad volym ger ingen', () => {
    const bag = { namn: 'Bågskyttebanan RP J-Hus- 25', stamplingslangd_url: 'sl.pdf', typ: 'slutavverkning', volym: 3495, areal: 5.68, stamplingslangd_volym: 1884, stamplingslangd_enhet: 'm3sk' };
    expect(volymFragor(bag).map(f => f.nyckel)).toEqual(['orimlig_volym', 'stamplingslangd_avviker']);
    expect(volymFragor({ ...bag, volym: 1560 })).toEqual([]); // 274/ha, och 0,2 % från 1 564
    expect(volymFragor({ ...bag, stamplingslangd_volym: null, stamplingslangd_enhet: null }).map(f => f.nyckel)).toEqual(['orimlig_volym']);
  });
});
