import { describe, it, expect } from 'vitest';
import { ORIMLIG_VOLYM_NYCKEL, RIMLIG_M3FUB_PER_HA, orimligVolymText, volymPerHa } from './rimlighet';
import { klassaVarning } from './varningar';

const NB = '\u00a0';

describe('rimlighetskontroll volym/areal', () => {
  it('Bågskyttebanan: texten skriver ut båda talen och per hektar', () => {
    expect(orimligVolymText('slutavverkning', 3495, 5.68)).toBe(`3${NB}495 m³fub på 5,68 ha är 615 per hektar. Kontrollera mot stämplingslängden.`);
  });

  it('gränserna: slutavverkning 90–450, gallring 15–80 (gränsvärdet själv är rimligt)', () => {
    const ha = 10;
    const slut = (perHa: number) => orimligVolymText('slutavverkning', perHa * ha, ha);
    const gall = (perHa: number) => orimligVolymText('gallring', perHa * ha, ha);
    expect(slut(89.9)).not.toBeNull(); expect(slut(90)).toBeNull(); expect(slut(450)).toBeNull(); expect(slut(450.1)).not.toBeNull();
    expect(gall(14.9)).not.toBeNull(); expect(gall(15)).toBeNull(); expect(gall(80)).toBeNull(); expect(gall(80.1)).not.toBeNull();
    expect(RIMLIG_M3FUB_PER_HA).toEqual({ slutavverkning: { min: 90, max: 450 }, gallring: { min: 15, max: 80 } });
  });

  it('hela det observerade intervallet i prod (utan Bågskyttebanan) larmar inte', () => {
    // m³fub/ha, prod 2026-10-20: gallring n=13 19–63 (median 30), slutavverkning n=26 96–417 (median 256).
    for (const v of [19, 30, 63]) expect(orimligVolymText('gallring', v * 5, 5)).toBeNull();
    for (const v of [96, 256, 417]) expect(orimligVolymText('slutavverkning', v * 5, 5)).toBeNull();
    // Bågskyttebanans rättade tal (1 884 m³sk ≈ 1 560 m³fub på 5,68 ha = 274/ha) landar mitt i fördelningen.
    expect(orimligVolymText('slutavverkning', 1560, 5.68)).toBeNull();
  });

  it('inte bedömbart ger ingen fråga: saknad eller nollad volym/areal, GROT, okänd typ', () => {
    expect(orimligVolymText('slutavverkning', null, 5)).toBeNull();
    expect(orimligVolymText('slutavverkning', 3000, null)).toBeNull();
    expect(orimligVolymText('slutavverkning', 3000, 0)).toBeNull();
    expect(orimligVolymText('slutavverkning', 0, 5)).toBeNull();
    expect(orimligVolymText('grot', 9999, 1)).toBeNull();
    expect(orimligVolymText(null, 9999, 1)).toBeNull();
    expect(volymPerHa('abc', 5)).toBeNull();
  });

  it('importens rad klassas som en fråga med nyckeln orimlig_volym', () => {
    const text = orimligVolymText('slutavverkning', 3495, 5.68)!;
    expect(klassaVarning(text)).toEqual({ nyckel: ORIMLIG_VOLYM_NYCKEL, sort: 'fraga', text });
  });
});
