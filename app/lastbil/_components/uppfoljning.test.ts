import { describe, it, expect } from 'vitest';
import { byggRundor, summera, type Ben, type RundaRad } from './rundor';
import { forbrukningRader, korstrackaRader, perManad } from './uppfoljning';

// Året i uppföljningen ska vara SUMMAN av månaderna som listan visar, och månaderna ska stämma med prod. Fixturen speglar
// prod-månaderna (flyttdag, giltiga rundor, 2026-10-20): juli 3 rundor 190 km utan diesel · augusti 8 flytt/587 km/249 l +
// 14 övrig/816 km/357 l · september 5 flytt/528 km/231 l + 8 övrig/834 km/385 l (en utan mätare → ruttens km) · oktober
// 2 flytt/296 km/116 l + 3 övrig/522 km/233 l. Facit: 43 rundor, 3 773 km, 1 571 l — inte de 1 117 km / 11 rundor som den
// MINDRE fixturen i lastbil.render.test.tsx ger (den har bara en del av augusti och ingen september).

/** Delar `total` på `n` heltal så att summan blir exakt `total`. */
const fordela = (total: number, n: number): number[] =>
  Array.from({ length: n }, (_, i) => Math.floor(total / n) + (i < total % n ? 1 : 0));

let nr = 0;
function rader(man: number, flytt: boolean, antal: number, km: number, liter: number | null, utanMatare = 0): { rader: RundaRad[]; ben: Map<string, Ben[]> } {
  const kms = fordela(km, antal), lit = liter == null ? null : fordela(liter, antal);
  const ben = new Map<string, Ben[]>();
  const ut: RundaRad[] = kms.map((k, i) => {
    const id = `r${++nr}`;
    const dag = String(1 + (i % 27)).padStart(2, '0');
    const saknarMatare = i < utanMatare;
    if (flytt) ben.set(id, [{ id: `b${id}`, maskin: 'Giant', fran: 'A', till: 'B', km: 30, min: 60, tomKm: null, fakturerbar: true, typ: 'produktion', kund: null }]);
    return {
      id, forare: null, starttid: `2026-${String(man).padStart(2, '0')}-${dag}T08:00:00Z`, sluttid: `2026-${String(man).padStart(2, '0')}-${dag}T10:00:00Z`,
      status: flytt ? 'avslutad' : 'ovrig_korning', auto_avslutad_av: null, tillkorning_km: null, hem_km: null, hemresa_matt: true,
      total_km: saknarMatare ? k : null, matare_km: saknarMatare ? null : k, bransle_l: lit ? lit[i] : null,
    };
  });
  return { rader: ut, ben };
}

function prodAret() {
  const delar = [
    rader(7, false, 3, 190, null),
    rader(8, true, 8, 587, 249), rader(8, false, 14, 816, 357),
    rader(9, true, 5, 528, 231), rader(9, false, 8, 834, 385, 1),
    rader(10, true, 2, 296, 116), rader(10, false, 3, 522, 233),
  ];
  const ben = new Map<string, Ben[]>();
  delar.forEach(d => d.ben.forEach((v, k) => ben.set(k, v)));
  return byggRundor(delar.flatMap(d => d.rader), ben);
}
const NU = new Date('2026-10-20T10:00:00Z');

describe('uppföljningens år mot prod-månaderna', () => {
  const rundor = prodAret();
  const aret = summera(rundor);
  const man = perManad(2026, rundor, NU);

  it('året = 43 rundor, 3 773 km, 1 571 l', () => {
    expect(aret).toMatchObject({ antal: 43, km: 3773, liter: 1571 });
  });
  it('månaderna (nyast först): okt 818 · sep 1 362 · aug 1 403 · jul 190 km', () => {
    expect(man.map(x => [x.m.man, x.s.km, x.s.antal])).toEqual([[10, 818, 5], [9, 1362, 13], [8, 1403, 22], [7, 190, 3]]);
  });
  it('året är summan av månaderna som listan visar: km, rundor och liter', () => {
    expect(man.reduce((s, x) => s + x.s.km, 0)).toBe(aret.km);
    expect(man.reduce((s, x) => s + x.s.antal, 0)).toBe(aret.antal);
    expect(man.reduce((s, x) => s + (x.s.liter ?? 0), 0)).toBe(aret.liter);
  });
  it('en månad utan diesel (juli) har null liter, aldrig 0', () => {
    expect(man.find(x => x.m.man === 7)!.s.liter).toBeNull();
  });
});

describe('Förbrukning: l/mil per månad och rundtyp', () => {
  const rundor = prodAret();
  const rs = forbrukningRader(perManad(2026, rundor, NU));
  const rad = (e: string) => rs.find(r => r.etikett === e)!;

  it('augusti: Flyttar 4,2 och Övrig körning 4,4 l/mil', () => {
    expect(rad('aug').staplar.map(s => s.text)).toEqual(['4,2', '4,4']);
  });
  it('juli har bara övriga rundor utan diesel: Flyttar "inga flyttar", Övrig "diesel saknas" — ingen stapel, aldrig 0', () => {
    const j = rad('jul').staplar;
    expect(j.map(s => s.varde)).toEqual([null, null]);
    expect(j.map(s => s.saknas)).toEqual(['inga flyttar', 'diesel saknas']);
    expect(j.map(s => s.text)).toEqual(['', '']);
  });
});

describe('Körsträcka: km per månad, Flyttar + Övrig staplade', () => {
  const rs = korstrackaRader(perManad(2026, prodAret(), NU));
  it('summan är summan av de avrundade delarna, och delarna står som text', () => {
    const okt = rs.find(r => r.etikett === 'okt')!;
    expect(okt.total).toBe('818');
    expect(okt.delar).toBe('296 + 522');
    for (const r of rs) expect(r.staplar.reduce((s, x) => s + (x.varde ?? 0), 0)).toBe(Number(r.total!.replace(/\s/g, '')));
  });
  it('en månad utan rundor har ingen summa (inte "0 km")', () => {
    const tom = korstrackaRader(perManad(2026, [], NU));
    expect(tom.every(r => r.total === null && r.delar === null)).toBe(true);
  });
});
