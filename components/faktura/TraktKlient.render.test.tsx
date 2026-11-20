// @vitest-environment jsdom
// "Vad behöver du kolla?" på en trakt: raderna säger vad som fattas och vad det
// är värt, de går att trycka på, och de finns inte när allt är ifyllt.
//
// Facit är Skälviken RP J-Hus -25 i prod 2026-11-16 — trakten som skulle
// faktureras den dagen: 1 725,2 m³ skördat, två lass med körsträcka som bär
// 40 m³, terräng tom, sortimentsantalet obekräftat.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import TraktKlient from './TraktKlient';
import { byggFattas } from '@/lib/faktura/fattas';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('next/navigation', () => ({
  usePathname: () => '/ekonomi/fakturaunderlag/11271860',
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));

const skalvikenFattas = () => byggFattas({
  timpeng: false,
  kontraktsnummer: '969670',
  volymM3fub: 1725.2,
  terrangKr: 0,
  avstand: { manuellt: null, lassVolym: 40, lassAntal: 2, kronor: 1680 },
  sortiment: { manuellt: false, anvant: 7, raknat: 7, grundantal: 6, krPerExtra: 2 },
});

/** Svaret från /api/faktura/underlag, nedkokat till det vyn läser. */
const svar = (fattas = skalvikenFattas()) => ({
  ok: true,
  resultat: [{
    vo_nummer: '11271860',
    objektnamn: 'Skälviken RP J-Hus -25',
    bolag: 'Vida',
    avtalsform: 'ackord',
    avrakningsdatum: '2026-11-13',
    objekt_ids: ['11271860'],
    rader: [],
    noter: [],
    hinder: [],
    summa_kant: 176826,
    rader_utan_pris: 0,
    // Arken behöver underlaget. Lassen är Skälvikens riktiga: 1 715 och
    // 3 076 m körsträcka (tur och retur) → 858 och 1 538 m enkel väg.
    granskning: {
      sortiment: {
        rakning: { antal: 7, raknade: [], ejRaknade: [] },
        anvant: 7, manuellt: false,
        grundantal: 6, krPerExtra: 2, giltigFran: '2025-06-03',
      },
      volym: 1725.2,
      prisdatum: '2026-11-13',
      avstand: {
        manuellt: null, lassVolym: 40, lassAntal: 2, kronor: 1680,
        lass: [
          { avstandM: 1538, volym: 20, kronor: 1120, kalla: 'opti' as const },
          { avstandM: 858, volym: 20, kronor: 560, kalla: 'opti' as const },
        ],
        kallor: ['opti' as const],
  grundavstandM: 200, krPer100m: 4, giltigFran: '2025-06-03',
      },
      terrangKr: 0,
    },
    fattas,
  }],
});

/** Tryck på en fattas-rad och låt React landa. */
async function tryck(e: HTMLElement, nyckel: string) {
  const r = e.querySelector(`[data-fattas="${nyckel}"]`) as HTMLElement;
  await act(async () => { r.closest('button')!.click(); });
  await act(async () => { await Promise.resolve(); });
}

let root: Root | null = null;
let el: HTMLDivElement | null = null;

beforeEach(() => {
  el = document.createElement('div');
  document.body.appendChild(el);
  root = createRoot(el);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  el?.remove();
  el = null;
  vi.unstubAllGlobals();
});

async function rita(fattas?: ReturnType<typeof byggFattas>) {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true, status: 200, json: async () => svar(fattas),
  })));
  await act(async () => { root!.render(<TraktKlient vo="11271860" manuellt={null} />); });
  // Hämtningen är ett löfte till — låt det landa.
  await act(async () => { await Promise.resolve(); });
  return el!;
}

const text = (e: HTMLElement) => (e.textContent || '').replace(/ /g, ' ');

describe('Skälviken: kortet säger vad som fattas', () => {
  it('rubriken räknar sakerna, och alla tre raderna står där', async () => {
    const e = await rita();
    expect(text(e)).toContain('3 saker att kolla');
    expect(e.querySelector('[data-fattas="avstand"]')).toBeTruthy();
    expect(e.querySelector('[data-fattas="terrang"]')).toBeTruthy();
    expect(e.querySelector('[data-fattas="sortiment"]')).toBeTruthy();
  });

  it('avståndsraden bär täckningen och kronorna — inte bara "saknas"', async () => {
    const e = await rita();
    const rad = text(e.querySelector('[data-fattas="avstand"]') as HTMLElement);
    expect(rad).toContain('bygger på 2 % av volymen');
    expect(rad).toContain('40 m³fub av 1 725 m³fub');
    expect(rad).toContain('0,97 kr/m³fub · 1 680 kr');
  });

  it('sortimentet bär vad det kostar hela trakten', async () => {
    const e = await rita();
    expect(text(e.querySelector('[data-fattas="sortiment"]') as HTMLElement))
      .toContain('+2,00 kr/m³fub · 3 450 kr');
  });

  // Martin 2026-11-16: "ska jag redigera måste jag komma till den sidan direkt
  // och kunna komma tillbaka till fakturan igen". Raden fyller i uppgiften HÄR
  // — ingen av dem lämnar fakturan, så ingen av dem får vara en länk.
  it('VARJE rad öppnar ett ark på fakturan — ingen länk till en annan vy', async () => {
    const e = await rita();
    for (const n of ['avstand', 'terrang', 'sortiment']) {
      const r = e.querySelector(`[data-fattas="${n}"]`) as HTMLElement;
      expect(r, n).toBeTruthy();
      expect(r.closest('a'), n).toBeNull();
      expect(r.closest('button'), n).toBeTruthy();
    }
  });

  it('avståndsraden öppnar avståndsarket, inte sortimentets', async () => {
    const e = await rita();
    await tryck(e, 'avstand');
    const t = text(e);
    expect(t).toContain('Skotningsavstånd');
    // Stegaren står på jämna hundra ur lassens volymviktade snitt (1 198 m).
    expect(t).toContain('1 200');
    expect(t).toContain('meter enkel väg');
    // Frågan Martin ställde ska stå på skärmen, inte bara i koden.
    expect(t).toContain('ut och tillbaka');
    expect(t).toContain('räknar enkel väg');
    // Lassen var för sig, längst först.
    expect(t).toContain('1 538 m');
    expect(t).toContain('858 m');
    expect(t).toContain('200 m ingår');
  });

  it('terrängraden öppnar terrängarket', async () => {
    const e = await rita();
    await tryck(e, 'terrang');
    expect(text(e)).toContain('Terrängtillägg');
    expect(text(e)).toContain('kronor per kubik');
  });

  it('EN orange prick på förklaringen, aldrig en per rad', async () => {
    const e = await rita();
    const orange = Array.from(e.querySelectorAll('span[aria-hidden="true"]'))
      .filter(s => (s as HTMLElement).style.background.includes('255, 159, 10')
        || (s as HTMLElement).style.background === '#ff9f0a');
    expect(orange).toHaveLength(1);
  });

  it('kortet SPÄRRAR inte — summan står kvar och är läsbar', async () => {
    const e = await rita();
    expect(text(e)).toContain('Vad ska faktureras?');
    expect(text(e)).toContain('176 826');
  });
});

describe('en trakt där allt är ifyllt', () => {
  it('inget kort alls — ingen tom rubrik, ingen grön bock', async () => {
    const e = await rita([]);
    expect(text(e)).not.toContain('att kolla');
    expect(e.querySelector('[data-fattas]')).toBeNull();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// SKOTNINGSAVSTÅNDET SYNS, OCH SIDAN ÄR LÄTTARE (Martin 2026-11-20)
//
// Han hade Skälviken öppen och sa "jag ser ju inte skotningsavståndet". Han
// har satt 450 m för hand; kortet sa bara "Skotningsavstånd +12,00" och de
// 450 fanns ingenstans — och eftersom talet var satt för hand försvann även
// frågan ur "saker att kolla". Samtidigt: "kan man göra sidan lättare så ett
// barn förstår direkt", "inte för mycket text, det blir rörigt då".
// ───────────────────────────────────────────────────────────────────────────

const POSTER = [
  { etikett: 'Krönt', belopp: 1.5, mottagare: 'skordare' as const },
  { etikett: 'Traktstorlek', belopp: -1, mottagare: 'delas' as const },
  { etikett: 'Sortiment', belopp: 2, mottagare: 'skotare' as const },
];

const PRISLISTA = { medelstam: 0.614, klass: 0.6, total: 100, skordare: 56, skotare: 44 };

/** Skälvikens två maskinrader, som de står i prod. */
const maskinrad = (over: Record<string, unknown>) => ({
  radnr: 1, enhet: 'm3fub', prisagare: 'app', a_pris: null, status: 'ok',
  fel_kod: null, kalla: 'ackord', prislista: PRISLISTA,
  antal: 1725.24, tillaggsposter: POSTER,
  harledning: [{ etikett: 'Grund (medelstam 0,61 → 0,6)', belopp: 100 }],
  delar_avstand: null, ...over,
});

const SKALVIKEN_RADER = [
  maskinrad({
    radnr: 1, artikelnr: '1', benamning: 'Skördning ackord Giant',
    visningsnamn: 'Giant', kostnadsstalle: 'SCO',
    a_pris_beraknat: 57, delar_grundpris: 56, delar_andel: 1,
  }),
  maskinrad({
    radnr: 2, artikelnr: '2', benamning: 'Skotning ackord Elefant 26',
    visningsnamn: 'Elefant 26', kostnadsstalle: 'EP',
    a_pris_beraknat: 57.5, delar_grundpris: 44, delar_andel: 1.5,
    delar_avstand: 12,
  }),
];

/** Skälviken med maskinrader och avståndet satt för hand till 450 m. */
async function ritaMaskiner(over: Record<string, unknown> = {}) {
  const bas = svar([]);
  const r = bas.resultat[0] as Record<string, any>;
  r.rader = SKALVIKEN_RADER;
  r.granskning = {
    ...r.granskning,
    avstand: { ...r.granskning.avstand, manuellt: 450 },
  };
  Object.assign(r, over);
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true, status: 200, json: async () => bas,
  })));
  await act(async () => { root!.render(<TraktKlient vo="11271860" manuellt={null} />); });
  await act(async () => { await Promise.resolve(); });
  return el!;
}

describe('skotningsavståndet syns i METER, inte bara i kronor', () => {
  it('avståndsraden står under Priset med talet och var det kommer ifrån', async () => {
    const e = await ritaMaskiner();
    const rad = e.querySelector('[data-avstand-rad]') as HTMLElement;
    expect(rad).toBeTruthy();
    const t = text(rad);
    expect(t).toContain('Hur långt skotades det?');
    expect(t).toContain('450');
    expect(t).toContain('m enkel väg');
    // Lassen bredvid, så man ser om 450 stämmer — det är 9 525 kr på den här
    // trakten, och appen gissar inte åt honom.
    expect(t).toContain('Satt för hand · lassen säger 1 198 m');
  });

  it('metrarna står också på raden i skotarens kort, vid sina kronor', async () => {
    expect(text(await ritaMaskiner())).toContain('Skotningsavstånd, 450 m');
  });

  it('raden öppnar avståndsarket — samma väg som förut', async () => {
    const e = await ritaMaskiner();
    await act(async () => {
      (e.querySelector('[data-avstand-rad]') as HTMLElement).closest('button')!.click();
    });
    await act(async () => { await Promise.resolve(); });
    expect(text(e)).toContain('ut och tillbaka');
  });

  it('TRE tal bestämmer priset och alla tre har en rad', async () => {
    const t = text(await ritaMaskiner());
    expect(t).toContain('Hur räknades priset?');     // medelstam
    expect(t).toContain('Vilka sortiment räknas?');  // sortiment
    expect(t).toContain('Hur långt skotades det?');  // avstånd
  });

  it('utan mätt och utan handsatt avstånd finns ingen rad — frågan står redan i "saker att kolla"', async () => {
    const bas = svar(skalvikenFattas());
    const r = bas.resultat[0] as Record<string, any>;
    r.rader = SKALVIKEN_RADER;
    r.granskning = {
      ...r.granskning,
      avstand: { ...r.granskning.avstand, manuellt: null, lass: [], lassAntal: 0, lassVolym: 0, kronor: 0 },
    };
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => bas })));
    await act(async () => { root!.render(<TraktKlient vo="11271860" manuellt={null} />); });
    await act(async () => { await Promise.resolve(); });
    expect(el!.querySelector('[data-avstand-rad]')).toBeNull();
    expect(el!.querySelector('[data-fattas="avstand"]')).toBeTruthy();
  });
});

describe('lättare sida — text som inte sa något är borta', () => {
  it('pottmeningen är borta: varje tal i den står redan som en rad i korten', async () => {
    const t = text(await ritaMaskiner());
    expect(t).not.toContain('Traktens tillägg är');
    expect(t).not.toContain('Appen föreslog');
    // Det den ensam bar — den flyttade kronan — har en egen rad.
    expect(t).toContain('Krönt, hela till skördaren');
    expect(t).toContain('Sortiment, hela till skotaren');
    expect(t).toContain('Traktstorlek, hälften av −1,00');
  });

  it('kostnadsstället står inte i rubriken när det finns', async () => {
    const t = text(await ritaMaskiner());
    expect(t).not.toContain('kostnadsställe');
    expect(t).toContain('Skördning');
    expect(t).toContain('Skotning');
  });

  it('men ett kostnadsställe som SAKNAS sägs — det är något att göra åt', async () => {
    const bas = svar([]);
    const r = bas.resultat[0] as Record<string, any>;
    r.rader = [{ ...SKALVIKEN_RADER[0], kostnadsstalle: null }];
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => bas })));
    await act(async () => { root!.render(<TraktKlient vo="11271860" manuellt={null} />); });
    await act(async () => { await Promise.resolve(); });
    expect(text(el!)).toContain('kostnadsställe saknas');
  });

  it('ETT stort tal på skärmen: kronorna överst, inte maskinernas summor', async () => {
    const e = await ritaMaskiner();
    const stora = Array.from(e.querySelectorAll('p, span, div'))
      .filter(n => (n as HTMLElement).style.fontSize === '32px');
    expect(stora).toHaveLength(1);
    expect(text(stora[0] as HTMLElement)).toContain('176 826');
  });

  it('maskinernas summor står kvar — nedtonade, inte borttagna', async () => {
    const t = text(await ritaMaskiner());
    expect(t).toContain('98 339');   // 57,00 × 1 725,24
    expect(t).toContain('99 201');   // 57,50 × 1 725,24
  });

  it('i kortet är PRISET större än summan — raderna summerar till priset', async () => {
    // Kortets svar är kr/m³fub: det är dit kolumnen räknar. Summan är en
    // följd av det, och sidans pengar står redan överst.
    const e = await ritaMaskiner();
    const storlek = (sok: string) => {
      const n = Array.from(e.querySelectorAll('span'))
        .find(s => text(s as HTMLElement).trim() === sok);
      expect(n, sok).toBeTruthy();
      return parseFloat((n as HTMLElement).style.fontSize);
    };
    expect(storlek('57,00')).toBeGreaterThan(storlek('98 339 kr'));
    expect(storlek('57,50')).toBeGreaterThan(storlek('99 201 kr'));
  });
});
