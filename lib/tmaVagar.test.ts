import { describe, it, expect } from 'vitest';
import { samlaVagvarningar, vagNyckel, type VagKontroll, type VagTraff, type LatLon } from './tmaVagar';

// Väg 538 (OSM-väg 100, sex noder) och en annan väg (OSM-väg 200, "Skogsvägen").
const V538: LatLon[] = [0, 1, 2, 3, 4, 5].map((i) => ({ lat: 56.3 + i * 0.0001, lon: 14.46 }));
const hit = (over: Partial<VagTraff> & { idx?: number[] }): VagTraff => {
  const idx = over.idx ?? [1, 2, 3];
  return { name: 'Väg 538', type: 'secondary', ref: '538', distance: 20, category: 'allman', wayId: 100, wayGeom: V538, nearbyIdx: idx, nearbyGeom: idx.map((i) => V538[i]), closestPoint: V538[idx[0]], ...over };
};
const klar = (...roads: VagTraff[]): VagKontroll => ({ status: 'done', roads });
const alla = () => true;

describe('vägvarning: en väg en gång per objekt', () => {
  it('två traktdelar längs väg 538 ger EN väg, EN ägare och EN röd linje', () => {
    const r = samlaVagvarningar([['140830', klar(hit({ distance: 18, idx: [1, 2, 3] }))], ['140831', klar(hit({ distance: 22, idx: [2, 3, 4] }))]], alla);
    expect(r.vagar).toHaveLength(1);
    expect(r.vagar[0].agare).toBe('140830');            // närmast
    expect(r.vagar[0].delar).toEqual(['140830', '140831']);
    expect(r.vagar[0].linjer).toHaveLength(1);           // samma OSM-väg → en linje
    expect(r.vagar[0].linjer[0]).toEqual([V538[1], V538[2], V538[3], V538[4]]);   // unionen av delarnas nära noder, i vägens ordning
    expect(r.agareAv.get('140830')).toHaveLength(1);
    expect(r.agareAv.has('140831')).toBe(false);          // den andra delen får ingen ⚠
  });

  it('samma väg i flera OSM-sträckor (en per vägbit) är fortfarande EN väg men en linje per bit', () => {
    const bit2: LatLon[] = [0, 1, 2].map((i) => ({ lat: 56.31 + i * 0.0001, lon: 14.46 }));
    const r = samlaVagvarningar([['a', klar(hit({}), hit({ wayId: 101, wayGeom: bit2, nearbyIdx: [0, 1, 2], nearbyGeom: bit2 }))]], alla);
    expect(r.vagar).toHaveLength(1);
    expect(r.vagar[0].linjer).toHaveLength(2);
    expect(r.agareAv.get('a')).toHaveLength(1);
  });

  it('två olika vägar får var sin ⚠ — hos den del som ligger närmast respektive väg', () => {
    const annan = (d: number) => hit({ name: 'Skogsvägen', ref: undefined, wayId: 200, distance: d });
    const r = samlaVagvarningar([['a', klar(hit({ distance: 10 }), annan(60))], ['b', klar(hit({ distance: 40 }), annan(15))]], alla);
    expect(r.vagar).toHaveLength(2);
    expect(r.agareAv.get('a')!.map((v) => v.namn)).toEqual(['Väg 538']);
    expect(r.agareAv.get('b')!.map((v) => v.namn)).toEqual(['Skogsvägen']);
  });

  it('en del som kan visa ⚠ (en markör) går före en som inte kan (Vidas ojusterade del), även när den ligger längre bort', () => {
    const r = samlaVagvarningar([['vida-td:9772:0', klar(hit({ distance: 5 }))], ['140830', klar(hit({ distance: 30 }))]], (id) => !id.startsWith('vida-td:'));
    expect(r.vagar[0].agare).toBe('140830');
    // utan någon markör äger den närmaste ändå (den röda vägen ritas, ingen ⚠)
    const r2 = samlaVagvarningar([['vida-td:a', klar(hit({ distance: 5 }))], ['vida-td:b', klar(hit({ distance: 30 }))]], () => false);
    expect(r2.vagar[0].agare).toBe('vida-td:a');
  });

  it('lika avstånd ger alltid samma ägare (lägsta id) — ingen hoppande ⚠ mellan renderingar', () => {
    const a = samlaVagvarningar([['140832', klar(hit({}))], ['140830', klar(hit({}))]], alla);
    const b = samlaVagvarningar([['140830', klar(hit({}))], ['140832', klar(hit({}))]], alla);
    expect(a.vagar[0].agare).toBe('140830');
    expect(b.vagar[0].agare).toBe('140830');
  });

  it('räknar bara klara kontroller; en kontroll som laddar eller felade ger ingen väg', () => {
    const r = samlaVagvarningar([['a', { status: 'loading', roads: [hit({})] }], ['b', { status: 'error', roads: [hit({})] }]], alla);
    expect(r.vagar).toHaveLength(0);
  });

  it('vägens identitet: vägnummer, annars namn, en namnlös väg är sin egen OSM-väg', () => {
    expect(vagNyckel(hit({ ref: 'Rv 25' }))).toBe(vagNyckel(hit({ ref: 'rv25', name: 'Annat namn' })));
    expect(vagNyckel(hit({ ref: undefined, name: 'Bruksvägen' }))).toBe(vagNyckel(hit({ ref: undefined, name: ' bruksvägen ' })));
    expect(vagNyckel(hit({ ref: undefined, name: 'Namnlös väg', wayId: 1 }))).not.toBe(vagNyckel(hit({ ref: undefined, name: 'Namnlös väg', wayId: 2 })));
  });

  it('en träff utan vägens geometri (äldre resultat) ritas som den är', () => {
    const h: VagTraff = { name: 'Väg 538', type: 'secondary', ref: '538', distance: 12, nearbyGeom: [V538[1], V538[2]], closestPoint: V538[1] };
    const r = samlaVagvarningar([['a', klar(h)]], alla);
    expect(r.vagar[0].linjer).toEqual([[V538[1], V538[2]]]);
  });
});
