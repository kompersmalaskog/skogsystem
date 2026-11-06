import { describe, it, expect } from 'vitest';
import { analysRader, analysKortOrd, fyndFarg, lasTraktAnalys } from './traktanalys';
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
});
