// @vitest-environment jsdom
// Granskningen: tre skärmar, en fråga var. Testerna vaktar formen (ETT stort
// tal, inga tomma kort, Spara grå tills något är ändrat) och att rättningen
// går genom EN skrivare.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import GranskningArk, { type Vy, type GranskningProps } from './GranskningArk';
import { raknaSortiment, type SortimentRad } from '@/lib/ekonomi/sortimentAntal';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const sparade: any[] = [];
vi.mock('@/lib/redigering/objektRouter', () => ({
  sparaFalt: (ref: any, patch: any, opts: any) => {
    sparade.push({ ref, patch, opts });
    return Promise.resolve({ ok: true, objektRadFanns: true });
  },
}));

const rad = (namn: string, kundkod: string | null, m3: number): SortimentRad =>
  ({ sortiment_id: namn, namn, kundkod, volym_m3sub: m3 });

// Brokamåla ur prod 2026-10-25 (samma rader som lib/ekonomi/sortimentAntal.test.ts).
const RADER: SortimentRad[] = [
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

const rakning = raknaSortiment(RADER);
const SORT = {
  rakning, anvant: 7, manuellt: false,
  grundantal: 6, krPerExtra: 2, giltigFran: '2025-06-03',
};

// Skälvikens två lass ur prod 2026-11-16: 1 715 och 3 076 m körsträcka (tur
// och retur) → 858 och 1 538 m enkel väg, 20 m³ var. acord_skotningsavstand:
// 200 m ingår, 4 kr per påbörjad 100 m.
const PROPS_AVSTAND: GranskningProps['avstand'] = {
  manuellt: null, lassVolym: 40, lassAntal: 2, kronor: 1680,
  lass: [
    { avstandM: 1538, volym: 20, kronor: 1120, kalla: 'opti' as const },
    { avstandM: 858, volym: 20, kronor: 560, kalla: 'opti' as const },
  ],
  kallor: ['opti' as const],
  grundavstandM: 200, krPer100m: 4, giltigFran: '2025-06-03',
};

function props(over: Partial<GranskningProps> = {}): GranskningProps {
  return {
    vy: 'sortiment',
    onVy: () => {},
    sortiment: { g: SORT, volym: 2186.79, sortKr: 2 },
    pris: {
      prislista: { medelstam: 0.69, klass: 0.6, total: 100, skordare: 58, skotare: 58.5 },
      tillaggsposter: [
        { etikett: 'Krönt', belopp: 1.5, mottagare: 'skordare' },
        { etikett: 'Storlek', belopp: -1, mottagare: 'delas' },
        { etikett: 'Terräng', belopp: 2, mottagare: 'skotare' },
        { etikett: 'Sortiment', belopp: 2, mottagare: 'skotare' },
      ],
      avstandKr: 12,
      volym: 2186.79,
      prisdatum: '2026-07-31',
      sortiment: SORT,
    },
    avstand: PROPS_AVSTAND,
    terrangKr: 0,
    summa: 254761,
    skotarAntal: 2186.79,
    skotarPris: 58.5,
    dimObjektIds: ['A_1', 'B_2'],
    voNummer: '11271849',
    onSparat: () => {},
    ...over,
  };
}

let root: Root | null = null;
let el: HTMLDivElement | null = null;

beforeEach(() => { sparade.length = 0; });
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  el?.remove();
  el = null;
});

function rita(p: GranskningProps) {
  el = document.createElement('div');
  document.body.appendChild(el);
  root = createRoot(el);
  act(() => root!.render(<GranskningArk {...p} />));
  return el;
}

const txt = () => (document.body.textContent ?? '').replace(/[  ]/g, ' ');
const knappar = () => Array.from(document.querySelectorAll('button'));
const tryck = (k: Element | undefined) => act(() => (k as HTMLButtonElement).click());

describe('Sortiment-arket', () => {
  it('svaret först: antalet och vad det betyder', () => {
    rita(props());
    expect(txt()).toContain('7');
    expect(txt()).toContain('sortiment');
    expect(txt()).toContain('Det sjunde ger 2,00 kronor extra på varje kubik');
    expect(txt()).toContain('4 374 kr på trakten');
  });

  it('trädslaget står på raden när det är läst — namnet är ingen källa', async () => {
    const svar = { ok: true, tradslag: { 'Massa: BmavFall_V3': [{ namn: 'Gran', volym: 250 }, { namn: 'Tall', volym: 153.2 }] } };
    const gamla = globalThis.fetch;
    (globalThis as any).fetch = () => Promise.resolve({ json: () => Promise.resolve(svar) });
    try {
      rita(props());
      await act(async () => { await Promise.resolve(); await Promise.resolve(); });
      expect(txt()).toContain('Gran 62 % · Tall 38 %');
    } finally { (globalThis as any).fetch = gamla; }
  });

  it('medan trädslagen läses, och om de inte går att läsa, SÄGS det', async () => {
    const gamla = globalThis.fetch;
    (globalThis as any).fetch = () => Promise.reject(new Error('nät'));
    try {
      rita(props());
      expect(txt()).toContain('Läser trädslag');
      await act(async () => { await Promise.resolve(); await Promise.resolve(); });
      expect(txt()).toContain('Trädslagen gick inte att läsa just nu.');
    } finally { (globalThis as any).fetch = gamla; }
  });

  it('båda listorna står, och det som inte räknas säger varför', () => {
    rita(props());
    const t = txt();
    expect(t).toContain('Det här räknas');
    expect(t).toContain('Massa BmavFall');
    expect(t).toContain('Det här räknas inte');
    expect(t).toContain('Avkap är spill, inget du apterar mot');
    expect(t).toContain('Maskinen skrev inget sortiment på dem');
  });

  it('inget tomt kort: utan bortsorterade sortiment finns rubriken inte', () => {
    const bara = raknaSortiment([rad('Massa: BmavFall_V3', '100-1', 100)]);
    rita(props({ sortiment: { g: { ...SORT, rakning: bara, anvant: 1 }, volym: 100, sortKr: 0 } }));
    expect(txt()).not.toContain('Det här räknas inte');
  });

  it('ett antal satt för hand säger det, med appens tal bredvid', () => {
    rita(props({ sortiment: { g: { ...SORT, manuellt: true, anvant: 4 }, volym: 100, sortKr: 0 } }));
    expect(txt()).toContain('Antalet är satt för hand till 4. Appen räknar 6.');
  });

  it('"Sätt antalet själv" leder till rättningen', () => {
    const sedda: (Vy | null)[] = [];
    rita(props({ onVy: v => sedda.push(v) }));
    tryck(knappar().find(k => k.textContent?.includes('Sätt antalet själv')));
    expect(sedda).toEqual(['ratta']);
  });
});

describe('Pris-arket', () => {
  it('raderna går att räkna ihop till kronorna per kubik', () => {
    rita(props({ vy: 'pris' }));
    const t = txt();
    expect(t).toContain('116,50');
    expect(t).toContain('Grundpris, klass 0,60');
    expect(t).toContain('Sortiment, 7 st');
    expect(t).toContain('6 ingår · 2,00 kr per extra');
    expect(t).toContain('Skotningsavstånd');
  });

  it('skördarens och skotarens pris står var för sig', () => {
    rita(props({ vy: 'pris' }));
    expect(txt()).toContain('58,00');
    expect(txt()).toContain('58,50');
  });

  it('utan prislista påstås ingen summa', () => {
    rita(props({ vy: 'pris', pris: { ...props().pris, prislista: null, tillaggsposter: null, avstandKr: null } }));
    expect(txt()).toContain('Ingen ackordsprislista');
    expect(txt()).not.toContain('Per m³fub');
  });
});

describe('Rättningen', () => {
  it('Spara är grå tills något är ändrat', () => {
    rita(props({ vy: 'ratta' }));
    const spara = knappar().find(k => k.textContent === 'Spara') as HTMLButtonElement;
    expect(spara.disabled).toBe(true);
    tryck(knappar().find(k => k.getAttribute('aria-label') === 'Färre'));
    expect((knappar().find(k => k.textContent === 'Spara') as HTMLButtonElement).disabled).toBe(false);
  });

  it('förhandsbeskedet säger vad ändringen kostar innan man sparar', () => {
    rita(props({ vy: 'ratta' }));
    tryck(knappar().find(k => k.getAttribute('aria-label') === 'Färre'));
    expect(txt()).toContain('4 374 kr mindre');
    expect(txt()).toContain('58,50');
    expect(txt()).toContain('56,50');
  });

  it('sparar över HELA VO-gruppen, bara dim_objekt, genom EN skrivare', async () => {
    // 7 → 5: appen räknar 6, så 5 är ett eget tal och ska sparas som ett tal.
    rita(props({ vy: 'ratta' }));
    tryck(knappar().find(k => k.getAttribute('aria-label') === 'Färre'));
    tryck(knappar().find(k => k.getAttribute('aria-label') === 'Färre'));
    await act(async () => { (knappar().find(k => k.textContent === 'Spara') as HTMLButtonElement).click(); });
    expect(sparade).toHaveLength(1);
    expect(sparade[0].ref.dimObjektIds).toEqual(['A_1', 'B_2']);
    expect(sparade[0].patch).toEqual({ sortiment_grupper_manuell: 5 });
    expect(sparade[0].opts).toEqual({ tabeller: ['dim'] });
  });

  it('appens eget tal sparas som NULL — inte som ett tal som råkar vara lika', async () => {
    // Appen räknar 6; ställer man in 6 ska det manuella värdet tas BORT, så
    // att ett senare omräknat antal slår igenom i stället för att frysas.
    rita(props({ vy: 'ratta', sortiment: { g: { ...SORT, anvant: 7, manuellt: true }, volym: 100, sortKr: 2 } }));
    tryck(knappar().find(k => k.getAttribute('aria-label') === 'Färre'));
    await act(async () => { (knappar().find(k => k.textContent === 'Spara') as HTMLButtonElement).click(); });
    expect(sparade[0].patch).toEqual({ sortiment_grupper_manuell: null });
  });

  it('"Använd appens värde" ställer tillbaka talet', () => {
    rita(props({ vy: 'ratta' }));
    tryck(knappar().find(k => k.getAttribute('aria-label') === 'Fler'));
    expect(txt()).toContain('Appen räknar 6');
    tryck(knappar().find(k => k.textContent === 'Använd appens värde'));
    expect(knappar().find(k => k.textContent === 'Använd appens värde')).toBeUndefined();
  });
});

/* ═════════════════════ Terräng och skotningsavstånd ═════════════════════ */
//
// Två uppgifter som förut ledde till /redigering?objekt=… — hela
// redigeringsvyn, utan att peka ut fältet och utan väg tillbaka. Nu fylls de
// i på fakturan (Martin 2026-11-16). Samma skrivare som sortimentsrättningen.

describe('terrängtillägget', () => {
  it('ETT tal, stegen är hela kronor och Spara är grå tills något ändrats', () => {
    rita(props({ vy: 'terrang' }));
    expect(txt()).toContain('Terrängtillägg');
    expect(txt()).toContain('kronor per kubik');
    expect((knappar().find(k => k.textContent === 'Spara') as HTMLButtonElement).disabled).toBe(true);
    tryck(knappar().find(k => k.getAttribute('aria-label') === 'Fler'));
    expect(txt()).toContain('0,00 → 1,00');
    expect((knappar().find(k => k.textContent === 'Spara') as HTMLButtonElement).disabled).toBe(false);
  });

  it('går aldrig under noll — ett negativt tillägg finns inte', () => {
    rita(props({ vy: 'terrang' }));
    const minus = knappar().find(k => k.getAttribute('aria-label') === 'Färre') as HTMLButtonElement;
    expect(minus.disabled).toBe(true);
  });

  it('sparar kr/m³fub på hela VO-gruppen, bara dim_objekt', async () => {
    rita(props({ vy: 'terrang' }));
    tryck(knappar().find(k => k.getAttribute('aria-label') === 'Fler'));
    tryck(knappar().find(k => k.getAttribute('aria-label') === 'Fler'));
    tryck(knappar().find(k => k.getAttribute('aria-label') === 'Fler'));
    await act(async () => { (knappar().find(k => k.textContent === 'Spara') as HTMLButtonElement).click(); });
    expect(sparade).toHaveLength(1);
    expect(sparade[0].patch).toEqual({ terrang_kr_manuell: 3 });
    expect(sparade[0].ref.dimObjektIds).toEqual(['A_1', 'B_2']);
    expect(sparade[0].opts).toEqual({ tabeller: ['dim'] });
  });

  it('tillbaka till 0 kr TAR BORT siffran — 0 är frånvaron av ett tillägg', async () => {
    rita(props({ vy: 'terrang', terrangKr: 2 }));
    tryck(knappar().find(k => k.getAttribute('aria-label') === 'Färre'));
    tryck(knappar().find(k => k.getAttribute('aria-label') === 'Färre'));
    await act(async () => { (knappar().find(k => k.textContent === 'Spara') as HTMLButtonElement).click(); });
    expect(sparade[0].patch).toEqual({ terrang_kr_manuell: null });
  });
});

describe('skotningsavståndet', () => {
  it('börjar på jämna hundra ur lassens snitt och säger täckningen', () => {
    rita(props({ vy: 'avstand' }));
    const t = txt();
    // (1538 × 20 + 858 × 20) / 40 = 1 198 m → stegaren står på 1 200.
    expect(t).toContain('1 200');
    expect(t).toContain('meter enkel väg');
    expect(t).toContain('2 lass');
    expect(t).toContain('% av trakten');
  });

  it('svarar på HUR det räknas — tur och retur, halverat', () => {
    rita(props({ vy: 'avstand' }));
    expect(txt()).toContain('ut och tillbaka');
    expect(txt()).toContain('halveras');
    expect(txt()).toContain('per påbörjad 100 m');
  });

  it('visar lassen var för sig, längst först', () => {
    rita(props({ vy: 'avstand' }));
    const t = txt();
    expect(t).toContain('1 538 m');
    expect(t).toContain('858 m');
    expect(t.indexOf('1 538 m')).toBeLessThan(t.indexOf('858 m'));
  });

  it('förhandsbeskedet räknar med SAMMA stegregel som priset', () => {
    rita(props({ vy: 'avstand' }));
    // 1 200 m → ceil((1200−200)/100) = 10 steg × 4 kr = 40,00 kr/m³fub,
    // mot 1 680 / 2 186,79 = 0,77 som gäller nu i den här fixturen.
    expect(txt()).toContain('40,00');
  });

  it('sparar meter på hela VO-gruppen, bara dim_objekt', async () => {
    rita(props({ vy: 'avstand' }));
    tryck(knappar().find(k => k.getAttribute('aria-label') === 'Fler'));
    await act(async () => { (knappar().find(k => k.textContent === 'Spara') as HTMLButtonElement).click(); });
    expect(sparade).toHaveLength(1);
    expect(sparade[0].patch).toEqual({ skotavstand_manuell: 1300 });
    expect(sparade[0].opts).toEqual({ tabeller: ['dim'] });
  });

  it('en redan satt siffra ger grå Spara tills den ändras', () => {
    rita(props({ vy: 'avstand', avstand: { ...PROPS_AVSTAND, manuellt: 1200 } }));
    expect((knappar().find(k => k.textContent === 'Spara') as HTMLButtonElement).disabled).toBe(true);
    expect(txt()).toContain('satt för hand');
  });

  it('utan sats i prislistan visas ingen ändring — ingen gissning', () => {
    rita(props({
      vy: 'avstand',
      avstand: { ...PROPS_AVSTAND, grundavstandM: null, krPer100m: null, giltigFran: null },
    }));
    tryck(knappar().find(k => k.getAttribute('aria-label') === 'Fler'));
    // Tillägget går inte att räkna fram, så raden visar bara det som gäller.
    expect(txt()).not.toContain('→');
  });
});

describe('trädslagen läses bara när de visas', () => {
  // Läsningen går över detalj_stock och detalj_stam, tusentals rader per
  // trakt. Terräng, avstånd och kontraktsnummer visar inga trädslag och ska
  // inte dra den — men sortimentsskärmen får inte läsa om när man går mellan
  // skärmarna, så latchen måste hålla.
  function medFetch(fn: () => void) {
    const gamla = globalThis.fetch;
    const anrop: string[] = [];
    (globalThis as any).fetch = (u: string) => {
      anrop.push(String(u));
      return Promise.resolve({ json: () => Promise.resolve({ ok: true, tradslag: {} }) });
    };
    try { fn(); } finally { (globalThis as any).fetch = gamla; }
    return anrop;
  }

  // Städar själv: `rita` skapar en ny rot per anrop och afterEach river bara
  // den SISTA. Flera renderingar i ett test lämnar annars kvar knappar i
  // document, och senare tester trycker på dem i stället för på sina egna.
  function stad() {
    act(() => root?.unmount());
    el?.remove();
    root = null;
    el = null;
  }

  it('terräng, avstånd och kontraktsnummer hämtar ingenting', () => {
    for (const vy of ['terrang', 'avstand', 'kontraktsnr'] as Vy[]) {
      expect(medFetch(() => rita(props({ vy }))), vy).toEqual([]);
      stad();
    }
  });

  // Samma monterade ark, bytt skärm — det är så arket används. `rita` skapar
  // en ny rot varje gång och kan därför inte visa latchen.
  it('sortimentsskärmen hämtar, och ett byte till rättningen hämtar inte om', () => {
    const anrop = medFetch(() => {
      rita(props({ vy: 'sortiment' }));
      act(() => root!.render(<GranskningArk {...props({ vy: 'ratta' })} />));
      act(() => root!.render(<GranskningArk {...props({ vy: 'sortiment' })} />));
    });
    expect(anrop).toHaveLength(1);
  });

  it('öppnar man terräng FÖRST och går till sortimentet hämtas de då', () => {
    const anrop = medFetch(() => {
      rita(props({ vy: 'terrang' }));
      act(() => root!.render(<GranskningArk {...props({ vy: 'sortiment' })} />));
    });
    expect(anrop).toHaveLength(1);
  });
});

describe('en skrivning som inte ändrar något går inte att trycka fram', () => {
  it('avstånd: 0 m med tom siffra är ingen ändring', () => {
    rita(props({
      vy: 'avstand',
      // Inga lass och ingen sats → stegaren börjar på 0, och det som skulle
      // sparas (null) är det som redan står.
      avstand: {
        manuellt: null, lassVolym: 0, lassAntal: 0, kronor: 0, lass: [],
        kallor: [], grundavstandM: null, krPer100m: null, giltigFran: null,
      },
    }));
    expect((knappar().find(k => k.textContent === 'Spara') as HTMLButtonElement).disabled).toBe(true);
  });

  it('avstånd: tillbaka till 0 m TAR BORT siffran', async () => {
    rita(props({ vy: 'avstand', avstand: { ...PROPS_AVSTAND, manuellt: 100 } }));
    tryck(knappar().find(k => k.getAttribute('aria-label') === 'Färre'));
    await act(async () => { (knappar().find(k => k.textContent === 'Spara') as HTMLButtonElement).click(); });
    expect(sparade[0].patch).toEqual({ skotavstand_manuell: null });
  });
});
