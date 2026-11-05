import { describe, it, expect } from 'vitest';
import { analysRader, analysMarkorer, fyndFarg, lasTraktAnalys, ANALYS_EXEMPEL, KONTROLLERA_FEL_TEXT } from './traktanalys';
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
  it('tills andra spårets funktion är inkopplad visas ingenting', () => {
    expect(lasTraktAnalys({ id: 'x', trakt_data: { beraknad: { restriktioner: [{ name: 'Fornlämning' }] } } })).toEqual({ lage: 'ej_kopplad' });
  });
});
