import { describe, expect, it } from 'vitest';
import { bedomPlats, fmtPlatsAvstand, type PlatsPunkt } from './platsGrad';
import { narmastePlats, type PlatsKandidat } from './plats';

// En punkt och platser rakt norrut från den: avståndet i meter blir exakt det som skrivs (1° latitud = 111 194,9 m).
const M_PER_GRAD = (6371000 * Math.PI) / 180;
const PUNKT = { lat: 56.2, lng: 14.9 };
const norrut = (namn: string, m: number): PlatsPunkt => ({ namn, lat: PUNKT.lat + m / M_PER_GRAD, lng: PUNKT.lng });
const bedom = (k: PlatsPunkt[]) => bedomPlats(PUNKT.lat, PUNKT.lng, k);

describe('bedomPlats — säker, osäker, okänd', () => {
  it('SÄKER: närmaste inom 300 m och nästa minst 300 m längre bort → namnet som idag', () => {
    expect(bedom([norrut('Åbogen', 120), norrut('Intaget gallring', 700), norrut('Sandåsen', 1200)])).toEqual({ typ: 'saker', namn: 'Åbogen' });
    expect(bedom([norrut('Åbogen', 120)])).toEqual({ typ: 'saker', namn: 'Åbogen' });                       // ensam
  });

  it('gränserna: 300 m och exakt 300 m längre bort är säkert; 301 m eller 299 m längre bort är det inte', () => {
    expect(bedom([norrut('A', 300), norrut('B', 600)])).toMatchObject({ typ: 'saker', namn: 'A' });
    expect(bedom([norrut('A', 301), norrut('B', 2000)])).toMatchObject({ typ: 'osaker', namn: 'A' });
    expect(bedom([norrut('A', 100), norrut('B', 399)])).toMatchObject({ typ: 'osaker', namn: 'A' });
    expect(bedom([norrut('A', 100), norrut('B', 400)])).toMatchObject({ typ: 'saker', namn: 'A' });
  });

  it('OSÄKER — fallet 3 aug: Intaget 608 m, Åbogen 673 m, Sandåsen 1 km → "nära Intaget", även Åbogen och Sandåsen', () => {
    const r = bedom([norrut('Sandåsen', 1000), norrut('Åbogen', 673), norrut('Intaget gallring', 608)]);
    expect(r).toEqual({ typ: 'osaker', namn: 'Intaget gallring', andra: [{ namn: 'Åbogen', avstandM: 673 }, { namn: 'Sandåsen', avstandM: 1000 }] });
  });

  it('OSÄKER fast närmaste ligger nära: en annan inom 300 m av närmastes avstånd', () => {
    expect(bedom([norrut('Östra-Höka', 80), norrut('Västra-Höka', 250)])).toEqual({
      typ: 'osaker', namn: 'Östra-Höka', andra: [{ namn: 'Västra-Höka', avstandM: 250 }],
    });
  });

  it('de andra: högst två, bara inom 1,5 km, närmast först', () => {
    const r = bedom([norrut('A', 400), norrut('B', 500), norrut('C', 900), norrut('D', 1100), norrut('E', 1600)]);
    expect(r).toMatchObject({ typ: 'osaker', namn: 'A' });
    expect((r as any).andra.map((a: any) => a.namn)).toEqual(['B', 'C']);
    expect((bedom([norrut('A', 400), norrut('B', 1501), norrut('C', 1499)]) as any).andra.map((a: any) => a.namn)).toEqual(['C']);
    expect((bedom([norrut('A', 400), norrut('B', 3000)]) as any).andra).toEqual([]);                            // osäker utan grannar: ingen rad
  });

  it('OKÄND: inget inom 8 km — 8 000 m räknas, 8 001 m gör det inte', () => {
    expect(bedom([norrut('Långt bort', 8001)])).toEqual({ typ: 'okand' });
    expect(bedom([])).toEqual({ typ: 'okand' });
    expect(bedom([norrut('Precis', 8000)])).toMatchObject({ typ: 'osaker', namn: 'Precis' });
  });

  it('samma namn två gånger (trakt och flyttplats på samma ställe) är EN plats — inte en osäkerhet', () => {
    expect(bedom([norrut('Kompersmåla', 50), norrut('kompersmåla ', 60), norrut('Annat', 900)])).toEqual({ typ: 'saker', namn: 'Kompersmåla' });
  });

  it('platser utan koordinat eller namn räknas inte; saknas positionen går det inte att bedöma (null)', () => {
    expect(bedom([{ namn: 'Utan plats', lat: null, lng: null }, { namn: '', lat: PUNKT.lat, lng: PUNKT.lng }, norrut('Åbogen', 100)])).toEqual({ typ: 'saker', namn: 'Åbogen' });
    expect(bedomPlats(null, 14.9, [norrut('A', 10)])).toBeNull();
    expect(bedomPlats(56.2, null, [norrut('A', 10)])).toBeNull();
  });

  it('den närmaste är ALLTID den som flytten får (narmastePlats) — visningen ändrar bara hur säker den låter', () => {
    const k: PlatsKandidat[] = [
      { typ: 'objekt', id: '1', namn: 'Intaget gallring', lat: norrut('x', 608).lat as number, lng: PUNKT.lng },
      { typ: 'objekt', id: '2', namn: 'Åbogen', lat: norrut('x', 673).lat as number, lng: PUNKT.lng },
      { typ: 'plats', id: '3', namn: 'Sandåsen', lat: norrut('x', 1000).lat as number, lng: PUNKT.lng },
    ];
    expect(narmastePlats(PUNKT.lat, PUNKT.lng, k)?.namn).toBe('Intaget gallring');
    expect((bedom(k) as any).namn).toBe('Intaget gallring');
  });
});

describe('fmtPlatsAvstand', () => {
  it('meter under 1 km, annars km med en decimal (heltal utan ",0")', () => {
    expect(fmtPlatsAvstand(673)).toBe('673 m');
    expect(fmtPlatsAvstand(999)).toBe('999 m');
    expect(fmtPlatsAvstand(1000)).toBe('1 km');
    expect(fmtPlatsAvstand(1250)).toBe('1,3 km');
    expect(fmtPlatsAvstand(1499)).toBe('1,5 km');
  });
});
