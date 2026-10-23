import { describe, it, expect } from 'vitest';
import { dagMedVeckodag, kontrollRad, kontrollRader, kontrollTider, mattTid, urvalText, vaderKort } from './kontrollLista';
import type { FaktKalibrering, KontrollTid } from './typer';

const k = (o: Partial<FaktKalibrering> = {}): FaktKalibrering => ({
  id: 1, datum: '2026-10-21', maskin_id: 'GIANT', operator_id: null, tradslag: 'GRAN', antal_kontrollstammar: 1, antal_kontrollstockar: 5,
  langd_avvikelse_snitt_cm: 0, langd_avvikelse_min_cm: 0, langd_avvikelse_max_cm: 0, dia_avvikelse_snitt_mm: 0, dia_avvikelse_min_mm: 0, dia_avvikelse_max_mm: 0,
  status: 'OK', filnamn: 'a.hqc', skapad_tid: '2026-10-21T15:00:00Z', ...o,
});
const tid = (dag: string, klockslag: string, o: Partial<KontrollTid> = {}): KontrollTid => ({ forsta: { dag, klockslag }, sista: { dag, klockslag }, urval: ['Manually by operator selected stem'], ...o });

describe('mättiden — Opti-tid med radens egen konvention, i svensk tid', () => {
  it('verkligt UTC (tid_ar_utc) i oktober är sommartid: 14:13Z = 16:13', () => {
    expect(mattTid([{ operator_measurement_date: '2026-10-21 14:13:55+00', tid_ar_utc: true }])).toEqual({
      forsta: { dag: '2026-10-21', klockslag: '16:13' }, sista: { dag: '2026-10-21', klockslag: '16:13' },
    });
  });
  it('en äldre rad (väggklockan lagrad som UTC) läses inte om: 14:13 är 14:13', () => {
    expect(mattTid([{ operator_measurement_date: '2026-10-21 14:13:55+00', tid_ar_utc: false }]).sista).toEqual({ dag: '2026-10-21', klockslag: '14:13' });
  });
  it('en fil med stammar från flera dagar: första och sista mätningen', () => {
    const t = mattTid([
      { operator_measurement_date: '2026-10-14 12:20:25+00', tid_ar_utc: true },
      { operator_measurement_date: '2026-10-12 13:38:16+00', tid_ar_utc: true },
      { operator_measurement_date: null, tid_ar_utc: true },
    ]);
    expect(t.forsta).toEqual({ dag: '2026-10-12', klockslag: '15:38' });
    expect(t.sista).toEqual({ dag: '2026-10-14', klockslag: '14:20' });
  });
  it('kvällen efter midnatt svensk tid hamnar på nästa svenska dag', () => {
    expect(mattTid([{ operator_measurement_date: '2026-10-20 22:30:00+00', tid_ar_utc: true }]).sista).toEqual({ dag: '2026-10-21', klockslag: '00:30' });
  });
  it('ingen tid → inget, aldrig ett påhittat klockslag', () => {
    expect(mattTid([])).toEqual({ forsta: null, sista: null });
    expect(mattTid([{ operator_measurement_date: null }])).toEqual({ forsta: null, sista: null });
  });
});

describe('hur stammen valdes', () => {
  it('slump, förvald, båda', () => {
    expect(urvalText(['Randomly selected stem'])).toBe('Slumpstam');
    expect(urvalText(['Manually by operator selected stem'])).toBe('Förvald');
    expect(urvalText(['Randomly selected stem', 'Manually by operator selected stem'])).toBe('Slump och förvald');
  });
  it('okänt eller tomt säger ingenting', () => {
    expect(urvalText([])).toBeNull();
    expect(urvalText(['något annat'])).toBeNull();
  });
});

describe('vädret kort', () => {
  it('"−3 °C, frost" med riktigt minustecken', () => {
    expect(vaderKort({ temperature_c: -3.2, is_freezing: true, precipitation_mm: 0, snowfall_cm: 0 })).toBe('−3 °C, frost, uppehåll');
  });
  it('uppehåll, regn, snö (snö går före regn)', () => {
    expect(vaderKort({ temperature_c: 8.3, precipitation_mm: 0, snowfall_cm: 0, is_freezing: false })).toBe('8 °C, uppehåll');
    expect(vaderKort({ temperature_c: 9.8, precipitation_mm: 0.1, snowfall_cm: 0 })).toBe('10 °C, 0,1 mm regn');
    expect(vaderKort({ temperature_c: 0.4, precipitation_mm: 1.2, snowfall_cm: 2 })).toBe('0 °C, 2,0 cm snö');
  });
  it('saknas vädret är det null — aldrig "uppehåll" på gissning', () => {
    expect(vaderKort(null)).toBeNull();
    expect(vaderKort(undefined)).toBeNull();
    expect(vaderKort({ temperature_c: null, precipitation_mm: null, snowfall_cm: null })).toBeNull();
  });
});

describe('raden i listan', () => {
  it('allt synligt utan att trycka: dag, klockslag, trädslag, stammar, stockar, urval, väder', () => {
    const r = kontrollRad(k({ weather_at_harvest: { temperature_c: -3, is_freezing: true, precipitation_mm: 0, snowfall_cm: 0 } }), tid('2026-10-21', '16:13'));
    expect(r.rubrik).toBe('ons 21 okt · 16:13');
    expect(r.rad1).toBe('Gran · 1 stam · 5 stockar · Förvald');
    expect(r.vader).toBe('−3 °C, frost, uppehåll');
    expect(r.vaderSaknas).toBe(false);
  });
  it('väder som saknas säger det', () => {
    const r = kontrollRad(k(), tid('2026-10-21', '16:13'));
    expect(r).toMatchObject({ vader: 'Väder saknas', vaderSaknas: true });
  });
  it('tiden inte läst än: filens datum utan klockslag, raden visas ändå', () => {
    const r = kontrollRad(k(), undefined);
    expect(r.rubrik).toBe('ons 21 okt');
    expect(r.rad1).toBe('Gran · 1 stam · 5 stockar');
  });
  it('en fil med stammar från flera dagar säger det', () => {
    const r = kontrollRad(k({ antal_kontrollstammar: 3, antal_kontrollstockar: 11 }), tid('2026-10-14', '14:20', { forsta: { dag: '2026-10-12', klockslag: '15:38' } }));
    expect(r.rad1).toContain('3 stammar (mätta 12 okt–14 okt)');
  });
  it('veckodagen är rätt', () => { expect(dagMedVeckodag('2026-10-19')).toBe('mån 19 okt'); });
});

describe('månadens lista', () => {
  const rader = [
    k({ filnamn: 'a', datum: '2026-10-14' }), k({ filnamn: 'b', datum: '2026-10-21' }), k({ filnamn: 'c', datum: '2026-10-21' }), k({ filnamn: 'd', datum: '2026-09-30' }),
  ];
  const tider = { a: tid('2026-10-14', '14:20'), b: tid('2026-10-21', '09:05'), c: tid('2026-10-21', '16:13') };
  it('bara månadens kontroller, nyast först (mättid, inte filnamn)', () => {
    expect(kontrollRader(rader, tider, '2026-10').map(r => r.filnamn)).toEqual(['c', 'b', 'a']);
  });
  it('tom månad ger tom lista', () => { expect(kontrollRader(rader, tider, '2026-08')).toEqual([]); });
  it('utan tider sorteras på filens datum', () => { expect(kontrollRader(rader, null, '2026-10').map(r => r.filnamn)[2]).toBe('a'); });
});

describe('tider för en hel maskin', () => {
  it('en post per fil: första/sista mätning och filens urval', () => {
    const t = kontrollTider([
      { filnamn: 'a', stem_selection: 'Manually by operator selected stem', operator_measurement_date: '2026-10-12 13:38:16+00', tid_ar_utc: true },
      { filnamn: 'a', stem_selection: 'Manually by operator selected stem', operator_measurement_date: '2026-10-14 12:20:25+00', tid_ar_utc: true },
      { filnamn: 'b', stem_selection: 'Randomly selected stem', operator_measurement_date: null, tid_ar_utc: true },
    ]);
    expect(t.a).toEqual({ forsta: { dag: '2026-10-12', klockslag: '15:38' }, sista: { dag: '2026-10-14', klockslag: '14:20' }, urval: ['Manually by operator selected stem'] });
    expect(t.b).toEqual({ forsta: null, sista: null, urval: ['Randomly selected stem'] });
    expect(Object.keys(t)).toEqual(['a', 'b']);
  });
});
