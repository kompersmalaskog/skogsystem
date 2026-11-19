import { describe, expect, it } from 'vitest';
import { _tomEra5Cache, hamtaEra5, rutaAv, tolkaEra5 } from './era5';
import { frostCellText, frostSvar, frostVy, virketsLage, type FrostRad } from './frost';
import { frostRader, type FrostStock } from './frostServer';
import type { FeletDia } from './felet';

const TIM = 3_600_000;
/** `n` stammar i en grupp och ett läge, var och en med medelfelet `mm`. */
const stammar = (grupp: FrostRad['grupp'], lage: FrostRad['lage'], n: number, mm: number): FrostRad[] =>
  Array.from({ length: n }, (_, i) => ({ stam: `${grupp}-${lage}-${i}`, grupp, lage, n: 2, summa: 2 * mm }));

describe('virkets läge = dygnet FÖRE mätningen, inte timmen', () => {
  const matt = Date.parse('2026-11-18T12:00:00Z');
  const serie = (natt: number, dag: number) => Array.from({ length: 30 }, (_, i) => {
    const ms = matt - (29 - i) * TIM;
    return { ms, temp: ms > matt - 4 * TIM ? dag : natt };
  });
  it('en natt på −8 och +1 vid kontrollen = fruset virke', () => {
    expect(virketsLage(serie(-8, 1), matt)).toBe('fruset');
  });
  it('varmt dygn = varmt, sträng kyla hela dygnet = kallt', () => {
    expect(virketsLage(serie(4, 5), matt)).toBe('varmt');
    expect(virketsLage(serie(-12, -9), matt)).toBe('kallt');
  });
  it('för få timvärden (arkivet ligger efter) → inget läge, aldrig en gissning', () => {
    expect(virketsLage(serie(-8, 1).slice(-6), matt)).toBeNull();
  });
});

describe('svaret: flyttar frosten hela kurvan?', () => {
  it('lika mycket i alla grovlekar → hela kurvan har flyttat sig ca 2 mm', () => {
    const v = frostVy([
      ...stammar('klen', 'varmt', 10, 0), ...stammar('klen', 'fruset', 10, 2),
      ...stammar('mellan', 'varmt', 10, 1), ...stammar('mellan', 'fruset', 10, 3),
      ...stammar('grov', 'varmt', 10, -1), ...stammar('grov', 'fruset', 10, 1.4),
    ]);
    expect(v.fruset).toBe('Med fruset virke mäter maskinen ca 2,1 mm grövre i alla grovlekar – hela kurvan har flyttat sig lika mycket.');
    expect(v.kallt).toBeNull();
  });
  it('olika mycket (Giant 2026-11-19: +0,3 / +0,6 / −3,9) → går inte att flytta hela kurvan', () => {
    const v = frostVy([
      ...stammar('klen', 'varmt', 20, 1.9), ...stammar('klen', 'fruset', 20, 2.2),
      ...stammar('mellan', 'varmt', 20, 0.4), ...stammar('mellan', 'fruset', 20, 1.0),
      ...stammar('grov', 'varmt', 20, 1.2), ...stammar('grov', 'fruset', 10, -2.7),
    ]);
    expect(v.fruset).toContain('olika mycket för olika grovlekar');
  });
  it('ingen skillnad → säger det', () => {
    const v = frostVy([...stammar('klen', 'varmt', 9, 1), ...stammar('klen', 'fruset', 9, 1.3), ...stammar('mellan', 'varmt', 9, 0), ...stammar('mellan', 'fruset', 9, 0.4)]);
    expect(v.fruset).toBe('Med fruset virke mäter maskinen som annars – ingen skillnad att se.');
  });
  it('under 8 stammar räknas inte — för lite fruset → säger att svaret kommer', () => {
    const v = frostVy([...stammar('klen', 'varmt', 20, 0), ...stammar('klen', 'fruset', 7, 3), ...stammar('mellan', 'varmt', 20, 0), ...stammar('mellan', 'fruset', 7, 3)]);
    expect(v.tabell[0].celler.fruset).toEqual({ stammar: 7, snittMm: null });
    expect(frostCellText(v.tabell[0].celler.fruset)).toBe('–');
    expect(v.fruset).toBe('För lite fruset virke än för att säga något – svaret kommer under vintern.');
  });
  it('en stam räknas en gång: snittet är stammarnas egna snitt, inte punkternas', () => {
    const rader: FrostRad[] = [
      ...stammar('klen', 'varmt', 7, 0),
      { stam: 'lang', grupp: 'klen', lage: 'varmt', n: 40, summa: 40 * 8 }, // en lång stam med 40 punkter väger som en
    ];
    expect(frostVy(rader).tabell[0].celler.varmt.snittMm).toBe(1);
  });
  it('sträng kyla får en egen mening bara när den finns', () => {
    expect(frostVy([...stammar('klen', 'kallt', 2, 5)]).kallt).toContain('sträng kyla');
    expect(frostSvar([], 'kallt')).toContain('För lite sträng kyla');
  });
  it('cellen med tecken och komma', () => {
    expect(frostCellText({ stammar: 9, snittMm: 1.94 })).toBe('+1,9 mm');
    expect(frostCellText({ stammar: 9, snittMm: -2.66 })).toBe('−2,7 mm');
  });
});

describe('ERA5', () => {
  it('tolkar Open-Meteos svar (UTC utan Z), släpper saknade timmar', () => {
    expect(tolkaEra5({ hourly: { time: ['2026-11-01T00:00', '2026-11-01T01:00', '2026-11-01T02:00'], temperature_2m: [-3.1, null, 2] } }))
      .toEqual([{ ms: Date.parse('2026-11-01T00:00Z'), temp: -3.1 }, { ms: Date.parse('2026-11-01T02:00Z'), temp: 2 }]);
    expect(tolkaEra5({ error: true })).toEqual([]);
  });
  it('rutan är 0,25° och ett svar sparas', async () => {
    _tomEra5Cache();
    expect(rutaAv(56.43)).toBe(56.5);
    let anrop = 0;
    const f = (async (url: string) => { anrop++; expect(String(url)).toContain('latitude=56.5&longitude=14.75'); return { ok: true, json: async () => ({ hourly: { time: ['2026-11-01T00:00'], temperature_2m: [1] } }) } as Response; }) as unknown as typeof fetch;
    await hamtaEra5(56.43, 14.77, '2026-11-01', '2026-11-02', f);
    await hamtaEra5(56.44, 14.8, '2026-11-01', '2026-11-02', f);
    expect(anrop).toBe(1);
    expect(await hamtaEra5(1, 1, '2026-11-01', '2026-11-02', (async () => ({ ok: false })) as unknown as typeof fetch)).toBeNull();
  });
});

describe('servern: stammarnas läge', () => {
  const stock = (o: Partial<FrostStock>): FrostStock => ({
    id: 1, filnamn: 'f1', kontroll_datum: '2026-11-18', harvest_date: '2026-11-18T11:00:00+00:00', stam_nummer: 1, stock_nummer: 1,
    machine_measurement_date: null, operator_measurement_date: '2026-11-18T12:00:00+00:00', maskin_langd_cm: 400, operator_langd_cm: 400,
    stem_lat: 56.43, stem_lon: 14.77, tid_ar_utc: true, ...o,
  });
  const dia = (stam: string): FeletDia => ({ stam, datum: '2026-11-18', grupp: 'klen', n: 2, traff: 2, summa: 4 });
  const nu = Date.parse('2026-11-25T12:00:00Z');
  it('ett anrop per ruta, stammen utan egen GPS tar filens, stammen utan väder räknas som utan', async () => {
    const anrop: string[] = [];
    const timmar = async (lat: number, lon: number, fran: string, till: string) => {
      anrop.push(`${rutaAv(lat)}|${rutaAv(lon)}|${fran}|${till}`);
      if (rutaAv(lat) === 60) return null;
      return Array.from({ length: 48 }, (_, i) => ({ ms: Date.parse('2026-11-17T00:00:00Z') + i * TIM, temp: -5 }));
    };
    const stockar = [
      stock({ id: 1, harvest_date: 'A' }),
      stock({ id: 2, harvest_date: 'B', stem_lat: null, stem_lon: null }),
      stock({ id: 3, harvest_date: 'C', filnamn: 'f2', stem_lat: 60, stem_lon: 15 }),
    ];
    const r = await frostRader(stockar, [dia('A'), dia('B'), dia('C')], timmar, nu);
    expect(anrop).toEqual(['56.5|14.75|2026-11-17|2026-11-18', '60|15|2026-11-17|2026-11-18']);
    expect(r.rader.map(x => [x.stam, x.lage])).toEqual([['A', 'fruset'], ['B', 'fruset']]);
    expect(r.utanVader).toBe(1);
  });
  it('kontrollen är för färsk för arkivet → ingen hämtning, räknas som utan väder', async () => {
    let anrop = 0;
    const r = await frostRader([stock({ harvest_date: 'A' })], [dia('A')], async () => { anrop++; return []; }, Date.parse('2026-11-18T13:00:00Z'));
    expect(anrop).toBe(0);
    expect(r).toEqual({ rader: [], utanVader: 1 });
  });
});
