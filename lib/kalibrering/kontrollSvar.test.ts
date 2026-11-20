import { describe, it, expect } from 'vitest';
import type { KontrollResponse, KontrollRow, StockRow } from '@/app/api/kalibrering/kontroll/route';
import { kontrollHuvud, kontrollStammar, kontrollSvar } from './kontrollSvar';

const stock = (o: Partial<StockRow> = {}): StockRow => ({
  id: 1, stam_nummer: 1, stock_nummer: 1, sortiment_namn: 'Vislanda_195_1-2_V3', sortiment_grupp: 'Timmer', sortiment_kod: null,
  maskin_langd_cm: 490, operator_langd_cm: 490, langd_avvikelse_cm: 0, maskin_toppdia_mm: 300, operator_toppdia_mm: 300, dia_avvikelse_mm: 0,
  maskin_volym_sub: null, operator_volym_sub: null, volym_avvikelse: null, log_diameter_mid_ob_mm: null, log_diameter_butt_ob_mm: null,
  cutting_reason: null, machine_measurement_date: null, operator_measurement_date: '2026-10-21 14:13:55+00', tid_ar_utc: true,
  stem_lat: null, stem_lon: null, stem_alt: null, harvest_date: null, stem_dbh_mm: null, stem_selection: 'Manually by operator selected stem',
  measurement_mode: null, rejected_reason: null, measurer_name: 'Martin', caliper_id: null, processing_category: null, matpunkter: [], ...o,
} as StockRow);
const kontroll = (o: Partial<KontrollRow> = {}): KontrollRow => ({
  id: 1, datum: '2026-10-21', maskin_id: 'G', operator_id: null, tradslag: 'GRAN', antal_kontrollstammar: 1, antal_kontrollstockar: 5,
  langd_avvikelse_snitt_cm: -0.4, langd_avvikelse_min_cm: null, langd_avvikelse_max_cm: null, dia_avvikelse_snitt_mm: 1.2, dia_avvikelse_min_mm: null, dia_avvikelse_max_mm: null,
  status: 'OK', filnamn: 'a.hqc', skapad_tid: '', application_version: null, object_name: null, object_area_ha: null, cutting_method: null,
  forest_certification: null, contract_number: null, butt_log_length_adjustment_mm: null,
  weather_at_harvest: { temperature_c: -3, is_freezing: true, precipitation_mm: 0, snowfall_cm: 0 }, ...o,
});
const resp = (stockar: StockRow[], o: Partial<KontrollRow> = {}): KontrollResponse => ({ kontroll: kontroll(o), stockar, stammar: [] });
const fem = (f: (i: number) => Partial<StockRow>) => [1, 2, 3, 4, 5].map(i => stock({ id: i, stock_nummer: i, ...f(i) }));

describe('svaret i klartext', () => {
  it('allt inom tolerans: "Längd och diameter inom tolerans", 5 av 5 rätt på båda', () => {
    const s = kontrollSvar(resp(fem(() => ({}))), 4, 2, 90);
    expect(s.rubrik).toBe('Längd och diameter inom tolerans');
    expect(s.avvikelse).toBe(false);
    expect(s.langd).toMatchObject({ ratt: '5 av 5 rätt', n: 5, inom: 5, ton: 'ok', snitt: 'snitt -0,4 cm' });
    expect(s.diameter).toMatchObject({ ratt: '5 av 5 rätt', n: 5, inom: 5, ton: 'ok', snitt: 'snitt +1 mm' });
  });
  it('diametern för grov: "Diametern mäter för grovt", 3 av 5 rätt', () => {
    const s = kontrollSvar(resp(fem(i => (i <= 2 ? { dia_avvikelse_mm: 10 } : {}))), 4, 2, 90);
    expect(s.rubrik).toBe('Diametern mäter för grovt');
    expect(s.avvikelse).toBe(true);
    expect(s.diameter).toMatchObject({ ratt: '3 av 5 rätt', ton: 'hot' });
    expect(s.langd.ratt).toBe('5 av 5 rätt');
  });
  it('diametern för klen, och åt båda hållen', () => {
    expect(kontrollSvar(resp(fem(i => (i === 1 ? { dia_avvikelse_mm: -9 } : {}))), 4, 2, 90).rubrik).toBe('Diametern mäter för klent');
    expect(kontrollSvar(resp(fem(i => (i === 1 ? { dia_avvikelse_mm: -9 } : i === 2 ? { dia_avvikelse_mm: 9 } : {}))), 4, 2, 90).rubrik).toBe('Diametern mäter ojämnt');
  });
  it('längd för lång / för kort, och båda måtten fel', () => {
    expect(kontrollSvar(resp(fem(i => (i === 1 ? { langd_avvikelse_cm: 4 } : {}))), 4, 2, 90).rubrik).toBe('Längden mäter för långt');
    expect(kontrollSvar(resp(fem(i => (i === 1 ? { langd_avvikelse_cm: -4 } : {}))), 4, 2, 90).rubrik).toBe('Längden mäter för kort');
    expect(kontrollSvar(resp(fem(i => (i === 1 ? { langd_avvikelse_cm: -4, dia_avvikelse_mm: 9 } : {}))), 4, 2, 90).rubrik).toBe('Diametern mäter för grovt, längden för kort');
  });
  it('toleransen kommer ur profilen: samma stock är rätt vid ±6 men fel vid ±4', () => {
    const s = fem(i => (i === 1 ? { dia_avvikelse_mm: 5 } : {}));
    expect(kontrollSvar(resp(s), 4, 2, 90).diameter.ratt).toBe('4 av 5 rätt');
    expect(kontrollSvar(resp(s), 6, 2, 90).diameter.ratt).toBe('5 av 5 rätt');
  });
  it('oklavat är inte "rätt": bara klavade stockar räknas, och inget klavat säger det', () => {
    const delvis = fem(i => (i > 3 ? { operator_langd_cm: null, langd_avvikelse_cm: null } : {}));
    expect(kontrollSvar(resp(delvis), 4, 2, 90).langd).toMatchObject({ ratt: '3 av 3 rätt', n: 3 });
    const inget = fem(() => ({ operator_langd_cm: null, langd_avvikelse_cm: null, operator_toppdia_mm: null, dia_avvikelse_mm: null }));
    const s = kontrollSvar(resp(inget), 4, 2, 90);
    expect(s.rubrik).toBe('Inget är klavat i den här kontrollen');
    expect(s.langd).toMatchObject({ ratt: 'Ej klavad', snitt: null });
    expect(s.diameter).toMatchObject({ ratt: 'Ej klavad', snitt: null });
  });
  it('bara längden klavad och rätt: "Längden inom tolerans"', () => {
    const s = kontrollSvar(resp(fem(() => ({ operator_toppdia_mm: null, dia_avvikelse_mm: null }))), 4, 2, 90);
    expect(s.rubrik).toBe('Längden inom tolerans');
  });
  it('fotnoten: en stam säger lite, domen bygger på fönstret', () => {
    expect(kontrollSvar(resp(fem(() => ({}))), 4, 2, 90).fotnot).toBe('En stam säger lite. Domen bygger på 90 dagar.');
    expect(kontrollSvar(resp(fem(() => ({})), { antal_kontrollstammar: 3 }), 4, 2, 60).fotnot).toBe('En kontroll säger lite. Domen bygger på 60 dagar.');
    expect(kontrollSvar(resp(fem(() => ({}))), 4, 2, null).fotnot).toContain('90 dagar');
  });
});

describe('huvudet', () => {
  it('dag, klockslag (svensk tid), trädslag, urval, stockar, väder och vem som mätte', () => {
    const h = kontrollHuvud(resp(fem(() => ({}))));
    expect(h.dagTid).toBe('ons 21 okt · 16:13');
    expect(h.fakta).toEqual([
      { etikett: 'Förare', varde: 'Martin', saknas: false },
      { etikett: 'Stammen', varde: 'Förvald', saknas: false },
      { etikett: 'Väder', varde: '−3 °C, frost, uppehåll', saknas: false },
      { etikett: 'Trädslag', varde: 'Gran · 5 stockar', saknas: false },
    ]);
  });
  it('vind står bara när vädret har den, i hela m/s', () => {
    const h = kontrollHuvud(resp(fem(() => ({})), { weather_at_harvest: { temperature_c: 13.3, precipitation_mm: 0, snowfall_cm: 0, wind_speed_ms: 7.1, is_freezing: false } }));
    expect(h.fakta.map(f => f.etikett)).toEqual(['Förare', 'Stammen', 'Väder', 'Vind', 'Trädslag']);
    expect(h.fakta[3]).toEqual({ etikett: 'Vind', varde: '7 m/s', saknas: false });
  });
  it('väder, förare och urval som saknas säger det — aldrig en gissning', () => {
    const h = kontrollHuvud(resp(fem(() => ({ measurer_name: null, stem_selection: null })), { weather_at_harvest: null }), '2026-11-02');
    expect(h.fakta.slice(0, 3)).toEqual([
      { etikett: 'Förare', varde: 'Saknas i filen', saknas: true },
      { etikett: 'Stammen', varde: 'Saknas i filen', saknas: true },
      { etikett: 'Väder', varde: 'Saknas', saknas: true },
    ]);
  });
  it('ung kontroll: vädret kommer, det saknas inte', () => {
    const h = kontrollHuvud(resp(fem(() => ({})), { weather_at_harvest: null }), '2026-10-23');
    expect(h.fakta[2]).toEqual({ etikett: 'Väder', varde: 'Kommer om några dagar', saknas: true });
  });
  it('slumpstam', () => {
    expect(kontrollHuvud(resp(fem(() => ({ stem_selection: 'Randomly selected stem' })))).fakta[1].varde).toBe('Slumpstam');
  });
  it('utan mättid: filens datum utan klockslag', () => {
    expect(kontrollHuvud(resp(fem(() => ({ operator_measurement_date: null })))).dagTid).toBe('ons 21 okt');
  });
});

describe('stockraderna rot → topp', () => {
  const mp = (position_cm: number, m: number, o: number) => ({ position_cm, diameter_maskin_mm: m, diameter_operator_mm: o, klave_first_mm: null, klave_second_mm: null });
  it('sortiment och längd i klartext, båda avvikelserna med etikett — aldrig maskinkoden', () => {
    const g = kontrollStammar([
      stock({ id: 2, stock_nummer: 2, sortiment_grupp: 'Massa', maskin_langd_cm: 310, langd_avvikelse_cm: 3, dia_avvikelse_mm: 0 }),
      stock({ id: 1, stock_nummer: 1, langd_avvikelse_cm: -2, matpunkter: [mp(100, 310, 300)] as never }),
    ]);
    expect(g).toHaveLength(1);
    expect(g[0].rubrik).toBe('Stam 1 · 8,0 m · 2 stockar');
    expect(g[0].rader.map(r => r.titel)).toEqual(['Timmer 4,9 m', 'Massa 3,1 m']);
    expect(g[0].rader[0].under).toBe('längd -2,0 cm · dia +10 mm');
    expect(g[0].rader[0].ton).toBe('hot');
    expect(g[0].rader[0].titel).not.toContain('Vislanda');
  });
  it('oklavat säger "ej klavad" per mått', () => {
    const [grupp] = kontrollStammar([stock({ operator_langd_cm: null, langd_avvikelse_cm: null })]);
    expect(grupp.rader[0].under).toBe('längd ej klavad · dia 0 mm');
    const [g2] = kontrollStammar([stock({ operator_toppdia_mm: null, dia_avvikelse_mm: null })]);
    expect(g2.rader[0].under).toBe('längd 0,0 cm · dia ej klavad');
  });
  it('flera stammar: en grupp per stam, lägst nummer först; okänt sortiment sägs', () => {
    const g = kontrollStammar([stock({ id: 3, stam_nummer: 2, sortiment_grupp: null }), stock({ id: 1, stam_nummer: 1 })]);
    expect(g.map(x => x.stamNummer)).toEqual([1, 2]);
    expect(g[1].rader[0].titel).toBe('Okänt sortiment 4,9 m');
  });
});
