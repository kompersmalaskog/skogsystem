import { describe, it, expect } from 'vitest';
import { raknaSortiment, normaliseraSortimentnamn, type SortimentRad } from './sortimentAntal';

// FACIT ur prod 2026-10-25. Raderna är fakt_sortiment summerad per sortiment,
// berikad ur vy_sortiment_klass — exakt det ackordpriset läser.
//
// Bågskyttebanan är Martins egen handräkning: "7 sortiment — talltimmer,
// grantimmer, tallkubb, grankubb, barrmassa, hemved och energi". Går testet
// sönder är det antingen regeln eller hans räkning som ändrats, och båda
// kräver ett svar från honom innan koden rättas.

const rad = (namn: string, kundkod: string | null, m3: number, id = namn): SortimentRad =>
  ({ sortiment_id: id, namn, kundkod, volym_m3sub: m3 });

const BAGSKYTTEBANAN: SortimentRad[] = [
  rad('Timmer: Vislanda Tall_V3', '011-VVI', 980.2),
  rad('Massa: BmavFall_V3', '100-1', 312.1),
  rad('Timmer: Vislanda_195_1-2_V3', '012-VVI', 195.1),
  rad('Kubb: Alvesta275_V3', '261-VAL', 106.6),
  rad('Massa: HemvedFall_V3', '909-1', 44.9),
  rad('Kubb: Alvesta305_V3', '262-VAL', 34.7),
  rad('Energi: Engved3mGran_V3', '539-1', 11.1),
  rad('Unclassified', null, 1.5),
  rad('Energi: AvkapTall_V3', '431-2', 1.2),
  rad('Energi: AvkapGran_V3', '432-2', 1.0),
];

const BROKAMALA: SortimentRad[] = [
  rad('Timmer: Hästveda 195 kv1_V3', null, 1376.6),
  rad('Massa: BmavFall_V3', '100-1', 403.2),
  rad('Kubb: Alvesta305_V3', '262-VAL', 346.5),
  rad('Energi: Engved3mGran_V3', '539-1', 37.2),
  rad('Massa: BjörkmavFall_V3', '104-1', 10.5),
  rad('Timmer: Hästveda 195 kv2_V3', null, 4.3),
  rad('Massa: HemvedFall_V3', '909-1', 3.9),
  rad('Energi: AvkapGran_V3', '432-2', 3.5),
  rad('Unclassified', null, 2.7),
  rad('Energi: Engved3mÖvLöv_V3', '539-1', 1.2),
];

const STANKELSMALA: SortimentRad[] = [
  rad('Timmer: Vislanda_195_1-2_V3', '012-VVI', 261.0),
  rad('Massa: BmavFall_V3', '100-1', 148.7),
  rad('Kubb: Alvesta305_V3', '262-VAL', 144.2),
  rad('Massa: HemvedFall_V3', '909-1', 49.8),
  rad('Tall Timmer: Urshult 1-4_V3', '011-VUR-2', 11.0),
  rad('Energi: Engved3mGran_V3', '539-1', 3.6),
  rad('Kubb: Alvesta275_V3', '261-VAL', 2.7),
  rad('Unclassified', null, 1.6),
  rad('Energi: AvkapGran_V3', '432-2', 1.5),
  rad('Talltimmer: Vislanda kort V3', '011-VVI-4', 0.7),
  rad('Timmer: Vislanda Tall_V3', '011-VVI', 0.3),
  rad('Timmer: Stödlängd_V3', '012-VVI-4', 0.2),
];

const namnen = (r: ReturnType<typeof raknaSortiment>) => r.raknade.map(s => s.namn);

describe('raknaSortiment — prod som facit', () => {
  it('Bågskyttebanan är 7, precis som Martin räknar för hand', () => {
    const r = raknaSortiment(BAGSKYTTEBANAN);
    expect(r.antal).toBe(7);
    expect(namnen(r)).toEqual([
      'Timmer: Vislanda Tall_V3',
      'Massa: BmavFall_V3',
      'Timmer: Vislanda_195_1-2_V3',
      'Kubb: Alvesta275_V3',
      'Massa: HemvedFall_V3',
      'Kubb: Alvesta305_V3',
      'Energi: Engved3mGran_V3',
    ]);
  });

  it('hemved och energived RÄKNAS — de är sortiment man sorterar ut', () => {
    const r = raknaSortiment(BAGSKYTTEBANAN);
    expect(namnen(r)).toContain('Massa: HemvedFall_V3');
    expect(namnen(r)).toContain('Energi: Engved3mGran_V3');
  });

  it('avkap och stammar utan sortiment räknas inte, men SÄGS', () => {
    const r = raknaSortiment(BAGSKYTTEBANAN);
    expect(r.ejRaknade.map(e => [e.namn, e.skal])).toEqual([
      ['Unclassified', 'utan_sortiment'],
      ['Energi: AvkapTall_V3', 'avkap'],
      ['Energi: AvkapGran_V3', 'avkap'],
    ]);
  });

  it('Brokamåla är 6: kv1 och kv2 är ETT sortiment i två kvalitetsklasser', () => {
    const r = raknaSortiment(BROKAMALA);
    expect(r.antal).toBe(6);
    const timmer = r.raknade.find(s => s.namn.includes('Hästveda'))!;
    expect(timmer.delar).toEqual([
      'Timmer: Hästveda 195 kv1_V3',
      'Timmer: Hästveda 195 kv2_V3',
    ]);
    // Visningsnamnet är den STÖRSTA delen (1 376 m³), inte den vi såg först.
    expect(timmer.namn).toBe('Timmer: Hästveda 195 kv1_V3');
    expect(timmer.volym).toBeCloseTo(1380.9, 1);
  });

  it('samma kundkod är samma sortiment — energived gran och övrigt löv är ett', () => {
    const energi = raknaSortiment(BROKAMALA).raknade.find(s => s.nyckel === '539-1')!;
    expect(energi.delar).toEqual([
      'Energi: Engved3mGran_V3',
      'Energi: Engved3mÖvLöv_V3',
    ]);
    expect(energi.volym).toBeCloseTo(38.4, 1);
  });

  it('Stänkelsmåla är 10 — LÄNGDKLASS slås inte ihop (öppen fråga, se filens huvud)', () => {
    const r = raknaSortiment(STANKELSMALA);
    expect(r.antal).toBe(10);
    expect(namnen(r)).toContain('Timmer: Vislanda Tall_V3');       // 011-VVI
    expect(namnen(r)).toContain('Talltimmer: Vislanda kort V3');   // 011-VVI-4
    expect(namnen(r)).toContain('Timmer: Vislanda_195_1-2_V3');    // 012-VVI
    expect(namnen(r)).toContain('Timmer: Stödlängd_V3');           // 012-VVI-4
  });
});

describe('raknaSortiment — reglerna var för sig', () => {
  it('två skördare ger samma sortiment med var sitt id — det är ETT', () => {
    const r = raknaSortiment([
      rad('Massa: BmavFall_V3', '100-1', 100, 'R64428_100'),
      rad('Massa: BmavFall_V3', '100-1', 50, 'PONS_100'),
    ]);
    expect(r.antal).toBe(1);
    expect(r.raknade[0].volym).toBe(150);
  });

  it('ett sortiment utan volym finns inte på trakten och hamnar i ingen lista', () => {
    const r = raknaSortiment([
      rad('Massa: BmavFall_V3', '100-1', 100),
      rad('Kubb: Alvesta305_V3', '262-VAL', 0),
      rad('Energi: AvkapGran_V3', '432-2', 0),
    ]);
    expect(r.antal).toBe(1);
    expect(r.ejRaknade).toEqual([]);
  });

  it('saknas både kundkod och namn faller den tillbaka på sortiment-id:t', () => {
    const r = raknaSortiment([{ sortiment_id: 'X9', namn: null, kundkod: null, volym_m3sub: 5 }]);
    expect(r.antal).toBe(1);
    expect(r.raknade[0].namn).toBe('X9');
  });

  it('tomma rader ger noll, aldrig ett påhittat tal', () => {
    expect(raknaSortiment([]).antal).toBe(0);
  });
});

describe('normaliseraSortimentnamn', () => {
  it('tar bort versionssuffix och kvalitetsklass', () => {
    expect(normaliseraSortimentnamn('Timmer: Hästveda 195 kv1_V3'))
      .toBe(normaliseraSortimentnamn('Timmer: Hästveda 195 kv2_V3'));
    expect(normaliseraSortimentnamn('Timmer: Hästveda 195 kv1_V3')).toBe('timmer hästveda 195');
  });

  it('slår INTE ihop olika sortiment', () => {
    expect(normaliseraSortimentnamn('Massaved: Barrmav Gran Fall V3'))
      .not.toBe(normaliseraSortimentnamn('Massaved: Mav Björk Fall V3'));
  });
});
