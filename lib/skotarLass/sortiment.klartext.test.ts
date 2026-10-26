// Sortimentnamn i klartext (Martin 2026-10-26): "Kubb · Alvesta", "Massaved björk", "Talltimmer · Vislanda" — aldrig 305, _V3, 195 1-2, BmavFall.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { klartextNamn, sattSortimentKlass, sortimentDelar, sortimentDimensioner, sortimentVisning } from './sortiment';

afterEach(() => sattSortimentKlass([]));

const KODMARKEN = /_V\d|\b\d{2,}\b|\d-\d|Fall\b|[A-Za-z]+_[A-Za-z]/;

describe('klartextNamn: ur texten när tabellen saknar namnet', () => {
  it.each([
    ['Timmer: Vislanda_195_1-2_V3', 'Timmer · Vislanda'],
    ['Timmer: Tall_V3', 'Talltimmer'],
    ['Kubb: Tall_V3', 'Tallkubb'],
    ['Massa: BmavFall_V3', 'Massaved björk'],
    ['Massa: Gran_V3', 'Massaved gran'],
    ['Ved markägare', 'Ved markägare'],
    ['Massa: HemvedFall_V3', 'Ved markägare'],
  ])('%s → %s', (indata, ut) => { expect(klartextNamn(indata)).toBe(ut); });

  it('ett rent ord utan känd grupp visas som det är; en kod blir aldrig synlig', () => {
    expect(klartextNamn('Grovbok')).toBe('Grovbok');
    expect(klartextNamn('305 17')).toBe('Övrigt sortiment');
    expect(klartextNamn('')).toBe('');
  });
});

describe('sortimentVisning: grupp och destination ur sortimentstabellen', () => {
  it('"Kubb · Alvesta" ur tabellen — koden 305 syns aldrig', () => {
    sattSortimentKlass([{ namn: 'Kubb: Alvesta_305_V3', grupp: 'Kubb', destination: 'Alvesta' }]);
    expect(sortimentVisning('Kubb: Alvesta_305_V3')).toBe('Kubb · Alvesta');
  });
  it('"Talltimmer · Vislanda" och "Massaved björk"', () => {
    sattSortimentKlass([
      { namn: 'Timmer: Vislanda Tall_V3', grupp: 'Timmer', destination: 'Vislanda' },
      { namn: 'Massa: BmavFall_V3', grupp: 'Massaved', destination: null },
    ]);
    expect(sortimentVisning('Timmer: Vislanda Tall_V3')).toBe('Talltimmer · Vislanda');
    expect(sortimentVisning('Massa: BmavFall_V3')).toBe('Massaved björk');
  });
  it('saknas destinationen visas gruppen ("Kubb"), aldrig koden', () => {
    sattSortimentKlass([{ namn: 'Kubb: 305', grupp: 'Kubb', destination: null }]);
    expect(sortimentVisning('Kubb: 305')).toBe('Kubb');
  });
  it('samma namn på flera maskiner: raden med mest information gäller', () => {
    sattSortimentKlass([
      { namn: 'Kubb: Alvesta_305_V3', grupp: null, destination: null },
      { namn: 'Kubb: Alvesta_305_V3', grupp: 'Kubb', destination: 'Alvesta' },
    ]);
    expect(sortimentVisning('Kubb: Alvesta_305_V3')).toBe('Kubb · Alvesta');
  });
  it('två nivåer ur samma namn: sortimentet och mottagaren', () => {
    sattSortimentKlass([{ namn: 'Kubb: Alvesta_305_V3', grupp: 'Kubb', destination: 'Alvesta' }]);
    expect(sortimentDelar('Kubb: Alvesta_305_V3')).toEqual({ sortiment: 'Kubb', mottagare: 'Alvesta' });
    expect(sortimentDelar('Massa: BmavFall_V3')).toEqual({ sortiment: 'Massaved björk', mottagare: null });
  });
  it('inget namn i någon tillstånd innehåller kodmärken', () => {
    const namn = ['Timmer: Vislanda_195_1-2_V3', 'Kubb: Alvesta_305_V3', 'Massa: BmavFall_V3', 'Timmer: Tall_V3', 'Energi: Engved_509', 'Unclassified', 'Kubb: 305', 'Timmer: Vislanda_Tall_kort_V3'];
    for (const n of namn) expect(sortimentVisning(n), n).not.toMatch(KODMARKEN);
  });
});

// ── Sortimenten i prod 2026-10-26 (vy_sortiment_klass: namn|grupp|destination|kundkoder) ────────────────────────────────────────────────────────
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const PROD = readFileSync(join(__dirname, '__fixtures__', 'sortiment_prod_2026-10-26.txt'), 'utf8').trim().split('\n')
  .map((l) => { const [namn, grupp, destination, kod] = l.split('|'); return { namn, grupp: grupp || null, destination: destination || null, kod: kod || '' }; });

describe('prod-sortimenten: Alvesta-kubben och sortiment som annars får samma text', () => {
  beforeEach(() => sattSortimentKlass(PROD));

  it('Kubb 275 = tall och Kubb 305 = gran, i alla namnvarianter', () => {
    for (const n of ['Alvesta275_V3', 'Kubb: Alvesta275', 'Kubb: Alvesta275_V3']) expect(sortimentVisning(n), n).toBe('Tallkubb · Alvesta');
    for (const n of ['Alvesta305', 'Alvesta305_V3', 'Kubb: Alvesta305', 'Kubb: Alvesta305_V3']) expect(sortimentVisning(n), n).toBe('Grankubb · Alvesta');
  });
  it('trädslag först, sedan längd: samma text ger ett tillägg (3 m, 1,95 m, 4,94 m), aldrig koden', () => {
    expect(sortimentVisning('Massa: BmavFall_V3')).toBe('Massaved björk');
    expect(sortimentVisning('Massaved: Bjork mav3m')).toBe('Massaved björk 3 m');
    expect(sortimentVisning('Energi: EngvedFallGran_V3')).toBe('Energived gran');
    expect(sortimentVisning('Energi: Engved3mGran_V3')).toBe('Energived gran 3 m');
    expect(sortimentVisning('Timmer: Vislanda_195_1-2_V3')).toBe('Timmer 1,95 m · Vislanda');
    expect(sortimentVisning('Vislanda 1-2')).toBe('Timmer · Vislanda');   // kvalitet läggs bara till där den skiljer sorterna åt
    expect(sortimentVisning('Urshult Gran 494_V3')).toBe('Grantimmer · Urshult');
    expect(sortimentVisning('Urshult 494_V3')).toBe('Timmer 4,94 m · Urshult');
    expect(sortimentVisning('Timmer: Hästveda 195 kv1_V3')).toBe('Timmer kv 1 · Hästveda');
  });
  it('sortiment med eget namn heter det, inte bara "Timmer"', () => {
    for (const [n, t] of [['Timmer: Stamblock', 'Stamblock'], ['Timmer: Karbenning', 'Karbenning'], ['Timmer: Stödlängd_V3', 'Stödlängd · Vislanda'], ['Kortlängd', 'Kortlängd'], ['Timmer: KärstimmerEk_V3', 'Kärstimmer ek']]) expect(sortimentVisning(n), n).toBe(t);
  });
  it('Utan sortiment (Unclassified/Unspecified) får inget tillägg', () => {
    expect(sortimentVisning('Unspecified')).toBe('Utan sortiment');
    expect(sortimentVisning('Unclassified')).toBe('Utan sortiment');
  });
  it('INGEN text i hela prod-listan innehåller en kod (_V3, 305, 5090, BmavFall, 261-VAL …)', () => {
    const KOD = /_V\d|\bV3\b|\b\d{4,}\b|\b(?:[1-5]\d\d)\b(?! m)|\d-[A-Z]{2,}|Fall\b/;
    for (const r of PROD) expect(sortimentVisning(r.namn), r.namn).not.toMatch(KOD);
  });
  it('olika sortiment får aldrig samma text när något skiljer dem (trädslag, längd, kvalitet, övrigt) — kvarstår bara de som saknar skillnad i namnet', () => {
    const per = new Map<string, Set<string>>();
    for (const r of PROD) {
      const t = sortimentVisning(r.namn);
      const dim = JSON.stringify(sortimentDimensioner(r.namn, r.grupp ?? (r.destination ? 'Timmer' : null)));
      per.set(t, (per.get(t) ?? new Set()).add(dim));
    }
    // En text får bara höra till EN uppsättning dimensioner: har två sorter olika längd/kvalitet/övrigt måste texten visa det.
    for (const [t, dims] of per) expect(dims.size, t).toBe(1);
  });
});
