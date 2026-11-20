// @vitest-environment jsdom
// Registrera bevis renderas på riktigt, i alla tre lägen (CLAUDE.md: "Rendera innan leverans").
// Vaktar formen: Avbryt uppe (aldrig ett blått "Klar" som stänger utan att spara),
// EN vit knapp i foten som bär antalet, väljarna som egna vyer i SAMMA ark, och
// att en avbruten väljare tar tillbaka formuläret i stället för att kasta det.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
import { act } from 'react';

vi.mock('@/lib/supabase', () => ({ supabase: { from: () => ({}), storage: { from: () => ({}) } } }));
vi.mock('@/lib/CurrentMedarbetareContext', () => ({
  useCurrentMedarbetare: () => ({ medarbetare: { id: 'martin' } }),
}));

import RegistreraBevisSheet from './RegistreraBevisSheet';

const TYPER = [
  { id: 'a', namn: 'Första hjälpen / HLR', kravtyp: 'bestallare', giltighet_manader: 24, galler_alla: true, beskrivning: null, anteckning: null, aktiv: true, skapad: '', uppdaterad: '' },
  { id: 'b', namn: 'Grönt kort', kravtyp: 'certifiering', giltighet_manader: 60, galler_alla: true, beskrivning: null, anteckning: null, aktiv: true, skapad: '', uppdaterad: '' },
] as any;

const FOLK = [
  { id: '1', namn: 'Daniel Johansson', roll: 'Maskinförare', aktiv: true },
  { id: '2', namn: 'Oskar Nilsson', roll: 'Maskinförare', aktiv: true },
  { id: '3', namn: 'Stefan Karlsson', roll: 'Maskinförare', aktiv: true },
] as any;

let container: HTMLDivElement;
let root: Root;

async function montera(props: Record<string, unknown> = {}) {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(
      <RegistreraBevisSheet
        open
        onClose={() => {}}
        onSaved={() => {}}
        typer={TYPER}
        medarbetare={FOLK}
        {...(props as any)}
      />,
    );
  });
}

function text() { return container.textContent ?? ''; }

function klick(väljare: string, delText: string) {
  const träff = Array.from(container.querySelectorAll(väljare)).find((el) =>
    (el.textContent ?? '').includes(delText),
  );
  if (!träff) throw new Error(`Hittade inget "${väljare}" med texten "${delText}"`);
  return act(async () => { träff.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}

function knapptext(): string {
  const knappar = Array.from(container.querySelectorAll('button'));
  const primär = knappar.find((b) => (b.textContent ?? '').startsWith('Registrera'));
  return primär?.textContent ?? '';
}

function primärKnapp(): HTMLButtonElement {
  const b = Array.from(container.querySelectorAll('button')).find((x) =>
    (x.textContent ?? '').startsWith('Registrera'),
  );
  if (!b) throw new Error('Ingen primärknapp');
  return b as HTMLButtonElement;
}

beforeEach(() => { /* inget delat tillstånd */ });

afterEach(async () => {
  await act(async () => { root?.unmount(); });
  container?.remove();
});

describe('Registrera bevis-arket', () => {
  it('har Avbryt uppe och den sparande knappen i foten — aldrig ett "Klar" som stänger', async () => {
    await montera();

    const knappar = Array.from(container.querySelectorAll('button')).map((b) => b.textContent ?? '');
    expect(knappar).toContain('Avbryt');
    // "Klar" i hörnet var gamla arkets stäng-knapp och lästes som "spara".
    expect(knappar).not.toContain('Klar');

    // Inget valt ännu → går inte att spara.
    expect(primärKnapp().disabled).toBe(true);
  });

  it('antalet står på knappen, inte i en etikett', async () => {
    await montera();

    expect(text()).not.toContain('0 valda');

    await klick('[role="checkbox"]', 'Oskar Nilsson');
    expect(knapptext()).toBe('Registrera bevis');
    expect(primärKnapp().disabled).toBe(false);

    await klick('[role="checkbox"]', 'Stefan Karlsson');
    expect(knapptext()).toBe('Registrera för 2 personer');

    await klick('[role="checkbox"]', 'Alla 3');
    expect(knapptext()).toBe('Registrera för 3 personer');
  });

  it('varje person har ett SYNLIGT valt/ovalt läge', async () => {
    await montera();

    const rad = () =>
      Array.from(container.querySelectorAll('[role="checkbox"]')).find((el) =>
        (el.textContent ?? '').includes('Daniel Johansson'),
      )!;

    expect(rad().getAttribute('aria-checked')).toBe('false');
    await klick('[role="checkbox"]', 'Daniel Johansson');
    expect(rad().getAttribute('aria-checked')).toBe('true');
  });

  it('utbildning väljs i en egen vy i samma ark — Avbryt där tar tillbaka formuläret, inte stänger allt', async () => {
    let stangd = false;
    await montera({ onClose: () => { stangd = true; }, forvaldTypId: 'a' });

    expect(text()).toContain('Första hjälpen / HLR');

    await klick('[role="button"]', 'Utbildning');
    expect(text()).toContain('Välj utbildning');
    expect(text()).toContain('Grönt kort');

    // Avbryt i väljaren går TILLBAKA.
    await klick('button', 'Avbryt');
    expect(stangd).toBe(false);
    expect(text()).toContain('Registrera bevis');

    // Och ett val byter utbildning och stänger väljaren.
    await klick('[role="button"]', 'Utbildning');
    await klick('[role="checkbox"]', 'Grönt kort');
    expect(text()).not.toContain('Välj utbildning');
    expect(text()).toContain('Grönt kort');
    expect(text()).not.toContain('Första hjälpen / HLR');
  });

  it('anteckning och avvikande giltighet ligger undan tills man fäller ut', async () => {
    await montera();

    expect(text()).not.toContain('Avvikande giltighetsdatum');
    await klick('[role="button"]', 'Anteckning och avvikande giltighet');
    expect(text()).toContain('Avvikande giltighetsdatum');
  });

  it('tom katalog säger det i klartext och går inte att spara', async () => {
    await montera({ typer: [] });

    expect(text()).toContain('Katalogen är tom');
    await klick('[role="checkbox"]', 'Oskar Nilsson');
    expect(primärKnapp().disabled).toBe(true);
  });
});
