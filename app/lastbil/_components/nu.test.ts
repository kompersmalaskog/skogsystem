import { describe, it, expect } from 'vitest';
import { fmtAlder, fmtDatum, fmtKlocka, fmtSedan, fmtDatumLang, kontaktRadArk, lageSvar, lampaRubrik, matareText, senasteKorning, serviceRad, sistSedd, tankDelar, tankOrd, tankSvar, type LastbilData, type Runda } from './nu';

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

describe('läget i ord: svaret på "Var är bilen?" — rubrik + EN rad under', () => {
  const svar = (d: LastbilData) => lageSvar(d, NU);
  it('parkerad: "Står vid <plats>" och "Sedan <tid>" i ord — klockslag idag, igår, veckodag inom en vecka, annars datum', () => {
    expect(svar(PARKERAD)).toEqual({ rubrik: 'Står vid LBC', under: 'Sedan 09:06' });
    expect(svar(med({ parkerad: { plats: 'Kompersmåla', sedan: '2026-10-13T13:02:00Z' } }))).toEqual({ rubrik: 'Står vid Kompersmåla', under: 'Sedan 15:02' });
    expect(svar(med({ parkerad: { plats: 'LBC', sedan: '2026-10-12T07:06:59Z' } })).under).toBe('Sedan igår');
    expect(svar(med({ parkerad: { plats: 'LBC', sedan: '2026-10-09T07:06:59Z' } })).under).toBe('Sedan i fredags');
    expect(svar(med({ parkerad: { plats: 'LBC', sedan: null } }))).toEqual({ rubrik: 'Står vid LBC', under: '' });
  });

  it('kör nu: maskin på flaket, rundans km och avfärd under', () => {
    const o = { id: 'x', starttid: '2026-10-13T04:41:00Z', live_km: 34, maskin: { namn: 'Giant', lage: 'flaket' as const }, pa_vag_hem: false, km_kvar: null };
    expect(svar(med({ parkerad: null, oppen_runda: o }))).toEqual({ rubrik: 'Kör nu', under: 'Giant på flaket · 34 km · avfärd 06:41' });
    expect(svar(med({ parkerad: null, oppen_runda: { ...o, maskin: { namn: 'Giant', lage: 'lossad' } } })).under).toBe('Giant lossad · 34 km · avfärd 06:41');
  });

  it('på väg hem: km kvar; utan km kvar rundans km', () => {
    const o = { id: 'x', starttid: '2026-10-13T04:41:00Z', live_km: 80, maskin: { namn: 'Giant', lage: 'lossad' as const }, pa_vag_hem: true, km_kvar: 12 };
    expect(svar(med({ parkerad: null, oppen_runda: o }))).toEqual({ rubrik: 'På väg hem', under: 'ungefär 12 km kvar · avfärd 06:41' });
    expect(svar(med({ parkerad: null, oppen_runda: { ...o, km_kvar: null } })).under).toBe('80 km · avfärd 06:41');
  });

  it('övrig körning utan maskin; saknade km och avfärd utelämnas — inget "–" och ingen nolla', () => {
    expect(svar(med({ parkerad: null, oppen_runda: { id: 'x', starttid: null, live_km: null, maskin: null, pa_vag_hem: false, km_kvar: null } }))).toEqual({ rubrik: 'Kör nu', under: 'Övrig körning' });
  });

  it('varken parkerad eller kör: säger att ingen runda pågår (gissar inte var den står)', () => {
    expect(svar(med({ parkerad: null, namn: 'R450' }))).toEqual({ rubrik: 'Ingen runda pågår', under: '' });
  });
});

describe('tanken i EN mening', () => {
  it('"Tanken räcker 270 km"; kort räckvidd säger det i orden och blir orange; saknad räckvidd sägs, aldrig 0', () => {
    expect(tankSvar(PARKERAD)).toEqual({ text: 'Tanken räcker 270 km', niva: 'ok' });
    expect(tankSvar(med({ tank: { diesel_pct: 20, adblue_pct: 71, rackvidd_km: 95 } }))).toEqual({ text: 'Tanken räcker bara 95 km – tanka snart', niva: 'orange' });
    expect(tankSvar(med({ tank: { diesel_pct: 20, adblue_pct: 71, rackvidd_km: 150 } })).niva).toBe('ok');   // 150 är inte under 150
    expect(tankSvar(med({ tank: null }))).toEqual({ text: 'Räckvidd saknas i datan', niva: 'dampad' });
  });
  it('diesel och AdBlue står bara när de är låga eller saknas — räckvidden har redan sin mening', () => {
    expect(tankOrd(PARKERAD)).toEqual([]);
    expect(tankOrd(med({ tank: { diesel_pct: 14, adblue_pct: 18, rackvidd_km: 95 } })).map(d => d.ord)).toEqual(['Diesel låg – tanka nu', 'AdBlue låg – fyll på']);
    expect(tankOrd(med({ tank: { diesel_pct: null, adblue_pct: 71, rackvidd_km: null } })).map(d => d.ord)).toEqual(['Diesel saknas i datan']);
  });
});

describe('tankraden: EN kort rad, orden på egna rader under — bara när de gäller', () => {
  const text = (d: LastbilData) => tankDelar(d).map(x => x.text).join(' · ');
  const niva = (d: LastbilData) => tankDelar(d).map(x => x.niva);
  const ord = (d: LastbilData) => tankDelar(d).map(x => x.ord).filter(Boolean);
  it('62 % diesel, 71 % AdBlue, 270 km: allt ok, inga ord under', () => {
    expect(text(PARKERAD)).toBe(['Diesel 62 %', 'AdBlue 71 %', `${(270).toLocaleString('sv-SE')} km kvar`].join(' · '));
    expect(niva(PARKERAD)).toEqual(['ok', 'ok', 'ok']);
    expect(ord(PARKERAD)).toEqual([]);
  });
  it('raden är kort även med fulla värden (så den ryms på 390 px): "Diesel 100 % · AdBlue 100 % · 1 540 km"', () => {
    const full = med({ tank: { diesel_pct: 100, adblue_pct: 100, rackvidd_km: 1540 } });
    expect(text(full)).toBe(`Diesel 100 % · AdBlue 100 % · ${(1540).toLocaleString('sv-SE')} km kvar`);
    expect(text(full).length).toBeLessThanOrEqual(45);
  });
  it('diesel under 15 % är röd "tanka nu", under 25 % orange "tanka snart" — orden står i `ord`, siffran i raden; gränserna som förut', () => {
    expect(tankDelar(med({ tank: { diesel_pct: 14, adblue_pct: 71, rackvidd_km: 95 } }))[0]).toEqual({ text: 'Diesel 14 %', niva: 'rod', ord: 'Diesel låg – tanka nu' });
    expect(tankDelar(med({ tank: { diesel_pct: 20, adblue_pct: 71, rackvidd_km: 200 } }))[0]).toEqual({ text: 'Diesel 20 %', niva: 'orange', ord: 'Diesel låg – tanka snart' });
    expect(tankDelar(med({ tank: { diesel_pct: 15, adblue_pct: 71, rackvidd_km: 200 } }))[0].niva).toBe('orange');   // 15 är inte under 15
    expect(tankDelar(med({ tank: { diesel_pct: 25, adblue_pct: 71, rackvidd_km: 200 } }))[0]).toMatchObject({ niva: 'ok', ord: null });   // 25 är inte under 25
  });
  it('AdBlue under 20 % och räckvidd under 150 km är orange, med ord under', () => {
    expect(tankDelar(med({ tank: { diesel_pct: 60, adblue_pct: 15, rackvidd_km: 400 } }))[1]).toEqual({ text: 'AdBlue 15 %', niva: 'orange', ord: 'AdBlue låg – fyll på' });
    expect(tankDelar(med({ tank: { diesel_pct: 60, adblue_pct: 71, rackvidd_km: 120 } }))[2]).toEqual({ text: '120 km kvar', niva: 'orange', ord: 'Räckvidd kort – tanka snart' });
    expect(niva(med({ tank: { diesel_pct: 60, adblue_pct: 20, rackvidd_km: 150 } }))).toEqual(['ok', 'ok', 'ok']);
  });
  it('flera varningar ger flera rader ord, i ordningen diesel, AdBlue, räckvidd', () => {
    expect(ord(med({ tank: { diesel_pct: 14, adblue_pct: 18, rackvidd_km: 95 } }))).toEqual(['Diesel låg – tanka nu', 'AdBlue låg – fyll på', 'Räckvidd kort – tanka snart']);
  });
  it('saknade värden: "–" i raden och "saknas i datan" under, dämpat — aldrig 0, aldrig orange eller rött', () => {
    const d = med({ tank: { diesel_pct: null, adblue_pct: 71, rackvidd_km: null } });
    expect(text(d)).toBe(`Diesel – · AdBlue 71 % · Räckvidd –`);
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
  it('"Ingen kontakt sedan …" bara när senaste kontakt är äldre än 1 h — datum + klockslag, aldrig "99 h 49 min"', () => {
    const nu = new Date('2026-10-13T09:00:00Z');   // 11:00 svensk tid
    const p = (alder_min: number | null, tidpunkt: string | null = null) => med({ position: { lat: 1, lng: 1, tidpunkt, alder_min } });
    expect(sistSedd(p(2), nu)).toBeNull();
    expect(sistSedd(p(60), nu)).toBeNull();
    expect(sistSedd(p(54, '2026-10-13T08:06:00Z'), nu)).toBeNull();
    // idag: bara klockslaget
    expect(sistSedd(p(130, '2026-10-13T06:50:00Z'), nu)).toBe('Ingen kontakt sedan 08:50');
    // annan dag (även under 24 h): datum + klockslag
    expect(sistSedd(p(14 * 60, '2026-10-12T19:00:00Z'), nu)).toBe('Ingen kontakt sedan 12 okt 21:00');
    // över 24 h (99 h 49 min): datum, aldrig timmar
    const gammal = sistSedd(p(99 * 60 + 49, '2026-10-09T05:11:00Z'), nu)!;
    expect(gammal).toBe('Ingen kontakt sedan 9 okt 07:11');
    expect(gammal).not.toMatch(/\d+ h/);
    // tidpunkten saknas men åldern finns: tiden räknas ur åldern
    expect(sistSedd(p(130), nu)).toBe('Ingen kontakt sedan 08:50');
    // allt okänt: vi kan inte säga att den är färsk — och inte sedan när
    expect(sistSedd(p(null), nu)).toBe('Tid för senaste kontakt saknas i datan');
    expect(sistSedd(med({ position: null }), nu)).toBeNull();
  });
  it('kartarkets rad: färsk position säger "Senast sedd …", gammal samma text som kortet', () => {
    const nu = new Date('2026-10-13T09:00:00Z');
    const p = (alder_min: number | null, tidpunkt: string | null) => med({ position: { lat: 1, lng: 1, tidpunkt, alder_min } });
    expect(kontaktRadArk(p(5, '2026-10-13T08:55:00Z'), nu)).toBe('Senast sedd för 5 min sedan');
    expect(kontaktRadArk(p(99 * 60 + 49, '2026-10-09T05:11:00Z'), nu)).toBe('Ingen kontakt sedan 9 okt 07:11');
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
    expect(fmtDatumLang('2026-10-22T09:30:00Z')).toBe('torsdag 22 okt');
    expect(fmtDatumLang('2026-10-12T22:30:00Z')).toBe('tisdag 13 okt');           // svensk dag, inte UTC
  });
  it('sedan-texter', () => {
    const nu = new Date('2026-10-13T09:00:00Z');
    expect(fmtSedan('2026-10-13T07:06:59Z', nu)).toBe('sedan 09:06');
    expect(fmtSedan('2026-10-12T07:06:59Z', nu)).toBe('sedan igår');            // måndag, nu är tisdag
    expect(fmtSedan('2026-10-12T21:59:00Z', nu)).toBe('sedan igår');             // 23:59 svensk tid den 12:e
    expect(fmtSedan('2026-10-09T07:06:59Z', nu)).toBe('sedan i fredags');
    expect(fmtSedan('2026-10-07T07:06:59Z', nu)).toBe('sedan i onsdags');       // 6 dagar: fortfarande veckodagen
    expect(fmtSedan('2026-10-06T07:06:59Z', nu)).toBe('sedan 6 okt');           // 7 dagar: datumet (i tisdags vore tvetydigt)
    expect(fmtSedan('2026-10-12T22:30:00Z', nu)).toBe('sedan 00:30');           // 00:30 svensk tid den 13:e = idag
    expect(fmtSedan('2026-09-28T06:53:39Z', nu)).toBe('sedan 28 sep');
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
