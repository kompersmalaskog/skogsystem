import { describe, it, expect } from 'vitest';
import { arAktuell, delaFilJobb, kandidaterFor, sokObjekt, AKTUELL_DAGAR } from './filerUtanObjekt';
import type { OkopplatJobb } from '@/lib/objektNummer';

const IDAG = new Date('2026-10-24T10:00:00');
const jobb = (nyckel: string, datum: string | null, x: Partial<OkopplatJobb> = {}): OkopplatJobb =>
  ({ nyckel, maskin: 'R64428', ident: 'k53', filnamn: `${nyckel}.hpr`, namn: 'Görgen Gustafsson Trolleboda', datum, stammar: 350, kanKopplas: true, ...x });
const OBJ = [
  { id: 'a', namn: 'Görgen Gustafsson Trolleboda', vo_nummer: 'P-1025' },
  { id: 'b', namn: 'Görgen Gustafsson Amundshylte', vo_nummer: 'P-1020' },
  { id: 'c', namn: 'Mölleryd RP J-Hus -25', vo_nummer: '11166477' },
];

describe('filer utan objekt', () => {
  it('bara de senaste 30 dagarna är aktuella', () => {
    expect(AKTUELL_DAGAR).toBe(30);
    expect(arAktuell('2026-10-23', IDAG)).toBe(true);
    expect(arAktuell('2026-09-24', IDAG)).toBe(true);
    expect(arAktuell('2026-09-23', IDAG)).toBe(false);
    expect(arAktuell(null, IDAG)).toBe(false);
  });

  it('aktuella blir frågor, gamla och okopplingsbara ligger tyst, ignorerade räknas inte alls', () => {
    const d = delaFilJobb([
      jobb('R64428:k53', '2026-10-23'),
      jobb('PONS:11220121', '2026-06-17'),
      jobb('fil', '2026-10-20', { nyckel: null, kanKopplas: false }),
      jobb('PONS:11213421', '2026-10-22'),
    ], new Set(['PONS:11213421']), IDAG);
    expect(d.aktuella.map(j => j.nyckel)).toEqual(['R64428:k53']);
    expect(d.tysta).toBe(2);
  });

  it('samma namn först, sedan liknande, högst tre', () => {
    expect(kandidaterFor({ namn: 'Görgen Gustafsson Trolleboda' }, OBJ).map(o => o.id)).toEqual(['a', 'b']);
    expect(kandidaterFor({ namn: 'Okänt jobb' }, OBJ)).toEqual([]);
  });

  it('sök: alla ord ska träffa namn eller VO', () => {
    expect(sokObjekt(OBJ, 'görgen amund').map(o => o.id)).toEqual(['b']);
    expect(sokObjekt(OBJ, '11166477').map(o => o.id)).toEqual(['c']);
    expect(sokObjekt(OBJ, '  ')).toEqual([]);
  });
});
