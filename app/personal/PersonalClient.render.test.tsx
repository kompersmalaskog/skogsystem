// @vitest-environment jsdom
// Personal renderas på riktigt (CLAUDE.md: "Rendera innan leverans"). Vaktar: talet överst räknar personer som
// behöver åtgärd, raden säger EN sak i ord (aldrig en prick), föraren ser bara sig själv med "Mina uppgifter",
// Spara är inaktiv tills något ändrats, och laddar/fel/tomt är tre skilda lägen.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import PersonalClient from './PersonalClient';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const LANGT_FRAM = '2099-01-01';

function svar(over: Record<string, unknown> = {}) {
  return {
    ok: true, arAdmin: true, egenId: 'admin',
    skyddsombud: { id: 'oskar', namn: 'Oskar Nilsson', telefon: '070-3' },
    personal: [
      { id: 'admin', namn: 'Martin', roll: 'admin', maskin_namn: null, telefon: '070-0', anhorig_namn: 'Lisa', anhorig_telefon: '070-9', anhorig_relation: 'fru', utbildning: [], ledighet: null },
      { id: 'stefan', namn: 'Stefan Nilsson', roll: 'forare', maskin_namn: 'Scorpion', telefon: null, anhorig_namn: null, anhorig_telefon: null, anhorig_relation: null, utbildning: [], ledighet: null },
      { id: 'oskar', namn: 'Oskar Nilsson', roll: 'forare', maskin_namn: 'H8E -26', telefon: '070-3', anhorig_namn: 'Eva', anhorig_telefon: '070-4', anhorig_relation: 'mamma', utbildning: [{ namn: 'HLR', status: 'saknas', kravtyp: 'bestallare', giltig_till: null }], ledighet: null },
      { id: 'joacim', namn: 'Joacim', roll: 'forare', maskin_namn: 'Wisent', telefon: '070-5', anhorig_namn: 'Sara', anhorig_telefon: '070-6', anhorig_relation: 'sambo', utbildning: [{ namn: 'HLR', status: 'giltig', kravtyp: 'bestallare', giltig_till: LANGT_FRAM }], ledighet: null },
    ],
    ...over,
  };
}

let root: Root; let el: HTMLDivElement;
let hamtSvar: any; let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el);
  window.history.replaceState(null, '', '/personal');
  hamtSvar = svar();
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'PATCH') return { ok: true, status: 200, json: async () => ({ ok: true }) } as any;
    if (hamtSvar === 'fel') return { ok: false, status: 500, json: async () => ({ ok: false, error: 'boom' }) } as any;
    return { ok: true, status: 200, json: async () => hamtSvar } as any;
  });
  (globalThis as any).fetch = fetchMock;
  window.scrollTo = (() => {}) as any;
});
afterEach(() => { act(() => root.unmount()); el.remove(); });

async function rendera() {
  await act(async () => { root.render(<PersonalClient />); });
  await act(async () => { await Promise.resolve(); });
}
const q = (s: string) => el.querySelector(s) as HTMLElement | null;
const text = () => el.textContent ?? '';

describe('Personal (admin)', () => {
  it('talet överst räknar PERSONER som behöver åtgärd, och raden säger vad i ord', async () => {
    await rendera();
    expect(q('[data-personal-tal]')!.textContent).toContain('2');
    expect(q('[data-personal-tal]')!.textContent).toContain('personer behöver åtgärd');
    expect(q('[data-person-rad="stefan"]')!.textContent).toContain('Saknar telefon och anhörig');
    expect(q('[data-person-rad="oskar"]')!.textContent).toContain('HLR saknas');
    expect(q('[data-person-rad="joacim"]')!.hasAttribute('data-atgard')).toBe(false);
  });

  it('skyddsombudet står överst för alla, med ring', async () => {
    await rendera();
    const s = q('[data-skyddsombud]') as HTMLAnchorElement;
    expect(s.textContent).toContain('Oskar Nilsson');
    expect(s.getAttribute('href')).toBe('tel:070-3');
  });

  it('tryck på en rad öppnar personen och skriver ?p= i adressen', async () => {
    await rendera();
    await act(async () => { (q('[data-person-rad="oskar"]') as HTMLButtonElement).click(); });
    expect(window.location.search).toBe('?p=oskar');
    expect(q('.ps-ram')!.getAttribute('data-vy')).toBe('person');
    expect(q('[data-personal-person="oskar"]')).not.toBeNull();
    expect((q('[data-ring]') as HTMLAnchorElement).getAttribute('href')).toBe('tel:070-3');
    expect(q('[data-utbildning]')!.getAttribute('data-utbildning')).toBe('atgard');
    expect((q('[data-utbildning]') as HTMLAnchorElement).getAttribute('href')).toBe('/utbildning/person/oskar');
    expect((q('[data-admin-lank]') as HTMLAnchorElement).getAttribute('href')).toBe('/admin?flik=medarbetare&person=oskar');
  });

  it('ingen Ring/SMS när telefonen saknas — raden säger det i stället', async () => {
    window.history.replaceState(null, '', '/personal?p=stefan');
    await rendera();
    expect(q('[data-ring]')).toBeNull();
    expect(q('[data-telefon]')!.textContent).toContain('Saknas');
    expect(q('[data-anhorig]')!.getAttribute('data-anhorig')).toBe('saknas');
  });

  it('ingen certifikat- eller friskvårdsdel finns kvar', async () => {
    await rendera();
    expect(text()).not.toMatch(/certifikat|friskvård/i);
  });
});

describe('Personal (förare)', () => {
  beforeEach(() => {
    hamtSvar = svar({
      arAdmin: false, egenId: 'stefan',
      personal: [{ id: 'stefan', namn: 'Stefan Nilsson', roll: 'forare', maskin_namn: 'Scorpion', telefon: '070-1', anhorig_namn: null, anhorig_telefon: null, anhorig_relation: null, utbildning: [], ledighet: null }],
    });
  });

  it('bara sin egen sida: Mina uppgifter, ingen lista, ingen Ring, ingen adminlänk', async () => {
    await rendera();
    expect(text()).toContain('Mina uppgifter');
    expect(q('[data-personal-lista]')).toBeNull();
    expect(q('[data-ring]')).toBeNull();
    expect(q('[data-admin-lank]')).toBeNull();
  });

  it('saknas anhörig är "Fyll i anhörig" skärmens enda primära knapp, och Spara är inaktiv tills något ändrats', async () => {
    await rendera();
    const knapp = q('[data-andra]') as HTMLButtonElement;
    expect(knapp.textContent).toBe('Fyll i anhörig');
    await act(async () => { knapp.click(); });
    const spara = q('[data-spara]') as HTMLButtonElement;
    expect(spara.disabled).toBe(true);
    const falt = el.ownerDocument.querySelector('input[name="anhorig_telefon"]') as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => { setter.call(falt, '070-777'); falt.dispatchEvent(new Event('input', { bubbles: true })); });
    expect((q('[data-spara]') as HTMLButtonElement).disabled).toBe(false);
    await act(async () => { (q('[data-spara]') as HTMLButtonElement).click(); });
    const patch = fetchMock.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === 'PATCH')!;
    expect(patch[0]).toBe('/api/personal/stefan');
    expect(JSON.parse((patch[1] as RequestInit).body as string).anhorig_telefon).toBe('070-777');
  });
});

describe('lägen', () => {
  it('fel: säger vad man ska göra, aldrig en HTTP-kod, och har Försök igen', async () => {
    hamtSvar = 'fel';
    await rendera();
    expect(text()).toContain('Kunde inte hämta personalen');
    expect(text()).not.toContain('500');
    expect(q('[data-forsok-igen]')).not.toBeNull();
  });

  it('tomt: förklarar var man lägger till', async () => {
    hamtSvar = svar({ personal: [] });
    await rendera();
    expect(text()).toContain('Lägg till i Admin › Medarbetare');
  });

  it('alla i ordning: svaret i ord i stället för talet 0', async () => {
    hamtSvar = svar({ personal: [svar().personal[3]] });
    await rendera();
    expect(q('[data-personal-tal]')!.textContent).toContain('Alla nåbara och behöriga');
  });
});

describe('Mat och anställningsdatum', () => {
  it('föraren ser sin Mat-rad, kan fylla i den, och Spara skickar bara mat', async () => {
    hamtSvar = svar({
      arAdmin: false, egenId: 'stefan',
      personal: [{ id: 'stefan', namn: 'Stefan Nilsson', roll: 'forare', maskin_namn: null, telefon: '070-1', anhorig_namn: 'A', anhorig_telefon: '070-2', anhorig_relation: null, utbildning: [], ledighet: null, mat: null }],
    });
    await rendera();
    const rad = q('[data-mat]') as HTMLButtonElement;
    expect(rad.getAttribute('data-mat')).toBe('tom');
    expect(rad.textContent).toContain('Inget särskilt');
    expect(text()).toContain('Bara du och admin ser det');
    await act(async () => { rad.click(); });
    const spara = q('[data-spara-mat]') as HTMLButtonElement;
    expect(spara.disabled).toBe(true);
    const falt = el.ownerDocument.querySelector('input[name="mat"]') as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => { setter.call(falt, 'laktosfri'); falt.dispatchEvent(new Event('input', { bubbles: true })); });
    await act(async () => { (q('[data-spara-mat]') as HTMLButtonElement).click(); });
    const patch = fetchMock.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === 'PATCH')!;
    expect(patch[0]).toBe('/api/personal/stefan');
    expect(JSON.parse((patch[1] as RequestInit).body as string)).toEqual({ mat: 'laktosfri' });
  });

  it('läsfel på mat (fältet saknas i svaret) ger ingen Mat-rad', async () => {
    await rendera();
    await act(async () => { (q('[data-person-rad="joacim"]') as HTMLButtonElement).click(); });
    expect(q('[data-mat]')).toBeNull();
    expect(q('[data-mat-lista]')).toBeNull();
  });

  it('admin: "Mat att tänka på" listar bara dem som skrivit något', async () => {
    const p = svar().personal.map((x: any) => ({ ...x, mat: x.id === 'oskar' ? 'vegetarian' : null }));
    hamtSvar = svar({ personal: p });
    await rendera();
    const rad = q('[data-mat-lista]') as HTMLButtonElement;
    expect(rad.textContent).toContain('1');
    await act(async () => { rad.click(); });
    const rader = Array.from(el.ownerDocument.querySelectorAll('[data-mat-rad]'));
    expect(rader.map((r) => r.getAttribute('data-mat-rad'))).toEqual(['oskar']);
    expect(rader[0].textContent).toContain('vegetarian');
  });

  it('admin: anställningsdatum saknas står på raden och vid länken till Admin', async () => {
    const p = svar().personal.map((x: any) => ({ ...x, anstallningsdatum: x.id === 'joacim' ? null : '2020-01-01' }));
    hamtSvar = svar({ personal: p });
    await rendera();
    expect(q('[data-person-rad="joacim"]')!.textContent).toContain('Anställningsdatum saknas');
    await act(async () => { (q('[data-person-rad="joacim"]') as HTMLButtonElement).click(); });
    expect(q('[data-admin-lank]')!.textContent).toContain('Anställningsdatum saknas');
  });
});
