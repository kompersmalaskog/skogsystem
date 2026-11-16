// @vitest-environment jsdom
/**
 * Om något händer: 112 och koordinaten först, ett kort ger tre steg och Ring <admin>, rapporten kräver svar + text,
 * skickar med kortet och positionen, och utan täckning står det så och texten finns kvar.
 * Sidan använder det som sparats på enheten när nätet inte svarar.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const h = vi.hoisted(() => ({
  nod: null as any, admin: false, sparade: [] as any[], aterstallda: [] as string[], rapporter: [] as any[], rapportSvar: null as string | null, vem: { ok: true, medarbetareId: 'm-1', maskinId: 'PONS' } as any,
  kvitton: [] as any[], kvitterade: [] as string[],
}));

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/maskinkoll/fotoKo', () => ({ laggMaskinkollFoto: async () => {} }));
vi.mock('@/lib/arbetsmiljo/tillbud', async (orig) => {
  const riktig: any = await orig();
  return {
    ...riktig,
    hamtaNodData: async () => h.nod,
    hamtaRapportor: async () => h.vem,
    rapporteraTillbud: async (_sb: unknown, r: any) => { h.rapporter.push(r); return h.rapportSvar; },
    sparaKort: async (_sb: unknown, a: any) => { h.sparade.push(a); h.nod = { ...h.nod, andringar: [{ ...a, andradTid: 'nu' }] }; return null; },
    aterstallKort: async (_sb: unknown, id: string) => { h.aterstallda.push(id); h.nod = { ...h.nod, andringar: [] }; return null; },
  };
});
vi.mock('@/lib/CurrentMedarbetareContext', () => ({ useCurrentMedarbetare: () => ({ medarbetare: h.admin ? { id: 'a-1', roll: 'admin' } : { id: 'm-1', roll: 'forare' }, loading: false }) }));
vi.mock('@/lib/arbetsmiljo/saGorVi', async (orig) => {
  const riktig: any = await orig();
  return {
    ...riktig,
    hamtaKvitton: async () => h.kvitton,
    kvittera: async (_sb: unknown, _m: string, i: any) => { h.kvitterade.push(i.id); return true; },
  };
});

import OmNagotHander from './OmNagotHander';
import { NOD_NYCKEL } from '@/lib/arbetsmiljo/nod';
import { instruktion, underlag } from '@/lib/arbetsmiljo/saGorVi';

let rot: ReturnType<typeof createRoot> | null = null;
let el: HTMLDivElement | null = null;
const vanta = () => act(async () => { await new Promise(r => setTimeout(r, 30)); });
async function montera() { await act(async () => { rot = createRoot(el!); rot.render(<OmNagotHander />); }); await vanta(); }
const text = () => document.body.textContent ?? '';
const knapp = (t: string) => Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === t) as HTMLButtonElement | undefined;
const tryck = async (b: Element | null | undefined) => { expect(b).toBeTruthy(); await act(async () => { (b as HTMLElement).click(); }); await vanta(); };
const skriv = async (ta: HTMLTextAreaElement, v: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(ta, v);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

let geoSvar: ((p: any) => void) | null = null;

beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  h.nod = { kontakter: [{ namn: 'Martin', telefon: '070-111 22 33' }, { namn: 'Joacim', telefon: '070 444' }], larmplatser: [{ objektId: 'o1', namn: 'Skälviken', lat: 56.84321, lng: 15.2219, beskrivning: 'Möt vid bommen' }], hamtad: 1 };
  h.admin = false; h.sparade = []; h.aterstallda = []; h.kvitton = []; h.kvitterade = [];
  h.rapporter = []; h.rapportSvar = null; h.vem = { ok: true, medarbetareId: 'm-1', maskinId: 'PONS' };
  geoSvar = null;
  (navigator as any).geolocation = { watchPosition: (ok: any) => { geoSvar = ok; return 1; }, clearWatch: () => {} };
  window.history.replaceState(null, '', '/om-nagot-hander');
  el = document.createElement('div'); document.body.appendChild(el);
});
afterEach(() => { act(() => { rot?.unmount(); }); el?.remove(); rot = null; el = null; });

const position = async (lat: number, lng: number) => { await act(async () => { geoSvar?.({ coords: { latitude: lat, longitude: lng, accuracy: 8 } }); }); await vanta(); };

describe('Om något händer', () => {
  it('112 först; larmplatsen när man står vid trakten, med vägbeskrivningen och var man själv står', async () => {
    await montera();
    expect(document.querySelector('[data-ring-112]')?.getAttribute('href')).toBe('tel:112');
    expect(text()).toContain('Söker din position');
    await position(56.845, 15.222);
    expect(document.querySelector('[data-koordinat]')?.getAttribute('data-koordinat')).toBe('56.84321, 15.22190');
    expect(text()).toContain('Larmplats · Skälviken');
    expect(text()).toContain('Möt vid bommen');
    expect(document.querySelector('[data-har-ar-du]')?.textContent).toContain('56.84500, 15.22200');
    // Nödkortet står före listan.
    const nod = document.querySelector('[data-nodkort]')!, forsta = document.querySelector('[data-kort]')!;
    expect(nod.compareDocumentPosition(forsta) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('långt från alla trakter: där man står, aldrig en trakt långt bort', async () => {
    await montera();
    await position(58, 16);
    expect(text()).toContain('Här är du');
    expect(text()).not.toContain('Skälviken');
    expect(document.querySelector('[data-koordinat]')?.getAttribute('data-koordinat')).toBe('58.00000, 16.00000');
  });

  it('utan nät: det som sparats på enheten används', async () => {
    localStorage.setItem(NOD_NYCKEL, JSON.stringify(h.nod));
    h.nod = null;
    await montera();
    await position(56.845, 15.222);
    expect(text()).toContain('Larmplats · Skälviken');
    await tryck(document.querySelector('[data-kort=skadad]'));
    expect(document.querySelector('[data-ring=Martin]')?.getAttribute('href')).toBe('tel:0701112233');
  });

  it('ett kort: tre steg, Ring 112 kvar, en knapp per person att ringa, och adressen bär kortet', async () => {
    await montera();
    await tryck(document.querySelector('[data-kort=kraftledning]'));
    const steg = Array.from(document.querySelectorAll('[data-steg] li')).map(li => li.textContent);
    expect(steg).toHaveLength(3);
    expect(steg[0]).toContain('Sitt kvar i hytten');
    expect(document.querySelector('[data-ring-112]')).toBeTruthy();
    expect(Array.from(document.querySelectorAll('[data-ring]')).map(a => a.textContent?.trim())).toEqual(['Ring Martin', 'Ring Joacim']);
    expect(window.location.search).toBe('?kort=kraftledning');
  });

  it('inga nummer i appen: inga Ring-knappar (aldrig en knapp som ringer ingen)', async () => {
    h.nod = { ...h.nod, kontakter: [] };
    await montera();
    await tryck(document.querySelector('[data-kort=brand]'));
    expect(document.querySelectorAll('[data-ring]')).toHaveLength(0);
  });

  it('rapporten: Skicka är inaktiv tills vad som hände är valt och texten skriven; skickar kort, maskin och position', async () => {
    await montera();
    await position(56.845, 15.222);
    await tryck(document.querySelector('[data-kort=valt]'));
    await tryck(document.querySelector('[data-rapportera]'));
    const skicka = () => document.querySelector('[data-skicka]') as HTMLButtonElement;
    expect(skicka().disabled).toBe(true);
    expect(text()).toContain('Välj vad som hände.');
    expect(document.querySelector('[data-trasigt]')!.getAttribute('href')).toBe('/maskinkoll?fel=1');
    await tryck(document.querySelector('[data-typ=tillbud]'));
    expect(skicka().disabled).toBe(true);
    await skriv(document.querySelector('textarea')!, 'Lutade för mycket i backen');
    expect(skicka().disabled).toBe(false);
    await tryck(skicka());
    expect(h.rapporter).toHaveLength(1);
    expect(h.rapporter[0]).toMatchObject({ typ: 'tillbud', situation: 'valt', beskrivning: 'Lutade för mycket i backen', maskinId: 'PONS', medarbetareId: 'm-1', lat: 56.845, lng: 15.222, fotoUrl: null });
    expect(document.querySelector('[data-kvitto]')?.textContent).toContain('Skickat');
  });

  it('kortet "Någon är skadad" förväljer olycka', async () => {
    await montera();
    await tryck(document.querySelector('[data-kort=skadad]'));
    await tryck(document.querySelector('[data-rapportera]'));
    expect(document.querySelector('[data-typ=olycka]')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('utan täckning: det står så, och texten finns kvar', async () => {
    h.rapportSvar = 'Kunde inte skicka. Försök igen.';
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    try {
      await montera();
      await tryck(document.querySelector('[data-rapportera]'));
      await tryck(document.querySelector('[data-typ=olycka]'));
      await skriv(document.querySelector('textarea')!, 'Gren i ansiktet');
      await tryck(document.querySelector('[data-skicka]'));
      expect(document.querySelector('[role=alert]')?.textContent).toContain('Ingen täckning');
      expect((document.querySelector('textarea') as HTMLTextAreaElement).value).toBe('Gren i ansiktet');
      expect(document.querySelector('[data-kvitto]')).toBeNull();
    } finally {
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
    }
  });

  it('?rapport=1&kort=oga öppnar rapporten direkt, och tillbaka går till kortet', async () => {
    window.history.replaceState(null, '', '/om-nagot-hander?rapport=1&kort=oga');
    await montera();
    expect(document.querySelector('[data-rapport]')).toBeTruthy();
    await tryck(knapp('Olja i ögat') ?? Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Olja i ögat')));
    expect(document.querySelectorAll('[data-steg] li')).toHaveLength(3);
  });

  it('inga ikoner från nätet (fungerar utan täckning)', async () => {
    await montera();
    expect(document.querySelector('.material-symbols-outlined')).toBeNull();
  });
});

describe('Rutinkorten går att ändra', () => {
  const skrivFalt = async (etikett: string, v: string) => {
    const lab = Array.from(document.querySelectorAll('label')).find(l => l.textContent === etikett)!;
    const inp = document.getElementById(lab.htmlFor) as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(inp, v);
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };

  it('en förare ser ingen Ändra-knapp', async () => {
    await montera();
    await tryck(document.querySelector('[data-kort=brand]'));
    expect(document.querySelector('[data-andra-kort]')).toBeNull();
  });

  it('admin ändrar ett steg: Spara är grå tills något ändrats, sedan visas den nya texten för alla', async () => {
    h.admin = true;
    await montera();
    await tryck(document.querySelector('[data-kort=brand]'));
    await tryck(document.querySelector('[data-andra-kort]'));
    expect((document.querySelector('[data-spara-kort]') as HTMLButtonElement).disabled).toBe(true);
    await skrivFalt('Steg 2', 'Släck med släckaren vid hytten.');
    await tryck(document.querySelector('[data-spara-kort]'));
    expect(h.sparade[0].steg[1]).toBe('Släck med släckaren vid hytten.');
    expect(document.querySelector('[data-spara-kort]')).toBeNull();
    expect(document.querySelector('[data-steg]')!.textContent).toContain('Släck med släckaren vid hytten.');
    expect(JSON.parse(localStorage.getItem(NOD_NYCKEL)!).andringar[0].id).toBe('brand');
  });

  it('ett tomt steg går inte att spara; ett ändrat kort kan gå tillbaka till appens text', async () => {
    h.admin = true;
    h.nod = { ...h.nod, andringar: [{ id: 'brand', titel: 'Brand!', steg: ['a', 'b', 'c'], andradTid: 'x' }] };
    await montera();
    expect(document.querySelector('[data-kort=brand]')!.textContent).toContain('Brand!');
    await tryck(document.querySelector('[data-kort=brand]'));
    await tryck(document.querySelector('[data-andra-kort]'));
    await skrivFalt('Steg 1', '  ');
    expect((document.querySelector('[data-spara-kort]') as HTMLButtonElement).disabled).toBe(true);
    await tryck(document.querySelector('[data-aterstall-kort]'));
    expect(h.aterstallda).toEqual(['brand']);
    expect(document.querySelector('h1')!.textContent).toBe('Det brinner');
  });
});

const godkand = (id: any) => ({ steg: null, godkandUnderlag: underlag(instruktion(id, undefined)), godkandTid: new Date().toISOString() });
const ogodkand = { steg: null, godkandUnderlag: null, godkandTid: null };

describe('Ska du göra något av det här? (Så gör vi under Om något händer)', () => {
  it('bara godkända visas, ett tryck ger stegen och källan, föraren trycker Jag har läst', async () => {
    h.nod = { ...h.nod, instruktioner: { kraftledning: godkand('kraftledning'), bargning: godkand('bargning'), brant: ogodkand } };
    await montera();
    expect(text()).toContain('Ska du göra något av det här?');
    const rader = Array.from(document.querySelectorAll('[data-instr]')).map(x => x.getAttribute('data-instr'));
    expect(rader).toEqual(['kraftledning', 'bargning']);
    await tryck(document.querySelector('[data-instr="bargning"]'));
    expect(window.location.search).toBe('?instr=bargning');
    expect(document.querySelectorAll('[data-instr-vy="bargning"] [data-steg] li')).toHaveLength(instruktion('bargning', undefined).steg.length);
    expect(document.querySelector('[data-instr-kalla]')?.textContent).toContain('Skogforsk');
    await tryck(document.querySelector('[data-instr-las]'));
    expect(h.kvitterade).toEqual(['bargning']);
    expect(document.querySelector('[data-instr-last]')?.textContent).toContain('Läst');
    expect(document.querySelector('[data-instr-las]')).toBeNull();
  });

  it('inga godkända = ingen rubrik och inga rader (aldrig en tom lista)', async () => {
    h.nod = { ...h.nod, instruktioner: { kraftledning: ogodkand } };
    await montera();
    expect(text()).not.toContain('Ska du göra något av det här?');
    expect(document.querySelector('[data-instr]')).toBeNull();
  });

  it('utan täckning: instruktionerna ur det som sparats på enheten', async () => {
    localStorage.setItem(NOD_NYCKEL, JSON.stringify({ ...h.nod, instruktioner: { trailer: godkand('trailer') } }));
    h.nod = null;
    await montera();
    expect(Array.from(document.querySelectorAll('[data-instr]')).map(x => x.getAttribute('data-instr'))).toEqual(['trailer']);
  });

  it('admin får länken till Så gör vi i stället för Jag har läst', async () => {
    h.admin = true;
    h.nod = { ...h.nod, instruktioner: { motorsag: godkand('motorsag') } };
    window.history.replaceState(null, '', '/om-nagot-hander?instr=motorsag');
    await montera();
    expect(document.querySelector('[data-instr-andra]')?.getAttribute('href')).toBe('/sa-gor-vi?id=motorsag');
    expect(document.querySelector('[data-instr-las]')).toBeNull();
  });
});
