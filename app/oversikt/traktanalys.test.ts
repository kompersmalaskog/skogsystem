import { describe, it, expect } from 'vitest';
import { analysRader, analysKortOrd, analysAllaOrd, fyndFarg, lasTraktAnalys } from './traktanalys';
import { GRUPPER } from '@/lib/larm/grupper';

// Serverns analys (objekt.trakt_analys) — bara fynd som ligger PÅ trakten (exakt intersect mot Vidas gräns).
const at = '2026-11-06T12:00:00Z';

describe('traktanalysen i Översikten = lib/traktAnalys/markning, ingen egen tolkning', () => {
  it('färgen följer appens färgspråk', () => {
    expect(fyndFarg('barmark')).toBe(GRUPPER.kultur.farg);
    expect(fyndFarg('vattenskydd')).toBe(GRUPPER.blott.farg);
    expect(fyndFarg('skydd')).toBe(GRUPPER.natur.farg);
  });
  it('fossil åker på trakten: märke i texten, ord på kartan', () => {
    const a = lasTraktAnalys({ trakt_analys: { at, fynd: [{ type: 'fornlamning', name: 'Fossil åker (Väckelsång 192:1)' }], fel: [] } });
    expect(analysRader(a).map((r) => r.text)).toEqual(['Fossil åker · barmark']);
    expect(analysKortOrd(a)).toBe('Fossil åker – kräver barmark');
  });
  it('bara nyckelbiotop: märke i texten, men ingen ring/ord på kartan (det ändrar inte hur man kör dit)', () => {
    const a = lasTraktAnalys({ trakt_analys: { at, fynd: [{ type: 'nyckelbiotop', name: 'Karsamåla vid inägor' }], fel: [] } });
    expect(analysRader(a).map((r) => r.text)).toEqual(['Nyckelbiotop']);
    expect(analysKortOrd(a)).toBeNull();
  });
  it('inte analyserad än: "Inte kontrollerad än" i texten, inget på kartan; Planeringens gamla lista läses inte', () => {
    const o = { trakt_data: { beraknad: { restriktionerAnalyseradAt: 1, restriktioner: [{ type: 'fornlamning', name: 'Fossil åker' }] } } };
    expect(analysRader(lasTraktAnalys(o)).map((r) => r.text)).toEqual(['Inte kontrollerad än']);
    expect(analysKortOrd(lasTraktAnalys(o))).toBeNull();
  });
  it('analyserad utan fynd = inga rader (aldrig en bekräftelse)', () => {
    expect(analysRader(lasTraktAnalys({ trakt_analys: { at, fynd: [], fel: [] } }))).toEqual([]);
  });
  it('planen säger ALLT på trakten (Bengt-Eric, prod 2026-11-06: vattenskydd, Natura 2000, tre nyckelbiotoper)', () => {
    const a = lasTraktAnalys({ trakt_analys: { at, fel: [], fynd: [
      { type: 'vattenskydd', name: 'Älmhult' }, { type: 'natura2000', name: 'Prästängen' },
      { type: 'nyckelbiotop', name: 'Ädellöv syd kyrka väst väg' }, { type: 'nyckelbiotop', name: 'Strandskog syd kyrkan' }, { type: 'nyckelbiotop', name: 'HAGMARK I SÄLLHULT' },
    ] } });
    expect(analysAllaOrd(a)).toBe('Vattenskydd · Natura 2000 · Nyckelbiotop');
    expect(analysKortOrd(a)).toBe('Vattenskydd');
  });
  it('bara fossil åker = samma ord som kartan; inget/ej analyserad = inget', () => {
    expect(analysAllaOrd(lasTraktAnalys({ trakt_analys: { at, fel: [], fynd: [{ type: 'fornlamning', name: 'Fossil åker' }] } }))).toBe('Fossil åker – kräver barmark');
    expect(analysAllaOrd(lasTraktAnalys({ trakt_analys: { at, fel: [], fynd: [{ type: 'fornlamning', name: 'Fossil åker' }, { type: 'nyckelbiotop', name: 'x' }] } }))).toBe('Fossil åker – barmark · Nyckelbiotop');
    expect(analysAllaOrd(lasTraktAnalys({ trakt_analys: { at, fel: [], fynd: [] } }))).toBeNull();
    expect(analysAllaOrd(lasTraktAnalys({}))).toBeNull();
  });
});
