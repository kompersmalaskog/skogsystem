import { describe, it, expect } from 'vitest';
import {
  byggSortimentVy, byggPrisVy, byggRattaVy, snyggtNamn, datumIOrd, ord,
} from './granskningVy';
import { raknaSortiment, type SortimentRad } from '@/lib/ekonomi/sortimentAntal';

// FACIT ur prod 2026-10-25. Samma rader som lib/ekonomi/sortimentAntal.test.ts
// — går den sönder är det räkningen som ändrats, inte vyn.

const rad = (namn: string, kundkod: string | null, m3: number): SortimentRad =>
  ({ sortiment_id: namn, namn, kundkod, volym_m3sub: m3 });

/** toLocaleString('sv-SE') ger hårda mellanslag i tusental — testet jämför tecken. */
const txt = (s: string | null) => s?.replace(/[  ]/g, ' ') ?? s;

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

/** Prislistans sats som gäller: sex ingår, 2 kr per extra, från 3 juni 2025. */
const SATS = { grundantal: 6, krPerExtra: 2, giltigFran: '2025-06-03' };

const sortiment = (rader: SortimentRad[], over: Partial<{ anvant: number; manuellt: boolean }> = {}) => {
  const rakning = raknaSortiment(rader);
  return { rakning, anvant: over.anvant ?? rakning.antal, manuellt: over.manuellt ?? false, ...SATS };
};

describe('byggSortimentVy', () => {
  it('Brokamåla: sex ingår, inget tillägg — det SJUNDE skulle gett 2 kr', () => {
    const v = byggSortimentVy({ g: sortiment(BROKAMALA), volym: 2186.79, sortKr: 0 });
    expect(v.svar).toBe('6');
    expect(v.mening).toBe('Sex ingår i priset. Trakten har precis sex, så det blir inget tillägg.');
    expect(v.pengar).toBe('Tillägget är 0 kr på den här trakten.');
    expect(v.prislistaRad).toBe('Sex ingår · 2,00 kr per extra · gäller från 3 juni 2025');
    expect(v.manuelltRad).toBeNull();
  });

  it('sju sortiment ger tillägget, och kronorna står i klartext', () => {
    const v = byggSortimentVy({
      g: { ...sortiment(BROKAMALA), anvant: 7 }, volym: 2186.79, sortKr: 2,
    });
    expect(v.mening).toBe('Sex ingår i priset. Det sjunde ger 2,00 kronor extra på varje kubik.');
    expect(txt(v.pengar)).toBe('4 374 kr på trakten · tillägget går till skotaren');
  });

  it('två över grundantalet skrivs i plural', () => {
    const v = byggSortimentVy({
      g: { ...sortiment(BROKAMALA), anvant: 8 }, volym: 1000, sortKr: 4,
    });
    expect(v.mening).toBe('Sex ingår i priset. De två därutöver ger 4,00 kronor extra på varje kubik.');
  });

  it('under grundantalet säger varför det inte blir något tillägg', () => {
    const v = byggSortimentVy({
      g: { ...sortiment(BROKAMALA), anvant: 4 }, volym: 1000, sortKr: 0,
    });
    expect(v.mening).toBe('Sex ingår i priset. Trakten har fyra, så det blir inget tillägg.');
  });

  it('listan säger både vad som räknas och vad som inte gör det — med skäl', () => {
    const v = byggSortimentVy({ g: sortiment(BROKAMALA), volym: 2186.79, sortKr: 0 });
    expect(v.raknade.map(r => r.namn)).toEqual([
      'Timmer Hästveda 195 kv1', 'Massa BmavFall', 'Kubb Alvesta305',
      'Energi Engved3mGran', 'Massa BjörkmavFall', 'Massa HemvedFall',
    ]);
    expect(v.ejRaknade).toEqual([
      { namn: 'Energi AvkapGran', under: 'Avkap är spill, inget du apterar mot', volym: 3.5 },
      { namn: 'Unclassified', under: 'Maskinen skrev inget sortiment på dem', volym: 2.7 },
    ]);
  });

  it('två namn som räknas som ETT sortiment säger det på raden', () => {
    const v = byggSortimentVy({ g: sortiment(BROKAMALA), volym: 2186.79, sortKr: 0 });
    const timmer = v.raknade.find(r => r.namn.includes('Hästveda'))!;
    expect(timmer.under).toBe('Timmer · räknas ihop med Timmer Hästveda 195 kv2');
    expect(timmer.volym).toBeCloseTo(1380.9, 1);
    const energi = v.raknade.find(r => r.namn.includes('Engved'))!;
    expect(energi.under).toBe('Energived · räknas ihop med Energi Engved3mÖvLöv');
  });

  it('ett antal satt för hand SÄGS, med appens eget tal bredvid', () => {
    const v = byggSortimentVy({
      g: sortiment(BROKAMALA, { anvant: 4, manuellt: true }), volym: 1000, sortKr: 0,
    });
    expect(v.manuelltRad).toBe('Antalet är satt för hand till 4. Appen räknar 6.');
  });

  it('utan sats i prislistan påstås ingenting om priset', () => {
    const r = raknaSortiment(BROKAMALA);
    const v = byggSortimentVy({
      g: { rakning: r, anvant: r.antal, manuellt: false, grundantal: null, krPerExtra: null, giltigFran: null },
      volym: 1000, sortKr: null,
    });
    expect(v.mening).toContain('Ingen sortimentssats gäller');
    expect(v.prislistaRad).toBeNull();
    expect(v.pengar).toBeNull();
  });
});

describe('byggPrisVy', () => {
  const prislista = { medelstam: 0.69, klass: 0.6, total: 100, skordare: 58, skotare: 58.5 };
  const poster = [
    { etikett: 'Krönt', belopp: 1.5, mottagare: 'skordare' as const },
    { etikett: 'Storlek', belopp: -1, mottagare: 'delas' as const },
    { etikett: 'Terräng', belopp: 2, mottagare: 'skotare' as const },
    { etikett: 'Sortiment', belopp: 2, mottagare: 'skotare' as const },
  ];
  const g = { ...sortiment(BROKAMALA, { anvant: 7 }) };

  it('raderna går att räkna ihop till totalen', () => {
    const v = byggPrisVy({ prislista, tillaggsposter: poster, avstandKr: 12, volym: 2186.79, prisdatum: '2026-07-31', sortiment: g });
    expect(v.rader.reduce((s, r) => s + r.belopp, 0)).toBeCloseTo(116.5, 2);
    expect(v.total).toBeCloseTo(116.5, 2);
    expect(v.rader.map(r => r.etikett)).toEqual([
      'Grundpris, klass 0,60', 'Krönt', 'Traktstorlek', 'Terräng', 'Sortiment, 7 st', 'Skotningsavstånd',
    ]);
  });

  it('varje rad säger var pengarna hör hemma', () => {
    const v = byggPrisVy({ prislista, tillaggsposter: poster, avstandKr: 12, volym: 2186.79, prisdatum: '2026-07-31', sortiment: g });
    const under = Object.fromEntries(v.rader.map(r => [r.etikett, r.under]));
    expect(under['Grundpris, klass 0,60']).toBe('Medelstam 0,69 m³fub per stam');
    expect(under['Krönt']).toBe('Hela till skördaren');
    expect(txt(under['Traktstorlek'])).toBe('2 186,8 m³fub · delas lika');
    expect(under['Sortiment, 7 st']).toBe('6 ingår · 2,00 kr per extra');
  });

  it('en post på noll kronor ritas inte', () => {
    const v = byggPrisVy({
      prislista, tillaggsposter: [...poster, { etikett: 'Terräng', belopp: 0, mottagare: 'skotare' as const }],
      avstandKr: 0, volym: 1000, prisdatum: '2026-07-31', sortiment: g,
    });
    expect(v.rader.some(r => r.belopp === 0)).toBe(false);
    expect(v.rader.some(r => r.etikett === 'Skotningsavstånd')).toBe(false);
  });

  it('utan prislista räknas ingen total fram', () => {
    const v = byggPrisVy({ prislista: null, tillaggsposter: null, avstandKr: null, volym: 1000, prisdatum: '2026-07-31', sortiment: g });
    expect(v.total).toBeNull();
    expect(v.mening).toContain('Ingen ackordsprislista');
    expect(v.rader).toEqual([]);
  });
});

describe('byggRattaVy', () => {
  const g = sortiment(BROKAMALA, { anvant: 7 });

  it('7 → 6 tar bort tillägget och summan sjunker med exakt Δ × skotarens antal', () => {
    const v = byggRattaVy({ g, nyttAntal: 6, nuKr: 2, nuSumma: 254761, skotarAntal: 2186.79, skotarPris: 58.5 });
    expect(v.nyKr).toBe(0);
    expect(v.andrat).toBe(true);
    expect(Math.round(v.nySumma!)).toBe(250387);
    expect(txt(v.mening)).toBe('4 374 kr mindre. Skotarens pris går från 58,50 till 56,50 per m³fub.');
  });

  it('samma antal igen ändrar ingenting', () => {
    const v = byggRattaVy({ g, nyttAntal: 7, nuKr: 2, nuSumma: 254761, skotarAntal: 2186.79, skotarPris: 58.5 });
    expect(v.andrat).toBe(false);
    expect(v.mening).toBe('');
    expect(v.nySumma).toBeCloseTo(254761, 2);
  });

  it('ett byte under grundantalet ändrar priset lika lite som appen säger', () => {
    const v = byggRattaVy({ g: sortiment(BROKAMALA, { anvant: 5 }), nyttAntal: 4, nuKr: 0, nuSumma: 100000, skotarAntal: 1000, skotarPris: 50 });
    expect(v.nyKr).toBe(0);
    expect(v.mening).toBe('Priset ändras inte — båda antalen ligger inom det som ingår.');
  });

  it('utan skotarrad visas INGEN summa — aldrig ett påhittat tal', () => {
    const v = byggRattaVy({ g, nyttAntal: 6, nuKr: 2, nuSumma: 254761, skotarAntal: null, skotarPris: null });
    expect(v.nySumma).toBeNull();
    expect(v.mening).toBe('');
  });
});

describe('texthjälparna', () => {
  it('snyggtNamn tar bort versionssuffixet och kolonet, inget annat', () => {
    expect(snyggtNamn('Massa: BmavFall_V3')).toBe('Massa BmavFall');
    expect(snyggtNamn('Talltimmer: Vislanda kort V3')).toBe('Talltimmer Vislanda kort');
    expect(snyggtNamn('Unclassified')).toBe('Unclassified');
  });

  it('datum skrivs i ord', () => {
    expect(datumIOrd('2025-06-03')).toBe('3 juni 2025');
    expect(datumIOrd(null)).toBeNull();
  });

  it('tal i ord upp till tolv, siffra därefter', () => {
    expect(ord(6, true)).toBe('Sex');
    expect(ord(13)).toBe('13');
  });
});
