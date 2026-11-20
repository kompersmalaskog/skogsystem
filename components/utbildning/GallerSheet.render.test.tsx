// @vitest-environment jsdom
// Vem en utbildning gäller — vyn OCH sparordningen.
//
// Ordningen är inte kosmetisk: kraven måste skrivas innan flaggan. Skrivs
// galler_alla=false först och krav-skrivningen faller, gäller utbildningen fel
// personer — eller ingen — utan att något syns. Omvänt ordning är ofarligt:
// flaggan står kvar på "alla" och krav-raderna läses inte.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
import { act } from 'react';

const h = vi.hoisted(() => ({
  logg: [] as string[],
  fel: {} as Record<string, { message: string } | undefined>,
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (tabell: string) => ({
      delete: () => ({
        eq: () => ({
          in: (_kolumn: string, ids: string[]) => {
            h.logg.push(`${tabell}.delete(${ids.join(',')})`);
            return Promise.resolve({ error: h.fel[`${tabell}.delete`] ?? null });
          },
        }),
      }),
      insert: () => {
        h.logg.push(`${tabell}.insert`);
        return Promise.resolve({ error: h.fel[`${tabell}.insert`] ?? null });
      },
      update: () => ({
        eq: () => {
          h.logg.push(`${tabell}.update`);
          return Promise.resolve({ error: h.fel[`${tabell}.update`] ?? null });
        },
      }),
    }),
  },
}));

import GallerSheet from './GallerSheet';

const TYP = {
  id: 'c', namn: 'Motorsågskörkort AB', kravtyp: 'lag', giltighet_manader: 60,
  galler_alla: false, beskrivning: null, anteckning: null, aktiv: true, skapad: '', uppdaterad: '',
} as any;

const FOLK = [
  { id: '1', namn: 'Oskar Nilsson', roll: 'Maskinförare', aktiv: true },
  { id: '2', namn: 'Stefan Karlsson', roll: 'Maskinförare', aktiv: true },
] as any;

let container: HTMLDivElement;
let root: Root;
let sparat = 0;

async function montera(props: Record<string, unknown> = {}) {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(
      <GallerSheet
        open
        typ={TYP}
        medarbetare={FOLK}
        nuvarande={[]}
        onClose={() => {}}
        onSaved={() => { sparat += 1; }}
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
  if (!träff) throw new Error(`Hittade inget "${väljare}" med "${delText}"`);
  return act(async () => { träff.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}

function sparaKnapp(): HTMLButtonElement {
  const b = Array.from(container.querySelectorAll('button')).find((x) =>
    (x.textContent ?? '').startsWith('Spara'),
  );
  if (!b) throw new Error('Ingen Spara-knapp');
  return b as HTMLButtonElement;
}

beforeEach(() => { h.logg = []; h.fel = {}; sparat = 0; });

afterEach(async () => {
  await act(async () => { root?.unmount(); });
  container?.remove();
});

describe('Vem gäller den?', () => {
  it('"bara vissa" utan någon vald går inte att spara, och säger varför', async () => {
    await montera();

    expect(sparaKnapp().disabled).toBe(true);
    expect(text()).toContain('Välj minst en person');

    await klick('[role="checkbox"]', 'Oskar Nilsson');
    expect(sparaKnapp().disabled).toBe(false);
    expect(text()).not.toContain('Välj minst en person');
  });

  it('sparar kraven FÖRE flaggan', async () => {
    await montera();
    await klick('[role="checkbox"]', 'Oskar Nilsson');
    await klick('button', 'Spara');

    // Ingen var vald förut, så det finns inget att radera — bara lägga till.
    expect(h.logg).toEqual(['utbildning_krav.insert', 'utbildning_typ.update']);
    expect(sparat).toBe(1);
  });

  it('raderar BARA de bortvalda, aldrig hela listan', async () => {
    await montera({ nuvarande: ['1', '2'] });
    await klick('[role="checkbox"]', 'Oskar Nilsson'); // bockar UR Oskar (id 1)
    await klick('button', 'Spara');

    expect(h.logg).toEqual(['utbildning_krav.delete(1)', 'utbildning_typ.update']);
    expect(sparat).toBe(1);
  });

  it('faller krav-skrivningen rörs flaggan aldrig — och felet sägs rakt ut', async () => {
    h.fel['utbildning_krav.insert'] = { message: 'permission denied' };
    await montera();
    await klick('[role="checkbox"]', 'Stefan Karlsson');
    await klick('button', 'Spara');

    expect(h.logg).not.toContain('utbildning_typ.update');
    expect(text()).toContain('permission denied');
    expect(sparat).toBe(0);
  });

  it('"alla i företaget" rör inga krav-rader och göms personlistan', async () => {
    await montera();
    await klick('[role="checkbox"]', 'Alla i företaget');

    expect(text()).not.toContain('Oskar Nilsson');
    expect(sparaKnapp().disabled).toBe(false);

    await klick('button', 'Spara');
    expect(h.logg).toEqual(['utbildning_typ.update']);
  });

  it('visar det som redan är valt när arket öppnas', async () => {
    await montera({ nuvarande: ['2'] });

    const rad = Array.from(container.querySelectorAll('[role="checkbox"]'))
      .find((el) => (el.textContent ?? '').includes('Stefan Karlsson'));
    expect(rad?.getAttribute('aria-checked')).toBe('true');
    expect(sparaKnapp().disabled).toBe(false);
  });
});
