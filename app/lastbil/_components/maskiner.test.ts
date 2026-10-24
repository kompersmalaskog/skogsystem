import { describe, it, expect } from 'vitest';
import { MASKIN_NAMN, OBJEKT_NAMN, prodFlyttRader } from './maskiner.fixtur';
import {
  EXTERN_NYCKEL, FLYTT, MELLANRUM, byggFlyttar, dagarSedan, fmtDagar, grupperaMaskiner, saknarKmText, saknarTidText,
  sammanfatta, snittUnder, starPa, type FlyttRad,
} from './maskiner';

const bygg = (rader: FlyttRad[]) => byggFlyttar(rader, MASKIN_NAMN, OBJEKT_NAMN, new Map());
const prod = () => grupperaMaskiner(bygg(prodFlyttRader()));
const per = (namn: string) => prod().find(m => m.namn === namn)!;
const text = (s: string) => s.replace(/\s/g, ' ');

describe('Maskiner: prod-siffrorna (19 flyttar, 5 maskiner)', () => {
  it('en rad per maskin, flest flyttar först, sedan flest km: Giant 11/249, Elefant 4/143, Wisent 2/54, 810E 1/31, H8E 1/16', () => {
    expect(prod().map(m => [m.namn, m.antal, m.km])).toEqual([
      ['Giant', 11, 249], ['Elefant 26', 4, 143], ['Wisent', 2, 54], ['810E', 1, 31], ['H8E -26', 1, 16],
    ]);
    expect(prod().reduce((s, m) => s + m.antal, 0)).toBe(19);
  });

  it('Giant: inget saknar km eller tid; tid och km är snitt av 11 flyttar', () => {
    const s = sammanfatta(per('Giant'));
    expect(s.tid).toMatchObject({ antal: 11, saknar: 0 });
    expect(s.km).toMatchObject({ antal: 11, saknar: 0 });
    expect(s.km.snitt).toBeCloseTo(249 / 11, 6);
    expect(snittUnder(s.tid, FLYTT, saknarTidText)).toBe('snitt av 11 flyttar');
  });

  it('Giant: 10 mellanrum, 5 räknebara med snitt 2,8 dagar — raden säger bara "snitt av 5 mellanrum"', () => {
    const t = sammanfatta(per('Giant')).trakt!;
    expect(t.antal).toBe(5);
    expect(t.saknar).toBe(5);
    expect(fmtDagar(t.snitt!)).toBe('2,8 dagar');
    expect(snittUnder(t, MELLANRUM)).toBe('snitt av 5 mellanrum');
  });

  it('Elefant 26: bara 1 räknebart mellanrum (9,8 dagar) → inget snitt, och de som inte räknas nämns inte; tid och km räknas på alla 4', () => {
    const s = sammanfatta(per('Elefant 26'));
    expect(s.trakt).toMatchObject({ antal: 1, saknar: 2, snitt: null });
    expect(snittUnder(s.trakt!, MELLANRUM)).toBe('bara 1 mellanrum – för få för snitt');
    expect(snittUnder(s.tid, FLYTT, saknarTidText)).toBe('snitt av 4 flyttar');
    expect(s.km.snitt).toBeCloseTo(143 / 4, 6);
  });

  it('Wisent (2 flyttar): inget snitt, och det står varför — antalet står alltid med', () => {
    const s = sammanfatta(per('Wisent'));
    expect(s.tid.snitt).toBeNull();
    expect(snittUnder(s.tid, FLYTT, saknarTidText)).toBe('bara 2 flyttar – för få för snitt');
    expect(snittUnder(s.km, FLYTT, saknarKmText)).toBe('bara 2 flyttar – för få för snitt');
  });

  it('en maskin med EN flytt har inget mellanrum alls', () => {
    const t = sammanfatta(per('H8E -26')).trakt!;
    expect(t).toMatchObject({ antal: 0, saknar: 0, snitt: null });
    expect(snittUnder(t, MELLANRUM)).toBe('inget mellanrum att räkna på');
    // 2 flyttar på olika plats: ett mellanrum som inte går att räkna — det står inget om det, bara att inget finns att räkna på
    const wisent = sammanfatta(per('Wisent')).trakt!;
    expect(wisent).toMatchObject({ antal: 0, saknar: 1 });
    expect(snittUnder(wisent, MELLANRUM)).toBe('inget mellanrum att räkna på');
    expect(snittUnder(sammanfatta(per('H8E -26')).tid, FLYTT, saknarTidText)).toBe('bara 1 flytt – för få för snitt');
  });

  it('snitt visas från exakt 3 flyttar (MIN_FLYTTAR_SNITT), inte från 2', () => {
    const tre = grupperaMaskiner(bygg(prodFlyttRader().filter(r => r.maskin_id === 'PONS20SDJAA270231').slice(0, 3)))[0];
    expect(sammanfatta(tre).tid.snitt).not.toBeNull();
    expect(sammanfatta(tre).tid.antal).toBe(3);
    const tva = grupperaMaskiner(bygg(prodFlyttRader().filter(r => r.maskin_id === 'PONS20SDJAA270231').slice(0, 2)))[0];
    expect(sammanfatta(tva).tid.snitt).toBeNull();
  });
});

describe('Maskiner: saknade värden räknas inte i snittet, och det sägs', () => {
  const giant = () => prodFlyttRader().filter(r => r.maskin_id === 'PONS20SDJAA270231');
  it('en flytt utan km räknas inte i snitt-km eller i radens km-summa, men finns kvar i listan', () => {
    const rader = giant().map((r, i) => (i === 0 ? { ...r, flytt_km: null } : r));
    const m = grupperaMaskiner(bygg(rader))[0];
    expect(m.antal).toBe(11);
    expect(m.saknarKm).toBe(1);
    expect(m.km).toBe(249 - 20);
    const s = sammanfatta(m);
    expect(s.km).toMatchObject({ antal: 10, saknar: 1 });
    expect(s.km.snitt).toBeCloseTo(229 / 10, 6);
    expect(snittUnder(s.km, FLYTT, saknarKmText)).toBe('snitt av 10 flyttar · 1 flytt saknar km');
    expect(m.flyttar.some(f => f.km == null)).toBe(true);
  });
  it('en flytt utan tid räknas inte i tidssnittet: "2 flyttar saknar tid"', () => {
    const rader = giant().map((r, i) => (i < 2 ? { ...r, tid_flytt_min: null } : r));
    const s = sammanfatta(grupperaMaskiner(bygg(rader))[0]);
    expect(s.tid).toMatchObject({ antal: 9, saknar: 2 });
    expect(snittUnder(s.tid, FLYTT, saknarTidText)).toBe('snitt av 9 flyttar · 2 flyttar saknar tid');
  });
  it('alla utan tid: inget snitt, och det står bara vad som saknas (inte också "ingen flytt att räkna på")', () => {
    const s = sammanfatta(grupperaMaskiner(bygg(giant().map(r => ({ ...r, tid_flytt_min: null }))))[0]);
    expect(snittUnder(s.tid, FLYTT, saknarTidText)).toBe('11 flyttar saknar tid');
  });
  it('tid och km är aldrig 0 när de saknas: null, inte en nolla i snittet', () => {
    const s = sammanfatta(grupperaMaskiner(bygg(giant().map(r => ({ ...r, flytt_km: null }))))[0]);
    expect(s.km.snitt).toBeNull();
  });
});

describe('Maskiner: "saknar" står bara där det påverkar raden', () => {
  it('km- och tidsraden får "N flyttar saknar …", raden På en trakt får aldrig något om saknade mellanrum', () => {
    const rader = prodFlyttRader().filter(r => r.maskin_id === 'PONS20SDJAA270231').map((r, i) => (i === 0 ? { ...r, flytt_km: null, tid_flytt_min: null } : r));
    const s = sammanfatta(grupperaMaskiner(bygg(rader))[0]);
    expect(snittUnder(s.km, FLYTT, saknarKmText)).toBe('snitt av 10 flyttar · 1 flytt saknar km');
    expect(snittUnder(s.tid, FLYTT, saknarTidText)).toBe('snitt av 10 flyttar · 1 flytt saknar tid');
    expect(snittUnder(s.trakt!, MELLANRUM)).not.toMatch(/saknar|kan inte/);
    expect(snittUnder({ snitt: null, antal: 2, saknar: 3 }, MELLANRUM)).toBe('bara 2 mellanrum – för få för snitt');
  });
});

describe('Maskiner: dagar på en trakt', () => {
  it('ett mellanrum räknas bara när förra Till = nästa Från', () => {
    const [a, b] = bygg([
      { id: '1', maskin_id: 'A130743', extern_maskin: null, starttid: null, hamtad_tid: '2026-09-01T06:00:00Z', sluttid: '2026-09-01T08:00:00Z', flytt_km: 30, tid_flytt_min: 120, fran_objekt_id: 'o-vallust', fran_plats_id: null, till_objekt_id: 'o-ostra', till_plats_id: null },
      { id: '2', maskin_id: 'A130743', extern_maskin: null, starttid: null, hamtad_tid: '2026-09-04T08:00:00Z', sluttid: '2026-09-04T10:00:00Z', flytt_km: 30, tid_flytt_min: 120, fran_objekt_id: 'o-ostra', fran_plats_id: null, till_objekt_id: 'o-tjuvon', till_plats_id: null },
    ]);
    const m = grupperaMaskiner([a, b])[0];
    expect(sammanfatta(m).trakt).toMatchObject({ antal: 1, saknar: 0 });
    const annan = grupperaMaskiner([a, { ...b, franId: 'o:o-akelius' }])[0];
    expect(sammanfatta(annan).trakt).toMatchObject({ antal: 0, saknar: 1 });
    const okand = grupperaMaskiner([a, { ...b, franId: null }])[0];
    expect(sammanfatta(okand).trakt).toMatchObject({ antal: 0, saknar: 1 });
  });
  it('samma trakt som objekt respektive flyttplats räknas som samma ställe bara när nyckeln är lika', () => {
    const f = bygg([{ id: '1', maskin_id: 'A130743', extern_maskin: null, starttid: null, hamtad_tid: '2026-09-01T06:00:00Z', sluttid: '2026-09-01T08:00:00Z', flytt_km: 1, tid_flytt_min: 1, fran_objekt_id: null, fran_plats_id: 'p-verkstad', till_objekt_id: null, till_plats_id: 'p-gard' }]);
    expect([f[0].franId, f[0].tillId]).toEqual(['p:p-verkstad', 'p:p-gard']);
  });
  it('ett negativt mellanrum (klockan går fel eller överlapp) räknas inte', () => {
    const rader: FlyttRad[] = [
      { id: '1', maskin_id: 'A130743', extern_maskin: null, starttid: null, hamtad_tid: '2026-09-01T06:00:00Z', sluttid: '2026-09-05T08:00:00Z', flytt_km: 1, tid_flytt_min: 1, fran_objekt_id: 'o-vallust', fran_plats_id: null, till_objekt_id: 'o-ostra', till_plats_id: null },
      { id: '2', maskin_id: 'A130743', extern_maskin: null, starttid: null, hamtad_tid: '2026-09-02T08:00:00Z', sluttid: '2026-09-06T10:00:00Z', flytt_km: 1, tid_flytt_min: 1, fran_objekt_id: 'o-ostra', fran_plats_id: null, till_objekt_id: 'o-tjuvon', till_plats_id: null },
    ];
    expect(sammanfatta(grupperaMaskiner(bygg(rader))[0]).trakt).toMatchObject({ antal: 0, saknar: 1 });
  });
});

describe('Maskiner: Står på X sedan N dagar', () => {
  const nu = new Date('2026-10-14T10:00:00Z');
  it('ur senaste flyttens Till och lossning, i hela svenska kalenderdagar', () => {
    const giant = per('Giant');
    const sista = giant.flyttar[0];
    const d = dagarSedan(sista.lossad, nu)!;
    expect(starPa(giant, nu)).toBe(`Står på ${sista.tillNamn} sedan ${d} dagar`);
  });
  it('0 dagar är "idag", 1 är "1 dag"', () => {
    const m = per('Wisent');
    const sista = m.flyttar[0];
    expect(starPa(m, new Date(sista.lossad))).toBe(`Står på ${sista.tillNamn} sedan idag`);
    expect(starPa(m, new Date(Date.parse(sista.lossad) + 26 * 3600_000))).toMatch(/sedan 1 dag$/);
  });
  it('dygnsgränsen följer svensk tid, inte UTC: 23:30 svensk tid och 00:30 nästa dag är olika kalenderdagar', () => {
    expect(dagarSedan('2026-10-13T21:30:00Z', new Date('2026-10-13T22:30:00Z'))).toBe(1);   // 23:30 → 00:30 (CEST)
    expect(dagarSedan('2026-10-13T20:30:00Z', new Date('2026-10-13T21:30:00Z'))).toBe(0);   // 22:30 → 23:30
  });
  it('okänd Till-plats ger ingen påhittad plats: ingen rad', () => {
    const rader = prodFlyttRader().filter(r => r.maskin_id === 'A030353').map(r => ({ ...r, till_objekt_id: null }));
    expect(starPa(grupperaMaskiner(bygg(rader))[0], nu)).toBeNull();
  });
});

describe('Maskiner: andras maskiner är en egen sista rad', () => {
  const rader = (): FlyttRad[] => [
    ...prodFlyttRader(),
    { id: 'x1', maskin_id: null, extern_maskin: 'Vidas skördare', starttid: null, hamtad_tid: '2026-09-10T06:00:00Z', sluttid: '2026-09-10T09:00:00Z', flytt_km: 40, tid_flytt_min: 180, fran_objekt_id: 'o-vallust', fran_plats_id: null, till_objekt_id: 'o-ostra', till_plats_id: null },
    { id: 'x2', maskin_id: null, extern_maskin: 'Annan förares', starttid: null, hamtad_tid: '2026-09-11T06:00:00Z', sluttid: '2026-09-11T08:00:00Z', flytt_km: 20, tid_flytt_min: 120, fran_objekt_id: 'o-ostra', fran_plats_id: null, till_objekt_id: 'o-tjuvon', till_plats_id: null },
  ];
  it('alla andras maskiner samlas i EN rad som alltid står sist, även om den har fler flyttar än någon egen', () => {
    const m = grupperaMaskiner(bygg([...rader(), ...rader().filter(r => r.id.startsWith('x')).map(r => ({ ...r, id: r.id + 'b' })), ...rader().filter(r => r.id.startsWith('x')).map(r => ({ ...r, id: r.id + 'c' }))]));
    const sista = m[m.length - 1];
    expect(sista.nyckel).toBe(EXTERN_NYCKEL);
    expect(sista.namn).toBe('Andras maskiner');
    expect(sista.antal).toBe(6);
    expect(m.slice(0, -1).every(x => !x.extern)).toBe(true);
  });
  it('de har ingen "På en trakt" och ingen "Står på" (de följs inte)', () => {
    const e = grupperaMaskiner(bygg(rader())).find(m => m.extern)!;
    expect(sammanfatta(e).trakt).toBeNull();
    expect(starPa(e, new Date('2026-10-14T10:00:00Z'))).toBeNull();
    expect(e.flyttar.map(f => f.maskinNamn).sort()).toEqual(['Annan förares', 'Vidas skördare']);
  });
  it('utan andras maskiner finns ingen sådan rad', () => {
    expect(prod().some(m => m.extern)).toBe(false);
  });
});

describe('Maskiner: ordning och dygnsräkning', () => {
  const rad = (id: string, maskin: string, km: number): FlyttRad => ({ id, maskin_id: maskin, extern_maskin: null, starttid: null, hamtad_tid: '2026-09-01T06:00:00Z', sluttid: '2026-09-01T08:00:00Z', flytt_km: km, tid_flytt_min: 60, fran_objekt_id: 'o-vallust', fran_plats_id: null, till_objekt_id: 'o-ostra', till_plats_id: null });
  it('flest flyttar först — också när en maskin med färre flyttar har fler km', () => {
    const m = grupperaMaskiner(bygg([rad('1', 'A130743', 10), rad('2', 'A130743', 10), rad('3', 'A030353', 500)]));
    expect(m.map(x => [x.namn, x.antal, x.km])).toEqual([['Elefant 26', 2, 20], ['Wisent', 1, 500]]);
  });
  it('lika många flyttar: flest km först', () => {
    const m = grupperaMaskiner(bygg([rad('1', 'A130743', 10), rad('2', 'A030353', 500)]));
    expect(m.map(x => x.namn)).toEqual(['Wisent', 'Elefant 26']);
  });
  it('"Står på … sedan" räknas från LOSSNINGEN, inte från lastningen: lastad för 4 dagar sedan, lossad för 2', () => {
    const r: FlyttRad = { ...rad('1', 'A130743', 30), hamtad_tid: '2026-10-10T06:00:00Z', sluttid: '2026-10-12T06:00:00Z' };
    expect(starPa(grupperaMaskiner(bygg([r]))[0], new Date('2026-10-14T06:00:00Z'))).toBe('Står på Ostra sedan 2 dagar');
  });
  it('en maskin där ALLA flyttar saknar km har summa 0 och saknarKm = antal (raden visar "–", inte "0 km")', () => {
    const m = grupperaMaskiner(bygg([{ ...rad('1', 'A130743', 0), flytt_km: null }, { ...rad('2', 'A130743', 0), flytt_km: null }]))[0];
    expect(m).toMatchObject({ antal: 2, km: 0, saknarKm: 2 });
  });
});

describe('Sammanställningen per maskin: flyttar per månad och tid på lastbilen', () => {
  it('månaderna är samma för alla maskiner, från första flytten till innevarande månad, och staplarna summerar till antalet', async () => {
    const { manaderAttVisa, perManad } = await import('./maskiner');
    const m = prod();
    const man = manaderAttVisa(m, 2026, new Date('2026-10-24T10:00:00Z'));
    expect(man[man.length - 1]).toBe(10);
    expect(man).toEqual(Array.from({ length: man.length }, (_, i) => man[0] + i));   // inga hål
    for (const x of m) expect(perManad(x, man).reduce((s, p) => s + p.antal, 0)).toBe(x.antal);
  });

  it('ett avslutat år slutar vid sista flytten, inte vid dagens månad; inga flyttar ger inga månader', async () => {
    const { manaderAttVisa } = await import('./maskiner');
    const man = manaderAttVisa(prod(), 2026, new Date('2027-03-01T10:00:00Z'));
    expect(man[man.length - 1]).toBeLessThanOrEqual(10);
    expect(manaderAttVisa([], 2026, new Date())).toEqual([]);
  });

  it('tiden är summan av lastad → lossad; en flytt utan tid räknas inte och sägs', async () => {
    const { tidPaLastbilen } = await import('./maskiner');
    const g = per('Giant');
    const hel = g.flyttar.reduce((s, f) => s + Math.round(f.min ?? 0), 0);
    expect(tidPaLastbilen(g)).toEqual({ min: hel, saknar: 0 });
    const utan = { ...g, flyttar: g.flyttar.map((f, i) => (i === 0 ? { ...f, min: null } : f)) };
    expect(tidPaLastbilen(utan)).toEqual({ min: hel - Math.round(g.flyttar[0].min ?? 0), saknar: 1 });
  });
});
