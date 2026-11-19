import { describe, expect, it } from 'vitest';
import { MATDON_DAGAR, matdonLage } from './matdon';
import { byggMatdonNotis, dagsAttKoaMatdon, matdonDedup, matdonText } from './matdonNotis';
import { arKallt, kontrollSammanfattning } from './kontrollLista';
import { kontrollHuvud } from './kontrollSvar';

const nu = new Date('2026-11-18T09:00:00Z');
const dagarSedan = (n: number) => ({ id: 'x', at: new Date(nu.getTime() - n * 86_400_000).toISOString(), av: null });

describe('klave och måttband', () => {
  it('aldrig = dags; inom ett kvartal = inte dags; över = dags', () => {
    expect(matdonLage(null, nu)).toMatchObject({ varde: 'Aldrig kollade', dags: true });
    expect(matdonLage(dagarSedan(MATDON_DAGAR - 1), nu).dags).toBe(false);
    expect(matdonLage(dagarSedan(MATDON_DAGAR + 1), nu)).toMatchObject({ dags: true, under: 'Dags att kolla' });
    expect(matdonLage(dagarSedan(0), nu).varde).toBe('Kollade 18 nov');
  });
  it('pushen: vardag från 07 svensk tid, en per kvartal, ingen text när kollad', () => {
    expect(dagsAttKoaMatdon(new Date('2026-11-18T05:59:00Z'))).toBe(false); // 06:59
    expect(dagsAttKoaMatdon(new Date('2026-11-18T06:00:00Z'))).toBe(true);
    expect(dagsAttKoaMatdon(new Date('2026-11-21T10:00:00Z'))).toBe(false); // lördag
    expect(matdonDedup('R64428', nu)).toBe('matdon:R64428:2026-Q4');
    expect(matdonText('Giant', dagarSedan(10), nu)).toBeNull();
    expect(matdonText('Giant', null, nu)?.title).toBe('Kolla klaven och måttbandet · Giant');
  });
  it('byggNotis: kollad sedan köandet → hoppas över, läsfel → uppskjuts', async () => {
    const n = { payload: { maskin_id: 'R64428' }, skapad_at: nu.toISOString() };
    expect((await byggMatdonNotis(n, async () => ({ namn: 'H8E -26', senaste: dagarSedan(1) }), nu)).typ).toBe('hoppa_over');
    expect((await byggMatdonNotis(n, async () => null, nu)).typ).toBe('uppskjut');
    const u = await byggMatdonNotis(n, async () => ({ namn: 'H8E -26', senaste: null }), nu);
    expect(u.typ === 'skicka' && u.meddelande.url).toBe('/kalibrering?matdon=R64428');
  });
});

describe('sträng kyla och kontrollerna i fönstret', () => {
  it('gränsen −7 °C räknas in, saknad temperatur är aldrig kallt', () => {
    expect(arKallt({ temperature_c: -7 })).toBe(true);
    expect(arKallt({ temperature_c: -6.9 })).toBe(false);
    expect(arKallt(null)).toBe(false);
  });
  it('sammanfattningen: bara fönstret, slump null när urvalet inte är läst', () => {
    const k = [
      { filnamn: 'a', datum: '2026-10-21T00:00:00', weather_at_harvest: { temperature_c: -9 } },
      { filnamn: 'b', datum: '2026-06-01T00:00:00', weather_at_harvest: { temperature_c: -9 } },
    ] as any;
    expect(kontrollSammanfattning(k, null, '2026-08-01')).toEqual({ antal: 1, slump: null, kalla: 1, senaste: '2026-10-21' });
  });
  it('kontrollarket säger kylan, och bara då', () => {
    const data = (t: number) => ({ kontroll: { datum: '2026-01-10T00:00:00', tradslag: 'gran', weather_at_harvest: { temperature_c: t } }, stockar: [] }) as any;
    expect(kontrollHuvud(data(-9.4), '2026-11-18').kyla).toMatch(/^Det var −9 °C\. Under −7 °C/);
    expect(kontrollHuvud(data(2), '2026-11-18').kyla).toBeNull();
  });
});
