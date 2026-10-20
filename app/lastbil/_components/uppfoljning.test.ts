import { describe, it, expect } from 'vitest';
import { byggRundor, summera, type Ben, type RundaRad } from './rundor';
import type { UnderlagRad } from './fakturerbart';
import { betaltRader, forbrukningRader, harOkand, manadKort, korstrackaRader, korstrackaSerier, lagen, perManad, vantandeFlyttar } from './uppfoljning';
import { perViktManad } from './vikt';
import { PROD_VIKT_RADER } from './vikt.fixtur';

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

// Förbrukning och Körsträcka ligger på bilens VIKT (vikt.ts) — Martins prod-siffror 2026-10-20, se vikt.fixtur.ts.
describe('Förbrukning: l/mil per månad, Med lass och Utan lass', () => {
  const rs = forbrukningRader(perViktManad(2026, PROD_VIKT_RADER, NU));
  const rad = (e: string) => rs.find(r => r.etikett === e)!;

  it('aug 5,3 / 3,7 · sep 5,6 / 3,8 · okt 5,5 / 3,8 (en decimal; 5,28 · 3,66 · 5,58 · 3,83 · 5,45 · 3,76 i underlaget)', () => {
    expect(rad('aug').staplar.map(s => s.text)).toEqual(['5,3', '3,7']);
    expect(rad('sep').staplar.map(s => s.text)).toEqual(['5,6', '3,8']);
    expect(rad('okt').staplar.map(s => s.text)).toEqual(['5,5', '3,8']);
    expect(rad('aug').staplar.map(s => s.namn)).toEqual(['Med lass', 'Utan lass']);
  });
  it('juli har ingen vikt: "vikt saknas" på raden, inga värden — aldrig 0', () => {
    const j = rad('jul');
    expect(j.saknas).toBe('vikt saknas');
    expect(j.staplar.map(s => s.varde)).toEqual([null, null]);
    expect(j.staplar.map(s => s.text)).toEqual(['', '']);
  });
  it('en månad med vikt men utan körning av en klass säger det i ord; utan bränsle "diesel saknas"', () => {
    const utanLass = perViktManad(2026, [{ ...PROD_VIKT_RADER[0], km_lastad: 0, liter_lastad: 0, km_diesel_lastad: 0 }], NU);
    const [med, utan] = forbrukningRader(utanLass).find(r => r.etikett === 'aug')!.staplar;
    expect([med.varde, med.saknas]).toEqual([null, 'ingen körning med lass']);
    expect(utan.varde).toBeCloseTo(3.66, 2);
    expect(utan.saknas).toBeNull();
    const utanDiesel = perViktManad(2026, [{ ...PROD_VIKT_RADER[0], liter_tom: 0, km_diesel_tom: 0 }], NU);
    expect(forbrukningRader(utanDiesel).find(r => r.etikett === 'aug')!.staplar[1]).toMatchObject({ varde: null, saknas: 'diesel saknas' });
  });
});

describe('Körsträcka: km per månad, Med lass + Utan lass (+ Okänd) staplade', () => {
  const manader = perViktManad(2026, PROD_VIKT_RADER, NU);
  const rs = korstrackaRader(manader);
  it('summan är summan av de avrundade delarna, och delarna står som text', () => {
    const aug = rs.find(r => r.etikett === 'aug')!;
    expect(text(aug.total)).toBe('1 383');
    expect(aug.delar).toBe('538 + 845');
    for (const r of rs.filter(x => !x.saknas)) expect(r.staplar.reduce((s, x) => s + (x.varde ?? 0), 0)).toBe(Number(text(r.total).replace(/ /g, '')));
  });
  it('utan okänd körning finns ingen tredje serie och ingen tredje del', () => {
    expect(korstrackaSerier(manader)).toEqual(['Med lass', 'Utan lass']);
    expect(harOkand(manader)).toBe(false);
    expect(rs.every(r => r.staplar.length === 2)).toBe(true);
  });
  it('med okänd körning: tredje serien, tredje delen i texten och summan av tre avrundade delar', () => {
    const med = perViktManad(2026, [{ ...PROD_VIKT_RADER[0], km_okand: 12.4 }, PROD_VIKT_RADER[1]], NU);
    expect(korstrackaSerier(med)).toEqual(['Med lass', 'Utan lass', 'Okänd']);
    const aug = korstrackaRader(med).find(r => r.etikett === 'aug')!;
    expect(aug.delar).toBe('538 + 845 + 12');
    expect(text(aug.total)).toBe('1 395');
    expect(aug.staplar.map(s => s.namn)).toEqual(['Med lass', 'Utan lass', 'Okänd']);
    expect(korstrackaRader(med).find(r => r.etikett === 'sep')!.staplar).toHaveLength(2);   // okänd bara där den finns
  });
  it('en månad utan vikt har ingen summa (inte "0 km") utan säger "vikt saknas"', () => {
    const jul = rs.find(r => r.etikett === 'jul')!;
    expect(jul).toMatchObject({ total: null, delar: null, saknas: 'vikt saknas' });
  });
  it('okänd körning i en månad utan känd vikt ger ingen tredje serie (månaden säger "vikt saknas")', () => {
    const bara = perViktManad(2026, [{ ...PROD_VIKT_RADER[0], km_lastad: 0, km_tom: 0, km_okand: 40 }], NU);
    expect(harOkand(bara)).toBe(false);
    expect(korstrackaSerier(bara)).toEqual(['Med lass', 'Utan lass']);
  });
  it('okänd km som avrundas till 0 är ingen tredje serie', () => {
    expect(harOkand(perViktManad(2026, [{ ...PROD_VIKT_RADER[0], km_okand: 0.3 }], NU))).toBe(false);
  });
});

// ── Betalt: samma stapel som Körsträcka, delad i Fakturerat (pengatalets regel) och Ej betalt (= körda minus fakturerade) ──
const U = (datum: string, km: number | null, o: Partial<UnderlagRad> = {}): UnderlagRad => ({
  id: `u${++nr}`, flytt_id: null, km, status: 'aktiv', fakturerad_tid: null, godkand_tid: '2026-10-01T10:00:00Z', godkand_av: 'x', kund: 'Vida', datum, maskin: 'Giant',
  fran_objekt_id: null, fran_plats_id: null, till_objekt_id: null, till_plats_id: null, struken_tid: null, struken_anledning: null,
  km_original: null, kund_original: null, redigerad_tid: null, redigerad_av: null, ...o,
});
// Prod 2026-10-20 (godkända + fakturerade, ej strukna, avrundat per flytt): aug 105 km (3 flyttar), sep 140 (3), okt 89 (2).
const PROD_UNDERLAG = [
  U('2026-08-25', 34), U('2026-08-28', 40), U('2026-08-31', 31),
  U('2026-09-01', 49), U('2026-09-01', 47), U('2026-09-25', 44),
  U('2026-10-05', 36), U('2026-10-06', 53),
];
const rad = (rs: ReturnType<typeof betaltRader>, e: string) => rs.find(r => r.etikett === e)!;
const text = (s: string | null) => (s ?? '').replace(/\s/g, ' ');

describe('Betalt: prod-siffrorna', () => {
  const man = perManad(2026, prodAret(), NU);
  const rs = betaltRader(man, PROD_UNDERLAG);
  it('fakturerat + ej betalt = rundornas körda km i månaden', () => {
    // Betalt bygger på rundornas km (ekonomin), inte på mätarens: stapeln = rundornas km i månaden.
    for (const r of rs) {
      const summa = r.staplar.reduce((s, x) => s + (x.varde ?? 0), 0);
      expect(summa).toBe(man.find(x => manadKort(x.m) === r.etikett)!.s.km);
    }
  });
  it('okt 89 av 818 km, sep 140 av 1 362, aug 105 av 1 403 — och juli (ingen fakturering) 0 av 190', () => {
    expect(text(rad(rs, 'okt').total)).toBe('89 av 818 km');
    expect(text(rad(rs, 'sep').total)).toBe('140 av 1 362 km');
    expect(text(rad(rs, 'aug').total)).toBe('105 av 1 403 km');
    expect(text(rad(rs, 'jul').total)).toBe('0 av 190 km');
  });
  it('ej betalt = körda minus fakturerade, och andelen står som text', () => {
    expect(rad(rs, 'okt').staplar.map(s => s.varde)).toEqual([89, 729]);
    expect(rad(rs, 'okt').delar).toBe('11 %');
    expect(rad(rs, 'jul').staplar.map(s => s.varde)).toEqual([0, 190]);
  });
});

describe('Betalt: vad som räknas som fakturerat', () => {
  const man = perManad(2026, prodAret(), NU);
  it('ogodkända och strukna flyttar räknas inte; de ogodkända sägs i en egen rad med antal och km', () => {
    const u = [...PROD_UNDERLAG, U('2026-10-07', 40, { godkand_tid: null, godkand_av: null }), U('2026-10-08', 60, { status: 'struken' })];
    expect(text(rad(betaltRader(man, u), 'okt').total)).toBe('89 av 818 km');
    expect(vantandeFlyttar(u)).toEqual({ antal: 1, km: 40 });
    expect(vantandeFlyttar(PROD_UNDERLAG)).toEqual({ antal: 0, km: 0 });
  });
  it('en fakturerad flytt räknas som godkänd, och varje flyttens km avrundas före summering', () => {
    const u = [U('2026-10-05', 35.6, { godkand_tid: null, godkand_av: null, fakturerad_tid: '2026-10-10T10:00:00Z' }), U('2026-10-06', 53.4)];
    expect(rad(betaltRader(man, u), 'okt').staplar[0].varde).toBe(36 + 53);
  });
  it('mer fakturerat än körda km i månaden ger ej betalt 0, aldrig negativt', () => {
    const u = [U('2026-07-20', 500)];
    const jul = rad(betaltRader(man, u), 'jul');
    expect(jul.staplar.map(s => s.varde)).toEqual([500, 0]);
  });
  it('en månad utan rundor och utan fakturering har ingen summa (–), inte "0 av 0"', () => {
    expect(rad(betaltRader(perManad(2026, [], NU), []), 'sep').total).toBeNull();
  });
});

describe('Växelns lägen: Betalt finns bara för admin', () => {
  it('admin får tre, förare två', () => {
    expect(lagen(true).map(([id]) => id)).toEqual(['forbrukning', 'korstracka', 'betalt']);
    expect(lagen(false).map(([id]) => id)).toEqual(['forbrukning', 'korstracka']);
  });
});
