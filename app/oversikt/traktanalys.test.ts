import { describe, it, expect } from 'vitest';
import { analysRader, analysMarkorer, analysKortOrd, fyndFarg, lasTraktAnalys, ANALYS_EXEMPEL, KONTROLLERA_FEL_TEXT } from './traktanalys';
import { GRUPPER } from '@/lib/larm/grupper';

describe('traktanalysen i Översikten', () => {
  it('färgen följer appens färgspråk: barmark = kultur, vattenskydd = blött, skydd = natur', () => {
    expect(fyndFarg('barmark')).toBe(GRUPPER.kultur.farg);
    expect(fyndFarg('vattenskydd')).toBe(GRUPPER.blott.farg);
    expect(fyndFarg('skydd')).toBe(GRUPPER.natur.farg);
  });
  it('märkena som rader, i funktionens ordning, utan dubbletter', () => {
    expect(analysRader(ANALYS_EXEMPEL).map((r) => r.text)).toEqual(['Fossil åker · barmark', 'Vattenskydd', 'Nyckelbiotop']);
    expect(analysRader({ lage: 'klar', fynd: [{ kategori: 'skydd', text: 'Natura 2000', plats: null }, { kategori: 'skydd', text: 'natura 2000 ', plats: null }] })).toHaveLength(1);
  });
  it('inget hittat = inga rader (aldrig en bekräftelse); kunde inte köras = "Kunde inte kontrolleras"; ej kopplad = inget', () => {
    expect(analysRader({ lage: 'klar', fynd: [] })).toEqual([]);
    expect(analysRader({ lage: 'fel' })).toEqual([{ text: KONTROLLERA_FEL_TEXT, farg: null, fel: true }]);
    expect(analysRader({ lage: 'ej_kopplad' })).toEqual([]);
  });
  it('markörer bara för fynd med plats; fel och ej kopplad ger inga', () => {
    const m = analysMarkorer([{ id: 'l', namn: 'Lidhem', analys: ANALYS_EXEMPEL }, { id: 'g', namn: 'Bondagård', analys: { lage: 'fel' } }]);
    expect(m.map((x) => x.text)).toEqual(['Fossil åker · barmark', 'Vattenskydd']);
    expect(m[0]).toMatchObject({ objektNamn: 'Lidhem', farg: GRUPPER.kultur.farg, lat: 56.4231, lng: 15.5112 });
  });
  it('den sparade analysen (prod 2026-11-06): Britteberg fossil åker = barmark; Bjällerhult nyckelbiotop = skydd', () => {
    const brit = lasTraktAnalys({ id: 'l', trakt_data: { beraknad: { restriktionerAnalyseradAt: 1793550266956, restriktioner: [{ type: 'fornlamning', name: 'Fossil åker (Väckelsång 192:1)' }] } } });
    expect(analysRader(brit).map((r) => r.text)).toEqual(['Fossil åker · barmark']);
    expect(analysKortOrd(brit)).toBe('Fossil åker');
    const bj = lasTraktAnalys({ id: 'b', trakt_data: { beraknad: { restriktionerAnalyseradAt: 1, restriktioner: [{ type: 'nyckelbiotop', name: 'KARSAMÅLA VID INÄGOR' }, { type: 'vattenskydd', name: 'Ryd' }, { type: 'fornlamning', name: 'Vägmärke (L1955:7217)' }] } } });
    expect(analysRader(bj).map((r) => r.text)).toEqual(['Nyckelbiotop · KARSAMÅLA VID INÄGOR', 'Vattenskydd · Ryd', 'Fornlämning · Vägmärke (L1955:7217)']);
    expect(analysKortOrd(bj)).toBe('Nyckelbiotop +2');
  });
  it('analyserad utan fynd = inga rader; aldrig analyserad = "Inte kontrollerad än" (aldrig tomt)', () => {
    expect(analysRader(lasTraktAnalys({ id: 'x', trakt_data: { beraknad: { restriktionerAnalyseradAt: 1, restriktioner: [] } } }))).toEqual([]);
    expect(analysRader(lasTraktAnalys({ id: 'x', trakt_data: null })).map((r) => r.text)).toEqual(['Inte kontrollerad än']);
    expect(analysKortOrd(lasTraktAnalys({ id: 'x' }))).toBeNull();
  });
});
