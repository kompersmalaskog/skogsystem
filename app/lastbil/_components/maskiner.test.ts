import { describe, it, expect } from 'vitest';
import { MASKIN_NAMN, OBJEKT_NAMN, prodFlyttRader } from './maskiner.fixtur';
import { EXTERN_NYCKEL, byggFlyttar, dagarSedan, grupperaMaskiner, saknarKmText, saknarTidText, type FlyttRad } from './maskiner';

const bygg = (rader: FlyttRad[]) => byggFlyttar(rader, MASKIN_NAMN, OBJEKT_NAMN, new Map());
const prod = () => grupperaMaskiner(bygg(prodFlyttRader()));
const per = (namn: string) => prod().find(m => m.namn === namn)!;

describe('Maskiner: prod-siffrorna (19 flyttar, 5 maskiner)', () => {
  it('en rad per maskin, flest flyttar först, sedan flest km: Giant 11/249, Elefant 4/143, Wisent 2/54, 810E 1/31, H8E 1/16', () => {
    expect(prod().map(m => [m.namn, m.antal, m.km])).toEqual([
      ['Giant', 11, 249], ['Elefant 26', 4, 143], ['Wisent', 2, 54], ['810E', 1, 31], ['H8E -26', 1, 16],
    ]);
    expect(prod().reduce((s, m) => s + m.antal, 0)).toBe(19);
  });

  it('en flytt utan km räknas inte i km-summan men finns kvar i listan, och det sägs', () => {
    const rader = prodFlyttRader().filter(r => r.maskin_id === 'PONS20SDJAA270231').map((r, i) => (i === 0 ? { ...r, flytt_km: null } : r));
    const m = grupperaMaskiner(bygg(rader))[0];
    expect(m).toMatchObject({ antal: 11, saknarKm: 1, km: 249 - 20 });
    expect(m.flyttar.some(f => f.km == null)).toBe(true);
    expect([saknarKmText(1), saknarTidText(2)]).toEqual(['1 flytt saknar km', '2 flyttar saknar tid']);
  });

  it('hela svenska kalenderdagar: 23:30 svensk tid och 00:30 nästa dag är olika dagar', () => {
    expect(dagarSedan('2026-10-12T21:30:00Z', new Date('2026-10-12T22:30:00Z'))).toBe(1);
    expect(dagarSedan('2026-10-12T06:00:00Z', new Date('2026-10-12T20:00:00Z'))).toBe(0);
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
  it('de visar maskinens eget namn i listan', () => {
    const e = grupperaMaskiner(bygg(rader())).find(m => m.extern)!;
    expect(e.flyttar.map(f => f.maskinNamn).sort()).toEqual(['Annan förares', 'Vidas skördare']);
  });
  it('utan andras maskiner finns ingen sådan rad', () => {
    expect(prod().some(m => m.extern)).toBe(false);
  });
});

describe('Maskiner: ordning', () => {
  const rad = (id: string, maskin: string, km: number): FlyttRad => ({ id, maskin_id: maskin, extern_maskin: null, starttid: null, hamtad_tid: '2026-09-01T06:00:00Z', sluttid: '2026-09-01T08:00:00Z', flytt_km: km, tid_flytt_min: 60, fran_objekt_id: 'o-vallust', fran_plats_id: null, till_objekt_id: 'o-ostra', till_plats_id: null });
  it('flest flyttar först — också när en maskin med färre flyttar har fler km', () => {
    const m = grupperaMaskiner(bygg([rad('1', 'A130743', 10), rad('2', 'A130743', 10), rad('3', 'A030353', 500)]));
    expect(m.map(x => [x.namn, x.antal, x.km])).toEqual([['Elefant 26', 2, 20], ['Wisent', 1, 500]]);
  });
  it('lika många flyttar: flest km först', () => {
    const m = grupperaMaskiner(bygg([rad('1', 'A130743', 10), rad('2', 'A030353', 500)]));
    expect(m.map(x => x.namn)).toEqual(['Wisent', 'Elefant 26']);
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
