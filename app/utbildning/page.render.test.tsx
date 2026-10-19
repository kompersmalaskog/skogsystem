// @vitest-environment jsdom
// Utbildningsvyns startsida renderas på riktigt (CLAUDE.md: "Rendera innan leverans").
// Vaktar formen "svaret först": talet överst, bara det som kräver något i listan,
// resten bakom en rad som fälls ut — och att laddar/fel/tomt är tre skilda lägen.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
import { act } from 'react';

const h = vi.hoisted(() => ({
  data: {} as Record<string, any[]>,
  fel: null as any,
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (tabell: string) => {
      const svar = () => (h.fel ? { data: null, error: h.fel } : { data: h.data[tabell] ?? [], error: null });
      const b: any = {
        select: () => b,
        eq: () => b,
        order: () => b,
        maybeSingle: () => Promise.resolve(h.fel ? { data: null, error: h.fel } : { data: (h.data[tabell] ?? [])[0] ?? null, error: null }),
        then: (res: any, rej: any) => Promise.resolve(svar()).then(res, rej),
      };
      return b;
    },
  },
}));

vi.mock('@/components/utbildning/RegistreraBevisSheet', () => ({ default: () => null }));

import UtbildningStartPage from './page';

const TYPER = [
  { id: 'a', namn: 'Första hjälpen / HLR', kravtyp: 'bestallare', giltighet_manader: 24, galler_alla: true, beskrivning: null, anteckning: null, aktiv: true, skapad: '', uppdaterad: '' },
  { id: 'b', namn: 'Grönt kort', kravtyp: 'certifiering', giltighet_manader: 60, galler_alla: true, beskrivning: null, anteckning: null, aktiv: true, skapad: '', uppdaterad: '' },
  { id: 'c', namn: 'Motorsågskörkort AB', kravtyp: 'lag', giltighet_manader: 60, galler_alla: false, beskrivning: null, anteckning: null, aktiv: true, skapad: '', uppdaterad: '' },
];

// Långt fram i tiden, så "går ut snart" aldrig slår till av misstag.
const LANGT_FRAM = '2030-06-01';

function rad(typId: string, typNamn: string, person: string, status: string, giltig_till: string | null) {
  return {
    medarbetare_id: person, medarbetare_namn: person,
    utbildning_typ_id: typId, utbildning_namn: typNamn,
    kravtyp: 'bestallare', giltighet_manader: 24,
    bevis_id: status === 'saknas' ? null : `${typId}-${person}`,
    genomford_datum: status === 'saknas' ? null : '2024-03-12',
    pdf_url: null, giltig_till, status,
  };
}

function allaGiltiga() {
  return [
    ...['Martin', 'Oskar', 'Stefan'].map((p) => rad('a', 'Första hjälpen / HLR', p, 'giltig', LANGT_FRAM)),
    ...['Martin', 'Oskar', 'Stefan'].map((p) => rad('b', 'Grönt kort', p, 'giltig', LANGT_FRAM)),
    ...['Martin', 'Stefan'].map((p) => rad('c', 'Motorsågskörkort AB', p, 'giltig', LANGT_FRAM)),
  ];
}

let container: HTMLDivElement;
let root: Root;

async function montera() {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(<UtbildningStartPage />);
  });
  await act(async () => { await Promise.resolve(); });
}

function text() { return container.textContent ?? ''; }

function tryckPa(delText: string) {
  const alla = Array.from(container.querySelectorAll('[role="button"]'));
  const traff = alla.find((el) => (el.textContent ?? '').includes(delText));
  if (!traff) throw new Error(`Hittade ingen tryckbar rad med texten "${delText}"`);
  return act(async () => {
    traff.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

beforeEach(() => {
  h.fel = null;
  h.data = {
    utbildning_typ: TYPER,
    medarbetare: [{ id: 'Martin', namn: 'Martin', roll: 'Maskinförare', aktiv: true }],
    utbildning_status: [],
  };
});

afterEach(async () => {
  await act(async () => { root?.unmount(); });
  container?.remove();
});

describe('Utbildningsvyns startsida', () => {
  it('visar talet överst och BARA det som kräver något — resten ligger bakom en rad', async () => {
    const rader = allaGiltiga();
    rader[1] = rad('a', 'Första hjälpen / HLR', 'Oskar', 'utgangen', '2026-07-03');
    rader[4] = rad('b', 'Grönt kort', 'Oskar', 'saknas', null);
    h.data.utbildning_status = rader;

    await montera();

    // Talet och vad det betyder.
    expect(text()).toContain('2');
    expect(text()).toContain('behöver åtgärdas');

    // De två som kräver något syns, med VEM och VARFÖR.
    expect(text()).toContain('Första hjälpen / HLR');
    expect(text()).toContain('Grönt kort');
    expect(text()).toContain('Oskar');

    // Den som är i ordning syns INTE förrän man fäller ut.
    expect(text()).not.toContain('Motorsågskörkort AB');
    expect(text()).toContain('1 utbildning är i ordning');

    await tryckPa('1 utbildning är i ordning');
    expect(text()).toContain('Motorsågskörkort AB');

    // Och viks ihop igen.
    await tryckPa('1 utbildning är i ordning');
    expect(text()).not.toContain('Motorsågskörkort AB');
  });

  it('allt i ordning: sidan är aldrig tom — tiden till nästa utgång och en grön bekräftelse', async () => {
    h.data.utbildning_status = allaGiltiga();

    await montera();

    expect(text()).not.toContain('behöver åtgärdas');
    expect(text()).toContain('tills nästa går ut');
    expect(text()).toContain('Alla utbildningar är giltiga');
    // Listan finns ett tryck bort.
    expect(text()).toContain('Visa alla 3 utbildningar');
  });

  it('läsfel är ett eget läge — aldrig "allt klart" och aldrig en tom lista', async () => {
    h.fel = { message: 'permission denied for view utbildning_status' };

    await montera();

    expect(text()).toContain('Kunde inte hämta utbildningarna');
    expect(text()).toContain('permission denied');
    expect(text()).not.toContain('behöver åtgärdas');
    expect(text()).not.toContain('Alla utbildningar är giltiga');
  });

  it('tom katalog säger varför den är tom', async () => {
    h.data.utbildning_typ = [];
    h.data.utbildning_status = [];

    await montera();

    expect(text()).toContain('Katalogen är tom');
    expect(text()).not.toContain('Kunde inte hämta');
  });
});
