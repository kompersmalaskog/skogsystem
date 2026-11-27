// @vitest-environment jsdom
// Vägen till rapporten: raden på trakten, och arket som läser kartan.
//
// Det testet vaktar är att rapporten säger SAMMA tal som fakturan. Arket
// bygger dokumentet ur `granskning.avstand` — samma fält trakten visar och
// fakturan räknar på — så ett avstånd kan aldrig glida isär mellan sidan och
// PDF:en. Går kartan inte att läsa ska rapporten ändå gå att göra.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('next/navigation', () => ({
  usePathname: () => '/ekonomi/fakturaunderlag/11271860',
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));

/** Läsningen av kartan mockas — den har egna tester mot prod-formade svar. */
const lasMock = vi.fn();
vi.mock('@/lib/faktura/lasSkotningsrapport', () => ({
  lasSkotningsrapport: (...a: unknown[]) => lasMock(...a),
}));

/** PdfForhandsvisning: vi kör `skapa` och fångar dokumentet, utan att rita. */
const skapade: unknown[] = [];
vi.mock('@/app/helikopter/_components/PdfForhandsvisning', () => ({
  default: ({ skapa, filnamn }: { skapa: () => Promise<unknown>; filnamn: string }) => {
    skapade.push({ skapa, filnamn });
    return <div data-pdf={filnamn}>förhandsvisning</div>;
  },
}));

const sbSvar = { data: { id: 'obj-uuid' }, error: null };
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => sbSvar }) }) }),
  },
}));

import SkotningsrapportArk from './SkotningsrapportArk';

const GRANSKNING = {
  sortiment: { rakning: { antal: 7, raknade: [], ejRaknade: [] }, anvant: 7, manuellt: false,
    grundantal: 6, krPerExtra: 2, giltigFran: '2025-06-03' },
  volym: 1746.35,
  prisdatum: '2026-11-13',
  avstand: {
    manuellt: null, lassVolym: 1278, lassAntal: 70, kronor: 20956.2,
    lass: [], kallor: ['app' as const],
    grundavstandM: 200, krPer100m: 4, giltigFran: '2025-06-03',
    cykel: {
      lass: 85, medCykel: 70, volym: 1553, volymMedCykel: 1278,
      cykelM: 1477, enkelVagM: 738.6, hemMedLassM: 660, vidAvlaggetM: 250,
      ytterstM: 414.4, utan: { fonster_for_langt: 14 },
    },
  },
  terrangKr: 0,
};

const TRAKT = {
  vo_nummer: '11271860',
  objektnamn: 'Skälviken RP J-Hus -25',
  bolag: 'Vida',
  avtalsform: 'ackord',
  objekt_ids: ['11271860'],
  granskning: GRANSKNING as never,
};

/** Tre stammar och ett avlägg — nog för att "Var låg virket?" ska bli en tabell. */
const AVLAGG = { lat: 56.2876, lng: 15.3756 };
const UNDERLAG = {
  karta: {
    granser: [], stammar: [], korspar: [],
    avlagg: [{ nr: 1, namn: '01-1', plats: AVLAGG }],
  },
  virke: [
    { lat: 56.2870, lng: 15.3756, volym: 40 },
    { lat: 56.2850, lng: 15.3756, volym: 30 },
    { lat: 56.2830, lng: 15.3756, volym: 30 },
  ],
  period: { fran: '2026-11-03', till: '2026-11-18' },
  dagar: 11,
  skotare: ['Elefant 26'],
  fel: [] as string[],
};

let root: Root | null = null;
let el: HTMLDivElement | null = null;

beforeEach(() => {
  skapade.length = 0;
  lasMock.mockReset();
  el = document.createElement('div');
  document.body.appendChild(el);
  root = createRoot(el);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  el?.remove();
  el = null;
});

async function rita(svar: unknown = UNDERLAG) {
  lasMock.mockResolvedValue(svar);
  await act(async () => {
    root!.render(<SkotningsrapportArk d={TRAKT} onStang={() => {}} />);
  });
  await act(async () => { await Promise.resolve(); });
  await act(async () => { await Promise.resolve(); });
  return el!;
}

const text = (e: HTMLElement) => (e.textContent || '').replace(/[  ]/g, ' ');

describe('arket', () => {
  it('läser kartan och visar förhandsvisningen', async () => {
    const e = await rita();
    expect(e.querySelector('[data-pdf]')).toBeTruthy();
    expect(e.querySelector('[data-pdf]')!.getAttribute('data-pdf'))
      .toBe('skotningsrapport-11271860');
    // Läsningen får traktens uuid och ALLA dess nummer (stammarna kan ligga
    // under vilket som helst — samma fälla som produktionshögarna).
    expect(lasMock).toHaveBeenCalledWith(expect.anything(), {
      objektUuid: 'obj-uuid', nummer: ['11271860', '11271860'],
    });
  });

  /** Texten ur den PDF arket faktiskt gör. */
  async function pdfText(): Promise<string> {
    const bytes: Uint8Array = await (skapade[0] as { skapa: () => Promise<Uint8Array> }).skapa();
    const { extractText, getDocumentProxy } = await import('unpdf');
    const doc = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await extractText(doc, { mergePages: true });
    return (Array.isArray(text) ? text.join('\n') : text).replace(/[  ]/g, ' ');
  }

  // Testets kärna: ARKETS EGEN `skapa()` körs, och texten läses ur den PDF som
  // faktiskt blir till. Så bevisas att fakturans `granskning.avstand` når hela
  // vägen ut i filen — rapporten kan inte säga ett annat tal än trakten.
  it('FAKTURANS TAL NÅR PDF:EN: 414 m och 20 956 kr står i filen arket gör', async () => {
    await rita();
    const t = await pdfText();
    expect(t).toContain('Skälviken RP J-Hus -25');
    expect(t).toContain('414 m');          // granskningens avstånd
    expect(t).toContain('20 956 kr');      // granskningens kronor
    expect(t).toContain('1 746 m3fub');    // granskningens volym
    expect(t).toContain('Elefant 26');     // skotaren ur läsningen
    expect(t).toContain('3 november 2026 – 18 november 2026');
    expect(t).toContain('11 dagar med lass');  // dagarna ur läsningen
  }, 30000);

  // Virket och avläggen kommer ur LÄSNINGEN, inte ur granskningen — kopplingen
  // syns bara när arkets egen `skapa()` körs. Tappas den blir tabellen borta
  // utan att något annat ser fel ut.
  it('VIRKET NÅR PDF:EN: "Var låg virket?" byggs ur läsningens stammar', async () => {
    await rita();
    const t = await pdfText();
    expect(t).toContain('Var låg virket?');
    expect(t).toContain('Fågelväg');
    // Tre stammar, 100 m3fub, fördelade på avstånd från avlägget.
    expect(t).toContain('100 m3fub');
  }, 30000);

  it('utan avlägg finns ingen tabell — aldrig en rad nollor', async () => {
    await rita({ ...UNDERLAG, karta: { ...UNDERLAG.karta, avlagg: [] } });
    const t = await pdfText();
    expect(t).not.toContain('Var låg virket?');
    // Men resten av rapporten står kvar.
    expect(t).toContain('414 m');
  }, 30000);

  it('ett HANDSATT avstånd sägs vara handsatt — aldrig som en mätning', async () => {
    lasMock.mockResolvedValue(UNDERLAG);
    const handsatt = {
      ...TRAKT,
      granskning: { ...GRANSKNING, avstand: { ...GRANSKNING.avstand, manuellt: 450 } } as never,
    };
    await act(async () => { root!.render(<SkotningsrapportArk d={handsatt} onStang={() => {}} />); });
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });
    const t = await pdfText();
    expect(t).toContain('450 m');
    expect(t).toContain('satt för hand');
    // Och lassens egen mätning står bredvid, som jämförelse.
    expect(t).toContain('414 m');
  }, 30000);

  it('en del som inte gick att läsa SÄGS — rapporten görs ändå', async () => {
    const e = await rita({ ...UNDERLAG, fel: ['Skotarens körspår kunde inte läsas.'] });
    expect(text(e)).toContain('Skotarens körspår kunde inte läsas.');
    expect(e.querySelector('[data-pdf]')).toBeTruthy();
  });

  it('kastar läsningen blir det ingen PDF — och det står varför, med Försök igen', async () => {
    lasMock.mockRejectedValue(new Error('nät nere'));
    await act(async () => {
      root!.render(<SkotningsrapportArk d={TRAKT} onStang={() => {}} />);
    });
    await act(async () => { await Promise.resolve(); });
    const t = text(el!);
    expect(t).toContain('Rapporten kunde inte göras');
    expect(t).toContain('nät nere');
    expect(t).toContain('Försök igen');
    expect(el!.querySelector('[data-pdf]')).toBeNull();
  });

  it('medan kartan läses står det, utan att PDF:en görs', async () => {
    lasMock.mockReturnValue(new Promise(() => {}));
    await act(async () => {
      root!.render(<SkotningsrapportArk d={TRAKT} onStang={() => {}} />);
    });
    expect(text(el!)).toContain('Läser kartan');
    expect(el!.querySelector('[data-pdf]')).toBeNull();
  });
});
