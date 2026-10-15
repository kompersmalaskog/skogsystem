import { describe, it, expect } from 'vitest';
import { fmtAlder, fmtDatum, fmtKlocka, fmtSedan, harledAvvikelse, harledHero, lampRad, matareText, rundaTitel, senasteKorning, tankRad, type LastbilData, type Runda } from './nu';

// Formen på /api/lastbil med värdena ur prod 2026-10-13 07:06 UTC (bilen stilla på LBC):
// diesel 62 %, AdBlue 71,2 %, räckvidd 270 km, inga lampor, mätare 301 128 km, service saknas i avläsningen.
const PARKERAD: LastbilData = {
  ok: true, harData: true, namn: null,
  position: { lat: 56.459, lng: 14.702, tidpunkt: '2026-10-13T07:06:59Z', alder_min: 54 },
  tank: { diesel_pct: 62, adblue_pct: 71.2, rackvidd_km: 270 },
  halsa: { har_lampor: true, lampor: [], service_km: null, matare_km: 301128, motortimmar: null },
  runda_pagar: false, oppen_runda_id: null, oppen_runda: null,
  parkerad: { plats: 'LBC', sedan: '2026-10-13T07:06:59Z' },
  rundor: [
    { id: '30154836', starttid: '2026-10-12T09:30:00Z', sluttid: '2026-10-12T17:33:05Z', typ: 'ovrig', antal_flytt: 0, matare_km: 294, bransle_l: 126.9, l_per_mil: 4.3 },
    { id: '3e823d15', starttid: '2026-10-06T13:52:17Z', sluttid: '2026-10-06T17:55:11Z', typ: 'flytt', antal_flytt: 1, matare_km: 163.2, bransle_l: 67.3, l_per_mil: 4.1 },
  ],
  saknas: ['service'],
};
const NU = new Date('2026-10-13T09:00:00Z');   // 11:00 svensk tid, samma dag
const med = (d: Partial<LastbilData>): LastbilData => ({ ...PARKERAD, ...d });

describe('hero', () => {
  it('parkerad: läget står i ord, med sedan-när och när bilen sågs', () => {
    const h = harledHero(PARKERAD, NU);
    expect(h).toMatchObject({ rubrik: 'Parkerad på LBC', farg: 'text', mikro: null, tal: null, puls: false });
    expect(h.meta).toBe('sedan 09:06 · senast sedd för 54 min sedan');
  });

  it('kör nu: maskin på flaket, rundans km som huvudtal, puls bara här', () => {
    const h = harledHero(med({
      parkerad: null, runda_pagar: true, oppen_runda_id: 'x',
      oppen_runda: { id: 'x', starttid: '2026-10-13T04:41:00Z', live_km: 38, maskin: { namn: 'Giant', lage: 'flaket' }, pa_vag_hem: false, km_kvar: null },
      position: { lat: 56.4, lng: 14.7, tidpunkt: '2026-10-13T08:58:00Z', alder_min: 2 },
    }), NU);
    expect(h).toMatchObject({ mikro: 'Kör nu', rubrik: 'Giant på flaket', tal: '38 km', puls: true, farg: 'text' });
    expect(h.meta).toBe('Avfärd 06:41 · senast sedd för 2 min sedan');
  });

  it('lossad och på väg hem', () => {
    const o = { id: 'x', starttid: '2026-10-13T04:41:00Z', live_km: 80, maskin: { namn: 'Giant', lage: 'lossad' as const }, pa_vag_hem: false, km_kvar: null };
    expect(harledHero(med({ parkerad: null, oppen_runda: o }), NU).rubrik).toBe('Giant lossad');
    const hem = harledHero(med({ parkerad: null, oppen_runda: { ...o, pa_vag_hem: true, km_kvar: 12 } }), NU);
    expect(hem).toMatchObject({ mikro: 'På väg hem', rubrik: 'På väg hem', rad: 'ungefär 12 km kvar' });
  });

  it('övrig körning utan maskin säger det', () => {
    const h = harledHero(med({ parkerad: null, oppen_runda: { id: 'x', starttid: null, live_km: null, maskin: null, pa_vag_hem: false, km_kvar: null } }), NU);
    expect(h).toMatchObject({ rubrik: 'Övrig körning', rad: 'ingen maskin på flaket', tal: '–' });
  });

  it('varken parkerad eller kör: säger att ingen runda pågår (gissar inte var den står)', () => {
    const h = harledHero(med({ parkerad: null, namn: 'R450' }), NU);
    expect(h.rubrik).toBe('Scania R450');
    expect(h.meta).toBe('Ingen runda pågår · senast sedd för 54 min sedan');
  });
});

describe('avvikelse tar över rubriken', () => {
  it('ingen avvikelse vid 62 % diesel och inga lampor', () => {
    expect(harledAvvikelse(PARKERAD)).toBeNull();
  });
  it('diesel under 15 % är röd, under 25 % orange', () => {
    expect(harledAvvikelse(med({ tank: { diesel_pct: 14, adblue_pct: 71, rackvidd_km: 95 } }))).toMatchObject({ niva: 'rod', rubrik: 'Diesel 14 % – tanka nu', under: 'Räckvidd 95 km' });
    expect(harledAvvikelse(med({ tank: { diesel_pct: 20, adblue_pct: 71, rackvidd_km: 200 } }))).toMatchObject({ niva: 'orange', rubrik: 'Diesel 20 % – tanka snart' });
  });
  it('räckvidd och AdBlue ger orange; en tänd lampa ger röd före allt annat', () => {
    expect(harledAvvikelse(med({ tank: { diesel_pct: 60, adblue_pct: 71, rackvidd_km: 120 } }))?.rubrik).toBe('Räckvidd 120 km – tanka snart');
    expect(harledAvvikelse(med({ tank: { diesel_pct: 60, adblue_pct: 15, rackvidd_km: 400 } }))?.rubrik).toBe('AdBlue 15 % – fyll på');
    const lampa = harledAvvikelse(med({
      tank: { diesel_pct: 10, adblue_pct: 71, rackvidd_km: 50 },
      halsa: { har_lampor: true, lampor: [{ kod: 'EBS', namn: 'EBS (bromssystem)', state: 'RED' }], service_km: null, matare_km: 1, motortimmar: null },
    }));
    expect(lampa).toMatchObject({ niva: 'rod', rubrik: 'EBS (bromssystem) lyser' });
  });
  it('rubriken blir avvikelsen, men läget finns kvar i raden under', () => {
    const h = harledHero(med({ tank: { diesel_pct: 14, adblue_pct: 71, rackvidd_km: 95 } }), NU);
    expect(h).toMatchObject({ mikro: 'Kräver handling', rubrik: 'Diesel 14 % – tanka nu', farg: 'rod' });
    expect(h.meta).toBe('Räckvidd 95 km · Parkerad på LBC · senast sedd för 54 min sedan');
  });
});

describe('kort och rader: saknade värden står som "saknas i datan", aldrig 0', () => {
  it('tank', () => {
    expect(tankRad(PARKERAD)).toEqual({ rubrik: 'Diesel 62 % · AdBlue 71 %', farg: 'text', under: 'Räckvidd 270 km' });
    expect(tankRad(med({ tank: { diesel_pct: null, adblue_pct: 71, rackvidd_km: null } }))).toMatchObject({ rubrik: 'Diesel saknas i datan · AdBlue 71 %', under: 'Räckvidd saknas i datan' });
    expect(tankRad(med({ tank: { diesel_pct: 14, adblue_pct: 71, rackvidd_km: 95 } })).farg).toBe('rod');
    expect(tankRad(med({ tank: { diesel_pct: 22, adblue_pct: 71, rackvidd_km: 200 } })).farg).toBe('orange');
  });
  it('lampor och service', () => {
    expect(lampRad(PARKERAD)).toEqual({ rubrik: 'Inga varningar', farg: 'gron', under: 'Service: saknas i datan' });
    expect(lampRad(med({ halsa: { har_lampor: false, lampor: [], service_km: 4200, matare_km: null, motortimmar: null } })))
      .toEqual({ rubrik: 'Varningslampor saknas i datan', farg: 'dampad', under: 'Service om 4 200 km' });
    expect(lampRad(med({ halsa: { har_lampor: true, lampor: [{ kod: 'a', namn: 'ABS-fel', state: 'RED' }, { kod: 'b', namn: 'Bromsfel', state: 'RED' }], service_km: null, matare_km: null, motortimmar: null } })))
      .toMatchObject({ rubrik: '2 varningar', farg: 'rod' });
  });
  it('mätare', () => {
    expect(matareText(PARKERAD)).toEqual({ km: '301 128 km', motortimmar: null });
    expect(matareText(med({ halsa: null }))).toEqual({ km: 'saknas i datan', motortimmar: null });
  });
});

describe('senaste körning', () => {
  const r = (o: Partial<Runda>): Runda => ({ id: 'a', starttid: '2026-10-01T05:00:00Z', sluttid: '2026-10-01T07:00:00Z', typ: 'ovrig', antal_flytt: 0, matare_km: 10, bransle_l: 4, l_per_mil: 4, ...o });
  it('hoppar över en pågående runda', () => {
    expect(senasteKorning([r({ id: 'p', typ: 'pagar', sluttid: null }), r({ id: 'f' })])?.id).toBe('f');
  });
  it('hoppar över en runda med sluttid före start (514d88e1 som den såg ut före rättningen)', () => {
    const trasig = r({ id: 'trasig', starttid: '2026-08-12T18:33:09Z', sluttid: '2026-08-11T10:43:30Z', matare_km: 0 });
    expect(senasteKorning([trasig, r({ id: 'hel' })])?.id).toBe('hel');
  });
  it('inga rundor → null', () => {
    expect(senasteKorning([])).toBeNull();
  });
  it('titel', () => {
    expect(rundaTitel(r({ typ: 'ovrig' }))).toBe('Övrig körning');
    expect(rundaTitel(r({ typ: 'flytt', antal_flytt: 1 }))).toBe('Flytt');
    expect(rundaTitel(r({ typ: 'flytt', antal_flytt: 2 }))).toBe('Flytt · 2 maskiner');
  });
});

describe('tider (Stockholm, aldrig enhetens zon)', () => {
  it('klockslag och datum i sommartid', () => {
    expect(fmtKlocka('2026-10-12T09:30:00Z')).toBe('11:30');
    expect(fmtDatum('2026-10-12T09:30:00Z')).toBe('mån 12 okt');
    expect(fmtDatum(null)).toBe('—');
  });
  it('sedan-texter', () => {
    const nu = new Date('2026-10-13T09:00:00Z');
    expect(fmtSedan('2026-10-13T07:06:59Z', nu)).toBe('sedan 09:06');
    expect(fmtSedan('2026-10-12T07:06:59Z', nu)).toBe('sedan igår 09:06');
    expect(fmtSedan('2026-10-09T07:06:59Z', nu)).toBe('sedan fre 09:06');
    expect(fmtSedan('2026-09-28T06:53:39Z', nu)).toBe('sedan 28 sep 08:53');
    expect(fmtSedan(null, nu)).toBe('');
  });
  it('ålder', () => {
    expect(fmtAlder(null)).toBe('okänd tid');
    expect(fmtAlder(0)).toBe('nyss');
    expect(fmtAlder(5)).toBe('för 5 min sedan');
    expect(fmtAlder(130)).toBe('för 2 h 10 min sedan');
    expect(fmtAlder(120)).toBe('för 2 h sedan');
  });
});
