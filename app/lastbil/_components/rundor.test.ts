import { describe, it, expect } from 'vitest';
import { byggRundor, fakturerbaraKm, fmtLPerMil, perVecka, rundaLPerMil, rundorTillCsv, summera, type Ben, type RundaRad } from './rundor';

// Riktiga rader ur flyttdag (prod 2026-10-15, EFTER rättningen av dubbelrundorna).
const rad = (id: string, s: string, e: string | null, o: Partial<RundaRad> = {}): RundaRad => ({
  id, forare: null, starttid: s, sluttid: e, status: 'ovrig_korning', auto_avslutad_av: 'cron',
  tillkorning_km: null, hem_km: null, hemresa_matt: true, total_km: null, matare_km: null, bransle_l: null, ...o,
});
const OKT: RundaRad[] = [
  rad('30154836', '2026-10-12T09:30:00Z', '2026-10-12T17:33:05Z', { matare_km: 294, bransle_l: 126.9, hem_km: 9.6 }),
  rad('3e823d15', '2026-10-06T13:52:17Z', '2026-10-06T17:55:11Z', { forare: 'Martin Lindqvist', status: 'avslutad', auto_avslutad_av: null, matare_km: 163.2, total_km: 165.2, bransle_l: 67.3, tillkorning_km: 41, hem_km: 71.2 }),
  rad('3bfa4d19', '2026-10-05T03:47:08Z', '2026-10-05T07:57:47Z', { forare: 'Martin Lindqvist', status: 'avslutad', auto_avslutad_av: null, matare_km: 132.6, total_km: 75.5, bransle_l: 49.2, tillkorning_km: 0, hem_km: 39.5 }),
  rad('b9c1d038', '2026-10-01T12:23:45Z', '2026-10-01T13:56:14Z', { matare_km: 47.5, bransle_l: 18.4 }),
  rad('34cddb13', '2026-10-01T05:22:12Z', '2026-10-01T11:42:24Z', { matare_km: 180.1, bransle_l: 87.6 }),
];
const ben = (maskin: string, km: number, fakturerbar: boolean): Ben =>
  ({ id: maskin, maskin, fran: 'Från', till: 'Till', km, min: 60, tomKm: null, fakturerbar, typ: 'produktion', kund: null });
const BEN = new Map<string, Ben[]>([
  ['3e823d15', [ben('Giant', 53, true)]],
  ['3bfa4d19', [ben('Elefant 26', 36, true)]],
]);

describe('oktober 2026: som i mockupen', () => {
  const rundor = byggRundor(OKT, BEN);
  const s = summera(rundor);

  it('5 rundor: 2 flytt (296 km) och 3 övrig körning (522 km), totalt 818 km som summa av avrundade delar', () => {
    expect(s).toMatchObject({ antal: 5, flytt: 2, ovrig: 3, kmFlytt: 296, kmOvrig: 522, km: 818 });
    expect(s.km).toBe(s.kmFlytt + s.kmOvrig);
    expect(rundor.filter(r => r.km != null).reduce((a, r) => a + (r.km as number), 0)).toBe(s.km);   // = det som listan visar
  });
  it('diesel 349 l (summa av avrundade) och 4,3 l/mil', () => {
    expect(s.liter).toBe(349);
    expect(fmtLPerMil(s.lPerMil)).toBe('4,3');
  });
  it('mätare först, rutt som reserv, och en flytt har fakturerbara km', () => {
    const r = rundor.find(x => x.id === '3e823d15')!;
    expect(r).toMatchObject({ km: 163, kmKalla: 'mätare', flytt: true });
    expect(fakturerbaraKm(r)).toBe(53);
    expect(rundor.find(x => x.id === '30154836')).toMatchObject({ flytt: false, km: 294 });
  });
  it('nyast först, grupperat per ISO-vecka på svensk startdag (v42, v41, v40)', () => {
    expect(rundor.map(r => r.id)[0]).toBe('30154836');
    expect(perVecka(rundor).map(v => [v.vecka, v.rundor.length])).toEqual([[42, 1], [41, 2], [40, 2]]);
  });
  it('en runda 00:30 svensk tid söndag natt hör till rätt vecka (UTC-datumet är fel dag)', () => {
    const natt = byggRundor([rad('n', '2026-10-10T22:30:00Z', '2026-10-11T01:00:00Z')], new Map());   // 11 okt 00:30 svensk tid = söndag
    expect(perVecka(natt)[0].vecka).toBe(41);   // söndag 11 okt ligger i v41 (ISO), inte v42
  });
});

describe('rättningen av dubbelrundorna syns som kedja, inte som överlapp', () => {
  const FF = rad('ff5ec997', '2026-08-20T04:04:46Z', '2026-08-20T05:44:30.470Z', { forare: 'Martin Lindqvist', status: 'avslutad', auto_avslutad_av: null, matare_km: 41.5, bransle_l: 14 });
  const FORE = rad('c454bda3', '2026-08-20T04:04:46Z', '2026-08-20T08:30:54Z', { matare_km: 108, bransle_l: 50.8 });
  const EFTER = rad('c454bda3', '2026-08-20T05:44:30.470Z', '2026-08-20T08:30:54Z', { matare_km: 66.5, bransle_l: 31.3 });
  const benFF = new Map([['ff5ec997', [ben('Wisent', 10, false)]]]);

  it('före rättningen: två rundor på samma bil överlappar, och vyn ska säga det', () => {
    const r = byggRundor([FF, FORE], benFF);
    expect(r.every(x => x.overlappar)).toBe(true);
    expect(summera(r).overlappande).toBe(2);
  });
  it('efter: ingen överlappar, och den andra är en fortsättning efter första rundans slut', () => {
    const r = byggRundor([FF, EFTER], benFF);
    expect(r.some(x => x.overlappar)).toBe(false);
    expect(r.find(x => x.id === 'c454bda3')!.fortsattningEfter).toBe('2026-08-20T05:44:30.470Z');
    expect(r.find(x => x.id === 'ff5ec997')!.fortsattningEfter).toBeNull();
    expect(summera(r).km).toBe(42 + 67);   // 41,5 → 42 och 66,5 → 67: avrundade delar
  });
});

describe('rundor som inte räknas, och aldrig som 0', () => {
  it('514d88e1 före rättningen: sluttid före start räknas aldrig men syns', () => {
    const r = byggRundor([rad('514d88e1', '2026-08-12T18:33:09.684Z', '2026-08-11T10:43:30Z', { forare: 'Joacim Ringberg', matare_km: 0, bransle_l: -0.1 })], new Map());
    expect(r[0]).toMatchObject({ giltig: false, ogiltigTid: true, km: null, liter: null, minuter: null });
    expect(summera(r)).toMatchObject({ antal: 0, ogiltiga: 1, km: 0 });
  });
  it('514d88e1 efter rättningen: en tom runda (0 min, 0 km) — räknas, med 0 km som ÄR sant, utan diesel', () => {
    const r = byggRundor([rad('514d88e1', '2026-08-12T18:33:09.684Z', '2026-08-12T18:33:09.684Z', { forare: 'Joacim Ringberg', matare_km: 0, bransle_l: null })], new Map());
    expect(r[0]).toMatchObject({ giltig: true, tom: true, km: 0, liter: null, overlappar: false });
  });
  it('en pågående runda visas men räknas inte', () => {
    const r = byggRundor([rad('p', '2026-10-15T05:00:00Z', null, { status: 'pagaende', matare_km: null })], new Map());
    expect(r[0]).toMatchObject({ pagar: true, giltig: false, ogiltigTid: false, km: null });
    expect(summera(r)).toMatchObject({ antal: 0, pagande: 1 });
  });
  it('juli 2026: ingen diesel loggad → liter och l/mil är null (saknas), inte 0', () => {
    const jul = byggRundor([
      rad('995673b4', '2026-07-24T12:19:22Z', '2026-07-24T14:35:24Z', { forare: 'Martin Lindqvist', status: 'avslutad', matare_km: 91.3, total_km: 71, bransle_l: null }),
      rad('8e99c732', '2026-07-29T05:00:03Z', '2026-07-29T06:37:39Z', { forare: 'Martin Lindqvist', status: 'avslutad', matare_km: null, total_km: 54, bransle_l: null }),
      rad('b7243278', '2026-07-31T12:59:05Z', '2026-07-31T14:57:53Z', { forare: 'Martin Lindqvist', matare_km: null, total_km: null }),
    ], new Map());
    const s = summera(jul);
    expect(s.liter).toBeNull();
    expect(s.lPerMil).toBeNull();
    expect(jul.find(r => r.id === '8e99c732')).toMatchObject({ km: 54, kmKalla: 'rutt' });
    expect(jul.find(r => r.id === 'b7243278')).toMatchObject({ km: null, kmKalla: null });   // ingen km alls: "–", aldrig 0
    expect(s.km).toBe(91 + 54);
  });
  it('b7243278 (31 jul): en AVBRUTEN runda visas men räknas aldrig — som Flyttloggen', () => {
    const r = byggRundor([rad('b7243278', '2026-07-31T12:59:05.835Z', '2026-07-31T14:57:53.314Z', { forare: 'Martin Lindqvist', status: 'avbruten', auto_avslutad_av: null, tillkorning_km: 32 })], new Map());
    expect(r[0]).toMatchObject({ avbruten: true, giltig: false, ogiltigTid: false, pagar: false, km: null, liter: null, tom: false });
    expect(summera(r)).toMatchObject({ antal: 0, ovrig: 0, km: 0, ogiltiga: 0 });
  });
  it('l/mil för en runda kräver både mätare och diesel', () => {
    const r = byggRundor([rad('x', '2026-10-01T05:00:00Z', '2026-10-01T06:00:00Z', { matare_km: 100, bransle_l: 45 }), rad('y', '2026-10-02T05:00:00Z', '2026-10-02T06:00:00Z', { matare_km: 100 })], new Map());
    expect(rundaLPerMil(r.find(x => x.id === 'x')!)).toBe(4.5);
    expect(rundaLPerMil(r.find(x => x.id === 'y')!)).toBeNull();
  });
});

describe('CSV', () => {
  it('en rad per runda med rubrikrad, svensk tid och märkning', () => {
    const rundor = byggRundor(OKT, BEN);
    const csv = rundorTillCsv(rundor);
    expect(csv[0]).toEqual(['Datum', 'Start', 'Slut', 'Typ', 'Maskiner', 'Från', 'Till', 'Förare', 'Mätare km', 'Rutt km', 'Diesel l', 'l/mil', 'Fakturerbart km', 'Märkning']);
    expect(csv).toHaveLength(1 + 5);
    expect(csv[1].slice(0, 4)).toEqual(['2026-10-12', '11:30', '19:33', 'Övrig körning']);
    const flytt = csv.find(r => r[0] === '2026-10-06')!;
    expect(flytt.slice(3, 5)).toEqual(['Flytt', 'Giant']);
    expect(flytt[12]).toBe(53);
  });
});
