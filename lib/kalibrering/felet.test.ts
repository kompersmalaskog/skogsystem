// Var sitter felet? — Vidas rapport 2026-11-16 (Scorpion, Stefan, 12 klavstammar 2–13 nov): klena stockar mäts grovt, grova något klent, rotstocken på gran
// en aning lång. Fixturen här har samma form: talen är valda så att svaret går att räkna för hand.
import { describe, expect, it } from 'vitest';
import { byggFeletUnderlag, feletGrupp, langdMotKlass, varSitterFelet, type FeletResp, type FeletStock } from './felet';
import type { KravRow } from './typer';
import type { DiaPunkt } from './diameterpunkter';

const VIDA: KravRow[] = [
  { variabel: 'diameter', metrik: 'traffprocent', riktning: 'hog_bra', tolerans: 4, mal: 85, golv: 75, enhet: '%', larm_min_matt: 150 },
  { variabel: 'langd', metrik: 'traffprocent', riktning: 'hog_bra', tolerans: 2, mal: 100, golv: 95, enhet: '%', larm_min_matt: 40 },
];
const FONSTER = { fran: '2026-08-20', till: '2026-11-17' };

/** n stammar per grupp: varje stam en punkt med avvikelsen `avvik`, `miss` av dem utanför toleransen. */
const stammar = (grupp: 'klen' | 'mellan' | 'grov', n: number, avvik: number, datum = '2026-11-05', miss = 0) =>
  Array.from({ length: n }, (_, i) => ({ stam: `${grupp}${i}`, datum, grupp, n: 1, traff: i < miss ? 0 : 1, summa: avvik }));
const rotar = (tradslag: string, n: number, avvik: number, datum = '2026-11-05') =>
  Array.from({ length: n }, (_, i) => ({ stam: `rot${tradslag}${i}`, datum, tradslag, avvikCm: avvik }));
const resp = (o: Partial<FeletResp>): FeletResp => ({ ok: true, maskin_id: 'M', tolDia: 4, tolLangd: 2, dia: [], rot: [], senasteKalibrering: null, ...o });

describe('grovlekarna', () => {
  it('klavens diameter: under 150 klen, 150–249 mellan, 250 och uppåt grov', () => {
    expect([149, 150, 249, 250].map(feletGrupp)).toEqual(['klen', 'mellan', 'mellan', 'grov']);
  });
});

describe('varSitterFelet', () => {
  const vidasFall = resp({
    dia: [...stammar('klen', 11, 4, '2026-11-05', 5), ...stammar('mellan', 12, -1), ...stammar('grov', 12, -3, '2026-11-05', 4)],
    rot: [...rotar('Gran', 11, 0.6), ...rotar('Tall', 1, 1)],
    senasteKalibrering: '2026-11-03',
  });

  it('Vidas fall: klena först, grova sedan, rotstocken gran sist — och svaret i ord', () => {
    const vy = varSitterFelet({ resp: vidasFall, period: 'fonster', fonster: FONSTER, trosklar: VIDA });
    expect(vy.rader.map(r => [r.titel, r.varde, r.ord])).toEqual([
      ['Klena stockar', '4 mm för grovt', '55 % rätt'],
      ['Grova stockar', '3 mm för klent', '67 % rätt'],
      ['Rotstocken gran', '1 cm för lång', '100 % rätt'],
    ]);
    expect(vy.rader[0].ton).toBe('hot');
    expect(vy.mening).toBe('Maskinen tror att klena stockar är grövre än de är.');
    expect(vy.not).toBe('47 stammar senaste 90 dagarna'); // fixturens stammar har olika nycklar i diameter och rot
  });

  it('mellangrova som träffar och ligger rätt visas inte; tall med en stam är för lite', () => {
    const vy = varSitterFelet({ resp: vidasFall, period: 'fonster', fonster: FONSTER, trosklar: VIDA });
    expect(vy.rader.some(r => r.titel.includes('Mellangrova'))).toBe(false);
    expect(vy.rader.some(r => r.titel.includes('tall'))).toBe(false);
  });

  it('allt rätt: en rad "Diametern · inget sticker ut", ingen mening', () => {
    const vy = varSitterFelet({ resp: resp({ dia: stammar('mellan', 10, 0.4), rot: rotar('Gran', 10, 0) }), period: 'fonster', fonster: FONSTER, trosklar: VIDA });
    expect(vy.rader.map(r => [r.titel, r.varde])).toEqual([['Diametern', 'inget sticker ut'], ['Rotstocken gran', 'rätt längd i snitt']]);
    expect(vy.mening).toBeNull();
  });

  it('sedan kalibreringen: bara stammar från kalibreringsdagen, och för få säger det', () => {
    const r = resp({ dia: [...stammar('klen', 9, 4, '2026-10-01', 5), ...stammar('klen', 2, 4, '2026-11-17').map(s => ({ ...s, stam: `ny${s.stam}` }))], senasteKalibrering: '2026-11-17' });
    const fonster = varSitterFelet({ resp: r, period: 'fonster', fonster: FONSTER, trosklar: VIDA });
    expect(fonster.rader[0].titel).toBe('Klena stockar');
    const sedan = varSitterFelet({ resp: r, period: 'kalibrering', fonster: FONSTER, trosklar: VIDA });
    expect(sedan.rader).toEqual([]);
    expect(sedan.tom).toBe('För få stammar för att säga var felet sitter – 2 stammar sedan kalibreringen 17 nov.');
  });

  it('en stam räknas en gång: en stam med många punkter väger som en med en', () => {
    const tung = { stam: 'tung', datum: '2026-11-05', grupp: 'klen' as const, n: 40, traff: 0, summa: 40 * 10 };
    const vy = varSitterFelet({ resp: resp({ dia: [tung, ...stammar('klen', 7, 0)] }), period: 'fonster', fonster: FONSTER, trosklar: VIDA });
    // (10 + 7 × 0) / 8 = 1,25 → avrundat 1 mm; träff (0 + 7) / 8 = 88 % — under 2 mm och över målet, alltså ingen rad.
    expect(vy.rader.map(r => r.titel)).toEqual(['Diametern']);
  });

  it('rätt i snitt men under målet: "spretar åt båda hållen" (Scorpionens grova stockar 2026-11-18: +0,4 mm, 74 % rätt)', () => {
    const vy = varSitterFelet({ resp: resp({ dia: stammar('grov', 50, 0.4, '2026-11-05', 13) }), period: 'fonster', fonster: FONSTER, trosklar: VIDA });
    expect(vy.rader.map(r => [r.titel, r.varde, r.ord, r.ton])).toEqual([['Grova stockar', 'spretar åt båda hållen', '74 % rätt', 'hot']]);
    // Skogforsk: låg träff utan systematiskt fel går inte att kalibrera bort — det tyder på något mekaniskt.
    expect(vy.mening).toBe('Felet på grova stockar hoppar åt båda hållen. Det brukar bero på något i aggregatet, inte på kalibreringen.');
  });

  it('ett systematiskt fel säger aldrig "aggregatet" — det går att kalibrera', () => {
    const vy = varSitterFelet({ resp: resp({ dia: stammar('klen', 10, 4, '2026-11-05', 6) }), period: 'fonster', fonster: FONSTER, trosklar: VIDA });
    expect(vy.mening).toBe('Maskinen tror att klena stockar är grövre än de är.');
  });

  it('stockar med längdfel över 10 cm sägs i noten, bara de i perioden', () => {
    const vy = varSitterFelet({ resp: resp({ dia: stammar('klen', 8, 0), bortLangdfel: ['2026-11-05', '2026-11-06', '2025-01-01'] }), period: 'fonster', fonster: FONSTER, trosklar: VIDA });
    expect(vy.not).toBe('8 stammar senaste 90 dagarna · 2 stockar räknas inte, längden var mer än 10 cm fel');
    const ingen = varSitterFelet({ resp: resp({ dia: stammar('klen', 8, 0) }), period: 'fonster', fonster: FONSTER, trosklar: VIDA });
    expect(ingen.not).toBe('8 stammar senaste 90 dagarna');
  });

  it('högst tre rader', () => {
    const vy = varSitterFelet({
      resp: resp({ dia: [...stammar('klen', 10, 5, '2026-11-05', 6), ...stammar('grov', 10, -5, '2026-11-05', 6)], rot: [...rotar('Gran', 10, 3), ...rotar('Tall', 9, -3)] }),
      period: 'fonster', fonster: FONSTER, trosklar: VIDA,
    });
    expect(vy.rader).toHaveLength(3);
  });
});

describe('byggFeletUnderlag', () => {
  const stock = (id: number, o: Partial<FeletStock> = {}): FeletStock => ({
    id, filnamn: 'f.hqc', kontroll_datum: '2026-11-05', harvest_date: '2026-11-05T09:00:00', stam_nummer: 1, stock_nummer: 1,
    machine_measurement_date: 'm', operator_measurement_date: 'o', maskin_langd_cm: 551, operator_langd_cm: 550, ...o,
  });
  const punkt = (stockId: number, operator_mm: number, avvik: number): DiaPunkt => ({ stockId, maskin_mm: operator_mm + avvik, operator_mm, avvik, kalla: 'topp' });

  it('en rad per stam och grovlek, rotstocken per stam; omätt längd och dubbletter räknas inte', () => {
    const stockar = [
      stock(1),
      stock(2, { stock_nummer: 2 }),
      stock(3, { stam_nummer: 7 }), // samma fysiska stock som 1 i en senare kumulativ fil
      stock(4, { harvest_date: '2026-11-05T10:00:00', operator_langd_cm: 0 }),
    ];
    const u = byggFeletUnderlag({ stockar, punkter: [punkt(1, 300, -2), punkt(2, 120, 5), punkt(2, 140, 3), punkt(3, 300, -2)], filTradslag: new Map([['f.hqc', 'GRAN']]), tolDia: 4 });
    expect(u.dia).toEqual([
      { stam: '2026-11-05T09:00:00', datum: '2026-11-05', grupp: 'grov', n: 1, traff: 1, summa: -2 },
      { stam: '2026-11-05T09:00:00', datum: '2026-11-05', grupp: 'klen', n: 2, traff: 1, summa: 8 },
    ]);
    expect(u.rot).toEqual([{ stam: '2026-11-05T09:00:00', datum: '2026-11-05', tradslag: 'Gran', avvikCm: 1 }]);
    expect(u.bortLangdfel).toEqual([]);
  });

  it('Skogforsk: en stock vars längd avviker mer än 10 cm ger ingen diameter, 10 cm exakt räknas', () => {
    const stockar = [stock(1, { maskin_langd_cm: 561 }), stock(2, { harvest_date: 'b', maskin_langd_cm: 560 })];
    const u = byggFeletUnderlag({ stockar, punkter: [punkt(1, 120, 5), punkt(2, 120, 3)], filTradslag: new Map([['f.hqc', 'GRAN']]), tolDia: 4 });
    expect(u.dia.map(d => d.stam)).toEqual(['b']);
    expect(u.bortLangdfel).toEqual(['2026-11-05']);
  });
});

// Längden mot beställt (Martin 2026-11-18): klassgränsen är vad stocken MINST måste vara; föraren lägger 3–6 cm övermål i skördaren.
describe('längden mot beställt', () => {
  const VISLANDA = [[372, 433, 440, 494, 546], [372, 433, 440, 494, 548]];

  it('måttbandet över gränsen = inte för kort, övermålet räknas mot maskinens klass', () => {
    expect(langdMotKlass(438, 437, VISLANDA)).toEqual({ kort: false, overCm: 4 });
  });
  it('måttbandet under gränsen = för kort (hamnar i en lägre klass)', () => {
    expect(langdMotKlass(436, 431, VISLANDA)).toEqual({ kort: true, overCm: -2 });
  });
  it('kubb under enda klassen = för kort', () => {
    expect(langdMotKlass(308, 303, [[305]])).toEqual({ kort: true, overCm: -2 });
  });
  it('matriserna säger olika (546 eller 548) = inte bedömd, inget övermål', () => {
    expect(langdMotKlass(550, 547, VISLANDA)).toEqual({ kort: null, overCm: null });
  });
  it('omätt eller kortare än minsta klassen hos maskinen = ingen bedömning', () => {
    expect(langdMotKlass(440, 0, VISLANDA)).toBeNull();
    expect(langdMotKlass(300, 298, VISLANDA)).toBeNull();
    expect(langdMotKlass(440, 437, [])).toBeNull();
  });

  const L = (n: number, o: Partial<{ kort: boolean | null; overCm: number | null; datum: string }> = {}) =>
    Array.from({ length: n }, () => ({ datum: '2026-11-05', kort: false, overCm: 4, ...o }));
  const vy = (langd: FeletResp['langd']) => varSitterFelet({ resp: resp({ langd }), period: 'fonster', fonster: FONSTER, trosklar: VIDA }).langdRad;

  it('inga korta: "Ingen för kort" och övermålet i snitt', () => {
    expect(vy(L(10))).toMatchObject({ titel: 'Längden mot beställt', under: '10 stockar timmer och kubb', varde: 'Ingen för kort', ord: 'övermål 4 cm i snitt', ton: 'ok' });
  });
  it('korta räknas och blir orange; de korta räknas inte i övermålet', () => {
    expect(vy([...L(9), ...L(2, { kort: true, overCm: -3 })])).toMatchObject({ varde: '2 för korta', ord: 'övermål 4 cm i snitt', ton: 'hi' });
  });
  it('obedömda räknas inte; under 8 bedömda stockar ingen rad; stockar utanför perioden räknas inte', () => {
    expect(vy([...L(7), ...L(5, { kort: null })])).toBeNull();
    expect(vy([...L(7), ...L(5, { datum: '2026-01-01' })])).toBeNull();
  });
  it('läsfel är ett fel, äldre server ingen rad', () => {
    expect(vy(null)).toMatchObject({ varde: 'Kunde inte läsas' });
    expect(vy(undefined)).toBeNull();
  });
  it('byggFeletUnderlag: bara stockar vars sortiment har klasser, dubbletter en gång', () => {
    const s = (id: number, namn: string | null, m: number, o: number): FeletStock => ({
      id, filnamn: 'f', kontroll_datum: '2026-11-05', harvest_date: `2026-11-05T10:0${id}:00Z`, stam_nummer: 1, stock_nummer: 1,
      machine_measurement_date: null, operator_measurement_date: null, maskin_langd_cm: m, operator_langd_cm: o, sortiment_namn: namn,
    });
    const ut = byggFeletUnderlag({
      stockar: [s(1, 'Vislanda Tall_V3', 438, 437), s(2, 'BmavFall_V3', 434, 429), s(3, 'Vislanda Tall_V3', 436, 431)],
      punkter: [], filTradslag: new Map(), tolDia: 4, klasser: new Map([['Vislanda Tall_V3', VISLANDA]]),
    });
    expect(ut.langd).toEqual([{ datum: '2026-11-05', kort: false, overCm: 4 }, { datum: '2026-11-05', kort: true, overCm: -2 }]);
  });
});
