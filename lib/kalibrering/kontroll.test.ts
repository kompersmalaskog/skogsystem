import { describe, it, expect } from 'vitest';
import {
  findPlanomraden, kontrollSumma, lenKlavad, senasteStockVarde, senasteSumma,
  stamValOchMatare, stockDetalj, stockDiagnos, stockFordelning, stockRadVarde, swarmX, swarmY, vaderText, xPctFor, yPctFor,
} from './kontroll';
import type { StockRow } from '@/app/api/kalibrering/kontroll/route';
import type { DetaljKontrollStock } from './typer';

type Mp = { position_cm: number; diameter_maskin_mm: number | null; diameter_operator_mm: number | null };
const stock = (o: Partial<StockRow> & { matpunkter?: Mp[] } = {}): StockRow => ({
  id: 1, stam_nummer: 1, stock_nummer: 1, sortiment_namn: 'Timmer', sortiment_grupp: null, sortiment_kod: null,
  maskin_langd_cm: 490, operator_langd_cm: 490, langd_avvikelse_cm: 0, maskin_toppdia_mm: 300, operator_toppdia_mm: 300, dia_avvikelse_mm: 0,
  maskin_volym_sub: null, operator_volym_sub: null, volym_avvikelse: null, log_diameter_mid_ob_mm: null, log_diameter_butt_ob_mm: null,
  cutting_reason: null, machine_measurement_date: null, operator_measurement_date: null, stem_lat: null, stem_lon: null, stem_alt: null,
  harvest_date: null, stem_dbh_mm: null, stem_selection: null, measurement_mode: null, rejected_reason: null, measurer_name: null,
  caliper_id: null, processing_category: null, matpunkter: [], ...o,
} as unknown as StockRow);
const mp = (position_cm: number, maskin: number | null, operator: number | null): Mp & { klave_first_mm: null; klave_second_mm: null } =>
  ({ position_cm, diameter_maskin_mm: maskin, diameter_operator_mm: operator, klave_first_mm: null, klave_second_mm: null });

describe('klavad = operatören har mätt', () => {
  it('NULL och 0 är oklavat', () => {
    expect(lenKlavad({ operator_langd_cm: 490 })).toBe(true);
    expect(lenKlavad({ operator_langd_cm: 0 })).toBe(false);
    expect(lenKlavad({ operator_langd_cm: null })).toBe(false);
  });
});

describe('stockFordelning + kontrollSumma', () => {
  it('sDia = största avvikelsen (med tecken) över mätpunkter OCH toppen', () => {
    const [e] = stockFordelning([stock({ dia_avvikelse_mm: 2, matpunkter: [mp(100, 310, 300), mp(200, 295, 300)] as never })]);
    expect(e).toMatchObject({ sDia: 10, diaKl: true, lenKl: true });
    const [n] = stockFordelning([stock({ dia_avvikelse_mm: 2, matpunkter: [mp(100, 300, 310)] as never })]);
    expect(n.sDia).toBe(-10);
  });
  it('oklavad stock har ingen avvikelse (0), inte "inom tolerans"', () => {
    const [e] = stockFordelning([stock({ operator_langd_cm: null, langd_avvikelse_cm: null, operator_toppdia_mm: null, dia_avvikelse_mm: null })]);
    expect(e).toMatchObject({ sLen: 0, sDia: 0, lenKl: false, diaKl: false });
  });
  it('mätpunkter räknas som klavade även utan operatörens topp', () => {
    const [e] = stockFordelning([stock({ operator_toppdia_mm: null, dia_avvikelse_mm: null, matpunkter: [mp(100, 305, 300)] as never })]);
    expect(e.diaKl).toBe(true);
    expect(e.sDia).toBe(5);
  });
  it('summan räknar utanför tolerans bara på klavade, och säger "ej klavade"', () => {
    const f = stockFordelning([
      stock({ id: 1, langd_avvikelse_cm: 3, dia_avvikelse_mm: 5 }),
      stock({ id: 2, langd_avvikelse_cm: 1, dia_avvikelse_mm: 4 }),
      stock({ id: 3, operator_langd_cm: null, langd_avvikelse_cm: null, operator_toppdia_mm: null, dia_avvikelse_mm: null }),
    ]);
    const s = kontrollSumma(f, 4, 2);
    expect(s.lenLabel).toBe('1 av 2 utanför · 1 ej klavade');
    expect(s.diaLabel).toBe('1 av 2 utanför · 1 ej klavade');
    expect(s.lenTraff).toBe(50);
    expect(s.lenStatusTone).toBe('bad');
    expect(kontrollSumma(f.slice(1, 2), 4, 2)).toMatchObject({ lenStatusTone: 'ok', diaStatusTone: 'ok', lenLabel: 'Alla 1 inom tolerans', lenTraff: 100 });
    expect(kontrollSumma(f.slice(2), 4, 2)).toMatchObject({ lenLabel: '1 ej klavade', lenTraff: null });
  });
  it('toleranserna kommer ur profilen (en annan gräns ger ett annat antal)', () => {
    const f = stockFordelning([stock({ langd_avvikelse_cm: 3, dia_avvikelse_mm: 5 })]);
    expect(kontrollSumma(f, 4, 2).lenStatusTone).toBe('bad');
    expect(kontrollSumma(f, 6, 4).lenStatusTone).toBe('ok');
  });
});

describe('svärmen', () => {
  it('swarmX klipps till [4,96]; noll hamnar mitt', () => {
    expect(swarmX(0, 8)).toBe(50);
    expect(swarmX(100, 8)).toBe(96);
    expect(swarmX(-100, 8)).toBe(4);
    expect(swarmX(4, 8)).toBe(75);
  });
  it('swarmY är deterministisk per (stam, stock)', () => {
    expect(swarmY({ stam_nummer: 1, stock_nummer: 1 })).toBe(24 + ((101 * 37) % 52));
    expect(swarmY({ stam_nummer: 1, stock_nummer: 1 })).toBe(swarmY({ stam_nummer: 1, stock_nummer: 1 }));
  });
  it('stam-val och mätare tas från första stocken', () => {
    expect(stamValOchMatare([stock({ stem_selection: 'Randomly selected stem', measurer_name: 'Daniel' })])).toEqual({ selText: 'Slumpvald stam', measurer: 'Daniel' });
    expect(stamValOchMatare([stock({ stem_selection: 'Manually by operator selected stem' })]).selText).toBe('Vald av operatör');
    expect(stamValOchMatare([stock({ stem_selection: 'Annat' })]).selText).toBe('Annat');
    expect(stamValOchMatare([])).toEqual({ selText: null, measurer: null });
  });
  it('väderraden: snö före regn före uppehåll', () => {
    expect(vaderText({ snowfall_cm: 1.25, precipitation_mm: 3 })).toBe('1,3 cm snö');
    expect(vaderText({ snowfall_cm: 0, precipitation_mm: 0.46 })).toBe('0,5 mm');
    expect(vaderText({})).toBe('Uppehåll');
  });
});

describe('stocklistan', () => {
  it('raden bär värsta måttet', () => {
    const r = stockRadVarde(stock({ langd_avvikelse_cm: 0, dia_avvikelse_mm: 7 }));
    expect(r).toMatchObject({ sDiaTon: 'hot', sLenTon: 'ok', worstTon: 'hot', sDia: 7 });
    const l = stockRadVarde(stock({ langd_avvikelse_cm: 4, dia_avvikelse_mm: 0 }));
    expect(l).toMatchObject({ sLenTon: 'hot', worstTon: 'hot' });
  });
  it('oklavat visas inte som avvikelse', () => {
    const r = stockRadVarde(stock({ operator_langd_cm: null, langd_avvikelse_cm: 9, operator_toppdia_mm: null, dia_avvikelse_mm: 9 }));
    expect(r).toMatchObject({ lenKl: false, diaKl: false, sLenTon: 'ok', sDiaTon: 'ok', worstTon: 'ok' });
  });
});

describe('stamvyn — planområden', () => {
  const profil = (d: number[]) => d.map((diameter_mm, i) => ({ position_cm: i * 20, diameter_mm }));
  it('en profil med färre än 2 punkter ger inga planområden', () => {
    expect(findPlanomraden([])).toEqual([]);
    expect(findPlanomraden(profil([300]))).toEqual([]);
  });
  it('icke-minskande sträcka ≥ 30 cm är ett planområde; minskande diameter är det inte', () => {
    expect(findPlanomraden(profil([300, 290, 280, 270]))).toEqual([]);
    // 290 → 290 → 290 är en platå: 40 cm lång, diameter 290
    expect(findPlanomraden(profil([300, 290, 290, 290, 280]))).toEqual([{ startCm: 20, endCm: 60, lengthCm: 40, diameterMm: 290 }]);
    // en platå på 20 cm räcker inte
    expect(findPlanomraden(profil([300, 290, 290, 280]))).toEqual([]);
  });
  it('profilen sorteras på position först', () => {
    const o = [{ position_cm: 60, diameter_mm: 290 }, { position_cm: 0, diameter_mm: 300 }, { position_cm: 20, diameter_mm: 290 }, { position_cm: 40, diameter_mm: 290 }];
    expect(findPlanomraden(o)).toEqual([{ startCm: 20, endCm: 60, lengthCm: 40, diameterMm: 290 }]);
  });
});

describe('stockarket', () => {
  it('y-skalan klampar ±8 mm till 10–90 %, sedan 8–92 %', () => {
    expect(yPctFor(0)).toBe(50);
    expect(yPctFor(8)).toBe(10);
    expect(yPctFor(-8)).toBe(90);
    expect(yPctFor(100)).toBe(10);
  });
  it('x-skalan: en punkt mitt, annars 15–85 %', () => {
    const pts = [{ position_cm: 100, avvikelse: 0, mVal: 1, oVal: 1 }, { position_cm: 500, avvikelse: 0, mVal: 1, oVal: 1 }];
    expect(xPctFor(100, pts)).toBe(15);
    expect(xPctFor(500, pts)).toBe(85);
    expect(xPctFor(100, [pts[0]])).toBe(50);
  });
  const pts = (...a: number[]) => a.map((avvikelse, i) => ({ position_cm: 100 + i * 100, avvikelse, mVal: 1, oVal: 1 }));
  it('diagnosen: samlad / en som sticker ut / systematisk / spretig', () => {
    expect(stockDiagnos([])).toBeNull();
    expect(stockDiagnos(pts(1, -2, 3))).toEqual({ tone: 'ok', text: 'Mätningen är samlad, inom tolerans.' });
    expect(stockDiagnos(pts(1, 6, 2))!.tone).toBe('warn');
    expect(stockDiagnos(pts(1, 6, 2))!.text).toBe('Punkten +6 mm vid 200 cm sticker ut. Annars samlat. Kontrollera anliggning vid den grovleken.');
    expect(stockDiagnos(pts(5, 6, 7))).toMatchObject({ tone: 'bad' });
    expect(stockDiagnos(pts(5, 6, 7))!.text).toBe('Drar systematiskt åt grovt — 6 mm i snitt på 3 av 3 punkter. Tyder på kalibreringsfel — men bekräfta med fler stammar innan du justerar.');
    expect(stockDiagnos(pts(6, -6, 1))!.text).toBe('Spretigt — 2 av 3 punkter pekar olika håll. Tyder på mekaniskt problem (givare/mäthjul/anliggning). Kalibrering hjälper inte mot spridning.');
  });
  it('stockDetalj: max-avvikelse med position, klavad-regler och längdgräns', () => {
    const d = stockDetalj(stock({ langd_avvikelse_cm: 3, dia_avvikelse_mm: 2, matpunkter: [mp(300, 296, 300), mp(100, 311, 300)] as never }), 2);
    expect(d.mpAvvik.map(p => p.position_cm)).toEqual([100, 300]);
    expect(d).toMatchObject({ hasMp: true, maxAvvik: 11, maxAvvikPos: 100, minPos: 100, maxPos: 300, sLenBad: true, lenKlavad: true, diaKlavad: true });
    const t = stockDetalj(stock({ dia_avvikelse_mm: -3, matpunkter: [] }), 2);
    expect(t).toMatchObject({ hasMp: false, maxAvvik: -3, maxAvvikPos: null, minPos: 0, maxPos: 1, diagnos: null });
  });
});

describe('Senaste-fliken', () => {
  const detalj = (o: Partial<DetaljKontrollStock> = {}): DetaljKontrollStock => ({
    id: 1, maskin_id: 'G', kontroll_datum: '2026-10-21', stam_nummer: 1, stock_nummer: 1, maskin_langd_cm: 490, maskin_toppdia_mm: 300, operator_langd_cm: 490,
    operator_toppdia_mm: 300, langd_avvikelse_cm: 0, dia_avvikelse_mm: 0, filnamn: 'a', skapad_tid: 'x', maskin_volym_sub: null, operator_volym_sub: null,
    volym_avvikelse: null, latitude: null, longitude: null, objekt_id: null, ...o,
  });
  it('summan: total längd och antal utanför tolerans (dia ±4, längd ±2)', () => {
    expect(senasteSumma([detalj(), detalj({ dia_avvikelse_mm: 5 }), detalj({ langd_avvikelse_cm: 3, maskin_langd_cm: 100 })])).toEqual({ totalLen: 1080, utanfor: 2 });
    expect(senasteSumma([])).toEqual({ totalLen: 0, utanfor: 0 });
  });
  it('stockvärde: oklavat → ton ok och "–"; ett badge-ord per ton; storlekar med golv', () => {
    const v = senasteStockVarde(detalj({ operator_langd_cm: 0, operator_toppdia_mm: 0, dia_avvikelse_mm: 9, langd_avvikelse_cm: 9 }));
    expect(v).toMatchObject({ lenKlavad: false, diaKlavad: false, lenTon: 'ok', diaTon: 'ok', opLen: '–', opDia: '–' });
    expect(v.badgeText('ok')).toBe('Inom');
    expect(v.badgeText('cold')).toBe('Under');
    expect(v.badgeText('hot')).toBe('Utanför');
    expect(v.operatorW).toBe(180);
    expect(v.maskinW).toBeCloseTo(490 * 0.7);
    expect(v.operatorH).toBe(28);
  });
  it('mätpunkter längs stocken: bara de med maskinvärde, sorterade', () => {
    const v = senasteStockVarde(detalj({ matpunkter: [{ position_cm: 300, diameter_maskin_mm: 280, diameter_operator_mm: 281 }, { position_cm: 100, diameter_maskin_mm: null, diameter_operator_mm: 300 }, { position_cm: 200, diameter_maskin_mm: 290, diameter_operator_mm: null }] }));
    expect(v.mps.map(m => m.position_cm)).toEqual([200, 300]);
  });
});
