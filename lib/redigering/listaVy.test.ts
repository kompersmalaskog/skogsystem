import { describe, it, expect } from 'vitest';
import { byggLista, matcharSok, type ListGrupp } from './listaVy';

const g = (nyckel: string, x: Partial<ListGrupp>): ListGrupp => ({
  nyckel, namn: nyckel, vo: nyckel, typ: 'Slutavverkning', bolag: 'Vida', pagaende: false, skordningKlar: true, skordat: 0, skotat: 0, ...x,
});

const ALLA = [
  g('Jätsbygd', { pagaende: true, skordningKlar: false, skordat: 1401, senasteData: '2026-10-22' }),
  g('Bjällerhult', { pagaende: true, skordningKlar: false, skordat: 612, senasteData: '2026-10-15', avslutForslag: true }),
  g('Husjönäs', { pagaende: true, skordningKlar: true, skordat: 678, skotat: 590, skordningAvslutad: '2026-10-14' }),
  g('Åbogen', { skordat: 822, skordningAvslutad: '2026-10-10', skotningAvslutad: '2026-10-21' }),
  g('Spåramåla', { bolag: 'ATA', skordat: 967, skotningAvslutad: '2026-10-08' }),
  g('Rössmåla', { typ: 'Gallring', skordat: 300, skotningAvslutad: '2026-09-12', special: true }),
  g('Ris Brorsmåla', { typ: 'Grot', skotat: 120, skotningAvslutad: '2026-08-02' }),
  g('Gammal', { typ: 'Gallring' }),
];

describe('byggLista', () => {
  const l = byggLista(ALLA, { typ: 'alla', sok: '' });

  it('ett objekt på en plats: Pågår, Skotning kvar, månad, utan datum', () => {
    expect(l.pagar.map(r => r.namn)).toEqual(['Jätsbygd', 'Bjällerhult']);
    expect(l.skotningKvar.map(r => r.namn)).toEqual(['Husjönäs']);
    expect(l.manader.map(m => m.rubrik)).toEqual(['Oktober 2026', 'September 2026', 'Augusti 2026']);
    expect(l.utanDatum.map(r => r.namn)).toEqual(['Gammal']);
  });

  it('månaden räknas på SISTA avslutsdatumet och nyast står först', () => {
    expect(l.manader[0].rader.map(r => r.namn)).toEqual(['Åbogen', 'Spåramåla']);
    expect(l.manader[0].rader[0].under).toBe('Klar 21 okt · Vida');
    expect(l.manader[0].rader[0].hoger).toBe('822 m³');
  });

  it('skotning kvar säger kvar på backen; förslag syns som Klar?', () => {
    expect(l.skotningKvar[0].under).toBe('88 m³ kvar på backen');
    expect(l.pagar[1]).toMatchObject({ forslag: true, under: 'Klar? · Vida · senast 15 okt' });
  });

  it('GROT utan skördare visar skotad volym; special märks', () => {
    expect(l.manader[2].rader[0].hoger).toBe('120 m³');
    expect(l.manader[1].rader[0].special).toBe(true);
  });

  it('typväljaren och antalen', () => {
    expect(l.antal).toEqual({ alla: 8, Slutavverkning: 5, Gallring: 2, Grot: 1 });
    const ga = byggLista(ALLA, { typ: 'Gallring', sok: '' });
    expect(ga.traffar).toBe(2);
    expect(ga.pagar).toEqual([]);
    expect(ga.manader.map(m => m.nyckel)).toEqual(['2026-09']);
  });

  it('sökning: alla ord måste träffa, i namn, VO, bolag eller markägare', () => {
    expect(byggLista(ALLA, { typ: 'alla', sok: 'ata spår' }).traffar).toBe(1);
    expect(matcharSok(g('x', { skogsagare: 'Anna Berg' }), 'berg')).toBe(true);
    expect(byggLista(ALLA, { typ: 'alla', sok: 'finns inte' }).traffar).toBe(0);
  });
});
