import { describe, it, expect } from 'vitest';
import { fmtAlder, fmtDatum, fmtKlocka, fmtSedan, lageRad, lampaRubrik, matareText, senasteKorning, serviceRad, sistSedd, tankDelar, type LastbilData, type Runda } from './nu';

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

describe('läget i ord + sedan när', () => {
  it('parkerad: "Parkerad vid <plats> · sedan <klockslag>"', () => {
    expect(lageRad(PARKERAD, NU)).toBe('Parkerad vid LBC · sedan 09:06');
    expect(lageRad(med({ parkerad: { plats: 'Kompersmåla', sedan: '2026-10-13T13:02:00Z' } }), NU)).toBe('Parkerad vid Kompersmåla · sedan 15:02');
    expect(lageRad(med({ parkerad: { plats: 'LBC', sedan: '2026-10-12T07:06:59Z' } }), NU)).toBe('Parkerad vid LBC · sedan igår 09:06');
  });

  it('kör nu: maskin på flaket, rundans km och avfärd', () => {
    const o = { id: 'x', starttid: '2026-10-13T04:41:00Z', live_km: 34, maskin: { namn: 'Giant', lage: 'flaket' as const }, pa_vag_hem: false, km_kvar: null };
    expect(lageRad(med({ parkerad: null, oppen_runda: o }), NU)).toBe('Kör nu · Giant på flaket · 34 km · avfärd 06:41');
    expect(lageRad(med({ parkerad: null, oppen_runda: { ...o, maskin: { namn: 'Giant', lage: 'lossad' } } }), NU)).toBe('Kör nu · Giant lossad · 34 km · avfärd 06:41');
  });

  it('på väg hem: km kvar; utan km kvar rundans km', () => {
    const o = { id: 'x', starttid: '2026-10-13T04:41:00Z', live_km: 80, maskin: { namn: 'Giant', lage: 'lossad' as const }, pa_vag_hem: true, km_kvar: 12 };
    expect(lageRad(med({ parkerad: null, oppen_runda: o }), NU)).toBe('På väg hem · ungefär 12 km kvar · avfärd 06:41');
    expect(lageRad(med({ parkerad: null, oppen_runda: { ...o, km_kvar: null } }), NU)).toBe('På väg hem · 80 km · avfärd 06:41');
  });

  it('övrig körning utan maskin; saknade km och avfärd utelämnas — inget "–" och ingen nolla', () => {
    expect(lageRad(med({ parkerad: null, oppen_runda: { id: 'x', starttid: null, live_km: null, maskin: null, pa_vag_hem: false, km_kvar: null } }), NU)).toBe('Kör nu · Övrig körning');
  });

  it('varken parkerad eller kör: säger att ingen runda pågår (gissar inte var den står)', () => {
    expect(lageRad(med({ parkerad: null, namn: 'R450' }), NU)).toBe('Ingen runda pågår');
  });
});

describe('tankraden: EN kort rad, orden på egna rader under — bara när de gäller', () => {
  const text = (d: LastbilData) => tankDelar(d).map(x => x.text).join(' · ');
  const niva = (d: LastbilData) => tankDelar(d).map(x => x.niva);
  const ord = (d: LastbilData) => tankDelar(d).map(x => x.ord).filter(Boolean);
  it('62 % diesel, 71 % AdBlue, 270 km: allt ok, inga ord under', () => {
    expect(text(PARKERAD)).toBe(['Diesel 62 %', 'AdBlue 71 %', `${(270).toLocaleString('sv-SE')} km`].join(' · '));
    expect(niva(PARKERAD)).toEqual(['ok', 'ok', 'ok']);
    expect(ord(PARKERAD)).toEqual([]);
  });
  it('raden är kort även med fulla värden (så den ryms på 390 px): "Diesel 100 % · AdBlue 100 % · 1 540 km"', () => {
    const full = med({ tank: { diesel_pct: 100, adblue_pct: 100, rackvidd_km: 1540 } });
    expect(text(full)).toBe(`Diesel 100 % · AdBlue 100 % · ${(1540).toLocaleString('sv-SE')} km`);
    expect(text(full).length).toBeLessThanOrEqual(40);
  });
  it('diesel under 15 % är röd "tanka nu", under 25 % orange "tanka snart" — orden står i `ord`, siffran i raden; gränserna som förut', () => {
    expect(tankDelar(med({ tank: { diesel_pct: 14, adblue_pct: 71, rackvidd_km: 95 } }))[0]).toEqual({ text: 'Diesel 14 %', niva: 'rod', ord: 'Diesel låg – tanka nu' });
    expect(tankDelar(med({ tank: { diesel_pct: 20, adblue_pct: 71, rackvidd_km: 200 } }))[0]).toEqual({ text: 'Diesel 20 %', niva: 'orange', ord: 'Diesel låg – tanka snart' });
    expect(tankDelar(med({ tank: { diesel_pct: 15, adblue_pct: 71, rackvidd_km: 200 } }))[0].niva).toBe('orange');   // 15 är inte under 15
    expect(tankDelar(med({ tank: { diesel_pct: 25, adblue_pct: 71, rackvidd_km: 200 } }))[0]).toMatchObject({ niva: 'ok', ord: null });   // 25 är inte under 25
  });
  it('AdBlue under 20 % och räckvidd under 150 km är orange, med ord under', () => {
    expect(tankDelar(med({ tank: { diesel_pct: 60, adblue_pct: 15, rackvidd_km: 400 } }))[1]).toEqual({ text: 'AdBlue 15 %', niva: 'orange', ord: 'AdBlue låg – fyll på' });
    expect(tankDelar(med({ tank: { diesel_pct: 60, adblue_pct: 71, rackvidd_km: 120 } }))[2]).toEqual({ text: '120 km', niva: 'orange', ord: 'Räckvidd kort – tanka snart' });
    expect(niva(med({ tank: { diesel_pct: 60, adblue_pct: 20, rackvidd_km: 150 } }))).toEqual(['ok', 'ok', 'ok']);
  });
  it('flera varningar ger flera rader ord, i ordningen diesel, AdBlue, räckvidd', () => {
    expect(ord(med({ tank: { diesel_pct: 14, adblue_pct: 18, rackvidd_km: 95 } }))).toEqual(['Diesel låg – tanka nu', 'AdBlue låg – fyll på', 'Räckvidd kort – tanka snart']);
  });
  it('saknade värden: "–" i raden och "saknas i datan" under, dämpat — aldrig 0, aldrig orange eller rött', () => {
    const d = med({ tank: { diesel_pct: null, adblue_pct: 71, rackvidd_km: null } });
    expect(text(d)).toBe(`Diesel – · AdBlue 71 % · –`);
    expect(niva(d)).toEqual(['dampad', 'ok', 'dampad']);
    expect(ord(d)).toEqual(['Diesel saknas i datan', 'Räckvidd saknas i datan']);
    expect(ord(med({ tank: null }))).toEqual(['Diesel saknas i datan', 'AdBlue saknas i datan', 'Räckvidd saknas i datan']);
    expect(text(d)).not.toMatch(/\b0\b/);
  });
});

describe('bara när det gäller', () => {
  it('lampa: tar över rubriken, med orden "lyser" och "Kontrollera bilen"; ingen lampa → null', () => {
    expect(lampaRubrik(PARKERAD)).toBeNull();
    expect(lampaRubrik(med({ halsa: { har_lampor: true, lampor: [{ kod: 'EBS', namn: 'EBS (bromssystem)', state: 'RED' }], service_km: null, matare_km: 1, motortimmar: null } })))
      .toEqual({ rubrik: 'EBS (bromssystem) lyser', under: 'Kontrollera bilen' });
    expect(lampaRubrik(med({ halsa: { har_lampor: true, lampor: [{ kod: 'a', namn: 'ABS-fel', state: 'RED' }, { kod: 'b', namn: 'Bromsfel', state: 'RED' }], service_km: null, matare_km: null, motortimmar: null } }))?.rubrik)
      .toBe('2 varningslampor lyser');
  });
  it('lamporna saknas i datan (har_lampor false): ingen rad — vi påstår varken "inga varningar" eller en lampa', () => {
    expect(lampaRubrik(med({ halsa: { har_lampor: false, lampor: [], service_km: null, matare_km: null, motortimmar: null } }))).toBeNull();
  });
  it('service bara under 1 000 km kvar; saknat värde ger ingen rad', () => {
    const h = (service_km: number | null) => med({ halsa: { har_lampor: true, lampor: [], service_km, matare_km: 1, motortimmar: null } });
    expect(serviceRad(h(4200))).toBeNull();
    expect(serviceRad(h(1000))).toBeNull();
    expect(serviceRad(h(999))).toBe('Service om 999 km');
    expect(serviceRad(h(800))).toBe('Service om 800 km');
    expect(serviceRad(h(0))).toBe('Service är försenad');
    expect(serviceRad(h(-120))).toBe('Service är försenad');
    expect(serviceRad(h(null))).toBeNull();
    expect(serviceRad(med({ halsa: null }))).toBeNull();
  });
  it('"Senast sedd" bara när positionen är äldre än 15 min, eller åldern är okänd', () => {
    const p = (alder_min: number | null) => med({ position: { lat: 1, lng: 1, tidpunkt: null, alder_min } });
    expect(sistSedd(p(2))).toBeNull();
    expect(sistSedd(p(15))).toBeNull();
    expect(sistSedd(p(16))).toBe('Senast sedd för 16 min sedan');
    expect(sistSedd(p(130))).toBe('Senast sedd för 2 h 10 min sedan');
    expect(sistSedd(p(null))).toBe('Senast sedd okänd tid');
    expect(sistSedd(med({ position: null }))).toBeNull();
  });
});

describe('mätare och motortimmar (bor i kartarket): saknade värden står som "saknas i datan", aldrig 0', () => {
  it('värden och saknade värden', () => {
    const tusen = (n: number) => n.toLocaleString('sv-SE');   // tusentalsavgränsaren är ett hårt mellanslag
    expect(matareText(PARKERAD)).toEqual({ km: `${tusen(301128)} km`, motortimmar: 'saknas i datan' });
    expect(matareText(med({ halsa: { har_lampor: true, lampor: [], service_km: null, matare_km: 301128, motortimmar: 9120 } }))).toEqual({ km: `${tusen(301128)} km`, motortimmar: `${tusen(9120)} h` });
    expect(matareText(med({ halsa: null }))).toEqual({ km: 'saknas i datan', motortimmar: 'saknas i datan' });
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
