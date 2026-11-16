import { describe, it, expect } from 'vitest';
import {
  byggSortimentVy, byggPrisVy, byggRattaVy, byggTillaggVy, byggAvstandVy,
  snyggtNamn, datumIOrd, ord, heltalTill100, LASS_SYNLIGA,
} from './granskningVy';
import { skotAvstandKr, skotAvstandKrPerM3 } from '@/lib/ekonomi/acord';
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
      { namn: 'Energi AvkapGran', under: 'Avkap är spill, inget du apterar mot', volym: 3.5, tradslag: null },
      { namn: 'Unclassified', under: 'Maskinen skrev inget sortiment på dem', volym: 2.7, tradslag: null },
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

describe('trädslag per sortiment', () => {
  // Bågskyttebanan, som Martin hade uppe: namnet säger "Tall" på ett sortiment
  // och ingenting på de andra. Trädslaget står i datan, inte i namnet.
  const ART = {
    'Timmer: Vislanda Tall_V3': [{ namn: 'Tall', volym: 980.2 }],
    'Massa: BmavFall_V3': [{ namn: 'Gran', volym: 250.0 }, { namn: 'Tall', volym: 153.2 }],
    'Kubb: Alvesta305_V3': [{ namn: 'Gran', volym: 346.5 }],
  };

  const vyMed = (tradslag: any) => byggSortimentVy({
    g: sortiment(BROKAMALA), volym: 2186.79, sortKr: 0, tradslag,
  });

  it('ETT trädslag blir 100 %, flera blir hela procent som summerar till 100', () => {
    const v = vyMed(ART);
    const kubb = v.raknade.find(r => r.namn.includes('Alvesta305'))!;
    expect(kubb.tradslag).toBe('Gran 100 %');
    const massa = v.raknade.find(r => r.namn.includes('BmavFall'))!;
    expect(massa.tradslag).toBe('Gran 62 % · Tall 38 %');
  });

  it('saknas trädslag för en stor del SÄGS det — andelarna ljuger aldrig', () => {
    // Massan är 403,2 m³ men bara 100 m³ har känt trädslag.
    const v = vyMed({ 'Massa: BmavFall_V3': [{ namn: 'Gran', volym: 100 }] });
    const massa = v.raknade.find(r => r.namn.includes('BmavFall'))!;
    expect(massa.tradslag).toBe('Gran 100 % · av 100,0 m³ med känt trädslag');
  });

  it('olästa trädslag ger null, aldrig "Okänt" och aldrig en tom text', () => {
    expect(vyMed(null).raknade.every(r => r.tradslag === null)).toBe(true);
    expect(vyMed({}).raknade.every(r => r.tradslag === null)).toBe(true);
  });

  it('ett sortiment under två id (två maskiner) slås ihop till EN uppdelning', () => {
    const r = raknaSortiment([
      { sortiment_id: 'R64428_100', namn: 'Massa: BmavFall_V3', kundkod: '100-1', volym_m3sub: 100 },
      { sortiment_id: 'PONS_100', namn: 'Massa: BmavFall_V3', kundkod: '100-1', volym_m3sub: 100 },
    ]);
    const v = byggSortimentVy({
      g: { rakning: r, anvant: r.antal, manuellt: false, ...SATS },
      volym: 200, sortKr: 0,
      tradslag: {
        R64428_100: [{ namn: 'Gran', volym: 100 }],
        PONS_100: [{ namn: 'Tall', volym: 100 }],
      },
    });
    expect(v.raknade[0].tradslag).toBe('Gran 50 % · Tall 50 %');
  });
});

describe('heltalTill100', () => {
  it('summerar alltid till 100 och ger den största resten den extra enheten', () => {
    expect(heltalTill100([1, 1, 1])).toEqual([34, 33, 33]);
    expect(heltalTill100([99.6, 0.4]).reduce((s, v) => s + v, 0)).toBe(100);
    expect(heltalTill100([99.6, 0.4])).toEqual([100, 0]);
  });

  it('inget att fördela ger nollor, aldrig NaN', () => {
    expect(heltalTill100([])).toEqual([]);
    expect(heltalTill100([0, 0])).toEqual([0, 0]);
  });
});

/* ═════════════════════ Terräng och skotningsavstånd ═════════════════════ */
//
// FACIT ÄR SKÄLVIKEN RP J-HUS -25 i prod 2026-11-16 — trakten Martin stod och
// tittade på när han frågade hur avståndet räknas. Två lass har körsträcka:
//
//   1 715 m tur och retur →   858 m enkel väg · 20,0 m³ →   560 kr
//   3 076 m tur och retur → 1 538 m enkel väg · 20,0 m³ → 1 120 kr
//
// acord_skotningsavstand (giltig från 2025-06-03): 200 m ingår, 4 kr per
// påbörjad 100 m. Tillägget blir 1 680 kr, delat på traktens 1 725,24 m³fub
// = 0,97 kr/m³fub — exakt det som stod på hans skärm.

const SKALVIKEN_VOLYM = 1725.24;

const SKALVIKEN_AVSTAND = {
  manuellt: null as number | null,
  lassVolym: 40,
  lassAntal: 2,
  kronor: 1680,
  lass: [
    { avstandM: 1538, volym: 20, kronor: 1120 },
    { avstandM: 858, volym: 20, kronor: 560 },
  ],
  grundavstandM: 200 as number | null,
  krPer100m: 4 as number | null,
  giltigFran: '2025-06-03' as string | null,
};

describe('avståndet: 1 680 kr på 1 725 m³ är 0,97 kr/m³fub', () => {
  // Stegregeln är EN funktion (lib/ekonomi/acord). Går den sönder ska det här
  // testet falla, inte bara en vy någon annanstans.
  it('stegregeln ger samma kronor som priset räknade fram', () => {
    const cfg = { grundavstand_m: 200, kr_per_100m: 4 };
    expect(skotAvstandKrPerM3(858, cfg)).toBe(28);   // ceil((858−200)/100) = 7 × 4
    expect(skotAvstandKrPerM3(1538, cfg)).toBe(56);  // ceil((1538−200)/100) = 14 × 4
    const lista = [{ grundavstand_m: 200, kr_per_100m: 4, giltig_fran: null, giltig_till: null }];
    expect(skotAvstandKr('2026-11-02', 858, 20, lista)).toBe(560);
    expect(skotAvstandKr('2026-11-02', 1538, 20, lista)).toBe(1120);
  });

  it('snittet är VOLYMVIKTAT och täckningen sägs i klartext', () => {
    const v = byggAvstandVy({ a: SKALVIKEN_AVSTAND, volym: SKALVIKEN_VOLYM, prisdatum: '2026-11-13' });
    // (858 × 20 + 1538 × 20) / 40 = 1 198 m
    expect(v.avstandM).toBe(1198);
    expect(txt(v.mening)).toContain('2 lass');
    expect(txt(v.mening)).toContain('40,0 av 1 725 m³fub');
    expect(txt(v.mening)).toContain('2 % av trakten');
  });

  it('säger att maskinen mäter tur och retur — frågan Martin ställde', () => {
    const v = byggAvstandVy({ a: SKALVIKEN_AVSTAND, volym: SKALVIKEN_VOLYM, prisdatum: '2026-11-13' });
    expect(v.raknasRad).toContain('ut och tillbaka');
    expect(v.raknasRad).toContain('halveras');
  });

  it('prislistan och kronorna står i ord', () => {
    const v = byggAvstandVy({ a: SKALVIKEN_AVSTAND, volym: SKALVIKEN_VOLYM, prisdatum: '2026-11-13' });
    expect(txt(v.prislistaRad)).toBe('200 m ingår · 4,00 kr per påbörjad 100 m · gäller från 3 juni 2025');
    expect(txt(v.pengar)).toContain('1 680 kr på trakten');
    expect(txt(v.pengar)).toContain('0,97 kr/m³fub');
  });

  it('lassen står var för sig, längst först', () => {
    const v = byggAvstandVy({ a: SKALVIKEN_AVSTAND, volym: SKALVIKEN_VOLYM, prisdatum: '2026-11-13' });
    expect(v.lassRader.map(r => txt(r.avstand))).toEqual(['1 538 m', '858 m']);
    expect(txt(v.lassRader[0].under)).toBe('20,0 m³ · 1 120 kr');
    expect(v.merRad).toBeNull();
  });

  it('en lång lista kapas och SÄGER hur många som inte visas', () => {
    const lass = Array.from({ length: LASS_SYNLIGA + 3 }, (_, i) =>
      ({ avstandM: 1000 - i * 10, volym: 20, kronor: 100 }));
    const v = byggAvstandVy({
      a: { ...SKALVIKEN_AVSTAND, lass, lassAntal: lass.length, lassVolym: lass.length * 20 },
      volym: SKALVIKEN_VOLYM, prisdatum: '2026-11-13',
    });
    expect(v.lassRader).toHaveLength(LASS_SYNLIGA);
    expect(v.merRad).toBe('och 3 lass till');
  });

  it('manuell siffra GÄLLER och jämförs med lassen — aldrig tyst', () => {
    const v = byggAvstandVy({
      a: { ...SKALVIKEN_AVSTAND, manuellt: 1200 },
      volym: SKALVIKEN_VOLYM, prisdatum: '2026-11-13',
    });
    expect(v.avstandM).toBe(1200);
    expect(v.mening).toContain('satt för hand');
    expect(txt(v.manuelltRad)).toBe('Satt för hand till 1 200 m. Lassen säger 1 198 m i snitt.');
  });

  it('inga lass: ingen gissning, bara att tillägget blir 0 kr', () => {
    const v = byggAvstandVy({
      a: { ...SKALVIKEN_AVSTAND, lass: [], lassAntal: 0, lassVolym: 0, kronor: 0 },
      volym: SKALVIKEN_VOLYM, prisdatum: '2026-11-13',
    });
    expect(v.avstandM).toBeNull();
    expect(v.mening).toContain('Inget lass har körsträcka');
    expect(v.lassRader).toEqual([]);
    expect(v.pengar).toContain('0 kr');
  });

  it('ingen sats i prislistan ger ingen rad, aldrig ett påhittat villkor', () => {
    const v = byggAvstandVy({
      a: { ...SKALVIKEN_AVSTAND, grundavstandM: null, krPer100m: null, giltigFran: null },
      volym: SKALVIKEN_VOLYM, prisdatum: '2026-11-13',
    });
    expect(v.prislistaRad).toBeNull();
  });
});

describe('tillägget: Δkr/m³fub × skotarens antal, inget annat', () => {
  // Skälviken: skrivs 1 200 m in gäller 40 kr/m³fub på HELA volymen i stället
  // för 0,97 — det är de ~67 000 kr som aldrig syns.
  const bas = {
    volym: SKALVIKEN_VOLYM,
    nuSumma: 176826,
    skotarAntal: SKALVIKEN_VOLYM,
    skotarPris: 56.5,
  };

  it('0,97 → 40,00 kr/m³fub ger 67 336 kr mer', () => {
    const v = byggTillaggVy({ ...bas, nuKr: 1680 / SKALVIKEN_VOLYM, nyKr: 40 });
    expect(v.andrat).toBe(true);
    expect(Math.round(v.nyKronor)).toBe(69010);          // 40 × 1 725,24
    // Δ räknas på ören: 40,00 − 0,97 = 39,03 kr/m³fub × 1 725,24 = 67 336 kr.
    expect(Math.round(v.nySumma! - v.nuSumma!)).toBe(67336);
    expect(txt(v.mening)).toContain('67 336 kr mer');
    expect(txt(v.mening)).toContain('56,50 till 95,53');
  });

  it('terrängen: 0 → 3 kr/m³fub ger 5 176 kr mer', () => {
    const v = byggTillaggVy({ ...bas, nuKr: 0, nyKr: 3 });
    expect(Math.round(v.nyKronor)).toBe(5176);
    expect(Math.round(v.nySumma!)).toBe(176826 + 5176);
    expect(txt(v.mening)).toContain('5 176 kr mer');
  });

  it('oförändrat tal är ingen ändring — ingen pil, ingen mening', () => {
    const v = byggTillaggVy({ ...bas, nuKr: 3, nyKr: 3 });
    expect(v.andrat).toBe(false);
    expect(v.mening).toBe('');
  });

  it('utan skotarrad visas ingen summa — ett påhittat tal vore värre', () => {
    const v = byggTillaggVy({ ...bas, nuKr: 0, nyKr: 3, skotarAntal: null });
    expect(v.nySumma).toBeNull();
    expect(v.mening).toBe('');
    // Kronorna på trakten går ändå att räkna: de hänger inte på skotarraden.
    expect(Math.round(v.nyKronor)).toBe(5176);
  });

  it('lägre tillägg säger "mindre", inte ett minustecken att tolka', () => {
    const v = byggTillaggVy({ ...bas, nuKr: 8, nyKr: 2 });
    expect(txt(v.mening)).toContain('10 351 kr mindre');
  });
});
