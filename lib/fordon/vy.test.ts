import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { byggFordonVy, byggListVy, fordonsKontroller, nastaDatum } from './vy';
import { kontrolltyperForResurs } from '@/lib/kontrolltyper';
import type { Resurs } from '@/lib/kontroller-format';

// Idag = 2026-11-06 (lokal tid). berakna räknar dagar mot new Date().
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 10, 6, 12, 0, 0)); });
afterEach(() => { vi.useRealTimers(); });

function k(id: string, typ: string, nasta_forfall: string | null, extra: Record<string, unknown> = {}) {
  return {
    id, typ, aktiv: true, nasta_forfall, intervall_manader: null, intervall_timmar: null, intervall_km: null,
    senast_utford: null, senast_matarstallning: null, nasta_matarvarde: null, ...extra,
  };
}
function fordon(id: string, namn: string, typ: Resurs['typ'], kontroll: any[], extra: Partial<Resurs> = {}): Resurs {
  return { id, namn, typ, regnr: null, marke: null, modell: null, arsmodell: null, matarstallning: null, anteckning: null, kontroll, ...extra };
}

describe('Fordon — vilka kontroller som hör hit', () => {
  it('service visas aldrig, och skapas inte för nya fordon', () => {
    const r = fordon('a', 'Volvo', 'bil', [k('1', 'besiktning', '2027-01-01'), k('2', 'service', '2026-11-01')]);
    expect(fordonsKontroller(r).map(x => x.typ)).toEqual(['besiktning']);
    expect(kontrolltyperForResurs('bil').map(x => x.nyckel)).toEqual(['besiktning', 'forsakring']);
    expect(kontrolltyperForResurs('maskin').map(x => x.nyckel)).toEqual(['brandskydd', 'forsakring']);
    expect(kontrolltyperForResurs('cistern').map(x => x.nyckel)).toEqual(['cisternkontroll', 'brandskydd']);
  });

  it('en avstängd kontroll räknas inte', () => {
    const r = fordon('a', 'Volvo', 'bil', [k('1', 'besiktning', '2026-10-01', { aktiv: false })]);
    expect(byggListVy([r]).forsenade).toEqual([]);
  });
});

describe('Listan', () => {
  const lista = [
    fordon('a', 'Volvo FH', 'lastbil', [k('1', 'besiktning', '2026-10-25'), k('2', 'forsakring', '2026-11-20')]),
    fordon('b', 'Kilafors', 'slap', [k('3', 'besiktning', '2027-05-14')]),
    fordon('c', 'Dieseltanken', 'cistern', [k('4', 'cisternkontroll', null)]),
  ];

  it('svaret är antalet försenade, med snart på raden under', () => {
    const vy = byggListVy(lista);
    expect(vy.svar).toEqual({ slag: 'tal', tal: 1, text: 'behöver göras nu', rad: '1 till snart' });
    expect(vy.forsenade.map(p => p.kontrollId)).toEqual(['1']);
    expect(vy.snart.map(p => p.kontrollId)).toEqual(['2']);
    expect(vy.saknar.map(p => p.kontrollId)).toEqual(['4']);
    expect(vy.senare.map(p => p.kontrollId)).toEqual(['3']);
  });

  it('alla fordon grupperas per sort och bär sitt sämsta läge i ord', () => {
    const vy = byggListVy(lista);
    expect(vy.grupper.map(g => g.label)).toEqual(['Bilar och lastbilar', 'Släp', 'Tankar']);
    expect(vy.grupper[0].fordon[0].status).toEqual({ ord: 'Försenad', ton: 'rod' });
    expect(vy.grupper[1].fordon[0].status).toBeNull(); // i ordning: inget ord
    expect(vy.grupper[2].fordon[0].status).toEqual({ ord: 'Datum saknas', ton: 'dampad' });
  });

  it('inget försenat och inget snart: "Allt är i ordning" och nästa datum', () => {
    const vy = byggListVy([lista[1]]);
    expect(vy.svar).toEqual({ slag: 'rad', rubrik: 'Allt är i ordning', rad: 'Nästa: besiktning Kilafors 14 maj' });
  });

  it('bara snart: talet är snart', () => {
    const vy = byggListVy([fordon('a', 'Volvo', 'bil', [k('1', 'forsakring', '2026-11-20')])]);
    expect(vy.svar).toEqual({ slag: 'tal', tal: 1, text: 'snart dags', rad: null });
  });

  it('inga fordon och inga datum säger det', () => {
    expect(byggListVy([]).svar).toEqual({ slag: 'rad', rubrik: 'Inga fordon än', rad: null });
    expect(byggListVy([lista[2]]).svar.slag).toBe('rad');
    expect((byggListVy([lista[2]]).svar as any).rubrik).toBe('Inga datum inlagda');
  });
});

describe('Ett fordon', () => {
  it('försenad kontroll är svaret, i ord', () => {
    const vy = byggFordonVy(fordon('a', 'Volvo', 'bil', [k('1', 'besiktning', '2026-10-25'), k('2', 'forsakring', '2027-01-01')]));
    expect(vy.svar).toEqual({ rubrik: 'Besiktning är försenad', rad: 'Skulle gjorts 25 oktober 2026', avvikelse: true });
    expect(vy.kontroller.map(x => x.titel)).toEqual(['Besiktning', 'Försäkring']);
    expect(vy.kontroller[0].under).toBe('25 oktober 2026 · 12 dagar sen');
  });

  it('snart: "Försäkring om 14 dagar"', () => {
    const vy = byggFordonVy(fordon('a', 'Volvo', 'bil', [k('1', 'forsakring', '2026-11-20')]));
    expect(vy.svar.rubrik).toBe('Försäkring om 14 dagar');
    expect(vy.kontroller[0].status).toEqual({ ord: 'Snart', ton: 'orange' });
  });
});

describe('Registrera — nästa datum', () => {
  it('räknas ur intervallet', () => {
    expect(nastaDatum({ intervall_manader: 12 }, '2026-11-06')).toBe('2027-11-06');
  });
  it('utan intervall måste nästa datum skrivas', () => {
    expect(nastaDatum({ intervall_manader: null }, '2026-11-06')).toBeNull();
  });
});

describe('laggTillManader — dagen blir aldrig fel i svensk tid', () => {
  it('31 januari + 1 månad = sista februari, 6 nov + 12 = 6 nov', async () => {
    const { laggTillManader } = await import('@/lib/status');
    expect(laggTillManader('2026-01-31', 1)).toBe('2026-02-28');
    expect(laggTillManader('2026-11-06', 12)).toBe('2027-11-06');
    expect(laggTillManader('2026-03-29', 1)).toBe('2026-04-29'); // över sommartidsbytet
  });
});
