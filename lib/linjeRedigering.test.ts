import { describe, expect, it } from 'vitest';
import {
  arRedigerbar, avstandM, delstracka, forlangMarkor, hittaFaste, kanSlasIhop, kopplaMarkor, langdM, narmastaPunkt, narmasteAnde,
  narmasteLinje, restBitar, slaIhopIntervall, suddaIntervall, suddaMarkor, type LinjeMarkor, type LngLat, type Omvandling,
} from './linjeRedigering';

// SVG-koordinaterna i testet ÄR meter (x åt öster, y åt norr) runt 56°N, 15°E.
const REF: LngLat = [15, 56];
const KX = 111320 * Math.cos((56 * Math.PI) / 180);
const ll = (x: number, y: number): LngLat => [REF[0] + x / KX, REF[1] + y / 111320];
let nasta = 1000;
const omv: Omvandling = {
  tillLngLat: (p) => ll(p.x, p.y),
  tillSvg: (c) => ({ x: (c[0] - REF[0]) * KX, y: (c[1] - REF[1]) * 111320 }),
  nyttId: () => nasta++,
};
const vag = (id: number, pts: Array<[number, number]>, extra: Partial<LinjeMarkor> = {}): LinjeMarkor => ({
  id, lineType: 'mainRoad', isLine: true, path: pts.map(([x, y]) => ({ x, y })), ...extra,
});
const langd = (m: LinjeMarkor) => langdM((m.path ?? []).map((p) => omv.tillLngLat(p)));

describe('geometri', () => {
  it('langdM och avstandM räknar meter', () => {
    expect(avstandM(ll(0, 0), ll(30, 40))).toBeCloseTo(50, 1);
    expect(langdM([ll(0, 0), ll(100, 0), ll(100, 50)])).toBeCloseTo(150, 1);
  });
  it('narmastaPunkt ger sträcka längs linjen och avstånd', () => {
    const n = narmastaPunkt([ll(0, 0), ll(100, 0)], ll(40, 7))!;
    expect(n.s).toBeCloseTo(40, 1);
    expect(n.avstand).toBeCloseTo(7, 1);
  });
  it('delstracka tar med ändpunkter och hörn', () => {
    const d = delstracka([ll(0, 0), ll(100, 0), ll(100, 100)], 50, 150);
    expect(d).toHaveLength(3);
    expect(langdM(d)).toBeCloseTo(100, 1);
  });
  it('slaIhopIntervall slår ihop överlapp', () => {
    expect(slaIhopIntervall([[0, 5], [4, 10], [20, 30]])).toEqual([[0, 10], [20, 30]]);
  });
});

describe('suddaIntervall — bara EN linje, och bara det man strukit över', () => {
  const linje = [ll(0, 0), ll(100, 0)];
  it('drag över mitten ger ett intervall runt draget', () => {
    const iv = suddaIntervall(linje, [ll(40, 1), ll(60, 1)], 5, 3);
    expect(iv).toHaveLength(1);
    expect(iv[0][0]).toBeCloseTo(37, 0);
    expect(iv[0][1]).toBeCloseTo(63, 0);
  });
  it('pekare långt från linjen suddar ingenting', () => {
    expect(suddaIntervall(linje, [ll(40, 30), ll(60, 30)], 5)).toEqual([]);
  });
  it('en snabb dragning (glest provtagen) lämnar inga hål', () => {
    const iv = suddaIntervall(linje, [ll(10, 0), ll(80, 0)], 5, 3);
    expect(iv).toHaveLength(1);
    expect(iv[0][0]).toBeCloseTo(7, 1);
    expect(iv[0][1]).toBeCloseTo(83, 1);
  });
  it('en hårnål där linjen kommer tillbaka suddar inte slingan emellan', () => {
    const hornal = [ll(0, 0), ll(100, 0), ll(100, 4), ll(0, 4)];
    // prov på första benet, sedan på det sista benet precis ovanför — pekaren har knappt rört sig
    const iv = suddaIntervall(hornal, [ll(50, 0), ll(50, 4)], 5, 2);
    // bitarna runt sträcka 50 respektive ~154 — inte allt däremellan
    expect(iv.length).toBe(2);
  });
});

describe('restBitar', () => {
  const linje = [ll(0, 0), ll(100, 0)];
  it('mitten bort → två bitar', () => {
    const b = restBitar(linje, [[40, 60]]);
    expect(b).toHaveLength(2);
    expect(langdM(b[0].coords)).toBeCloseTo(40, 1);
    expect(langdM(b[1].coords)).toBeCloseTo(40, 1);
  });
  it('änden bort → en kortare bit', () => {
    const b = restBitar(linje, [[70, 100]]);
    expect(b).toHaveLength(1);
    expect(langdM(b[0].coords)).toBeCloseTo(70, 1);
  });
  it('allt bort → inga bitar; ett stubbrest under 1 m är ingen linje', () => {
    expect(restBitar(linje, [[0, 100]])).toHaveLength(0);
    expect(restBitar(linje, [[0, 99.5]])).toHaveLength(0);
  });
});

describe('suddaMarkor', () => {
  it('suddar mitt på → två linjer, den första behåller id, nummer, kommentar; den andra är ny och rensad', () => {
    const a = vag(1, [[0, 0], [100, 0]], { nummer: 3, comment: 'Stenigt', photoPath: 'x.jpg', farg: 'red' });
    const r = suddaMarkor([a], 1, [[40, 60]], omv);
    expect(r.markers).toHaveLength(2);
    const [f, s] = r.markers;
    expect(f.id).toBe(1);
    expect(f.nummer).toBe(3);
    expect(f.comment).toBe('Stenigt');
    expect(s.id).not.toBe(1);
    expect(s.nummer).toBeUndefined();
    expect(s.comment).toBeUndefined();
    expect(s.photoPath).toBeUndefined();
    expect(s.farg).toBe('red');             // snitselfärgen följer med
    expect(s.lineType).toBe('mainRoad');
    expect(langd(f)).toBeCloseTo(40, 1);
    expect(langd(s)).toBeCloseTo(40, 1);
    expect(r.sparas.map((m) => m.id).sort()).toEqual([1, s.id].sort());
    expect(r.tasBort).toEqual([]);
  });
  it('suddar en ände → samma linje, kortare', () => {
    const a = vag(1, [[0, 0], [100, 0]], { nummer: 2 });
    const r = suddaMarkor([a], 1, [[70, 100]], omv);
    expect(r.markers).toHaveLength(1);
    expect(r.markers[0].id).toBe(1);
    expect(langd(r.markers[0])).toBeCloseTo(70, 1);
    expect(r.tasBort).toEqual([]);
  });
  it('suddar allt → linjen tas bort', () => {
    const r = suddaMarkor([vag(1, [[0, 0], [100, 0]])], 1, [[0, 100]], omv);
    expect(r.markers).toHaveLength(0);
    expect(r.tasBort).toEqual([1]);
  });
  it('rör aldrig en annan linje, inte ens en som korsar', () => {
    const a = vag(1, [[0, 0], [100, 0]]);
    const kors = vag(2, [[50, -50], [50, 50]]);
    const r = suddaMarkor([a, kors], 1, [[45, 55]], omv);
    expect(r.markers.find((m) => m.id === 2)).toBe(kors);
    expect(r.sparas.find((m) => m.id === 2)).toBeUndefined();
  });
  it('traktgränsen (boundary) går inte att sudda', () => {
    const g = vag(1, [[0, 0], [100, 0]], { lineType: 'boundary' });
    expect(arRedigerbar(g)).toBe(false);
    const r = suddaMarkor([g], 1, [[40, 60]], omv);
    expect(r.markers).toEqual([g]);
    expect(r.sparas).toEqual([]);
  });
  it('körordningen delas ut i körriktning och resten flyttas', () => {
    const a = vag(1, [[0, 0], [100, 0]], { ordning: 1 });
    const b = vag(2, [[0, 50], [100, 50]], { ordning: 2 });
    const c = vag(3, [[0, 90], [100, 90]], { ordning: 3 });
    const r = suddaMarkor([a, b, c], 1, [[40, 60]], omv);
    const ord = (id: number | string) => r.markers.find((m) => m.id === id)!.ordning;
    expect(ord(1)).toBe(1);
    const ny = r.markers.find((m) => m.id !== 1 && m.id !== 2 && m.id !== 3)!;
    expect(ny.ordning).toBe(2);
    expect(ord(2)).toBe(3);
    expect(ord(3)).toBe(4);
  });
  it('körs vägen baklänges får den andra biten första platsen', () => {
    const a = vag(1, [[0, 0], [100, 0]], { ordning: 1, riktningBak: true });
    const r = suddaMarkor([a], 1, [[40, 60]], omv);
    const forsta = r.markers.find((m) => m.id === 1)!;
    const andra = r.markers.find((m) => m.id !== 1)!;
    expect(andra.ordning).toBe(1);
    expect(forsta.ordning).toBe(2);
    expect(andra.riktningBak).toBe(true);
  });
  it('suddar man bort en hel körd väg stänger ordningen luckan', () => {
    const a = vag(1, [[0, 0], [100, 0]], { ordning: 1 });
    const b = vag(2, [[0, 50], [100, 50]], { ordning: 2 });
    const r = suddaMarkor([a, b], 1, [[0, 100]], omv);
    expect(r.markers).toHaveLength(1);
    expect(r.markers[0].ordning).toBe(1);
    expect(r.sparas.map((m) => m.id)).toEqual([2]);
  });
  it('backvägens hinder följer med den ände det satt i — och försvinner om änden är bortsuddad', () => {
    const a = vag(1, [[0, 0], [100, 0]], { backvag: { ande: 'slut' } });
    const mitt = suddaMarkor([a], 1, [[40, 60]], omv);
    expect(mitt.markers.find((m) => m.id === 1)!.backvag).toBeUndefined();
    expect(mitt.markers.find((m) => m.id !== 1)!.backvag).toEqual({ ande: 'slut' });
    const ande = suddaMarkor([a], 1, [[70, 100]], omv);
    expect(ande.markers[0].backvag).toBeUndefined();
    const start = suddaMarkor([a], 1, [[0, 30]], omv);
    expect(start.markers[0].backvag).toEqual({ ande: 'slut' });
  });
});

describe('forlangMarkor', () => {
  it('lägger en ny slutpunkt', () => {
    const a = vag(1, [[0, 0], [100, 0]]);
    const r = forlangMarkor([a], 1, 'slut', ll(100, 60), omv);
    expect(r.markers[0].path).toHaveLength(3);
    expect(langd(r.markers[0])).toBeCloseTo(160, 1);
    expect(r.sparas).toHaveLength(1);
  });
  it('lägger en ny startpunkt först', () => {
    const a = vag(1, [[0, 0], [100, 0]]);
    const r = forlangMarkor([a], 1, 'start', ll(-30, 0), omv);
    expect(r.markers[0].path![0].x).toBeCloseTo(-30, 1);
    expect(langd(r.markers[0])).toBeCloseTo(130, 1);
  });
  it('en ände som knappt flyttats är ingen förlängning', () => {
    const a = vag(1, [[0, 0], [100, 0]]);
    const r = forlangMarkor([a], 1, 'slut', ll(100.3, 0), omv);
    expect(r.sparas).toEqual([]);
  });
  it('traktgränsen förlängs inte', () => {
    const g = vag(1, [[0, 0], [100, 0]], { lineType: 'boundary' });
    expect(forlangMarkor([g], 1, 'slut', ll(100, 60), omv).sparas).toEqual([]);
  });
});

describe('kopplaMarkor', () => {
  it('ände mot ände av samma sort → EN linje; den dragna behåller id, den andra tas bort', () => {
    const a = vag(1, [[0, 0], [100, 0]], { nummer: 4, farg: 'red', ordning: 1 });
    const b = vag(2, [[100, 5], [200, 5]], { nummer: 2, farg: 'red', ordning: 2 });
    const c = vag(3, [[0, 80], [100, 80]], { ordning: 3 });
    const r = kopplaMarkor([a, b, c], 1, 'slut', { typ: 'ande', id: 2, ande: 'start', punkt: ll(100, 5) }, omv);
    expect(r.tasBort).toEqual([2]);
    const u = r.markers.find((m) => m.id === 1)!;
    expect(u.path).toHaveLength(4);
    expect(langd(u)).toBeCloseTo(205, 0);
    expect(u.nummer).toBe(2);                   // lägsta numret
    expect(u.farg).toBe('red');
    expect(r.markers.find((m) => m.id === 3)!.ordning).toBe(2);   // luckan i körordningen stängs
  });
  it('A.slut mot B.slut vänder B', () => {
    const a = vag(1, [[0, 0], [100, 0]]);
    const b = vag(2, [[200, 0], [100.2, 0]]);
    const r = kopplaMarkor([a, b], 1, 'slut', { typ: 'ande', id: 2, ande: 'slut', punkt: ll(100.2, 0) }, omv);
    const u = r.markers.find((m) => m.id === 1)!;
    expect(u.path![u.path!.length - 1].x).toBeCloseTo(200, 1);
  });
  it('A.start mot B.slut → B + A', () => {
    const a = vag(1, [[100, 0], [200, 0]]);
    const b = vag(2, [[0, 0], [100, 0]]);
    const r = kopplaMarkor([a, b], 1, 'start', { typ: 'ande', id: 2, ande: 'slut', punkt: ll(100, 0) }, omv);
    const u = r.markers.find((m) => m.id === 1)!;
    expect(u.path![0].x).toBeCloseTo(0, 1);
    expect(u.path!.length).toBe(3);               // skarvpunkten finns bara en gång
  });
  it('en röd och en blå väg blir inte en — änden fäster bara', () => {
    const a = vag(1, [[0, 0], [100, 0]], { farg: 'red' });
    const b = vag(2, [[100, 5], [200, 5]], { farg: 'blue' });
    expect(kanSlasIhop(a, b)).toBe(false);
    const r = kopplaMarkor([a, b], 1, 'slut', { typ: 'ande', id: 2, ande: 'start', punkt: ll(100, 5) }, omv);
    expect(r.tasBort).toEqual([]);
    expect(r.markers.find((m) => m.id === 1)!.path).toHaveLength(3);
    expect(r.markers.find((m) => m.id === 2)).toBe(b);
  });
  it('en annan sort (väg och dike) slås inte ihop', () => {
    expect(kanSlasIhop(vag(1, [[0, 0], [1, 0]]), vag(2, [[0, 0], [1, 0]], { lineType: 'ditch' }))).toBe(false);
  });
  it('mot en punkt mitt på en annan linje fäster bara änden', () => {
    const a = vag(1, [[0, 0], [100, 0]]);
    const b = vag(2, [[100, 40], [100, 100]]);
    const r = kopplaMarkor([a, b], 1, 'slut', { typ: 'punkt', punkt: ll(100, 60) }, omv);
    expect(r.tasBort).toEqual([]);
    expect(r.markers.find((m) => m.id === 1)!.path).toHaveLength(3);
  });
  it('backvägens hinder i skarven försvinner; i yttre änden följer med', () => {
    const a = vag(1, [[0, 0], [100, 0]], { backvag: { ande: 'slut' } });
    const b = vag(2, [[100, 5], [200, 5]]);
    const r = kopplaMarkor([a, b], 1, 'slut', { typ: 'ande', id: 2, ande: 'start', punkt: ll(100, 5) }, omv);
    expect(r.markers.find((m) => m.id === 1)!.backvag).toBeUndefined();
    const a2 = vag(1, [[0, 0], [100, 0]]);
    const b2 = vag(2, [[100, 5], [200, 5]], { backvag: { ande: 'slut' } });
    const r2 = kopplaMarkor([a2, b2], 1, 'slut', { typ: 'ande', id: 2, ande: 'start', punkt: ll(100, 5) }, omv);
    expect(r2.markers.find((m) => m.id === 1)!.backvag).toEqual({ ande: 'slut' });
  });
  it('en hopsatt väg är bara körd om båda var körda', () => {
    const a = vag(1, [[0, 0], [100, 0]], { ordning: 1, korKlar: '2026-10-25T10:00:00Z' });
    const b = vag(2, [[100, 5], [200, 5]], { ordning: 2 });
    const r = kopplaMarkor([a, b], 1, 'slut', { typ: 'ande', id: 2, ande: 'start', punkt: ll(100, 5) }, omv);
    expect(r.markers.find((m) => m.id === 1)!.korKlar).toBeUndefined();
  });
});

describe('att hitta ände och fäste', () => {
  const lin = [
    { id: 'a', coords: [ll(0, 0), ll(100, 0)], egen: true },
    { id: 'b', coords: [ll(110, 0), ll(200, 0)], egen: true },
    { id: 'v', coords: [ll(0, 30), ll(100, 30)], egen: false },
  ];
  it('narmasteAnde hittar närmaste ände inom radien', () => {
    expect(narmasteAnde(lin, ll(104, 1), 8)).toMatchObject({ id: 'a', ande: 'slut' });
    expect(narmasteAnde(lin, ll(50, 0), 8)).toBeNull();
  });
  it('en sluten ring har inga ändar', () => {
    expect(narmasteAnde([{ id: 'r', coords: [ll(0, 0), ll(10, 0), ll(10, 10), ll(0, 0)] }], ll(0, 0), 5)).toBeNull();
  });
  it('narmasteLinje', () => {
    expect(narmasteLinje(lin, ll(50, 28), 5)).toMatchObject({ id: 'v' });
  });
  it('hittaFaste: en egen ände går före en punkt; egen linje räknas aldrig; Vidas får bara en punkt', () => {
    expect(hittaFaste(lin, 'a', ll(108, 0), 8)).toMatchObject({ typ: 'ande', id: 'b', ande: 'start' });
    expect(hittaFaste(lin, 'a', ll(50, 1), 8)).toBeNull();
    expect(hittaFaste(lin, 'a', ll(50, 29), 8)).toMatchObject({ typ: 'punkt', id: 'v' });
    expect(hittaFaste([{ id: 'v2', coords: [ll(110, 0), ll(200, 0)], egen: false }], 'a', ll(108, 0), 8)).toMatchObject({ typ: 'punkt' });
  });
});
