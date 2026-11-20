import { describe, it, expect } from 'vitest';
import {
  dagMan, delaUppLista, kortSpann, pagar, procentSomSummerar, senast, sortimentGrupper, sortimentNyckel, traktSpann, veckodagDag,
} from './gallringVy';
import type { GallringRad, SortimentAndel } from './gallring';

function rad(over: Partial<GallringRad>): GallringRad {
  return {
    vo: '1', namn: 'Trakt', objektIds: [], maskiner: [], forare: [], forstaDatum: '2026-10-01', sistaDatum: '2026-10-05',
    antalDagar: 3, volymM3fub: 10, stammar: 100, tradslag: [], arealHa: null, skordningAvslutad: '2026-10-05', diameter: null,
    ...over,
  };
}

describe('pågår eller klar', () => {
  it('pågår så länge maskinen inte rapporterat slutdatum', () => {
    expect(pagar({ skordningAvslutad: null })).toBe(true);
    expect(pagar({ skordningAvslutad: '2026-10-12' })).toBe(false);
  });

  it('delar listan: pågående först, de klara per månad senaste först, inga tomma delar', () => {
    const rader = [
      rad({ vo: 'a', sistaDatum: '2026-10-22', skordningAvslutad: null }),
      rad({ vo: 'b', sistaDatum: '2026-10-12' }),
      rad({ vo: 'c', sistaDatum: '2026-10-05' }),
      rad({ vo: 'd', sistaDatum: '2026-09-16' }),
    ];
    const { pagaende, manader } = delaUppLista(rader);
    expect(pagaende.map((r) => r.vo)).toEqual(['a']);
    expect(manader.map((m) => [m.rubrik, m.rader.map((r) => r.vo)])).toEqual([
      ['Oktober', ['b', 'c']],
      ['September', ['d']],
    ]);
    expect(delaUppLista([rad({})]).pagaende).toEqual([]);
  });
});

describe('datum', () => {
  it('skriver samma månad en gång och annars båda', () => {
    expect(kortSpann({ forstaDatum: '2026-10-12', sistaDatum: '2026-10-20' })).toBe('12–20 okt');
    expect(kortSpann({ forstaDatum: '2026-09-28', sistaDatum: '2026-10-03' })).toBe('28 sep – 3 okt');
    expect(kortSpann({ forstaDatum: '2026-10-12', sistaDatum: '2026-10-12' })).toBe('12 okt');
    expect(kortSpann({ forstaDatum: null, sistaDatum: null })).toBe('Datum saknas');
  });

  it('tar med året bara när trakten ligger ett annat år', () => {
    expect(traktSpann({ forstaDatum: '2026-10-12', sistaDatum: '2026-10-20' }, 2026)).toBe('12–20 okt');
    expect(traktSpann({ forstaDatum: '2025-12-22', sistaDatum: '2025-12-30' }, 2026)).toBe('22–30 dec 2025');
  });

  it('idag och igår i ord, annars datum', () => {
    expect(senast('2026-10-22', '2026-10-22')).toBe('idag');
    expect(senast('2026-10-21', '2026-10-22')).toBe('igår');
    expect(senast('2026-09-30', '2026-10-01')).toBe('igår');
    expect(senast('2026-10-20', '2026-10-22')).toBe('20 okt');
    expect(dagMan('2026-01-05')).toBe('5 jan');
  });

  it('veckodag på kalenderdagen', () => {
    expect(veckodagDag('2026-10-22')).toBe('tor 22 okt');
    expect(veckodagDag('2026-10-25')).toBe('sön 25 okt');
  });
});

describe('sortiment → fyra grupper', () => {
  const s = (grupp: string | null, namn: string, volym: number, stockar = 1): SortimentAndel => ({ grupp, namn, volym, stockar });

  it('känner igen gruppernas olika stavningar (prod 2026-10-22)', () => {
    expect(sortimentNyckel(s('Massa', 'BmavFall_V3', 1))).toBe('massa');
    expect(sortimentNyckel(s('Massaved', 'Bjork mav3m', 1))).toBe('massa');
    expect(sortimentNyckel(s('kubb', 'BERGoBERG', 1))).toBe('kubb');
    expect(sortimentNyckel(s(null, 'JGA Kubb', 1))).toBe('kubb');
    expect(sortimentNyckel(s('Övrigt Sågbart', 'Piggsmåla', 1))).toBe('kubb');
    expect(sortimentNyckel(s('Tall Timmer', 'Urshult', 1))).toBe('timmer');
    expect(sortimentNyckel(s('Talltimmer', 'Vislanda', 1))).toBe('timmer');
    expect(sortimentNyckel(s('Klentimmer', 'JGA KTT', 1))).toBe('timmer');
    expect(sortimentNyckel(s('Energi', 'AvkapGran_V3', 1))).toBe('ovrigt');
    expect(sortimentNyckel(s(null, 'Unspecified', 1))).toBe('ovrigt');
  });

  it('summerar per grupp, mest värt först, utan tomma grupper', () => {
    const g = sortimentGrupper([s('Massa', 'a', 200, 900), s('Kubb', 'b', 30, 80), s('Massaved', 'c', 36, 100), s('Energi', 'd', 24, 40)]);
    expect(g.map((x) => [x.nyckel, x.volym, x.stockar])).toEqual([
      ['kubb', 30, 80], ['massa', 236, 1000], ['ovrigt', 24, 40],
    ]);
  });
});

describe('procent som summerar', () => {
  it('blir alltid 100', () => {
    expect(procentSomSummerar([1, 1, 1])).toEqual([34, 33, 33]);
    expect(procentSomSummerar([36, 236, 24]).reduce((a, b) => a + b)).toBe(100);
    expect(procentSomSummerar([0, 0])).toEqual([0, 0]);
  });
});
