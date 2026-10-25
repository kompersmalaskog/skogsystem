import { describe, it, expect } from 'vitest';
import fx from './__fixtures__/scorpion_forslag_2026-10-24.json';
import { punktBesked, type ForslagStam, type PunktBesked } from './forslag';
import { byggKort, GREPP_STEG_PP, greppSteg, stegText, vantaText, INGET_RAD, INGET_RUBRIK, type Steg } from './forslagKort';
import { BYTE_TEXT, KONTROLL_TEXT, TRYCK_TEXT, andringarUr, kurvaText } from './forslagMarkorer';
import type { GreppRad } from './greppTid';

const IDAG = '2026-10-24';
const stammar: ForslagStam[] = (fx.stammar as [string, ForslagStam['klass'], string, string, number, number][]).map(([tradslag, klass, stam, dag, n, summa]) => ({ tradslag, klass, stam, dag, n, summa }));
const grepp: GreppRad[] = (fx.grepp as [string, string, string, number, number, number, number][]).map(([manad, tradslag, klass, st, steg, still, summaAndel]) => ({ manad, tradslag, klass, stammar: st, steg, still, summaAndel }));
const historik = (fx.historik as [string, string, number, boolean][]).map(([datum, tradslag, d, o]) => ({ datum, tradslag, typ: 'diameter', dia_justering_mm: d, omkalibrering: o }));

const p = (over: Partial<PunktBesked>): PunktBesked => ({
  tradslag: 'Tall', klass: '200-249', punkt: '200', stammar: 12, snittMm: 2.6, sdMm: 2, lo: 1.5, hi: 3.7, besked: 'justera', spak: 'kurva', andringMm: -2, saknas: 0, fonsterFran: '2026-10-01', ...over,
});

describe('greppSteg — när greppet stigit tydligt mot föregående månad', () => {
  const rad = (manad: string, tradslag: string, stammar: number, pct: number): GreppRad => ({ manad, tradslag, klass: '200-249', stammar, steg: 1000, still: 0, summaAndel: (pct * stammar) / 100 });
  it('tröskeln är 6 procentenheter, dömt på det avrundade talet', () => {
    expect(GREPP_STEG_PP).toBe(6);
    expect(greppSteg([rad('2026-09', 'TALL', 100, 30), rad('2026-10', 'TALL', 100, 36)], IDAG)).toHaveLength(1);
    expect(greppSteg([rad('2026-09', 'TALL', 100, 30), rad('2026-10', 'TALL', 100, 35.4)], IDAG)).toHaveLength(0);
    expect(greppSteg([rad('2026-09', 'TALL', 100, 30), rad('2026-10', 'TALL', 100, 35.6)], IDAG)).toHaveLength(1); // 5,6 visas som 6
  });
  it('en minskning är aldrig ett steg', () => {
    expect(greppSteg([rad('2026-09', 'TALL', 100, 40), rad('2026-10', 'TALL', 100, 30)], IDAG)).toHaveLength(0);
  });
  it('månaderna måste vara i följd — ett hopp över en månad är ingen "förra månaden"', () => {
    expect(greppSteg([rad('2026-08', 'TALL', 100, 20), rad('2026-10', 'TALL', 100, 40)], IDAG)).toHaveLength(0);
  });
  it('båda månaderna måste ha nog stammar (20), annars är medelvärdet brus', () => {
    expect(greppSteg([rad('2026-09', 'TALL', 100, 20), rad('2026-10', 'TALL', 19, 40)], IDAG)).toHaveLength(0);
    expect(greppSteg([rad('2026-09', 'TALL', 19, 20), rad('2026-10', 'TALL', 100, 40)], IDAG)).toHaveLength(0);
  });
  it('en ökning för flera månader sedan är inget att kolla idag', () => {
    expect(greppSteg([rad('2026-05', 'TALL', 100, 20), rad('2026-06', 'TALL', 100, 40)], IDAG)).toHaveLength(0);
    expect(greppSteg([rad('2026-09', 'TALL', 100, 20), rad('2026-10', 'TALL', 100, 40)], '2026-11-03')).toHaveLength(1); // förra månaden räknas i början av nästa
  });
  it('inom samma trädslag: gran stiger inte för att tall gör det', () => {
    const r = greppSteg([rad('2026-09', 'TALL', 100, 20), rad('2026-10', 'TALL', 100, 40), rad('2026-09', 'GRAN', 100, 20), rad('2026-10', 'GRAN', 100, 22)], IDAG);
    expect(r.map(x => x.tradslag)).toEqual(['Tall']);
  });
  it('Scorpionen: bara tall i oktober (28,9 → 36,1 %). Gran +2,8 och björk −1,4 ger inget.', () => {
    const r = greppSteg(grepp, IDAG);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ tradslag: 'Tall', manad: '2026-10', forra: '2026-09' });
    expect(r[0].fran).toBeCloseTo(28.9, 1);
    expect(r[0].till).toBeCloseTo(36.1, 1);
  });
});

describe('byggKort — ordningen', () => {
  const inget = { grepp: [], andringar: [], kollat: [], idag: IDAG };
  const g = { tradslag: 'Tall', manad: '2026-10', forra: '2026-09', fran: 29, till: 36, pp: 7 };
  const kurva = p({});
  const bada = p({ tradslag: 'Gran', klass: '300+', punkt: '300+', stammar: 27, snittMm: 3.3, sdMm: 5.5, spak: 'bada', andringMm: null });
  const klava = p({ stammar: 6, saknas: 4, besked: 'klava', spak: null, andringMm: null });

  it('inget att göra när inget behövs', () => {
    expect(byggKort({ ...inget, punkter: [p({ besked: 'latavara', spak: null, andringMm: null })] })).toEqual({ lage: 'inget', steg: [], vantaTill: null });
    expect(byggKort({ ...inget, punkter: [] }).lage).toBe('inget');
  });
  it('greppet först: Kolla knivar och valsar före allt annat', () => {
    const k = byggKort({ ...inget, grepp: [g], punkter: [kurva, klava] });
    expect(k.steg.map(s => s.id)).toEqual(['kolla', 'kurva:Tall', 'klava:Tall']); // allt appen redan vet, i ordning
  });
  it('stor spridning ger också Kolla först, sedan Höj trycket — och räkningen slutar där (trycket börjar om fönstret)', () => {
    const k1 = byggKort({ ...inget, punkter: [bada, kurva] });
    expect(k1.steg.map(s => s.slag)).toEqual(['kolla', 'tryck']);
    const k2 = byggKort({ ...inget, punkter: [bada, kurva], kollat: ['2026-10-24'] });
    expect(k2.steg.map(s => s.slag)).toEqual(['tryck']);
  });
  it('kurvan väntar tills trycket är gjort — en tryckändring flyttar kurvan', () => {
    const k = byggKort({ ...inget, punkter: [bada, kurva], kollat: ['2026-10-24'] });
    expect(k.steg.some(s => s.slag === 'kurva')).toBe(false);
  });
  it('utan grepp och spridning: Ändra kurvan, sedan Klava', () => {
    const k = byggKort({ ...inget, punkter: [kurva, klava, p({ tradslag: 'Gran', punkt: '250', klass: '250-299', stammar: 8, saknas: 2, besked: 'klava', spak: null, andringMm: null })] });
    expect(k.steg.map(s => s.id)).toEqual(['kurva:Tall', 'klava:Tall', 'klava:Gran']);
    expect(k.lage).toBe('steg');
  });
  it('ett Klava-steg per trädslag: den punkt som ligger närmast 10 stammar', () => {
    const k = byggKort({ ...inget, punkter: [klava, p({ ...klava, klass: '250-299', punkt: '250', stammar: 9, saknas: 1 })] });
    const steg = k.steg.filter(s => s.slag === 'klava');
    expect(steg).toHaveLength(1);
    expect(steg[0].slag === 'klava' && steg[0].punkt.punkt).toBe('250');
  });
  it('Kolla är gjort när svaret är daterat på eller efter orsaken: greppets månad, spridningens fönsterstart', () => {
    expect(byggKort({ ...inget, grepp: [g], punkter: [], kollat: ['2026-09-30'] }).steg).toHaveLength(1); // före oktober: gäller inte
    expect(byggKort({ ...inget, grepp: [g], punkter: [], kollat: ['2026-10-01'] }).lage).toBe('inget');
    const sprid = { ...bada, fonsterFran: '2026-10-05' };
    expect(byggKort({ ...inget, punkter: [sprid], kollat: ['2026-10-04'] }).steg[0].slag).toBe('kolla');
    expect(byggKort({ ...inget, punkter: [sprid], kollat: ['2026-10-05'] }).steg[0].slag).toBe('tryck');
  });
  it('en veckas väntan efter en tryckändring: Vänta i stället för Ändra kurvan', () => {
    const andringar = andringarUr({ atgarder: [{ datum: '2026-10-20', text: TRYCK_TEXT }], historik: [] });
    const k = byggKort({ ...inget, andringar, punkter: [kurva] });
    expect(k).toEqual({ lage: 'vanta', steg: [], vantaTill: '2026-10-27' });
    expect(byggKort({ ...inget, andringar, punkter: [kurva], idag: '2026-10-27' }).steg[0].slag).toBe('kurva');
  });
  it('veckans väntan hindrar inte Klava', () => {
    const andringar = andringarUr({ atgarder: [{ datum: '2026-10-20', text: TRYCK_TEXT }], historik: [] });
    expect(byggKort({ ...inget, andringar, punkter: [klava] }).steg[0].slag).toBe('klava');
  });
  it('ett nytt byte av knivar är också en ändring av maskinen (veckan räknas)', () => {
    const andringar = andringarUr({ atgarder: [{ datum: '2026-10-22', text: BYTE_TEXT }], historik: [] });
    expect(byggKort({ ...inget, andringar, punkter: [kurva] }).lage).toBe('vanta');
  });
  it('besked utan åtgärd (Vänta, Låt vara) ger aldrig ett steg', () => {
    expect(byggKort({ ...inget, punkter: [p({ besked: 'vanta', spak: null, andringMm: null }), p({ besked: 'latavara', spak: null, andringMm: null })] }).steg).toEqual([]);
  });
});

describe('Scorpionen — kortets första steg', () => {
  const andringar = andringarUr({ atgarder: fx.atgarder, historik });
  const punkter = punktBesked({ stammar, andringar, idag: IDAG });
  const g = greppSteg(grepp, IDAG);

  it('första steget är "Kolla knivar och valsar" (greppet om tall steg i oktober, och gran 300+ har stor spridning)', () => {
    const k = byggKort({ punkter, grepp: g, andringar, kollat: [], idag: IDAG });
    expect(k.lage).toBe('steg');
    expect(k.steg.map(s => s.slag)).toEqual(['kolla', 'tryck']);
    const t = tx(k.steg[0]);
    expect(t.rubrik).toBe('Kolla knivar och valsar');
    expect(t.varfor).toBe('Greppet har släppt oftare på tall i oktober. Måtten hoppar också mellan stammar på gran 300+ mm.');
  });
  it('efter "Klart, allt såg bra ut": Höj trycket (gran 300+ — båda, trycket först)', () => {
    const k = byggKort({ punkter, grepp: g, andringar, kollat: ['2026-10-25'], idag: '2026-10-25' });
    expect(k.steg.map(s => s.slag)).toEqual(['tryck']);
    expect(tx(k.steg[0]).rubrik).toBe('Höj trycket på knivar och hjul');
  });
  it('har trycket höjts (åtgärdsmarkör) börjar fönstret om: inget att göra utom att klava', () => {
    const med = andringarUr({ atgarder: [...fx.atgarder, { datum: '2026-10-25', text: KONTROLL_TEXT }, { datum: '2026-10-25', text: TRYCK_TEXT }], historik });
    const p2 = punktBesked({ stammar, andringar: med, idag: '2026-10-25' });
    expect(p2).toEqual([]);
    const k = byggKort({ punkter: p2, grepp: g, andringar: med, kollat: ['2026-10-25'], idag: '2026-10-25' });
    expect(k.lage).toBe('inget');
  });
});

const sp = (t: string): string => t.replace(/\u00a0/g, ' '); // enheten hålls ihop med sitt tal med ett hårt mellanslag
const tx = (s: Steg) => { const t = stegText(s); return { ...t, rubrik: sp(t.rubrik), varfor: sp(t.varfor), rader: t.rader.map(sp) }; };

describe('stegText — vad kortet säger', () => {
  it('Ändra: "Sänk tall 3 mm" och bara punkterna som ska ändras', () => {
    const t = tx({ slag: 'kurva', id: 'kurva:Tall', tradslag: 'Tall', punkter: [p({ punkt: '150', andringMm: -3 }) as never, p({ punkt: '200', andringMm: -3 }) as never] });
    expect(t.rubrik).toBe('Sänk tall 3 mm');
    expect(t.rader).toEqual(['150 mm −3', '200 mm −3']);
    expect(t.varfor).toBe('Maskinen mäter för grovt på 150 och 200 mm.');
    expect(t.ikon).toBe('show_chart');
  });
  it('Ändra: olika ändringar → "Ändra kurvan för gran", varje punkt med sitt tal', () => {
    const t = tx({ slag: 'kurva', id: 'kurva:Gran', tradslag: 'Gran', punkter: [p({ tradslag: 'Gran', punkt: '100', andringMm: -2 }) as never, p({ tradslag: 'Gran', punkt: '250', snittMm: -3.4, andringMm: 3 }) as never] });
    expect(t.rubrik).toBe('Ändra kurvan för gran');
    expect(t.rader).toEqual(['100 mm −2', '250 mm +3']);
    expect(t.varfor).toBe('Maskinen mäter för grovt på 100 mm och för klent på 250 mm.');
  });
  it('Höj när maskinen mäter för klent', () => {
    expect(tx({ slag: 'kurva', id: 'k', tradslag: 'Björk', punkter: [p({ tradslag: 'Björk', snittMm: -2.7, andringMm: 2 }) as never] }).rubrik).toBe('Höj björk 2 mm');
  });
  it('Klava: "Klava en tall 250 mm" när en fattas, annars med antal', () => {
    const en = tx({ slag: 'klava', id: 'klava:Tall', tradslag: 'Tall', punkt: p({ punkt: '250', klass: '250-299', stammar: 9, saknas: 1, besked: 'klava', spak: null, andringMm: null }) });
    expect(en.rubrik).toBe('Klava en tall 250 mm');
    expect(en.varfor).toBe('Tall 250–299 mm har 9 av 10 stammar. Så många behövs för att kunna ändra kurvan.');
    const tre = tx({ slag: 'klava', id: 'klava:Gran', tradslag: 'Gran', punkt: p({ tradslag: 'Gran', punkt: '300+', klass: '300+', stammar: 7, saknas: 3, besked: 'klava', spak: null, andringMm: null }) });
    expect(tre.rubrik).toBe('Klava 3 granar 300+ mm');
  });
  it('Inget att göra och Vänta', () => {
    expect(INGET_RUBRIK).toBe('Inget att göra');
    expect(INGET_RAD).toBe('Fortsätt klava som vanligt.');
    expect(vantaText('2026-10-27').rubrik).toBe('Vänta till 27 okt');
  });
  it('kurvaText som kortet sparar läses tillbaka av reglerna (en markör per punkt)', () => {
    expect(kurvaText('Tall', '150', -3)).toBe('Kurvan ändrad: Tall 150 mm −3 mm');
  });
});
