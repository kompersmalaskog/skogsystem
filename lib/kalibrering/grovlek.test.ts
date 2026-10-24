import { describe, expect, it } from 'vitest';
import facit from './__fixtures__/scorpion_grovlek_2026.facit.json';
import fixtur from './__fixtures__/scorpion_grovlek_2026.json';
import type { DiaPunkt } from './diameterpunkter';
import {
  byggGrovlekRader, GROVLEK_KLASSER, GROVLEK_MIN_STAMMAR, grovlekKlass, grovlekRutaKontroller, grovlekRutnat, grovlekTradslag,
  type GrovlekRad, type StockRad,
} from './grovlek';
import { traffTon } from './rutnat';

const VIDA = { mal: 85, golv: 75 };
const TRADSLAG: Record<string, string> = { G: 'Gran', T: 'Tall' };
/** Fixturen: [månad, trädslag, klassindex, kontroll, n, träff, summa] → GrovlekRad. */
const rader: GrovlekRad[] = (fixtur.rader as (string | number)[][]).map(r => ({
  manad: r[0] as string, tradslag: TRADSLAG[r[1] as string], klass: GROVLEK_KLASSER[r[2] as number], filnamn: `fil${r[3]}`,
  n: r[4] as number, traff: r[5] as number, summa: r[6] as number,
}));

const stock = (id: number, over: Partial<StockRad> = {}): StockRad => ({
  id, filnamn: 'a.hqc', kontroll_datum: '2026-10-05', harvest_date: '2026-10-05T08:00:00Z', stam_nummer: 1, stock_nummer: 1,
  machine_measurement_date: '2026-10-05T08:00:00Z', operator_measurement_date: '2026-10-05T08:05:00Z', ...over,
});
const punkt = (stockId: number, operator_mm: number, avvik: number): DiaPunkt => ({ stockId, maskin_mm: operator_mm + avvik, operator_mm, avvik, kalla: 'matpunkt' });

describe('grovlekKlass', () => {
  it('delar på operatörens diameter, samma gränser som Träff och Läget', () => {
    expect([149, 150, 199, 200, 249, 250, 299, 300].map(grovlekKlass)).toEqual(['<150', '150-199', '150-199', '200-249', '200-249', '250-299', '250-299', '300+']);
  });
});

describe('byggGrovlekRader — en stam, en stock', () => {
  const filTradslag = new Map([['a.hqc', 'GRAN'], ['b.hqc', 'GRAN'], ['c.hqc', 'TALL']]);

  it('räknar träff mot toleransen och summerar avvikelsen per stam och grovlek', () => {
    const r = byggGrovlekRader({ stockar: [stock(1)], punkter: [punkt(1, 210, 3), punkt(1, 205, -4), punkt(1, 220, 5)], filTradslag, tolerans: 4 });
    expect(r).toEqual([{ manad: '2026-10', tradslag: 'Gran', klass: '200-249', filnamn: 'a.hqc', n: 3, traff: 2, summa: 4 }]);
  });

  it('tolerans kommer utifrån: ±2 ger en annan träff på samma punkter', () => {
    const r = byggGrovlekRader({ stockar: [stock(1)], punkter: [punkt(1, 210, 3), punkt(1, 205, -1)], filTradslag, tolerans: 2 });
    expect(r[0].traff).toBe(1);
  });

  it('samma stam i två klasser blir en rad per klass (en gång per ruta), inte en per mätpunkt', () => {
    const r = byggGrovlekRader({ stockar: [stock(1), stock(2, { stock_nummer: 2 })], punkter: [punkt(1, 300, 1), punkt(1, 310, 1), punkt(2, 180, 0), punkt(2, 190, 0)], filTradslag, tolerans: 4 });
    expect(r.map(x => [x.klass, x.n])).toEqual([['150-199', 2], ['300+', 2]]);
  });

  it('en ackumulerande fil upprepar stammen med ett annat stamnummer: samma skördetid och mättider är samma stock, den äldsta gäller', () => {
    const gammal = stock(10, { filnamn: 'a.hqc', stam_nummer: 2, kontroll_datum: '2026-10-03' });
    const upprepad = stock(20, { filnamn: 'b.hqc', stam_nummer: 1, kontroll_datum: '2026-10-04' });
    const r = byggGrovlekRader({ stockar: [gammal, upprepad], punkter: [punkt(10, 210, 6), punkt(20, 210, 6)], filTradslag, tolerans: 4 });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ n: 1, traff: 0, summa: 6, filnamn: 'a.hqc', manad: '2026-10' });
  });

  it('två olika stammar (olika skördetid) i samma ruta är två rader', () => {
    const a = stock(1);
    const b = stock(2, { harvest_date: '2026-10-05T08:10:00Z', machine_measurement_date: '2026-10-05T08:10:00Z', operator_measurement_date: '2026-10-05T08:15:00Z' });
    const r = byggGrovlekRader({ stockar: [a, b], punkter: [punkt(1, 210, 1), punkt(2, 210, 1)], filTradslag, tolerans: 4 });
    expect(r).toHaveLength(2);
  });

  it('en stam delas på månad (kontrolldatum) men räknas en gång i varje månad', () => {
    const a = stock(1, { kontroll_datum: '2026-09-30', stock_nummer: 1 });
    const b = stock(2, { kontroll_datum: '2026-10-01', stock_nummer: 2, filnamn: 'b.hqc' });
    const r = byggGrovlekRader({ stockar: [a, b], punkter: [punkt(1, 210, 1), punkt(2, 210, 1)], filTradslag, tolerans: 4 });
    expect(r.map(x => x.manad)).toEqual(['2026-09', '2026-10']);
  });

  it('en kontroll utan trädslag ger ingen rad — vi gissar inte', () => {
    expect(byggGrovlekRader({ stockar: [stock(1, { filnamn: 'okand.hqc' })], punkter: [punkt(1, 210, 1)], filTradslag, tolerans: 4 })).toEqual([]);
  });

  it('trädslagen namnges som i resten av appen (ÖVR LÖV och ÖVR_LÖV är samma)', () => {
    const r = byggGrovlekRader({ stockar: [stock(1, { filnamn: 'l.hqc' })], punkter: [punkt(1, 210, 1)], filTradslag: new Map([['l.hqc', 'ÖVR LÖV']]), tolerans: 4 });
    expect(r[0].tradslag).toBe('Övrigt löv');
  });
});

describe('traffTon — grön ≥ kravet, orange mellan golv och krav, röd under golvet', () => {
  it('Vida 85/75: gränserna', () => {
    expect([100, 85, 84.6, 80, 75, 74.5, 74.4, 60].map(p => traffTon(p, VIDA))).toEqual(['gron', 'gron', 'gron', 'orange', 'orange', 'orange', 'rod', 'rod']);
  });
  it('dömer på heltalet som visas: 84,6 visas "85 %" och är grönt, 74,5 visas "75 %" och är orange', () => {
    expect(traffTon(84.6, VIDA)).toBe('gron');
    expect(traffTon(74.5, VIDA)).toBe('orange');
    expect(traffTon(84.4, VIDA)).toBe('orange');
  });
  it('Biometria (mål = golv): inget orange', () => {
    const t = [60, 55, 54].map(p => traffTon(p, { mal: 55, golv: 55 }));
    expect(t).toEqual(['gron', 'gron', 'rod']);
  });
  it('utan krav bedöms inget', () => { expect(traffTon(90, null)).toBe('neutral'); });
});

describe('grovlekRutnat', () => {
  const rad = (manad: string, klass: GrovlekRad['klass'], n: number, traff: number, summa: number, over: Partial<GrovlekRad> = {}): GrovlekRad =>
    ({ manad, tradslag: 'Gran', klass, filnamn: 'k1', n, traff, summa, ...over });

  it('varje stam väger lika: en stam med 20 punkter och en med 2 ger medelvärdet av deras andelar, inte av punkterna', () => {
    const flera = [rad('2026-10', '200-249', 20, 0, 100), ...Array.from({ length: 7 }, () => rad('2026-10', '200-249', 2, 2, 0))];
    const r = grovlekRutnat(flera, { steg: 'manad', tradslag: null, krav: VIDA });
    const ruta = r.rader.find(x => x.klass === '200-249')!.celler[0]!;
    expect(ruta.stammar).toBe(8);
    expect(ruta.punkter).toBe(34);
    expect(ruta.traffPct).toBeCloseTo((100 * 7) / 8, 6); // 87,5 — poolat på punkter vore 14/34 = 41 %
    expect(ruta.snittMm).toBeCloseTo(5 / 8, 6);          // stammen med +5 mm i snitt, de sju med 0
  });

  it(`färre än ${GROVLEK_MIN_STAMMAR} stammar: grå ("tunn"), men siffran finns kvar att visa som titel`, () => {
    const r = grovlekRutnat(Array.from({ length: GROVLEK_MIN_STAMMAR - 1 }, () => rad('2026-10', '150-199', 3, 3, 0)), { steg: 'manad', tradslag: null, krav: VIDA });
    const ruta = r.rader.find(x => x.klass === '150-199')!.celler[0]!;
    expect(ruta.tunn).toBe(true);
    expect(ruta.ton).toBe('tunn');
    expect(ruta.stammar).toBe(GROVLEK_MIN_STAMMAR - 1);
  });

  it('en ruta utan en enda stam är null, inte en ruta med 0 %', () => {
    const r = grovlekRutnat([rad('2026-10', '150-199', 3, 3, 0)], { steg: 'manad', tradslag: null, krav: VIDA });
    expect(r.rader.find(x => x.klass === '300+')!.celler).toEqual([null]);
  });

  it('kvartal och år slår ihop månaderna — stammar läggs ihop, inte medelvärdesbildas', () => {
    const lista = [
      ...Array.from({ length: 5 }, () => rad('2026-07', '200-249', 4, 4, 0)),
      ...Array.from({ length: 5 }, () => rad('2026-09', '200-249', 4, 0, 8)),
    ];
    const m = grovlekRutnat(lista, { steg: 'manad', tradslag: null, krav: VIDA });
    expect(m.perioder).toEqual(['2026-07', '2026-09']);
    const q = grovlekRutnat(lista, { steg: 'kvartal', tradslag: null, krav: VIDA });
    expect(q.perioder).toEqual(['2026-Q3']);
    const ruta = q.rader.find(x => x.klass === '200-249')!.celler[0]!;
    expect(ruta.stammar).toBe(10);
    expect(ruta.traffPct).toBe(50);
    expect(ruta.snittMm).toBe(1);
    const ar = grovlekRutnat(lista, { steg: 'ar', tradslag: null, krav: VIDA });
    expect(ar.perioder).toEqual(['2026']);
  });

  it('trädslagsvalet filtrerar raderna och perioderna följer med', () => {
    const lista = [...Array.from({ length: 8 }, () => rad('2026-08', '200-249', 4, 4, 0)), ...Array.from({ length: 8 }, () => rad('2026-10', '200-249', 4, 1, 12, { tradslag: 'Tall' }))];
    const tall = grovlekRutnat(lista, { steg: 'manad', tradslag: 'Tall', krav: VIDA });
    expect(tall.perioder).toEqual(['2026-10']);
    expect(tall.rader.find(x => x.klass === '200-249')!.celler[0]).toMatchObject({ stammar: 8, traffPct: 25, snittMm: 3, ton: 'rod' });
    expect(tall.tradslag).toEqual(['Gran', 'Tall']); // växeln visar alla trädslag i underlaget, inte bara det valda
  });

  it('kontrollerna bakom rutan, utan dubbletter', () => {
    const lista = [rad('2026-10', '200-249', 4, 4, 0, { filnamn: 'k2' }), rad('2026-10', '200-249', 4, 4, 0, { filnamn: 'k1' }), rad('2026-10', '200-249', 4, 4, 0, { filnamn: 'k1' })];
    const ruta = grovlekRutnat(lista, { steg: 'manad', tradslag: null, krav: VIDA }).rader.find(x => x.klass === '200-249')!.celler[0]!;
    expect(ruta.filnamn).toEqual(['k1', 'k2']);
  });

  it('trädslagen ordnas efter antal stammar', () => {
    expect(grovlekTradslag([rad('2026-10', '200-249', 1, 1, 0, { tradslag: 'Tall' }), rad('2026-10', '200-249', 1, 1, 0), rad('2026-10', '150-199', 1, 1, 0)])).toEqual(['Gran', 'Tall']);
  });
});

describe('grovlekRutaKontroller — kontrollerna bakom en ruta', () => {
  const rad = (filnamn: string, n: number, traff: number, summa: number, over: Partial<GrovlekRad> = {}): GrovlekRad =>
    ({ manad: '2026-10', tradslag: 'Gran', klass: '200-249', filnamn, n, traff, summa, ...over });
  it('en rad per kontroll med dess egna stammar, träff och medelfel i rutan — flest stammar först', () => {
    const lista = [rad('a', 4, 4, 0), rad('b', 4, 2, 8), rad('b', 4, 0, 16), rad('c', 4, 4, 0, { klass: '150-199' }), rad('d', 4, 4, 0, { manad: '2026-09' }), rad('e', 4, 4, 0, { tradslag: 'Tall' })];
    const k = grovlekRutaKontroller(lista, { klass: '200-249', period: '2026-10', steg: 'manad', tradslag: 'Gran', krav: VIDA });
    expect(k).toEqual([
      { filnamn: 'b', stammar: 2, traffPct: 25, snittMm: 3 },
      { filnamn: 'a', stammar: 1, traffPct: 100, snittMm: 0 },
    ]);
  });
  it('summerar till rutans stammar', () => {
    const lista = [rad('a', 4, 4, 0), rad('b', 4, 2, 8), rad('b', 4, 0, 16)];
    const ruta = grovlekRutnat(lista, { steg: 'manad', tradslag: null, krav: VIDA }).rader.find(x => x.klass === '200-249')!.celler[0]!;
    const k = grovlekRutaKontroller(lista, { klass: '200-249', period: '2026-10', steg: 'manad', tradslag: null, krav: VIDA });
    expect(k.reduce((a, x) => a + x.stammar, 0)).toBe(ruta.stammar);
  });
});

// === Scorpionen 2026 — riktiga tal mot facit räknat i SQL, oberoende av koden ovan ===
describe('Scorpionen 2026 (prod 2026-10-23)', () => {
  const klassIdx = (k: string) => GROVLEK_KLASSER.indexOf(k as typeof GROVLEK_KLASSER[number]);
  const forTradslag = (t: string | null) => grovlekRutnat(rader, { steg: 'manad', tradslag: t, krav: VIDA });
  const cell = (r: ReturnType<typeof grovlekRutnat>, manad: string, klass: number) => r.rader[klass].celler[r.perioder.indexOf(manad)];

  it('fixturen är hel: 796 stam × grovlek × månad-rader', () => { expect(rader).toHaveLength(796); });

  it('varje ruta (månad × trädslag × grovlek) stämmer med SQL-facit: antal stammar, träff och medelfel', () => {
    let kontrollerade = 0;
    for (const [manad, t, k, stammar, traff, snitt] of facit.celler as [string, string, number, number, number, number][]) {
      const r = forTradslag(TRADSLAG[t]);
      const c = cell(r, manad, k);
      expect(c, `${manad} ${t} ${k}`).not.toBeNull();
      expect(c!.stammar, `${manad} ${t} ${k} stammar`).toBe(stammar);
      expect(c!.traffPct, `${manad} ${t} ${k} träff`).toBeCloseTo(traff, 0);
      expect(Math.abs(c!.traffPct - traff), `${manad} ${t} ${k} träff`).toBeLessThan(0.06);
      expect(Math.abs(c!.snittMm - snitt), `${manad} ${t} ${k} snitt`).toBeLessThan(0.006);
      kontrollerade++;
    }
    expect(kontrollerade).toBe(facit.celler.length);
  });

  it('"Alla trädslag" juli–oktober stämmer med SQL-facit', () => {
    const r = forTradslag(null);
    for (const [manad, , k, stammar, traff, snitt] of facit.alla as [string, string, number, number, number, number][]) {
      const c = cell(r, manad, k)!;
      expect(c.stammar).toBe(stammar);
      expect(Math.abs(c.traffPct - traff)).toBeLessThan(0.06);
      expect(Math.abs(c.snittMm - snitt)).toBeLessThan(0.006);
    }
  });

  it('Tall efter 18 juli: cirka 62 % träff och +3 mm — i varje grovlek i oktober', () => {
    const tall = forTradslag('Tall');
    const snitt = facit.efter_18_juli.tall;
    const efter = rader.filter(r => r.tradslag === 'Tall' && r.manad >= '2026-07');
    expect(efter).toHaveLength(snitt.rader);
    expect(Math.abs((100 * efter.reduce((a, r) => a + r.traff / r.n, 0)) / efter.length - snitt.traffPct)).toBeLessThan(0.06);
    expect((efter.reduce((a, r) => a + r.summa / r.n, 0) / efter.length)).toBeCloseTo(2.65, 1);
    // Oktober: fem klasser, alla runt 60 % (utom klenaste) och alla +2–3 mm
    for (const klass of [1, 2, 3, 4]) {
      const c = cell(tall, '2026-10', klass)!;
      expect(c.traffPct).toBeGreaterThan(59);
      expect(c.traffPct).toBeLessThan(63);
      expect(c.snittMm).toBeGreaterThan(2.2);
      expect(c.snittMm).toBeLessThan(3.1);
      expect(c.ton).toBe('rod');
    }
  });

  it('Gran efter 18 juli: cirka 79 % träff', () => {
    const efter = rader.filter(r => r.tradslag === 'Gran' && r.manad >= '2026-07');
    expect(efter).toHaveLength(facit.efter_18_juli.gran.rader);
    expect((100 * efter.reduce((a, r) => a + r.traff / r.n, 0)) / efter.length).toBeCloseTo(78.5, 1);
  });

  it('300+ är sämst i gran i varje månad som har underlag för en bedömning (juli, augusti, september, mars)', () => {
    const gran = forTradslag('Gran');
    for (const manad of ['2026-03', '2026-07', '2026-08', '2026-09']) {
      const c = gran.rader.map((_, k) => cell(gran, manad, k)!);
      expect(c[4].tunn, manad).toBe(false);
      const sämst = c.reduce((a, b) => (b.traffPct < a.traffPct ? b : a));
      expect(sämst.klass, manad).toBe('300+');
    }
  });

  it('grindarna: Tall i juli–september är grått (1–2 stammar per ruta), oktober räknas', () => {
    const tall = forTradslag('Tall');
    for (const manad of ['2026-07', '2026-08', '2026-09']) for (let k = 0; k < 5; k++) { const c = cell(tall, manad, k); if (c) expect(c.tunn, `${manad} ${k}`).toBe(true); }
    for (let k = 0; k < 5; k++) { const c = cell(tall, '2026-10', k)!; if (k !== 4 || c.stammar >= GROVLEK_MIN_STAMMAR) expect(c.stammar).toBeGreaterThan(0); }
    expect(cell(tall, '2026-10', 3)!.tunn).toBe(false); // 9 stammar
    expect(cell(tall, '2026-10', 4)!.tunn).toBe(false); // 8 stammar — exakt på gränsen
  });

  it('oktober mot september i alla trädslag: sämre i klenare klasser, men 300+ är oförändrad — och orsaken är att Tall kommer in i oktober', () => {
    const alla = forTradslag(null);
    const sam = [0, 1, 2, 3, 4].map(k => cell(alla, '2026-10', k)!.traffPct - cell(alla, '2026-09', k)!.traffPct);
    expect(sam.slice(0, 4).every(d => d < -9)).toBe(true);
    expect(sam[4]).toBeGreaterThan(0); // 300+: 62,9 mot 61,1 — inte sämre
    // Gran ensam: <150, 200 och 250 sämre, 150 och 300+ inte (9 respektive 2 stammar i 300+)
    const gran = forTradslag('Gran');
    const g = [0, 1, 2, 3, 4].map(k => cell(gran, '2026-10', k)!.traffPct - cell(gran, '2026-09', k)!.traffPct);
    expect(g[0]).toBeLessThan(0); expect(g[2]).toBeLessThan(0); expect(g[3]).toBeLessThan(-9);
    expect(g[1]).toBeGreaterThan(0);
  });
});
