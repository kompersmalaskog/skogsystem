import { describe, it, expect } from 'vitest';
import { BYTE_TEXT, KONTROLL_TEXT, TRYCK_TEXT, andringarUr, forstaDagEfter, galler, klassAv, kurvaText, punktAv, senasteTryck, tolkaMarkor } from './forslagMarkorer';

describe('markörtexter — det appen skriver läses tillbaka', () => {
  it('kurvan: skriv → läs', () => {
    expect(kurvaText('Tall', '200', -3)).toBe('Kurvan ändrad: Tall 200 mm −3 mm');
    expect(tolkaMarkor(kurvaText('Tall', '200', -3))).toEqual({ slag: 'kurva', tradslag: 'Tall', klass: '200-249', mm: -3 });
    expect(tolkaMarkor(kurvaText('Gran', '300+', 2))).toEqual({ slag: 'kurva', tradslag: 'Gran', klass: '300+', mm: 2 });
    expect(tolkaMarkor(kurvaText('GRAN', '100', -2))).toMatchObject({ tradslag: 'Gran', klass: '<150', mm: -2 });
  });
  it('tryck, byte och kontroll', () => {
    expect(tolkaMarkor(TRYCK_TEXT).slag).toBe('tryck');
    expect(tolkaMarkor(BYTE_TEXT).slag).toBe('byte');
    expect(tolkaMarkor(KONTROLL_TEXT).slag).toBe('kontroll');
  });
  it('förarnas egna ord om tryck räknas som tryck (så som markören från 18 juli lyder)', () => {
    expect(tolkaMarkor('Höjt trycket på knivar och hjul').slag).toBe('tryck');
    expect(tolkaMarkor('höjde trycket till 400 mm').slag).toBe('tryck');
  });
  it('allt annat är en markör men ingen ändring som flyttar fönstret', () => {
    expect(tolkaMarkor('Bytt hydraulolja').slag).toBe('annan');
    expect(tolkaMarkor('Kurvan ändrad: Tall 777 mm −3 mm').slag).toBe('annan');
  });
  it('punkterna 100/150/200/250/300+ hör till sina grovlekar', () => {
    expect(punktAv('<150')).toBe('100');
    expect(klassAv('250')).toBe('250-299');
    expect(klassAv('77')).toBeNull();
  });
});

describe('andringarUr', () => {
  const atgarder = [
    { datum: '2026-07-18', text: TRYCK_TEXT },
    { datum: '2026-09-01', text: kurvaText('Gran', '100', -2) },
    { datum: '2026-09-02', text: KONTROLL_TEXT },
    { datum: '2026-09-03', text: 'Bytt hydraulolja' },
    { datum: '2026-09-04', text: BYTE_TEXT },
  ];
  it('tryck, byte och kurva är ändringar; kontroll och annat är det inte', () => {
    const a = andringarUr({ atgarder, historik: [] });
    expect(a.map(x => x.slag)).toEqual(['tryck', 'kurva', 'byte']);
    expect(a[1]).toMatchObject({ tradslag: 'Gran', klass: '<150', samtidig: true });
  });
  it('historiken: omkalibrering gäller hela maskinen, en diameterkalibrering med värde ≠ 0 trädslagets kurva, 0 och längd ingenting', () => {
    const a = andringarUr({
      atgarder: [],
      historik: [
        { datum: '2026-03-07 14:44:31+00', tradslag: 'Gran', typ: 'diameter', dia_justering_mm: 0, omkalibrering: true },
        { datum: '2026-10-07 07:33:28+00', tradslag: 'Tall', typ: 'diameter', dia_justering_mm: -1, omkalibrering: false },
        { datum: '2026-10-08', tradslag: 'Tall', typ: 'diameter', dia_justering_mm: 0, omkalibrering: false },
        { datum: '2026-10-09', tradslag: 'Tall', typ: 'langd', dia_justering_mm: null, omkalibrering: false },
      ],
    });
    expect(a).toEqual([
      { datum: '2026-03-07', slag: 'omkalibrering', tradslag: null, klass: null, samtidig: false },
      { datum: '2026-10-07', slag: 'kalibrering', tradslag: 'Tall', klass: null, samtidig: false },
    ]);
  });
  it('trädslaget från historiken heter som i resten av appen (Bjork → Björk)', () => {
    const a = andringarUr({ atgarder: [], historik: [{ datum: '2026-06-06', tradslag: 'Bjork', typ: 'diameter', dia_justering_mm: 2, omkalibrering: false }] });
    expect(a[0].tradslag).toBe('Björk');
  });
});

describe('fönstrets början', () => {
  it('en åtgärd i appen: samma dag räknas efter; en kalibrering: dagen efter', () => {
    expect(forstaDagEfter({ datum: '2026-10-10', slag: 'tryck', tradslag: null, klass: null, samtidig: true })).toBe('2026-10-10');
    expect(forstaDagEfter({ datum: '2026-10-10', slag: 'kalibrering', tradslag: 'Tall', klass: null, samtidig: false })).toBe('2026-10-11');
    expect(forstaDagEfter({ datum: '2026-10-31', slag: 'omkalibrering', tradslag: null, klass: null, samtidig: false })).toBe('2026-11-01');
  });
  it('galler: trädslag och grovlek', () => {
    const a = { datum: 'x', slag: 'kurva' as const, tradslag: 'Tall', klass: '200-249' as const, samtidig: true };
    expect(galler(a, 'Tall', '200-249')).toBe(true);
    expect(galler(a, 'Tall', '250-299')).toBe(false);
    expect(galler(a, 'Gran', '200-249')).toBe(false);
  });
  it('senasteTryck: tryck och byte, nyast', () => {
    const a = andringarUr({ atgarder: [{ datum: '2026-07-18', text: TRYCK_TEXT }, { datum: '2026-09-04', text: BYTE_TEXT }, { datum: '2026-09-09', text: kurvaText('Gran', '100', -2) }], historik: [] });
    expect(senasteTryck(a)?.datum).toBe('2026-09-04');
    expect(senasteTryck([])).toBeNull();
  });
});
